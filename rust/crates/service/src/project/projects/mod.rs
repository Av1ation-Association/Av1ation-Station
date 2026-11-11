//! Persistence for the project list, and the summaries Home renders.
//!
//! A project is a directory under `<app-data>/projects/<id>/` holding one `project.json`.
//! Writes go through [`crate::platform::atomic`], which never creates the directory: only `create`
//! does, so a read racing a delete cannot resurrect a project. `index.json` is a rebuildable
//! cache, and it is validated against the directories before Home reads it, so a project
//! whose folder was removed outside the app is not listed. Opening a project records its
//! access time in memory, and the next mutation makes that durable.
//!
//! The project's configuration is persisted as the engine's own serialised defaults for
//! now. It is deliberately not part of the HTTP contract yet: the typed configuration model
//! (input defaults, output policy, sequence overrides) arrives with the configuration
//! resolver, and the file already carries the field it will occupy.

mod store;

use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use av1ation_contracts::project::{Project, ProjectDefaultsState, ProjectSummary};
use av1ation_contracts::protocol::{InputKind, OutputMode};
use av1ation_contracts::script::ScriptInputMode;
use av1ation_contracts::settings::{EffectiveConfig, GeneralDefaults};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The `project.json` schema this build writes and understands.
const SCHEMA_VERSION: u32 = 1;
/// The `index.json` schema, which is a cache shape rather than project data.
const INDEX_VERSION: u32 = 1;

/// Why a project operation failed. Routes map each variant to one error code.
#[derive(Debug)]
pub(crate) enum StoreError {
    /// Reading or writing the project directory failed.
    Io(String),
    /// The document is not a readable project. Retrying cannot fix it, so it is reported as
    /// an invalid resource rather than a server fault.
    Corrupt(String),
    /// The document was written by a newer build; it must not be partially applied.
    NewerSchema(u32),
    /// The request was rejected before any file was touched.
    Invalid(String),
    /// The configuration document itself is not valid for this engine.
    InvalidConfig(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message())
    }
}

impl StoreError {
    pub(crate) fn message(&self) -> String {
        match self {
            Self::Io(message)
            | Self::Invalid(message)
            | Self::InvalidConfig(message)
            | Self::Corrupt(message) => message.clone(),
            Self::NewerSchema(version) => format!(
                "This project was written by a newer version of Av1ation Station (schema {version})."
            ),
        }
    }

    pub(crate) fn hint(&self) -> Option<String> {
        match self {
            Self::NewerSchema(_) => {
                Some("Update the application, or create a new project instead.".to_owned())
            }
            Self::Corrupt(_) => Some(
                "Restore the project file from a backup, or delete this project and create it again."
                    .to_owned(),
            ),
            Self::InvalidConfig(_) => Some(
                "Reload the project configuration and change only the field you meant to edit."
                    .to_owned(),
            ),
            Self::Io(_) | Self::Invalid(_) => None,
        }
    }
}

/// The on-disk project document. Timestamps are epoch seconds so ordering and comparison
/// never depend on parsing a locale-sensitive string.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProjectRecord {
    schema_version: u32,
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    created_at: u64,
    accessed_at: u64,
    /// When the configuration last changed, epoch seconds. Advisory freshness only; it is
    /// never read to decide pipeline state.
    #[serde(default)]
    config_updated_at: Option<u64>,
    /// Opaque to this phase; the typed configuration model replaces it next.
    config: Value,
    /// Defaults for videos added from now on. Absent on documents written before the
    /// General defaults existed, which load as the native FFMS2 / next-to-input policy.
    #[serde(default)]
    general: GeneralDefaults,
}

/// The cache file Home reads. Losing it must never lose a project.
#[derive(Debug, Default, Serialize, Deserialize)]
struct ProjectIndex {
    schema_version: u32,
    projects: Vec<ProjectSummary>,
}

/// The project store behind one resolved app-data directory.
#[derive(Debug, Clone)]
pub(crate) struct ProjectStore {
    projects: PathBuf,
    index: PathBuf,
    /// Last time each project was opened in this process. A read must not write to disk, so
    /// the access time lives here and the next index rewrite makes it durable.
    accessed: Arc<Mutex<HashMap<String, u64>>>,
    /// Serialises a scan followed by its index write, so two mutations cannot interleave and
    /// lose each other's entry.
    index_lock: Arc<tokio::sync::Mutex<()>>,
}

async fn read_record(path: &Path) -> Result<Option<ProjectRecord>, StoreError> {
    let text = match tokio::fs::read_to_string(path).await {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_error("read the project", path, error)),
    };
    let value: Value = serde_json::from_str(&text).map_err(|error| {
        StoreError::Corrupt(format!("{} is not readable JSON: {error}", path.display()))
    })?;
    let version = value
        .get("schema_version")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;
    if version > SCHEMA_VERSION {
        return Err(StoreError::NewerSchema(version));
    }
    serde_json::from_value(value).map(Some).map_err(|error| {
        StoreError::Corrupt(format!(
            "{} is not a readable project: {error}",
            path.display()
        ))
    })
}

/// Replace a document through the service's one atomic-write policy. The directory must
/// already exist: this never creates one, so a racing or failed write cannot resurrect a
/// project directory.
async fn write_document<T: Serialize>(path: &Path, value: &T) -> Result<(), StoreError> {
    let rendered = serde_json::to_string_pretty(value)
        .map_err(|error| StoreError::Io(format!("could not render {}: {error}", path.display())))?;
    crate::platform::atomic::write(path, rendered.as_bytes())
        .await
        .map_err(|error| io_error("replace the project document", path, error))
}

fn io_error(action: &str, path: &Path, error: std::io::Error) -> StoreError {
    StoreError::Io(format!("could not {action} at {}: {error}", path.display()))
}

fn valid_name(name: &str) -> Result<String, StoreError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(StoreError::Invalid("A project needs a name.".to_owned()));
    }
    if trimmed.chars().count() > 120 {
        return Err(StoreError::Invalid(
            "A project name cannot exceed 120 characters.".to_owned(),
        ));
    }
    Ok(trimmed.to_owned())
}

fn valid_description(description: Option<&str>) -> Result<Option<String>, StoreError> {
    let Some(description) = description else {
        return Ok(None);
    };
    let trimmed = description.trim();
    if trimmed.chars().count() > 2_000 {
        return Err(StoreError::Invalid(
            "A project description cannot exceed 2000 characters.".to_owned(),
        ));
    }
    Ok((!trimmed.is_empty()).then(|| trimmed.to_owned()))
}

/// Reject ids that are not the UUIDs the store generates, so a request cannot address a
/// path outside `projects/` such as `../config`.
fn valid_id(id: &str) -> Result<(), StoreError> {
    let parsed = uuid::Uuid::parse_str(id)
        .map_err(|_| StoreError::Invalid("The project id is not a UUID.".to_owned()))?;
    if parsed.to_string() != id {
        return Err(StoreError::Invalid(
            "The project id is not a UUID.".to_owned(),
        ));
    }
    Ok(())
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn project_from(record: &ProjectRecord, accessed_at: u64) -> Project {
    let mut general = record.general.clone();
    seed_default_filters(&mut general);
    Project {
        id: record.id.clone(),
        name: record.name.clone(),
        description: record.description.clone(),
        created_at: iso8601(record.created_at),
        accessed_at: iso8601(accessed_at),
        general,
    }
}

/// Show the engine's default filters on a document written before filter arrays existed.
///
/// Both lists being empty means "use the engine default", which is the same conversion the
/// seeds describe; exposing the seeds makes the OutputFormat row editable instead of
/// invisible. An explicit non-empty list is never touched.
pub(crate) fn seed_default_filters(general: &mut GeneralDefaults) {
    if general.ffms2_filters.is_empty() && general.vapour_synth_filters.is_empty() {
        let seeded = GeneralDefaults::default();
        general.ffms2_filters = seeded.ffms2_filters;
        general.vapour_synth_filters = seeded.vapour_synth_filters;
    }
}

/// Check the one field a form cannot prove: a folder-backed output policy needs an
/// absolute, existing directory. Next-to-input clears any stale folder so the stored
/// document always matches what the screen shows.
pub(crate) fn validate_general(general: &GeneralDefaults) -> Result<GeneralDefaults, StoreError> {
    let mut general = general.clone();
    // Both filter lists are validated even when their kind is inactive: they are retained so
    // switching input kinds back and forth does not silently discard the user's edits.
    av1ation_engine::media::video::validate_ffms2_filters(&general.ffms2_filters)
        .map_err(StoreError::Invalid)?;
    av1ation_engine::media::video::validate_vapour_synth_filters(&general.vapour_synth_filters)
        .map_err(StoreError::Invalid)?;
    // Only the field the selected input kind actually uses survives, so a stale path from a
    // previous choice cannot be read later as though the current choice used it.
    match general.input_kind {
        InputKind::Ffms2 => {
            general.import_method = None;
            general.script = None;
            general.script_text = None;
            general.script_mode = None;
            general.index_file = match general.index_file.as_deref().map(str::trim) {
                Some(path) if !path.is_empty() => {
                    if !Path::new(path).is_absolute() {
                        return Err(StoreError::Invalid(
                            "The FFMS2 index path must be absolute.".to_owned(),
                        ));
                    }
                    Some(path.to_owned())
                }
                _ => None,
            };
        }
        InputKind::VapourSynth => {
            general.script = None;
            general.script_text = None;
            general.script_mode = None;
            general.index_file = None;
            general.import_method = Some(general.import_method.unwrap_or_default());
        }
        InputKind::VapourSynthScript => {
            general.import_method = None;
            general.index_file = None;
            // A document written before `script_mode` existed carries a path and no mode.
            let mode = general.script_mode.unwrap_or(ScriptInputMode::File);
            general.script_mode = Some(mode);
            match mode {
                ScriptInputMode::File => {
                    general.script_text = None;
                    let script = general.script.as_deref().map(str::trim).unwrap_or_default();
                    if script.is_empty() {
                        return Err(StoreError::Invalid(
                            "The script input needs a path to a .vpy file.".to_owned(),
                        ));
                    }
                    if !Path::new(script).is_absolute() {
                        return Err(StoreError::Invalid(
                            "The script path must be absolute.".to_owned(),
                        ));
                    }
                    if !Path::new(script).is_file() {
                        return Err(StoreError::Invalid(format!(
                            "No script exists at {script}."
                        )));
                    }
                    general.script = Some(script.to_owned());
                }
                ScriptInputMode::Text => {
                    general.script = None;
                    let text = general.script_text.as_deref().unwrap_or_default();
                    if text.trim().is_empty() {
                        return Err(StoreError::Invalid(
                            "The custom script is empty.".to_owned(),
                        ));
                    }
                    general.script_text = Some(text.to_owned());
                }
            }
        }
    }
    match general.output_mode {
        OutputMode::NextToInput => general.output_folder = None,
        OutputMode::Folder => {
            let folder = general
                .output_folder
                .as_deref()
                .map(str::trim)
                .unwrap_or_default();
            if folder.is_empty() {
                return Err(StoreError::Invalid(
                    "Specific-folder output needs a folder path.".to_owned(),
                ));
            }
            if !Path::new(folder).is_absolute() {
                return Err(StoreError::Invalid(
                    "The output folder must be an absolute path.".to_owned(),
                ));
            }
            if !Path::new(folder).is_dir() {
                return Err(StoreError::Invalid(format!(
                    "No folder exists at {folder}."
                )));
            }
            general.output_folder = Some(folder.to_owned());
        }
    }
    Ok(general)
}

fn summary_from(record: &ProjectRecord, directory: &Path, size_bytes: u64) -> ProjectSummary {
    ProjectSummary {
        id: record.id.clone(),
        name: record.name.clone(),
        path: directory.to_string_lossy().into_owned(),
        size_bytes,
        video_count: 0,
        completed_videos: 0,
        created_at: iso8601(record.created_at),
        accessed_at: iso8601(record.accessed_at),
    }
}

/// Format epoch seconds as the UTC ISO-8601 instant the contract requires.
///
/// A dependency is not worth pulling in for one calendar conversion, so the civil date is
/// derived directly from the Unix day count (Howard Hinnant's algorithm).
fn iso8601(epoch: u64) -> String {
    let days = (epoch / 86_400) as i64;
    let seconds = epoch % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        seconds / 3_600,
        (seconds % 3_600) / 60,
        seconds % 60
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_index + 2) / 5 + 1) as u32;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    } as u32;
    if month <= 2 {
        year += 1;
    }
    (year, month, day)
}

async fn directory_size(directory: &Path) -> u64 {
    let mut total = 0;
    let mut stack = vec![directory.to_path_buf()];
    while let Some(path) = stack.pop() {
        let Ok(mut entries) = tokio::fs::read_dir(&path).await else {
            continue;
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(file_type) = entry.file_type().await else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(entry.path());
            } else if let Ok(metadata) = entry.metadata().await {
                total += metadata.len();
            }
        }
    }
    total
}

/// The default configuration a new project starts from, as the engine's own JSON.
pub(crate) fn default_config() -> Value {
    av1ation_engine::default_project_config()
}

#[cfg(test)]
mod tests {
    use av1ation_contracts::protocol::InputKind;
    use serde_json::json;

    use super::*;

    fn temporary_dir() -> PathBuf {
        std::env::temp_dir().join(format!("av1ation-projects-{}", uuid::Uuid::new_v4()))
    }

    #[tokio::test]
    async fn a_created_project_can_be_listed_read_renamed_and_deleted() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);

        assert!(store.list().await.expect("empty list").is_empty());

        let created = store
            .create(
                "  First project  ",
                Some("A description"),
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");
        assert_eq!(created.name, "First project");
        assert_eq!(created.description.as_deref(), Some("A description"));
        assert!(iso_dates_are_well_formed(&created));

        let listed = store.list().await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.id);
        assert_eq!(listed[0].video_count, 0);

        let read = store.get(&created.id).await.expect("get").expect("present");
        assert_eq!(read.name, "First project");

        let renamed = store
            .update(&created.id, Some("Renamed"), Some(""))
            .await
            .expect("update")
            .expect("present");
        assert_eq!(renamed.name, "Renamed");
        assert_eq!(renamed.description, None);

        assert!(store.delete(&created.id).await.expect("delete"));
        assert!(!store.delete(&created.id).await.expect("delete twice"));
        assert!(store.list().await.expect("list").is_empty());

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_corrupt_index_is_rebuilt_from_the_project_documents() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);
        store
            .create(
                "Project",
                None,
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");

        tokio::fs::write(dir.join("index.json"), b"{ not json")
            .await
            .expect("corrupt the index");

        let listed = store.list().await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Project");

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_newer_project_document_is_refused_instead_of_partially_applied() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);
        let created = store
            .create(
                "Project",
                None,
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");

        let path = dir.join("projects").join(&created.id).join("project.json");
        let mut value: Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.expect("read"))
                .expect("json");
        value["schema_version"] = json!(SCHEMA_VERSION + 1);
        tokio::fs::write(&path, serde_json::to_string(&value).expect("render"))
            .await
            .expect("write");

        match store.get(&created.id).await {
            Err(StoreError::NewerSchema(version)) => {
                assert_eq!(version, SCHEMA_VERSION + 1);
            }
            other => panic!("expected a newer-schema refusal, got {other:?}"),
        }

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_path_like_id_is_rejected_before_touching_the_filesystem() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);

        assert!(matches!(
            store.get("../config").await,
            Err(StoreError::Invalid(_))
        ));
        assert!(matches!(
            store.delete("/etc").await,
            Err(StoreError::Invalid(_))
        ));
        assert!(matches!(
            store
                .create("", None, default_config(), GeneralDefaults::default())
                .await,
            Err(StoreError::Invalid(_))
        ));
        assert!(matches!(
            store
                .create(
                    &"a".repeat(121),
                    None,
                    default_config(),
                    GeneralDefaults::default()
                )
                .await,
            Err(StoreError::Invalid(_))
        ));
    }

    #[tokio::test]
    async fn a_read_does_not_rewrite_the_project_document() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);
        let created = store
            .create(
                "Project",
                None,
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");

        let path = dir.join("projects").join(&created.id).join("project.json");
        let mut value: Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.expect("read"))
                .expect("json");
        value["accessed_at"] = json!(1);
        tokio::fs::write(&path, serde_json::to_string_pretty(&value).expect("render"))
            .await
            .expect("write");

        let read = store.get(&created.id).await.expect("get").expect("present");
        assert_ne!(read.accessed_at, iso8601(1));

        let after: Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.expect("reread"))
                .expect("json");
        assert_eq!(
            after["accessed_at"],
            json!(1),
            "a read rewrote the document"
        );

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn the_list_does_not_serve_a_project_whose_directory_is_gone() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);
        let created = store
            .create(
                "Project",
                None,
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");
        assert_eq!(store.list().await.expect("list").len(), 1);

        tokio::fs::remove_dir_all(dir.join("projects").join(&created.id))
            .await
            .expect("remove by hand");
        assert!(store.list().await.expect("list").is_empty());
        assert!(store.get(&created.id).await.expect("get").is_none());

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn the_list_measures_the_size_instead_of_replaying_the_cache() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);
        let created = store
            .create(
                "Project",
                None,
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");
        let before = store.list().await.expect("list")[0].size_bytes;

        tokio::fs::write(
            dir.join("projects").join(&created.id).join("chunk.bin"),
            vec![0u8; 4096],
        )
        .await
        .expect("grow the project");

        let after = store.list().await.expect("list")[0].size_bytes;
        assert!(after >= before + 4096, "{before} -> {after}");

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_read_racing_a_delete_does_not_recreate_the_project() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);

        for _ in 0..20 {
            let created = store
                .create(
                    "Project",
                    None,
                    default_config(),
                    GeneralDefaults::default(),
                )
                .await
                .expect("create");
            let directory = dir.join("projects").join(&created.id);
            let reader = store.clone();
            let remover = store.clone();
            let read_id = created.id.clone();
            let delete_id = created.id.clone();

            tokio::join!(
                async move {
                    let _ = reader.get(&read_id).await;
                },
                async move {
                    let _ = remover.delete(&delete_id).await;
                }
            );

            assert!(
                !tokio::fs::try_exists(&directory).await.expect("probe"),
                "a read recreated a deleted project directory"
            );
        }

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn the_effective_config_reports_provenance_without_persisting_overrides() {
        use av1ation_contracts::settings::ValueSource;

        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);
        let created = store
            .create(
                "Project",
                None,
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");

        let resolved = store
            .config(&created.id, &BTreeMap::new())
            .await
            .expect("config")
            .expect("present");
        let minimum =
            &resolved.values["sequences.scene_detector.method.AVSceneChange.minimum_length"];
        assert_eq!(minimum.value, serde_json::json!(24));
        assert_eq!(minimum.source, ValueSource::Default);
        assert!(resolved.updated_at.is_some());

        let overrides = BTreeMap::from([(
            "sequences.parallel_encoder.workers".to_owned(),
            serde_json::json!(8),
        )]);
        let overridden = store
            .config(&created.id, &overrides)
            .await
            .expect("config")
            .expect("present");
        assert_eq!(
            overridden.values["sequences.parallel_encoder.workers"].value,
            serde_json::json!(8)
        );
        assert_eq!(
            overridden.values["sequences.parallel_encoder.workers"].source,
            ValueSource::Overridden
        );

        let after = store
            .config(&created.id, &BTreeMap::new())
            .await
            .expect("config")
            .expect("present");
        assert_eq!(
            after.values["sequences.parallel_encoder.workers"].source,
            ValueSource::Default,
            "a video override was persisted into the project"
        );

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn general_defaults_are_stored_and_validated() {
        let dir = temporary_dir();
        let store = ProjectStore::new(&dir);
        let created = store
            .create(
                "Defaults",
                None,
                default_config(),
                GeneralDefaults::default(),
            )
            .await
            .expect("create");
        assert_eq!(created.general, GeneralDefaults::default());

        let folder = dir.join("outputs");
        tokio::fs::create_dir_all(&folder)
            .await
            .expect("output folder");
        let general = GeneralDefaults {
            input_kind: InputKind::VapourSynth,
            output_mode: OutputMode::Folder,
            output_folder: Some(folder.to_string_lossy().into_owned()),
            import_method: Some(av1ation_contracts::script::VapourSynthImporter::BestSource),
            ..GeneralDefaults::default()
        };
        let updated = store
            .update_general(&created.id, &general)
            .await
            .expect("update")
            .expect("present");
        assert_eq!(updated.general, general);

        let read = store.get(&created.id).await.expect("get").expect("present");
        assert_eq!(read.general, general);

        let relative = GeneralDefaults {
            output_mode: OutputMode::Folder,
            output_folder: Some("outputs".to_owned()),
            ..GeneralDefaults::default()
        };
        assert!(matches!(
            store.update_general(&created.id, &relative).await,
            Err(StoreError::Invalid(_))
        ));

        let next_to_input = GeneralDefaults {
            output_mode: OutputMode::NextToInput,
            output_folder: Some(folder.to_string_lossy().into_owned()),
            ..GeneralDefaults::default()
        };
        let cleared = store
            .update_general(&created.id, &next_to_input)
            .await
            .expect("update")
            .expect("present");
        assert_eq!(cleared.general.output_folder, None);

        // A script input keeps its absolute path and drops the importer, which the script
        // chooses for itself.
        let script = dir.join("clip.vpy");
        tokio::fs::write(&script, "clip = None\n")
            .await
            .expect("script");
        let with_script = GeneralDefaults {
            input_kind: InputKind::VapourSynthScript,
            script: Some(script.to_string_lossy().into_owned()),
            import_method: Some(av1ation_contracts::script::VapourSynthImporter::Lsmash),
            ..GeneralDefaults::default()
        };
        let scripted = store
            .update_general(&created.id, &with_script)
            .await
            .expect("update")
            .expect("present");
        assert_eq!(scripted.general.script, with_script.script);
        assert_eq!(scripted.general.import_method, None);

        let missing_script = GeneralDefaults {
            input_kind: InputKind::VapourSynthScript,
            script: Some(dir.join("absent.vpy").to_string_lossy().into_owned()),
            ..GeneralDefaults::default()
        };
        assert!(matches!(
            store.update_general(&created.id, &missing_script).await,
            Err(StoreError::Invalid(_))
        ));

        // A custom script is stored as text and never confused with a file path.
        let with_text = GeneralDefaults {
            input_kind: InputKind::VapourSynthScript,
            script_mode: Some(av1ation_contracts::script::ScriptInputMode::Text),
            script_text: Some("clip = None\n".to_owned()),
            ..GeneralDefaults::default()
        };
        let text_script = store
            .update_general(&created.id, &with_text)
            .await
            .expect("update")
            .expect("present");
        assert_eq!(text_script.general.script, None);
        assert_eq!(
            text_script.general.script_text.as_deref(),
            Some("clip = None\n")
        );
        assert_eq!(
            text_script.general.script_mode,
            Some(av1ation_contracts::script::ScriptInputMode::Text)
        );

        // A filter entry the engine cannot decode is refused before it is stored.
        let bad_filter = GeneralDefaults {
            ffms2_filters: vec![serde_json::json!({"Crop": {}})],
            ..GeneralDefaults::default()
        };
        assert!(matches!(
            store.update_general(&created.id, &bad_filter).await,
            Err(StoreError::Invalid(_))
        ));

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    fn iso_dates_are_well_formed(project: &Project) -> bool {
        let created = &project.created_at;
        let accessed = &project.accessed_at;
        created.len() == 20
            && created.ends_with('Z')
            && accessed.len() == 20
            && created.starts_with("20")
    }

    #[test]
    fn the_civil_conversion_matches_known_instants() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso8601(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(iso8601(1_709_164_800), "2024-02-29T00:00:00Z");
    }
}
