use super::*;

impl VideoStore {
    /// Root the store under the app-data directory the host resolved.
    pub(crate) fn new(data_dir: impl AsRef<Path>) -> Self {
        let data_dir = data_dir.as_ref();
        Self {
            projects: data_dir.join("projects"),
            temp: data_dir.join("temp"),
            temp_override: Arc::new(RwLock::new(None)),
        }
    }

    /// Point every subsequent chunk lookup at a settings-selected root, or restore the
    /// app-data default. Existing chunk directories are not moved; the setting applies to
    /// work started after it is saved.
    pub(crate) fn set_temp_root(&self, root: Option<PathBuf>) {
        *self
            .temp_override
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = root;
    }

    /// The directory holding every video document of one project.
    fn directory(&self, project_id: &str) -> PathBuf {
        self.projects.join(project_id).join("videos")
    }

    /// One video document's path.
    fn document(&self, project_id: &str, video_id: &str) -> PathBuf {
        self.directory(project_id).join(format!("{video_id}.json"))
    }

    /// The scratch root in use: the override when one is saved, otherwise the app-data
    /// default. Storage shows this path because it is where chunks are actually written.
    pub(crate) fn effective_temp_root(&self) -> PathBuf {
        self.temp_override
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
            .unwrap_or_else(|| self.temp.clone())
    }

    /// Where one video's encoded chunks are written.
    ///
    /// `temp_directory` is the video's own root when it has one; the settings override is
    /// read on every call, so a save takes effect without rebuilding the store or restarting
    /// the service. A video with no directory of its own inherits the settings root.
    pub(crate) fn chunk_directory(&self, video_id: &str, temp_directory: Option<&str>) -> PathBuf {
        if let Some(directory) = temp_directory.map(str::trim).filter(|dir| !dir.is_empty()) {
            // The named directory is the video's own scratch directory, not a parent: the
            // engine writes chunks straight into it, exactly as it does for the inherited
            // per-video directory.
            return PathBuf::from(directory);
        }
        let root = self
            .temp_override
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
            .unwrap_or_else(|| self.temp.clone());
        root.join(video_id)
    }

    /// Where this video would write with no directory of its own.
    pub(crate) fn inherited_chunk_directory(&self, video_id: &str) -> PathBuf {
        self.chunk_directory(video_id, None)
    }

    /// The project queue, in order.
    pub(crate) async fn list(&self, project_id: &str) -> Result<Vec<VideoSummary>, StoreError> {
        valid_segment(project_id, "project")?;
        let mut rows = Vec::new();
        for record in self.records(project_id).await? {
            rows.push(record.summary());
        }
        rows.sort_by_key(|row| row.order);
        Ok(rows)
    }

    /// Add a video, materialising its input and output documents.
    ///
    /// The input is written by the engine's own model, so a new video starts on the decode
    /// path `condor init` uses rather than on a second set of path strings.
    pub(crate) async fn add(
        &self,
        project_id: &str,
        request: &VideoCreateRequest,
        input: Value,
        output: Value,
    ) -> Result<Option<VideoDetail>, StoreError> {
        valid_segment(project_id, "project")?;
        if !self.project_exists(project_id).await {
            return Ok(None);
        }

        let existing = self.records(project_id).await?;
        let name = match request.name.as_deref().map(str::trim) {
            Some(name) if !name.is_empty() => {
                if name.chars().count() > 120 {
                    return Err(StoreError::Invalid(
                        "A video name is limited to 120 characters.".to_owned(),
                    ));
                }
                name.to_owned()
            }
            _ => file_name_of(&request.input_path),
        };
        let order = existing.len() as u32;
        let record = VideoRecord {
            schema_version: SCHEMA_VERSION,
            id: uuid::Uuid::new_v4().to_string(),
            name,
            source_path: request.input_path.trim().to_owned(),
            input,
            output,
            overrides: BTreeMap::new(),
            condor: None,
            custom_scene_data: BTreeMap::new(),
            scene_undo: None,
            temp_directory: None,
            order,
            created_at: now_epoch(),
        };

        let directory = self.directory(project_id);
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(|error| io_error("create the video directory", &directory, error))?;
        write_document(&self.document(project_id, &record.id), &record).await?;

        // Removing the temporary directory with the video is a user action, not a side
        // effect of adding one, so nothing under `temp/` is touched here.
        Ok(Some(record.detail(false, 0)))
    }

    /// Write one video from a project archive.
    ///
    /// The archive has no ids or timestamps of its own, so an import always creates a new
    /// queue entry. The engine documents are stored verbatim; the route validates them
    /// before this is called, and a rollback deletes the whole project on failure.
    pub(crate) async fn import(
        &self,
        project_id: &str,
        video: VideoImport,
    ) -> Result<Option<VideoDetail>, StoreError> {
        valid_segment(project_id, "project")?;
        if !self.project_exists(project_id).await {
            return Ok(None);
        }
        let source_path = input_path_of(&video.input).unwrap_or_default();
        let record = VideoRecord {
            schema_version: SCHEMA_VERSION,
            id: uuid::Uuid::new_v4().to_string(),
            name: video.name,
            source_path,
            input: video.input,
            output: video.output,
            overrides: video.overrides,
            condor: video.condor,
            custom_scene_data: BTreeMap::new(),
            scene_undo: None,
            temp_directory: None,
            order: video.order,
            created_at: now_epoch(),
        };

        let directory = self.directory(project_id);
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(|error| io_error("create the video directory", &directory, error))?;
        write_document(&self.document(project_id, &record.id), &record).await?;
        Ok(Some(record.detail(false, 0)))
    }

    /// One video, or `None` when the project or the video is gone.
    pub(crate) async fn get(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<Option<VideoDetail>, StoreError> {
        let Some(record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        let output_exists = output_exists(&record.output_path());
        let retained = self
            .retained_bytes(video_id, record.temp_directory.as_deref())
            .await;
        Ok(Some(record.detail(output_exists, retained)))
    }

    /// Replace the two engine documents a video's General section owns.
    ///
    /// The output file is per video, so it is written here rather than into the project's
    /// General policy. A script input names no file of its own; `source_path` keeps the
    /// queued source that the script is told to open.
    pub(crate) async fn update_documents(
        &self,
        project_id: &str,
        video_id: &str,
        input: Value,
        output: Value,
        source_path: Option<String>,
    ) -> Result<Option<VideoDetail>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        if let Some(source_path) = source_path.map(|path| path.trim().to_owned())
            && !source_path.is_empty()
        {
            record.source_path = source_path;
        }
        // An input that states a path is the video's source from now on. A script input
        // states none, so the queued source survives it unchanged.
        if let Some(path) = input_path_of(&input)
            && !path.trim().is_empty()
        {
            record.source_path = path;
        }
        record.input = input;
        record.output = output;
        write_document(&self.document(project_id, video_id), &record).await?;
        let output_exists = output_exists(&record.output_path());
        let retained = self
            .retained_bytes(video_id, record.temp_directory.as_deref())
            .await;
        Ok(Some(record.detail(output_exists, retained)))
    }

    /// Point one video's scratch work at its own directory, or back at the inherited root.
    ///
    /// An empty path means inherit. The caller checks retained work first; this method only
    /// persists the choice so a stale path cannot be written by accident.
    pub(crate) async fn update_temp_directory(
        &self,
        project_id: &str,
        video_id: &str,
        directory: Option<String>,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        record.temp_directory = directory
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// The full document, including the engine blob.
    pub(crate) async fn record(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<Option<VideoRecord>, StoreError> {
        valid_segment(project_id, "project")?;
        valid_segment(video_id, "video")?;
        read_record(&self.document(project_id, video_id)).await
    }

    /// Every document of one project. A damaged document is reported rather than skipped:
    /// silently dropping a video would lose the user's work from the queue.
    pub(crate) async fn records(&self, project_id: &str) -> Result<Vec<VideoRecord>, StoreError> {
        valid_segment(project_id, "project")?;
        let directory = self.directory(project_id);
        let Ok(mut entries) = tokio::fs::read_dir(&directory).await else {
            return Ok(Vec::new());
        };
        let mut records = Vec::new();
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| io_error("read the video directory", &directory, error))?
        {
            let path = entry.path();
            if path.extension().is_none_or(|extension| extension != "json") {
                continue;
            }
            if let Some(record) = read_record(&path).await? {
                records.push(record);
            }
        }
        records.sort_by_key(|record| record.order);
        Ok(records)
    }

    /// Remove one video document and the chunks that can no longer be reached through it.
    ///
    /// Retained chunks survive a run, but removing the video removes the only address that
    /// could list or delete them. Cleanup is best-effort and never blocks the document
    /// removal: a video the user asked to remove must not stay queued because a scratch
    /// file is held open.
    pub(crate) async fn delete(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<bool, StoreError> {
        valid_segment(project_id, "project")?;
        valid_segment(video_id, "video")?;
        let path = self.document(project_id, video_id);
        // Read the document before removing it: the scratch directory it names is the only
        // address the retained chunks have left once the document is gone.
        let temp_directory = self
            .record(project_id, video_id)
            .await
            .ok()
            .flatten()
            .and_then(|record| record.temp_directory);
        match tokio::fs::remove_file(&path).await {
            Ok(()) => {
                if let Err(error) = self
                    .remove_chunks(video_id, temp_directory.as_deref())
                    .await
                {
                    tracing::warn!(
                        video_id,
                        error = error.message(),
                        "the removed video's chunks could not be deleted"
                    );
                }
                Ok(true)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(io_error("remove the video", &path, error)),
        }
    }

    /// Replace the queue order.
    ///
    /// The request must name every video exactly once: a stale client that omits one would
    /// otherwise silently drop it from the queue, and a duplicate would make the order
    /// ambiguous. The documents are validated before any is written.
    pub(crate) async fn reorder(
        &self,
        project_id: &str,
        video_ids: &[String],
    ) -> Result<Vec<VideoSummary>, StoreError> {
        let records = self.records(project_id).await?;
        if records.len() != video_ids.len()
            || records.iter().any(|record| !video_ids.contains(&record.id))
        {
            return Err(StoreError::Invalid(
                "The new order must list every video in the queue exactly once.".to_owned(),
            ));
        }

        let mut by_id: BTreeMap<String, VideoRecord> = records
            .into_iter()
            .map(|record| (record.id.clone(), record))
            .collect();
        let mut rows = Vec::with_capacity(video_ids.len());
        for (order, id) in video_ids.iter().enumerate() {
            let Some(mut record) = by_id.remove(id) else {
                return Err(StoreError::Invalid(
                    "The new order must list every video in the queue exactly once.".to_owned(),
                ));
            };
            record.order = order as u32;
            write_document(&self.document(project_id, id), &record).await?;
            rows.push(record.summary());
        }
        Ok(rows)
    }

    /// Remove several videos. Every id is resolved before the first file is touched, so an
    /// unknown id rejects the whole request instead of removing a prefix of it.
    pub(crate) async fn remove_many(
        &self,
        project_id: &str,
        video_ids: &[String],
    ) -> Result<Vec<String>, StoreError> {
        let records = self.records(project_id).await?;
        for id in video_ids {
            if !records.iter().any(|record| &record.id == id) {
                return Err(StoreError::Invalid(format!(
                    "No video in this project matches {id}."
                )));
            }
        }

        let mut removed = Vec::with_capacity(video_ids.len());
        for id in video_ids {
            self.delete(project_id, id).await?;
            removed.push(id.clone());
        }
        Ok(removed)
    }

    /// Replace one video's sparse overrides.
    pub(crate) async fn replace_overrides(
        &self,
        project_id: &str,
        video_id: &str,
        overrides: BTreeMap<String, Value>,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        record.overrides = overrides;
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// Write one encoder document into the selected engine scenes.
    ///
    /// A scene's encoder is required by the engine, not an `Option`: replacing it is the
    /// only way to reset a scene to the video's encoder. All indices are checked before the
    /// first scene is changed, so a stale selection rejects the whole request instead of
    /// applying a prefix of it.
    pub(crate) async fn set_scene_encoders(
        &self,
        project_id: &str,
        video_id: &str,
        scenes: &[u32],
        encoder: Value,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        let Some(list) = record
            .condor
            .as_mut()
            .and_then(|condor| condor.get_mut("scenes"))
            .and_then(Value::as_array_mut)
        else {
            return Err(StoreError::Invalid(
                "This video has no detected scenes to update.".to_owned(),
            ));
        };
        for index in scenes {
            let position = *index as usize;
            if position >= list.len() {
                return Err(StoreError::Invalid(format!(
                    "Scene {} does not exist in this video's {} scenes.",
                    index + 1,
                    list.len()
                )));
            }
        }
        for index in scenes {
            let position = *index as usize;
            if let Some(scene) = list.get_mut(position).and_then(Value::as_object_mut) {
                scene.insert("encoder".to_owned(), encoder.clone());
            }
        }
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// Drop every override, so each leaf inherits the project value again.
    pub(crate) async fn clear_overrides(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<Option<VideoRecord>, StoreError> {
        self.replace_overrides(project_id, video_id, BTreeMap::new())
            .await
    }

    /// Delete one video's encoded chunks and sidecars. Returns whether a directory was
    /// removed; a missing directory is not an error, so the action is idempotent.
    pub(crate) async fn remove_chunks(
        &self,
        video_id: &str,
        temp_directory: Option<&str>,
    ) -> Result<bool, StoreError> {
        valid_segment(video_id, "video")?;
        let directory = self.chunk_directory(video_id, temp_directory);
        match tokio::fs::remove_dir_all(&directory).await {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(io_error("remove the chunk directory", &directory, error)),
        }
    }

    /// Delete finished scene chunk files, leaving probe and benchmark directories alone.
    ///
    /// `scenes` names the scenes a selection reset invalidated; `None` deletes every scene
    /// chunk after detection clears the table. Partial `.temp.` files go too, because an
    /// encoder may have left one behind for a scene that is about to be re-encoded.
    pub(crate) async fn remove_scene_chunk_files(
        &self,
        video_id: &str,
        temp_directory: Option<&str>,
        scenes: Option<&[u32]>,
    ) -> Result<usize, StoreError> {
        valid_segment(video_id, "video")?;
        let directory = self.chunk_directory(video_id, temp_directory);
        let mut entries = match tokio::fs::read_dir(&directory).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
            Err(error) => return Err(io_error("read the chunk directory", &directory, error)),
        };
        let mut removed = 0;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(file_type) = entry.file_type().await else {
                continue;
            };
            if !file_type.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let selected = scenes.is_none_or(|scenes| {
                scenes.iter().any(|scene| {
                    chunk_is_scene(&name, *scene as usize) || {
                        name.starts_with(&format!("{:>05}.", *scene))
                            || name.starts_with(&format!("{:>05}.temp.", *scene))
                    }
                })
            });
            if !selected {
                continue;
            }
            match tokio::fs::remove_file(entry.path()).await {
                Ok(()) => removed += 1,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(io_error("remove a scene chunk", &entry.path(), error));
                }
            }
        }
        Ok(removed)
    }

    /// Delete one directory under the video's scratch root, if it exists.
    pub(crate) async fn remove_scratch_directory(
        &self,
        video_id: &str,
        temp_directory: Option<&str>,
        name: &str,
    ) -> Result<bool, StoreError> {
        valid_segment(video_id, "video")?;
        let directory = self.chunk_directory(video_id, temp_directory).join(name);
        match tokio::fs::remove_dir_all(&directory).await {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(io_error("remove a scratch directory", &directory, error)),
        }
    }

    /// Bytes retained under one video's temporary directory.
    pub(crate) async fn retained_bytes(&self, video_id: &str, temp_directory: Option<&str>) -> u64 {
        if valid_segment(video_id, "video").is_err() {
            return 0;
        }
        directory_size(&self.chunk_directory(video_id, temp_directory)).await
    }

    /// The chunk file names present on disk, which is what makes encoded-scene progress
    /// derivable without instantiating a `Condor`.
    pub(crate) async fn chunk_files(
        &self,
        video_id: &str,
        temp_directory: Option<&str>,
    ) -> Vec<String> {
        let directory = self.chunk_directory(video_id, temp_directory);
        let Ok(mut entries) = tokio::fs::read_dir(&directory).await else {
            return Vec::new();
        };
        let mut names = Vec::new();
        while let Ok(Some(entry)) = entries.next_entry().await {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
        names.sort();
        names
    }

    /// The chunk files and their sizes, so the scene rail can show what each scene costs
    /// without a second directory walk per scene.
    pub(crate) async fn chunk_sizes(
        &self,
        video_id: &str,
        temp_directory: Option<&str>,
    ) -> Vec<(String, u64)> {
        let directory = self.chunk_directory(video_id, temp_directory);
        let Ok(mut entries) = tokio::fs::read_dir(&directory).await else {
            return Vec::new();
        };
        let mut files = Vec::new();
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name().to_string_lossy().into_owned();
            let bytes = entry
                .metadata()
                .await
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            files.push((name, bytes));
        }
        files.sort_by(|left, right| left.0.cmp(&right.0));
        files
    }

    /// Whether one scene's chunk exists, matched by the engine's `NNNNN.` scene id so the
    /// encoder's own output extension does not have to be guessed.
    pub(crate) fn chunk_present(chunks: &[String], scene: usize) -> bool {
        chunks.iter().any(|name| chunk_is_scene(name, scene))
    }

    /// The file name of one scene's retained chunk, when a finished one exists.
    ///
    /// The Encoded preview copies this file instead of re-encoding the scene the run has
    /// already encoded, so it needs the name rather than only its size.
    pub(crate) fn chunk_file(chunks: &[String], scene: usize) -> Option<&str> {
        chunks
            .iter()
            .find(|name| chunk_is_scene(name, scene))
            .map(String::as_str)
    }

    /// The size of one scene's retained chunk, when a finished one exists.
    pub(crate) fn chunk_bytes(chunks: &[(String, u64)], scene: usize) -> Option<u64> {
        chunks
            .iter()
            .find(|(name, _)| chunk_is_scene(name, scene))
            .map(|(_, bytes)| *bytes)
    }

    /// Replace the checkpoint after a user action such as a sequence reset or a scene edit.
    ///
    /// Configuration writes are refused while a run holds the lock, so this only races a
    /// checkpoint when called from route code that forgot that check. The atomic write keeps
    /// the last good document either way.
    pub(crate) async fn replace_condor(
        &self,
        project_id: &str,
        video_id: &str,
        blob: &Value,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        record.condor = Some(blob.clone());
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// Replace one scene's custom sequence data; an empty map removes the entry.
    ///
    /// The caller has already checked the run lock and the scene index. Writing the whole
    /// document in one request is what lets the editor remove a pair and keep the rest.
    pub(crate) async fn set_scene_custom_data(
        &self,
        project_id: &str,
        video_id: &str,
        scene: u32,
        values: BTreeMap<String, Value>,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        if values.is_empty() {
            record.custom_scene_data.remove(&scene);
        } else {
            record.custom_scene_data.insert(scene, values);
        }
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// Replace the checkpoint after an edit that renumbers scenes.
    ///
    /// An insertion or deletion shifts every later index, so the pairs no longer belong to
    /// the row their key names; this is the same reason those edits delete the chunks. The
    /// pair map is cleared in the same atomic write as the table, so no reader can observe a
    /// new table beside another scene's custom data.
    pub(crate) async fn replace_condor_renumbering_scenes(
        &self,
        project_id: &str,
        video_id: &str,
        blob: &Value,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        record.custom_scene_data.clear();
        record.condor = Some(blob.clone());
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// Replace the checkpoint after a structural scene edit and remember what it replaced.
    ///
    /// The snapshot is the scene matrix, not the whole blob: a split, merge, delete or range
    /// edit leaves the input, output and top-level encoder documents untouched. One step is
    /// kept; a second structural edit overwrites the entry, so undo always means "the table
    /// as it was before this action" rather than a rewind that can contradict the chunks on
    /// disk.
    pub(crate) async fn replace_condor_with_undo(
        &self,
        project_id: &str,
        video_id: &str,
        blob: &Value,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        record.scene_undo = Some(previous_scenes(record.condor.as_ref()));
        record.condor = Some(blob.clone());
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// Put back the scene table the last structural edit replaced.
    ///
    /// `None` means this video has no edit to undo. The restored table is validated through
    /// `restore_scene_table`, so a snapshot written by an older engine cannot be installed
    /// blindly. Retained chunks are not restored: a structural edit removed what no longer
    /// matched a scene, and the next encode writes them again.
    pub(crate) async fn undo_scene_edit(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<Option<VideoRecord>, StoreError> {
        let Some(mut record) = self.record(project_id, video_id).await? else {
            return Ok(None);
        };
        let Some(snapshot) = record.scene_undo.take() else {
            return Ok(None);
        };
        let Some(condor) = record.condor.clone() else {
            return Ok(None);
        };
        let restored = av1ation_engine::run::reset::restore_scene_table(&condor, &snapshot)
            .map_err(StoreError::Corrupt)?;
        record.condor = Some(restored);
        write_document(&self.document(project_id, video_id), &record).await?;
        Ok(Some(record))
    }

    /// Persist the engine's checkpoint blob from the thread that owns the engine.
    ///
    /// This is the one write that happens while a run is active, and it must be a whole
    /// document replace: the file is the engine's own state, and a torn write would lose the
    /// scenes a cancel is supposed to keep.
    pub(crate) fn write_condor_blocking(
        &self,
        project_id: &str,
        video_id: &str,
        blob: &Value,
    ) -> Result<(), String> {
        valid_segment(project_id, "project").map_err(|error| error.message())?;
        valid_segment(video_id, "video").map_err(|error| error.message())?;
        let path = self.document(project_id, video_id);
        let mut record = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<VideoRecord>(&text).ok())
            .ok_or_else(|| format!("the video document {} is not readable", path.display()))?;
        record.condor = Some(blob.clone());
        // A checkpoint is a new engine result, not an edit of the previous scene table.
        record.scene_undo = None;
        let bytes = serde_json::to_vec_pretty(&record)
            .map_err(|error| format!("the video document could not be serialised: {error}"))?;
        atomic::write_blocking(&path, &bytes)
            .map_err(|error| format!("the engine state could not be written: {error}"))
    }

    async fn project_exists(&self, project_id: &str) -> bool {
        tokio::fs::try_exists(self.projects.join(project_id).join("project.json"))
            .await
            .unwrap_or(false)
    }
}
