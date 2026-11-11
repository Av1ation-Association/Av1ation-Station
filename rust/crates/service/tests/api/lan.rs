//! HTTP tests for the `lan` route family.

use crate::common::*;

/// LAN access is a second listener with its own token. This proves the opt-in response,
/// the unauthenticated rejection, the authorized read, and the shutdown path.
#[tokio::test]
async fn lan_access_is_opt_in_and_requires_its_token() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpStream,
    };

    async fn raw_request(
        port: u16,
        method: &str,
        path: &str,
        body: Option<&str>,
        token: Option<&str>,
    ) -> (u16, String) {
        let mut stream = TcpStream::connect(("127.0.0.1", port))
            .await
            .expect("LAN listener");
        let auth = token
            .map(|token| format!("Authorization: Bearer {token}\r\n"))
            .unwrap_or_default();
        let payload = body.unwrap_or_default();
        let content = body
            .map(|_| {
                format!(
                    "Content-Type: application/json\r\nContent-Length: {}\r\n",
                    payload.len()
                )
            })
            .unwrap_or_default();
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n{content}{auth}\r\n{payload}"
        );
        stream
            .write_all(request.as_bytes())
            .await
            .expect("write request");
        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .await
            .expect("read response");
        let status = response
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|code| code.parse().ok())
            .expect("status line");
        (status, response)
    }

    async fn raw_get(port: u16, path: &str, token: Option<&str>) -> (u16, String) {
        raw_request(port, "GET", path, None, token).await
    }

    let app = router(health_state());
    let (status, off) = send(
        app.clone(),
        Request::get("/api/lan").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(off["enabled"], false);

    let (status, enabled) = send(
        app.clone(),
        Request::post("/api/lan/enable")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(enabled["enabled"], true);
    let port = enabled["port"].as_u64().expect("LAN port") as u16;
    let token = enabled["token"].as_str().expect("LAN token").to_owned();
    assert_eq!(token.len(), 64);
    assert!(
        enabled["url"]
            .as_str()
            .expect("LAN url")
            .starts_with("http://")
    );
    assert_eq!(enabled["bind"], "0.0.0.0");
    let sessions = enabled["sessions"].as_array().expect("LAN sessions");
    assert_eq!(sessions.len(), 1);
    let session_id = sessions[0]["id"].as_str().expect("session id").to_owned();
    assert_eq!(sessions[0]["token"], token.as_str());
    let shortcode = sessions[0]["shortcode"]
        .as_str()
        .expect("session shortcode")
        .to_owned();
    assert_eq!(shortcode.len(), 9, "the displayed code is ABCD-EFGH");
    assert_eq!(&shortcode[4..5], "-");

    // The code is normalized, so a keyboard user may omit the hyphen or type lowercase.
    let request = serde_json::json!({ "shortcode": shortcode.to_lowercase().replace('-', "") });
    let (paired, response) =
        raw_request(port, "POST", "/api/pair", Some(&request.to_string()), None).await;
    assert_eq!(paired, 200, "{response}");
    let paired_body: Value = serde_json::from_str(
        response
            .split_once("\r\n\r\n")
            .map(|(_, body)| body)
            .expect("paired response body"),
    )
    .expect("paired response JSON");
    assert_eq!(paired_body["token"], token.as_str());

    let (invalid, _) = raw_request(
        port,
        "POST",
        "/api/pair",
        Some(r#"{"shortcode":"ZZZZ-ZZZZ"}"#),
        None,
    )
    .await;
    assert_eq!(invalid, 401);

    let (unauthorized, _) = raw_get(port, "/api/health", None).await;
    assert_eq!(unauthorized, 401);
    let (authorized, response) = raw_get(port, "/api/health", Some(&token)).await;
    assert_eq!(authorized, 200);
    assert!(response.contains("x-frame-options: DENY"));

    let (control, _) = raw_get(port, "/api/lan", Some(&token)).await;
    assert_eq!(control, 403);

    let (status, revoked) = send(
        app.clone(),
        Request::post(format!("/api/lan/sessions/{session_id}/revoke"))
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(revoked["sessions"].as_array().map(Vec::len), Some(0));
    assert!(revoked["token"].is_null());
    let (revoked_pair, _) =
        raw_request(port, "POST", "/api/pair", Some(&request.to_string()), None).await;
    assert_eq!(revoked_pair, 401);
    let (unauthorized, _) = raw_get(port, "/api/health", Some(&token)).await;
    assert_eq!(unauthorized, 401);

    // After a handful of bad codes from one peer, even a value that no longer names a
    // session is throttled, and the response tells the browser when to retry.
    let mut throttled = None;
    for _ in 0..8 {
        let (status, response) = raw_request(
            port,
            "POST",
            "/api/pair",
            Some(r#"{"shortcode":"ZZZZ-ZZZZ"}"#),
            None,
        )
        .await;
        if status == 429 {
            throttled = Some(response);
            break;
        }
        assert_eq!(status, 401, "{response}");
    }
    let throttled = throttled.expect("repeated pairing failures should be throttled");
    assert!(
        throttled.to_ascii_lowercase().contains("\r\nretry-after:"),
        "{throttled}"
    );

    let (status, disabled) = send(
        app,
        Request::post("/api/lan/disable")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(disabled["enabled"], false);
}
