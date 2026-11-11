use super::*;

impl ProjectStore {
    /// Root every project under the app-data directory the host resolved.
    pub(crate) fn new(data_dir: impl AsRef<Path>) -> Self {
        let data_dir = data_dir.as_ref();
        Self {
            projects: data_dir.join("projects"),
            index: data_dir.join("index.json"),
            accessed: Arc::new(Mutex::new(HashMap::new())),
            index_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    /// Create a project, copying the supplied default configuration into it.
    ///
    /// The config is copied, never referenced: a later edit to the defaults must not change
    /// an existing project.
    pub(crate) async fn create(
        &self,
        name: &str,
        description: Option<&str>,
        config: Value,
        general: GeneralDefaults,
    ) -> Result<Project, StoreError> {
        let name = valid_name(name)?;
        let description = valid_description(description)?;
        let general = validate_general(&general)?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_epoch();
        let record = ProjectRecord {
            schema_version: SCHEMA_VERSION,
            id: id.clone(),
            name,
            description,
            created_at: now,
            accessed_at: now,
            config_updated_at: Some(now),
            config,
            general,
        };

        let directory = self.projects.join(&id);
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(|error| io_error("create the project directory", &directory, error))?;
        if let Err(error) = write_document(&directory.join("project.json"), &record).await {
            // A directory without a document is not a project; leaving one behind makes the
            // failure permanent rubbish on disk.
            let _ = tokio::fs::remove_dir_all(&directory).await;
            return Err(error);
        }
        self.record_access(&id, now);
        self.rewrite_index().await?;
        Ok(project_from(&record, now))
    }

    /// Every project summary, newest-created first.
    ///
    /// The cache supplies the identity fields; the filesystem decides what still exists and
    /// how large it is. An entry whose directory is gone is dropped rather than served, so
    /// Home never links to a project that answers `404`, and a corrupt cache costs one scan
    /// rather than an empty screen.
    pub(crate) async fn list(&self) -> Result<Vec<ProjectSummary>, StoreError> {
        let mut summaries = match self.read_index().await {
            Some(index) => self.present(index.projects).await,
            None => {
                let summaries = self.scan().await?;
                self.write_index(&summaries).await;
                summaries
            }
        };
        self.apply_access(&mut summaries);
        summaries.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(summaries)
    }

    /// One project. Opening it records the access time in memory only: a read must not write,
    /// because a write here recreates the directory a concurrent DELETE just removed.
    pub(crate) async fn get(&self, id: &str) -> Result<Option<Project>, StoreError> {
        valid_id(id)?;
        let path = self.projects.join(id).join("project.json");
        let Some(record) = read_record(&path).await? else {
            return Ok(None);
        };

        let now = now_epoch();
        self.record_access(id, now);
        Ok(Some(project_from(&record, now)))
    }

    /// Rename a project and/or replace its description. An empty description clears it.
    /// The project's stored configuration document, as the engine last wrote it.
    ///
    /// This is what a run materialises: an encode reads the stored document plus the video's
    /// overrides, never the resolved leaf map, so the worker owns one immutable snapshot.
    pub(crate) async fn document(&self, id: &str) -> Result<Option<Value>, StoreError> {
        valid_id(id)?;
        let path = self.projects.join(id).join("project.json");
        let Some(record) = read_record(&path).await? else {
            return Ok(None);
        };
        if !record.config.is_object() {
            return Err(StoreError::Corrupt(format!(
                "{} carries a configuration that is not a JSON object",
                path.display()
            )));
        }
        self.record_access(id, now_epoch());
        Ok(Some(record.config))
    }

    /// Resolve one project's effective configuration with the supplied video overrides.
    ///
    /// Resolution is pure and a read never writes: the access time stays in memory until the
    /// next mutation, exactly like `get`.
    pub(crate) async fn config(
        &self,
        id: &str,
        overrides: &BTreeMap<String, Value>,
    ) -> Result<Option<EffectiveConfig>, StoreError> {
        valid_id(id)?;
        let path = self.projects.join(id).join("project.json");
        let Some(record) = read_record(&path).await? else {
            return Ok(None);
        };
        if !record.config.is_object() {
            return Err(StoreError::Corrupt(format!(
                "{} carries a configuration that is not a JSON object",
                path.display()
            )));
        }

        let defaults = default_config();
        if !overrides.is_empty() {
            let paths = crate::project::config::leaf_paths(&defaults);
            let known: std::collections::BTreeSet<&str> =
                paths.iter().map(String::as_str).collect();
            if let Some(path) = overrides.keys().find(|path| {
                !known.contains(path.as_str())
                    && !crate::project::config::accepts_override(&defaults, path)
            }) {
                return Err(StoreError::Invalid(format!(
                    "`{path}` is not a configuration field or section."
                )));
            }
        }

        self.record_access(id, now_epoch());
        let mut resolved = crate::project::config::resolve(&defaults, &record.config, overrides);
        resolved.updated_at = record.config_updated_at.map(iso8601);
        Ok(Some(resolved))
    }

    /// Replace a project's configuration and return the resolved result.
    ///
    /// The document is normalised to the engine's full shape before it is stored, so a
    /// sparse save cannot turn into a partial document that a later read has to guess at.
    pub(crate) async fn replace_config(
        &self,
        id: &str,
        document: Value,
    ) -> Result<Option<EffectiveConfig>, StoreError> {
        valid_id(id)?;
        let path = self.projects.join(id).join("project.json");
        let Some(mut record) = read_record(&path).await? else {
            return Ok(None);
        };

        let defaults = default_config();
        crate::project::config::validate(&document, &defaults)
            .map_err(StoreError::InvalidConfig)?;
        let materialised =
            crate::project::config::materialise(&defaults, &document, &BTreeMap::new());

        let now = now_epoch();
        record.config = materialised;
        record.config_updated_at = Some(now);
        record.accessed_at = now;

        write_document(&path, &record).await?;
        self.record_access(id, now);
        self.rewrite_index().await?;

        let mut resolved =
            crate::project::config::resolve(&defaults, &record.config, &BTreeMap::new());
        resolved.updated_at = Some(iso8601(now));
        Ok(Some(resolved))
    }

    /// Rename a project and/or replace its description. An empty description clears it.
    pub(crate) async fn update(
        &self,
        id: &str,
        name: Option<&str>,
        description: Option<&str>,
    ) -> Result<Option<Project>, StoreError> {
        valid_id(id)?;
        let path = self.projects.join(id).join("project.json");
        let Some(mut record) = read_record(&path).await? else {
            return Ok(None);
        };

        if let Some(name) = name {
            record.name = valid_name(name)?;
        }
        if let Some(description) = description {
            record.description = valid_description(Some(description))?;
        }
        let now = now_epoch();
        record.accessed_at = now;

        write_document(&path, &record).await?;
        self.record_access(id, now);
        self.rewrite_index().await?;
        Ok(Some(project_from(&record, now)))
    }

    /// Replace the General defaults and return the project.
    ///
    /// The output folder is normalised and checked here, not in the form: a client that
    /// sends a relative or missing folder is rejected with the same message the UI shows.
    pub(crate) async fn update_general(
        &self,
        id: &str,
        general: &GeneralDefaults,
    ) -> Result<Option<Project>, StoreError> {
        valid_id(id)?;
        let path = self.projects.join(id).join("project.json");
        let Some(mut record) = read_record(&path).await? else {
            return Ok(None);
        };

        let general = validate_general(general)?;
        let now = now_epoch();
        record.general = general;
        record.config_updated_at = Some(now);
        record.accessed_at = now;

        write_document(&path, &record).await?;
        self.record_access(id, now);
        self.rewrite_index().await?;
        Ok(Some(project_from(&record, now)))
    }

    /// Replace a project's configuration and General section in one atomic write.
    ///
    /// Applying a template and undoing it both need the two documents to move together: a
    /// project that kept its old General while taking a new configuration would add videos
    /// with the wrong input for the configuration it now holds. The previous documents are
    /// returned so the caller can offer one exact undo without a second racy read.
    pub(crate) async fn replace_defaults(
        &self,
        id: &str,
        config: &Value,
        general: &GeneralDefaults,
    ) -> Result<Option<(Project, ProjectDefaultsState)>, StoreError> {
        valid_id(id)?;
        let path = self.projects.join(id).join("project.json");
        let Some(mut record) = read_record(&path).await? else {
            return Ok(None);
        };

        let defaults = default_config();
        crate::project::config::validate(config, &defaults).map_err(StoreError::InvalidConfig)?;
        let materialised = crate::project::config::materialise(&defaults, config, &BTreeMap::new());
        let general = validate_general(general)?;
        let previous = ProjectDefaultsState {
            config: record.config.clone(),
            general: record.general.clone(),
        };

        let now = now_epoch();
        record.config = materialised;
        record.general = general;
        record.config_updated_at = Some(now);
        record.accessed_at = now;
        write_document(&path, &record).await?;
        self.record_access(id, now);
        self.rewrite_index().await?;
        Ok(Some((project_from(&record, now), previous)))
    }

    /// Delete a project directory. Returns whether it existed.
    pub(crate) async fn delete(&self, id: &str) -> Result<bool, StoreError> {
        valid_id(id)?;
        let directory = self.projects.join(id);
        match tokio::fs::remove_dir_all(&directory).await {
            Ok(()) => {
                self.forget_access(id);
                self.rewrite_index().await?;
                Ok(true)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(io_error("delete the project", &directory, error)),
        }
    }

    /// Keep only cached entries whose document is still on disk, refreshed from the
    /// filesystem instead of replayed. The size is measured now because files change
    /// underneath a cache.
    async fn present(&self, cached: Vec<ProjectSummary>) -> Vec<ProjectSummary> {
        let mut kept = Vec::with_capacity(cached.len());
        for mut summary in cached {
            if valid_id(&summary.id).is_err() {
                continue;
            }
            let directory = self.projects.join(&summary.id);
            if !matches!(
                tokio::fs::try_exists(directory.join("project.json")).await,
                Ok(true)
            ) {
                continue;
            }
            summary.path = directory.to_string_lossy().into_owned();
            summary.size_bytes = directory_size(&directory).await;
            kept.push(summary);
        }
        kept
    }

    /// Record an access time without touching the disk; the next rewrite persists it.
    fn record_access(&self, id: &str, epoch: u64) {
        self.access_times().insert(id.to_owned(), epoch);
    }

    fn forget_access(&self, id: &str) {
        self.access_times().remove(id);
    }

    /// Overlay access times recorded since the cache was written.
    fn apply_access(&self, summaries: &mut [ProjectSummary]) {
        let accessed = self.access_times();
        for summary in summaries {
            if let Some(epoch) = accessed.get(&summary.id) {
                summary.accessed_at = iso8601(*epoch);
            }
        }
    }

    fn access_times(&self) -> std::sync::MutexGuard<'_, HashMap<String, u64>> {
        self.accessed
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    async fn read_index(&self) -> Option<ProjectIndex> {
        let text = tokio::fs::read_to_string(&self.index).await.ok()?;
        let index: ProjectIndex = serde_json::from_str(&text).ok()?;
        (index.schema_version == INDEX_VERSION).then_some(index)
    }

    async fn write_index(&self, projects: &[ProjectSummary]) {
        let index = ProjectIndex {
            schema_version: INDEX_VERSION,
            projects: projects.to_vec(),
        };
        if let Err(error) = write_document(&self.index, &index).await {
            tracing::warn!(%error, "the project index could not be written");
        }
    }

    async fn rewrite_index(&self) -> Result<(), StoreError> {
        let _guard = self.index_lock.lock().await;
        let mut summaries = self.scan().await?;
        // Persist what this process has observed, so a restart does not lose recency.
        self.apply_access(&mut summaries);
        self.write_index(&summaries).await;
        Ok(())
    }

    /// Read every project document. An unreadable or newer document is skipped for the
    /// list rather than failing the whole screen; opening it directly still reports why.
    async fn scan(&self) -> Result<Vec<ProjectSummary>, StoreError> {
        let mut entries = match tokio::fs::read_dir(&self.projects).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                return Err(io_error(
                    "read the projects directory",
                    &self.projects,
                    error,
                ));
            }
        };

        let mut summaries = Vec::new();
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| io_error("read the projects directory", &self.projects, error))?
        {
            if !entry
                .file_type()
                .await
                .map(|kind| kind.is_dir())
                .unwrap_or(false)
            {
                continue;
            }
            let directory = entry.path();
            let Ok(Some(record)) = read_record(&directory.join("project.json")).await else {
                continue;
            };
            let size_bytes = directory_size(&directory).await;
            summaries.push(summary_from(&record, &directory, size_bytes));
        }

        summaries.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(summaries)
    }
}
