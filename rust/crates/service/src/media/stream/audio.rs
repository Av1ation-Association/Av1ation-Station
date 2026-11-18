use super::*;
use av1ation_contracts::video::AudioTrack;
use av1ation_engine::platform::hide_console;
use std::process::Command;

/// The original source file, which owns the audio regardless of the picture source.
pub(super) async fn audio_source_path(
    state: &AppState,
    project_id: &str,
    video_id: &str,
) -> Result<PathBuf, Response> {
    source_path(state, project_id, video_id, "original").await
}

pub(crate) async fn ffmpeg(state: &AppState) -> Option<String> {
    let report = state.preflight().await;
    let check = report
        .checks
        .iter()
        .find(|check| check.available && (check.id == "ffmpeg" || check.id == "custom:ffmpeg"))?;
    if let Some(path) = &check.path {
        return Some(path.clone());
    }
    // The preflight row reports the bundled path in its detail, not in `path`; `path` is
    // reserved for a saved custom executable. Resolve the selected bundle explicitly so the
    // preview can also find the x264/vpxenc siblings beside it instead of relying on PATH.
    if check.selected_source.as_deref() == Some("bundled")
        && let Some(tools_dir) = state.tools_dir.as_deref()
    {
        return Some(
            crate::capability::toolchain::binary_path(
                tools_dir,
                av1ation_engine::capability::preflight::ToolFamily::Ffmpeg,
            )
            .to_string_lossy()
            .into_owned(),
        );
    }
    Some("ffmpeg".to_owned())
}

/// One cached, audio-only file for the selected stream.
pub(super) async fn audio_file(
    state: &AppState,
    input: &Path,
    video_id: &str,
    source: &str,
    index: u32,
) -> Result<PathBuf, Response> {
    let Some(data_dir) = state.data_dir.as_ref() else {
        return Err(error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::Io,
            "Audio track selection needs a writable app-data directory.".to_owned(),
            Some("Restart the service with a data directory.".to_owned()),
        ));
    };
    let Some(executable) = ffmpeg(state).await else {
        return Err(error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::PreflightFailed,
            "FFmpeg was not found, so another audio track cannot be prepared.".to_owned(),
            Some("Install FFmpeg or choose it in Settings.".to_owned()),
        ));
    };
    let tracks = match list_audio(&executable, input).await {
        Ok(tracks) => tracks,
        Err(message) => {
            return Err(error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::EngineFailed,
                message,
                None,
            ));
        }
    };
    if !tracks.iter().any(|track| track.index == index) {
        return Err(error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::InvalidConfig,
            format!("This file has no audio track {}.", index + 1),
            Some("Choose a track the source lists.".to_owned()),
        ));
    }
    let metadata = match tokio::fs::metadata(input).await {
        Ok(metadata) => metadata,
        Err(error) => {
            return Err(error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("{} could not be read: {error}", input.display()),
                None,
            ));
        }
    };
    let stamp = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|time| time.as_secs())
        .unwrap_or_default();
    let (extension, format) = PREVIEW_AUDIO;
    let directory = data_dir.join("cache").join("preview-audio");
    if let Err(error) = tokio::fs::create_dir_all(&directory).await {
        return Err(error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            format!("{} could not be created: {error}", directory.display()),
            None,
        ));
    }
    let output = directory.join(format!(
        "{video_id}-{source}-{index}-{}-{stamp}.{extension}",
        metadata.len()
    ));
    if output.is_file() {
        return Ok(output);
    }

    // A unique part file keeps two clicks on the same selector from writing the same
    // container concurrently; the first successful rename wins and the other is discarded.
    let part = output.with_file_name(format!(
        "{}.{}.part",
        output
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("audio"),
        uuid::Uuid::new_v4()
    ));
    let executable_for_task = executable.clone();
    let input_for_task = input.to_path_buf();
    let output_for_task = part.clone();
    let result = tokio::task::spawn_blocking(move || {
        let mut command = Command::new(&executable_for_task);
        hide_console(&mut command);
        command
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-nostdin")
            .arg("-y")
            .arg("-i")
            .arg(&input_for_task)
            .arg("-map")
            .arg(format!("0:a:{index}"))
            .arg("-vn")
            .arg("-c:a")
            .arg("aac")
            .arg("-b:a")
            .arg("192k")
            // The stream's first sample is the picture's zero: a cut keeps whatever absolute
            // timestamps the audio carried, and the element must not be asked to seek to
            // them.
            .arg("-af")
            .arg("asetpts=PTS-STARTPTS");
        // The part file ends in `.part`, so FFmpeg cannot infer a container from its name.
        // Without an explicit format the extraction always failed with "Unable to find a
        // suitable output format", which the player could only report as every track being
        // unusable. Name the container from the extension the finished file will carry.
        command.arg("-f").arg(format);
        // An MP4-family file with its index at the end forces the browser to fetch the
        // whole movie before the first audio sample; faststart moves it to the front.
        command.arg("-movflags").arg("+faststart");
        command.arg(&output_for_task).output()
    })
    .await;

    let output_result = match result {
        Ok(Ok(output)) => output,
        Ok(Err(error)) => {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(error_response(
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::EngineFailed,
                format!("FFmpeg could not prepare the audio track: {error}"),
                None,
            ));
        }
        Err(error) => {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                format!("The audio extraction task failed: {error}"),
                None,
            ));
        }
    };
    if !output_result.status.success() {
        let _ = tokio::fs::remove_file(&part).await;
        let detail = String::from_utf8_lossy(&output_result.stderr);
        let detail = detail.lines().next().unwrap_or("FFmpeg failed.").to_owned();
        return Err(error_response(
            StatusCode::UNPROCESSABLE_ENTITY,
            ErrorCode::EngineFailed,
            format!("FFmpeg could not prepare the audio track: {detail}"),
            Some(
                "The source may use an audio codec FFmpeg cannot copy. Choose another track."
                    .to_owned(),
            ),
        ));
    }
    if let Err(error) = tokio::fs::rename(&part, &output).await {
        // A concurrent request may have won the race; its file is complete too.
        if !output.is_file() {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                format!("The prepared audio file could not be stored: {error}"),
                None,
            ));
        }
    }
    Ok(output)
}

/// Ask FFmpeg to describe the container, then parse its audio streams.
///
/// FFmpeg exits non-zero when it has no output target, so the stream text is the result and
/// the exit status only distinguishes a readable header from an unreadable file.
pub(super) async fn list_audio(executable: &str, input: &Path) -> Result<Vec<AudioTrack>, String> {
    let executable = executable.to_owned();
    let input = input.to_path_buf();
    let output = tokio::task::spawn_blocking(move || {
        let mut command = Command::new(executable);
        command
            .arg("-hide_banner")
            .arg("-nostdin")
            .arg("-i")
            .arg(&input);
        hide_console(&mut command);
        command.output()
    })
    .await
    .map_err(|error| format!("The FFmpeg probe task failed: {error}"))?
    .map_err(|error| format!("FFmpeg could not be started: {error}"))?;

    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let tracks = parse_audio_streams(&text);
    // FFmpeg exits non-zero when it has no output target even for a readable file. A file
    // with a video stream but no audio is a valid empty list; a file with no stream lines at
    // all is an unreadable container and must say so instead of claiming it is silent.
    if tracks.is_empty() && !text.contains("Stream #") {
        return Err("FFmpeg could not read this file's streams.".to_owned());
    }
    Ok(tracks)
}

/// Parse FFmpeg's `Stream #0:N(lang): Audio: codec, ...` lines.
pub(super) fn parse_audio_streams(text: &str) -> Vec<AudioTrack> {
    let mut tracks = Vec::new();
    for line in text.lines() {
        let Some(rest) = line.split_once(": Audio: ").map(|(_, rest)| rest) else {
            continue;
        };
        let Some(stream) = line.find("Stream #0:").map(|at| &line[at + 10..]) else {
            continue;
        };
        let language = stream
            .split_once('(')
            .and_then(|(_, rest)| rest.split_once(')'))
            .map(|(value, _)| value.trim().to_owned())
            .filter(|value| !value.is_empty() && value != "und");
        let mut parts = rest.split(',');
        let codec = parts
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                value
                    .split_whitespace()
                    .next()
                    .unwrap_or(value)
                    .to_lowercase()
            });
        let tail: String = parts.collect::<Vec<_>>().join(",");
        let channels = channels_of(&tail);
        let default = line.contains("(default)");
        let mut label = format!("Audio {}", tracks.len() + 1);
        if let Some(language) = &language {
            label.push_str(" · ");
            label.push_str(&language.to_ascii_uppercase());
        }
        if let Some(codec) = &codec {
            label.push_str(" · ");
            label.push_str(&codec.to_ascii_uppercase());
        }
        if let Some(channels) = channels {
            label.push_str(" · ");
            label.push_str(channel_label(channels));
        }
        if default {
            label.push_str(" · default");
        }
        tracks.push(AudioTrack {
            index: u32::try_from(tracks.len()).unwrap_or(u32::MAX),
            label,
            language,
            codec,
            channels,
            default,
        });
    }
    tracks
}

pub(super) fn channels_of(tail: &str) -> Option<u32> {
    let lowered = tail.to_ascii_lowercase();
    if lowered.contains("mono") {
        return Some(1);
    }
    if lowered.contains("stereo") || lowered.contains("2 channels") {
        return Some(2);
    }
    if lowered.contains("5.1") {
        return Some(6);
    }
    if lowered.contains("7.1") {
        return Some(8);
    }
    lowered.split(',').find_map(|part| {
        let count = part.trim().strip_suffix(" channels")?;
        count.trim().parse::<u32>().ok().filter(|count| *count > 0)
    })
}

pub(super) fn channel_label(channels: u32) -> &'static str {
    match channels {
        1 => "mono",
        2 => "stereo",
        6 => "5.1",
        8 => "7.1",
        _ => "multi-channel",
    }
}
