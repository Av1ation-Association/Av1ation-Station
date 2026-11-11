//! Python state across script environments in one process.
//!
//! VSScript keeps one Python runtime per process, and Python keeps the first imported
//! `condor_data` in `sys.modules`. A later video's script therefore receives the module
//! object that another video's scenes directory imported first. If the module read the JSON
//! beside that object, Target Quality would see the first video's scene table — and its
//! Noise Detector results as `None` — which is exactly the failure this test pins.
//!
//! The same runtime keeps a script's own imports. Editing a helper module and probing the
//! script again must therefore re-import it, not run the code object loaded before the edit;
//! `an_edited_script_module_is_reimported_on_the_next_open` pins that refresh and the fact
//! that an unchanged helper is not imported again on every open.
//!
//! An exported `.vpy` is evaluated by `vspipe` and `vsview` with no injected variables, so
//! `an_export_opens_without_injected_variables` pins that both export kinds load: the live
//! reader from the video's scratch directory, and the embedded fallback that registers the
//! module before its classes execute.
//!
//! Ignored like the other VapourSynth tests: run with
//! `cargo test -p av1ation-engine --test script_module_cache -- --ignored`.

use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
    time::UNIX_EPOCH,
};

use andean_condor::models::{
    encoder::{Encoder, EncoderBase},
    scene::Scene,
    sequence::{DefaultSequenceData, noise_detector::NoiseDetectorData},
};
use av1ation_engine::{RunnerConfig, capability::preflight, script::module as script_module};
use av1ation_test_support::Scratch;
use vapoursynth::{
    api::API,
    map::OwnedMap,
    vsscript::{Environment, Error as VsscriptError},
};

const SCRIPT: &str = r#"
import sys
sys.path.insert(0, condor_temp_dir.decode())
import condor_data as cd

scene = cd.scenes[0]
noise = scene.sequence_data.noise_detection
result = f"{cd.scene_count}|{scene.start}-{scene.end}|{'null' if noise is None else noise.noise}"
with open(probe_out.decode(), "w", encoding="utf-8") as handle:
    handle.write(result)
import vapoursynth as vs
core = vs.core
blank = core.std.BlankClip(format=vs.YUV420P8, width=16, height=16, length=1)
blank.set_output()
"#;

/// VSScript's Python runtime is process-wide, so two tests that evaluate scripts must
/// not interleave.
static VSSCRIPT: Mutex<()> = Mutex::new(());

fn vsscript_lock() -> MutexGuard<'static, ()> {
    VSSCRIPT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn vapoursynth_available() -> bool {
    preflight::detect()
        .iter()
        .any(|probe| probe.id == "vapoursynth" && probe.available)
}

fn scene(start: usize, end: usize, noise: Option<f64>) -> Scene<DefaultSequenceData> {
    Scene {
        start_frame: start,
        end_frame: end,
        sub_scenes: None,
        encoder: Encoder::default_from_base(&EncoderBase::X264, false),
        sequence_data: DefaultSequenceData {
            noise_detection: noise.map(|noise| NoiseDetectorData {
                noise,
                luminance: 0.1,
                created_on: UNIX_EPOCH,
            }),
            ..Default::default()
        },
    }
}

/// Evaluate `SCRIPT` for one scenes directory and return what the module answered.
fn read_open(dir: &Path, probe_out: &Path, label: &str) -> Result<String, String> {
    let mut environment = Environment::new().map_err(|error| error.to_string())?;
    let api = API::get().ok_or_else(|| "no VapourSynth API".to_owned())?;
    let mut variables = OwnedMap::new(api);
    variables
        .set_data("condor_temp_dir", dir.display().to_string().as_bytes())
        .map_err(|error| error.to_string())?;
    variables
        .set_data("probe_out", probe_out.display().to_string().as_bytes())
        .map_err(|error| error.to_string())?;
    environment
        .set_variables(&variables)
        .map_err(|error| error.to_string())?;
    environment
        .eval_script(SCRIPT)
        .map_err(|error: VsscriptError| format!("{label}: {error}"))?;
    let _ = environment.get_output(0);
    std::fs::read_to_string(probe_out).map_err(|error| error.to_string())
}

#[test]
#[ignore = "needs VapourSynth; run with --ignored"]
fn a_second_video_reads_its_own_scene_table_and_noise_results() {
    if !vapoursynth_available() {
        println!("skipped: VapourSynth is not available on this machine");
        return;
    }
    let _guard = vsscript_lock();

    let scratch = Scratch::new("av1ation-module-cache");
    let root = scratch.path().to_path_buf();
    let first = root.join("first-video");
    let second = root.join("second-video");
    // The first video has no Noise Detector data; the second has it. The second open is the
    // one that used to answer with the first video's table, so its noise value was `None`.
    let first_scenes = vec![scene(0, 24, None)];
    let second_scenes = vec![scene(0, 12, Some(0.0027)), scene(12, 30, Some(0.0019))];
    for (dir, scenes, run) in [
        (&first, &first_scenes, "run-first"),
        (&second, &second_scenes, "run-second"),
    ] {
        let temp = dir.display().to_string();
        let data = script_module::module_data(
            scenes,
            &Default::default(),
            &RunnerConfig::default(),
            &temp,
            run,
            Some("TargetQuality"),
            "C:/media/clip.mkv",
        );
        script_module::write_module(&temp, &script_module::module_source(), &data)
            .expect("the module is written");
    }

    let first_out = root.join("first.txt");
    let second_out = root.join("second.txt");
    let first_answer = read_open(&first, &first_out, "first").expect("the first open evaluates");
    let second_answer =
        read_open(&second, &second_out, "second").expect("the second open evaluates");

    assert_eq!(first_answer, "1|0-24|null");
    assert_eq!(
        second_answer, "2|0-12|0.0027",
        "the second open read the first open's document: {second_answer}"
    );
}

/// Probe one script input through the path the Input Configuration probe uses, and return
/// the width of the clip it produced.
fn probe_script_width(input: &serde_json::Value, temp_dir: &str) -> Result<u32, String> {
    let sequence_config = serde_json::Value::Null;
    let context = av1ation_engine::media::video::ProbeContext {
        video_path: "C:/media/reload-helper.mkv",
        temp_dir,
        condor: None,
        sequence_config: &sequence_config,
    };
    av1ation_engine::media::video::probe_source_with(input, Some(&context)).map(|probe| probe.width)
}

/// A script that reads the module and writes what it saw beside the export.
const EXPORT_SCRIPT: &str = r#"
import condor_data as cd
import os

with open(os.path.join(condor_temp_dir.decode(), "export_answer.txt"), "w", encoding="utf-8") as handle:
    handle.write(str(cd.scene_count))

import vapoursynth as vs
core = vs.core
core.std.BlankClip(format=vs.YUV420P8, width=16, height=16, length=1).set_output()
"#;

/// Evaluate one exported file the way `vsview` does: no variables, only the file.
fn evaluate_export(source: &str) -> Result<(), String> {
    let mut environment = Environment::new().map_err(|error| error.to_string())?;
    environment
        .eval_script(source)
        .map_err(|error: VsscriptError| error.to_string())?;
    let _ = environment.get_output(0);
    Ok(())
}

/// Both exports must open outside the application, where nothing injects the seven
/// `condor_*` values. The live export reads the video's scratch directory and stays small;
/// the embedded fallback carries the module and document and must still define the
/// generated dataclasses on the Python runtime VapourSynth loads.
#[test]
#[ignore = "needs VapourSynth; run with --ignored"]
fn an_export_opens_without_injected_variables() {
    if !vapoursynth_available() {
        println!("skipped: VapourSynth is not available on this machine");
        return;
    }
    let _guard = vsscript_lock();

    let live_scratch = Scratch::new("av1ation-module-live");
    let live = live_scratch.path().to_path_buf();
    let live_temp = live.display().to_string();
    let scenes = vec![scene(0, 24, None), scene(24, 60, Some(0.0027))];
    let data = script_module::module_data(
        &scenes,
        &Default::default(),
        &RunnerConfig::default(),
        &live_temp,
        "export",
        None,
        "C:/media/clip.mkv",
    );
    script_module::write_module(&live_temp, &script_module::module_source(), &data)
        .expect("the module is written");

    let exported = av1ation_engine::script::export::materialise(
        EXPORT_SCRIPT,
        None,
        &RunnerConfig::default(),
        &live_temp,
        "C:/media/clip.mkv",
    );
    assert!(
        !exported.source.contains("_AV1ATION_CONDOR_DATA"),
        "a live export must not embed the module"
    );
    evaluate_export(&exported.source).expect("the live export opens");
    assert_eq!(
        std::fs::read_to_string(live.join("export_answer.txt")).expect("the live answer"),
        "2",
        "the live export read the document beside the module"
    );

    // An empty scratch directory has no module and document to read, so the export embeds
    // them. Its `condor_scene_count` is zero because no checkpoint supplied scenes.
    let embedded_scratch = Scratch::new("av1ation-module-embedded");
    let embedded = embedded_scratch.path().to_path_buf();
    let embedded_temp = embedded.display().to_string();
    let fallback = av1ation_engine::script::export::materialise(
        EXPORT_SCRIPT,
        None,
        &RunnerConfig::default(),
        &embedded_temp,
        "C:/media/clip.mkv",
    );
    assert!(
        fallback.source.contains("_AV1ATION_CONDOR_DATA"),
        "a scratch directory without a module forces the embedded export"
    );
    evaluate_export(&fallback.source).expect("the embedded export opens");
    assert_eq!(
        std::fs::read_to_string(embedded.join("export_answer.txt")).expect("the embedded answer"),
        "0",
        "the embedded module loaded its pinned document"
    );
}

#[test]
#[ignore = "needs VapourSynth; run with --ignored"]
fn an_edited_script_module_is_reimported_on_the_next_open() {
    if !vapoursynth_available() {
        println!("skipped: VapourSynth is not available on this machine");
        return;
    }
    let _guard = vsscript_lock();

    let scratch = Scratch::new("av1ation-module-reload");
    let root = scratch.path().to_path_buf();
    let helper = root.join("reload_helper.py");
    let imports = root.join("imports.txt");
    // A width the helper declares, so the opened clip proves which version of the file
    // the interpreter actually ran.
    let write_helper = |width: u32, marker: &str| {
        std::fs::write(
            &helper,
            format!(
                "open(r\"{}\", \"a\", encoding=\"utf-8\").write(\"x\")\nWIDTH = {width}\n# {marker}\n",
                imports.display()
            ),
        )
        .expect("the helper module is written");
    };
    let import_count = || {
        std::fs::read_to_string(&imports)
            .map(|text| text.lines().count())
            .unwrap_or(0)
    };
    let script = format!(
        r#"
import sys
sys.path.insert(0, r"{root}")
import reload_helper
import vapoursynth as vs
core = vs.core
core.std.BlankClip(
    format=vs.YUV420P8,
    width=reload_helper.WIDTH,
    height=16,
    length=1,
).set_output()
"#,
        root = root.display()
    );
    let temp = root.display().to_string();
    let input = av1ation_engine::media::video::vapoursynth_script_text_input(
        &script,
        &std::collections::BTreeMap::new(),
    );

    write_helper(16, "first");
    assert_eq!(
        probe_script_width(&input, &temp).expect("the first probe evaluates"),
        16,
        "the first probe did not use the helper it imported"
    );
    // The helper was imported after that refresh, so the second probe learns its stamp and
    // reloads it once; later opens use the module already loaded.
    assert_eq!(
        probe_script_width(&input, &temp).expect("the second probe evaluates"),
        16
    );

    write_helper(32, "edited");
    assert_eq!(
        probe_script_width(&input, &temp).expect("the edited probe evaluates"),
        32,
        "the edited helper was still the version imported first"
    );

    // An unchanged helper must not be imported on every open: a preview opens the script
    // for each seek, and a resumed run opens it again for every sequence.
    let reloaded = import_count();
    assert_eq!(
        probe_script_width(&input, &temp).expect("the unchanged probe evaluates"),
        32
    );
    assert_eq!(
        import_count(),
        reloaded,
        "an unchanged helper was imported again"
    );
}
