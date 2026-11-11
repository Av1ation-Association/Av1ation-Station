//! Shapes shared by every feature rather than owned by one.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// A one-use, short-lived credential for an EventSource connection.
///
/// `EventSource` cannot send an Authorization header, so the browser exchanges its bearer
/// token for this ticket and puts the ticket in the stream URL instead.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct EventTicket {
    /// Opaque one-use ticket; expires sixty seconds after it is issued.
    pub ticket: String,
}

/// A repeatable credential for the media routes a `<video>` element opens.
///
/// A media element makes many requests for one source — range requests, a new element per
/// scene, a still per paused frame — and cannot attach an Authorization header to any of
/// them. A one-use ticket would be consumed by the first range request, so this ticket is
/// reusable until its session is revoked, and the listener accepts it only on a GET for a
/// media or frame route. It is never the bearer token: a leaked media URL cannot change
/// configuration, start an encode, or read project data.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct MediaTicket {
    /// Opaque ticket for one paired session; valid while that session is.
    pub ticket: String,
}

/// The stable error categories the frontend switches on, never on `message`.
///
/// The set is deliberately coarse: it is the unit of control flow, while the specific
/// reason and the recovery advice travel in `message`, `detail`, and `hint`. A new variant
/// is an API change, so it arrives with a contract revision rather than ad hoc.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    /// Another run already holds the singleton.
    Busy,
    /// Configuration, ordering, or removal is read-only during a run.
    Locked,
    /// A required dependency is missing or unusable.
    PreflightFailed,
    /// The request body or the value it carries is semantically invalid.
    InvalidConfig,
    /// The addressed resource does not exist.
    NotFound,
    /// Writing or reading persisted state failed.
    Io,
    /// The engine panicked inside the run.
    EnginePanic,
    /// The engine rejected the run before or during execution.
    EngineFailed,
    /// The run stopped because the user cancelled it.
    Cancelled,
    /// Not enough free space to start or continue.
    DiskFull,
    /// A request arrived without a valid LAN token.
    Unauthorized,
    /// The failure has no more specific category.
    Internal,
}

impl ErrorCode {
    /// The wire value, for logs and for tests that assert the contract.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Busy => "BUSY",
            Self::Locked => "LOCKED",
            Self::PreflightFailed => "PREFLIGHT_FAILED",
            Self::InvalidConfig => "INVALID_CONFIG",
            Self::NotFound => "NOT_FOUND",
            Self::Io => "IO",
            Self::EnginePanic => "ENGINE_PANIC",
            Self::EngineFailed => "ENGINE_FAILED",
            Self::Cancelled => "CANCELLED",
            Self::DiskFull => "DISK_FULL",
            Self::Unauthorized => "UNAUTHORIZED",
            Self::Internal => "INTERNAL",
        }
    }
}

/// How the project decodes the sources of videos added to its queue.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InputKind {
    /// Native FFMS2 decode; requires no optional dependency.
    Ffms2,
    /// VapourSynth decode through the project's selected import method.
    VapourSynth,
    /// A VapourSynth script file the engine loads and feeds its scene variables to.
    VapourSynthScript,
}

/// Where the output of a newly added video is written.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OutputMode {
    /// Beside the source file, named after it.
    NextToInput,
    /// Into one folder, named after the source file.
    Folder,
}

/// The uniform error envelope returned by the service.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ErrorBody {
    /// Stable machine-readable error code; the only field a client may branch on.
    pub code: ErrorCode,
    /// Human-readable explanation, safe to show as-is.
    pub message: String,
    /// Engine or operating-system text, shown in an expandable block and never parsed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// Optional next action for the user.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// The run this error belongs to, so a toast can be matched to a log file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation: Option<String>,
}
