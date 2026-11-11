use std::path::{Component, Path};

use axum::{
    body::Body,
    extract::{Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

use crate::state::AppState;

pub(crate) async fn serve_static(State(state): State<AppState>, request: Request) -> Response {
    let Some(root) = state.web_root.as_deref() else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let requested = request.uri().path().trim_start_matches('/');
    if requested.is_empty() {
        if let Ok(bytes) = tokio::fs::read(root.join("index.html")).await {
            return file_response(Path::new("index.html"), bytes);
        }
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }

    let relative = Path::new(requested);
    if !relative
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        return (StatusCode::BAD_REQUEST, "Invalid path").into_response();
    }

    let candidate = root.join(relative);
    if let Ok(bytes) = tokio::fs::read(&candidate).await {
        return file_response(&candidate, bytes);
    }

    if relative.extension().is_none()
        && let Ok(bytes) = tokio::fs::read(root.join("index.html")).await
    {
        return file_response(Path::new("index.html"), bytes);
    }

    (StatusCode::NOT_FOUND, "Not found").into_response()
}

fn file_response(path: &Path, bytes: Vec<u8>) -> Response {
    let content_type = match path.extension().and_then(|extension| extension.to_str()) {
        Some("css") => "text/css; charset=utf-8",
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    };
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(bytes))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}
