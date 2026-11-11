//! Batch execution and the order of the queued videos.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// The videos a queue batch should run, in queue order.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct QueueBatchRequest {
    /// Video ids to start, in the order the service should run them.
    pub video_ids: Vec<String>,
}

/// The live batch a project is running.
///
/// A batch is execution state, not pipeline state: it exists only while the service is
/// walking the list, and every row's own progress still comes from its checkpoint. A
/// restart therefore reports no batch rather than resuming a stale one.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct QueueBatchStatus {
    /// The project whose queue the batch belongs to.
    pub project_id: String,
    /// Whether a batch is running right now.
    pub active: bool,
    /// How many videos the batch was asked to run.
    pub total: u32,
    /// How many videos have not started yet.
    pub remaining: u32,
    /// The video the batch is running, when one is active.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_video_id: Option<String>,
}

/// The replacement queue order, sent as the full list so a stale client cannot drop or
/// duplicate a video.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct VideoOrderRequest {
    /// Every video id, in the new order; must be a permutation of the current queue.
    pub video_ids: Vec<String>,
}
