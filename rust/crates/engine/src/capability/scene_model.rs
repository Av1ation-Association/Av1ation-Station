//! TransNetV2 model discovery, mirrored from the engine.
//!
//! The engine resolves the model internally and never exposes the path, so the dependency
//! screen cannot tell an automatic search from a working one. This module repeats the
//! engine's documented order so the UI can report a real result instead of assuming the
//! bundled file exists.

use std::path::{Path, PathBuf};

/// The model file name the engine looks for beside its executable and in the user cache.
pub const SCENE_MODEL_FILE: &str = "transnetv2.onnx";

/// Resolve the model the engine would load, or a sentence naming what is missing.
///
/// A configured path is an explicit user decision, so a missing one is reported as that
/// path rather than silently falling back to a different model.
pub fn transnetv2_model(configured: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(path) = configured {
        if path.is_file() {
            return Ok(path.to_owned());
        }
        return Err(format!(
            "The chosen model file does not exist: {}",
            path.display()
        ));
    }

    let candidates = candidates();
    if let Some(found) = candidates.iter().find(|path| path.is_file()) {
        return Ok(found.clone());
    }
    let searched = if candidates.is_empty() {
        "no search locations were available".to_owned()
    } else {
        candidates
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    };
    Err(format!(
        "{SCENE_MODEL_FILE} was not found. Place it beside the executable, set TRANSNETV2_MODEL_PATH, or choose the file here. Searched: {searched}"
    ))
}

fn candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::with_capacity(4);
    if let Some(path) = std::env::var_os("TRANSNETV2_MODEL_PATH")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
    {
        candidates.push(path);
    }
    if let Some(directory) = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
    {
        candidates.push(directory.join("model").join(SCENE_MODEL_FILE));
        candidates.push(directory.join(SCENE_MODEL_FILE));
    }
    if let Some(directory) = cache_dir() {
        candidates.push(directory.join(SCENE_MODEL_FILE));
    }
    candidates
}

/// The same per-user fallback the engine searches; it is never written here.
fn cache_dir() -> Option<PathBuf> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library").join("Caches"))
    } else {
        std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))
    }?;
    Some(base.join("condor").join("models"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_configured_path_is_reported_as_that_path() {
        let error = transnetv2_model(Some(Path::new("no-such-model.onnx"))).unwrap_err();
        assert!(error.contains("no-such-model.onnx"), "error was {error}");
    }

    #[test]
    fn an_existing_configured_path_wins() {
        let existing = std::env::current_exe().expect("current exe");
        assert_eq!(
            transnetv2_model(Some(&existing)).expect("resolved"),
            existing
        );
    }
}
