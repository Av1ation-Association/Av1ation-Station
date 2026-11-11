//! The HTTP surface shared by the desktop webview, a LAN browser, and the headless binary.
//!
//! [`routes`] composes every handler; the rest of the group owns transport concerns: the
//! browser-facing error envelope, static assets, and the opt-in LAN listener with its token
//! gate. This group may depend on every domain because it is the edge, never a domain.

pub(crate) mod error;
pub(crate) mod json;
pub(crate) mod lan;
pub(crate) mod routes;
pub(crate) mod static_files;
