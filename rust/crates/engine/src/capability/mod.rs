//! What this engine build and this machine can use.
//!
//! The encoder catalogue answers what a project can select, the preflight probes answer
//! which optional external providers are installed, and the scene-model resolver answers
//! where Scene Detector's ONNX model would come from.

pub mod catalogue;
pub mod preflight;
pub mod scene_model;
