//! Structural scene edits: add, split, merge, delete, range changes, undo, and reset.
//!
//! The engine owns what a valid scene table looks like; the service owns the run lock and
//! the files that become stale. A chunk is named after its scene's index, so an insertion or
//! deletion deletes the chunks whose range changed and renames every later chunk with its
//! row. The probe directory is removed whole because its files are named the same way. A
//! range change invalidates that scene's measurements, and undo restores the table but not
//! files that were already removed.

use std::collections::BTreeMap;

use av1ation_contracts::protocol::ErrorCode;
use av1ation_contracts::scene::{
    SceneAddRequest, SceneDataRequest, SceneRangeRequest, SceneSelectionRequest, SceneSplitRequest,
};
use av1ation_engine::run::reset;
use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};

use super::{locked, no_storage, project_error, project_not_found, video_not_found};
use crate::{api::error::error_response, api::json::ApiJson, state::AppState};

/// Engine fields a custom pair must not shadow.
///
/// A script reads both through `sequence_data.<name>`, and the engine writes these on every
/// run, so a stored pair with one of these names would either be ignored or replace a
/// measurement.
const RESERVED_SEQUENCE_DATA: [&str; 6] = [
    "scene_detection",
    "noise_detection",
    "noise_scaling",
    "target_quality",
    "parallel_encoder",
    "quality_check",
];

/// Bounds on one scene's custom data.
///
/// The table is duplicated into every script open and into `condor_scenes`, so an unbounded
/// document would be paid for on every sequence rather than once when it is saved.
const MAX_CUSTOM_PAIRS: usize = 64;
const MAX_CUSTOM_VALUE_BYTES: usize = 4096;
const MAX_CUSTOM_KEY_LEN: usize = 64;

/// Refuse a pair a script could not address or that would shadow engine data.
fn validate_custom_data(values: &BTreeMap<String, serde_json::Value>) -> Result<(), String> {
    if values.len() > MAX_CUSTOM_PAIRS {
        return Err(format!(
            "At most {MAX_CUSTOM_PAIRS} custom pairs can be stored for one scene."
        ));
    }
    for (key, value) in values {
        if key.is_empty() || key.len() > MAX_CUSTOM_KEY_LEN {
            return Err(format!(
                "`{key}` is not a key a script can address; use 1–{MAX_CUSTOM_KEY_LEN} characters."
            ));
        }
        let mut characters = key.chars();
        let first = characters.next().unwrap_or('_');
        if !(first.is_ascii_alphabetic() || first == '_')
            || !characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            return Err(format!(
                "`{key}` is not a Python attribute name; use letters, digits, and underscores, starting with a letter or underscore."
            ));
        }
        if RESERVED_SEQUENCE_DATA.contains(&key.as_str()) {
            return Err(format!(
                "`{key}` is written by the engine; choose another key."
            ));
        }
        let bytes = serde_json::to_vec(value)
            .map_err(|error| format!("`{key}` is not valid JSON: {error}"))?
            .len();
        if bytes > MAX_CUSTOM_VALUE_BYTES {
            return Err(format!(
                "`{key}` is {bytes} bytes; a value may be at most {MAX_CUSTOM_VALUE_BYTES} bytes."
            ));
        }
    }
    Ok(())
}

/// Replace one scene's custom sequence data.
///
/// The engine's `sequence_data` is a typed struct, so it cannot store a name it does not
/// know; the pairs live in the video record and are merged into the table a script receives.
/// The whole map is written in one request so removing a pair and keeping the rest cannot
/// race another edit.
pub(crate) async fn set_scene_data(
    State(state): State<AppState>,
    AxumPath((project_id, video_id, index)): AxumPath<(String, String, u32)>,
    ApiJson(body): ApiJson<SceneDataRequest>,
) -> Response {
    if state
        .runs()
        .config_locked_for_video(&project_id, &video_id)
        .await
    {
        return locked();
    }
    if let Err(message) = validate_custom_data(&body.values) {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some(
                "A script reads each pair as `condor_data.scenes[i].sequence_data.<key>`."
                    .to_owned(),
            ),
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
    let Some(condor) = record.condor.as_ref() else {
        return no_scene_table();
    };
    let count = condor
        .get("scenes")
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    if usize::try_from(index).map_or(true, |index| index >= count) {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No scene matches index `{index}`."),
            Some("Reload the scene table; a run may have rewritten it.".to_owned()),
        );
    }
    match videos
        .set_scene_custom_data(&project_id, &video_id, index, body.values)
        .await
    {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

pub(crate) async fn split_scene(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<SceneSplitRequest>,
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
    let Some(condor) = record.condor.as_ref() else {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "This video has no detected scenes to split.".to_owned(),
            Some("Run Scene detection first.".to_owned()),
        );
    };
    let edit = match reset::split_scene(condor, body.frame) {
        Ok(edit) => edit,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Choose a frame inside an existing scene.".to_owned()),
            );
        }
    };
    let reset::SceneEdit {
        condor: next,
        chunks,
    } = edit;
    let temp = record.temp_directory.as_deref();
    if let Err(error) = invalidate_chunks(videos, &video_id, temp, &chunks).await {
        return project_error(error);
    }
    match videos
        .replace_condor_renumbering_scenes(&project_id, &video_id, &next)
        .await
    {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => abandon_scene_edit(videos, &video_id, temp, error).await,
    }
}

pub(crate) async fn add_scene(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<SceneAddRequest>,
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
    // A video that has never run has no saved engine state yet. Adding a scene is still a
    // legitimate first edit — the timeline offers it on a gap — so seed the table with the
    // encoder the next run would use, exactly as the engine builds it from configuration.
    let seeded;
    let condor = match record.condor.as_ref() {
        Some(condor) => condor,
        None => {
            let Some(projects) = state.projects() else {
                return no_storage();
            };
            let project_document = match projects.document(&project_id).await {
                Ok(Some(document)) => document,
                Ok(None) => return project_not_found(&project_id),
                Err(error) => return project_error(error),
            };
            let document = crate::project::config::materialise(
                &crate::project::projects::default_config(),
                &project_document,
                &record.overrides,
            );
            let Some(encoder) = document.get("encoder").cloned() else {
                return error_response(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    ErrorCode::InvalidConfig,
                    "This video has no encoder to build a scene from.".to_owned(),
                    Some("Choose an encoder in Configuration first.".to_owned()),
                );
            };
            seeded = serde_json::json!({ "encoder": encoder, "scenes": [] });
            &seeded
        }
    };
    let edit = match reset::add_scene(condor, body.start_frame, body.end_frame) {
        Ok(edit) => edit,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Choose a range that no scene already covers.".to_owned()),
            );
        }
    };
    let reset::SceneEdit {
        condor: next,
        chunks,
    } = edit;
    let temp = record.temp_directory.as_deref();
    if let Err(error) = invalidate_chunks(videos, &video_id, temp, &chunks).await {
        return project_error(error);
    }
    match videos
        .replace_condor_renumbering_scenes(&project_id, &video_id, &next)
        .await
    {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => abandon_scene_edit(videos, &video_id, temp, error).await,
    }
}

pub(crate) async fn set_scene_range(
    State(state): State<AppState>,
    AxumPath((project_id, video_id, index)): AxumPath<(String, String, u32)>,
    ApiJson(body): ApiJson<SceneRangeRequest>,
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
    let Some(condor) = record.condor.as_ref() else {
        return no_scene_table();
    };
    let next = match reset::set_scene_range(condor, index, body.start_frame, body.end_frame) {
        Ok(next) => next,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Choose a frame range that ends after it starts.".to_owned()),
            );
        }
    };
    let temp = record.temp_directory.as_deref();
    if let Err(error) = videos
        .remove_scene_chunk_files(&video_id, temp, Some(std::slice::from_ref(&index)))
        .await
    {
        return project_error(error);
    }
    if let Err(error) = videos
        .remove_scratch_directory(&video_id, temp, "Target Quality")
        .await
    {
        return project_error(error);
    }
    match videos
        .replace_condor_with_undo(&project_id, &video_id, &next)
        .await
    {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

pub(crate) async fn delete_scene(
    State(state): State<AppState>,
    AxumPath((project_id, video_id, index)): AxumPath<(String, String, u32)>,
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
    let Some(condor) = record.condor.as_ref() else {
        return no_scene_table();
    };
    let edit = match reset::delete_scene(condor, index) {
        Ok(edit) => edit,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Reload the scene table; a run may have rewritten it.".to_owned()),
            );
        }
    };
    let reset::SceneEdit {
        condor: next,
        chunks,
    } = edit;
    let temp = record.temp_directory.as_deref();
    if let Err(error) = invalidate_chunks(videos, &video_id, temp, &chunks).await {
        return project_error(error);
    }
    match videos
        .replace_condor_renumbering_scenes(&project_id, &video_id, &next)
        .await
    {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => abandon_scene_edit(videos, &video_id, temp, error).await,
    }
}

pub(crate) async fn undo_scene_edit(
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
    match videos.undo_scene_edit(&project_id, &video_id).await {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => error_response(
            StatusCode::CONFLICT,
            ErrorCode::InvalidConfig,
            "There is no scene edit to undo.".to_owned(),
            Some("Structural edits are undoable one step at a time.".to_owned()),
        ),
        Err(error) => project_error(error),
    }
}

/// Fail a structural edit whose table could not be written.
///
/// The chunk files were already deleted and renamed for the new table, so the old table now
/// names another row's chunk. Deleting every chunk makes that mismatch loud — the next run
/// encodes the scenes again — instead of muxing the wrong pictures into the output.
async fn abandon_scene_edit(
    videos: &crate::project::videos::VideoStore,
    video_id: &str,
    temp_directory: Option<&str>,
    error: crate::project::projects::StoreError,
) -> Response {
    let _ = videos
        .remove_scene_chunk_files(video_id, temp_directory, None)
        .await;
    project_error(error)
}

/// Delete the chunks a structural edit invalidated and move the survivors with their rows.
///
/// A chunk is named after its scene's index, so an insertion or deletion moves every later
/// chunk even though its footage did not change. The Target Quality directory is deleted
/// whole because its probe files are named the same way; the Parallel Encoder directory
/// holds per-scene logs and generated grain tables, which the next run writes again.
async fn invalidate_chunks(
    videos: &crate::project::videos::VideoStore,
    video_id: &str,
    temp_directory: Option<&str>,
    chunks: &reset::ChunkEdit,
) -> Result<(), crate::project::projects::StoreError> {
    if !chunks.remove.is_empty() {
        videos
            .remove_scene_chunk_files(video_id, temp_directory, Some(&chunks.remove))
            .await?;
    }
    videos
        .renumber_scene_chunks(
            video_id,
            temp_directory,
            chunks.renumber_from,
            chunks.renumber_by,
        )
        .await?;
    for directory in ["Parallel Encoder", "Target Quality"] {
        videos
            .remove_scratch_directory(video_id, temp_directory, directory)
            .await?;
    }
    Ok(())
}

/// The one refusal every scene edit shares when a video has no checkpoint yet.
fn no_scene_table() -> Response {
    error_response(
        StatusCode::UNPROCESSABLE_ENTITY,
        ErrorCode::InvalidConfig,
        "This video has no scene table to edit.".to_owned(),
        Some("Run Scene detection first.".to_owned()),
    )
}

pub(crate) async fn merge_scenes(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<SceneSelectionRequest>,
) -> Response {
    edit_selection(state, project_id, video_id, body, SelectionEdit::Merge).await
}

pub(crate) async fn reset_scenes(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<SceneSelectionRequest>,
) -> Response {
    edit_selection(state, project_id, video_id, body, SelectionEdit::Reset).await
}

enum SelectionEdit {
    Merge,
    Reset,
}

async fn edit_selection(
    state: AppState,
    project_id: String,
    video_id: String,
    body: SceneSelectionRequest,
    edit: SelectionEdit,
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
    let Some(condor) = record.condor.as_ref() else {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "This video has no scene table to edit.".to_owned(),
            Some("Run Scene detection first.".to_owned()),
        );
    };
    if body.scenes.is_empty() {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "Choose at least one scene.".to_owned(),
            None,
        );
    }
    let next = match edit {
        SelectionEdit::Merge => {
            reset::merge_scenes(condor, &body.scenes).map(|edit| (edit.condor, Some(edit.chunks)))
        }
        SelectionEdit::Reset => {
            reset::reset_scene_outputs(condor, &body.scenes).map(|next| (next, None))
        }
    };
    let (next, chunks) = match next {
        Ok(next) => next,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Reload the scene table; a run may have rewritten it.".to_owned()),
            );
        }
    };
    let temp = record.temp_directory.as_deref();
    let renumbered = chunks.is_some();
    let files = match chunks {
        Some(chunks) => invalidate_chunks(videos, &video_id, temp, &chunks).await,
        None => videos
            .remove_scene_chunk_files(&video_id, temp, Some(&body.scenes))
            .await
            .map(|_| ()),
    };
    if let Err(error) = files {
        return project_error(error);
    }
    let written = match edit {
        // A merge keeps the first index but removes the rest, so every later scene moved.
        SelectionEdit::Merge => {
            videos
                .replace_condor_renumbering_scenes(&project_id, &video_id, &next)
                .await
        }
        SelectionEdit::Reset => videos.replace_condor(&project_id, &video_id, &next).await,
    };
    match written {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) if renumbered => abandon_scene_edit(videos, &video_id, temp, error).await,
        Err(error) => project_error(error),
    }
}
