use std::sync::OnceLock;

use super::*;
use crate::api::json::ApiJson;

/// The newest published release, or the repository's answer that there is none.
pub(super) async fn check_for_update(State(state): State<AppState>) -> Response {
    match diagnostics::check_update(&state.info.version).await {
        Ok(status) => Json::<UpdateStatus>(status).into_response(),
        Err(message) => error_response(
            StatusCode::BAD_GATEWAY,
            ErrorCode::Internal,
            message,
            Some(
                "The check reads the repository's newest published release. Try again when you are online."
                    .to_owned(),
            ),
        ),
    }
}

/// The query for the support bundle: the chosen project manifests and the log tail.
#[derive(Debug, Deserialize)]
pub(crate) struct BundleQuery {
    /// Comma-separated project ids, because one bundle can carry several manifests.
    projects: Option<String>,
    logs: Option<bool>,
}

impl BundleQuery {
    /// Ids as the store receives them: trimmed, with an empty selection meaning none.
    fn project_ids(&self) -> Vec<String> {
        self.projects
            .as_deref()
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|id| !id.is_empty())
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    }
}

/// Build a redacted support bundle. Nothing is written or uploaded here: the screen decides
/// whether to copy it, save it, or discard it.
pub(super) async fn diagnostics_bundle(
    State(state): State<AppState>,
    Query(query): Query<BundleQuery>,
) -> Response {
    match diagnostics::bundle(&state, &query.project_ids(), query.logs.unwrap_or(true)).await {
        Ok(bundle) => Json(bundle).into_response(),
        Err(error) => {
            let status = match error.code {
                ErrorCode::NotFound => StatusCode::NOT_FOUND,
                ErrorCode::InvalidConfig => StatusCode::BAD_REQUEST,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            };
            error_response(
                status,
                error.code,
                error.message,
                Some("The bundle reads only local state and logs; try again, or leave the project out.".to_owned()),
            )
        }
    }
}

pub(super) async fn health(State(state): State<AppState>) -> Json<AppInfo> {
    let mut info = state.info.clone();
    info.preflight = state.preflight().await;
    Json(info)
}

/// The toolchain summary is generated from the reviewed lock at build time, so answering it
/// never reads the filesystem and cannot drift from the binary's own target.
pub(super) async fn toolchain() -> Json<ToolchainInfo> {
    static SUMMARY: OnceLock<ToolchainInfo> = OnceLock::new();
    Json(
        SUMMARY
            .get_or_init(|| {
                serde_json::from_str(include_str!(concat!(
                    env!("OUT_DIR"),
                    "/toolchain-summary.json"
                )))
                .expect("the build-generated toolchain summary is valid")
            })
            .clone(),
    )
}

pub(super) async fn refresh_preflight(State(state): State<AppState>) -> Json<PreflightReport> {
    let report = state.refresh_preflight().await;
    tracing::info!(
        available = report.available_count,
        total = report.total_count,
        "preflight refreshed"
    );
    Json(report)
}

pub(super) async fn add_custom_preflight(
    State(state): State<AppState>,
    ApiJson(body): ApiJson<CustomToolRequest>,
) -> Response {
    let Some(family) = ToolFamily::parse(&body.kind) else {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            format!("Unknown executable family `{}`", body.kind),
            Some(format!(
                "Choose one of: {}.",
                ToolFamily::ALL
                    .iter()
                    .map(|family| family.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
        );
    };

    let path = body.path.trim();
    if path.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            "A custom executable needs a path.".to_owned(),
            Some("Choose the executable file, then probe it again.".to_owned()),
        );
    }

    match state.add_custom_tool(family, PathBuf::from(path)).await {
        Ok(check) => {
            // The accepted path replaces the bundled link as the program `which` resolves.
            state.refresh_toolbin().await;
            (StatusCode::OK, Json(check)).into_response()
        }
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("The executable works, but its path could not be saved.".to_owned()),
        ),
    }
}

pub(super) async fn remove_custom_preflight(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    match state.remove_custom_tool(&id).await {
        Ok(true) => {
            // Restore the bundled or system link the custom path had replaced.
            state.refresh_toolbin().await;
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(false) => error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No custom executable matches {id}"),
            Some("Refresh the dependency inventory and try again.".to_owned()),
        ),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some(
                "The executable was not removed because its settings could not be saved."
                    .to_owned(),
            ),
        ),
    }
}

pub(super) async fn storage_overview(State(state): State<AppState>) -> Json<StorageOverview> {
    Json(state.storage_overview().await)
}

/// Every sequence this build can run, with the configuration section that drives it.
pub(super) async fn list_sequences() -> Json<Vec<SequenceDescriptor>> {
    const CATALOGUE: [(&str, &str, &str); 7] = [
        ("SceneDetector", "Scene Detector", "scene_detector"),
        ("NoiseDetector", "Noise Detector", "noise_detector"),
        ("NoiseScaler", "Noise Scaler", "noise_scaler"),
        ("TargetQuality", "Target Quality", "target_quality"),
        ("ParallelEncoder", "Parallel Encoder", "parallel_encoder"),
        (
            "SceneConcatenator",
            "Scene Concatenator",
            "scene_concatenator",
        ),
        ("QualityCheck", "Quality Check", "quality_check"),
    ];
    let defaults = default_config();
    let sequences = defaults.get("sequences");
    Json(
        CATALOGUE
            .into_iter()
            .map(|(id, name, section)| SequenceDescriptor {
                id: id.to_owned(),
                name: name.to_owned(),
                section: section.to_owned(),
                config: sequences
                    .and_then(|sequences| sequences.get(section))
                    .cloned()
                    .unwrap_or(Value::Null),
            })
            .collect(),
    )
}
