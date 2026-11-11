//! Playback bytes and preview stills.
//!
//! [`stream`] serves source, output, and extracted audio with byte-range support, and owns
//! the single-flight derived-preview builds. [`thumbnails`] keeps the shared keyframe grid
//! the Scenes rail and the timeline read.

pub(crate) mod stream;
pub(crate) mod thumbnails;
