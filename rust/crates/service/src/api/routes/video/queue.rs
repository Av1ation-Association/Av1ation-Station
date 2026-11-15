use super::*;
use crate::api::json::ApiJson;

/// Resolve the project before a queue read or write. The queue store treats a missing
/// project directory as an empty queue, which would otherwise turn a stale id into a
/// successful no-op instead of the not-found the rest of the project surface returns.
async fn require_project(state: &AppState, project_id: &str) -> Result<(), Response> {
    let Some(projects) = state.projects() else {
        return Err(no_storage());
    };
    match projects.get(project_id).await {
        Ok(Some(_)) => Ok(()),
        Ok(None) => Err(project_not_found(project_id)),
        Err(error) => Err(project_error(error)),
    }
}

pub(crate) async fn list_videos(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    if let Err(response) = require_project(&state, &project_id).await {
        return response;
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.list(&project_id).await {
        Ok(rows) => Json(rows).into_response(),
        Err(error) => project_error(error),
    }
}

/// Replace the queue order. The body must be a permutation of the current queue, so a
/// stale client cannot silently drop or duplicate a video.
pub(crate) async fn reorder_videos(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<VideoOrderRequest>,
) -> Response {
    if let Err(response) = require_project(&state, &project_id).await {
        return response;
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    // One row is frozen: the video the worker is encoding. Its neighbours may still move
    // around it, so the queue stays editable while a run continues.
    if let Some((active_project, active_video)) = state.runs().active_video().await
        && active_project == project_id
    {
        let current = match videos.list(&project_id).await {
            Ok(rows) => rows,
            Err(error) => return project_error(error),
        };
        let before = current
            .iter()
            .position(|video| video.id.as_str() == active_video);
        let after = body
            .video_ids
            .iter()
            .position(|video_id| video_id == &active_video);
        if before.is_some() && before != after {
            return run_locked("The video being encoded cannot be moved in the queue.");
        }
    }
    match videos.reorder(&project_id, &body.video_ids).await {
        Ok(rows) => Json(rows).into_response(),
        Err(error) => queue_error(error),
    }
}

/// Remove several videos in one lock check. An unknown id rejects the whole request rather
/// than leaving the queue half-changed.
pub(crate) async fn remove_videos(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<VideoRemoveRequest>,
) -> Response {
    if let Err(response) = require_project(&state, &project_id).await {
        return response;
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    if let Some((active_project, active_video)) = state.runs().active_video().await
        && active_project == project_id
        && body
            .video_ids
            .iter()
            .any(|video_id| video_id == &active_video)
    {
        return run_locked("The video being encoded cannot be removed from the queue.");
    }
    match videos.remove_many(&project_id, &body.video_ids).await {
        Ok(removed) => Json(removed).into_response(),
        Err(error) => queue_error(error),
    }
}

/// A queue request that is semantically wrong is a configuration error, not a malformed
/// request: the JSON was readable, but the list is not a permutation or names a video that
/// is not in the queue.
fn queue_error(error: StoreError) -> Response {
    match error {
        StoreError::Invalid(message) => error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some("Reload the queue and send its ids again.".to_owned()),
        ),
        other => project_error(other),
    }
}

pub(crate) async fn add_video(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<VideoCreateRequest>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let Some(projects) = state.projects() else {
        return no_storage();
    };
    let Some(project) = (match projects.get(&project_id).await {
        Ok(project) => project,
        Err(error) => return project_error(error),
    }) else {
        return project_not_found(&project_id);
    };

    let input_path = body.input_path.trim();
    let output_path = match body.output_path.as_deref().map(str::trim) {
        Some(path) if !path.is_empty() => path.to_owned(),
        _ => derive_output(&project.general, input_path),
    };
    if let Some(message) = validate_paths(input_path, &output_path) {
        return message;
    }

    let input = match project.general.input_kind {
        InputKind::Ffms2 => av1ation_engine::media::video::native_input_with(
            input_path,
            project.general.index_file.as_deref(),
            &project.general.ffms2_filters,
        ),
        InputKind::VapourSynth => av1ation_engine::media::video::vapoursynth_input_with_filters(
            input_path,
            engine_importer(project.general.import_method),
            &project.general.vapour_synth_filters,
        ),
        InputKind::VapourSynthScript => {
            match project.general.script_mode.unwrap_or(ScriptInputMode::File) {
                ScriptInputMode::File => {
                    let Some(script) = project.general.script.as_deref() else {
                        return error_response(
                            StatusCode::UNPROCESSABLE_ENTITY,
                            ErrorCode::InvalidConfig,
                            "This project decodes through a VapourSynth script, but no script path is set."
                                .to_owned(),
                            Some("Choose the .vpy file in Configuration → General.".to_owned()),
                        );
                    };
                    if !std::path::Path::new(script).is_file() {
                        return error_response(
                            StatusCode::UNPROCESSABLE_ENTITY,
                            ErrorCode::InvalidConfig,
                            format!("No script exists at {script}."),
                            Some(
                                "Choose an existing .vpy file in Configuration → General."
                                    .to_owned(),
                            ),
                        );
                    }
                    Ok(av1ation_engine::media::video::vapoursynth_script_input(
                        script,
                        &project.general.variables,
                    ))
                }
                ScriptInputMode::Text => {
                    let text = project.general.script_text.as_deref().unwrap_or_default();
                    if text.trim().is_empty() {
                        return error_response(
                            StatusCode::UNPROCESSABLE_ENTITY,
                            ErrorCode::InvalidConfig,
                            "This project decodes through a custom VapourSynth script, but it is empty."
                                .to_owned(),
                            Some("Edit the script in Configuration → General.".to_owned()),
                        );
                    }
                    Ok(
                        av1ation_engine::media::video::vapoursynth_script_text_input(
                            text,
                            &project.general.variables,
                        ),
                    )
                }
            }
        }
    };
    let input = match input {
        Ok(input) => input,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Check the input filters in Configuration → General.".to_owned()),
            );
        }
    };
    let output = av1ation_engine::media::video::native_output(&output_path);
    match videos.add(&project_id, &body, input, output).await {
        Ok(Some(detail)) => (StatusCode::CREATED, Json(detail)).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// The decode plugin a project selected, or the engine's default when it never chose one.
fn engine_importer(
    importer: Option<av1ation_contracts::script::VapourSynthImporter>,
) -> av1ation_engine::media::video::VapourSynthSource {
    use av1ation_contracts::script::VapourSynthImporter;
    match importer.unwrap_or_default() {
        VapourSynthImporter::Ffms2 => av1ation_engine::media::video::VapourSynthSource::Ffms2,
        VapourSynthImporter::BestSource => {
            av1ation_engine::media::video::VapourSynthSource::BestSource
        }
        VapourSynthImporter::Lsmash => av1ation_engine::media::video::VapourSynthSource::Lsmash,
        VapourSynthImporter::Dgdecnv => av1ation_engine::media::video::VapourSynthSource::Dgdecnv,
    }
}

/// Derive an output path from the project's General policy.
///
/// The result is a suggestion with the same shape on every host: the file sits beside the
/// source or in the configured folder, named after the source stem. The user can still send
/// an explicit output path for one video; only the omitted case reads the policy.
fn derive_output(general: &GeneralDefaults, input: &str) -> String {
    let source = FsPath::new(input);
    let stem = source
        .file_stem()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "output".to_owned());
    let directory = match general.output_mode {
        OutputMode::NextToInput => source.parent().map(PathBuf::from).unwrap_or_default(),
        OutputMode::Folder => general
            .output_folder
            .as_deref()
            .map(PathBuf::from)
            .unwrap_or_default(),
    };
    directory
        .join(format!("{stem}.av1.mkv"))
        .to_string_lossy()
        .into_owned()
}

/// Reject a video whose source or output directory does not exist before anything is
/// written, so a typo is reported next to the field rather than by a failed encode.
pub(crate) fn validate_paths(input: &str, output: &str) -> Option<Response> {
    if input.is_empty() || output.is_empty() {
        return Some(error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "A video needs both an input and an output path.".to_owned(),
            Some("Choose the source file and where the encoded result is written.".to_owned()),
        ));
    }
    if !std::path::Path::new(input).is_absolute() || !std::path::Path::new(output).is_absolute() {
        return Some(error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "Video paths must be absolute.".to_owned(),
            Some("Use the file picker, or type a full path.".to_owned()),
        ));
    }
    if !std::fs::metadata(input).is_ok_and(|metadata| metadata.is_file()) {
        return Some(error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!("No file exists at {input}."),
            Some("Choose an existing source file.".to_owned()),
        ));
    }
    let parent = std::path::Path::new(output).parent();
    if !parent.is_some_and(|parent| parent.is_dir()) {
        return Some(error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!("The directory for {output} does not exist."),
            Some("Choose an existing output directory.".to_owned()),
        ));
    }
    // Refuse a destination that aliases the source before a run can write through it. The
    // engine has the same check, but it runs only at concatenation, after every chunk has
    // already been encoded.
    if let Err(message) = av1ation_engine::media::video::check_output_path(output, input) {
        return Some(error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some("Choose a different output file; it cannot alias the source.".to_owned()),
        ));
    }
    None
}

pub(crate) async fn delete_video(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    if state.runs().active_video().await == Some((project_id.clone(), video_id.clone())) {
        return error_response(
            StatusCode::LOCKED,
            ErrorCode::Locked,
            "This video is being encoded.".to_owned(),
            Some("Cancel the run, then remove it from the queue.".to_owned()),
        );
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let removed = match videos.delete(&project_id, &video_id).await {
        Ok(removed) => removed,
        Err(error) => return project_error(error),
    };
    if !removed {
        return video_not_found(&video_id);
    }
    // The document and its chunks are gone; the history directory and the run logs address
    // the video by the same id, so nothing could list or open them again. Cleanup is
    // best-effort like the chunks: a video the user removed must not stay listed because its
    // old history could not be unlinked.
    if let Some(timeline) = state.timeline()
        && let Err(error) = timeline.remove_video(&project_id, &video_id).await
    {
        tracing::warn!(
            video_id,
            error = %error,
            "the removed video's history could not be deleted"
        );
    }
    if let Some(logs) = state.logs()
        && let Ok(metas) = logs.runs(&project_id, &video_id).await
    {
        for meta in metas {
            if let Err(error) = logs.remove(&meta.run_id).await {
                tracing::warn!(
                    run_id = meta.run_id,
                    error = %error,
                    "a removed video's run log could not be deleted"
                );
            }
        }
    }
    StatusCode::NO_CONTENT.into_response()
}

/// Delete the retained chunks of a completed video without touching its checkpoint.
///
/// This is the explicit counterpart to the opt-in `delete_chunks_on_success` setting:
/// the default keeps chunks, so the UI must be able to reclaim the space on demand.
/// Deleting while that video encodes would corrupt the concatenator's input.
pub(crate) async fn delete_video_chunks(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    if state.runs().active_video().await == Some((project_id.clone(), video_id.clone())) {
        return error_response(
            StatusCode::LOCKED,
            ErrorCode::Locked,
            "This video is being encoded.".to_owned(),
            Some("Cancel the run, then delete its chunks.".to_owned()),
        );
    }
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    match videos
        .remove_chunks(&video_id, record.temp_directory.as_deref())
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => project_error(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_is_derived_beside_or_under_the_configured_folder() {
        let beside = GeneralDefaults {
            output_mode: OutputMode::NextToInput,
            ..GeneralDefaults::default()
        };
        let source = std::env::temp_dir().join("source.mkv");
        let derived = derive_output(&beside, &source.to_string_lossy());
        assert_eq!(
            FsPath::new(&derived),
            source.with_file_name("source.av1.mkv").as_path()
        );

        let folder = std::env::temp_dir().join("av1ation-output");
        let in_folder = GeneralDefaults {
            output_mode: OutputMode::Folder,
            output_folder: Some(folder.to_string_lossy().into_owned()),
            ..GeneralDefaults::default()
        };
        let derived = derive_output(&in_folder, &source.to_string_lossy());
        assert_eq!(
            FsPath::new(&derived),
            folder.join("source.av1.mkv").as_path()
        );
    }
}
