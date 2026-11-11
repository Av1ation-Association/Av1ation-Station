//! The queued source, its derived documents, concat inventory and thumbnails.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::encoder::PreflightCheck;
use crate::run::{SequenceState, TimelineRecord};
use crate::script::{ScriptData, VapourSynthPluginProblem};

/// One row in a project's video queue.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoSummary {
    /// Stable identifier, also the video document's file stem.
    pub id: String,
    /// Display name, defaulting to the input's file name.
    pub name: String,
    /// The source path the engine decodes.
    pub input_path: String,
    /// Where the concatenated output is written.
    pub output_path: String,
    /// Zero-based position in the project's queue.
    pub order: u32,
    /// Creation timestamp in UTC ISO-8601 form.
    pub created_at: String,
}

/// One video as its detail screen reads it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoDetail {
    /// Stable identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// The source path the engine decodes.
    pub input_path: String,
    /// Where the concatenated output is written.
    pub output_path: String,
    /// Zero-based position in the project's queue.
    pub order: u32,
    /// Creation timestamp in UTC ISO-8601 form.
    pub created_at: String,
    /// Whether the engine has produced a complete encode for this video.
    pub output_exists: bool,
    /// Bytes retained under this video's temporary directory, including scene chunks.
    pub retained_bytes: u64,
}

/// The input and output documents a video's General section owns.
///
/// These are the engine's own documents, not configuration leaves: the source path and the
/// exact output file belong to one queue entry, because a second video would collide with
/// them. A sequence override lives in `ConfigOverrides` instead.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct VideoGeneral {
    /// Engine `Input` JSON.
    pub input: Value,
    /// Engine `Output` JSON.
    pub output: Value,
    /// The file the video decodes when its input document names no path.
    ///
    /// A `VapourSynthScript` input is a program, not a file; the queued source is kept here
    /// so a script's `condor_data.video_path` still names the video it belongs to.
    pub source_path: String,
}

/// A whole-subtree replacement request for a video's General documents.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct VideoGeneralRequest {
    /// Engine `Input` JSON; its path must be absolute when it states one.
    pub input: Value,
    /// Engine `Output` JSON; its path must be an absolute file in an existing directory.
    pub output: Value,
    /// The queued source a script input is told to open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
}

/// One video's scratch directory and the space it occupies.
///
/// The directory is named by the video, not by the section, so two videos never share
/// chunks and deleting one cannot delete another's work.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoStorage {
    /// Absolute path of the video's scratch directory.
    pub directory: String,
    /// The scratch root this video would use with no of its own: the project default.
    pub inherited_directory: String,
    /// Whether `directory` comes from this video rather than the inherited root.
    pub custom: bool,
    /// Bytes retained there, including scene chunks, and the engine checkpoint's siblings.
    pub retained_bytes: u64,
    /// Free bytes on the volume that owns the directory, when it could be read.
    pub free_bytes: Option<u64>,
    /// Total bytes on that volume, when it could be read.
    pub total_bytes: Option<u64>,
}

/// Points one video's scratch work at its own directory, or back at the inherited root.
///
/// The move is refused while the video retains chunks: the parallel encoder records chunk
/// paths in its sidecars, so relocating the directory would leave those paths stale. The
/// user deletes retained work first, which is the same action that makes the move safe.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoStorageRequest {
    /// Absolute directory, or `None` to inherit the project's scratch root again.
    pub directory: Option<String>,
}

/// A video's execution history, oldest first.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct VideoHistory {
    pub entries: Vec<TimelineRecord>,
}

/// The source metadata probed from a video's decode graph.
///
/// Every field is what the decoder reported. A field the file did not carry is absent
/// rather than guessed, so the details screen can say `not signalled` honestly.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ClipDetails {
    /// Decoded width in pixels.
    pub width: u32,
    /// Decoded height in pixels.
    pub height: u32,
    /// Frame count the decoder reported.
    pub frame_count: u64,
    /// Frames per second, as the decode graph reports them.
    pub frame_rate: f64,
    /// Duration in seconds derived from the frame count and rate.
    pub duration_seconds: f64,
    /// The pixel format name the decoder reported.
    pub pixel_format: String,
    /// Bit depth of that format, when it has one.
    pub bit_depth: Option<u32>,
    /// Colour primaries, when the source signalled them.
    pub color_primaries: Option<String>,
    /// Transfer characteristic, when the source signalled it.
    pub color_transfer: Option<String>,
    /// Matrix coefficients, when the source signalled them.
    pub color_matrix: Option<String>,
    /// Colour range, when the source signalled it.
    pub color_range: Option<String>,
    /// Chroma sample location, when the source signalled it.
    pub chroma_location: Option<String>,
}

/// The optional input document a probe should open.
///
/// General's probe omits it and the service opens the video's own input. A sequence
/// override sends its own document, because the clip details belong to the graph that
/// override decodes, not to General's. An absent field keeps the older request shape
/// working: the client posts `{}` when it probes the video itself.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct VideoProbeRequest {
    /// Engine `Input` JSON; when absent, the video's General input.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<Value>,
}

/// One probe attempt.
///
/// A probe can fail for reasons the user can fix — a missing file, an absent VapourSynth,
/// or a script that raises — so the failure is data, not an HTTP error; the details screen
/// stays usable and shows the reason.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct VideoProbe {
    /// The clip, present only when the decode graph opened.
    pub clip: Option<ClipDetails>,
    /// What happened, in the words the details screen shows.
    pub detail: String,
}

/// One audio stream the preview can play.
///
/// The browser cannot switch a `<video>` element's audio track, and the engine's decoder
/// graph is not exposed to the page. The service therefore lists the container's audio
/// streams and serves a selected one as its own audio-only file.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AudioTrack {
    /// Zero-based index among audio streams, which is ffmpeg's `0:a:N` selector.
    pub index: u32,
    /// A complete label for the player's selector.
    pub label: String,
    /// ISO 639 language tag when the container carries one.
    pub language: Option<String>,
    /// Codec name as the container reports it, for example `aac` or `opus`.
    pub codec: Option<String>,
    /// Channel count when it can be read from the stream description.
    pub channels: Option<u32>,
    /// Whether the container marks this stream as the default.
    pub default: bool,
}

/// The audio streams of one media source.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AudioTrackList {
    /// Streams in container order. Empty means selection is unavailable, not that the video
    /// is silent: `detail` says why.
    pub tracks: Vec<AudioTrack>,
    /// What the player should say when the list is empty or incomplete.
    pub detail: String,
}

/// The muxer a concatenation inventory describes.
///
/// The two muxers number source streams in independent namespaces: mkvmerge uses the IDs
/// from `--identify`, FFmpeg uses the source stream index. A caller must never translate one
/// into the other.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConcatMethodName {
    /// Matroska-native muxing through `mkvmerge`.
    Mkvmerge,
    /// Remuxing through FFmpeg.
    Ffmpeg,
}

/// One concatenation source probe.
///
/// `path` is absent for the main input, which is the video's original source file. An extra
/// input sends its own path; it is not resolved from the video record.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ConcatInventoryRequest {
    /// The muxer whose own key namespace the inventory uses.
    pub method: ConcatMethodName,
    /// The file to inspect. `None` means the video's original source.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// What a selectable source stream carries.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConcatTrackKind {
    /// A picture stream; selectable only on an mkvmerge extra input.
    Video,
    /// A sound stream.
    Audio,
    /// A timed text stream.
    Subtitle,
}

/// One selectable source stream, keyed by the selected muxer's own identifier.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ConcatSourceTrack {
    /// mkvmerge track ID, or the FFmpeg source stream index. Never an ordinal.
    pub key: u32,
    /// The stream's role, which decides the engine track variant and its option fields.
    pub kind: ConcatTrackKind,
    /// A stable, human-readable row label derived from the probe.
    pub label: String,
    /// Codec name as the probe reports it.
    #[serde(default)]
    pub codec: Option<String>,
    /// ISO 639 language tag when the container carries one.
    #[serde(default)]
    pub language: Option<String>,
    /// The container's track title, when it has one.
    #[serde(default)]
    pub name: Option<String>,
    /// Channel count for an audio stream.
    #[serde(default)]
    pub channels: Option<u32>,
    /// Whether the container marks this stream as the default.
    pub default: bool,
    /// Whether the container marks this stream as forced.
    pub forced: bool,
}

/// One source attachment the selected muxer reports.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ConcatSourceAttachment {
    /// The muxer's attachment identifier. It shares a numeric namespace with track IDs for
    /// mkvmerge, which is why `selectable` is false there.
    pub key: u32,
    /// The file name the attachment carries.
    pub label: String,
    /// MIME type when the container records one.
    #[serde(default)]
    pub mime_type: Option<String>,
    /// Description when the container records one.
    #[serde(default)]
    pub description: Option<String>,
    /// Size in bytes when the probe reports it.
    #[serde(default)]
    pub size_bytes: Option<u64>,
    /// Whether the workbench may include or drop this attachment individually.
    pub selectable: bool,
}

/// Every stream a concatenation input carries, as the selected muxer numbers them.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ConcatInventory {
    /// The muxer this inventory came from.
    pub method: ConcatMethodName,
    /// Selectable source video, audio, and subtitle streams. Empty when the probe failed.
    pub tracks: Vec<ConcatSourceTrack>,
    /// Source attachments. Empty when the probe failed.
    pub attachments: Vec<ConcatSourceAttachment>,
    /// FFmpeg data streams, which are always copied and have no switch.
    pub data_stream_count: u32,
    /// Chapter count when the probe can report one; `None` means unknown, not zero.
    #[serde(default)]
    pub chapter_count: Option<u32>,
    /// Why the inventory is empty or partial, in language the screen can show.
    pub detail: String,
}

/// One chapter the source reports, as a read-only convenience beside the copy setting.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ConcatChapter {
    /// Zero-based position in the source's chapter list.
    pub index: u32,
    /// Chapter title when the source records one.
    #[serde(default)]
    pub title: Option<String>,
    /// Start time in seconds.
    pub start_seconds: f64,
    /// End time in seconds when the probe reports one.
    #[serde(default)]
    pub end_seconds: Option<f64>,
}

/// One global metadata tag the source reports, shown beside the copy setting.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ConcatMetadataEntry {
    /// Tag name exactly as FFmpeg prints it.
    pub key: String,
    /// Tag value exactly as FFmpeg prints it.
    pub value: String,
}

/// Chapters and global metadata from one source probe, read without changing the draft.
///
/// Both read-only sheets share this document so opening the second sheet does not start
/// a second media process.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ConcatSourceInfo {
    /// Chapters in source order. Empty when the probe failed or the source has none.
    pub chapters: Vec<ConcatChapter>,
    /// Global tags in source order. Empty when the probe failed or the file carries none.
    pub metadata: Vec<ConcatMetadataEntry>,
    /// Why the chapter list is empty, or how many chapters it carries.
    pub chapters_detail: String,
    /// Why the metadata list is empty, or how many fields it carries.
    pub metadata_detail: String,
}

/// The request that adds a video to a project's queue.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoCreateRequest {
    /// Absolute path to the source video.
    pub input_path: String,
    /// Absolute path the concatenated output is written to.
    ///
    /// When absent or empty, the service derives it from the project's General output
    /// policy. A client may still send an explicit path to override the default once.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    /// Optional display name; defaults to the input's file name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// A bulk removal, applied in one lock check and one write.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoRemoveRequest {
    /// The videos to remove. A partial failure leaves the queue unchanged.
    pub video_ids: Vec<String>,
}

/// The per-video preflight result: whether this video can start an encode right now.
///
/// A missing optional dependency removes only the capability it provides, so this is a
/// projection of the global inventory onto one video's paths and encoder, never a global
/// on/off switch.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoValidation {
    /// The video this validation describes.
    pub video_id: String,
    /// Whether every blocking check passed.
    pub can_encode: bool,
    /// Whether the source file the input names is readable.
    pub source_exists: bool,
    /// Whether the output's parent directory can be written.
    pub output_writable: bool,
    /// Whether the scratch directory for scene chunks can be written.
    pub scratch_writable: bool,
    /// Free bytes on the volume that owns the scratch directory, when it could be read.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temp_free_bytes: Option<u64>,
    /// Free bytes on the volume that owns the output directory, when it could be read.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_free_bytes: Option<u64>,
    /// Advisory space warnings, such as low free space or an unreadable volume.
    pub warnings: Vec<String>,
    /// The dependency rows relevant to this video, grouped by capability.
    pub checks: Vec<PreflightCheck>,
    /// VapourSynth plugin references the scripts would use that the loaded core lacks.
    pub plugin_problems: Vec<VapourSynthPluginProblem>,
    /// Human-readable reasons the run cannot start, empty when it can.
    pub blockers: Vec<String>,
}

/// The last run that failed, with the reason the engine reported.
///
/// A run can fail before its first sequence starts, so this is run history rather than a
/// sequence status: it is recorded in the timeline and never decides a pipeline phase.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoFailure {
    /// The engine's message; may contain a multi-line traceback.
    pub message: String,
    /// UTC ISO-8601 instant the failure was reported.
    pub at: String,
    /// The failed run's correlation id, so its log can be found.
    pub run_id: String,
    /// The sequence the failed run reached, or `None` when it failed before sequence 1.
    pub sequence: Option<String>,
}

/// How far the keyframe thumbnail cache has progressed for one video.
///
/// The build is a background job, so a client asks for the manifest instead of waiting on
/// the extraction. A thumbnail is only addressable while its index is below `available`;
/// the remaining indices fill in as files appear.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThumbnailState {
    /// The keyframe extraction is running and files may already be readable.
    Building,
    /// Every keyframe in the grid has been written.
    Ready,
    /// The extraction ran and failed; `detail` carries FFmpeg's reason.
    Failed,
    /// This video has no file FFmpeg can open, so there is no thumbnail grid.
    Unavailable,
}

/// The state and grid of a video's keyframe thumbnails.
///
/// The rail and the timeline derive an index from a scene's start frame and this grid, so
/// both surfaces read the same cached file rather than decoding a still per request. The
/// `revision` changes with the source and the grid; a client puts it in the image URL so a
/// re-pointed video cannot show the previous file from a browser cache.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ThumbnailManifest {
    /// Whether the extraction is building, complete, failed, or impossible.
    pub state: ThumbnailState,
    /// Cache revision for the source and grid, used to make image URLs immutable.
    pub revision: String,
    /// Seconds between two thumbnails, in milliseconds.
    pub interval_ms: u64,
    /// Width every thumbnail is scaled to; the height follows the source aspect ratio.
    pub width: u32,
    /// Number of thumbnails already written, from index zero.
    pub available: u32,
    /// A user-facing reason while building, failed, or unavailable; empty when ready.
    pub detail: String,
}

/// A video's derived pipeline state.
///
/// Every field is computed from the engine's stored data, the run progress, the files on
/// disk, and the run history. Nothing here is persisted, so it cannot disagree with the
/// encoder.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct VideoState {
    /// The video this state describes.
    pub video_id: String,
    /// Number of scenes the engine has detected, zero before scene detection.
    pub scene_count: u32,
    /// Every sequence this build can run, in pipeline order.
    pub sequences: Vec<SequenceState>,
    /// The sequences that may run right now, in pipeline order. More than one may be valid.
    pub next: Vec<String>,
    /// Whether an encode currently owns the singleton.
    pub active: bool,
    /// The active run's correlation id, when there is one.
    pub run_id: Option<String>,
    /// The latest run's failure, when the run after it has not completed or been cancelled.
    pub failure: Option<VideoFailure>,
    /// Whether the concatenated output exists and is non-empty.
    pub output_exists: bool,
    /// Bytes retained under this video's temporary directory.
    pub retained_bytes: u64,
    /// The reserved variables each script input will receive, in configuration order.
    /// Empty when this video has no VapourSynth-script input.
    pub script_data: Vec<ScriptData>,
}
