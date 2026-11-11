//! Script authoring: plugin checks, injected data, and the Python language server.
//!
//! [`scripts`] and [`script_data`] project the engine's script behaviour into the editor.
//! [`lsp`] bridges a language server over WebSocket, preferring a system provider and
//! falling back to the wheelhouse unpacked by [`lsp_bundle`].

pub(crate) mod lsp;
pub(crate) mod lsp_bundle;
pub(crate) mod script_data;
pub(crate) mod scripts;
