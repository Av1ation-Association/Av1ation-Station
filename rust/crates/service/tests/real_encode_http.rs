//! A real encode through the HTTP surface, ignored by default because it needs FFmpeg, an
//! AV1 encoder, and MKVToolNix on the machine.
//!
//! Run with
//! `cargo test -p av1ation-service --test real_encode_http -- --ignored`.
//!
//! This is the Phase 2 exit criterion: create a project, add a video, start an encode, watch
//! the live event stream, and find the result persisted — with the real engine behind every
//! step. The input clip is generated here; nothing is read from the repository.

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use av1ation_engine::RealRunner;
use av1ation_service::{AppState, router};
use av1ation_test_support::{Clip, Scratch};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use tokio::time::timeout;
use tower::ServiceExt;

#[allow(unused_imports)]
mod common;

use common::send;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs FFmpeg, an AV1 encoder and MKVToolNix; run with --ignored"]
async fn a_real_encode_runs_end_to_end_over_http() {
    let scratch = Scratch::new("av1ation-http-encode");
    let dir = scratch.path().to_path_buf();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(RealRunner),
        Vec::new(),
        dir.clone(),
    ));
    let source = Clip::testsrc(&dir, 320, 240, 24, 2);
    let output = dir.join("encoded.mkv");

    let (status, project) = send(
        app.clone(),
        Request::post("/api/projects")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":"Real encode"}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let project_id = project["id"].as_str().expect("project id").to_owned();

    let (status, video) = send(
        app.clone(),
        Request::post(format!("/api/projects/{project_id}/videos"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "input_path": source.path().display().to_string(),
                    "output_path": output.display().to_string()
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{video}");
    let video_id = video["id"].as_str().expect("video id").to_owned();

    // Subscribe before starting, so the first event cannot be missed.
    let response = app
        .clone()
        .oneshot(Request::get("/api/events").body(Body::empty()).unwrap())
        .await
        .expect("SSE response");
    assert_eq!(response.status(), StatusCode::OK);
    let mut events = response.into_body();

    let (status, started) = send(
        app.clone(),
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/encode"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    // A second real run is refused while the first still owns the singleton. This is the
    // server-side lock, not a disabled button.
    let (status, busy) = send(
        app.clone(),
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/encode"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{busy}");
    assert_eq!(busy["code"], "BUSY");

    let deadline = Instant::now() + Duration::from_secs(300);
    let mut terminal = None;
    let mut transcript = String::new();
    while Instant::now() < deadline {
        let Ok(frame) = timeout(Duration::from_secs(5), events.frame()).await else {
            continue;
        };
        let Some(Ok(frame)) = frame else {
            break;
        };
        let Ok(data) = frame.into_data() else {
            continue;
        };
        let text = String::from_utf8_lossy(&data);
        transcript.push_str(&text);
        for kind in ["finished", "failed", "cancelled"] {
            if text.contains(&format!("\"kind\":\"{kind}\"")) {
                terminal = Some(kind.to_owned());
            }
        }
        if terminal.is_some() {
            break;
        }
    }

    assert_eq!(
        terminal.as_deref(),
        Some("finished"),
        "the run did not finish:\n{transcript}"
    );
    assert!(output.exists(), "the concatenated output is missing");
    assert!(
        std::fs::metadata(&output).expect("output metadata").len() > 0,
        "the concatenated output is empty"
    );

    // Chunks are retained by default: they are what makes a later quality check and a
    // re-run of edited scenes possible.
    let chunks = dir.join("temp").join(&video_id);
    assert!(
        std::fs::read_dir(&chunks)
            .expect("the scenes directory exists")
            .next()
            .is_some(),
        "the encoded chunks were not retained"
    );

    let (status, state) = send(
        app.clone(),
        Request::get(format!(
            "/api/projects/{project_id}/videos/{video_id}/state"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{state}");
    assert_eq!(state["scene_count"], 1);
    assert_eq!(state["output_exists"], true);
    let sequences = state["sequences"].as_array().expect("sequences");
    for id in ["SceneDetector", "ParallelEncoder", "SceneConcatenator"] {
        let sequence = sequences
            .iter()
            .find(|sequence| sequence["id"] == id)
            .unwrap_or_else(|| panic!("{id} is missing from the derived state"));
        assert_eq!(sequence["status"], "complete", "{id}: {sequence}");
    }
    assert_eq!(
        state["next"],
        serde_json::json!([]),
        "a finished video offers nothing to run"
    );
    assert!(state["retained_bytes"].as_u64().unwrap_or(0) > 0);

    // The timeline recorded one entry per sequence attempt.
    let timeline = dir
        .join("projects")
        .join(&project_id)
        .join("videos")
        .join(&video_id)
        .join("timeline.jsonl");
    let history = std::fs::read_to_string(&timeline).expect("the timeline exists");
    let entries: Vec<Value> = history
        .lines()
        .map(|line| serde_json::from_str(line).expect("a readable timeline entry"))
        .collect();
    // Three pipeline sequences, the benchmarker the default config enables, and the run-level
    // terminal record. The benchmarker is part of a completed run even though it does not
    // encode; the null-sequence record is the durable terminal message.
    assert_eq!(entries.len(), 5, "{history}");
    assert!(
        entries
            .iter()
            .all(|entry| entry["run_id"] == run_id.as_str())
    );
    assert!(entries.iter().all(|entry| entry["outcome"] == "completed"));
    assert!(
        entries
            .iter()
            .any(|entry| entry["sequence"] == "Benchmarker"),
        "the benchmarker did not leave a timeline entry: {history}"
    );
    assert!(
        entries.iter().any(|entry| entry["sequence"].is_null()),
        "the run-level terminal record is missing: {history}"
    );
    assert!(
        entries
            .iter()
            .any(|entry| entry["frames_processed"].as_u64().is_some()
                && entry["fps"].as_f64().is_some()),
        "a timeline entry carries observed frames and FPS: {history}"
    );

    // The run's events are still replayable after it finished.
    let (status, replay) = send(
        app.clone(),
        Request::get(format!("/api/runs/{run_id}/events"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        replay
            .as_array()
            .is_some_and(|events| events.iter().any(|event| event["kind"] == "finished")),
        "{replay}"
    );

    // A second encode finds nothing left to run instead of re-encoding.
    let (status, body) = send(
        app,
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/encode"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");
}
