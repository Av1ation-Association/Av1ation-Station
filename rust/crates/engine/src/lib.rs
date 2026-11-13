//! Integration boundary for the pinned andean-condor library.
//!
//! The service depends on this crate rather than on `andean_condor` directly. That keeps
//! the engine adapter, its event shape, and the fake runner in one place, so an upstream
//! change cannot leak into the HTTP layer.
//!
//! The crate is divided by integration domain: [`run`] owns the worker and its checkpoint,
//! [`capability`] discovers encoders, tools, and the detector model, [`media`] builds input
//! documents and previews, and [`script`] owns the generated VapourSynth interface. The
//! public root carries only the run contract shared by the service and the fields a project
//! document stores, so an adapter change has one obvious landing place.

use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver},
    },
    thread,
    time::{Duration, Instant},
};

use andean_condor::models::encoder::{Encoder, EncoderBase};
use serde::{Deserialize, Serialize};

pub mod capability;
pub mod media;
pub mod platform;
pub mod run;
pub mod script;

pub use run::{RealRunner, RunnerConfig};

/// The upstream package version this adapter was built against.
pub const ENGINE_VERSION: &str = "0.0.1";

/// The option each encoder family stores its photon-noise table under.
///
/// The engine names the key per family in `apply_photon_noise_parameters`, and a retained
/// encoder document carries whichever key it was written with. Two sides read it: the
/// preview, which must regenerate a table the scratch directory no longer holds, and a reset
/// that clears the photon-noise setting, which must not leave the option naming a file that
/// nothing will ever write again.
pub(crate) const GRAIN_OPTION_KEYS: [&str; 3] =
    ["fgs-table", "film-grain-table", "photon-noise-table"];

/// JSON Schema for the configuration documents the section editors write.
///
/// The schema is generated from the engine's own types, so a field added or removed upstream
/// reaches the UI without a second hand-maintained table. The encoder schema describes the
/// externally tagged `Encoder` enum; the sequence schema describes every pipeline section,
/// including the optional ones that default to `null`.
pub fn config_schemas() -> Result<serde_json::Value, serde_json::Error> {
    Ok(serde_json::json!({
        "encoder": serde_json::to_value(schemars::schema_for!(Encoder))?,
        "sequences": serde_json::to_value(schemars::schema_for!(RunnerConfig))?,
    }))
}

/// A new project's starting configuration, serialised by the engine itself.
///
/// The service persists this blob under a project and never inspects it, so a project file
/// is written by the engine's own defaults rather than by a second table of numbers. The
/// typed configuration model replaces the blob's contents in place; the file keeps its
/// shape either way.
pub fn default_project_config() -> serde_json::Value {
    // The engine ships each encoder's mandatory flags with its defaults (`--demuxer=y4m`
    // for x264, `--y4m` for x265, and the SVT-AV1 rate control), so excluding them here
    // would make every project's first encode start an encoder that cannot read a frame.
    serde_json::json!({
        "encoder": Encoder::default_from_base(&EncoderBase::SVTAV1, false),
        "sequences": RunnerConfig::default(),
    })
}

/// The exact upstream commit this adapter was built against.
///
/// The package version never changes between Av1an commits, so the revision is the only
/// value that identifies the engine build a user is running.
pub const ENGINE_REVISION: &str = env!("ENGINE_REVISION");

/// A fully materialised run: the worker owns every value and reads no project state.
pub struct EncodeRequest {
    pub run_id: String,
    pub project_id: String,
    pub video_id: String,
    /// Engine `Input` JSON.
    pub input: serde_json::Value,
    /// The source file the queued video owns, which a script input is told to open.
    pub video_path: String,
    /// Engine `Output` JSON.
    pub output: serde_json::Value,
    /// Engine `Encoder` JSON.
    pub encoder: serde_json::Value,
    /// Engine sequence configuration JSON, including Benchmarker and Speed Scaler.
    pub sequence_config: serde_json::Value,
    /// The persisted `Condor` blob, when the video has run before.
    pub condor: Option<serde_json::Value>,
    /// Sequence ids to execute, in order.
    pub sequences: Vec<String>,
    /// Called for every engine checkpoint, synchronously, before the sequence continues.
    pub checkpoint: Arc<dyn Fn(serde_json::Value) -> Result<(), String> + Send + Sync>,
}

/// One scene a checkpoint appended to the engine's table.
///
/// Detection saves a checkpoint per scene. Carrying that scene on the event lets the rail
/// append it live; a count alone would still need a request before the new row could render.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneUpdate {
    /// Zero-based position in the engine's scene table.
    pub index: u32,
    /// The table's size after this append.
    pub count: u32,
    /// The engine's serialized `Scene` document.
    pub scene: serde_json::Value,
}

/// A progress event that crosses the engine boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EncodeEvent {
    pub run_id: String,
    pub seq: u64,
    /// UTC ISO-8601 instant, stamped at the boundary where the engine has no clock field.
    pub at: String,
    pub kind: EncodeEventKind,
    /// The sequence this event belongs to; absent on run-level terminal events.
    pub sequence: Option<String>,
    pub progress: Option<f64>,
    pub message: String,
    /// The run-log severity this event should be written at, when it is not implied by its
    /// kind. A per-scene result is debug and a per-tick trace line is trace; the reader's
    /// level filter is only useful if those are not all `info`.
    pub level: Option<String>,
    pub frames_processed: Option<u64>,
    pub frames_total: Option<u64>,
    /// The step or worker inside the sequence this tick belongs to.
    pub phase: Option<String>,
    /// The 1-based pass this tick belongs to, when the sequence runs passes.
    pub pass: Option<u8>,
    /// The most passes the sequence will run, when it reports a ceiling.
    ///
    /// Target Quality stops as soon as every scene meets its target, so this is not a
    /// total and cannot divide the bar.
    pub max_passes: Option<u8>,
    /// Scenes finished and expected, for a sequence that counts scenes.
    pub scenes_processed: Option<u32>,
    pub scenes_total: Option<u32>,
    /// The scene a tick belongs to (zero-based): the one a worker is encoding, or the one a
    /// measurement describes.
    pub scene_index: Option<u32>,
    /// That scene's own percentage.
    pub scene_progress: Option<f64>,
    /// Frames that one scene has produced, and how many it has in total.
    ///
    /// A worker encodes one scene at a time, so its own rate and finish estimate need that
    /// scene's frame pair: the aggregate counters say how the encode is doing, not the scene
    /// the reader is watching.
    pub scene_frames_processed: Option<u64>,
    pub scene_frames_total: Option<u64>,
    /// Bytes the finished chunk holds, when a checkpoint recorded one for `scene_index`.
    ///
    /// Parallel Encoder's own tick names the scene a worker holds; this pair describes one
    /// that is already written. The checkpoint that saved it carries the size, and the two
    /// timestamps it stamped, so the live row needs no read of the chunk directory.
    pub scene_bytes: Option<u64>,
    /// Wall-clock milliseconds that scene's chunk took, from the same checkpoint.
    pub scene_encode_ms: Option<u64>,
    /// The noise Noise Detector measured for `scene_index`, when the tick carries one.
    ///
    /// A per-scene measurement is evidence, not completion: the sequence's bar comes from
    /// its own scene tally. Carrying the value lets the measured-data charts fill in while
    /// the run is still going instead of only when its terminal event arrives.
    pub scene_noise: Option<f64>,
    /// The quality score Quality Check measured for `scene_index`, when the tick carries one.
    ///
    /// Quality Check scores one scene at a time. The scene table is what its chart reads, so
    /// carrying the value lets the chart fill while the run is still going instead of when
    /// the run's terminal event triggers a table read.
    pub scene_quality: Option<f64>,
    /// The scene this checkpoint appended, when the event reports a save.
    pub scene: Option<SceneUpdate>,
}

/// The event categories the service fans out to the UI.
///
/// `Detail` and `Warning` are run-log records, not progress: the service writes them to
/// `run.jsonl` and does not broadcast them. A per-scene line is the evidence for a
/// sequence's result, and a five-thousand-scene video would otherwise evict every live
/// progress event from the replay buffer and the SSE channel. The Logs tab still shows
/// them as they are appended, because its follow poll reads the tail of the file.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EncodeEventKind {
    Started,
    Progress,
    Completed,
    Cancelled,
    Finished,
    Failed,
    /// A run-log-only record describing what a sequence produced.
    Detail,
    /// A run-log-only record carrying one of the engine's sequence warnings.
    Warning,
}

impl EncodeEventKind {
    /// Whether this event ends the run and may release the singleton lock.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Cancelled | Self::Finished | Self::Failed)
    }
}

/// A started run and the channel that carries its events.
pub struct EncodeHandle {
    pub run_id: String,
    pub cancel: Arc<AtomicBool>,
    pub events: Receiver<EncodeEvent>,
}

/// The service-facing contract implemented by the real engine and the fake.
pub trait EncodeRunner: Send + Sync {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError>;
}

/// Errors raised before a run reaches its event stream.
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("the engine rejected the request: {0}")]
    Rejected(String),
    #[error("the engine worker could not start: {0}")]
    Worker(String),
}

/// A runner that emits a small synthetic run and holds until cancelled.
///
/// It is used by the scaffold, the headless service, and tests. Holding until cancellation
/// makes the singleton guard observable without a real encoder or a timing-dependent sleep.
#[derive(Debug, Default, Clone, Copy)]
pub struct FakeRunner;

impl EncodeRunner for FakeRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        let (sender, receiver) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = Arc::clone(&cancel);
        let run_id = request.run_id;
        let worker_run_id = run_id.clone();
        // A run-level start carries no sequence, so the UI's derived state cannot mark the
        // first sequence active. Name it and report one synthetic tick: a journey that
        // checks the lock and progress must observe the same shape a real runner emits.
        let sequence = request.sequences.first().cloned();

        thread::Builder::new()
            .name(format!("fake-encode-{run_id}"))
            .spawn(move || {
                let mut seq = 0;
                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Started,
                    sequence.as_deref(),
                    Some(0.0),
                    "Fake encode started",
                );
                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Progress,
                    sequence.as_deref(),
                    Some(42.0),
                    "Fake encode progress",
                );

                while !worker_cancel.load(Ordering::SeqCst) {
                    thread::park_timeout(Duration::from_millis(10));
                }

                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Cancelled,
                    sequence.as_deref(),
                    None,
                    "Fake encode cancelled",
                );
                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Finished,
                    None,
                    None,
                    "Fake encode stopped",
                );
            })
            .map_err(|error| EngineError::Worker(error.to_string()))?;

        Ok(EncodeHandle {
            run_id,
            cancel,
            events: receiver,
        })
    }
}

/// A runner that emits a small synthetic run and reaches a terminal event on its own.
///
/// [`FakeRunner`] holds until cancellation so the singleton guard stays observable; this
/// runner is the debug-only `--fake-engine-complete` host used by the browser journey. It
/// is deliberately not a release path: a fake run must never pretend to encode for a user.
#[derive(Debug, Default, Clone, Copy)]
pub struct CompletingRunner;

/// How long the completing runner exposes its progress before it finishes.
///
/// The journey needs a window in which the live state can be read, but the engine must not
/// become a timing-dependent test harness. The window is short and every event is also in
/// the supervisor's replay buffer, so the assertion does not depend on catching a frame.
const COMPLETION_HOLD: Duration = Duration::from_millis(400);

impl EncodeRunner for CompletingRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        let (sender, receiver) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = Arc::clone(&cancel);
        let run_id = request.run_id;
        let worker_run_id = run_id.clone();
        let sequence = request.sequences.first().cloned();
        // The debug-only path line gives the log/export journey a realistic value to
        // anonymise without pretending to encode. It is a detail event, so it stays in the
        // run log and never moves the live stage or the timeline.
        let source_path = request.video_path.clone();

        thread::Builder::new()
            .name(format!("fake-complete-{run_id}"))
            .spawn(move || {
                let mut seq = 0;
                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Started,
                    sequence.as_deref(),
                    Some(0.0),
                    "Fake encode started",
                );
                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Progress,
                    sequence.as_deref(),
                    Some(42.0),
                    "Fake encode progress",
                );
                let source_detail = format!("Source file: {source_path}");
                send_with_level(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Detail,
                    sequence.as_deref(),
                    None,
                    EventText {
                        message: &source_detail,
                        level: Some("debug"),
                    },
                );

                let started = Instant::now();
                while !worker_cancel.load(Ordering::SeqCst) && started.elapsed() < COMPLETION_HOLD {
                    thread::park_timeout(Duration::from_millis(10));
                }

                if worker_cancel.load(Ordering::SeqCst) {
                    send(
                        &sender,
                        &worker_run_id,
                        &mut seq,
                        EncodeEventKind::Cancelled,
                        sequence.as_deref(),
                        None,
                        "Fake encode cancelled",
                    );
                    send(
                        &sender,
                        &worker_run_id,
                        &mut seq,
                        EncodeEventKind::Finished,
                        None,
                        None,
                        "Fake encode stopped",
                    );
                    return;
                }

                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Completed,
                    sequence.as_deref(),
                    Some(100.0),
                    "Fake encode completed",
                );
                send(
                    &sender,
                    &worker_run_id,
                    &mut seq,
                    EncodeEventKind::Finished,
                    None,
                    None,
                    "Fake encode finished",
                );
            })
            .map_err(|error| EngineError::Worker(error.to_string()))?;

        Ok(EncodeHandle {
            run_id,
            cancel,
            events: receiver,
        })
    }
}

fn send(
    sender: &mpsc::Sender<EncodeEvent>,
    run_id: &str,
    seq: &mut u64,
    kind: EncodeEventKind,
    sequence: Option<&str>,
    progress: Option<f64>,
    message: &str,
) {
    send_with_level(
        sender,
        run_id,
        seq,
        kind,
        sequence,
        progress,
        EventText {
            message,
            level: None,
        },
    );
}

/// The free-text half of an event; the event kind, sequence and progress are separate.
///
/// Bundling the optional log level with its message keeps the private sender at seven
/// arguments, below Clippy's limit, without changing the event shape.
struct EventText<'a> {
    message: &'a str,
    level: Option<&'a str>,
}

fn send_with_level(
    sender: &mpsc::Sender<EncodeEvent>,
    run_id: &str,
    seq: &mut u64,
    kind: EncodeEventKind,
    sequence: Option<&str>,
    progress: Option<f64>,
    text: EventText<'_>,
) {
    let event = EncodeEvent {
        run_id: run_id.to_owned(),
        seq: *seq,
        at: String::new(),
        kind,
        sequence: sequence.map(str::to_owned),
        progress,
        message: text.message.to_owned(),
        level: text.level.map(str::to_owned),
        frames_processed: None,
        frames_total: None,
        phase: None,
        pass: None,
        max_passes: None,
        scenes_processed: None,
        scenes_total: None,
        scene_index: None,
        scene_progress: None,
        scene_frames_processed: None,
        scene_frames_total: None,
        scene_bytes: None,
        scene_encode_ms: None,
        scene_noise: None,
        scene_quality: None,
        scene: None,
    };
    *seq += 1;
    let _ = sender.send(event);
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::RecvTimeoutError;

    use super::*;

    /// A fake run must expose the sequence the service derives its live state from, and it
    /// must keep the lock observable until cancellation asks it to stop.
    #[test]
    fn a_fake_run_reports_its_first_sequence_and_holds_until_cancelled() {
        let handle = FakeRunner
            .start(EncodeRequest {
                run_id: "run-1".to_owned(),
                project_id: "project-1".to_owned(),
                video_id: "video-1".to_owned(),
                input: serde_json::Value::Null,
                video_path: "clip.mp4".to_owned(),
                output: serde_json::Value::Null,
                encoder: serde_json::Value::Null,
                sequence_config: serde_json::Value::Null,
                condor: None,
                sequences: vec!["SceneDetector".to_owned()],
                checkpoint: Arc::new(|_| Ok(())),
            })
            .expect("the fake worker starts");

        let started = handle
            .events
            .recv_timeout(Duration::from_secs(1))
            .expect("the start event arrives");
        assert_eq!(started.kind, EncodeEventKind::Started);
        assert_eq!(started.sequence.as_deref(), Some("SceneDetector"));
        assert_eq!(started.progress, Some(0.0));

        let progress = handle
            .events
            .recv_timeout(Duration::from_secs(1))
            .expect("the progress event arrives");
        assert_eq!(progress.kind, EncodeEventKind::Progress);
        assert_eq!(progress.sequence.as_deref(), Some("SceneDetector"));
        assert_eq!(progress.progress, Some(42.0));
        assert!(matches!(
            handle.events.recv_timeout(Duration::from_millis(20)),
            Err(RecvTimeoutError::Timeout)
        ));

        handle.cancel.store(true, Ordering::SeqCst);
        let cancelled = handle
            .events
            .recv_timeout(Duration::from_secs(1))
            .expect("the cancellation arrives");
        assert_eq!(cancelled.kind, EncodeEventKind::Cancelled);
        let finished = handle
            .events
            .recv_timeout(Duration::from_secs(1))
            .expect("the finish marker arrives");
        assert_eq!(finished.kind, EncodeEventKind::Finished);
    }

    /// The completing runner is the debug-only host for a journey that must reach a
    /// terminal state; unlike `FakeRunner`, it does not wait for a cancel.
    #[test]
    fn a_completing_run_reports_progress_and_finishes() {
        let handle = CompletingRunner
            .start(request(&["SceneDetector"]))
            .expect("the completing worker starts");

        let mut events = Vec::new();
        for _ in 0..5 {
            let event = handle
                .events
                .recv_timeout(Duration::from_secs(2))
                .expect("the synthetic run reaches a terminal event");
            events.push(event);
        }
        assert_eq!(
            events.iter().map(|event| event.kind).collect::<Vec<_>>(),
            vec![
                EncodeEventKind::Started,
                EncodeEventKind::Progress,
                EncodeEventKind::Detail,
                EncodeEventKind::Completed,
                EncodeEventKind::Finished,
            ]
        );
        let detail = &events[2];
        assert_eq!(detail.level.as_deref(), Some("debug"));
        assert!(
            detail.message.contains("Source file: clip.mp4"),
            "{}",
            detail.message
        );
    }

    /// Cancellation still wins during the short completion window, so the journey runner
    /// cannot strand the singleton when the user presses Stop.
    #[test]
    fn a_completing_run_still_honours_cancellation() {
        let handle = CompletingRunner
            .start(request(&["SceneDetector"]))
            .expect("the completing worker starts");
        for expected in [
            EncodeEventKind::Started,
            EncodeEventKind::Progress,
            EncodeEventKind::Detail,
        ] {
            let event = handle
                .events
                .recv_timeout(Duration::from_secs(1))
                .expect("the pre-cancel events arrive");
            assert_eq!(event.kind, expected);
        }
        handle.cancel.store(true, Ordering::SeqCst);
        let cancelled = handle
            .events
            .recv_timeout(Duration::from_secs(1))
            .expect("the cancellation arrives");
        assert_eq!(cancelled.kind, EncodeEventKind::Cancelled);
        let finished = handle
            .events
            .recv_timeout(Duration::from_secs(1))
            .expect("the finish marker arrives");
        assert_eq!(finished.kind, EncodeEventKind::Finished);
    }

    fn request(sequences: &[&str]) -> EncodeRequest {
        EncodeRequest {
            run_id: "run-1".to_owned(),
            project_id: "project-1".to_owned(),
            video_id: "video-1".to_owned(),
            input: serde_json::Value::Null,
            video_path: "clip.mp4".to_owned(),
            output: serde_json::Value::Null,
            encoder: serde_json::Value::Null,
            sequence_config: serde_json::Value::Null,
            condor: None,
            sequences: sequences
                .iter()
                .map(|sequence| (*sequence).to_owned())
                .collect(),
            checkpoint: Arc::new(|_| Ok(())),
        }
    }
}
