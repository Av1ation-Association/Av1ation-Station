//! Decoded-frame proxies and single-frame stills.

use super::*;

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
    let mut opened = open_input(
        input,
        context.video_path,
        context.temp_dir,
        context.condor,
        context.sequence_config,
        "Preview",
    )?;
    let frames = opened
        .clip_info()
        .map_err(|error| error.to_string())?
        .num_frames;
    write_decoded_frames(&mut opened, context, 0, frames, cancel)
}

/// Write only `[start, end)` of the decoded input.
///
/// The player normally asks for the rest of the video, so one graph is opened once and the
/// stream never has a boundary to stop at. `end` is clamped to the input's own frame count,
/// which also lets a caller request a bounded window (`end == usize::MAX` is "to the end").
/// The decoded stream is H.264 in fragmented MP4, so the element can start on the first
/// fragment instead of waiting for the whole file.
pub fn write_decoded_window(
    input: &Value,
    context: &PreviewContext<'_>,
    start: usize,
    end: usize,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let mut opened = open_input(
        input,
        context.video_path,
        context.temp_dir,
        context.condor,
        context.sequence_config,
        "Preview",
    )?;
    let total = opened
        .clip_info()
        .map_err(|error| error.to_string())?
        .num_frames;
    let end = end.min(total);
    if start >= end {
        return Err("The requested preview window starts past the end of the video.".to_owned());
    }
    write_decoded_frames(&mut opened, context, start, end, cancel)
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
    context: &PreviewContext<'_>,
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
    let encoder = decoded_encoder(context.ffmpeg, bit_depth_of(&info), info.resolution)?;
    match encoder {
        DecodedEncoder::FfmpegH264(encoder) => {
            write_decoded_ffmpeg(opened, context, header, start, end, cancel, Some(encoder))
        }
        DecodedEncoder::FfmpegVp9 => {
            write_decoded_ffmpeg(opened, context, header, start, end, cancel, None)
        }
        DecodedEncoder::StandaloneX264(x264) => {
            write_decoded_x264(opened, context, header, start, end, cancel, &x264)
        }
        DecodedEncoder::StandaloneVpx(vpx) => {
            write_decoded_vpx(opened, context, header, start, end, cancel, &vpx)
        }
    }
}

fn write_decoded_ffmpeg(
    opened: &mut CoreInput,
    context: &PreviewContext<'_>,
    header: String,
    start: usize,
    end: usize,
    cancel: &AtomicBool,
    encoder: Option<ProxyH264>,
) -> Result<(), String> {
    let mut command = ffmpeg_command(context.ffmpeg);
    command.arg("-f").arg("yuv4mpegpipe").arg("-i").arg("-");
    command.arg("-map").arg("0:v:0");
    match encoder {
        Some(encoder) => add_proxy_video(&mut command, encoder),
        None => add_vp9_video(&mut command),
    }
    command.arg(context.output);

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
    context: &PreviewContext<'_>,
    header: String,
    start: usize,
    end: usize,
    cancel: &AtomicBool,
    x264: &Path,
) -> Result<(), String> {
    let raw = raw_path(context.output, "264");
    let _ = fs::remove_file(&raw);
    let mut command = Command::new(x264);
    hide_console(&mut command);
    command
        .args(["--demuxer", "y4m", "--preset", "veryfast", "--crf", "16"])
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
    let output = child
        .wait_with_output()
        .map_err(|error| format!("The decoded preview task failed: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        let detail = detail
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("x264 failed.");
        let _ = fs::remove_file(&raw);
        return Err(format!(
            "The decoded preview could not be encoded: {detail}"
        ));
    }

    let result = mux_elementary(context, &raw, "x264");
    let _ = fs::remove_file(&raw);
    result
}

/// Encode with the bundled standalone vpxenc when neither H.264 path exists.
///
/// vpxenc writes IVF, which FFmpeg copies into the same fragmented MP4 without another
/// encode. The player names the track `vp09`, so this remains a MediaSource append rather
/// than a direct `<video>` fallback.
fn write_decoded_vpx(
    opened: &mut CoreInput,
    context: &PreviewContext<'_>,
    header: String,
    start: usize,
    end: usize,
    cancel: &AtomicBool,
    vpx: &Path,
) -> Result<(), String> {
    let count = end - start;
    let info = opened.clip_info().map_err(|error| error.to_string())?;
    let bit_depth = bit_depth_of(&info);
    let raw = raw_path(context.output, "ivf");
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
    let vpx_stdin = child
        .stdin
        .take()
        .ok_or_else(|| "vpxenc did not open a stdin for the decoded preview.".to_owned())?;
    // The bundled vpxenc is an 8-bit build. A 10-bit source is converted through FFmpeg's
    // Y4M pipe before VP9 sees it, so the fallback remains available instead of failing with
    // the encoder's "input bit depth" error.
    let (mut stdin, converter, copy) = if bit_depth > 8 {
        let mut command = ffmpeg_command(context.ffmpeg);
        command
            .args([
                "-f",
                "yuv4mpegpipe",
                "-i",
                "-",
                "-pix_fmt",
                "yuv420p",
                "-f",
                "yuv4mpegpipe",
                "-",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut converter = command
            .spawn()
            .map_err(|error| format!("FFmpeg could not convert the VP9 preview input: {error}"))?;
        let stdin = converter
            .stdin
            .take()
            .ok_or_else(|| "FFmpeg did not open a stdin for the VP9 input.".to_owned())?;
        let mut stdout = converter
            .stdout
            .take()
            .ok_or_else(|| "FFmpeg did not open a stdout for the VP9 input.".to_owned())?;
        let mut vpx_stdin = vpx_stdin;
        let copy = std::thread::spawn(move || {
            let _ = std::io::copy(&mut stdout, &mut vpx_stdin);
        });
        (stdin, Some(converter), Some(copy))
    } else {
        (vpx_stdin, None, None)
    };
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
    if let Some(converter) = converter {
        let _ = converter.wait_with_output();
    }
    if let Some(copy) = copy {
        let _ = copy.join();
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("The decoded preview task failed: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        let detail = detail
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("vpxenc failed.");
        let _ = fs::remove_file(&raw);
        return Err(format!(
            "The decoded preview could not be encoded: {detail}"
        ));
    }
    let result = mux_elementary(context, &raw, "vpxenc");
    let _ = fs::remove_file(&raw);
    result
}

fn mux_elementary(context: &PreviewContext<'_>, raw: &Path, producer: &str) -> Result<(), String> {
    let mut mux = ffmpeg_command(context.ffmpeg);
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
        .arg(context.output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let child = mux
        .spawn()
        .map_err(|error| format!("FFmpeg could not mux the {producer} preview: {error}"))?;
    finish_ffmpeg(child, "decoded preview")
}
