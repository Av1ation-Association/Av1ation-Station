//! Persisted application settings owned by the service.
//!
//! The file is one JSON object so theme, storage, and accepted custom executables share a
//! document. Unknown keys are preserved when this phase writes, so a later settings pass
//! cannot lose data written by an earlier one.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use av1ation_contracts::encoder::{CustomTool, EncoderFork, EncoderParameterOverride};
use av1ation_contracts::project::ProjectTemplate;
use av1ation_contracts::settings::{AppSettings, AppSettingsUpdate, GeneralDefaults};
use serde_json::{Value, json};
use tokio::sync::Mutex;

/// The settings file behind a resolved app-data directory.
#[derive(Debug, Clone)]
pub(crate) struct SettingsStore {
    path: PathBuf,
    /// One writer at a time: every change is a read-modify-write of one document, so two
    /// concurrent writes must not lose each other's fields. Async because the lock is held
    /// across the file operations, which yield.
    write_lock: Arc<Mutex<()>>,
}

impl SettingsStore {
    pub(crate) fn new(data_dir: impl AsRef<Path>) -> Self {
        Self {
            path: data_dir.as_ref().join("config.json"),
            write_lock: Arc::new(Mutex::new(())),
        }
    }

    /// Read the settings document. A missing or malformed file falls back to defaults so a
    /// bad file cannot prevent the service from starting.
    pub(crate) async fn load(&self) -> AppSettings {
        let text = match tokio::fs::read_to_string(&self.path).await {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return AppSettings::default();
            }
            Err(error) => {
                tracing::warn!(path = %self.path.display(), %error, "settings could not be read");
                return AppSettings::default();
            }
        };
        let value: Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(path = %self.path.display(), %error, "settings are not valid JSON");
                return AppSettings::default();
            }
        };

        AppSettings {
            theme: value
                .get("theme")
                .and_then(Value::as_str)
                .filter(|theme| !theme.is_empty())
                .unwrap_or("system")
                .to_owned(),
            row_density: value
                .get("row_density")
                .and_then(Value::as_str)
                .filter(|density| *density == "comfortable" || *density == "compact")
                .unwrap_or("comfortable")
                .to_owned(),
            reduce_motion: value
                .get("reduce_motion")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            // A path that is not absolute would silently resolve against the service's
            // working directory. Ignore such a file rather than put chunks somewhere the
            // user did not choose; the settings route rejects it on the next write.
            temp_dir: value
                .get("temp_dir")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|path| Path::new(path).is_absolute())
                .map(str::to_owned),
            // A relative path would resolve against the service's working directory. The
            // file may be on a drive that is not mounted right now, so a missing absolute
            // path is kept and reported instead of silently dropped.
            scene_model: value
                .get("scene_model")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|path| Path::new(path).is_absolute())
                .map(str::to_owned),
            // The interpreter may be inside a venv that is not mounted right now, so a
            // missing absolute path is kept and reported rather than silently dropped.
            python_interpreter: value
                .get("python_interpreter")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|path| Path::new(path).is_absolute())
                .map(str::to_owned),
            delete_chunks_on_success: value
                .get("delete_chunks_on_success")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            project_templates: load_templates(&value),
            default_project_template_id: default_template_id(&value),
            custom_tools: value
                .get("custom_tools")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| serde_json::from_value::<CustomTool>(item.clone()).ok())
                        .collect()
                })
                .unwrap_or_default(),
            // A source this build does not understand is dropped from the in-memory map
            // rather than half-applied; the file keeps it for the build that wrote it.
            tool_sources: value
                .get("tool_sources")
                .and_then(Value::as_object)
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(|(id, source)| {
                            source
                                .as_str()
                                .filter(|source| matches!(*source, "bundled" | "system"))
                                .map(|source| (id.clone(), source.to_owned()))
                        })
                        .collect()
                })
                .unwrap_or_default(),
            // A fork this build cannot parse is dropped from the catalogue rather than
            // half-loaded; the file keeps it for the build that wrote it.
            encoder_forks: value
                .get("encoder_forks")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| serde_json::from_value::<EncoderFork>(item.clone()).ok())
                        .collect()
                })
                .unwrap_or_default(),
            encoder_overrides: value
                .get("encoder_overrides")
                .and_then(Value::as_object)
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(|(id, override_document)| {
                            serde_json::from_value::<EncoderParameterOverride>(
                                override_document.clone(),
                            )
                            .ok()
                            .map(|document| (id.clone(), document))
                        })
                        .collect()
                })
                .unwrap_or_default(),
        }
    }

    /// Replace only the settings fields present in the patch and return the resulting
    /// document. Custom tools are preserved because they are changed through the
    /// probe-validated endpoints.
    pub(crate) async fn update(&self, update: &AppSettingsUpdate) -> Result<AppSettings, String> {
        self.write(|settings| {
            let before = settings.clone();
            apply_update(settings, update);
            Ok((settings.clone(), *settings != before))
        })
        .await
    }

    /// The one read-modify-write path for `config.json`.
    ///
    /// Every settings writer acquires `write_lock` here, loads the document, applies its
    /// change, and saves only when the change reports a modification. Keeping this in one
    /// place is what makes two concurrent writers preserve each other's fields, including
    /// writers owned by routes other than the general settings patch.
    async fn write<T>(
        &self,
        change: impl FnOnce(&mut AppSettings) -> Result<(T, bool), String>,
    ) -> Result<T, String> {
        let _guard = self.write_lock.lock().await;
        let mut settings = self.load().await;
        let (result, modified) = change(&mut settings)?;
        if modified {
            self.save(&settings).await?;
        }
        Ok(result)
    }

    /// Add one template seeded from the engine defaults. Names are unique without regard
    /// to case so two rows cannot look identical in the manager.
    pub(crate) async fn add_template(&self, name: &str) -> Result<ProjectTemplate, String> {
        let name = valid_template_name(name)?;
        self.write(|settings| {
            if settings
                .project_templates
                .iter()
                .any(|template| template.name.eq_ignore_ascii_case(&name))
            {
                return Err(format!("A template named `{name}` already exists."));
            }
            let mut general = GeneralDefaults::default();
            crate::project::projects::seed_default_filters(&mut general);
            let template = ProjectTemplate {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                config: crate::project::projects::default_config(),
                general,
                updated_at: Some(crate::project::videos::iso8601(
                    crate::project::videos::now_epoch(),
                )),
            };
            settings.project_templates.push(template.clone());
            sort_templates(&mut settings.project_templates);
            if settings.default_project_template_id.is_none() {
                settings.default_project_template_id = Some(template.id.clone());
            }
            Ok((template, true))
        })
        .await
    }

    /// Seed the one starter template into a data directory that has no settings file.
    ///
    /// A file that already exists is never changed, even when its template list is empty:
    /// that is a user's choice, not a fresh install. The existence check and the write share
    /// the settings lock, so two hosts cannot seed duplicates.
    pub(crate) async fn seed_starter_template(&self) -> Result<Option<ProjectTemplate>, String> {
        let _guard = self.write_lock.lock().await;
        match tokio::fs::metadata(&self.path).await {
            Ok(_) => return Ok(None),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "could not inspect {} before seeding it: {error}",
                    self.path.display()
                ));
            }
        }
        let template = crate::project::starter::project_template()?;
        let mut settings = AppSettings::default();
        settings.project_templates.push(template.clone());
        self.save(&settings).await?;
        Ok(Some(template))
    }

    /// Replace one template's name, configuration, and General section. `Ok(None)` means
    /// no template has that id.
    pub(crate) async fn update_template(
        &self,
        id: &str,
        name: &str,
        config: Value,
        general: GeneralDefaults,
    ) -> Result<Option<ProjectTemplate>, String> {
        let name = valid_template_name(name)?;
        self.write(|settings| {
            if settings
                .project_templates
                .iter()
                .any(|template| template.id != id && template.name.eq_ignore_ascii_case(&name))
            {
                return Err(format!("A template named `{name}` already exists."));
            }
            let Some(template) = settings
                .project_templates
                .iter_mut()
                .find(|template| template.id == id)
            else {
                return Ok((None, false));
            };
            template.name = name;
            template.config = config;
            template.general = general;
            template.updated_at = Some(crate::project::videos::iso8601(
                crate::project::videos::now_epoch(),
            ));
            let updated = template.clone();
            sort_templates(&mut settings.project_templates);
            Ok((Some(updated), true))
        })
        .await
    }

    /// Replace only the engine configuration of one template, leaving its name and General
    /// section alone. Section resets use this so they cannot discard the other document.
    pub(crate) async fn set_template_config(
        &self,
        id: &str,
        config: Value,
    ) -> Result<Option<ProjectTemplate>, String> {
        self.write(|settings| {
            let Some(template) = settings
                .project_templates
                .iter_mut()
                .find(|template| template.id == id)
            else {
                return Ok((None, false));
            };
            template.config = config;
            template.updated_at = Some(crate::project::videos::iso8601(
                crate::project::videos::now_epoch(),
            ));
            Ok((Some(template.clone()), true))
        })
        .await
    }

    /// Replace only the General section of one template.
    pub(crate) async fn set_template_general(
        &self,
        id: &str,
        general: GeneralDefaults,
    ) -> Result<Option<ProjectTemplate>, String> {
        self.write(|settings| {
            let Some(template) = settings
                .project_templates
                .iter_mut()
                .find(|template| template.id == id)
            else {
                return Ok((None, false));
            };
            template.general = general;
            template.updated_at = Some(crate::project::videos::iso8601(
                crate::project::videos::now_epoch(),
            ));
            Ok((Some(template.clone()), true))
        })
        .await
    }

    /// Remove one template. Removing the default promotes the first remaining template so
    /// the next project still has a marked starting point; removing the last leaves new
    /// projects on the engine defaults.
    pub(crate) async fn delete_template(&self, id: &str) -> Result<bool, String> {
        self.write(|settings| {
            let before = settings.project_templates.len();
            settings
                .project_templates
                .retain(|template| template.id != id);
            if settings.project_templates.len() == before {
                return Ok((false, false));
            }
            if settings.default_project_template_id.as_deref() == Some(id) {
                settings.default_project_template_id = settings
                    .project_templates
                    .first()
                    .map(|template| template.id.clone());
            }
            Ok((true, true))
        })
        .await
    }

    /// Mark one template as the one new projects copy. `None` clears the mark.
    pub(crate) async fn set_default_template(
        &self,
        id: Option<&str>,
    ) -> Result<AppSettings, String> {
        self.write(|settings| {
            if let Some(id) = id
                && !settings
                    .project_templates
                    .iter()
                    .any(|template| template.id == id)
            {
                return Err(format!("No project template matches {id}"));
            }
            settings.default_project_template_id = id.map(str::to_owned);
            Ok((settings.clone(), true))
        })
        .await
    }

    /// Replace the machine-level TransNetV2 model path. The route has already checked
    /// that the file exists; this method owns only persistence, like the custom-tool store.
    pub(crate) async fn set_scene_model(
        &self,
        path: Option<String>,
    ) -> Result<AppSettings, String> {
        self.write(|settings| {
            settings.scene_model = path;
            Ok((settings.clone(), true))
        })
        .await
    }

    /// Replace the interpreter the script editor's language server analyses. The route has
    /// already checked that the file exists; this method owns only persistence.
    pub(crate) async fn set_python_interpreter(
        &self,
        path: Option<String>,
    ) -> Result<AppSettings, String> {
        self.write(|settings| {
            settings.python_interpreter = path;
            Ok((settings.clone(), true))
        })
        .await
    }

    /// Replace one capability's provider choice, or remove it to restore automatic
    /// selection. The route validates the id and source before this runs.
    pub(crate) async fn set_tool_source(
        &self,
        id: &str,
        source: Option<String>,
    ) -> Result<AppSettings, String> {
        self.write(|settings| {
            match source {
                Some(source) => {
                    settings.tool_sources.insert(id.to_owned(), source);
                }
                None => {
                    settings.tool_sources.remove(id);
                }
            }
            Ok((settings.clone(), true))
        })
        .await
    }

    /// The saved custom executables, read by the restart path's tests.
    #[cfg(test)]
    pub(crate) async fn load_custom_tools(&self) -> Vec<CustomTool> {
        self.load().await.custom_tools
    }

    /// Replace one saved fork, or remove it when `fork` is `None`. Entries this build does
    /// not parse are preserved by the whole-document write.
    pub(crate) async fn set_encoder_fork(
        &self,
        id: &str,
        fork: Option<EncoderFork>,
    ) -> Result<AppSettings, String> {
        self.write(|settings| {
            settings.encoder_forks.retain(|existing| existing.id != id);
            if let Some(fork) = fork {
                settings.encoder_forks.push(fork);
            }
            settings
                .encoder_forks
                .sort_by(|left, right| left.id.cmp(&right.id));
            Ok((settings.clone(), true))
        })
        .await
    }

    /// Replace the user's descriptor edits for one built-in encoder, or clear them when
    /// `override_document` is `None`. The route validates every key and resolves the engine
    /// keys this set no longer covers; this method only owns persistence.
    pub(crate) async fn set_encoder_override(
        &self,
        id: &str,
        override_document: Option<EncoderParameterOverride>,
    ) -> Result<AppSettings, String> {
        self.write(|settings| {
            match override_document {
                Some(document) => {
                    settings.encoder_overrides.insert(id.to_owned(), document);
                }
                None => {
                    settings.encoder_overrides.remove(id);
                }
            }
            Ok((settings.clone(), true))
        })
        .await
    }

    /// Add, replace, or remove one custom executable by family, preserving every entry this
    /// build does not know about. Rewriting the whole list from memory would delete a tool
    /// another build saved, or one whose family this build cannot parse.
    pub(crate) async fn set_custom_tool(
        &self,
        kind: &str,
        tool: Option<CustomTool>,
    ) -> Result<(), String> {
        self.write(|settings| {
            settings
                .custom_tools
                .retain(|existing| existing.kind != kind);
            if let Some(tool) = tool {
                settings.custom_tools.push(tool);
            }
            Ok(((), true))
        })
        .await
    }

    /// Write the full settings document without discarding keys another phase owns. Every
    /// caller holds `write_lock`, so the document it read is still the document on disk.
    async fn save(&self, settings: &AppSettings) -> Result<(), String> {
        let existing = match tokio::fs::read_to_string(&self.path).await {
            Ok(text) => Some(text),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => {
                return Err(format!(
                    "could not read {} before updating it: {error}",
                    self.path.display()
                ));
            }
        };
        let mut root = existing
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        let object = root
            .as_object_mut()
            .ok_or_else(|| "settings root is not an object".to_owned())?;
        object.insert("schema_version".to_owned(), json!(1));
        object.insert("theme".to_owned(), json!(settings.theme));
        object.insert("row_density".to_owned(), json!(settings.row_density));
        object.insert("reduce_motion".to_owned(), json!(settings.reduce_motion));
        object.insert("temp_dir".to_owned(), json!(settings.temp_dir));
        object.insert("scene_model".to_owned(), json!(settings.scene_model));
        object.insert(
            "python_interpreter".to_owned(),
            json!(settings.python_interpreter),
        );
        object.insert(
            "delete_chunks_on_success".to_owned(),
            json!(settings.delete_chunks_on_success),
        );
        // The single-template fields predate multiple templates. They are migrated into
        // `project_templates` on read and removed on the first write, so a later build does
        // not resurrect a stale second source of truth.
        object.remove("project_defaults");
        object.remove("default_general");
        object.insert(
            "project_templates".to_owned(),
            serde_json::to_value(&settings.project_templates).map_err(|error| error.to_string())?,
        );
        object.insert(
            "default_project_template_id".to_owned(),
            json!(settings.default_project_template_id),
        );
        object.insert(
            "custom_tools".to_owned(),
            serde_json::to_value(&settings.custom_tools).map_err(|error| error.to_string())?,
        );
        object.insert(
            "tool_sources".to_owned(),
            serde_json::to_value(&settings.tool_sources).map_err(|error| error.to_string())?,
        );
        object.insert(
            "encoder_forks".to_owned(),
            serde_json::to_value(&settings.encoder_forks).map_err(|error| error.to_string())?,
        );
        object.insert(
            "encoder_overrides".to_owned(),
            serde_json::to_value(&settings.encoder_overrides).map_err(|error| error.to_string())?,
        );

        let rendered = serde_json::to_string_pretty(&root).map_err(|error| error.to_string())?;
        let parent = self
            .path
            .parent()
            .ok_or_else(|| "settings path has no parent directory".to_owned())?;
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;

        crate::platform::atomic::write(&self.path, rendered.as_bytes())
            .await
            .map_err(|error| format!("could not replace {}: {error}", self.path.display()))
    }
}

/// Apply only the fields a merge patch presents. Presence is carried by `Patch` and
/// `NullablePatch`, so an omitted `temp_dir` is not confused with an explicit `null`.
fn apply_update(settings: &mut AppSettings, update: &AppSettingsUpdate) {
    // Exhaustive destructuring makes a new writable field a compile error until it is
    // applied here; the schema-key parity test catches the same gap from the wire side.
    let AppSettingsUpdate {
        theme,
        row_density,
        reduce_motion,
        temp_dir,
        delete_chunks_on_success,
    } = update;
    if let Some(theme) = theme.value() {
        settings.theme = theme.clone();
    }
    if let Some(row_density) = row_density.value() {
        settings.row_density = row_density.clone();
    }
    if let Some(reduce_motion) = reduce_motion.value() {
        settings.reduce_motion = *reduce_motion;
    }
    if let Some(temp_dir) = temp_dir.value() {
        settings.temp_dir = temp_dir
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(str::to_owned);
    }
    if let Some(delete_chunks_on_success) = delete_chunks_on_success.value() {
        settings.delete_chunks_on_success = *delete_chunks_on_success;
    }
}

/// Migrate the single-template fields into the template list.
///
/// The key's presence is what distinguishes a file that predates multiple templates from a
/// user who removed every template: an absent key seeds one named Default, an empty array
/// stays empty.
fn load_templates(value: &Value) -> Vec<ProjectTemplate> {
    if let Some(items) = value.get("project_templates").and_then(Value::as_array) {
        let mut templates: Vec<ProjectTemplate> = items
            .iter()
            .filter_map(|item| serde_json::from_value::<ProjectTemplate>(item.clone()).ok())
            .collect();
        sort_templates(&mut templates);
        return templates;
    }
    let config = value
        .get("project_defaults")
        .filter(|defaults| defaults.is_object())
        .cloned()
        .unwrap_or_else(crate::project::projects::default_config);
    let mut general = value
        .get("default_general")
        .and_then(|general| serde_json::from_value::<GeneralDefaults>(general.clone()).ok())
        .unwrap_or_default();
    crate::project::projects::seed_default_filters(&mut general);
    vec![ProjectTemplate {
        // A stable id keeps the migration idempotent if a later write fails.
        id: "default".to_owned(),
        name: "Default".to_owned(),
        config,
        general,
        updated_at: None,
    }]
}

fn default_template_id(value: &Value) -> Option<String> {
    let templates = load_templates(value);
    let saved = value
        .get("default_project_template_id")
        .and_then(Value::as_str);
    if let Some(id) = saved {
        return templates
            .iter()
            .any(|template| template.id == id)
            .then(|| id.to_owned());
    }
    // A file without a template list predates multiple templates; its migrated first
    // template is the historical default. A present list with a null marker means the user
    // (or the starter seed) deliberately left no template marked.
    if value
        .get("project_templates")
        .and_then(Value::as_array)
        .is_none()
    {
        return templates.first().map(|template| template.id.clone());
    }
    None
}

fn sort_templates(templates: &mut [ProjectTemplate]) {
    templates.sort_by_key(|template| template.name.to_lowercase());
}

fn valid_template_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("A template needs a name.".to_owned());
    }
    if name.chars().count() > 120 {
        return Err("A template name cannot be longer than 120 characters.".to_owned());
    }
    Ok(name.to_owned())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use av1ation_contracts::encoder::{
        Choice, ChoiceSpec, ChoiceValueKind, Delimiter, ParameterDescriptor, ParameterKey,
        ParameterKind, ParameterValue, PathSpec, TextFormat, TextSpec, Widget,
    };
    use av1ation_contracts::settings::{NullablePatch, Patch};

    use super::*;

    fn temporary_dir() -> PathBuf {
        std::env::temp_dir().join(format!("av1ation-settings-{}", uuid::Uuid::new_v4()))
    }

    #[tokio::test]
    async fn settings_round_trip_and_keep_unrelated_keys() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        tokio::fs::write(
            dir.join("config.json"),
            r#"{"theme":"dark","custom_tools":[{"kind":"old","path":"/old"}],"future_key":true}"#,
        )
        .await
        .expect("seed settings");

        let store = SettingsStore::new(&dir);
        let loaded = store.load().await;
        assert_eq!(loaded.theme, "dark");
        assert_eq!(
            loaded.custom_tools,
            vec![CustomTool {
                kind: "old".to_owned(),
                path: "/old".to_owned(),
            }]
        );

        let tool = CustomTool {
            kind: "x265".to_owned(),
            path: "C:/Tools/x265.exe".to_owned(),
        };
        store
            .set_custom_tool("x265", Some(tool))
            .await
            .expect("save tools");
        let updated = store
            .update(&AppSettingsUpdate {
                theme: Patch::present("light".to_owned()),
                row_density: Patch::present("compact".to_owned()),
                reduce_motion: Patch::present(true),
                temp_dir: NullablePatch::present("D:/temp".to_owned()),
                delete_chunks_on_success: Patch::present(true),
            })
            .await
            .expect("update");
        assert_eq!(updated.theme, "light");
        assert_eq!(updated.row_density, "compact");
        assert!(updated.reduce_motion);
        // The seeded entry is preserved: a custom-tool write only owns its own family.
        assert_eq!(updated.custom_tools.len(), 2);
        assert!(updated.custom_tools.iter().any(|tool| tool.kind == "old"));
        assert!(updated.custom_tools.iter().any(|tool| tool.kind == "x265"));
        assert_eq!(updated.temp_dir.as_deref(), Some("D:/temp"));
        assert!(updated.delete_chunks_on_success);

        let text = tokio::fs::read_to_string(dir.join("config.json"))
            .await
            .expect("read settings");
        let value: Value = serde_json::from_str(&text).expect("json");
        assert_eq!(value["future_key"], true);
        assert_eq!(value["schema_version"], 1);

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn setting_one_tool_keeps_a_family_this_build_cannot_parse() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        tokio::fs::write(
            dir.join("config.json"),
            r#"{"custom_tools":[{"kind":"future-encoder","path":"D:/x.exe"}]}"#,
        )
        .await
        .expect("seed settings");

        let store = SettingsStore::new(&dir);
        store
            .set_custom_tool(
                "x265",
                Some(CustomTool {
                    kind: "x265".to_owned(),
                    path: "C:/x265.exe".to_owned(),
                }),
            )
            .await
            .expect("set tool");

        let kinds: Vec<String> = store
            .load_custom_tools()
            .await
            .into_iter()
            .map(|tool| tool.kind)
            .collect();
        assert_eq!(kinds, vec!["future-encoder".to_owned(), "x265".to_owned()]);

        store
            .set_custom_tool("x265", None)
            .await
            .expect("remove tool");
        assert_eq!(
            store.load_custom_tools().await,
            vec![CustomTool {
                kind: "future-encoder".to_owned(),
                path: "D:/x.exe".to_owned(),
            }]
        );

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_missing_settings_file_loads_as_defaults() {
        let dir = temporary_dir();
        let store = SettingsStore::new(&dir);
        let settings = store.load().await;
        assert_eq!(settings.theme, "system");
        assert_eq!(settings.row_density, "comfortable");
        assert!(!settings.reduce_motion);
        assert!(settings.custom_tools.is_empty());
        assert!(!settings.delete_chunks_on_success);
    }

    #[tokio::test]
    async fn a_numbered_choice_descriptor_survives_save_and_reload() {
        let dir = temporary_dir();
        let store = SettingsStore::new(&dir);
        let key = ParameterKey("--color-format".to_owned());
        let mut parameters = BTreeMap::new();
        parameters.insert(
            key.clone(),
            ParameterDescriptor {
                delimiter: Some(Delimiter::Space),
                label: "Colour format".to_owned(),
                description: Some("Chroma sampling used for the encode".to_owned()),
                doc_link: Some("https://example.com/color-format".to_owned()),
                kind: ParameterKind::Choice(ChoiceSpec {
                    options: vec![
                        Choice {
                            value: ParameterValue::Number(0.0),
                            label: "4:0:0".to_owned(),
                            description: Some("Luma only, for monochrome sources".to_owned()),
                            doc_link: None,
                        },
                        Choice {
                            value: ParameterValue::Number(1.0),
                            label: "4:2:0".to_owned(),
                            description: Some("Default broadcast sampling".to_owned()),
                            doc_link: None,
                        },
                        Choice {
                            value: ParameterValue::Number(2.0),
                            label: "4:2:2".to_owned(),
                            description: Some("Mezzanine sampling".to_owned()),
                            doc_link: None,
                        },
                    ],
                    value_kind: Some(ChoiceValueKind::Number),
                    multiple: false,
                    min_selected: 1,
                    max_selected: Some(1),
                }),
                default: Some(ParameterValue::Number(1.0)),
                widget: Widget::Auto,
                advanced: false,
                group: Some("Colour".to_owned()),
                relations: Vec::new(),
            },
        );
        let fork = EncoderFork {
            id: "svt-custom".to_owned(),
            label: "SVT-AV1 custom".to_owned(),
            base: "svt-av1".to_owned(),
            executable: "C:/Tools/SvtAv1EncApp.exe".to_owned(),
            version: Some("1.8.0".to_owned()),
            parameters,
            parameters_edited: true,
        };

        let id = fork.id.clone();
        store
            .set_encoder_fork(&id, Some(fork))
            .await
            .expect("save fork");

        // A fresh store reads the file; it must not reuse the value the test wrote.
        let reloaded = SettingsStore::new(&dir).load().await;
        let saved = reloaded
            .encoder_forks
            .into_iter()
            .find(|fork| fork.id == "svt-custom")
            .expect("the fork was saved");
        let descriptor = saved
            .parameters
            .get(&key)
            .expect("the numbered choice was saved");
        let ParameterKind::Choice(choice) = &descriptor.kind else {
            panic!("the saved descriptor is still a choice");
        };

        assert_eq!(choice.value_kind, Some(ChoiceValueKind::Number));
        assert_eq!(
            choice
                .options
                .iter()
                .map(|option| option.label.as_str())
                .collect::<Vec<_>>(),
            vec!["4:0:0", "4:2:0", "4:2:2"]
        );
        assert_eq!(
            choice
                .options
                .iter()
                .map(|option| option.description.as_deref())
                .collect::<Vec<_>>(),
            vec![
                Some("Luma only, for monochrome sources"),
                Some("Default broadcast sampling"),
                Some("Mezzanine sampling"),
            ]
        );
        assert_eq!(
            choice
                .options
                .iter()
                .map(|option| option.value.clone())
                .collect::<Vec<_>>(),
            vec![
                ParameterValue::Number(0.0),
                ParameterValue::Number(1.0),
                ParameterValue::Number(2.0),
            ],
            "the encoder receives the numbers, not the labels"
        );
        assert_eq!(descriptor.default, Some(ParameterValue::Number(1.0)));
        assert_eq!(
            descriptor.description.as_deref(),
            Some("Chroma sampling used for the encode")
        );
        assert!(saved.parameters_edited);

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn path_and_validated_text_descriptors_survive_save_and_reload() {
        let dir = temporary_dir();
        let store = SettingsStore::new(&dir);
        let path_key = ParameterKey("--config".to_owned());
        let email_key = ParameterKey("--contact".to_owned());
        let mut parameters = BTreeMap::new();
        parameters.insert(
            path_key.clone(),
            ParameterDescriptor {
                delimiter: Some(Delimiter::Space),
                label: "Config file".to_owned(),
                description: None,
                doc_link: None,
                kind: ParameterKind::Path(PathSpec {
                    directory: false,
                    accept: vec!["toml".to_owned(), "json".to_owned()],
                }),
                default: Some(ParameterValue::Text("C:/config/svt.toml".to_owned())),
                widget: Widget::Auto,
                advanced: false,
                group: None,
                relations: Vec::new(),
            },
        );
        parameters.insert(
            email_key.clone(),
            ParameterDescriptor {
                delimiter: Some(Delimiter::Space),
                label: "Contact".to_owned(),
                description: None,
                doc_link: None,
                kind: ParameterKind::Text(TextSpec {
                    max_len: None,
                    pattern: None,
                    multiline: false,
                    format: Some(TextFormat::Email),
                }),
                default: None,
                widget: Widget::Auto,
                advanced: false,
                group: None,
                relations: Vec::new(),
            },
        );
        store
            .set_encoder_fork(
                "svt-custom",
                Some(EncoderFork {
                    id: "svt-custom".to_owned(),
                    label: "SVT-AV1 custom".to_owned(),
                    base: "svt-av1".to_owned(),
                    executable: "C:/Tools/SvtAv1EncApp.exe".to_owned(),
                    version: None,
                    parameters,
                    parameters_edited: true,
                }),
            )
            .await
            .expect("save fork");

        let saved = SettingsStore::new(&dir)
            .load()
            .await
            .encoder_forks
            .into_iter()
            .find(|fork| fork.id == "svt-custom")
            .expect("the fork was saved");

        let ParameterKind::Path(path) = &saved.parameters[&path_key].kind else {
            panic!("the saved config option is still a path");
        };
        assert!(!path.directory);
        assert_eq!(path.accept, vec!["toml", "json"]);
        assert_eq!(
            saved.parameters[&path_key].default,
            Some(ParameterValue::Text("C:/config/svt.toml".to_owned()))
        );

        let ParameterKind::Text(text) = &saved.parameters[&email_key].kind else {
            panic!("the saved contact option is still text")
        };
        assert_eq!(text.format, Some(TextFormat::Email));

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_patch_replaces_only_present_fields_and_keeps_a_present_false() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        tokio::fs::write(
            dir.join("config.json"),
            r#"{"theme":"dark","row_density":"compact","reduce_motion":true,"temp_dir":"D:/old","delete_chunks_on_success":true}"#,
        )
        .await
        .expect("seed settings");

        let store = SettingsStore::new(&dir);
        store
            .update(&AppSettingsUpdate {
                reduce_motion: Patch::present(false),
                ..Default::default()
            })
            .await
            .expect("patch reduce motion");

        let after_false = store.load().await;
        assert_eq!(after_false.theme, "dark");
        assert_eq!(after_false.row_density, "compact");
        assert!(
            !after_false.reduce_motion,
            "a present false must be written"
        );
        assert_eq!(after_false.temp_dir.as_deref(), Some("D:/old"));
        assert!(after_false.delete_chunks_on_success);

        store
            .update(&AppSettingsUpdate {
                temp_dir: NullablePatch::null(),
                ..Default::default()
            })
            .await
            .expect("clear temp dir");
        let after_null = store.load().await;
        assert_eq!(
            after_null.temp_dir, None,
            "an explicit null clears the path"
        );
        assert_eq!(after_null.theme, "dark");
        assert!(!after_null.reduce_motion);

        // An absent temp_dir after the clear must keep it clear rather than restore it.
        store
            .update(&AppSettingsUpdate {
                theme: Patch::present("light".to_owned()),
                ..Default::default()
            })
            .await
            .expect("patch theme");
        let after_absent = store.load().await;
        assert_eq!(after_absent.temp_dir, None);
        assert_eq!(after_absent.theme, "light");

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn an_empty_patch_does_not_rewrite_the_settings_file() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        tokio::fs::write(dir.join("config.json"), r#"{"future_key":true}"#)
            .await
            .expect("seed settings");
        let before = tokio::fs::read_to_string(dir.join("config.json"))
            .await
            .expect("read before");

        let store = SettingsStore::new(&dir);
        store
            .update(&AppSettingsUpdate::default())
            .await
            .expect("empty patch");

        let after = tokio::fs::read_to_string(dir.join("config.json"))
            .await
            .expect("read after");
        assert_eq!(before, after);

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn concurrent_patches_serialize_under_the_write_seam() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        let store = SettingsStore::new(&dir);
        let first = store.clone();
        let second = store.clone();
        let theme = AppSettingsUpdate {
            theme: Patch::present("light".to_owned()),
            ..Default::default()
        };
        let deletion = AppSettingsUpdate {
            delete_chunks_on_success: Patch::present(true),
            ..Default::default()
        };

        let (first, second) = tokio::join!(first.update(&theme), second.update(&deletion));
        first.expect("first patch");
        second.expect("second patch");

        let loaded = store.load().await;
        assert_eq!(loaded.theme, "light");
        assert!(
            loaded.delete_chunks_on_success,
            "the second writer must not lose the first writer's field"
        );

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn template_and_custom_tool_writes_share_the_settings_document() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        let store = SettingsStore::new(&dir);

        store
            .update(&AppSettingsUpdate {
                theme: Patch::present("dark".to_owned()),
                ..Default::default()
            })
            .await
            .expect("seed theme");
        let template = store.add_template("Hero").await.expect("add template");
        store
            .set_custom_tool(
                "x265",
                Some(CustomTool {
                    kind: "x265".to_owned(),
                    path: "C:/Tools/x265.exe".to_owned(),
                }),
            )
            .await
            .expect("set custom tool");
        store
            .update(&AppSettingsUpdate {
                theme: Patch::present("light".to_owned()),
                ..Default::default()
            })
            .await
            .expect("patch theme");

        let loaded = store.load().await;
        assert_eq!(loaded.theme, "light");
        assert!(
            loaded
                .project_templates
                .iter()
                .any(|entry| entry.id == template.id),
            "the settings patch must keep a template another writer added"
        );
        assert!(
            loaded.custom_tools.iter().any(|tool| tool.kind == "x265"),
            "the settings patch must keep a custom tool added through its own route"
        );

        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[test]
    fn a_present_template_list_without_a_default_marker_stays_unmarked() {
        let template = ProjectTemplate {
            id: "template-a".to_owned(),
            name: "A".to_owned(),
            config: crate::project::projects::default_config(),
            general: GeneralDefaults::default(),
            updated_at: None,
        };
        let value = json!({
            "project_templates": [template],
            "default_project_template_id": null,
        });
        assert_eq!(default_template_id(&value), None);
    }

    #[test]
    fn a_legacy_file_without_a_template_list_keeps_its_migrated_default() {
        let value = json!({ "project_defaults": {} });
        assert_eq!(default_template_id(&value).as_deref(), Some("default"));
    }

    #[tokio::test]
    async fn a_fresh_settings_file_receives_one_recommended_template() {
        let dir = temporary_dir();
        let store = SettingsStore::new(&dir);
        let first = store
            .seed_starter_template()
            .await
            .expect("seed")
            .expect("a fresh directory is seeded");
        assert_eq!(first.name, "Recommended");
        assert!(
            store
                .seed_starter_template()
                .await
                .expect("second seed")
                .is_none(),
            "an existing config must never gain a second starter"
        );
        let loaded = store.load().await;
        assert_eq!(loaded.project_templates.len(), 1);
        assert_eq!(loaded.project_templates[0].id, first.id);
        assert_eq!(loaded.default_project_template_id, None);
        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn an_existing_empty_template_list_is_not_seeded() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        tokio::fs::write(dir.join("config.json"), r#"{"project_templates":[]}"#)
            .await
            .expect("seed settings");
        let store = SettingsStore::new(&dir);
        assert!(store.seed_starter_template().await.expect("seed").is_none());
        assert!(store.load().await.project_templates.is_empty());
        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[tokio::test]
    async fn a_malformed_settings_file_is_not_replaced_by_seeding() {
        let dir = temporary_dir();
        tokio::fs::create_dir_all(&dir).await.expect("temp dir");
        tokio::fs::write(dir.join("config.json"), "not json")
            .await
            .expect("seed settings");
        let store = SettingsStore::new(&dir);
        assert!(store.seed_starter_template().await.expect("seed").is_none());
        assert_eq!(
            tokio::fs::read_to_string(dir.join("config.json"))
                .await
                .expect("read"),
            "not json"
        );
        tokio::fs::remove_dir_all(dir).await.expect("cleanup");
    }

    #[test]
    fn an_unknown_patch_field_is_rejected() {
        let error =
            serde_json::from_str::<AppSettingsUpdate>(r#"{"theme":"light","future_key":true}"#)
                .expect_err("unknown fields must not be accepted");
        assert!(error.to_string().contains("unknown field"), "{error}");
    }
}
