//! Types that cross the HTTP boundary.
//!
//! These are the source of the JSON Schema files in `schema/`. They are generated into
//! TypeScript and Zod; do not add a hand-written mirror elsewhere.

pub mod encoder;
pub mod platform;
pub mod project;
pub mod protocol;
pub mod queue;
pub mod run;
pub mod scene;
pub mod script;
pub mod settings;
pub mod video;

/// The API contract revision. Bump when a resource is added or its shape changes.
pub const API_VERSION: u32 = 1;
