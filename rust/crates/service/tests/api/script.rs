//! HTTP tests for the `script` route family.

use crate::common::*;

#[tokio::test]
async fn the_language_server_inventory_answers_without_a_server() {
    let app = router(health_state());
    let (status, body) = send(
        app,
        Request::get("/api/editor/language-server")
            .body(Body::empty())
            .unwrap(),
    )
    .await;

    // Absence is a supported answer: the editor keeps its bundled completion.
    assert_eq!(status, StatusCode::OK);
    assert!(body["available"].is_boolean());
    assert!(
        body["label"]
            .as_str()
            .is_some_and(|label| !label.is_empty())
    );
    assert!(
        body["detail"]
            .as_str()
            .is_some_and(|detail| !detail.is_empty())
    );
    assert!(body["kind"].is_string());
}

#[tokio::test]
async fn the_interpreter_picker_lists_the_saved_interpreter_first() {
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

    // An empty machine is still an array, not an error: the picker can say "nothing
    // found" without the page failing.
    let (status, body) = send(
        app.clone(),
        Request::get("/api/editor/interpreters")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["interpreters"].is_array(), "{body}");

    let stored = python.display().to_string();
    let (status, body) = send(
        app.clone(),
        Request::put("/api/settings/python-interpreter")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "path": stored }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // A setting that no longer answers stays in the list: the row already marks it
    // unverified, and dropping it would move the user without their consent.
    let (status, body) = send(
        app,
        Request::get("/api/editor/interpreters")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["interpreters"][0]["path"], stored);
    assert_eq!(body["interpreters"][0]["source"], "setting");
    assert_eq!(body["interpreters"][0].get("version"), None);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

/// A script export must read the video's live module when one has been written, and only
/// fall back to embedding it when there is nothing live to read. The module is deliberately
/// not executed here: a service test must not require VapourSynth or a Python interpreter.
#[tokio::test]
async fn a_video_script_export_reads_live_data_and_omits_the_embedded_module() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let project_id = create_project(app.clone(), "Export").await;
    let video_id = add_video(app.clone(), &project_id, &dir).await;

    let document = dir
        .join("projects")
        .join(&project_id)
        .join("videos")
        .join(format!("{video_id}.json"));
    let mut record: Value =
        serde_json::from_str(&std::fs::read_to_string(&document).expect("the video document"))
            .expect("video json");
    let encoder = av1ation_engine::default_project_config()["encoder"].clone();
    record["condor"] = serde_json::json!({ "scenes": [saved_scene(encoder)] });
    std::fs::write(
        &document,
        serde_json::to_string(&record).expect("video json"),
    )
    .expect("rewrite the video document");

    let chunks = dir.join("temp").join(&video_id);
    tokio::fs::create_dir_all(&chunks).await.expect("chunk dir");
    tokio::fs::write(
        chunks.join(av1ation_engine::script::module::MODULE_FILE),
        av1ation_engine::script::module::module_source(),
    )
    .await
    .expect("generated module");
    tokio::fs::write(
        chunks.join(av1ation_engine::script::module::DATA_FILE),
        "{\"scenes\":[]}",
    )
    .await
    .expect("generated document");

    let script = "import condor_data\nclip.set_output()\n";
    let request = || {
        Request::post("/api/script/materialise")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "project_id": project_id,
                    "video_id": video_id,
                    "script": script,
                })
                .to_string(),
            ))
            .unwrap()
    };

    let (status, live) = send(app.clone(), request()).await;
    assert_eq!(status, StatusCode::OK, "{live}");
    let live_source = live["source"].as_str().expect("live source");
    assert!(
        live_source.contains("_av1ation_sys.path.insert(0, _AV1ATION_DATA_DIR)"),
        "the live preamble reads the video's scratch directory"
    );
    assert!(!live_source.contains("_AV1ATION_CONDOR_DATA"));
    assert!(!live_source.contains("_AV1ATION_CONDOR_VALUES"));
    assert!(
        live_source.ends_with(script),
        "the user's script is appended"
    );
    assert_eq!(live["variables"].as_array().map(Vec::len), Some(7));

    tokio::fs::remove_file(chunks.join(av1ation_engine::script::module::MODULE_FILE))
        .await
        .expect("remove module");
    tokio::fs::remove_file(chunks.join(av1ation_engine::script::module::DATA_FILE))
        .await
        .expect("remove document");

    let (status, embedded) = send(app, request()).await;
    assert_eq!(status, StatusCode::OK, "{embedded}");
    let embedded_source = embedded["source"].as_str().expect("embedded source");
    assert!(embedded_source.contains("_AV1ATION_CONDOR_DATA"));
    assert!(embedded_source.contains("_AV1ATION_CONDOR_VALUES"));
    assert!(!embedded_source.contains("_av1ation_sys.path.insert"));
    assert!(embedded_source.ends_with(script));
    assert!(
        live_source.len() < embedded_source.len(),
        "live data must not be embedded as well"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

/// A project's and the template's script inputs are scanned before any video is queued.
///
/// The lookup is a fixture table, so this test asserts the structured rows without loading
/// the host's VapourSynth install. `std` resolves; `hqdn3d` does not.
#[tokio::test]
async fn a_missing_plugin_is_reported_for_a_project_and_the_template() {
    use av1ation_engine::script::plugins::PluginLookup;

    let dir = project_dir();
    let lookup: Arc<PluginLookup> =
        Arc::new(|namespace: &str, _function: Option<&str>| Some(namespace == "std"));
    let app = router(
        AppState::with_runner_probes_and_data_dir(
            None,
            Arc::new(FakeRunner),
            test_probes(),
            dir.clone(),
        )
        .with_plugin_lookup(lookup),
    );
    let project_id = create_project(app.clone(), "Plugins").await;
    let template_id = saved_template_id(&app).await;
    let script = include_str!("../fixtures/missing-plugin.vpy");
    let general = serde_json::json!({
        "input_kind": "vapour_synth_script",
        "output_mode": "next_to_input",
        "script_mode": "text",
        "script_text": script,
    });

    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/projects/{project_id}/general"))
            .header("content-type", "application/json")
            .body(Body::from(general.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");

    let (status, report) = send(
        app.clone(),
        Request::get(format!("/api/projects/{project_id}/scripts"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["problems"][0]["context"], "General input");
    assert_eq!(report["problems"][0]["namespace"], "hqdn3d");
    assert!(report.get("error").is_none(), "the scan itself succeeded");

    let (status, saved) = send(
        app.clone(),
        Request::put(format!("/api/settings/templates/{template_id}/general"))
            .header("content-type", "application/json")
            .body(Body::from(general.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");

    let (status, report) = send(
        app.clone(),
        Request::get(format!("/api/settings/templates/{template_id}/scripts"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{report}");
    assert_eq!(report["problems"][0]["context"], "General input");
    assert_eq!(report["problems"][0]["namespace"], "hqdn3d");

    // The same fixture reaches the per-video preflight once a queue entry exists.
    let video_id = add_video(app.clone(), &project_id, &dir).await;
    let (status, validation) = send(
        app,
        Request::post(format!(
            "/api/projects/{project_id}/videos/{video_id}/validate"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{validation}");
    assert_eq!(validation["plugin_problems"][0]["namespace"], "hqdn3d");
    assert_eq!(validation["plugin_problems"][0]["context"], "General input");

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}
