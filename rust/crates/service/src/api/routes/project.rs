use std::collections::BTreeMap;

use av1ation_contracts::project::{
    ChunkInvalidationReason, Project, ProjectArchive, ProjectArchiveVideo, ProjectChunkImpact,
    ProjectChunkScene, ProjectCreateRequest, ProjectDefaultsState, ProjectSummary,
    ProjectTemplateApplied, ProjectTemplateApplyRequest, ProjectUpdateRequest,
};
use av1ation_contracts::protocol::ErrorCode;
use av1ation_contracts::script::ScriptPluginReport;
use av1ation_contracts::settings::GeneralDefaults;
use axum::{
    Json,
    extract::{Path as AxumPath, Query, State},
    http::{
        StatusCode,
        header::{CONTENT_DISPOSITION, HeaderValue},
    },
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::Value;

use super::{locked, no_storage, project_error, project_not_found};
use crate::{
    api::error::error_response,
    api::json::ApiJson,
    project::config,
    project::derive::output_is_written,
    project::projects::default_config,
    project::videos::invalidation::{VideoImpact, impact_for, parallel_encoder_input},
    project::videos::{VideoRecord, VideoStore, input_path_of, iso8601, now_epoch},
    state::AppState,
};

pub(crate) async fn list_projects(State(state): State<AppState>) -> Response {
    let Some(store) = state.projects() else {
        return Json(Vec::<ProjectSummary>::new()).into_response();
    };
    match store.list().await {
        Ok(mut summaries) => {
            if let Some(videos) = state.videos() {
                for summary in &mut summaries {
                    if let Ok(records) = videos.records(&summary.id).await {
                        // Both counts are derived here rather than cached in the index: the
                        // queue and the outputs can change without a project write.
                        summary.video_count = records.len() as u32;
                        summary.completed_videos = records
                            .iter()
                            .filter(|record| output_is_written(&record.output_path()))
                            .count() as u32;
                        for record in records {
                            summary.size_bytes = summary.size_bytes.saturating_add(
                                videos
                                    .retained_bytes(&record.id, record.temp_directory.as_deref())
                                    .await,
                            );
                        }
                    }
                }
            }
            Json(summaries).into_response()
        }
        Err(error) => project_error(error),
    }
}

pub(crate) async fn create_project(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<ProjectCreateRequest>,
) -> Response {
    let Some(store) = state.projects() else {
        return no_storage();
    };

    // A marked template is a complete document, materialised when it was saved, so a new
    // project copies it verbatim and never references it afterwards. Without a marked
    // template, the engine defaults apply.
    let settings = state.settings().await;
    let template = settings
        .default_project_template_id
        .as_deref()
        .and_then(|id| {
            settings
                .project_templates
                .iter()
                .find(|template| template.id == id)
        });
    let config = template
        .map(|template| template.config.clone())
        .unwrap_or_else(default_config);
    let general = template
        .map(|template| template.general.clone())
        .unwrap_or_default();

    let project = match store
        .create(&body.name, body.description.as_deref(), config, general)
        .await
    {
        Ok(project) => project,
        Err(error) => return project_error(error),
    };

    tracing::info!(project_id = %project.id, "project created");
    (StatusCode::CREATED, Json(project)).into_response()
}

pub(crate) async fn get_project(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    match store.get(&project_id).await {
        Ok(Some(project)) => Json(project).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// Apply one saved template to a project's configuration and General section.
///
/// The write is one atomic document replacement, and the response carries both documents
/// from before and after so the header's single undo step restores exactly what was there.
/// Existing videos keep their own overrides; only the project-level defaults change.
pub(crate) async fn apply_template(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<ProjectTemplateApplyRequest>,
) -> Response {
    if state.runs().config_locked_for(&project_id).await {
        return locked();
    }
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    let settings = state.settings().await;
    let Some(template) = settings
        .project_templates
        .iter()
        .find(|template| template.id == body.template_id)
    else {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No project template matches {}", body.template_id),
            Some("Refresh the template list and choose one that still exists.".to_owned()),
        );
    };

    match store
        .replace_defaults(&project_id, &template.config, &template.general)
        .await
    {
        Ok(Some((project, previous))) => Json(ProjectTemplateApplied {
            project,
            previous,
            applied: ProjectDefaultsState {
                config: template.config.clone(),
                general: template.general.clone(),
            },
        })
        .into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// Replace a project's configuration and General section from a previous snapshot.
///
/// This is the write behind Undo and Redo in the project header. It is a normal project
/// write, so a stored snapshot cannot put anything into the document that the same user
/// could not have saved through the section editors.
pub(crate) async fn restore_defaults(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<ProjectDefaultsState>,
) -> Response {
    if state.runs().config_locked_for(&project_id).await {
        return locked();
    }
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    match store
        .replace_defaults(&project_id, &body.config, &body.general)
        .await
    {
        Ok(Some((project, _))) => Json::<Project>(project).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

pub(crate) async fn patch_project(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<ProjectUpdateRequest>,
) -> Response {
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };

    match store
        .update(
            &project_id,
            body.name.as_deref(),
            body.description.as_deref(),
        )
        .await
    {
        Ok(Some(project)) => Json(project).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// Replace the General defaults for newly added videos.
///
/// Held behind the same configuration lock as every other project write: the screen is
/// read-only while a run owns the singleton, and the server is what enforces it.
pub(crate) async fn update_general(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<GeneralDefaults>,
) -> Response {
    if state.runs().config_locked_for(&project_id).await {
        return locked();
    }
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    match store.update_general(&project_id, &body).await {
        Ok(Some(project)) => Json(project).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// The effective project configuration with per-leaf provenance. Video overrides are empty
/// until a video entry exists; the resolver already accepts them.
pub(crate) async fn get_project_config(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    match store.config(&project_id, &BTreeMap::new()).await {
        Ok(Some(config)) => Json(config).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// The VapourSynth plugin problems this project's inputs would hit right now.
///
/// A project has no video to validate, but its General input and sequence overrides are
/// already the documents every queued video will open. Reporting the same structured rows
/// before the queue is filled puts the warning on the page that owns the script.
pub(crate) async fn project_scripts(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    let project = match store.get(&project_id).await {
        Ok(Some(project)) => project,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };
    let config = match store.document(&project_id).await {
        Ok(Some(config)) => config,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };

    let scan = crate::script::scripts::scan_config(&state, Some(&project.general), &config).await;
    Json::<ScriptPluginReport>(scan.report).into_response()
}

/// The one write-time choice a project configuration save carries besides the document.
#[derive(Debug, Default, Deserialize)]
pub(crate) struct ConfigWriteQuery {
    /// Delete the retained chunks the write invalidates. Absent means keep them.
    #[serde(default)]
    clear_chunks: bool,
}

/// Validate and fully materialise the document a project configuration write would store.
fn candidate_document(defaults: &Value, body: &Value) -> Result<Value, String> {
    config::validate(body, defaults)?;
    Ok(config::materialise(defaults, body, &BTreeMap::new()))
}

/// The rejection for a document whose value kinds the engine would not read.
fn invalid_document(message: String) -> Response {
    error_response(
        StatusCode::UNPROCESSABLE_ENTITY,
        ErrorCode::InvalidConfig,
        message,
        Some("Change only the value of a field, not its type.".to_owned()),
    )
}

/// The rejection for a scene table the engine cannot read.
fn invalid_scenes(message: String) -> Response {
    error_response(
        StatusCode::UNPROCESSABLE_ENTITY,
        ErrorCode::InvalidConfig,
        message,
        Some("Reload the scene table; a run may have rewritten it.".to_owned()),
    )
}

/// Whether a project write can reach a video's retained work at all.
///
/// Every other section leaves both the encoder document and the Parallel Encoder input
/// alone, so the queue does not have to be read for a scene-detection or storage save.
fn project_reaches_videos(previous: &Value, next: &Value) -> bool {
    previous.get("encoder") != next.get("encoder")
        || parallel_encoder_input(previous) != parallel_encoder_input(next)
}

/// No retained work is at stake; shared by the impact route's early returns.
fn no_impact() -> ProjectChunkImpact {
    ProjectChunkImpact {
        reason: None,
        videos: 0,
        scenes: Vec::new(),
    }
}

/// Resolve every queued video against the project document before and after a write.
///
/// The scene table is the engine's own checkpoint, so a stale index is rejected before any
/// document or chunk changes rather than applying a prefix of the write.
fn video_impacts(
    defaults: &Value,
    records: Vec<VideoRecord>,
    previous_project: &Value,
    next_project: &Value,
    clear_chunks: bool,
) -> Result<Vec<VideoImpact>, String> {
    records
        .into_iter()
        .map(|record| {
            let previous = config::materialise(defaults, previous_project, &record.overrides);
            let next = config::materialise(defaults, next_project, &record.overrides);
            impact_for(&previous, &next, record, clear_chunks)
        })
        .collect()
}

/// The retained chunks a candidate project configuration would invalidate.
///
/// A project-level encoder or Parallel Encoder input change reaches every video that
/// inherits it, and the project screen has no scene table of its own to count them from. The
/// save route resolves the same impact before writing, so this preview cannot disagree with
/// what Save deletes.
pub(crate) async fn project_config_impact(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<Value>,
) -> Response {
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    let previous = match store.document(&project_id).await {
        Ok(Some(document)) => document,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };
    let defaults = default_config();
    let next = match candidate_document(&defaults, &body) {
        Ok(next) => next,
        Err(message) => return invalid_document(message),
    };
    if !project_reaches_videos(&previous, &next) {
        return Json(no_impact()).into_response();
    }
    let Some(videos) = state.videos() else {
        return Json(no_impact()).into_response();
    };
    let records = match videos.records(&project_id).await {
        Ok(records) => records,
        Err(error) => return project_error(error),
    };
    let impacts = match video_impacts(&defaults, records, &previous, &next, true) {
        Ok(impacts) => impacts,
        Err(message) => return invalid_scenes(message),
    };
    let mut reason = None;
    let mut affected_videos = 0_u32;
    let mut scenes = Vec::new();
    for impact in &impacts {
        if impact.invalidated.is_empty() {
            continue;
        }
        let sizes = videos
            .chunk_sizes(&impact.record.id, impact.record.temp_directory.as_deref())
            .await;
        let before = scenes.len();
        for index in &impact.invalidated {
            if let Some(chunk_bytes) = VideoStore::chunk_bytes(&sizes, *index as usize) {
                scenes.push(ProjectChunkScene {
                    index: *index,
                    chunk_bytes,
                });
            }
        }
        if scenes.len() == before {
            continue;
        }
        affected_videos += 1;
        // A changed input invalidates every chunk it reaches, including a scene with its own
        // encoder, so it is the reason the guard explains whenever both changed. Only a
        // video that actually contributes a chunk decides the copy.
        if impact.reason == Some(ChunkInvalidationReason::Input) {
            reason = Some(ChunkInvalidationReason::Input);
        } else if reason.is_none() {
            reason = impact.reason;
        }
    }
    Json(ProjectChunkImpact {
        reason,
        videos: affected_videos,
        scenes,
    })
    .into_response()
}

/// Replace the project configuration with a validated, fully materialised document.
///
/// The encoder and Parallel Encoder input are the base every video inherits, so a change to
/// either rewrites the scenes that still inherit it and, when the request asks, deletes the
/// chunks those scenes can no longer reuse. `clear_chunks` is the guard's answer; the scene
/// rewrite happens either way, because keeping a chunk must not keep the old encoder.
pub(crate) async fn put_project_config(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    Query(query): Query<ConfigWriteQuery>,
    ApiJson(body): ApiJson<Value>,
) -> Response {
    if state.runs().config_locked_for(&project_id).await {
        return locked();
    }
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    let previous = match store.document(&project_id).await {
        Ok(Some(document)) => document,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };
    let defaults = default_config();
    let next = match candidate_document(&defaults, &body) {
        Ok(next) => next,
        Err(message) => return invalid_document(message),
    };
    if let Some(videos) = state.videos()
        && project_reaches_videos(&previous, &next)
    {
        let records = match videos.records(&project_id).await {
            Ok(records) => records,
            Err(error) => return project_error(error),
        };
        let impacts = match video_impacts(&defaults, records, &previous, &next, query.clear_chunks)
        {
            Ok(impacts) => impacts,
            Err(message) => return invalid_scenes(message),
        };
        // The cleared records land before the files they describe: a crash between the two
        // leaves a chunk the next run re-encodes, never a record naming a missing chunk.
        for impact in &impacts {
            if let Some(condor) = &impact.condor
                && let Err(error) = videos
                    .replace_condor(&project_id, &impact.record.id, condor)
                    .await
            {
                return project_error(error);
            }
        }
        if query.clear_chunks {
            for impact in &impacts {
                if impact.invalidated.is_empty() {
                    continue;
                }
                if let Err(error) = videos
                    .remove_scene_chunk_files(
                        &impact.record.id,
                        impact.record.temp_directory.as_deref(),
                        Some(&impact.invalidated),
                    )
                    .await
                {
                    return project_error(error);
                }
            }
        }
    }
    match store.replace_config(&project_id, next).await {
        Ok(Some(config)) => Json(config).into_response(),
        Ok(None) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

pub(crate) async fn delete_project(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    // Removing the project whose encode is reading it would delete files under the worker.
    // Another project's run cannot reach these files, so it must not block the delete.
    if state.runs().config_locked_for(&project_id).await && state.projects().is_some() {
        return error_response(
            StatusCode::CONFLICT,
            ErrorCode::Locked,
            "A project cannot be deleted while an encode is running.".to_owned(),
            Some("Cancel the run, then delete the project.".to_owned()),
        );
    }
    let Some(store) = state.projects() else {
        return project_not_found(&project_id);
    };
    // Read the queue before the project directory disappears: once it is gone there is no
    // record left to address the per-video scratch directories.
    let scratch_directories = match state.videos() {
        Some(videos) => videos
            .records(&project_id)
            .await
            .map(|records| {
                records
                    .into_iter()
                    .map(|record| (record.id, record.temp_directory))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        None => Vec::new(),
    };

    match store.delete(&project_id).await {
        Ok(true) => {
            if let Some(videos) = state.videos() {
                for (video_id, temp_directory) in scratch_directories {
                    if let Err(error) = videos
                        .remove_chunks(&video_id, temp_directory.as_deref())
                        .await
                    {
                        tracing::warn!(
                            project_id,
                            video_id,
                            error = error.message(),
                            "the deleted project's chunks could not be removed"
                        );
                    }
                }
            }
            tracing::info!(project_id, "project deleted");
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(false) => project_not_found(&project_id),
        Err(error) => project_error(error),
    }
}

/// One project as a portable JSON archive: configuration, queue, overrides, and the last
/// engine checkpoint. Media and encoded chunks are excluded; importing it reconstructs the
/// queue without copying gigabytes.
pub(crate) async fn export_project(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    let Some(projects) = state.projects() else {
        return project_not_found(&project_id);
    };
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let project = match projects.get(&project_id).await {
        Ok(Some(project)) => project,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };
    let config = match projects.document(&project_id).await {
        Ok(Some(config)) => config,
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    };
    let records = match videos.records(&project_id).await {
        Ok(records) => records,
        Err(error) => return project_error(error),
    };

    let archive = ProjectArchive {
        schema_version: 1,
        exported_at: iso8601(now_epoch()),
        name: project.name,
        description: project.description,
        config,
        videos: records
            .into_iter()
            .map(|record| ProjectArchiveVideo {
                name: record.name,
                input: record.input,
                output: record.output,
                overrides: record.overrides,
                condor: record.condor,
            })
            .collect(),
    };

    let mut response = Json(archive).into_response();
    let filename = format!("av1ation-project-{}.json", project.id);
    if let Ok(value) = HeaderValue::from_str(&format!("attachment; filename=\"{filename}\"")) {
        response.headers_mut().insert(CONTENT_DISPOSITION, value);
    }
    response
}

/// The validated queue entry an archive produces before any file is written.
pub(crate) struct ImportedVideo {
    name: String,
    input: Value,
    output: Value,
    overrides: BTreeMap<String, Value>,
    condor: Option<Value>,
}

/// Import a portable project archive. Every entry is validated before the project directory
/// is created, so an invalid archive leaves no half-imported project behind.
pub(crate) async fn import_project(
    State(state): State<AppState>,
    ApiJson(archive): ApiJson<ProjectArchive>,
) -> Response {
    if archive.schema_version != 1 {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!(
                "This archive uses schema {}; this build reads schema 1.",
                archive.schema_version
            ),
            Some("Export the project from this version, or update the application.".to_owned()),
        );
    }
    if archive.videos.len() > 10_000 {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "The archive contains more than 10,000 videos.".to_owned(),
            Some("Split the project before exporting it.".to_owned()),
        );
    }

    let defaults = default_config();
    if let Err(message) = config::validate(&archive.config, &defaults) {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!("The archived configuration is not valid: {message}"),
            Some("Re-export the project from the version that created it.".to_owned()),
        );
    }
    let known: std::collections::BTreeSet<String> =
        config::leaf_paths(&defaults).into_iter().collect();
    let project_config = config::materialise(&defaults, &archive.config, &BTreeMap::new());

    let mut prepared = Vec::with_capacity(archive.videos.len());
    for (order, video) in archive.videos.iter().enumerate() {
        if av1ation_engine::media::video::parse_input(&video.input).is_err()
            || av1ation_engine::media::video::parse_output(&video.output).is_err()
        {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!(
                    "Video {} in the archive has an invalid input or output.",
                    order + 1
                ),
                Some(
                    "Re-export the project; the archive is damaged or from another build."
                        .to_owned(),
                ),
            );
        }
        if let Some(path) = video.overrides.keys().find(|path| !known.contains(*path)) {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!("Video {} overrides an unknown field `{path}`.", order + 1),
                Some("Re-export the project from a build that knows this field.".to_owned()),
            );
        }
        let candidate = config::materialise(&defaults, &archive.config, &video.overrides);
        if let Err(message) = config::validate(&candidate, &defaults) {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!("Video {} has an invalid override: {message}", order + 1),
                Some("Re-export the project after correcting the configuration.".to_owned()),
            );
        }
        if !video.condor.as_ref().is_none_or(Value::is_object) {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!(
                    "Video {} has a checkpoint that is not an object.",
                    order + 1
                ),
                Some("Re-export the project; the archive is damaged.".to_owned()),
            );
        }

        let name = video.name.trim();
        let name = if name.is_empty() {
            input_path_of(&video.input)
                .as_deref()
                .and_then(|path| std::path::Path::new(path).file_name())
                .and_then(std::ffi::OsStr::to_str)
                .unwrap_or("video")
                .to_owned()
        } else {
            name.to_owned()
        };
        if name.chars().count() > 120 {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                format!("Video {} has a name longer than 120 characters.", order + 1),
                Some("Rename the video before exporting the project.".to_owned()),
            );
        }

        prepared.push(ImportedVideo {
            name,
            input: video.input.clone(),
            output: video.output.clone(),
            overrides: video.overrides.clone(),
            condor: video.condor.clone(),
        });
    }

    let Some(projects) = state.projects() else {
        return no_storage();
    };
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let project = match projects
        .create(
            &archive.name,
            archive.description.as_deref(),
            project_config,
            GeneralDefaults::default(),
        )
        .await
    {
        Ok(project) => project,
        Err(error) => return project_error(error),
    };

    for (order, video) in prepared.into_iter().enumerate() {
        match videos
            .import(
                &project.id,
                crate::project::videos::VideoImport {
                    name: video.name,
                    input: video.input,
                    output: video.output,
                    overrides: video.overrides,
                    condor: video.condor,
                    order: order as u32,
                },
            )
            .await
        {
            Ok(Some(_)) => {}
            Ok(None) => {
                let _ = projects.delete(&project.id).await;
                return project_not_found(&project.id);
            }
            Err(error) => {
                let _ = projects.delete(&project.id).await;
                return project_error(error);
            }
        }
    }

    (StatusCode::CREATED, Json(project)).into_response()
}
