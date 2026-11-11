use super::*;
use crate::api::json::ApiJson;

pub(super) async fn get_settings(State(state): State<AppState>) -> Json<AppSettings> {
    Json(state.settings().await)
}

/// The template a new project copies, resolved against the engine's own defaults so the
/// editor sees a complete document even before the first save.
pub(super) fn resolved_defaults(template: Option<Value>) -> EffectiveConfig {
    let engine = default_config();
    let stored = template.unwrap_or_else(|| engine.clone());
    crate::project::config::resolve(&engine, &stored, &std::collections::BTreeMap::new())
}

pub(super) fn template_by_id(settings: &AppSettings, id: &str) -> Option<ProjectTemplate> {
    settings
        .project_templates
        .iter()
        .find(|template| template.id == id)
        .cloned()
}

pub(super) fn template_not_found(id: &str) -> Response {
    error_response(
        StatusCode::NOT_FOUND,
        ErrorCode::NotFound,
        format!("No project template matches {id}"),
        Some("Refresh the template list and choose one that still exists.".to_owned()),
    )
}

pub(super) async fn list_project_templates(
    State(state): State<AppState>,
) -> Json<Vec<ProjectTemplate>> {
    Json(state.settings().await.project_templates)
}

pub(super) async fn add_project_template(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<ProjectTemplateCreateRequest>,
) -> Response {
    match state.add_template(&body.name).await {
        Ok(template) => (StatusCode::CREATED, Json(template)).into_response(),
        Err(message) => error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Choose a unique template name.".to_owned()),
        ),
    }
}

pub(super) async fn update_project_template(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
    ApiJson(body): ApiJson<ProjectTemplateUpdate>,
) -> Response {
    let engine = default_config();
    if let Err(message) = crate::project::config::validate(&body.config, &engine) {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Correct the highlighted field and save again.".to_owned()),
        );
    }
    let general = match crate::project::projects::validate_general(&body.general) {
        Ok(general) => general,
        Err(error) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                error.message(),
                error.hint(),
            );
        }
    };
    let config = crate::project::config::materialise(
        &engine,
        &body.config,
        &std::collections::BTreeMap::new(),
    );
    match state
        .update_template(&template_id, &body.name, config, general)
        .await
    {
        Ok(Some(template)) => Json(template).into_response(),
        Ok(None) => template_not_found(&template_id),
        Err(message) => error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Choose a unique template name.".to_owned()),
        ),
    }
}

pub(super) async fn delete_project_template(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
) -> Response {
    match state.delete_template(&template_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => template_not_found(&template_id),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The template was not removed.".to_owned()),
        ),
    }
}

pub(super) async fn set_default_project_template(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<ProjectTemplateDefaultRequest>,
) -> Response {
    match state.set_default_template(body.id.as_deref()).await {
        Ok(settings) => Json(settings.project_templates).into_response(),
        Err(message) => error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Refresh the template list and try again.".to_owned()),
        ),
    }
}

pub(super) async fn get_template_defaults(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
) -> Response {
    match template_by_id(&state.settings().await, &template_id) {
        Some(template) => Json(resolved_defaults(Some(template.config))).into_response(),
        None => template_not_found(&template_id),
    }
}

pub(super) async fn put_template_defaults(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
    ApiJson(body): ApiJson<Value>,
) -> Response {
    let engine = default_config();
    if let Err(message) = crate::project::config::validate(&body, &engine) {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Correct the highlighted field and save again.".to_owned()),
        );
    }
    let materialised =
        crate::project::config::materialise(&engine, &body, &std::collections::BTreeMap::new());
    match state
        .set_template_config(&template_id, materialised.clone())
        .await
    {
        Ok(Some(_)) => {
            tracing::info!(%template_id, "project template updated");
            Json(resolved_defaults(Some(materialised))).into_response()
        }
        Ok(None) => template_not_found(&template_id),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The template was not changed.".to_owned()),
        ),
    }
}

/// The VapourSynth plugin problems a template would hit once a project is created.
pub(super) async fn get_template_scripts(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
) -> Response {
    match template_by_id(&state.settings().await, &template_id) {
        Some(template) => {
            let scan = crate::script::scripts::scan_config(
                &state,
                Some(&template.general),
                &template.config,
            )
            .await;
            Json(scan.report).into_response()
        }
        None => template_not_found(&template_id),
    }
}

pub(super) async fn get_template_general(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
) -> Response {
    match template_by_id(&state.settings().await, &template_id) {
        Some(template) => {
            let mut general = template.general;
            crate::project::projects::seed_default_filters(&mut general);
            Json(general).into_response()
        }
        None => template_not_found(&template_id),
    }
}

pub(super) async fn put_template_general(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
    ApiJson(body): ApiJson<GeneralDefaults>,
) -> Response {
    let general = match crate::project::projects::validate_general(&body) {
        Ok(general) => general,
        Err(error) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                error.message(),
                error.hint(),
            );
        }
    };
    match state
        .set_template_general(&template_id, general.clone())
        .await
    {
        Ok(Some(_)) => Json(general).into_response(),
        Ok(None) => template_not_found(&template_id),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The template was not changed.".to_owned()),
        ),
    }
}

/// Reset one section of a template, leaving every other override alone.
pub(super) async fn reset_template_defaults_section(
    State(state): State<AppState>,
    AxumPath((template_id, section)): AxumPath<(String, String)>,
) -> Response {
    let Some(template) = template_by_id(&state.settings().await, &template_id) else {
        return template_not_found(&template_id);
    };
    if section == "general" {
        let mut general = GeneralDefaults::default();
        crate::project::projects::seed_default_filters(&mut general);
        return match state.set_template_general(&template_id, general).await {
            Ok(Some(_)) => Json(resolved_defaults(Some(template.config))).into_response(),
            Ok(None) => template_not_found(&template_id),
            Err(message) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                message,
                Some("The template was not changed.".to_owned()),
            ),
        };
    }
    let keys: &[&str] = match section.as_str() {
        "scene-detection" => &["scene_detector"],
        "noise-generation" => &["noise_detector", "noise_scaler"],
        "target-quality" => &["target_quality", "speed_scaler", "bitrate_optimizer"],
        "concatenation" => &["scene_concatenator"],
        "quality-check" => &["quality_check"],
        "encoding" => &["benchmarker"],
        _ => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("No configuration section matches {section}"),
                Some("Choose a section of the configuration rail.".to_owned()),
            );
        }
    };

    let engine = default_config();
    let mut current = match template.config {
        Value::Object(map) => Value::Object(map),
        _ => Value::Object(serde_json::Map::new()),
    };
    if section == "encoding"
        && let Some(encoder) = engine.get("encoder")
    {
        current["encoder"] = encoder.clone();
    }
    {
        let map = current
            .as_object_mut()
            .map(|object| {
                object
                    .entry("sequences")
                    .or_insert_with(|| Value::Object(Default::default()))
            })
            .and_then(|sequences| sequences.as_object_mut());
        let Some(sequences) = map else {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                "The stored template is not an object.".to_owned(),
                Some("The template was not changed.".to_owned()),
            );
        };
        for key in keys {
            if let Some(value) = engine.pointer(&format!("/sequences/{key}")) {
                sequences.insert((*key).to_owned(), value.clone());
            }
        }
    }

    match state
        .set_template_config(&template_id, current.clone())
        .await
    {
        Ok(Some(_)) => Json(resolved_defaults(Some(current))).into_response(),
        Ok(None) => template_not_found(&template_id),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The template was not changed.".to_owned()),
        ),
    }
}

/// Reset a template's configuration to the engine defaults, keeping its General section.
pub(super) async fn reset_template_defaults(
    State(state): State<AppState>,
    AxumPath(template_id): AxumPath<String>,
) -> Response {
    if template_by_id(&state.settings().await, &template_id).is_none() {
        return template_not_found(&template_id);
    }
    let engine = default_config();
    match state
        .set_template_config(&template_id, engine.clone())
        .await
    {
        Ok(Some(_)) => Json(resolved_defaults(Some(engine))).into_response(),
        Ok(None) => template_not_found(&template_id),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The template was not changed.".to_owned()),
        ),
    }
}

pub(super) async fn patch_settings(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<AppSettingsUpdate>,
) -> Response {
    if let Some(theme) = body.theme.value()
        && !matches!(theme.as_str(), "system" | "dark" | "light")
    {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            format!("Unknown theme `{theme}`"),
            Some("Choose system, dark, or light.".to_owned()),
        );
    }
    if let Some(row_density) = body.row_density.value()
        && !matches!(row_density.as_str(), "comfortable" | "compact")
    {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            format!("Unknown row density `{row_density}`"),
            Some("Choose comfortable or compact.".to_owned()),
        );
    }
    if let Some(path) = body.temp_dir.value().and_then(Option::as_deref) {
        let path = path.trim();
        if path.is_empty() {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                "The temporary directory cannot be empty.".to_owned(),
                Some("Clear the field to use the app-data default.".to_owned()),
            );
        }
        if !std::path::Path::new(path).is_absolute() {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                "The temporary directory must be an absolute path.".to_owned(),
                Some("Choose a folder, or clear the field to use the app-data default.".to_owned()),
            );
        }
    }

    match state.update_settings(&body).await {
        Ok(settings) => {
            tracing::info!(
                theme = %settings.theme,
                row_density = %settings.row_density,
                reduce_motion = settings.reduce_motion,
                delete_chunks_on_success = settings.delete_chunks_on_success,
                "settings updated"
            );
            Json(settings).into_response()
        }
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The settings were not changed.".to_owned()),
        ),
    }
}

/// Point the TransNetV2 detector at an ONNX model on this machine.
///
/// The model is not per-project, so it is stored in the one settings document and applied
/// to every run whose detector is TransNetV2. A path is accepted only when the file exists
/// and is absolute: a typo must fail here rather than at the start of an encode. `null`
/// clears the override and restores the engine's own search order.
pub(super) async fn put_scene_model(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<SceneModelUpdate>,
) -> Response {
    if state.runs().config_locked().await {
        return run_locked("The scene detection model cannot change while an encode is running.");
    }

    let path = match body.path.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(candidate) => {
            let file = std::path::Path::new(candidate);
            if !file.is_absolute() {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    ErrorCode::InvalidConfig,
                    "The TransNetV2 model must be an absolute path.".to_owned(),
                    Some("Locate the model file instead of typing a relative path.".to_owned()),
                );
            }
            if !file.is_file() {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    ErrorCode::InvalidConfig,
                    format!("No model file exists at {candidate}"),
                    Some(
                        "Locate the ONNX model, or clear the path to use the engine's own search."
                            .to_owned(),
                    ),
                );
            }
            Some(candidate.to_owned())
        }
    };

    match state.set_scene_model(path).await {
        Ok(settings) => {
            tracing::info!(scene_model = ?settings.scene_model, "scene model updated");
            // The dependency row reports the model the engine would load, so a new
            // override has to reach the cached inventory before health is read again.
            state.refresh_preflight().await;
            Json(settings).into_response()
        }
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The model path was not changed.".to_owned()),
        ),
    }
}

/// Point the script editor's language server at one Python interpreter.
///
/// Packages belong to an interpreter, so a venv or a second install is invisible to the
/// server until this names its executable. A path is accepted only when it is absolute and
/// exists, matching the scene-model rule: a typo must fail here rather than when the editor
/// opens. `null` clears the setting and lets the server resolve `python` itself.
pub(super) async fn put_python_interpreter(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<PythonInterpreterUpdate>,
) -> Response {
    let path = match body.path.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(candidate) => {
            let file = std::path::Path::new(candidate);
            if !file.is_absolute() {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    ErrorCode::InvalidConfig,
                    "The Python interpreter must be an absolute path.".to_owned(),
                    Some("Locate the interpreter instead of typing a relative path.".to_owned()),
                );
            }
            if !file.is_file() {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    ErrorCode::InvalidConfig,
                    format!("No file exists at {candidate}"),
                    Some(
                        "Locate the `python` executable inside the environment whose packages the editor should see."
                            .to_owned(),
                    ),
                );
            }
            Some(candidate.to_owned())
        }
    };

    match state.set_python_interpreter(path).await {
        Ok(settings) => {
            tracing::info!(
                python_interpreter = ?settings.python_interpreter,
                "script editor interpreter updated"
            );
            Json(settings).into_response()
        }
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The interpreter was not changed.".to_owned()),
        ),
    }
}

/// Choose the release bundle or the machine's own installation for one capability.
///
/// The write is immediate. Encoder, FFmpeg and mkvmerge choices apply on the next use;
/// VapourSynth and metrics apply on the next start, because VSScript and the native metric
/// libraries initialise once per process. A Bundled choice is refused when this install does
/// not carry that provider, rather than accepting a restart that cannot work.
pub(super) async fn put_tool_source(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<ToolSourceUpdate>,
) -> Response {
    let Some(id) = crate::capability::toolchain::setting_id(&body.id) else {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            format!("No provider choice exists for `{}`", body.id),
            Some("Choose VapourSynth, an encoder, FFmpeg, MKVToolNix, or a metric row.".to_owned()),
        );
    };
    let source = body
        .source
        .as_deref()
        .map(str::trim)
        .filter(|source| !source.is_empty());
    if let Some(source) = source
        && !matches!(source, "bundled" | "system")
    {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            format!("Unknown provider source `{source}`"),
            Some("Choose `bundled`, `system`, or null for automatic selection.".to_owned()),
        );
    }
    let bundled_available = if id == crate::capability::vapoursynth::SETTING_ID {
        state.bundled_vapoursynth_available()
    } else {
        state.bundled_tool_available(&body.id)
    };
    if source == Some("bundled") && !bundled_available {
        let message = if id == crate::capability::vapoursynth::SETTING_ID {
            "This install carries no bundled VapourSynth runtime.".to_owned()
        } else {
            format!(
                "This install carries no bundled provider for `{}`.",
                body.id
            )
        };
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Use the system installation, or install a build that bundles it.".to_owned()),
        );
    }

    match state.set_tool_source(&id, source.map(str::to_owned)).await {
        Ok(settings) => {
            state.apply_tool_sources().await;
            tracing::info!(
                id = %id,
                source = source.unwrap_or("auto"),
                "the provider was saved"
            );
            Json(settings).into_response()
        }
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The provider was not changed.".to_owned()),
        ),
    }
}
