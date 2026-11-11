//! HTTP integration tests, split by route family.
//!
//! Each module mirrors `api::routes`; shared fixtures live in `tests/common/mod.rs`.

#[path = "common/mod.rs"]
mod common;

#[path = "api/encoders.rs"]
mod encoders;

#[path = "api/lan.rs"]
mod lan;

#[path = "api/logging.rs"]
mod logging;

#[path = "api/project.rs"]
mod project;

#[path = "api/run.rs"]
mod run;

#[path = "api/scenes.rs"]
mod scenes;

#[path = "api/script.rs"]
mod script;

#[path = "api/settings.rs"]
mod settings;

#[path = "api/system.rs"]
mod system;

#[path = "api/video.rs"]
mod video;
