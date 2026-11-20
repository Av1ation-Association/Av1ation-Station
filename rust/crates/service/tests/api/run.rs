//! HTTP tests for the `run` route family.

use crate::common::*;

#[tokio::test]
async fn a_second_encode_is_rejected_and_config_is_locked() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Runner").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], "BUSY");
    // The refusal names the video that owns the singleton, so a start from another project
    // says what to wait for instead of naming a run id the page cannot show.
    assert_eq!(
        body["message"],
        "source.mkv is still encoding in Runner; only one encode runs at a time."
    );

    let (status, body) = send(app.clone(), config_request(&project_id)).await;
    assert_eq!(status, StatusCode::LOCKED);
    assert_eq!(body["code"], "LOCKED");

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn a_queue_batch_reports_active_work_and_refuses_a_second_batch() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Batch").await;
    let first = add_video(app.clone(), &project_id, &dir).await;
    let second = add_video(app.clone(), &project_id, &dir).await;

    let start = Request::post(format!("/api/projects/{project_id}/queue"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "video_ids": [first.clone(), second.clone()] }).to_string(),
        ))
        .unwrap();
    let (status, body) = send(app.clone(), start).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    assert_eq!(body["active"], true);
    assert_eq!(body["total"], 2);
    assert_eq!(
        body["current_video_id"].as_str(),
        None,
        "the batch has not taken its first video yet"
    );

    // The queue drives the same singleton an explicit run does, so a second batch is
    // refused exactly as a second encode is.
    let again = Request::post(format!("/api/projects/{project_id}/queue"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "video_ids": [first, second] }).to_string(),
        ))
        .unwrap();
    let (status, _) = send(app.clone(), again).await;
    assert_eq!(status, StatusCode::CONFLICT);

    let stop = Request::delete(format!("/api/projects/{project_id}/queue"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, stop).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A shipped fork without a path writes `executable: null`, exactly like its base encoder,
/// alongside the project editor's hidden marker. Preparation must still fill the base
/// provider before the engine sees the document.
#[tokio::test]
async fn a_pathless_fork_with_a_marker_resolves_the_base_provider_before_a_run() {
    let dir = project_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .expect("data directory");
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({
            "custom_tools": [{
                "kind": "svt-av1",
                "path": "C:/tools/SvtAv1EncApp.exe"
            }]
        })
        .to_string(),
    )
    .await
    .expect("settings document");

    let recorded = Arc::new(Mutex::new(None));
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(EncoderRecordingRunner {
            encoder: Arc::clone(&recorded),
        }),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Pathless fork").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, encoders) = send(
        app.clone(),
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let fork = encoders
        .as_array()
        .expect("encoder catalogue")
        .iter()
        .find(|encoder| encoder["id"] == "fork:svt-av1-essential")
        .expect("the shipped fork is offered");
    // The document a pathless fork selection writes: its own defaults, no executable path,
    // and the hidden marker the project editor uses to keep the fork selected.
    let mut encoder = fork["default"].clone();
    encoder["SVTAV1"]["executable"] = Value::Null;
    encoder["SVTAV1"]["options"]["__av1ation_fork_fork:svt-av1-essential"] =
        serde_json::json!({"Bool": {"prefix": "--", "value": false}});
    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/config"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "encoder": encoder }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let encoder = recorded
        .lock()
        .expect("the encoder record")
        .clone()
        .expect("preparation handed the runner an encoder");
    assert_eq!(
        encoder["SVTAV1"]["executable"], "C:/tools/SvtAv1EncApp.exe",
        "preparation must resolve the base provider, not pass null to the engine"
    );

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    cleanup_after_writers(&dir);
}

/// A build located after the project selected it is the build the run uses, even though the
/// saved document still carries `executable: null` and the marker that kept it selected.
#[tokio::test]
async fn a_located_fork_supplies_the_executable_for_a_pathless_document() {
    let dir = project_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .expect("data directory");
    let executable = dir.join("SvtAv1EncApp-essential.exe");
    tokio::fs::write(&executable, b"fixture")
        .await
        .expect("fake build");
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({
            "custom_tools": [{
                "kind": "svt-av1",
                "path": "C:/tools/SvtAv1EncApp.exe"
            }],
            "encoder_forks": [{
                "id": "svt-av1-essential",
                "label": "SVT-AV1-Essential",
                "base": "svt-av1",
                "executable": executable.display().to_string()
            }]
        })
        .to_string(),
    )
    .await
    .expect("settings document");

    let recorded = Arc::new(Mutex::new(None));
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(EncoderRecordingRunner {
            encoder: Arc::clone(&recorded),
        }),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Located fork").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, encoders) = send(
        app.clone(),
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let fork = encoders
        .as_array()
        .expect("encoder catalogue")
        .iter()
        .find(|encoder| encoder["id"] == "fork:svt-av1-essential")
        .expect("the shipped fork is offered");
    let mut encoder = fork["default"].clone();
    encoder["SVTAV1"]["executable"] = Value::Null;
    encoder["SVTAV1"]["options"]["__av1ation_fork_fork:svt-av1-essential"] =
        serde_json::json!({"Bool": {"prefix": "--", "value": false}});
    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/config"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "encoder": encoder }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let encoder = recorded
        .lock()
        .expect("the encoder record")
        .clone()
        .expect("preparation handed the runner an encoder");
    assert_eq!(
        encoder["SVTAV1"]["executable"],
        executable.display().to_string(),
        "preparation must use the located build, not the base provider"
    );

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    cleanup_after_writers(&dir);
}

/// A build that was located when the project selected it, then moved on disk, must not be
/// run from the path the project remembers. Preparation resolves the saved record's current
/// path, and falls back to the base provider once that path no longer exists.
#[tokio::test]
async fn a_fork_path_that_moves_falls_back_to_the_base_provider() {
    let dir = project_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .expect("data directory");
    let executable = dir.join("SvtAv1EncApp-essential.exe");
    tokio::fs::write(&executable, b"fixture")
        .await
        .expect("fake build");
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({
            "custom_tools": [{
                "kind": "svt-av1",
                "path": "C:/tools/SvtAv1EncApp.exe"
            }],
            "encoder_forks": [{
                "id": "svt-av1-essential",
                "label": "SVT-AV1-Essential",
                "base": "svt-av1",
                "executable": executable.display().to_string()
            }]
        })
        .to_string(),
    )
    .await
    .expect("settings document");

    let recorded = Arc::new(Mutex::new(None));
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(EncoderRecordingRunner {
            encoder: Arc::clone(&recorded),
        }),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Moved fork").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, encoders) = send(
        app.clone(),
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let fork = encoders
        .as_array()
        .expect("encoder catalogue")
        .iter()
        .find(|encoder| encoder["id"] == "fork:svt-av1-essential")
        .expect("the shipped fork is offered");
    // The project selected the build while it was pathless, so its document carries the
    // marker rather than the path.
    let mut encoder = fork["default"].clone();
    encoder["SVTAV1"]["executable"] = Value::Null;
    encoder["SVTAV1"]["options"]["__av1ation_fork_fork:svt-av1-essential"] =
        serde_json::json!({"Bool": {"prefix": "--", "value": false}});
    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/config"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "encoder": encoder }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // While the saved path exists, the project runs that build even though its document is
    // pathless.
    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();
    let encoder = recorded
        .lock()
        .expect("the encoder record")
        .clone()
        .expect("preparation handed the runner an encoder");
    assert_eq!(
        encoder["SVTAV1"]["executable"],
        executable.display().to_string()
    );
    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_for_config_write(app.clone(), &project_id).await;

    // The build is moved without re-locating it in Settings: the record's path is now stale,
    // so preparation must use the base provider rather than hand the engine a dead path.
    std::fs::rename(&executable, dir.join("SvtAv1EncApp-essential-moved.exe"))
        .expect("move the build");
    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();
    let encoder = recorded
        .lock()
        .expect("the encoder record")
        .clone()
        .expect("preparation handed the runner an encoder");
    assert_eq!(
        encoder["SVTAV1"]["executable"], "C:/tools/SvtAv1EncApp.exe",
        "a saved path that no longer exists must fall back to the base provider"
    );

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    cleanup_after_writers(&dir);
}

/// Resetting a shipped fork forgets its saved path. A project that selected the build while
/// it was pathless keeps the marker, so preparation must resolve the base provider again
/// instead of failing on the cleared row.
#[tokio::test]
async fn a_reset_shipped_fork_falls_back_to_the_base_provider() {
    let dir = project_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .expect("data directory");
    let executable = dir.join("SvtAv1EncApp-essential.exe");
    tokio::fs::write(&executable, b"fixture")
        .await
        .expect("fake build");
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({
            "custom_tools": [{
                "kind": "svt-av1",
                "path": "C:/tools/SvtAv1EncApp.exe"
            }],
            "encoder_forks": [{
                "id": "svt-av1-essential",
                "label": "SVT-AV1-Essential",
                "base": "svt-av1",
                "executable": executable.display().to_string()
            }]
        })
        .to_string(),
    )
    .await
    .expect("settings document");

    let recorded = Arc::new(Mutex::new(None));
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(EncoderRecordingRunner {
            encoder: Arc::clone(&recorded),
        }),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Reset fork").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, encoders) = send(
        app.clone(),
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let fork = encoders
        .as_array()
        .expect("encoder catalogue")
        .iter()
        .find(|encoder| encoder["id"] == "fork:svt-av1-essential")
        .expect("the shipped fork is offered");
    let mut encoder = fork["default"].clone();
    encoder["SVTAV1"]["executable"] = Value::Null;
    encoder["SVTAV1"]["options"]["__av1ation_fork_fork:svt-av1-essential"] =
        serde_json::json!({"Bool": {"prefix": "--", "value": false}});
    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/config"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "encoder": encoder }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // The Settings screen resets a shipped row with this route; it forgets the path and
    // leaves the shipped table in place.
    let (status, body) = send(
        app.clone(),
        Request::put("/api/encoders/forks/svt-av1-essential")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"clear_executable":true}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["executable"], "",
        "a reset forgets the saved executable"
    );

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let encoder = recorded
        .lock()
        .expect("the encoder record")
        .clone()
        .expect("preparation handed the runner an encoder");
    assert_eq!(
        encoder["SVTAV1"]["executable"], "C:/tools/SvtAv1EncApp.exe",
        "a reset build resolves on PATH, so preparation must use the base provider"
    );

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn a_queue_batch_without_a_video_is_unprocessable() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Empty").await;

    let start = Request::post(format!("/api/projects/{project_id}/queue"))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"video_ids":[]}"#))
        .unwrap();
    let (status, body) = send(app, start).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_start_reads_only_the_scripts_the_requested_sequence_will_open() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Scripts").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;
    let missing = dir.join("missing.vpy");
    let script = serde_json::json!({
        "VapourSynthScript": {
            "source": { "Path": missing.display().to_string() },
            "variables": {},
            "index": 0,
            "filters": [],
            "stream_concurrently": true
        }
    });

    // An override for a sequence that is not in this request is not read, so Scene
    // Detector still starts with Parallel Encoder pointing at an unreadable script.
    let overrides = Request::put(format!(
        "/api/projects/{project_id}/videos/{video_id}/overrides"
    ))
    .header("content-type", "application/json")
    .body(Body::from(
        serde_json::json!({
            "fields": { "sequences.parallel_encoder.input": script.clone() }
        })
        .to_string(),
    ))
    .unwrap();
    let (status, _) = send(app.clone(), overrides).await;
    assert_eq!(status, StatusCode::OK);

    let run = Request::post(format!("/api/projects/{project_id}/videos/{video_id}/run"))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"sequence":"SceneDetector"}"#))
        .unwrap();
    let (status, body) = send(app.clone(), run).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();
    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let _ = send(app.clone(), cancel).await;
    wait_for_config_write(app.clone(), &project_id).await;

    // The same request now names the sequence that owns that override, so the unreadable
    // script is read before the singleton is reserved.
    let overrides = Request::put(format!(
        "/api/projects/{project_id}/videos/{video_id}/overrides"
    ))
    .header("content-type", "application/json")
    .body(Body::from(
        serde_json::json!({
            "fields": { "sequences.scene_detector.input": script }
        })
        .to_string(),
    ))
    .unwrap();
    let (status, _) = send(app.clone(), overrides).await;
    assert_eq!(status, StatusCode::OK);

    let run = Request::post(format!("/api/projects/{project_id}/videos/{video_id}/run"))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"sequence":"SceneDetector"}"#))
        .unwrap();
    let (status, body) = send(app, run).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("could not be read")),
        "{body}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn cancelling_a_run_releases_the_singleton() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Runner").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    // The lock is released by the terminal event, not by the 202 response.
    wait_for_config_write(app.clone(), &project_id).await;
    let next_id = wait_for_start(app.clone(), &project_id, &video_id).await;

    let cancel = Request::delete(format!("/api/runs/{next_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    cleanup_after_writers(&dir);
}

/// The first measurements of a noise run are gone from the event stream by the time a page
/// mounts, and the sequence checkpoints them only when it ends. A scene-table read during
/// the run must therefore carry the values the run has already reported.
#[tokio::test]
async fn a_scene_read_during_a_noise_run_contains_the_earlier_measurements() {
    let dir = project_dir();
    let (release, hold) = std::sync::mpsc::channel();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(LiveNoiseRunner {
            release: std::sync::Mutex::new(Some(hold)),
        }),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Live noise").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    // One detected scene that has not been measured: the table a page opened mid-run reads.
    let document = dir
        .join("projects")
        .join(&project_id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("the video document"))
            .expect("video json");
    let encoder = av1ation_engine::default_project_config()["encoder"].clone();
    let mut scene = saved_scene(encoder);
    scene["sequence_data"]["noise_detection"] = Value::Null;
    record["condor"] = serde_json::json!({ "scenes": [scene] });
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");

    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, list) = send(
            app.clone(),
            Request::get(format!(
                "/api/projects/{project_id}/videos/{video_id}/scenes"
            ))
            .body(Body::empty())
            .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{list}");
        if list["scenes"][0]["noise"].as_f64() == Some(0.0032) {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "the measurement never reached the scene table: {list}"
        );
        tokio::task::yield_now().await;
    }

    drop(release);
    wait_for_config_write(app, &project_id).await;
    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn cancelling_a_run_keeps_the_scenes_already_checkpointed_until_reset() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(CheckpointingRunner),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Checkpoint").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let (status, state) = send(
        app.clone(),
        Request::get(format!(
            "/api/projects/{project_id}/videos/{video_id}/state"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(state["scene_count"], 2, "the checkpoint was persisted");

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/runs/{run_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_for_config_write(app.clone(), &project_id).await;

    let (status, state) = send(
        app.clone(),
        Request::get(format!(
            "/api/projects/{project_id}/videos/{video_id}/state"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        state["scene_count"], 2,
        "cancelling must not discard detected scenes"
    );
    assert_eq!(state["sequences"][0]["status"], "complete");

    let (status, body) = send(
        app.clone(),
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/sequences/SceneDetector/reset"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (status, state) = send(
        app,
        Request::get(format!(
            "/api/projects/{project_id}/videos/{video_id}/state"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        state["scene_count"], 0,
        "a reset removes the detected scene table"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_run_that_fails_before_any_sequence_reports_its_reason() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FailingRunner),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Failure").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, started) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    // The terminal event releases the lock before the forwarder finishes, so the state is
    // polled rather than assumed to contain the timeline record on the first read.
    let deadline = Instant::now() + Duration::from_secs(2);
    let state = loop {
        let (status, state) = send(
            app.clone(),
            Request::get(format!(
                "/api/projects/{project_id}/videos/{video_id}/state"
            ))
            .body(Body::empty())
            .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        if state["failure"].is_object() {
            break state;
        }
        assert!(
            Instant::now() < deadline,
            "the failed run was never reported: {state}"
        );
        tokio::task::yield_now().await;
    };

    assert_eq!(
        state["failure"]["message"],
        "the input could not be opened: no such file"
    );
    assert_eq!(
        state["failure"]["run_id"].as_str(),
        Some(run_id.as_str()),
        "the reason names the failed run"
    );
    assert!(
        state["failure"].get("sequence").is_some_and(Value::is_null),
        "a failure before the first sequence serializes an explicit null"
    );
    assert_eq!(
        state["sequences"][0]["status"], "never_run",
        "a failure before the first sequence does not invent a failed sequence"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_closed_event_stream_releases_the_singleton() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(SilentRunner),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Silent").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, started) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    // The watchdog releases the singleton; the event bridge also leaves a terminal record,
    // so the silence is explainable after the process is healthy again.
    wait_for_start(app.clone(), &project_id, &video_id).await;
    let (status, history) = send(
        app,
        Request::get(format!(
            "/api/projects/{project_id}/videos/{video_id}/history"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{history}");
    let entry = history["entries"]
        .as_array()
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| entry["run_id"] == run_id.as_str())
        })
        .expect("the silent run has a terminal record");
    assert_eq!(entry["outcome"], "failed");
    assert_eq!(entry["message"], "The run ended without a terminal event.");

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn an_engine_panic_leaves_a_terminal_message_log_and_partial_output() {
    let dir = project_dir();
    let message = "thread 'worker' panicked at engine/src/run/runner/mod.rs:1:1:\nthe engine worker lost its state";
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(CrashingRunner {
            message,
            sequence: "ParallelEncoder",
        }),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Panic").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, started) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    wait_for_config_write(app.clone(), &project_id).await;
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
    assert_eq!(state["failure"]["message"], message);
    assert_eq!(state["failure"]["sequence"], "ParallelEncoder");
    assert_eq!(
        std::fs::read(dir.join("output.mkv")).expect("partial output"),
        b"partial"
    );

    let (status, export) = send(
        app.clone(),
        Request::post(format!("/api/runs/{run_id}/logs/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{export}");
    let text = export["text"].as_str().expect("log text");
    assert!(text.contains("panicked"), "{text}");
    assert!(text.contains("lost its state"), "{text}");

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn a_mid_write_disk_full_keeps_the_partial_file_and_releases_the_lock() {
    let dir = project_dir();
    let message = "No space left on device (os error 28)";
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(CrashingRunner {
            message,
            sequence: "ParallelEncoder",
        }),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Disk full").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, _) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    wait_for_config_write(app.clone(), &project_id).await;
    let (status, state) = send(
        app,
        Request::get(format!(
            "/api/projects/{project_id}/videos/{video_id}/state"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{state}");
    assert_eq!(state["failure"]["message"], message);
    assert_eq!(
        std::fs::read(dir.join("output.mkv")).expect("partial output"),
        b"partial",
        "a failed write must not delete what reached the disk"
    );

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn unknown_run_cannot_be_cancelled() {
    let app = router(AppState::new(None));
    let request = Request::delete("/api/runs/missing")
        .body(Body::empty())
        .unwrap();
    let (status, body) = send(app, request).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");
}

#[tokio::test]
async fn event_stream_reports_start_and_cancel() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Events").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;
    let response = app
        .clone()
        .oneshot(Request::get("/api/events").body(Body::empty()).unwrap())
        .await
        .expect("SSE response");
    assert_eq!(response.status(), StatusCode::OK);
    let mut events = response.into_body();

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let started = next_sse_event(&mut events).await;
    assert!(started.contains("event: encode"));
    assert!(started.contains("\"kind\":\"started\""));
    assert!(
        started.contains(&format!("\"project_id\":\"{project_id}\"")),
        "the stream event must name its project: {started}"
    );
    assert!(
        started.contains(&format!("\"video_id\":\"{video_id}\"")),
        "the stream event must name its video: {started}"
    );

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    // The fake runner reports one progress tick before holding. Consume it here so the
    // cancellation assertion still checks the next frame, and assert the tick's shape.
    let progress = next_sse_event(&mut events).await;
    assert!(progress.contains("event: encode"));
    assert!(progress.contains("\"kind\":\"progress\""));
    assert!(progress.contains("\"progress\":42.0"));

    let cancelled = next_sse_event(&mut events).await;
    assert!(cancelled.contains("event: encode"));
    assert!(cancelled.contains("\"kind\":\"cancelled\""));

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let second_id = body["run_id"].as_str().expect("second run id").to_owned();

    let cancel = Request::delete(format!("/api/runs/{second_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let second_cancelled = next_event_of_kind(&mut events, "cancelled").await;
    assert!(second_cancelled.contains("\"kind\":\"cancelled\""));

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn event_stream_resumes_after_last_event_id_or_since() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Resume").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;
    let response = app
        .clone()
        .oneshot(Request::get("/api/events").body(Body::empty()).unwrap())
        .await
        .expect("SSE response");
    let mut events = response.into_body();

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let started = next_sse_event(&mut events).await;
    assert!(started.contains("\"kind\":\"started\""), "{started}");
    let id = started
        .lines()
        .find_map(|line| line.strip_prefix("id: "))
        .expect("SSE id")
        .to_owned();

    let resumed = app
        .clone()
        .oneshot(
            Request::get("/api/events")
                .header("last-event-id", &id)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("resumed SSE response");
    assert_eq!(resumed.status(), StatusCode::OK);
    let replayed = next_sse_event(&mut resumed.into_body()).await;
    assert!(
        replayed.contains("\"kind\":\"started\""),
        "the replayed frame was {replayed}"
    );

    let queried = app
        .clone()
        .oneshot(
            Request::get(format!("/api/events?since={id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("queried SSE response");
    assert_eq!(queried.status(), StatusCode::OK);
    let replayed_by_query = next_sse_event(&mut queried.into_body()).await;
    assert!(
        replayed_by_query.contains("\"kind\":\"started\""),
        "the queried replay frame was {replayed_by_query}"
    );

    let run_id = body["run_id"].as_str().expect("run id");
    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_for_config_write(app, &project_id).await;

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_config_write_during_a_run_is_locked() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Config").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let (status, body) = send(app.clone(), config_request(&id)).await;
    assert_eq!(status, StatusCode::LOCKED);
    assert_eq!(body["code"], "LOCKED");
    assert_eq!(
        body["message"],
        "Configuration is read-only while an encode is running."
    );

    // Only the project that owns the run is frozen. Another project's configuration has
    // nothing to do with this encode, and locking it would invent a global switch as well
    // as a reason for the UI to disable every field on every screen.
    let other = create_project(app.clone(), "Unrelated").await;
    let (status, body) = send(app.clone(), config_request(&other)).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    // The cancelled worker keeps writing its log until it publishes the terminal event;
    // removing the directory first fails with `DirectoryNotEmpty` on a slow machine.
    wait_for_config_write(app, &id).await;
    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// One run freezes the project it belongs to and the video it is encoding, but not the
/// other videos in that project. A sibling's overrides, an ordinary queue row, and a
/// template are all writable while the worker holds the singleton.
#[tokio::test]
async fn only_the_encoding_video_and_its_project_configuration_are_locked() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Per video").await;
    let active = add_video(app.clone(), &project_id, &dir).await;
    let sibling = add_video(app.clone(), &project_id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&project_id, &active)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    // The project document is inherited by every video, so it stays read-only.
    let (status, _) = send(app.clone(), config_request(&project_id)).await;
    assert_eq!(status, StatusCode::LOCKED);

    let lock_probe = |video_id: &str| {
        Request::put(format!(
            "/api/projects/{project_id}/videos/{video_id}/overrides"
        ))
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"fields":{"sequences.parallel_encoder.workers":8}}"#,
        ))
        .unwrap()
    };

    let (status, body) = send(app.clone(), lock_probe(&active)).await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let (status, body) = send(app.clone(), lock_probe(&sibling)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["values"]["sequences.parallel_encoder.workers"]["value"],
        8
    );

    // The active row cannot move; a sibling may. The reorder request is a full order, so
    // this also proves the service rejects a list that would shift the running video.
    let reorder = Request::patch(format!("/api/projects/{project_id}/videos/order"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "video_ids": [sibling.clone(), active.clone()] }).to_string(),
        ))
        .unwrap();
    let (status, body) = send(app.clone(), reorder).await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let remove_active = Request::post(format!("/api/projects/{project_id}/videos/remove"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "video_ids": [active.clone()] }).to_string(),
        ))
        .unwrap();
    let (status, body) = send(app.clone(), remove_active).await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let remove_sibling = Request::post(format!("/api/projects/{project_id}/videos/remove"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "video_ids": [sibling] }).to_string(),
        ))
        .unwrap();
    let (status, body) = send(app.clone(), remove_sibling).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // Templates are not per-project; editing one cannot change the snapshot this run owns.
    let create_template = Request::post("/api/settings/templates")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"name":"During run"}"#))
        .unwrap();
    let (status, body) = send(app.clone(), create_template).await;
    assert_eq!(status, StatusCode::CREATED, "{body}");

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    wait_for_config_write(app, &project_id).await;
    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn an_encode_for_an_unknown_project_is_not_found_and_leaves_the_lock_free() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let missing = uuid::Uuid::new_v4();

    let (status, body) = send(app.clone(), start_request(&missing.to_string(), "v1")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");

    // The rejected request never reserved the singleton, so a real project can still encode.
    let project_id = create_project(app.clone(), "Real").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;
    let (status, _) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn an_encode_for_an_unknown_video_is_not_found_and_leaves_the_lock_free() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Queue").await;

    let (status, body) = send(
        app.clone(),
        start_request(&id, &uuid::Uuid::new_v4().to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");

    let video_id = add_video(app.clone(), &id, &dir).await;
    let (status, _) = send(app, start_request(&id, &video_id)).await;
    assert_eq!(
        status,
        StatusCode::ACCEPTED,
        "a rejected request must not reserve the singleton"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn the_current_runs_events_can_be_replayed() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Replay").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    // The fake runner always emits `started` first, so a replay with no cursor must
    // contain it once the bridge has forwarded it.
    let deadline = Instant::now() + Duration::from_secs(2);
    let replayed = loop {
        let (status, body) = send(
            app.clone(),
            Request::get(format!("/api/runs/{run_id}/events"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let events = body.as_array().cloned().unwrap_or_default();
        if events.iter().any(|event| event["kind"] == "started") {
            break events;
        }
        assert!(
            Instant::now() < deadline,
            "the run never published `started`"
        );
        tokio::task::yield_now().await;
    };
    assert_eq!(replayed[0]["run_id"], run_id.as_str());

    let (status, body) = send(
        app.clone(),
        Request::get(format!("/api/runs/{run_id}/events?since=1"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body.as_array()
            .is_some_and(|events| events.iter().all(|event| event["seq"].as_u64() != Some(0))),
        "the cursor was not applied"
    );

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app, cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn cancelling_the_encode_of_another_video_is_not_found() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Cancel").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let (status, body) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{id}/videos/someone-else/encode"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{id}/videos/{video_id}/encode"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let _ = send(app, cancel).await;

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn an_encode_without_free_space_is_507_and_leaves_the_lock_free() {
    let dir = project_dir();
    // The state can still create the project and add the video; only the encode is refused.
    let app = router(project_state(&dir).with_fixed_free_space(0));
    let id = create_project(app.clone(), "No space").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, body) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::INSUFFICIENT_STORAGE);
    assert_eq!(body["code"], "DISK_FULL");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("scratch"))
    );

    // A refusal before the lock is acquired must not leave the singleton held.
    let (status, _) = send(
        app,
        Request::delete(format!("/api/projects/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A sequence that has produced no checkpoints has nothing to reset. The route says so with
/// the same error envelope as the rest of the API instead of writing an empty table.
#[tokio::test]
async fn resetting_a_sequence_without_data_is_unprocessable() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Reset").await;
    let video = add_video(app.clone(), &project, &dir).await;

    let (status, body) = send(
        app,
        Request::post(format!(
            "/api/projects/{project}/videos/{video}/sequences/SceneDetector/reset"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(body["code"], "INVALID_CONFIG");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// Every required pipeline sequence is a possible failure boundary, not only the encoder.
/// Optional sequences are absent from the default chain this fixture runs.
///
/// The runner reports a terminal failure attached to one sequence at a time. The state
/// projection must keep that name, mark only that row failed, and release the config lock
/// so a retry can start again. This is the named failure-mode matrix behind the error table.
#[tokio::test]
async fn a_failure_at_each_pipeline_sequence_names_that_sequence() {
    for sequence in ["SceneDetector", "ParallelEncoder", "SceneConcatenator"] {
        let dir = project_dir();
        let message = format!("the {sequence} sequence failed");
        let app = router(AppState::with_runner_probes_and_data_dir(
            None,
            Arc::new(CrashingRunner {
                message: Box::leak(message.clone().into_boxed_str()),
                sequence,
            }),
            test_probes(),
            dir.clone(),
        ));
        let project_id = create_project(app.clone(), sequence).await;
        let video_id = add_video(app.clone(), &project_id, &dir).await;

        let (status, _) = send(app.clone(), start_request(&project_id, &video_id)).await;
        assert_eq!(status, StatusCode::ACCEPTED, "{sequence}");
        wait_for_config_write(app.clone(), &project_id).await;

        let (status, state) = send(
            app,
            Request::get(format!(
                "/api/projects/{project_id}/videos/{video_id}/state"
            ))
            .body(Body::empty())
            .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{state}");
        assert_eq!(state["failure"]["message"], message, "{sequence}");
        assert_eq!(state["failure"]["sequence"], sequence, "{sequence}");
        let row = state["sequences"]
            .as_array()
            .and_then(|rows| rows.iter().find(|row| row["id"] == sequence))
            .unwrap_or_else(|| panic!("{sequence} is missing from the state rows"));
        assert_eq!(row["status"], "failed", "{sequence}");

        std::fs::remove_dir_all(dir).expect("cleanup");
    }
}

/// The run event routes reject a bad cursor and an unknown run, while the queue and sequence
/// reset routes share the project/video lookup and the singleton guard.
#[tokio::test]
async fn run_routes_report_events_queue_and_sequence_reset_statuses() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Run surface").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let missing = uuid::Uuid::new_v4().to_string();

    let rejected = app
        .clone()
        .oneshot(
            Request::get("/api/events?since=not-a-number")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("events response");
    assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);

    let rejected = app
        .clone()
        .oneshot(
            Request::get("/api/runs/not-a-run/events?since=not-a-number")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("run events response");
    assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);

    let (status, body) = send(
        app.clone(),
        Request::get("/api/runs/not-a-run/events")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    for method in ["GET", "POST", "DELETE"] {
        let request = if method == "POST" {
            route_request(
                method,
                &format!("/api/projects/{missing}/queue"),
                Some(serde_json::json!({ "video_ids": [] })),
            )
        } else {
            route_request(method, &format!("/api/projects/{missing}/queue"), None)
        };
        let (status, body) = send(app.clone(), request).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method}: {body}");
    }

    let (status, started) = send(app.clone(), start_request(&project, &video)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    let (status, body) = send(
        app.clone(),
        route_request(
            "POST",
            &format!("/api/projects/{project}/videos/{video}/run"),
            Some(serde_json::json!({ "sequence": "SceneDetector" })),
        ),
    )
    .await;
    // The singleton refuses a second start before sequence preparation, so this path's
    // lock is BUSY rather than the sequence lock's 423.
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert_eq!(body["code"], "BUSY", "{body}");

    let (status, body) = send(
        app.clone(),
        route_request(
            "POST",
            &format!("/api/projects/{project}/videos/{video}/sequences/SceneDetector/reset"),
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_for_config_write(app.clone(), &project).await;

    // The fake runner records no checkpoint, so resetting a configured sequence is a
    // validation refusal rather than a 404: the address is valid, the result is absent.
    let (status, body) = send(
        app.clone(),
        route_request(
            "POST",
            &format!("/api/projects/{project}/videos/{video}/sequences/SceneDetector/reset"),
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    let (status, body) = send(
        app.clone(),
        route_request(
            "POST",
            &format!("/api/projects/{project}/videos/{missing}/sequences/SceneDetector/reset"),
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app,
        route_request(
            "POST",
            &format!("/api/projects/{project}/videos/{missing}/run"),
            Some(serde_json::json!({ "sequence": "SceneDetector" })),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    std::fs::remove_dir_all(dir).expect("cleanup");
}
