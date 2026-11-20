//! Real encodes, ignored by default because they need FFmpeg and an AV1 encoder.
//!
//! Run with `cargo test -p av1ation-engine --test real_encode -- --ignored`.
//! The normal suite never needs an encoder binary, FFmpeg, or a committed clip: each test
//! generates its own input through `av1ation-test-support`.

use std::{
    path::{Path, PathBuf},
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
fn assert_decodable(path: &Path) {
    assert_decodable_with(Path::new(ffmpeg()), path);
}

/// The same check with an explicit decoder, so a test of the bundled toolchain does not
/// accidentally prove that only the system FFmpeg can read the result.
fn assert_decodable_with(ffmpeg: &Path, path: &Path) {
    let output = std::process::Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(path)
        .args(["-map", "0:v:0", "-f", "null", "-"])
        .output()
        .expect("ffmpeg runs");
    assert!(
        output.status.success(),
        "{} could not be decoded by {}: {}",
        path.display(),
        ffmpeg.display(),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// A tool from the release bundle beside the workspace, or `None` in a source checkout
/// that has not staged the toolchain.
fn bundled_tool(name: &str) -> Option<PathBuf> {
    let name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    };
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../dist/tools/bin")
        .join(name);
    path.is_file().then_some(path)
}

/// An MP4 is playable only if its stream can be decoded and its fragments are present.
fn assert_ten_bit_h264(path: &Path) {
    let output = std::process::Command::new(ffmpeg())
        .args(["-hide_banner", "-i"])
        .arg(path)
        .output()
        .expect("ffmpeg runs");
    // `ffmpeg -i` prints the stream and exits non-zero when no output was requested.
    let detail = String::from_utf8_lossy(&output.stderr);
    assert!(
        detail.contains("Video: h264") && detail.contains("yuv420p10le"),
        "{} is not 10-bit H.264: {detail}",
        path.display()
    );
    let bytes = std::fs::read(path).expect("the preview is readable");
    assert!(
        bytes.windows(4).any(|window| window == b"moof"),
        "{} is not fragmented MP4",
        path.display()
    );
}

/// The Decoded source is the comparison reference, so its frames must be sample-exact.
/// Hashing the decoded video frames catches a quantizer that merely looks close, which is
/// exactly what CRF 16 was.
fn assert_lossless(proxy: &std::path::Path, source: &std::path::Path) {
    let hashes = |path: &std::path::Path| {
        let output = std::process::Command::new(ffmpeg())
            .args(["-hide_banner", "-loglevel", "error", "-i"])
            .arg(path)
            .args(["-map", "0:v:0", "-an", "-f", "framemd5", "-"])
            .output()
            .expect("ffmpeg runs");
        assert!(
            output.status.success(),
            "{} could not be hashed: {}",
            path.display(),
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|line| !line.starts_with('#') && line.split(',').next() == Some("0"))
            .map(|line| {
                line.rsplit(',')
                    .next()
                    .unwrap_or_default()
                    .trim()
                    .to_owned()
            })
            .collect::<Vec<_>>()
    };
    let proxy_hashes = hashes(proxy);
    let source_hashes = hashes(source);
    assert_eq!(
        proxy_hashes.len(),
        source_hashes.len(),
        "{} and {} decoded a different number of frames",
        proxy.display(),
        source.display()
    );
    if let Some((index, (proxy_hash, source_hash))) = proxy_hashes
        .iter()
        .zip(&source_hashes)
        .enumerate()
        .find(|(_, (proxy_hash, source_hash))| proxy_hash != source_hash)
    {
        panic!(
            "{} is not sample-exact against {}: frame {index} hashed {proxy_hash}, source hashed {source_hash}",
            proxy.display(),
            source.display()
        );
    }
}

/// Both preview sources must leave a real, decodable stream behind. The Decoded stream is
/// sample-exact H.264 in fragmented MP4; the Encoded stream is the run's own bitstream in
/// fragmented MP4. The test is ignored with the real encodes because it needs FFmpeg and an
/// encoder. Its fixture is 10-bit because that is the depth the engine's native input
/// produces, so the sample comparison tests the encoder rather than a depth conversion.
#[test]
#[ignore = "needs FFmpeg and an AV1 encoder; run with --ignored"]
fn both_preview_sources_write_a_playable_stream() {
    let scratch = Scratch::new("av1ation-real-preview");
    let source = Clip::testsrc_ten_bit(scratch.path(), 320, 240, 24, 2);
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
    assert_lossless(&decoded, source.path());

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

/// The release toolchain has no libx264, so the Decoded source must survive standalone
/// x264's elementary-stream path and FFmpeg's copy mux. Inspect the bundled FFmpeg's
/// encoder list first, so a system build with libx264 cannot make this test pass without
/// exercising the standalone path.
#[test]
#[ignore = "needs the bundled FFmpeg and x264 toolchain; run with --ignored"]
fn the_bundled_x264_decoded_preview_is_sample_exact_and_plays() {
    let Some(ffmpeg) = bundled_tool("ffmpeg") else {
        println!("skipped: the bundled FFmpeg is not staged");
        return;
    };
    let Some(x264) = bundled_tool("x264") else {
        println!("skipped: the bundled x264 is not staged");
        return;
    };
    let encoders = std::process::Command::new(&ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output()
        .expect("the bundled FFmpeg runs");
    assert!(
        !String::from_utf8_lossy(&encoders.stdout).contains("libx264"),
        "the bundled FFmpeg unexpectedly has libx264; this would not exercise standalone x264"
    );
    assert!(
        x264.is_file(),
        "the bundled x264 is missing at {}",
        x264.display()
    );

    let scratch = Scratch::new("av1ation-real-bundled-x264");
    let source = Clip::testsrc_ten_bit(scratch.path(), 320, 240, 24, 2);
    let source_path = source.path().to_str().expect("fixture path");
    let input = native_input(source_path);
    let temp = scratch.join("temp");
    std::fs::create_dir_all(&temp).expect("preview temp");
    let decoded = scratch.join("decoded-bundled-x264.mp4");
    let context = preview::PreviewContext {
        video_path: source_path,
        temp_dir: temp.to_str().expect("temp path"),
        condor: None,
        sequence_config: &serde_json::Value::Null,
        ffmpeg: ffmpeg.to_str().expect("utf-8 ffmpeg path"),
        output: &decoded,
    };
    preview::write_decoded_proxy(&input, &context, &AtomicBool::new(false))
        .expect("the bundled x264 decoded preview is muxed");

    assert!(
        std::fs::metadata(&decoded).is_ok_and(|metadata| metadata.len() > 0),
        "the decoded preview is empty"
    );
    assert_decodable_with(&ffmpeg, &decoded);
    assert_ten_bit_h264(&decoded);
    assert_lossless(&decoded, source.path());
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
