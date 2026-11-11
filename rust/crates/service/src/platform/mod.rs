//! Host plumbing shared by the feature groups.
//!
//! [`atomic`] is the one durable file-replacement policy; [`disk`] and [`storage`] report
//! space and usage; [`hash`] is the non-cryptographic identity used by previews and scene
//! fingerprints; [`diagnostics`] assembles the update check and support bundle.

pub(crate) mod atomic;
pub(crate) mod diagnostics;
pub(crate) mod disk;
pub(crate) mod hash;
pub(crate) mod storage;
