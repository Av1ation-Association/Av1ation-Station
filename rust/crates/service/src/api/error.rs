use av1ation_contracts::protocol::{ErrorBody, ErrorCode};
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};

/// Build the one error envelope the router returns, so every failure has a stable code.
pub(crate) fn error_response(
    status: StatusCode,
    code: ErrorCode,
    message: String,
    hint: Option<String>,
) -> Response {
    error_response_with_detail(status, code, message, None, hint)
}

/// Same envelope with engine or operating-system text kept out of `message`.
pub(crate) fn error_response_with_detail(
    status: StatusCode,
    code: ErrorCode,
    message: String,
    detail: Option<String>,
    hint: Option<String>,
) -> Response {
    (
        status,
        Json(ErrorBody {
            code,
            message,
            detail,
            hint,
            correlation: None,
        }),
    )
        .into_response()
}
