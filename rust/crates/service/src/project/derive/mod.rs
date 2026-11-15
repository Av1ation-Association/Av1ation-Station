//! Derived pipeline state: a pure function of the engine's data, the files on disk, and the
//! live run.
//!
//! Nothing here is persisted. A second copy of the state machine can only disagree with the
//! encoder, so the state is recomputed on every request from evidence the engine already
//! produced (AGENTS §2.2).
//!
//! Two rules matter more than the rest:
//!
//! - "all scenes" is false for zero scenes. An empty scene list means detection has not run,
//!   never that a per-scene sequence is vacuously complete.
//! - a live run overrides older data. Re-running a video starts from a `Condor` that still
//!   carries the previous run's `sequence_data`, so the active sequence must read `Active`
//!   regardless of what is stored.

mod scenes;
pub(crate) use scenes::*;

use av1ation_contracts::run::{SequenceRunStatus, SequenceState};
use av1ation_contracts::scene::{SceneList, ScenePassView, SceneView};
use av1ation_contracts::video::VideoState;
use serde_json::Value;

use crate::project::videos::VideoStore;

/// One sequence this build can run, in pipeline order.
pub(crate) type ChainEntry = (&'static str, &'static str);

/// The evidence a derivation is computed from.
pub(crate) struct Evidence<'a> {
    /// The engine's stored `CondorModel` blob, when the video has run before.
    pub(crate) condor: Option<&'a Value>,
    /// Chunk file names present under the video's temporary directory.
    pub(crate) chunks: &'a [String],
    /// Whether the concatenated output exists and is non-empty.
    pub(crate) output_exists: bool,
    /// Bytes retained under the video's temporary directory.
    pub(crate) retained_bytes: u64,
    /// The sequence a live run is executing, and its completion percentage.
    pub(crate) active: Option<(&'a str, Option<f64>)>,
    /// The live run's correlation id.
    pub(crate) run_id: Option<&'a str>,
    /// The sequence whose last attempt the timeline records as failed.
    pub(crate) failed: Option<&'a str>,
    /// The source frame count the last Scene Detector attempt reported. Without it a
    /// checkpoint can only prove its ranges are ordered, not that they reach the end.
    pub(crate) scene_source_frames: Option<u64>,
}

/// Whether the concatenated output exists and is non-empty.
///
/// A zero-byte file is what a failed concatenation leaves behind, so size is part of the
/// test. Derivation, start preparation, and project summaries read completion through this
/// one predicate, so they cannot disagree about whether a video has an output.
pub(crate) fn output_is_written(path: &str) -> bool {
    !path.is_empty()
        && std::fs::metadata(path).is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
}

/// Sequences that rewrite another sequence's data instead of storing their own result.
///
/// The engine keeps no completion field for either, so they can never be `Complete`; they are
/// actions, not states. `next` must not schedule them, or a finished video would never be
/// finished. A full run still applies them in pipeline order because encoding reads their
/// effects.
pub(crate) const ACTION_SEQUENCES: [&str; 2] = ["SpeedScaler", "BitrateOptimizer"];

/// Whether a sequence is an action on existing data rather than a stored phase.
pub(crate) fn is_action_sequence(id: &str) -> bool {
    ACTION_SEQUENCES.contains(&id)
}

/// The sequences a configuration offers, in pipeline order.
///
/// `ParallelEncoder` replaces the engine's `SerialEncoder`, whose progress reporter is joined
/// before its sender is dropped: it deadlocks unless an encoder reports exactly one line per
/// frame, so it is never offered. `SpeedScaler` and `BitrateOptimizer` are offered after
/// Target Quality when their configuration gives them work: at least two speed/quantizer
/// points, and a bitrate-sigma threshold. They have no completion field, so [`derive`] keeps
/// them out of `next` and the UI runs them individually.
pub(crate) fn chain_for(config: &Value) -> Vec<ChainEntry> {
    let sequences = config.get("sequences");
    let present = |key: &str| {
        sequences
            .and_then(|sequences| sequences.get(key))
            .is_some_and(|value| !value.is_null())
    };
    let speed_points = sequences
        .and_then(|sequences| sequences.get("speed_scaler"))
        .and_then(|scaler| scaler.get("speed_quantizers"))
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let bitrate_enabled = sequences
        .and_then(|sequences| sequences.get("bitrate_optimizer"))
        .and_then(|optimizer| optimizer.get("bitrate_sigma_threshold"))
        .is_some_and(|value| !value.is_null());

    let mut chain: Vec<ChainEntry> = vec![("SceneDetector", sequence_name("SceneDetector"))];
    if present("noise_detector") {
        chain.push(("NoiseDetector", "Noise Detector"));
    }
    if present("noise_scaler") {
        chain.push(("NoiseScaler", "Noise Scaler"));
    }
    if present("target_quality") {
        chain.push(("TargetQuality", "Target Quality"));
    }
    if speed_points >= 2 {
        chain.push(("SpeedScaler", "Speed Scaler"));
    }
    if bitrate_enabled {
        chain.push(("BitrateOptimizer", "Bitrate Optimizer"));
    }
    chain.push(("ParallelEncoder", "Parallel Encoder"));
    chain.push(("SceneConcatenator", "Scene Concatenator"));
    if present("quality_check") {
        chain.push(("QualityCheck", "Quality Check"));
    }
    chain
}

/// Compute one video's state.
pub(crate) fn derive(video_id: &str, chain: &[ChainEntry], evidence: &Evidence<'_>) -> VideoState {
    let scenes = evidence
        .condor
        .and_then(|condor| condor.get("scenes"))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let scene_count = scenes.len();
    let ranges_are_ordered = !scenes.is_empty()
        && scenes.iter().all(|scene| {
            let start = scene.get("start_frame").and_then(Value::as_u64);
            let end = scene.get("end_frame").and_then(Value::as_u64);
            matches!((start, end), (Some(start), Some(end)) if start < end)
        });
    let last_scene_end = scenes
        .last()
        .and_then(|scene| scene.get("end_frame"))
        .and_then(Value::as_u64);
    // Detection writes its scene list incrementally. A cancelled attempt leaves a valid
    // prefix, and only a last boundary at the source's final frame proves it finished.
    let detection_covers_source = ranges_are_ordered
        && evidence
            .scene_source_frames
            .is_none_or(|frames| last_scene_end.is_some_and(|end| end >= frames));
    let detection_incomplete = ranges_are_ordered && !detection_covers_source;
    // Detection checkpoints its scene list, so a cancelled attempt still knows how far it
    // reached. Reporting that fraction is what lets a queue row show a resumable 37%
    // instead of an unqualified "incomplete".
    let detection_percent = detection_incomplete
        .then_some(last_scene_end)
        .flatten()
        .zip(evidence.scene_source_frames)
        .and_then(|(end, total)| {
            (total > 0).then(|| (end as f64 / total as f64 * 100.0).clamp(0.0, 100.0))
        });
    let encoded = (0..scene_count)
        .filter(|index| VideoStore::chunk_present(evidence.chunks, *index))
        .count();
    let all_chunks = scene_count > 0 && encoded == scene_count;

    let complete = |id: &str| -> bool {
        match id {
            "SceneDetector" => detection_covers_source,
            "NoiseDetector" => all_scenes_have(scenes, &["noise_detection"]),
            // Noise Scaler only writes a scene whose encoder has photon noise enabled and
            // whose measured noise clears the threshold, so "every scene scaled" is not a
            // state a real run reaches. Data on any scene is proof the sequence ran; the
            // detail line reports how many of the scenes it actually rewrote.
            "NoiseScaler" => scenes.iter().any(|scene| {
                scene
                    .pointer("/sequence_data/noise_scaling")
                    .is_some_and(|value| !value.is_null())
            }),
            "TargetQuality" => {
                !scenes.is_empty()
                    && scenes.iter().all(|scene| {
                        scene
                            .pointer("/sequence_data/target_quality/passes")
                            .and_then(Value::as_array)
                            .is_some_and(|passes| {
                                passes
                                    .iter()
                                    .any(|pass| scores(pass.get("scores")).is_some())
                            })
                    })
            }
            "ParallelEncoder" => all_chunks,
            "SceneConcatenator" => evidence.output_exists,
            "QualityCheck" => {
                !scenes.is_empty()
                    && scenes.iter().all(|scene| {
                        scene
                            .pointer("/sequence_data/quality_check/quality")
                            .is_some_and(|pass| scores(pass.get("scores")).is_some())
                    })
            }
            _ => false,
        }
    };

    // Prerequisites, not "has this run": a sequence can be runnable and already complete,
    // which is what makes re-running one sequence possible. Noise Scaler only needs scenes:
    // it leaves scenes with no measurement where they are, so a partial Noise Detector run
    // must not hide the scenes it can still scale.
    let runnable = |id: &str| -> bool {
        match id {
            "SceneDetector" => true,
            "NoiseDetector" | "NoiseScaler" | "SpeedScaler" | "TargetQuality" => scene_count > 0,
            "ParallelEncoder" => scene_count > 0,
            "BitrateOptimizer" => scene_count > 0 && has_target_quality_pass(scenes),
            // The engine now requires every requested scene to be present; offering a
            // partial concatenation would only fail after the user pressed Run. The detail
            // line still reports how many chunks are missing.
            "SceneConcatenator" => all_chunks,
            "QualityCheck" => evidence.output_exists,
            _ => false,
        }
    };

    let scaled = scenes
        .iter()
        .filter(|scene| {
            scene
                .pointer("/sequence_data/noise_scaling")
                .is_some_and(|value| !value.is_null())
        })
        .count();

    let mut sequences = Vec::with_capacity(chain.len());
    for (id, name) in chain {
        let is_active = evidence.active.is_some_and(|(active, _)| active == *id);
        let status = if is_active {
            SequenceRunStatus::Active
        } else if evidence.failed == Some(*id) {
            // The latest run's failure names the boundary that stopped it. Derived files can
            // still look complete — a concatenator may have written a partial output — so
            // history has to win over the file-shaped evidence for that row.
            SequenceRunStatus::Failed
        } else if complete(id) {
            SequenceRunStatus::Complete
        } else if *id == "SceneDetector" && detection_incomplete {
            SequenceRunStatus::Incomplete
        } else {
            SequenceRunStatus::NeverRun
        };
        let progress = evidence
            .active
            .filter(|(active, _)| *active == *id)
            .and_then(|(_, progress)| progress)
            .or_else(|| {
                (*id == "SceneDetector")
                    .then_some(detection_percent)
                    .flatten()
            });
        sequences.push(SequenceState {
            id: (*id).to_owned(),
            name: (*name).to_owned(),
            status,
            runnable: runnable(id),
            progress,
            detail: detail_for(
                id,
                scene_count,
                encoded,
                scaled,
                evidence.output_exists,
                detection_incomplete.then_some(last_scene_end).flatten(),
                evidence.scene_source_frames,
            ),
        });
    }

    let next = sequences
        .iter()
        .filter(|sequence| {
            sequence.runnable
                && sequence.status != SequenceRunStatus::Complete
                && !is_action_sequence(&sequence.id)
        })
        .map(|sequence| sequence.id.clone())
        .collect();

    VideoState {
        video_id: video_id.to_owned(),
        scene_count: scene_count as u32,
        sequences,
        next,
        active: evidence.active.is_some(),
        run_id: evidence.run_id.map(str::to_owned),
        // The route attaches the latest failed run from the timeline; a phase derivation
        // must not depend on history.
        failure: None,
        output_exists: evidence.output_exists,
        retained_bytes: evidence.retained_bytes,
        // The route fills this from the resolved configuration and the saved scenes; it is
        // not evidence of pipeline state, so the pure derivation leaves it empty.
        script_data: Vec::new(),
    }
}

/// The display name for one sequence id.
///
/// The run log prints the name the sequence strip prints, not the route identifier: a line
/// that says `SceneDetector` reads like a code path rather than the stage the user pressed.
pub(crate) fn sequence_name(id: &str) -> &str {
    match id {
        "SceneDetector" => "Scene Detector",
        "NoiseDetector" => "Noise Detector",
        "NoiseScaler" => "Noise Scaler",
        "TargetQuality" => "Target Quality",
        "SpeedScaler" => "Speed Scaler",
        "BitrateOptimizer" => "Bitrate Optimizer",
        "ParallelEncoder" => "Parallel Encoder",
        "SerialEncoder" => "Serial Encoder",
        "SceneConcatenator" => "Scene Concatenator",
        "QualityCheck" => "Quality Check",
        "Benchmarker" => "Benchmarker",
        other => other,
    }
}

fn all_scenes_have(scenes: &[Value], path: &[&str]) -> bool {
    !scenes.is_empty()
        && scenes.iter().all(|scene| {
            path.iter()
                .fold(scene.pointer("/sequence_data"), |current, key| {
                    current?.get(*key)
                })
                .is_some_and(|value| !value.is_null())
        })
}

fn scores(value: Option<&Value>) -> Option<usize> {
    let scores = value?.as_array()?;
    (!scores.is_empty()).then_some(scores.len())
}

/// Build the scene table the rail and timeline render.
///
/// Scene order is the engine's list order, which is also the concatenation order. A chunk
/// is matched by the engine's `NNNNN.` scene id rather than by extension, and the last
/// Target Quality pass is the one that decided the quantizer the encoder receives.
#[cfg(test)]
mod tests;
