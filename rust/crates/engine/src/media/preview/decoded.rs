//! Decoded-frame proxies and single-frame stills.

use super::*;

/// An opened decode graph, kept for the windows one preview plays.
///
/// Opening the Parallel Encoder's input is the expensive part of a preview: it materialises
/// a script, imports the generated module, and builds an FFMS2 or VapourSynth graph. A
/// window used to pay that cost again at every two-second seam, which put graph construction
/// on the playback path. A session opens once and writes each requested range through the
/// same graph, so consecutive windows share the decoder the player is already watching.
pub struct DecodedSession {
    opened: CoreInput,
    total_frames: usize,
}

/// The input-side values a [`DecodedSession`] needs; each window supplies its own output.
pub struct DecodeContext<'a> {
    /// The source file this video was queued with.
    pub video_path: &'a str,
    /// The video's scratch directory, where the generated script module is written.
    pub temp_dir: &'a str,
    /// The persisted engine checkpoint, for script scene data.
    pub condor: Option<&'a Value>,
    /// The video's effective sequence document, for `condor_sequence_config`.
    pub sequence_config: &'a Value,
}

impl DecodedSession {
    /// Open the input once for a player that will ask for several windows.
    pub fn open(input: &Value, context: &DecodeContext<'_>) -> Result<Self, String> {
        let mut opened = open_input(
            input,
            context.video_path,
            context.temp_dir,
            context.condor,
            context.sequence_config,
            "Preview",
        )?;
        let total_frames = opened
            .clip_info()
            .map_err(|error| error.to_string())?
            .num_frames;
        Ok(Self {
            opened,
            total_frames,
        })
    }

    /// The input's own frame count, as the opened graph reports it.
    pub fn total_frames(&self) -> usize {
        self.total_frames
    }

    /// Write `[start, end)` through this session's graph.
    ///
    /// `end` is clamped to the graph's frame count, which also makes `usize::MAX` mean the
    /// rest of the video. The decoded stream is H.264 in fragmented MP4, so the element can
    /// start on the first fragment instead of waiting for the whole window.
    pub fn write_window(
        &mut self,
        ffmpeg: &str,
        output: &Path,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        let end = end.min(self.total_frames);
        if start >= end {
            return Err(
                "The requested preview window starts past the end of the video.".to_owned(),
            );
        }
        write_decoded_frames(
            &mut self.opened,
            DecodedOutput { ffmpeg, output },
            start,
            end,
            cancel,
        )
    }
}

/// The encoder executable and output path one window is written through.
///
/// Every frame loop inside a window writes to the same pair, and grouping them keeps each
/// writer's arguments about the frames rather than about two constant paths.
#[derive(Clone, Copy)]
struct DecodedOutput<'a> {
    ffmpeg: &'a str,
    output: &'a Path,
}

/// Write a decoded proxy: the input's frames in a browser codec.
///
/// The proxy carries no audio. A browser attaches it through MediaSource, which refuses a
/// segment whose index names a track the `SourceBuffer` does not hold; the player plays the
/// source's own audio from a separate element, so a second track here would only break it.
/// `input` is the exact engine document the Parallel Encoder would open.
pub fn write_decoded_proxy(
    input: &Value,
    context: &PreviewContext<'_>,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let decode = DecodeContext {
        video_path: context.video_path,
        temp_dir: context.temp_dir,
        condor: context.condor,
        sequence_config: context.sequence_config,
    };
    let mut session = DecodedSession::open(input, &decode)?;
    let frames = session.total_frames();
    session.write_window(context.ffmpeg, context.output, 0, frames, cancel)
}

/// The one PNG a scrub shows; it costs a frame decode, not a video encode.
///
/// PNG rather than JPEG because the still is the *reference* picture the user compares
/// against: a lossy still would put compression artefacts in the frame they are inspecting.
/// A 10-bit input becomes a 16-bit PNG, so the still keeps the same sample depth as the
/// stream.
///
/// `width` is for a thumbnail, not for the reference still. A scene rail draws the frame at
/// 44 px and a timeline block at under a hundred, so decoding and sending a full 4K PNG for
/// each would spend megabytes on a picture that is then scaled down by the browser. The
/// height follows the source's aspect ratio so the picture is never distorted.
pub fn write_frame_png(
    input: &Value,
    context: &FrameContext<'_>,
    frame: usize,
    width: Option<u32>,
) -> Result<Vec<u8>, String> {
    let mut opened = open_input(
        input,
        context.video_path,
        context.temp_dir,
        context.condor,
        context.sequence_config,
        "Preview",
    )?;
    let info = opened.clip_info().map_err(|error| error.to_string())?;
    let bit_depth = info.format_info.as_bit_depth().unwrap_or(8);
    if frame >= info.num_frames {
        return Err(format!(
            "Frame {frame} is outside a {}-frame input.",
            info.num_frames
        ));
    }
    let header = opened
        .y4m_header(Some(1))
        .map_err(|error| error.to_string())?;
    let picture = opened
        .y4m_frame(frame)
        .map_err(|error| format!("Frame {frame} could not be decoded: {error}"))?;

    let mut command = ffmpeg_command(context.ffmpeg);
    command
        .arg("-f")
        .arg("yuv4mpegpipe")
        .arg("-i")
        .arg("-")
        .arg("-frames:v")
        .arg("1");
    if let Some(width) = width {
        // `-2` keeps the height even for a chroma-subsampled output. A thumbnail is not
        // compared pixel-for-pixel, so the faster bilinear kernel is the right trade.
        command
            .arg("-vf")
            .arg(format!("scale={width}:-2:flags=bilinear"))
            .arg("-compression_level")
            .arg("6");
    }
    command
        .arg("-c:v")
        .arg("png")
        .arg("-pix_fmt")
        .arg(if bit_depth > 8 { "rgb48be" } else { "rgb24" })
        .arg("-f")
        .arg("image2pipe")
        .arg("pipe:1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("FFmpeg could not start for the frame: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "FFmpeg did not open a stdin for the frame.".to_owned())?;
    let written = stdin
        .write_all(header.as_bytes())
        .and_then(|()| stdin.write_all(picture.get_ref()));
    drop(stdin);
    let output = child
        .wait_with_output()
        .map_err(|error| format!("The frame task failed: {error}"))?;
    written.map_err(|error| format!("The frame could not be written: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        let detail = detail
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("FFmpeg failed.");
        return Err(format!("The frame could not be rendered: {detail}"));
    }
    if output.stdout.is_empty() {
        return Err("FFmpeg rendered an empty frame.".to_owned());
    }
    Ok(output.stdout)
}

/// The frame loop shared by the whole-video and window decoders.
fn write_decoded_frames(
    opened: &mut CoreInput,
    target: DecodedOutput<'_>,
    start: usize,
    end: usize,
    cancel: &AtomicBool,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err(CANCELLED.to_owned());
    }
    let count = end - start;
    let info = opened.clip_info().map_err(|error| error.to_string())?;
    let header = opened
        .y4m_header(Some(count))
        .map_err(|error| error.to_string())?;
    let bit_depth = bit_depth_of(&info);
    let encoder = decoded_encoder(target.ffmpeg, bit_depth)?;
    match encoder {
        DecodedEncoder::FfmpegH264 => {
            write_decoded_ffmpeg(opened, target, header, start, end, cancel, add_h264_video)
        }
        DecodedEncoder::FfmpegVp9 => {
            write_decoded_ffmpeg(opened, target, header, start, end, cancel, add_vp9_video)
        }
        DecodedEncoder::StandaloneX264(x264) => {
            write_decoded_x264(opened, target, header, start..end, cancel, &x264, bit_depth)
        }
        DecodedEncoder::StandaloneVpx(vpx) => {
            write_decoded_vpx(opened, target, header, start, end, cancel, &vpx)
        }
    }
}

fn write_decoded_ffmpeg(
    opened: &mut CoreInput,
    target: DecodedOutput<'_>,
    header: String,
    start: usize,
    end: usize,
    cancel: &AtomicBool,
    add_video: fn(&mut Command),
) -> Result<(), String> {
    let mut command = ffmpeg_command(target.ffmpeg);
    command.arg("-f").arg("yuv4mpegpipe").arg("-i").arg("-");
    command.arg("-map").arg("0:v:0");
    add_video(&mut command);
    command.arg(target.output);

    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("FFmpeg could not start for the decoded preview: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "FFmpeg did not open a stdin for the decoded preview.".to_owned())?;
    if let Err(error) = stdin.write_all(header.as_bytes()) {
        drop(stdin);
        return Err(format!(
            "The decoded preview stopped before its first frame: {error}{}",
            ffmpeg_error(child)
        ));
    }
    for index in start..end {
        if cancel.load(Ordering::Relaxed) {
            drop(stdin);
            let _ = child.kill();
            let _ = child.wait();
            return Err(CANCELLED.to_owned());
        }
        let frame = opened
            .y4m_frame(index)
            .map_err(|error| format!("Frame {index} could not be decoded: {error}"))?;
        if let Err(error) = stdin.write_all(frame.get_ref()) {
            drop(stdin);
            return Err(format!(
                "The decoded preview stopped at frame {index}: {error}{}",
                ffmpeg_error(child)
            ));
        }
    }
    drop(stdin);
    finish_ffmpeg(child, "decoded preview")
}

/// Encode with the bundled standalone x264 when FFmpeg was built without libx264.
///
/// x264 writes an elementary H.264 stream; FFmpeg then muxes it into the same fragmented
/// MP4 the route serves, without re-encoding. This path is slower than a pipe from FFmpeg
/// because the whole window is encoded before muxing, but it is the only H.264 option in the
/// bundled toolchain, and H.264 remains the most widely accepted preview codec.
fn write_decoded_x264(
    opened: &mut CoreInput,
    target: DecodedOutput<'_>,
    header: String,
    range: std::ops::Range<usize>,
    cancel: &AtomicBool,
    x264: &Path,
    bit_depth: usize,
) -> Result<(), String> {
    let raw = raw_path(target.output, "264");
    let _ = fs::remove_file(&raw);
    let mut command = Command::new(x264);
    hide_console(&mut command);
    command
        .args(["--demuxer", "y4m", "--preset", "ultrafast", "--qp", "0"])
        .arg("--output-depth")
        .arg(bit_depth.to_string())
        .arg("--output")
        .arg(&raw)
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("x264 could not start for the decoded preview: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "x264 did not open a stdin for the decoded preview.".to_owned())?;
    if let Err(error) = stdin.write_all(header.as_bytes()) {
        drop(stdin);
        let _ = fs::remove_file(&raw);
        return Err(format!(
            "The decoded preview stopped before its first frame: {error}{}",
            ffmpeg_error(child)
        ));
    }
    for index in range {
        if cancel.load(Ordering::Relaxed) {
            drop(stdin);
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_file(&raw);
            return Err(CANCELLED.to_owned());
        }
        let frame = opened
            .y4m_frame(index)
            .map_err(|error| format!("Frame {index} could not be decoded: {error}"))?;
        if let Err(error) = stdin.write_all(frame.get_ref()) {
            drop(stdin);
            let _ = fs::remove_file(&raw);
            return Err(format!(
                "The decoded preview stopped at frame {index}: {error}{}",
                ffmpeg_error(child)
            ));
        }
    }
    drop(stdin);
    let finished = child
        .wait_with_output()
        .map_err(|error| format!("The decoded preview task failed: {error}"))?;
    if !finished.status.success() {
        let detail = String::from_utf8_lossy(&finished.stderr);
        let detail = detail
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("x264 failed.");
        let _ = fs::remove_file(&raw);
        return Err(format!(
            "The decoded preview could not be encoded: {detail}"
        ));
    }

    let result = mux_elementary(target, &raw, "x264");
    let _ = fs::remove_file(&raw);
    result
}

/// Encode with the bundled standalone vpxenc when neither H.264 path exists.
///
/// The bundled vpxenc is an 8-bit build, so this path is selected only for an 8-bit input.
/// vpxenc writes IVF, which FFmpeg copies into the same fragmented MP4 without another
/// encode. The player names the track `vp09`, so this remains a MediaSource append rather
/// than a direct `<video>` fallback.
fn write_decoded_vpx(
    opened: &mut CoreInput,
    target: DecodedOutput<'_>,
    header: String,
    start: usize,
    end: usize,
    cancel: &AtomicBool,
    vpx: &Path,
) -> Result<(), String> {
    let count = end - start;
    let info = opened.clip_info().map_err(|error| error.to_string())?;
    if bit_depth_of(&info) > 8 {
        return Err("The VP9 preview fallback is 8-bit only.".to_owned());
    }
    let raw = raw_path(target.output, "ivf");
    let _ = fs::remove_file(&raw);
    let mut command = Command::new(vpx);
    hide_console(&mut command);
    command
        .args([
            "--codec=vp9",
            "--ivf",
            "--passes=1",
            "--good",
            "--cpu-used=5",
            "--end-usage=q",
            "--cq-level=0",
            "--lossless=1",
            "--kf-max-dist=25",
            "--quiet",
        ])
        .arg(format!("--limit={count}"))
        .arg("-o")
        .arg(&raw)
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("vpxenc could not start for the decoded preview: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "vpxenc did not open a stdin for the decoded preview.".to_owned())?;
    if let Err(error) = stdin.write_all(header.as_bytes()) {
        drop(stdin);
        let _ = fs::remove_file(&raw);
        return Err(format!(
            "The decoded preview stopped before its first frame: {error}{}",
            ffmpeg_error(child)
        ));
    }
    for index in start..end {
        if cancel.load(Ordering::Relaxed) {
            drop(stdin);
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_file(&raw);
            return Err(CANCELLED.to_owned());
        }
        let frame = opened
            .y4m_frame(index)
            .map_err(|error| format!("Frame {index} could not be decoded: {error}"))?;
        if let Err(error) = stdin.write_all(frame.get_ref()) {
            drop(stdin);
            let _ = fs::remove_file(&raw);
            return Err(format!(
                "The decoded preview stopped at frame {index}: {error}{}",
                ffmpeg_error(child)
            ));
        }
    }
    drop(stdin);
    let finished = child
        .wait_with_output()
        .map_err(|error| format!("The decoded preview task failed: {error}"))?;
    if !finished.status.success() {
        let detail = String::from_utf8_lossy(&finished.stderr);
        let detail = detail
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("vpxenc failed.");
        let _ = fs::remove_file(&raw);
        return Err(format!(
            "The decoded preview could not be encoded: {detail}"
        ));
    }
    let result = mux_elementary(target, &raw, "vpxenc");
    let _ = fs::remove_file(&raw);
    result
}

fn mux_elementary(target: DecodedOutput<'_>, raw: &Path, producer: &str) -> Result<(), String> {
    let mut mux = ffmpeg_command(target.ffmpeg);
    mux.arg("-i")
        .arg(raw)
        .arg("-map")
        .arg("0:v:0")
        .arg("-c:v")
        .arg("copy")
        .arg("-movflags")
        .arg("+frag_keyframe+empty_moov+default_base_moof")
        .arg("-f")
        .arg("mp4")
        .arg(target.output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let child = mux
        .spawn()
        .map_err(|error| format!("FFmpeg could not mux the {producer} preview: {error}"))?;
    finish_ffmpeg(child, "decoded preview")
}
