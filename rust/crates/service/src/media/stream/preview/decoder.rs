//! One opened decode graph per preview source.
//!
//! A Decoded preview is a sequence of short lossless windows appended to one MediaSource
//! timeline. Opening the Parallel Encoder's input for every window put script
//! materialisation, module import, and an FFMS2 or VapourSynth graph build on the critical
//! path of every seam; the prefetch only hid that cost when a build happened to finish
//! early. This module keeps each opened graph in its own dedicated thread and feeds it one
//! window at a time. The thread is the only owner of the graph, which is what the engine's
//! non-`Send` internals require. The key is the source identity (the input, the scene table,
//! and the source file), never the frame range: the range belongs to the cache file, and
//! including it here would open a graph at every window.
//!
//! A window build still runs the lossless encoder once, because that is what makes the
//! picture a reference. What disappears is the repeated decoder construction, and the pool
//! caps concurrent builds so they do not starve each other for the same cores and the same
//! source file.

use av1ation_engine::media::preview::{CANCELLED, PreviewContext};
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::{
        Arc, Mutex, PoisonError,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};

use super::{DecodedWindowWriter, PreviewWriter};

/// How long a decode graph stays open after its last window.
///
/// Reusing a graph across a review is the point; holding it forever would keep a replaced
/// project's source mapped after the player moved on. Forty-five seconds covers a pause, a
/// slow scrub, and the gap while a user reads a scene without paying the open again.
pub(crate) const DECODER_IDLE_TIMEOUT: Duration = Duration::from_secs(45);

/// The owned input-side values a decode graph opens from.
///
/// The request that creates a session owns these; later windows only carry their output and
/// cancellation, because they share the graph the first request opened.
#[derive(Clone)]
pub(crate) struct DecoderInput {
    pub input: Value,
    pub video_path: String,
    pub temp_dir: String,
    pub condor: Option<Value>,
    pub sequence_config: Value,
}

/// One decoded window to write through a session.
pub(crate) struct WindowRequest {
    pub ffmpeg: String,
    pub output: PathBuf,
    pub start: usize,
    pub end: usize,
    pub cancel: Arc<AtomicBool>,
}

/// A window waiting on the session thread, and the channel that reports its result.
struct WindowJob {
    request: WindowRequest,
    reply: mpsc::Sender<Result<(), String>>,
}

/// One map entry: one thread's sender, the id that distinguishes it from a replacement, and
/// how many windows it holds, running or queued.
struct Session {
    id: u64,
    sender: mpsc::Sender<WindowJob>,
    active: Arc<AtomicUsize>,
}

/// How many decode graphs a native video source may keep open.
///
/// One graph is enough for a sequential playhead, but a cache warm would then queue behind
/// the window the player is waiting for, or the append behind the warm. Two let the earliest
/// append and one warm be written at the same time. More than two competed for the same
/// source and cores; the serialized version was measurably better than four.
const MAX_SESSIONS_PER_VIDEO: usize = 2;

/// Whether `input` is the engine's native `Video` document and nothing else.
///
/// `Input` serialises as an externally tagged enum, so a native input is an object with
/// exactly one key, `Video`. Requiring that shape keeps a document that merely mentions a
/// video — an override, a future variant — from qualifying for a second decode graph.
fn is_native_video(input: &Value) -> bool {
    input
        .as_object()
        .is_some_and(|document| document.len() == 1 && document.contains_key("Video"))
}

/// How many decode graphs `input` may keep open.
///
/// Only a native `Video` input is known to be cheap to open twice: FFMS2 reads the same
/// index again and adds one decoder. Every other kind builds a VapourSynth graph, which can
/// allocate most of the machine, so evaluating it a second time would double memory the user
/// did not budget for. Those keep one graph and rely on the queue order instead.
fn session_limit(input: &Value) -> usize {
    if is_native_video(input) {
        MAX_SESSIONS_PER_VIDEO
    } else {
        1
    }
}

/// The decode graphs open for one source identity.
#[derive(Default)]
struct SessionPool {
    sessions: Vec<Session>,
}

/// Identifies a started session, so a late lookup cannot remove its replacement.
static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

/// The process-wide set of open decode graphs, keyed by the source identity.
///
/// The key is the range-free half of the cache key's fingerprint, so an edited input, a
/// changed scene table, or a re-pointed source starts a new graph, while every window of the
/// same video shares the pool. A native video source normally uses one graph; a second is
/// opened only while the first is busy, so an append and a warm do not wait on each other.
/// Every other input stays at one.
#[derive(Clone, Default)]
pub(crate) struct PreviewDecoders {
    sessions: Arc<Mutex<HashMap<String, SessionPool>>>,
}

impl PreviewDecoders {
    /// Write one window, opening the graph only when this key has no session.
    ///
    /// The submitter blocks until the session finishes the window: the caller is already a
    /// blocking task, and the part file it is about to publish must be complete first.
    pub(crate) fn write_window(
        &self,
        key: &str,
        writer: Arc<dyn PreviewWriter>,
        input: DecoderInput,
        request: WindowRequest,
    ) -> Result<(), String> {
        let (reply, answer) = mpsc::channel();
        let mut request = Some(request);
        let mut sent = false;
        let mut active = None;
        // A session thread that hit its idle timeout can exit between the map lookup and
        // the send. Three attempts cover a pool whose entries are being replaced; a later
        // failure is a reason the caller should see.
        for _ in 0..3 {
            let Some(pending) = request.take() else {
                break;
            };
            let (session_id, sender, dispatched) =
                self.sender_for(key, Arc::clone(&writer), &input)?;
            match sender.send(WindowJob {
                request: pending,
                reply: reply.clone(),
            }) {
                Ok(()) => {
                    active = Some(dispatched);
                    sent = true;
                    break;
                }
                Err(mpsc::SendError(returned)) => {
                    dispatched.fetch_sub(1, Ordering::SeqCst);
                    self.forget(key, session_id);
                    request = Some(returned.request);
                }
            }
        }
        if !sent {
            return Err("The preview decoder could not be reached.".to_owned());
        }
        drop(reply);
        let result = answer.recv().unwrap_or_else(|_| {
            Err("The preview decoder stopped before the window was written.".to_owned())
        });
        if let Some(active) = active {
            active.fetch_sub(1, Ordering::SeqCst);
        }
        result
    }

    /// Reserve a session for `key`, opening another graph when the pool has room and every
    /// existing session is busy.
    ///
    /// The returned counter already includes this window; the caller drops it once the
    /// window is written (or immediately when the send fails). Selecting and reserving under
    /// the map lock is what keeps two callers from choosing the same idle session.
    fn sender_for(
        &self,
        key: &str,
        writer: Arc<dyn PreviewWriter>,
        input: &DecoderInput,
    ) -> Result<(u64, mpsc::Sender<WindowJob>, Arc<AtomicUsize>), String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(PoisonError::into_inner);
        let pool = sessions.entry(key.to_owned()).or_default();
        let limit = session_limit(&input.input);
        if let Some(session) = pool
            .sessions
            .iter()
            .find(|session| session.active.load(Ordering::SeqCst) == 0)
        {
            session.active.fetch_add(1, Ordering::SeqCst);
            return Ok((
                session.id,
                session.sender.clone(),
                Arc::clone(&session.active),
            ));
        }
        if pool.sessions.len() < limit {
            let id = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);
            let (sender, receiver) = mpsc::channel();
            let active = Arc::new(AtomicUsize::new(1));
            let owned_key = key.to_owned();
            let decoders = self.clone();
            let input = input.clone();
            thread::Builder::new()
                .name(format!("preview-decoder-{id}"))
                .spawn(move || {
                    run_session(receiver, writer, input, owned_key, id, decoders);
                })
                .map_err(|error| format!("The preview decoder could not start: {error}"))?;
            pool.sessions.push(Session {
                id,
                sender: sender.clone(),
                active: Arc::clone(&active),
            });
            return Ok((id, sender, active));
        }
        // Every graph is busy. Send to the shallowest queue; the session re-sorts after
        // every window, so an earlier appended window still reaches the front as soon as it
        // can. There is no blocking wait for an idle session: the caller must queue.
        let session = pool
            .sessions
            .iter()
            .min_by_key(|session| session.active.load(Ordering::SeqCst))
            .ok_or_else(|| "The preview decoder is not available.".to_owned())?;
        session.active.fetch_add(1, Ordering::SeqCst);
        Ok((
            session.id,
            session.sender.clone(),
            Arc::clone(&session.active),
        ))
    }

    /// Drop one session from its pool, and the pool when it becomes empty.
    fn forget(&self, key: &str, id: u64) {
        let mut sessions = self.sessions.lock().unwrap_or_else(PoisonError::into_inner);
        let empty = if let Some(pool) = sessions.get_mut(key) {
            pool.sessions.retain(|session| session.id != id);
            pool.sessions.is_empty()
        } else {
            false
        };
        if empty {
            sessions.remove(key);
        }
    }
}

/// Own one decode graph for the life of its key.
///
/// The graph is opened lazily, on the first window, so creating the registry entry costs no
/// decoding. A cancelled window is acknowledged without opening anything; a failed open or
/// a failed write ends the thread after answering every queued request, because a graph
/// that just failed cannot be trusted for the next window.
fn run_session(
    receiver: mpsc::Receiver<WindowJob>,
    writer: Arc<dyn PreviewWriter>,
    input: DecoderInput,
    key: String,
    session_id: u64,
    decoders: PreviewDecoders,
) {
    let mut session: Option<Box<dyn DecodedWindowWriter>> = None;
    let mut jobs: VecDeque<WindowJob> = VecDeque::new();
    loop {
        if jobs.is_empty() {
            match receiver.recv_timeout(DECODER_IDLE_TIMEOUT) {
                Ok(job) => jobs.push_back(job),
                Err(mpsc::RecvTimeoutError::Timeout | mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }
        // A prefetcher queues an appended window and its warm requests together, and the
        // append's request is started after an offset write, so arrival order can put the
        // window the playhead reaches next behind a warm. Re-drain and re-sort after every
        // window, not once per burst: an append that arrived while a warm was building must
        // become the next job instead of waiting for the rest of that burst. A cancelled job
        // is answered without opening or writing, so a stale warm costs one receive.
        while let Ok(job) = receiver.try_recv() {
            jobs.push_back(job);
        }
        jobs.make_contiguous().sort_by_key(|job| job.request.start);
        let Some(job) = jobs.pop_front() else {
            break;
        };
        if job.request.cancel.load(Ordering::SeqCst) {
            let _ = job.reply.send(Err(CANCELLED.to_owned()));
            continue;
        }
        if session.is_none() {
            let context = PreviewContext {
                video_path: &input.video_path,
                temp_dir: &input.temp_dir,
                condor: input.condor.as_ref(),
                sequence_config: &input.sequence_config,
                ffmpeg: &job.request.ffmpeg,
                output: &job.request.output,
            };
            match writer.open_decoded(&input.input, &context) {
                Ok(opened) => session = Some(opened),
                Err(message) => {
                    let _ = job.reply.send(Err(message.clone()));
                    fail_queued(&receiver, &message);
                    fail_buffered(&mut jobs, &message);
                    break;
                }
            }
        }
        let result = match session.as_mut() {
            Some(opened) => opened.write_window(
                &job.request.ffmpeg,
                &job.request.output,
                job.request.start,
                job.request.end,
                &job.request.cancel,
            ),
            None => Err("The preview decoder is not open.".to_owned()),
        };
        let cancelled = matches!(&result, Err(message) if message.as_str() == CANCELLED);
        let fatal = result.is_err() && !cancelled;
        let _ = job.reply.send(result);
        if fatal {
            let message = "The preview decoder stopped after a failed window.";
            fail_queued(&receiver, message);
            fail_buffered(&mut jobs, message);
            break;
        }
    }
    decoders.forget(&key, session_id);
}

/// Answer every request already drained from the channel for a session that is stopping.
fn fail_buffered(jobs: &mut VecDeque<WindowJob>, message: &str) {
    for job in jobs.drain(..) {
        let _ = job.reply.send(Err(message.to_owned()));
    }
}

/// Answer every request already queued for a session that is stopping.
fn fail_queued(receiver: &mpsc::Receiver<WindowJob>, message: &str) {
    while let Ok(job) = receiver.try_recv() {
        let _ = job.reply.send(Err(message.to_owned()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Counts every graph it is asked to open and every window it writes, so a test can see
    /// whether consecutive requests shared a decoder.
    #[derive(Default)]
    struct CountingWriter {
        opens: AtomicUsize,
        windows: Arc<Mutex<Vec<(usize, usize)>>>,
        delay: Option<Duration>,
    }

    struct CountingSession {
        windows: Arc<Mutex<Vec<(usize, usize)>>>,
        delay: Option<Duration>,
    }

    impl DecodedWindowWriter for CountingSession {
        fn write_window(
            &mut self,
            _ffmpeg: &str,
            _output: &std::path::Path,
            start: usize,
            end: usize,
            cancel: &AtomicBool,
        ) -> Result<(), String> {
            if cancel.load(Ordering::SeqCst) {
                return Err(CANCELLED.to_owned());
            }
            if let Some(delay) = self.delay {
                std::thread::sleep(delay);
            }
            self.windows
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push((start, end));
            Ok(())
        }
    }

    impl PreviewWriter for CountingWriter {
        fn open_decoded(
            &self,
            _input: &Value,
            _context: &PreviewContext<'_>,
        ) -> Result<Box<dyn DecodedWindowWriter>, String> {
            self.opens.fetch_add(1, Ordering::SeqCst);
            Ok(Box::new(CountingSession {
                windows: Arc::clone(&self.windows),
                delay: self.delay,
            }))
        }

        fn open_encoded(
            &self,
            _input: &Value,
            _context: &av1ation_engine::media::preview::DecodeContext<'_>,
        ) -> Result<Box<dyn super::super::EncodedSceneWriter>, String> {
            Err("not used".to_owned())
        }

        fn write_encoded(
            &self,
            _input: &Value,
            _encoder: &Value,
            _context: &PreviewContext<'_>,
            _start: usize,
            _end: usize,
            _cancel: &AtomicBool,
        ) -> Result<(), String> {
            Err("not used".to_owned())
        }

        fn remux_chunk(
            &self,
            _input: &Value,
            _chunk: &std::path::Path,
            _context: &PreviewContext<'_>,
            _start: usize,
            _end: usize,
            _cancel: &AtomicBool,
        ) -> Result<(), String> {
            Err("not used".to_owned())
        }
    }

    fn input() -> DecoderInput {
        DecoderInput {
            input: serde_json::json!({ "Video": { "path": "clip.mkv" } }),
            video_path: "clip.mkv".to_owned(),
            temp_dir: "temp".to_owned(),
            condor: None,
            sequence_config: Value::Null,
        }
    }

    fn script_input() -> DecoderInput {
        DecoderInput {
            input: serde_json::json!({
                "VapourSynthScript": { "source": { "Text": "clip = core.std.BlankClip()" } }
            }),
            ..input()
        }
    }

    fn window(start: usize, end: usize) -> WindowRequest {
        WindowRequest {
            ffmpeg: "ffmpeg".to_owned(),
            output: PathBuf::from(format!("preview-{start}.mp4")),
            start,
            end,
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    #[test]
    fn consecutive_windows_reuse_one_decode_graph() {
        let writer = Arc::new(CountingWriter::default());
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = PreviewDecoders::default();

        decoders
            .write_window("video", Arc::clone(&preview), input(), window(0, 48))
            .expect("the first window");
        decoders
            .write_window("video", Arc::clone(&preview), input(), window(48, 96))
            .expect("the second window");

        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            1,
            "the second window must use the graph the first one opened"
        );
        let written = writer
            .windows
            .lock()
            .map(|windows| windows.clone())
            .unwrap_or_default();
        assert_eq!(written, vec![(0, 48), (48, 96)]);
    }

    /// A session that queues one earlier window while it writes its first one, which is how
    /// an append can arrive during a warm build.
    struct QueueingWriter {
        sender: Mutex<Option<mpsc::Sender<WindowJob>>>,
        windows: Arc<Mutex<Vec<(usize, usize)>>>,
    }

    struct QueueingSession {
        sender: Mutex<Option<mpsc::Sender<WindowJob>>>,
        windows: Arc<Mutex<Vec<(usize, usize)>>>,
    }

    impl DecodedWindowWriter for QueueingSession {
        fn write_window(
            &mut self,
            _ffmpeg: &str,
            _output: &std::path::Path,
            start: usize,
            end: usize,
            _cancel: &AtomicBool,
        ) -> Result<(), String> {
            if start == 96
                && let Some(sender) = self
                    .sender
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .take()
            {
                let _ = sender.send(WindowJob {
                    request: window(48, 96),
                    reply: mpsc::channel().0,
                });
            }
            self.windows
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push((start, end));
            Ok(())
        }
    }

    impl PreviewWriter for QueueingWriter {
        fn open_decoded(
            &self,
            _input: &Value,
            _context: &PreviewContext<'_>,
        ) -> Result<Box<dyn DecodedWindowWriter>, String> {
            Ok(Box::new(QueueingSession {
                sender: Mutex::new(
                    self.sender
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .take(),
                ),
                windows: Arc::clone(&self.windows),
            }))
        }

        fn open_encoded(
            &self,
            _input: &Value,
            _context: &av1ation_engine::media::preview::DecodeContext<'_>,
        ) -> Result<Box<dyn super::super::EncodedSceneWriter>, String> {
            Err("not used".to_owned())
        }

        fn write_encoded(
            &self,
            _input: &Value,
            _encoder: &Value,
            _context: &PreviewContext<'_>,
            _start: usize,
            _end: usize,
            _cancel: &AtomicBool,
        ) -> Result<(), String> {
            Err("not used".to_owned())
        }

        fn remux_chunk(
            &self,
            _input: &Value,
            _chunk: &std::path::Path,
            _context: &PreviewContext<'_>,
            _start: usize,
            _end: usize,
            _cancel: &AtomicBool,
        ) -> Result<(), String> {
            Err("not used".to_owned())
        }
    }

    #[test]
    fn an_append_that_arrives_during_a_warm_is_written_next() {
        let (sender, receiver) = mpsc::channel();
        let windows = Arc::new(Mutex::new(Vec::new()));
        let writer = Arc::new(QueueingWriter {
            sender: Mutex::new(Some(sender.clone())),
            windows: Arc::clone(&windows),
        });
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        for (first, last) in [(96, 144), (144, 192)] {
            sender
                .send(WindowJob {
                    request: window(first, last),
                    reply: mpsc::channel().0,
                })
                .expect("queued warm");
        }
        drop(sender);

        run_session(
            receiver,
            preview,
            input(),
            "reorder".to_owned(),
            1,
            PreviewDecoders::default(),
        );

        let written = windows
            .lock()
            .map(|windows| windows.clone())
            .unwrap_or_default();
        assert_eq!(written, vec![(96, 144), (48, 96), (144, 192)]);
    }

    #[test]
    fn concurrent_windows_open_a_second_decode_graph() {
        let writer = Arc::new(CountingWriter {
            delay: Some(Duration::from_millis(200)),
            ..CountingWriter::default()
        });
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = Arc::new(PreviewDecoders::default());
        let start = Arc::new(std::sync::Barrier::new(2));
        let mut handles = Vec::new();
        for (first, last) in [(0, 48), (48, 96)] {
            let decoders = Arc::clone(&decoders);
            let preview = Arc::clone(&preview);
            let start = Arc::clone(&start);
            handles.push(std::thread::spawn(move || {
                start.wait();
                decoders.write_window("video", preview, input(), window(first, last))
            }));
        }
        for handle in handles {
            assert!(handle.join().expect("the worker").is_ok());
        }

        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            2,
            "a window must not wait for the first graph while a warm is being written"
        );
        let mut written = writer
            .windows
            .lock()
            .map(|windows| windows.clone())
            .unwrap_or_default();
        written.sort();
        assert_eq!(written, vec![(0, 48), (48, 96)]);
    }

    /// A script is a program, not a file: opening it twice builds two graphs, which can
    /// double the memory the user budgeted. The pool must serialise instead.
    #[test]
    fn a_script_input_keeps_one_decode_graph() {
        let writer = Arc::new(CountingWriter {
            delay: Some(Duration::from_millis(200)),
            ..CountingWriter::default()
        });
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = Arc::new(PreviewDecoders::default());
        let start = Arc::new(std::sync::Barrier::new(2));
        let mut handles = Vec::new();
        for (first, last) in [(0, 48), (48, 96)] {
            let decoders = Arc::clone(&decoders);
            let preview = Arc::clone(&preview);
            let start = Arc::clone(&start);
            handles.push(std::thread::spawn(move || {
                start.wait();
                decoders.write_window("script", preview, script_input(), window(first, last))
            }));
        }
        for handle in handles {
            assert!(handle.join().expect("the worker").is_ok());
        }

        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            1,
            "a script must be evaluated once, not once per concurrent window"
        );
    }

    #[test]
    fn a_burst_of_windows_is_written_in_start_order() {
        let writer = Arc::new(CountingWriter::default());
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let (sender, receiver) = mpsc::channel();
        // Arrival order puts the window the playhead reaches next (48) behind two warms.
        for (start, end) in [(96, 144), (48, 96), (144, 192)] {
            sender
                .send(WindowJob {
                    request: window(start, end),
                    reply: mpsc::channel().0,
                })
                .expect("queued window");
        }
        drop(sender);

        run_session(
            receiver,
            preview,
            input(),
            "burst".to_owned(),
            1,
            PreviewDecoders::default(),
        );

        let written = writer
            .windows
            .lock()
            .map(|windows| windows.clone())
            .unwrap_or_default();
        assert_eq!(written, vec![(48, 96), (96, 144), (144, 192)]);
    }

    #[test]
    fn a_cancelled_window_does_not_open_a_graph() {
        let writer = Arc::new(CountingWriter::default());
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = PreviewDecoders::default();
        let request = window(0, 48);
        request.cancel.store(true, Ordering::SeqCst);

        let result = decoders.write_window("cancelled", preview, input(), request);

        assert_eq!(result, Err(CANCELLED.to_owned()));
        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            0,
            "a viewer that left before the build must not start a decoder"
        );
    }
}
