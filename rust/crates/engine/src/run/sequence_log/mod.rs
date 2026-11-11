//! The run log's description of what each sequence produced.
//!
//! The run log used to carry lifecycle text only — `Noise Detector completed` says nothing
//! about the noise it measured, so a wrong-looking result could only be checked by opening
//! the persisted checkpoint. This module turns the engine's own scene table into one record
//! per scene where that is useful, plus a summary per sequence (and per probe pass for
//! Target Quality).
//!
//! It reads the scene table as JSON rather than the typed structs. That is the same
//! document a checkpoint persists and the service projects into `SceneView`, so the log
//! cannot describe a field the engine did not write, and every pointer below is one
//! `rust/crates/service/src/project/derive.rs` already reads.

use std::collections::BTreeMap;

use serde_json::Value;

use crate::capability::catalogue;

/// What a run knows that the scene table does not.
///
/// `config_before` is the configuration the run started with, while `config_after` is the
/// engine's current one: Benchmarker resolves `auto` workers into that copy, so the two
/// together are what makes `auto → 8` observable.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Context<'a> {
    pub(crate) config_before: &'a Value,
    pub(crate) config_after: &'a Value,
    /// Source frame rate, for turning a chunk's bytes into a bitrate.
    pub(crate) fps: Option<f64>,
    pub(crate) elapsed_seconds: f64,
    /// The last frame covered before this sequence ran.
    pub(crate) last_end_before: u64,
    /// Scenes that already carried a noise measurement.
    pub(crate) measured_before: usize,
}

/// The records one sequence writes when it ends.
///
/// Detail lines come first and the summary last: the log viewer opens at the tail, so the
/// answer is the last thing on screen and the evidence sits above it. A sequence may write
/// no detail rows, and a sequence that produced nothing still writes a summary saying so.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Records {
    pub(crate) detail: Vec<String>,
    pub(crate) summary: Vec<String>,
}

/// Build one sequence's records from the scene table as it stands after that sequence ran.
pub(crate) fn records(sequence: &str, scenes: &[Value], context: Context<'_>) -> Records {
    match sequence {
        "SceneDetector" => Records {
            detail: scenes
                .iter()
                .enumerate()
                .map(|(index, scene)| {
                    let (start, end) = scene_bounds(scene);
                    format!(
                        "Scene {}: {}–{}",
                        index + 1,
                        with_commas(start),
                        with_commas(end)
                    )
                })
                .collect(),
            summary: vec![scene_detector(scenes, context)],
        },
        "NoiseDetector" => noise_detector(scenes, context),
        "NoiseScaler" => Records {
            detail: Vec::new(),
            summary: vec![noise_scaler(scenes, context.config_after)],
        },
        "TargetQuality" => target_quality(scenes, context.config_after),
        "SpeedScaler" => Records {
            detail: Vec::new(),
            summary: vec![speed_scaler(scenes, context.config_after)],
        },
        "BitrateOptimizer" => Records {
            detail: Vec::new(),
            summary: vec![bitrate_optimizer(scenes, context.config_after)],
        },
        "Benchmarker" => Records {
            detail: Vec::new(),
            summary: vec![benchmarker(context)],
        },
        "ParallelEncoder" => parallel_encoder(scenes, context),
        "SceneConcatenator" => Records {
            detail: Vec::new(),
            summary: vec![scene_concatenator(scenes, context.config_after)],
        },
        "QualityCheck" => Records {
            detail: Vec::new(),
            summary: vec![quality_check(scenes, context.config_after)],
        },
        // A run cannot reach a sequence this build does not know; it fails before executing.
        _ => Records::default(),
    }
}

/// What the run is about to encode, for the log's first three lines.
///
/// Without them a per-scene noise value cannot be judged: the reader needs to know which
/// source, which encoder, and which settings produced it.
pub(crate) struct Source<'a> {
    pub(crate) path: &'a str,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) fps: f64,
    pub(crate) frames: u64,
}

/// The records a run writes before its first sequence starts.
pub(crate) fn run_start(
    source: Option<Source<'_>>,
    encoder: Option<&Value>,
    sequences: &[String],
    config: &Value,
) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = match source {
        Some(source) => format!(
            "Run: {} · {}×{} · {:.3} fps · {} frames",
            file_name(source.path),
            source.width,
            source.height,
            source.fps,
            with_commas(source.frames),
        ),
        None => "Run: source not probed".to_owned(),
    };
    if !sequences.is_empty() {
        line.push_str(&format!(
            " · {} sequences: {}",
            sequences.len(),
            sequences.join(" → ")
        ));
    }
    lines.push(line);

    if let Some(encoder) = encoder {
        let label = catalogue::encoder_label(encoder).unwrap_or_else(|| "unknown".to_owned());
        let mut line = format!("Encoder: {label}");
        if let Some(speed) = catalogue::encoder_speed(encoder) {
            line.push_str(&format!(
                " · {}",
                tenths_label((speed * 10.0).round() as u64)
            ));
        }
        lines.push(line);
    }

    let mut settings = Vec::new();
    if let Some(threshold) = number(config, "/noise_scaler/threshold") {
        let low = number(config, "/noise_scaler/minimum_scaler").unwrap_or(1.0);
        let high = number(config, "/noise_scaler/maximum_scaler").unwrap_or(1.0);
        settings.push(format!("noise ≥{threshold:.4} ×{low:.2}–{high:.2}"));
    }
    if let Some(quality) = config
        .pointer("/target_quality")
        .filter(|value| value.is_object())
    {
        let mut block = enum_label(quality.get("metric")).unwrap_or_else(|| "quality".to_owned());
        // The scale and the norm are as important as the metric's name: a Butteraugli target
        // range read against the infinity norm is a different quantity from the same range
        // read against the Q-norm, and a log that names only the metric hides that.
        let body = quality
            .get("metric")
            .and_then(Value::as_object)
            .and_then(|metric| metric.values().next())
            .filter(|value| value.is_object());
        if let Some(range) = body
            .and_then(|body| body.get("target_range"))
            .and_then(Value::as_array)
            .filter(|range| range.len() >= 2)
        {
            let low = range.first().and_then(Value::as_f64);
            let high = range.get(1).and_then(Value::as_f64);
            if let (Some(low), Some(high)) = (low, high) {
                block.push_str(&format!(" {low:.4}–{high:.4}"));
            }
        }
        if let Some(norm) = body.and_then(|body| body.get("norm")) {
            block.push_str(&match norm.as_i64() {
                Some(norm) => format!(" q-norm {norm}"),
                None => " infinity norm".to_owned(),
            });
        }
        if let Some(probes) = number(quality, "/maximum_probes") {
            block.push_str(&format!(" ≤{probes:.0} probes"));
        }
        settings.push(block);
    }
    if let Some(sigma) = number(config, "/bitrate_optimizer/bitrate_sigma_threshold") {
        settings.push(format!("bitrate {sigma}σ"));
    }
    if let Some(threshold) = number(config, "/benchmarker/threshold") {
        settings.push(format!("benchmark +{threshold:.0}%"));
    }
    settings.push(match number(config, "/parallel_encoder/workers") {
        Some(workers) => format!("workers {workers:.0}"),
        None => "workers auto".to_owned(),
    });
    lines.push(format!("Settings: {}", settings.join(" · ")));

    // The detector's own shape is what a surprising scene split or noise value has to be
    // checked against, and neither is recoverable from the scene table afterwards.
    if let Some(detector) = config
        .pointer("/scene_detector")
        .filter(|value| value.is_object())
    {
        let body = tagged_body(detector.get("method"));
        let method = enum_label(detector.get("method")).unwrap_or_else(|| "unknown".to_owned());
        let minimum = body
            .and_then(|body| body.get("minimum_length"))
            .and_then(Value::as_f64);
        let maximum = body
            .and_then(|body| body.get("maximum_length"))
            .and_then(Value::as_f64);
        let mut line = format!("Scene Detector: {method}");
        if let Some(minimum) = minimum {
            line.push_str(&format!(" · min {minimum:.0} frames"));
        }
        if let Some(maximum) = maximum {
            line.push_str(&format!(" · max {maximum:.0} frames"));
        }
        lines.push(line);
    }
    if let Some(noise) = config
        .pointer("/noise_detector")
        .filter(|value| value.is_object())
    {
        let reference = filter_names(noise.get("reference_filters"));
        let denoised = filter_names(noise.get("denoised_filters"));
        lines.push(format!(
            "Noise Detector: reference {} · denoised {}",
            if reference.is_empty() {
                "none"
            } else {
                &reference
            },
            if denoised.is_empty() {
                "none"
            } else {
                &denoised
            }
        ));
    }
    lines
}

/// The first variant body of an externally tagged enum document.
fn tagged_body(value: Option<&Value>) -> Option<&Value> {
    value
        .and_then(Value::as_object)
        .and_then(|map| map.values().next())
        .filter(|value| value.is_object())
}

/// The plugin names in one filter list, in the order the engine applies them.
fn filter_names(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_array)
        .map(|filters| {
            filters
                .iter()
                .filter_map(|filter| enum_label(Some(filter)))
                .collect::<Vec<_>>()
                .join(" → ")
        })
        .unwrap_or_default()
}

mod sequences;
use sequences::*;
/// `Scene 4: frames 72–95`.
///
/// One-based, because every surface a user compares against — the rail, the timeline, the
/// references in a bug report — numbers scenes from one.
fn scene_prefix(index: usize, scene: &Value) -> String {
    let start = number(scene, "/start_frame").unwrap_or(0.0);
    let end = number(scene, "/end_frame").unwrap_or(0.0);
    format!(
        "Scene {}: {}–{}",
        index + 1,
        with_commas(start.max(0.0) as u64),
        with_commas((end - 1.0).max(start).max(0.0) as u64),
    )
}

/// The engine's half-open frame range, as whole frames.
fn scene_bounds(scene: &Value) -> (u64, u64) {
    let start = number(scene, "/start_frame").unwrap_or(0.0);
    let end = number(scene, "/end_frame").unwrap_or(0.0);
    (start.max(0.0) as u64, end.max(0.0) as u64)
}

fn scene_frames(scene: &Value) -> f64 {
    let start = number(scene, "/start_frame").unwrap_or(0.0);
    let end = number(scene, "/end_frame").unwrap_or(0.0);
    (end - start).max(0.0)
}

fn passes_of(scene: &Value) -> Vec<&Value> {
    scene
        .pointer("/sequence_data/target_quality/passes")
        .and_then(Value::as_array)
        .map(|passes| passes.iter().collect())
        .unwrap_or_default()
}

fn last_pass(scene: &Value) -> Option<&Value> {
    scene
        .pointer("/sequence_data/target_quality/passes")
        .and_then(Value::as_array)
        .and_then(|passes| passes.last())
}

/// One pass's frame scores. Quality Check stores the same `QualityPass` shape under its own
/// key, so this reads a pass, not a sequence.
fn passes_scores(pass: &Value) -> Vec<f64> {
    pass.get("scores")
        .and_then(Value::as_array)
        .map(|scores| scores.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default()
}

fn number(value: &Value, pointer: &str) -> Option<f64> {
    value.pointer(pointer).and_then(Value::as_f64)
}

fn mean(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        None
    } else {
        Some(values.iter().sum::<f64>() / values.len() as f64)
    }
}

fn median(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.total_cmp(right));
    let middle = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    } else {
        sorted[middle]
    }
}

/// Nearest-rank, which is what a percentile means without interpolation.
fn percentile(values: &[f64], fraction: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.total_cmp(right));
    let rank = ((sorted.len() as f64 * fraction).ceil() as usize).max(1) - 1;
    sorted[rank.min(sorted.len() - 1)]
}

fn deviation(values: &[f64]) -> f64 {
    let Some(centre) = mean(values) else {
        return 0.0;
    };
    let variance = values
        .iter()
        .map(|value| (value - centre).powi(2))
        .sum::<f64>()
        / values.len() as f64;
    variance.sqrt()
}

fn duration(seconds: f64) -> String {
    if !seconds.is_finite() || seconds <= 0.0 {
        return "0s".to_owned();
    }
    if seconds < 60.0 {
        return format!("{seconds:.1}s");
    }
    let whole = seconds.round() as u64;
    if whole < 3_600 {
        return format!("{}m {:02}s", whole / 60, whole % 60);
    }
    format!("{}h {:02}m", whole / 3_600, (whole % 3_600) / 60)
}

fn bytes_label(bytes: f64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    if !bytes.is_finite() || bytes <= 0.0 {
        return "0 B".to_owned();
    }
    let mut value = bytes;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 || value >= 100.0 {
        format!("{value:.0} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

fn with_commas(value: u64) -> String {
    let text = value.to_string();
    let mut out = String::with_capacity(text.len() + text.len() / 3);
    for (index, digit) in text.chars().enumerate() {
        if index > 0 && (text.len() - index).is_multiple_of(3) {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

/// A count held in tenths, printed without a trailing `.0`.
fn tenths_label(tenths: u64) -> String {
    if tenths.is_multiple_of(10) {
        (tenths / 10).to_string()
    } else {
        format!("{}.{}", tenths / 10, tenths % 10)
    }
}

fn plural(count: u64, one: &str, many: &str) -> String {
    format!(
        "{} {}",
        with_commas(count),
        if count == 1 { one } else { many }
    )
}

fn file_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// The name of an externally tagged engine enum, such as `SSIMULACRA2` or `MKVMerge`.
fn enum_label(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.clone()),
        Value::Object(map) => map.keys().next().cloned(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use andean_condor::models::encoder::{Encoder, EncoderBase};
    use serde_json::json;

    fn scene(start: u64, end: u64) -> Value {
        json!({
            "start_frame": start,
            "end_frame": end,
            "sequence_data": {}
        })
    }

    fn context<'a>(before: &'a Value, after: &'a Value) -> Context<'a> {
        Context {
            config_before: before,
            config_after: after,
            fps: Some(24.0),
            elapsed_seconds: 10.0,
            last_end_before: 0,
            measured_before: 0,
        }
    }

    #[test]
    fn a_noise_line_keeps_four_decimals_so_a_small_value_is_not_reported_as_zero() {
        let mut measured = scene(0, 24);
        measured["sequence_data"]["noise_detection"] = json!({ "noise": 0.0021, "luminance": 0.4 });
        let records = records(
            "NoiseDetector",
            &[measured],
            context(&json!({}), &json!({})),
        );
        assert!(
            records.detail[0].starts_with("Scene 1: 0–23 · noise 0.0021"),
            "{}",
            records.detail[0]
        );
        assert!(
            records.summary[0].contains("median 0.0021"),
            "{}",
            records.summary[0]
        );
    }

    #[test]
    fn scene_detection_lists_the_scenes_it_found_in_its_summary() {
        let records = records(
            "SceneDetector",
            &[scene(0, 48), scene(48, 96)],
            context(&json!({}), &json!({})),
        );
        assert_eq!(
            records.summary[0],
            "Scene Detector: 2 scenes · frames 0–95 · 10.0s · 10 fps"
        );
        assert_eq!(
            records.detail,
            vec!["Scene 1: 0–48".to_owned(), "Scene 2: 48–96".to_owned(),],
            "every detected scene names its own range"
        );
    }

    #[test]
    fn target_quality_writes_a_line_per_scene_and_a_summary_per_pass() {
        let mut first = scene(0, 24);
        first["sequence_data"]["target_quality"] = json!({
            "passes": [
                { "quantizer": 30.0, "scores": [90.0, 92.0], "bitrate": 2000000.0, "started_on": 0, "completed_on": 0 },
                { "quantizer": 24.0, "scores": [95.0, 95.0], "bitrate": 3000000.0, "started_on": 0, "completed_on": 0 }
            ]
        });
        let mut second = scene(24, 48);
        second["sequence_data"]["target_quality"] = json!({
            "passes": [
                { "quantizer": 32.0, "scores": [80.0], "bitrate": 1000000.0, "started_on": 0, "completed_on": 0 },
                { "quantizer": 26.0, "scores": [88.0], "bitrate": 1500000.0, "started_on": 0, "completed_on": 0 }
            ]
        });
        let config = json!({ "target_quality": { "metric": "SSIMULACRA2", "maximum_probes": 3 } });
        let records = records(
            "TargetQuality",
            &[first, second],
            context(&json!({}), &config),
        );
        assert_eq!(records.detail.len(), 2, "one line per probed scene");
        assert!(
            records.detail[0].contains("Q24 · score 95.0 · 3.0 Mbps"),
            "{}",
            records.detail[0]
        );
        assert!(
            records.detail[0].contains("2 probes"),
            "{}",
            records.detail[0]
        );
        assert!(
            records.summary[0]
                .starts_with("Target Quality pass 1: 2 scenes · Q30–Q32 · mean Q31.0"),
            "{}",
            records.summary[0]
        );
        assert!(
            records.summary[2].contains("SSIMULACRA2"),
            "{}",
            records.summary[2]
        );
    }

    #[test]
    fn parallel_encoding_reports_each_chunk_and_the_total() {
        let mut chunk = scene(0, 24);
        chunk["sequence_data"]["parallel_encoder"] = json!({
            "bytes": 1_048_576_u64,
            "started_on": 1_000_u64,
            "completed_on": 3_000_u64
        });
        let config = json!({ "parallel_encoder": { "workers": 4 } });
        let records = records("ParallelEncoder", &[chunk], context(&json!({}), &config));
        assert!(
            records.detail[0].contains("1.0 MB") && records.detail[0].contains("24 frames"),
            "{}",
            records.detail[0]
        );
        assert!(
            records.detail[0].contains("2.0s encode"),
            "milliseconds must become seconds: {}",
            records.detail[0]
        );
        assert!(
            records.summary[0].contains("1/1 chunks"),
            "{}",
            records.summary[0]
        );
        assert!(
            records.summary[0].contains("4 workers"),
            "{}",
            records.summary[0]
        );
    }

    #[test]
    fn an_empty_table_still_writes_a_summary_that_says_so() {
        for sequence in [
            "SceneDetector",
            "NoiseDetector",
            "TargetQuality",
            "ParallelEncoder",
            "QualityCheck",
        ] {
            let empty = records(sequence, &[], context(&json!({}), &json!({})));
            assert!(
                !empty.summary.is_empty(),
                "{sequence} wrote no summary for an empty table"
            );
            assert!(empty.detail.is_empty(), "{sequence} invented a detail row");
        }
    }

    #[test]
    fn a_sequence_this_build_does_not_know_writes_nothing() {
        let unknown = records(
            "NotASequence",
            &[scene(0, 24)],
            context(&json!({}), &json!({})),
        );
        assert_eq!(unknown, Records::default());
    }

    #[test]
    fn run_start_names_the_source_encoder_settings_and_sequences() {
        let encoder = serde_json::to_value(Encoder::default_from_base(&EncoderBase::SVTAV1, false))
            .expect("the default encoder serialises");
        let config = json!({
            "noise_scaler": { "threshold": 28.0, "minimum_scaler": 0.5, "maximum_scaler": 1.5 },
            "target_quality": { "metric": "SSIMULACRA2", "maximum_probes": 4 },
            "bitrate_optimizer": { "bitrate_sigma_threshold": 2 },
            "benchmarker": { "threshold": 5 },
            "parallel_encoder": { "workers": null }
        });
        let lines = run_start(
            Some(Source {
                path: "D:\\media\\clip.mkv",
                width: 1920,
                height: 1080,
                fps: 23.976,
                frames: 1_440,
            }),
            Some(&encoder),
            &["SceneDetector".to_owned(), "ParallelEncoder".to_owned()],
            &config,
        );
        assert_eq!(
            lines[0],
            "Run: clip.mkv · 1920×1080 · 23.976 fps · 1,440 frames · 2 sequences: SceneDetector → ParallelEncoder"
        );
        assert!(lines[1].starts_with("Encoder: SVT-AV1"), "{}", lines[1]);
        assert_eq!(
            lines[2],
            "Settings: noise ≥28.0000 ×0.50–1.50 · SSIMULACRA2 ≤4 probes · bitrate 2σ · benchmark +5% · workers auto"
        );
    }

    #[test]
    fn run_start_names_the_detector_configuration() {
        let config = json!({
            "scene_detector": {
                "method": {
                    "AVSceneChange": {
                        "method": "Standard",
                        "minimum_length": 24,
                        "maximum_length": 240
                    }
                }
            },
            "noise_detector": {
                "reference_filters": [{ "WNNM": { "sigma": [3, 0, 0] } }],
                "denoised_filters": [{ "Degrain": { "planes": [0] } }, { "WNNM": {} }]
            }
        });
        let lines = run_start(None, None, &[], &config);
        assert_eq!(
            lines.last().map(String::as_str),
            Some("Noise Detector: reference WNNM · denoised Degrain → WNNM")
        );
        assert!(
            lines.iter().any(
                |line| line == "Scene Detector: AVSceneChange · min 24 frames · max 240 frames"
            ),
            "{lines:?}"
        );
    }

    #[test]
    fn run_start_names_the_quality_scale_and_butteraugli_norm() {
        // A target range only means something beside the norm it was calibrated against.
        // With no norm the plugin reports the infinity norm, and the same 4.9–5.1 range
        // then selects a far lower quantizer than the reader intended.
        let config = json!({
            "target_quality": {
                "metric": {
                    "BUTTERAUGLI": {
                        "target_range": [4.9, 5.1],
                        "norm": null,
                        "intensity_multiplier": null
                    }
                },
                "maximum_probes": 3
            },
            "parallel_encoder": { "workers": 4 }
        });
        let lines = run_start(None, None, &[], &config);
        assert_eq!(
            lines.last().map(String::as_str),
            Some("Settings: BUTTERAUGLI 4.9000–5.1000 infinity norm ≤3 probes · workers 4")
        );

        let q_norm = json!({
            "target_quality": {
                "metric": { "BUTTERAUGLI": { "target_range": [4.9, 5.1], "norm": 3 } },
                "maximum_probes": 3
            },
            "parallel_encoder": { "workers": 4 }
        });
        let lines = run_start(None, None, &[], &q_norm);
        assert!(
            lines
                .last()
                .is_some_and(|line| line.contains("BUTTERAUGLI 4.9000–5.1000 q-norm 3")),
            "{:?}",
            lines.last()
        );
    }
}
