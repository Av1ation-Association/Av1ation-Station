use super::*;
use axum::body::Bytes;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

/// A browser-playable proxy for the Decoded or Encoded source.
///
/// `Decoded` renders only the window the playhead asked for. `Encoded` renders only the
/// scene the frame belongs to, from that scene's first frame, with the scene's own encoder
/// document. The cache is keyed by the engine's proxy recipe, the source file's size and
/// modification time, the resolved encoder, and the frame range, so re-pointing a video at
/// a different file or changing the proxy pipeline cannot reuse a stale picture.
///
/// The build is returned, not awaited: the caller streams the fragmented or live file
/// while it is still being written.
pub(crate) async fn preview_proxy(
    state: &AppState,
    project_id: &str,
    video_id: &str,
    request: PreviewRequest,
    from_original: bool,
) -> Result<PreparedPreview, Response> {
    let Some(videos) = state.videos() else {
        return Err(error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::Io,
            "The video store is not available.".to_owned(),
            Some("Restart the service with a writable app-data directory.".to_owned()),
        ));
    };
    let record = match videos.record(project_id, video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => {
            return Err(error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("No video matches `{video_id}`."),
                None,
            ));
        }
        Err(error) => {
            return Err(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                error.to_string(),
                None,
            ));
        }
    };
    // An encoded preview is one scene's chunk, not the concatenated output: it must start
    // at the scene's first frame so its rate control matches the run. The finished file is
    // never a substitute, so there is no shortcut for it here.
    let Some(data_dir) = state.data_dir.as_ref() else {
        return Err(error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::Io,
            "Preview preparation needs a writable app-data directory.".to_owned(),
            Some("Restart the service with a data directory.".to_owned()),
        ));
    };
    let Some(projects) = state.projects() else {
        return Err(error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::Io,
            "The project store is not available.".to_owned(),
            None,
        ));
    };
    let project = match projects.document(project_id).await {
        Ok(Some(project)) => project,
        Ok(None) => {
            return Err(error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("No project matches `{project_id}`."),
                None,
            ));
        }
        Err(error) => {
            return Err(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                error.to_string(),
                None,
            ));
        }
    };
    let video_path = record.input_path();
    let input = preview_input(&project, &record, from_original);
    let Some(input) = input else {
        return Err(error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            "This video has no input to preview.".to_owned(),
            Some("Choose a source in Configuration → General.".to_owned()),
        ));
    };
    // Resolve the request to a frame range and, for an encoded preview, the exact encoder
    // document the Parallel Encoder would use for that scene.
    let mut retained: Option<PathBuf> = None;
    let (start, end, encoder, label) = match request {
        PreviewRequest::Decoded { start, frames } => {
            let (start, end, label) = decoded_span(start, frames);
            (start, end, None, label)
        }
        PreviewRequest::Encoded { scene, frame } => {
            let Some((index, document)) = scene_at(&record, scene, frame) else {
                return Err(error_response(
                    StatusCode::NOT_FOUND,
                    ErrorCode::NotFound,
                    "No scene contains that frame.".to_owned(),
                    Some("Run scene detection before previewing encoded frames.".to_owned()),
                ));
            };
            let scene_start = document
                .get("start_frame")
                .and_then(serde_json::Value::as_u64)
                .and_then(|frame| usize::try_from(frame).ok())
                .unwrap_or(0);
            let scene_end = document
                .get("end_frame")
                .and_then(serde_json::Value::as_u64)
                .and_then(|frame| usize::try_from(frame).ok())
                .unwrap_or(0);
            if scene_end <= scene_start {
                return Err(error_response(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    ErrorCode::InvalidConfig,
                    format!("Scene {} has no frames to preview.", index + 1),
                    Some("Re-run scene detection or inspect the scene's range.".to_owned()),
                ));
            }
            // The scene's own encoder already carries the quantizer and speed Target
            // Quality and Speed Scaling chose; the project's encoder is only a fallback
            // for a checkpoint that omitted it. The scene table fingerprints the same
            // resolution, so the URL's token and this file name cannot disagree about
            // which document produced the chunk.
            let materialised = config::materialise(&default_config(), &project, &record.overrides);
            let encoder =
                crate::project::derive::effective_encoder(document, materialised.get("encoder"))
                    .cloned();
            let Some(encoder) = encoder else {
                return Err(error_response(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    ErrorCode::InvalidConfig,
                    "This video has no encoder for an encoded preview.".to_owned(),
                    Some("Choose an encoder in Configuration → Encoding.".to_owned()),
                ));
            };
            // The run's own chunk is the exact picture this source exists to show. When it
            // is on disk, copy it instead of spending a full scene encode on a preview that
            // could differ from what was written.
            let chunks = videos
                .chunk_files(video_id, record.temp_directory.as_deref())
                .await;
            if let Some(name) = VideoStore::chunk_file(&chunks, index) {
                retained = Some(
                    videos
                        .chunk_directory(video_id, record.temp_directory.as_deref())
                        .join(name),
                );
            }
            (
                scene_start,
                scene_end,
                Some(encoder),
                format!("encoded-scene-{index}"),
            )
        }
    };

    let source_metadata = match tokio::fs::metadata(&video_path).await {
        Ok(metadata) => metadata,
        Err(error) => {
            return Err(error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("{video_path} could not be read: {error}"),
                Some("The file may have been moved since the video was queued.".to_owned()),
            ));
        }
    };
    let stamp = source_metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|time| time.as_secs())
        .unwrap_or_default();
    // The engine's recipe is the cache format's version: it names every input that changes
    // the produced picture, so a second hand-bumped number cannot drift from the args.
    // The source identity, deliberately without the frame range: every window of one input
    // opens the same decode graph, and the session pool keys on exactly this. Appending the
    // range here would give every window its own session and rebuild the graph at every
    // seam, which is the cost the session exists to remove.
    let mut identity = format!(
        "{}:{}:{}:{}",
        av1ation_engine::media::preview::PROXY_RECIPE,
        project_id,
        video_id,
        source_metadata.len()
    );
    identity.push_str(&format!(":{stamp}"));
    identity.push_str(&serde_json::to_string(&input).unwrap_or_default());
    // The decode graph is chosen by the input and the scene table, never by the encoder.
    // Every scene of one video carries its own encoder document — Target Quality and Speed
    // Scaling change its quantizer — but all of them read the same input, so keying the
    // graph on the encoder would open one per scene. This prefix is the identity the
    // Encoded sessions key on; the cache identity appends the encoder to it below.
    let mut decode_identity = identity.clone();
    if let Some(encoder) = &encoder {
        identity.push_str(&serde_json::to_string(encoder).unwrap_or_default());
    }
    // Both derived sources decode through the script, whose output can depend on each
    // scene's `sequence_data` and the user's pairs. The table is part of the picture's
    // identity, so a change must not be answered from a window built under the old one.
    let scene_table = format!(
        ":scenes:{}",
        crate::project::derive::scene_fingerprint(
            record.condor.as_ref(),
            &record.custom_scene_data
        )
    );
    identity.push_str(&scene_table);
    decode_identity.push_str(&scene_table);
    if let Some(chunk) = &retained
        && let Ok(metadata) = tokio::fs::metadata(chunk).await
    {
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|time| time.as_secs())
            .unwrap_or_default();
        identity.push_str(&format!(
            ":chunk:{}:{}:{modified}",
            chunk.display(),
            metadata.len()
        ));
    }
    let session_digest = crate::platform::hash::fnv1a(identity.as_bytes());
    let decode_digest = crate::platform::hash::fnv1a(decode_identity.as_bytes());
    // One cache file is one range, so the cache key adds it to the same identity.
    let fingerprint = format!("{identity}:{label}:{start}:{end}");
    let digest = crate::platform::hash::fnv1a(fingerprint.as_bytes());
    let directory = data_dir.join("cache").join("preview");
    if let Err(error) = tokio::fs::create_dir_all(&directory).await {
        return Err(error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            format!("{} could not be created: {error}", directory.display()),
            None,
        ));
    }
    let output = directory.join(format!("{video_id}-{label}-{digest:016x}.mp4"));
    if output.is_file() {
        return Ok(PreparedPreview::Ready(output));
    }
    // Every Decoded window is a lossless file of tens to hundreds of megabytes, so the
    // cache needs a ceiling. Sweeping before the build means the file this request is about
    // to write is never a candidate.
    if let Err(error) = trim_preview_cache(&directory, &output).await {
        tracing::warn!(
            target: "av1ation_service::preview",
            message = %error,
            "preview cache could not be trimmed"
        );
    }
    let Some(executable) = ffmpeg(state).await else {
        return Err(error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::PreflightFailed,
            "FFmpeg was not found, so the preview cannot be prepared.".to_owned(),
            Some("Install FFmpeg or choose it in Settings.".to_owned()),
        ));
    };
    let temp_dir = videos
        .chunk_directory(video_id, record.temp_directory.as_deref())
        .display()
        .to_string();
    let condor = av1ation_engine::script::data::attach_custom_scene_data(
        record.condor.as_ref(),
        &record.custom_scene_data,
    );
    // A script opened for the preview reads the same document the run would.
    let sequence_config = {
        let mut document = config::materialise(&default_config(), &project, &record.overrides);
        config::inherit_sequence_inputs(&mut document, &record.input_path());
        document
            .get("sequences")
            .cloned()
            .unwrap_or(serde_json::Value::Null)
    };

    // A retained chunk is already the scene the run wrote. Copying it into a fragmented MP4
    // is a remux, not an encode: the picture is the run's own bitstream, the cost is a few
    // hundred milliseconds, and it works even when the scene's encoder cannot take the
    // preview input (a 10-bit-only build given 8-bit frames is the case that failed). If the
    // copy fails for any reason, the ordinary encoder build below is still the fallback.
    if let Some(chunk) = &retained {
        let part = output.with_file_name(format!(
            "{}.{}.part",
            output
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("preview"),
            uuid::Uuid::new_v4()
        ));
        let writer = state.preview_writer();
        let task = {
            let input = input.clone();
            let ffmpeg = executable.clone();
            let part = part.clone();
            let chunk = chunk.clone();
            let condor = condor.clone();
            let sequence_config = sequence_config.clone();
            let video_path = video_path.clone();
            let temp_dir = temp_dir.clone();
            tokio::task::spawn_blocking(move || {
                let context = av1ation_engine::media::preview::PreviewContext {
                    video_path: &video_path,
                    temp_dir: &temp_dir,
                    condor: condor.as_ref(),
                    sequence_config: &sequence_config,
                    ffmpeg: &ffmpeg,
                    output: &part,
                };
                let cancel = AtomicBool::new(false);
                writer.remux_chunk(&input, &chunk, &context, start, end, &cancel)
            })
            .await
        };
        match task {
            Ok(Ok(())) => {
                if !output.is_file() {
                    let _ = tokio::fs::rename(&part, &output).await;
                }
                let _ = tokio::fs::remove_file(&part).await;
                if output.is_file() {
                    tracing::info!(
                        target: "av1ation_service::preview",
                        kind = "encoded",
                        start,
                        end,
                        "preview copied the retained chunk"
                    );
                    return Ok(PreparedPreview::Ready(output));
                }
            }
            Ok(Err(message)) => tracing::warn!(
                target: "av1ation_service::preview",
                start,
                end,
                message = %message,
                "the retained chunk could not be copied; encoding the scene instead"
            ),
            Err(error) => tracing::warn!(
                target: "av1ation_service::preview",
                message = %error,
                "the retained chunk task failed; encoding the scene instead"
            ),
        }
        let _ = tokio::fs::remove_file(&part).await;
    }

    // A second request for the same picture follows the running build instead of starting
    // a duplicate decode. The first request owns the unique part file; the rename that
    // publishes it is the only way a later request sees a cache hit.
    let (build, started) = state.preview_builds().claim(&output, || {
        output.with_file_name(format!(
            "{}.{}.part",
            output
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("preview"),
            uuid::Uuid::new_v4()
        ))
    });
    // Every proxy is fragmented. Waiting for the first fragment keeps a failed encoder inside
    // the route's first-byte window; it also covers the standalone x264 path, which writes an
    // elementary stream before FFmpeg muxes the first fragment.
    let build = build.wait_for_fragment();
    if !started {
        return Ok(PreparedPreview::Building(build));
    }
    let part = build.part().to_path_buf();
    let cancel = Arc::clone(build.cancel());
    let writer = state.preview_writer();
    // A Decoded window is written through the one decode graph this preview's cache identity
    // owns. The graph is opened on the session's own thread, so consecutive windows do not
    // rebuild a script or an FFMS2/VapourSynth graph at every seam. An Encoded build reuses
    // the idle graph for the same input and writes its own scene's encoder through it; when
    // that graph is busy it opens a transient one, so a warm and the append still overlap.
    let decoders = state.preview_decoders().clone();
    let session_key = format!("decoded:{video_id}:{session_digest:016x}");
    let scene_decoders = state.preview_scene_decoders().clone();
    let scene_key = format!("encoded:{video_id}:{decode_digest:016x}");
    let decoded_input = matches!(request, PreviewRequest::Decoded { .. }).then(|| DecoderInput {
        input: input.clone(),
        video_path: video_path.clone(),
        temp_dir: temp_dir.clone(),
        condor: condor.clone(),
        sequence_config: sequence_config.clone(),
    });
    let ffmpeg = executable.clone();
    let input_for_task = input.clone();
    let encoder_for_task = encoder.clone();
    let output_for_task = output.clone();
    let job_output = output.clone();
    let part_for_task = part.clone();
    let builds = state.preview_builds().clone();
    tokio::task::spawn_blocking(move || {
        let started = std::time::Instant::now();
        let kind = if encoder_for_task.is_some() {
            "encoded"
        } else {
            "decoded"
        };
        tracing::info!(
            target: "av1ation_service::preview",
            kind,
            start,
            end,
            "preview build started"
        );
        let mut completion = FinishOnDrop {
            builds,
            output: job_output,
            part: part_for_task.clone(),
            result: None,
        };
        let context = av1ation_engine::media::preview::PreviewContext {
            video_path: &video_path,
            temp_dir: &temp_dir,
            condor: condor.as_ref(),
            sequence_config: &sequence_config,
            ffmpeg: &ffmpeg,
            output: &part_for_task,
        };
        let result = match request {
            PreviewRequest::Decoded { .. } => match decoded_input {
                Some(input) => decoders.write_window(
                    &session_key,
                    Arc::clone(&writer),
                    input,
                    WindowRequest {
                        ffmpeg: ffmpeg.clone(),
                        output: part_for_task.clone(),
                        start,
                        end,
                        cancel: Arc::clone(&cancel),
                    },
                ),
                None => Err("This preview has no decoded input.".to_owned()),
            },
            PreviewRequest::Encoded { .. } => {
                let encoder = encoder_for_task
                    .as_ref()
                    .unwrap_or(&serde_json::Value::Null);
                scene_decoders.write_scene(
                    &scene_key,
                    Arc::clone(&writer),
                    SceneBuild {
                        input: &input_for_task,
                        encoder,
                        context: &context,
                        start,
                        end,
                        cancel: &cancel,
                    },
                )
            }
        };
        let bytes = std::fs::metadata(&part_for_task)
            .map(|metadata| metadata.len())
            .unwrap_or_default();
        // The blocking task owns the rename: a viewer streaming the part keeps a valid
        // handle across it, and no request ever observes a half-written cache file.
        let result = match result {
            Ok(()) => {
                if let Err(error) = std::fs::rename(&part_for_task, &output_for_task) {
                    let _ = std::fs::remove_file(&part_for_task);
                    if output_for_task.is_file() {
                        Ok(())
                    } else {
                        Err(format!("The preview could not be stored: {error}"))
                    }
                } else {
                    Ok(())
                }
            }
            Err(message) => {
                let _ = std::fs::remove_file(&part_for_task);
                Err(message)
            }
        };
        let elapsed_ms = started.elapsed().as_millis();
        match &result {
            Ok(()) => tracing::info!(
                target: "av1ation_service::preview",
                kind,
                start,
                end,
                elapsed_ms,
                bytes,
                "preview build finished"
            ),
            Err(message) => tracing::warn!(
                target: "av1ation_service::preview",
                kind,
                start,
                end,
                elapsed_ms,
                message = %message,
                "preview build failed"
            ),
        }
        completion.result = Some(result);
    });
    Ok(PreparedPreview::Building(build))
}

/// How much preview cache the service keeps before deleting the oldest finished files.
///
/// About sixty of the two-second 1080p 10-bit lossless windows measured at 25-32 MiB each,
/// or dozens of scene chunks. Lossless video costs 13-16 MB per second of source on these
/// projects, so an unbounded directory grows by gigabytes during one review.
pub(crate) const PREVIEW_CACHE_BUDGET_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// Delete the oldest finished previews until the directory is back under its budget.
///
/// Partial files are never touched: one belongs to a build another request may be
/// streaming, and it is not yet a replayable window. A file being served by this process
/// fails to delete on Windows and is skipped rather than counted as removed.
pub(crate) async fn trim_preview_cache(directory: &Path, keep: &Path) -> std::io::Result<u64> {
    trim_preview_cache_with(directory, keep, PREVIEW_CACHE_BUDGET_BYTES).await
}

/// The budget-explicit form, so a test does not have to write two gigabytes.
pub(crate) async fn trim_preview_cache_with(
    directory: &Path,
    keep: &Path,
    budget: u64,
) -> std::io::Result<u64> {
    let mut files = Vec::new();
    let mut total = 0_u64;
    let mut entries = tokio::fs::read_dir(directory).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("mp4") {
            continue;
        }
        let Ok(metadata) = entry.metadata().await else {
            continue;
        };
        // The file this request is about to write counts against the budget but is never a
        // candidate for deletion.
        total += metadata.len();
        if path != keep {
            files.push((metadata.modified().ok(), metadata.len(), path));
        }
    }
    if total <= budget {
        return Ok(0);
    }
    files.sort_by_key(|(modified, _, _)| *modified);
    let mut removed = 0;
    for (_, bytes, path) in files {
        if total <= budget {
            break;
        }
        if tokio::fs::remove_file(&path).await.is_ok() {
            total = total.saturating_sub(bytes);
            removed += 1;
        }
    }
    Ok(removed)
}

/// The frame span one decoded request covers.
///
/// An absent `frames` is the rest of the video: playback must not stop at every window
/// boundary and rebuild the decode, which is what a bounded window forced. `end` is left
/// saturated here and clamped to the input's frame count when it is opened.
pub(crate) fn decoded_span(start: usize, frames: Option<usize>) -> (usize, usize, String) {
    match frames {
        Some(count) => (
            start,
            start.saturating_add(count),
            format!("decoded-{start}-{count}"),
        ),
        None => (start, usize::MAX, format!("decoded-{start}-end")),
    }
}

/// The scene a preview request addresses, by index or by the frame containing it.
///
/// An index is what the player sends; a frame is accepted for callers that only know the
/// playhead. A frame at or past the last scene's end resolves to that scene, because the
/// playhead is allowed to sit on the exclusive end of the timeline.
pub(crate) fn scene_at(
    record: &crate::project::videos::VideoRecord,
    scene: Option<usize>,
    frame: usize,
) -> Option<(usize, &serde_json::Value)> {
    let scenes = record.condor.as_ref()?.get("scenes")?.as_array()?;
    if let Some(index) = scene {
        return scenes.get(index).map(|document| (index, document));
    }
    let edge = |document: &serde_json::Value, key: &str| {
        document
            .get(key)
            .and_then(serde_json::Value::as_u64)
            .and_then(|frame| usize::try_from(frame).ok())
            .unwrap_or(0)
    };
    scenes
        .iter()
        .enumerate()
        .find(|(_, document)| {
            frame >= edge(document, "start_frame") && frame < edge(document, "end_frame")
        })
        .or_else(|| {
            let last = scenes.len().checked_sub(1)?;
            (frame >= edge(&scenes[last], "start_frame")).then_some((last, &scenes[last]))
        })
}

/// Serve a fragmented or live media file while its build is still writing it.
///
/// A whole-video proxy can take as long as an encode, and a fragmented MP4 is decodable
/// from its first fragment. The response is therefore the growing part file
/// as a chunked body with no length: the element starts on the first fragment and seeks
/// within what it has buffered. A request whose range starts past zero cannot be answered
/// exactly from a growing file, so it waits for the finished cache file and then uses
/// ordinary byte-range delivery. Browsers open a media element at byte zero, so the common
/// path streams.
pub(crate) async fn serve_building(build: PreviewBuild, headers: &HeaderMap) -> Response {
    let requested = std::time::Instant::now();
    if matches!(range_intent(headers), RangeIntent::Elsewhere) {
        return match build.wait().await {
            Ok(path) => serve_file(&path, headers).await,
            Err(message) => preview_error(message),
        };
    }

    // An immediate failure (an encoder that refuses the source, a missing executable) must
    // still arrive as the route's structured refusal rather than an empty body, so the wait
    // is for real media and not for the muxer's own header. A short scene that finishes
    // inside the window is served from the cache in one piece.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
    loop {
        if build.has_first_fragment().await {
            break;
        }
        if build.result().is_some() {
            return match build.wait().await {
                Ok(path) => serve_file(&path, headers).await,
                Err(message) => preview_error(message),
            };
        }
        if tokio::time::Instant::now() >= deadline {
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }

    tracing::info!(
        target: "av1ation_service::preview",
        first_byte_ms = requested.elapsed().as_millis(),
        "preview stream opened"
    );
    let content_type = build.content_type();
    let (chunks, receiver) = mpsc::channel(4);
    tokio::spawn(tail_part(build, chunks));
    let mut response = Response::new(Body::from_stream(ReceiverStream::new(receiver)));
    *response.status_mut() = StatusCode::OK;
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// The bytes of a growing proxy scanned while waiting for its first fragment.
///
/// A fragmented MP4 carries its index in a few kilobytes of `moov`, so the first `moof`
/// starts well inside this window. A proxy whose header is larger than that simply falls
/// through the route's timeout and streams as it did before the wait existed.
pub(crate) const FRAGMENT_SCAN_BYTES: u64 = 256 * 1024;

/// Whether the growing file already contains a complete media fragment.
pub(crate) async fn has_media_fragment(path: &Path) -> bool {
    let Ok(file) = tokio::fs::File::open(path).await else {
        return false;
    };
    let mut head = Vec::new();
    if file
        .take(FRAGMENT_SCAN_BYTES)
        .read_to_end(&mut head)
        .await
        .is_err()
    {
        return false;
    }
    has_moof(&head)
}

/// Whether the box tree in `bytes` contains a complete top-level `moof`.
///
/// The scan walks box sizes instead of searching for the four characters, because the
/// bitstream inside `mdat` is arbitrary bytes and may contain them. A fragment that is still
/// arriving is not a match: the next poll reads a longer prefix.
pub(crate) fn has_moof(bytes: &[u8]) -> bool {
    let mut at = 0usize;
    while at + 8 <= bytes.len() {
        let size = u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
        let kind = &bytes[at + 4..at + 8];
        let (header, length) = if size == 1 {
            if at + 16 > bytes.len() {
                return false;
            }
            let low = u32::from_be_bytes([
                bytes[at + 12],
                bytes[at + 13],
                bytes[at + 14],
                bytes[at + 15],
            ]);
            (16usize, low as usize)
        } else if size == 0 {
            // "To the end of the file": a growing file has no such box, and no later box
            // can be located without its length.
            return false;
        } else {
            (8usize, size as usize)
        };
        if length < header {
            return false;
        }
        let Some(end) = at.checked_add(length) else {
            return false;
        };
        if end > bytes.len() {
            return false;
        }
        if kind == b"moof" {
            return true;
        }
        at = end;
    }
    false
}

/// Copy a growing proxy into the response body until the build ends.
///
/// The part file is opened once and read at the current offset. A read that returns zero
/// while the build still runs is a temporary end, not the end of the media, so the loop
/// waits and reads again. A build that fails ends the body with an error rather than a clean
/// close: a clean close is indistinguishable from a finished scene, so the player would show
/// a picture that simply stops.
pub(crate) async fn tail_part(
    build: PreviewBuild,
    chunks: mpsc::Sender<Result<Bytes, std::io::Error>>,
) {
    let part = build.part().to_path_buf();
    let mut offset = 0u64;
    let mut file: Option<tokio::fs::File> = None;
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        if file.is_none() {
            // A short build can publish its finished file before the body's first open. The
            // part path then no longer exists, so follow the published file instead of
            // returning an empty body.
            let path = if part.is_file() {
                part.as_path()
            } else if build.result().is_some() {
                build.output()
            } else {
                part.as_path()
            };
            if let Ok(mut opened) = tokio::fs::File::open(path).await
                && opened.seek(SeekFrom::Start(offset)).await.is_ok()
            {
                file = Some(opened);
            }
        }
        let mut copied = false;
        if let Some(active) = file.as_mut() {
            match active.read(&mut buffer).await {
                Ok(0) => {}
                Ok(bytes) => {
                    offset += bytes as u64;
                    if chunks
                        .send(Ok(Bytes::copy_from_slice(&buffer[..bytes])))
                        .await
                        .is_err()
                    {
                        // The element closed the connection; the build keeps filling the
                        // cache for the next open.
                        return;
                    }
                    copied = true;
                }
                Err(_) => {}
            }
        }
        if copied {
            continue;
        }
        match build.result() {
            Some(Ok(())) => return,
            Some(Err(message)) => {
                // The reason travels with the error for the service log; the browser only
                // learns that the body broke, which is what turns a frozen picture into the
                // player's failure notice.
                let _ = chunks.send(Err(std::io::Error::other(message))).await;
                return;
            }
            None => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    }
}
/// What a media request asked to read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RangeIntent {
    /// No range header: the whole resource.
    Whole,
    /// A range that begins at byte zero, open-ended or not.
    FromStart,
    /// Any other range, which needs a finished file to answer exactly.
    Elsewhere,
}

/// Classify the request's range without validating it against a length.
///
/// A growing file has no final length, so only a range that starts at zero can be answered
/// from it. A bounded start-at-zero range is streamed as if it were open-ended: a media
/// element that asks for a prefix is probing the container, and returning `200` with the
/// stream satisfies it, while cutting the body at the requested byte would make the element
/// start over. Every other range (a seek, a suffix) waits for the finished file and reuses
/// the normal range validator and its `416` handling.
pub(crate) fn range_intent(headers: &HeaderMap) -> RangeIntent {
    let Some(value) = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
    else {
        return RangeIntent::Whole;
    };
    let Some((start, _end)) = value
        .strip_prefix("bytes=")
        .and_then(|rest| rest.split_once('-'))
    else {
        return RangeIntent::Elsewhere;
    };
    if start.trim() == "0" {
        RangeIntent::FromStart
    } else {
        RangeIntent::Elsewhere
    }
}

/// The structured refusal for a proxy that could not be prepared.
pub(crate) fn preview_error(message: String) -> Response {
    error_response(
        StatusCode::UNPROCESSABLE_ENTITY,
        ErrorCode::EngineFailed,
        message,
        Some(
            "The source or encoder may not support a preview. Check that the input opens and the encoder is available."
                .to_owned(),
        ),
    )
}

/// Whether a path is an existing file, without failing a request when it is not.
pub(crate) async fn finished_file(path: &Path) -> bool {
    tokio::fs::metadata(path)
        .await
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}
