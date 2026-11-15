use std::{convert::Infallible, sync::Arc, time::Duration};

use av1ation_contracts::protocol::ErrorCode;
use av1ation_contracts::queue::QueueBatchRequest;
use av1ation_contracts::run::{EncodeEvent, SequenceRunRequest};
use axum::{
    Json,
    extract::{Path as AxumPath, Query, State},
    http::{HeaderMap, StatusCode},
    response::{
        IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
};
use futures_util::{Stream, StreamExt, stream};
use serde::Deserialize;
use tokio_stream::wrappers::BroadcastStream;

use super::{locked, no_storage, project_error, project_not_found, run_locked, video_not_found};
use crate::{
    api::error::error_response,
    api::json::ApiJson,
    project::config,
    project::derive,
    project::projects::default_config,
    run::{
        prepare::{self, PrepareError},
        runs::StartError,
    },
    state::AppState,
};

/// Run the encode chain, skipping the sequences that have already produced their data.
///
/// This is the CLI's root command: everything from the first incomplete sequence onwards,
/// in pipeline order, so finishing Scene Detector makes the encoder runnable in the same
/// request instead of needing a second one.
pub(crate) async fn start_encode(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    launch(&state, project_id, video_id, None).await
}

/// Run exactly one sequence, after checking that its prerequisites are complete.
pub(crate) async fn start_sequence(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(body): ApiJson<SequenceRunRequest>,
) -> Response {
    launch(&state, project_id, video_id, Some(body.sequence)).await
}

/// The one start path shared by `POST …/encode` and `POST …/run`.
///
/// `only` names a single sequence; without it the chain runs from its first incomplete
/// sequence, which is what makes `encode` the CLI's root command.
pub(crate) async fn launch(
    state: &AppState,
    project_id: String,
    video_id: String,
    only: Option<String>,
) -> Response {
    let request = match prepare::prepare(state, project_id, video_id, only).await {
        Ok(request) => request,
        Err(error) => return prepare_error(error),
    };

    match state.runs().start(request).await {
        Ok(started) => (StatusCode::ACCEPTED, Json(started)).into_response(),
        Err(StartError::Busy(run_id)) => {
            let message = busy_message(state, &run_id).await;
            error_response(
                StatusCode::CONFLICT,
                ErrorCode::Busy,
                message,
                Some("Wait for the running video to finish, or cancel it.".to_owned()),
            )
        }
        Err(StartError::Engine(message)) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::EngineFailed,
            message,
            None,
        ),
    }
}

/// Map a preparation refusal to the HTTP envelope the browser already expects.
fn prepare_error(error: PrepareError) -> Response {
    match error {
        PrepareError::StorageUnavailable => no_storage(),
        PrepareError::ProjectNotFound(project_id) => project_not_found(&project_id),
        PrepareError::VideoNotFound(video_id) => video_not_found(&video_id),
        PrepareError::Store(error) => project_error(error),
        PrepareError::InvalidConfig { message, hint } => error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            message,
            Some(hint),
        ),
        PrepareError::Locked { message } => run_locked(&message),
        PrepareError::DiskFull { message } => error_response(
            StatusCode::INSUFFICIENT_STORAGE,
            ErrorCode::DiskFull,
            message,
            Some(
                "Free space on the output and temporary volumes, or choose another temporary directory in Settings."
                    .to_owned(),
            ),
        ),
        PrepareError::Engine { message, hint } => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::EngineFailed,
            message,
            Some(hint),
        ),
    }
}

/// Explain a refused start in terms of the video that owns the singleton.
///
/// The lock spans the process, so a second project is refused even though its own
/// configuration is untouched. "An encode is already running" names nothing the user can
/// act on from the page they clicked, so the message names the project and video instead.
/// A lookup that fails only costs the detail; the refusal itself still stands.
async fn busy_message(state: &AppState, run_id: &str) -> String {
    let Some((project_id, video_id)) = state.runs().active_video().await else {
        return format!("Another encode is still running ({run_id}).");
    };
    let project = match state.projects() {
        Some(projects) => projects.get(&project_id).await.ok().flatten(),
        None => None,
    };
    let video = match state.videos() {
        Some(videos) => videos.record(&project_id, &video_id).await.ok().flatten(),
        None => None,
    };
    match (project, video) {
        (Some(project), Some(video)) => format!(
            "{} is still encoding in {}; only one encode runs at a time.",
            video.name, project.name
        ),
        (Some(project), None) => format!(
            "A video is still encoding in {}; only one encode runs at a time.",
            project.name
        ),
        _ => format!("Another encode is still running ({run_id})."),
    }
}

/// Start a queue batch: every listed video, in order, through the same singleton a single
/// run uses.
///
/// The request only names ids. The batch walks them on the service, so closing the window
/// or switching screens cannot strand half a queue, and a failure on one video continues
/// with the rest instead of leaving the batch halfway through.
pub(crate) async fn start_queue_batch(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
    ApiJson(body): ApiJson<QueueBatchRequest>,
) -> Response {
    let Some(videos) = state.videos() else {
        return no_storage();
    };
    let Some(projects) = state.projects() else {
        return project_not_found(&project_id);
    };
    match projects.document(&project_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    }

    let mut ids = Vec::with_capacity(body.video_ids.len());
    for video_id in body.video_ids {
        match videos.record(&project_id, &video_id).await {
            Ok(Some(_)) => ids.push(video_id),
            // A row removed between the click and the request is not a reason to fail the
            // whole batch; the queue it came from no longer contains it either.
            Ok(None) => {}
            Err(error) => return project_error(error),
        }
    }
    if ids.is_empty() {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "The queue has no video to run.".to_owned(),
            Some("Add a video, then start the queue again.".to_owned()),
        );
    }

    match state.runs().begin_batch(&project_id, ids).await {
        Ok(status) => {
            let task_state = state.clone();
            let task_project = project_id.clone();
            tokio::spawn(drive_batch(task_state, task_project));
            (StatusCode::ACCEPTED, Json(status)).into_response()
        }
        Err(()) => error_response(
            StatusCode::CONFLICT,
            ErrorCode::Busy,
            "An encode or another queue batch is already running.".to_owned(),
            Some("Wait for it to finish, or stop it first.".to_owned()),
        ),
    }
}

/// Walk one batch. The loop is the only owner of the sequence: `launch` reserves the
/// singleton and the wait below observes the terminal event's release.
async fn drive_batch(state: AppState, project_id: String) {
    loop {
        if state.runs().batch_stopped(&project_id) {
            break;
        }
        let Some(video_id) = state.runs().next_batch_video(&project_id) else {
            break;
        };
        let response = launch(&state, project_id.clone(), video_id, None).await;
        if response.status() != StatusCode::ACCEPTED {
            // A video that cannot start (already encoded, missing source, invalid script)
            // reports through the queue's own state; the batch continues with the rest.
            continue;
        }
        loop {
            if !state.runs().config_locked().await {
                break;
            }
            if state.runs().batch_stopped(&project_id) {
                state.runs().cancel_active().await;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
    state.runs().end_batch(&project_id);
}

/// The live batch for a project, or an inactive status when none is running.
///
/// A project that no longer exists is a 404, not an inactive batch: an empty status for a
/// stale id would make a deleted project look like a queue that had simply finished.
pub(crate) async fn get_queue_batch(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    let Some(projects) = state.projects() else {
        return no_storage();
    };
    match projects.document(&project_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return project_not_found(&project_id),
        Err(error) => return project_error(error),
    }
    Json(state.runs().batch_status(&project_id)).into_response()
}

/// Stop a batch and the run it is waiting on. The run releases the singleton itself.
pub(crate) async fn stop_queue_batch(
    State(state): State<AppState>,
    AxumPath(project_id): AxumPath<String>,
) -> Response {
    if state.runs().stop_batch(&project_id) {
        state.runs().cancel_active().await;
        return StatusCode::ACCEPTED.into_response();
    }
    error_response(
        StatusCode::NOT_FOUND,
        ErrorCode::NotFound,
        format!("No queue batch is running for project {project_id}"),
        Some("Reload the project, then try again.".to_owned()),
    )
}

/// Delete one sequence's result after the user confirms what will be lost.
///
/// The service owns the files, the engine owns the checkpoint shape, and the run lock
/// owns the timing: a reset is refused while any encode is active, then the files are
/// removed before the checkpoint is written. If deletion fails the old checkpoint is left
/// intact, so "Reset data" either happens or reports why it did not.
pub(crate) async fn reset_sequence(
    State(state): State<AppState>,
    AxumPath((project_id, video_id, sequence)): AxumPath<(String, String, String)>,
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
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => return video_not_found(&video_id),
        Err(error) => return project_error(error),
    };
    let document = config::materialise(&default_config(), &project_document, &record.overrides);
    if !derive::chain_for(&document)
        .iter()
        .any(|(id, _)| *id == sequence)
    {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!("{sequence} is not part of this video's pipeline."),
            Some("Enable its section in Configuration before resetting it.".to_owned()),
        );
    }
    let Some(condor) = record.condor.as_ref() else {
        return error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            "This sequence has not produced any data yet.".to_owned(),
            Some("Run the sequence before resetting its result.".to_owned()),
        );
    };
    let plan = match av1ation_engine::run::reset::reset_sequence(condor, &sequence) {
        Ok(plan) => plan,
        Err(message) => {
            return error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidConfig,
                message,
                Some("Run the sequence again instead of resetting it.".to_owned()),
            );
        }
    };

    let temp = record.temp_directory.as_deref();
    if plan.files.all_chunks {
        if let Err(error) = videos.remove_chunks(&video_id, temp).await {
            return project_error(error);
        }
    } else {
        if plan.files.scene_chunks
            && let Err(error) = videos.remove_scene_chunk_files(&video_id, temp, None).await
        {
            return project_error(error);
        }
        if plan.files.target_quality
            && let Err(error) = videos
                .remove_scratch_directory(&video_id, temp, "Target Quality")
                .await
        {
            return project_error(error);
        }
        if plan.files.parallel_encoder
            && let Err(error) = videos
                .remove_scratch_directory(&video_id, temp, "Parallel Encoder")
                .await
        {
            return project_error(error);
        }
        if plan.files.scene_concatenator
            && let Err(error) = videos
                .remove_scratch_directory(&video_id, temp, "Scene Concatenator")
                .await
        {
            return project_error(error);
        }
    }
    if plan.files.output {
        let output = record.output_path();
        if !output.trim().is_empty() {
            match tokio::fs::remove_file(&output).await {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        ErrorCode::Io,
                        format!("The output file {output} could not be deleted: {error}"),
                        Some("Delete it yourself, then try the reset again.".to_owned()),
                    );
                }
            }
        }
    }

    match videos
        .replace_condor(&project_id, &video_id, &plan.condor)
        .await
    {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => video_not_found(&video_id),
        Err(error) => project_error(error),
    }
}

/// Cancel the encode of one video. The lock is released by its terminal event.
pub(crate) async fn cancel_encode(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    match state.runs().cancel_video(&project_id, &video_id).await {
        Some(_) => StatusCode::ACCEPTED.into_response(),
        None => error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No encode is running for video {video_id}"),
            Some("Reload the video state, then try again.".to_owned()),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct ReplayQuery {
    since: Option<u64>,
}

/// Replay the buffered events of a run, so a reload does not have to wait for the next one.
pub(crate) async fn replay_events(
    State(state): State<AppState>,
    AxumPath(run_id): AxumPath<String>,
    Query(query): Query<ReplayQuery>,
) -> Response {
    match state.runs().replay(&run_id, query.since.unwrap_or(0)) {
        Some(events) => Json(events).into_response(),
        None => error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No buffered events for run {run_id}"),
            Some(
                "Connect to the event stream; only the current run is buffered for replay."
                    .to_owned(),
            ),
        ),
    }
}

pub(crate) async fn cancel_run(
    State(state): State<AppState>,
    AxumPath(run_id): AxumPath<String>,
) -> Response {
    if state.runs().cancel(&run_id).await {
        return StatusCode::ACCEPTED.into_response();
    }

    error_response(
        StatusCode::NOT_FOUND,
        ErrorCode::NotFound,
        format!("No active run matches {run_id}"),
        None,
    )
}

pub(crate) async fn events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ReplayQuery>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let receiver = state.runs().subscribe();
    // A fresh EventSource cannot set Last-Event-ID. The transport therefore passes the
    // cursor as `?since=` on a reconnect; the native header wins when both are present.
    let since = headers
        .get("last-event-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .or(query.since);
    let replay = since
        .and_then(|since| state.runs().replay_latest(since))
        .unwrap_or_default();
    let cursor = Arc::new(std::sync::Mutex::new((
        replay.last().map(|event| event.run_id.clone()),
        replay.last().map(|event| event.seq),
    )));
    let replayed = stream::iter(replay.into_iter().map(|event| Ok(sse_event(event))));
    // The receiver was subscribed before the replay snapshot, so an event can appear in
    // both. Sequence ids are monotonic within a run, so filtering by the last replayed id
    // removes the duplicate without dropping anything newer.
    let live = BroadcastStream::new(receiver).filter_map(move |message| {
        let cursor = Arc::clone(&cursor);
        async move {
            let event = message.ok()?;
            let mut cursor = cursor
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let duplicate = cursor.0.as_deref() == Some(event.run_id.as_str())
                && cursor.1.is_some_and(|seq| event.seq <= seq);
            if duplicate {
                return None;
            }
            *cursor = (Some(event.run_id.clone()), Some(event.seq));
            Some(Ok(sse_event(event)))
        }
    });
    Sse::new(replayed.chain(live)).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

fn sse_event(event: EncodeEvent) -> Event {
    let seq = event.seq;
    let data = serde_json::to_string(&event).unwrap_or_default();
    Event::default()
        .id(seq.to_string())
        .event("encode")
        .data(data)
}
