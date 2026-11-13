//! HTTP tests for the `project` route family.

use crate::common::*;

#[tokio::test]
async fn a_project_config_resolves_the_engine_defaults_with_provenance() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Config").await;

    let (status, config) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let values = config["values"].as_object().expect("values map");
    assert!(!values.is_empty());
    let minimum = &values["sequences.scene_detector.method.AVSceneChange.minimum_length"];
    assert_eq!(minimum["value"], 24);
    assert_eq!(minimum["source"], "default");
    assert_eq!(
        values["sequences.parallel_encoder.workers"]["value"],
        Value::Null
    );
    assert_eq!(
        values["sequences.parallel_encoder.workers"]["source"],
        "default"
    );
    assert!(config["updated_at"].as_str().is_some());
    // A section is not a leaf, so it never appears as a writable path.
    assert!(!values.contains_key("sequences"));
    assert!(!values.contains_key("sequences.parallel_encoder"));

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn reading_a_config_does_not_rewrite_the_project_document() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Config").await;
    let path = dir.join("projects").join(&id).join("project.json");
    let before = std::fs::read_to_string(&path).expect("read");

    let (status, _) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        std::fs::read_to_string(&path).expect("reread"),
        before,
        "reading the configuration rewrote the project"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_config_for_an_unknown_project_is_not_found() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let missing = uuid::Uuid::new_v4();

    let (status, body) = send(
        app,
        Request::get(format!("/api/projects/{missing}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");

    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn a_project_config_write_materialises_and_persists_the_document() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Config").await;

    let update = Request::put(format!("/api/projects/{id}/config"))
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"sequences":{"scene_detector":{"method":{"AVSceneChange":{"minimum_length":48}}}}}"#,
        ))
        .unwrap();
    let (status, config) = send(app.clone(), update).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        48
    );
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["source"],
        "inherited"
    );
    // A leaf the request did not mention is still resolved from the engine default.
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.maximum_length"]["value"],
        240
    );
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.maximum_length"]["source"],
        "default"
    );

    let path = dir.join("projects").join(&id).join("project.json");
    let stored: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("read")).expect("json");
    assert_eq!(
        stored["config"]["sequences"]["scene_detector"]["method"]["AVSceneChange"]["minimum_length"],
        48
    );
    assert_eq!(
        stored["config"]["sequences"]["parallel_encoder"]["workers"],
        Value::Null,
        "a sparse save was stored without the engine defaults filled in"
    );
    assert!(
        stored["config"]["encoder"]["SVTAV1"].is_object(),
        "the encoder section was dropped from the stored document"
    );

    // A fresh store proves the write outlived the request and the document's cache.
    drop(app);
    let app = router(project_state(&dir));
    let (status, reread) = send(
        app,
        Request::get(format!("/api/projects/{id}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        reread["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        48
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn an_invalid_configuration_is_rejected_without_writing() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Config").await;
    let path = dir.join("projects").join(&id).join("project.json");
    let before = std::fs::read_to_string(&path).expect("read");

    let unknown_section = Request::put(format!("/api/projects/{id}/config"))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"future":{"anything":true}}"#))
        .unwrap();
    let (status, body) = send(app.clone(), unknown_section).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("not a known configuration section"))
    );

    let unknown_field = Request::put(format!("/api/projects/{id}/config"))
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"sequences":{"parallel_encoder":{"workres":4}}}"#,
        ))
        .unwrap();
    let (status, body) = send(app.clone(), unknown_field).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");

    assert_eq!(
        std::fs::read_to_string(&path).expect("reread"),
        before,
        "a rejected configuration wrote the project"
    );

    // A malformed body is a request error, not a semantic one.
    let malformed = Request::put(format!("/api/projects/{id}/config"))
        .header("content-type", "application/json")
        .body(Body::from("{"))
        .unwrap();
    let (status, body) = send(app, malformed).await;
    assert_unreadable_body(status, &body);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn deleting_a_project_removes_every_queued_video_chunk_directory() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Cleanup").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let chunks = dir.join("temp").join(&video);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    tokio::fs::write(chunks.join("00000.ivf"), b"chunk")
        .await
        .expect("chunk file");

    let (status, _) = send(
        app,
        Request::delete(format!("/api/projects/{project}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(!chunks.exists(), "project deletion must not orphan chunks");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn opt_in_chunk_deletion_waits_for_a_non_empty_output() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FinishingRunner),
        test_probes(),
        dir.clone(),
    ));
    let project = create_project(app.clone(), "Cleanup").await;
    let video = add_video(app.clone(), &project, &dir).await;
    tokio::fs::write(dir.join("output.mkv"), b"output")
        .await
        .expect("output file");
    let chunks = dir.join("temp").join(&video);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    tokio::fs::write(chunks.join("00000.ivf"), b"chunk")
        .await
        .expect("chunk file");

    let settings = Request::patch("/api/settings")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"delete_chunks_on_success":true}"#))
        .unwrap();
    let (status, body) = send(app.clone(), settings).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = send(app.clone(), start_request(&project, &video)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");

    let deadline = Instant::now() + Duration::from_secs(3);
    while tokio::fs::try_exists(&chunks).await.unwrap_or(false) {
        assert!(
            Instant::now() < deadline,
            "chunks were not deleted after a successful run"
        );
        tokio::task::yield_now().await;
    }
    assert!(
        tokio::fs::metadata(dir.join("output.mkv")).await.is_ok(),
        "the output must survive cleanup"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_project_can_be_created_listed_renamed_and_deleted() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let create = Request::post("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"name":"  Feature film  ","description":"First cut"}"#,
        ))
        .unwrap();
    let (status, created) = send(app.clone(), create).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["name"], "Feature film");
    assert_eq!(created["description"], "First cut");
    let id = created["id"].as_str().expect("id").to_owned();
    assert_eq!(created["created_at"].as_str().map(str::len), Some(20));

    let (status, listed) = send(
        app.clone(),
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed.as_array().map(Vec::len), Some(1));
    assert_eq!(listed[0]["id"], id.as_str());
    assert_eq!(listed[0]["video_count"], 0);

    let (status, detail) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(detail["name"], "Feature film");

    let rename = Request::patch(format!("/api/projects/{id}"))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"name":"Renamed","description":""}"#))
        .unwrap();
    let (status, renamed) = send(app.clone(), rename).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(renamed["name"], "Renamed");
    assert_eq!(renamed["description"], Value::Null);

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, missing) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(missing["code"], "NOT_FOUND");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// Both Home counts are derived from the queue and the output files at read time, never
/// replayed from the index: adding a video and writing its output changes them without a
/// project write.
#[tokio::test]
async fn the_project_list_derives_queue_and_completed_counts() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Counts").await;

    let (status, listed) = send(
        app.clone(),
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed[0]["video_count"], 0);
    assert_eq!(listed[0]["completed_videos"], 0);

    add_video(app.clone(), &project, &dir).await;
    tokio::fs::write(dir.join("output.mkv"), b"encoded")
        .await
        .expect("output file");

    let (status, listed) = send(
        app,
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed[0]["video_count"], 1);
    assert_eq!(listed[0]["completed_videos"], 1);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A missing output and a zero-byte failed concatenation are not completed videos. The
/// summary must follow the shared file predicate rather than treating the path alone as
/// completion.
#[tokio::test]
async fn the_project_list_counts_only_non_empty_outputs_as_completed() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Completed").await;
    add_video(app.clone(), &project, &dir).await;
    let output = dir.join("output.mkv");

    let (status, listed) = send(
        app.clone(),
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        listed[0]["completed_videos"], 0,
        "a missing output is not complete"
    );

    tokio::fs::write(&output, b"")
        .await
        .expect("zero-byte output");
    let (status, listed) = send(
        app.clone(),
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        listed[0]["completed_videos"], 0,
        "a zero-byte output is not complete"
    );

    tokio::fs::write(&output, b"encoded")
        .await
        .expect("completed output");
    let (status, listed) = send(
        app.clone(),
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed[0]["completed_videos"], 1);

    tokio::fs::remove_file(&output)
        .await
        .expect("remove output");
    tokio::fs::create_dir(&output)
        .await
        .expect("output directory");
    let (status, listed) = send(
        app,
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        listed[0]["completed_videos"], 0,
        "a directory is not an output file"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn the_project_list_counts_completed_videos_per_video() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Per video").await;
    let completed_dir = dir.join("completed");
    let unfinished_dir = dir.join("unfinished");
    tokio::fs::create_dir_all(&completed_dir)
        .await
        .expect("completed dir");
    tokio::fs::create_dir_all(&unfinished_dir)
        .await
        .expect("unfinished dir");

    add_video(app.clone(), &project, &completed_dir).await;
    add_video(app.clone(), &project, &unfinished_dir).await;
    tokio::fs::write(completed_dir.join("output.mkv"), b"encoded")
        .await
        .expect("completed output");

    let (status, listed) = send(
        app,
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed[0]["video_count"], 2);
    assert_eq!(listed[0]["completed_videos"], 1);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_project_without_a_name_is_rejected() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let request = Request::post("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"name":"   "}"#))
        .unwrap();
    let (status, body) = send(app, request).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert!(body["message"].as_str().is_some_and(|m| m.contains("name")));

    // A rejected create writes nothing, so there is no directory to remove.
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn an_unknown_project_id_is_not_found_and_a_malformed_one_is_rejected() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let (status, body) = send(
        app.clone(),
        Request::get(format!("/api/projects/{}", uuid::Uuid::new_v4()))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");

    let (status, body) = send(
        app.clone(),
        Request::get("/api/projects/not-a-uuid")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "INVALID_CONFIG");

    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn a_project_written_by_a_newer_version_is_refused_over_http() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let create = Request::post("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"name":"Future"}"#))
        .unwrap();
    let (_, created) = send(app.clone(), create).await;
    let id = created["id"].as_str().expect("id").to_owned();

    let path = dir.join("projects").join(&id).join("project.json");
    let mut document: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("read")).expect("json");
    document["schema_version"] = Value::from(99);
    std::fs::write(&path, serde_json::to_string(&document).expect("render")).expect("write");

    let (status, body) = send(
        app,
        Request::get(format!("/api/projects/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("newer version"))
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn the_project_list_does_not_serve_a_directory_that_is_gone() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Vanished").await;
    std::fs::remove_dir_all(dir.join("projects").join(&id)).expect("remove by hand");

    let (status, listed) = send(
        app.clone(),
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed.as_array().map(Vec::len), Some(0));

    let (status, _) = send(
        app,
        Request::get(format!("/api/projects/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn the_project_list_reports_a_size_measured_now() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Growing").await;

    let (_, before) = send(
        app.clone(),
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    let before = before[0]["size_bytes"].as_u64().expect("size");

    std::fs::write(
        dir.join("projects").join(&id).join("chunk.bin"),
        vec![0u8; 4096],
    )
    .expect("grow the project");
    let video = add_video(app.clone(), &id, &dir).await;
    let chunks = dir.join("temp").join(&video);
    std::fs::create_dir_all(&chunks).expect("chunk dir");
    std::fs::write(chunks.join("00000.ivf"), vec![0u8; 4096]).expect("grow the scratch dir");

    let (_, after) = send(
        app,
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    let after = after[0]["size_bytes"].as_u64().expect("size");
    assert!(
        after >= before + 8192,
        "project and retained scratch bytes must both count: {before} -> {after}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_read_racing_a_delete_does_not_recreate_the_project() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    for _ in 0..15 {
        let id = create_project(app.clone(), "Racing").await;
        let directory = dir.join("projects").join(&id);

        let reader = tokio::spawn({
            let app = app.clone();
            let id = id.clone();
            async move {
                send(
                    app,
                    Request::get(format!("/api/projects/{id}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
            }
        });
        let remover = tokio::spawn({
            let app = app.clone();
            let id = id.clone();
            async move {
                send(
                    app,
                    Request::delete(format!("/api/projects/{id}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
            }
        });
        let _ = tokio::join!(reader, remover);

        assert!(
            !directory.exists(),
            "a read recreated a deleted project directory"
        );
    }

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_corrupt_project_document_is_an_invalid_resource_not_a_server_fault() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Broken").await;

    let path = dir.join("projects").join(&id).join("project.json");
    let mut document: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("read")).expect("json");
    document["created_at"] = Value::from("yesterday");
    std::fs::write(&path, serde_json::to_string(&document).expect("render")).expect("write");
    let corrupt = std::fs::read(&path).expect("corrupt bytes");

    let (status, body) = send(
        app,
        Request::get(format!("/api/projects/{id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert_eq!(
        std::fs::read(&path).expect("document after the read"),
        corrupt,
        "a failed read must not rewrite the user's document"
    );
    let rendered = body.to_string();
    assert!(
        !rendered.contains(&dir.to_string_lossy().to_string()),
        "the error must not disclose the app-data path: {rendered}"
    );
    assert!(
        !rendered.contains("project.json"),
        "the error must name the resource, not its implementation file: {rendered}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn video_overrides_can_add_target_quality_actions_to_the_chain() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Actions").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    // Neither action is enabled by the project's defaults. The chain must read the video's
    // resolved configuration, not the project document alone, or a video override that
    // enables one would have no row and no way to start it.
    let overrides = Request::put(format!("/api/projects/{id}/videos/{video_id}/overrides"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({
                "fields": {
                    "sequences.speed_scaler": { "speed_quantizers": [[8, 20], [6, 35]] },
                    "sequences.bitrate_optimizer": { "bitrate_sigma_threshold": 2 }
                }
            })
            .to_string(),
        ))
        .unwrap();
    let (status, body) = send(app.clone(), overrides).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, state) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/state"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{state}");
    let sequences = state["sequences"].as_array().expect("sequences");
    assert!(
        sequences
            .iter()
            .any(|sequence| sequence["id"] == "SpeedScaler")
    );
    assert!(
        sequences
            .iter()
            .any(|sequence| sequence["id"] == "BitrateOptimizer")
    );
    assert_eq!(
        state["next"],
        serde_json::json!(["SceneDetector"]),
        "actions are never scheduled by the full pipeline"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_project_archive_round_trips_through_export_and_import() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Archive").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let put = Request::put(format!("/api/projects/{id}/videos/{video_id}/overrides"))
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"fields":{"sequences.parallel_encoder.workers":8}}"#,
        ))
        .unwrap();
    let (status, _) = send(app.clone(), put).await;
    assert_eq!(status, StatusCode::OK);

    let (status, archive) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{archive}");
    assert_eq!(archive["schema_version"], 1);
    assert_eq!(archive["name"], "Archive");
    assert_eq!(archive["videos"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        archive["videos"][0]["overrides"]["sequences.parallel_encoder.workers"],
        8
    );

    let (status, imported) = send(
        app.clone(),
        Request::post("/api/projects/import")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_string(&archive).expect("archive json"),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{imported}");
    let imported_id = imported["id"].as_str().expect("imported id");
    assert_ne!(imported_id, id, "an import never reuses the exported id");

    let (status, videos) = send(
        app.clone(),
        Request::get(format!("/api/projects/{imported_id}/videos"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(videos.as_array().map(Vec::len), Some(1));
    let imported_video = videos[0]["id"].as_str().expect("video id");
    let (status, config) = send(
        app,
        Request::get(format!(
            "/api/projects/{imported_id}/videos/{imported_video}/config"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        config["values"]["sequences.parallel_encoder.workers"]["source"],
        "overridden"
    );
    assert_eq!(
        config["values"]["sequences.parallel_encoder.workers"]["value"],
        8
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_newer_archive_is_refused_before_creating_a_project() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Source").await;
    let (_, mut archive) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    archive["schema_version"] = Value::from(99);

    let (status, body) = send(
        app.clone(),
        Request::post("/api/projects/import")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_string(&archive).expect("archive json"),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");

    let (_, projects) = send(
        app,
        Request::get("/api/projects").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(projects.as_array().map(Vec::len), Some(1));

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn general_defaults_round_trip_and_derive_the_next_output_path() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let output_folder = dir.join("encoded");
    tokio::fs::create_dir_all(&output_folder)
        .await
        .expect("output folder");
    let app = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));
    let project_id = create_project(app.clone(), "General").await;

    let (status, updated) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/general"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "input_kind": "ffms2",
                    "output_mode": "folder",
                    "output_folder": output_folder.display().to_string()
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["general"]["output_mode"], "folder");

    let source = dir.join("source.mkv");
    tokio::fs::write(&source, b"fixture")
        .await
        .expect("source file");
    let (status, created) = send(
        app.clone(),
        Request::post(format!("/api/projects/{project_id}/videos"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "input_path": source.display().to_string() }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(
        PathBuf::from(created["output_path"].as_str().expect("output path")),
        output_folder.join("source.av1.mkv")
    );

    let (status, project) = send(
        app,
        Request::get(format!("/api/projects/{project_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        project["general"]["output_folder"],
        output_folder.display().to_string()
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// The project-level writes share the run guard, and a missing project is reported from the
/// same routes instead of being mistaken for a validation failure.
#[tokio::test]
async fn project_writes_report_the_lock_validation_and_unknown_projects() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Guarded").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let general = serde_json::json!({
        "input_kind": "ffms2",
        "output_mode": "next_to_input"
    });
    let defaults = serde_json::json!({
        "config": {},
        "general": general
    });

    let (status, body) = send(app.clone(), start_request(&project_id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{body}");
    let run_id = body["run_id"].as_str().expect("run id").to_owned();

    let (status, body) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{project_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/general"))
            .header("content-type", "application/json")
            .body(Body::from(general.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/projects/{project_id}/template"))
            .header("content-type", "application/json")
            .body(Body::from(r#"{"template_id":"missing"}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/defaults"))
            .header("content-type", "application/json")
            .body(Body::from(defaults.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_for_config_write(app.clone(), &project_id).await;

    for (method, path) in [
        ("POST", format!("/api/projects/{project_id}/template")),
        ("PUT", format!("/api/projects/{project_id}/defaults")),
    ] {
        let request = match method {
            "POST" => Request::post(&path),
            "PUT" => Request::put(&path),
            _ => unreachable!("only POST and PUT are in this table"),
        };
        let (status, body) = send(
            app.clone(),
            request
                .header("content-type", "application/json")
                .body(Body::from("{"))
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{method} {path}: {body}");
    }

    let missing = uuid::Uuid::new_v4().to_string();
    for (method, path, body) in [
        ("GET", format!("/api/projects/{missing}/scripts"), None),
        (
            "POST",
            format!("/api/projects/{missing}/template"),
            Some(serde_json::json!({ "template_id": "missing" })),
        ),
        (
            "PUT",
            format!("/api/projects/{missing}/defaults"),
            Some(defaults.clone()),
        ),
        (
            "PATCH",
            format!("/api/projects/{missing}"),
            Some(serde_json::json!({ "name": "Renamed" })),
        ),
        ("DELETE", format!("/api/projects/{missing}"), None),
        (
            "PUT",
            format!("/api/projects/{missing}/config"),
            Some(serde_json::json!({})),
        ),
        (
            "PUT",
            format!("/api/projects/{missing}/general"),
            Some(general.clone()),
        ),
        ("GET", format!("/api/projects/{missing}/export"), None),
        (
            "POST",
            format!("/api/projects/{missing}/videos"),
            Some(serde_json::json!({ "input_path": dir.join("source.mkv") })),
        ),
    ] {
        let (status, response) = send(app.clone(), route_request(method, &path, body)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {path}: {response}");
    }

    let (status, body) = send(
        app.clone(),
        Request::patch(format!("/api/projects/{project_id}"))
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":" "}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["code"], "INVALID_CONFIG");

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/general"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "input_kind": "ffms2",
                    "output_mode": "folder",
                    "output_folder": "relative"
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["code"], "INVALID_CONFIG");

    std::fs::remove_dir_all(dir).expect("cleanup");
}
