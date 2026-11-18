//! Project and video documents, their effective configuration, and derived pipeline state.
//!
//! Persistence lives in [`projects`] and [`videos`]; [`config`] resolves the engine's
//! generated defaults; [`derive`] computes what is true now without persisting a second
//! state machine; [`settings`] is the application document those features share.

pub(crate) mod config;
pub(crate) mod derive;
pub(crate) mod projects;
pub(crate) mod settings;
pub(crate) mod starter;
pub(crate) mod videos;
