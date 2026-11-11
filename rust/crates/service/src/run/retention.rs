//! The chunk-retention policy, owned by the completion path rather than run supervision.
//!
//! Retained chunks are the default (`AGENTS.md` §2.11): they are what makes a later
//! Quality Check possible and what lets a re-encode start from an edited scene list. The
//! `delete_chunks_on_success` setting opts a user out, and this component is the one place
//! that opt-out is honoured.
//!
//! The policy is a decision, not a store: it holds the stores it needs, answers for one
//! finished video, and knows nothing about run ids or the singleton lock. Run supervision
//! decides *when* to ask it (once, on the terminal event of the run whose run produced the
//! output, before the lock is released); this file decides *whether* anything is deleted.

use crate::{project::settings::SettingsStore, project::videos::VideoStore};

/// Whether the chunks of a run that produced the final output are kept or deleted.
#[derive(Clone)]
pub(crate) struct ChunkRetention {
    videos: Option<VideoStore>,
    settings: Option<SettingsStore>,
}

impl ChunkRetention {
    pub(crate) fn new(videos: Option<VideoStore>, settings: Option<SettingsStore>) -> Self {
        Self { videos, settings }
    }

    /// Apply the opt-in chunk cleanup once a run that produced the final output finishes.
    ///
    /// Deletion happens only when the user asked for it and only after the output exists
    /// and is non-empty; a failed or cancelled run keeps everything it produced.
    pub(crate) async fn after_final_output(&self, project_id: &str, video_id: &str) {
        let (Some(videos), Some(settings)) = (&self.videos, &self.settings) else {
            return;
        };
        if !settings.load().await.delete_chunks_on_success {
            return;
        }
        let Ok(Some(record)) = videos.record(project_id, video_id).await else {
            return;
        };
        let output = record.output_path();
        if output.is_empty() {
            return;
        }
        let exists = tokio::fs::metadata(&output)
            .await
            .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0);
        if !exists {
            tracing::warn!(
                project_id,
                video_id,
                %output,
                "retained chunks were kept because the concatenated output is missing"
            );
            return;
        }
        match videos
            .remove_chunks(video_id, record.temp_directory.as_deref())
            .await
        {
            Ok(_) => tracing::info!(
                project_id,
                video_id,
                "retained chunks deleted after success"
            ),
            Err(error) => tracing::warn!(
                project_id,
                video_id,
                error = error.message(),
                "retained chunks could not be deleted"
            ),
        }
    }
}
