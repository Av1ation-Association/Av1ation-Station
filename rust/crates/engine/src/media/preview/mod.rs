//! Browser-playable proxies for the Scenes player's `Decoded` and `Encoded` sources.
//!
//! The engine decodes Y4M and the encoder writes a raw elementary stream. Neither is a
//! container a `<video>` element can open. This module produces the smallest piece that
//! answers what the player asked for:
//!
//! - `Decoded` is a window of the frames the Parallel Encoder receives, starting at the
//!   frame the playhead points at, muxed with the source's audio from that point.
//! - `Encoded` is one scene's chunk, produced from the scene's first frame by the exact
//!   encoder executable and parameters the Parallel Encoder would use. The encoder writes
//!   its elementary stream to stdout, which is copied into fragmented MP4 without a second
//!   encode; writing an IVF file first would both be slower and risk showing FFmpeg's
//!   approximation instead of the real chunk.
//! - A single still frame can be rendered to JPEG for scrubbing, which costs one decode and
//!   no encode.
//!
//! A VapourSynth input needs the same injected scene data a run supplies, or a script
//! written against `condor_data` would fail only in preview.

use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
};

use andean_condor::{
    core::input::{
        Input as CoreInput,
        clip_info::{ClipInfo, TransferFunction},
        color_range::ColorRange,
    },
    models::{
        encoder::{Encoder, EncoderBase, cli_parameter::CLIParameter},
        input::Input as InputModel,
    },
};
use serde_json::Value;

use crate::platform::hide_console;

/// The run id the preview module reports to a script. Preview is not a queued run, so it
/// must not pretend to be one.
const PREVIEW_RUN_ID: &str = "preview";

/// The terminal message a build reports when its last viewer left.
///
/// The service drops the cache entry and the partial file, so no user ever sees this; it is
/// still a real error rather than an empty success, because nothing was published.
pub const CANCELLED: &str = "The preview was stopped because no viewer is watching.";

/// The paths and run context one proxy needs.
///
/// Grouping them keeps the two entry points to three arguments while still naming every
/// input a script can observe: the queued file, the scratch directory, and the persisted
/// checkpoint.
/// The recipe every preview proxy is built with, folded into its cache key.
///
/// A cache keyed only by frame range served a lossless window to a player that had already
/// moved to a lighter proxy: the file was hundreds of megabytes, Chromium's `SourceBuffer`
/// filled on the first append, and the whole Decoded source failed with a quota error.
/// Bumping a hand-written version was forgotten exactly once; a recipe string beside the
/// arguments that produce the file cannot be.
pub const PROXY_RECIPE: &str = "decoded=H264(crf16,veryfast,g25,nvenc-cq18|standalone-x264)|VP9(lossless,realtime)|chunk=copy;frag=500ms";

pub struct PreviewContext<'a> {
    /// The source file this video was queued with.
    pub video_path: &'a str,
    /// The video's scratch directory, where the generated script module is written.
    pub temp_dir: &'a str,
    /// The persisted engine checkpoint, for script scene data.
    pub condor: Option<&'a Value>,
    /// The video's effective sequence document, for `condor_sequence_config`.
    pub sequence_config: &'a Value,
    /// The resolved FFmpeg executable.
    pub ffmpeg: &'a str,
    /// The proxy path the caller will rename into its cache.
    pub output: &'a Path,
}

/// The input injection a single rendered frame needs, without a video output path.
pub struct FrameContext<'a> {
    /// The source file this video was queued with.
    pub video_path: &'a str,
    /// The video's scratch directory, where the generated script module is written.
    pub temp_dir: &'a str,
    /// The persisted engine checkpoint, for script scene data.
    pub condor: Option<&'a Value>,
    /// The video's effective sequence document, for `condor_sequence_config`.
    pub sequence_config: &'a Value,
    /// The resolved FFmpeg executable.
    pub ffmpeg: &'a str,
}

mod decoded;
mod encoded;
mod remux;

pub use decoded::{write_decoded_proxy, write_decoded_window, write_frame_png};
pub use encoded::{write_encoded_proxy, write_scene_encoded_proxy};
pub use remux::remux_chunk_proxy;
fn open_input(
    input: &Value,
    video_path: &str,
    temp_dir: &str,
    condor: Option<&Value>,
    sequence_config: &Value,
    sequence: &str,
) -> Result<CoreInput, String> {
    let model: InputModel = serde_json::from_value(input.clone())
        .map_err(|error| format!("The input is not valid: {error}"))?;
    let model = crate::media::video::materialise_script(
        model,
        video_path,
        temp_dir,
        condor,
        sequence_config,
        PREVIEW_RUN_ID,
        Some(sequence),
    )?;
    crate::script::imports::refresh(&model);
    CoreInput::ensure_indexed(&model, |_| {}, None)
        .map_err(|error| format!("The input could not be opened: {error}"))
}

/// Run a preview's encoder below normal priority, so it cannot starve the decoder.
///
/// The preview exists to be watched while it is compared with the source, and a scene encode
/// at 1080p takes every core it is given. Above normal the decoder that is presenting the
/// picture loses those cores and the player starts skipping frames; below normal the encoder
/// simply waits for the CPU nobody else is using. Priority is a scheduling property, so the
/// bytes it produces are unchanged.
#[cfg(windows)]
fn below_normal_priority(child: &std::process::Child) {
    use std::ffi::c_void;

    /// `PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION`.
    const ACCESS: u32 = 0x0200 | 0x1000;
    const IDLE_PRIORITY_CLASS: u32 = 0x0000_0040;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn SetPriorityClass(process: *mut c_void, class: u32) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    // Safety: the handle is opened for the child's own pid, used only by these calls, and
    // closed before returning. A null handle (the child already exited) is a no-op.
    unsafe {
        let handle = OpenProcess(ACCESS, 0, child.id());
        if handle.is_null() {
            return;
        }
        SetPriorityClass(handle, IDLE_PRIORITY_CLASS);
        CloseHandle(handle);
    }
}

/// Unix has no equivalent hook here, and the preview's contention problem is Windows-only in
/// practice.
#[cfg(not(windows))]
fn below_normal_priority(_child: &std::process::Child) {}

/// The first diagnostic in an encoder's stderr text, if it wrote one.
///
/// Encoder CLIs print a banner and progress lines before anything useful, and a build's
/// banner is not an error even when it contains the word `error` in a feature list. A line
/// that names a failure is preferred; otherwise the last non-empty line is the closest
/// thing to a reason the encoder left.
fn encoder_error_line(text: &str) -> Option<&str> {
    encoder_diagnostic(text).or_else(|| {
        text.split(['\n', '\r'])
            .map(str::trim)
            .rfind(|line| !line.is_empty())
    })
}

/// The first line of `text` that reads like a failure, ignoring informational banners.
fn encoder_diagnostic(text: &str) -> Option<&str> {
    text.split(['\n', '\r']).map(str::trim).find(|line| {
        let lower = line.to_ascii_lowercase();
        // Encoders print `Svt[info]:` and `x264 [info]:` banners, where words such as
        // "error" name a feature rather than a failure.
        !line.is_empty()
            && !lower.contains("[info]")
            && (lower.contains("error")
                || lower.contains("failed")
                || lower.contains("not supported")
                || lower.contains("only supports")
                || lower.contains("cannot"))
    })
}

/// Add one stderr read to the pending text and return a diagnostic once its line ends.
///
/// A read can stop in the middle of a line, so a fragment waits for its terminator: an
/// encoder's `Svt[error]:` prefix alone must not be reported as the reason.
fn feed_stderr(pending: &mut String, chunk: &str) -> Option<String> {
    pending.push_str(chunk);
    let (complete, rest) = pending.rsplit_once(['\n', '\r'])?;
    let found = encoder_diagnostic(complete).map(str::to_owned);
    let rest = rest.to_owned();
    pending.clear();
    pending.push_str(&rest);
    // An encoder that writes a very long line without a terminator must not grow this
    // buffer without bound.
    if pending.len() > 8 * 1024 {
        pending.clear();
    }
    found
}

/// The encoder's reported failure, once its stderr thread has seen one.
fn encoder_failure(failure: &Mutex<Option<String>>) -> Option<String> {
    failure.lock().ok().and_then(|slot| slot.clone())
}

/// The encoder arguments for one scene preview.
///
/// Two things differ from the run: the output path is stdout, and an SVT-AV1 build whose
/// WebM IO is enabled defaults to Matroska even though the run reads IVF chunks back. The
/// container is an output-type parameter, so the preview may pin it; every rate-control and
/// filter option stays exactly as the run configured it.
/// The scene's encoder, carrying the film-grain table the run would hand it.
///
/// The Parallel Encoder generates a photon-noise table per scene, writes it into its scratch
/// directory, and appends the encoder's grain option before encoding. A preview that skipped
/// that step encoded without the grain a run adds; one opened after the scratch directory had
/// been cleaned failed outright, because the retained document still named a table that no
/// longer existed and SVT-AV1 rejects a missing `--fgs-table` value.
///
/// Regenerating here is the same computation from the same document and the same opened
/// clip the run measures, and the table lands in the same `Parallel Encoder` directory under
/// the same hashed name, so a preview is the chunk the run would write — appended colour
/// data included, because the argument list is built from this document either way.
fn prepared_encoder(document: &Value, info: &ClipInfo, temp_dir: &str) -> Result<Encoder, String> {
    prepare_encoder(
        document,
        info.resolution,
        info.photon_noise_transfer_function(),
        info.color_range,
        temp_dir,
    )
}

/// [`prepared_encoder`] on the four clip facts grain generation actually uses, so a test can
/// describe them without opening a decoder.
fn prepare_encoder(
    document: &Value,
    resolution: (u32, u32),
    transfer: TransferFunction,
    color_range: Option<ColorRange>,
    temp_dir: &str,
) -> Result<Encoder, String> {
    let mut encoder: Encoder = serde_json::from_value(document.clone())
        .map_err(|error| format!("The encoder configuration is not valid: {error}"))?;
    let generated = encoder
        .generate_photon_noise_table(resolution.0, resolution.1, transfer, color_range)
        .map_err(|error| format!("The photon-noise table could not be generated: {error}"))?;
    if let Some((name, params)) = generated {
        let directory = Path::new(temp_dir).join("Parallel Encoder");
        let table = directory.join(format!("{name}.tbl"));
        if !table.exists() {
            fs::create_dir_all(&directory).map_err(|error| {
                format!("The photon-noise table directory could not be created: {error}")
            })?;
            av1_grain::write_grain_table(&table, &[params])
                .map_err(|error| format!("The photon-noise table could not be written: {error}"))?;
        }
        encoder
            .apply_photon_noise_parameters(&table)
            .map_err(|error| format!("The encoder cannot take a photon-noise table: {error}"))?;
    }
    drop_missing_grain_tables(&mut encoder);
    Ok(encoder)
}

/// Remove a grain option whose table is not on disk.
///
/// Only a document whose photon-noise setting was cleared reaches this — a present setting
/// writes and appends its table just above. Handing the encoder a path that cannot exist
/// fails the whole scene over a leftover option, which is how a cleaned scratch directory
/// broke the Encoded source in the first place.
fn drop_missing_grain_tables(encoder: &mut Encoder) {
    for key in crate::GRAIN_OPTION_KEYS {
        let missing = match encoder.parameters().get(key) {
            Some(CLIParameter::String { value, .. }) => !Path::new(value).exists(),
            _ => false,
        };
        if missing {
            tracing::warn!(
                target: "av1ation_engine::preview",
                key,
                "dropped a grain table the encoder document pointed at but disk does not hold"
            );
            encoder.parameters_mut().remove(key);
        }
    }
}

fn scene_arguments(
    encoder: &Encoder,
    passes: (u8, u8),
    sentinel: &Path,
    sentinel_text: &str,
    info: &andean_condor::core::input::clip_info::ClipInfo,
) -> Result<Vec<String>, String> {
    let mut arguments = Vec::new();
    let svt = matches!(encoder.base(), EncoderBase::SVTAV1);
    // Mainline SVT-AV1 writes IVF by default and recent releases no longer expose
    // `--webm`. A WebM-enabled fork must still be pinned to IVF for the run's chunk
    // reader, but only that fork has the switch to pin.
    let pins_webm = svt && encoder.parameters().contains_key("--webm");
    let mut pending = encoder
        .parameters_with_output(passes, sentinel, info)
        .map_err(|error| error.to_string())?
        .into_iter();
    while let Some(argument) = pending.next() {
        if argument == sentinel_text {
            arguments.push("-".to_owned());
            continue;
        }
        if pins_webm && (argument == "--webm" || argument.starts_with("--webm=")) {
            // A build that defaults to WebM would write Matroska to the pipe, which the
            // player cannot parse as the run's chunk. Drop the configured value; the
            // explicit one below replaces it.
            if argument == "--webm" {
                let _ = pending.next();
            }
            continue;
        }
        arguments.push(argument);
    }
    if pins_webm {
        arguments.push("--webm".to_owned());
        arguments.push("0".to_owned());
    }
    Ok(arguments)
}

/// Forward an IVF stream while making it usable from a pipe.
///
/// An IVF encoder writes a 32-byte file header with a placeholder frame count, encodes,
/// then seeks back to fill the count in. stdout is not seekable, so it writes a second copy
/// of the file header after the last frame instead. Passing that trailer to FFmpeg makes it
/// a zero-length final sample and an unreadable index. This rewrites the first header with
/// the known count, forwards only real frames, and drains the trailer.
fn pump_ivf(source: &mut impl Read, sink: &mut impl Write, frames: usize) -> std::io::Result<()> {
    let mut header = [0u8; 32];
    source.read_exact(&mut header)?;
    if &header[..4] != b"DKIF" {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "the encoder did not write an IVF stream",
        ));
    }
    let count = u32::try_from(frames).unwrap_or(u32::MAX).to_le_bytes();
    header[24..28].copy_from_slice(&count);
    sink.write_all(&header)?;

    let mut remaining = frames;
    let mut frame_header = [0u8; 12];
    while remaining > 0 {
        match source.read_exact(&mut frame_header) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(error) => return Err(error),
        }
        // The repeated file header is not a frame; it is the trailer described above.
        if &frame_header[..4] == b"DKIF" {
            break;
        }
        let size = u32::from_le_bytes([
            frame_header[0],
            frame_header[1],
            frame_header[2],
            frame_header[3],
        ]) as usize;
        if size == 0 || size > 256 * 1024 * 1024 {
            break;
        }
        sink.write_all(&frame_header)?;
        let copied = std::io::copy(&mut (&mut *source).take(size as u64), sink)?;
        if copied < size as u64 {
            break;
        }
        remaining -= 1;
    }
    // Keep the encoder's stdout moving after the requested frames; the trailer is not
    // written, but the child must still be able to finish its own write.
    std::io::copy(source, &mut std::io::sink())?;
    Ok(())
}

/// The FFmpeg invocation shared by both proxies. `-y` overwrites the caller's unique part
/// file; the service renames it into the cache only after success.
fn ffmpeg_command(ffmpeg: &str) -> Command {
    let mut command = Command::new(ffmpeg);
    hide_console(&mut command);
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-nostdin")
        .arg("-y");
    command
}

/// Which H.264 encoder writes the decoded proxy.
///
/// Both encode at the same visual quality; the choice is throughput, never the picture. What
/// they do not share is speed: neither is faster everywhere, so the choice is measured on the
/// machine and picture size at hand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProxyH264 {
    /// The GPU's fixed-function H.264 encoder.
    Nvenc,
    /// x264, the fallback for 10-bit and for machines without a usable GPU encoder.
    X264,
}

/// The browser-playable encoder used for a decoded window.
///
/// H.264 stays first: it is the fastest visual-lossless proxy on machines with a usable
/// encoder. The bundled FFmpeg is built without libx264, so a sibling `x264` executable is
/// preferred over giving up; VP9 is the fallback when neither H.264 path is installed.
#[derive(Debug, Clone, PartialEq, Eq)]
enum DecodedEncoder {
    FfmpegH264(ProxyH264),
    StandaloneX264(PathBuf),
    StandaloneVpx(PathBuf),
    FfmpegVp9,
}

/// The bit depth a Y4M header carries, read from the opened clip.
fn bit_depth_of(info: &andean_condor::core::input::clip_info::ClipInfo) -> usize {
    info.format_info.as_bit_depth().unwrap_or(8)
}

/// Calibration results, one per FFmpeg build and picture size, so a session pays for the
/// measurement once instead of before every scene.
fn encoder_choices() -> &'static Mutex<HashMap<String, ProxyH264>> {
    static CHOICES: OnceLock<Mutex<HashMap<String, ProxyH264>>> = OnceLock::new();
    CHOICES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The encoder to use for a source of this depth and size.
///
/// A static preference would be wrong on half the machines: with four cores saturated by a
/// Parallel Encoder run, NVENC was about 2.8x faster at 2160p, while on the same idle machine
/// x264 was more than twice as fast, because every frame has to cross to the GPU. So the
/// choice is measured: a handful of frames of the source's own size are encoded with each
/// option, and the GPU path is taken only if it wins by a margin. Anything that fails — no
/// GPU, an old driver, a refused profile — leaves x264, which always works. NVENC H.264 has
/// no 10-bit profile, so a 10-bit input never calibrates at all.
fn proxy_encoder(ffmpeg: &str, bit_depth: usize, resolution: (u32, u32)) -> ProxyH264 {
    if bit_depth > 8 {
        return ProxyH264::X264;
    }
    let key = format!("{ffmpeg}|{}x{}", resolution.0, resolution.1);
    let mut choices = match encoder_choices().lock() {
        Ok(choices) => choices,
        Err(poisoned) => poisoned.into_inner(),
    };
    if let Some(choice) = choices.get(&key) {
        return *choice;
    }
    let choice = calibrate_proxy(ffmpeg, resolution);
    choices.insert(key, choice);
    choice
}

/// Whether this FFmpeg build can encode with `encoder`.
///
/// The answer is cached per path: a window build asks once, and a long preview must not
/// spawn `ffmpeg -encoders` for every request. A missing or unreadable FFmpeg reports false,
/// which lets the standalone/VP9 fallbacks take over instead of selecting an encoder that
/// cannot start.
fn ffmpeg_has_encoder(ffmpeg: &str, encoder: &str) -> bool {
    static ENCODERS: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
    let cache = ENCODERS.get_or_init(|| Mutex::new(HashMap::new()));
    let key = format!("{ffmpeg}|{encoder}");
    if let Ok(cache) = cache.lock()
        && let Some(available) = cache.get(&key)
    {
        return *available;
    }
    let available = Command::new(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .is_ok_and(|output| {
            output.status.success()
                && String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .any(|line| line.split_whitespace().nth(1) == Some(encoder))
        });
    if let Ok(mut cache) = cache.lock() {
        cache.insert(key, available);
    }
    available
}

/// A standalone x264 beside the resolved FFmpeg, when the release bundles one.
fn standalone_x264(ffmpeg: &str) -> Option<PathBuf> {
    let name = if cfg!(windows) { "x264.exe" } else { "x264" };
    let candidate = Path::new(ffmpeg).parent()?.join(name);
    candidate.is_file().then_some(candidate)
}

/// A standalone vpxenc beside the resolved FFmpeg, when the release bundles one.
fn standalone_vpx(ffmpeg: &str) -> Option<PathBuf> {
    let name = if cfg!(windows) {
        "vpxenc.exe"
    } else {
        "vpxenc"
    };
    let candidate = Path::new(ffmpeg).parent()?.join(name);
    candidate.is_file().then_some(candidate)
}

fn decoded_encoder(
    ffmpeg: &str,
    bit_depth: usize,
    resolution: (u32, u32),
) -> Result<DecodedEncoder, String> {
    tracing::debug!(
        target: "av1ation_engine::preview",
        ffmpeg,
        x264 = ?standalone_x264(ffmpeg),
        vpx = ?standalone_vpx(ffmpeg),
        libx264 = ffmpeg_has_encoder(ffmpeg, "libx264"),
        libvpx = ffmpeg_has_encoder(ffmpeg, "libvpx-vp9"),
        "selecting a decoded preview encoder"
    );
    if ffmpeg_has_encoder(ffmpeg, "libx264") {
        return Ok(DecodedEncoder::FfmpegH264(proxy_encoder(
            ffmpeg, bit_depth, resolution,
        )));
    }
    if let Some(x264) = standalone_x264(ffmpeg) {
        return Ok(DecodedEncoder::StandaloneX264(x264));
    }
    if let Some(vpx) = standalone_vpx(ffmpeg) {
        return Ok(DecodedEncoder::StandaloneVpx(vpx));
    }
    if ffmpeg_has_encoder(ffmpeg, "libvpx-vp9") {
        return Ok(DecodedEncoder::FfmpegVp9);
    }
    Err("The preview needs an H.264 encoder (FFmpeg libx264 or x264) or a VP9 encoder (vpxenc or FFmpeg libvpx-vp9); install one in Settings, or use the bundled toolchain.".to_owned())
}

/// Time both encoders on the same synthetic frames and keep the faster one.
///
/// A ten percent margin keeps timer noise from flipping the choice between two sizes that are
/// effectively tied. A size of a few frames makes this cost less than the first second of the
/// proxy it configures, and `testsrc2` is not read from disk, so the number measures the
/// encoder rather than the source.
fn calibrate_proxy(ffmpeg: &str, resolution: (u32, u32)) -> ProxyH264 {
    let frames = if resolution.1 > 1440 { 3 } else { 6 };
    let Some(software) = encode_seconds(ffmpeg, resolution, frames, ProxyH264::X264) else {
        return ProxyH264::X264;
    };
    let hardware = encode_seconds(ffmpeg, resolution, frames, ProxyH264::Nvenc);
    if hardware.is_some_and(|hardware| hardware * 10 < software * 9) {
        ProxyH264::Nvenc
    } else {
        ProxyH264::X264
    }
}

/// How long one encoder takes on `frames` synthetic frames of this size, or `None` if it
/// cannot encode them at all.
fn encode_seconds(
    ffmpeg: &str,
    resolution: (u32, u32),
    frames: usize,
    encoder: ProxyH264,
) -> Option<std::time::Duration> {
    let mut command = Command::new(ffmpeg);
    hide_console(&mut command);
    command
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-f",
            "lavfi",
            "-i",
        ])
        .arg(format!(
            "testsrc2=s={}x{}:r=24:d={}",
            resolution.0, resolution.1, frames
        ))
        .args(["-frames:v"])
        .arg(frames.to_string())
        .args(["-pix_fmt", "yuv420p"]);
    add_proxy_video(&mut command, encoder);
    command
        .args(["-an", "-f", "null", "-"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let started = std::time::Instant::now();
    let status = command.status().ok()?;
    status.success().then(|| started.elapsed())
}

/// NVENC settings that match the software encoder's quality.
///
/// Constant QP, like x264's CRF, is quality-targeted instead of bitrate-targeted: the proxy
/// exists to be looked at, not to be a fixed size. A rate cap would spend bits on a still
/// frame and starve a cut.
fn nvenc_proxy_args() -> [&'static str; 10] {
    [
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p3",
        "-tune",
        "hq",
        "-rc",
        "constqp",
        "-qp",
        "18",
    ]
}

/// Visually lossless H.264 in fragmented MP4.
///
/// The browser cannot render raw YUV: a `<video>` element accepts a container and a codec,
/// not planar frames. Sending the decoded planes directly would cost about 71 MB/s at
/// 1080p 8-bit and 142 MB/s at 10-bit and would replace the native seek buffer with a custom
/// renderer. H.264 at CRF 16 is a different picture in the last bit and the same picture to
/// the eye, at a bitrate the player can hold.
///
/// A sample-exact proxy is not an option here: x264's lossless mode requires the High 4:4:4
/// profile, which on a 1080p source is about 36 MB/s. Chromium caps a `SourceBuffer` at
/// roughly 150 MB, so a six-second window (four seconds of data) filled it while the player
/// was still waiting for the first frame, and the whole Decoded source failed with a quota
/// error. The CRF keeps a window at a few megabytes, which is what makes a window seekable
/// and a second window appendable. No `-pix_fmt` is set, so an 8-bit input stays 8-bit and a
/// 10-bit input stays 10-bit.
///
/// `veryfast` is the throughput floor: 1080p runs about 47 fps, enough to stay ahead of 24
/// fps playback, where `medium` at the same CRF runs 21 fps and underruns. One-second GOPs
/// bound the wait for the first fragment and for a seek.
fn add_proxy_video(command: &mut Command, encoder: ProxyH264) {
    match encoder {
        ProxyH264::Nvenc => command.args(nvenc_proxy_args()),
        ProxyH264::X264 => command
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("veryfast")
            .arg("-crf")
            .arg("16"),
    };
    command
        .arg("-g")
        .arg("25")
        .arg("-movflags")
        .arg("+frag_keyframe+empty_moov+default_base_moof")
        .arg("-f")
        .arg("mp4");
}

/// VP9 is the fallback when the installed FFmpeg has neither H.264 encoder.
///
/// The player already parses `vp09` from the sample entry, and Chromium accepts VP9 in
/// fragmented MP4, so this keeps the route's container and cache extension unchanged.
/// Lossless mode preserves the preview's purpose: judging the source, not the proxy.
fn add_vp9_video(command: &mut Command) {
    command
        .arg("-c:v")
        .arg("libvpx-vp9")
        .arg("-lossless")
        .arg("1")
        .arg("-deadline")
        .arg("realtime")
        .arg("-cpu-used")
        .arg("8")
        .arg("-row-mt")
        .arg("1")
        .arg("-g")
        .arg("25")
        .arg("-movflags")
        .arg("+frag_keyframe+empty_moov+default_base_moof")
        .arg("-f")
        .arg("mp4");
}

/// The temporary elementary stream beside the cache file.
fn raw_path(output: &Path, extension: &str) -> PathBuf {
    let extension = extension.trim_start_matches('.');
    output.with_extension(format!("raw.{extension}"))
}

/// Kill a failed preview task and return FFmpeg's first diagnostic, if it wrote one.
fn ffmpeg_error(mut child: std::process::Child) -> String {
    let _ = child.kill();
    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(_) => return String::new(),
    };
    let detail = String::from_utf8_lossy(&output.stderr);
    detail
        .lines()
        .find(|line| !line.trim().is_empty())
        .map_or_else(String::new, |line| format!(" ({line})"))
}

fn finish_ffmpeg(child: std::process::Child, label: &str) -> Result<(), String> {
    let output = child
        .wait_with_output()
        .map_err(|error| format!("The {label} task failed: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr);
    let detail = detail
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("FFmpeg failed.");
    Err(format!("The {label} could not be muxed: {detail}"))
}

#[cfg(test)]
mod tests {
    use super::{
        DecodedEncoder, add_proxy_video, add_vp9_video, decoded_encoder, encoder_diagnostic,
        encoder_error_line, feed_stderr, prepare_encoder, raw_path,
    };
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use andean_condor::core::input::clip_info::TransferFunction;
    use serde_json::json;

    /// A 1080p SDR clip, which is what photon-noise generation is measured against.
    fn prepared(
        document: &serde_json::Value,
        temp_dir: &str,
    ) -> Result<andean_condor::models::encoder::Encoder, String> {
        prepare_encoder(
            document,
            (1920, 1080),
            TransferFunction::BT1886,
            None,
            temp_dir,
        )
    }

    fn svt_document(photon_noise: Option<u32>, grain: &str) -> serde_json::Value {
        json!({
            "SVTAV1": {
                "append_color_data": true,
                "executable": null,
                "ffmpeg_filter": null,
                "options": {
                    "crf": {"Number": {"delimiter": " ", "prefix": "--", "value": 21}},
                    "fgs-table": {"String": {"delimiter": " ", "prefix": "--", "value": grain}},
                },
                "pass": {"All": 1},
                "photon_noise": photon_noise.map(|iso| json!({
                    "c_y": null,
                    "ccb": null,
                    "ccr": null,
                    "chroma_iso": null,
                    "height": null,
                    "iso": iso,
                    "width": null,
                })),
            }
        })
    }

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("av1ation-grain-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temporary dir");
        dir
    }

    #[test]
    fn a_photon_noise_setting_gets_the_table_a_run_would_write() {
        // The scene is previewed before Parallel Encoder has run, so no table exists yet.
        // The retained document may also name one from a scratch directory that was cleaned.
        let dir = scratch("generate");
        let document = svt_document(Some(800), "C:/gone/old-table.tbl");
        let encoder = prepared(&document, dir.to_str().expect("utf-8"))
            .expect("a photon-noise encoder is prepared");
        let table = match encoder.parameters().get("fgs-table") {
            Some(andean_condor::models::encoder::cli_parameter::CLIParameter::String {
                value,
                ..
            }) => PathBuf::from(value),
            other => panic!("the encoder carries a grain table: {other:?}"),
        };
        assert!(
            table.is_file(),
            "the table the encoder is pointed at exists: {}",
            table.display()
        );
        assert_eq!(
            table.parent(),
            Some(dir.join("Parallel Encoder").as_path()),
            "it lands where Parallel Encoder writes its own"
        );
        assert!(
            !table
                .to_string_lossy()
                .replace('\\', "/")
                .contains("old-table"),
            "the stale path is replaced, not kept: {}",
            table.display()
        );
        let written = std::fs::read_to_string(&table).expect("a grain table is text");
        assert!(written.starts_with("filmgrn1"), "it is an AV1 grain table");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_cleared_photon_noise_setting_drops_its_missing_table() {
        // Reset clears the setting but leaves the option behind; encoding with it fails the
        // whole scene over a path that can never exist again.
        let dir = scratch("drop");
        let document = svt_document(None, "C:/gone/old-table.tbl");
        let encoder = prepared(&document, dir.to_str().expect("utf-8"))
            .expect("an encoder without photon noise is prepared");
        assert!(
            encoder.parameters().get("fgs-table").is_none(),
            "the leftover option is removed"
        );
        assert_eq!(
            encoder.parameters().len(),
            1,
            "every other option is untouched"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_encoder_error_prefers_the_diagnostic_over_the_banner() {
        let stderr = "Svt[info]: SVT [build] : Clang 20.1.8\n\
Svt[warn]: min-keyint was set to 0 as SCD is disabled.\r\n\
Svt[error]: SVT-AV1-Essential only supports 10-bit encoding by design\r\n\
Svt[info]: -------------------------------------------\n";
        assert_eq!(
            encoder_error_line(stderr),
            Some("Svt[error]: SVT-AV1-Essential only supports 10-bit encoding by design")
        );
    }

    #[test]
    fn a_chunk_boundary_does_not_make_a_diagnostic() {
        // A read can end in the middle of the banner; that is not an encoder failure.
        assert_eq!(encoder_diagnostic("Svt[info]:"), None);

        let mut pending = String::new();
        assert_eq!(feed_stderr(&mut pending, "Svt[error]:"), None);
        assert_eq!(
            feed_stderr(&mut pending, " only 10-bit\r\nnext"),
            Some("Svt[error]: only 10-bit".to_owned())
        );
        assert_eq!(pending, "next");
    }

    #[test]
    fn an_informational_line_is_not_a_diagnostic() {
        let stderr = "Svt[info]: SVT [build]  : Clang 20.1.8\nSvt[info]: SVT [config]: error concealment off\n";
        assert_eq!(
            encoder_error_line(stderr),
            Some("Svt[info]: SVT [config]: error concealment off")
        );
    }

    #[test]
    fn a_trailing_progress_line_is_the_fallback() {
        let stderr = "Svt[info]: SVT [build]  : Clang\nEncoding:   48/48 Frames @ 24 fps\r\n";
        assert_eq!(
            encoder_error_line(stderr),
            Some("Encoding:   48/48 Frames @ 24 fps")
        );
    }

    #[test]
    fn empty_stderr_has_no_error_line() {
        assert_eq!(encoder_error_line(" \r\n\n"), None);
    }

    #[test]
    fn a_raw_stream_stays_beside_the_cache_file() {
        let raw = raw_path(Path::new("C:/cache/decoded.mp4"), "264");
        assert_eq!(raw, Path::new("C:/cache/decoded.raw.264"));
    }

    fn arguments(encoder: super::ProxyH264) -> Vec<String> {
        let mut command = Command::new("ffmpeg");
        add_proxy_video(&mut command, encoder);
        command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect()
    }

    fn vp9_arguments() -> Vec<String> {
        let mut command = Command::new("ffmpeg");
        add_vp9_video(&mut command);
        command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn the_decoded_proxy_is_quality_targeted_and_keeps_the_source_depth() {
        for encoder in [super::ProxyH264::X264, super::ProxyH264::Nvenc] {
            let arguments = arguments(encoder);
            assert!(
                !arguments.windows(2).any(|pair| pair == ["-qp", "0"]),
                "{encoder:?} must not write a sample-exact proxy: four seconds of 1080p
                 would fill the player's SourceBuffer quota: {arguments:?}"
            );
            let quality = arguments
                .windows(2)
                .find(|pair| pair[0] == "-crf" || pair[0] == "-qp")
                .map(|pair| pair[1].clone());
            assert!(
                quality.is_some(),
                "{encoder:?} must set a quality target: {arguments:?}"
            );
            assert!(
                !arguments.iter().any(|argument| argument == "-pix_fmt"),
                "a pixel format would quantise the source's bit depth: {arguments:?}"
            );
            assert!(
                arguments.windows(2).any(|pair| pair == ["-f", "mp4"]),
                "the proxy streams in fragmented MP4: {arguments:?}"
            );
        }
    }

    #[test]
    fn a_ten_bit_source_stays_on_the_software_encoder() {
        // NVENC H.264 has no 10-bit profile, and a calibration is neither needed nor wanted.
        assert_eq!(
            super::proxy_encoder("ffmpeg", 10, (1920, 1080)),
            super::ProxyH264::X264
        );
        assert_eq!(
            super::proxy_encoder("ffmpeg", 12, (3840, 2160)),
            super::ProxyH264::X264
        );
    }

    #[test]
    fn an_unusable_ffmpeg_falls_back_to_the_software_encoder() {
        // Calibration cannot measure anything here, so it must not take the GPU path.
        assert_eq!(
            super::proxy_encoder("av1ation-no-such-ffmpeg", 8, (640, 360)),
            super::ProxyH264::X264
        );
    }

    #[test]
    fn the_vp9_fallback_is_lossless_and_fragmented() {
        let arguments = vp9_arguments();
        assert!(
            arguments
                .windows(2)
                .any(|pair| pair == ["-c:v", "libvpx-vp9"]),
            "the fallback names VP9: {arguments:?}"
        );
        assert!(
            arguments.windows(2).any(|pair| pair == ["-lossless", "1"]),
            "the fallback keeps the preview lossless: {arguments:?}"
        );
        assert!(
            arguments.windows(2).any(|pair| pair == ["-f", "mp4"]),
            "the route's MP4 cache and MediaSource append path stay unchanged: {arguments:?}"
        );
    }

    #[test]
    fn a_standalone_x264_beside_ffmpeg_is_selected_when_libx264_is_missing() {
        // The release FFmpeg is built without GPL encoders; the toolchain next to it still
        // ships x264. Selecting it by sibling path keeps H.264 the preferred preview codec.
        let dir = scratch("x264-select");
        let ffmpeg = dir.join("ffmpeg.exe");
        let x264 = dir.join(if cfg!(windows) { "x264.exe" } else { "x264" });
        std::fs::write(&ffmpeg, b"not an executable").expect("a placeholder ffmpeg");
        std::fs::write(&x264, b"not an executable").expect("a placeholder x264");
        let encoder = decoded_encoder(ffmpeg.to_str().expect("utf-8"), 8, (640, 360))
            .expect("a bundled x264 is selected");
        assert_eq!(encoder, DecodedEncoder::StandaloneX264(x264));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_standalone_vpx_is_selected_when_no_h264_exists() {
        let dir = scratch("vpx-select");
        let ffmpeg = dir.join("ffmpeg.exe");
        let vpx = dir.join(if cfg!(windows) {
            "vpxenc.exe"
        } else {
            "vpxenc"
        });
        std::fs::write(&ffmpeg, b"not an executable").expect("a placeholder ffmpeg");
        std::fs::write(&vpx, b"not an executable").expect("a placeholder vpxenc");
        let encoder = decoded_encoder(ffmpeg.to_str().expect("utf-8"), 8, (640, 360))
            .expect("a bundled vpxenc is selected");
        assert_eq!(encoder, DecodedEncoder::StandaloneVpx(vpx));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_bundled_toolchain_finds_its_x264() {
        // This is the release layout: ffmpeg and x264 are siblings under tools/bin. The
        // test skips a source checkout without staged tools rather than requiring them.
        let ffmpeg = Path::new("dist/tools/bin/ffmpeg.exe");
        let x264 = Path::new("dist/tools/bin/x264.exe");
        if !ffmpeg.is_file() || !x264.is_file() {
            return;
        }
        let encoder = decoded_encoder(ffmpeg.to_str().expect("utf-8"), 8, (640, 360))
            .expect("the bundled x264 is selected");
        assert!(
            matches!(encoder, DecodedEncoder::StandaloneX264(_)),
            "the bundled toolchain uses its x264: {encoder:?}"
        );
    }
}
