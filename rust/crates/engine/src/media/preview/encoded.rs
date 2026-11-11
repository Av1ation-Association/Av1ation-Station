//! Browser-playable encodes produced with the run's own encoder executable and parameters.

use super::*;

use crate::platform::hide_console;

/// Write an encoded proxy: the Parallel Encoder's own executable and parameters on the
/// decoded frames, remuxed for the browser.
///
/// Like the decoded proxy it is video only, because MediaSource appends a single track into
/// a single `SourceBuffer`; the player takes the source's audio from its own element.
pub fn write_encoded_proxy(
    input: &Value,
    encoder: &Value,
    context: &PreviewContext<'_>,
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
    let frames = info.num_frames;
    let encoder = prepared_encoder(encoder, &info, context.temp_dir)?;

    let raw = raw_path(context.output, encoder.output_extension());
    let _ = fs::remove_file(&raw);
    let (progress_tx, progress_rx) = std::sync::mpsc::channel();
    let drain = std::thread::spawn(move || {
        // The engine reports progress while its encoder runs; the preview has no progress
        // channel of its own, but a dropped receiver would make those sends fail.
        while progress_rx.recv().is_ok() {}
    });
    let result = encoder.encode_with_input(&mut opened, &raw, 0, frames, progress_tx);
    let _ = drain.join();
    if let Err(error) = result {
        let _ = fs::remove_file(&raw);
        return Err(format!(
            "The encoder could not produce the preview: {error}"
        ));
    }
    if !raw.is_file() {
        return Err("The encoder finished without writing a preview stream.".to_owned());
    }

    // Do not name the elementary stream's format. An SVT-AV1 build with WebM IO writes
    // Matroska to a `.ivf` path, so the extension lies; FFmpeg's probe reads the bytes and
    // handles IVF, Annex-B, and Matroska alike. The bitstream is copied rather than
    // re-encoded: a second generation would no longer be the encoder's own output.
    let mut command = ffmpeg_command(context.ffmpeg);
    command.arg("-i").arg(&raw);
    command.arg("-map").arg("0:v:0");
    command.arg("-c:v").arg("copy");
    command
        .arg("-frag_duration")
        .arg("500000")
        .arg("-movflags")
        .arg("+frag_keyframe+empty_moov+default_base_moof")
        .arg("-f")
        .arg("mp4");
    command.arg(context.output);

    let child = match command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_file(&raw);
            return Err(format!(
                "FFmpeg could not start for the encoded preview: {error}"
            ));
        }
    };
    let result = finish_ffmpeg(child, "encoded preview");
    let _ = fs::remove_file(&raw);
    result
}

/// Open one engine input with the same per-run script data the runner injects.
/// The encoded preview of one scene, produced by the exact encoder the run would use.
///
/// The encoder writes its elementary stream to stdout instead of an IVF file. FFmpeg
/// copies that bitstream into fragmented MP4, so what the player sees is the encoder's own
/// output rather than a second-generation approximation, and the first fragment can be
/// served while the rest of the scene is still encoding. Frames start at the scene's first
/// frame because rate control and keyframe placement depend on the frames before the
/// requested one.
pub fn write_scene_encoded_proxy(
    input: &Value,
    encoder: &Value,
    context: &PreviewContext<'_>,
    start_frame: usize,
    end_frame: usize,
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
    let start = start_frame.min(info.num_frames);
    let end = end_frame.min(info.num_frames);
    if start >= end {
        return Err("The requested scene is outside the video.".to_owned());
    }
    if cancel.load(Ordering::Relaxed) {
        return Err(CANCELLED.to_owned());
    }
    let encoder = prepared_encoder(encoder, &info, context.temp_dir)?;

    // The same argument list the Parallel Encoder builds for its final pass. The output
    // path is a sentinel this function replaces with stdout; every other option, including
    // colour metadata and the scene's quantizer/speed, is untouched.
    let passes = encoder.total_passes().max(1);
    let sentinel = context.output.with_extension("encoder-stream");
    let sentinel_text = sentinel.to_string_lossy().to_string();
    let arguments = scene_arguments(&encoder, (passes, passes), &sentinel, &sentinel_text, &info);
    // Resolve the frame header before any child exists, so a failed header leaves no
    // process behind waiting on a pipe nobody will close.
    let header = opened
        .y4m_header(Some(end - start))
        .map_err(|error| error.to_string())?;

    let mut producer = Command::new(encoder.executable());
    producer
        .args(&arguments)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut producer);
    let mut producer = producer
        .spawn()
        .map_err(|error| format!("The encoder could not start for the preview: {error}"))?;
    // An encoder for a 1080p scene takes every core it can get, and the preview is only
    // useful while the picture it is being compared against still plays. A preview build is
    // therefore idle priority: below normal still won a share of every core, which showed up
    // as dropped and frozen frames while the next scene was built. At idle the decoder that
    // is presenting the picture keeps the CPU and the encoder uses only what is left;
    // scheduling only, so the bitstream is untouched and this is still the chunk the run
    // would produce.
    below_normal_priority(&producer);
    let stream = producer
        .stdout
        .take()
        .ok_or_else(|| "The encoder did not open stdout for the preview.".to_owned())?;
    let errors = producer.stderr.take();
    // An unread stderr pipe fills after a few kilobytes and stalls the encoder. The same
    // thread watches for a diagnostic while the encoder is still running: a build that
    // refuses this input (a 10-bit-only executable given 8-bit frames, for example) keeps
    // consuming frames after it reports the error, so waiting for exit would leave the
    // player loading for the length of the whole scene.
    let failure: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let stderr = {
        let failure = Arc::clone(&failure);
        std::thread::spawn(move || {
            let mut text = String::new();
            if let Some(mut errors) = errors {
                let mut buffer = [0u8; 4096];
                // A read can stop in the middle of a line, so only lines whose terminator
                // has arrived are checked; the fragment waits for the next read.
                let mut pending = String::new();
                loop {
                    match errors.read(&mut buffer) {
                        Ok(0) | Err(_) => break,
                        Ok(read) => {
                            let chunk = String::from_utf8_lossy(&buffer[..read]);
                            if let Some(message) = feed_stderr(&mut pending, &chunk)
                                && let Ok(mut slot) = failure.lock()
                                && slot.is_none()
                            {
                                *slot = Some(message);
                            }
                            text.push_str(&chunk);
                            // Progress lines are long and frequent; keep only recent text.
                            if text.len() > 64 * 1024 {
                                text.drain(..32 * 1024);
                            }
                        }
                    }
                }
            }
            text
        })
    };

    let mut muxer = ffmpeg_command(context.ffmpeg);
    muxer.arg("-i").arg("pipe:0");
    muxer.arg("-map").arg("0:v:0");
    // Copy, never transcode: a second encode would not be the chunk the run produces.
    muxer.arg("-c:v").arg("copy");
    // A pipe has no seek target, so the encoder may repeat its file header after the last
    // frame instead of rewinding to fill in the count. Bound the output at the scenes own
    // frame count so that trailer is never read as a zero-length final sample.
    muxer.arg("-frames:v").arg((end - start).to_string());
    // The run disables scene change detection and sets one keyframe per chunk, so keyframe
    // fragmentation would hold the whole scene until its last frame. A time bound releases
    // a fragment every half second, which is what lets the player start on the first one.
    muxer.arg("-frag_duration").arg("500000");
    muxer
        .arg("-movflags")
        .arg("+frag_keyframe+empty_moov+default_base_moof")
        .arg("-f")
        .arg("mp4")
        .arg(context.output)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut muxer = muxer
        .spawn()
        .map_err(|error| format!("FFmpeg could not start for the encoded preview: {error}"))?;
    // Pump the encoder's stdout in this process instead of handing a raw child handle to
    // FFmpeg, so the muxer's stdin closes deterministically when the encoder ends. An
    // IVF encoder on a pipe cannot seek back to fill in the frame count, so it repeats its
    // file header at the end; [`pump_ivf`] rewrites the count and stops at that trailer.
    let mut muxer_stdin = muxer
        .stdin
        .take()
        .ok_or_else(|| "FFmpeg did not open stdin for the encoded preview.".to_owned())?;
    let ivf = matches!(
        encoder.base(),
        EncoderBase::AOM
            | EncoderBase::RAV1E
            | EncoderBase::VPX
            | EncoderBase::SVTAV1
            | EncoderBase::AVM
    );
    let scene_frames = end - start;
    let copy = std::thread::spawn(move || {
        let mut stream = stream;
        if ivf {
            let _ = pump_ivf(&mut stream, &mut muxer_stdin, scene_frames);
        } else {
            let _ = std::io::copy(&mut stream, &mut muxer_stdin);
        }
    });

    let mut stdin = producer
        .stdin
        .take()
        .ok_or_else(|| "The encoder did not open stdin for the preview.".to_owned())?;
    let stop = |producer: &mut std::process::Child, muxer: &mut std::process::Child| {
        let _ = producer.kill();
        let _ = muxer.kill();
        let _ = producer.wait();
        let _ = muxer.wait();
    };
    if cancel.load(Ordering::Relaxed) {
        drop(stdin);
        stop(&mut producer, &mut muxer);
        let _ = copy.join();
        let _ = stderr.join();
        return Err(CANCELLED.to_owned());
    }
    let fed = (|| -> Result<(), String> {
        stdin
            .write_all(header.as_bytes())
            .map_err(|error| format!("The encoder stopped before its first frame: {error}"))?;
        for index in start..end {
            if cancel.load(Ordering::Relaxed) {
                return Err(CANCELLED.to_owned());
            }
            if let Some(message) = encoder_failure(&failure) {
                return Err(message);
            }
            let frame = opened
                .y4m_frame(index)
                .map_err(|error| format!("Frame {index} could not be decoded: {error}"))?;
            stdin.write_all(frame.get_ref()).map_err(|error| {
                // A broken pipe is the symptom; the encoder's own diagnostic is the
                // reason, when it managed to write one.
                encoder_failure(&failure)
                    .unwrap_or_else(|| format!("The encoder stopped at frame {index}: {error}"))
            })?;
        }
        Ok(())
    })();
    drop(stdin);
    if let Err(message) = fed {
        // A dead or refusing encoder cannot finish the scene; stop the muxer rather than
        // waiting for it to drain a stream that will never arrive.
        stop(&mut producer, &mut muxer);
        let _ = copy.join();
        let _ = stderr.join();
        return Err(message);
    }

    let status = producer
        .wait()
        .map_err(|error| format!("The encoder process failed: {error}"))?;
    let _ = copy.join();
    let encoder_errors = stderr.join().unwrap_or_default();
    let muxed = finish_ffmpeg(muxer, "encoded preview");
    if !status.success() {
        let detail =
            encoder_error_line(&encoder_errors).unwrap_or("the encoder exited with an error");
        return Err(format!(
            "The encoder could not produce the scene preview: {detail}"
        ));
    }
    muxed
}
