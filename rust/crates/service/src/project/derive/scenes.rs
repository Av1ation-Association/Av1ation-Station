use super::*;

pub(crate) fn scenes(
    video_id: &str,
    condor: Option<&Value>,
    custom: &std::collections::BTreeMap<u32, std::collections::BTreeMap<String, Value>>,
    chunks: &[(String, u64)],
    inherited_encoder: Option<&Value>,
) -> SceneList {
    let scenes = condor
        .and_then(|condor| condor.get("scenes"))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();

    let mut total_frames = 0;
    let mut views = Vec::with_capacity(scenes.len());
    for (index, scene) in scenes.iter().enumerate() {
        let end_frame = scene.get("end_frame").and_then(Value::as_u64).unwrap_or(0);
        total_frames = total_frames.max(end_frame);
        views.push(scene_view(
            u32::try_from(index).unwrap_or(u32::MAX),
            scene,
            VideoStore::chunk_bytes(chunks, index),
            inherited_encoder,
            custom
                .get(&u32::try_from(index).unwrap_or(u32::MAX))
                .cloned()
                .unwrap_or_default(),
        ));
    }

    SceneList {
        video_id: video_id.to_owned(),
        total_frames,
        scene_fingerprint: scene_fingerprint(condor, custom),
        scenes: views,
    }
}

/// Overlay the live run's per-scene measurements on the table a read returns.
///
/// Noise Detector's values become durable when its sequence checkpoints, which is at the end
/// of its run. Until then the live events are the only evidence a scene has been measured, so
/// a page opened mid-run would show nothing for the scenes already sampled. A stored value and
/// a live one are the same measurement; the live value wins because it is the newer of the two.
pub(crate) fn with_live_noise(list: &mut SceneList, live: &std::collections::BTreeMap<u32, f64>) {
    for (index, noise) in live {
        if let Some(scene) = list.scenes.get_mut(*index as usize) {
            scene.noise = Some(*noise);
        }
    }
}

/// A short, stable fingerprint of the scene table a script receives.
///
/// A script's decode reads each scene's boundaries and `sequence_data` — the user's own
/// pairs merged in — and can change the picture for that range, so two runs over the same
/// file with different scene data are different pictures. The scene list advertises this
/// value and the preview cache is keyed by it, so a change rebuilds the window instead of
/// replaying one decoded under the old table.
///
/// The hash covers the stored checkpoint's scene entries rather than the rendered
/// [`SceneView`] rows: a row carries display-only aggregates, and a change to those must
/// not throw away a decoded window.
pub(crate) fn scene_fingerprint(
    condor: Option<&Value>,
    custom: &std::collections::BTreeMap<u32, std::collections::BTreeMap<String, Value>>,
) -> String {
    let empty = Vec::new();
    let scenes = condor
        .and_then(|condor| condor.get("scenes"))
        .and_then(Value::as_array)
        .unwrap_or(&empty);
    let table = serde_json::json!({ "scenes": scenes, "custom": custom });
    format!(
        "{:016x}",
        crate::platform::hash::fnv1a(serde_json::to_string(&table).unwrap_or_default().as_bytes())
    )
}

/// One scene's row, shared by the table read and the live checkpoint event.
///
/// A checkpoint append has no retained chunk yet, so it passes `None`; the next full read
/// fills that field from the directory walk. Keeping one conversion is what makes the live
/// row and the reloaded row identical.
pub(crate) fn scene_view(
    index: u32,
    scene: &Value,
    chunk_bytes: Option<u64>,
    inherited_encoder: Option<&Value>,
    custom_data: std::collections::BTreeMap<String, Value>,
) -> SceneView {
    let start_frame = scene
        .get("start_frame")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let end_frame = scene.get("end_frame").and_then(Value::as_u64).unwrap_or(0);
    // The flattened pair and the pass list are the same parse, so the final pass shown in a
    // scene row can never be a different pass from the last one the chart draws.
    let passes = target_quality_passes(scene);
    let final_pass = passes.last();
    let quantizer = final_pass.and_then(|pass| pass.quantizer);
    let score = final_pass.and_then(|pass| pass.score);
    let encoder = scene.get("encoder");
    let noise = scene
        .pointer("/sequence_data/noise_detection/noise")
        .and_then(Value::as_f64);
    let noise_scaler = scene
        .pointer("/sequence_data/noise_scaling/scaler")
        .and_then(Value::as_f64);
    let speed = encoder.and_then(av1ation_engine::capability::catalogue::encoder_speed);
    let quality_score = mean_scores(scene.pointer("/sequence_data/quality_check/quality/scores"));

    SceneView {
        index,
        start_frame,
        end_frame,
        frame_count: end_frame.saturating_sub(start_frame),
        encoded: chunk_bytes.is_some(),
        chunk_bytes,
        quantizer,
        score,
        noise,
        noise_scaler,
        speed,
        quality_score,
        passes,
        encode_ms: parallel_encoder_ms(scene),
        encoder_label: encoder
            .and_then(av1ation_engine::capability::catalogue::encoder_label)
            .unwrap_or_else(|| "Unknown encoder".to_owned()),
        // With no resolved encoder there is nothing to compare against, so a scene is
        // reported as inheriting rather than claiming an override that may not exist.
        encoder_custom: matches!(
            (encoder, inherited_encoder),
            (Some(scene_encoder), Some(inherited)) if scene_encoder != inherited
        ),
        custom_data,
        encoder_fingerprint: effective_encoder(scene, inherited_encoder).map(encoder_fingerprint),
    }
}

/// The encoder document a scene encodes with: its own when it carries one, otherwise the
/// video's resolved encoder.
///
/// The preview and the run both resolve the document this way, so it is stated once here
/// rather than re-implemented beside the preview cache.
pub(crate) fn effective_encoder<'a>(
    scene: &'a Value,
    inherited: Option<&'a Value>,
) -> Option<&'a Value> {
    scene
        .get("encoder")
        .filter(|encoder| !encoder.is_null())
        .or(inherited)
}

/// A short, stable fingerprint of one encoder document.
///
/// Every picture the Encoded source shows comes from this document, so the value is what
/// tells a player that the chunk it holds was built from different settings. It is the same
/// hash the preview cache is keyed by, over the same serialised document, so the two cannot
/// disagree about which configuration produced a file.
pub(crate) fn encoder_fingerprint(encoder: &Value) -> String {
    let json = serde_json::to_string(encoder).unwrap_or_default();
    format!("{:016x}", crate::platform::hash::fnv1a(json.as_bytes()))
}

/// Every Target Quality pass a scene recorded, in probe order.
///
/// A pass is one probe encode: the quantizer it used, its per-frame scores, the bitrate it
/// produced, and when it ran. The screen graphs each pass separately, so the frame scores
/// are reduced to their mean and extremes here rather than carried per frame; a 4,000-scene
/// table would otherwise repeat every metric's per-frame array in one response.
pub(super) fn target_quality_passes(scene: &Value) -> Vec<ScenePassView> {
    let Some(passes) = scene
        .pointer("/sequence_data/target_quality/passes")
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    passes
        .iter()
        .enumerate()
        .filter_map(|(position, pass)| {
            let values: Vec<f64> = pass
                .get("scores")
                .and_then(Value::as_array)
                .map(|scores| scores.iter().filter_map(Value::as_f64).collect())
                .unwrap_or_default();
            let quantizer = pass.get("quantizer").and_then(Value::as_f64);
            // A pass with neither a quantizer nor a score measured nothing a graph can plot.
            if quantizer.is_none() && values.is_empty() {
                return None;
            }
            // A completed probe is a positive interval; two default timestamps are not a
            // measurement, and a zero would read as an instant encode.
            let duration_ms = match (
                pass.get("started_on").and_then(Value::as_u64),
                pass.get("completed_on").and_then(Value::as_u64),
            ) {
                (Some(start), Some(end)) if end > start => Some(end - start),
                _ => None,
            };
            Some(ScenePassView {
                pass: u32::try_from(position + 1).unwrap_or(u32::MAX),
                quantizer,
                score: (!values.is_empty())
                    .then(|| values.iter().sum::<f64>() / values.len() as f64),
                score_min: values.iter().copied().reduce(f64::min),
                score_max: values.iter().copied().reduce(f64::max),
                frames: u32::try_from(values.len()).unwrap_or(u32::MAX),
                // The engine writes zero for a pass whose probe produced no encode size.
                bitrate: pass
                    .get("bitrate")
                    .and_then(Value::as_f64)
                    .filter(|value| *value > 0.0),
                duration_ms,
            })
        })
        .collect()
}

/// Wall-clock milliseconds Parallel Encoder spent on one scene, when it recorded both ends.
pub(super) fn parallel_encoder_ms(scene: &Value) -> Option<u64> {
    let data = scene.pointer("/sequence_data/parallel_encoder")?;
    let start = data.get("started_on").and_then(Value::as_u64)?;
    let end = data.get("completed_on").and_then(Value::as_u64)?;
    (end > start).then(|| end - start)
}

/// The mean of a scores array, or `None` when the metric returned nothing.
pub(super) fn mean_scores(value: Option<&Value>) -> Option<f64> {
    let scores = value?.as_array()?;
    let values: Vec<f64> = scores.iter().filter_map(Value::as_f64).collect();
    (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
}

pub(super) fn detail_for(
    id: &str,
    scene_count: usize,
    encoded: usize,
    scaled: usize,
    output_exists: bool,
    partial_end: Option<u64>,
    source_frames: Option<u64>,
) -> Option<String> {
    match id {
        "SceneDetector" if scene_count == 0 => Some("No scenes detected yet".to_owned()),
        "SceneDetector"
            if partial_end.is_some() && source_frames.is_some_and(|total| total > 0) =>
        {
            let percent = partial_end.unwrap_or_default() as f64
                / source_frames.unwrap_or_default() as f64
                * 100.0;
            Some(format!("{percent:.1}%, {scene_count} found"))
        }
        "SceneDetector" => Some(format!(
            "{scene_count} scene{} detected",
            if scene_count == 1 { "" } else { "s" }
        )),
        "ParallelEncoder" => Some(format!("{encoded}/{scene_count} scenes encoded")),
        "NoiseScaler" if scaled > 0 => Some(format!("{scaled}/{scene_count} scenes scaled")),
        "NoiseScaler" => Some("No scene needed scaling".to_owned()),
        "SceneConcatenator" if output_exists => Some("Output written".to_owned()),
        // The engine has no completion field for these two, so the row explains that it is
        // an on-demand rewrite instead of claiming a state it cannot know.
        "SpeedScaler" => Some("Runs on demand; rewrites each scene's encoder speed".to_owned()),
        "BitrateOptimizer" => {
            Some("Runs on demand; rewrites high-bitrate scene quantizers".to_owned())
        }
        _ => None,
    }
}

/// Whether any scene carries a Target Quality pass, which is all Bitrate Optimizer reads.
pub(super) fn has_target_quality_pass(scenes: &[Value]) -> bool {
    scenes.iter().any(|scene| {
        scene
            .pointer("/sequence_data/target_quality/passes")
            .and_then(Value::as_array)
            .is_some_and(|passes| !passes.is_empty())
    })
}
