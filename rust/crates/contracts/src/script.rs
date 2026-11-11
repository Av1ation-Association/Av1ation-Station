//! Script documents, checks, materialised data, and the language server.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The VapourSynth source plugin that imports a video into the decode graph.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VapourSynthImporter {
    /// FFmpegSource, which needs no index file of its own.
    Ffms2,
    /// BestSource, the engine's default and the fastest of the four for most sources.
    #[default]
    BestSource,
    /// L-SMASH-Works.
    Lsmash,
    /// DGDecodeNV, which needs the `dgindexnv` executable.
    Dgdecnv,
}

/// How a `vapour_synth_script` input supplies its script.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScriptInputMode {
    /// A `.vpy` file on disk, used as written.
    File,
    /// Script text stored in the project document.
    Text,
}

/// One VapourSynth plugin reference a run would use but the loaded core does not provide.
///
/// The namespace and the script section stay separate so the Video page can render the
/// plugin name beside the input that calls it, instead of asking the user to read it out of
/// a sentence.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VapourSynthPluginProblem {
    /// The script section that made the call, for example `Encoding`.
    pub context: String,
    /// The plugin namespace, for example `hqdn3d`.
    pub namespace: String,
    /// The function inside an installed namespace, when only that function is missing.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function: Option<String>,
    /// One sentence naming the section and what is missing.
    pub detail: String,
    /// What to install or remove to make the reference valid.
    pub remediation: String,
}

/// VapourSynth plugin problems a stored document would hit before a video is queued.
///
/// The rows are the same ones `VideoValidation` carries; this report exists because a
/// project or template has no video to validate. `error` is separate because a script whose
/// file cannot be read is a different failure from a plugin that is not installed, and
/// presenting it as a missing namespace would send the user looking for the wrong fix.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptPluginReport {
    /// References the scripts make that the loaded core does not provide.
    pub problems: Vec<VapourSynthPluginProblem>,
    /// Why the scripts could not be checked, when the stored document was unreadable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// How a script variable's value is meant to be read once Python receives it.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScriptDataFormat {
    /// A JSON document, readable with `json.loads`.
    Json,
    /// A decimal integer, readable with `int(value.decode())`.
    Number,
    /// Plain text, readable with `value.decode()`.
    Text,
}

/// One reserved variable the runner injects into a custom script, with its current value.
///
/// A large value is sent as a bounded preview so the state response stays small; `bytes`
/// still reports the full length and `truncated` says whether `value` is a prefix.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptDataKey {
    /// The exact VSScript variable name, for example `condor_scenes`.
    pub key: String,
    /// What the value contains, in the words the script editor shows.
    pub description: String,
    /// Where the runner derives the value, for example `condor.scenes`.
    pub source: String,
    /// How the value is read in Python.
    pub format: ScriptDataFormat,
    /// The value as the engine injects it; bounded when `truncated` is true.
    pub value: String,
    /// Whether `value` is a prefix of the injected string rather than the whole value.
    pub truncated: bool,
    /// Full length of the injected string in bytes.
    pub bytes: u64,
}

/// One script input and the reserved variables its next open will receive.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptData {
    /// Configuration path of the input, for example `input` or
    /// `sequences.parallel_encoder.input`.
    pub input: String,
    /// The sequence whose open will see these values; empty when no sequence is due.
    pub sequence: String,
    /// One row per reserved key, in the runner's insertion order.
    pub keys: Vec<ScriptDataKey>,
}

/// The generated sidecar module a custom script imports, and the stub the editor types against.
///
/// The runner writes `condor_data.py` into the scenes directory before every sequence, so the
/// module describes the scene table the graph is about to decode. The editor renders the same
/// module's stub, and one generator produces both strings: completion cannot describe a field
/// the module does not carry.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptGuide {
    /// File name of the module inside the scenes directory, `condor_data.py`.
    pub module_file: String,
    /// Type stub for that module, as `condor_data.pyi`.
    pub stub: String,
    /// The starting script a new custom input begins from.
    pub template: String,
    /// The reserved VSScript variables the runner injects beside the module.
    pub variables: Vec<ScriptDataKey>,
}

/// The Python language server the script editor can reach on this machine.
///
/// Completion is bundled with the application, so this is an enhancement rather than a
/// dependency: when nothing is installed the editor keeps its own tables and says so.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LanguageServerInfo {
    /// Whether a supported server was found.
    pub available: bool,
    /// Server family: `pyright`, `jedi`, or `pylsp`; empty when nothing was found.
    pub kind: String,
    /// What the editor shows, for example `Pyright 1.1.390`.
    pub label: String,
    /// The executable the bridge will spawn, for the user to inspect.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// Where the editor opens its documents, so imports resolve. Absent when no temporary
    /// workspace could be created.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
    /// The interpreter the editor points the server at: the saved setting, or the host's
    /// resolved `python` (system first, staged bundle last) when none is saved. Always
    /// naming it is what makes every server family analyse the same environment, instead of
    /// each falling back to a different guess.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interpreter: Option<String>,
    /// The version that interpreter reported, so the user can confirm the selection works.
    /// Absent when no interpreter was resolved, or when it did not answer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interpreter_version: Option<String>,
    /// Where that interpreter came from: `setting`, `path`, `virtual_env`, `conda_prefix`,
    /// `launcher`, or `bundled`. The row says so rather than presenting an automatic choice
    /// as one the user made.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interpreter_source: Option<String>,
    /// Why completion is bundled, when no server was found.
    pub detail: String,
}

/// Whether the service could evaluate a script.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScriptCheckStatus {
    /// The script evaluated and returned a clip.
    Valid,
    /// The script failed: a syntax error, a missing module, or a runtime exception.
    Invalid,
    /// This machine cannot evaluate a script, usually because VapourSynth is absent.
    Unavailable,
}

/// The clip a validated script returned.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ScriptClip {
    /// Decoded width in pixels.
    pub width: u32,
    /// Decoded height in pixels.
    pub height: u32,
    /// Frame count the script reported.
    pub frames: u64,
    /// Frames per second, as the script's output node reports it.
    pub fps: f64,
    /// Bit depth of the clip's pixel format.
    pub bit_depth: u32,
}

/// One script evaluation result.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ScriptCheck {
    /// The outcome.
    pub status: ScriptCheckStatus,
    /// The clip the script returned, present only for `Valid`.
    pub clip: Option<ScriptClip>,
    /// What happened, in the words the editor shows; the interpreter's own message on failure.
    pub detail: String,
}

/// A script to evaluate before it is saved.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptCheckRequest {
    /// The Python source, exactly as it would be stored.
    pub script: String,
    /// The source file the script should open, when the page knows one.
    ///
    /// A script is checked against the video the page is editing; the project template has
    /// no video, so it is absent there and a script that opens a file cannot be checked.
    #[serde(default)]
    pub video_path: Option<String>,
    /// The sequence document the page has open.
    ///
    /// A script reads it as `condor.sequence_config`, so the check has to receive the values
    /// the page would save rather than the engine defaults. Absent means the caller has no
    /// configuration to check against, and the defaults are used.
    #[serde(default)]
    pub sequence_config: Option<Value>,
}

/// Ask for a standalone `.vpy` built from one script input.
///
/// The page supplies the draft script, not the stored one, so the export is the text the
/// user is looking at. A project and video pair adds the persisted scene table and effective
/// sequence configuration; without them the template export carries an empty scene table and
/// the defaults, because a template belongs to no video.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptMaterialiseRequest {
    /// The Python source, exactly as the page would save it.
    pub script: String,
    /// The source file the exported script should open when the page knows one.
    #[serde(default)]
    pub video_path: Option<String>,
    /// The sequence document the page has open; absent uses the saved effective document.
    #[serde(default)]
    pub sequence_config: Option<Value>,
    /// The video whose scenes and scratch directory the export carries, when there is one.
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub video_id: Option<String>,
}

/// How one injected value is meant to be read in Python.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScriptValueFormat {
    /// A JSON document, readable with `json.loads`.
    Json,
    /// A decimal integer, readable with `int(value.decode())`.
    Number,
    /// Plain text, readable with `value.decode()`.
    Text,
}

/// One reserved variable as the materialised view lists it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptMaterialisedVariable {
    /// Exact VSScript variable name, for example `condor_scenes`.
    pub key: String,
    /// What the value contains, in the words the editor shows.
    pub description: String,
    /// How the value is read in Python.
    pub format: ScriptValueFormat,
    /// The exact string the exported file assigns.
    pub value: String,
}

/// A materialised `.vpy` and the values it was built with.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScriptMaterialised {
    /// Suggested download name, ending in `.vpy`.
    pub filename: String,
    /// The complete script. A video with generated data on this machine reads that data
    /// live; an export with nothing live to point at embeds the module and its document.
    pub source: String,
    /// The injected variables, in the order the runner sets them.
    pub variables: Vec<ScriptMaterialisedVariable>,
}
