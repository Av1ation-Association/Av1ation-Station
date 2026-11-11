//! The opt-in network listener and its bearer-token gate.
//!
//! The desktop window always talks to the loopback listener. LAN mode starts a second
//! listener bound to every interface, and only that listener requires a token. Static
//! assets are public so a browser can load the shell; every API request must present the
//! token or a one-use event ticket.

use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket},
    sync::Arc,
    time::{Duration, Instant},
};

use av1ation_contracts::platform::{LanSession, LanStatus};
use av1ation_contracts::protocol::ErrorCode;
use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, Method, StatusCode, header},
    middleware::Next,
    response::Response,
};
use tokio::{
    net::TcpListener,
    sync::{Mutex, watch},
    task::JoinHandle,
    time::timeout,
};
use uuid::Uuid;

use crate::{api::error::error_response, api::routes, state::AppState};

const TICKET_TTL: Duration = Duration::from_secs(60);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);
const MAX_TICKETS: usize = 64;
const SESSION_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_SESSIONS: usize = 16;
/// Five bad codes from one peer in a minute; a LAN browser rarely mistypes more than that,
/// and the window is short enough that a fat-fingered user can recover without a restart.
const MAX_PAIR_FAILURES: u32 = 5;
const PAIR_FAILURE_WINDOW: Duration = Duration::from_secs(60);
/// Eight characters, with `0`/`O` and `1`/`I` removed. Thirty-two symbols means each
/// character carries exactly five bits, and forty bits makes an online guess expensive.
const SHORTCODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// The LAN listener's shared state. Cloned into `AppState`, so every request sees the same
/// token and the same one-use ticket set.
#[derive(Clone, Default)]
pub(crate) struct LanController {
    inner: Arc<Mutex<LanInner>>,
}

#[derive(Default)]
struct LanInner {
    sessions: Vec<Session>,
    address: Option<SocketAddr>,
    shutdown: Option<watch::Sender<bool>>,
    task: Option<JoinHandle<()>>,
    tickets: HashMap<String, Instant>,
    pair_failures: HashMap<IpAddr, PairFailure>,
}

/// One accepted browser token and what the desktop window can say about it.
struct Session {
    id: String,
    token: String,
    /// Credential a media element can carry in its URL. Distinct from the bearer token
    /// above: the listener accepts it only for a GET on a media route.
    media_token: String,
    shortcode: String,
    label: String,
    address: Option<String>,
    created: Instant,
    created_at: String,
    last_seen: Option<String>,
}

/// One peer's failed pairing attempts in the current window.
struct PairFailure {
    attempts: u32,
    started: Instant,
}

/// The result of exchanging a pairing code for a token.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PairAttempt {
    /// The code named a live session.
    Issued(String),
    /// The code was absent, expired, or revoked.
    Invalid,
    /// This peer has failed too often and must wait before trying again.
    Throttled(Duration),
}

impl LanController {
    /// Return the current listener state. The token is included because this response is
    /// served by the loopback host to its own desktop window.
    pub(crate) async fn status(&self) -> LanStatus {
        let inner = self.inner.lock().await;
        status_locked(&inner)
    }

    /// Start the network listener, or return the one already running. Binding is explicit:
    /// the listener is never started by a settings read.
    pub(crate) async fn enable(&self, state: AppState) -> Result<LanStatus, String> {
        let mut inner = self.inner.lock().await;
        if inner.address.is_some() {
            return Ok(status_locked(&inner));
        }

        let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
            .await
            .map_err(|error| format!("could not bind the network listener: {error}"))?;
        let address = listener
            .local_addr()
            .map_err(|error| format!("the network listener has no address: {error}"))?;
        let token = random_token();
        let session = Session {
            id: Uuid::new_v4().simple().to_string(),
            token: token.clone(),
            media_token: random_token(),
            shortcode: fresh_shortcode(&inner.sessions),
            label: "Desktop pairing".to_owned(),
            address: None,
            created: Instant::now(),
            created_at: crate::project::videos::iso8601(crate::project::videos::now_epoch()),
            last_seen: None,
        };
        let (shutdown, mut shutdown_rx) = watch::channel(false);

        let app =
            routes::router(state.clone()).layer(axum::middleware::from_fn_with_state(state, gate));
        let task = tokio::spawn(async move {
            let result = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.changed().await;
            })
            .await;
            if let Err(error) = result {
                tracing::error!(%error, "LAN listener stopped");
            }
        });

        inner.sessions.clear();
        inner.sessions.push(session);
        inner.address = Some(address);
        inner.shutdown = Some(shutdown);
        inner.task = Some(task);
        inner.tickets.clear();
        inner.pair_failures.clear();
        tracing::info!(%address, "LAN listener enabled");
        Ok(status_locked(&inner))
    }

    /// Stop accepting network requests. The loopback listener is untouched.
    pub(crate) async fn disable(&self) {
        let (shutdown, task) = {
            let mut inner = self.inner.lock().await;
            let shutdown = inner.shutdown.take();
            let task = inner.task.take();
            inner.sessions.clear();
            inner.address = None;
            inner.tickets.clear();
            inner.pair_failures.clear();
            (shutdown, task)
        };
        if let Some(shutdown) = shutdown {
            let _ = shutdown.send(true);
        }
        if let Some(task) = task {
            let _ = timeout(SHUTDOWN_GRACE, task).await;
        }
        tracing::info!("LAN listener disabled");
    }

    /// Issue a pairing token for another browser without invalidating the existing ones.
    pub(crate) async fn new_session(&self) -> Result<LanStatus, String> {
        let mut inner = self.inner.lock().await;
        if inner.address.is_none() {
            return Err("LAN access is not enabled.".to_owned());
        }
        expire_sessions(&mut inner);
        if inner.sessions.len() >= MAX_SESSIONS {
            return Err("Too many paired browsers. Revoke one first.".to_owned());
        }
        let shortcode = fresh_shortcode(&inner.sessions);
        inner.sessions.insert(
            0,
            Session {
                id: Uuid::new_v4().simple().to_string(),
                token: random_token(),
                media_token: random_token(),
                shortcode,
                label: "Paired browser".to_owned(),
                address: None,
                created: Instant::now(),
                created_at: crate::project::videos::iso8601(crate::project::videos::now_epoch()),
                last_seen: None,
            },
        );
        Ok(status_locked(&inner))
    }

    /// Exchange a human-transcribable pairing code for its session token.
    ///
    /// The code is normalized on the service side, so the browser may send the displayed
    /// `ABCD-EFGH` form or the compact lowercase form. A missing or stale session is the
    /// same invalid answer, which keeps the endpoint from confirming whether a code exists.
    ///
    /// Failures are counted per network peer. The loopback listener has no peer address and
    /// is trusted; the LAN listener always supplies one.
    pub(crate) async fn pair(&self, shortcode: &str, peer: Option<IpAddr>) -> PairAttempt {
        let mut inner = self.inner.lock().await;
        expire_sessions(&mut inner);
        let now = Instant::now();

        if let Some(address) = peer {
            let expired = inner
                .pair_failures
                .get(&address)
                .is_some_and(|window| now.duration_since(window.started) >= PAIR_FAILURE_WINDOW);
            if expired {
                inner.pair_failures.remove(&address);
            }
            if let Some(window) = inner.pair_failures.get(&address)
                && window.attempts >= MAX_PAIR_FAILURES
            {
                return PairAttempt::Throttled(
                    PAIR_FAILURE_WINDOW.saturating_sub(now.duration_since(window.started)),
                );
            }
        }

        let code = normalise_shortcode(shortcode);
        let token = if code.len() == 8 {
            inner
                .sessions
                .iter()
                .find(|session| token_matches(&session.shortcode, &code))
                .map(|session| session.token.clone())
        } else {
            None
        };
        if let Some(token) = token {
            if let Some(address) = peer {
                inner.pair_failures.remove(&address);
            }
            return PairAttempt::Issued(token);
        }

        if let Some(address) = peer {
            let window = inner.pair_failures.entry(address).or_insert(PairFailure {
                attempts: 0,
                started: now,
            });
            window.attempts = window.attempts.saturating_add(1);
        }
        PairAttempt::Invalid
    }

    /// Revoke exactly one browser. Other sessions keep their tokens.
    pub(crate) async fn revoke(&self, id: &str) -> Result<LanStatus, String> {
        let mut inner = self.inner.lock().await;
        let before = inner.sessions.len();
        inner.sessions.retain(|session| session.id != id);
        if inner.sessions.len() == before {
            return Err("That paired browser no longer exists.".to_owned());
        }
        inner.tickets.clear();
        Ok(status_locked(&inner))
    }

    /// Issue one short-lived EventSource ticket. `None` when LAN mode is off: the loopback
    /// browser does not need a ticket and must not be handed one by accident.
    pub(crate) async fn issue_ticket(&self) -> Option<String> {
        let mut inner = self.inner.lock().await;
        // A ticket exists only for a request that arrived on the network listener.
        inner.address?;
        let now = Instant::now();
        inner.tickets.retain(|_, expiry| *expiry > now);
        if inner.tickets.len() >= MAX_TICKETS {
            return None;
        }
        let ticket = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        inner.tickets.insert(ticket.clone(), now + TICKET_TTL);
        Some(ticket)
    }

    /// Return the media credential of the session making this request.
    ///
    /// A `<video>` cannot attach a bearer header, so the paired browser asks for this once
    /// and appends it to media URLs. It exists only on the network listener: the embedded
    /// window needs no ticket and must never be handed one.
    pub(crate) async fn issue_media_ticket(&self, headers: &HeaderMap) -> Option<String> {
        let mut inner = self.inner.lock().await;
        inner.address?;
        expire_sessions(&mut inner);
        let bearer = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))?;
        inner
            .sessions
            .iter()
            .find(|session| token_matches(&session.token, bearer))
            .map(|session| session.media_token.clone())
    }

    /// Validate a request that arrived on the network listener. An event ticket is consumed
    /// here, so a copied stream URL cannot be replayed; a media ticket stays valid for its
    /// session, because one picture makes many range requests.
    async fn verify(
        &self,
        headers: &HeaderMap,
        method: &Method,
        path: &str,
        query: Option<&str>,
        peer: Option<SocketAddr>,
    ) -> bool {
        let mut inner = self.inner.lock().await;
        expire_sessions(&mut inner);
        let bearer = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "));

        if let Some(value) = bearer
            && let Some(session) = inner
                .sessions
                .iter_mut()
                .find(|session| token_matches(&session.token, value))
        {
            observe(session, headers, peer);
            return true;
        }

        // Both streams are opened by APIs that cannot attach the bearer header: EventSource
        // and WebSocket. Every other route keeps requiring the header.
        if (path.ends_with("/events") || path.ends_with("/editor/lsp"))
            && let Some(ticket) = query.and_then(|value| query_value(value, "ticket"))
            && let Some(expiry) = inner.tickets.remove(ticket)
        {
            return expiry > Instant::now();
        }

        // A media element cannot send a header, and a range request cannot reuse a one-use
        // ticket. The media credential is therefore repeatable, but only for a GET that
        // reads a source or one frame — never for a route that changes anything.
        if *method == Method::GET
            && is_media_path(path)
            && let Some(ticket) = query.and_then(|value| query_value(value, "media"))
        {
            return inner
                .sessions
                .iter()
                .any(|session| token_matches(&session.media_token, ticket));
        }
        false
    }
}

/// The gate for the network listener. Static files stay public; `/api/lan` remains a
/// loopback-only control surface so a paired browser cannot disable its own access.
pub(crate) async fn gate(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    if !path.starts_with("/api") {
        return next.run(request).await;
    }
    // A browser with no token must be able to exchange a pairing code. The origin check
    // still applies, so another site cannot use the endpoint to harvest a token.
    if path == "/api/pair" {
        if !origin_matches(request.headers()) {
            return error_response(
                StatusCode::FORBIDDEN,
                ErrorCode::Unauthorized,
                "The request came from another origin.".to_owned(),
                Some("Open the pairing page from the address shown in Settings.".to_owned()),
            );
        }
        return next.run(request).await;
    }
    if path == "/api/lan" || path.starts_with("/api/lan/") {
        return error_response(
            StatusCode::FORBIDDEN,
            ErrorCode::Unauthorized,
            "Network controls are only available in the desktop window.".to_owned(),
            Some("Open the application on the host machine.".to_owned()),
        );
    }

    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0);
    let allowed = state
        .lan()
        .verify(
            request.headers(),
            request.method(),
            &path,
            request.uri().query(),
            peer,
        )
        .await;
    if !allowed {
        return error_response(
            StatusCode::UNAUTHORIZED,
            ErrorCode::Unauthorized,
            "This browser is not paired with the desktop application.".to_owned(),
            Some("Open the link shown in Settings, or pair again.".to_owned()),
        );
    }

    if matches!(
        *request.method(),
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    ) && !origin_matches(request.headers())
    {
        return error_response(
            StatusCode::FORBIDDEN,
            ErrorCode::Unauthorized,
            "The request came from another origin.".to_owned(),
            Some("Reload the application from the address shown in Settings.".to_owned()),
        );
    }

    next.run(request).await
}

fn status_locked(inner: &LanInner) -> LanStatus {
    let port = inner.address.map(|address| address.port());
    let mut sessions: Vec<LanSession> = inner
        .sessions
        .iter()
        .filter(|session| session.created.elapsed() < SESSION_TTL)
        .map(|session| LanSession {
            id: session.id.clone(),
            token: session.token.clone(),
            shortcode: display_shortcode(&session.shortcode),
            label: session.label.clone(),
            address: session.address.clone(),
            created_at: session.created_at.clone(),
            last_seen: session.last_seen.clone(),
        })
        .collect();
    sessions.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    LanStatus {
        enabled: inner.address.is_some(),
        url: port.map(|port| format!("http://{}:{port}", local_ip())),
        token: sessions.first().map(|session| session.token.clone()),
        port,
        bind: if inner.address.is_some() {
            "0.0.0.0".to_owned()
        } else {
            "127.0.0.1".to_owned()
        },
        sessions,
    }
}

fn expire_sessions(inner: &mut LanInner) {
    inner
        .sessions
        .retain(|session| session.created.elapsed() < SESSION_TTL);
}

/// Store the facts the Settings list shows: the browser label and the peer address.
fn observe(session: &mut Session, headers: &HeaderMap, peer: Option<SocketAddr>) {
    let agent = headers
        .get(header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if session.label == "Paired browser" || session.label == "Desktop pairing" {
        session.label = browser_label(agent);
    }
    if session.address.is_none() {
        session.address = peer.map(|address| address.ip().to_string());
    }
    session.last_seen = Some(crate::project::videos::iso8601(
        crate::project::videos::now_epoch(),
    ));
}

fn browser_label(agent: &str) -> String {
    let device = if agent.contains("iPad") {
        "iPad"
    } else if agent.contains("iPhone") {
        "iPhone"
    } else if agent.contains("Android") {
        "Android"
    } else if agent.contains("Windows") {
        "Windows"
    } else if agent.contains("Macintosh") {
        "Mac"
    } else if agent.contains("Linux") {
        "Linux"
    } else {
        "Browser"
    };
    let browser = if agent.contains("Edg/") {
        "Edge"
    } else if agent.contains("Firefox/") {
        "Firefox"
    } else if agent.contains("Chrome/") && !agent.contains("Chromium") {
        "Chrome"
    } else if agent.contains("Safari/") {
        "Safari"
    } else {
        "browser"
    };
    format!("{device} · {browser}")
}

/// The address another device should use. Connecting a UDP socket sends no packet; it only
/// asks the routing table which local address would reach the internet.
fn local_ip() -> IpAddr {
    let Ok(socket) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)) else {
        return IpAddr::V4(Ipv4Addr::LOCALHOST);
    };
    if socket.connect(("8.8.8.8", 80)).is_err() {
        return IpAddr::V4(Ipv4Addr::LOCALHOST);
    }
    socket
        .local_addr()
        .map(|address| address.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST))
}

/// Compare a fixed-length token without an early exit. The length check leaks only the
/// expected length, which is public for every token this build generates.
fn token_matches(expected: &str, provided: &str) -> bool {
    let expected = expected.as_bytes();
    let provided = provided.as_bytes();
    if expected.len() != provided.len() {
        return false;
    }
    let mut difference = 0_u8;
    for (left, right) in expected.iter().zip(provided) {
        difference |= left ^ right;
    }
    difference == 0
}

/// Browsers include `Origin` on state-changing requests. A paired page served from the
/// listener has the listener's own origin; anything else is a cross-site attempt.
fn origin_matches(headers: &HeaderMap) -> bool {
    let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    else {
        // Non-browser clients (curl, the desktop host) do not send Origin.
        return true;
    };
    let Some(host) = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    origin == format!("http://{host}")
}

/// Whether this path serves picture to a media element.
///
/// The list is deliberately short: a media credential in a URL buys exactly the routes a
/// `<video>` or an `<img>` opens, not the rest of the API under the same prefix. The
/// thumbnail manifest is excluded because a fetch can send the session header; only the
/// numbered JPEGs need the URL credential.
fn is_media_path(path: &str) -> bool {
    path.starts_with("/api/projects/")
        && (path.ends_with("/media") || path.ends_with("/frame") || path.contains("/thumbnails/"))
}

fn query_value<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (name, value) = pair.split_once('=')?;
        (name == key).then_some(value)
    })
}

fn random_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

/// A fresh code that no live session already uses. A collision is vanishingly unlikely, but
/// looping keeps the invariant that a code names exactly one browser.
fn fresh_shortcode(sessions: &[Session]) -> String {
    loop {
        let code = random_shortcode();
        if sessions.iter().all(|session| session.shortcode != code) {
            return code;
        }
    }
}

/// Eight characters from a 32-symbol alphabet. Each low five bits of a UUID byte select one
/// symbol, so the choice has no modulo bias.
fn random_shortcode() -> String {
    Uuid::new_v4()
        .as_bytes()
        .iter()
        .take(8)
        .map(|byte| char::from(SHORTCODE_ALPHABET[usize::from(byte & 0x1f)]))
        .collect()
}

/// Drop formatting and case so `ABCD-EFGH`, `abcdefgh`, and `ABCD EFGH` are the same code.
fn normalise_shortcode(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_uppercase())
        .collect()
}

fn display_shortcode(code: &str) -> String {
    if code.len() == 8 {
        format!("{}-{}", &code[..4], &code[4..])
    } else {
        code.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_must_match_exactly() {
        assert!(token_matches("abc123", "abc123"));
        assert!(!token_matches("abc123", "abc124"));
        assert!(!token_matches("abc123", "abc12"));
        assert!(!token_matches("", "x"));
    }

    #[test]
    fn a_shortcode_has_eight_unambiguous_characters() {
        let code = random_shortcode();
        assert_eq!(code.len(), 8);
        assert!(code.chars().all(|character| {
            SHORTCODE_ALPHABET.contains(&u8::try_from(character).expect("ASCII shortcode"))
        }));
        assert!(
            !code
                .chars()
                .any(|character| matches!(character, '0' | 'O' | '1' | 'I'))
        );
    }

    #[test]
    fn shortcodes_are_normalized_before_comparison() {
        assert_eq!(normalise_shortcode("abcd-efgh"), "ABCDEFGH");
        assert_eq!(normalise_shortcode("ABCD EFGH"), "ABCDEFGH");
        assert_eq!(display_shortcode("ABCDEFGH"), "ABCD-EFGH");
    }

    #[test]
    fn a_ticket_is_only_read_from_the_query() {
        assert_eq!(query_value("a=1&ticket=abc", "ticket"), Some("abc"));
        assert_eq!(query_value("ticket=", "ticket"), Some(""));
        assert_eq!(query_value("other=abc", "ticket"), None);
    }

    #[test]
    fn only_picture_routes_take_a_media_credential() {
        assert!(is_media_path("/api/projects/p/videos/v/media"));
        assert!(is_media_path("/api/projects/p/videos/v/frame"));
        assert!(is_media_path("/api/projects/p/videos/v/thumbnails/3"));
        assert!(!is_media_path("/api/projects/p/videos/v/thumbnails"));
        assert!(!is_media_path("/api/projects/p/videos/v/audio-tracks"));
        assert!(!is_media_path("/api/settings"));
        assert!(!is_media_path("/media"));
    }

    #[tokio::test]
    async fn a_media_ticket_reads_picture_but_never_changes_anything() {
        let controller = LanController::default();
        {
            let mut inner = controller.inner.lock().await;
            inner.address = Some("192.168.1.20:41234".parse().expect("socket address"));
            let mut live = session("ABCDEFGH");
            live.media_token = "media-token".to_owned();
            inner.sessions.push(live);
        }
        let headers = HeaderMap::new();
        let media = Some("media=media-token");

        assert!(
            controller
                .verify(
                    &headers,
                    &Method::GET,
                    "/api/projects/p/videos/v/media",
                    media,
                    None
                )
                .await
        );
        assert!(
            !controller
                .verify(&headers, &Method::GET, "/api/settings", media, None)
                .await
        );
        assert!(
            !controller
                .verify(
                    &headers,
                    &Method::POST,
                    "/api/projects/p/videos/v/media",
                    media,
                    None
                )
                .await
        );
        assert!(
            !controller
                .verify(
                    &headers,
                    &Method::GET,
                    "/api/projects/p/videos/v/media",
                    Some("media=wrong"),
                    None
                )
                .await
        );
    }

    fn session(code: &str) -> Session {
        Session {
            id: "session".to_owned(),
            token: "token".to_owned(),
            media_token: "media".to_owned(),
            shortcode: code.to_owned(),
            label: "Test browser".to_owned(),
            address: None,
            created: Instant::now(),
            created_at: "2026-11-04T00:00:00Z".to_owned(),
            last_seen: None,
        }
    }

    #[tokio::test]
    async fn failed_pairings_throttle_one_peer_and_clear_on_success_or_expiry() {
        let controller = LanController::default();
        controller
            .inner
            .lock()
            .await
            .sessions
            .push(session("ABCDEFGH"));
        let peer = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20));
        let other = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 21));

        for _ in 0..MAX_PAIR_FAILURES - 1 {
            assert_eq!(
                controller.pair("ZZZZZZZZ", Some(peer)).await,
                PairAttempt::Invalid
            );
        }
        assert_eq!(
            controller.pair("ABCD-EFGH", Some(peer)).await,
            PairAttempt::Issued("token".to_owned())
        );
        assert!(
            !controller
                .inner
                .lock()
                .await
                .pair_failures
                .contains_key(&peer),
            "a valid code clears the peer's failures"
        );

        for _ in 0..MAX_PAIR_FAILURES {
            assert_eq!(
                controller.pair("ZZZZZZZZ", Some(peer)).await,
                PairAttempt::Invalid
            );
        }
        assert!(matches!(
            controller.pair("ABCD-EFGH", Some(peer)).await,
            PairAttempt::Throttled(wait) if wait > Duration::ZERO && wait <= PAIR_FAILURE_WINDOW
        ));
        assert_eq!(
            controller.pair("ZZZZZZZZ", Some(other)).await,
            PairAttempt::Invalid
        );
        assert_eq!(
            controller.pair("ZZZZZZZZ", None).await,
            PairAttempt::Invalid
        );

        controller.inner.lock().await.pair_failures.insert(
            peer,
            PairFailure {
                attempts: MAX_PAIR_FAILURES,
                started: Instant::now() - PAIR_FAILURE_WINDOW - Duration::from_secs(1),
            },
        );
        assert_eq!(
            controller.pair("ABCD-EFGH", Some(peer)).await,
            PairAttempt::Issued("token".to_owned())
        );
    }
}
