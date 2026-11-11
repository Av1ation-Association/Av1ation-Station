//! Per-run JSONL logs and the anonymised export built from them.
//!
//! A run's log lives at `<app-data>/logs/<run>/run.jsonl` beside a `meta.json` that names
//! the project and video the run belongs to. The writer runs on the run's own event thread,
//! never inside an async task, so a slow disk delays a log line and not the encoder.
//!
//! The raw engine log (the encoder's own stderr) is not captured yet: the engine writes it
//! in-process, so it cannot be redirected without changing the pinned engine. These records
//! are the service's own event view of the run, which is what the viewer and the export use
//! today.

use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use av1ation_contracts::platform::{LogPage, LogRecord};

use crate::{platform::atomic, project::videos::iso8601};

/// What a run's log directory records about the run itself.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct LogMeta {
    pub(crate) run_id: String,
    pub(crate) project_id: String,
    pub(crate) video_id: String,
    pub(crate) started_at: String,
}

/// An open append-only run log.
///
/// The file is written without a userspace buffer: a viewer polling the paging endpoint
/// while the run is live must see the lines the event stream has already reported.
pub(crate) struct RunLog {
    file: File,
}

impl RunLog {
    /// Append one record.
    pub(crate) fn append(&mut self, record: &LogRecord) -> std::io::Result<()> {
        let mut line = serde_json::to_vec(record).map_err(std::io::Error::other)?;
        line.push(b'\n');
        self.file.write_all(&line)
    }
}

/// The run-log directory the service and its export endpoint share.
#[derive(Debug, Clone)]
pub(crate) struct LogStore {
    root: PathBuf,
}

/// The optional narrowing a viewer applies before paging.
#[derive(Debug, Clone, Default)]
pub(crate) struct LogFilter<'a> {
    /// Any of the levels to keep. Empty means every level.
    pub(crate) levels: Option<&'a [&'a str]>,
    /// Case-insensitive substring of the message or sequence name.
    pub(crate) query: Option<&'a str>,
}

/// A viewer-chosen column order.
///
/// Sorting happens before the page is sliced, so the scrollbar and its offsets describe the
/// ordered result rather than one page reordered in the browser.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) enum LogSort {
    #[default]
    Seq,
    Time,
    Level,
    Sequence,
    Message,
}

impl LogSort {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "" | "seq" => Some(Self::Seq),
            "time" => Some(Self::Time),
            "level" => Some(Self::Level),
            "sequence" => Some(Self::Sequence),
            "message" => Some(Self::Message),
            _ => None,
        }
    }
}

/// Serverity order for the viewer's level column.
///
/// Trace and debug are real ranks, not aliases for info: a run's evidence is mostly debug,
/// and sorting that mixed it into the summaries would make the level sort useless.
fn level_rank(level: &str) -> u8 {
    match level {
        "error" => 4,
        "warn" => 3,
        "info" => 2,
        "debug" => 1,
        _ => 0,
    }
}

impl LogFilter<'_> {
    /// `needle` is the lower-cased query, computed once for the whole page rather than once
    /// per record.
    fn matches(&self, record: &LogRecord, needle: Option<&str>) -> bool {
        if let Some(levels) = self.levels
            && !levels.is_empty()
            && !levels
                .iter()
                .any(|level| record.level.eq_ignore_ascii_case(level))
        {
            return false;
        }
        let Some(needle) = needle else {
            return true;
        };
        record.message.to_lowercase().contains(needle)
            || record
                .sequence
                .as_deref()
                .is_some_and(|sequence| sequence.to_lowercase().contains(needle))
    }
}

impl LogStore {
    pub(crate) fn new(data_dir: impl AsRef<Path>) -> Self {
        Self {
            root: data_dir.as_ref().join("logs"),
        }
    }

    /// Every run that has a log for one video, newest first.
    ///
    /// The log directory, not the timeline, is the index: a run that failed before its first
    /// sequence has a log and a terminal record but no sequence entries, and an older run may
    /// have a timeline record after its log was removed. Listing what can actually be opened
    /// keeps the selector honest.
    pub(crate) async fn runs(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> std::io::Result<Vec<LogMeta>> {
        let mut directory = match tokio::fs::read_dir(&self.root).await {
            Ok(directory) => directory,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        let mut runs = Vec::new();
        while let Some(entry) = directory.next_entry().await? {
            if !entry.file_type().await?.is_dir() {
                continue;
            }
            let Ok(bytes) = tokio::fs::read(entry.path().join("meta.json")).await else {
                continue;
            };
            let Ok(meta) = serde_json::from_slice::<LogMeta>(&bytes) else {
                continue;
            };
            if meta.project_id == project_id && meta.video_id == video_id {
                runs.push(meta);
            }
        }
        runs.sort_by(|left, right| {
            right
                .started_at
                .cmp(&left.started_at)
                .then_with(|| right.run_id.cmp(&left.run_id))
        });
        Ok(runs)
    }

    fn directory(&self, run_id: &str) -> Option<PathBuf> {
        let valid = !run_id.is_empty()
            && run_id.len() <= 64
            && run_id
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '-');
        valid.then(|| self.root.join(run_id))
    }

    /// Create a run's directory and write its metadata. Called before the worker starts, so
    /// a run that panics immediately still has a meta record.
    pub(crate) fn open(&self, meta: &LogMeta) -> std::io::Result<RunLog> {
        let directory = self.directory(&meta.run_id).ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "unusable run id")
        })?;
        std::fs::create_dir_all(&directory)?;
        let bytes = serde_json::to_vec_pretty(meta).map_err(std::io::Error::other)?;
        atomic::write_blocking(&directory.join("meta.json"), &bytes)?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("run.jsonl"))?;
        Ok(RunLog { file })
    }

    /// One page of a run's records. `None` means no log directory exists for that run.
    ///
    /// `offset` of `None` reads the tail, which is how a viewer opens a 30k-line log at the
    /// place it cares about. The total is the filtered count, so a search sizes its scrollbar
    /// by its matches rather than by the whole file.
    pub(crate) async fn page(
        &self,
        run_id: &str,
        offset: Option<u64>,
        limit: usize,
        filter: LogFilter<'_>,
        sort: LogSort,
        descending: bool,
    ) -> std::io::Result<Option<LogPage>> {
        let Some(directory) = self.directory(run_id) else {
            return Ok(None);
        };
        let path = directory.join("run.jsonl");
        let text = match tokio::fs::read_to_string(&path).await {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if tokio::fs::try_exists(directory.join("meta.json")).await? {
                    return Ok(Some(LogPage {
                        records: Vec::new(),
                        total: 0,
                        next_offset: None,
                    }));
                }
                return Ok(None);
            }
            Err(error) => return Err(error),
        };
        let needle = filter.query.map(str::to_lowercase);
        let mut records: Vec<LogRecord> = text
            .lines()
            .filter_map(|line| serde_json::from_str::<LogRecord>(line).ok())
            .filter(|record| filter.matches(record, needle.as_deref()))
            .collect();
        match sort {
            LogSort::Seq => {}
            LogSort::Time => records.sort_by(|left, right| left.at.cmp(&right.at)),
            LogSort::Level => {
                records.sort_by_key(|record| level_rank(&record.level));
            }
            LogSort::Sequence => {
                records.sort_by(|left, right| left.sequence.cmp(&right.sequence));
            }
            LogSort::Message => {
                records.sort_by(|left, right| left.message.cmp(&right.message));
            }
        }
        if descending {
            records.reverse();
        }
        let total = records.len() as u64;
        let start = match offset {
            Some(offset) => (offset as usize).min(records.len()),
            None => records.len().saturating_sub(limit),
        };
        let end = start.saturating_add(limit).min(records.len());
        Ok(Some(LogPage {
            records: records[start..end].to_vec(),
            total,
            next_offset: (offset.is_some() && end < records.len()).then_some(end as u64),
        }))
    }

    /// Remove one run's log directory.
    ///
    /// `Ok(false)` means there was nothing to remove, which the route answers as `404`.
    /// Existence is the directory, never the timeline: history keeps its record after this.
    /// The caller decides whether the run may be deleted, because this store does not know
    /// which run is live and must not guess.
    pub(crate) async fn remove(&self, run_id: &str) -> std::io::Result<bool> {
        let Some(directory) = self.directory(run_id) else {
            return Ok(false);
        };
        match tokio::fs::remove_dir_all(&directory).await {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error),
        }
    }

    /// The whole run log, for an export preview.
    pub(crate) async fn export_text(&self, run_id: &str) -> std::io::Result<Option<String>> {
        let Some(directory) = self.directory(run_id) else {
            return Ok(None);
        };
        let text = match tokio::fs::read_to_string(directory.join("run.jsonl")).await {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(tokio::fs::try_exists(directory.join("meta.json"))
                    .await?
                    .then(String::new));
            }
            Err(error) => return Err(error),
        };
        Ok(Some(text))
    }
}

/// Build the log record for one engine event.
///
/// The scope is always `run`: every line the engine emits belongs to exactly one video, and
/// that attribution is what lets the viewer filter by video without a second index.
pub(crate) fn record_for(
    event: &av1ation_engine::EncodeEvent,
    project_id: &str,
    video_id: &str,
) -> LogRecord {
    LogRecord {
        seq: event.seq,
        at: if event.at.is_empty() {
            iso8601(crate::run::timeline::now_epoch())
        } else {
            event.at.clone()
        },
        // The engine says how loud a line is: a per-scene result is debug and a progress
        // tick is trace. A lifecycle event keeps the severity its kind implies.
        level: event.level.clone().unwrap_or_else(|| {
            match event.kind {
                av1ation_engine::EncodeEventKind::Failed => "error",
                av1ation_engine::EncodeEventKind::Cancelled
                | av1ation_engine::EncodeEventKind::Warning => "warn",
                _ => "info",
            }
            .to_owned()
        }),
        scope: "run".to_owned(),
        run_id: event.run_id.clone(),
        video_id: video_id.to_owned(),
        project_id: project_id.to_owned(),
        sequence: event
            .sequence
            .as_deref()
            .map(crate::project::derive::sequence_name)
            .map(str::to_owned),
        message: event.message.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_dir() -> PathBuf {
        std::env::temp_dir().join(format!("av1ation-logs-{}", uuid::Uuid::new_v4()))
    }

    fn record(seq: u64, message: &str) -> LogRecord {
        LogRecord {
            seq,
            at: "2026-01-01T00:00:00Z".to_owned(),
            level: "info".to_owned(),
            scope: "run".to_owned(),
            run_id: "run-1".to_owned(),
            video_id: "video-1".to_owned(),
            project_id: "project-1".to_owned(),
            sequence: Some("SceneDetector".to_owned()),
            message: message.to_owned(),
        }
    }

    #[tokio::test]
    async fn removal_deletes_only_the_named_run() {
        let dir = temporary_dir();
        let store = LogStore::new(&dir);
        for run_id in ["run-1", "run-2"] {
            let meta = LogMeta {
                run_id: run_id.to_owned(),
                project_id: "project-1".to_owned(),
                video_id: "video-1".to_owned(),
                started_at: "2026-01-01T00:00:00Z".to_owned(),
            };
            let mut log = store.open(&meta).expect("open");
            log.append(&record(0, "line")).expect("append");
        }

        assert!(store.remove("run-1").await.expect("remove"));
        assert!(!dir.join("logs").join("run-1").exists());
        assert!(
            dir.join("logs").join("run-2").join("run.jsonl").exists(),
            "another run's log is untouched"
        );
        assert!(
            !store.remove("run-1").await.expect("second remove"),
            "a second delete finds nothing to remove"
        );
        assert!(
            !store.remove("../escape").await.expect("invalid id"),
            "an unusable id is a miss, not a path outside the log root"
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_run_log_pages_records_and_reports_the_total() {
        let dir = temporary_dir();
        let store = LogStore::new(&dir);
        let meta = LogMeta {
            run_id: "run-1".to_owned(),
            project_id: "project-1".to_owned(),
            video_id: "video-1".to_owned(),
            started_at: "2026-01-01T00:00:00Z".to_owned(),
        };
        let mut log = store.open(&meta).expect("open");
        for seq in 0..5 {
            log.append(&record(seq, &format!("line {seq}")))
                .expect("append");
        }
        drop(log);

        let page = store
            .page(
                "run-1",
                Some(0),
                2,
                LogFilter::default(),
                LogSort::Seq,
                false,
            )
            .await
            .expect("page")
            .expect("run");
        assert_eq!(page.records.len(), 2);
        assert_eq!(page.total, 5);
        assert_eq!(page.next_offset, Some(2));

        let last = store
            .page(
                "run-1",
                Some(4),
                10,
                LogFilter::default(),
                LogSort::Seq,
                false,
            )
            .await
            .expect("page")
            .expect("run");
        assert_eq!(last.records.len(), 1);
        assert_eq!(last.next_offset, None);

        let tail = store
            .page("run-1", None, 2, LogFilter::default(), LogSort::Seq, false)
            .await
            .expect("page")
            .expect("run");
        assert_eq!(tail.total, 5);
        assert_eq!(tail.records.len(), 2);
        assert_eq!(tail.records[0].seq, 3);
        assert_eq!(
            tail.next_offset, None,
            "the tail is the end of the filtered list"
        );

        assert!(
            store
                .page(
                    "missing",
                    Some(0),
                    10,
                    LogFilter::default(),
                    LogSort::Seq,
                    false
                )
                .await
                .expect("page")
                .is_none()
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_filter_narrows_the_total_and_the_page_before_slicing() {
        let dir = temporary_dir();
        let store = LogStore::new(&dir);
        let meta = LogMeta {
            run_id: "run-1".to_owned(),
            project_id: "project-1".to_owned(),
            video_id: "video-1".to_owned(),
            started_at: "2026-01-01T00:00:00Z".to_owned(),
        };
        let mut log = store.open(&meta).expect("open");
        log.append(&record(0, "scene detector started"))
            .expect("append");
        let mut warning = record(1, "mkvmerge is missing");
        warning.level = "warn".to_owned();
        warning.sequence = Some("SceneConcatenator".to_owned());
        log.append(&warning).expect("append");
        let mut error = record(2, "encoder exited with 1");
        error.level = "error".to_owned();
        error.sequence = Some("ParallelEncoder".to_owned());
        log.append(&error).expect("append");
        drop(log);

        let warnings = store
            .page(
                "run-1",
                Some(0),
                10,
                LogFilter {
                    levels: Some(&["warn"]),
                    query: None,
                },
                LogSort::Seq,
                false,
            )
            .await
            .expect("page")
            .expect("run");
        assert_eq!(warnings.total, 1);
        assert_eq!(warnings.records[0].seq, 1);

        let search = store
            .page(
                "run-1",
                None,
                10,
                LogFilter {
                    levels: None,
                    query: Some("MKVMERGE"),
                },
                LogSort::Seq,
                false,
            )
            .await
            .expect("page")
            .expect("run");
        assert_eq!(search.total, 1);
        assert_eq!(
            search.records[0].sequence.as_deref(),
            Some("SceneConcatenator"),
            "search also matches the sequence name"
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_sort_reorders_before_the_page_is_sliced() {
        let dir = temporary_dir();
        let store = LogStore::new(&dir);
        let meta = LogMeta {
            run_id: "run-1".to_owned(),
            project_id: "project-1".to_owned(),
            video_id: "video-1".to_owned(),
            started_at: "2026-01-01T00:00:00Z".to_owned(),
        };
        let mut log = store.open(&meta).expect("open");
        for (seq, level) in [(0, "info"), (1, "error"), (2, "warn")] {
            let mut entry = record(seq, "message");
            entry.level = level.to_owned();
            log.append(&entry).expect("append");
        }
        drop(log);

        let page = store
            .page(
                "run-1",
                Some(0),
                2,
                LogFilter::default(),
                LogSort::Level,
                true,
            )
            .await
            .expect("page")
            .expect("run");
        assert_eq!(page.total, 3);
        assert_eq!(
            page.records.len(),
            2,
            "the page is one slice of the sorted list"
        );
        assert_eq!(page.records[0].level, "error");
        assert_eq!(page.records[1].level, "warn");

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn runs_are_listed_newest_first_and_scoped_to_one_video() {
        let dir = temporary_dir();
        let store = LogStore::new(&dir);
        for (run_id, video_id, started_at) in [
            ("run-old", "video-1", "2026-01-01T00:00:00Z"),
            ("run-new", "video-1", "2026-01-02T00:00:00Z"),
            ("run-other", "video-2", "2026-01-03T00:00:00Z"),
        ] {
            let meta = LogMeta {
                run_id: run_id.to_owned(),
                project_id: "project-1".to_owned(),
                video_id: video_id.to_owned(),
                started_at: started_at.to_owned(),
            };
            let mut log = store.open(&meta).expect("open");
            log.append(&record(0, "line")).expect("append");
        }

        let runs = store.runs("project-1", "video-1").await.expect("list");
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].run_id, "run-new");
        assert_eq!(runs[1].run_id, "run-old");

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    /// One engine event of a given kind, with the fields the record builder reads.
    fn event(
        kind: av1ation_engine::EncodeEventKind,
        message: &str,
    ) -> av1ation_engine::EncodeEvent {
        av1ation_engine::EncodeEvent {
            run_id: "run-1".to_owned(),
            seq: 7,
            at: "2026-01-01T00:00:00Z".to_owned(),
            kind,
            sequence: Some("NoiseDetector".to_owned()),
            progress: None,
            message: message.to_owned(),
            level: None,
            frames_processed: None,
            frames_total: None,
            phase: None,
            pass: None,
            max_passes: None,
            scenes_processed: None,
            scenes_total: None,
            scene_index: None,
            scene_progress: None,
            scene_frames_processed: None,
            scene_frames_total: None,
            scene_bytes: None,
            scene_encode_ms: None,
            scene_noise: None,
            scene_quality: None,
            scene: None,
        }
    }

    #[test]
    fn a_detail_record_is_info_and_a_sequence_warning_is_warn() {
        use av1ation_engine::EncodeEventKind;

        let detail = record_for(
            &event(EncodeEventKind::Detail, "Scene 1: noise 0.0021"),
            "p",
            "v",
        );
        assert_eq!(detail.level, "info");
        assert_eq!(detail.sequence.as_deref(), Some("Noise Detector"));
        assert_eq!(detail.message, "Scene 1: noise 0.0021");
        assert_eq!(detail.seq, 7);

        let warning = record_for(
            &event(EncodeEventKind::Warning, "NoiseDetector: no reference"),
            "p",
            "v",
        );
        assert_eq!(
            warning.level, "warn",
            "a sequence warning must surface in the level filter"
        );

        let failed = record_for(&event(EncodeEventKind::Failed, "run failed"), "p", "v");
        assert_eq!(failed.level, "error");
    }

    #[test]
    fn a_path_like_run_id_is_never_opened() {
        let dir = temporary_dir();
        let store = LogStore::new(&dir);
        let meta = LogMeta {
            run_id: "../escape".to_owned(),
            project_id: "p".to_owned(),
            video_id: "v".to_owned(),
            started_at: String::new(),
        };
        assert!(store.open(&meta).is_err());
        assert!(!dir.join("escape").exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}
