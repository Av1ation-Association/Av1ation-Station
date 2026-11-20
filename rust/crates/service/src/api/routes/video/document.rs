use super::*;
use crate::api::json::ApiJson;
use crate::project::config;
use crate::project::videos::invalidation::{impact_for, scene_indices};
use av1ation_contracts::settings::VideoOverridesUpdate;
use av1ation_engine::run::reset;

pub(crate) async fn get_video(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.get(&project_id, &video_id).await {
        Ok(Some(detail)) => Json(detail).into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// The two engine documents a video's General section edits.
///
/// They are served separately from the configuration because they are not configuration:
/// the source and the exact output file belong to one queue entry, not to a project.
pub(crate) async fn get_video_general(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => Json(VideoGeneral {
            input: record.input.clone(),
            output: record.output.clone(),
            source_path: record.input_path(),
        })
        .into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// Replace both documents after validating the paths and the engine shapes.
///
/// Configuration is read-only for the duration of a run, and so is this: changing the source
/// or the output of the video an encoder is reading would invalidate the run in progress.
pub(crate) async fn put_video_general(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<VideoGeneralRequest>,
) -> Response {
    if state
        .runs()
        .config_locked_for_video(&project_id, &video_id)
        .await
    {
        return locked();
    }
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
    if let Err(message) = av1ation_engine::media::video::parse_input(&body.input) {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some("Reload the input and edit an existing field.".to_owned()),
        );
    }
    if let Err(message) = av1ation_engine::media::video::parse_output(&body.output) {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some("The output document is not one the engine can write.".to_owned()),
        );
    }
    let output_path = body
        .output
        .get("path")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let source_path = body
        .source_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(str::to_owned)
        .or_else(|| input_path_of(&body.input))
        .unwrap_or_else(|| record.input_path());
    if let Some(response) = validate_paths(&source_path, &output_path) {
        return response;
    }
    // The finished file follows its video. Changing the destination after a successful run
    // moves the file instead of orphaning it, but never overwrites one already there: that
    // file belongs to an earlier attempt the user may still want.
    let previous_output = record.output_path();
    if !previous_output.is_empty() && previous_output != output_path {
        let previous = std::path::Path::new(&previous_output);
        let next = std::path::Path::new(&output_path);
        if previous.is_file() {
            if next.exists() {
                return error_response(
                    StatusCode::CONFLICT,
                    ErrorCode::InvalidConfig,
                    format!("{} already exists.", next.display()),
                    Some("Choose a new output file, or delete the one already there.".to_owned()),
                );
            }
            if let Err(error) = tokio::fs::rename(previous, next).await {
                return error_response(
                    StatusCode::CONFLICT,
                    ErrorCode::InvalidConfig,
                    format!(
                        "The finished output could not be moved from {} to {}: {error}",
                        previous.display(),
                        next.display()
                    ),
                    Some(
                        "Move the file yourself, or choose a destination on the same volume."
                            .to_owned(),
                    ),
                );
            }
        }
    }
    let encoder_input =
        config::materialise(&default_config(), &project_document, &record.overrides)
            .pointer("/sequences/parallel_encoder/input")
            .cloned();
    let input_changed = record.input != body.input;
    let source_path_changed = record.input_path() != source_path;
    let invalidated = if body.clear_chunks.unwrap_or(false) {
        match general_read(encoder_input.as_ref()) {
            GeneralRead::Document if input_changed || source_path_changed => {
                scene_indices(record.condor.as_ref())
            }
            GeneralRead::Source if source_path_changed => scene_indices(record.condor.as_ref()),
            _ => Vec::new(),
        }
    } else {
        Vec::new()
    };
    let next = if invalidated.is_empty() {
        None
    } else {
        match record
            .condor
            .as_ref()
            .map(|condor| reset::reset_scene_outputs(condor, &invalidated))
        {
            Some(Ok(cleared)) => Some(cleared),
            Some(Err(message)) => {
                return error_response(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    ErrorCode::InvalidConfig,
                    message,
                    Some("Reload the scene table; a run may have rewritten it.".to_owned()),
                );
            }
            None => None,
        }
    };
    if !invalidated.is_empty()
        && let Err(error) = videos
            .remove_scene_chunk_files(
                &video_id,
                record.temp_directory.as_deref(),
                Some(&invalidated),
            )
            .await
    {
        return project_error(error);
    }
    let input = body.input;
    let output = body.output;
    match videos
        .update_documents(
            &project_id,
            &video_id,
            input.clone(),
            output.clone(),
            Some(source_path),
            next.as_ref(),
        )
        .await
    {
        Ok(Some(detail)) => Json(VideoGeneral {
            input,
            output,
            source_path: detail.input_path,
        })
        .into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// Every attempt this video's timeline recorded, oldest first.
///
/// This is history, not state: it says a sequence ran three times and how long the last
/// run took. Nothing here decides whether a sequence's data exists; that stays derived.
pub(crate) async fn get_video_history(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.record(&project_id, &video_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    }
    let entries = match state.timeline() {
        Some(timeline) => timeline.read(&project_id, &video_id).await,
        None => Vec::new(),
    };
    Json(VideoHistory {
        entries: entries
            .iter()
            .map(crate::run::timeline::TimelineEntry::record)
            .collect(),
    })
    .into_response()
}

/// The video's scratch directory, its retained work, and the volume's free space.
///
/// These are measured on every read; a cached number would disagree with the disk as soon
/// as a run wrote a chunk.
pub(crate) async fn get_video_storage(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => {
            let inherited = videos.inherited_chunk_directory(&record.id);
            let directory = videos.chunk_directory(&record.id, record.temp_directory.as_deref());
            let retained = videos
                .retained_bytes(&video_id, record.temp_directory.as_deref())
                .await;
            Json(VideoStorage {
                directory: directory.display().to_string(),
                inherited_directory: inherited.display().to_string(),
                custom: record.temp_directory.is_some(),
                retained_bytes: retained,
                free_bytes: state.disk.available(&directory),
                total_bytes: state.disk.capacity(&directory),
            })
            .into_response()
        }
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// Point one video's scratch work at its own directory, or back at the inherited root.
///
/// The move is refused while the video retains chunks. The parallel encoder writes
/// absolute chunk paths into its sidecars, so relocating the directory would leave the
/// next concatenation addressing files that are no longer there. Deleting the retained
/// work is therefore the action that makes the move possible, not something this handler
/// does as a side effect. Nothing is copied: the choice applies to work started after it.
pub(crate) async fn put_video_storage(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<VideoStorageRequest>,
) -> Response {
    if state
        .runs()
        .config_locked_for_video(&project_id, &video_id)
        .await
    {
        return locked();
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };

    let requested = body
        .directory
        .as_deref()
        .map(str::trim)
        .filter(|directory| !directory.is_empty())
        .map(std::path::PathBuf::from);
    if let Some(directory) = &requested {
        if !directory.is_absolute() {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                "The temporary directory must be an absolute path.".to_owned(),
                Some(
                    "Choose a folder with the picker instead of typing a relative path.".to_owned(),
                ),
            );
        }
        if directory.parent().is_none() {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!("{} is a filesystem root.", directory.display()),
                Some("Choose a folder inside a volume, not the volume itself.".to_owned()),
            );
        }
        if tokio::fs::create_dir_all(directory).await.is_err() {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!(
                    "The directory {} could not be created.",
                    directory.display()
                ),
                Some("Choose a folder this account can create files in.".to_owned()),
            );
        }
        // Deleting retained work removes this whole directory. Adopting a folder that
        // already contains files would turn that cleanup into unrelated data loss, so a
        // new scratch location must be empty. Re-selecting the video's current directory
        // is allowed because its contents are already the video's own work.
        let is_current = record
            .temp_directory
            .as_deref()
            .map(std::path::Path::new)
            .is_some_and(|current| current == directory);
        if !is_current {
            match directory_is_empty(directory).await {
                Ok(true) => {}
                Ok(false) => {
                    return error_response(
                        StatusCode::UNPROCESSABLE_ENTITY,
                        ErrorCode::InvalidConfig,
                        format!("The directory {} is not empty.", directory.display()),
                        Some(
                            "Choose an empty folder; deleting retained work removes this directory."
                                .to_owned(),
                        ),
                    );
                }
                Err(error) => {
                    return error_response(
                        StatusCode::UNPROCESSABLE_ENTITY,
                        ErrorCode::InvalidConfig,
                        format!(
                            "The directory {} could not be read: {error}.",
                            directory.display()
                        ),
                        Some("Choose a folder this account can read and write.".to_owned()),
                    );
                }
            }
        }
        if !directory_is_writable(directory).await {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!("The directory {} cannot be written.", directory.display()),
                Some("Choose a folder this account can create files in.".to_owned()),
            );
        }
    }

    let current = videos.chunk_directory(&record.id, record.temp_directory.as_deref());
    let next = match &requested {
        Some(directory) => directory.clone(),
        None => videos.inherited_chunk_directory(&record.id),
    };
    let retained = videos
        .retained_bytes(&video_id, record.temp_directory.as_deref())
        .await;
    if next != current && retained > 0 {
        return error_response(
            StatusCode::CONFLICT,
            ErrorCode::Locked,
            format!(
                "This video still holds {} of retained chunks in {}.",
                retained,
                current.display()
            ),
            Some(
                "Delete the retained chunks first; the encoder's sidecars record their paths."
                    .to_owned(),
            ),
        );
    }

    let directory = requested.map(|directory| directory.display().to_string());
    match videos
        .update_temp_directory(&project_id, &video_id, directory)
        .await
    {
        Ok(Some(record)) => {
            let directory = videos.chunk_directory(&record.id, record.temp_directory.as_deref());
            Json(VideoStorage {
                directory: directory.display().to_string(),
                inherited_directory: videos
                    .inherited_chunk_directory(&record.id)
                    .display()
                    .to_string(),
                custom: record.temp_directory.is_some(),
                retained_bytes: retained,
                free_bytes: state.disk.available(&directory),
                total_bytes: state.disk.capacity(&directory),
            })
            .into_response()
        }
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// Probe the source once and describe the clip the decode graph produces.
///
/// The decoder is synchronous, so it runs on a blocking worker. A failure is returned as
/// data with a readable reason: the file may be moved, VapourSynth may be absent, or the
/// script may raise, and the details screen stays usable in every one of those cases.
pub(crate) async fn probe_video(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(request): ApiJson<VideoProbeRequest>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    // A sequence override probes its own graph. General's probe sends no input and reads
    // the video's document, so both surfaces report the clip they actually decode.
    let input = request.input.unwrap_or(record.input.clone());
    // A script input imports the generated `condor_data` module and reads the reserved
    // variables, so the probe supplies the same paths a run does. Without them, a template
    // script fails with `NameError: condor_temp_dir` although the document is valid.
    let video_path = record.input_path();
    let temp_dir = videos
        .chunk_directory(video_id.as_str(), record.temp_directory.as_deref())
        .display()
        .to_string();
    let condor = record.condor.clone();
    // The script reads the configuration as `condor.sequence_config`, so the probe supplies
    // the effective document this video would run with, not the engine's own defaults.
    let sequence_config = match state.projects() {
        Some(projects) => match projects.document(&project_id).await {
            Ok(Some(document)) => {
                let mut materialised =
                    config::materialise(&default_config(), &document, &record.overrides);
                config::inherit_sequence_inputs(&mut materialised, &record.input_path());
                materialised
                    .get("sequences")
                    .cloned()
                    .unwrap_or(Value::Null)
            }
            _ => Value::Null,
        },
        None => Value::Null,
    };
    match tokio::task::spawn_blocking(move || {
        let context = av1ation_engine::media::video::ProbeContext {
            video_path: &video_path,
            temp_dir: &temp_dir,
            condor: condor.as_ref(),
            sequence_config: &sequence_config,
        };
        av1ation_engine::media::video::probe_source_with(&input, Some(&context))
    })
    .await
    {
        Ok(Ok(probe)) => {
            let duration = if probe.fps > 0.0 {
                probe.frames as f64 / probe.fps
            } else {
                0.0
            };
            Json(VideoProbe {
                clip: Some(ClipDetails {
                    width: probe.width,
                    height: probe.height,
                    frame_count: probe.frames,
                    frame_rate: probe.fps,
                    duration_seconds: duration,
                    pixel_format: probe.pixel_format,
                    bit_depth: probe.bit_depth,
                    color_primaries: probe.color_primaries,
                    color_transfer: probe.color_transfer,
                    color_matrix: probe.color_matrix,
                    color_range: probe.color_range,
                    chroma_location: probe.chroma_location,
                }),
                detail: format!(
                    "Probed {}×{} at {:.3} fps, {} frames.",
                    probe.width, probe.height, probe.fps, probe.frames
                ),
            })
            .into_response()
        }
        Ok(Err(message)) => Json(VideoProbe {
            clip: None,
            detail: message,
        })
        .into_response(),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            format!("The probe worker stopped unexpectedly: {error}"),
            Some("Try the probe again; if it keeps failing, restart the service.".to_owned()),
        ),
    }
}

/// The raw sparse overrides, so the video sections can preserve fields they do not show.
pub(crate) async fn get_video_overrides(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => Json(ConfigOverrides {
            fields: record.overrides,
        })
        .into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// The effective configuration for one video, with per-leaf provenance.
///
/// Resolution stays pure: a read never writes the overrides back into the video document.
pub(crate) async fn get_video_config(
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

    match projects.config(&project_id, &record.overrides).await {
        Ok(Some(config)) => Json(config).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// Replace a video's sparse overrides with a validated, path-addressed document.
pub(crate) async fn put_video_overrides(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<VideoOverridesUpdate>,
) -> Response {
    if state
        .runs()
        .config_locked_for_video(&project_id, &video_id)
        .await
    {
        return locked();
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let Some(projects) = state.projects() else {
        return project_not_found(&project_id);
    };
    let project_document = match projects.document(&project_id).await {
        Ok(Some(document)) => document,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };

    let defaults = default_config();
    let known = config::leaf_paths(&defaults);
    if let Some(path) = body.fields.keys().find(|path| {
        !known.iter().any(|known| known == *path) && !config::accepts_override(&defaults, path)
    }) {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!("`{path}` is not a configuration field or section."),
            Some("Reload the configuration and edit an existing section.".to_owned()),
        );
    }
    // Reject a wrong value kind here rather than at encode time: the engine would only
    // discover it after the singleton was reserved.
    let candidate = config::materialise(&defaults, &project_document, &body.fields);
    if let Err(message) = config::validate(&candidate, &defaults) {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some("Change only the value of a field, not its type.".to_owned()),
        );
    }

    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    // A scene encodes with its own complete encoder document, so changing only the video's
    // overrides would leave every existing scene on the old document. The shared resolver
    // rewrites the scenes that still inherit it, clears their records only when asked, and
    // invalidates every chunk when the effective Parallel Encoder input changed.
    let clear_chunks = body.clear_chunks.unwrap_or(false);
    let previous = config::materialise(&defaults, &project_document, &record.overrides);
    let impact = match impact_for(&previous, &candidate, record, clear_chunks) {
        Ok(impact) => impact,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Reload the scene table; a run may have rewritten it.".to_owned()),
            );
        }
    };
    let record = impact.record;
    let next = impact.condor;
    let invalidated = impact.invalidated;
    if clear_chunks
        && !invalidated.is_empty()
        && let Err(error) = videos
            .remove_scene_chunk_files(
                &video_id,
                record.temp_directory.as_deref(),
                Some(&invalidated),
            )
            .await
    {
        return project_error(error);
    }
    let written = match next.as_ref() {
        Some(condor) => {
            videos
                .replace_overrides_with_condor(&project_id, &video_id, body.fields.clone(), condor)
                .await
        }
        None => {
            videos
                .replace_overrides(&project_id, &video_id, body.fields.clone())
                .await
        }
    };
    match written {
        Ok(Some(_)) => match projects.config(&project_id, &body.fields).await {
            Ok(Some(config)) => Json(config).into_response(),
            Ok(None) => project_not_found(&project_id),
            Err(error) => project_error(error),
        },
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// What a sequence's `input` reads from the video's General document.
enum GeneralRead {
    /// The engine inherits the whole General input when the sequence names none.
    Document,
    /// The runner fills the source path into a pathless input, or injects it as `video_path`.
    Source,
    /// The sequence states its own path; the General document is not read.
    Explicit,
}

/// Classify the effective `sequences.parallel_encoder.input` the way the runner reads it.
fn general_read(input: Option<&Value>) -> GeneralRead {
    let Some(input) = input.filter(|input| !input.is_null()) else {
        return GeneralRead::Document;
    };
    if input.get("VapourSynthScript").is_some() {
        return GeneralRead::Source;
    }
    for tag in ["Video", "VapourSynth"] {
        let Some(body) = input.get(tag) else {
            continue;
        };
        let path = body.get("path").and_then(Value::as_str);
        if path.is_none_or(|path| path.trim().is_empty()) {
            return GeneralRead::Source;
        }
    }
    GeneralRead::Explicit
}

/// Drop every override, so each leaf inherits the project value again.
pub(crate) async fn delete_video_overrides(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    if state
        .runs()
        .config_locked_for_video(&project_id, &video_id)
        .await
    {
        return locked();
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.clear_overrides(&project_id, &video_id).await {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}
