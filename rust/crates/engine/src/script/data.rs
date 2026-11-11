//! The reserved VSScript variables the runner injects into a custom script.
//!
//! A `VapourSynthScript` is evaluated when its input is opened, so its only interface to
//! engine data is `Input::VapourSynthScript::variables`. The runner rebuilds that map before
//! every sequence; this module is the one place the key names, the values, and what each key
//! means are defined. The API's documentation view and the runner therefore cannot disagree
//! about what a script receives.
//!
//! Values are strings because that is what the engine's map carries. `condor_scenes` is JSON
//! so a script can read ranges without a custom encoding; the engine exposes the value to
//! Python as `bytes`, so text is decoded with `.decode()` and JSON is accepted by
//! `json.loads` directly.

use std::collections::BTreeMap;

use andean_condor::models::{scene::Scene, sequence::DefaultSequenceData};
use serde_json::{Map, Value, json};

use crate::RunnerConfig;

/// The user's own sequence data for every scene, keyed by scene index.
///
/// The engine's `DefaultSequenceData` is a typed struct, so a key it does not know is
/// dropped when it loads a checkpoint. These pairs live in the video record instead and are
/// merged into the scene table a script receives. They never reach the engine itself.
pub type CustomSceneData = BTreeMap<u32, BTreeMap<String, Value>>;

/// The key a caller parks [`CustomSceneData`] under in a checkpoint it hands to the engine.
///
/// The engine ignores an unknown top-level key and drops it when it saves, which is exactly
/// what this needs: the pairs are carried only far enough for a script to be built. Keeping
/// them on the blob instead of in a second parameter is what lets the probe, preview and
/// export paths take the same document the runner does.
pub const KEY_CUSTOM_SCENE_DATA: &str = "custom_sequence_data";

/// Copy the user's pairs onto a checkpoint for the code that builds a script's table.
///
/// `None` stays `None`: a video with no checkpoint has no scenes, so there is nothing for a
/// pair to describe.
pub fn attach_custom_scene_data(condor: Option<&Value>, custom: &CustomSceneData) -> Option<Value> {
    let mut blob = condor?.clone();
    if custom.is_empty() {
        return Some(blob);
    }
    let Some(object) = blob.as_object_mut() else {
        return Some(blob);
    };
    object.insert(KEY_CUSTOM_SCENE_DATA.to_owned(), json!(custom));
    Some(blob)
}

/// The pairs a checkpoint was built with, or an empty map when it carries none.
pub fn custom_scene_data(condor: Option<&Value>) -> CustomSceneData {
    condor
        .and_then(|blob| blob.get(KEY_CUSTOM_SCENE_DATA))
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default()
}

/// Merge one scene's user pairs into the engine's sequence data.
///
/// A key the engine itself writes wins: the route refuses to store a reserved name, and a
/// later engine version gaining a field must not have it silently replaced by an old pair.
fn with_custom_data(data: Value, custom: Option<&BTreeMap<String, Value>>) -> Value {
    let Some(custom) = custom.filter(|pairs| !pairs.is_empty()) else {
        return data;
    };
    let mut merged = Map::new();
    for (key, value) in custom {
        merged.insert(key.clone(), value.clone());
    }
    if let Value::Object(engine) = data {
        for (key, value) in engine {
            merged.insert(key, value);
        }
    }
    Value::Object(merged)
}

/// The source file this run decodes, as an absolute path.
///
/// A script input replaces the decode graph, so the file it should open cannot be inferred
/// from the input document. The video owns that file; the runner injects it per open.
pub const KEY_VIDEO_PATH: &str = "condor_video_path";
/// The variable carrying every scene and the engine's own `sequence_data` for it.
pub const KEY_SCENES: &str = "condor_scenes";
/// The number of scenes, as a decimal string.
pub const KEY_SCENE_COUNT: &str = "condor_scene_count";
/// The per-video scratch directory for chunks and sidecars.
pub const KEY_TEMP_DIR: &str = "condor_temp_dir";
/// The run's correlation id.
pub const KEY_RUN_ID: &str = "condor_run_id";
/// The sequence about to be opened, for example `ParallelEncoder`.
pub const KEY_SEQUENCE: &str = "condor_sequence";
/// The whole sequence configuration document this open runs under, as JSON.
pub const KEY_SEQUENCE_CONFIG: &str = "condor_sequence_config";

/// Every reserved key, in the order the runner inserts them.
///
/// A user variable with one of these names is replaced. The checkpoint saved by the service
/// strips exactly this list, so a scene table derived at open time never becomes stored
/// state.
pub const KEYS: [&str; 7] = [
    KEY_VIDEO_PATH,
    KEY_SCENES,
    KEY_SCENE_COUNT,
    KEY_TEMP_DIR,
    KEY_RUN_ID,
    KEY_SEQUENCE,
    KEY_SEQUENCE_CONFIG,
];

/// How a value is meant to be read once Python receives it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScriptVariableFormat {
    /// A JSON document, readable with `json.loads`.
    Json,
    /// A decimal integer, readable with `int(value.decode())`.
    Number,
    /// Plain text, readable with `value.decode()`.
    Text,
}

/// One reserved key, its current value, and the metadata the UI needs to document it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScriptVariable {
    /// Exact VSScript variable name.
    pub key: &'static str,
    /// What the value contains, in the words the editor shows.
    pub description: &'static str,
    /// Where the runner gets it from.
    pub source: &'static str,
    /// How the value is read in Python.
    pub format: ScriptVariableFormat,
    /// The exact string the engine puts in `variables`.
    pub value: String,
}

/// Build the injected variables for one script input.
///
/// `sequence` is the sequence whose open will see these values; it is `None` before the
/// first sequence, and the variable is then empty because the runner has not started one.
pub fn injected_variables(
    scenes: &[Scene<DefaultSequenceData>],
    custom: &CustomSceneData,
    config: &RunnerConfig,
    temp_dir: &str,
    run_id: &str,
    sequence: Option<&str>,
    video_path: &str,
) -> Vec<ScriptVariable> {
    let table: Vec<Value> = scenes
        .iter()
        .enumerate()
        .map(|(index, scene)| {
            let index = u32::try_from(index).unwrap_or(u32::MAX);
            json!({
                "index": index,
                "start": scene.start_frame,
                "end": scene.end_frame,
                // The engine's own record of what each sequence produced: noise, scaling,
                // target-quality passes, encoded bytes, and quality scores. A script that
                // selects work by noise, for example, reads it from here. The user's own
                // pairs are merged in under the same object, so `sequence_data.<key>` is
                // one address whether the value came from the engine or from Settings.
                "data": with_custom_data(
                    serde_json::to_value(&scene.sequence_data).unwrap_or(Value::Null),
                    custom.get(&index),
                ),
                // The scene's whole encoder document, including a per-scene override. It is
                // read-only context; changing it here never changes what the run encodes.
                "encoder": serde_json::to_value(&scene.encoder).unwrap_or(Value::Null),
            })
        })
        .collect();

    vec![
        ScriptVariable {
            key: KEY_VIDEO_PATH,
            description: "Absolute path of the source file this run decodes. The script opens \
                          it instead of naming a file of its own.",
            source: "the video in the queue",
            format: ScriptVariableFormat::Text,
            value: video_path.to_owned(),
        },
        ScriptVariable {
            key: KEY_SCENES,
            description: "JSON array of {index, start, end, data, encoder} for every scene; \
                          data is the engine's sequence data (noise, scaling, target \
                          quality, encoded bytes, quality scores) plus the user's own \
                          custom pairs, and encoder is that scene's full encoder document.",
            source: "condor.scenes",
            format: ScriptVariableFormat::Json,
            value: serde_json::to_string(&table).unwrap_or_else(|_| "[]".to_owned()),
        },
        ScriptVariable {
            key: KEY_SCENE_COUNT,
            description: "Number of scenes, as a decimal string.",
            source: "condor.scenes",
            format: ScriptVariableFormat::Number,
            value: scenes.len().to_string(),
        },
        ScriptVariable {
            key: KEY_TEMP_DIR,
            description: "The per-video scratch directory for chunks and sidecars.",
            source: "configuration",
            format: ScriptVariableFormat::Text,
            value: temp_dir.to_owned(),
        },
        ScriptVariable {
            key: KEY_RUN_ID,
            description: "The run's correlation id.",
            source: "run",
            format: ScriptVariableFormat::Text,
            value: run_id.to_owned(),
        },
        ScriptVariable {
            key: KEY_SEQUENCE,
            description: "The sequence about to run, for example ParallelEncoder; empty \
                          before the first sequence.",
            source: "run",
            format: ScriptVariableFormat::Text,
            value: sequence.unwrap_or_default().to_owned(),
        },
        ScriptVariable {
            key: KEY_SEQUENCE_CONFIG,
            description: "JSON object of the whole sequence configuration this open runs \
                          under: every stage's document, including the ones that are \
                          disabled (as null).",
            source: "configuration",
            format: ScriptVariableFormat::Json,
            value: serde_json::to_string(config).unwrap_or_else(|_| "{}".to_owned()),
        },
    ]
}

/// Build the injected variables from a persisted engine checkpoint.
///
/// The API reads the same saved blob the next run will start from, so the documented values
/// are the values the script will actually receive. A missing or unreadable scene table is
/// treated as empty: scene detection has not run, which is a valid first-run state.
pub fn injected_variables_from_condor(
    condor: Option<&Value>,
    config: &RunnerConfig,
    temp_dir: &str,
    run_id: &str,
    sequence: Option<&str>,
    video_path: &str,
) -> Vec<ScriptVariable> {
    let scenes = condor
        .and_then(|condor| condor.get("scenes"))
        .and_then(Value::as_array)
        .and_then(|scenes| {
            serde_json::from_value::<Vec<Scene<DefaultSequenceData>>>(Value::Array(scenes.clone()))
                .ok()
        })
        .unwrap_or_default();
    injected_variables(
        &scenes,
        &custom_scene_data(condor),
        config,
        temp_dir,
        run_id,
        sequence,
        video_path,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use andean_condor::models::{
        encoder::{Encoder, EncoderBase},
        sequence::noise_detector::NoiseDetectorData,
    };
    use std::time::UNIX_EPOCH;

    /// A configuration with one non-default value, so a script reading it can be told apart
    /// from one reading defaults.
    fn config() -> RunnerConfig {
        let mut config = RunnerConfig::default();
        let mut scaler = config.noise_scaler.take().unwrap_or_default();
        scaler.threshold = 28.0;
        config.noise_scaler = Some(scaler);
        config
    }

    fn scene() -> Scene<DefaultSequenceData> {
        Scene {
            start_frame: 0,
            end_frame: 24,
            sub_scenes: None,
            encoder: Encoder::default_from_base(&EncoderBase::X264, false),
            sequence_data: DefaultSequenceData {
                noise_detection: Some(NoiseDetectorData {
                    noise: 5.5,
                    luminance: 0.4,
                    created_on: UNIX_EPOCH,
                }),
                ..Default::default()
            },
        }
    }

    #[test]
    fn every_reserved_key_has_a_value_and_a_documented_source() {
        let variables = injected_variables(
            &[scene()],
            &CustomSceneData::new(),
            &config(),
            "C:\\temp",
            "run-1",
            Some("TargetQuality"),
            "C:\\media\\clip.mkv",
        );
        let keys: Vec<&str> = variables.iter().map(|variable| variable.key).collect();
        assert_eq!(keys, KEYS.to_vec());
        for variable in &variables {
            assert!(
                !variable.description.is_empty(),
                "{} has no description",
                variable.key
            );
            assert!(
                !variable.source.is_empty(),
                "{} has no source",
                variable.key
            );
        }

        let table: Value =
            serde_json::from_str(&variables[1].value).expect("condor_scenes is JSON");
        assert_eq!(table[0]["start"], 0);
        assert_eq!(table[0]["end"], 24);
        assert_eq!(
            table[0]["data"]["noise_detection"]["noise"], 5.5,
            "Noise Detector's result must be documented exactly as it is injected"
        );
        assert!(
            table[0]["encoder"].is_object(),
            "the scene's full encoder document is part of the table"
        );
        assert_eq!(variables[0].value, "C:\\media\\clip.mkv");
        assert_eq!(variables[2].value, "1");
        assert_eq!(variables[3].value, "C:\\temp");
        assert_eq!(variables[4].value, "run-1");
        assert_eq!(variables[5].value, "TargetQuality");
        let config: Value = serde_json::from_str(&variables[6].value).expect("config is JSON");
        assert_eq!(
            config["noise_scaler"]["threshold"],
            serde_json::json!(28.0),
            "the script reads the same threshold Noise Scaler runs with"
        );
    }

    #[test]
    fn an_empty_scene_table_is_json_not_an_empty_string() {
        let variables = injected_variables(
            &[],
            &CustomSceneData::new(),
            &config(),
            "temp",
            "run",
            None,
            "",
        );
        assert_eq!(variables[0].value, "");
        assert_eq!(variables[1].value, "[]");
        assert_eq!(variables[2].value, "0");
        assert_eq!(variables[5].value, "");
    }

    #[test]
    fn a_saved_checkpoint_supplies_the_same_values_as_the_next_run() {
        let condor = json!({ "scenes": [serde_json::to_value(scene()).expect("scene json")] });
        let variables = injected_variables_from_condor(
            Some(&condor),
            &config(),
            "temp",
            "run-2",
            Some("ParallelEncoder"),
            "C:\\media\\clip.mkv",
        );
        let table: Value = serde_json::from_str(&variables[1].value).expect("scene table");
        assert_eq!(table[0]["data"]["noise_detection"]["noise"], 5.5);
        assert_eq!(variables[0].value, "C:\\media\\clip.mkv");
        assert_eq!(variables[2].value, "1");
        assert_eq!(variables[5].value, "ParallelEncoder");
    }

    #[test]
    fn a_checkpoint_carries_the_user_pairs_into_the_scene_table() {
        let condor = json!({ "scenes": [serde_json::to_value(scene()).expect("scene json")] });
        let mut custom = CustomSceneData::new();
        custom.insert(
            0,
            BTreeMap::from([
                ("loudness".to_owned(), json!(-18.5)),
                ("noise_detection".to_owned(), json!("shadowed")),
            ]),
        );
        let attached = attach_custom_scene_data(Some(&condor), &custom).expect("a blob");
        let variables = injected_variables_from_condor(
            Some(&attached),
            &config(),
            "temp",
            "run-3",
            Some("ParallelEncoder"),
            "clip.mkv",
        );
        let table: Value = serde_json::from_str(&variables[1].value).expect("scene table");
        assert_eq!(table[0]["data"]["loudness"], json!(-18.5));
        assert_eq!(
            table[0]["data"]["noise_detection"]["noise"], 5.5,
            "an engine field is never shadowed by a stored pair"
        );
        assert_eq!(table[0]["data"]["noise_detection"]["luminance"], 0.4);
    }

    #[test]
    fn a_missing_or_unreadable_checkpoint_is_an_empty_table() {
        for condor in [None, Some(json!({ "scenes": "not a list" }))] {
            let variables =
                injected_variables_from_condor(condor.as_ref(), &config(), "temp", "run", None, "");
            assert_eq!(variables[1].value, "[]");
            assert_eq!(variables[2].value, "0");
        }
    }
}
