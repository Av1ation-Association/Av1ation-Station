use super::*;
use crate::api::json::ApiJson;

pub(super) async fn list_encoders(State(state): State<AppState>) -> Json<Vec<EncoderDescriptor>> {
    // Availability and the observed provider come from the same inventory the Dependencies
    // tab renders, so a probe accepted there is visible here without a restart.
    let report = state.preflight().await;
    let settings = state.settings().await;
    let mut entries: Vec<EncoderDescriptor> = catalogue::encoders()
        .into_iter()
        .map(|encoder| {
            // The engine's map is the base. A user edit adds or replaces descriptors and
            // hides the keys it removed, so a parameter the engine added later still
            // appears unless the user removed it deliberately.
            let engine_parameters = descriptors::builtin(&encoder.id, &encoder.parameters);
            let override_document = settings.encoder_overrides.get(&encoder.id);
            let mut parameters = match override_document {
                Some(document) => {
                    let mut merged = engine_parameters;
                    for removed in &document.removed {
                        merged.remove(removed.canonical());
                    }
                    for (key, descriptor) in &document.parameters {
                        merged.insert(key.canonical().to_owned(), descriptor.clone());
                    }
                    merged
                }
                None => engine_parameters,
            };
            // A saved override may predate the resolver or carry `Auto`; resolve it at the
            // same boundary as the engine catalogue so every caller sees one control shape.
            descriptors::resolve_descriptors(&mut parameters);
            // A custom provider is published under its own `custom:<family>` id, so the
            // catalogue must look for every spelling a probe can use; otherwise an
            // accepted replacement would be invisible here until the next restart.
            let candidates: Vec<&av1ation_contracts::encoder::PreflightCheck> = report
                .checks
                .iter()
                .filter(|check| {
                    check.id == encoder.id
                        || check.id == format!("encoder:{}", encoder.id)
                        || check.id == format!("custom:{}", encoder.id)
                })
                .collect();
            let check = candidates
                .iter()
                .find(|check| check.available)
                .copied()
                .or_else(|| candidates.first().copied());
            EncoderDescriptor {
                base: encoder.id.clone(),
                id: encoder.id,
                label: encoder.label,
                default: encoder.default,
                parameters,
                source: DescriptorSource::Builtin,
                executable: check.and_then(|check| check.path.clone()),
                version: check
                    .filter(|check| check.available)
                    .map(|check| check.detail.clone()),
                available: check.is_some_and(|check| check.available),
                fork: false,
                overridden: override_document.is_some(),
            }
        })
        .collect();
    // Forks are extra catalogue entries beside their base encoder, never a replacement for
    // the provider row. They load from the settings document so a saved fork is visible to
    // every host without a restart.
    entries.extend(
        settings
            .encoder_forks
            .iter()
            .map(crate::capability::forks::descriptor),
    );
    Json(entries)
}

/// Replace the descriptor set one built-in encoder offers.
///
/// A fork keeps its parameters on the fork; this route is only for the engine's own
/// encoders. The request is the complete set the editor showed, so the keys it omits are
/// recorded as removals rather than merging two partial maps.
pub(super) async fn put_encoder_parameters(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    ApiJson(body): ApiJson<EncoderParametersUpdate>,
) -> Response {
    let Some(encoder) = catalogue::encoders()
        .into_iter()
        .find(|encoder| encoder.id == id)
    else {
        let message = if id.starts_with("fork:") {
            "A saved fork keeps its parameters on the fork itself.".to_owned()
        } else {
            format!("No built-in encoder matches {id}")
        };
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            message,
            Some("Refresh Settings and try again.".to_owned()),
        );
    };
    for (key, descriptor) in &body.parameters {
        if let Err(message) = valid_parameter_key(key.canonical()) {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                message,
                Some("Use a CLI spelling such as --enable-custom-thing.".to_owned()),
            );
        }
        if descriptor.label.trim().is_empty() {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                format!("{} needs a label.", key.canonical()),
                Some("Give every parameter a label the editor can show.".to_owned()),
            );
        }
    }

    let engine_parameters = descriptors::builtin(&encoder.id, &encoder.parameters);
    let removed: Vec<ParameterKey> = engine_parameters
        .keys()
        .filter(|key| {
            !body
                .parameters
                .keys()
                .any(|provided| provided.canonical() == key.as_str())
        })
        .map(|key| ParameterKey(key.clone()))
        .collect();
    // Saving the engine's own descriptors back is a reset, not an override that would
    // shadow a later engine change.
    let unchanged = removed.is_empty()
        && body.parameters.len() == engine_parameters.len()
        && body
            .parameters
            .iter()
            .all(|(key, descriptor)| engine_parameters.get(key.canonical()) == Some(descriptor));
    let document = if unchanged {
        None
    } else {
        Some(EncoderParameterOverride {
            parameters: body.parameters,
            removed,
        })
    };

    match state.set_encoder_override(&id, document).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The parameter edits were not saved.".to_owned()),
        ),
    }
}

/// Restore the engine's descriptors for one built-in encoder.
pub(super) async fn delete_encoder_parameters(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    if !catalogue::encoders().iter().any(|encoder| encoder.id == id) {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No built-in encoder matches {id}"),
            Some("Refresh Settings and try again.".to_owned()),
        );
    }
    match state.set_encoder_override(&id, None).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The encoder definitions were not restored.".to_owned()),
        ),
    }
}

/// A key has to be usable as an argv entry, not merely unique in a map.
pub(super) fn valid_parameter_key(key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.len() < 2 || key.len() > 64 {
        return Err(format!("`{key}` is not a usable CLI key."));
    }
    let bare = key.trim_start_matches('-');
    if bare.is_empty()
        || !bare
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
    {
        return Err(format!("`{key}` is not a usable CLI key."));
    }
    Ok(())
}

pub(super) async fn probe_encoder_fork(ApiJson(body): ApiJson<EncoderForkRequest>) -> Response {
    if let Err(message) = valid_fork_base(&body.base) {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Choose an encoder from the catalogue.".to_owned()),
        );
    }
    let path = match valid_fork_path(&body.path) {
        Ok(path) => path,
        Err(message) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                message,
                Some("Choose the encoder executable.".to_owned()),
            );
        }
    };
    let base = body.base;
    match tokio::task::spawn_blocking(move || crate::capability::forks::probe(&base, &path)).await {
        Ok(probe) => Json(probe).into_response(),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Internal,
            format!("The probe did not complete: {error}"),
            Some("Try the probe again.".to_owned()),
        ),
    }
}

pub(super) async fn create_encoder_fork(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<EncoderForkRequest>,
) -> Response {
    let label = match valid_fork_label(&body.label) {
        Ok(label) => label,
        Err(message) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                message,
                Some("Give the fork a display name.".to_owned()),
            );
        }
    };
    if let Err(message) = valid_fork_base(&body.base) {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            message,
            Some("Choose an encoder from the catalogue.".to_owned()),
        );
    }
    let path = match valid_fork_path(&body.path) {
        Ok(path) => path,
        Err(message) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                message,
                Some("Choose the encoder executable.".to_owned()),
            );
        }
    };

    let base = body.base.clone();
    let probe_path = path.clone();
    let probe = match tokio::task::spawn_blocking(move || {
        crate::capability::forks::probe(&base, &probe_path)
    })
    .await
    {
        Ok(probe) => probe,
        Err(error) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Internal,
                format!("The probe did not complete: {error}"),
                Some("Try the probe again.".to_owned()),
            );
        }
    };
    if !probe.available {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            format!("{} was rejected: {}", path.display(), probe.detail),
            Some("Choose an executable that identifies as this encoder.".to_owned()),
        );
    }

    let settings = state.settings().await;
    let mut id = crate::capability::forks::slug(&label);
    let mut suffix = 2_u32;
    while settings.encoder_forks.iter().any(|fork| fork.id == id) {
        id = format!("{}-{suffix}", crate::capability::forks::slug(&label));
        suffix += 1;
    }

    let fork = EncoderFork {
        id: id.clone(),
        label,
        base: body.base,
        executable: path.display().to_string(),
        version: probe.version,
        parameters: probe.parameters,
        parameters_edited: false,
    };
    match state.set_encoder_fork(&id, Some(fork.clone())).await {
        Ok(_) => {
            tracing::info!(fork = %id, "encoder fork saved");
            Json(fork).into_response()
        }
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The fork was not saved.".to_owned()),
        ),
    }
}

pub(super) async fn update_encoder_fork(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    ApiJson(body): ApiJson<EncoderForkUpdate>,
) -> Response {
    let Some(mut fork) = state
        .settings()
        .await
        .encoder_forks
        .into_iter()
        .find(|fork| fork.id == id)
    else {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No encoder fork matches {id}"),
            Some("Refresh Settings and try again.".to_owned()),
        );
    };

    if let Some(label) = body.label.as_deref() {
        match valid_fork_label(label) {
            Ok(label) => fork.label = label,
            Err(message) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    ErrorCode::InvalidConfig,
                    message,
                    Some("Give the fork a display name.".to_owned()),
                );
            }
        }
    }
    if let Some(path) = body.path.as_deref() {
        let path = match valid_fork_path(path) {
            Ok(path) => path,
            Err(message) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    ErrorCode::InvalidConfig,
                    message,
                    Some("Choose the encoder executable.".to_owned()),
                );
            }
        };
        let base = fork.base.clone();
        let probe_path = path.clone();
        let probe = match tokio::task::spawn_blocking(move || {
            crate::capability::forks::probe(&base, &probe_path)
        })
        .await
        {
            Ok(probe) => probe,
            Err(error) => {
                return error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorCode::Internal,
                    format!("The probe did not complete: {error}"),
                    Some("Try the probe again.".to_owned()),
                );
            }
        };
        if !probe.available {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                format!("{} was rejected: {}", path.display(), probe.detail),
                Some("The saved path was left unchanged.".to_owned()),
            );
        }
        fork.executable = path.display().to_string();
        fork.version = probe.version;
        if body.parameters.is_none() {
            fork.parameters = probe.parameters;
            // A new executable's help is the source of the map again, so a restart may
            // refresh it; the user asked for that probe by changing the path.
            fork.parameters_edited = false;
        }
    }
    if let Some(parameters) = body.parameters {
        if parameters.is_empty() && !fork.parameters.is_empty() {
            // An explicit empty map is a valid request: it clears the probed set.
            fork.parameters.clear();
        } else {
            fork.parameters = parameters;
        }
        fork.parameters_edited = true;
    }

    match state
        .set_encoder_fork(&fork.id.clone(), Some(fork.clone()))
        .await
    {
        Ok(_) => Json(fork).into_response(),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The fork was not changed.".to_owned()),
        ),
    }
}

pub(super) async fn delete_encoder_fork(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    if !state
        .settings()
        .await
        .encoder_forks
        .iter()
        .any(|fork| fork.id == id)
    {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No encoder fork matches {id}"),
            Some("Refresh Settings and try again.".to_owned()),
        );
    }
    match state.set_encoder_fork(&id, None).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The fork was not removed.".to_owned()),
        ),
    }
}

pub(super) fn valid_fork_base(base: &str) -> Result<(), String> {
    match ToolFamily::parse(base) {
        Some(family)
            if family.capability()
                == av1ation_engine::capability::preflight::Capability::Encode =>
        {
            Ok(())
        }
        _ => Err(format!("`{base}` is not an encoder family.")),
    }
}

pub(super) fn valid_fork_label(label: &str) -> Result<String, String> {
    let label = label.trim();
    if label.is_empty() {
        return Err("The fork needs a display name.".to_owned());
    }
    if label.chars().count() > 80 {
        return Err("The fork name is longer than 80 characters.".to_owned());
    }
    Ok(label.to_owned())
}

pub(super) fn valid_fork_path(path: &str) -> Result<PathBuf, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("The fork needs an executable path.".to_owned());
    }
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err(format!("{} is not a file.", path.display()));
    }
    Ok(path)
}
