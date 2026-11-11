//! Real encodes, ignored by default because they need FFmpeg and an AV1 encoder.
//!
//! Run with `cargo test -p av1ation-engine --test real_encode -- --ignored`.
//! The normal suite never needs an encoder binary, FFmpeg, or a committed clip: each test
//! generates its own input through `av1ation-test-support`.

use std::{
    sync::{Arc, Mutex, atomic::AtomicBool},
    time::{Duration, Instant},
};

use andean_condor::models::{
    encoder::{Encoder, EncoderBase},
    sequence::DefaultSequenceConfig,
};
use av1ation_engine::{
    EncodeEvent, EncodeEventKind, EncodeRequest, EncodeRunner, RealRunner,
    capability::preflight,
    media::{
        preview,
        video::{native_input, native_output, vapoursynth_input},
    },
};
use av1ation_test_support::{Clip, Scratch, ffmpeg};

/// The sequences every run in this test executes, in pipeline order.
const SEQUENCES: [&str; 3] = ["SceneDetector", "ParallelEncoder", "SceneConcatenator"];

/// Run one request to completion, printing every event, and return the terminal kind plus
/// the event stream.
fn run(request: EncodeRequest) -> (Option<EncodeEventKind>, Vec<EncodeEvent>) {
    let handle = RealRunner.start(request).expect("runner starts");
    let deadline = Instant::now() + Duration::from_secs(240);
    let mut seen = Vec::new();
    let mut terminal = None;
    while Instant::now() < deadline {
        let Ok(event) = handle.events.recv_timeout(Duration::from_secs(1)) else {
            continue;
        };
        println!("{} {:?} {}", event.seq, event.kind, event.message);
        let kind = event.kind;
        seen.push(event);
        if kind.is_terminal() {
            terminal = Some(kind);
            break;
        }
    }
    assert!(
        seen.windows(2).all(|pair| pair[0].seq < pair[1].seq),
        "event sequence numbers must increase: {:?}",
        seen.iter().map(|event| event.seq).collect::<Vec<_>>()
    );
    assert!(
        seen.iter().all(|event| event.seq <= 9_007_199_254_740_991),
        "a JSON client cannot represent the terminal event's sequence number"
    );
    (terminal, seen)
}

fn default_config(
    scenes_directory: &std::path::Path,
    output: &std::path::Path,
) -> DefaultSequenceConfig {
    let mut config = DefaultSequenceConfig::default();
    config.parallel_encoder.scenes_directory = scenes_directory.to_path_buf();
    config.parallel_encoder.workers = Some(2);
    config.scene_concatenator.scenes_directory = scenes_directory.to_path_buf();
    config.scene_concatenator.output = Some(output.to_path_buf());
    config
}

/// Decode every video frame of a proxy, so a stream that merely exists but carries no
/// sequence header cannot pass as a playable preview.
fn assert_decodable(path: &std::path::Path) {
    let output = std::process::Command::new(ffmpeg())
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(path)
        .args(["-map", "0:v:0", "-f", "null", "-"])
        .output()
        .expect("ffmpeg runs");
    assert!(
        output.status.success(),
        "{} could not be decoded: {}",
        path.display(),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// A preview proxy must be visually lossless against the source, not sample-exact: the
/// player's SourceBuffer cannot hold a bit-exact H.264 window. SSIM above 0.99 is the
/// assertion for "a different last bit, the same picture".
fn assert_visually_lossless(proxy: &std::path::Path, source: &std::path::Path) {
    let output = std::process::Command::new(ffmpeg())
        .args(["-hide_banner", "-i"])
        .arg(proxy)
        .arg("-i")
        .arg(source)
        .args(["-lavfi", "[0:v][1:v]ssim", "-f", "null", "-"])
        .output()
        .expect("ffmpeg runs");
    assert!(
        output.status.success(),
        "{} could not be compared: {}",
        proxy.display(),
        String::from_utf8_lossy(&output.stderr)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    let score = stderr
        .split("All:")
        .nth(1)
        .and_then(|rest| rest.split_whitespace().next())
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or_else(|| panic!("ssim did not report a score: {stderr}"));
    assert!(
        score >= 0.99,
        "{} scores {score} against {}",
        proxy.display(),
        source.display()
    );
}

/// Both preview sources must leave a real, decodable stream behind. The Decoded stream is
/// visually lossless H.264 in fragmented MP4; the Encoded stream is the run's own bitstream
/// in fragmented MP4. The test is ignored with the real encodes because it needs FFmpeg and
/// an encoder, and it generates the same tiny clip every other case uses.
#[test]
#[ignore = "needs FFmpeg and an AV1 encoder; run with --ignored"]
fn both_preview_sources_write_a_playable_stream() {
    let scratch = Scratch::new("av1ation-real-preview");
    let source = Clip::testsrc(scratch.path(), 320, 240, 24, 2);
    let source_path = source.path().to_str().expect("fixture path");
    let input = native_input(source_path);
    let temp = scratch.join("temp");
    std::fs::create_dir_all(&temp).expect("preview temp");
    let decoded = scratch.join("decoded.mp4");
    let decoded_context = preview::PreviewContext {
        video_path: source_path,
        temp_dir: temp.to_str().expect("temp path"),
        condor: None,
        sequence_config: &serde_json::Value::Null,
        ffmpeg: ffmpeg(),
        output: &decoded,
    };
    let cancel = AtomicBool::new(false);
    preview::write_decoded_proxy(&input, &decoded_context, &cancel)
        .expect("the decoded preview is muxed");
    assert!(
        std::fs::metadata(&decoded).is_ok_and(|metadata| metadata.len() > 0),
        "the decoded preview is not empty"
    );
    assert_decodable(&decoded);
    assert_visually_lossless(&decoded, source.path());

    let encoder = serde_json::to_value(Encoder::default_from_base(&EncoderBase::SVTAV1, false))
        .expect("encoder json");
    let encoded = scratch.join("encoded.mp4");
    let encoded_context = preview::PreviewContext {
        video_path: source_path,
        temp_dir: temp.to_str().expect("temp path"),
        condor: None,
        sequence_config: &serde_json::Value::Null,
        ffmpeg: ffmpeg(),
        output: &encoded,
    };
    // One scene covers the fixture, so this exercises the scene path the player uses:
    // the encoder writes its own elementary stream to stdout and FFmpeg copies it.
    preview::write_scene_encoded_proxy(
        &input,
        &encoder,
        &encoded_context,
        0,
        source.frames() as usize,
        &cancel,
    )
    .expect("the encoded preview is muxed");
    assert!(
        std::fs::metadata(&encoded).is_ok_and(|metadata| metadata.len() > 0),
        "the encoded preview is not empty"
    );
    assert_decodable(&encoded);
}

/// The engine ships each encoder's mandatory flags (`--demuxer=y4m` for x264, for
/// example), so an encoder built with its defaults excluded cannot encode at all: the
/// binary exits before reading a frame and the engine's streaming path reports a dead
/// frame channel instead.
#[test]
#[ignore = "needs FFmpeg and an AV1 encoder; run with --ignored"]
fn a_one_second_clip_encodes_end_to_end_over_native_ffms2() {
    let scratch = Scratch::new("av1ation-real-native");
    let source = Clip::testsrc(scratch.path(), 320, 240, 24, 2);
    let source_path = source.path().to_str().expect("utf-8 source path");
    let output = scratch.join("output.mkv");
    let scenes_directory = scratch.join("scenes");
    std::fs::create_dir_all(&scenes_directory).expect("scenes dir");

    let config = default_config(&scenes_directory, &output);
    let mut encoder = Encoder::default_from_base(&EncoderBase::X264, false);
    encoder.set_quantizer(30.0);

    let saves = Arc::new(Mutex::new(0usize));
    let saves_for_callback = Arc::clone(&saves);
    let request = EncodeRequest {
        run_id: "real-encode-native".to_owned(),
        project_id: "project".to_owned(),
        video_id: "video".to_owned(),
        input: native_input(source_path),
        video_path: source_path.to_owned(),
        output: native_output(output.to_str().expect("utf-8 output path")),
        encoder: serde_json::to_value(&encoder).expect("encoder json"),
        sequence_config: serde_json::to_value(&config).expect("config json"),
        condor: None,
        sequences: SEQUENCES.iter().map(|id| (*id).to_owned()).collect(),
        checkpoint: Arc::new(move |_value| {
            *saves_for_callback.lock().expect("save count") += 1;
            Ok(())
        }),
    };

    let (terminal, events) = run(request);

    assert_eq!(
        terminal,
        Some(EncodeEventKind::Finished),
        "the run did not finish"
    );
    assert!(output.exists(), "the concatenated output is missing");
    assert!(
        std::fs::metadata(&output).expect("output metadata").len() > 0,
        "the concatenated output is empty"
    );
    assert!(
        scenes_directory.join("00000.264").exists(),
        "the retained scene chunk is missing"
    );
    assert!(
        *saves.lock().expect("save count") > 0,
        "no checkpoint was written"
    );
    assert!(
        events.iter().any(|event| event.frames_total.is_some()),
        "no frame counts reached the event stream"
    );
    let completed: Vec<&str> = events
        .iter()
        .filter(|event| event.kind == EncodeEventKind::Completed)
        .filter_map(|event| event.sequence.as_deref())
        .collect();
    assert_eq!(completed, SEQUENCES, "a sequence did not report completion");
}

/// The encoder the application defaults to, decoded through the path the CLI defaults to:
/// a VapourSynth input with the BestSource source plugin. Skipped on a machine without
/// VapourSynth, because that is a missing optional dependency rather than a failure.
#[test]
#[ignore = "needs FFmpeg, VapourSynth and an AV1 encoder; run with --ignored"]
fn the_default_vapoursynth_path_encodes_end_to_end() {
    if !preflight::detect()
        .iter()
        .any(|probe| probe.id == "vapoursynth" && probe.available)
    {
        println!("skipped: VapourSynth is not available on this machine");
        return;
    }

    let scratch = Scratch::new("av1ation-real-vapoursynth");
    let source = Clip::testsrc(scratch.path(), 320, 240, 24, 2);
    let source_path = source.path().to_str().expect("utf-8 source path");
    let output = scratch.join("output.mkv");
    let scenes_directory = scratch.join("scenes");
    std::fs::create_dir_all(&scenes_directory).expect("scenes dir");

    let config = default_config(&scenes_directory, &output);
    let encoder = Encoder::default_from_base(&EncoderBase::SVTAV1, false);

    let request = EncodeRequest {
        run_id: "real-encode-vapoursynth".to_owned(),
        project_id: "project".to_owned(),
        video_id: "video".to_owned(),
        input: vapoursynth_input(source_path),
        video_path: source_path.to_owned(),
        output: native_output(output.to_str().expect("utf-8 output path")),
        encoder: serde_json::to_value(&encoder).expect("encoder json"),
        sequence_config: serde_json::to_value(&config).expect("config json"),
        condor: None,
        sequences: SEQUENCES.iter().map(|id| (*id).to_owned()).collect(),
        checkpoint: Arc::new(|_value| Ok(())),
    };

    let (terminal, _events) = run(request);

    assert_eq!(
        terminal,
        Some(EncodeEventKind::Finished),
        "the VapourSynth run did not finish"
    );
    assert!(output.exists(), "the concatenated output is missing");
    assert!(
        std::fs::metadata(&output).expect("output metadata").len() > 0,
        "the concatenated output is empty"
    );
}
