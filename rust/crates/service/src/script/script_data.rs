//! The documentation view of the variables a custom VapourSynth script receives.
//!
//! The runner's injection table lives in `av1ation_engine::script::data`; this module only
//! projects it into the generated contract and bounds large values for the state response.
//! A script input that is not a `VapourSynthScript` contributes nothing, because the runner
//! does not rewrite it.

use av1ation_contracts::script::{ScriptData, ScriptDataFormat, ScriptDataKey};
use av1ation_engine::RunnerConfig;
use av1ation_engine::script::data::{self as script_data, ScriptVariable, ScriptVariableFormat};
use serde_json::Value;

/// The largest injected string the state response echoes in full.
///
/// `condor_scenes` grows with the scene table, and the state endpoint is not a data export.
/// The full length still travels in `ScriptDataKey::bytes`, so the editor can say how much
/// was omitted instead of pretending the preview is the value.
const PREVIEW_BYTES: usize = 4096;

/// One input that may be a script, with the configuration path it occupies and the sequence
/// whose open will see the values.
pub(crate) struct ScriptInput<'a> {
    /// Dotted configuration path, for example `sequences.parallel_encoder.input`.
    pub(crate) path: String,
    /// The sequence that opens this input, when one is due.
    pub(crate) sequence: Option<&'a str>,
    /// The engine `Input` document.
    pub(crate) input: &'a Value,
}

/// Describe every script input, in the order the configuration lists them.
pub(crate) fn describe(
    inputs: &[ScriptInput<'_>],
    config: &Value,
    condor: Option<&Value>,
    temp_dir: &str,
    run_id: &str,
    video_path: &str,
) -> Vec<ScriptData> {
    // The state response documents the values the next open will inject, so the sequence
    // document is the effective one, not a default built for the description.
    let config: RunnerConfig = serde_json::from_value(config.clone()).unwrap_or_default();
    inputs
        .iter()
        .filter(|entry| entry.input.get("VapourSynthScript").is_some())
        .map(|entry| ScriptData {
            input: entry.path.clone(),
            sequence: entry.sequence.unwrap_or_default().to_owned(),
            keys: script_data::injected_variables_from_condor(
                condor,
                &config,
                temp_dir,
                run_id,
                entry.sequence,
                video_path,
            )
            .into_iter()
            .map(|variable| key(&variable))
            .collect(),
        })
        .collect()
}

/// Project one engine variable into the contract, bounding its value for the wire.
///
/// The editor's guide and a video's state describe the same keys, so they share this
/// projection rather than drifting into two spellings of the same table.
pub(crate) fn key(variable: &ScriptVariable) -> ScriptDataKey {
    let (value, truncated, bytes) = bound(&variable.value);
    ScriptDataKey {
        key: variable.key.to_owned(),
        description: variable.description.to_owned(),
        source: variable.source.to_owned(),
        format: match variable.format {
            ScriptVariableFormat::Json => ScriptDataFormat::Json,
            ScriptVariableFormat::Number => ScriptDataFormat::Number,
            ScriptVariableFormat::Text => ScriptDataFormat::Text,
        },
        value,
        truncated,
        bytes,
    }
}

/// Bound a value at a character boundary, because slicing a multi-byte UTF-8 value at a byte
/// offset would panic. The JSON values are usually ASCII, but a path is not necessarily so.
fn bound(value: &str) -> (String, bool, u64) {
    let bytes = value.len() as u64;
    if value.len() <= PREVIEW_BYTES {
        return (value.to_owned(), false, bytes);
    }
    let end = value
        .char_indices()
        .take_while(|(offset, _)| *offset < PREVIEW_BYTES)
        .map(|(offset, character)| offset + character.len_utf8())
        .last()
        .unwrap_or(0);
    (value[..end].to_owned(), true, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_native_input_contributes_nothing() {
        let input = json!({ "Video": { "path": "clip.mkv" } });
        let described = describe(
            &[ScriptInput {
                path: "input".to_owned(),
                sequence: Some("SceneDetector"),
                input: &input,
            }],
            &json!({}),
            None,
            "temp",
            "run",
            "C:\\media\\clip.mkv",
        );
        assert!(described.is_empty());
    }

    #[test]
    fn a_script_input_is_described_with_its_path_and_sequence() {
        let input = json!({
            "VapourSynthScript": {
                "source": { "Text": "clip.set_output()" },
                "variables": {},
                "index": 0,
                "filters": [],
                "stream_concurrently": true
            }
        });
        let described = describe(
            &[ScriptInput {
                path: "sequences.parallel_encoder.input".to_owned(),
                sequence: Some("ParallelEncoder"),
                input: &input,
            }],
            &json!({}),
            None,
            "temp",
            "run-1",
            "C:\\media\\clip.mkv",
        );
        assert_eq!(described.len(), 1);
        assert_eq!(described[0].input, "sequences.parallel_encoder.input");
        assert_eq!(described[0].sequence, "ParallelEncoder");
        assert_eq!(described[0].keys.len(), 7);
        assert_eq!(described[0].keys[0].format, ScriptDataFormat::Text);
        assert_eq!(described[0].keys[0].value, "C:\\media\\clip.mkv");
        assert_eq!(described[0].keys[1].format, ScriptDataFormat::Json);
        assert_eq!(described[0].keys[1].value, "[]");
        assert_eq!(described[0].keys[4].value, "run-1");
        assert!(!described[0].keys[1].truncated);
    }

    #[test]
    fn a_large_value_is_a_character_bounded_preview() {
        let long = "é".repeat(PREVIEW_BYTES);
        let (value, truncated, bytes) = bound(&long);
        assert!(truncated);
        assert_eq!(bytes, long.len() as u64);
        assert!(value.len() <= PREVIEW_BYTES);
        assert!(value.chars().all(|character| character == 'é'));

        let (short, truncated, bytes) = bound("condor");
        assert_eq!(short, "condor");
        assert!(!truncated);
        assert_eq!(bytes, 6);
    }
}
