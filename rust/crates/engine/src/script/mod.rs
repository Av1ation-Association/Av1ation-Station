//! Authoring, validating, injecting, and exporting VapourSynth scripts.
//!
//! A stored script is only part of what the engine evaluates. This group owns the generated
//! `condor_data` module, the reserved variables, the pre-save evaluation, the static plugin
//! check, the Python import refresh, and the standalone export.

pub mod check;
pub mod data;
pub mod export;
pub(crate) mod imports;
pub mod module;
pub mod plugins;
