//! Engine media documents and browser-playable preview proxies.
//!
//! `video` owns the JSON input/output documents the service stores. `preview` turns those
//! documents into a stream or still that a `<video>` element can show without sharing state
//! with an encode.

pub mod preview;
pub mod video;
