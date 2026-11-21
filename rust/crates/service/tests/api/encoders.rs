//! HTTP tests for the `encoders` route family.

use crate::common::*;

#[tokio::test]
async fn a_saved_encoder_build_keeps_its_parameters_when_the_file_is_missing() {
    let dir = std::env::temp_dir().join(format!("av1ation-api-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&dir).await.expect("temp dir");
    // The probe must fail for a reason this test owns: the path is inside the test's own
    // data directory, so no build installed on the developer's machine can satisfy it.
    let missing = dir.join("av1ation-svt.exe");
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
                "executable": missing.display().to_string(),
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
    // Nine built-in families plus the two shipped SVT-AV1 fork profiles.
    assert_eq!(encoders.len(), 11);
    for profile in ["svt-av1-essential", "svt-av1-5fish"] {
        let known = encoders
            .iter()
            .find(|encoder| encoder["id"] == format!("fork:{profile}"))
            .unwrap_or_else(|| panic!("{profile} is offered without an executable"));
        assert_eq!(known["source"], "Known");
        assert_eq!(known["fork"], true);
        assert_eq!(known["available"], false);
    }
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

/// A shipped fork with no saved path runs whatever provider its base encoder resolves, so
/// the row must inherit the base's availability instead of reporting a missing executable.
#[tokio::test]
async fn a_pathless_shipped_fork_reports_its_base_encoder_availability() {
    let dir = project_dir();
    let mut probes = test_probes();
    probes.push(Probe {
        id: "encoder:svt-av1".to_owned(),
        label: "SVT-AV1".to_owned(),
        capability: Capability::Encode,
        available: true,
        detail: "C:/tools/SvtAv1EncApp.exe · SVT-AV1 Encoder Lib v4.3.0".to_owned(),
        remediation: None,
        plugins: Vec::new(),
    });
    let app = router(AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        probes,
        dir.clone(),
    ));

    let (status, encoders) = send(
        app,
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let encoders = encoders.as_array().expect("encoder catalogue");
    let svt = encoders
        .iter()
        .find(|encoder| encoder["id"] == "svt-av1")
        .expect("SVT-AV1 is offered");
    assert_eq!(svt["available"], true, "{svt}");

    for profile in ["svt-av1-essential", "svt-av1-5fish"] {
        let known = encoders
            .iter()
            .find(|encoder| encoder["id"] == format!("fork:{profile}"))
            .unwrap_or_else(|| panic!("{profile} is offered"));
        assert_eq!(
            known["available"], true,
            "a cleared path runs the base provider: {known}"
        );
        assert_eq!(known["executable"], Value::Null);
    }

    let _ = std::fs::remove_dir_all(dir);
}

/// One valid descriptor for a seeded fork's parameter map.
fn seeded_parameter(label: &str) -> Value {
    serde_json::json!({
        "delimiter": "Space",
        "label": label,
        "description": null,
        "doc_link": null,
        "kind": {"Number": {"integer": true, "min": 0, "max": 63, "step": null, "unit": null}},
        "default": 20,
        "widget": "Auto",
        "advanced": false,
        "group": null,
        "relations": []
    })
}

async fn state_with_saved_fork(dir: &Path, fork: Value) -> AppState {
    tokio::fs::create_dir_all(dir)
        .await
        .expect("test data directory");
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({ "encoder_forks": [fork] }).to_string(),
    )
    .await
    .expect("seed settings");
    project_state(dir)
}

/// A shipped row is app-owned: resetting its table is a table swap, not a new fork. The
/// executable the user chose has to survive so the row still points at their build.
#[tokio::test]
async fn resetting_a_shipped_fork_keeps_its_executable() {
    let dir = project_dir();
    let executable = "C:/tools/svt-av1-essential.exe";
    let app = router(
        state_with_saved_fork(
            &dir,
            serde_json::json!({
                "id": "svt-av1-essential",
                "label": "Hand-renamed",
                "base": "svt-av1",
                "executable": executable,
                "version": "SVT-AV1-Essential v4.3.0",
                "profile": "svt-av1-essential",
                "parameters": { "--crf": seeded_parameter("Edited CRF") },
                "parameters_edited": true
            }),
        )
        .await,
    );

    let (status, fork) = send(
        app.clone(),
        route_request(
            "PUT",
            "/api/encoders/forks/svt-av1-essential",
            Some(serde_json::json!({ "reset_parameters": true })),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{fork}");
    assert_eq!(
        fork["executable"], executable,
        "reset must not clear the path"
    );
    assert_eq!(fork["label"], "SVT-AV1-Essential");
    assert_eq!(fork["parameters_edited"], false);
    assert!(
        fork["parameters"].get("--enable-alt-cdef").is_some(),
        "the shipped table is restored: {fork}"
    );
    assert_ne!(fork["parameters"]["--crf"]["label"], "Edited CRF");

    let (status, settings) = send(
        app,
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        settings["encoder_forks"][0]["executable"], executable,
        "the reset is persisted with the saved path"
    );
    assert_eq!(settings["encoder_forks"][0]["parameters_edited"], false);

    let _ = std::fs::remove_dir_all(dir);
}

/// Clearing the path returns the row to "choose a build" without discarding the map the
/// user edited; only a reset may replace parameters.
#[tokio::test]
async fn clearing_a_shipped_forks_executable_keeps_its_parameters() {
    let dir = project_dir();
    let executable = "C:/tools/svt-av1-5fish.exe";
    let app = router(
        state_with_saved_fork(
            &dir,
            serde_json::json!({
                "id": "svt-av1-5fish",
                "label": "SVT-AV1-5Fish",
                "base": "svt-av1",
                "executable": executable,
                "version": "SVT-AV1-5Fish v4.3.0",
                "profile": "svt-av1-5fish",
                "parameters": {
                    "--lineart-psy-bias": seeded_parameter("Hand-edited bias"),
                    "--av1ation-extra": seeded_parameter("Extra")
                },
                "parameters_edited": true
            }),
        )
        .await,
    );

    let (status, fork) = send(
        app.clone(),
        route_request(
            "PUT",
            "/api/encoders/forks/svt-av1-5fish",
            Some(serde_json::json!({ "clear_executable": true })),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{fork}");
    assert_eq!(fork["executable"], "", "clear drops only the path");
    assert!(fork["version"].is_null());
    assert_eq!(
        fork["parameters"]["--lineart-psy-bias"]["label"],
        "Hand-edited bias"
    );
    assert_eq!(fork["parameters"]["--av1ation-extra"]["label"], "Extra");
    assert_eq!(fork["parameters_edited"], true);

    let (_, catalogue) = send(
        app,
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    let row = catalogue
        .as_array()
        .expect("catalogue")
        .iter()
        .find(|encoder| encoder["id"] == "fork:svt-av1-5fish")
        .expect("the shipped row survives clearing its path");
    assert_eq!(row["source"], "Known");
    assert_eq!(row["available"], false);
    assert!(row["executable"].is_null());
    assert_eq!(row["parameters"]["--av1ation-extra"]["label"], "Extra");

    let _ = std::fs::remove_dir_all(dir);
}

/// The catalogue owns a shipped row's name and existence. Renaming it is ignored and DELETE
/// is the table reset, so neither request can remove or relabel the row.
#[tokio::test]
async fn a_shipped_fork_cannot_be_renamed_or_deleted() {
    let dir = project_dir();
    let executable = "C:/tools/svt-av1-5fish.exe";
    let app = router(
        state_with_saved_fork(
            &dir,
            serde_json::json!({
                "id": "svt-av1-5fish",
                "label": "Hand-renamed",
                "base": "svt-av1",
                "executable": executable,
                "profile": "svt-av1-5fish",
                "parameters": { "--lineart-psy-bias": seeded_parameter("Edited") },
                "parameters_edited": true
            }),
        )
        .await,
    );

    let (status, fork) = send(
        app.clone(),
        route_request(
            "PUT",
            "/api/encoders/forks/svt-av1-5fish",
            Some(serde_json::json!({ "label": "My private build" })),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{fork}");
    assert_eq!(
        fork["label"], "SVT-AV1-5Fish",
        "the shipped name is not editable"
    );

    let (status, body) = send(
        app.clone(),
        route_request("DELETE", "/api/encoders/forks/svt-av1-5fish", None),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (_, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    let saved = settings["encoder_forks"]
        .as_array()
        .expect("saved forks")
        .iter()
        .find(|fork| fork["id"] == "svt-av1-5fish")
        .expect("DELETE must not remove a shipped row");
    assert_eq!(saved["label"], "SVT-AV1-5Fish");
    assert_eq!(
        saved["executable"], executable,
        "DELETE only resets the table"
    );

    let (_, catalogue) = send(
        app,
        Request::get("/api/encoders").body(Body::empty()).unwrap(),
    )
    .await;
    assert!(
        catalogue
            .as_array()
            .expect("catalogue")
            .iter()
            .any(|encoder| encoder["id"] == "fork:svt-av1-5fish" && encoder["source"] == "Known")
    );

    let _ = std::fs::remove_dir_all(dir);
}

/// Help both fake build scripts print for `--full-help`. It offers one flag from each
/// shipped profile, so the probe sees a tie and must label the build 5Fish.
const FAKE_SVT_HELP: [&str; 3] = [
    "--lineart-psy-bias Lineart psychovisual bias, default is 0 [0-8]",
    "--enable-alt-cdef Alternative CDEF strength, default is 0 [0-3]",
    "--crf Constant Rate Factor, default is 30 [1-70]",
];

#[cfg(windows)]
async fn fake_svt_build(dir: &Path) -> PathBuf {
    let help = FAKE_SVT_HELP
        .iter()
        .map(|line| format!("echo {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    let script = format!(
        r#"@echo off
if "%~1"=="--version" goto version
if "%~1"=="--full-help" goto full_help
exit /b 0
:version
echo SVT-AV1 Encoder Lib v4.3.0
exit /b 0
:full_help
{help}
exit /b 0
"#
    );
    let path = dir.join("fake-svt-av1.cmd");
    tokio::fs::write(&path, script.replace('\n', "\r\n"))
        .await
        .expect("fake encoder");
    path
}

#[cfg(unix)]
async fn fake_svt_build(dir: &Path) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let help = FAKE_SVT_HELP
        .iter()
        .map(|line| format!("    '{line}'"))
        .collect::<Vec<_>>()
        .join(" \\\n");
    let script = format!(
        r#"#!/bin/sh
if [ "$1" = "--version" ]; then
    echo "SVT-AV1 Encoder Lib v4.3.0"
    exit 0
fi
printf '%s\n' \
{help}
exit 0
"#
    );
    let path = dir.join("fake-svt-av1");
    tokio::fs::write(&path, script).await.expect("fake encoder");
    let mut permissions = tokio::fs::metadata(&path)
        .await
        .expect("fake encoder metadata")
        .permissions();
    permissions.set_mode(0o755);
    tokio::fs::set_permissions(&path, permissions)
        .await
        .expect("fake encoder permissions");
    path
}

/// 5Fish folds in the other SVT forks, so a build that shows both signatures is 5Fish. The
/// saved table has to follow the detected profile, not the first matching signature list.
#[tokio::test]
async fn a_build_with_both_fork_signatures_is_labelled_five_fish() {
    let dir = project_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .expect("test data directory");
    let executable = fake_svt_build(&dir).await;
    let app = router(project_state(&dir));

    let (status, probe) = send(
        app.clone(),
        route_request(
            "POST",
            "/api/encoders/probe",
            Some(serde_json::json!({
                "label": "Combined build",
                "base": "svt-av1",
                "path": executable.display().to_string()
            })),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{probe}");
    assert_eq!(probe["available"], true, "{probe}");
    assert_eq!(
        probe["profile"], "svt-av1-5fish",
        "5Fish incorporates the other fork's features, so it wins a tie"
    );

    let (status, fork) = send(
        app,
        route_request(
            "POST",
            "/api/encoders/forks",
            Some(serde_json::json!({
                "label": "Combined build",
                "base": "svt-av1",
                "path": executable.display().to_string()
            })),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{fork}");
    assert_eq!(fork["profile"], "svt-av1-5fish");
    assert!(
        fork["parameters"]["--lineart-psy-bias"]["doc_link"]
            .as_str()
            .is_some_and(|link| link.contains("5fish")),
        "the saved table is 5Fish's: {fork}"
    );
    assert_eq!(
        fork["parameters"]["--enable-alt-cdef"]["group"], "Additional",
        "an Essential-only flag stays an extra row rather than an Essential entry: {fork}"
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
    let missing = dir.join("av1ation-svt.exe");
    tokio::fs::write(
        dir.join("config.json"),
        serde_json::json!({
            "encoder_forks": [{
                "id": "kept",
                "label": "Kept",
                "base": "svt-av1",
                "executable": missing.display().to_string(),
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
