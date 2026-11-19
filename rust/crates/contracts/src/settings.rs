//! The stored settings document and the configuration it feeds.

use std::borrow::Cow;
use std::collections::BTreeMap;

use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::encoder::{CustomTool, EncoderFork, EncoderParameterOverride};
use crate::project::ProjectTemplate;
use crate::protocol::{InputKind, OutputMode};
use crate::script::{ScriptInputMode, VapourSynthImporter};

/// Which scene and run facts the preview draws over the picture.
///
/// The overlay is a viewing preference, not project data: every host shares the same
/// settings document, and a scene's measured values come from the scene table. The
/// defaults are the useful compact set; the diagnostic fields stay opt-in.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
pub struct PreviewOverlaySettings {
    /// Whether the overlay is drawn at all.
    pub enabled: bool,
    /// The scene's Target Quality quantizer and probe score.
    pub target_quality: bool,
    /// The scene's Quality Check score.
    pub quality_check: bool,
    /// The scene's measured noise and scale.
    pub noise: bool,
    /// The retained chunk's size, when one exists.
    pub chunk: bool,
    /// The encoder label resolved for the scene.
    pub encoder: bool,
    /// The active sequence's stage name.
    pub live_stage: bool,
    /// The active sequence's percentage and phase.
    pub progress: bool,
    /// Frames or scenes per second, and the remaining-time estimate.
    pub fps_eta: bool,
}

impl Default for PreviewOverlaySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            target_quality: true,
            quality_check: true,
            noise: true,
            chunk: false,
            encoder: false,
            live_stage: true,
            progress: true,
            fps_eta: false,
        }
    }
}

/// Which run lifecycle points produce a desktop notification.
///
/// The service never sends operating-system notifications; the desktop host does, and only
/// while its window is in the background. Keeping the choices beside the other application
/// settings means a LAN browser can explain the disabled controls without inventing its own
/// preference document.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
pub struct NotificationSettings {
    /// Whether the desktop host may send any run notification.
    pub enabled: bool,
    /// The first sequence start for a run.
    pub started: bool,
    /// A run that reaches its normal end.
    pub finished: bool,
    /// A run that stops on an error.
    pub failed: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            started: true,
            finished: true,
            failed: true,
        }
    }
}

/// The app settings document shared by the desktop, LAN, and headless hosts.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AppSettings {
    /// Theme: `system`, `dark`, or `light`.
    pub theme: String,
    /// Row density: `comfortable` or `compact`.
    pub row_density: String,
    /// Reduce motion even when the operating system does not ask for it. `false` follows
    /// the OS preference, which is never overridden.
    pub reduce_motion: bool,
    /// The scene and run facts drawn over the preview.
    #[serde(default)]
    pub preview_overlay: PreviewOverlaySettings,
    /// Which run lifecycle events may produce a desktop notification.
    #[serde(default)]
    pub desktop_notifications: NotificationSettings,
    /// Temporary-directory override; `null` uses the app-data default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temp_dir: Option<String>,
    /// The TransNetV2 ONNX model this machine uses, or `null` to let the engine search its
    /// standard locations. One file serves every project, so this is an application
    /// setting rather than project configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene_model: Option<String>,
    /// The Python interpreter the script editor's language server analyses, or `null` to
    /// use the one the host resolves: an activated `VIRTUAL_ENV` or `CONDA_PREFIX`, then
    /// `python` on `PATH`, then the Windows launcher's installs, then the staged bundled
    /// runtime. Packages belong to an interpreter, so a venv is invisible to the server
    /// until this points at it; one interpreter serves every script, which makes it a
    /// machine setting rather than project configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub python_interpreter: Option<String>,
    /// Whether encoded chunks are deleted after a successful run.
    pub delete_chunks_on_success: bool,
    /// Every saved project template, in name order. A template is a complete configuration
    /// plus a General section; a project copies one at creation and then owns its copy.
    #[serde(default)]
    pub project_templates: Vec<ProjectTemplate>,
    /// The template a new project copies. `null` means no template is marked default, so a
    /// new project starts on the engine defaults.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_project_template_id: Option<String>,
    /// Accepted custom executables, re-probed when the service starts.
    pub custom_tools: Vec<CustomTool>,
    /// The source each capability uses: `bundled` or `system`. An absent key is automatic,
    /// which selects the bundle when it is present and healthy and the machine's install
    /// otherwise. VapourSynth is one compound id because its runtime, Python, and plugins
    /// must come from the same bundle.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub tool_sources: BTreeMap<String, String>,
    /// Saved encoder forks: a named build of a known encoder, with its own executable and
    /// parameter descriptors. A fork is an extra catalogue entry; it never replaces the
    /// provider another screen chooses.
    #[serde(default)]
    pub encoder_forks: Vec<EncoderFork>,
    /// User edits to the engine's built-in descriptors, keyed by encoder id. A fork keeps
    /// its own parameter map on the fork instead.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub encoder_overrides: BTreeMap<String, EncoderParameterOverride>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_owned(),
            row_density: "comfortable".to_owned(),
            reduce_motion: false,
            preview_overlay: PreviewOverlaySettings::default(),
            desktop_notifications: NotificationSettings::default(),
            project_templates: Vec::new(),
            default_project_template_id: None,
            temp_dir: None,
            scene_model: None,
            python_interpreter: None,
            delete_chunks_on_success: false,
            custom_tools: Vec::new(),
            tool_sources: BTreeMap::new(),
            encoder_forks: Vec::new(),
            encoder_overrides: BTreeMap::new(),
        }
    }
}

/// A merge-patch field that keeps its stored value when absent and replaces it when
/// present. A present `null` is invalid for a non-nullable field, which is why this is not
/// a plain `Option<T>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Patch<T>(Option<T>);

impl<T> Patch<T> {
    /// A field the request presents for replacement.
    pub fn present(value: T) -> Self {
        Self(Some(value))
    }

    /// The field's present value, or `None` when the request omits it.
    pub fn value(&self) -> Option<&T> {
        self.0.as_ref()
    }

    /// Whether serialization should omit this field.
    pub fn is_absent(&self) -> bool {
        self.0.is_none()
    }
}

impl<T> Default for Patch<T> {
    fn default() -> Self {
        Self(None)
    }
}

impl<T> From<T> for Patch<T> {
    fn from(value: T) -> Self {
        Self::present(value)
    }
}

impl<T: Serialize> Serialize for Patch<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Patch<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        T::deserialize(deserializer).map(Self::present)
    }
}

impl<T: JsonSchema> JsonSchema for Patch<T> {
    fn schema_name() -> Cow<'static, str> {
        T::schema_name()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        T::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

/// A merge-patch field that keeps its stored value when absent, clears a nullable field
/// when explicitly `null`, and replaces it when a value is present.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NullablePatch<T>(Option<Option<T>>);

impl<T> NullablePatch<T> {
    /// A field the request presents with a value.
    pub fn present(value: T) -> Self {
        Self(Some(Some(value)))
    }

    /// A field the request explicitly clears.
    pub fn null() -> Self {
        Self(Some(None))
    }

    /// The present patch value, or `None` when the request omits the field. The inner
    /// `Option` is the explicit `null` case.
    pub fn value(&self) -> Option<&Option<T>> {
        self.0.as_ref()
    }

    /// Whether serialization should omit this field.
    pub fn is_absent(&self) -> bool {
        self.0.is_none()
    }
}

impl<T> Default for NullablePatch<T> {
    fn default() -> Self {
        Self(None)
    }
}

impl<T> From<Option<T>> for NullablePatch<T> {
    fn from(value: Option<T>) -> Self {
        Self(Some(value))
    }
}

impl<T: Serialize> Serialize for NullablePatch<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for NullablePatch<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Option::<T>::deserialize(deserializer).map(Self::from)
    }
}

impl<T: JsonSchema> JsonSchema for NullablePatch<T> {
    fn schema_name() -> Cow<'static, str> {
        Option::<T>::schema_name()
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        Option::<T>::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

/// The writable fields of app settings as a merge patch. Custom tools have their own
/// probe-validated endpoints, so a settings write preserves them instead of bypassing that
/// probe. An absent field keeps its stored value; a present field replaces it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq, Default)]
#[serde(deny_unknown_fields)]
pub struct AppSettingsUpdate {
    /// Theme: `system`, `dark`, or `light`.
    #[serde(default, skip_serializing_if = "Patch::is_absent")]
    pub theme: Patch<String>,
    /// Row density: `comfortable` or `compact`.
    #[serde(default, skip_serializing_if = "Patch::is_absent")]
    pub row_density: Patch<String>,
    /// Reduce motion even when the operating system does not ask for it.
    #[serde(default, skip_serializing_if = "Patch::is_absent")]
    pub reduce_motion: Patch<bool>,
    /// The scene and run facts drawn over the preview.
    #[serde(default, skip_serializing_if = "Patch::is_absent")]
    pub preview_overlay: Patch<PreviewOverlaySettings>,
    /// Which run lifecycle events may produce a desktop notification.
    #[serde(default, skip_serializing_if = "Patch::is_absent")]
    pub desktop_notifications: Patch<NotificationSettings>,
    /// Temporary-directory override; `null` uses the app-data default.
    #[serde(default, skip_serializing_if = "NullablePatch::is_absent")]
    pub temp_dir: NullablePatch<String>,
    /// Whether encoded chunks are deleted after a successful run.
    #[serde(default, skip_serializing_if = "Patch::is_absent")]
    pub delete_chunks_on_success: Patch<bool>,
}

/// Project-level defaults applied to videos added from now on.
///
/// Existing queue entries keep the input and output they were created with. The defaults are
/// stored on the project rather than inferred at add time, so the LAN browser and the desktop
/// window add the same video from the same document.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct GeneralDefaults {
    /// Decode path for a newly added source.
    pub input_kind: InputKind,
    /// Where a newly added video's output path is derived.
    pub output_mode: OutputMode,
    /// Absolute folder used when `output_mode` is `folder`; absent otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_folder: Option<String>,
    /// Source plugin for the two VapourSynth input kinds. `None` means BestSource, the
    /// engine's default, so a project written before this field existed keeps its decode
    /// path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_method: Option<VapourSynthImporter>,
    /// Optional `.ffindex` path for the native FFMS2 input. `None` lets the engine place the
    /// index beside the source, which is what a machine without a prepared index expects.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index_file: Option<String>,
    /// How the script input is supplied. A document written before this field existed has
    /// `script` set and no mode, which is read as `file`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script_mode: Option<ScriptInputMode>,
    /// Absolute path to the `.vpy` file when `input_kind` is `vapour_synth_script` and
    /// `script_mode` is `file`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<String>,
    /// Inline VapourSynth script when `script_mode` is `text`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script_text: Option<String>,
    /// Native FFMS2 filters, kept as the engine's own typed JSON so the contract never
    /// mirrors an enum that changes with the engine revision.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ffms2_filters: Vec<Value>,
    /// VapourSynth filters, in the same engine-owned JSON form.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub vapour_synth_filters: Vec<Value>,
    /// Extra variables the script reads as `condor_<name>`.
    ///
    /// The runner injects its own reserved keys into the same map and replaces them on every
    /// open, so a document cannot change what the scene table, the paths, or the sequence
    /// configuration say.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub variables: BTreeMap<String, String>,
}

impl Default for GeneralDefaults {
    fn default() -> Self {
        Self {
            input_kind: InputKind::Ffms2,
            output_mode: OutputMode::NextToInput,
            output_folder: None,
            import_method: None,
            index_file: None,
            script_mode: None,
            script: None,
            script_text: None,
            // A new project starts on the same 10-bit conversion the engine builds, so the
            // filter is visible and editable instead of being an invisible constructor.
            ffms2_filters: vec![serde_json::json!({
                "OutputFormat": { "bit_depth": 10 }
            })],
            vapour_synth_filters: vec![serde_json::json!({
                "Resize": { "format": "YUV420P10LE" }
            })],
            variables: BTreeMap::new(),
        }
    }
}

/// The uniform error envelope returned by the service.
/// Where one resolved configuration leaf came from.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ValueSource {
    /// The engine's own default; neither the project nor the video set it.
    Default,
    /// The project sets it and the video does not override it.
    Inherited,
    /// The video sets it.
    Overridden,
}

/// One configuration leaf and the level it resolved from.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ResolvedValue {
    /// The effective value of this leaf.
    pub value: Value,
    /// Which level supplied the value.
    pub source: ValueSource,
}

/// Every configuration leaf with its provenance.
///
/// The map is keyed by a dotted path into the configuration document
/// (`sequences.target_quality.maximum_probes`). A leaf is any non-object value, so a list
/// is one leaf and replaces as a unit; an object is a section whose keys resolve
/// individually.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EffectiveConfig {
    /// Dotted leaf path to its effective value and source.
    pub values: BTreeMap<String, ResolvedValue>,
    /// When the project configuration was last written, in UTC ISO-8601 form.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Sparse, path-addressed configuration overrides owned by one video.
///
/// A missing path means "inherit the project value". The resolver accepts this type at
/// both project and video scope; a video document stores the same map.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ConfigOverrides {
    /// A missing path means "inherit from the project".
    pub fields: BTreeMap<String, Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_app_settings_patch_schema_lists_every_writable_field() {
        let schema = serde_json::to_value(schemars::schema_for!(AppSettingsUpdate))
            .expect("the patch schema serializes");
        let properties = schema["properties"]
            .as_object()
            .expect("the patch schema has properties");
        let mut keys: Vec<&str> = properties.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "delete_chunks_on_success",
                "desktop_notifications",
                "preview_overlay",
                "reduce_motion",
                "row_density",
                "temp_dir",
                "theme",
            ]
        );
        assert!(
            schema.get("required").is_none(),
            "every writable field is optional in a merge patch"
        );
    }
}
