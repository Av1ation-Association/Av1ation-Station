//! HTTP tests for the `scenes` route family.

use crate::common::*;

/// The Scenes tab reads one table: frame ranges, the final Target Quality pass, and the
/// retained chunk that belongs to each scene. The half-written temp file must not count.
#[tokio::test]
async fn the_scene_table_reports_ranges_passes_and_retained_chunks() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Scenes").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let document = dir
        .join("projects")
        .join(&id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    let encoder = av1ation_engine::default_project_config()["encoder"].clone();
    let mut first = saved_scene(encoder.clone());
    first["end_frame"] = Value::from(240);
    first["sequence_data"]["target_quality"] = serde_json::json!({
        "passes": [
            {
                "quantizer": 32.0,
                "scores": [80.0],
                "bitrate": 1.0,
                "started_on": 0,
                "completed_on": 0
            },
            {
                "quantizer": 24.0,
                "scores": [90.0, 94.0],
                "bitrate": 1.5,
                "started_on": 0,
                "completed_on": 0
            }
        ]
    });
    let mut second = saved_scene(encoder);
    second["start_frame"] = Value::from(240);
    second["end_frame"] = Value::from(480);
    record["condor"] = serde_json::json!({ "scenes": [first, second] });
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let chunks = dir.join("temp").join(&video_id);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    tokio::fs::write(chunks.join("00000.ivf"), vec![0_u8; 1_024])
        .await
        .expect("first chunk");
    tokio::fs::write(chunks.join("00001.temp.264"), vec![0_u8; 512])
        .await
        .expect("temp chunk");

    let (status, list) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list["video_id"], video_id.as_str());
    assert_eq!(list["total_frames"], 480);
    let scenes = list["scenes"].as_array().expect("scene rows");
    assert_eq!(scenes.len(), 2);
    assert_eq!(scenes[0]["index"], 0);
    assert_eq!(scenes[0]["frame_count"], 240);
    assert_eq!(scenes[0]["encoded"], true);
    assert_eq!(scenes[0]["chunk_bytes"], 1_024);
    assert_eq!(
        scenes[0]["quantizer"], 24.0,
        "the last pass is the one the encoder received"
    );
    assert_eq!(scenes[0]["score"], 92.0);
    assert_eq!(scenes[1]["encoded"], false);
    assert_eq!(
        scenes[1]["chunk_bytes"],
        Value::Null,
        "an unfinished temp file is not a scene chunk"
    );
    assert!(scenes[1].get("quantizer").is_none());

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A range edit invalidates only that scene's chunk, and both the edit and a delete are
/// one step undoable. Without this a user who mis-clicks a boundary has to re-detect.
#[tokio::test]
async fn a_scene_range_edit_and_a_delete_are_undoable() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Scene edits").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let document = dir
        .join("projects")
        .join(&id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    let encoder = av1ation_engine::default_project_config()["encoder"].clone();
    let mut first = saved_scene(encoder.clone());
    first["end_frame"] = Value::from(240);
    let mut second = saved_scene(encoder);
    second["start_frame"] = Value::from(240);
    second["end_frame"] = Value::from(480);
    record["condor"] = serde_json::json!({ "scenes": [first, second] });
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let chunks = dir.join("temp").join(&video_id);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    tokio::fs::write(chunks.join("00000.ivf"), vec![0_u8; 1_024])
        .await
        .expect("first chunk");
    tokio::fs::write(chunks.join("00001.ivf"), vec![0_u8; 2_048])
        .await
        .expect("second chunk");

    let (status, body) = send(
        app.clone(),
        Request::patch(format!("/api/projects/{id}/videos/{video_id}/scenes/1"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "start_frame": 240, "end_frame": 300 }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (status, list) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list["scenes"][1]["frame_count"], 60);
    assert!(
        !chunks.join("00001.ivf").exists(),
        "a scene whose range changed can no longer be stitched from its old chunk"
    );
    assert!(
        chunks.join("00000.ivf").exists(),
        "the untouched scene keeps its chunk"
    );

    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/scenes/undo"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (_, list) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(
        list["scenes"][1]["frame_count"], 240,
        "undo puts the original boundary back"
    );

    let (status, body) = send(
        app.clone(),
        Request::delete(format!("/api/projects/{id}/videos/{video_id}/scenes/0"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (_, list) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    let scenes = list["scenes"].as_array().expect("scene rows");
    assert_eq!(scenes.len(), 1);
    assert_eq!(scenes[0]["index"], 0);
    assert_eq!(
        scenes[0]["start_frame"], 240,
        "deleting a scene shifts the later chunks with it"
    );
    assert_eq!(scenes[0]["encoded"], false);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// Structural edits share one route family: split at a frame, merge adjacent scenes, reset a
/// scene's retained output, and write custom sequence data. They all renumber or rewrite the
/// same table, so a request that returns 204 must also leave a table the next route can read.
#[tokio::test]
async fn scene_structure_edits_and_custom_data_round_trip() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Scene structure").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let document = dir
        .join("projects")
        .join(&id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    let encoder = av1ation_engine::default_project_config()["encoder"].clone();
    let mut first = saved_scene(encoder.clone());
    first["end_frame"] = Value::from(240);
    let mut second = saved_scene(encoder);
    second["start_frame"] = Value::from(240);
    second["end_frame"] = Value::from(480);
    record["condor"] = serde_json::json!({ "scenes": [first, second] });
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let chunks = dir.join("temp").join(&video_id);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    for name in ["00000.ivf", "00001.ivf", "00001.temp.264"] {
        tokio::fs::write(chunks.join(name), vec![0_u8; 16])
            .await
            .expect("retained chunk");
    }

    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/scenes/split"))
            .header("content-type", "application/json")
            .body(Body::from(serde_json::json!({ "frame": 100 }).to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    for name in ["00000.ivf", "00001.ivf", "00001.temp.264"] {
        assert!(
            !chunks.join(name).exists(),
            "a split moved scene {name} to a different index"
        );
    }
    let persisted: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    for index in [0, 1] {
        assert!(
            persisted["condor"]["scenes"][index]["sequence_data"]["noise_detection"].is_null(),
            "a split cleared the old measurements for scene {index}"
        );
    }

    let (_, list) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(list["scenes"].as_array().map(Vec::len), Some(3));
    assert_eq!(list["scenes"][1]["start_frame"], 100);

    let (status, body) = send(
        app.clone(),
        Request::put(format!(
            "/api/projects/{id}/videos/{video_id}/scenes/0/sequence-data"
        ))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "values": { "note": "keep" } }).to_string(),
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    for name in ["00000.ivf", "00001.ivf"] {
        tokio::fs::write(chunks.join(name), vec![0_u8; 16])
            .await
            .expect("retained chunk");
    }

    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/scenes/merge"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "scenes": [1, 2] }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    for name in ["00000.ivf", "00001.ivf"] {
        assert!(
            !chunks.join(name).exists(),
            "a merge moved scene {name} to a different index"
        );
    }
    let persisted: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    assert!(
        persisted["condor"]["scenes"][1]["sequence_data"]["noise_detection"].is_null(),
        "a merge cleared the old measurements for the merged scene"
    );

    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/scenes/reset"))
            .header("content-type", "application/json")
            .body(Body::from(serde_json::json!({ "scenes": [0] }).to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (_, list) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    let scenes = list["scenes"].as_array().expect("scene rows");
    assert_eq!(scenes.len(), 2);
    assert_eq!(scenes[0]["start_frame"], 0);
    assert_eq!(scenes[1]["start_frame"], 100);

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A scene's encoder is a complete document, so provenance is equality with the video's
/// resolved encoder rather than a second boolean stored beside it. The sheet must be able
/// to fetch one scene and write the selection without changing any other scene.
#[tokio::test]
async fn scene_encoders_are_read_and_written_with_explicit_provenance() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Scene encoders").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    let document = dir
        .join("projects")
        .join(&id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    let inherited = av1ation_engine::default_project_config()["encoder"].clone();
    let ffmpeg = serde_json::json!({
        "FFmpeg": {
            "executable": null,
            "options": {},
            "append_color_data": true
        }
    });
    let mut second = saved_scene(ffmpeg.clone());
    second["start_frame"] = Value::from(24);
    second["end_frame"] = Value::from(48);
    record["condor"] = serde_json::json!({
        "scenes": [saved_scene(inherited.clone()), second]
    });
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let (status, list) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list["scenes"][0]["encoder_label"], "SVT-AV1");
    assert_eq!(list["scenes"][0]["encoder_custom"], false);
    assert_eq!(list["scenes"][1]["encoder_label"], "FFmpeg");
    assert_eq!(list["scenes"][1]["encoder_custom"], true);

    let (status, detail) = send(
        app.clone(),
        Request::get(format!(
            "/api/projects/{id}/videos/{video_id}/scenes/1/encoder"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{detail}");
    assert_eq!(detail["encoder"], ffmpeg);

    let (status, updated) = send(
        app.clone(),
        Request::put(format!(
            "/api/projects/{id}/videos/{video_id}/scenes/encoder"
        ))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "scenes": [0, 1], "encoder": inherited }).to_string(),
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["scenes"][0]["encoder_label"], "SVT-AV1");
    assert_eq!(updated["scenes"][0]["encoder_custom"], false);
    assert_eq!(
        updated["scenes"][1]["encoder_custom"], false,
        "writing the video encoder clears the scene's custom provenance"
    );

    let persisted: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("video document"))
            .expect("video json");
    assert_eq!(persisted["condor"]["scenes"][1]["encoder"], inherited);
    assert_eq!(
        persisted["condor"]["scenes"][1]["start_frame"], 24,
        "writing an encoder leaves the scene range alone"
    );

    // One bulk write is one undo entry: the single undo restores the table from before the
    // whole selection was changed, not only the last scene in it.
    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/projects/{id}/videos/{video_id}/scenes/undo"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (_, restored) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/videos/{video_id}/scenes"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(
        restored["scenes"][1]["encoder_label"], "FFmpeg",
        "undo restores the scene encoder the bulk write replaced"
    );
    assert_eq!(restored["scenes"][1]["encoder_custom"], true);

    let (status, error) = send(
        app.clone(),
        Request::put(format!(
            "/api/projects/{id}/videos/{video_id}/scenes/encoder"
        ))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "scenes": [99], "encoder": inherited }).to_string(),
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{error}");

    let (status, error) = send(
        app,
        Request::put(format!(
            "/api/projects/{id}/videos/{video_id}/scenes/encoder"
        ))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "scenes": [0], "encoder": { "Nope": {} } }).to_string(),
        ))
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{error}");

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_video_without_engine_state_accepts_its_first_manual_scene() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "First scene").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    // Nothing has run, so the video document has no `condor`. Marking a range is still a
    // valid first edit: the route seeds the table from the encoder the next run would use.
    let add = Request::post(format!(
        "/api/projects/{project_id}/videos/{video_id}/scenes/add"
    ))
    .header("content-type", "application/json")
    .body(Body::from(
        serde_json::json!({ "start_frame": 0, "end_frame": 24 }).to_string(),
    ))
    .unwrap();
    let (status, body) = send(app.clone(), add).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

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
    assert_eq!(list["scenes"].as_array().expect("scene rows").len(), 1);
    assert_eq!(list["scenes"][0]["start_frame"], 0);
    assert_eq!(list["scenes"][0]["end_frame"], 24);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn a_manual_scene_fills_a_gap_and_an_overlap_is_refused() {
    let dir = project_dir();
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        test_probes(),
        dir.clone(),
    ));
    let project_id = create_project(app.clone(), "Gap").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    // `add_scene` itself builds a complete engine `Scene`, including sequence data, which
    // keeps this fixture from copying the engine's serde shape into the test.
    let encoder = av1ation_engine::capability::catalogue::encoders()
        .into_iter()
        .next()
        .expect("a catalogue encoder")
        .default;
    let empty = serde_json::json!({ "scenes": [], "encoder": encoder });
    let seeded = av1ation_engine::run::reset::add_scene(&empty, 0, 24).expect("first scene");
    let seeded = av1ation_engine::run::reset::add_scene(&seeded, 48, 72).expect("second scene");

    let record_path = dir
        .join("projects")
        .join(&project_id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value = serde_json::from_str(
        &tokio::fs::read_to_string(&record_path)
            .await
            .expect("video record"),
    )
    .expect("record json");
    record["condor"] = seeded;
    tokio::fs::write(&record_path, record.to_string())
        .await
        .expect("write record");

    let add = Request::post(format!(
        "/api/projects/{project_id}/videos/{video_id}/scenes/add"
    ))
    .header("content-type", "application/json")
    .body(Body::from(
        serde_json::json!({ "start_frame": 24, "end_frame": 48 }).to_string(),
    ))
    .unwrap();
    let (status, body) = send(app.clone(), add).await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

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
    assert_eq!(list["scenes"].as_array().expect("scene rows").len(), 3);
    assert_eq!(list["scenes"][1]["start_frame"], 24);
    assert_eq!(list["scenes"][1]["end_frame"], 48);

    let overlap = Request::post(format!(
        "/api/projects/{project_id}/videos/{video_id}/scenes/add"
    ))
    .header("content-type", "application/json")
    .body(Body::from(
        serde_json::json!({ "start_frame": 20, "end_frame": 30 }).to_string(),
    ))
    .unwrap();
    let (status, body) = send(app.clone(), overlap).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_CONFIG");

    let (status, missing) = send(
        app.clone(),
        Request::get(format!(
            "/api/projects/{project_id}/videos/{}/audio-tracks?source=original",
            uuid::Uuid::new_v4()
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{missing}");

    let invalid_query = app
        .clone()
        .oneshot(
            Request::get(format!(
                "/api/projects/{project_id}/videos/{video_id}/audio-tracks?frame=not-a-number"
            ))
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .expect("router response");
    assert_eq!(invalid_query.status(), StatusCode::BAD_REQUEST);

    // Without FFmpeg in the fixed inventory the selector is simply absent, not an error.
    let (status, tracks) = send(
        app,
        Request::get(format!(
            "/api/projects/{project_id}/videos/{video_id}/audio-tracks?source=original"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(tracks["tracks"].as_array().expect("tracks").is_empty());
    assert!(
        tracks["detail"]
            .as_str()
            .expect("detail")
            .contains("FFmpeg")
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// Scene edits are one guarded surface: every mutation is refused while the video encodes,
/// every video-scoped route reports an unknown video, and each body route rejects an
/// unreadable document.
#[tokio::test]
async fn scene_routes_report_the_lock_unknown_videos_and_bad_bodies() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Scene surface").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let missing = uuid::Uuid::new_v4().to_string();
    let encoder = av1ation_engine::default_project_config()["encoder"].clone();

    let (status, started) = send(app.clone(), start_request(&project, &video)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    for (method, path, body) in [
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/scenes/encoder"),
            Some(serde_json::json!({ "scenes": [0], "encoder": {} })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/add"),
            Some(serde_json::json!({ "start_frame": 0, "end_frame": 24 })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/split"),
            Some(serde_json::json!({ "frame": 1 })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/merge"),
            Some(serde_json::json!({ "scenes": [0] })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/reset"),
            Some(serde_json::json!({ "scenes": [0] })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/undo"),
            None,
        ),
        (
            "PATCH",
            format!("/api/projects/{project}/videos/{video}/scenes/0"),
            Some(serde_json::json!({ "start_frame": 0, "end_frame": 12 })),
        ),
        (
            "DELETE",
            format!("/api/projects/{project}/videos/{video}/scenes/0"),
            None,
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/scenes/0/sequence-data"),
            Some(serde_json::json!({ "values": {} })),
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
            "PUT",
            format!("/api/projects/{project}/videos/{missing}/scenes/encoder"),
            Some(serde_json::json!({ "scenes": [0], "encoder": encoder })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{missing}/scenes/add"),
            Some(serde_json::json!({ "start_frame": 0, "end_frame": 24 })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{missing}/scenes/split"),
            Some(serde_json::json!({ "frame": 1 })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{missing}/scenes/merge"),
            Some(serde_json::json!({ "scenes": [0] })),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{missing}/scenes/reset"),
            Some(serde_json::json!({ "scenes": [0] })),
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/scenes"),
            None,
        ),
        (
            "GET",
            format!("/api/projects/{project}/videos/{missing}/scenes/0/encoder"),
            None,
        ),
        (
            "PATCH",
            format!("/api/projects/{project}/videos/{missing}/scenes/0"),
            Some(serde_json::json!({ "start_frame": 0, "end_frame": 12 })),
        ),
        (
            "DELETE",
            format!("/api/projects/{project}/videos/{missing}/scenes/0"),
            None,
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{missing}/scenes/0/sequence-data"),
            Some(serde_json::json!({ "values": {} })),
        ),
    ] {
        let (status, response) = send(app.clone(), route_request(method, &path, body)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {path}: {response}");
    }

    for (method, path) in [
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/scenes/encoder"),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/split"),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/merge"),
        ),
        (
            "POST",
            format!("/api/projects/{project}/videos/{video}/scenes/reset"),
        ),
        (
            "PATCH",
            format!("/api/projects/{project}/videos/{video}/scenes/0"),
        ),
        (
            "PUT",
            format!("/api/projects/{project}/videos/{video}/scenes/0/sequence-data"),
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
