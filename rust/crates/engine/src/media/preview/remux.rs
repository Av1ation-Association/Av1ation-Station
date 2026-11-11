//! Copying a retained scene chunk into a fragmented MP4 for playback.

use super::*;

/// Copy one scene's retained chunk into a fragmented MP4 the player can stream.
///
/// The run already encoded this scene with the exact encoder the Encoded source exists to
/// show, so copying is both more faithful and orders of magnitude cheaper than encoding the
/// scene again. It also sidesteps a preview-only failure: a 10-bit-only encoder cannot take
/// the 8-bit frames a preview input can produce, while the chunk it wrote is valid either
/// way. `start`/`end` are the scene's frames; the count bounds the copy so a raw encoder's
/// repeated file header is never read as a sample.
pub fn remux_chunk_proxy(
    input: &Value,
    chunk: &Path,
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
        "ParallelEncoder",
    )?;
    let info = opened.clip_info().map_err(|error| error.to_string())?;
    let frames = end
        .min(info.num_frames)
        .saturating_sub(start.min(info.num_frames));
    if frames == 0 {
        return Err("The requested scene is outside the video.".to_owned());
    }
    if cancel.load(Ordering::Relaxed) {
        return Err(CANCELLED.to_owned());
    }

    // A raw elementary stream carries no timestamps, so FFmpeg would assume 25 fps and the
    // chunk would play at the wrong speed. The source's own rate is the one the run used.
    let raw = chunk
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension, "264" | "hevc" | "266"));
    let mut muxer = ffmpeg_command(context.ffmpeg);
    if raw {
        muxer.arg("-framerate").arg(format!(
            "{}/{}",
            info.frame_rate.numer(),
            info.frame_rate.denom()
        ));
    }
    muxer
        .arg("-i")
        .arg(chunk)
        .arg("-map")
        .arg("0:v:0")
        .arg("-c:v")
        .arg("copy")
        .arg("-frames:v")
        .arg(frames.to_string())
        .arg("-frag_duration")
        .arg("500000")
        .arg("-movflags")
        .arg("+frag_keyframe+empty_moov+default_base_moof")
        .arg("-f")
        .arg("mp4")
        .arg(context.output)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let child = muxer
        .spawn()
        .map_err(|error| format!("FFmpeg could not start for the encoded preview: {error}"))?;
    finish_ffmpeg(child, "encoded preview")
}
