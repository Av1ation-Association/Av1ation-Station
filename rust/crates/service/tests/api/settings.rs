//! HTTP tests for the `settings` route family.

use std::sync::Arc;

use av1ation_engine::CompletingRunner;

use crate::common::*;

#[tokio::test]
async fn settings_are_readable_before_any_write() {
    let app = router(health_state());
    let (status, body) = send(
        app,
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["theme"], "system");
    assert_eq!(body["row_density"], "comfortable");
    assert_eq!(body["reduce_motion"], false);
    assert_eq!(body["custom_tools"], serde_json::json!([]));
    assert_eq!(body["delete_chunks_on_success"], false);
}

#[tokio::test]
async fn a_fresh_data_dir_seeds_one_recommended_template_and_it_runs() {
    let dir = project_dir();
    let state = AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(CompletingRunner),
        test_probes(),
        dir.clone(),
    );
    state.seed_starter_template().await.expect("seed");
    assert!(
        state
            .seed_starter_template()
            .await
            .expect("second seed")
            .is_none(),
        "a fresh seed must run exactly once"
    );
    let app = router(state);

    let (status, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    let templates = settings["project_templates"]
        .as_array()
        .expect("the template list");
    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0]["name"], "Recommended");
    assert!(
        settings["default_project_template_id"].is_null(),
        "the starter must not become the default"
    );
    let template_id = templates[0]["id"].as_str().expect("template id").to_owned();

    let mark = Request::put("/api/settings/templates/default")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "id": template_id }).to_string(),
        ))
        .unwrap();
    let (status, body) = send(app.clone(), mark).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let project = create_project(app.clone(), "Starter").await;
    let video = add_video(app.clone(), &project, &dir).await;
    let (status, started) = send(app.clone(), start_request(&project, &video)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    wait_for_config_write(app.clone(), &project).await;
    cleanup_after_writers(&dir);
}

#[tokio::test]
async fn a_settings_write_preserves_the_custom_tool_list() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    tokio::fs::write(
        dir.join("config.json"),
        r#"{"theme":"dark","custom_tools":[{"kind":"x265","path":"C:/Tools/x265.exe"}]}"#,
    )
    .await
    .expect("seed settings");
    let app = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));

    let request = Request::patch("/api/settings")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"theme":"light"}"#))
        .unwrap();
    let (status, body) = send(app.clone(), request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["theme"], "light");
    assert_eq!(body["row_density"], "comfortable");
    assert_eq!(body["reduce_motion"], false);
    assert_eq!(body["delete_chunks_on_success"], false);
    assert_eq!(body["custom_tools"][0]["kind"], "x265");

    let text = tokio::fs::read_to_string(dir.join("config.json"))
        .await
        .expect("read settings");
    let value: serde_json::Value = serde_json::from_str(&text).expect("json");
    assert_eq!(value["theme"], "light");
    assert_eq!(value["temp_dir"], Value::Null);
    assert_eq!(value["custom_tools"][0]["path"], "C:/Tools/x265.exe");

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// A portable installation owns its config, project data, and scratch under the install
/// directory. A saved scratch preference must not move work back out of that tree.
#[tokio::test]
async fn a_portable_data_root_keeps_storage_inside_the_installation() {
    let install = project_dir();
    let data = install.join("data");
    let outside = install.join("outside-temp");
    tokio::fs::create_dir_all(&data).await.expect("data dir");
    tokio::fs::write(install.join("portable"), b"")
        .await
        .expect("portable marker");
    tokio::fs::write(
        data.join("config.json"),
        serde_json::json!({ "temp_dir": outside.display().to_string() }).to_string(),
    )
    .await
    .expect("seed settings");

    let state = AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        test_probes(),
        data.clone(),
    );
    state.hydrate_storage().await;
    let app = router(state);
    let project = create_project(app.clone(), "Portable").await;
    let video = add_video(app.clone(), &project, &install).await;

    let document = data
        .join("projects")
        .join(&project)
        .join("videos")
        .join(format!("{video}.json"));
    let mut record: Value =
        serde_json::from_str(&tokio::fs::read_to_string(&document).await.expect("video"))
            .expect("video json");
    record["temp_directory"] = Value::from(outside.display().to_string());
    tokio::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .await
    .expect("rewrite video");

    let (status, storage) = send(
        app.clone(),
        Request::get("/api/storage").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{storage}");
    assert_eq!(
        storage["temporary_directory"],
        data.join("temp").display().to_string()
    );
    assert_eq!(
        storage["default_directory"],
        data.join("temp").display().to_string()
    );

    let (status, video_storage) = send(
        app,
        Request::get(format!("/api/projects/{project}/videos/{video}/storage"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{video_storage}");
    assert_eq!(
        video_storage["directory"],
        data.join("temp").join(&video).display().to_string(),
        "a portable video cannot keep a saved scratch directory outside the install"
    );
    assert_eq!(
        video_storage["inherited_directory"],
        data.join("temp").join(&video).display().to_string()
    );

    std::fs::remove_dir_all(install).expect("cleanup");
}

#[tokio::test]
async fn a_partial_settings_patch_preserves_omitted_fields_and_clears_a_null_temp_dir() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let custom_temp = dir.join("custom-temp");
    let seeded = serde_json::json!({
        "theme": "dark",
        "row_density": "compact",
        "reduce_motion": true,
        "temp_dir": custom_temp.display().to_string(),
        "delete_chunks_on_success": true,
        "custom_tools": [{ "kind": "x265", "path": "C:/Tools/x265.exe" }]
    });
    tokio::fs::write(dir.join("config.json"), seeded.to_string())
        .await
        .expect("seed settings");
    let app = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));

    let patch = |body: Value| {
        Request::patch("/api/settings")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };

    let (status, body) = send(
        app.clone(),
        patch(serde_json::json!({ "reduce_motion": false })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["theme"], "dark");
    assert_eq!(body["row_density"], "compact");
    assert_eq!(body["reduce_motion"], false);
    assert_eq!(body["temp_dir"], custom_temp.display().to_string());
    assert_eq!(body["delete_chunks_on_success"], true);
    assert_eq!(body["custom_tools"][0]["kind"], "x265");

    let (status, body) = send(app.clone(), patch(serde_json::json!({ "temp_dir": null }))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["theme"], "dark");
    assert_eq!(body["reduce_motion"], false);
    let text = tokio::fs::read_to_string(dir.join("config.json"))
        .await
        .expect("read settings");
    let value: serde_json::Value = serde_json::from_str(&text).expect("json");
    assert_eq!(
        value["temp_dir"],
        Value::Null,
        "an explicit null clears the path"
    );

    let (status, body) = send(app, patch(serde_json::json!({ "future_key": true }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["code"], "INVALID_CONFIG");

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn concurrent_settings_patches_keep_both_fields() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let app = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));
    let patch = |body: Value| {
        Request::patch("/api/settings")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };

    let (first, second) = tokio::join!(
        send(app.clone(), patch(serde_json::json!({ "theme": "light" }))),
        send(
            app.clone(),
            patch(serde_json::json!({ "delete_chunks_on_success": true })),
        ),
    );
    assert_eq!(first.0, StatusCode::OK, "{}", first.1);
    assert_eq!(second.0, StatusCode::OK, "{}", second.1);

    let (status, body) = send(
        app,
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["theme"], "light");
    assert_eq!(body["delete_chunks_on_success"], true);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn a_template_write_and_a_settings_patch_share_one_document() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let app = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));

    let create = Request::post("/api/settings/templates")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"name":"Hero"}"#))
        .unwrap();
    let (status, template) = send(app.clone(), create).await;
    assert_eq!(status, StatusCode::CREATED, "{template}");
    let template_id = template["id"].as_str().expect("template id").to_owned();

    let patch = Request::patch("/api/settings")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"theme":"light"}"#))
        .unwrap();
    let (status, body) = send(app.clone(), patch).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, body) = send(
        app,
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["theme"], "light");
    assert!(
        body["project_templates"]
            .as_array()
            .is_some_and(|templates| templates
                .iter()
                .any(|entry| entry["id"].as_str() == Some(template_id.as_str()))),
        "the template write must survive the settings patch"
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn a_temp_directory_setting_moves_the_scratch_root_for_new_work() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let id = create_project(app.clone(), "Scratch").await;
    let video_id = add_video(app.clone(), &id, &dir).await;

    // Make the main input a script so the state response exposes `condor_temp_dir`.
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

    let custom = dir.join("elsewhere");
    let request = Request::patch("/api/settings")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({ "temp_dir": custom.display().to_string() }).to_string(),
        ))
        .unwrap();
    let (status, settings) = send(app.clone(), request).await;
    assert_eq!(status, StatusCode::OK, "{settings}");

    let (status, state) = send(
        app,
        Request::get(format!("/api/projects/{id}/videos/{video_id}/state"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{state}");
    assert_eq!(
        state["script_data"][0]["keys"][3]["value"],
        Value::from(custom.join(&video_id).display().to_string()),
        "the documented scratch directory must be the one the next run uses"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_relative_temp_directory_is_rejected() {
    let app = router(health_state());
    let request = Request::patch("/api/settings")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"temp_dir":"relative/temp"}"#))
        .unwrap();
    let (status, body) = send(app, request).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("absolute")),
        "{body}"
    );
}

#[tokio::test]
async fn the_scene_model_is_stored_only_when_the_file_exists() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let model = dir.join("transnetv2.onnx");
    tokio::fs::write(&model, b"not a real model")
        .await
        .expect("model");
    let app = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));

    let put = |path: Value| {
        Request::put("/api/settings/scene-model")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::json!({ "path": path }).to_string()))
            .unwrap()
    };

    // A relative path would resolve against the service's working directory.
    let (status, body) = send(app.clone(), put(Value::from("models/transnetv2.onnx"))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("absolute")),
        "{body}"
    );

    // A typo is refused here rather than at the start of an encode.
    let missing = dir.join("missing.onnx");
    let (status, body) = send(app.clone(), put(Value::from(missing.display().to_string()))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("No model file")),
        "{body}"
    );

    let stored = model.display().to_string();
    let (status, body) = send(app.clone(), put(Value::from(stored.clone()))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["scene_model"], stored);

    let (_, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(settings["scene_model"], stored);

    // `null` restores the engine's own search order.
    let (status, body) = send(app, put(Value::Null)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.get("scene_model"), None);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn the_script_editor_interpreter_is_stored_only_when_the_file_exists() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let python = dir.join("python.exe");
    tokio::fs::write(&python, b"not a real interpreter")
        .await
        .expect("interpreter");
    let app = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));

    let put = |path: Value| {
        Request::put("/api/settings/python-interpreter")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::json!({ "path": path }).to_string()))
            .unwrap()
    };

    // A relative path would resolve against the service's working directory.
    let (status, body) = send(app.clone(), put(Value::from("venv/Scripts/python.exe"))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("absolute")),
        "{body}"
    );

    // A typo is refused here rather than when the script page opens.
    let missing = dir.join("missing-python.exe");
    let (status, body) = send(app.clone(), put(Value::from(missing.display().to_string()))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("No file exists")),
        "{body}"
    );

    let stored = python.display().to_string();
    let (status, body) = send(app.clone(), put(Value::from(stored.clone()))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["python_interpreter"], stored);

    let (_, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(settings["python_interpreter"], stored);

    // The inventory names the interpreter the editor forwards to the server, so the page
    // and the settings row cannot disagree about which environment is analysed.
    let (status, info) = send(
        app.clone(),
        Request::get("/api/editor/language-server")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{info}");
    assert_eq!(info["interpreter"], stored);
    assert_eq!(
        info.get("interpreter_version"),
        None,
        "a file that is not an interpreter must not claim a version"
    );

    // `null` returns to the `python` the server resolves itself.
    let (status, body) = send(app, put(Value::Null)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.get("python_interpreter"), None);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn the_vapoursynth_provider_choice_is_stored_for_the_next_start() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let tools = dir.join("tools");
    stage_vapoursynth(&tools);
    let state = AppState::with_runner_and_data_dir(None, Arc::new(FakeRunner), Some(dir.clone()))
        .with_tools_dir(Some(tools));
    let app = router(state);

    let put = |body: Value| {
        Request::put("/api/settings/tool-source")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };

    // The setting is a provider choice, not a place to park arbitrary keys.
    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "scene-model", "source": "system" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["code"], "INVALID_CONFIG");

    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "vapoursynth", "source": "auto" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");

    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "vapoursynth", "source": "system" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["tool_sources"]["vapoursynth"], "system");

    // The staged interpreter and VSScript make the bundled runtime selectable on this host.
    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "vapoursynth", "source": "bundled" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (_, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(settings["tool_sources"]["vapoursynth"], "bundled");

    // `null` removes the entry and restores automatic selection.
    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "vapoursynth", "source": null })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.get("tool_sources"), None);

    // Every bundled capability saves through the same route, not only VapourSynth.
    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "ffmpeg", "source": "system" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["tool_sources"]["ffmpeg"], "system");

    // A build without a staged runtime refuses a choice that would resolve to nothing.
    let bare = router(AppState::with_runner_and_data_dir(
        None,
        Arc::new(FakeRunner),
        Some(dir.clone()),
    ));
    let (status, body) = send(
        bare,
        put(serde_json::json!({ "id": "vapoursynth", "source": "bundled" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("bundled VapourSynth")),
        "{body}"
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn a_bundled_metric_choice_is_validated_for_the_row_that_was_clicked() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let tools = dir.join("tools");
    let library = tools.join("lib/libvmaf.dll");
    tokio::fs::create_dir_all(library.parent().expect("lib"))
        .await
        .expect("lib");
    tokio::fs::write(&library, b"fixture")
        .await
        .expect("library");
    let app = router(
        AppState::with_runner_and_data_dir(None, Arc::new(FakeRunner), Some(dir.clone()))
            .with_tools_dir(Some(tools)),
    );

    let put = |body: Value| {
        Request::put("/api/settings/tool-source")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    };

    // VMAF is the row with a staged library, so naming it saves the shared `metrics` key.
    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "metric:vmaf", "source": "bundled" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["tool_sources"]["metrics"], "bundled");

    // The request names the inventory row, so a row with no staged library is refused even
    // though the shared key already holds a bundled choice saved from VMAF.
    let (status, body) = send(
        app.clone(),
        put(serde_json::json!({ "id": "metric:ssimulacra2", "source": "bundled" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("bundled provider")),
        "{body}"
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn an_unknown_theme_is_rejected() {
    let app = router(health_state());
    let request = Request::patch("/api/settings")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"theme":"neon"}"#))
        .unwrap();
    let (status, body) = send(app, request).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "INVALID_CONFIG");
}

/// A new project copies the template marked default instead of the engine defaults, and the
/// template itself is readable so the Settings editor can render it before any project exists.
#[tokio::test]
async fn project_defaults_are_saved_and_copied_into_new_projects() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let template_id = saved_template_id(&app).await;

    let document = serde_json::json!({
        "sequences": {
            "scene_detector": {
                "method": { "AVSceneChange": { "minimum_length": 99 } }
            }
        }
    });
    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{template_id}/defaults"))
            .header("content-type", "application/json")
            .body(Body::from(document.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(
        saved["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        99
    );

    let id = create_project(app.clone(), "From defaults").await;
    let (status, config) = send(
        app.clone(),
        Request::get(format!("/api/projects/{id}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        99
    );

    // Resetting the template returns it to the engine defaults; the next project follows,
    // while the project created above keeps its own copy.
    let (status, _) = send(
        app.clone(),
        Request::post(format!(
            "/api/settings/templates/{template_id}/defaults/reset"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let second = create_project(app.clone(), "Engine defaults").await;
    let (_, config) = send(
        app.clone(),
        Request::get(format!("/api/projects/{second}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        24
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// Templates are independent documents: adding one, marking it default, applying it to an
/// existing project, restoring the previous documents, and deleting it each name one id.
#[tokio::test]
async fn multiple_templates_are_created_applied_defaulted_and_deleted() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    saved_template_id(&app).await;

    let (status, created) = send(
        app.clone(),
        Request::post("/api/settings/templates")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":"Grainy"}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let template_id = created["id"].as_str().expect("template id").to_owned();
    assert_eq!(created["name"], "Grainy");

    let (status, _) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{template_id}/defaults"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "sequences": {
                        "scene_detector": {
                            "method": { "AVSceneChange": { "minimum_length": 77 } }
                        }
                    }
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let existing = create_project(app.clone(), "Existing").await;
    let (status, listed) = send(
        app.clone(),
        Request::put("/api/settings/templates/default")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "id": template_id }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed.as_array().map(Vec::len), Some(2));

    let from_template = create_project(app.clone(), "From Grainy").await;
    let (_, config) = send(
        app.clone(),
        Request::get(format!("/api/projects/{from_template}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        77,
        "a new project copies the marked template"
    );

    let (status, applied) = send(
        app.clone(),
        Request::post(format!("/api/projects/{existing}/template"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "template_id": template_id }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{applied}");
    assert_eq!(
        applied["applied"]["config"]["sequences"]["scene_detector"]["method"]["AVSceneChange"]["minimum_length"],
        77
    );
    assert_eq!(
        applied["previous"]["config"]["sequences"]["scene_detector"]["method"]["AVSceneChange"]["minimum_length"],
        24,
        "the response carries the documents to undo with"
    );

    let (status, _) = send(
        app.clone(),
        Request::put(format!("/api/projects/{existing}/defaults"))
            .header("content-type", "application/json")
            .body(Body::from(applied["previous"].to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (_, config) = send(
        app.clone(),
        Request::get(format!("/api/projects/{existing}/config"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(
        config["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        24,
        "one undo restores the project's own documents"
    );

    let (status, _) = send(
        app.clone(),
        Request::delete(format!("/api/settings/templates/{template_id}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(
        settings["project_templates"].as_array().map(Vec::len),
        Some(1)
    );
    assert_ne!(settings["default_project_template_id"], template_id);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// Resetting one section must not undo deliberate overrides in another. A full reset was the
/// only option, so tuning the muxer after the detector made the detector reset too.
#[tokio::test]
async fn a_section_reset_leaves_the_other_sections_alone() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let template_id = saved_template_id(&app).await;

    let document = serde_json::json!({
        "sequences": {
            "scene_detector": {
                "method": { "AVSceneChange": { "minimum_length": 99 } }
            },
            "target_quality": {
                "metric": {
                    "SSIMULACRA2": {
                        "target_range": [74, 76],
                        "resolution": null,
                        "threads": null,
                        "gpu_id": null
                    }
                },
                "maximum_probes": 9,
                "quantizer_range": [0, 51],
                "interpolators": ["FritschCarlson", "Pchip"],
                "probing": { "strategy": "Whole", "statistic": "Mean" }
            }
        }
    });
    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{template_id}/defaults"))
            .header("content-type", "application/json")
            .body(Body::from(document.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");

    let (status, reset) = send(
        app.clone(),
        Request::post(format!(
            "/api/settings/templates/{template_id}/defaults/reset/scene-detection"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{reset}");
    assert_eq!(
        reset["values"]["sequences.scene_detector.method.AVSceneChange.minimum_length"]["value"],
        24,
        "the detector returns to the engine default"
    );
    assert_eq!(
        reset["values"]["sequences.target_quality"]["value"]["maximum_probes"], 9,
        "the target-quality override is untouched"
    );

    let (status, missing) = send(
        app,
        Request::post(format!(
            "/api/settings/templates/{template_id}/defaults/reset/not-a-section"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(missing["code"], "NOT_FOUND");

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// The Encoding section displays the Parallel Encoder input, so resetting it must clear that
/// override. Workers belong to the Parallel Encoder screen and a section reset must not reach
/// across screens.
#[tokio::test]
async fn an_encoding_section_reset_clears_only_the_parallel_encoder_input() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let template_id = saved_template_id(&app).await;

    let document = serde_json::json!({
        "sequences": {
            "parallel_encoder": {
                "input": script_input("clip.set_output()"),
                "workers": 6,
                "scenes_directory": "C:/scenes",
                "max_tries": 5,
                "validate_frame_count": false
            }
        }
    });
    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{template_id}/defaults"))
            .header("content-type", "application/json")
            .body(Body::from(document.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");

    let (status, reset) = send(
        app.clone(),
        Request::post(format!(
            "/api/settings/templates/{template_id}/defaults/reset/encoding"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{reset}");

    let (status, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    let template = settings["project_templates"]
        .as_array()
        .expect("the settings carry the template list")
        .iter()
        .find(|template| template["id"].as_str() == Some(template_id.as_str()))
        .expect("the saved template is listed");
    let parallel = &template["config"]["sequences"]["parallel_encoder"];
    assert!(
        parallel["input"].is_null(),
        "the Encoding reset clears the input override: {parallel}"
    );
    assert_eq!(
        parallel["workers"], 6,
        "the workers survive a reset that does not own them: {parallel}"
    );
    assert_eq!(
        parallel["scenes_directory"], "C:/scenes",
        "the scenes directory belongs to the Parallel Encoder screen: {parallel}"
    );
    assert_eq!(
        parallel["max_tries"], 5,
        "the retry count belongs to the Parallel Encoder screen: {parallel}"
    );
    assert_eq!(
        parallel["validate_frame_count"], false,
        "the frame-count check belongs to the Parallel Encoder screen: {parallel}"
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// Every template route with a JSON body goes through the one unreadable-body envelope, and
/// every route that names a template reports a missing id instead of creating or editing one.
#[tokio::test]
async fn template_routes_serve_validate_bodies_and_report_unknown_ids() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let template_id = saved_template_id(&app).await;

    for (method, path) in [
        ("POST", "/api/settings/templates".to_owned()),
        ("PUT", "/api/settings/templates/default".to_owned()),
        ("PUT", format!("/api/settings/templates/{template_id}")),
        (
            "PUT",
            format!("/api/settings/templates/{template_id}/defaults"),
        ),
        (
            "PUT",
            format!("/api/settings/templates/{template_id}/general"),
        ),
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
        assert_eq!(body["code"], "INVALID_CONFIG");
    }

    let (status, templates) = send(
        app.clone(),
        Request::get("/api/settings/templates")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{templates}");
    assert_eq!(templates.as_array().map(Vec::len), Some(1));

    let (status, defaults) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{template_id}/defaults"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{defaults}");
    assert!(defaults["values"].is_object());

    let (status, general) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{template_id}/general"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{general}");
    assert!(general["input_kind"].is_string());

    let (status, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    let template = settings["project_templates"][0].clone();
    let update = serde_json::json!({
        "name": "Unknown target",
        "config": template["config"],
        "general": template["general"]
    });
    let missing = "not-a-template";

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{missing}"))
            .header("content-type", "application/json")
            .body(Body::from(update.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::delete(format!("/api/settings/templates/{missing}"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{missing}/defaults"))
            .header("content-type", "application/json")
            .body(Body::from(template["config"].to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::post(format!("/api/settings/templates/{missing}/defaults/reset"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{missing}/defaults"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{missing}/general"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{missing}/general"))
            .header("content-type", "application/json")
            .body(Body::from(template["general"].to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{missing}/scripts"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = send(
        app,
        Request::get(format!("/api/settings/templates/{missing}/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// A template file is one sanitized document. Export clears every host path, import accepts
/// the same shape, a duplicate name is suffixed, and the default marker never moves.
#[tokio::test]
async fn a_template_round_trips_without_host_paths_and_import_suffixes_its_name() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let (status, created) = send(
        app.clone(),
        Request::post("/api/settings/templates")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":"Portable"}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let template_id = created["id"].as_str().expect("template id").to_owned();

    let mut config = created["config"].clone();
    config["encoder"]["SVTAV1"]["executable"] = serde_json::json!("C:/Tools/x265.exe");
    config["sequences"]["parallel_encoder"]["scenes_directory"] = serde_json::json!("C:/scenes");
    config["sequences"]["scene_concatenator"]["scenes_directory"] = serde_json::json!("C:/scenes");
    config["sequences"]["scene_concatenator"]["output"] = serde_json::json!("C:/out.mkv");
    config["sequences"]["scene_detector"]["input"]["Video"]["path"] =
        serde_json::json!("C:/media/clip.mkv");
    let mut general = created["general"].clone();
    general["output_mode"] = serde_json::json!("folder");
    general["output_folder"] = serde_json::json!(dir.to_string_lossy().to_string());

    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{template_id}"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "name": "Portable",
                    "config": config,
                    "general": general,
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(
        saved["config"]["encoder"]["SVTAV1"]["executable"],
        "C:/Tools/x265.exe"
    );
    assert_eq!(saved["general"]["output_mode"], "folder");

    let (status, exported) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{template_id}/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{exported}");
    assert_eq!(exported["filename"], "portable-template.json");
    assert_eq!(exported["archive"]["kind"], "av1ation.project-template");
    assert_eq!(exported["archive"]["schema_version"], 1);
    assert_eq!(
        exported["archive"]["template"]["config"]["encoder"]["SVTAV1"]["executable"],
        serde_json::Value::Null
    );
    assert_eq!(
        exported["archive"]["template"]["config"]["sequences"]["scene_detector"]["input"],
        serde_json::Value::Null
    );
    assert_eq!(
        exported["archive"]["template"]["general"]["output_mode"],
        "next_to_input"
    );
    assert_eq!(
        exported["report"]["removed"],
        serde_json::json!([
            "Custom encoder executable",
            "Output folder",
            "Scene directories",
            "Sequence input paths",
            "Sequence output path",
        ])
    );
    assert_eq!(exported["report"]["includes_scripts"], false);
    assert_eq!(exported["report"]["includes_variables"], false);

    let (_, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    let default_before = settings["default_project_template_id"].clone();

    let (status, imported) = send(
        app.clone(),
        Request::post("/api/settings/templates/import")
            .header("content-type", "application/json")
            .body(Body::from(exported["archive"].to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{imported}");
    assert_eq!(imported["template"]["name"], "Portable (2)");
    assert_ne!(imported["template"]["id"], template_id);
    assert_eq!(
        imported["removed"],
        serde_json::json!([]),
        "the exported archive is already sanitized"
    );

    let (_, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(settings["default_project_template_id"], default_before);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn a_template_file_rejects_a_wrong_kind_version_or_shape() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let (_, created) = send(
        app.clone(),
        Request::post("/api/settings/templates")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":"Portable"}"#))
            .unwrap(),
    )
    .await;
    let template_id = created["id"].as_str().expect("template id").to_owned();
    let (_, exported) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{template_id}/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    let archive = exported["archive"].clone();

    let mut wrong_kind = archive.clone();
    wrong_kind["kind"] = serde_json::json!("av1ation.project-archive");
    let (status, body) = send(
        app.clone(),
        Request::post("/api/settings/templates/import")
            .header("content-type", "application/json")
            .body(Body::from(wrong_kind.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(
        body["message"],
        "This JSON file is not a project template archive."
    );

    let mut newer = archive.clone();
    newer["schema_version"] = serde_json::json!(2);
    let (status, body) = send(
        app.clone(),
        Request::post("/api/settings/templates/import")
            .header("content-type", "application/json")
            .body(Body::from(newer.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("schema version 2"))
    );

    let mut unknown = archive.clone();
    unknown["future"] = serde_json::json!(true);
    let (status, body) = send(
        app.clone(),
        Request::post("/api/settings/templates/import")
            .header("content-type", "application/json")
            .body(Body::from(unknown.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(
        body["message"],
        "This file is not a valid project template."
    );

    let (status, body) = send(
        app.clone(),
        Request::post("/api/settings/templates/import")
            .header("content-type", "application/json")
            .body(Body::from("{"))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["message"], "The request body could not be read.");

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// A General input that names a `.vpy` file cannot be made portable, so export refuses it
/// with the action that resolves it rather than writing an archive import would reject.
#[tokio::test]
async fn export_refuses_a_general_script_file() {
    let dir = project_dir();
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let app = router(project_state(&dir));
    let script = dir.join("portable.vpy");
    tokio::fs::write(&script, "clip = None\n")
        .await
        .expect("script");

    let (_, created) = send(
        app.clone(),
        Request::post("/api/settings/templates")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":"Scripted"}"#))
            .unwrap(),
    )
    .await;
    let template_id = created["id"].as_str().expect("template id").to_owned();
    let mut general = created["general"].clone();
    general["input_kind"] = serde_json::json!("vapour_synth_script");
    general["script_mode"] = serde_json::json!("file");
    general["script"] = serde_json::json!(script.to_string_lossy().to_string());
    general["script_text"] = serde_json::Value::Null;

    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{template_id}"))
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "name": "Scripted",
                    "config": created["config"],
                    "general": general,
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");

    let (status, body) = send(
        app,
        Request::get(format!("/api/settings/templates/{template_id}/export"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|message| message.contains("script file"))
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// The machine-level scene model is part of the encode lock even though it is not a project
/// setting: changing it would alter the next decode while the current run reads the old one.
#[tokio::test]
async fn the_scene_model_is_locked_while_a_run_is_active() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project = create_project(app.clone(), "Scene model").await;
    let video = add_video(app.clone(), &project, &dir).await;

    let (status, started) = send(app.clone(), start_request(&project, &video)).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    let run_id = started["run_id"].as_str().expect("run id").to_owned();

    let (status, body) = send(
        app.clone(),
        Request::put("/api/settings/scene-model")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "path": "models/missing.onnx" }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::LOCKED, "{body}");

    let cancel = Request::delete(format!("/api/runs/{run_id}"))
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), cancel).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    wait_for_config_write(app, &project).await;
    std::fs::remove_dir_all(dir).expect("cleanup");
}
