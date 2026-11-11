//! One run's lifecycle: the worker, its sequence configuration and log, and checkpoint edits.
//!
//! The worker is the only place a `Condor` is constructed and driven. The sequence log
//! describes what that worker produced, and the reset module edits the checkpoint it saves.

pub mod reset;
pub mod runner;
pub mod sequence_config;
pub(crate) mod sequence_log;

pub use runner::RealRunner;
pub use sequence_config::RunnerConfig;
