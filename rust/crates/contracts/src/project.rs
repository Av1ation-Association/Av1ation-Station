//! The project document, its summary, and the templates it starts from.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::settings::GeneralDefaults;

/// One row in the Home project list.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectSummary {
    /// Stable project identifier: a UUID v4 string, also the directory name.
    pub id: String,
    /// Human-readable project name.
    pub name: String,
    /// Filesystem path to the project directory.
    pub path: String,
    /// Total bytes occupied by the project and its temporary data.
    pub size_bytes: u64,
    /// Number of videos currently in the project queue.
    pub video_count: u32,
    /// Videos whose concatenated output exists and is non-empty, derived at read time.
    #[serde(default)]
    pub completed_videos: u32,
    /// Creation timestamp in UTC ISO-8601 form.
    pub created_at: String,
    /// Last-opened timestamp in UTC ISO-8601 form.
    pub accessed_at: String,
}

/// One project as the detail screen reads it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Project {
    /// Stable identifier, also the directory name under `projects/`.
    pub id: String,
    /// Human-readable project name.
    pub name: String,
    /// Optional free-form description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Creation timestamp in UTC ISO-8601 form.
    pub created_at: String,
    /// Last-opened timestamp in UTC ISO-8601 form.
    pub accessed_at: String,
    /// Defaults applied to videos added from now on.
    #[serde(default)]
    pub general: GeneralDefaults,
}

/// The request that creates a project. The normal UI sends only a name.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectCreateRequest {
    /// Display name; trimmed, and rejected when empty or longer than 120 characters.
    #[schemars(length(min = 1, max = 120))]
    pub name: String,
    /// Optional description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// The request that renames a project or replaces its description.
///
/// An absent field is left unchanged; an empty description clears it, because a patch
/// cannot otherwise distinguish "clear this" from "do not touch it".
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectUpdateRequest {
    /// New display name, validated like the create request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Replacement description; an empty string clears it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Why a configuration write makes a retained chunk stale.
///
/// The encoder document decides how a chunk was encoded; the Parallel Encoder input decides
/// which frames it encodes. A save that changes either invalidates the chunks it reaches.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChunkInvalidationReason {
    /// The encoder document changed.
    Encoder,
    /// The encoder's Parallel Encoder input changed.
    Input,
}

/// One encoded scene a project-level configuration write invalidates.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectChunkScene {
    /// Zero-based scene index within its video.
    pub index: u32,
    /// The retained chunk's size in bytes.
    pub chunk_bytes: u64,
}

/// The retained work a project-level configuration write invalidates.
///
/// A project's encoder and Parallel Encoder input are the base every video inherits, so one
/// save can invalidate chunks in videos the write never names. The impact is reported before
/// the write so the guard can ask whether to keep them, and recomputed by the write itself so
/// the answer and the documents land together.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectChunkImpact {
    /// Why the write invalidates chunks; `null` means it does not.
    pub reason: Option<ChunkInvalidationReason>,
    /// Videos with at least one invalidated scene.
    pub videos: u32,
    /// One entry per retained chunk the write invalidates, across every video.
    pub scenes: Vec<ProjectChunkScene>,
}

/// One named project template.
///
/// The configuration is materialised when the template is saved, so applying it needs no
/// engine default at read time and a later engine revision cannot change what a saved
/// template means. A project copies both documents and never references the template.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplate {
    /// Stable identifier; generated by the service, never reused.
    pub id: String,
    /// Display name, unique case-insensitively among templates.
    #[schemars(length(min = 1, max = 120))]
    pub name: String,
    /// The complete engine configuration a project copies.
    pub config: Value,
    /// The General defaults a project copies.
    pub general: GeneralDefaults,
    /// Last write, in UTC ISO-8601 form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// The discriminator a project-template file carries.
///
/// A file is one template, so the kind is explicit rather than inferred from its shape: a
/// project archive or an arbitrary JSON document must be refused with a message that names
/// the file as the wrong kind, not as a malformed template.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum ProjectTemplateArchiveKind {
    /// The only kind this build reads and writes.
    #[serde(rename = "av1ation.project-template")]
    ProjectTemplate,
}

/// The portable part of one template.
///
/// Host paths, the template id, and the default marker are deliberately absent: they belong
/// to the machine that exported the file, and an imported template is a new row rather than
/// a replacement for one that already exists.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateArchiveTemplate {
    /// Display name, validated and made unique on import.
    #[schemars(length(min = 1, max = 120))]
    pub name: String,
    /// The complete engine configuration.
    pub config: Value,
    /// The General defaults, with machine paths removed.
    pub general: GeneralDefaults,
}

/// One template in the portable JSON envelope used by export and import.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateArchive {
    /// File kind; a wrong value is a different file, not a malformed one.
    pub kind: ProjectTemplateArchiveKind,
    /// Envelope schema version, currently `1`.
    pub schema_version: u32,
    /// Export instant in UTC ISO-8601 form.
    pub exported_at: String,
    /// The template itself.
    pub template: ProjectTemplateArchiveTemplate,
}

/// What export removed so the file opens on another machine.
///
/// Labels only: a removed value is a host path, and echoing it into the response would put
/// the very data the export is removing back into the client and its logs.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateExportReport {
    /// Human-readable labels for values cleared from the archive, in a stable order.
    pub removed: Vec<String>,
    /// Whether the template carries an inline VapourSynth script.
    pub includes_scripts: bool,
    /// Whether the template carries script variables.
    pub includes_variables: bool,
}

/// One exported template plus the name and report the manager needs.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateExport {
    /// Suggested download name, `<slug>-template.json`.
    pub filename: String,
    /// The exact bytes to save as that file.
    pub archive: ProjectTemplateArchive,
    /// What the archive kept and what portability removed.
    pub report: ProjectTemplateExportReport,
}

/// The result of importing one template file.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateImportResult {
    /// The newly created template, with its unique name and generated id.
    pub template: ProjectTemplate,
    /// Labels for values the import sanitizer removed before saving.
    pub removed: Vec<String>,
}

/// Creates a template seeded from the engine defaults.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateCreateRequest {
    /// Display name; trimmed, unique, and rejected when empty or longer than 120 characters.
    #[schemars(length(min = 1, max = 120))]
    pub name: String,
}

/// Replaces a template's name, configuration, and General section in one write.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateUpdate {
    /// Display name, validated like the create request.
    #[schemars(length(min = 1, max = 120))]
    pub name: String,
    /// The complete engine configuration.
    pub config: Value,
    /// The General defaults.
    pub general: GeneralDefaults,
}

/// Marks one template as the one a new project copies.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateDefaultRequest {
    /// Template identifier, or `null` to leave new projects on the engine defaults.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// Applies one saved template to an existing project.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateApplyRequest {
    /// Template identifier, validated against the saved templates.
    pub template_id: String,
}

/// The two documents a template replaces on a project, kept together so undo restores
/// exactly what was there before.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectDefaultsState {
    /// The complete engine configuration.
    pub config: Value,
    /// The General defaults.
    pub general: GeneralDefaults,
}

/// The result of applying a template: the updated project and both sides of the change.
///
/// Returning the previous documents is what makes a single undo step possible without a
/// second read that could race another edit.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectTemplateApplied {
    /// The project after the write.
    pub project: Project,
    /// What the project held before the template was applied.
    pub previous: ProjectDefaultsState,
    /// The template's documents, which is what redo writes back.
    pub applied: ProjectDefaultsState,
}

/// One video inside a portable project archive.
///
/// The archive carries the engine's own input and output documents, the sparse overrides,
/// and the last checkpoint, but never the source media or the encoded chunks. Importing it
/// therefore reconstructs the queue without moving gigabytes, which is what a bug report
/// needs.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectArchiveVideo {
    /// Display name.
    pub name: String,
    /// Engine `Input` JSON.
    pub input: Value,
    /// Engine `Output` JSON.
    pub output: Value,
    /// Sparse configuration overrides, addressed by dotted leaf path.
    #[serde(default)]
    pub overrides: BTreeMap<String, Value>,
    /// The engine checkpoint at the time of export, when one exists.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condor: Option<Value>,
}

/// A portable project archive.
///
/// This is a JSON envelope rather than a zip: every field is already JSON, and a plain
/// document stays readable in a bug report without an extractor. Media and encoded chunks
/// are deliberately excluded; paths are retained so the queue can be inspected and
/// re-pointed after import.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProjectArchive {
    /// Archive schema version, currently `1`.
    pub schema_version: u32,
    /// Export instant in UTC ISO-8601 form.
    pub exported_at: String,
    /// Project display name.
    pub name: String,
    /// Optional project description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The project configuration document.
    pub config: Value,
    /// The queue, in order.
    pub videos: Vec<ProjectArchiveVideo>,
}
