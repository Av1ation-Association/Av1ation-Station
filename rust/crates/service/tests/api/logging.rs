//! HTTP tests for the `logging` route family.

use crate::common::*;

#[tokio::test]
async fn a_run_log_pages_while_the_run_is_live_and_exports_anonymised_text() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Logs").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, started) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    // The fake runner publishes `started` immediately; wait for that event to be written
    // rather than sleeping.
    let deadline = Instant::now() + Duration::from_secs(2);
    let page = loop {
        let (status, page) = send(
            app.clone(),
            Request::get(format!("/api/runs/{run_id}/logs"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{page}");
        if page["total"].as_u64().unwrap_or(0) > 0 {
            break page;
        }
        assert!(Instant::now() < deadline, "the run log stayed empty");
        tokio::task::yield_now().await;
    };
    let record = &page["records"][0];
    assert_eq!(record["scope"], "run");
    assert_eq!(record["run_id"], run_id.as_str());
    assert_eq!(record["video_id"], video_id.as_str());
    assert_eq!(record["project_id"], id.as_str());
    assert!(
        record["message"]
            .as_str()
            .is_some_and(|message| message.contains("Fake encode started")),
        "{page}"
    );

    let (status, export) = send(
        app.clone(),
        Request::post(format!("/api/runs/{run_id}/logs/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{export}");
    assert!(
        export["text"]
            .as_str()
            .is_some_and(|text| text.contains("Fake encode started")),
        "{export}"
    );

    // The run selector is built from the log directories, joined to the timeline's outcome.
    let (status, runs) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/runs"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{runs}");
    assert_eq!(runs.as_array().map(Vec::len), Some(1), "{runs}");
    assert_eq!(runs[0]["run_id"], run_id.as_str());
    assert!(
        matches!(runs[0]["outcome"].as_str(), Some("running" | "completed")),
        "a live or finished fake run is reported: {runs}"
    );

    let (status, tail) = send(
        app.clone(),
        Request::get(format!("/api/runs/{run_id}/logs?tail=true&limit=1"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{tail}");
    assert_eq!(tail["records"].as_array().map(Vec::len), Some(1), "{tail}");
    assert!(tail["next_offset"].is_null(), "the tail is the end");

    let (status, filtered) = send(
        app.clone(),
        Request::get(format!("/api/runs/{run_id}/logs?level=error"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{filtered}");
    assert_eq!(filtered["total"].as_u64(), Some(0), "{filtered}");

    let (status, _) = send(
        app.clone(),
        Request::get(format!("/api/runs/{run_id}/logs?level=verbose"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/runs/{run_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);

    // The terminal record is appended after the terminal event; poll the derived list rather
    // than assuming the event loop has already written it.
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, runs) = send(
            app.clone(),
            Request::get(format!("/api/projects/{id}/videos/{video_id}/runs"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{runs}");
        if runs[0]["outcome"] == "cancelled" {
            assert!(runs[0]["ended_at"].is_string(), "{runs}");
            break;
        }
        assert!(
            Instant::now() < deadline,
            "the run never recorded its outcome"
        );
        tokio::task::yield_now().await;
    }

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_run_log_is_deleted_only_once_its_run_has_stopped() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Delete log").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, started) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    // The fake runner holds until cancelled, so the writer is live for this request.
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, page) = send(
            app.clone(),
            Request::get(format!("/api/runs/{run_id}/logs"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{page}");
        if page["total"].as_u64().unwrap_or(0) > 0 {
            break;
        }
        assert!(Instant::now() < deadline, "the run log stayed empty");
        tokio::task::yield_now().await;
    }

    let delete = |app: Router| {
        let run_id = run_id.clone();
        async move {
            send(
                app,
                Request::delete(format!("/api/runs/{run_id}/logs"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
        }
    };
    let (status, body) = delete(app.clone()).await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "a live log is not deleted: {body}"
    );
    assert_eq!(body["code"], "BUSY");

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/runs/{run_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    // The terminal record and the release of the stage are written by the event thread after
    // the cancel returns, so retry the delete instead of assuming that ordering.
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, body) = delete(app.clone()).await;
        if status == StatusCode::NO_CONTENT {
            break;
        }
        assert_eq!(status, StatusCode::CONFLICT, "{body}");
        assert!(
            Instant::now() < deadline,
            "the cancelled run never released its log"
        );
        tokio::task::yield_now().await;
    }

    let (status, body) = send(
        app.clone(),
        Request::get(format!("/api/runs/{run_id}/logs"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    assert_eq!(body["code"], "NOT_FOUND");

    // The directory is what lists a run, so deleting the log removes it from the selector
    // while the timeline keeps the video's history.
    let (status, runs) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/runs"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{runs}");
    assert_eq!(runs, serde_json::json!([]), "{runs}");

    let (status, _) = delete(app.clone()).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "a second delete reports the same miss as an unknown run"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// History deletes a run, which is the timeline record and the log together. Removing only
/// the log left the card mounted with no action, which is what a reader reported as a
/// broken delete.
#[tokio::test]
async fn deleting_a_run_removes_its_history_and_its_log() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Delete run").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, started) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, page) = send(
            app.clone(),
            Request::get(format!("/api/runs/{run_id}/logs"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{page}");
        if page["total"].as_u64().unwrap_or(0) > 0 {
            break;
        }
        assert!(Instant::now() < deadline, "the run log stayed empty");
        tokio::task::yield_now().await;
    }

    let route = format!("/api/projects/{id}/videos/{video_id}/runs/{run_id}");
    let delete = |app: Router| {
        let route = route.clone();
        async move { send(app, Request::delete(route).body(Body::empty()).unwrap()).await }
    };
    let (status, body) = delete(app.clone()).await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "a live run is not deleted: {body}"
    );

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/runs/{run_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, body) = delete(app.clone()).await;
        if status == StatusCode::NO_CONTENT {
            break;
        }
        assert_eq!(status, StatusCode::CONFLICT, "{body}");
        assert!(
            Instant::now() < deadline,
            "the cancelled run never released its history"
        );
        tokio::task::yield_now().await;
    }

    let (status, body) = send(
        app.clone(),
        Request::get(format!("/api/runs/{run_id}/logs"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, history) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/history"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{history}");
    assert!(
        history["entries"].as_array().is_some_and(|entries| entries
            .iter()
            .all(|entry| entry["run_id"] != run_id.as_str())),
        "the deleted run is not in History: {history}"
    );

    let (status, _) = delete(app.clone()).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "a second delete misses");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// The run selector resolves its video first. A stale address is a 404, not a video that
/// happens to have no recorded runs.
#[tokio::test]
async fn an_unknown_video_has_no_runs() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Missing runs").await;
    let missing = uuid::Uuid::new_v4().to_string();

    let (status, body) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{missing}/runs"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    assert_eq!(body["code"], "NOT_FOUND", "{body}");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// An export for a run that has no log reports the missing log rather than an empty file.
#[tokio::test]
async fn exporting_an_unknown_run_log_is_not_found() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let (status, body) = send(
        app,
        Request::post("/api/runs/not-a-run/logs/export")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    let _ = std::fs::remove_dir_all(dir);
}
