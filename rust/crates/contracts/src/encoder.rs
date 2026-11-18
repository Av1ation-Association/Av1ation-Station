//! Encoder definitions, forks, parameters, preflight, tools and interpreters.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One dependency result in the preflight inventory.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PreflightCheck {
    /// Stable key, for example `vapoursynth` or `encoder:svt-av1`.
    pub id: String,
    /// Human-readable name for the dependency row.
    pub label: String,
    /// Capability group: `decode`, `encode`, `muxing`, `metric`, or `application`.
    pub capability: String,
    /// Whether the probe found and loaded the dependency.
    pub available: bool,
    /// Observed version, executable name, or the reason it is unavailable.
    pub detail: String,
    /// What the user can install or configure when `available` is false.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remediation: Option<String>,
    /// How the row entered the inventory: `custom` for a user-provided executable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    /// The saved executable path for a custom row.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// The provider this process is actually using, when the row has selectable sources.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_source: Option<String>,
    /// The provider choice saved for this capability, when the user made one.
    ///
    /// `None` is automatic selection. It travels beside `selected_source` so a screen can
    /// say whether a restart is pending without re-deriving the capability-to-key map
    /// that the service owns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub configured_source: Option<String>,
    /// Every source this row offers. Empty for a row with a single discovered provider.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub providers: Vec<PreflightProvider>,
    /// The VapourSynth plugin namespaces this row checked, when the dependency has them.
    ///
    /// A missing plugin narrows the filters a script can use without making the VapourSynth
    /// core itself unavailable, so it is reported beside the row rather than replacing it.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plugins: Vec<PreflightPlugin>,
}

/// One VapourSynth plugin namespace the dependency inventory checked.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PreflightPlugin {
    /// The namespace a script calls, for example `vszip`.
    pub namespace: String,
    /// Human-readable plugin name for the sub-list.
    pub label: String,
    /// Whether the loaded core exposes the namespace.
    pub available: bool,
    /// The plugin path when it loaded, or the reason it is absent.
    pub detail: String,
}

/// One source a dependency row can use, as the preflight inventory sees it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PreflightProvider {
    /// The release bundle or the machine's own installation: `bundled` or `system`.
    pub source: String,
    /// Whether this source was found and could be probed.
    pub available: bool,
    /// The observed version or path, or why the source is unavailable.
    pub detail: String,
    /// Whether the running process selected this source.
    pub active: bool,
    /// Whether this process could check the source. A bundled runtime and a system runtime
    /// cannot share one VSScript initialisation, so the inactive runtime is left unchecked
    /// until the application restarts with it selected.
    pub checked: bool,
}

/// One accepted custom executable saved in app settings.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CustomTool {
    /// Executable family, keyed by the engine encoder: `aom`, `svt-av1`, `rav1e`, `vpx`,
    /// `avm`, `x264`, `x265`, `vvenc`, or `ffmpeg` for muxing.
    pub kind: String,
    /// Absolute path to the executable.
    pub path: String,
}

/// Replace the machine-level Python interpreter the script editor's language server uses.
///
/// This is its own endpoint rather than a field on [`AppSettingsUpdate`] because it is
/// path-validated: a path is written only after the service confirms the file exists, so a
/// settings write for theme or storage cannot clear or invent an interpreter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PythonInterpreterUpdate {
    /// Absolute path to a Python interpreter, or `null` to let the server pick one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// Replace the source one capability uses.
///
/// The write is immediate, but VapourSynth takes effect only on the next start because
/// VSScript and its bundled Python initialise once per process. `null` removes the entry
/// and restores automatic selection.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ToolSourceUpdate {
    /// The capability id, for example `vapoursynth`.
    pub id: String,
    /// `bundled`, `system`, or `null` to choose automatically.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// The request to interrogate one user-provided executable.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CustomToolRequest {
    /// Executable family, keyed by the engine encoder: `aom`, `svt-av1`, `rav1e`, `vpx`,
    /// `avm`, `x264`, `x265`, `vvenc`, or `ffmpeg` for muxing.
    pub kind: String,
    /// Absolute path to the executable the user selected.
    pub path: String,
}

/// A saved build of a known encoder, with the parameters its own `--help` reports.
///
/// A fork is a catalogue entry, not a provider replacement: the user may keep SVT-AV1 on
/// `PATH` as the default and still add one or more custom SVT-AV1 builds. Selecting a fork
/// in a project writes its executable path into that project's engine encoder document, so
/// the engine runs exactly the binary the user chose.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncoderFork {
    /// Stable user-chosen slug, unique within the catalogue.
    pub id: String,
    /// Human-readable name shown in the encoder list.
    pub label: String,
    /// The engine encoder this build of: `aom`, `svt-av1`, `rav1e`, `vpx`, `avm`, `x264`,
    /// `x265`, or `vvenc`.
    pub base: String,
    /// Absolute path to the executable.
    pub executable: String,
    /// Version line observed by the probe, when it answered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Parameter descriptors parsed from `--help` or added by hand, keyed by canonical
    /// spelling. These become the initial options when the fork is selected.
    #[serde(default)]
    pub parameters: BTreeMap<ParameterKey, ParameterDescriptor>,
    /// Whether the user changed the parameter map after it was saved. A service restart
    /// re-probes an executable to refresh the map it parsed, but never replaces an edited
    /// one; saving a path or clearing the flag is what asks for a fresh probe.
    #[serde(default)]
    pub parameters_edited: bool,
}

/// The request to probe one executable against a known encoder family before saving it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct EncoderForkRequest {
    /// Display name; also the starting point for the slug.
    pub label: String,
    /// The engine encoder this build of.
    pub base: String,
    /// Absolute path to the executable.
    pub path: String,
}

/// Replace the editable fields of one saved fork. A missing field is left unchanged.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncoderForkUpdate {
    /// New display name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// New executable path; the service re-probes it before replacing the saved one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// Replacement parameter map. When absent, the saved map is kept.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parameters: Option<BTreeMap<ParameterKey, ParameterDescriptor>>,
}

/// User edits to one built-in encoder's descriptors.
///
/// The map is the complete set the user wants to see, and `removed` records the engine keys
/// that map no longer contains. Keeping both means an engine parameter added in a later
/// build still appears unless the user hid it, and a descriptor the user added survives a
/// restart.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncoderParameterOverride {
    /// Descriptors the user added or replaced, keyed by canonical CLI spelling.
    #[serde(default)]
    pub parameters: BTreeMap<ParameterKey, ParameterDescriptor>,
    /// Engine descriptors the user removed from the editor.
    #[serde(default)]
    pub removed: Vec<ParameterKey>,
}

/// The complete descriptor set an encoder editor submits.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncoderParametersUpdate {
    /// Every descriptor the encoder should offer, keyed by canonical CLI spelling.
    pub parameters: BTreeMap<ParameterKey, ParameterDescriptor>,
}

/// The result of probing one executable's help output, before anything is saved.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncoderForkProbe {
    /// Whether the executable ran and identified as the requested family.
    pub available: bool,
    /// Version line, when one was printed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Whatever the executable printed, truncated for a diagnostic block.
    pub detail: String,
    /// Parameters parsed from the help output, keyed by canonical spelling.
    #[serde(default)]
    pub parameters: BTreeMap<ParameterKey, ParameterDescriptor>,
}

/// The complete preflight inventory and its availability counts.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PreflightReport {
    /// One result per probe, in a stable order.
    pub checks: Vec<PreflightCheck>,
    /// Number of checks whose `available` flag is true.
    pub available_count: u32,
    /// Total number of checks in the report.
    pub total_count: u32,
}

/// The engine's own JSON Schemas for the two typed input filter lists.
///
/// The filter enums belong to the engine and change with its revision, so the application
/// asks for their schema at runtime instead of copying their fields into a hand-written form.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FilterSchemas {
    /// Native `Ffms2Filter` schema.
    pub ffms2: Value,
    /// `VapourSynthFilter` schema.
    pub vapour_synth: Value,
}

/// One encoder this build can offer, with the engine's own defaults.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncoderDescriptor {
    /// The engine's wire id, for example `svt-av1`.
    pub id: String,
    /// The engine encoder this entry drives. It equals `id` for a built-in and names the
    /// base encoder for a saved fork, so a picker can group builds of the same encoder.
    #[serde(default)]
    pub base: String,
    /// Human-readable name.
    pub label: String,
    /// The full engine `Encoder` document this build would start from.
    pub default: Value,
    /// Every parameter this encoder starts with, keyed by its canonical CLI spelling.
    pub parameters: BTreeMap<String, ParameterDescriptor>,
    /// Where the catalogue entry came from.
    #[serde(default)]
    pub source: DescriptorSource,
    /// The executable the probe observed, when one is available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
    /// The observed version or executable description, when a provider was found.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Whether the preflight inventory has a usable provider for this encoder.
    pub available: bool,
    /// Whether this entry is a saved fork rather than the engine's built-in encoder.
    #[serde(default)]
    pub fork: bool,
    /// Whether the descriptor set differs from the engine's definition because the user
    /// edited it. Resetting the entry restores the engine descriptors.
    #[serde(default)]
    pub overridden: bool,
}

/// The identity of one encoder parameter, as it is written on the command line.
///
/// Prefix is part of the identity: `--crf` and `-crf` are different spellings even when
/// both reach the same encoder. JSON object keys are strings, so the value serialises as the
/// canonical `"{prefix}{name}"` form and deserialises from that same string.
#[derive(
    Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq, PartialOrd, Ord, Hash,
)]
#[serde(transparent)]
pub struct ParameterKey(
    /// The canonical spelling, for example `--crf` or `-y`.
    #[schemars(length(min = 1), pattern("^-{0,2}[A-Za-z0-9][A-Za-z0-9._-]*$"))]
    pub String,
);

impl ParameterKey {
    /// Build the canonical key from its two halves.
    pub fn new(prefix: &str, name: &str) -> Self {
        Self(format!("{prefix}{name}"))
    }

    /// The canonical `"{prefix}{name}"` spelling.
    pub fn canonical(&self) -> &str {
        &self.0
    }
}

/// A value a parameter can carry.
///
/// It is untagged on the wire, so a choice is written as the literal `0`, `"2"`, or `true`
/// rather than a wrapper object. The enum exists so generated TypeScript and Zod describe
/// exactly these variants instead of `unknown`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(untagged)]
pub enum ParameterValue {
    /// An explicit null, for a parameter whose unset state is meaningful.
    Null,
    /// A boolean.
    Bool(bool),
    /// A number; integers are not a separate variant.
    Number(f64),
    /// Text.
    Text(String),
    /// A flat list of scalars, for a collection parameter. Nested lists are not a value a
    /// CLI parameter can carry, so the recursion stops here.
    List(Vec<ParameterScalar>),
}

/// One item of a [`ParameterValue::List`].
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(untagged)]
pub enum ParameterScalar {
    /// A boolean item.
    Bool(bool),
    /// A number item.
    Number(f64),
    /// A text item.
    Text(String),
}

/// How a parameter's key and value are joined into argv entries.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum Delimiter {
    /// Two argv entries: the key and the value are separate.
    Space,
    /// One argv entry: `--crf=22`.
    Joined(String),
}

/// The value type and all of its constraints for one parameter.
///
/// The kind is closed so an ill-typed constraint cannot be built. A `Flag` is a parameter
/// the engine emits when true and omits when false; a boolean spelled `0`/`1` by the CLI is
/// a two-value `Choice`, not a `Flag`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub enum ParameterKind {
    /// Boolean flag with no value.
    Flag,
    /// A number, optionally bounded.
    Number(NumberSpec),
    /// Text, optionally with a maximum length and a pattern.
    Text(TextSpec),
    /// One or more values from a fixed set.
    Choice(ChoiceSpec),
    /// A file or directory path.
    Path(PathSpec),
    /// A duration in the unit the encoder expects.
    Duration(DurationSpec),
    /// A list encoded into one delimited string.
    Collection(CollectionSpec),
}

/// Constraints on a number parameter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct NumberSpec {
    /// Whether the value must be an integer.
    pub integer: bool,
    /// Smallest accepted value, when one is known.
    pub min: Option<f64>,
    /// Largest accepted value, when one is known.
    pub max: Option<f64>,
    /// Increment the editor offers.
    pub step: Option<f64>,
    /// Unit shown beside the value, for example `kbps`.
    pub unit: Option<String>,
}

/// The well-known shape of a text value, when the encoder states one.
///
/// A format is evidence from the help text, not a guess: the editor validates the value and
/// the service still stores exactly what the encoder accepts.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum TextFormat {
    /// An email address.
    Email,
    /// An absolute or relative URL.
    Url,
    /// An ISO-8601 date or date-time.
    DateTime,
}

/// Constraints on a text parameter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TextSpec {
    /// Maximum character count.
    pub max_len: Option<u32>,
    /// Regular expression the whole value must match.
    pub pattern: Option<String>,
    /// Whether the editor should offer a multi-line field.
    pub multiline: bool,
    /// A well-known value shape the editor validates, when the encoder states one.
    pub format: Option<TextFormat>,
}

/// The value type a choice parameter's options carry.
///
/// A choice is not always text: an encoder that spells a mode as `0`, `1`, `2` still
/// wants "Main", "High", "Professional" in the editor, and the editor must know that
/// the value it stores is a number rather than the label it draws.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum ChoiceValueKind {
    /// Options are text values.
    Text,
    /// Options are numeric values with human labels.
    Number,
}

/// Constraints on a choice parameter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ChoiceSpec {
    /// Every accepted value, with the label the user reads.
    pub options: Vec<Choice>,
    /// Declared value type; absent on descriptors authored before the distinction,
    /// where the options themselves decide.
    pub value_kind: Option<ChoiceValueKind>,
    /// Whether more than one option may be selected.
    pub multiple: bool,
    /// Fewest selections accepted.
    pub min_selected: u32,
    /// Most selections accepted, when there is a limit.
    pub max_selected: Option<u32>,
}

/// One value of a choice parameter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Choice {
    /// What the encoder receives.
    pub value: ParameterValue,
    /// What the user reads.
    pub label: String,
    /// Optional explanation shown beside the label.
    pub description: Option<String>,
    /// Documentation link for this value.
    pub doc_link: Option<String>,
}

/// Constraints on a path parameter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PathSpec {
    /// Whether the path must be a directory.
    pub directory: bool,
    /// Suggested file extensions, without the leading dot.
    pub accept: Vec<String>,
}

/// The unit a duration parameter is expressed in.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum DurationUnit {
    /// Whole seconds.
    Seconds,
    /// Milliseconds.
    Milliseconds,
    /// Frame count.
    Frames,
}

/// Constraints on a duration parameter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DurationSpec {
    /// Unit the value is expressed in.
    pub unit: DurationUnit,
    /// Smallest accepted value, when one is known.
    pub min: Option<f64>,
    /// Largest accepted value, when one is known.
    pub max: Option<f64>,
}

/// Constraints on a collection parameter.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CollectionSpec {
    /// The kind of every item. A flag or a nested collection is not a value, so the item
    /// kind excludes both; that also keeps the schema acyclic.
    pub item: CollectionItemKind,
    /// Separator used to encode the list into one argument.
    pub separator: String,
    /// Fewest items accepted.
    pub min_items: u32,
    /// Most items accepted, when there is a limit.
    pub max_items: Option<u32>,
}

/// The value type of one collection item.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub enum CollectionItemKind {
    /// A number item.
    Number(NumberSpec),
    /// A text item.
    Text(TextSpec),
    /// A choice item.
    Choice(ChoiceSpec),
    /// A path item.
    Path(PathSpec),
    /// A duration item.
    Duration(DurationSpec),
}

/// How a parameter's value is presented, independently of its type and constraints.
///
/// A range does not determine a control: CRF is best edited with a slider because its useful
/// range is small, while an unbounded frame count needs a plain input. `Auto` lets the
/// renderer apply the documented rules.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq)]
pub enum Widget {
    /// Let the renderer choose from the kind and its constraints.
    #[default]
    Auto,
    /// A slider with optional marks.
    Slider {
        /// Increment the editor offers.
        step: Option<f64>,
        /// Labelled positions on the track.
        marks: Vec<Mark>,
    },
    /// A plain numeric field.
    NumberInput {
        /// Increment the editor offers.
        step: Option<f64>,
    },
    /// One control for single- and multi-select; cardinality lives in `ChoiceSpec`.
    ChoiceInput {
        /// How the options are drawn.
        presentation: ChoicePresentation,
    },
    /// A text field, optionally multi-line.
    TextInput {
        /// Placeholder shown while the field is empty.
        placeholder: Option<String>,
        /// Whether the field accepts newlines.
        multiline: bool,
    },
    /// A boolean flag; the parameter is emitted when true and omitted when false.
    Toggle,
    /// A two-state switch for a number whose only meaningful values are `0` and `1`.
    ///
    /// Unlike `Toggle`, the parameter carries a value, so the switch writes `1` or `0` and
    /// only clearing the option returns the encoder to its own default.
    Switch,
    /// A file or directory picker.
    PathPicker,
    /// A duration field with its unit.
    DurationInput,
    /// A collection editor.
    CollectionInput {
        /// How the items are drawn.
        presentation: CollectionPresentation,
    },
}

/// How a choice parameter's options are drawn.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum ChoicePresentation {
    /// Radio or segmented up to four options, a dropdown above that.
    Auto,
    /// Radio buttons.
    Radio,
    /// Segmented control.
    Segmented,
    /// Dropdown list.
    Dropdown,
}

/// How a collection parameter's items are drawn.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum CollectionPresentation {
    /// Removable chips.
    Chips,
    /// Values typed into one comma-separated field.
    CommaSeparated,
}

/// One labelled position on a slider.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Mark {
    /// Position on the slider.
    pub value: f64,
    /// Optional label at that position.
    pub label: Option<String>,
}

/// A validity rule that involves another parameter in the same definition.
///
/// A closed set rather than an expression language: Rust gets exhaustiveness and the
/// generated TypeScript gets a discriminated union. Only *set* parameters participate.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub enum ParameterRelation {
    /// This parameter is only valid when `other` is set to `equals`.
    Requires {
        /// The parameter this one depends on.
        other: ParameterKey,
        /// The value `other` must have.
        equals: ParameterValue,
        /// Message shown when the rule fails.
        message: String,
    },
    /// At least one of `others` must be set.
    AtLeastOneOf {
        /// The parameters any one of which satisfies the rule.
        others: Vec<ParameterKey>,
        /// Message shown when the rule fails.
        message: String,
    },
    /// This number must be at least the value of `other`.
    GreaterThanOrEqual {
        /// The parameter this one is compared with.
        other: ParameterKey,
        /// Message shown when the rule fails.
        message: String,
    },
    /// This number must be at most the value of `other`.
    LessThanOrEqual {
        /// The parameter this one is compared with.
        other: ParameterKey,
        /// Message shown when the rule fails.
        message: String,
    },
    /// This parameter and `other` may not both be set.
    MutuallyExclusive {
        /// The conflicting parameter.
        other: ParameterKey,
        /// Message shown when the rule fails.
        message: String,
    },
    /// This parameter and `other` must carry the same value when both are set.
    SameValue {
        /// The parameter whose value must match.
        other: ParameterKey,
        /// Message shown when the rule fails.
        message: String,
    },
}

/// One encoder parameter, derived from the engine's CLI parameter or authored by the user.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ParameterDescriptor {
    /// `Some(Space)` emits two argv entries, `Some(Joined(..))` emits one, and `None` is a
    /// boolean flag with no value.
    pub delimiter: Option<Delimiter>,
    /// Human-readable field label.
    pub label: String,
    /// Explanation shown beside the field.
    pub description: Option<String>,
    /// Documentation link for the parameter.
    pub doc_link: Option<String>,
    /// The value type and all of its constraints.
    pub kind: ParameterKind,
    /// Suggested initial value for a user who enables the parameter. It is not applied until
    /// the user sets the parameter.
    pub default: Option<ParameterValue>,
    /// The control the renderer draws.
    #[serde(default)]
    pub widget: Widget,
    /// Whether the field belongs behind the advanced disclosure.
    #[serde(default)]
    pub advanced: bool,
    /// Grouping shown in the parameter editor, for example `Quality`.
    pub group: Option<String>,
    /// Validity rules involving another parameter in the same definition.
    #[serde(default)]
    pub relations: Vec<ParameterRelation>,
}

/// Where a parameter definition came from.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum DescriptorSource {
    /// Shipped by the engine for a known encoder.
    #[default]
    Builtin,
    /// Parsed from the executable's help output at probe time.
    Probed,
    /// Authored by the user in `encoders/<id>.json`.
    Declared,
}

/// A complete encoder catalogue entry, which is also the shape of a user-authored encoder
/// file under `encoders/<id>.json`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncoderDefinition {
    /// The `$schema` the file points at; absent for built-in definitions.
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// User-chosen slug, for example `svt-av1-fork`.
    pub id: String,
    /// Human-readable name.
    pub display_name: String,
    /// Executable path, absolute or resolved on `PATH`.
    pub executable: String,
    /// Version reported by the executable, when it was probed.
    pub version: Option<String>,
    /// Catalogue only, keyed by canonical CLI spelling. A missing key means the encoder
    /// default; this map never carries one build's selection.
    pub parameters: BTreeMap<ParameterKey, ParameterDescriptor>,
    /// Where this definition came from.
    pub source: DescriptorSource,
}

/// One Python interpreter the machine can be pointed at.
///
/// The picker needs the same three facts the row states — path, version, and how the file
/// was found — because two installs can share a version and only the path tells them apart.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PythonInterpreter {
    /// Absolute path to the interpreter executable, as it will be forwarded to a server.
    pub path: String,
    /// The version it reported; absent when it did not answer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// How it was found: `setting`, `path`, `virtual_env`, `conda_prefix`, `launcher`, or
    /// `bundled`.
    pub source: String,
}

/// Every interpreter the service could confirm, for the Settings picker.
///
/// An empty list is a real answer: no `python` anywhere means there is nothing to pick, and
/// the row says so instead of offering a path that no longer exists.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PythonInterpreters {
    /// Confirmed interpreters, the saved setting first when it is one.
    pub interpreters: Vec<PythonInterpreter>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_parameter_key_round_trips_as_its_canonical_string() {
        let key = ParameterKey::new("--", "crf");
        assert_eq!(key.canonical(), "--crf");
        assert_eq!(serde_json::to_string(&key).expect("key json"), "\"--crf\"");
        let parsed: ParameterKey = serde_json::from_str("\"-y\"").expect("a bare key");
        assert_eq!(parsed.canonical(), "-y");
    }

    #[test]
    fn a_parameter_value_is_untagged() {
        assert_eq!(
            serde_json::from_str::<ParameterValue>("0").expect("a number"),
            ParameterValue::Number(0.0)
        );
        assert_eq!(
            serde_json::from_str::<ParameterValue>("\"ssim\"").expect("text"),
            ParameterValue::Text("ssim".to_owned())
        );
        assert_eq!(
            serde_json::from_str::<ParameterValue>("[1, 2]").expect("a list"),
            ParameterValue::List(vec![
                ParameterScalar::Number(1.0),
                ParameterScalar::Number(2.0),
            ])
        );
    }

    #[test]
    fn an_encoder_definition_accepts_the_schema_key_and_a_descriptor() {
        let file = json!({
            "$schema": "https://av1ation.app/schema/encoder/encoder-definition.schema.json",
            "id": "svt-av1-fork",
            "display_name": "SVT-AV1 (my fork)",
            "executable": "svt-av1-fork",
            "parameters": {
                "--crf": {
                    "delimiter": "Space",
                    "label": "CRF",
                    "kind": {
                        "Number": {
                            "integer": true, "min": 0, "max": 63,
                            "step": 1, "unit": null
                        }
                    },
                    "default": 35,
                    "widget": { "Slider": { "step": 1, "marks": [] } },
                    "group": "Quality"
                }
            },
            "source": "Declared"
        });

        let definition: EncoderDefinition =
            serde_json::from_value(file).expect("a readable encoder definition");
        assert_eq!(
            definition.schema.as_deref(),
            Some("https://av1ation.app/schema/encoder/encoder-definition.schema.json")
        );
        let descriptor = definition
            .parameters
            .get(&ParameterKey::new("--", "crf"))
            .expect("the CRF descriptor");
        assert_eq!(descriptor.delimiter, Some(Delimiter::Space));
        assert_eq!(
            descriptor.kind,
            ParameterKind::Number(NumberSpec {
                integer: true,
                min: Some(0.0),
                max: Some(63.0),
                step: Some(1.0),
                unit: None,
            })
        );
        assert_eq!(descriptor.default, Some(ParameterValue::Number(35.0)));
    }
}
