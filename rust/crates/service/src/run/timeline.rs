//! The append-only video timeline: what happened, when, and how fast.
//!
//! Derived state answers "what is true now". It cannot answer whether Scene Detector ran
//! three times, or how long a cancelled encode took, because a finished sequence leaves its
//! output but not its duration. The timeline records that history; it never decides
//! whether a sequence's data exists. The only display facts it supplies are the last failed
//! attempt and the last run's failure reason.
//!
//! One JSON object per line, appended with a single write. A crash mid-write loses at most
//! the trailing partial line, which the reader ignores.

use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::Write as _,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::project::videos::iso8601;

/// One sequence attempt, or the run-level terminal record that closes a run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct TimelineEntry {
    pub(crate) run_id: String,
    /// The sequence attempt, or `None` for the run's terminal record.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) sequence: Option<String>,
    pub(crate) started_at: String,
    pub(crate) ended_at: String,
    /// `completed`, `cancelled`, or `failed`.
    pub(crate) outcome: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) frames_processed: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) frames_total: Option<u64>,
    /// Frames processed per second of wall-clock duration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) fps: Option<f64>,
    /// The engine's message for a terminal record, including the failure reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) message: Option<String>,
}

impl TimelineEntry {
    /// Whether this entry records a failure.
    pub(crate) fn failed(&self) -> bool {
        self.outcome == "failed"
    }

    /// The contract shape the History tab reads.
    ///
    /// The file's fields are copied as they are: history is a record of what happened, and
    /// a reader that reinterpreted timings would be inventing them.
    pub(crate) fn record(&self) -> av1ation_contracts::run::TimelineRecord {
        av1ation_contracts::run::TimelineRecord {
            run_id: self.run_id.clone(),
            sequence: self.sequence.clone(),
            started_at: self.started_at.clone(),
            ended_at: self.ended_at.clone(),
            outcome: self.outcome.clone(),
            frames_processed: self.frames_processed,
            frames_total: self.frames_total,
            fps: self.fps,
            message: self.message.clone(),
        }
    }
}

/// What the timeline says about the last attempt and the last run.
#[derive(Debug, Clone, Default)]
pub(crate) struct TimelineSummary {
    /// The sequence whose most recent attempt failed and has not since succeeded.
    pub(crate) failed_sequence: Option<String>,
    /// The latest run's terminal record, when that run failed. A newer completed or
    /// cancelled run replaces it, so a stale failure never outlives its run.
    pub(crate) failure: Option<TimelineEntry>,
    /// The sequence attempt that failed in that same run, when the run reached one. A
    /// failed sequence from an older run must not claim the current failure's card.
    pub(crate) failure_sequence: Option<String>,
    /// The source length the most recent Scene Detector attempt reported. It is evidence
    /// about the decode, not a phase: a checkpoint whose last scene ends before this total
    /// is a resumable prefix, not a completed detection.
    pub(crate) scene_detector_frames: Option<u64>,
}

/// The timeline files of every project.
#[derive(Debug, Clone)]
pub(crate) struct TimelineStore {
    projects: PathBuf,
}

impl TimelineStore {
    pub(crate) fn new(data_dir: impl AsRef<Path>) -> Self {
        Self {
            projects: data_dir.as_ref().join("projects"),
        }
    }

    /// `projects/<project>/videos/<video>/timeline.jsonl`.
    ///
    /// The document is `videos/<video>.json` and the history is the directory of the same
    /// stem beside it, so a video and its history travel together.
    fn path(&self, project_id: &str, video_id: &str) -> PathBuf {
        self.projects
            .join(project_id)
            .join("videos")
            .join(video_id)
            .join("timeline.jsonl")
    }

    /// Append one entry. Called from the run's own event thread, which is not an async
    /// context, so this is deliberately synchronous.
    pub(crate) fn append(
        &self,
        project_id: &str,
        video_id: &str,
        entry: &TimelineEntry,
    ) -> std::io::Result<()> {
        let path = self.path(project_id, video_id);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut line = serde_json::to_vec(entry).map_err(std::io::Error::other)?;
        line.push(b'\n');
        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
        file.write_all(&line)?;
        file.sync_data()?;
        Ok(())
    }

    /// Every readable entry, oldest first. A trailing partial line is ignored.
    pub(crate) async fn read(&self, project_id: &str, video_id: &str) -> Vec<TimelineEntry> {
        let Ok(text) = tokio::fs::read_to_string(self.path(project_id, video_id)).await else {
            return Vec::new();
        };
        text.lines()
            .filter_map(|line| serde_json::from_str::<TimelineEntry>(line).ok())
            .collect()
    }

    /// Remove every entry belonging to one run.
    ///
    /// Deleting a run from History removes its sequence attempts and its terminal record
    /// together; leaving one behind would make the card reappear without the other. The
    /// file is rewritten rather than truncated so a later run's entries survive, and the
    /// video's directory is removed once it holds nothing, which is the orphan a deleted
    /// run would otherwise leave behind.
    pub(crate) async fn remove_run(
        &self,
        project_id: &str,
        video_id: &str,
        run_id: &str,
    ) -> std::io::Result<bool> {
        let path = self.path(project_id, video_id);
        let text = match tokio::fs::read_to_string(&path).await {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error),
        };
        let mut kept = String::with_capacity(text.len());
        let mut removed = 0usize;
        for line in text.lines() {
            match serde_json::from_str::<TimelineEntry>(line) {
                Ok(entry) if entry.run_id == run_id => removed += 1,
                // A partial trailing line is dropped by the read path; keeping it here
                // would resurrect a record that cannot be parsed anyway.
                _ => {
                    kept.push_str(line);
                    kept.push('\n');
                }
            }
        }
        if removed == 0 {
            return Ok(false);
        }
        if kept.is_empty() {
            tokio::fs::remove_file(&path).await?;
            if let Some(directory) = path.parent() {
                // Best effort: the directory belongs to the video, and anything else in it
                // keeps it alive rather than being deleted as a side effect of a run.
                let _ = tokio::fs::remove_dir(directory).await;
            }
        } else {
            crate::platform::atomic::write(&path, kept.as_bytes()).await?;
        }
        Ok(true)
    }

    /// Remove one video's whole history directory.
    ///
    /// The timeline is the only file in that directory today. Removing the directory with
    /// the video is what keeps a removed queue entry from leaving `videos/<id>/` behind.
    pub(crate) async fn remove_video(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> std::io::Result<()> {
        let path = self.path(project_id, video_id);
        let Some(directory) = path.parent() else {
            return Ok(());
        };
        match tokio::fs::remove_dir_all(directory).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// The last sequence failure and the last run's terminal record, in one read.
    ///
    /// The sequence failure chooses between `NeverRun` and `Failed`; whether the data
    /// exists is still the engine's answer. The run record is history: it is shown with
    /// its message and never decides a pipeline phase.
    pub(crate) async fn summary(&self, project_id: &str, video_id: &str) -> TimelineSummary {
        let entries = self.read(project_id, video_id).await;
        // The last entry per sequence decides, so a success supersedes an older failure
        // while a failure of a different sequence is still reported.
        let mut latest: HashMap<&str, (usize, bool)> = HashMap::new();
        for (index, entry) in entries.iter().enumerate() {
            if let Some(sequence) = entry.sequence.as_deref() {
                latest.insert(sequence, (index, entry.failed()));
            }
        }
        let failed_sequence = latest
            .into_iter()
            .filter(|(_, (_, failed))| *failed)
            .max_by_key(|(_, (index, _))| *index)
            .map(|(sequence, _)| sequence.to_owned());
        // Every run now ends with one run-level record, so the latest one is the answer.
        // A completed or cancelled run therefore clears an earlier failure instead of
        // leaving a banner that describes history the user has moved past.
        let failure = entries
            .iter()
            .rev()
            .find(|entry| entry.sequence.is_none())
            .filter(|entry| entry.failed())
            .cloned();
        let failure_sequence = failure.as_ref().and_then(|failure| {
            entries
                .iter()
                .rev()
                .find(|entry| {
                    entry.run_id == failure.run_id && entry.sequence.is_some() && entry.failed()
                })
                .and_then(|entry| entry.sequence.clone())
        });
        let scene_detector_frames = entries
            .iter()
            .rev()
            .find(|entry| entry.sequence.as_deref() == Some("SceneDetector"))
            .and_then(|entry| entry.frames_total);
        TimelineSummary {
            failed_sequence,
            failure,
            failure_sequence,
            scene_detector_frames,
        }
    }
}

/// The wall-clock span and frame counts of one running sequence, accumulated from the event
/// stream so the timeline records observed duration rather than one inferred from files.
#[derive(Debug, Clone)]
pub(crate) struct Attempt {
    pub(crate) run_id: String,
    pub(crate) sequence: String,
    pub(crate) started: u64,
    pub(crate) frames_processed: Option<u64>,
    pub(crate) frames_total: Option<u64>,
    /// The sequence's frame position when this attempt first reported one.
    ///
    /// Parallel Encoder and Scene Detector report the video's whole position, so a resumed
    /// run starts partway through it. Subtracting the first reading keeps History's frame
    /// pair and its throughput describing this attempt, not the video's lifetime; a fresh
    /// run starts at zero, so its numbers do not move.
    baseline: Option<u64>,
}

impl Attempt {
    pub(crate) fn start(run_id: &str, sequence: &str) -> Self {
        Self {
            run_id: run_id.to_owned(),
            sequence: sequence.to_owned(),
            started: now_epoch(),
            frames_processed: None,
            frames_total: None,
            baseline: None,
        }
    }

    /// Record the highest frame count this sequence has reported.
    ///
    /// The engine reports a sequence-level total (the whole encode) and, between those
    /// reports, a scene-level total (one scene). Keeping the latest total paired a
    /// sequence-level count with a scene-level denominator — History read "480 / 240
    /// frames". The widest total seen is the span the count is actually measured against.
    pub(crate) fn observe(&mut self, processed: Option<u64>, total: Option<u64>) {
        if let Some(processed) = processed {
            self.baseline.get_or_insert(processed);
            self.frames_processed = Some(
                self.frames_processed
                    .map_or(processed, |seen| seen.max(processed)),
            );
        }
        if let Some(total) = total {
            self.frames_total = Some(self.frames_total.map_or(total, |seen| seen.max(total)));
        }
    }

    pub(crate) fn finish(self, outcome: &str, message: Option<String>) -> TimelineEntry {
        let ended = now_epoch();
        let seconds = ended.saturating_sub(self.started).max(1) as f64;
        let baseline = self.baseline.unwrap_or(0);
        let frames_processed = self
            .frames_processed
            .map(|frames| frames.saturating_sub(baseline));
        let frames_total = self
            .frames_total
            .map(|total| total.saturating_sub(baseline));
        TimelineEntry {
            run_id: self.run_id,
            sequence: Some(self.sequence),
            started_at: iso8601(self.started),
            ended_at: iso8601(ended),
            outcome: outcome.to_owned(),
            frames_processed,
            frames_total,
            fps: frames_processed.map(|frames| frames as f64 / seconds),
            message,
        }
    }
}

pub(crate) fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_dir() -> PathBuf {
        std::env::temp_dir().join(format!("av1ation-timeline-{}", uuid::Uuid::new_v4()))
    }

    fn entry(sequence: &str, outcome: &str) -> TimelineEntry {
        TimelineEntry {
            run_id: "run".to_owned(),
            sequence: Some(sequence.to_owned()),
            started_at: "2026-01-01T00:00:00Z".to_owned(),
            ended_at: "2026-01-01T00:00:10Z".to_owned(),
            outcome: outcome.to_owned(),
            frames_processed: Some(48),
            frames_total: Some(48),
            fps: Some(4.8),
            message: None,
        }
    }

    fn run_entry(run_id: &str, outcome: &str, message: &str) -> TimelineEntry {
        TimelineEntry {
            run_id: run_id.to_owned(),
            sequence: None,
            started_at: "2026-01-01T00:00:00Z".to_owned(),
            ended_at: "2026-01-01T00:00:10Z".to_owned(),
            outcome: outcome.to_owned(),
            frames_processed: None,
            frames_total: None,
            fps: None,
            message: Some(message.to_owned()),
        }
    }

    /// History deletes a run as one unit. The other run's attempts and terminal record must
    /// survive, or deleting the newer run would erase the older one's evidence too.
    #[tokio::test]
    async fn removing_a_run_keeps_the_other_run() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        store
            .append("p", "v", &run_entry("run-1", "failed", "first"))
            .expect("append");
        store
            .append("p", "v", &run_entry("run-2", "completed", "second"))
            .expect("append");

        assert!(store.remove_run("p", "v", "run-2").await.expect("remove"));
        let read = store.read("p", "v").await;
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].run_id, "run-1");
        assert!(
            !store.remove_run("p", "v", "run-9").await.expect("remove"),
            "an unknown run removes nothing"
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    /// Removing the last run takes the video's directory with it, which is the orphan a
    /// deleted run used to leave behind.
    #[tokio::test]
    async fn removing_the_last_run_removes_the_timeline_directory() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        store
            .append("p", "v", &run_entry("run-1", "completed", "only"))
            .expect("append");
        let directory = store.path("p", "v").parent().expect("parent").to_path_buf();

        assert!(store.remove_run("p", "v", "run-1").await.expect("remove"));
        assert!(!directory.exists(), "the empty history directory is gone");
        assert!(store.read("p", "v").await.is_empty());

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn entries_append_and_replay_in_order() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        store
            .append("p", "v", &entry("SceneDetector", "completed"))
            .expect("append");
        store
            .append("p", "v", &entry("ParallelEncoder", "cancelled"))
            .expect("append");

        let read = store.read("p", "v").await;
        assert_eq!(read.len(), 2);
        assert_eq!(read[0].sequence.as_deref(), Some("SceneDetector"));
        assert_eq!(read[1].outcome, "cancelled");

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_trailing_partial_line_is_ignored() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        store
            .append("p", "v", &entry("SceneDetector", "completed"))
            .expect("append");
        let path = store.path("p", "v");
        let mut text = std::fs::read_to_string(&path).expect("read");
        text.push_str("{\"run_id\":\"trunc");
        std::fs::write(&path, text).expect("write");

        assert_eq!(
            store.read("p", "v").await.len(),
            1,
            "the partial line is dropped"
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn a_sequence_failure_stops_being_reported_once_it_succeeds() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        store
            .append("p", "v", &entry("ParallelEncoder", "failed"))
            .expect("append");
        assert_eq!(
            store.summary("p", "v").await.failed_sequence.as_deref(),
            Some("ParallelEncoder")
        );

        store
            .append("p", "v", &entry("ParallelEncoder", "completed"))
            .expect("append");
        assert_eq!(store.summary("p", "v").await.failed_sequence, None);

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    /// A run that fails before any sequence starts still leaves a reason. The next run's
    /// terminal record replaces it, so a successful retry clears the banner.
    #[tokio::test]
    async fn a_run_level_failure_is_the_latest_terminal_record() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        store
            .append(
                "p",
                "v",
                &run_entry("run-1", "failed", "the input could not be opened"),
            )
            .expect("append");

        let summary = store.summary("p", "v").await;
        let failure = summary.failure.expect("the failed run is reported");
        assert_eq!(
            failure.message.as_deref(),
            Some("the input could not be opened")
        );
        assert_eq!(failure.run_id, "run-1");
        assert_eq!(
            summary.failed_sequence, None,
            "no sequence ran, so none is marked failed"
        );
        assert_eq!(
            summary.failure_sequence, None,
            "a failure before sequence 1 has no card to own it"
        );

        store
            .append(
                "p",
                "v",
                &run_entry("run-2", "completed", "Encode finished"),
            )
            .expect("append");
        assert!(
            store.summary("p", "v").await.failure.is_none(),
            "a later completed run clears the earlier failure"
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    /// The failure belongs to the sequence its own run failed, not to whichever sequence
    /// failed most recently across all history.
    #[tokio::test]
    async fn a_sequence_failure_is_scoped_to_the_failed_run() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        store
            .append("p", "v", &entry("ParallelEncoder", "failed"))
            .expect("append");
        store
            .append("p", "v", &run_entry("run", "failed", "encoder failed"))
            .expect("append");

        let summary = store.summary("p", "v").await;
        assert_eq!(summary.failure_sequence.as_deref(), Some("ParallelEncoder"));
        assert_eq!(summary.failed_sequence.as_deref(), Some("ParallelEncoder"));

        store
            .append(
                "p",
                "v",
                &run_entry("run-2", "failed", "the input could not be opened"),
            )
            .expect("append");
        let summary = store.summary("p", "v").await;
        assert_eq!(
            summary.failed_sequence.as_deref(),
            Some("ParallelEncoder"),
            "the older sequence is still marked failed in the pipeline"
        );
        assert_eq!(
            summary.failure_sequence, None,
            "the newer run failed before any sequence, so it owns no card"
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[tokio::test]
    async fn the_latest_detection_attempt_supplies_the_source_frame_total() {
        let dir = temporary_dir();
        let store = TimelineStore::new(&dir);
        let mut first = entry("SceneDetector", "completed");
        first.frames_total = Some(48);
        store.append("p", "v", &first).expect("append");
        assert_eq!(
            store.summary("p", "v").await.scene_detector_frames,
            Some(48)
        );

        let mut partial = entry("SceneDetector", "cancelled");
        partial.frames_total = Some(240);
        store.append("p", "v", &partial).expect("append");
        assert_eq!(
            store.summary("p", "v").await.scene_detector_frames,
            Some(240),
            "a later cancelled attempt still reports the source length"
        );

        let _ = tokio::fs::remove_dir_all(dir).await;
    }

    #[test]
    fn an_attempt_records_its_observed_frames_and_duration() {
        let mut attempt = Attempt::start("run", "ParallelEncoder");
        attempt.observe(Some(0), Some(48));
        attempt.observe(Some(9), None);
        attempt.observe(Some(48), Some(48));
        let entry = attempt.finish("completed", None);

        assert_eq!(
            entry.frames_processed,
            Some(48),
            "the count never goes backwards"
        );
        assert_eq!(entry.frames_total, Some(48));
        assert!(entry.fps.is_some_and(|fps| fps > 0.0));
    }

    /// The engine alternates a whole-encode frame count with a per-scene denominator. The
    /// attempt must keep the whole-encode total instead of adopting the smaller scene one,
    /// or History renders a count larger than its own denominator.
    #[test]
    fn a_scene_level_total_does_not_replace_the_sequence_span() {
        let mut attempt = Attempt::start("run", "ParallelEncoder");
        attempt.observe(Some(240), Some(2_160));
        attempt.observe(Some(240), Some(240));
        attempt.observe(Some(480), Some(2_160));
        attempt.observe(Some(480), Some(240));
        attempt.observe(Some(10), Some(240));
        let entry = attempt.finish("cancelled", None);

        // This attempt began at frame 240, so its own work is 240 of the 1,920 that
        // remained; the larger whole-encode total is still the one it is measured against.
        assert_eq!(entry.frames_processed, Some(240));
        assert_eq!(
            entry.frames_total,
            Some(1_920),
            "the denominator is the whole encode, not the last scene"
        );
    }

    /// A resumed run reports the video's whole frame position, which starts partway. History
    /// must record what this attempt did, or a five-minute resume claims the video's lifetime
    /// frames and its throughput divides them by five minutes.
    #[test]
    fn a_resumed_attempt_counts_only_its_own_frames() {
        let mut attempt = Attempt::start("run", "ParallelEncoder");
        attempt.observe(Some(16_150), Some(20_000));
        attempt.observe(Some(19_591), Some(20_000));
        let entry = attempt.finish("completed", None);

        assert_eq!(entry.frames_processed, Some(3_441));
        assert_eq!(entry.frames_total, Some(3_850));
        assert!(entry.fps.is_some_and(|fps| fps > 0.0));
    }
}
