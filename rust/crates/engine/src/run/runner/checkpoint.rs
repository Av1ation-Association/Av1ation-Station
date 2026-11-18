//! The save callback and the scene and chunk events derived from a checkpoint.

use super::*;

use andean_condor::models::sequence::{
    provenance::{self, ResultProvenance},
    target_quality::TargetQualityConfig,
};

/// What the save before this one already announced.
///
/// A checkpoint carries the whole table, so the callback needs to know how much of it the
/// UI already has: the scene count detection appended, and the chunk pair each scene
/// recorded. One value owns both, so a resumed run seeds both from the table it starts
/// with and no save re-announces a chunk the rail already shows.
pub(super) struct Announced {
    scenes: AtomicUsize,
    chunks: Mutex<RecordedChunks>,
}

impl Announced {
    pub(super) fn new(scenes: &[Scene<DefaultSequenceData>]) -> Self {
        Self {
            scenes: AtomicUsize::new(scenes.len()),
            chunks: Mutex::new(recorded_chunks(scenes)),
        }
    }
}

/// The chunk size and duration each scene already recorded, keyed by zero-based index.
///
/// A checkpoint carries the whole table, and a resumed encode's table already holds the
/// chunks its previous run wrote. Remembering the pair is what tells a chunk this run
/// wrote from one the rail has shown all along, so a later save cannot replay a table's
/// worth of rows.
pub(super) type RecordedChunks = HashMap<u32, (u64, u64)>;

/// Every chunk the saved table records, as the pair a checkpoint will compare against.
pub(super) fn recorded_chunks(scenes: &[Scene<DefaultSequenceData>]) -> RecordedChunks {
    scenes
        .iter()
        .enumerate()
        .filter_map(|(index, scene)| {
            let (index, bytes, duration_ms) = scene_chunk(scene, index)?;
            Some((index, (bytes, duration_ms)))
        })
        .collect()
}

/// The chunks a checkpoint recorded that its table has not announced yet.
///
/// The engine writes the chunk, then reports the result in a batch; the save follows that
/// report. One event per newly recorded scene is what lets the rail mark the row and the
/// Encoding chart plot it while the other workers still run.
pub(super) fn take_new_chunks(
    recorded: &mut RecordedChunks,
    scenes: &[Scene<DefaultSequenceData>],
) -> Vec<(u32, u64, u64)> {
    let mut new = Vec::new();
    for (position, scene) in scenes.iter().enumerate() {
        let Some((index, bytes, duration_ms)) = scene_chunk(scene, position) else {
            continue;
        };
        let pair = (bytes, duration_ms);
        if recorded.insert(index, pair) != Some(pair) {
            new.push((index, bytes, duration_ms));
        }
    }
    new
}

/// One scene's recorded chunk, when the engine wrote one and stamped both ends.
///
/// A scene is recorded only when the encoder produced bytes and the completed timestamp is
/// after the started one: two default timestamps are not a measurement, and a zero would
/// read as an instant encode.
pub(super) fn scene_chunk(
    scene: &Scene<DefaultSequenceData>,
    position: usize,
) -> Option<(u32, u64, u64)> {
    let data = scene.sequence_data.get_parallel_encoder().ok()?;
    let bytes = data.bytes?;
    let started = data.started_on?;
    let ended = data.completed_on?;
    if bytes == 0 || ended <= started {
        return None;
    }
    Some((
        u32::try_from(position).ok()?,
        bytes,
        u64::try_from(ended - started).unwrap_or(u64::MAX),
    ))
}

pub(super) fn checkpoint_callback(
    slot: Arc<Mutex<Option<String>>>,
    cancel: Arc<AtomicBool>,
    checkpoint: Arc<dyn Fn(serde_json::Value) -> Result<(), String> + Send + Sync>,
    sender: Sender<EncodeEvent>,
    seq_no: Arc<AtomicU64>,
    run_id: String,
    announced: Arc<Announced>,
) -> SaveCallback<DefaultSequenceData, RunnerConfig> {
    Box::new(move |condor| {
        let value = match serde_json::to_value(&condor) {
            Ok(value) => value,
            Err(cause) => {
                *slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) =
                    Some(format!("the engine state could not be serialised: {cause}"));
                cancel.store(true, Ordering::SeqCst);
                return Ok(());
            }
        };
        if let Err(message) = checkpoint(without_injected_variables(value)) {
            *slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(format!(
                "the engine checkpoint could not be saved: {message}"
            ));
            cancel.store(true, Ordering::SeqCst);
            return Ok(());
        }

        // The save is the durable append. Announce only after it succeeded, and only the
        // scenes this checkpoint added, so a retried or boundary save does not duplicate a
        // row in the rail.
        let previous = announced.scenes.load(Ordering::SeqCst);
        let appended = condor.scenes.len() > previous;
        if appended {
            let count = u32::try_from(condor.scenes.len()).unwrap_or(u32::MAX);
            for (offset, scene) in condor.scenes.iter().enumerate().skip(previous) {
                if let Ok(document) = serde_json::to_value(scene) {
                    emit_scene(
                        &sender,
                        &run_id,
                        seq_no.as_ref(),
                        u32::try_from(offset).unwrap_or(u32::MAX),
                        count,
                        document,
                    );
                }
            }
            announced
                .scenes
                .store(condor.scenes.len(), Ordering::SeqCst);
        }
        // A finished chunk is on disk by the time its checkpoint runs, so the save carries
        // the size and duration the row needs. Detection appends scenes and encodes
        // nothing, so skipping the walk on an append keeps a per-scene detection save
        // linear; nothing else appends while it writes chunks.
        if !appended {
            let mut recorded = announced
                .chunks
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            for (index, bytes, duration_ms) in take_new_chunks(&mut recorded, &condor.scenes) {
                emit_chunk(&sender, &run_id, seq_no.as_ref(), index, bytes, duration_ms);
            }
        }
        Ok(())
    })
}

/// Publish one appended scene on the same ordered stream as progress.
///
/// The UI applies the row to its scene cache directly. Sending the whole table would grow
/// quadratically with detection, so one checkpoint append produces one event.
pub(super) fn emit_scene(
    sender: &Sender<EncodeEvent>,
    run_id: &str,
    seq_no: &AtomicU64,
    index: u32,
    count: u32,
    scene: serde_json::Value,
) {
    let seq = seq_no.fetch_add(1, Ordering::SeqCst);
    let _ = sender.send(EncodeEvent {
        run_id: run_id.to_owned(),
        seq,
        at: now_iso(),
        kind: EncodeEventKind::Progress,
        sequence: Some("SceneDetector".to_owned()),
        progress: None,
        message: format!("Scene {} detected", index.saturating_add(1)),
        level: Some("debug".to_owned()),
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
        scene: Some(SceneUpdate {
            index,
            count,
            scene,
        }),
    });
}

/// Publish one finished chunk so the scene's row can be patched without a table read.
///
/// The row already exists — detection wrote it — so the event carries only the figures the
/// chunk adds: its size and the wall clock the encoder spent on it. The rail marks the row
/// encoded and the Encoding chart plots the chunk while the rest of the workers run.
pub(super) fn emit_chunk(
    sender: &Sender<EncodeEvent>,
    run_id: &str,
    seq_no: &AtomicU64,
    index: u32,
    bytes: u64,
    duration_ms: u64,
) {
    let seq = seq_no.fetch_add(1, Ordering::SeqCst);
    let _ = sender.send(EncodeEvent {
        run_id: run_id.to_owned(),
        seq,
        at: now_iso(),
        kind: EncodeEventKind::Progress,
        sequence: Some("ParallelEncoder".to_owned()),
        progress: None,
        message: format!(
            "Parallel Encoder: Scene {} wrote {bytes} bytes in {:.1}s",
            index.saturating_add(1),
            duration_ms as f64 / 1_000.0
        ),
        level: Some("debug".to_owned()),
        frames_processed: None,
        frames_total: None,
        phase: None,
        pass: None,
        max_passes: None,
        scenes_processed: None,
        scenes_total: None,
        scene_index: Some(index),
        scene_progress: None,
        scene_frames_processed: None,
        scene_frames_total: None,
        scene_bytes: Some(bytes),
        scene_encode_ms: Some(duration_ms),
        scene_noise: None,
        scene_quality: None,
        scene: None,
    });
}

/// Remove the runner-derived variables from the checkpoint the service persists; the scene
/// table stays derived from `scenes` and is rebuilt on the next run. User variables with
/// other names survive, because they are configuration.
pub(super) fn without_injected_variables(mut value: serde_json::Value) -> serde_json::Value {
    fn strip(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(variables) = map.get_mut("variables").and_then(|v| v.as_object_mut()) {
                    for key in script_data::KEYS {
                        variables.remove(key);
                    }
                }
                for child in map.values_mut() {
                    strip(child);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    strip(item);
                }
            }
            _ => {}
        }
    }
    strip(&mut value);
    // The strip above also changes the input identities stored inside saved Target Quality
    // passes. The selection stamp is a hash of those passes, so leaving the old stamp in
    // place makes a later Scene Concatenator reject its own retained chunks. Recompute the
    // derived stamp against the same stripped history the checkpoint persists.
    restamp_target_quality_selection(&mut value);
    value
}

/// Recompute each scene's Target Quality selection after checkpoint cleanup.
///
/// The selection is derived data: it hashes the saved pass contexts. Cleanup removes
/// runner-only script variables from those contexts, so the old hash cannot describe the
/// document that was actually written. Rebuilding it here keeps selection admission and a
/// saved-project retry using one history.
fn restamp_target_quality_selection(value: &mut serde_json::Value) {
    let Some(config) = value
        .get("sequence_config")
        .and_then(|config| config.get("target_quality"))
        .cloned()
    else {
        return;
    };
    let Ok(config) = serde_json::from_value::<TargetQualityConfig>(config) else {
        return;
    };
    let Some(scenes) = value
        .get_mut("scenes")
        .and_then(|scenes| scenes.as_array_mut())
    else {
        return;
    };
    for scene_value in scenes {
        let Ok(mut scene) =
            serde_json::from_value::<Scene<DefaultSequenceData>>(scene_value.clone())
        else {
            continue;
        };
        if scene.sequence_data.target_quality.passes.is_empty() {
            continue;
        }
        let Ok(context) = provenance::selection_context(&scene, &config) else {
            continue;
        };
        scene.sequence_data.target_quality.selection = Some(ResultProvenance::new(context));
        // Parallel Encoder records the selection its chunk was built against. The chunk
        // provenance is not a hash input for the selection, so it must be updated alongside
        // the restamp or a saved retry compares a new selection with the old dependency.
        let dependency = scene
            .sequence_data
            .target_quality
            .selection
            .as_ref()
            .and_then(|selection| serde_json::to_value(selection).ok())
            .unwrap_or(serde_json::Value::Null);
        if let Some(provenance) = scene.sequence_data.parallel_encoder.provenance.as_mut()
            && let Some(context) = provenance.context.as_object_mut()
        {
            context.insert("tq_dependency".to_owned(), dependency);
        }
        if let Ok(updated) = serde_json::to_value(&scene) {
            *scene_value = updated;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use andean_condor::models::{
        encoder::{Encoder, EncoderBase},
        sequence::{
            parallel_encoder::ParallelEncoderData,
            target_quality::{TargetQualityData, types::QualityPass},
        },
    };
    use serde_json::json;

    #[test]
    fn checkpoint_cleanup_restamps_tq_selection_against_its_saved_history() {
        let config = TargetQualityConfig::default();
        let pass = QualityPass {
            provenance: Some(ResultProvenance::new(json!({
                "input": {
                    "settings": {
                        "VapourSynthScript": {
                            "variables": {
                                "condor_temp_dir": "C:\\\\temp",
                                "user_value": "keep me"
                            }
                        }
                    }
                }
            }))),
            backend: None,
            quantizer: 30.0,
            scores: vec![5.0],
            bitrate: 1.0,
            started_on: 1,
            completed_on: 2,
        };
        let scene = Scene {
            start_frame: 0,
            end_frame: 24,
            sub_scenes: None,
            encoder: Encoder::default_from_base(&EncoderBase::X264, false),
            sequence_data: DefaultSequenceData {
                target_quality: TargetQualityData {
                    passes: vec![pass],
                    selection: Some(ResultProvenance::new(json!({ "stale": true }))),
                    speed_transition: None,
                },
                parallel_encoder: ParallelEncoderData {
                    provenance: Some(ResultProvenance::new(json!({
                        "tq_dependency": { "stale": true }
                    }))),
                    ..Default::default()
                },
                ..Default::default()
            },
        };
        let value = json!({
            "scenes": [serde_json::to_value(&scene).expect("scene")],
            "sequence_config": { "target_quality": serde_json::to_value(&config).expect("config") }
        });

        let clean = without_injected_variables(value);
        let clean_scene: Scene<DefaultSequenceData> =
            serde_json::from_value(clean["scenes"][0].clone()).expect("clean scene");
        let variables = &clean_scene.sequence_data.target_quality.passes[0]
            .provenance
            .as_ref()
            .expect("pass provenance")
            .context["input"]["settings"]["VapourSynthScript"]["variables"];
        assert_eq!(variables["user_value"], "keep me");
        assert!(variables.get("condor_temp_dir").is_none());

        let expected = provenance::selection_context(&clean_scene, &config).expect("selection");
        assert_eq!(
            clean_scene.sequence_data.target_quality.selection,
            Some(ResultProvenance::new(expected))
        );
        assert_eq!(
            clean_scene
                .sequence_data
                .parallel_encoder
                .provenance
                .as_ref()
                .expect("chunk provenance")
                .context["tq_dependency"],
            serde_json::to_value(
                clean_scene
                    .sequence_data
                    .target_quality
                    .selection
                    .as_ref()
                    .expect("selection")
            )
            .expect("selection document")
        );
    }
}
