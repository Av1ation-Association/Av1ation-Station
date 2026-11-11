//! The one place an HTTP request body is read.
//!
//! Every JSON handler takes [`ApiJson<T>`] instead of axum's `Json<T>`, so a body that
//! cannot be parsed produces the browser-facing envelope rather than axum's plain-text
//! rejection. `scripts/check-api-json.mjs` enforces that no other module names a raw
//! extractor.

use av1ation_contracts::protocol::ErrorCode;
use axum::{
    Json,
    extract::{FromRequest, Request, rejection::JsonRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
};

use crate::api::error::error_response;

/// A JSON request body that has already been read by the one boundary.
#[derive(Debug)]
pub(crate) struct ApiJson<T>(pub(crate) T);

/// A body that could not be read. The parser's own text is deliberately discarded.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ApiJsonRejection;

impl IntoResponse for ApiJsonRejection {
    fn into_response(self) -> Response {
        error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            "The request body could not be read.".to_owned(),
            Some("Reload the app; if it persists, update it.".to_owned()),
        )
    }
}

impl<S, T> FromRequest<S> for ApiJson<T>
where
    Json<T>: FromRequest<S, Rejection = JsonRejection>,
    S: Send + Sync,
{
    type Rejection = ApiJsonRejection;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(request, state)
            .await
            .map_err(|_| ApiJsonRejection)?;
        Ok(Self(value))
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        body::{Body, to_bytes},
        http::{Request as HttpRequest, StatusCode, header},
    };
    use serde::Deserialize;

    use super::*;

    #[derive(Debug, Deserialize, PartialEq)]
    struct Payload {
        value: u32,
    }

    fn request(body: &str, content_type: Option<&str>) -> HttpRequest<Body> {
        let mut builder = HttpRequest::post("/");
        if let Some(content_type) = content_type {
            builder = builder.header(header::CONTENT_TYPE, content_type);
        }
        builder
            .body(Body::from(body.to_owned()))
            .expect("a valid request")
    }

    async fn rejection(body: &str, content_type: Option<&str>) -> (StatusCode, serde_json::Value) {
        let response =
            match ApiJson::<Payload>::from_request(request(body, content_type), &()).await {
                Ok(_) => panic!("the body was accepted"),
                Err(rejection) => rejection.into_response(),
            };
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("the envelope body");
        let value = serde_json::from_slice(&bytes).expect("the envelope is JSON");
        (status, value)
    }

    async fn assert_generic_rejection(body: &str, content_type: Option<&str>) {
        let (status, value) = rejection(body, content_type).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(value["code"], "INVALID_CONFIG");
        assert_eq!(value["message"], "The request body could not be read.");
        assert_eq!(value["hint"], "Reload the app; if it persists, update it.");
        assert!(
            value.get("detail").is_none(),
            "the parser's text must stay out of the envelope: {value}"
        );
    }

    #[tokio::test]
    async fn a_valid_body_is_read() {
        let request = request(r#"{"value":7}"#, Some("application/json"));
        let ApiJson(payload) = ApiJson::<Payload>::from_request(request, &())
            .await
            .expect("the body is valid");
        assert_eq!(payload, Payload { value: 7 });
    }

    #[tokio::test]
    async fn a_missing_content_type_is_rejected_with_the_generic_envelope() {
        assert_generic_rejection(r#"{"value":7}"#, None).await;
    }

    #[tokio::test]
    async fn a_wrong_content_type_is_rejected_with_the_generic_envelope() {
        assert_generic_rejection(r#"{"value":7}"#, Some("text/plain")).await;
    }

    #[tokio::test]
    async fn malformed_json_is_rejected_without_the_parser_text() {
        assert_generic_rejection("{", Some("application/json")).await;
    }

    #[tokio::test]
    async fn a_shape_mismatch_is_rejected_with_the_generic_envelope() {
        assert_generic_rejection(r#"{"value":"seven"}"#, Some("application/json")).await;
    }
}
