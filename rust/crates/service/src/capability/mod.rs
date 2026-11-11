//! What this build can drive: encoder parameters, user forks, the cached preflight
//! inventory, the staged toolchain, and the VapourSynth provider.
//!
//! Availability is always per capability. A missing optional dependency removes exactly
//! the feature it provides, which is why the inventory and its provider resolution live
//! together here.

pub(crate) mod descriptors;
pub(crate) mod forks;
pub(crate) mod preflight;
pub(crate) mod toolchain;
pub(crate) mod vapoursynth;
