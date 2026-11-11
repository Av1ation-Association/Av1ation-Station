//! A materialised export of one script input.
//!
//! A stored script is only half of what a run evaluates: the runner also injects seven
//! `condor_*` variables and writes a generated `condor_data` module beside the inputs. A
//! user who wants to debug a filter in `vspipe`, `vs-view`, or `vspreview` needs those
//! pieces reachable from one file, or the script fails on its first `import condor_data`.
//!
//! The export points at the video's live module when its scratch directory already holds
//! one. A 278-scene run writes about a megabyte of scene data; embedding it made every
//! export a megabyte file whose data went stale as soon as the next sequence finished.
//! Pointing at `condor_data.json` keeps the export a few kilobytes and makes each open read
//! what the application last wrote. A template, or a project with no video on this machine,
//! has nothing live to point at, so the module and document are embedded and the file stays
//! portable.
//!
//! The user's source is appended verbatim in both modes, so a line in the editor is the
//! same line in the export's own text after the fixed prefix.

use std::path::Path;

use andean_condor::models::{scene::Scene, sequence::DefaultSequenceData};
use serde_json::Value;

use crate::{
    RunnerConfig,
    script::{data as script_data, module as script_module},
};

/// The live export preamble, with placeholders for the values that change per export.
///
/// The generated module resolves its document from the evaluating script's
/// `condor_temp_dir`, so the export keeps that variable a `bytes` value and defines it
/// before importing the module. The `condor_scenes` variable is rebuilt from the same JSON
/// the module reads; leaving it out would break a stored script that decodes the raw
/// variable instead of using the module.
const LIVE_PREAMBLE: &str = r#"
import json as _av1ation_json
import os as _av1ation_os
import sys as _av1ation_sys

_AV1ATION_DATA_DIR = __DIRECTORY__
if _AV1ATION_DATA_DIR not in _av1ation_sys.path:
    _av1ation_sys.path.insert(0, _AV1ATION_DATA_DIR)
with open(
    _av1ation_os.path.join(_AV1ATION_DATA_DIR, "__DATA_FILE__"),
    encoding="utf-8",
) as _av1ation_file:
    _AV1ATION_DATA = _av1ation_json.load(_av1ation_file)

# The values the runner injects for this video. They are bytes, exactly as the
# engine's variable map delivers them, so `.decode()` in a stored script works.
condor_video_path = __VIDEO_PATH__
condor_scenes = _av1ation_json.dumps(
    [
        {
            "index": row["index"],
            "start": row["start"],
            "end": row["end"],
            "data": row["sequence_data"],
            "encoder": row["encoder"],
        }
        for row in _AV1ATION_DATA["scenes"]
    ],
    separators=(",", ":"),
).encode()
condor_scene_count = str(len(_AV1ATION_DATA["scenes"])).encode()
condor_temp_dir = __TEMP_DIRECTORY__
condor_run_id = __RUN_ID__
condor_sequence = __SEQUENCE__
condor_sequence_config = __SEQUENCE_CONFIG__

# Import the module before the script does. It resolves its document from the evaluating
# script's condor_temp_dir, so this export reads this video's data even when a shared
# Python runtime already holds another video's condor_data.
import condor_data as _av1ation_condor_data
del _av1ation_condor_data
del _av1ation_json, _av1ation_os, _av1ation_sys, _AV1ATION_DATA, _AV1ATION_DATA_DIR
"#;

/// One materialised script and the values it was built with.
pub struct MaterialisedScript {
    /// The complete `.vpy` text, ready for `vspipe`.
    pub source: String,
    /// The reserved variables, so the page can show the values beside the text.
    pub variables: Vec<script_data::ScriptVariable>,
}

/// Build a `.vpy` from one script and the state a run would give it.
///
/// When `temp_dir` already contains the runner's `condor_data.py` and its document, the
/// export reads them instead of carrying a copy. `condor` still supplies the values the
/// page shows, and an unsaved `sequence_config` is written into the export rather than the
/// file's last run. `sequence` is deliberately absent: an export is a debugging starting
/// point rather than a particular pipeline step, and the runner's own variable is empty
/// before the first sequence.
pub fn materialise(
    script: &str,
    condor: Option<&Value>,
    config: &RunnerConfig,
    temp_dir: &str,
    video_path: &str,
) -> MaterialisedScript {
    let scenes = scenes_from_condor(condor);
    let custom = script_data::custom_scene_data(condor);
    let run_id = "export";
    let variables = script_data::injected_variables(
        &scenes, &custom, config, temp_dir, run_id, None, video_path,
    );
    let live = live_directory(temp_dir);

    let mut source = String::new();
    push_header(&mut source, live);
    if live {
        push_live_data(&mut source, &variables, temp_dir);
    } else {
        let module = script_module::module_source();
        let data = script_module::module_data(
            &scenes, &custom, config, temp_dir, run_id, None, video_path,
        );
        push_embedded_data(&mut source, &module, &data);
        push_variables(&mut source, &variables);
    }
    push_script(&mut source, script);

    MaterialisedScript { source, variables }
}

/// Whether the video's scratch directory holds both halves of the generated module.
///
/// The module and its document are written together before every open. Either half alone
/// is of no use to an export: the module without its JSON has no values to read.
fn live_directory(temp_dir: &str) -> bool {
    let directory = Path::new(temp_dir);
    directory.join(script_module::MODULE_FILE).is_file()
        && directory.join(script_module::DATA_FILE).is_file()
}

/// The fixed comment block that says where the data comes from and how to run the file.
fn push_header(source: &mut String, live: bool) {
    source.push_str(
        "# Exported by Av1ation Station for debugging outside the application.\n\
         # Run it with the same VapourSynth build the application uses, for example:\n\
         #\n\
         #   vspipe --y4m \"this-file.vpy\" - | ffmpeg -i - -f null -\n\
         #\n",
    );
    if live {
        source.push_str(
            "# The generated condor_data module and its document are read from this video's\n\
             # scratch directory, not embedded: the file stays small, and every open sees the\n\
             # scenes and measurements the application last wrote.\n\n",
        );
    } else {
        source.push_str(
            "# This export has no scratch directory to read live data from, so the generated\n\
             # condor_data module and its document are embedded: the file needs no support\n\
             # files beside it.\n\n",
        );
    }
}

/// The values the runner would inject, as `bytes` literals.
fn push_variables(source: &mut String, variables: &[script_data::ScriptVariable]) {
    source.push_str(
        "# The values the runner injects for this video. They are bytes, exactly as the\n\
         # engine's variable map delivers them, so `.decode()` in a stored script works.\n",
    );
    for variable in variables {
        source.push_str(variable.key);
        source.push_str(" = ");
        source.push_str(&python_bytes_literal(&variable.value));
        source.push('\n');
    }
}

/// A live export: small, and current every time the file is opened.
fn push_live_data(source: &mut String, variables: &[script_data::ScriptVariable], temp_dir: &str) {
    let value = |key: &str| {
        variables
            .iter()
            .find(|variable| variable.key == key)
            .map_or("", |variable| variable.value.as_str())
    };
    source.push_str(
        &LIVE_PREAMBLE
            .replace("__DATA_FILE__", script_module::DATA_FILE)
            .replace("__DIRECTORY__", &python_string_literal(temp_dir))
            .replace(
                "__VIDEO_PATH__",
                &python_bytes_literal(value("condor_video_path")),
            )
            .replace(
                "__TEMP_DIRECTORY__",
                &python_bytes_literal(value("condor_temp_dir")),
            )
            .replace("__RUN_ID__", &python_bytes_literal(value("condor_run_id")))
            .replace(
                "__SEQUENCE__",
                &python_bytes_literal(value("condor_sequence")),
            )
            .replace(
                "__SEQUENCE_CONFIG__",
                &python_bytes_literal(value("condor_sequence_config")),
            ),
    );
}

/// An embedded export: portable, because it carries the module and its document.
fn push_embedded_data(source: &mut String, module: &str, data: &str) {
    source.push_str("import sys as _av1ation_sys\nimport types as _av1ation_types\n\n");
    source.push_str("_AV1ATION_CONDOR_DATA = ");
    source.push_str(&python_raw_string(module));
    source.push_str("\n\n_AV1ATION_CONDOR_VALUES = ");
    source.push_str(&python_string_literal(data));
    source.push_str(
        "\n\n_av1ation_module = _av1ation_types.ModuleType(\"condor_data\")\n\
         _av1ation_module.__file__ = \"condor_data.py\"\n\
         # Register the module before executing it: dataclasses resolves a string annotation\n\
         # through sys.modules[cls.__module__], and the generated types are defined at import\n\
         # time. Registering it afterwards leaves the class's module unresolved, and Python\n\
         # 3.14 raises `'NoneType' object has no attribute '__dict__'` on the first dataclass.\n\
         _av1ation_sys.modules[\"condor_data\"] = _av1ation_module\n\
         exec(compile(_AV1ATION_CONDOR_DATA, \"condor_data.py\", \"exec\"), _av1ation_module.__dict__)\n\
         # The document is pinned: an exported script carries its data instead of\n\
         # reading a JSON file beside it.\n\
         _av1ation_module._DOCUMENT = _av1ation_module._json.loads(_AV1ATION_CONDOR_VALUES)\n\
         _av1ation_module._PINNED = True\n\
         del _av1ation_module, _AV1ATION_CONDOR_DATA, _AV1ATION_CONDOR_VALUES\n\
         del _av1ation_sys, _av1ation_types\n\n",
    );
}

/// The user's source, after a separator that keeps it visually distinct from the prefix.
fn push_script(source: &mut String, script: &str) {
    source.push_str(
        "\n# ---------------------------------------------------------------------------\n\
         # Script\n\
         # ---------------------------------------------------------------------------\n\n",
    );
    source.push_str(script);
    if !source.ends_with('\n') {
        source.push('\n');
    }
}

/// The scene table a checkpoint carries, parsed through the engine's own types.
fn scenes_from_condor(condor: Option<&Value>) -> Vec<Scene<DefaultSequenceData>> {
    condor
        .and_then(|blob| blob.get("scenes"))
        .and_then(Value::as_array)
        .and_then(|scenes| serde_json::from_value(Value::Array(scenes.clone())).ok())
        .unwrap_or_default()
}

/// A Python raw string literal around `text`.
///
/// The generated module is Python source, and escaping a thousand lines into one line would
/// make the exported file unreadable. A raw triple-quoted string keeps it verbatim; the
/// fallback escapes only the cases a raw literal cannot represent.
fn python_raw_string(text: &str) -> String {
    for delimiter in ["'''", "\"\"\""] {
        let quote = delimiter.chars().next().unwrap_or('\'');
        if !text.contains(delimiter) && !text.ends_with(quote) {
            return format!("r{delimiter}{text}{delimiter}");
        }
    }
    let escaped = text.replace('\\', "\\\\").replace("'''", "\\'\\'\\'");
    format!("'''{escaped}'''")
}

/// A Python `bytes` literal holding `text` as UTF-8.
///
/// A non-ASCII path in a plain `b"..."` literal is a syntax error in Python 3, so every
/// non-ASCII character is emitted as its UTF-8 bytes. The decoded value is identical to what
/// the engine's variable map delivers.
fn python_bytes_literal(text: &str) -> String {
    let mut out = String::from("b\"");
    for character in text.chars() {
        match character {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ' '..='~' => out.push(character),
            other => {
                let mut buffer = [0_u8; 4];
                for byte in other.encode_utf8(&mut buffer).bytes() {
                    out.push_str(&format!("\\x{byte:02x}"));
                }
            }
        }
    }
    out.push('"');
    out
}

/// A Python `str` literal holding `text`, for the scratch directory the export reads.
///
/// A Windows path is mostly backslashes, and an unescaped one turns `C:\Users` into `C:Users`
/// or a `\U` escape. Python source is UTF-8, so non-ASCII characters stay readable.
fn python_string_literal(text: &str) -> String {
    let mut out = String::from("\"");
    for character in text.chars() {
        match character {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use serde_json::json;

    use super::*;

    fn condor() -> Value {
        json!({
            "encoder": {},
            "scenes": [{
                "start_frame": 0,
                "end_frame": 24,
                "sub_scenes": null,
                "encoder": {
                    "SVTAV1": {
                        "options": {},
                        "photon_noise": null
                    }
                },
                "sequence_data": {
                    "noise_detection": { "noise": 4.2, "luminance": 0.3, "created_on": null }
                }
            }],
        })
    }

    /// An empty directory that `live_directory` must not mistake for a written module.
    fn missing_directory(label: &str) -> PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "av1ation-export-{label}-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&path);
        path
    }

    #[test]
    fn the_export_embeds_the_module_variables_and_script_verbatim() {
        let script = "import condor_data as cd\nprint(cd.scenes[0].start)\n";
        let directory = missing_directory("embedded");
        let exported = materialise(
            script,
            Some(&condor()),
            &RunnerConfig::default(),
            &directory.display().to_string(),
            "C:/media/clip.mkv",
        );
        assert!(
            exported
                .source
                .contains("_av1ation_sys.modules[\"condor_data\"]")
        );
        assert!(
            exported
                .source
                .contains("condor_video_path = b\"C:/media/clip.mkv\"")
        );
        assert!(exported.source.contains("condor_sequence_config = b\"{"));
        assert!(exported.source.contains("class Object:"));
        assert!(exported.source.ends_with(script));
        assert!(
            exported
                .variables
                .iter()
                .any(|variable| variable.key == "condor_scenes")
        );
    }

    #[test]
    fn the_module_is_in_sys_modules_before_its_classes_are_executed() {
        // dataclasses resolves a string annotation through `sys.modules[cls.__module__]`.
        // The generated module defines its classes at import time, so registering it after
        // `exec` makes Python 3.14 fail on the first dataclass with a `NoneType` module.
        let directory = missing_directory("ordering");
        let exported = materialise(
            "import condor_data\n",
            Some(&condor()),
            &RunnerConfig::default(),
            &directory.display().to_string(),
            "clip.mkv",
        );
        let register = exported
            .source
            .find("_av1ation_sys.modules[\"condor_data\"] = _av1ation_module")
            .expect("the module is registered");
        let execute = exported
            .source
            .find("exec(compile(_AV1ATION_CONDOR_DATA")
            .expect("the module is executed");
        assert!(
            register < execute,
            "the module must be importable while its classes are defined"
        );
    }

    #[test]
    fn a_written_scratch_directory_turns_the_export_into_a_live_reader() {
        let directory = missing_directory("live");
        fs::create_dir_all(&directory).expect("scratch directory");
        fs::write(
            directory.join(script_module::MODULE_FILE),
            script_module::module_source(),
        )
        .expect("module");
        fs::write(
            directory.join(script_module::DATA_FILE),
            script_module::module_data(
                &[],
                &script_data::CustomSceneData::new(),
                &RunnerConfig::default(),
                &directory.display().to_string(),
                "export",
                None,
                "clip.mkv",
            ),
        )
        .expect("document");

        let script = "import condor_data as cd\nprint(cd.scene_count)\n";
        let exported = materialise(
            script,
            Some(&condor()),
            &RunnerConfig::default(),
            &directory.display().to_string(),
            "clip.mkv",
        );
        fs::remove_dir_all(&directory).expect("cleanup");

        assert!(
            !exported.source.contains("_AV1ATION_CONDOR_DATA"),
            "a live export does not carry the module"
        );
        assert!(
            !exported.source.contains("_AV1ATION_CONDOR_VALUES"),
            "a live export does not carry the document"
        );
        assert!(
            exported
                .source
                .contains("_av1ation_sys.path.insert(0, _AV1ATION_DATA_DIR)")
        );
        assert!(
            exported
                .source
                .contains("condor_scenes = _av1ation_json.dumps(")
        );
        assert!(exported.source.contains(&format!(
            "condor_temp_dir = {}",
            python_bytes_literal(&directory.display().to_string())
        )));
        assert!(exported.source.ends_with(script));
        assert!(
            exported
                .variables
                .iter()
                .any(|variable| variable.key == "condor_scenes"),
            "the page still lists the same seven values"
        );
    }

    #[test]
    fn a_non_ascii_path_is_escaped_into_a_valid_bytes_literal() {
        assert_eq!(
            python_bytes_literal("C:/clips/é.mkv"),
            "b\"C:/clips/\\xc3\\xa9.mkv\""
        );
        assert_eq!(python_bytes_literal("a\"b\\c"), "b\"a\\\"b\\\\c\"");
    }

    #[test]
    fn a_windows_path_is_escaped_into_a_valid_string_literal() {
        assert_eq!(
            python_string_literal("C:\\Users\\ana\\Temp"),
            "\"C:\\\\Users\\\\ana\\\\Temp\""
        );
    }
}
