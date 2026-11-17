//! HTTP tests for the `video` route family.

use crate::common::*;

#[tokio::test]
async fn deleting_chunks_is_idempotent_and_leaves_the_video() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Chunks").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let chunks = dir.join("temp").join(&video);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    tokio::fs::write(chunks.join("00000.ivf"), b"chunk")
        .await
        .expect("chunk file");

    let request = Request::delete(format!("/api/projects/{project}/videos/{video}/chunks"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), request).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(!chunks.exists());

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{project}/videos/{video}/chunks"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "the action is idempotent");

    let (status, _) = send(
        app,
        Request::get(format!("/api/projects/{project}/videos/{video}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A video may keep its scratch work outside the inherited root, and returning to the
/// inherited root is the same operation with a null directory. The overview must report the
/// resolved directory, not only the stored choice.
#[tokio::test]
async fn a_video_storage_directory_can_be_chosen_and_cleared() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Storage").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let scratch = dir.join("per-video");

    let (status, before) = send(
        app.clone(),
        Request::get(format!("/api/projects/{project}/videos/{video}/storage"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{before}");
    assert_eq!(before["custom"], false);

    let (status, chosen) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project}/videos/{video}/storage"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "directory": scratch }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{chosen}");
    assert_eq!(chosen["custom"], true);
    assert_eq!(chosen["directory"], scratch.display().to_string());

    let (status, cleared) = send(
        app,
        Request::put(format!("/api/projects/{project}/videos/{video}/storage"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "directory": null }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{cleared}");
    assert_eq!(cleared["custom"], false);
    assert_eq!(cleared["directory"], before["directory"]);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A custom scratch directory is the video's own work root: deleting retained chunks
/// removes it, including when it is outside the inherited app-data temp root.
#[tokio::test]
async fn deleting_custom_video_chunks_removes_the_adopted_directory() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Custom chunks").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let scratch = dir.join("custom-scratch");

    let (status, chosen) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project}/videos/{video}/storage"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "directory": scratch }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{chosen}");
    tokio::fs::write(scratch.join("00000.ivf"), b"chunk")
        .await
        .expect("chunk");

    let (status, _) = send(
        app,
        Request::delete(format!("/api/projects/{project}/videos/{video}/chunks"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(!scratch.exists(), "the custom scratch directory is removed");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A scratch directory is adopted only when it is empty. Deleting retained work removes
/// the whole directory, so an existing folder with unrelated files must be refused.
#[tokio::test]
async fn a_non_empty_video_storage_directory_is_refused() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Storage guard").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let scratch = dir.join("occupied");
    tokio::fs::create_dir_all(&scratch)
        .await
        .expect("occupied directory");
    tokio::fs::write(scratch.join("keep.txt"), b"keep")
        .await
        .expect("sentinel");

    let (status, body) = send(
        app,
        Request::put(format!("/api/projects/{project}/videos/{video}/storage"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "directory": scratch }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("not empty")),
        "{body}"
    );
    assert!(
        scratch.join("keep.txt").exists(),
        "the refused folder must remain untouched"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A filesystem root is never a valid scratch directory: deleting retained work removes
/// the directory recursively, so adopting a root would delete the volume's contents.
#[tokio::test]
async fn a_filesystem_root_is_refused_as_a_video_storage_directory() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Root guard").await;
    let video = add_video(app.clone(), &project, &dir).await;
    #[cfg(windows)]
    let root = std::path::PathBuf::from(r"C:\");
    #[cfg(not(windows))]
    let root = std::path::PathBuf::from("/");

    let (status, body) = send(
        app,
        Request::put(format!("/api/projects/{project}/videos/{video}/storage"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "directory": root }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("filesystem root")),
        "{body}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A project with no batch answers with the inactive shape rather than a 404, so the queue
/// screen can poll one URL before and after a batch starts.
#[tokio::test]
async fn an_inactive_queue_batch_is_a_status_not_a_missing_route() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Queue status").await;

    let (status, batch) = send(
        app,
        Request::get(format!("/api/projects/{project}/queue"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{batch}");
    assert_eq!(batch["project_id"], project.as_str());
    assert_eq!(batch["active"], false);
    assert_eq!(batch["total"], 0);
    assert_eq!(batch["remaining"], 0);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_video_is_added_listed_and_its_state_is_derived() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Queue").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, queue) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(queue.as_array().map(Vec::len), Some(1));
    assert_eq!(queue[0]["id"], video_id.as_str());
    assert_eq!(queue[0]["order"], 0);
    assert!(
        queue[0]["input_path"]
            .as_str()
            .is_some_and(|path| path.ends_with("source.mkv"))
    );

    let (status, detail) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(detail["output_exists"], false);
    assert_eq!(detail["retained_bytes"], 0);

    let (status, state) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/state"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(state["video_id"], video_id.as_str());
    assert_eq!(state["scene_count"], 0);
    assert_eq!(state["active"], false);
    assert_eq!(
        state["sequences"][0]["status"], "never_run",
        "an unencoded video has not detected scenes"
    );
    assert_eq!(state["sequences"][0]["runnable"], true);
    assert_eq!(state["next"], serde_json::json!(["SceneDetector"]));
    assert_eq!(
        state["script_data"],
        serde_json::json!([]),
        "a native input receives no injected variables"
    );
    assert!(state["sequences"].as_array().is_some_and(|sequences| {
        sequences
            .iter()
            .all(|sequence| sequence["id"] != "SerialEncoder")
    }));

    let chunks = dir.join("temp").join(&video_id);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    tokio::fs::write(chunks.join("00000.ivf"), b"chunk")
        .await
        .expect("chunk file");

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{id}/videos/{video_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(
        !chunks.exists(),
        "removing a video must not orphan its chunks"
    );

    let (status, gone) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{video_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(gone["code"], "NOT_FOUND");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn the_video_state_documents_the_variables_each_script_input_receives() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Script").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    // Rewrite the stored video as a script input with a per-sequence script override and a
    // saved scene table, which is the state a second run starts from.
    let document = dir
        .join("projects")
        .join(&id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("the video document"))
            .expect("video json");
    let encoder = av1ation_engine::default_project_config()["encoder"].clone();
    record["input"] = script_input("clip.set_output()");
    record["overrides"] = serde_json::json!({
        "sequences.parallel_encoder.input": script_input("clip2.set_output()")
    });
    record["condor"] = serde_json::json!({ "scenes": [saved_scene(encoder)] });
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let (status, state) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/state"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{state}");
    assert_eq!(state["scene_count"], 1);
    assert_eq!(
        state["next"],
        serde_json::json!(["ParallelEncoder"]),
        "a saved scene table makes the encoder the next sequence"
    );

    let entries = state["script_data"].as_array().expect("script entries");
    assert_eq!(
        entries.len(),
        2,
        "the input and its override are both scripts"
    );
    assert_eq!(entries[0]["input"], "input");
    assert_eq!(entries[0]["sequence"], "ParallelEncoder");
    assert_eq!(entries[1]["input"], "sequences.parallel_encoder.input");
    assert_eq!(entries[1]["sequence"], "ParallelEncoder");

    let keys = entries[0]["keys"].as_array().expect("keys");
    assert_eq!(keys.len(), 7);
    assert_eq!(keys[0]["key"], "condor_video_path");
    assert_eq!(
        keys[0]["value"],
        Value::from(dir.join("source.mkv").display().to_string()),
        "the video's file is documented even though its input is a script"
    );
    assert_eq!(keys[1]["key"], "condor_scenes");
    assert_eq!(keys[1]["format"], "json");
    assert_eq!(keys[1]["truncated"], false);
    let scenes: Value =
        serde_json::from_str(keys[1]["value"].as_str().expect("scene table")).expect("json");
    assert_eq!(scenes[0]["start"], 0);
    assert_eq!(scenes[0]["end"], 24);
    assert_eq!(scenes[0]["data"]["noise_detection"]["noise"], 5.5);
    assert_eq!(keys[2]["key"], "condor_scene_count");
    assert_eq!(keys[2]["value"], "1");
    assert_eq!(keys[3]["value"], Value::from(directory(&dir, &video_id)));
    assert_eq!(keys[4]["key"], "condor_run_id");
    assert_eq!(keys[4]["value"], "");
    assert_eq!(keys[5]["value"], "ParallelEncoder");

    // The script also reads the whole sequence configuration it runs under, which is what
    // lets it branch on a stage setting such as the noise detector's threshold.
    assert_eq!(keys[6]["key"], "condor_sequence_config");
    assert_eq!(keys[6]["format"], "json");
    assert_eq!(keys[6]["truncated"], false);
    let config: Value =
        serde_json::from_str(keys[6]["value"].as_str().expect("sequence config")).expect("json");
    assert!(
        config.get("parallel_encoder").is_some(),
        "every stage of the sequence is present: {config}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_video_whose_source_does_not_exist_is_rejected_before_writing() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Queue").await;

    let request = Request::post(format!("/api/projects/{id}/videos"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({
                "input_path": dir.join("missing.mkv").display().to_string(),
                "output_path": dir.join("out.mkv").display().to_string()
            })
            .to_string(),
        ))
        .unwrap();
    let (status, body) = send(app.clone(), request).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("No file exists")),
        "{body}"
    );

    let (status, queue) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(queue.as_array().map(Vec::len), Some(0));

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A script document cannot be opened by FFmpeg, so the manifest says so once instead of
/// every rail row starting a decoder that fails.
#[tokio::test]
async fn a_script_path_reports_no_thumbnail_grid_and_no_image() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Thumbnails").await;
    let script = dir.join("source.vpy");
    tokio::fs::write(&script, b"import vapoursynth as vs\n")
        .await
        .expect("script file");
    let request = Request::post(format!("/api/projects/{id}/videos"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({
                "input_path": script.display().to_string(),
                "output_path": dir.join("out.mkv").display().to_string()
            })
            .to_string(),
        ))
        .unwrap();
    let (status, created) = send(app.clone(), request).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let video_id = created["id"].as_str().expect("video id").to_owned();

    let (status, manifest) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/thumbnails"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{manifest}");
    assert_eq!(manifest["state"], "unavailable");
    assert_eq!(manifest["available"], 0);
    assert_eq!(manifest["interval_ms"], 5_000);
    assert_eq!(manifest["width"], 320);
    assert!(
        manifest["detail"]
            .as_str()
            .is_some_and(|detail| detail.contains("VapourSynth")),
        "{manifest}"
    );

    let (status, missing) = send(
        app.clone(),
        Request::get(format!(
            "/api/projects/{id}/videos/{}/thumbnails",
            uuid::Uuid::new_v4()
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{missing}");

    let (status, image) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{video_id}/thumbnails/0"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(image["code"], "NOT_FOUND");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A thumbnail that a previous build already wrote is served from the cache without
/// decoding the source again. The route still needs to know FFmpeg is installed, so the
/// probe is supplied by the test even though no keyframe extraction runs here.
#[tokio::test]
async fn a_cached_thumbnail_is_served_as_a_jpeg() {
    let dir = project_dir();
    let mut probes = test_probes();
    probes.push(Probe {
        id: "ffmpeg".to_owned(),
        label: "FFmpeg".to_owned(),
        capability: Capability::Muxing,
        available: true,
        detail: "ffmpeg version 7".to_owned(),
        remediation: None,
    });
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        probes,
        dir.clone(),
    ));
    let id = create_project(app.clone(), "Cached thumbnail").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, manifest) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/thumbnails"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{manifest}");
    let revision = manifest["revision"].as_str().expect("revision");
    let cache = dir.join("cache").join("thumbnails").join(revision);
    tokio::fs::create_dir_all(&cache)
        .await
        .expect("thumbnail cache");
    tokio::fs::write(cache.join("thumb-00001.jpg"), b"jpeg")
        .await
        .expect("cached thumbnail");

    let response = app
        .oneshot(
            Request::get(format!("/api/projects/{id}/videos/{video_id}/thumbnails/0"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CONTENT_TYPE], "image/jpeg");
    // The global API middleware owns this header and currently overrides the handler's
    // immutable value, so assert the posture that actually reaches the browser.
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(
        to_bytes(response.into_body(), 64).await.expect("body"),
        "jpeg"
    );

    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn video_overrides_resolve_with_provenance_and_can_be_reset() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Overrides").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let put = Request::put(format!("/api/projects/{id}/videos/{video_id}/overrides"))
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"fields":{"sequences.parallel_encoder.workers":8}}"#,
        ))
        .unwrap();
    let (status, config) = send(app.clone(), put).await;
    assert_eq!(status, StatusCode::OK, "{config}");
    assert_eq!(
        config["values"]["sequences.parallel_encoder.workers"]["value"],
        8
    );
    assert_eq!(
        config["values"]["sequences.parallel_encoder.workers"]["source"],
        "overridden"
    );
    assert_eq!(
        config["values"]["sequences.parallel_encoder.workers"]["value"],
        8
    );

    // A read does not turn the override back into the project value.
    let (status, reread) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        reread["values"]["sequences.parallel_encoder.workers"]["source"],
        "overridden"
    );

    let unknown = Request::put(format!("/api/projects/{id}/videos/{video_id}/overrides"))
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"fields":{"sequences.parallel_encoder.workres":8}}"#,
        ))
        .unwrap();
    let (status, body) = send(app.clone(), unknown).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");

    // A leaf with a concrete default rejects a different kind. A leaf whose default is
    // `null` accepts any shape, because the engine reads `null` as "not configured".
    let wrong_kind = Request::put(format!(
        "/api/projects/{id}/videos/{video_id}/overrides"
    ))
    .header("content-type", "application/json")
    .body(Body::from(
        r#"{"fields":{"sequences.scene_detector.method.AVSceneChange.minimum_length":"twelve"}}"#,
    ))
    .unwrap();
    let (status, body) = send(app.clone(), wrong_kind).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{id}/videos/{video_id}/overrides"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, reset) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{video_id}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(
        reset["values"]["sequences.parallel_encoder.workers"]["source"],
        "default"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_video_general_document_round_trips_and_rejects_a_relative_output() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "General").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, general) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/general"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{general}");
    assert!(general["input"].get("Video").is_some());
    assert_eq!(
        general["output"]["path"],
        dir.join("output.mkv").display().to_string()
    );
    assert_eq!(
        general["source_path"],
        dir.join("source.mkv").display().to_string()
    );

    let moved = dir.join("moved.av1.mkv");
    let mut input = general["input"].clone();
    input["Video"]
        .as_object_mut()
        .expect("a Video input")
        .insert("path".to_owned(), serde_json::json!(dir.join("moved.mkv")));
    tokio::fs::write(dir.join("moved.mkv"), b"fixture")
        .await
        .expect("replacement source");
    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/projects/{id}/videos/{video_id}/general"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "input": input,
                    "output": { "path": moved, "tags": {}, "video_tags": {} }
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(
        saved["source_path"],
        dir.join("moved.mkv").display().to_string()
    );
    assert_eq!(saved["output"]["path"], moved.display().to_string());

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{id}/videos/{video_id}/general"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "input": saved["input"].clone(),
                    "output": { "path": "relative.mkv", "tags": {}, "video_tags": {} }
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_video_replaces_whole_sections_and_reads_its_raw_overrides() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Sections").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, config) = send(
        app.clone(),
        Request::put(format!("/api/projects/{id}/videos/{video_id}/overrides"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "fields": {
                        "sequences.parallel_encoder": {
                            "input": null,
                            "scenes_directory": "",
                            "workers": 4
                        }
                    }
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{config}");
    assert_eq!(
        config["values"]["sequences.parallel_encoder"]["source"],
        "overridden"
    );
    assert_eq!(
        config["values"]["sequences.parallel_encoder"]["value"]["workers"],
        4
    );

    // The raw map is what a section save starts from, so the client can preserve a part it
    // did not render.
    let (status, raw) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/overrides"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(raw["fields"].get("sequences.parallel_encoder").is_some());

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/projects/{id}/videos/{video_id}/overrides"))
            .header("content-type", "application/json")
            .body(Body::from(
                r#"{"fields":{"sequences.unknown":{"workers":4}}}"#,
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn video_storage_names_the_scratch_directory_and_probe_failure_is_data() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Storage").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, storage) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/storage"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{storage}");
    let directory = storage["directory"].as_str().expect("directory");
    assert!(
        directory.ends_with(&video_id),
        "the scratch directory is named by the video: {directory}"
    );
    assert_eq!(storage["retained_bytes"], 0);

    // The fixture is not media, so the decoder cannot open it. The route reports that as a
    // readable reason rather than an HTTP failure, because the details screen must stay up.
    let (status, probe) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/probe"))
            .header("content-type", "application/json")
            .body(Body::from("{}"))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{probe}");
    assert!(probe["clip"].is_null());
    assert!(
        probe["detail"]
            .as_str()
            .is_some_and(|detail| !detail.is_empty()),
        "a failed probe explains itself: {probe}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_malformed_video_probe_uses_the_body_envelope() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Probe body").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, body) = send(
        app,
        Request::post(format!("/api/projects/{id}/videos/{video_id}/probe"))
            .header("content-type", "application/json")
            .body(Body::from("{"))
            .unwrap(),
    )
    .await;

    assert_unreadable_body(status, &body);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// The queue routes resolve the project before reading or writing. Without that guard an
/// unknown id looked like an empty queue, or a removal of nothing, instead of a 404.
#[tokio::test]
async fn queue_routes_report_an_unknown_project() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let missing = uuid::Uuid::new_v4().to_string();

    for (method, path, body) in [
        ("GET", format!("/api/projects/{missing}/videos"), None),
        (
            "PATCH",
            format!("/api/projects/{missing}/videos/order"),
            Some(serde_json::json!({ "video_ids": [] })),
        ),
        (
            "POST",
            format!("/api/projects/{missing}/videos/remove"),
            Some(serde_json::json!({ "video_ids": [] })),
        ),
    ] {
        let (status, response) = send(app.clone(), route_request(method, &path, body)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {path}: {response}");
        assert_eq!(response["code"], "NOT_FOUND", "{method} {path}: {response}");
    }

    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn the_queue_order_is_a_full_permutation_and_removal_is_atomic() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Queue").await;
    let first = add_video(app.clone(), &id, &dir).await;
    let second = add_video(app.clone(), &id, &dir).await;
    let third = add_video(app.clone(), &id, &dir).await;

    let (status, body) = send(
        app.clone(),
        Request::patch(format!("/api/projects/{id}/videos/order"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "video_ids": [third, second, first] }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, queue) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let ids: Vec<&str> = queue
        .as_array()
        .expect("queue")
        .iter()
        .map(|row| row["id"].as_str().expect("video id"))
        .collect();
    assert_eq!(ids, vec![third.as_str(), second.as_str(), first.as_str()]);

    // A list that omits a video is rejected and changes nothing.
    let (status, body) = send(
        app.clone(),
        Request::patch(format!("/api/projects/{id}/videos/order"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "video_ids": [third] }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");

    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/remove"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "video_ids": [third, first] }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body, serde_json::json!([third, first]));

    let (_, queue) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(queue.as_array().expect("queue").len(), 1);
    assert_eq!(queue[0]["id"], second.as_str());

    // Removing an unknown id rejects the whole request instead of removing a prefix.
    let (status, _) = send(
        app,
        Request::post(format!("/api/projects/{id}/videos/remove"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "video_ids": [second, "missing"] }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn validating_a_video_reports_a_missing_source_and_writable_directories() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Validate").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, report) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/validate"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["video_id"], video_id.as_str());
    assert_eq!(report["source_exists"], true);
    assert_eq!(report["output_writable"], true);
    assert_eq!(report["scratch_writable"], true);
    assert!(
        report["temp_free_bytes"].as_u64().is_some(),
        "the scratch volume reports its free space: {report}"
    );
    assert!(
        report["output_free_bytes"].as_u64().is_some(),
        "the output volume reports its free space: {report}"
    );
    assert!(
        report["checks"]
            .as_array()
            .is_some_and(|rows| !rows.is_empty()),
        "the dependency rows are projected onto the video"
    );
    assert_eq!(
        report["plugin_problems"],
        serde_json::json!([]),
        "a native input has no VapourSynth scripts to scan"
    );
    assert_eq!(
        report["can_encode"], false,
        "the fixed inventory has no muxer, so the output cannot be concatenated"
    );
    assert!(
        report["blockers"]
            .as_array()
            .is_some_and(|rows| rows.iter().any(|row| row
                .as_str()
                .is_some_and(|row| row.contains("FFmpeg") || row.contains("MKVToolNix")))),
        "{report}"
    );

    tokio::fs::remove_file(dir.join("source.mkv"))
        .await
        .expect("remove the source");
    let (_, report) = send(
        app,
        Request::post(format!("/api/projects/{id}/videos/{video_id}/validate"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(report["source_exists"], false);
    assert_eq!(report["can_encode"], false);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A missing VapourSynth removes script inputs, not native decoding. The validation report
/// is a projection of the inventory onto this video, so a native video still starts while a
/// script video names the missing runtime.
#[tokio::test]
async fn a_missing_vapoursynth_only_blocks_the_script_inputs_that_need_it() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        vec![
            Probe {
                id: "vapoursynth".to_owned(),
                label: "VapourSynth".to_owned(),
                capability: Capability::Decode,
                available: false,
                detail: "VSScript could not be loaded".to_owned(),
                remediation: Some("Install or repair the bundled VapourSynth runtime.".to_owned()),
            },
            Probe {
                id: "ffmpeg".to_owned(),
                label: "FFmpeg".to_owned(),
                capability: Capability::Muxing,
                available: true,
                detail: "ffmpeg 8.1".to_owned(),
                remediation: None,
            },
        ],
        dir.clone(),
    ));
    let id = create_project(app.clone(), "Scoped").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, native) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/validate"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{native}");
    assert_eq!(
        native["can_encode"], true,
        "a native source does not need VapourSynth: {native}"
    );
    assert!(
        native["blockers"].as_array().is_some_and(Vec::is_empty),
        "{native}"
    );

    let document = dir
        .join("projects")
        .join(&id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    record["input"] = script_input("clip.set_output()");
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let (status, scripted) = send(
        app,
        Request::post(format!("/api/projects/{id}/videos/{video_id}/validate"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{scripted}");
    assert_eq!(scripted["can_encode"], false);
    let blockers = scripted["blockers"].as_array().expect("blockers");
    assert!(
        blockers
            .iter()
            .any(|row| row.as_str().is_some_and(|row| row.contains("VapourSynth"))),
        "{scripted}"
    );
    assert!(
        blockers.iter().all(|row| row
            .as_str()
            .is_none_or(|row| !row.contains("FFmpeg") && !row.contains("MKVToolNix"))),
        "the available muxer must not be reported as a blocker: {scripted}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A missing FFmpeg removes the FFmpeg muxing path, not the capability. MKVToolNix is an
/// independent provider for the same job, so a native video still starts and the report
/// keeps the unavailable row visible instead of turning it into a blocker.
#[tokio::test]
async fn a_missing_ffmpeg_does_not_block_encoding_when_mkvtoolnix_is_available() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        vec![
            Probe {
                id: "ffmpeg".to_owned(),
                label: "FFmpeg".to_owned(),
                capability: Capability::Muxing,
                available: false,
                detail: "ffmpeg was not found".to_owned(),
                remediation: Some("Install FFmpeg or select MKVToolNix.".to_owned()),
            },
            Probe {
                id: "mkvmerge".to_owned(),
                label: "MKVToolNix".to_owned(),
                capability: Capability::Muxing,
                available: true,
                detail: "mkvmerge v90.0".to_owned(),
                remediation: None,
            },
        ],
        dir.clone(),
    ));
    let id = create_project(app.clone(), "Muxer fallback").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, report) = send(
        app,
        Request::post(format!("/api/projects/{id}/videos/{video_id}/validate"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(
        report["can_encode"], true,
        "MKVToolNix satisfies muxing when FFmpeg is absent: {report}"
    );
    assert!(
        report["blockers"].as_array().is_some_and(Vec::is_empty),
        "{report}"
    );
    let checks = report["checks"].as_array().expect("checks");
    assert!(
        checks
            .iter()
            .any(|check| check["id"] == "ffmpeg" && check["available"] == false),
        "the unavailable FFmpeg row stays visible: {report}"
    );
    assert!(
        checks
            .iter()
            .any(|check| check["id"] == "mkvmerge" && check["available"] == true),
        "{report}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// Removing a video takes its history directory with it; the timeline used to survive the
/// document and leave `videos/<id>/timeline.jsonl` with nothing that could address it.
#[tokio::test]
async fn removing_a_video_removes_its_history_directory() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Delete video").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let (status, started) = send(app.clone(), start_request(&id, &video_id)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let run_id = started["run_id"].as_str().expect("run id").to_owned();
    // A run that is still starting has no timeline entry yet; cancel it so the terminal
    // record is written and the history directory exists before the video is removed.
    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/runs/{run_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    let history = dir
        .join("projects")
        .join(&id)
        .join("videos")
        .join(&video_id)
        .join("timeline.jsonl");
    let deadline = Instant::now() + Duration::from_secs(2);
    while !history.exists() {
        assert!(
            Instant::now() < deadline,
            "the run never wrote its timeline"
        );
        tokio::task::yield_now().await;
    }

    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, body) = send(
            app.clone(),
            Request::delete(format!("/api/projects/{id}/videos/{video_id}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        if status == StatusCode::NO_CONTENT {
            break;
        }
        assert_eq!(status, StatusCode::LOCKED, "{body}");
        assert!(
            Instant::now() < deadline,
            "the cancelled run never released its video"
        );
        tokio::task::yield_now().await;
    }

    assert!(
        !history.exists(),
        "the video's history directory is removed with it"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_video_media_route_streams_its_source_and_honours_ranges() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Media").await;
    let video_id = add_video(app.clone(), &id, &dir).await;
    let url = format!("/api/projects/{id}/videos/{video_id}/media");

    // `add_video` writes the seven bytes "fixture" beside the project.
    let response = app
        .clone()
        .oneshot(Request::get(&url).body(Body::empty()).unwrap())
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::ACCEPT_RANGES], "bytes");
    assert_eq!(response.headers()[header::CONTENT_TYPE], "video/x-matroska");
    assert_eq!(
        to_bytes(response.into_body(), 64).await.expect("body"),
        "fixture"
    );

    let response = app
        .clone()
        .oneshot(
            Request::get(&url)
                .header(header::RANGE, "bytes=2-4")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-4/7");
    assert_eq!(
        to_bytes(response.into_body(), 64).await.expect("body"),
        "xtu"
    );

    let response = app
        .clone()
        .oneshot(
            Request::get(&url)
                .header(header::RANGE, "bytes=99-100")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes */7");

    // The fixture has no detected scenes, so an encoded preview has no chunk to produce;
    // the refusal names that before it looks for FFmpeg.
    let (status, missing) = send(
        app.clone(),
        Request::get(format!("{url}?source=encode"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(missing["code"], "NOT_FOUND");

    let gone = send(
        app.clone(),
        Request::get(format!(
            "/api/projects/{id}/videos/{}/media",
            uuid::Uuid::new_v4()
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(gone.0, StatusCode::NOT_FOUND, "{}", gone.1);

    // A single-frame request needs an explicit frame, and only the Decoded source has one.
    let frame_url = format!("/api/projects/{id}/videos/{video_id}/frame");
    let (status, missing) = send(
        app.clone(),
        Request::get(format!("{frame_url}?source=decoded"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(missing["code"], "INVALID_CONFIG");

    let (status, wrong_source) = send(
        app.clone(),
        Request::get(format!("{frame_url}?source=original&frame=0"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(wrong_source["code"], "INVALID_CONFIG");

    let (status, unknown) = send(
        app,
        Request::get(format!("{url}?source=preview"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(unknown["code"], "INVALID_CONFIG");

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn concat_source_info_is_a_typed_empty_result_when_ffmpeg_is_absent() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Concat source info").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, body) = send(
        app.clone(),
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/concat-source-info"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["chapters"].as_array().expect("chapters").is_empty());
    assert!(body["metadata"].as_array().expect("metadata").is_empty());
    for field in ["chapters_detail", "metadata_detail"] {
        assert!(
            body[field]
                .as_str()
                .expect("detail")
                .to_lowercase()
                .contains("ffmpeg"),
            "{body}"
        );
    }

    let (status, missing) = send(
        app,
        Request::post(format!(
            "/api/projects/{project_id}/videos/{}/concat-source-info",
            uuid::Uuid::new_v4()
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{missing}");

    let _ = tokio::fs::remove_dir_all(dir).await;
}

#[tokio::test]
async fn concat_inventory_is_a_typed_empty_result_when_the_muxer_is_absent() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Concat inventory").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, body) = send(
        app.clone(),
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/concat-inventory"
        ))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"method":"mkvmerge"}"#))
        .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["method"], "mkvmerge");
    assert!(body["tracks"].as_array().expect("tracks").is_empty());
    assert!(
        body["attachments"]
            .as_array()
            .expect("attachments")
            .is_empty()
    );
    assert!(
        body["detail"]
            .as_str()
            .expect("detail")
            .to_lowercase()
            .contains("mkvmerge"),
        "{body}"
    );

    let (status, missing) = send(
        app,
        Request::post(format!(
            "/api/projects/{project_id}/videos/{}/concat-inventory",
            uuid::Uuid::new_v4()
        ))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"method":"mkvmerge"}"#))
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{missing}");

    let _ = tokio::fs::remove_dir_all(dir).await;
}

#[tokio::test]
async fn a_malformed_concat_inventory_uses_the_body_envelope() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Concat body").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let (status, body) = send(
        app,
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/concat-inventory"
        ))
        .header("content-type", "application/json")
        .body(Body::from("{"))
        .unwrap(),
    )
    .await;

    assert_unreadable_body(status, &body);

    let _ = tokio::fs::remove_dir_all(dir).await;
}

/// The video document, storage, and retained-chunk routes share one parent lookup and one
/// run guard. A missing video is a 404, an unreadable body is a 400, and the active video's
/// configuration surface is a 423.
#[tokio::test]
async fn video_routes_report_missing_videos_validation_and_the_run_lock() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Video surface").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let missing = uuid::Uuid::new_v4().to_string();

    let (status, started) = send(app.clone(), start_request(&project, &video)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    for (method, path, body) in [
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/general"),
            Some(serde_json::json!({ "input": {}, "output": {} })),
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/storage"),
            Some(serde_json::json!({ "directory": null })),
        ),
        (
            "DELETE",
            format!("/api/projects/{project}/videos/{video}/chunks"),
            None,
        ),
        (
            "DELETE",
            format!("/api/projects/{project}/videos/{video}/overrides"),
            None,
        ),
    ] {
        let (status, response) = send(app.clone(), route_request(method, &path, body)).await;
        assert_eq!(status, StatusCode::LOCKED, "{method} {path}: {response}");
    }

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_for_config_write(app.clone(), &project).await;

    for (method, path, body) in [
        (
            "DELETE",
            format!("/api/projects/{project}/videos/{missing}/chunks"),
            None,
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/general"),
            None,
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{missing}/general"),
            Some(serde_json::json!({ "input": {}, "output": {} })),
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/storage"),
            None,
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{missing}/storage"),
            Some(serde_json::json!({ "directory": null })),
        ),
        (
            "DELETE",
            format!("/api/projects/{project}/videos/{missing}"),
            None,
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/config"),
            None,
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/history"),
            None,
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/overrides"),
            None,
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/state"),
            None,
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/frame?source=decoded&frame=0"),
            None,
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{missing}/probe"),
            Some(serde_json::json!({})),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{missing}/validate"),
            None,
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{missing}/overrides"),
            Some(serde_json::json!({ "fields": {} })),
        ),
        (
            "DELETE",
            format!("/api/projects/{project}/videos/{missing}/overrides"),
            None,
        ),
    ] {
        let (status, response) = send(app.clone(), route_request(method, &path, body)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {path}: {response}");
    }

    for (method, path) in [
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/general"),
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/storage"),
        ),
    ] {
        let (status, response) = send(
            app.clone(),
            route_request(
                method,
                &path,
                Some(serde_json::json!({ "unexpected": true })),
            ),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "{method} {path}: {response}"
        );
    }

    std::fs::remove_dir_all(dir).expect("cleanup");
}
