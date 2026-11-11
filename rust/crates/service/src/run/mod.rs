//! Encode supervision and the history it leaves behind.
//!
//! [`prepare`] resolves and validates a run before it reaches the singleton. [`runs`] owns
//! the singleton lock and the live event fan-out. [`timeline`] records what happened,
//! [`logs`] captures the run's event view, [`retention`] applies the chunk policy after the
//! final output, and [`anonymise`] transforms log exports for support.

pub(crate) mod anonymise;
pub(crate) mod logs;
pub(crate) mod prepare;
pub(crate) mod retention;
pub(crate) mod runs;
pub(crate) mod timeline;
