//! Video inputs and outputs as the engine models them.
//!
//! The HTTP contract carries these values as JSON so `rust/crates/contracts` stays a fast leaf
//! crate and never links the encoder toolchain. This module is the one place that turns
//! such a document back into an engine value, so a malformed request fails before a run
//! reserves the singleton.
//!
//! A new video mirrors `condor init`: the input is converted to 10-bit before it reaches an
//! encoder. The CLI's default encoder is SVT-AV1, whose 4.x builds are 10-bit only, so an
//! 8-bit source without the conversion cannot be encoded at all.

use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
};

use andean_condor::{
    core::{
        input::{Input as CoreInput, pixel_format::PixelFormat},
        output::admit_output,
    },
    ffmpeg::FFPixelFormat,
    models::{
        input::{
            Ffms2Filter, ImportMethod, Input, VapourSynthImportMethod, VapourSynthScriptSource,
        },
        output::Output,
    },
    vapoursynth::{plugins::resize::Scaler, vapoursynth_filters::VapourSynthFilter},
};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::{
    RunnerConfig,
    script::{data as script_data, module as script_module},
};

/// The engine's own JSON Schemas for the two typed filter lists.
///
/// The catalogue and the forms it drives are generated from these, so a filter the engine
/// adds in a later revision appears without a second hand-maintained field list.
pub fn filter_schemas() -> Value {
    serde_json::json!({
        "ffms2": schemars::schema_for!(Ffms2Filter),
        "vapour_synth": schemars::schema_for!(VapourSynthFilter),
    })
}

/// One JSON filter object per entry, decoded into the engine's typed enum.
///
/// A filter list is engine-owned JSON on the wire; decoding here is what makes an unknown
/// variant or a wrong field type fail before a run rather than inside the decoder.
pub fn validate_ffms2_filters(filters: &[Value]) -> Result<(), String> {
    parse_filters::<Ffms2Filter>(filters, "FFMS2").map(|_| ())
}

/// Whether every VapourSynth filter entry decodes into the engine's own enum.
pub fn validate_vapour_synth_filters(filters: &[Value]) -> Result<(), String> {
    parse_filters::<VapourSynthFilter>(filters, "VapourSynth").map(|_| ())
}

fn parse_filters<T: DeserializeOwned>(filters: &[Value], kind: &str) -> Result<Vec<T>, String> {
    filters
        .iter()
        .enumerate()
        .map(|(index, value)| {
            serde_json::from_value(value.clone()).map_err(|error| {
                format!("Filter {} is not a valid {kind} filter: {error}", index + 1)
            })
        })
        .collect()
}

/// A new video starts from the native FFMS2 decode path, converted to 10-bit.
///
/// VapourSynth is required only for the two script input kinds, so the default must not
/// assume it is installed (AGENTS §2.8). This is the decode path a machine without
/// VapourSynth can still use.
pub fn native_input(path: &str) -> Value {
    native_input_with(path, None, &[]).unwrap_or(Value::Null)
}

/// The native decode path with the project's own filters and optional `.ffindex` file.
///
/// An empty list keeps the engine default conversion to 10-bit, so a project created
/// before filter editing existed still produces the same input it did then.
pub fn native_input_with(
    path: &str,
    index_file: Option<&str>,
    filters: &[Value],
) -> Result<Value, String> {
    let filters = if filters.is_empty() {
        vec![Ffms2Filter::OutputFormat {
            bit_depth: Some(10),
            chroma: None,
            width: None,
            height: None,
        }]
    } else {
        parse_filters(filters, "FFMS2")?
    };
    serde_json::to_value(Input::Video {
        path: PathBuf::from(path),
        import_method: ImportMethod::FFMS2 {
            index: None,
            cache_path: index_file.map(PathBuf::from),
        },
        filters,
    })
    .map_err(|error| format!("the input could not be serialised: {error}"))
}

/// The decode path `condor init` defaults to: VapourSynth with the BestSource plugin.
///
/// This is offered only when the preflight inventory says VapourSynth is available; the
/// native path above is the fallback that needs no optional dependency.
pub fn vapoursynth_input(path: &str) -> Value {
    vapoursynth_input_with(path, VapourSynthSource::BestSource)
}

/// The source plugin a VapourSynth decode uses to read the media file.
///
/// These are the four plugins the engine models. The choice is metadata on the input, not a
/// second decode path, so every one of them keeps the 10-bit resize below.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VapourSynthSource {
    /// FFmpegSource.
    Ffms2,
    /// BestSource, the engine's default.
    BestSource,
    /// L-SMASH-Works.
    Lsmash,
    /// DGDecodeNV; the engine resolves `dgindexnv` from `PATH`.
    Dgdecnv,
}

impl VapourSynthSource {
    fn import_method(self) -> VapourSynthImportMethod {
        match self {
            Self::Ffms2 => VapourSynthImportMethod::FFMS2 { index: None },
            Self::BestSource => VapourSynthImportMethod::BestSource { index: None },
            Self::Lsmash => VapourSynthImportMethod::LSMASHWorks { index: None },
            Self::Dgdecnv => VapourSynthImportMethod::DGDecNV {
                dgindexnv_executable: None,
            },
        }
    }
}

/// A VapourSynth decode through one of the four source plugins.
pub fn vapoursynth_input_with(path: &str, source: VapourSynthSource) -> Value {
    vapoursynth_input_with_filters(path, source, &[]).unwrap_or(Value::Null)
}

/// The VapourSynth decode path with the project's own filter list.
///
/// An empty list keeps the 10-bit resize conversion `condor init` uses; the editor seeds
/// that filter explicitly, so the user sees and can remove it.
pub fn vapoursynth_input_with_filters(
    path: &str,
    source: VapourSynthSource,
    filters: &[Value],
) -> Result<Value, String> {
    let filters = if filters.is_empty() {
        vec![VapourSynthFilter::Resize {
            scaler: Some(Scaler::Bicubic),
            width: None,
            height: None,
            format: Some(FFPixelFormat::YUV420P10LE),
        }]
    } else {
        parse_filters(filters, "VapourSynth")?
    };
    serde_json::to_value(Input::VapourSynth {
        path: PathBuf::from(path),
        import_method: source.import_method(),
        cache_path: None,
        filters,
    })
    .map_err(|error| format!("the input could not be serialised: {error}"))
}

/// A VapourSynth script as the only input for one video.
///
/// The path is used as written: the script is never copied or rewritten, because its own
/// imports and filters are the user's program. `variables` are the user's own `condor_*`
/// keys; the runner overrides its reserved keys before every sequence.
pub fn vapoursynth_script_input(script: &str, variables: &BTreeMap<String, String>) -> Value {
    script_input(
        VapourSynthScriptSource::Path(PathBuf::from(script)),
        variables,
    )
    .unwrap_or(Value::Null)
}

/// A custom VapourSynth script stored in the project document, not on disk.
///
/// The engine evaluates the text as the script's own program; it is never written into the
/// app-data directory or rewritten to inject values, because the runner supplies the scene
/// variables through VSScript instead.
pub fn vapoursynth_script_text_input(text: &str, variables: &BTreeMap<String, String>) -> Value {
    script_input(VapourSynthScriptSource::Text(text.to_owned()), variables).unwrap_or(Value::Null)
}

fn script_input(
    source: VapourSynthScriptSource,
    variables: &BTreeMap<String, String>,
) -> Result<Value, String> {
    serde_json::to_value(Input::VapourSynthScript {
        source,
        // The engine's map is unordered; the document keeps the keys sorted so a saved
        // input reads the same way twice.
        variables: variables
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
        index: 0,
        // The script has already set its output; a resize would silently change the
        // geometry the user's program chose.
        filters: Vec::new(),
        stream_concurrently: true,
    })
    .map_err(|error| format!("the input could not be serialised: {error}"))
}

/// The exact output file, with no container tags beyond what the engine defaults to.
///
/// `overwrite` records the user's consent when the output was chosen for this queue entry.
/// The engine refuses to replace an existing distinct file without it; older documents lack
/// the field and are normalised by [`ensure_output_overwrite`].
pub fn native_output(path: &str) -> Value {
    serde_json::to_value(Output {
        path: PathBuf::from(path),
        overwrite: true,
        tags: HashMap::new(),
        video_tags: HashMap::new(),
    })
    .unwrap_or(Value::Null)
}

/// Give an older output document the overwrite consent this application always recorded.
///
/// The engine added `overwrite` with a default of `false`, so a document saved before that
/// revision would otherwise make every rerun fail once the destination exists. Only a
/// missing field is filled: an explicit `false` is a caller's decision and is preserved.
pub fn ensure_output_overwrite(value: &mut Value) -> Result<(), String> {
    value
        .as_object_mut()
        .ok_or_else(|| "the output is not a JSON object".to_owned())?
        .entry("overwrite")
        .or_insert(Value::Bool(true));
    parse_output(value).map(|_| ())
}

/// Refuse an output that aliases the source or cannot be a regular destination.
///
/// This uses the engine's own admission rules with overwrite consent, because the queue
/// entry names the destination explicitly. It still rejects hard links, symlinks and source
/// aliases, which the engine would reject only after the user started a long encode.
pub fn check_output_path(output: &str, source: &str) -> Result<(), String> {
    admit_output(Path::new(output), &[PathBuf::from(source)], true, true)
        .map_err(|error| format!("{error:#}"))
}

/// Validate a stored or submitted input document.
pub fn parse_input(value: &Value) -> Result<Input, String> {
    serde_json::from_value(value.clone())
        .map_err(|error| format!("the input is not valid: {error}"))
}

/// Validate a stored or submitted output document.
pub fn parse_output(value: &Value) -> Result<Output, String> {
    serde_json::from_value(value.clone())
        .map_err(|error| format!("the output is not valid: {error}"))
}

/// The geometry, timing, and colour metadata one decode graph reports.
///
/// The details screen shows exactly what the decoder said, so a field the source did not
/// signal is absent rather than defaulted. This is a plain engine type: the service maps it
/// into the generated contract because this crate sits below `av1ation-contracts`.
#[derive(Debug, Clone, PartialEq)]
pub struct SourceProbe {
    /// Decoded width in pixels.
    pub width: u32,
    /// Decoded height in pixels.
    pub height: u32,
    /// Frame count the decoder reported.
    pub frames: u64,
    /// Frames per second, as the decode graph reports them.
    pub fps: f64,
    /// The pixel format name the decoder reported.
    pub pixel_format: String,
    /// Bit depth of that format, when it has one.
    pub bit_depth: Option<u32>,
    /// Colour primaries, when the source signalled them.
    pub color_primaries: Option<String>,
    /// Transfer characteristic, when the source signalled it.
    pub color_transfer: Option<String>,
    /// Matrix coefficients, when the source signalled them.
    pub color_matrix: Option<String>,
    /// Colour range, when the source signalled it.
    pub color_range: Option<String>,
    /// Chroma sample location, when the source signalled it.
    pub chroma_location: Option<String>,
}

/// The run context a served input needs beyond its own document.
///
/// A script input imports the generated `condor_data` module and reads the reserved
/// `condor_*` variables, so it cannot be evaluated from its document alone. The service
/// supplies the same paths a run would, or the probe reports a `NameError` for a value the
/// runner always provides.
pub struct ProbeContext<'a> {
    /// The source file the video was queued with, injected as `condor_video_path`.
    pub video_path: &'a str,
    /// The video's scratch directory, where the generated module is written.
    pub temp_dir: &'a str,
    /// The persisted engine checkpoint, for the scenes a script reads.
    pub condor: Option<&'a Value>,
    /// The video's effective sequence document, injected as `condor_sequence_config`.
    pub sequence_config: &'a Value,
}

/// Open one already-validated input document and describe the clip it produces.
///
/// This is the same open every sequence performs: an FFMS2 index is built when the file has
/// none, so a probe makes the first encode start faster rather than adding work. It runs on
/// a blocking worker because the decoder is synchronous. A caller with no run context can
/// still probe a native input; a script input needs [`probe_source_with`].
pub fn probe_source(input: &Value) -> Result<SourceProbe, String> {
    probe_source_with(input, None)
}

/// Probe an input with the context a script input needs to evaluate at all.
///
/// `sequence` is absent on purpose: a probe answers what the document decodes, not what a
/// particular pipeline step would see, so `condor_sequence` is empty as it is before the
/// first sequence of a run.
pub fn probe_source_with(
    input: &Value,
    context: Option<&ProbeContext<'_>>,
) -> Result<SourceProbe, String> {
    let model = parse_input(input)?;
    let model = match context {
        Some(context) => materialise_script(
            model,
            context.video_path,
            context.temp_dir,
            context.condor,
            context.sequence_config,
            "probe",
            None,
        )?,
        None => model,
    };
    crate::script::imports::refresh(&model);
    let mut opened =
        CoreInput::ensure_indexed(&model, |_| {}, None).map_err(|error| error.to_string())?;
    let info = opened.clip_info().map_err(|error| error.to_string())?;
    let (width, height) = info.resolution;
    let fps = *info.frame_rate.numer() as f64 / *info.frame_rate.denom() as f64;
    let frames = u64::try_from(info.num_frames).unwrap_or(u64::MAX);
    let pixel_format = match info.format_info {
        PixelFormat::FFmpeg { format } => format!("{format:?}"),
        PixelFormat::VapourSynth { bit_depth } => format!("VapourSynth {bit_depth}-bit"),
    };
    let bit_depth = info
        .format_info
        .as_bit_depth()
        .ok()
        .and_then(|depth| u32::try_from(depth).ok());
    Ok(SourceProbe {
        width,
        height,
        frames,
        fps,
        pixel_format,
        bit_depth,
        color_primaries: info.color_primaries.map(|value| format!("{value:?}")),
        color_transfer: info
            .color_transfer_characteristic
            .map(|value| format!("{value:?}")),
        color_matrix: info.color_space.map(|value| format!("{value:?}")),
        color_range: info.color_range.map(|value| format!("{value:?}")),
        chroma_location: info.chroma_location.map(|value| format!("{value:?}")),
    })
}

/// Replace a script input's reserved variables and write the module it imports.
///
/// The runner rebuilds both before every sequence, and preview does the same for its own
/// open. Probing must not skip that step: a template script starts with
/// `sys.path.insert(0, condor_temp_dir.decode())`, which fails with `NameError` when the
/// variable is missing even though the document itself is valid.
pub(crate) fn materialise_script(
    model: Input,
    video_path: &str,
    temp_dir: &str,
    condor: Option<&Value>,
    sequence_config: &Value,
    run_id: &str,
    sequence: Option<&str>,
) -> Result<Input, String> {
    let Input::VapourSynthScript {
        source,
        mut variables,
        index,
        filters,
        stream_concurrently,
    } = model
    else {
        return Ok(model);
    };
    let scenes = scenes_from_condor(condor);
    // A probe or a check can be asked for a document whose configuration has not been
    // saved yet, so an unreadable document falls back to the engine defaults: the module
    // then carries a complete, typed object rather than a missing attribute.
    let config: RunnerConfig = serde_json::from_value(sequence_config.clone()).unwrap_or_default();
    let data = script_module::module_data(
        &scenes,
        &script_data::custom_scene_data(condor),
        &config,
        temp_dir,
        run_id,
        sequence,
        video_path,
    );
    script_module::write_module(temp_dir, &script_module::module_source(), &data)
        .map_err(|error| format!("The script module could not be written: {error}"))?;
    for variable in script_data::injected_variables_from_condor(
        condor, &config, temp_dir, run_id, sequence, video_path,
    ) {
        variables.insert(variable.key.to_owned(), variable.value);
    }
    Ok(Input::VapourSynthScript {
        source,
        variables,
        index,
        filters,
        stream_concurrently,
    })
}

/// The scenes a persisted checkpoint carries, for a script's scene table.
///
/// Gaps are closed here because this table can become a clip: a script that splices
/// `src[scene.start:scene.end]` for every scene cuts an uncovered range out of the middle,
/// shifting every later scene's frames and shortening the clip by however many frames the
/// hole held. The probe opens the raw source, so it reports the source's frame count; a
/// preview or an export that opened a shorter clip disagreed with it and could not reach the
/// last frame. Closing the hole into the scene before it makes each frame number mean the
/// same thing in the source, the clip, and the decoded window.
fn scenes_from_condor(
    condor: Option<&Value>,
) -> Vec<andean_condor::models::scene::Scene<andean_condor::models::sequence::DefaultSequenceData>>
{
    let mut scenes: Vec<
        andean_condor::models::scene::Scene<andean_condor::models::sequence::DefaultSequenceData>,
    > = condor
        .and_then(|condor| condor.get("scenes"))
        .and_then(Value::as_array)
        .and_then(|scenes| serde_json::from_value(Value::Array(scenes.clone())).ok())
        .unwrap_or_default();
    crate::run::reset::close_scene_gaps_in(&mut scenes);
    scenes
}

/// Whether decoding this input needs VapourSynth rather than the native FFMS2 path.
pub fn input_needs_vapoursynth(value: &Value) -> bool {
    value
        .get("VapourSynth")
        .or_else(|| value.get("VapourSynthScript"))
        .is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_legacy_output_gains_consent_but_an_explicit_refusal_is_kept() {
        let mut legacy = serde_json::json!({
            "path": "out.mkv", "tags": {}, "video_tags": {}
        });
        ensure_output_overwrite(&mut legacy).expect("the legacy document is valid");
        assert_eq!(legacy["overwrite"], serde_json::json!(true));

        let mut refused = serde_json::json!({
            "path": "out.mkv", "overwrite": false, "tags": {}, "video_tags": {}
        });
        ensure_output_overwrite(&mut refused).expect("the document is valid");
        assert_eq!(
            refused["overwrite"],
            serde_json::json!(false),
            "an imported document's refusal is not overwritten"
        );
    }

    #[test]
    fn a_script_scene_table_has_no_hole_to_cut_out_of_the_clip() {
        // The table a preview or an export opens is a list of splice ranges. A hole would be
        // cut out of the clip, shortening it and moving every later scene's frames.
        let encoder = andean_condor::models::encoder::Encoder::default_from_base(
            &andean_condor::models::encoder::EncoderBase::SVTAV1,
            false,
        );
        let row = |start: usize, end: usize| andean_condor::models::scene::Scene {
            start_frame: start,
            end_frame: end,
            sub_scenes: None,
            encoder: encoder.clone(),
            sequence_data: andean_condor::models::sequence::DefaultSequenceData::default(),
        };
        let condor = serde_json::json!({
            "scenes": [row(0, 181), row(181, 271), row(276, 431)],
        });
        let scenes = scenes_from_condor(Some(&condor));
        assert_eq!(scenes.len(), 3);
        assert_eq!(
            scenes[1].end_frame, 276,
            "the hole joins the scene before it"
        );
        assert_eq!(scenes[2].start_frame, 276);
        assert!(
            scenes
                .windows(2)
                .all(|pair| pair[0].end_frame == pair[1].start_frame),
            "the splice ranges are a partition with nothing cut out"
        );
    }

    #[test]
    fn every_importer_becomes_its_engine_variant() {
        for (source, tag) in [
            (VapourSynthSource::Ffms2, "FFMS2"),
            (VapourSynthSource::BestSource, "BestSource"),
            (VapourSynthSource::Lsmash, "LSMASHWorks"),
            (VapourSynthSource::Dgdecnv, "DGDecNV"),
        ] {
            let input = vapoursynth_input_with("C:/media/clip.mkv", source);
            let method = &input["VapourSynth"]["import_method"];
            assert!(
                method.get(tag).is_some(),
                "{tag} should be the import method"
            );
        }
    }

    #[test]
    fn a_script_input_receives_the_values_a_run_injects() {
        let dir =
            std::env::temp_dir().join(format!("av1ation-script-probe-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temporary dir");
        let input = serde_json::json!({
            "VapourSynthScript": {
                "source": { "Text": "src = core.std.BlankClip(format=vs.YUV420P10)\nsrc.set_output()" },
                "variables": {},
                "index": 0,
                "filters": [],
                "stream_concurrently": true,
            }
        });
        let model = parse_input(&input).expect("a script input");
        let model = materialise_script(
            model,
            "C:/media/clip.mkv",
            dir.to_str().expect("utf-8 temporary path"),
            None,
            &Value::Null,
            "probe",
            None,
        )
        .expect("the script materialises");
        let Input::VapourSynthScript { variables, .. } = model else {
            panic!("a materialised script is still a script input");
        };
        assert_eq!(
            variables["condor_temp_dir"],
            dir.to_str().expect("utf-8 temporary path")
        );
        assert_eq!(variables["condor_video_path"], "C:/media/clip.mkv");
        assert!(
            dir.join("condor_data.py").is_file(),
            "the module a script imports is written beside the video's scratch files"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn project_filters_and_an_index_replace_the_constructor_defaults() {
        let filters = vec![serde_json::json!({ "OutputFormat": { "bit_depth": 8 } })];
        let input = native_input_with("C:/media/clip.mkv", Some("C:/media/clip.ffindex"), &filters)
            .expect("a valid input");
        let parsed = parse_input(&input).expect("the engine parses its own document");
        let value = serde_json::to_value(parsed).expect("serialisable");
        assert_eq!(
            value["Video"]["import_method"]["FFMS2"]["cache_path"],
            "C:/media/clip.ffindex"
        );
        assert_eq!(value["Video"]["filters"][0]["OutputFormat"]["bit_depth"], 8);
        assert!(
            validate_vapour_synth_filters(&filters).is_ok(),
            "upstream now shares OutputFormat between the two input kinds"
        );
        assert!(
            validate_ffms2_filters(&[serde_json::json!({ "Crop": { "top": 2 } })]).is_err(),
            "a VapourSynth-only filter is not a native FFMS2 filter"
        );
    }

    #[test]
    fn a_custom_script_is_stored_as_text() {
        let input = vapoursynth_script_text_input("clip = None\n", &BTreeMap::new());
        assert_eq!(
            input["VapourSynthScript"]["source"]["Text"],
            "clip = None\n"
        );
        assert_eq!(
            input["VapourSynthScript"]["filters"]
                .as_array()
                .map(Vec::len),
            Some(0)
        );
    }

    #[test]
    fn both_filter_schemas_are_served_from_the_engine() {
        let schemas = filter_schemas();
        assert_eq!(schemas["ffms2"]["title"], "Ffms2Filter");
        assert_eq!(schemas["vapour_synth"]["title"], "VapourSynthFilter");
    }

    #[test]
    fn a_script_input_is_a_path_with_no_filters() {
        let input = vapoursynth_script_input("C:/scripts/clip.vpy", &BTreeMap::new());
        let script = &input["VapourSynthScript"];
        assert_eq!(script["source"]["Path"], "C:/scripts/clip.vpy");
        assert_eq!(script["filters"].as_array().map(Vec::len), Some(0));
        assert_eq!(script["stream_concurrently"], true);
    }
}
