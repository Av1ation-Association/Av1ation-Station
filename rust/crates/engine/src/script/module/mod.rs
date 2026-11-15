//! The generated `condor_data` module a custom script imports.
//!
//! A script is evaluated by VSScript, so the only data it can receive from the engine is the
//! `variables` map, and every value in that map arrives as `bytes`. Parsing a JSON scene table
//! by hand in every script is a trap: a typo in a field name fails at open time with a Python
//! traceback and no help. This module is written into the scenes directory before every
//! sequence, so a script imports a typed object instead.
//!
//! VSScript keeps one Python runtime for the whole process, and Python keeps an imported
//! module in `sys.modules` for that runtime. The module a later open imports can therefore be
//! the copy another video's scenes directory imported first, so its document is resolved from
//! the evaluating script's `condor_temp_dir` rather than from its own location.
//!
//! [`module_source`] and [`stub_source`] describe the same object. The editor renders the
//! stub for completion and the runner writes the module, so a field cannot exist in one and
//! be missing from the other. The names are the lowercase ones the design uses
//! (`cd.video_path`, `cd.scenes`, `cd.temp_dir`) because the template is written against
//! them; the raw injected globals keep their `condor_` prefix and are documented beside them.

use std::{
    collections::{BTreeMap, BTreeSet},
    fs, io,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use andean_condor::models::{encoder::Encoder, scene::Scene, sequence::DefaultSequenceData};
use serde_json::{Value, json};

use crate::RunnerConfig;

/// File name of the module inside the scenes directory.
pub const MODULE_FILE: &str = "condor_data.py";

/// File the module reads its per-open values from, beside it in the scenes directory.
pub const DATA_FILE: &str = "condor_data.json";

/// The values one open exposes, as the JSON the module reads.
///
/// The table is JSON rather than Python literals: the engine's own serializer writes every
/// field of the data and encoder documents, so a sequence that gains a field upstream
/// reaches the script without a second field list here.
pub fn module_data(
    scenes: &[Scene<DefaultSequenceData>],
    custom: &crate::script::data::CustomSceneData,
    config: &RunnerConfig,
    temp_dir: &str,
    run_id: &str,
    sequence: Option<&str>,
    video_path: &str,
) -> String {
    let table: Vec<Value> = scenes
        .iter()
        .enumerate()
        .map(|(index, scene)| {
            let index = u32::try_from(index).unwrap_or(u32::MAX);
            // The user's pairs share the engine's object, so one attribute chain reads
            // either source. The engine's own fields win when a name somehow collides.
            let mut data = serde_json::to_value(&scene.sequence_data).unwrap_or(Value::Null);
            if let (Value::Object(object), Some(pairs)) = (&mut data, custom.get(&index)) {
                for (key, value) in pairs {
                    object.entry(key.clone()).or_insert_with(|| value.clone());
                }
            }
            json!({
                "index": index,
                "start": scene.start_frame,
                "end": scene.end_frame,
                "sequence_data": data,
                "encoder": serde_json::to_value(&scene.encoder).unwrap_or(Value::Null),
            })
        })
        .collect();
    serde_json::to_string(&json!({
        "video_path": video_path,
        "temp_dir": temp_dir,
        "run_id": run_id,
        "sequence": sequence.unwrap_or_default(),
        "sequence_config": config,
        "scenes": table,
    }))
    .unwrap_or_else(|_| "{}".to_owned())
}

mod source;
pub use source::{module_source, stub_source, template_source};
pub fn write_module(dir: &str, source: &str, data: &str) -> io::Result<PathBuf> {
    let path = Path::new(dir);
    fs::create_dir_all(path)?;
    let file = path.join(MODULE_FILE);
    fs::write(&file, source)?;
    fs::write(path.join(DATA_FILE), data)?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scene(start: usize, end: usize) -> Scene<DefaultSequenceData> {
        Scene {
            start_frame: start,
            end_frame: end,
            sub_scenes: None,
            encoder: andean_condor::models::encoder::Encoder::default_from_base(
                &andean_condor::models::encoder::EncoderBase::X264,
                false,
            ),
            sequence_data: DefaultSequenceData::default(),
        }
    }

    #[test]
    fn the_module_reads_the_document_the_run_writes() {
        let source = module_source();
        // The text is identical for every open: Python keeps an imported module for the
        // whole runtime, so the per-open values have to live beside it instead.
        assert!(source.contains("condor_data.json"));
        assert!(source.contains("_PINNED"));
        assert!(!source.contains("_ROWS"));
        // A keyword field is renamed in the stub only; the module reads the real key.
        assert!(source.contains("name[:-1] in self._values"));

        let document = module_data(
            &[scene(0, 24), scene(24, 60)],
            &crate::script::data::CustomSceneData::default(),
            &RunnerConfig::default(),
            "C:\\temp",
            "run-1",
            None,
            "C:\\media\\clip.mkv",
        );
        let data: Value = serde_json::from_str(&document).expect("the document is JSON");
        assert_eq!(data["scenes"][1]["start"], json!(24));
        assert_eq!(data["scenes"][1]["end"], json!(60));
        assert!(data["scenes"][0]["sequence_data"].is_object());
        assert!(data["scenes"][0]["encoder"].is_object());
        // A Windows path keeps its backslashes: JSON escapes them, the module decodes them.
        assert_eq!(data["video_path"], json!("C:\\media\\clip.mkv"));
        assert_eq!(data["temp_dir"], json!("C:\\temp"));
        assert_eq!(data["sequence"], json!(""));
    }

    #[test]
    fn the_module_resolves_the_open_that_is_running() {
        let source = module_source();
        // VSScript shares one Python runtime between script environments, and `sys.modules`
        // keeps the copy the first environment imported. The document must follow the
        // evaluating script's injected directory instead of that module's own location, or a
        // later video reads the first video's scene table.
        assert!(source.contains("_sys._getframe(1)"), "{source}");
        assert!(
            source.contains("frame.f_globals.get(\"condor_temp_dir\")"),
            "{source}"
        );
        assert!(source.contains("_FALLBACK"), "{source}");
        // No frame names an open after evaluation returns, so a helper that runs later still
        // reads the document beside the module rather than failing.
        assert!(
            source.contains("_os.path.dirname(_os.path.abspath(__file__))"),
            "{source}"
        );
    }

    #[test]
    fn an_empty_document_is_valid() {
        let document = module_data(
            &[],
            &crate::script::data::CustomSceneData::default(),
            &RunnerConfig::default(),
            "C:/temp",
            "run-2",
            Some("ParallelEncoder"),
            "",
        );
        let data: Value = serde_json::from_str(&document).expect("the document is JSON");
        // Before Scene Detector has run, a script sees zero scenes rather than an error.
        assert_eq!(data["scenes"], json!([]));
        assert_eq!(data["sequence"], json!("ParallelEncoder"));
        assert_eq!(data["video_path"], json!(""));
        assert!(data["sequence_config"].is_object());
    }

    #[test]
    fn the_stub_names_every_public_member_the_module_exports() {
        let stub = stub_source();
        for field in [
            "video_path",
            "temp_dir",
            "run_id",
            "sequence",
            "sequence_config",
            "scenes",
            "scene_count",
        ] {
            assert!(stub.contains(field), "the stub should declare {field}");
        }
        assert!(stub.contains("def scene_at(frame: int) -> Scene | None:"));
        assert!(stub.contains("def frame_count(self) -> int"));
        assert!(stub.contains("sequence_data: types.data.SequenceData"));
        assert!(stub.contains("encoder: types.encoder.Encoder"));
        // The config annotation must name a class the stub declares, or completion after
        // `cd.sequence_config.` has nothing to resolve and silently offers nothing.
        assert!(stub.contains("sequence_config: types.sequence.SequenceConfig"));
        assert!(
            stub.contains("        class SequenceConfig(Object):"),
            "{stub}"
        );
        assert!(stub.contains("    noise_detector: NoiseDetectorConfig | None"));
        let template = template_source();
        assert!(template.contains("import condor_data as cd"));
        assert!(
            template.contains("core.ffms2.Source(source=cd.video_path)"),
            "the template opens the queued video instead of a made-up path"
        );
        // The default is a no-op; the filter example is commented, so a new input does not
        // alter the video before the user edits it.
        assert!(template.contains("out = src\nout.set_output()"));
        assert!(!template.contains("\nout = core.std.FlipHorizontal"));
        // The commented filter example is a core built-in. The run's plugin check would
        // otherwise reject the application's own template on a normal VapourSynth install.
        assert!(template.contains("# src = core.std.FlipHorizontal(src)"));
        assert!(!template.contains("hqdn3d"));
        // A template that begins with two quotes is valid Rust and invalid Python; the check
        // endpoint caught exactly that, so the shape is asserted here too.
        assert!(template.starts_with("\"\"\"One input"), "{template}");
    }

    #[test]
    fn the_stub_types_every_known_engine_field() {
        let stub = stub_source();
        // A class is nested under the document that owns it, or left at the module level
        // when several documents share it, so shape assertions ignore the indentation.
        let lines: Vec<&str> = stub.lines().map(str::trim_start).collect();
        let has = |needle: &str| lines.iter().any(|line| line.starts_with(needle));
        // The document classes are named, so a field read from `condor_data` completes.
        assert!(stub.contains("class SequenceData(Object):"), "{stub}");
        assert!(stub.contains("    scene_detection: SceneDetectorData"));
        assert!(stub.contains("    noise_detection: NoiseDetectorData | None"));
        assert!(stub.contains("class SceneDetectorData(Object):"));
        assert!(stub.contains("class NoiseDetectorData(Object):"));
        // A nested object is its own class rather than another untyped `Object`.
        assert!(stub.contains("        noise: float"));
        assert!(stub.contains("    scenecut_scores: dict[str, ScenecutScore] | None"));
        assert!(stub.contains("    transnetv2_scores: dict[str, float] | None"));
        // The encoder is a tagged union; every variant becomes a class named after it.
        assert!(stub.contains("\n        class Encoder(Object):"), "{stub}");
        assert!(has("class EncoderX264(Object):"), "{stub}");
        // A map with a described value keeps that value's type rather than becoming `Any`.
        // The parameter class is shared by every encoder variant, so it sits at the
        // namespace's top level and a variant names it in full: a nested class body cannot
        // resolve an enclosing class's names.
        assert!(
            has("options: dict[str, types.encoder.CLIParameter]")
                || has("options: dict[str, types.data.CLIParameter]"),
            "{stub}"
        );
        assert!(has("class CLIParameter(Object):"), "{stub}");
        assert!(has("class CLIParameterString(Object):"), "{stub}");
        // The document tree, not a flat list: the config's stages sit inside the config.
        assert!(
            stub.contains("\n        class SequenceConfig(Object):"),
            "{stub}"
        );
        assert!(
            stub.contains("    class NoiseDetectorConfig(Object):"),
            "{stub}"
        );
        // A field named after a Python keyword cannot be declared as-is: a class body has
        // no `global` or `None`, so the stub appends an underscore and the runtime strips
        // it when it reads the underlying document.
        assert!(has("global_: bool | None"), "{stub}");
        assert!(has("None_: SceneDetectionMethodNone"), "{stub}");
        // Nothing in the scene document is left as the bare container type.
        assert!(!stub.contains("sequence_data: Object"));
        assert!(!stub.contains("encoder: Object"));
    }

    #[test]
    fn the_stub_groups_types_into_namespaces_and_leaves_the_module_to_values() {
        let stub = stub_source();
        assert!(stub.contains("class types:"), "{stub}");
        for namespace in ["sequence", "data", "encoder"] {
            assert!(
                stub.contains(&format!("    class {namespace}:\n")),
                "the stub should declare types.{namespace}: {stub}"
            );
        }
        // A document class is reached through its namespace, not beside the values: a
        // script that types `cd.SequenceConfig` is looking for `cd.sequence_config`.
        assert!(!stub.contains("\nclass SequenceConfig"), "{stub}");
        assert!(!stub.contains("\nclass SequenceData"), "{stub}");
        assert!(!stub.contains("\nclass Encoder"), "{stub}");
        assert!(!stub.contains("\nclass NoiseDetectorData"), "{stub}");
        // The module level still holds what a script reads, the read-only base class, and
        // the scene record itself, which is a value a run hands out.
        for value in [
            "video_path: str",
            "temp_dir: str",
            "run_id: str",
            "sequence: str",
            "sequence_config: types.sequence.SequenceConfig",
            "scenes: tuple[Scene, ...]",
            "scene_count: int",
            "def scene_at(",
            "class Object:",
            "class Scene:",
        ] {
            assert!(
                stub.contains(value),
                "the module should still declare {value}"
            );
        }
        // The module the runner writes carries the same namespace, so an annotation that
        // names it resolves when the script is opened rather than only in the editor.
        let module = module_source();
        assert!(module.contains("class types:\n"), "{module}");
        assert!(module.contains("\"types\","));
    }

    #[test]
    fn the_stub_never_names_a_class_it_does_not_declare() {
        let stub = stub_source();
        let declared: BTreeSet<&str> = stub
            .lines()
            .filter_map(|line| line.trim_start().strip_prefix("class "))
            .filter_map(|line| line.split(['(', ':']).next())
            .collect();
        let builtin = [
            "Any", "bool", "dict", "float", "int", "None", "str", "tuple",
        ];
        for line in stub.lines() {
            let trimmed = line.trim_start();
            // Module-level values and class fields are `name: annotation`; a method carries
            // its arguments' colons and a docstring carries prose, so both are skipped.
            if trimmed.starts_with("def ")
                || trimmed.starts_with("class ")
                || trimmed.starts_with('"')
                || trimmed.starts_with('#')
            {
                continue;
            }
            let Some((name, annotation)) = trimmed.split_once(": ") else {
                continue;
            };
            if name.is_empty() || !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
                continue;
            }
            for token in annotation.split(|c: char| !c.is_alphanumeric() && c != '_') {
                if token.is_empty() || builtin.contains(&token) {
                    continue;
                }
                assert!(
                    declared.contains(token),
                    "{token} is annotated but never declared: {line}"
                );
            }
        }
    }

    #[test]
    fn the_template_imports_the_module_through_the_injected_directory() {
        let template = template_source();
        assert!(template.contains("sys.path.insert(0, condor_temp_dir.decode())"));
        assert!(template.contains("import condor_data as cd"));
        assert!(template.contains("cd.scenes"));
        assert!(template.contains("cd.scene_at"));
        assert!(template.contains("set_output()"));
    }

    #[test]
    fn the_template_defaults_to_a_whole_clip_script_with_optional_per_scene_examples() {
        let template = template_source();
        // The active script opens the queued video, sets it as the output, and runs no
        // per-scene code; the examples are comments so an unedited template changes nothing.
        assert!(template.contains("out = src\nout.set_output()"));
        assert!(!template.contains("\nfor scene in cd.scenes:"));
        assert!(!template.contains("\nparts = []"));
        assert!(template.contains("# Optional: per-scene filtering"));
        assert!(template.contains("# for scene in cd.scenes:"));
        // S5 measured the progressive splice; one end-of-graph `std.Splice` over every part
        // is the rejected per-range shape, so the example must not teach it.
        assert!(template.contains("for part in parts[1:]"));
        assert!(!template.contains("out = core.std.Splice(parts)"));
        // The grouped example is the middle method: one variant per distinct parameter set.
        assert!(template.contains("# variants = {}"));
        assert!(template.contains("# def variant(key):"));
        assert!(template.contains("core.std.FrameEval"));
        // The escape hatch must say what it costs, or it reads as a free per-scene filter.
        assert!(template.contains("per-frame dispatcher"));
        assert!(template.contains("cache miss rebuilds"));
        assert!(template.contains("scenes in flight"));
        // The cache is bounded and scene-keyed, so an unbounded per-scene graph cannot be
        // mistaken for the example: every entry holds a filter instance.
        assert!(template.contains("@lru_cache(maxsize=CACHE_SCENES)"));
        assert!(template.contains("CACHE_SCENES = 2"));
    }
}
