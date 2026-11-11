//! Evaluate one custom script before it is saved.
//!
//! A script is Python that the engine runs under VSScript, so the only honest check is to
//! run it and ask the clip it returned. Parsing the text would accept a script that raises on
//! its first line and reject a valid one that builds its source dynamically.
//!
//! Evaluation needs VapourSynth, which is an optional dependency (AGENTS §2.8), so a machine
//! without it reports `Unavailable` instead of pretending the script is fine. The outcome is
//! a plain engine type: the service maps it into the generated contract, because this crate
//! sits below `av1ation-contracts`.

use std::collections::HashMap;

use andean_condor::{
    core::input::Input as CoreInput,
    models::input::{Input as InputModel, VapourSynthScriptSource},
};
use serde_json::Value;

use crate::{
    RunnerConfig,
    script::{data as script_data, module as script_module},
};

/// The geometry and timing of the clip a validated script returned.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ClipSummary {
    /// Decoded width in pixels.
    pub width: u32,
    /// Decoded height in pixels.
    pub height: u32,
    /// Frame count the script reported.
    pub frames: u64,
    /// Frames per second, as the script's output node reports it.
    pub fps: f64,
    /// Bit depth of the clip's pixel format.
    pub bit_depth: u32,
}

/// What one evaluation produced.
///
/// The three cases are distinct because they ask different things of the user: a valid script
/// needs nothing, an invalid one has a traceback to fix, and an unavailable one needs a
/// VapourSynth install that no edit can substitute for.
#[derive(Debug, Clone, PartialEq)]
pub enum ScriptOutcome {
    /// The script evaluated and returned a clip.
    Valid(ClipSummary),
    /// The script failed: a syntax error, a missing module, or a runtime exception.
    Invalid(String),
    /// This machine cannot evaluate a script, usually because VapourSynth is absent.
    Unavailable(String),
}

impl ScriptOutcome {
    /// The message the editor shows for this outcome.
    pub fn detail(&self) -> String {
        match self {
            Self::Valid(clip) => format!(
                "The script returned a clip: {}×{}, {:.3} fps, {}-bit, {} frames.",
                clip.width, clip.height, clip.fps, clip.bit_depth, clip.frames
            ),
            Self::Invalid(message) | Self::Unavailable(message) => message.clone(),
        }
    }
}

/// Run one script and describe the clip it returns.
///
/// The script is given the same reserved variables a real open receives, with an empty scene
/// table, because Scene Detector has not run when a script is first written; a script that
/// indexes `condor_scenes[0]` is then correctly reported as failing rather than silently
/// accepted. The generated module sits in the same directory the variables name, so an import
/// of `condor_data` works on the first open exactly as it will during a run.
///
/// `sequence_config` is the document the page is editing, so a script that reads
/// `condor.sequence_config` is checked against the values the run would use rather than
/// against the engine defaults.
pub fn evaluate(
    script: &str,
    scenes_dir: &str,
    video_path: &str,
    sequence_config: &Value,
) -> ScriptOutcome {
    let run_id = "script-check";
    let config: RunnerConfig = serde_json::from_value(sequence_config.clone()).unwrap_or_default();
    let variables: HashMap<String, String> = script_data::injected_variables(
        &[],
        &script_data::CustomSceneData::new(),
        &config,
        scenes_dir,
        run_id,
        None,
        video_path,
    )
    .into_iter()
    .map(|variable| (variable.key.to_owned(), variable.value))
    .collect();
    let data = script_module::module_data(
        &[],
        &script_data::CustomSceneData::new(),
        &config,
        scenes_dir,
        run_id,
        None,
        video_path,
    );
    if let Err(error) =
        script_module::write_module(scenes_dir, &script_module::module_source(), &data)
    {
        return ScriptOutcome::Unavailable(format!(
            "The script's support files could not be written: {error}"
        ));
    }

    let model = InputModel::VapourSynthScript {
        source: VapourSynthScriptSource::Text(script.to_owned()),
        variables,
        index: 0,
        filters: Vec::new(),
        stream_concurrently: false,
    };
    crate::script::imports::refresh(&model);
    let mut input = match CoreInput::ensure_indexed(&model, |_| {}, None) {
        Ok(input) => input,
        Err(error) => {
            let message = error.to_string();
            return if needs_vapoursynth(&message) {
                ScriptOutcome::Unavailable(runtime_missing(message))
            } else if let Some(explained) =
                crate::script::plugins::explain_open_error(&model, &message)
            {
                // The editor cannot say "missing plugin" while the service says "No attribute",
                // or the same script would look valid in one place and broken in the other.
                ScriptOutcome::Invalid(explained)
            } else {
                ScriptOutcome::Invalid(message)
            };
        }
    };
    match input.clip_info() {
        Ok(info) => {
            let (width, height) = info.resolution;
            let fps = *info.frame_rate.numer() as f64 / *info.frame_rate.denom() as f64;
            let bit_depth = info.format_info.as_bit_depth().unwrap_or(0);
            ScriptOutcome::Valid(ClipSummary {
                width,
                height,
                frames: u64::try_from(info.num_frames).unwrap_or(u64::MAX),
                fps,
                bit_depth: u32::try_from(bit_depth).unwrap_or(0),
            })
        }
        Err(error) => ScriptOutcome::Invalid(error.to_string()),
    }
}

fn runtime_missing(message: String) -> String {
    format!(
        "This machine cannot evaluate scripts, because VapourSynth is not available. {message} \
         Install VapourSynth and make sure VSScript is on PATH."
    )
}

/// Whether an open failed before the script ran, because VapourSynth itself is missing.
///
/// The engine's VSScript errors name the runtime they could not load; a traceback from the
/// script's own code does not. The distinction matters because one is an environment problem
/// and the other is something the user can edit.
fn needs_vapoursynth(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("vsscript") || lower.contains("vapoursynth is not installed")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_runtime_is_reported_as_unavailable_rather_than_unchecked() {
        assert!(needs_vapoursynth(
            "the input could not be opened: VSScript environment could not be created"
        ));
        assert!(!needs_vapoursynth(
            "the input could not be opened: Python exception: NameError: name 'nope' is not defined"
        ));
    }

    #[test]
    fn a_valid_outcome_reports_geometry_and_a_failure_never_does() {
        let outcome = ScriptOutcome::Valid(ClipSummary {
            width: 1920,
            height: 1080,
            frames: 240,
            fps: 23.976,
            bit_depth: 10,
        });
        assert!(outcome.detail().contains("1920×1080"));
        assert!(outcome.detail().contains("10-bit"));
        assert!(
            ScriptOutcome::Invalid("Traceback".to_owned())
                .detail()
                .contains("Traceback")
        );
    }
}
