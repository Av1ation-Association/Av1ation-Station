mod encoders;
mod lan;
mod logging;
mod manifest;
mod project;
mod run;
mod scenes;
mod script;
mod settings;
mod system;
mod video;

use std::{net::SocketAddr, path::PathBuf};

use av1ation_contracts::encoder::{
    CustomToolRequest, DescriptorSource, EncoderDescriptor, EncoderFork, EncoderForkRequest,
    EncoderForkUpdate, EncoderParameterOverride, EncoderParametersUpdate, FilterSchemas,
    ParameterKey, PreflightReport, PythonInterpreterUpdate, ToolSourceUpdate,
};
use av1ation_contracts::platform::{
    AppInfo, LanPairing, LanStatus, PairRequest, StorageOverview, ToolchainInfo, UpdateStatus,
};
use av1ation_contracts::project::{
    ProjectTemplate, ProjectTemplateCreateRequest, ProjectTemplateDefaultRequest,
    ProjectTemplateUpdate,
};
use av1ation_contracts::protocol::{ErrorCode, EventTicket, MediaTicket};
use av1ation_contracts::run::SequenceDescriptor;
use av1ation_contracts::scene::SceneModelUpdate;
use av1ation_contracts::script::{
    ScriptCheck, ScriptCheckRequest, ScriptCheckStatus, ScriptClip, ScriptGuide,
    ScriptMaterialiseRequest, ScriptMaterialised, ScriptMaterialisedVariable, ScriptValueFormat,
};
use av1ation_contracts::settings::{
    AppSettings, AppSettingsUpdate, EffectiveConfig, GeneralDefaults,
};
use av1ation_engine::capability::catalogue;
use av1ation_engine::capability::preflight::ToolFamily;
use av1ation_engine::script::check::{ScriptOutcome, evaluate};
use axum::{
    Json, Router,
    extract::{ConnectInfo, Path as AxumPath, Query, Request, State, WebSocketUpgrade},
    http::{Extensions, HeaderMap, HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::Value;
use tower_http::trace::TraceLayer;

use crate::{
    api::error::error_response,
    api::lan::PairAttempt,
    api::static_files::serve_static,
    capability::descriptors,
    platform::diagnostics,
    project::projects::{StoreError, default_config},
    state::AppState,
};
use lan::*;

pub(crate) fn router(state: AppState) -> Router {
    manifest::routes()
        .fallback(fallback)
        .layer(axum::middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[derive(serde::Serialize)]
struct RouteManifest {
    routes: &'static [manifest::RouteGroup],
}

/// The route vocabulary serialized for the build-time client and docs generator.
pub(crate) fn route_manifest_json() -> String {
    serde_json::to_string_pretty(&RouteManifest {
        routes: manifest::ROUTES,
    })
    .unwrap_or_else(|_| "{\"routes\":[]}".to_owned())
}

fn project_not_found(project_id: &str) -> Response {
    error_response(
        StatusCode::NOT_FOUND,
        ErrorCode::NotFound,
        format!("No project matches {project_id}"),
        Some("Reload the project list and try again.".to_owned()),
    )
}

fn locked() -> Response {
    error_response(
        StatusCode::LOCKED,
        ErrorCode::Locked,
        "Configuration is read-only while an encode is running.".to_owned(),
        Some("Cancel the run before editing configuration.".to_owned()),
    )
}

fn no_storage() -> Response {
    error_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        ErrorCode::Io,
        "This host does not persist projects.".to_owned(),
        Some("Run the desktop app or a headless service with a data directory.".to_owned()),
    )
}

/// Map a store failure onto the one error envelope. A newer schema is a client-visible
/// version skew, so it is reported as an invalid request rather than a server fault.
fn project_error(error: StoreError) -> Response {
    let status = match &error {
        StoreError::Invalid(_) => StatusCode::BAD_REQUEST,
        StoreError::NewerSchema(_) | StoreError::Corrupt(_) | StoreError::InvalidConfig(_) => {
            StatusCode::UNPROCESSABLE_ENTITY
        }
        StoreError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    let code = match &error {
        StoreError::Invalid(_)
        | StoreError::NewerSchema(_)
        | StoreError::Corrupt(_)
        | StoreError::InvalidConfig(_) => ErrorCode::InvalidConfig,
        StoreError::Io(_) => ErrorCode::Io,
    };
    error_response(status, code, error.message(), error.hint())
}

fn run_locked(message: &str) -> Response {
    error_response(
        StatusCode::LOCKED,
        ErrorCode::Locked,
        message.to_owned(),
        Some("Cancel the run, then try again.".to_owned()),
    )
}

fn video_not_found(video_id: &str) -> Response {
    error_response(
        StatusCode::NOT_FOUND,
        ErrorCode::NotFound,
        format!("No video matches {video_id}"),
        Some("Reload the project queue and try again.".to_owned()),
    )
}

async fn fallback(State(state): State<AppState>, request: Request) -> Response {
    let path = request.uri().path();
    if path == "/api" || path.starts_with("/api/") {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("No API route matches {path}"),
            None,
        );
    }
    serve_static(State(state), request).await
}

#[cfg(test)]
mod tests {
    #[test]
    fn route_manifest_json_round_trips() {
        let value: serde_json::Value = serde_json::from_str(&super::route_manifest_json())
            .expect("the static route manifest serializes");
        let routes = value["routes"]
            .as_array()
            .expect("the route manifest has a routes array");
        assert_eq!(routes.len(), 92);
        let methods: usize = routes
            .iter()
            .map(|route| route["methods"].as_array().map_or(0, Vec::len))
            .sum();
        assert_eq!(methods, 114);
    }
}
