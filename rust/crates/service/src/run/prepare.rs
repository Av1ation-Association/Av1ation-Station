use std::sync::Arc;

use av1ation_contracts::run::SequenceRunStatus;
use av1ation_contracts::video::VideoState;
use av1ation_engine::{EncodeRequest, script::plugins as script_plugins};
use serde_json::Value;

use crate::{
    platform::disk,
    project::{
        config,
        derive::{self, Evidence},
        projects::{StoreError, default_config},
    },
    state::AppState,
};

/// Why a validated run plan could not be produced.
///
/// The router owns the HTTP mapping. Keeping the reasons distinct here means a route cannot
/// accidentally turn a locked sequence into a generic configuration error, and the start
/// path can be exercised without a response type.
#[derive(Debug)]
pub(crate) enum PrepareError {
    /// This host does not persist projects, so there is no video to run.
    StorageUnavailable,
    /// The project id no longer names a stored project.
    ProjectNotFound(String),
    /// The video id no longer names a stored video.
    VideoNotFound(String),
    /// Reading or validating the stored documents failed.
    Store(StoreError),
    /// The configuration is understood but cannot be run as requested.
    InvalidConfig { message: String, hint: String },
    /// A live run already owns the requested sequence.
    Locked { message: String },
    /// The output or scratch volume cannot hold the run.
    DiskFull { message: String },
    /// A backend check failed rather than rejecting the configuration.
    Engine { message: String, hint: String },
}

/// Resolve and validate everything one run needs before it reserves the singleton.
///
/// The returned request is fully materialised: it owns the effective configuration, the
/// selected sequence list, the custom scene data, and the checkpoint sink. No project state
/// is read after this function returns.
pub(crate) async fn prepare(
    state: &AppState,
    project_id: String,
    video_id: String,
    only: Option<String>,
) -> Result<EncodeRequest, PrepareError> {
    let Some(videos) = state.videos() else {
        return Err(PrepareError::StorageUnavailable);
    };
    let Some(projects) = state.projects() else {
        return Err(PrepareError::ProjectNotFound(project_id));
    };
    // A run reserves the one singleton and locks configuration writes, so it must address a
    // project that exists. Without this check a stale id started a run that never finished
    // and blocked every encode, config write, and project delete until a restart.
    let project_document = match projects.document(&project_id).await {
        Ok(Some(document)) => document,
        Ok(None) => return Err(PrepareError::ProjectNotFound(project_id)),
        Err(error) => return Err(PrepareError::Store(error)),
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return Err(PrepareError::VideoNotFound(video_id)),
        Err(error) => return Err(PrepareError::Store(error)),
    };

    let input_path = record.input_path();
    let source = std::path::Path::new(&input_path);
    if !std::fs::metadata(source).is_ok_and(|metadata| metadata.is_file()) {
        return Err(PrepareError::InvalidConfig {
            message: format!("The source file {} is no longer there.", source.display()),
            hint: "Restore the file, or remove the video from the queue.".to_owned(),
        });
    }

    let defaults = default_config();
    let mut document = config::materialise(&defaults, &project_document, &record.overrides);
    // The model is one file for the machine, so it is applied to the run's document rather
    // than copied into every project. The engine still owns its own fallback search.
    if let Some(model) = state.settings().await.scene_model {
        config::pin_scene_model(&mut document, &model);
    }
    // A sequence input states how to decode, not which file: the video owns the file. Filling
    // it here keeps a project-level detection or encoder input working per video.
    config::inherit_sequence_inputs(&mut document, &input_path);
    // The engine writes scene chunks straight into this directory, so it is the video's
    // temporary directory itself rather than a nested one.
    let scenes_directory = videos.chunk_directory(&video_id, record.temp_directory.as_deref());
    let output_path = record.output_path();
    let space = disk::check(
        &state.disk,
        &scenes_directory,
        std::path::Path::new(&output_path),
    );
    if let Some(message) = space.blocker(&scenes_directory, std::path::Path::new(&output_path)) {
        return Err(PrepareError::DiskFull { message });
    }
    let scenes_directory = scenes_directory.display().to_string();
    if let Some(sequences) = document.get_mut("sequences").and_then(Value::as_object_mut) {
        for section in ["parallel_encoder", "scene_concatenator"] {
            if let Some(object) = sequences.get_mut(section).and_then(Value::as_object_mut) {
                object.insert(
                    "scenes_directory".to_owned(),
                    Value::String(scenes_directory.clone()),
                );
            }
        }
        if let Some(object) = sequences
            .get_mut("scene_concatenator")
            .and_then(Value::as_object_mut)
        {
            object.insert("output".to_owned(), Value::String(output_path.clone()));
        }
    }

    // The chain is a property of the video, not only the project: a video override can
    // enable an optional sequence. Resolve it here so `/state` and the start path agree.
    let chain = derive::chain_for(&document);
    let chunks = videos
        .chunk_files(&video_id, record.temp_directory.as_deref())
        .await;
    // The latest Scene Detector attempt recorded the source length. That is the only
    // evidence that distinguishes a finished scene list from a resumable prefix, and the
    // start path must make the same distinction as `/state` or the full pipeline skips a
    // detection the user cancelled halfway.
    let timeline = match state.timeline() {
        Some(timeline) => timeline.summary(&project_id, &video_id).await,
        None => Default::default(),
    };
    let evidence = Evidence {
        condor: record.condor.as_ref(),
        chunks: &chunks,
        output_exists: derive::output_is_written(&output_path),
        retained_bytes: 0,
        active: None,
        run_id: None,
        failed: None,
        scene_source_frames: timeline.scene_detector_frames,
    };
    let derived = derive::derive(&video_id, &chain, &evidence);
    let single_sequence = only.is_some();
    let sequences = with_actions(
        sequence_plan(&derived, only.as_deref())?,
        &document,
        single_sequence,
    );

    let Some(mut encoder) = document.get("encoder").cloned() else {
        return Err(PrepareError::InvalidConfig {
            message: "The project has no encoder configuration.".to_owned(),
            hint: "Reset the encoder section, then try again.".to_owned(),
        });
    };
    let Some(sequence_config) = document.get("sequences").cloned() else {
        return Err(PrepareError::InvalidConfig {
            message: "The project has no sequence configuration.".to_owned(),
            hint: "Reset the sequence section, then try again.".to_owned(),
        });
    };

    // An encoder provider resolves to an absolute executable; the engine's document owns
    // that path. A custom executable already in the document (a fork) is left alone, and the
    // system choice leaves the field empty so the engine resolves the program on PATH.
    if let Some(name) = encoder
        .as_object()
        .and_then(|object| object.keys().next())
        .cloned()
        && let Some(executable) = state.encoder_executable(&name).await
        && let Some(config) = encoder
            .as_object_mut()
            .and_then(|object| object.values_mut().next())
        && config.get("executable").is_none_or(Value::is_null)
    {
        config["executable"] = Value::String(executable.to_string_lossy().into_owned());
    }

    // Read the scripts this run will actually open before reserving the singleton. A missing
    // plugin is a configuration error, not a run failure: the message can name the plugin and
    // the sequence, and no lock or timeline record has to be created for a run that cannot
    // start. Reading files and loading VapourSynth do not belong on the async executor.
    let validation = {
        let input = record.input.clone();
        let config = sequence_config.clone();
        let requested = sequences.clone();
        tokio::task::spawn_blocking(move || {
            script_plugins::validate_run_scripts(&input, &config, &requested)
        })
        .await
    };
    match validation {
        Ok(Ok(())) => {}
        Ok(Err(message)) => {
            return Err(PrepareError::InvalidConfig {
                message,
                hint: "Install the missing VapourSynth plugin, or remove the filter that uses it, then start the run again."
                    .to_owned(),
            });
        }
        Err(error) => {
            tracing::error!(%error, "the VapourSynth script check did not finish");
            return Err(PrepareError::Engine {
                message: "The VapourSynth scripts could not be checked before the run started."
                    .to_owned(),
                hint: "Try again, or check the service log for the script check failure."
                    .to_owned(),
            });
        }
    }

    let sink = videos.clone();
    let (sink_project, sink_video) = (project_id.clone(), video_id.clone());
    Ok(EncodeRequest {
        run_id: uuid::Uuid::new_v4().to_string(),
        project_id,
        video_id,
        input: record.input.clone(),
        video_path: input_path.clone(),
        output: record.output.clone(),
        encoder,
        sequence_config,
        // The runner reads the pairs off the blob before the engine loads it; the engine
        // itself ignores this key and drops it on the next checkpoint.
        condor: av1ation_engine::script::data::attach_custom_scene_data(
            record.condor.as_ref(),
            &record.custom_scene_data,
        ),
        sequences,
        checkpoint: Arc::new(move |value| {
            sink.write_condor_blocking(&sink_project, &sink_video, &value)
        }),
    })
}

/// Choose the sequences this request may run.
///
/// A manual start names exactly one sequence. A full start begins at the first non-action
/// sequence that is not complete; action sequences have no completion field and cannot
/// choose the starting point.
fn sequence_plan(derived: &VideoState, only: Option<&str>) -> Result<Vec<String>, PrepareError> {
    match only {
        Some(requested) => {
            let Some(sequence) = derived
                .sequences
                .iter()
                .find(|sequence| sequence.id == requested)
            else {
                let offered = derived
                    .sequences
                    .iter()
                    .map(|sequence| sequence.id.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                return Err(PrepareError::InvalidConfig {
                    message: format!("This video has no sequence called {requested}."),
                    hint: format!("Run one of: {offered}."),
                });
            };
            if sequence.status == SequenceRunStatus::Active {
                return Err(PrepareError::Locked {
                    message: "That sequence is already running.".to_owned(),
                });
            }
            if !sequence.runnable {
                return Err(PrepareError::InvalidConfig {
                    message: format!(
                        "{} cannot run until the sequences before it are complete.",
                        sequence.name
                    ),
                    hint: "Run the earlier sequences first, or use encode for the full chain."
                        .to_owned(),
                });
            }
            Ok(vec![requested.to_owned()])
        }
        None => {
            let Some(first_incomplete) = derived.sequences.iter().position(|sequence| {
                !derive::is_action_sequence(&sequence.id)
                    && sequence.status != SequenceRunStatus::Complete
            }) else {
                return Err(PrepareError::InvalidConfig {
                    message: "This video has already been encoded.".to_owned(),
                    hint: "Change the configuration, or remove the output file to encode it again."
                        .to_owned(),
                });
            };
            Ok(derived.sequences[first_incomplete..]
                .iter()
                .map(|sequence| sequence.id.clone())
                .collect())
        }
    }
}

/// Add the implicit sequences a chain needs in front of Parallel Encoder.
///
/// Auto workers are resolved by the Benchmarker before delivery, and the two action
/// sequences rewrite per-scene encoder values after target quality. None has a stored
/// data field, so none is offered as a standalone state; they run in front of the encoder
/// instead. The Benchmarker stays even for a manual Parallel Encoder start: that sequence
/// cannot run without a worker count, and `auto` is resolved here. The two rewrite actions
/// do not: a manual start must not change speeds and quantizers the user did not ask to
/// touch.
fn with_actions(
    mut sequences: Vec<String>,
    document: &Value,
    single_sequence: bool,
) -> Vec<String> {
    if !single_sequence {
        sequences.retain(|id| !derive::is_action_sequence(id));
    }
    if let Some(parallel) = document
        .pointer("/sequences/parallel_encoder")
        .and_then(Value::as_object)
        && parallel.get("workers").is_none_or(Value::is_null)
        && let Some(position) = sequences.iter().position(|id| id == "ParallelEncoder")
    {
        sequences.insert(position, "Benchmarker".to_owned());
    }
    if let Some(position) = sequences.iter().position(|id| id == "ParallelEncoder") {
        for (offset, action) in chain_actions(document, single_sequence)
            .into_iter()
            .enumerate()
        {
            sequences.insert(position + offset, action.to_owned());
        }
    }
    sequences
}

/// The action sequences a chain runs in front of the encoder.
///
/// Speed Scaler and Bitrate Optimizer rewrite the per-scene values Target Quality wrote, so
/// they belong to a chain that produced those values. A manual start names one sequence and
/// must run only that sequence: silently appending two more changes encoder speeds and
/// quantizers the user did not ask to touch, and the status page shows sequences starting
/// that were never requested.
fn chain_actions(document: &Value, single_sequence: bool) -> Vec<&'static str> {
    if single_sequence {
        return Vec::new();
    }
    let speed_points = document
        .pointer("/sequences/speed_scaler/speed_quantizers")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let bitrate_enabled = document
        .pointer("/sequences/bitrate_optimizer/bitrate_sigma_threshold")
        .is_some_and(|value| !value.is_null());
    let mut actions = Vec::new();
    if speed_points >= 2 {
        actions.push("SpeedScaler");
    }
    if bitrate_enabled {
        actions.push("BitrateOptimizer");
    }
    actions
}

#[cfg(test)]
mod tests {
    use super::*;
    use av1ation_contracts::run::SequenceState;
    use serde_json::json;

    fn derived(sequences: &[(&str, SequenceRunStatus, bool)]) -> VideoState {
        VideoState {
            video_id: "video".to_owned(),
            scene_count: 0,
            sequences: sequences
                .iter()
                .map(|(id, status, runnable)| SequenceState {
                    id: (*id).to_owned(),
                    name: (*id).to_owned(),
                    status: *status,
                    runnable: *runnable,
                    progress: None,
                    detail: None,
                })
                .collect(),
            next: Vec::new(),
            active: false,
            run_id: None,
            failure: None,
            output_exists: false,
            retained_bytes: 0,
            script_data: Vec::new(),
        }
    }

    #[test]
    fn a_manual_sequence_refuses_unknown_active_and_unready_requests() {
        let state = derived(&[
            ("SceneDetector", SequenceRunStatus::Complete, true),
            ("NoiseDetector", SequenceRunStatus::Active, true),
            ("Encoder", SequenceRunStatus::NeverRun, false),
        ]);

        assert!(matches!(
            sequence_plan(&state, Some("Missing")),
            Err(PrepareError::InvalidConfig { message, hint })
                if message == "This video has no sequence called Missing."
                    && hint == "Run one of: SceneDetector, NoiseDetector, Encoder."
        ));
        assert!(matches!(
            sequence_plan(&state, Some("NoiseDetector")),
            Err(PrepareError::Locked { message }) if message == "That sequence is already running."
        ));
        assert!(matches!(
            sequence_plan(&state, Some("Encoder")),
            Err(PrepareError::InvalidConfig { message, .. })
                if message == "Encoder cannot run until the sequences before it are complete."
        ));
    }

    #[test]
    fn a_full_chain_starts_at_the_first_incomplete_step() {
        let state = derived(&[
            ("SceneDetector", SequenceRunStatus::Complete, true),
            ("NoiseDetector", SequenceRunStatus::Incomplete, true),
            ("ParallelEncoder", SequenceRunStatus::NeverRun, true),
            ("SceneConcatenator", SequenceRunStatus::NeverRun, false),
        ]);
        assert_eq!(
            sequence_plan(&state, None).expect("the chain has unfinished work"),
            vec!["NoiseDetector", "ParallelEncoder", "SceneConcatenator"]
        );
    }

    #[test]
    fn a_manual_start_runs_only_the_named_sequence() {
        let configured = json!({
            "sequences": {
                "speed_scaler": {
                    "speed_quantizers": [
                        { "speed": 6, "quantizer": 24 },
                        { "speed": 8, "quantizer": 32 }
                    ]
                },
                "bitrate_optimizer": { "bitrate_sigma_threshold": 2.0 }
            }
        });
        assert_eq!(
            chain_actions(&configured, false),
            vec!["SpeedScaler", "BitrateOptimizer"]
        );
        assert!(chain_actions(&configured, true).is_empty());
        // Neither action has work when its configuration is absent.
        assert!(chain_actions(&json!({ "sequences": {} }), false).is_empty());
    }

    #[test]
    fn a_full_chain_adds_the_benchmarker_and_actions_before_the_encoder() {
        let configured = json!({
            "sequences": {
                "parallel_encoder": { "workers": null },
                "speed_scaler": {
                    "speed_quantizers": [
                        { "speed": 6, "quantizer": 24 },
                        { "speed": 8, "quantizer": 32 }
                    ]
                },
                "bitrate_optimizer": { "bitrate_sigma_threshold": 2.0 }
            }
        });
        assert_eq!(
            with_actions(vec!["ParallelEncoder".to_owned()], &configured, false),
            vec![
                "Benchmarker",
                "SpeedScaler",
                "BitrateOptimizer",
                "ParallelEncoder"
            ]
        );
        assert_eq!(
            with_actions(vec!["ParallelEncoder".to_owned()], &configured, true),
            vec!["Benchmarker", "ParallelEncoder"]
        );
    }
}
