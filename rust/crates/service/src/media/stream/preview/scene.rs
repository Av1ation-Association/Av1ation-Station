//! One opened decode graph, reused by the scene builds of one source.
//!
//! An Encoded preview re-encodes one scene at a time, and each build used to open the
//! Parallel Encoder's input from scratch. On the measured 261-scene project that spent
//! 1.75 s of a 19.1 s warm build on script materialisation, module import, and
//! FFMS2/VapourSynth graph construction before the encoder saw a frame. The next scene
//! starts from the same graph, so this module keeps it open on its own thread and hands it
//! to one build at a time.
//!
//! Reuse is idle-only. A build that finds the graph busy opens a transient one through
//! [`PreviewWriter::write_encoded`] and drops it when the scene ends: queueing would make a
//! warm or the append the user is waiting for lose its overlap, and the measurement that
//! justifies keeping the graph does not justify serialising two encodes.
//!
//! An encoder failure does not close the graph. A refusal belongs to the encoder — a
//! 10-bit-only SVT-AV1 build handed 8-bit frames refuses every frame while the graph is
//! healthy — so the next scene reuses it. A frame the graph could not produce ends the
//! session instead, and the next build opens a new one.

use av1ation_engine::media::preview::{CANCELLED, DecodeContext, PreviewContext, SceneOutput};
use serde_json::Value;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex, PoisonError,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    thread,
};

use super::{DECODER_IDLE_TIMEOUT, DecoderInput, EncodedSceneWriter, PreviewWriter};

/// One scene build to write, as the route knows it.
///
/// Grouping the request keeps [`PreviewSceneDecoders::write_scene`] to the key, the writer,
/// and the build, and makes the transient fallback pass exactly the values the direct path
/// takes.
pub(crate) struct SceneBuild<'a> {
    pub input: &'a Value,
    pub encoder: &'a Value,
    pub context: &'a PreviewContext<'a>,
    pub start: usize,
    pub end: usize,
    pub cancel: &'a Arc<AtomicBool>,
}

/// One scene build waiting for the session thread, and the channel that reports its result.
struct SceneJob {
    encoder: Value,
    ffmpeg: String,
    output: PathBuf,
    start: usize,
    end: usize,
    cancel: Arc<AtomicBool>,
    reply: mpsc::Sender<Result<(), String>>,
}

/// One map entry: the thread's sender, the id that distinguishes it from a replacement, and
/// whether that thread is writing a scene.
struct Session {
    id: u64,
    sender: mpsc::Sender<SceneJob>,
    busy: Arc<AtomicBool>,
}

/// A session already marked busy for this build.
struct Reserved {
    id: u64,
    sender: mpsc::Sender<SceneJob>,
    busy: Arc<AtomicBool>,
}

/// Open one graph for this scene alone, as every build did before the pool existed.
///
/// A busy graph leaves this path to encode at the same time instead of queueing the scene
/// behind another build.
fn transient(writer: &dyn PreviewWriter, build: &SceneBuild<'_>) -> Result<(), String> {
    writer.write_encoded(
        build.input,
        build.encoder,
        build.context,
        build.start,
        build.end,
        build.cancel,
    )
}

/// Identifies a started session, so a late lookup cannot remove its replacement.
static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

/// The decode graphs kept open for scene builds, keyed by the source identity.
///
/// The key is the range-free and encoder-free half of the cache key's fingerprint. Every
/// scene of one video carries its own encoder document — Target Quality and Speed Scaling
/// change the quantizer per scene — but they all read the same input, so the encoder must
/// not decide whether a second graph is opened. The scene table is part of the identity
/// because a script sees it.
#[derive(Clone, Default)]
pub(crate) struct PreviewSceneDecoders {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl PreviewSceneDecoders {
    /// Encode one scene, reusing the idle graph for `key` when there is one.
    ///
    /// The submitter blocks until the scene is written: the caller is already a blocking
    /// task, and the part file it is about to publish must be complete first. A reserved
    /// graph is used only while idle, so this never waits behind another build.
    pub(crate) fn write_scene(
        &self,
        key: &str,
        writer: Arc<dyn PreviewWriter>,
        build: SceneBuild<'_>,
    ) -> Result<(), String> {
        let Some(reserved) = self.reserve(key, &writer, &build)? else {
            return transient(writer.as_ref(), &build);
        };
        let (reply, answer) = mpsc::channel();
        let dispatched = reserved.sender.send(SceneJob {
            encoder: build.encoder.clone(),
            ffmpeg: build.context.ffmpeg.to_owned(),
            output: build.context.output.to_path_buf(),
            start: build.start,
            end: build.end,
            cancel: Arc::clone(build.cancel),
            reply,
        });
        if dispatched.is_err() {
            // The session thread exited between the lookup and the send; its graph is gone,
            // so this scene opens its own instead of failing.
            self.forget(key, reserved.id);
            return transient(writer.as_ref(), &build);
        }
        let result = answer.recv().unwrap_or_else(|_| {
            Err("The preview decoder stopped before the scene was written.".to_owned())
        });
        reserved.busy.store(false, Ordering::SeqCst);
        result
    }

    /// Reserve the graph for `key`, opening one when the pool has none.
    ///
    /// `None` means the graph is already writing a scene. The returned session is already
    /// marked busy; the caller clears that once the scene is written, and forgets it when
    /// the send fails. Reserving under the map lock is what keeps two callers from taking
    /// the same graph.
    fn reserve(
        &self,
        key: &str,
        writer: &Arc<dyn PreviewWriter>,
        build: &SceneBuild<'_>,
    ) -> Result<Option<Reserved>, String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(session) = sessions.get(key) {
            if session.busy.swap(true, Ordering::SeqCst) {
                return Ok(None);
            }
            tracing::debug!(
                target: "av1ation_service::preview",
                key,
                "scene build reused the open decode graph"
            );
            return Ok(Some(Reserved {
                id: session.id,
                sender: session.sender.clone(),
                busy: Arc::clone(&session.busy),
            }));
        }
        let id = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::channel();
        let busy = Arc::new(AtomicBool::new(true));
        let owned_key = key.to_owned();
        let decoders = self.clone();
        let writer = Arc::clone(writer);
        let input = DecoderInput {
            input: build.input.clone(),
            video_path: build.context.video_path.to_owned(),
            temp_dir: build.context.temp_dir.to_owned(),
            condor: build.context.condor.cloned(),
            sequence_config: build.context.sequence_config.clone(),
        };
        thread::Builder::new()
            .name(format!("preview-scene-{id}"))
            .spawn(move || run_session(receiver, writer, input, owned_key, id, decoders))
            .map_err(|error| format!("The preview decoder could not start: {error}"))?;
        sessions.insert(
            key.to_owned(),
            Session {
                id,
                sender: sender.clone(),
                busy: Arc::clone(&busy),
            },
        );
        Ok(Some(Reserved { id, sender, busy }))
    }

    /// Drop one session, when it is still the one this key names.
    fn forget(&self, key: &str, id: u64) {
        let mut sessions = self.sessions.lock().unwrap_or_else(PoisonError::into_inner);
        if sessions.get(key).is_some_and(|session| session.id == id) {
            sessions.remove(key);
        }
    }
}

/// Own one decode graph for the life of its key.
///
/// The graph is opened on the first scene, so creating the registry entry costs no decoding
/// and a cancelled build opens nothing. A scene that leaves the graph usable keeps the
/// session alive; a decode failure, or a failed open, ends the thread after answering the
/// scene, and the next request opens a new graph.
fn run_session(
    receiver: mpsc::Receiver<SceneJob>,
    writer: Arc<dyn PreviewWriter>,
    input: DecoderInput,
    key: String,
    session_id: u64,
    decoders: PreviewSceneDecoders,
) {
    let mut session: Option<Box<dyn EncodedSceneWriter>> = None;
    // A scene review pauses like a window review, so the graph retires on the same idle
    // timeout instead of holding a replaced project's source mapped.
    while let Ok(job) = receiver.recv_timeout(DECODER_IDLE_TIMEOUT) {
        if job.cancel.load(Ordering::SeqCst) {
            let _ = job.reply.send(Err(CANCELLED.to_owned()));
            continue;
        }
        if session.is_none() {
            let context = DecodeContext {
                video_path: &input.video_path,
                temp_dir: &input.temp_dir,
                condor: input.condor.as_ref(),
                sequence_config: &input.sequence_config,
            };
            match writer.open_encoded(&input.input, &context) {
                Ok(opened) => {
                    tracing::debug!(
                        target: "av1ation_service::preview",
                        key,
                        "scene decode graph opened"
                    );
                    session = Some(opened)
                }
                Err(message) => {
                    // An input that cannot open will not open for the next scene either;
                    // answer this one and leave the pool so a fixed script gets a new try.
                    let _ = job.reply.send(Err(message));
                    break;
                }
            }
        }
        // The grain table goes where this session's script was materialised, so a scene and
        // the graph that reads it always share one run context.
        let target = SceneOutput {
            temp_dir: &input.temp_dir,
            ffmpeg: &job.ffmpeg,
            output: &job.output,
        };
        let result = match session.as_mut() {
            Some(opened) => {
                opened.write_scene(&job.encoder, &target, job.start, job.end, &job.cancel)
            }
            None => Err("The preview decoder is not open.".to_owned()),
        };
        // The encoder owns its failures; only the graph can make the session unusable.
        let keep = session.as_ref().is_some_and(|opened| opened.is_usable());
        let _ = job.reply.send(result);
        if !keep {
            break;
        }
    }
    decoders.forget(&key, session_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;

    const NULL: Value = Value::Null;

    #[derive(Default)]
    struct CountingWriter {
        opens: AtomicUsize,
        scenes: Arc<Mutex<Vec<(String, usize, usize)>>>,
        delay: Option<Duration>,
        refuse: bool,
        broken: bool,
    }

    impl CountingWriter {
        fn session(&self) -> CountingSession {
            CountingSession {
                scenes: Arc::clone(&self.scenes),
                delay: self.delay,
                refuse: self.refuse,
                broken: self.broken,
                usable: true,
            }
        }
    }

    struct CountingSession {
        scenes: Arc<Mutex<Vec<(String, usize, usize)>>>,
        delay: Option<Duration>,
        refuse: bool,
        broken: bool,
        usable: bool,
    }

    impl EncodedSceneWriter for CountingSession {
        fn write_scene(
            &mut self,
            encoder: &Value,
            target: &SceneOutput<'_>,
            start: usize,
            end: usize,
            cancel: &AtomicBool,
        ) -> Result<(), String> {
            if cancel.load(Ordering::SeqCst) {
                return Err(CANCELLED.to_owned());
            }
            assert!(
                !target.temp_dir.is_empty() && !target.ffmpeg.is_empty(),
                "a scene build needs the run's paths"
            );
            assert!(
                !target.output.as_os_str().is_empty(),
                "a scene build needs its part file"
            );
            if let Some(delay) = self.delay {
                std::thread::sleep(delay);
            }
            let label = encoder
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            self.scenes
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push((label, start, end));
            if self.broken {
                self.usable = false;
                return Err("Frame 0 could not be decoded: the graph is gone.".to_owned());
            }
            if self.refuse {
                return Err(
                    "The encoder could not produce the scene preview: it refuses this input."
                        .to_owned(),
                );
            }
            Ok(())
        }

        fn is_usable(&self) -> bool {
            self.usable
        }
    }

    impl PreviewWriter for CountingWriter {
        fn open_decoded(
            &self,
            _input: &Value,
            _context: &PreviewContext<'_>,
        ) -> Result<Box<dyn crate::DecodedWindowWriter>, String> {
            Err("not used".to_owned())
        }

        fn open_encoded(
            &self,
            _input: &Value,
            _context: &DecodeContext<'_>,
        ) -> Result<Box<dyn EncodedSceneWriter>, String> {
            self.opens.fetch_add(1, Ordering::SeqCst);
            Ok(Box::new(self.session()))
        }

        /// The transient path: one graph for one scene, dropped when the scene ends.
        fn write_encoded(
            &self,
            _input: &Value,
            encoder: &Value,
            context: &PreviewContext<'_>,
            start: usize,
            end: usize,
            cancel: &AtomicBool,
        ) -> Result<(), String> {
            self.opens.fetch_add(1, Ordering::SeqCst);
            let target = SceneOutput {
                temp_dir: context.temp_dir,
                ffmpeg: context.ffmpeg,
                output: context.output,
            };
            self.session()
                .write_scene(encoder, &target, start, end, cancel)
        }

        fn remux_chunk(
            &self,
            _input: &Value,
            _chunk: &Path,
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
            input: serde_json::json!({
                "VapourSynthScript": { "source": { "Text": "clip = core.std.BlankClip()" } }
            }),
            video_path: "clip.mkv".to_owned(),
            temp_dir: "temp".to_owned(),
            condor: None,
            sequence_config: Value::Null,
        }
    }

    fn context<'a>(temp: &'a str, ffmpeg: &'a str, output: &'a Path) -> PreviewContext<'a> {
        PreviewContext {
            video_path: "clip.mkv",
            temp_dir: temp,
            condor: None,
            sequence_config: &NULL,
            ffmpeg,
            output,
        }
    }

    fn cancel() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
    }

    fn recorded(writer: &CountingWriter) -> Vec<(String, usize, usize)> {
        writer
            .scenes
            .lock()
            .map(|scenes| scenes.clone())
            .unwrap_or_default()
    }

    #[test]
    fn consecutive_scenes_reuse_one_decode_graph() {
        let writer = Arc::new(CountingWriter::default());
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = PreviewSceneDecoders::default();
        let state = input();
        let seek = cancel();
        let output = Path::new("scene.mp4");
        // Target Quality and Speed Scaling give neighbouring scenes different encoder
        // documents; the graph they read is the same one.
        for (label, start, end) in [("a", 0, 48), ("b", 48, 96)] {
            let encoder = serde_json::json!({ "label": label });
            decoders
                .write_scene(
                    "video",
                    Arc::clone(&preview),
                    SceneBuild {
                        input: &state.input,
                        encoder: &encoder,
                        context: &context("temp", "ffmpeg", output),
                        start,
                        end,
                        cancel: &seek,
                    },
                )
                .expect("the scene");
        }

        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            1,
            "the second scene must use the graph the first one opened"
        );
        assert_eq!(
            recorded(&writer),
            vec![("a".to_owned(), 0, 48), ("b".to_owned(), 48, 96)]
        );
    }

    #[test]
    fn a_busy_graph_is_left_alone_and_a_transient_one_is_dropped() {
        let writer = Arc::new(CountingWriter {
            delay: Some(Duration::from_millis(200)),
            ..CountingWriter::default()
        });
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = Arc::new(PreviewSceneDecoders::default());
        let start = Arc::new(std::sync::Barrier::new(2));
        let mut handles = Vec::new();
        for (label, first, last) in [("a", 0, 48), ("b", 48, 96)] {
            let decoders = Arc::clone(&decoders);
            let preview = Arc::clone(&preview);
            let start = Arc::clone(&start);
            handles.push(std::thread::spawn(move || {
                let state = input();
                let seek = cancel();
                let encoder = serde_json::json!({ "label": label });
                start.wait();
                decoders.write_scene(
                    "video",
                    preview,
                    SceneBuild {
                        input: &state.input,
                        encoder: &encoder,
                        context: &context("temp", "ffmpeg", Path::new("scene.mp4")),
                        start: first,
                        end: last,
                        cancel: &seek,
                    },
                )
            }));
        }
        for handle in handles {
            assert!(handle.join().expect("the worker").is_ok());
        }
        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            2,
            "a scene that arrives while the graph is writing must open its own, not queue"
        );

        // The transient graph ended with its scene; the kept one is idle again.
        let state = input();
        let seek = cancel();
        let encoder = serde_json::json!({ "label": "c" });
        decoders
            .write_scene(
                "video",
                Arc::clone(&preview),
                SceneBuild {
                    input: &state.input,
                    encoder: &encoder,
                    context: &context("temp", "ffmpeg", Path::new("scene.mp4")),
                    start: 96,
                    end: 144,
                    cancel: &seek,
                },
            )
            .expect("the third scene");
        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            2,
            "a later scene must reuse the graph that was kept, not the transient one"
        );
        let mut written = recorded(&writer);
        written.sort();
        assert_eq!(
            written,
            vec![
                ("a".to_owned(), 0, 48),
                ("b".to_owned(), 48, 96),
                ("c".to_owned(), 96, 144)
            ]
        );
    }

    #[test]
    fn an_encoder_refusal_keeps_the_graph() {
        let writer = Arc::new(CountingWriter {
            refuse: true,
            ..CountingWriter::default()
        });
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = PreviewSceneDecoders::default();
        let state = input();
        let seek = cancel();
        let output = Path::new("scene.mp4");
        let mut failures = Vec::new();
        for (label, start, end) in [("a", 0, 48), ("b", 48, 96)] {
            let encoder = serde_json::json!({ "label": label });
            let result = decoders.write_scene(
                "video",
                Arc::clone(&preview),
                SceneBuild {
                    input: &state.input,
                    encoder: &encoder,
                    context: &context("temp", "ffmpeg", output),
                    start,
                    end,
                    cancel: &seek,
                },
            );
            failures.push(result.expect_err("the encoder refuses this input"));
        }

        assert!(failures[0].contains("refuses this input"));
        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            1,
            "a refusal belongs to the encoder; the decoder must not be reopened"
        );
    }

    #[test]
    fn a_decode_failure_drops_the_graph() {
        let writer = Arc::new(CountingWriter {
            broken: true,
            ..CountingWriter::default()
        });
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = PreviewSceneDecoders::default();
        let state = input();
        let seek = cancel();
        let output = Path::new("scene.mp4");
        for (label, start, end) in [("a", 0, 48), ("b", 48, 96)] {
            let encoder = serde_json::json!({ "label": label });
            let result = decoders.write_scene(
                "video",
                Arc::clone(&preview),
                SceneBuild {
                    input: &state.input,
                    encoder: &encoder,
                    context: &context("temp", "ffmpeg", output),
                    start,
                    end,
                    cancel: &seek,
                },
            );
            assert!(result.is_err());
        }

        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            2,
            "a graph that could not produce a frame must not be reused"
        );
    }

    #[test]
    fn a_cancelled_scene_does_not_open_a_graph() {
        let writer = Arc::new(CountingWriter::default());
        let preview: Arc<dyn PreviewWriter> = writer.clone();
        let decoders = PreviewSceneDecoders::default();
        let state = input();
        let cancelled = Arc::new(AtomicBool::new(true));
        let encoder = serde_json::json!({ "label": "a" });

        let result = decoders.write_scene(
            "video",
            preview,
            SceneBuild {
                input: &state.input,
                encoder: &encoder,
                context: &context("temp", "ffmpeg", Path::new("scene.mp4")),
                start: 0,
                end: 48,
                cancel: &cancelled,
            },
        );

        assert_eq!(result, Err(CANCELLED.to_owned()));
        assert_eq!(
            writer.opens.load(Ordering::SeqCst),
            0,
            "a viewer that left before the build must not start a decoder"
        );
    }
}
