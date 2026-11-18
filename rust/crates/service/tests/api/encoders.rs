//! HTTP tests for the `encoders` route family.

use crate::common::*;

#[tokio::test]
async fn a_saved_encoder_build_keeps_its_parameters_when_the_file_is_missing() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    let crf = serde_json::json!({
        "delimiter": "Space",
        "label": "CRF",
        "description": null,
        "doc_link": null,
        "kind": {"Number": {"integer": true, "min": 0, "max": 63, "step": null, "unit": null}},
        "default": 20,
        "widget": "Auto",
        "advanced": false,
        "group": null,
        "relations": []
    });
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({
            "encoder_forks": [{
                "id": "kept",
                "label": "Kept",
                "base": "svt-av1",
                "executable": "C:/definitely-missing/av1ation-svt.exe",
                "version": null,
                "parameters": { "--crf": crf }
            }]
        })
        .to_string(),
    )
    .await
    .expect("seed settings");

    let state = AppState::with_runner_and_data_dir(None, Arc::new(FakeRunner), Some(dir.clone()));
    // A refresh must not erase a map it could not verify: the drive may simply be unplugged.
    state.hydrate_encoder_forks().await;

    let (status, body) = send(
        router(state),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["encoder_forks"][0]["parameters"]["--crf"]["label"],
        "CRF"
    );

    tokio::fs::remove_dir_all(dir).await.expect("cleanup");
}

#[tokio::test]
async fn the_encoder_and_sequence_catalogues_come_from_the_engine() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let (status, encoders) = send(
        app.clone(),
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let encoders = encoders.as_array().expect("encoder catalogue");
    assert_eq!(encoders.len(), 9);
    let svt = encoders
        .iter()
        .find(|encoder| encoder["id"] == "svt-av1")
        .expect("SVT-AV1 is offered");
    let parameters = svt["parameters"].as_object().expect("parameter map");
    assert!(!parameters.is_empty());
    let crf = &parameters["--crf"];
    assert_eq!(crf["delimiter"], "Space");
    // SVT-AV1's parameters document allows CRF in 0.25 steps; the engine's default stays.
    assert_eq!(crf["kind"]["Number"]["integer"], false);
    assert_eq!(crf["kind"]["Number"]["min"], 1.0);
    assert_eq!(crf["kind"]["Number"]["max"], 70.0);
    assert_eq!(crf["kind"]["Number"]["step"], 0.25);
    assert_eq!(crf["default"], 25.0);
    assert_eq!(crf["widget"]["Slider"]["step"], 0.25);
    assert_eq!(crf["widget"]["Slider"]["marks"], serde_json::json!([]));
    assert!(
        crf["doc_link"]
            .as_str()
            .is_some_and(|link| link.contains("SVT-AV1")),
        "a built-in descriptor carries its repository documentation"
    );
    assert_eq!(svt["default"]["SVTAV1"]["append_color_data"], true);

    let (status, sequences) = send(
        app,
        Request::get("/api/sequences").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let sequences = sequences.as_array().expect("sequence catalogue");
    assert_eq!(sequences.len(), 7);
    assert_eq!(sequences[0]["id"], "SceneDetector");
    assert_eq!(sequences[0]["section"], "scene_detector");
    assert!(sequences[0]["config"].is_object());
    assert_eq!(sequences[1]["id"], "NoiseDetector");
    assert_eq!(
        sequences[1]["config"],
        Value::Null,
        "a disabled sequence is still listed"
    );

    let _ = std::fs::remove_dir_all(dir);
}

/// Fork routes validate before they touch the settings document. These requests never need a
/// real encoder binary: an unknown base is refused, an unnamed fork is refused, and edits of
/// a missing id are not found rather than silently created.
#[tokio::test]
async fn encoder_fork_routes_reject_invalid_and_missing_forks() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    for (path, body) in [
        (
            "/api/encoders/probe",
            serde_json::json!({ "label": "Probe", "base": "not-an-encoder", "path": "C:/missing.exe" }),
        ),
        (
            "/api/encoders/forks",
            serde_json::json!({ "label": " ", "base": "svt-av1", "path": "C:/missing.exe" }),
        ),
    ] {
        let (status, error) = send(
            app.clone(),
            Request::post(path)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{path}: {error}");
        assert_eq!(error["code"], "INVALID_CONFIG", "{path}");
    }

    let (status, error) = send(
        app.clone(),
        Request::put("/api/encoders/forks/kept")
            .header("content-type", "application/json")
            .body(Body::from("{"))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{error}");

    let (status, error) = send(
        app.clone(),
        Request::put("/api/encoders/forks/missing")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({ "label": "Renamed" }).to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{error}");
    assert_eq!(error["code"], "NOT_FOUND");

    let (status, error) = send(
        app,
        Request::delete("/api/encoders/forks/missing")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{error}");
    assert_eq!(error["code"], "NOT_FOUND");

    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn a_built_in_encoder_keeps_its_edited_descriptors_until_reset() {
    let dir = project_dir();
    let app = router(project_state(&dir));

    let edited = serde_json::json!({
        "parameters": {
            "--crf": {
                "delimiter": "Space",
                "label": "Quality",
                "description": "Edited by the test",
                "doc_link": null,
                "kind": { "Number": { "integer": true, "min": null, "max": null, "step": null, "unit": null } },
                "default": 30,
                "group": null
            }
        }
    });
    let (status, body) = send(
        app.clone(),
        Request::put("/api/encoders/svt-av1/parameters")
            .header("content-type", "application/json")
            .body(Body::from(edited.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (_, catalogue) = send(
        app.clone(),
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    let svt = catalogue
        .as_array()
        .expect("catalogue")
        .iter()
        .find(|encoder| encoder["id"] == "svt-av1")
        .expect("SVT-AV1 is offered");
    assert_eq!(svt["overridden"], true);
    assert_eq!(svt["parameters"]["--crf"]["label"], "Quality");
    assert_eq!(svt["parameters"]["--crf"]["default"], 30.0);
    // The keys the editor no longer showed stay removed, even though the engine still has
    // them; otherwise Save would silently resurrect every engine descriptor.
    assert!(svt["parameters"].get("--preset").is_none());

    let invalid = serde_json::json!({ "parameters": { "--bad key": {
        "delimiter": "Space",
        "label": "Bad",
        "description": null,
        "doc_link": null,
        "kind": "Flag",
        "default": true,
        "group": null
    } } });
    let (status, _) = send(
        app.clone(),
        Request::put("/api/encoders/svt-av1/parameters")
            .header("content-type", "application/json")
            .body(Body::from(invalid.to_string()))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = send(
        app.clone(),
        Request::delete("/api/encoders/svt-av1/parameters")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, catalogue) = send(
        app.clone(),
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    let svt = catalogue
        .as_array()
        .expect("catalogue")
        .iter()
        .find(|encoder| encoder["id"] == "svt-av1")
        .expect("SVT-AV1 is offered");
    assert_eq!(svt["overridden"], false);
    // Resetting returns the curated label, not the engine's bare option name.
    assert_eq!(svt["parameters"]["--crf"]["label"], "Constant Rate Factor");
    assert!(svt["parameters"]["--crf"]["description"].is_string());
    assert!(svt["parameters"].get("--preset").is_some());

    let _ = std::fs::remove_dir_all(dir);
}

/// A saved fork can be renamed and removed without re-probing its executable; probing a file
/// that cannot identify itself is a successful report with `available: false`; unknown
/// built-in ids are not silently treated as fork ids.
#[tokio::test]
async fn encoder_forks_and_parameter_routes_report_their_status_surface() {
    let dir = project_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .expect("test data directory");
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({
            "encoder_forks": [{
                "id": "kept",
                "label": "Kept",
                "base": "svt-av1",
                "executable": "C:/definitely-missing/av1ation-svt.exe",
                "version": null,
                "parameters": {}
            }]
        })
        .to_string(),
    )
    .await
    .expect("seed settings");
    let state = AppState::with_runner_and_data_dir(None, Arc::new(FakeRunner), Some(dir.clone()));
    state.hydrate_encoder_forks().await;
    let app = router(state);

    let (status, body) = send(
        app.clone(),
        Request::put("/api/encoders/forks/kept")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"label":"Renamed"}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["label"], "Renamed");

    let (status, body) = send(
        app.clone(),
        Request::delete("/api/encoders/forks/kept")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let executable = dir.join("not-an-encoder.exe");
    tokio::fs::write(&executable, b"this is not an encoder")
        .await
        .expect("fake executable");
    let (status, probe) = send(
        app.clone(),
        Request::post("/api/encoders/probe")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "label": "Probe",
                    "base": "svt-av1",
                    "path": executable.display().to_string()
                })
                .to_string(),
            ))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{probe}");
    assert_eq!(probe["available"], false, "{probe}");

    for method in ["PUT", "DELETE"] {
        let request = if method == "PUT" {
            Request::put("/api/encoders/not-an-encoder/parameters")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"parameters":{}}"#))
                .unwrap()
        } else {
            Request::delete("/api/encoders/not-an-encoder/parameters")
                .body(Body::empty())
                .unwrap()
        };
        let (status, body) = send(app.clone(), request).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method}: {body}");
    }

    let _ = std::fs::remove_dir_all(dir);
}
