//! Run and sequence records, progress events, and the execution timeline.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::scene::SceneView;

/// The response returned when a run has been accepted.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RunStarted {
    /// Correlation id for the run, events, cancellation, and logs.
    pub run_id: String,
}

/// The lifecycle stage one encode event reports.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EncodeEventKind {
    /// A sequence started; the run has reserved the singleton.
    Started,
    /// The sequence is still working; `progress` may be absent while it opens an input.
    Progress,
    /// One sequence finished successfully and its data is checkpointed.
    Completed,
    /// The run was stopped by the user.
    Cancelled,
    /// The run ended normally; the singleton is released before this event is published.
    Finished,
    /// The run stopped because a sequence reported an error.
    Failed,
}

impl EncodeEventKind {
    /// Whether this event ends the run, so a client may start the next one.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Cancelled | Self::Finished | Self::Failed)
    }
}

/// One live encode event, as written to the SSE stream and the run replay buffer.
///
/// The engine's event has no run owner; the service adds `project_id` and `video_id` at the
/// boundary so every screen can route the event to the cache entry it describes without a
/// second lookup. `seq` is monotonic within a run and doubles as the SSE event id.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncodeEvent {
    /// The project whose queue entry is encoding.
    pub project_id: String,
    /// The video whose derived state this event updates.
    pub video_id: String,
    /// Correlation id shared by the start response, logs, and cancellation.
    pub run_id: String,
    /// Monotonic within the run; also the SSE `Last-Event-ID` cursor.
    pub seq: u64,
    /// UTC ISO-8601 instant stamped at the engine boundary.
    pub at: String,
    /// The lifecycle stage this event reports.
    pub kind: EncodeEventKind,
    /// The sequence the event belongs to; absent on run-level terminal events and while an
    /// input is being opened before the first sequence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<String>,
    /// Completion percentage of the sequence, when the engine can measure it.
    ///
    /// A sequence that runs in passes reports the current step's own percentage, so the bar
    /// fills once for `Encode` and once again for `Compare` in every pass. The pass count is
    /// not known in advance, so no percentage can span passes.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0.0, max = 100.0))]
    pub progress: Option<f64>,
    /// Human-readable line for the log strip and the live status.
    pub message: String,
    /// Frames the sequence has processed, when it reports them.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frames_processed: Option<u64>,
    /// Total frames the sequence will process, when it reports them.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frames_total: Option<u64>,
    /// The step inside the sequence this tick belongs to: `Encode`, `Compare`, `Quality`,
    /// or a worker's scene. Absent when the sequence reports a single stream.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    /// The 1-based pass this tick belongs to, when the sequence runs in passes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pass: Option<u8>,
    /// The most passes the sequence will run, when it knows.
    ///
    /// Target Quality may satisfy its targets in a single pass, so this is a ceiling and
    /// not a total: it cannot become a denominator for the bar, and a run must not be
    /// presented as `pass / max_passes`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_passes: Option<u8>,
    /// Scenes the sequence has finished, when it counts scenes rather than frames.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scenes_processed: Option<u32>,
    /// Scenes the sequence will process, when it counts scenes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scenes_total: Option<u32>,
    /// The scene a tick belongs to (zero-based), when it reports one: the scene a worker is
    /// encoding, or the scene a per-scene measurement describes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_index: Option<u32>,
    /// Completion percentage of that one scene, when the sequence reports it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0.0, max = 100.0))]
    pub scene_progress: Option<f64>,
    /// Frames that one scene has produced, when a worker reports its own scene.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_frames_processed: Option<u64>,
    /// Frames that one scene will produce, when a worker reports its own scene.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_frames_total: Option<u64>,
    /// Bytes the finished chunk holds, when a checkpoint recorded one for `scene_index`.
    ///
    /// Parallel Encoder checkpoints a scene once its chunk is written, with the size and
    /// wall-clock duration it recorded. Carrying both on the event lets the rail mark that
    /// row encoded and the Encoding chart plot its throughput while the other workers are
    /// still running, instead of waiting for the sequence to end and a table read to see
    /// the same values on disk.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_bytes: Option<u64>,
    /// Wall-clock milliseconds that scene's chunk took, as the checkpoint recorded them.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_encode_ms: Option<u64>,
    /// The noise Noise Detector measured for `scene_index`, when the tick carries one.
    ///
    /// The measurement is evidence, not completion: the sequence's bar comes from its own
    /// scene tally. Carrying it lets the measured-data charts, and the statistics beneath
    /// them, fill in scene by scene instead of waiting for the run's terminal event.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_noise: Option<f64>,
    /// The quality score Quality Check measured for `scene_index`, when the tick carries one.
    ///
    /// Quality Check scores one scene at a time. Carrying the value lets the client patch the
    /// row its score chart reads while the sequence is still running.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_quality: Option<f64>,
    /// The scene this checkpoint appended, so the rail can render it without a refetch.
    ///
    /// Detection checkpoints once per scene. The row is the same shape the scene table serves,
    /// so the client splices it into the cached list rather than maintaining a second model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene: Option<SceneView>,
    /// The scene table's size after this append, when the event carries a scene.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_count: Option<u32>,
}

/// The request to run exactly one sequence for a video.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SequenceRunRequest {
    /// The sequence id from `/api/sequences`, for example `SceneDetector`.
    pub sequence: String,
}

/// One attempt in a video's append-only execution history.
///
/// A sequence attempt names its `sequence`; the record that closes a run has none and
/// carries the terminal message. `outcome` is `completed`, `cancelled`, or `failed`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TimelineRecord {
    /// The run this attempt belongs to.
    pub run_id: String,
    /// The sequence that ran, or `None` for the run's terminal record.
    pub sequence: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    /// `completed`, `cancelled`, or `failed`.
    pub outcome: String,
    pub frames_processed: Option<u64>,
    pub frames_total: Option<u64>,
    /// Frames processed per second of wall-clock duration.
    pub fps: Option<f64>,
    /// The engine's terminal message, including a failure reason.
    pub message: Option<String>,
}

/// The state of one sequence for one video, derived from the engine's data and the files
/// on disk.
///
/// The order of this enum is not meaningful; a sequence moves between these states as the
/// data and the files change, and nothing stores it.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SequenceRunStatus {
    /// The sequence has not produced its data, or the data its prerequisites need is absent.
    NeverRun,
    /// An earlier attempt stopped before the source was covered, and the stored data is a
    /// valid prefix the next attempt resumes from. Scene Detector is the incremental case.
    Incomplete,
    /// The sequence's own data (or, for the encoder and concatenator, its files) is present.
    Complete,
    /// A live run is executing this sequence.
    Active,
    /// The last attempt failed, as recorded by the timeline.
    Failed,
    /// The sequence is not part of this video's chain.
    Skipped,
}

impl SequenceRunStatus {
    /// The stable wire value, used by logs and by tests that assert the contract.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NeverRun => "never_run",
            Self::Incomplete => "incomplete",
            Self::Complete => "complete",
            Self::Active => "active",
            Self::Failed => "failed",
            Self::Skipped => "skipped",
        }
    }
}

/// One sequence's state for one video.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SequenceState {
    /// The sequence id the run route accepts, for example `SceneDetector`.
    pub id: String,
    /// The engine's display name for the sequence.
    pub name: String,
    /// The derived state.
    pub status: SequenceRunStatus,
    /// Whether this sequence may run now, given the states above it.
    pub runnable: bool,
    /// Completion percentage: live while the sequence is `Active`, and the fraction a
    /// cancelled detection already covered while it is `Incomplete`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0.0, max = 100.0))]
    pub progress: Option<f64>,
    /// Short human-readable evidence for the state, for example `42/48 scenes encoded`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// One sequence this build can run, with the configuration section that drives it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SequenceDescriptor {
    /// The id the run route accepts, for example `SceneDetector`.
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// The engine configuration key that enables and configures it.
    pub section: String,
    /// The effective configuration for this sequence, or `null` when it is disabled.
    pub config: Value,
}

/// How a run ended, or whether it is still running.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunOutcome {
    /// The run holds the encode lock and has not produced a terminal event.
    Running,
    /// Every requested sequence finished.
    Completed,
    /// The user asked the run to stop.
    Cancelled,
    /// The runner or a sequence reported a failure.
    Failed,
    /// The log predates the run-level timeline record, so its outcome is unknown.
    Unknown,
}

/// One run of one video, as the log viewer's run selector lists it.
///
/// A run exists once its log directory does. The outcome comes from the timeline's
/// run-level record; a run that is still live has none yet.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RunSummary {
    /// The run id that addresses its log.
    pub run_id: String,
    /// UTC ISO-8601 instant the log was opened.
    pub started_at: String,
    /// UTC ISO-8601 instant of the terminal record, when there is one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    /// The run's terminal outcome, or `running` while it holds the lock.
    pub outcome: RunOutcome,
    /// The engine's terminal message, when it recorded one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
