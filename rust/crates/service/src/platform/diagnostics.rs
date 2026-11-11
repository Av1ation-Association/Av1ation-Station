//! The update check and the support bundle About offers.
//!
//! Neither runs on a timer: the release check is a button, and the bundle is assembled only
//! when the user asks for it. No telemetry is sent, and every value that identifies the
//! machine is redacted before the bundle leaves this process.

use std::{fmt::Write as _, path::Path, time::Duration};

use av1ation_contracts::encoder::PreflightReport;
use av1ation_contracts::platform::{AppInfo, DiagnosticsBundle, LogExport, UpdateStatus};
use av1ation_contracts::protocol::ErrorCode;
use serde::Deserialize;

use crate::{
    project::projects::StoreError, project::videos::iso8601, run::anonymise,
    run::timeline::now_epoch, state::AppState,
};

/// The newest non-prerelease release; the forge answers `404` when none is published.
const RELEASE_URL: &str =
    "https://api.github.com/repos/Av1ation-Association/Av1ation-Station/releases/latest";
const LOG_BYTES: usize = 1024 * 1024;
const LOG_LINES: usize = 4000;

/// One release as the forge describes it. Only the fields the screen shows are decoded.
#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    published_at: Option<String>,
}

/// A failed support-bundle read, with the category the HTTP layer reports.
pub(crate) struct BundleError {
    pub(crate) code: ErrorCode,
    pub(crate) message: String,
}

impl BundleError {
    fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// Ask the repository for its newest published release.
///
/// A `404` is not a failure: the project has no release yet, so there is nothing to compare
/// against. Any other transport or decode failure is reported, because a check that silently
/// says "up to date" when it reached nothing is worse than no check.
pub(crate) async fn check_update(current: &str) -> Result<UpdateStatus, String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("Av1ation-Station/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| format!("The release check could not start: {error}"))?;
    let response = client
        .get(RELEASE_URL)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("The release check could not reach GitHub: {error}"))?;
    let checked_at = iso8601(now_epoch());
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateStatus {
            current: current.to_owned(),
            latest: None,
            url: None,
            published_at: None,
            checked_at,
        });
    }
    let response = response
        .error_for_status()
        .map_err(|error| format!("GitHub refused the release check: {error}"))?;
    let body = response
        .text()
        .await
        .map_err(|error| format!("The release answer could not be read: {error}"))?;
    let release = parse_release(&body)?;
    Ok(status_from_release(current, &release, checked_at))
}

/// The release fields, split from the network call so the mapping is unit tested.
fn parse_release(body: &str) -> Result<Release, String> {
    serde_json::from_str(body)
        .map_err(|error| format!("The release answer was not a release: {error}"))
}

fn status_from_release(current: &str, release: &Release, checked_at: String) -> UpdateStatus {
    let latest = release
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&release.tag_name)
        .to_owned();
    UpdateStatus {
        current: current.to_owned(),
        latest: Some(latest),
        url: Some(release.html_url.clone()),
        published_at: release.published_at.clone(),
        checked_at,
    }
}

/// Assemble the redacted bundle: application identity, the dependency inventory, optionally
/// the chosen projects' manifests, and the tail of the application log.
pub(crate) async fn bundle(
    state: &AppState,
    projects: &[String],
    include_logs: bool,
) -> Result<DiagnosticsBundle, BundleError> {
    let mut info = state.info.clone();
    info.preflight = state.preflight().await;
    let collected = iso8601(now_epoch());
    let mut text = String::new();
    write_identity(&mut text, &info, &collected);

    if !projects.is_empty() {
        let Some(store) = state.projects() else {
            return Err(BundleError::new(
                ErrorCode::NotFound,
                "This host does not persist projects, so there is no manifest to include.",
            ));
        };
        for id in projects {
            let project = store.get(id).await.map_err(|error| match error {
                // A malformed id never named a project, so it is a bad request rather than
                // a failed read; the two produce different answers in the bundle route.
                StoreError::Invalid(message) => BundleError::new(ErrorCode::InvalidConfig, message),
                other => BundleError::new(
                    ErrorCode::Io,
                    format!("The project could not be read: {other}"),
                ),
            })?;
            let Some(project) = project else {
                return Err(BundleError::new(
                    ErrorCode::NotFound,
                    format!("No project has the id {id}."),
                ));
            };
            let manifest = serde_json::to_string_pretty(&project).map_err(|error| {
                BundleError::new(
                    ErrorCode::Internal,
                    format!("The project manifest could not be encoded: {error}"),
                )
            })?;
            let _ = writeln!(text, "\n## Project manifest · {}\n", project.name);
            text.push_str("```json\n");
            text.push_str(&manifest);
            text.push_str("\n```\n");
        }
    }

    let mut log_lines = 0;
    if include_logs && let Some(directory) = state.data_dir.as_deref() {
        let path = directory.join("logs").join("application.log");
        text.push_str("\n\n## Application log\n\n");
        match read_log_tail(&path).await {
            Ok((tail, lines)) => {
                log_lines = lines;
                if tail.is_empty() {
                    text.push_str("The application log is empty.\n");
                } else {
                    text.push_str("```text\n");
                    text.push_str(&tail);
                    text.push_str("\n```\n");
                }
            }
            // A missing log is not a failed bundle: the rest of the report still
            // explains the build and the project if one was chosen.
            Err(error) => {
                text.push_str(&error.message);
                text.push('\n');
            }
        }
    }

    let export: LogExport = anonymise::anonymise(&text);
    Ok(DiagnosticsBundle {
        text: export.text,
        replacements: export.replacements,
        filename: format!("av1ation-diagnostics-{}.md", collected.replace(':', "-")),
        log_lines,
    })
}

/// The sections every bundle starts with, so a report is readable without the manifest.
fn write_identity(text: &mut String, info: &AppInfo, collected: &str) {
    text.push_str("# Av1ation Station diagnostics\n\n");
    let _ = writeln!(text, "- Application: {}", info.version);
    let _ = writeln!(text, "- API contract: v{}", info.api_version);
    let _ = writeln!(
        text,
        "- Engine: andean-condor {} ({})",
        info.engine_version, info.engine_revision
    );
    let _ = writeln!(
        text,
        "- Platform: {} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    let _ = writeln!(text, "- Collected: {collected}");
    text.push_str("\n## Dependencies\n\n");
    write_preflight(text, &info.preflight);
}

fn write_preflight(text: &mut String, report: &PreflightReport) {
    if report.checks.is_empty() {
        text.push_str("No dependency checks have run in this process.\n");
        return;
    }
    for check in &report.checks {
        let status = if check.available {
            "available"
        } else {
            "missing"
        };
        let _ = writeln!(
            text,
            "- {} ({}): {status} — {}",
            check.label, check.capability, check.detail
        );
        if let Some(remediation) = &check.remediation {
            let _ = writeln!(text, "  - {}", remediation);
        }
    }
}

/// The last `LOG_LINES` lines, at most `LOG_BYTES`, so a huge log cannot make the bundle
/// enormous. The first partial line is dropped when the cap lands mid-line.
async fn read_log_tail(path: &Path) -> Result<(String, u64), BundleError> {
    let bytes = tokio::fs::read(path).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            BundleError::new(
                ErrorCode::NotFound,
                "The application log has not been written yet.",
            )
        } else {
            BundleError::new(
                ErrorCode::Io,
                format!("The application log could not be read: {error}"),
            )
        }
    })?;
    Ok(tail_text(&bytes, LOG_BYTES, LOG_LINES))
}

/// The tail of a log file, from bytes so a multi-byte UTF-8 sequence is replaced lossily
/// rather than cutting the read short.
fn tail_text(bytes: &[u8], max_bytes: usize, max_lines: usize) -> (String, u64) {
    let start = bytes.len().saturating_sub(max_bytes);
    let mut tail = String::from_utf8_lossy(&bytes[start..]).into_owned();
    if start > 0
        && let Some(index) = tail.find('\n')
    {
        tail.drain(..=index);
    }
    let lines: Vec<&str> = tail.lines().collect();
    let kept = if lines.len() > max_lines {
        &lines[lines.len() - max_lines..]
    } else {
        &lines[..]
    };
    (kept.join("\n"), kept.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    const RELEASE: &str = r#"{
        "tag_name": "v0.2.0",
        "html_url": "https://github.com/Av1ation-Association/Av1ation-Station/releases/tag/v0.2.0",
        "published_at": "2026-11-01T10:00:00Z"
    }"#;

    #[test]
    fn a_release_is_compared_without_its_tag_prefix() {
        let release = parse_release(RELEASE).expect("a valid release");
        let status = status_from_release("0.1.0", &release, "2026-11-03T00:00:00Z".to_owned());
        assert_eq!(status.current, "0.1.0");
        assert_eq!(status.latest.as_deref(), Some("0.2.0"));
        assert_eq!(status.published_at.as_deref(), Some("2026-11-01T10:00:00Z"));
        assert!(status.url.is_some_and(|url| url.ends_with("v0.2.0")));
    }

    #[test]
    fn an_answer_that_is_not_a_release_is_reported() {
        assert!(parse_release("{\"message\": \"Not Found\"}").is_err());
    }

    #[test]
    fn a_log_tail_keeps_the_last_lines_and_drops_a_partial_first_line() {
        // Fourteen bytes land inside "two", so that partial line goes and both complete
        // lines that follow it stay.
        let (tail, lines) = tail_text(b"one\ntwo\nthree\nfour\n", 14, LOG_LINES);
        assert_eq!(tail, "three\nfour");
        assert_eq!(lines, 2);
    }

    #[test]
    fn a_log_tail_is_capped_by_lines_as_well_as_bytes() {
        let (tail, lines) = tail_text(b"one\ntwo\nthree\n", 1024, 2);
        assert_eq!(tail, "two\nthree");
        assert_eq!(lines, 2);
    }
}
