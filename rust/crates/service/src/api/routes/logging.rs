use std::collections::HashMap;

use av1ation_contracts::platform::LogExport;
use av1ation_contracts::protocol::ErrorCode;
use av1ation_contracts::run::{RunOutcome, RunSummary};
use axum::{
    Json,
    extract::{Path as AxumPath, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;

use super::{no_storage, project_error, video_not_found};
use crate::{
    api::error::error_response,
    run::anonymise,
    run::logs::{LogFilter, LogSort},
    run::timeline::TimelineEntry,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub(crate) struct LogQuery {
    offset: Option<u64>,
    limit: Option<usize>,
    /// Read the last page instead of one at `offset`; how the viewer opens a long log.
    tail: Option<bool>,
    /// A comma-separated set of `info`, `warn`, and `error`; absent means every level.
    level: Option<String>,
    /// Case-insensitive substring of the message or sequence name.
    q: Option<String>,
    /// `seq` (default), `time`, `level`, `sequence`, or `message`.
    sort: Option<String>,
    /// `asc` (default) or `desc`.
    dir: Option<String>,
}

/// One page of a run's log, for the viewer.
pub(crate) async fn run_logs(
    State(state): State<AppState>,
    AxumPath(run_id): AxumPath<String>,
    Query(query): Query<LogQuery>,
) -> Response {
    let Some(logs) = state.logs() else {
        return no_storage();
    };
    let limit = query.limit.unwrap_or(200).clamp(1, 1000);
    let level_values: Vec<String> = query
        .level
        .as_deref()
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|level| !level.is_empty())
        .map(str::to_owned)
        .collect();
    if let Some(level) = level_values.iter().find(|level| {
        !matches!(
            level.as_str(),
            "trace" | "debug" | "info" | "warn" | "error"
        )
    }) {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            format!("Unknown log level {level}."),
            Some("Use trace, debug, info, warn, or error, or leave the filter empty.".to_owned()),
        );
    }
    let sort = match LogSort::parse(query.sort.as_deref().unwrap_or_default()) {
        Some(sort) => sort,
        None => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                format!(
                    "Unknown log sort {}.",
                    query.sort.as_deref().unwrap_or_default()
                ),
                Some("Sort by seq, time, level, sequence, or message.".to_owned()),
            );
        }
    };
    let descending = match query.dir.as_deref().unwrap_or("asc") {
        "asc" => false,
        "desc" => true,
        other => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                format!("Unknown log direction {other}."),
                Some("Use asc or desc.".to_owned()),
            );
        }
    };
    // A search is a local convenience, not a query language; a pathological needle would
    // only make the viewer slower.
    let search: Option<String> = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| text.chars().take(200).collect());
    let levels: Vec<&str> = level_values.iter().map(String::as_str).collect();
    let filter = LogFilter {
        levels: (!levels.is_empty()).then_some(levels.as_slice()),
        query: search.as_deref(),
    };
    let offset = if query.tail.unwrap_or(false) {
        None
    } else {
        Some(query.offset.unwrap_or(0))
    };
    match logs
        .page(&run_id, offset, limit, filter, sort, descending)
        .await
    {
        Ok(Some(page)) => Json(page).into_response(),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No log exists for run {run_id}"),
            Some("The log is written when the run starts; check the run id.".to_owned()),
        ),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            "The run log could not be read.".to_owned(),
            Some(error.to_string()),
        ),
    }
}

/// Delete one run's log.
///
/// A live run still appends to its log, so it is refused rather than racing the writer.
/// History is unaffected: the timeline record of the run is what the History screen shows,
/// and the log is only one of its artefacts. Deleting is therefore not cancellation.
pub(crate) async fn delete_run_log(
    State(state): State<AppState>,
    AxumPath(run_id): AxumPath<String>,
) -> Response {
    let Some(logs) = state.logs() else {
        return no_storage();
    };
    if state
        .runs()
        .stage()
        .is_some_and(|stage| stage.run_id == run_id)
    {
        return error_response(
            StatusCode::CONFLICT,
            ErrorCode::Busy,
            "This run is still writing its log.".to_owned(),
            Some("Stop the run, or wait for it to finish, then delete the log.".to_owned()),
        );
    }
    match logs.remove(&run_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No log exists for run {run_id}"),
            Some("The log may already have been deleted.".to_owned()),
        ),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            "The run log could not be deleted.".to_owned(),
            Some(error.to_string()),
        ),
    }
}

/// Delete one run: its history entries and its log, as one action.
///
/// History lists runs, not logs, so its delete has to remove the record it shows. Deleting
/// only the log would leave the card with no icon and no way to finish the job, which is
/// exactly the state a reader reads as "delete does not work". The log viewer keeps its own
/// log-only delete: there the run is still history worth keeping.
///
/// A live run is refused for the same reason its log is: the writer would append to a file
/// the request is removing.
pub(crate) async fn delete_video_run(
    State(state): State<AppState>,
    AxumPath((project_id, video_id, run_id)): AxumPath<(String, String, String)>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    // Resolving the video validates both path segments before either store joins them into
    // a path, and refuses a run on a video that is not there.
    match videos.record(&project_id, &video_id).await {
        Ok(Some(_)) => {}
        Ok(None) => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("No video {video_id} exists in this project"),
                Some("It may already have been removed from the queue.".to_owned()),
            );
        }
        Err(error) => return super::project_error(error),
    }
    if state
        .runs()
        .stage()
        .is_some_and(|stage| stage.run_id == run_id)
    {
        return error_response(
            StatusCode::CONFLICT,
            ErrorCode::Busy,
            "This run is still going.".to_owned(),
            Some("Stop the run, or wait for it to finish, then delete it.".to_owned()),
        );
    }
    let mut removed = false;
    if let Some(timeline) = state.timeline() {
        match timeline.remove_run(&project_id, &video_id, &run_id).await {
            Ok(did) => removed = did,
            Err(error) => {
                return error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorCode::Io,
                    "The run could not be removed from the history.".to_owned(),
                    Some(error.to_string()),
                );
            }
        }
    }
    if let Some(logs) = state.logs() {
        match logs.remove(&run_id).await {
            Ok(did) => removed = removed || did,
            Err(error) => {
                return error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorCode::Io,
                    "The run's log could not be deleted.".to_owned(),
                    Some(error.to_string()),
                );
            }
        }
    }
    if removed {
        StatusCode::NO_CONTENT.into_response()
    } else {
        error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No history or log exists for run {run_id}"),
            Some("It may already have been deleted.".to_owned()),
        )
    }
}

/// Every run of one video that has a log, newest first.
///
/// The outcome joins two stores that answer different questions: the log directory says a
/// run can be opened, and the timeline's run-level record says how it ended. A run without
/// that record is live when it still owns the encode lock, and otherwise predates the
/// record.
pub(crate) async fn video_runs(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    // The log store answers an empty list for any id. Resolve the video first so a stale
    // selector address is a 404 rather than a video that appears to have no runs.
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    match videos.record(&project_id, &video_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    }
    let Some(logs) = state.logs() else {
        return no_storage();
    };
    let metas = match logs.runs(&project_id, &video_id).await {
        Ok(metas) => metas,
        Err(error) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                "The run logs could not be listed.".to_owned(),
                Some(error.to_string()),
            );
        }
    };
    if metas.is_empty() {
        return Json(Vec::<RunSummary>::new()).into_response();
    }
    let active = state.runs().active_video().await == Some((project_id.clone(), video_id.clone()));
    let live_run = state
        .runs()
        .stage()
        .map(|stage| stage.run_id)
        .filter(|_| active)
        .or_else(|| active.then(|| metas[0].run_id.clone()));
    let entries = match state.timeline() {
        Some(timeline) => timeline.read(&project_id, &video_id).await,
        None => Vec::new(),
    };
    // The first terminal record is the run's outcome. New runs write exactly one; an older
    // log may contain both the `Cancelled` and `Finished` records, and the cancellation is
    // the truthful one.
    let mut terminals: HashMap<&str, &TimelineEntry> = HashMap::new();
    for entry in &entries {
        if entry.sequence.is_none() {
            terminals.entry(entry.run_id.as_str()).or_insert(entry);
        }
    }

    let runs = metas
        .into_iter()
        .map(|meta| {
            let terminal = terminals.get(meta.run_id.as_str()).copied();
            let outcome = match terminal.map(|entry| entry.outcome.as_str()) {
                Some("completed") => RunOutcome::Completed,
                Some("cancelled") => RunOutcome::Cancelled,
                Some("failed") => RunOutcome::Failed,
                Some(_) => RunOutcome::Unknown,
                None if live_run.as_deref() == Some(meta.run_id.as_str()) => RunOutcome::Running,
                None => RunOutcome::Unknown,
            };
            RunSummary {
                run_id: meta.run_id,
                started_at: meta.started_at,
                ended_at: terminal.map(|entry| entry.ended_at.clone()),
                outcome,
                message: terminal.and_then(|entry| entry.message.clone()),
            }
        })
        .collect::<Vec<_>>();
    Json(runs).into_response()
}

/// The anonymised export, returned as a preview. The user saves exactly what this returns.
pub(crate) async fn export_logs(
    State(state): State<AppState>,
    AxumPath(run_id): AxumPath<String>,
) -> Response {
    let Some(logs) = state.logs() else {
        return no_storage();
    };
    match logs.export_text(&run_id).await {
        Ok(Some(text)) => Json::<LogExport>(anonymise::anonymise(&text)).into_response(),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No log exists for run {run_id}"),
            Some("The log is written when the run starts; check the run id.".to_owned()),
        ),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            "The run log could not be read.".to_owned(),
            Some(error.to_string()),
        ),
    }
}
