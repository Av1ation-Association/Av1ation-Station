//! Persistence for a project's video queue.
//!
//! One document per video under `<app-data>/projects/<project>/videos/<video>.json`. It
//! carries the engine's own `Input` and `Output` documents, the video's sparse overrides,
//! and the `condor` blob the engine checkpoints into during a run. The blob is stored
//! verbatim: reshaping it would make an engine upgrade a migration.
//!
//! Encoded chunks live under `<app-data>/temp/<video>/`, named by the video rather than by
//! the project, so a crashed run's chunks stay attributable and two videos never collide.

mod store;

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use av1ation_contracts::video::{VideoCreateRequest, VideoDetail, VideoSummary};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{platform::atomic, project::projects::StoreError};

/// The `<video>.json` schema this build writes and understands.
const SCHEMA_VERSION: u32 = 1;

/// The on-disk video document. Paths are the engine's own documents, so a video is opened by
/// handing the engine exactly what it wrote.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VideoRecord {
    pub(crate) schema_version: u32,
    pub(crate) id: String,
    pub(crate) name: String,
    /// The file this queue entry was added with.
    ///
    /// A script input replaces the decode graph, so its own document cannot name the source;
    /// the video owns that path instead. Defaulted for records written before this field.
    #[serde(default)]
    pub(crate) source_path: String,
    /// Engine `Input` JSON.
    pub(crate) input: Value,
    /// Engine `Output` JSON.
    pub(crate) output: Value,
    /// Sparse configuration overrides, addressed by dotted leaf path.
    #[serde(default)]
    pub(crate) overrides: BTreeMap<String, Value>,
    /// The engine's `CondorModel` blob, written by the engine's own save callback.
    #[serde(default)]
    pub(crate) condor: Option<Value>,
    /// The scene table the last structural edit or bulk encoder assignment replaced, for
    /// one-step undo.
    ///
    /// Only the scene matrix is kept: neither a structural edit nor a bulk encoder assignment
    /// changes the top-level encoder or encoder documents. It is cleared when a run
    /// checkpoints, because a new detection result is a new starting point rather than an
    /// edit of the previous table.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) scene_undo: Option<Value>,
    /// The user's own sequence data per scene index.
    ///
    /// It lives here rather than in `condor` because the engine's `DefaultSequenceData` is a
    /// typed struct: serde drops a key it does not know when the engine loads the blob, so a
    /// pair parked in `sequence_data` would disappear on the first checkpoint. The runner
    /// merges these pairs into the scene table a script receives, and a structural edit
    /// clears the map because every later scene index moved.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub(crate) custom_scene_data: BTreeMap<u32, BTreeMap<String, Value>>,
    /// A scratch directory chosen for this video alone, when the user chose one.
    ///
    /// Paths inside the encoder's sidecars are absolute, so this is changed only while
    /// nothing is retained; the guard lives in the storage route, not in the encoder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) temp_directory: Option<String>,
    pub(crate) order: u32,
    pub(crate) created_at: u64,
}

impl VideoRecord {
    /// The source path the engine decodes.
    ///
    /// The stored path wins because a script input's document carries only the script; the
    /// input document is the fallback for records written before the field existed.
    pub(crate) fn input_path(&self) -> String {
        if !self.source_path.trim().is_empty() {
            return self.source_path.clone();
        }
        input_path_of(&self.input).unwrap_or_default()
    }

    /// Where the concatenated output is written.
    pub(crate) fn output_path(&self) -> String {
        self.output
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    }

    /// The queue row for this video.
    pub(crate) fn summary(&self) -> VideoSummary {
        VideoSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            input_path: self.input_path(),
            output_path: self.output_path(),
            order: self.order,
            created_at: iso8601(self.created_at),
        }
    }

    /// The detail view for this video.
    pub(crate) fn detail(&self, output_exists: bool, retained_bytes: u64) -> VideoDetail {
        VideoDetail {
            id: self.id.clone(),
            name: self.name.clone(),
            input_path: self.input_path(),
            output_path: self.output_path(),
            order: self.order,
            created_at: iso8601(self.created_at),
            output_exists,
            retained_bytes,
        }
    }
}

/// One queue entry being restored from a project archive.
///
/// The archive has no ids or timestamps, so the store issues both. Grouping the document
/// fields here keeps `import` from growing a positional argument list as the archive
/// gains fields.
pub(crate) struct VideoImport {
    pub(crate) name: String,
    pub(crate) input: Value,
    pub(crate) output: Value,
    pub(crate) overrides: BTreeMap<String, Value>,
    pub(crate) condor: Option<Value>,
    pub(crate) order: u32,
}

/// The video documents and the temporary directories beside them.
#[derive(Debug, Clone)]
pub(crate) struct VideoStore {
    projects: PathBuf,
    temp: PathBuf,
    /// A portable installation owns its scratch beside the executable, so saved scratch
    /// overrides are not allowed to move work out of the portable tree.
    portable: bool,
    /// Settings can move the scratch root while the service runs. The default stays under
    /// app-data; a `None` here means no override is active.
    temp_override: Arc<RwLock<Option<PathBuf>>>,
}

/// The scene matrix inside a checkpoint, or an empty table when it has none.
fn previous_scenes(condor: Option<&Value>) -> Value {
    condor
        .and_then(|blob| blob.get("scenes"))
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()))
}

/// The source path inside an engine `Input` document, when it has one.
pub(crate) fn input_path_of(input: &Value) -> Option<String> {
    for kind in ["Video", "VapourSynth"] {
        if let Some(path) = input.get(kind).and_then(|value| value.get("path")) {
            return path.as_str().map(str::to_owned);
        }
    }
    None
}

/// The display name a new video gets before a user renames it.
fn file_name_of(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_owned())
}

fn output_exists(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }
    std::fs::metadata(path).is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
}

/// A project or video id is a path segment, so a value that could escape the directory is
/// rejected before any path is built from it.
fn valid_segment(id: &str, what: &str) -> Result<(), StoreError> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');
    if valid {
        Ok(())
    } else {
        Err(StoreError::Invalid(format!(
            "`{id}` is not a usable {what} id"
        )))
    }
}

async fn read_record(path: &Path) -> Result<Option<VideoRecord>, StoreError> {
    let text = match tokio::fs::read_to_string(path).await {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_error("read the video document", path, error)),
    };
    let record: VideoRecord = serde_json::from_str(&text).map_err(|error| {
        StoreError::Corrupt(format!(
            "{} is not a readable video document: {error}",
            path.display()
        ))
    })?;
    if record.schema_version > SCHEMA_VERSION {
        return Err(StoreError::NewerSchema(record.schema_version));
    }
    Ok(Some(record))
}

async fn write_document(path: &Path, record: &VideoRecord) -> Result<(), StoreError> {
    let bytes = serde_json::to_vec_pretty(record).map_err(|error| {
        StoreError::Io(format!(
            "{} could not be serialised: {error}",
            path.display()
        ))
    })?;
    atomic::write(path, &bytes)
        .await
        .map_err(|error| io_error("write the video document", path, error))
}

/// A finished scene chunk is named after the scene's zero-padded index. A `.temp.` file is
/// half-written and belongs to no scene yet; any other extension is the encoder's choice.
fn chunk_is_scene(name: &str, scene: usize) -> bool {
    name.starts_with(&format!("{:>05}.", scene)) && !name.contains(".temp.")
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

fn io_error(action: &str, path: &Path, error: std::io::Error) -> StoreError {
    StoreError::Io(format!("Could not {action} {}: {error}", path.display()))
}

pub(crate) fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

/// An ISO-8601 UTC timestamp from epoch seconds, without a date-formatting dependency.
pub(crate) fn iso8601(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let seconds_of_day = seconds % 86_400;
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    if month <= 2 {
        year += 1;
    }
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        seconds_of_day / 3_600,
        (seconds_of_day % 3_600) / 60,
        seconds_of_day % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::projects::default_config;

    fn temporary_dir() -> PathBuf {
        std::env::temp_dir().join(format!("av1ation-videos-{}", uuid::Uuid::new_v4()))
    }

    fn create_request() -> VideoCreateRequest {
        VideoCreateRequest {
            input_path: "C:\\media\\clip.mkv".to_owned(),
            output_path: Some("C:\\media\\clip.av1.mkv".to_owned()),
            name: None,
        }
    }

    async fn project_with_videos(store: &VideoStore, dir: &Path) -> String {
        let projects = crate::project::projects::ProjectStore::new(dir);
        let project = projects
            .create(
                "Videos",
                None,
                default_config(),
                av1ation_contracts::settings::GeneralDefaults::default(),
            )
            .await
            .expect("create the project");
        let request = create_request();
        store
            .add(
                &project.id,
                &request,
                av1ation_engine::media::video::native_input(&request.input_path),
                av1ation_engine::media::video::native_output(
                    request.output_path.as_deref().unwrap_or_default(),
                ),
            )
            .await
            .expect("add the video")
            .expect("the project exists");
        project.id
    }

    #[tokio::test]
    async fn a_video_is_added_listed_read_and_removed() {
        let dir = temporary_dir();
        let store = VideoStore::new(&dir);
        let project = project_with_videos(&store, &dir).await;

        let list = store.list(&project).await.expect("list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "clip.mkv");
        assert_eq!(list[0].order, 0);
        assert_eq!(list[0].input_path, "C:\\media\\clip.mkv");

        let detail = store
            .get(&project, &list[0].id)
            .await
            .expect("get")
            .expect("the video exists");
        assert!(!detail.output_exists);
        assert_eq!(detail.retained_bytes, 0);

        assert!(store.delete(&project, &list[0].id).await.expect("delete"));
        assert!(!store.delete(&project, &list[0].id).await.expect("delete"));
        assert!(store.list(&project).await.expect("list").is_empty());

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_second_video_takes_the_next_queue_position() {
        let dir = temporary_dir();
        let store = VideoStore::new(&dir);
        let project = project_with_videos(&store, &dir).await;

        let mut request = create_request();
        request.name = Some("  Second  ".to_owned());
        store
            .add(
                &project,
                &request,
                av1ation_engine::media::video::native_input(&request.input_path),
                av1ation_engine::media::video::native_output(
                    request.output_path.as_deref().unwrap_or_default(),
                ),
            )
            .await
            .expect("add")
            .expect("the project exists");

        let list = store.list(&project).await.expect("list");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "clip.mkv");
        assert_eq!(list[1].name, "Second");
        assert_eq!(list[1].order, 1);

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_path_like_id_is_rejected_before_any_write() {
        let dir = temporary_dir();
        let store = VideoStore::new(&dir);

        for id in ["../escape", "a/b", "", "..", "a\\b"] {
            assert!(
                store.list(id).await.is_err(),
                "{id} should not be usable as a project id"
            );
            assert!(
                store
                    .write_condor_blocking(id, "video", &Value::Null)
                    .is_err(),
                "{id} should not be usable as a project id"
            );
        }

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_checkpoint_replaces_the_engine_blob_and_keeps_the_rest_of_the_document() {
        let dir = temporary_dir();
        let store = VideoStore::new(&dir);
        let project = project_with_videos(&store, &dir).await;
        let id = store.list(&project).await.expect("list")[0].id.clone();

        let mut overrides = BTreeMap::new();
        overrides.insert(
            "encoder.SVTAV1.options.crf".to_owned(),
            serde_json::json!(30),
        );
        store
            .replace_overrides(&project, &id, overrides)
            .await
            .expect("overrides");

        store
            .write_condor_blocking(&project, &id, &serde_json::json!({ "scenes": [1, 2] }))
            .expect("first checkpoint");
        store
            .write_condor_blocking(&project, &id, &serde_json::json!({ "scenes": [1, 2, 3] }))
            .expect("second checkpoint");

        let record = store
            .record(&project, &id)
            .await
            .expect("read")
            .expect("the video exists");
        assert_eq!(
            record.condor,
            Some(serde_json::json!({ "scenes": [1, 2, 3] }))
        );
        assert_eq!(record.name, "clip.mkv");
        assert_eq!(record.overrides.len(), 1, "the overrides survived");
        assert_eq!(record.schema_version, SCHEMA_VERSION);

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn chunk_files_match_the_engines_scene_ids() {
        let dir = temporary_dir();
        let store = VideoStore::new(&dir);
        let project = project_with_videos(&store, &dir).await;
        let id = store.list(&project).await.expect("list")[0].id.clone();
        let chunks = store.chunk_directory(&id, None);
        tokio::fs::create_dir_all(&chunks)
            .await
            .expect("scenes dir");
        for name in ["00000.ivf", "00001.temp.264", "00002.264"] {
            tokio::fs::write(chunks.join(name), b"x")
                .await
                .expect("chunk");
        }

        let names = store.chunk_files(&id, None).await;
        assert!(VideoStore::chunk_present(&names, 0));
        assert!(
            !VideoStore::chunk_present(&names, 1),
            "a half-written temp file is not a finished scene"
        );
        assert!(VideoStore::chunk_present(&names, 2));
        assert!(!VideoStore::chunk_present(&names, 3));
        assert_eq!(store.retained_bytes(&id, None).await, 3);

        let sizes = store.chunk_sizes(&id, None).await;
        assert_eq!(VideoStore::chunk_bytes(&sizes, 0), Some(1));
        assert_eq!(
            VideoStore::chunk_bytes(&sizes, 1),
            None,
            "the temp file does not supply a size for scene one"
        );
        assert_eq!(VideoStore::chunk_bytes(&sizes, 2), Some(1));

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_videos_own_directory_replaces_the_inherited_root() {
        let dir = temporary_dir();
        let store = VideoStore::new(&dir);
        let project = project_with_videos(&store, &dir).await;
        let id = store.list(&project).await.expect("list")[0].id.clone();
        let inherited = store.inherited_chunk_directory(&id);
        let own = dir.join("chosen");
        let own_text = own.display().to_string();

        assert_eq!(store.chunk_directory(&id, Some(&own_text)), own);
        assert_ne!(store.chunk_directory(&id, Some(&own_text)), inherited);

        tokio::fs::create_dir_all(&own).await.expect("own dir");
        tokio::fs::write(own.join("00000.ivf"), b"chunk")
            .await
            .expect("chunk");
        assert_eq!(store.retained_bytes(&id, Some(&own_text)).await, 5);
        assert_eq!(
            store.retained_bytes(&id, None).await,
            0,
            "the inherited directory is a different, empty address"
        );

        let record = store
            .update_temp_directory(&project, &id, Some(own_text.clone()))
            .await
            .expect("update")
            .expect("the video exists");
        assert_eq!(record.temp_directory.as_deref(), Some(own_text.as_str()));

        let cleared = store
            .update_temp_directory(&project, &id, Some(String::new()))
            .await
            .expect("update")
            .expect("the video exists");
        assert_eq!(cleared.temp_directory, None, "empty means inherit again");

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_portable_data_root_ignores_saved_scratch_overrides() {
        let root = temporary_dir();
        let install = root.join("install");
        let data = install.join("data");
        tokio::fs::create_dir_all(&data).await.expect("data dir");
        tokio::fs::write(install.join("portable"), b"")
            .await
            .expect("portable marker");
        let store = VideoStore::new(&data);
        let outside = root.join("outside");

        store.set_temp_root(Some(outside.clone()));
        assert_eq!(
            store.effective_temp_root(),
            data.join("temp"),
            "portable mode keeps its scratch inside the installation"
        );
        assert_eq!(
            store.chunk_directory("video", Some(&outside.display().to_string())),
            data.join("temp").join("video"),
            "a saved per-video directory cannot move portable chunks"
        );

        let _ = tokio::fs::remove_dir_all(root).await;
    }
}
