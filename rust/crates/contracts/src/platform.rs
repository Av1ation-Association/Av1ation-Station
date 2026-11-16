//! The application shell, diagnostics, logs, LAN access and storage.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::encoder::PreflightReport;

/// Basic application and engine information shown by the About screen and `/api/health`.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AppInfo {
    /// User-facing application name.
    pub name: String,
    /// Application version, sourced from the package version.
    pub version: String,
    /// Version of the pinned andean-condor engine.
    pub engine_version: String,
    /// Exact upstream commit of the pinned andean-condor engine.
    pub engine_revision: String,
    /// Revision of the HTTP contract.
    pub api_version: u32,
    /// Cached dependency inventory, projected by capability rather than by executable.
    pub preflight: PreflightReport,
}

/// The bundled components recorded for this target's reviewed lock.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ToolchainInfo {
    /// Release target triple whose lock was projected into this summary.
    pub target: String,
    /// Revision of the reviewed toolchain lock.
    pub revision: String,
    /// Every top-level component in the target's bundle, in lock order.
    pub components: Vec<ToolchainComponent>,
}

/// One bundled component as the About screen lists it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ToolchainComponent {
    /// Stable component id from the lock, such as `ffmpeg` or `encoder:aom`.
    pub id: String,
    /// The version the bundle carries.
    pub version: String,
    /// SPDX licence expression recorded for the component.
    pub license: String,
    /// Provenance URL for the source or package the artifact came from.
    pub source_url: String,
    /// SHA-256 of the artifact recorded in the lock.
    pub sha256: String,
}

/// The LAN listener and the token a browser uses to reach it.
///
/// The token is returned only by the loopback host that owns the listener; it is never
/// included in a response served over the LAN listener itself.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LanStatus {
    /// Whether the second, network-facing listener is running.
    pub enabled: bool,
    /// Base URL of the LAN listener, for example `http://192.168.1.20:41234`.
    pub url: Option<String>,
    /// The newest pairing token, kept for a caller that only needs one link.
    pub token: Option<String>,
    /// Port the LAN listener is bound to, when enabled.
    pub port: Option<u16>,
    /// Interface the listener binds, as shown in Settings.
    pub bind: String,
    /// Every browser token that is currently accepted.
    pub sessions: Vec<LanSession>,
}

/// One paired browser.
///
/// A session is one bearer token. Revoking it never invalidates the others, which is what
/// lets a phone be removed without re-pairing a workstation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LanSession {
    /// Stable id used by the revoke action.
    pub id: String,
    /// The bearer token this browser carries.
    pub token: String,
    /// Human-transcribable pairing code in `ABCD-EFGH` form. It resolves to this browser's
    /// token and expires with the session.
    pub shortcode: String,
    /// A short name derived from the user agent when the token was issued.
    pub label: String,
    /// The address that first used the token, when it is known.
    pub address: Option<String>,
    /// When the token was issued, in UTC ISO-8601.
    pub created_at: String,
    /// When this token was last accepted, in UTC ISO-8601.
    pub last_seen: Option<String>,
}

/// A browser asking to exchange a pairing code for a bearer token.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PairRequest {
    /// The code shown in Settings, with or without its hyphen.
    pub shortcode: String,
}

/// The token returned for a valid pairing code.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LanPairing {
    /// Bearer token for the session the code names.
    pub token: String,
}

/// The retained-work summary the Storage screen renders.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct StorageOverview {
    /// The scratch directory in use, whether it is the override or the default.
    pub temporary_directory: String,
    /// The app-data default, shown as the target of "Use default".
    pub default_directory: String,
    /// Free bytes on the scratch volume, when it could be read.
    pub free_bytes: Option<u64>,
    /// Total bytes on the scratch volume, when it could be read.
    pub total_bytes: Option<u64>,
    /// Bytes retained under every video's scratch directory.
    pub retained_bytes: u64,
    /// Total queue entries across every project.
    pub video_count: u32,
    /// Bytes under the app-data directory, excluding the scratch override.
    pub app_data_bytes: u64,
    /// The resolved app-data directory that owns manifests, logs, and the catalogue.
    pub app_data_directory: String,
    /// Bytes occupied by run and application logs.
    pub log_bytes: u64,
    /// Bytes occupied by project and video manifests.
    pub manifest_bytes: u64,
    /// Bytes occupied by settings and saved encoder definitions.
    pub catalogue_bytes: u64,
    /// One row per project that owns retained work, largest first.
    pub projects: Vec<StorageProject>,
}

/// One project's retained work, as the Storage screen lists it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct StorageProject {
    /// Stable project identifier.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Queue entries in this project.
    pub video_count: u32,
    /// Bytes retained under the project's videos.
    pub retained_bytes: u64,
}

/// One run-log line.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LogRecord {
    /// Monotonic within the run; ordering never depends on the wall clock.
    pub seq: u64,
    /// UTC ISO-8601 instant.
    pub at: String,
    /// `info`, `warn`, or `error`.
    pub level: String,
    /// `app` for process-wide lines, `run` for lines attributed to a video.
    pub scope: String,
    /// The run this line belongs to.
    pub run_id: String,
    /// The video this run encodes.
    pub video_id: String,
    /// The project that owns the video.
    pub project_id: String,
    /// The sequence that emitted the line, when it came from one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<String>,
    /// The human-readable line.
    pub message: String,
}

/// One page of a run log.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LogPage {
    /// The records in order.
    pub records: Vec<LogRecord>,
    /// Total records in the file, so a viewer can size its scrollbar.
    pub total: u64,
    /// Offset to request next, absent at the end of the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_offset: Option<u64>,
}

/// An anonymised export, returned as a preview before the user saves it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LogExport {
    /// The transformed log text.
    pub text: String,
    /// Placeholder to the original value it replaced, so the user can audit redactions.
    pub replacements: BTreeMap<String, String>,
}

/// How the installed build compares with the newest published release.
///
/// `latest` is absent when the repository has no published release yet, which is a normal
/// answer rather than a failed check. The comparison itself is the screen's: a build older
/// than the tag is a newer release, and the tag is what the release page is named after.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct UpdateStatus {
    /// Version of this build, from the package manifest.
    pub current: String,
    /// Newest published tag without its leading `v`, or absent when none is published.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<String>,
    /// The release page the result links to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// When the release was published, as the forge reports it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    /// When this answer was produced, so the screen can say how old it is.
    pub checked_at: String,
}

/// The anonymised support bundle a user attaches to a bug report.
///
/// It is plain text so it can be pasted anywhere, and it is built only when the user asks
/// for it: nothing is uploaded and no telemetry is sent.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DiagnosticsBundle {
    /// The redacted bundle, with a heading for each section it includes.
    pub text: String,
    /// Placeholder to the original value it replaced, so the user can audit redactions.
    pub replacements: BTreeMap<String, String>,
    /// The name a saved copy should use.
    pub filename: String,
    /// Lines of application log that were included.
    pub log_lines: u64,
}
