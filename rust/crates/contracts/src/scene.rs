//! Scene lists and views, ranges, and the per-scene encoder detail.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Replace the machine-level TransNetV2 model path.
///
/// This is its own endpoint rather than a field on [`AppSettingsUpdate`] because it is
/// probe-validated: a path is written only after the service confirms the file exists, so
/// a settings write for theme or storage cannot clear or invent a model path.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SceneModelUpdate {
    /// Absolute path to the ONNX model, or `null` to search the engine's standard locations.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// One scene as the Scenes tab reads it.
///
/// The rail and the timeline render the same list, so every value is derived from the
/// engine checkpoint and the retained chunk directory rather than from a second scene
/// table. A scene whose bounds are malformed is still returned with a zero frame count so
/// the screen can mark it instead of silently dropping it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SceneView {
    /// Zero-based position in the engine's scene list, which is also the concatenation order.
    pub index: u32,
    /// First frame, inclusive.
    pub start_frame: u64,
    /// Last frame, exclusive.
    pub end_frame: u64,
    /// `end_frame - start_frame`; zero for an invalid or empty range.
    pub frame_count: u64,
    /// Whether a retained encoded chunk exists for this scene.
    pub encoded: bool,
    /// Bytes of the retained chunk, when one exists.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk_bytes: Option<u64>,
    /// The quantizer the last Target Quality pass chose, when a pass exists.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantizer: Option<f64>,
    /// Mean score of the last Target Quality pass, when that pass recorded scores.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    /// Measured noise for this scene, when Noise Detector has run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub noise: Option<f64>,
    /// Scale factor Noise Scaler chose for this scene, when it has run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub noise_scaler: Option<f64>,
    /// Encoder speed this scene currently carries, for the Speed Scaling chart.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    /// Mean Quality Check score for this scene, when the check has run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality_score: Option<f64>,
    /// Every Target Quality probe pass this scene recorded, in probe order.
    ///
    /// The flattened `quantizer` and `score` above are the final pass; a chart that compares
    /// passes needs the whole list, and the frame-score spread is reduced here so a scene's
    /// event never carries its per-frame arrays.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub passes: Vec<ScenePassView>,
    /// Wall-clock milliseconds Parallel Encoder spent on this scene's chunk, when it wrote one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encode_ms: Option<u64>,
    /// Human-readable encoder this scene will use, for example `SVT-AV1`.
    pub encoder_label: String,
    /// Whether this scene carries an encoder document different from the video's effective
    /// encoder. Every engine scene stores a complete encoder; this is the provenance flag,
    /// not a second copy of the document.
    pub encoder_custom: bool,
    /// The user's own key/value pairs for this scene.
    ///
    /// The engine's sequence data is typed, so it drops a field it does not know when it
    /// loads a checkpoint. These pairs are kept beside that document instead and merged
    /// into `sequence_data` when the runner builds a script's scene table; a script reads
    /// them as `condor_data.scenes[i].sequence_data.<key>` without the engine ever seeing
    /// a field it would discard.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub custom_data: BTreeMap<String, Value>,
    /// A fingerprint of the encoder document this scene encodes and previews with.
    ///
    /// The Encoded source renders a chunk from that document, so a chunk built before a
    /// settings change is a different picture. The player carries this value in its source
    /// URL: a change makes it a different request, the element is reopened instead of
    /// replaying the bytes it already holds, and the service rebuilds the chunk from the
    /// current document. Absent when the video has no resolved encoder at all.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoder_fingerprint: Option<String>,
}

/// One Target Quality probe pass for one scene.
///
/// The engine stores a pass as its quantizer, the per-frame metric scores, the probe
/// encode's bitrate, and two timestamps. A graph reads the distribution of those frame
/// scores rather than the frames themselves, so the projection keeps the mean and the
/// extremes; `frames` is how many scores the mean is over, which tells a subset probe from
/// a whole-scene one.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ScenePassView {
    /// Probe position, one-based, matching the `P1`–`Pn` the analytics screen labels.
    pub pass: u32,
    /// Quantizer this pass encoded at, when the pass recorded one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantizer: Option<f64>,
    /// Mean of the pass's frame scores, when the metric produced any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    /// Lowest frame score in the pass.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_min: Option<f64>,
    /// Highest frame score in the pass.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_max: Option<f64>,
    /// How many frame scores the mean is over; zero when the metric returned none.
    pub frames: u32,
    /// Probe encode bitrate in megabits per second, when the pass recorded one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<f64>,
    /// Wall-clock duration of the probe encode, from the pass timestamps.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

/// One scene's encoder document, for the sheet that edits a selection.
///
/// A scene's encoder is a complete engine document, not a sparse patch, so it is fetched
/// for one scene rather than embedded in a table that may carry thousands of them.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SceneEncoderDetail {
    /// The engine `Encoder` document this scene currently carries.
    pub encoder: Value,
}

/// Write one complete encoder document to the selected scenes.
///
/// The encoder is a section replacement: switching variants must not leave the previous
/// variant's options beside the new one.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SceneEncoderRequest {
    /// Scene indices in engine order.
    ///
    /// A scene that already carries `encoder` is left untouched, so it keeps its retained
    /// chunk. Duplicates are harmless; the empty list is rejected.
    pub scenes: Vec<u32>,
    /// The complete engine `Encoder` document to write.
    pub encoder: Value,
    /// Delete the retained chunks this write invalidates.
    ///
    /// A chunk was encoded with the document its scene carried before this write, so the
    /// sheet asks whether to delete it. Only a scene whose encoder actually changes is
    /// invalidated; a selected scene that already carries the document keeps its chunk.
    /// Keeping the choice in the same request is what stops the encoder and the chunks on
    /// disk from disagreeing about what the scene is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clear_chunks: Option<bool>,
}

/// Replace one scene's custom sequence data.
///
/// The map is the whole document for that scene, so removing a pair and saving the rest
/// is one request. Keys are Python identifiers because a script reads them as attributes;
/// a key that collides with an engine field is refused rather than allowed to shadow it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SceneDataRequest {
    /// Replacement pairs; an empty map clears the scene's custom data.
    pub values: BTreeMap<String, Value>,
}

/// Split the scene containing one frame, for the Scenes context menu and details panel.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SceneSplitRequest {
    /// First frame of the new right-hand scene; must be inside an existing scene.
    pub frame: u64,
}

/// Add a scene in a gap the current table does not cover.
///
/// The range is explicit rather than a frame: the UI knows the source length and the
/// neighbouring scene boundaries, so the service never guesses how far a manual scene runs.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SceneAddRequest {
    /// First frame, inclusive.
    pub start_frame: u64,
    /// Last frame, exclusive. Must be greater than `start_frame`.
    pub end_frame: u64,
}

/// Change one scene's boundaries from the Scenes details panel.
///
/// The range is not clamped to its neighbours: a narrowed range leaves a gap and a widened
/// one overlaps, and the validation strip reports both. Editing a boundary never silently
/// moves another scene.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SceneRangeRequest {
    /// First frame, inclusive.
    pub start_frame: u64,
    /// Last frame, exclusive. Must be greater than `start_frame`.
    pub end_frame: u64,
}

/// Act on an explicit scene selection, preserving the order the UI displays.
///
/// Merge requires adjacent scenes. A reset accepts any selection and deletes each scene's
/// retained chunk so the Parallel Encoder re-encodes only those scenes.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SceneSelectionRequest {
    /// Zero-based scene indices in engine order. Duplicates are harmless; empty is rejected.
    pub scenes: Vec<u32>,
}

/// The scene table one video's Scenes tab renders.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SceneList {
    /// The video this table describes.
    pub video_id: String,
    /// The end of the last scene, which is the span the timeline draws from frame zero.
    pub total_frames: u64,
    /// A fingerprint of the scene table a script receives.
    ///
    /// A script's decode can read each scene's `sequence_data` — its own pairs included —
    /// and change the picture for that range, so the table itself is part of what a
    /// preview renders. The player carries this value in its preview URLs and the service
    /// keys its preview cache by the same value, so a changed table opens a different
    /// request and decodes the window again instead of replaying the old bytes.
    pub scene_fingerprint: String,
    /// Scenes in the engine's order.
    pub scenes: Vec<SceneView>,
}
