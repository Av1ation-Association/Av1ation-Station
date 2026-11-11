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
    let mut command = ffmpeg_command(context.ffmpeg);
    command.arg("-f").arg("yuv4mpegpipe").arg("-i").arg("-");
    command.arg("-map").arg("0:v:0");
    add_proxy_video(
        &mut command,
        proxy_encoder(context.ffmpeg, bit_depth_of(&info), info.resolution),
    );
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
