use super::*;
use crate::api::json::ApiJson;

/// The repeatable credential a `<video>` puts in the URL of each range request.
///
/// A media element makes a request per byte range and one per still, so a one-use ticket
/// would not survive the first. The ticket is issued only to a paired session and accepted
/// only on a GET for a media or frame route.
pub(super) async fn media_ticket(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match state.issue_media_ticket(&headers).await {
        Some(ticket) => Json(MediaTicket { ticket }).into_response(),
        None => error_response(
            StatusCode::CONFLICT,
            ErrorCode::InvalidConfig,
            "A media ticket is only available to a paired LAN browser.".to_owned(),
            Some("The desktop window reads media without one.".to_owned()),
        ),
    }
}

/// One token, one page, and one SSE stream. `EventSource` cannot send an Authorization
/// header, so the browser exchanges its bearer token for a one-use ticket first.
pub(super) async fn event_ticket(State(state): State<AppState>) -> Response {
    match state.issue_event_ticket().await {
        Some(ticket) => Json(EventTicket { ticket }).into_response(),
        None => error_response(
            StatusCode::CONFLICT,
            ErrorCode::InvalidConfig,
            "An event ticket is only available while LAN access is enabled.".to_owned(),
            Some("Event streams on the loopback listener do not need a ticket.".to_owned()),
        ),
    }
}

pub(super) async fn lan_status(State(state): State<AppState>) -> Json<LanStatus> {
    Json(state.lan().status().await)
}

/// Exchange the short code shown in Settings for that browser's bearer token.
///
/// This is the one network route that does not require a token, because the caller is by
/// definition not paired yet. The gate still requires a same-origin request. A wrong,
/// expired, or revoked code answers the same `401`; repeated failures from one peer answer
/// `429` with `Retry-After` before the code lookup.
pub(super) async fn pair_browser(
    State(state): State<AppState>,
    extensions: Extensions,
    ApiJson(body): ApiJson<PairRequest>,
) -> Response {
    let peer = extensions
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip());
    match state.lan().pair(&body.shortcode, peer).await {
        PairAttempt::Issued(token) => Json(LanPairing { token }).into_response(),
        PairAttempt::Invalid => error_response(
            StatusCode::UNAUTHORIZED,
            ErrorCode::Unauthorized,
            "That pairing code is not valid.".to_owned(),
            Some("Check the code in Settings → Network, or create a new one.".to_owned()),
        ),
        PairAttempt::Throttled(retry_after) => {
            let seconds = retry_after.as_secs().max(1);
            let mut response = error_response(
                StatusCode::TOO_MANY_REQUESTS,
                ErrorCode::Busy,
                format!("Too many pairing attempts. Try again in {seconds} seconds."),
                Some("Wait for the window to expire before trying another code.".to_owned()),
            );
            if let Ok(value) = HeaderValue::from_str(&seconds.to_string()) {
                response.headers_mut().insert(header::RETRY_AFTER, value);
            }
            response
        }
    }
}

pub(super) async fn enable_lan(State(state): State<AppState>) -> Response {
    match state.enable_lan().await {
        Ok(status) => Json(status).into_response(),
        Err(message) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            message,
            Some("Close the other process using the network port and try again.".to_owned()),
        ),
    }
}

pub(super) async fn disable_lan(State(state): State<AppState>) -> Json<LanStatus> {
    state.disable_lan().await;
    Json(state.lan().status().await)
}

pub(super) async fn rotate_lan(State(state): State<AppState>) -> Response {
    match state.rotate_lan_token().await {
        Ok(status) => Json(status).into_response(),
        Err(message) => error_response(
            StatusCode::CONFLICT,
            ErrorCode::InvalidConfig,
            message,
            Some("Enable LAN access first.".to_owned()),
        ),
    }
}

pub(super) async fn revoke_lan_session(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
) -> Response {
    match state.revoke_lan_session(&session_id).await {
        Ok(status) => Json(status).into_response(),
        Err(message) => error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            message,
            Some("Reload Settings to see the current paired browsers.".to_owned()),
        ),
    }
}

/// The LAN listener is reachable from a browser on another device, so every response
/// carries the same framing and caching posture. API responses are never cached.
pub(super) async fn security_headers(request: Request, next: Next) -> Response {
    let is_api = request.uri().path().starts_with("/api");
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
        ),
    );
    headers.insert(
        header::CACHE_CONTROL,
        if is_api {
            HeaderValue::from_static("no-store")
        } else {
            HeaderValue::from_static("no-cache")
        },
    );
    response
}
