//! Reset one sequence's checkpoint data, and edit scene ranges without losing the table.
//!
//! The service owns files and the run lock; this module owns the shape of the engine's
//! `Condor` blob. It works through the engine's own `Scene` and `Encoder` types so a reset
//! writes exactly the fields the next run reads, and a split or merge cannot leave a scene
//! with a malformed range or a stale encoder document.

use andean_condor::models::{encoder::Encoder, scene::Scene, sequence::DefaultSequenceData};
use serde_json::Value;

/// The files a data reset invalidates.
///
/// The caller deletes them after the checkpoint is written. Keeping this a description
/// rather than a path list means the engine never decides where a user's scratch directory
/// is, and the service can reject a reset before touching either side.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ResetFiles {
    /// Every encoded scene chunk and every derived scratch directory.
    pub all_chunks: bool,
    /// Encoded scene chunks only; probe and benchmark directories stay.
    pub scene_chunks: bool,
    /// `Target Quality` under the scenes directory.
    pub target_quality: bool,
    /// `Parallel Encoder` under the scenes directory.
    pub parallel_encoder: bool,
    /// The finished concatenated output.
    pub output: bool,
}

/// A reset's new checkpoint and the files it makes stale.
#[derive(Debug, Clone)]
pub struct ResetPlan {
    pub condor: Value,
    pub files: ResetFiles,
}

/// Clear one sequence's result.
///
/// `BitrateOptimizer` and `Benchmarker` are refused: neither stores its own data (the
/// optimizer rewrites target-quality quantizers and the benchmarker only fills an unset
/// worker count), so there is no result to delete that would not also destroy a different
/// sequence's work.
pub fn reset_sequence(condor: &Value, sequence: &str) -> Result<ResetPlan, String> {
    let mut next = condor.clone();
    if sequence == "SceneDetector" {
        next["scenes"] = Value::Array(Vec::new());
        return Ok(ResetPlan {
            condor: next,
            files: ResetFiles {
                all_chunks: true,
                target_quality: true,
                parallel_encoder: true,
                ..ResetFiles::default()
            },
        });
    }

    let mut scenes = read_scenes(&next)?;
    let mut encoder = read_encoder(&next)?;
    let files = match sequence {
        "NoiseDetector" => {
            for scene in &mut scenes {
                scene.sequence_data.noise_detection = None;
            }
            ResetFiles::default()
        }
        "NoiseScaler" => {
            for scene in &mut scenes {
                scene.sequence_data.noise_scaling = None;
                scene.encoder.set_photon_noise(None);
                clear_grain_tables(&mut scene.encoder);
            }
            encoder.set_photon_noise(None);
            clear_grain_tables(&mut encoder);
            ResetFiles::default()
        }
        "TargetQuality" => {
            let quantizer = encoder.quantizer();
            for scene in &mut scenes {
                scene.sequence_data.target_quality = Default::default();
                if let Some(quantizer) = quantizer {
                    scene.encoder.set_quantizer(quantizer);
                }
            }
            ResetFiles {
                target_quality: true,
                ..ResetFiles::default()
            }
        }
        "SpeedScaler" => {
            let speed = encoder.speed().and_then(|speed| speed.parse::<i8>().ok());
            for scene in &mut scenes {
                if let Some(speed) = speed {
                    scene.encoder.set_speed(speed);
                }
            }
            ResetFiles::default()
        }
        "ParallelEncoder" => {
            for scene in &mut scenes {
                scene.sequence_data.parallel_encoder = Default::default();
            }
            ResetFiles {
                scene_chunks: true,
                parallel_encoder: true,
                ..ResetFiles::default()
            }
        }
        "SceneConcatenator" => ResetFiles {
            output: true,
            ..ResetFiles::default()
        },
        "QualityCheck" => {
            for scene in &mut scenes {
                scene.sequence_data.quality_check = Default::default();
            }
            ResetFiles::default()
        }
        "BitrateOptimizer" | "Benchmarker" => {
            return Err(format!(
                "{sequence} does not store its own result, so there is nothing safe to reset."
            ));
        }
        other => return Err(format!("{other} is not a sequence this build can reset.")),
    };

    write_scenes(&mut next, &scenes)?;
    write_encoder(&mut next, &encoder)?;
    Ok(ResetPlan {
        condor: next,
        files,
    })
}

/// Delete one scene's retained output, so the next encoder run re-encodes it.
///
/// This keeps the scene's encoder and range. Only the result fields the Parallel Encoder
/// wrote are cleared; target-quality probes remain valid for the same range.
pub fn reset_scene_outputs(condor: &Value, scenes: &[u32]) -> Result<Value, String> {
    let mut next = condor.clone();
    let mut table = read_scenes(&next)?;
    let mut selected = scenes.to_vec();
    selected.sort_unstable();
    selected.dedup();
    for index in selected {
        let position = usize::try_from(index).map_err(|_| "Scene index is too large.")?;
        let Some(scene) = table.get_mut(position) else {
            return Err(format!(
                "Scene {} does not exist in this video's {} scenes.",
                index + 1,
                table.len()
            ));
        };
        scene.sequence_data.parallel_encoder = Default::default();
    }
    write_scenes(&mut next, &table)?;
    Ok(next)
}

/// Split the scene containing `frame` into two scenes.
///
/// The split inherits the source scene's encoder, while both halves lose sequence data:
/// every per-scene result was measured over the old range and would be read as if it
/// described the new one. The caller deletes retained chunks because every later scene
/// index moved.
pub fn split_scene(condor: &Value, frame: u64) -> Result<Value, String> {
    let mut next = condor.clone();
    let mut table = read_scenes(&next)?;
    if table.is_empty() {
        return Err("This video has no detected scenes to split.".to_owned());
    }
    let Some(position) = table
        .iter()
        .position(|scene| frame >= scene.start_frame as u64 && frame < scene.end_frame as u64)
    else {
        return Err(format!("Frame {} is outside every detected scene.", frame));
    };
    let scene = &table[position];
    if frame <= scene.start_frame as u64 || frame >= scene.end_frame as u64 {
        return Err("Choose a frame inside the scene, not at one of its edges.".to_owned());
    }
    let encoder = scene.encoder.clone();
    let left = Scene {
        start_frame: scene.start_frame,
        end_frame: usize::try_from(frame).map_err(|_| "Frame index is too large.")?,
        sub_scenes: None,
        encoder: encoder.clone(),
        sequence_data: DefaultSequenceData::default(),
    };
    let right = Scene {
        start_frame: usize::try_from(frame).map_err(|_| "Frame index is too large.")?,
        end_frame: scene.end_frame,
        sub_scenes: None,
        encoder,
        sequence_data: DefaultSequenceData::default(),
    };
    table.splice(position..=position, [left, right]);
    write_scenes(&mut next, &table)?;
    Ok(next)
}

/// Add one scene inside a gap the current table does not cover.
///
/// The new scene takes the video's main encoder, not a neighbour's: a manual range has no
/// history, so inheriting an edited scene encoder would silently attribute another scene's
/// choices to it. An overlapping range is refused rather than trimmed; the UI computes the
/// gap from the same boundaries, and a silent trim would hide a stale table.
pub fn add_scene(condor: &Value, start_frame: u64, end_frame: u64) -> Result<Value, String> {
    if end_frame <= start_frame {
        return Err("A scene must end after it starts.".to_owned());
    }
    let start = usize::try_from(start_frame).map_err(|_| "Frame index is too large.")?;
    let end = usize::try_from(end_frame).map_err(|_| "Frame index is too large.")?;
    let mut next = condor.clone();
    let mut table = read_scenes(&next)?;
    if let Some(overlap) = table
        .iter()
        .find(|scene| start < scene.end_frame && end > scene.start_frame)
    {
        return Err(format!(
            "Frames {start}–{} overlap the scene at {}–{}.",
            end - 1,
            overlap.start_frame,
            overlap.end_frame.saturating_sub(1)
        ));
    }
    let encoder = read_encoder(&next)?;
    let scene = Scene {
        start_frame: start,
        end_frame: end,
        sub_scenes: None,
        encoder,
        sequence_data: DefaultSequenceData::default(),
    };
    let position = table
        .iter()
        .position(|existing| existing.start_frame > start)
        .unwrap_or(table.len());
    table.insert(position, scene);
    write_scenes(&mut next, &table)?;
    Ok(next)
}

/// Change one scene's boundaries without moving its neighbours.
///
/// A narrowed range leaves a gap and a widened one overlaps its neighbour; both are left
/// for the validation strip to flag rather than trimmed here. Silently clamping would make
/// the table disagree with what the user typed, and a gap is a legitimate way to re-add a
/// range deliberately. The scene keeps its encoder because the choice is still about this
/// footage, but its sequence data is cleared: every value was measured over the old span.
pub fn set_scene_range(
    condor: &Value,
    scene: u32,
    start_frame: u64,
    end_frame: u64,
) -> Result<Value, String> {
    if end_frame <= start_frame {
        return Err("A scene must end after it starts.".to_owned());
    }
    let start = usize::try_from(start_frame).map_err(|_| "Frame index is too large.")?;
    let end = usize::try_from(end_frame).map_err(|_| "Frame index is too large.")?;
    let mut next = condor.clone();
    let mut table = read_scenes(&next)?;
    let position = usize::try_from(scene).map_err(|_| "Scene index is too large.")?;
    let Some(row) = table.get_mut(position) else {
        return Err(format!(
            "Scene {} does not exist in this video's {} scenes.",
            scene + 1,
            table.len()
        ));
    };
    row.start_frame = start;
    row.end_frame = end;
    row.sequence_data = DefaultSequenceData::default();
    write_scenes(&mut next, &table)?;
    Ok(next)
}

/// Remove one scene, leaving its frames uncovered in this table.
///
/// The range is not given to a neighbour here, so the user can still re-add it with
/// [`add_scene`]. Every reader that builds a pipeline or a projection closes the hole into the
/// scene before it with [`close_scene_gaps`], because the engine encodes each scene as a range
/// of one clip: an uncovered range in the middle would shift every later scene instead of
/// removing it. Only a delete at the end trims footage.
pub fn delete_scene(condor: &Value, scene: u32) -> Result<Value, String> {
    let mut next = condor.clone();
    let mut table = read_scenes(&next)?;
    let position = usize::try_from(scene).map_err(|_| "Scene index is too large.")?;
    if position >= table.len() {
        return Err(format!(
            "Scene {} does not exist in this video's {} scenes.",
            scene + 1,
            table.len()
        ));
    }
    table.remove(position);
    write_scenes(&mut next, &table)?;
    Ok(next)
}

/// Put a saved scene table back, validating it through the engine's own types first.
///
/// This is the undo path. The snapshot comes from this engine's own checkpoint, so it is
/// parsed again before writing: a corrupt or stale snapshot is refused instead of being
/// installed as a table the next run cannot decode.
pub fn restore_scene_table(condor: &Value, scenes: &Value) -> Result<Value, String> {
    let table: Vec<Scene<DefaultSequenceData>> = serde_json::from_value(scenes.clone())
        .map_err(|error| format!("The saved scene table is not readable: {error}"))?;
    let mut next = condor.clone();
    write_scenes(&mut next, &table)?;
    Ok(next)
}

/// Merge a contiguous selection of scenes into one.
///
/// The merged scene keeps the first scene's encoder and takes the outer range. It loses
/// sequence data for the same reason a split does. Non-contiguous selections are refused:
/// merging across an unselected scene would silently swallow it.
pub fn merge_scenes(condor: &Value, scenes: &[u32]) -> Result<Value, String> {
    let mut selected = scenes.to_vec();
    selected.sort_unstable();
    selected.dedup();
    if selected.len() < 2 {
        return Err("Select at least two scenes to merge.".to_owned());
    }
    if selected
        .windows(2)
        .any(|pair| pair[0].checked_add(1) != Some(pair[1]))
    {
        return Err("Only adjacent scenes can be merged.".to_owned());
    }

    let mut next = condor.clone();
    let mut table = read_scenes(&next)?;
    let first = usize::try_from(selected[0]).map_err(|_| "Scene index is too large.")?;
    let last = usize::try_from(*selected.last().unwrap_or(&selected[0]))
        .map_err(|_| "Scene index is too large.")?;
    if last >= table.len() {
        return Err(format!(
            "Scene {} does not exist in this video's {} scenes.",
            last + 1,
            table.len()
        ));
    }
    let merged = Scene {
        start_frame: table[first].start_frame,
        end_frame: table[last].end_frame,
        sub_scenes: None,
        encoder: table[first].encoder.clone(),
        sequence_data: DefaultSequenceData::default(),
    };
    table.splice(first..=last, [merged]);
    write_scenes(&mut next, &table)?;
    Ok(next)
}

/// Give every frame before the last scene to a scene.
///
/// The engine encodes a scene as `start_frame..end_frame` of the *same* opened clip, and the
/// stock script builds that clip by splicing those same ranges. A table with a hole would
/// therefore leave the hole out of the clip and shift every later scene's frames, so an
/// encode, a still and a decoded window would all show the wrong pictures — and the last
/// chunk could not reach the source's last frame.
///
/// Closing the hole keeps frame numbers equal to the source's: the uncovered frames join the
/// scene before them, which is who was decoding them anyway. Only the tail may stay
/// uncovered, because it comes after every scene and cannot shift one; a table that stops
/// before the source's last frame is a deliberate trim of the end. Overlaps and out-of-order
/// ranges are left alone: only the validation strip can say which scene the user meant to own
/// the shared frames.
///
/// Returns `None` when the table already covers every frame before its last end, so a caller
/// can tell a repaired table from an untouched one without comparing documents.
pub fn close_scene_gaps(condor: &Value) -> Result<Option<Value>, String> {
    let mut table = read_scenes(condor)?;
    if !close_scene_gaps_in(&mut table) {
        return Ok(None);
    }
    let mut next = condor.clone();
    write_scenes(&mut next, &table)?;
    Ok(Some(next))
}

/// The same repair on a table that has already been parsed, for a reader that holds the
/// scenes rather than the document: the run worker builds its clip and its scene list from
/// one parsed table, so it must be repaired before either is used.
///
/// Returns whether anything changed, so a caller can tell a repaired table from an untouched
/// one without comparing scenes.
pub fn close_scene_gaps_in(table: &mut [Scene<DefaultSequenceData>]) -> bool {
    let Some(first) = table.first_mut() else {
        return false;
    };
    let mut changed = false;
    if first.start_frame > 0 {
        first.start_frame = 0;
        changed = true;
    }
    for index in 1..table.len() {
        let previous_end = table[index - 1].end_frame;
        let start = table[index].start_frame;
        if start > previous_end {
            table[index - 1].end_frame = start;
            changed = true;
        }
    }
    changed
}

/// Drop the film-grain table option an encoder document carries.
///
/// Photon noise is the only thing that produces these tables, so a document that clears the
/// setting but keeps the option names a file nothing will write again — the encoder then
/// refuses the whole scene over a missing `--fgs-table` value.
fn clear_grain_tables(encoder: &mut Encoder) {
    for key in crate::GRAIN_OPTION_KEYS {
        encoder.parameters_mut().remove(key);
    }
}

fn read_scenes(condor: &Value) -> Result<Vec<Scene<DefaultSequenceData>>, String> {
    let scenes = condor
        .get("scenes")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    serde_json::from_value(scenes)
        .map_err(|error| format!("The saved scene table is not readable: {error}"))
}

fn write_scenes(condor: &mut Value, scenes: &[Scene<DefaultSequenceData>]) -> Result<(), String> {
    let object = condor
        .as_object_mut()
        .ok_or_else(|| "The saved engine state is not an object.".to_owned())?;
    object.insert(
        "scenes".to_owned(),
        serde_json::to_value(scenes)
            .map_err(|error| format!("The scene table could not be serialised: {error}"))?,
    );
    Ok(())
}

fn read_encoder(condor: &Value) -> Result<Encoder, String> {
    let encoder = condor
        .get("encoder")
        .cloned()
        .ok_or_else(|| "The saved engine state has no encoder document.".to_owned())?;
    serde_json::from_value(encoder)
        .map_err(|error| format!("The saved encoder document is not readable: {error}"))
}

fn write_encoder(condor: &mut Value, encoder: &Encoder) -> Result<(), String> {
    let object = condor
        .as_object_mut()
        .ok_or_else(|| "The saved engine state is not an object.".to_owned())?;
    object.insert(
        "encoder".to_owned(),
        serde_json::to_value(encoder)
            .map_err(|error| format!("The encoder document could not be serialised: {error}"))?,
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use andean_condor::models::{
        encoder::{Encoder, EncoderBase},
        scene::Scene,
        sequence::DefaultSequenceData,
    };
    use proptest::prelude::*;
    use serde_json::json;

    use super::*;

    fn scene(start: usize, end: usize, quantizer: f64) -> Scene<DefaultSequenceData> {
        let mut encoder = Encoder::default_from_base(&EncoderBase::SVTAV1, false);
        encoder.set_quantizer(quantizer);
        Scene {
            start_frame: start,
            end_frame: end,
            sub_scenes: None,
            encoder,
            sequence_data: DefaultSequenceData::default(),
        }
    }

    fn condor(scenes: Vec<Scene<DefaultSequenceData>>) -> Value {
        json!({
            "input": {"Video": {"path": "in.mkv"}},
            "output": {"path": "out.mkv"},
            "encoder": Encoder::default_from_base(&EncoderBase::SVTAV1, false),
            "scenes": scenes,
            "sequence_config": {},
        })
    }

    #[test]
    fn scene_detection_reset_clears_the_table_and_its_files() {
        let value = condor(vec![scene(0, 24, 30.0), scene(24, 48, 35.0)]);
        let plan = reset_sequence(&value, "SceneDetector").expect("reset");
        assert_eq!(plan.condor["scenes"], json!([]));
        assert!(plan.files.all_chunks);
        assert!(plan.files.target_quality);
        assert!(plan.files.parallel_encoder);
    }

    #[test]
    fn target_quality_reset_restores_the_main_quantizer_and_drops_passes() {
        let mut value = condor(vec![scene(0, 24, 12.0)]);
        value["scenes"][0]["sequence_data"]["target_quality"] = json!({
            "passes": [{
                "quantizer": 12.0,
                "scores": [90.0],
                "bitrate": 1.0,
                "started_on": 1,
                "completed_on": 2
            }]
        });
        let plan = reset_sequence(&value, "TargetQuality").expect("reset");
        assert_eq!(
            plan.condor["scenes"][0]["sequence_data"]["target_quality"]["passes"],
            json!([])
        );
        assert_eq!(
            plan.condor["scenes"][0]["encoder"]["SVTAV1"]["options"]["crf"]["Number"]["value"],
            25.0
        );
        assert!(plan.files.target_quality);
    }

    #[test]
    fn noise_scaling_reset_clears_photon_noise_and_scaler_data() {
        let mut value = condor(vec![scene(0, 24, 30.0)]);
        value["scenes"][0]["sequence_data"]["noise_detection"] = json!({"noise": 5.0, "luminance": 0.4, "created_on": {"secs_since_epoch": 0, "nanos_since_epoch": 0}});
        value["scenes"][0]["sequence_data"]["noise_scaling"] = json!({"scaler": 1.4});
        value["scenes"][0]["encoder"]["SVTAV1"]["photon_noise"] = json!({"iso": 800});
        // The table Parallel Encoder wrote for that setting, which nothing will rewrite once
        // the setting is cleared.
        value["scenes"][0]["encoder"]["SVTAV1"]["options"]["fgs-table"] = json!({
            "String": {"delimiter": " ", "prefix": "--", "value": "C:/scenes/59a.tbl"}
        });
        value["encoder"]["SVTAV1"]["options"]["fgs-table"] = json!({
            "String": {"delimiter": " ", "prefix": "--", "value": "C:/scenes/59a.tbl"}
        });
        let plan = reset_sequence(&value, "NoiseScaler").expect("reset");
        assert!(plan.condor["scenes"][0]["sequence_data"]["noise_scaling"].is_null());
        assert!(plan.condor["scenes"][0]["encoder"]["SVTAV1"]["photon_noise"].is_null());
        assert!(plan.condor["encoder"]["SVTAV1"]["photon_noise"].is_null());
        assert!(
            plan.condor["scenes"][0]["encoder"]["SVTAV1"]["options"]["fgs-table"].is_null(),
            "the scene no longer points at a table nothing will write"
        );
        assert!(
            plan.condor["encoder"]["SVTAV1"]["options"]["fgs-table"].is_null(),
            "nor does the main encoder"
        );
    }

    #[test]
    fn speed_reset_restores_the_main_encoder_speed() {
        let mut value = condor(vec![scene(0, 24, 30.0)]);
        value["scenes"][0]["encoder"]["SVTAV1"]["options"]["preset"]["Number"]["value"] =
            json!(2.0);
        let plan = reset_sequence(&value, "SpeedScaler").expect("reset");
        assert_eq!(
            plan.condor["scenes"][0]["encoder"]["SVTAV1"]["options"]["preset"]["Number"]["value"],
            4.0
        );
    }

    #[test]
    fn encoder_reset_clears_parallel_data_and_marks_chunks_and_its_directory() {
        let mut value = condor(vec![scene(0, 24, 30.0)]);
        value["scenes"][0]["sequence_data"]["parallel_encoder"] =
            json!({"started_on": 1, "completed_on": 2, "bytes": 10});
        let plan = reset_sequence(&value, "ParallelEncoder").expect("reset");
        assert!(
            plan.condor["scenes"][0]["sequence_data"]["parallel_encoder"]["started_on"].is_null()
        );
        assert!(plan.files.scene_chunks);
        assert!(!plan.files.all_chunks);
        assert!(plan.files.parallel_encoder);
    }

    #[test]
    fn a_split_inherits_the_encoder_and_clears_both_halves() {
        let value = condor(vec![scene(0, 48, 30.0)]);
        let next = split_scene(&value, 20).expect("split");
        let scenes = next["scenes"].as_array().expect("scenes");
        assert_eq!(scenes.len(), 2);
        assert_eq!(scenes[0]["start_frame"], 0);
        assert_eq!(scenes[0]["end_frame"], 20);
        assert_eq!(scenes[1]["start_frame"], 20);
        assert_eq!(scenes[1]["end_frame"], 48);
        assert_eq!(scenes[0]["encoder"], scenes[1]["encoder"]);
    }

    #[test]
    fn an_added_scene_fills_a_gap_in_order_with_the_main_encoder() {
        let value = condor(vec![scene(0, 24, 30.0), scene(48, 72, 30.0)]);
        let next = add_scene(&value, 24, 48).expect("add");
        let scenes = next["scenes"].as_array().expect("scenes");
        assert_eq!(scenes.len(), 3);
        assert_eq!(scenes[1]["start_frame"], 24);
        assert_eq!(scenes[1]["end_frame"], 48);
        assert_eq!(scenes[1]["encoder"], value["encoder"]);
        assert!(add_scene(&value, 20, 30).is_err());
        assert!(add_scene(&value, 40, 40).is_err());
    }

    #[test]
    fn a_merge_needs_adjacent_scenes_and_takes_the_outer_range() {
        let value = condor(vec![
            scene(0, 24, 30.0),
            scene(24, 48, 31.0),
            scene(48, 72, 32.0),
        ]);
        let next = merge_scenes(&value, &[0, 1]).expect("merge");
        let scenes = next["scenes"].as_array().expect("scenes");
        assert_eq!(scenes.len(), 2);
        assert_eq!(scenes[0]["start_frame"], 0);
        assert_eq!(scenes[0]["end_frame"], 48);
        assert!(merge_scenes(&value, &[0, 2]).is_err());
    }

    #[test]
    fn a_range_edit_keeps_the_encoder_and_clears_the_old_measurements() {
        let mut value = condor(vec![scene(0, 24, 30.0), scene(24, 48, 30.0)]);
        value["scenes"][0]["sequence_data"]["noise_detection"] = json!({
            "noise": 4.2,
            "luminance": 0.3,
            "created_on": { "secs_since_epoch": 0, "nanos_since_epoch": 0 }
        });
        let next = set_scene_range(&value, 0, 4, 20).expect("range");
        assert_eq!(next["scenes"][0]["start_frame"], 4);
        assert_eq!(next["scenes"][0]["end_frame"], 20);
        assert!(next["scenes"][0]["sequence_data"]["noise_detection"].is_null());
        assert_eq!(next["scenes"][1]["start_frame"], 24);
        assert!(set_scene_range(&value, 0, 20, 20).is_err());
        assert!(set_scene_range(&value, 9, 0, 10).is_err());
    }

    #[test]
    fn deleting_a_scene_leaves_its_frames_uncovered() {
        let value = condor(vec![
            scene(0, 24, 30.0),
            scene(24, 48, 30.0),
            scene(48, 72, 30.0),
        ]);
        let next = delete_scene(&value, 1).expect("delete");
        let scenes = next["scenes"].as_array().expect("scenes");
        assert_eq!(scenes.len(), 2);
        assert_eq!(scenes[1]["start_frame"], 48);
        assert!(delete_scene(&value, 3).is_err());
    }

    #[test]
    fn a_hole_between_scenes_is_given_to_the_scene_before_it() {
        let value = condor(vec![
            scene(0, 181, 30.0),
            scene(181, 271, 30.0),
            scene(276, 431, 30.0),
            scene(431, 756, 30.0),
        ]);
        let next = close_scene_gaps(&value)
            .expect("close")
            .expect("the hole changed the table");
        let scenes = next["scenes"].as_array().expect("scenes");
        assert_eq!(scenes[1]["start_frame"], 181);
        assert_eq!(scenes[1]["end_frame"], 276, "the five frames join scene 2");
        assert_eq!(scenes[2]["start_frame"], 276);
        assert_eq!(scenes[3]["end_frame"], 756);
        assert!(
            close_scene_gaps(&next).expect("close").is_none(),
            "a covered table is left untouched"
        );
    }

    #[test]
    fn closing_gaps_starts_at_zero_but_leaves_a_trimmed_tail_and_an_overlap() {
        let value = condor(vec![scene(4, 24, 30.0), scene(48, 72, 30.0)]);
        let next = close_scene_gaps(&value)
            .expect("close")
            .expect("the leading hole changed the table");
        let scenes = next["scenes"].as_array().expect("scenes");
        assert_eq!(
            scenes[0]["start_frame"], 0,
            "the head joins the first scene"
        );
        assert_eq!(scenes[0]["end_frame"], 48, "and the hole joins it as well");
        assert_eq!(scenes[1]["start_frame"], 48);
        // A table that stops early is a trim, not a hole: nothing after it can shift.
        let tail = condor(vec![scene(0, 24, 30.0), scene(24, 48, 30.0)]);
        assert!(close_scene_gaps(&tail).expect("close").is_none());
        // An overlap is ambiguous, so it is left for the validation strip to report.
        let overlap = condor(vec![scene(0, 24, 30.0), scene(20, 48, 30.0)]);
        assert!(close_scene_gaps(&overlap).expect("close").is_none());
    }

    #[test]
    fn restoring_a_snapshot_rejects_a_table_the_engine_cannot_read() {
        let value = condor(vec![scene(0, 24, 30.0)]);
        let snapshot = value["scenes"].clone();
        let next = restore_scene_table(&value, &snapshot).expect("restore");
        assert_eq!(next["scenes"], snapshot);
        assert!(restore_scene_table(&value, &json!([{ "start_frame": 0 }])).is_err());
    }

    #[test]
    fn scene_output_reset_clears_only_the_selected_encoder_results() {
        let mut value = condor(vec![scene(0, 24, 30.0), scene(24, 48, 30.0)]);
        value["scenes"][0]["sequence_data"]["parallel_encoder"] =
            json!({"started_on": 1, "completed_on": 2, "bytes": 10});
        value["scenes"][1]["sequence_data"]["parallel_encoder"] =
            json!({"started_on": 3, "completed_on": 4, "bytes": 20});
        let next = reset_scene_outputs(&value, &[1]).expect("reset");
        assert_eq!(
            next["scenes"][0]["sequence_data"]["parallel_encoder"]["bytes"],
            10
        );
        assert!(next["scenes"][1]["sequence_data"]["parallel_encoder"]["bytes"].is_null());
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(96))]

        /// A sorted table is the shape Scene Detector produces. Repair may only move the
        /// end of the scene before a hole, never a start, and it must close every hole it
        /// can see without touching an already adjacent pair.
        #[test]
        fn closing_gaps_repairs_only_the_end_before_a_hole(
            mut starts in prop::collection::vec(0usize..4_000, 1..12),
        ) {
            starts.sort_unstable();
            starts.dedup();
            let lengths: Vec<usize> = (0..starts.len())
                .map(|index| starts.get(index + 1).map_or(24, |next| next - starts[index]))
                .collect();
            let ends: Vec<usize> = starts.iter().zip(&lengths).map(|(start, length)| start + length).collect();
            let mut scenes: Vec<Scene<DefaultSequenceData>> = starts
                .iter()
                .zip(&ends)
                .map(|(start, end)| scene(*start, *end, 30.0))
                .collect();

            close_scene_gaps_in(&mut scenes);

            prop_assert_eq!(scenes[0].start_frame, 0);
            for (index, scene) in scenes.iter().enumerate().skip(1) {
                prop_assert_eq!(scene.start_frame, starts[index]);
                if starts[index] > ends[index - 1] {
                    prop_assert_eq!(
                        scenes[index - 1].end_frame,
                        starts[index],
                        "the hole is given to the scene before it"
                    );
                } else {
                    prop_assert_eq!(scenes[index - 1].end_frame, ends[index - 1]);
                }
            }
        }
    }
}
