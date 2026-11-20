//! What a configuration write changes about a video's retained work.
//!
//! A project's encoder and Parallel Encoder input are the base every video inherits, so one
//! project save reaches scenes in videos the writer never names. A video's own override
//! reaches the same scenes through a different document. Both callers materialise the
//! effective configuration on each side and hand it here, so the guard and the write share
//! one comparison.

use av1ation_contracts::project::ChunkInvalidationReason;
use av1ation_engine::run::reset;
use serde_json::Value;

use super::VideoRecord;

/// One video's share of a configuration write.
pub(crate) struct VideoImpact {
    pub(crate) record: VideoRecord,
    /// Scenes whose retained chunk the write invalidates. A changed encoder rewrites these
    /// scenes; a changed input rewrites none of them but still makes every chunk stale.
    pub(crate) invalidated: Vec<u32>,
    /// The checkpoint to write, when the write changes a scene document or clears results.
    pub(crate) condor: Option<Value>,
    /// Why this video's chunks are stale; `None` means this write does not reach it.
    pub(crate) reason: Option<ChunkInvalidationReason>,
}

/// Resolve one video against its effective configuration before and after a write.
///
/// Both documents are fully materialised by the caller: a video that overrides the encoder
/// or the Parallel Encoder input resolves to the same value on both sides and is left alone.
/// A changed encoder rewrites only the scenes that still carry the inherited document; a
/// changed input invalidates every chunk because a scene with its own encoder still reads
/// the new frames.
pub(crate) fn impact_for(
    previous: &Value,
    next: &Value,
    record: VideoRecord,
    clear_chunks: bool,
) -> Result<VideoImpact, String> {
    let previous_encoder = previous.get("encoder").cloned();
    let next_encoder = next.get("encoder").cloned();
    let encoder_changed = next_encoder.is_some() && previous_encoder != next_encoder;
    let input_changed = parallel_encoder_input(previous) != parallel_encoder_input(next);
    let affected = if encoder_changed {
        inheriting_scenes(record.condor.as_ref(), previous_encoder.as_ref())
    } else {
        Vec::new()
    };
    let invalidated = if input_changed {
        scene_indices(record.condor.as_ref())
    } else {
        affected.clone()
    };
    let mut condor = None;
    if !affected.is_empty()
        && let (Some(encoder), Some(current)) = (next_encoder.as_ref(), record.condor.as_ref())
    {
        condor = Some(reset::set_scene_encoders(current, &affected, encoder, clear_chunks)?.condor);
    }
    // A changed input has no encoder write to carry the cleared records, so the reset is
    // applied on its own. It is still one checkpoint with the configuration document: the
    // next run cannot read the new input beside a chunk encoded from the old one.
    if clear_chunks
        && input_changed
        && !invalidated.is_empty()
        && let Some(current) = condor.as_ref().or(record.condor.as_ref())
    {
        condor = Some(reset::reset_scene_outputs(current, &invalidated)?);
    }
    Ok(VideoImpact {
        record,
        invalidated,
        condor,
        reason: if input_changed {
            Some(ChunkInvalidationReason::Input)
        } else if encoder_changed {
            Some(ChunkInvalidationReason::Encoder)
        } else {
            None
        },
    })
}

/// The effective Parallel Encoder input, treating an absent value and `null` alike.
///
/// Both mean "inherit the General input" to the runner, and a whole-section override may
/// omit the key while the project document carries it as `null`.
pub(crate) fn parallel_encoder_input(document: &Value) -> Option<&Value> {
    document
        .pointer("/sequences/parallel_encoder/input")
        .filter(|input| !input.is_null())
}

/// The scenes a video-level encoder write changes: every row that still inherits it.
///
/// A scene carrying its own encoder keeps it, which is the comparison the scene table's
/// `encoder_custom` flag already reports.
pub(crate) fn inheriting_scenes(condor: Option<&Value>, inherited: Option<&Value>) -> Vec<u32> {
    let (Some(condor), Some(inherited)) = (condor, inherited) else {
        return Vec::new();
    };
    condor
        .get("scenes")
        .and_then(Value::as_array)
        .map(|scenes| {
            scenes
                .iter()
                .enumerate()
                .filter(|(_, scene)| scene.get("encoder") == Some(inherited))
                .filter_map(|(index, _)| u32::try_from(index).ok())
                .collect()
        })
        .unwrap_or_default()
}

/// Every scene index in the checkpoint, for a write that invalidates the whole table.
pub(crate) fn scene_indices(condor: Option<&Value>) -> Vec<u32> {
    condor
        .and_then(|condor| condor.get("scenes"))
        .and_then(Value::as_array)
        .map(|scenes| {
            (0..scenes.len())
                .filter_map(|index| u32::try_from(index).ok())
                .collect()
        })
        .unwrap_or_default()
}
