//! HTTP tests for the `system` route family.

use crate::common::*;

#[tokio::test]
async fn health_reports_the_package_and_engine_versions() {
    let app = router(health_state());
    let (status, body) = send(
        app,
        Request::get("/api/health").body(Body::empty()).unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], "Av1ation Station");
    assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(body["engine_version"], av1ation_engine::ENGINE_VERSION);
    assert_eq!(body["engine_revision"], av1ation_engine::ENGINE_REVISION);
    assert_eq!(body["api_version"], av1ation_contracts::API_VERSION);

    let preflight = &body["preflight"];
    // Two engine probes plus the always-present TransNetV2 model row. The model's
    // availability depends on this machine's search path, so the count is derived from the
    // rows rather than hardcoded.
    let checks = preflight["checks"].as_array().expect("checks array");
    assert_eq!(preflight["total_count"], 3);
    assert_eq!(checks.len(), 3);
    assert_eq!(preflight["checks"][0]["id"], "vapoursynth");
    assert_eq!(preflight["checks"][0]["capability"], "decode");
    assert_eq!(preflight["checks"][0]["available"], true);
    assert_eq!(
        preflight["checks"][1]["remediation"],
        "Install `vvencapp` and put it on PATH."
    );
    assert_eq!(preflight["checks"][2]["id"], "scene-model");
    assert_eq!(
        preflight["available_count"],
        checks
            .iter()
            .filter(|check| check["available"] == true)
            .count()
    );
}

#[tokio::test]
async fn toolchain_summary_matches_the_reviewed_lock() {
    let app = router(health_state());
    let (status, body) = send(
        app,
        Request::get("/api/toolchain").body(Body::empty()).unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let target = if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else {
        "x86_64-unknown-linux-gnu"
    };
    assert_eq!(body["target"], target);

    let lock_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packaging/toolchain.lock.json");
    let lock: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(lock_path).expect("read lock"))
            .expect("parse lock");
    assert_eq!(body["revision"], lock["revision"]);

    let expected = lock["targets"][target]["components"]
        .as_object()
        .expect("components object");
    let actual = body["components"].as_array().expect("components array");
    assert_eq!(actual.len(), expected.len());
    for component in actual {
        let id = component["id"].as_str().expect("component id");
        let recorded = expected.get(id).expect("locked component");
        assert_eq!(component["version"], recorded["version"], "{id}");
        assert_eq!(component["license"], recorded["license"], "{id}");
        assert_eq!(component["sha256"], recorded["artifact"]["sha256"], "{id}");
        assert!(
            component["source_url"]
                .as_str()
                .is_some_and(|url| url.starts_with("https://")),
            "{id} has a source link"
        );
    }
}

#[tokio::test]
async fn preflight_can_be_refreshed_explicitly() {
    let app = router(health_state());
    let (status, body) = send(
        app.clone(),
        Request::post("/api/preflight/refresh")
            .body(Body::empty())
            .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let checks = body["checks"].as_array().expect("checks array");
    assert_eq!(body["total_count"], 3);
    assert_eq!(body["checks"][1]["id"], "encoder:vvenc");
    assert_eq!(body["checks"][2]["id"], "scene-model");
    assert_eq!(
        body["available_count"],
        checks
            .iter()
            .filter(|check| check["available"] == true)
            .count()
    );

    let (status, health) = send(
        app,
        Request::get("/api/health").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(health["preflight"], body);
}

/// The editor bootstraps from these three engine-owned documents, and Settings reads the
/// storage overview. None of them depends on a project, so one router proves the routes are
/// wired to the real engine and app data rather than only declared in the manifest.
#[tokio::test]
async fn engine_catalogues_and_the_storage_overview_are_served() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    for path in [
        "/api/config/schema",
        "/api/config/filters",
        "/api/config/script-guide",
        "/api/storage",
    ] {
        let (status, body) =
            send(app.clone(), Request::get(path).body(Body::empty()).unwrap()).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        assert!(body.is_object(), "{path} answers with an object");
    }

    let (status, filters) = send(
        app.clone(),
        Request::get("/api/config/filters")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(filters.get("ffms2").is_some());
    assert!(filters.get("vapour_synth").is_some());

    let (status, guide) = send(
        app.clone(),
        Request::get("/api/config/script-guide")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        guide["module_file"]
            .as_str()
            .is_some_and(|name| !name.is_empty())
    );
    assert!(
        guide["template"]
            .as_str()
            .is_some_and(|script| !script.is_empty())
    );

    let (status, check) = send(
        app,
        Request::post("/api/config/scripts/validate")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "script": "this is not Python" }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{check}");
    assert!(
        matches!(check["status"].as_str(), Some("invalid" | "unavailable")),
        "a script that cannot be evaluated is reported, not swallowed: {check}"
    );

    std::fs::remove_dir_all(dir).expect("cleanup");
}

#[tokio::test]
async fn a_malformed_custom_probe_still_returns_the_error_envelope() {
    let app = router(health_state());
    let request = Request::post("/api/preflight/custom")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"kind":"x265"}"#))
        .unwrap();
    let (status, body) = send(app, request).await;

    assert_unreadable_body(status, &body);
}

#[tokio::test]
async fn an_unknown_custom_family_is_rejected_before_probing() {
    let app = router(health_state());
    let request = Request::post("/api/preflight/custom")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"kind":"not-a-tool","path":"/tmp/tool"}"#))
        .unwrap();
    let (status, body) = send(app, request).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "INVALID_CONFIG");
}

#[tokio::test]
async fn a_missing_custom_executable_is_reported_without_hiding_the_inventory() {
    let app = router(health_state());
    let request = Request::post("/api/preflight/custom")
        .header("content-type", "application/json")
        .body(Body::from(
            r#"{"kind":"x265","path":"av1ation-definitely-not-installed"}"#,
        ))
        .unwrap();
    let (status, body) = send(app.clone(), request).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], "custom:x265:failed");
    assert_eq!(body["origin"], "custom");
    assert_eq!(body["path"], "av1ation-definitely-not-installed");
    assert_eq!(body["available"], false);
    assert!(
        body["detail"]
            .as_str()
            .is_some_and(|detail| detail.contains("av1ation-definitely-not-installed")),
        "{}",
        body["detail"]
    );

    let (status, health) = send(
        app.clone(),
        Request::get("/api/health").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(health["preflight"]["total_count"], 4);
    assert_eq!(health["preflight"]["checks"][2]["id"], "custom:x265:failed");

    let remove = Request::delete("/api/preflight/custom/custom:x265:failed")
        .body(Body::empty())
        .unwrap();
    let (status, _) = send(app.clone(), remove).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, health) = send(
        app,
        Request::get("/api/health").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(health["preflight"]["total_count"], 3);
}

#[tokio::test]
async fn saved_custom_tools_are_restored_on_startup() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    tokio::fs::write(
        dir.join("config.json"),
        r#"{"custom_tools":[{"kind":"x265","path":"av1ation-definitely-not-installed"}]}"#,
    )
    .await
    .expect("seed settings");

    let state = AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        test_probes(),
        dir.clone(),
    );
    state.hydrate_preflight().await;
    let app = router(state);

    let (status, health) = send(
        app,
        Request::get("/api/health").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let checks = health["preflight"]["checks"]
        .as_array()
        .expect("checks array");
    let saved = checks
        .iter()
        .find(|check| check["id"] == "custom:x265")
        .expect("saved custom row");
    assert_eq!(saved["origin"], "custom");
    assert_eq!(saved["available"], false);

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn removing_an_unknown_custom_executable_is_not_found() {
    let app = router(health_state());
    let request = Request::delete("/api/preflight/custom/custom:missing")
        .body(Body::empty())
        .unwrap();
    let (status, body) = send(app, request).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");
}

#[tokio::test]
async fn static_files_are_served_from_the_web_root() {
    let root = web_root();
    let app = router(AppState::new(Some(root.clone())));
    let response = app
        .clone()
        .oneshot(Request::get("/").body(Body::empty()).unwrap())
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), 1_000).await.expect("body");
    assert_eq!(&bytes[..], b"<h1>Av1ation</h1>");

    let response = app
        .oneshot(Request::get("/videos/42").body(Body::empty()).unwrap())
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), 1_000).await.expect("body");
    assert_eq!(&bytes[..], b"<h1>Av1ation</h1>");
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[tokio::test]
async fn unknown_api_routes_return_json_not_the_spa() {
    let root = web_root();
    let app = router(AppState::new(Some(root.clone())));
    let request = Request::get("/api/does-not-exist")
        .body(Body::empty())
        .unwrap();
    let (status, body) = send(app, request).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[tokio::test]
async fn the_service_handle_stops_accepting_connections() {
    let (address, service) =
        serve_with_runner_and_probes(0, None, Arc::new(FakeRunner), test_probes())
            .await
            .expect("service starts");

    tokio::net::TcpStream::connect(address)
        .await
        .expect("service accepts before shutdown");

    service.shutdown().await;

    // A closed loopback port is refused immediately on most systems and only after a
    // retry window on Windows. Bound the check instead of spending that whole window in
    // every test run; a listener would accept well inside it.
    let refused = timeout(
        Duration::from_millis(100),
        tokio::net::TcpStream::connect(address),
    )
    .await;
    assert!(
        refused.is_err() || refused.is_ok_and(|result| result.is_err()),
        "the port still accepts connections after shutdown"
    );
}

#[tokio::test]
async fn a_port_collision_is_reported_as_a_bind_error_without_retrying() {
    let occupied = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .expect("occupy a loopback port");
    let port = occupied.local_addr().expect("occupied address").port();

    let error = serve_with_runner_and_probes(port, None, Arc::new(FakeRunner), test_probes())
        .await
        .err()
        .expect("a second listener on the same port must fail");
    assert_eq!(
        error.kind(),
        std::io::ErrorKind::AddrInUse,
        "the caller gets the bind error instead of a retry or a silent move: {error}"
    );

    drop(occupied);
}

#[tokio::test]
async fn the_bare_api_prefix_returns_json_not_the_spa() {
    let root = web_root();
    let app = router(AppState::new(Some(root.clone())));
    let (status, body) = send(app, Request::get("/api").body(Body::empty()).unwrap()).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "NOT_FOUND");
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[cfg(windows)]
#[tokio::test]
async fn static_files_reject_absolute_windows_paths() {
    let root = web_root();
    let app = router(AppState::new(Some(root.clone())));
    let response = app
        .oneshot(
            Request::get("/C:/Windows/win.ini")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[tokio::test]
async fn a_support_bundle_carries_every_chosen_manifest_and_redacts_the_host_paths() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let first = create_project(app.clone(), "Alpha").await;
    let second = create_project(app.clone(), "Beta").await;

    let (status, body) = send(
        app,
        Request::get(format!(
            "/api/diagnostics/bundle?projects={first},{second}&logs=false"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    let text = body["text"].as_str().expect("bundle text");
    assert!(text.starts_with("# Av1ation Station diagnostics"));
    assert!(text.contains("## Project manifest · Alpha"), "{text}");
    assert!(text.contains("## Project manifest · Beta"), "{text}");
    // The bundle is the thing a user pastes in public, so the data directory cannot survive.
    assert!(!text.contains(&dir.to_string_lossy().to_string()), "{text}");
    assert_eq!(body["log_lines"], 0);
    assert!(
        body["filename"]
            .as_str()
            .is_some_and(|name| name.ends_with(".md"))
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn a_support_bundle_without_a_selection_is_still_a_report() {
    let app = router(health_state());
    let (status, body) = send(
        app,
        Request::get("/api/diagnostics/bundle?logs=false")
            .body(Body::empty())
            .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    let text = body["text"].as_str().expect("bundle text");
    assert!(text.contains("- Application:"));
    assert!(!text.contains("## Project manifest"));
}

#[tokio::test]
async fn a_bundle_for_a_project_that_never_existed_reports_why() {
    let dir = project_dir();
    let app = router(project_state(&dir));
    let (status, body) = send(
        app.clone(),
        Request::get("/api/diagnostics/bundle?projects=missing&logs=false")
            .body(Body::empty())
            .unwrap(),
    )
    .await;

    // A value that never could be an id is a bad request, not a missing read.
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(body["message"].as_str().is_some_and(|m| m.contains("UUID")));

    // A well-formed id that names no project is a plain miss.
    let absent = uuid::Uuid::new_v4();
    let (status, body) = send(
        app,
        Request::get(format!(
            "/api/diagnostics/bundle?projects={absent}&logs=false"
        ))
        .body(Body::empty())
        .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|m| m.contains(&absent.to_string()))
    );

    // Neither request created a project, so there may be nothing to remove.
    let _ = tokio::fs::remove_dir_all(dir).await;
}
