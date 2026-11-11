use super::*;
use crate::api::json::ApiJson;
use crate::project::{config, derive::output_is_written};

/// The derived pipeline state. Nothing is persisted: the answer is recomputed from the
/// engine's own data, the files on disk, and the live run.
pub(crate) async fn video_state(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let Some(projects) = state.projects() else {
        return project_not_found(&project_id);
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    let project_document = match projects.document(&project_id).await {
        Ok(Some(document)) => document,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };
    // The chain is a property of the video, not only the project: an optional sequence can
    // be enabled by a video override. Resolve those before deciding which steps exist.
    let document = config::materialise(&default_config(), &project_document, &record.overrides);

    let chain = derive::chain_for(&document);
    let chunks = videos
        .chunk_files(&video_id, record.temp_directory.as_deref())
        .await;
    let output_exists = output_is_written(&record.output_path());
    let retained_bytes = videos
        .retained_bytes(&video_id, record.temp_directory.as_deref())
        .await;

    let active_video = state.runs().active_video().await;
    let stage = state.runs().stage();
    let is_active = active_video == Some((project_id.clone(), video_id.clone()));
    let active_sequence = stage
        .as_ref()
        .filter(|_| is_active)
        .and_then(|stage| stage.sequence.clone());
    let active_progress = stage.as_ref().and_then(|stage| stage.progress);
    let timeline = match state.timeline() {
        Some(timeline) => timeline.summary(&project_id, &video_id).await,
        None => Default::default(),
    };

    let evidence = Evidence {
        condor: record.condor.as_ref(),
        chunks: &chunks,
        output_exists,
        retained_bytes,
        active: active_sequence
            .as_deref()
            .map(|sequence| (sequence, active_progress)),
        run_id: stage.as_ref().map(|stage| stage.run_id.as_str()),
        failed: timeline.failed_sequence.as_deref(),
        scene_source_frames: timeline.scene_detector_frames,
    };
    let mut derived = derive::derive(&video_id, &chain, &evidence);

    // A run that failed before its first sequence still has a reason, and it is history
    // rather than a phase: attach it to the state so the queue and the page can show it.
    // A live run hides the previous failure; its own outcome will replace it.
    if !derived.active {
        let failure_sequence = timeline.failure_sequence;
        derived.failure = timeline.failure.map(|entry| VideoFailure {
            message: entry
                .message
                .unwrap_or_else(|| "The run failed without a message.".to_owned()),
            at: entry.ended_at,
            run_id: entry.run_id,
            sequence: failure_sequence,
        });
    }

    // The documentation view of the reserved script variables is derived from the same
    // configuration the next run will use and the same saved scenes the runner will start
    // from. The main input is opened again before every sequence, so it is documented for
    // the sequence that is about to open it; a per-sequence override belongs to one
    // sequence for its whole life.
    let sequence_for_main = active_sequence
        .clone()
        .or_else(|| derived.next.first().cloned());
    let run_id = stage
        .as_ref()
        .filter(|_| is_active)
        .map(|stage| stage.run_id.as_str())
        .unwrap_or_default();
    let temp_dir = videos
        .chunk_directory(&video_id, record.temp_directory.as_deref())
        .display()
        .to_string();
    let mut inputs = vec![ScriptInput {
        path: "input".to_owned(),
        sequence: sequence_for_main.as_deref(),
        input: &record.input,
    }];
    for (section, field, sequence) in [
        ("scene_detector", "input", "SceneDetector"),
        ("noise_detector", "input", "NoiseDetector"),
        ("target_quality", "input", "TargetQuality"),
        ("target_quality", "metric_input", "TargetQuality"),
        ("parallel_encoder", "input", "ParallelEncoder"),
        ("quality_check", "input", "QualityCheck"),
    ] {
        let path = format!("sequences.{section}.{field}");
        if let Some(input) = document
            .pointer(&format!("/sequences/{section}/{field}"))
            .filter(|input| !input.is_null())
        {
            inputs.push(ScriptInput {
                path,
                sequence: Some(sequence),
                input,
            });
        }
    }
    let condor = av1ation_engine::script::data::attach_custom_scene_data(
        record.condor.as_ref(),
        &record.custom_scene_data,
    );
    derived.script_data = script_data::describe(
        &inputs,
        document.get("sequences").unwrap_or(&Value::Null),
        condor.as_ref(),
        &temp_dir,
        run_id,
        &record.input_path(),
    );
    Json(derived).into_response()
}

/// The scene table the rail and timeline render.
///
/// Derived on every read from the engine checkpoint and one directory walk, so a scene
/// that was detected, re-encoded, or removed by hand is reflected without a cache to
/// invalidate. The engine's list order is the concatenation order.
pub(crate) async fn get_video_scenes(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    let inherited = match inherited_encoder(&state, &project_id, &record.overrides).await {
        Ok(encoder) => encoder,
        Err(response) => return response,
    };
    let chunks = videos
        .chunk_sizes(&video_id, record.temp_directory.as_deref())
        .await;
    let mut list = derive::scenes(
        &video_id,
        record.condor.as_ref(),
        &record.custom_scene_data,
        &chunks,
        inherited.as_ref(),
    );
    // Noise Detector's own checkpoint lands at the end of its sequence, so the values it has
    // already measured live are not in the blob this table is derived from. A page opened
    // mid-run still has to show them.
    derive::with_live_noise(&mut list, &state.runs().live_noise(&project_id, &video_id));
    Json(list).into_response()
}

/// One scene's complete encoder document.
///
/// The Scenes table carries only a label and a provenance flag, because a 5,000-scene video
/// would otherwise ship thousands of encoder documents to draw a panel. The editor fetches
/// exactly the scene it is about to change.
pub(crate) async fn get_scene_encoder(
    State(state): State<AppState>,
    AxumPath((project_id, video_id, index)): AxumPath<(String, String, u32)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    let scene = record
        .condor
        .as_ref()
        .and_then(|condor| condor.get("scenes"))
        .and_then(Value::as_array)
        .and_then(|scenes| scenes.get(index as usize));
    let Some(scene) = scene else {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("Scene {} does not exist in this video.", index + 1),
            Some("Reload the scene table; a run may have rewritten it.".to_owned()),
        );
    };
    let Some(encoder) = scene.get("encoder").filter(|encoder| !encoder.is_null()) else {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!("Scene {} has no encoder document.", index + 1),
            Some("Run scene detection again to write a complete scene table.".to_owned()),
        );
    };
    Json(SceneEncoderDetail {
        encoder: encoder.clone(),
    })
    .into_response()
}

/// Write one encoder document into the selected scenes.
///
/// This is the per-scene half of the scope choice: the video-level half is the existing
/// overrides route. The selection is validated in full before any scene is written, so a
/// stale index rejects the request rather than applying it to the scenes before the bad one.
pub(crate) async fn put_scene_encoders(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<SceneEncoderRequest>,
) -> Response {
    if state
        .runs()
        .config_locked_for_video(&project_id, &video_id)
        .await
    {
        return locked();
    }
    if body.scenes.is_empty() {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "Choose at least one scene.".to_owned(),
            Some("Select a scene in the rail or timeline first.".to_owned()),
        );
    }
    if let Err(message) = catalogue::validate_encoder(&body.encoder) {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some(
                "Choose an encoder from the catalogue instead of editing the document.".to_owned(),
            ),
        );
    }

    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let mut scenes = body.scenes.clone();
    scenes.sort_unstable();
    scenes.dedup();
    let record = match videos
        .set_scene_encoders(&project_id, &video_id, &scenes, body.encoder)
        .await
    {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    let inherited = match inherited_encoder(&state, &project_id, &record.overrides).await {
        Ok(encoder) => encoder,
        Err(response) => return response,
    };
    let chunks = videos
        .chunk_sizes(&video_id, record.temp_directory.as_deref())
        .await;
    let mut list = derive::scenes(
        &video_id,
        record.condor.as_ref(),
        &record.custom_scene_data,
        &chunks,
        inherited.as_ref(),
    );
    // Noise Detector's own checkpoint lands at the end of its sequence, so the values it has
    // already measured live are not in the blob this table is derived from. A page opened
    // mid-run still has to show them.
    derive::with_live_noise(&mut list, &state.runs().live_noise(&project_id, &video_id));
    Json(list).into_response()
}

/// The encoder every scene inherits, resolved from the project and the video's overrides.
///
/// The resolver is the same one the Configuration screen reads, so a scene's provenance is
/// compared against the document the next run will actually hand the engine.
async fn inherited_encoder(
    state: &AppState,
    project_id: &str,
    overrides: &BTreeMap<String, Value>,
) -> Result<Option<Value>, Response> {
    let Some(projects) = state.projects() else {
        return Err(no_storage());
    };
    let document = match projects.document(project_id).await {
        Ok(Some(document)) => document,
        Ok(None) => return Err(project_not_found(project_id)),
        Err(error) => return Err(project_error(error)),
    };
    let resolved = config::materialise(&default_config(), &document, overrides);
    Ok(resolved.get("encoder").cloned())
}

/// The per-video preflight: whether this video can start an encode right now.
///
/// A missing optional dependency removes only the capability it provides, so this is a
/// projection of the global inventory onto this video's input and encoder rather than a
/// process-wide switch. It also scans the video's script inputs for plugin namespaces the
/// loaded core lacks, so the Video page can warn before Start instead of only failing the run.
pub(crate) async fn validate_video(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let Some(projects) = state.projects() else {
        return project_not_found(&project_id);
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    let project_document = match projects.document(&project_id).await {
        Ok(Some(document)) => document,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };

    let source_exists =
        std::fs::metadata(record.input_path()).is_ok_and(|metadata| metadata.is_file());
    let output_path = record.output_path();
    let output_writable = match std::path::Path::new(&output_path).parent() {
        Some(parent) if parent.is_dir() => directory_is_writable(parent).await,
        _ => false,
    };
    let scratch = videos.chunk_directory(&video_id, record.temp_directory.as_deref());
    let scratch_writable =
        tokio::fs::create_dir_all(&scratch).await.is_ok() && directory_is_writable(&scratch).await;
    let space = disk::check(&state.disk, &scratch, std::path::Path::new(&output_path));

    let mut document = config::materialise(&default_config(), &project_document, &record.overrides);
    config::inherit_sequence_inputs(&mut document, &record.input_path());
    let encoder_id = document.get("encoder").and_then(catalogue::base_id);
    let needs_vapoursynth = record.input.get("VapourSynth").is_some()
        || record.input.get("VapourSynthScript").is_some();
    let quality_metric = document
        .pointer("/sequences/target_quality/metric")
        .and_then(metric_name);

    // The scripts this video's full pipeline would open decide which plugin namespaces the
    // preflight can name. The scan reads files and loads VapourSynth, so it runs on the
    // blocking pool; a single-sequence request is deliberately not this strict.
    let scan_config = document.get("sequences").cloned().unwrap_or(Value::Null);
    let scan_sequences: Vec<String> = derive::chain_for(&document)
        .into_iter()
        .map(|(id, _)| id.to_owned())
        .collect();
    let scan =
        crate::script::scripts::scan(&state, record.input.clone(), scan_config, scan_sequences)
            .await;
    let plugin_problems = scan.report.problems;
    let plugin_error = scan.report.error;
    let plugin_blocker = scan.blocker;

    let report = state.preflight().await;
    let checks: Vec<_> = report
        .checks
        .into_iter()
        .filter(|check| {
            matches!(check.capability.as_str(), "decode" | "encode" | "muxing")
                || (quality_metric.is_some() && check.capability == "metric")
        })
        .collect();
    let mut blockers = Vec::new();
    if !source_exists {
        blockers.push(format!(
            "The source file {} is missing.",
            record.input_path()
        ));
    }
    if !output_writable {
        blockers.push(format!(
            "The output directory for {output_path} is not writable."
        ));
    }
    if !scratch_writable {
        blockers.push(format!(
            "The scratch directory {} is not writable.",
            scratch.display()
        ));
    }
    if let Some(message) = space.blocker(&scratch, std::path::Path::new(&output_path)) {
        blockers.push(message);
    }
    if let Some(message) = plugin_error {
        blockers.push(message);
    }
    if let Some(message) = plugin_blocker {
        blockers.push(message);
    }
    if needs_vapoursynth
        && !checks
            .iter()
            .any(|check| check.id == "vapoursynth" && check.available)
    {
        blockers
            .push("This input is a VapourSynth script, but VapourSynth did not load.".to_owned());
    }
    if let Some(id) = encoder_id.as_deref() {
        let row = format!("encoder:{id}");
        if checks
            .iter()
            .any(|check| check.id == row && !check.available)
        {
            blockers.push(format!("The {id} encoder executable was not found."));
        }
    }
    if !checks
        .iter()
        .any(|check| check.capability == "muxing" && check.available)
    {
        blockers.push(
            "Neither FFmpeg nor MKVToolNix was found, so the chunks cannot be concatenated."
                .to_owned(),
        );
    }
    if let Some(metric) = &quality_metric
        && let Some(row) = checks
            .iter()
            .find(|check| check.id == format!("metric:{metric}"))
        && !row.available
    {
        blockers.push(format!(
            "The selected quality metric {metric} has no usable backend: {}",
            row.detail
        ));
    }

    Json(VideoValidation {
        video_id,
        can_encode: blockers.is_empty(),
        source_exists,
        output_writable,
        scratch_writable,
        temp_free_bytes: space.temp_free,
        output_free_bytes: space.output_free,
        warnings: space.warnings,
        checks,
        plugin_problems,
        blockers,
    })
    .into_response()
}

/// The lower-case metric name from the engine's externally tagged `QualityMetric` value.
///
/// The engine serialises a metric as `{"SSIMULACRA2": {..}}`, so the first key is the id;
/// accepting a bare string as well keeps this total for a future untagged spelling.
fn metric_name(value: &Value) -> Option<String> {
    if let Some(name) = value.as_str() {
        return Some(name.to_ascii_lowercase());
    }
    value
        .as_object()?
        .keys()
        .next()
        .map(|name| name.to_ascii_lowercase())
}

/// Whether a directory accepts a new file. The probe file is removed immediately; this is
/// the only honest test on Windows, where a read-only bit does not describe an ACL.
pub(crate) async fn directory_is_writable(directory: &std::path::Path) -> bool {
    let probe = directory.join(format!(".av1ation-probe-{}", uuid::Uuid::new_v4()));
    match tokio::fs::write(&probe, b"probe").await {
        Ok(()) => {
            let _ = tokio::fs::remove_file(&probe).await;
            true
        }
        Err(_) => false,
    }
}
