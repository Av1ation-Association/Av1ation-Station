use super::*;
use crate::api::json::ApiJson;

/// The engine-generated schema for the two configuration documents the editors write.
///
/// Serving it rather than checking it in keeps the form fields tied to the engine build the
/// user actually runs, including an encoder the upstream catalogue added after this release.
pub(super) async fn config_schema() -> Response {
    match av1ation_engine::config_schemas() {
        Ok(schema) => Json(schema).into_response(),
        Err(error) => {
            tracing::error!(error = %error, "the configuration schema could not be serialised");
            error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Internal,
                "The configuration schema could not be generated.".to_owned(),
                Some("Restart the application; the engine build may be inconsistent.".to_owned()),
            )
        }
    }
}

/// The engine's typed filter schemas, so the General editor renders every filter field the
/// pinned engine actually accepts instead of a hand-maintained copy.
pub(super) async fn input_filter_schemas() -> Json<FilterSchemas> {
    let schema = av1ation_engine::media::video::filter_schemas();
    Json(FilterSchemas {
        ffms2: schema.get("ffms2").cloned().unwrap_or(Value::Null),
        vapour_synth: schema.get("vapour_synth").cloned().unwrap_or(Value::Null),
    })
}

/// The Python language server this machine can run, or why completion stays bundled.
///
/// The probe only looks at PATH, so it cannot stall the editor; the process starts when a
/// script page opens its socket.
pub(super) async fn language_server_info(State(state): State<AppState>) -> Response {
    let interpreter = state.settings().await.python_interpreter;
    let data_dir = state.data_dir.clone();
    let tools_dir = state.tools_dir.clone();
    match tokio::task::spawn_blocking(move || {
        crate::script::lsp::info(
            data_dir.as_deref(),
            interpreter.as_deref(),
            tools_dir.as_deref(),
        )
    })
    .await
    {
        Ok(info) => Json(info).into_response(),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Internal,
            format!("The language server probe did not complete: {error}"),
            Some("The editor keeps its bundled completion.".to_owned()),
        ),
    }
}

/// Every Python interpreter the Settings picker can offer.
///
/// Discovery runs off the request thread because it starts each candidate to read its
/// version, and the saved setting stays in the list even when that file no longer answers.
pub(super) async fn python_interpreters(State(state): State<AppState>) -> Response {
    let configured = state.settings().await.python_interpreter;
    let tools_dir = state.tools_dir.clone();
    match tokio::task::spawn_blocking(move || {
        crate::script::lsp::interpreters(configured.as_deref(), tools_dir.as_deref())
    })
    .await
    {
        Ok(found) => Json(found).into_response(),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Internal,
            format!("The interpreter scan did not complete: {error}"),
            Some("Choose the interpreter with Locate…".to_owned()),
        ),
    }
}

/// One WebSocket per open script editor; the bridge owns the server process for its life.
///
/// The LAN listener admits this route through the same one-use ticket as the event stream,
/// because a browser cannot attach a bearer header to a WebSocket.
pub(super) async fn language_server_socket(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> Response {
    let interpreter = state.settings().await.python_interpreter;
    let data_dir = state.data_dir.clone();
    let tools_dir = state.tools_dir.clone();
    match tokio::task::spawn_blocking(move || {
        crate::script::lsp::installed(
            data_dir.as_deref(),
            interpreter.as_deref(),
            tools_dir.as_deref(),
        )
    })
    .await
    {
        Ok(Some(server)) => ws.on_upgrade(move |socket| crate::script::lsp::bridge(socket, server)),
        Ok(None) => error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::PreflightFailed,
            "The bundled language server needs Python 3.10 or newer, and no server or usable interpreter was found."
                .to_owned(),
            Some(
                "Point the interpreter at a Python 3.10+ install, install a build with the bundled toolchain, or install Pyright; the editor keeps its bundled completion meanwhile."
                    .to_owned(),
            ),
        ),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Internal,
            format!("The language server probe did not complete: {error}"),
            Some("The editor keeps its bundled completion.".to_owned()),
        ),
    }
}

/// The generated `condor_data` module's stub, its template, and the reserved variables.
///
/// The editor completes against the stub and runs the check below against the same module
/// the runner writes, so a field offered by completion is a field the module carries.
pub(super) async fn script_guide() -> Json<ScriptGuide> {
    let variables = av1ation_engine::script::data::injected_variables(
        &[],
        &av1ation_engine::script::data::CustomSceneData::new(),
        &av1ation_engine::RunnerConfig::default(),
        "",
        "",
        None,
        "",
    );
    Json(ScriptGuide {
        module_file: av1ation_engine::script::module::MODULE_FILE.to_owned(),
        stub: av1ation_engine::script::module::stub_source(),
        template: av1ation_engine::script::module::template_source(),
        variables: variables
            .iter()
            .map(crate::script::script_data::key)
            .collect(),
    })
}

/// Build a materialised `.vpy` from one script input.
///
/// This mirrors what the runner hands VSScript: a `condor_data` module and the seven
/// reserved variables, then the script itself. A project/video pair contributes the scenes,
/// scratch path, and — when the video has been opened at least once — the live module and
/// document the export reads instead of embedding. The page's draft sequence document wins
/// when it supplies one, so an unsaved configuration change is visible in the export before
/// it is saved. Only file metadata decides between live and embedded data, so the work stays
/// on the request thread.
pub(super) async fn materialise_script(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<ScriptMaterialiseRequest>,
) -> Response {
    let mut condor = None;
    let mut video_path = body.video_path.unwrap_or_default();
    let mut filename = "script.vpy".to_owned();
    let mut temp_dir = state
        .data_dir
        .clone()
        .unwrap_or_else(std::env::temp_dir)
        .join("script-export")
        .display()
        .to_string();
    let mut sequence_config = body.sequence_config.unwrap_or(serde_json::Value::Null);

    if let (Some(project_id), Some(video_id)) = (body.project_id, body.video_id) {
        let Some(videos) = state.videos() else {
            return no_storage();
        };
        let record = match videos.record(&project_id, &video_id).await {
            Ok(Some(record)) => record,
            Ok(None) => return video_not_found(&video_id),
            Err(error) => return project_error(error),
        };
        if video_path.trim().is_empty() {
            video_path = record.input_path();
        }
        filename = export_filename(&record.name);
        // The export is meant to behave like the next open, custom pairs included.
        condor = av1ation_engine::script::data::attach_custom_scene_data(
            record.condor.as_ref(),
            &record.custom_scene_data,
        );
        temp_dir = videos
            .chunk_directory(&video_id, record.temp_directory.as_deref())
            .display()
            .to_string();
        if sequence_config.is_null() {
            let Some(projects) = state.projects() else {
                return no_storage();
            };
            let project_document = match projects.document(&project_id).await {
                Ok(Some(document)) => document,
                Ok(None) => return project_not_found(&project_id),
                Err(error) => return project_error(error),
            };
            sequence_config = crate::project::config::materialise(
                &default_config(),
                &project_document,
                &record.overrides,
            );
        }
    }

    let config: av1ation_engine::RunnerConfig =
        serde_json::from_value(sequence_config).unwrap_or_default();
    let script = body.script;
    let materialised = av1ation_engine::script::export::materialise(
        &script,
        condor.as_ref(),
        &config,
        &temp_dir,
        &video_path,
    );
    Json(ScriptMaterialised {
        filename,
        source: materialised.source,
        variables: materialised
            .variables
            .into_iter()
            .map(|variable| ScriptMaterialisedVariable {
                key: variable.key.to_owned(),
                description: variable.description.to_owned(),
                format: match variable.format {
                    av1ation_engine::script::data::ScriptVariableFormat::Json => {
                        ScriptValueFormat::Json
                    }
                    av1ation_engine::script::data::ScriptVariableFormat::Number => {
                        ScriptValueFormat::Number
                    }
                    av1ation_engine::script::data::ScriptVariableFormat::Text => {
                        ScriptValueFormat::Text
                    }
                },
                value: variable.value,
            })
            .collect(),
    })
    .into_response()
}

/// A download name that keeps the video's identity and always ends in `.vpy`.
pub(super) fn export_filename(name: &str) -> String {
    let mut stem = String::new();
    for character in name.chars() {
        if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
            stem.push(character);
        } else if character.is_whitespace() {
            stem.push('-');
        }
    }
    let stem = stem.trim_matches('-');
    if stem.is_empty() {
        "script.vpy".to_owned()
    } else {
        format!("{stem}.vpy")
    }
}

/// Evaluate one script before it is saved.
///
/// VapourSynth is optional (AGENTS §2.8), so a machine without it answers `Unavailable` with
/// the reason rather than rejecting the script. The work opens a decoder and runs Python, so
/// it never runs on the async executor's thread.
pub(super) async fn validate_script(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<ScriptCheckRequest>,
) -> Response {
    let scenes_dir = state
        .data_dir
        .clone()
        .unwrap_or_else(std::env::temp_dir)
        .join("script-check")
        .display()
        .to_string();
    let script = body.script;
    let video_path = body.video_path.unwrap_or_default();
    let sequence_config = body.sequence_config.unwrap_or(serde_json::Value::Null);
    let outcome = tokio::task::spawn_blocking(move || {
        evaluate(&script, &scenes_dir, &video_path, &sequence_config)
    })
    .await;
    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(error) => {
            tracing::error!(error = %error, "the script check did not finish");
            return Json(ScriptCheck {
                status: ScriptCheckStatus::Unavailable,
                clip: None,
                detail: "The check stopped before the script ran. Try again.".to_owned(),
            })
            .into_response();
        }
    };
    let detail = outcome.detail();
    let (status, clip) = match &outcome {
        ScriptOutcome::Valid(clip) => (
            ScriptCheckStatus::Valid,
            Some(ScriptClip {
                width: clip.width,
                height: clip.height,
                frames: clip.frames,
                fps: clip.fps,
                bit_depth: clip.bit_depth,
            }),
        ),
        ScriptOutcome::Invalid(_) => (ScriptCheckStatus::Invalid, None),
        ScriptOutcome::Unavailable(_) => (ScriptCheckStatus::Unavailable, None),
    };
    Json(ScriptCheck {
        status,
        clip,
        detail,
    })
    .into_response()
}
