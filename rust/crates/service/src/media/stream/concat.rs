//! Source inventory for the concatenation workbench.
//!
//! The workbench maps streams by the selected muxer's own key. mkvmerge numbers tracks from
//! `--identify`; FFmpeg numbers them by source stream index. The two namespaces are
//! independent, so nothing here derives one from the other, and an attachment is never given
//! a key borrowed from a track.
//!
//! Parsers are pure functions over captured output, so CI needs neither executable.

use std::path::{Path, PathBuf};
use std::process::Command;

use av1ation_contracts::video::{
    ConcatChapter, ConcatInventory, ConcatInventoryRequest, ConcatMetadataEntry, ConcatMethodName,
    ConcatSourceAttachment, ConcatSourceInfo, ConcatSourceTrack, ConcatTrackKind,
};
use av1ation_engine::platform::hide_console;
use axum::{
    Json,
    extract::{Path as AxumPath, State},
    response::{IntoResponse, Response},
};
use serde_json::Value;

use super::{audio_source_path, channel_label, channels_of, ffmpeg};
use crate::api::json::ApiJson;
use crate::state::AppState;

/// One probe result before the method is attached to it.
#[derive(Debug, Default)]
pub(crate) struct ParsedConcat {
    pub tracks: Vec<ConcatSourceTrack>,
    pub attachments: Vec<ConcatSourceAttachment>,
    pub data_stream_count: u32,
    pub chapter_count: Option<u32>,
}

fn kind_label(kind: ConcatTrackKind) -> &'static str {
    match kind {
        ConcatTrackKind::Video => "Video",
        ConcatTrackKind::Audio => "Audio",
        ConcatTrackKind::Subtitle => "Subtitle",
    }
}

fn ordinal(kind: ConcatTrackKind, counts: &mut [usize; 3]) -> usize {
    let slot = match kind {
        ConcatTrackKind::Video => 0,
        ConcatTrackKind::Audio => 1,
        ConcatTrackKind::Subtitle => 2,
    };
    counts[slot] += 1;
    counts[slot]
}

fn track_label(
    kind: ConcatTrackKind,
    ordinal: usize,
    language: Option<&str>,
    codec: Option<&str>,
    channels: Option<u32>,
    default: bool,
    forced: bool,
) -> String {
    let mut label = format!("{} {ordinal}", kind_label(kind));
    if let Some(language) = language {
        label.push_str(" · ");
        label.push_str(&language.to_ascii_uppercase());
    }
    if let Some(codec) = codec {
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
    if forced {
        label.push_str(" · forced");
    }
    label
}

fn language_of(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "und")
        .map(str::to_owned)
}

/// Parse `mkvmerge --identify --identification-format json` output.
///
/// Track keys are the document's `id` values, not their positions. A source attachment is
/// never selectable: mkvmerge numbers tracks and attachments separately, so one numeric key
/// can name both, and the engine's single map cannot carry two meanings.
pub(crate) fn parse_mkvmerge_identify(text: &str) -> Result<ParsedConcat, String> {
    let document: Value = serde_json::from_str(text)
        .map_err(|error| format!("mkvmerge did not return identification JSON: {error}"))?;
    let mut counts = [0usize; 3];
    let mut parsed = ParsedConcat::default();

    for track in document
        .get("tracks")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
    {
        let kind = match track.get("type").and_then(Value::as_str) {
            Some("video") => ConcatTrackKind::Video,
            Some("audio") => ConcatTrackKind::Audio,
            Some("subtitles") => ConcatTrackKind::Subtitle,
            // Buttons and unknown track types have no concatenation entry in the engine.
            _ => continue,
        };
        let Some(key) = track
            .get("id")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
        else {
            continue;
        };
        let properties = track.get("properties");
        let language = language_of(properties.and_then(|value| value.get("language")));
        let name = properties
            .and_then(|value| value.get("track_name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        let codec = track
            .get("codec")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        let channels = properties
            .and_then(|value| value.get("audio_channels"))
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .filter(|value| *value > 0);
        let default = properties
            .and_then(|value| value.get("default_track"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let forced = properties
            .and_then(|value| value.get("forced_track"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let position = ordinal(kind, &mut counts);
        let label = track_label(
            kind,
            position,
            language.as_deref(),
            codec.as_deref(),
            channels,
            default,
            forced,
        );
        parsed.tracks.push(ConcatSourceTrack {
            key,
            kind,
            label,
            codec,
            language,
            name,
            channels,
            default,
            forced,
        });
    }

    for attachment in document
        .get("attachments")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
    {
        let Some(key) = attachment
            .get("id")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
        else {
            continue;
        };
        let label = attachment
            .get("file_name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| format!("Attachment {key}"));
        parsed.attachments.push(ConcatSourceAttachment {
            key,
            label,
            mime_type: attachment
                .get("content_type")
                .and_then(Value::as_str)
                .map(str::to_owned),
            description: attachment
                .get("description")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned),
            size_bytes: attachment.get("size").and_then(Value::as_u64),
            // See the doc comment: mkvmerge keys collide across the two namespaces.
            selectable: false,
        });
    }

    parsed.chapter_count = document
        .get("chapters")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok());
    Ok(parsed)
}

/// Parse FFmpeg's stream listing into source tracks, attachments, and data-stream counts.
///
/// FFmpeg's key is the global source stream index from `Stream #0:N`. A subtitle at index 2
/// stays key 2 even when it is the first subtitle.
pub(crate) fn parse_ffmpeg_inventory(text: &str) -> ParsedConcat {
    let lines: Vec<&str> = text.lines().collect();
    let mut counts = [0usize; 3];
    let mut parsed = ParsedConcat::default();
    let mut chapters = 0u32;
    let mut index = 0usize;

    while index < lines.len() {
        let line = lines[index];
        if line.trim_start().starts_with("Chapter #0:") {
            chapters += 1;
            index += 1;
            continue;
        }
        let Some(at) = line.find("Stream #0:") else {
            index += 1;
            continue;
        };
        let rest = &line[at + 10..];
        let Some(colon) = rest.find(':') else {
            index += 1;
            continue;
        };
        let head = &rest[..colon];
        let Some(key) = head
            .split('(')
            .next()
            .map(str::trim)
            .and_then(|value| value.parse::<u32>().ok())
        else {
            index += 1;
            continue;
        };
        let language = head
            .split_once('(')
            .and_then(|(_, tail)| tail.split_once(')'))
            .map(|(value, _)| value.trim())
            .filter(|value| !value.is_empty() && *value != "und")
            .map(str::to_owned);
        let after = &rest[colon + 1..];
        let default = line.contains("(default)");
        let forced = line.contains("(forced)");

        let kind = if let Some(detail) = after.strip_prefix(" Video: ") {
            Some((ConcatTrackKind::Video, detail))
        } else if let Some(detail) = after.strip_prefix(" Audio: ") {
            Some((ConcatTrackKind::Audio, detail))
        } else {
            after
                .strip_prefix(" Subtitle: ")
                .map(|detail| (ConcatTrackKind::Subtitle, detail))
        };

        if let Some((kind, detail)) = kind {
            let first = detail.split(',').next().unwrap_or(detail).trim();
            let codec = first
                .split_whitespace()
                .next()
                .filter(|value| !value.is_empty())
                .map(str::to_lowercase);
            let channels = if kind == ConcatTrackKind::Audio {
                channels_of(detail)
            } else {
                None
            };
            let position = ordinal(kind, &mut counts);
            let label = track_label(
                kind,
                position,
                language.as_deref(),
                codec.as_deref(),
                channels,
                default,
                forced,
            );
            parsed.tracks.push(ConcatSourceTrack {
                key,
                kind,
                label,
                codec,
                language,
                name: None,
                channels,
                default,
                forced,
            });
        } else if after.starts_with(" Attachment: ") {
            // FFmpeg writes the attachment's own metadata on the indented lines that follow.
            let mut label = format!("Attachment {key}");
            let mut mime_type = None;
            let mut cursor = index + 1;
            while cursor < lines.len() && !lines[cursor].contains("Stream #") {
                let entry = lines[cursor].trim();
                if let Some(value) = entry.strip_prefix("filename")
                    && let Some(value) = value.split_once(':').map(|(_, value)| value.trim())
                    && !value.is_empty()
                {
                    label = value.to_owned();
                } else if let Some(value) = entry.strip_prefix("mimetype")
                    && let Some(value) = value.split_once(':').map(|(_, value)| value.trim())
                    && !value.is_empty()
                {
                    mime_type = Some(value.to_owned());
                }
                cursor += 1;
            }
            parsed.attachments.push(ConcatSourceAttachment {
                key,
                label,
                mime_type,
                description: None,
                size_bytes: None,
                selectable: true,
            });
        } else if after.starts_with(" Data: ") {
            parsed.data_stream_count = parsed.data_stream_count.saturating_add(1);
        }
        index += 1;
    }

    parsed.chapter_count = if chapters > 0 { Some(chapters) } else { None };
    parsed
}

/// Parse the chapter entries FFmpeg prints for a source, including any titles.
///
/// This is deliberately separate from the stream inventory: the chapter sheet is a
/// read-only convenience and must not make the track-map probe depend on chapter detail.
pub(crate) fn parse_ffmpeg_chapters(text: &str) -> Vec<ConcatChapter> {
    let lines: Vec<&str> = text.lines().collect();
    let mut chapters = Vec::new();
    for (line_index, line) in lines.iter().enumerate() {
        let Some(rest) = line.trim_start().strip_prefix("Chapter #0:") else {
            continue;
        };
        let Some((position, fields)) = rest.split_once(':') else {
            continue;
        };
        let Ok(index) = position.trim().parse::<u32>() else {
            continue;
        };
        let Some(start) = fields
            .split_once("start ")
            .and_then(|(_, value)| value.split(',').next())
            .and_then(|value| value.trim().parse::<f64>().ok())
        else {
            continue;
        };
        let end = fields
            .split_once("end ")
            .and_then(|(_, value)| value.split(',').next())
            .and_then(|value| value.trim().parse::<f64>().ok());
        let mut title = None;
        for next in lines.iter().skip(line_index + 1) {
            let trimmed = next.trim_start();
            if trimmed.starts_with("Chapter #") || next.contains("Stream #") {
                break;
            }
            if let Some((key, value)) = trimmed.split_once(':')
                && key.trim() == "title"
            {
                let value = value.trim();
                if !value.is_empty() {
                    title = Some(value.to_owned());
                }
                break;
            }
        }
        chapters.push(ConcatChapter {
            index,
            title,
            start_seconds: start,
            end_seconds: end,
        });
    }
    chapters
}

/// Parse the input-level metadata FFmpeg prints for a source.
///
/// Stream and chapter metadata stays out: the copy setting affects the container's global
/// tags, while per-track statistics are not tags the output can copy as a block.
pub(crate) fn parse_ffmpeg_metadata(text: &str) -> Vec<ConcatMetadataEntry> {
    let lines: Vec<&str> = text.lines().collect();
    let Some(input) = lines.iter().position(|line| line.contains("Input #0")) else {
        return Vec::new();
    };
    let mut entries = Vec::new();
    let mut header_indent = None;
    for line in lines.iter().skip(input + 1) {
        let trimmed = line.trim_start();
        let indent = line.len() - trimmed.len();
        match header_indent {
            None => {
                if trimmed.starts_with("Duration:")
                    || trimmed.starts_with("Stream #")
                    || trimmed.starts_with("Chapters:")
                {
                    break;
                }
                if trimmed == "Metadata:" {
                    header_indent = Some(indent);
                }
            }
            Some(header) => {
                if trimmed.is_empty() {
                    continue;
                }
                if indent <= header {
                    break;
                }
                let Some((key, value)) = trimmed.split_once(':') else {
                    continue;
                };
                let key = key.trim();
                let value = value.trim();
                if !key.is_empty() && !value.is_empty() {
                    entries.push(ConcatMetadataEntry {
                        key: key.to_owned(),
                        value: value.to_owned(),
                    });
                }
            }
        }
    }
    entries
}

async fn mkvmerge(state: &AppState) -> Option<String> {
    let report = state.preflight().await;
    report
        .checks
        .iter()
        .find(|check| check.available && (check.id == "mkvmerge" || check.id == "custom:mkvmerge"))
        .map(|check| check.path.clone().unwrap_or_else(|| "mkvmerge".to_owned()))
}

fn first_line(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("it produced no output.")
        .trim()
        .to_owned()
}

async fn probe_mkvmerge(executable: &str, input: &Path) -> Result<ParsedConcat, String> {
    let executable = executable.to_owned();
    let input = input.to_path_buf();
    let output = tokio::task::spawn_blocking(move || {
        let mut command = Command::new(executable);
        command
            .arg("--identify")
            .arg("--identification-format")
            .arg("json")
            .arg(&input);
        hide_console(&mut command);
        command.output()
    })
    .await
    .map_err(|error| format!("The mkvmerge probe task failed: {error}"))?
    .map_err(|error| format!("mkvmerge could not be started: {error}"))?;

    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return Err(format!(
            "mkvmerge could not read this file: {}",
            first_line(&output.stderr)
        ));
    }
    // mkvmerge may exit non-zero after writing a complete identification, so the document is
    // the result and the status only explains a missing one.
    parse_mkvmerge_identify(&text)
}

/// Build the one FFmpeg command used for every input listing.
///
/// Inventory and source details need the same input header and stream/chapter metadata;
/// keeping the flags here prevents one caller from probing a subtly different view of the
/// same file.
fn ffmpeg_input_command(executable: &str, input: &Path) -> Command {
    let mut command = Command::new(executable);
    command
        .arg("-hide_banner")
        .arg("-nostdin")
        .arg("-i")
        .arg(input);
    hide_console(&mut command);
    command
}

/// Accept an FFmpeg listing only when it contains the input header.
///
/// A non-zero exit does not imply failure here: FFmpeg may print a complete listing and then
/// fail after it. The header is the reliable signal that `-i` identified the file, and the
/// first stderr line explains a listing that never got there.
fn ffmpeg_listing(stdout: &[u8], stderr: &[u8]) -> Result<String, String> {
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(stdout),
        String::from_utf8_lossy(stderr)
    );
    if !text.contains("Input #0") {
        return Err(format!(
            "FFmpeg could not read this file: {}",
            first_line(stderr)
        ));
    }
    Ok(text)
}

/// Read one file through FFmpeg for both inventory and source details.
///
/// This owns the blocking boundary as well as the process shape, so callers cannot
/// accidentally run the probe on an async executor thread.
async fn read_ffmpeg_input(executable: &str, input: &Path) -> Result<String, String> {
    let executable = executable.to_owned();
    let input = input.to_path_buf();
    let output =
        tokio::task::spawn_blocking(move || ffmpeg_input_command(&executable, &input).output())
            .await
            .map_err(|error| format!("The FFmpeg probe task failed: {error}"))?
            .map_err(|error| format!("FFmpeg could not be started: {error}"))?;

    ffmpeg_listing(&output.stdout, &output.stderr)
}

async fn probe_ffmpeg(executable: &str, input: &Path) -> Result<ParsedConcat, String> {
    let text = read_ffmpeg_input(executable, input).await?;
    let parsed = parse_ffmpeg_inventory(&text);
    if parsed.tracks.is_empty() && parsed.attachments.is_empty() && !text.contains("Stream #") {
        return Err("FFmpeg could not read this file's streams.".to_owned());
    }
    Ok(parsed)
}

fn empty_source_info(detail: String) -> ConcatSourceInfo {
    ConcatSourceInfo {
        chapters: Vec::new(),
        metadata: Vec::new(),
        chapters_detail: detail.clone(),
        metadata_detail: detail,
    }
}

fn empty_inventory(method: ConcatMethodName, detail: String) -> ConcatInventory {
    ConcatInventory {
        method,
        tracks: Vec::new(),
        attachments: Vec::new(),
        data_stream_count: 0,
        chapter_count: None,
        detail,
    }
}

/// List a source's chapters and global metadata for the two read-only sheets.
///
/// Both sheets read one document from one FFmpeg process. mkvmerge's identification JSON
/// reports a chapter count but not the entries, so FFmpeg is the provider even when
/// mkvmerge is selected. Nothing here writes configuration.
pub(crate) async fn get_video_concat_source_info(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let path = match audio_source_path(&state, &project_id, &video_id).await {
        Ok(path) => path,
        Err(response) => return response,
    };
    let Some(executable) = ffmpeg(&state).await else {
        return Json(empty_source_info(
            "FFmpeg was not found, so chapters and metadata cannot be listed. Install FFmpeg or choose it in Settings."
                .to_owned(),
        ))
        .into_response();
    };

    match read_ffmpeg_input(&executable, &path).await {
        Ok(text) => {
            let chapters = parse_ffmpeg_chapters(&text);
            let metadata = parse_ffmpeg_metadata(&text);
            let chapters_detail = if chapters.is_empty() {
                "This file reports no chapters.".to_owned()
            } else {
                let count = chapters.len();
                format!(
                    "{count} {} in this source.",
                    if count == 1 { "chapter" } else { "chapters" }
                )
            };
            let metadata_detail = if metadata.is_empty() {
                "This file reports no global metadata.".to_owned()
            } else {
                let count = metadata.len();
                format!(
                    "{count} metadata {} in this source.",
                    if count == 1 { "field" } else { "fields" }
                )
            };
            Json(ConcatSourceInfo {
                chapters,
                metadata,
                chapters_detail,
                metadata_detail,
            })
            .into_response()
        }
        Err(detail) => Json(empty_source_info(detail)).into_response(),
    }
}

/// List the streams at one concatenation input, using the selected muxer's own keys.
///
/// A missing provider or an unreadable file is a typed, empty inventory rather than an HTTP
/// error: the workbench stays usable, shows why it cannot list anything, and never applies a
/// partial map behind the user's back.
pub(crate) async fn get_video_concat_inventory(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    ApiJson(request): ApiJson<ConcatInventoryRequest>,
) -> Response {
    let path: PathBuf = match request
        .path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(explicit) => {
            let path = PathBuf::from(explicit);
            match tokio::fs::metadata(&path).await {
                Ok(metadata) if metadata.is_file() => path,
                Ok(_) => {
                    return Json(empty_inventory(
                        request.method,
                        format!("{} is not a file.", path.display()),
                    ))
                    .into_response();
                }
                Err(error) => {
                    return Json(empty_inventory(
                        request.method,
                        format!("{} could not be read: {error}", path.display()),
                    ))
                    .into_response();
                }
            }
        }
        None => match audio_source_path(&state, &project_id, &video_id).await {
            Ok(path) => path,
            Err(response) => return response,
        },
    };

    let result = match request.method {
        ConcatMethodName::Mkvmerge => match mkvmerge(&state).await {
            Some(executable) => probe_mkvmerge(&executable, &path).await,
            None => Err(
                "mkvmerge was not found, so this file's tracks cannot be listed. Install MKVToolNix or choose it in Settings."
                    .to_owned(),
            ),
        },
        ConcatMethodName::Ffmpeg => match ffmpeg(&state).await {
            Some(executable) => probe_ffmpeg(&executable, &path).await,
            None => Err(
                "FFmpeg was not found, so this file's tracks cannot be listed. Install FFmpeg or choose it in Settings."
                    .to_owned(),
            ),
        },
    };

    match result {
        Ok(parsed) => {
            let detail = if parsed.tracks.is_empty() && parsed.attachments.is_empty() {
                "This file has no streams that concatenation can map.".to_owned()
            } else {
                format!(
                    "{} source tracks and {} attachments at this input.",
                    parsed.tracks.len(),
                    parsed.attachments.len()
                )
            };
            Json(ConcatInventory {
                method: request.method,
                tracks: parsed.tracks,
                attachments: parsed.attachments,
                data_stream_count: parsed.data_stream_count,
                chapter_count: parsed.chapter_count,
                detail,
            })
            .into_response()
        }
        Err(detail) => Json(empty_inventory(request.method, detail)).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ffmpeg_input_command, ffmpeg_listing, parse_ffmpeg_chapters, parse_ffmpeg_inventory,
        parse_ffmpeg_metadata, parse_mkvmerge_identify,
    };
    use av1ation_contracts::video::ConcatTrackKind;

    #[test]
    fn the_shared_ffmpeg_read_uses_the_expected_arguments() {
        let command = ffmpeg_input_command("ffmpeg", std::path::Path::new("clip one.mkv"));
        assert_eq!(command.get_program(), std::ffi::OsStr::new("ffmpeg"));

        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert_eq!(
            args,
            vec![
                "-hide_banner".to_owned(),
                "-nostdin".to_owned(),
                "-i".to_owned(),
                "clip one.mkv".to_owned(),
            ]
        );
    }

    #[test]
    fn a_complete_ffmpeg_listing_keeps_stdout_before_stderr() {
        let text = ffmpeg_listing(
            b"Input #0, matroska,webm, from 'clip.mkv':\n",
            b"Stream #0:0: Video: h264\n",
        )
        .expect("a complete listing");

        assert_eq!(
            text,
            "Input #0, matroska,webm, from 'clip.mkv':\n\nStream #0:0: Video: h264\n"
        );
    }

    #[test]
    fn a_listing_without_an_input_header_reports_the_first_stderr_line() {
        let error = ffmpeg_listing(b"", b"\n[error] clip.mkv: No such file\nsecond line\n")
            .expect_err("a missing input header is a failure");

        assert_eq!(
            error,
            "FFmpeg could not read this file: [error] clip.mkv: No such file"
        );
    }

    #[test]
    fn mkvmerge_keys_are_the_identify_ids_not_positions() {
        let text = r#"{
            "tracks": [
                {"id": 5, "type": "audio", "codec": "AAC",
                 "properties": {"language": "eng", "default_track": true, "audio_channels": 6}},
                {"id": 9, "type": "subtitles", "codec": "SubRip/SRT",
                 "properties": {"language": "jpn", "forced_track": true}}
            ],
            "attachments": [
                {"id": 2, "file_name": "cover.jpg", "content_type": "image/jpeg",
                 "description": "Poster", "size": 4312}
            ],
            "chapters": 12
        }"#;
        let parsed = parse_mkvmerge_identify(text).expect("identification");

        assert_eq!(parsed.tracks[0].key, 5);
        assert_eq!(parsed.tracks[0].kind, ConcatTrackKind::Audio);
        assert_eq!(parsed.tracks[0].channels, Some(6));
        assert_eq!(
            parsed.tracks[0].label,
            "Audio 1 · ENG · AAC · 5.1 · default"
        );
        assert_eq!(parsed.tracks[1].key, 9);
        assert_eq!(
            parsed.tracks[1].label,
            "Subtitle 1 · JPN · SUBRIP/SRT · forced"
        );

        // The attachment keeps its own ID and is not selectable, because mkvmerge track 2
        // may also exist and the engine stores both in one numeric map.
        assert_eq!(parsed.attachments[0].key, 2);
        assert_eq!(parsed.attachments[0].label, "cover.jpg");
        assert!(!parsed.attachments[0].selectable);
        assert_eq!(parsed.chapter_count, Some(12));
    }

    #[test]
    fn ffmpeg_keys_are_the_source_stream_indices() {
        let text = "\
Input #0, matroska,webm, from 'clip.mkv':
  Duration: 00:10:00.00, start: 0.000000, bitrate: 5000 kb/s
  Chapters:
    Chapter #0:0: start 0.000000, end 300.000000
  Stream #0:0(eng): Video: h264 (High), yuv420p, 1920x1080, 24 fps
  Stream #0:1(jpn): Audio: aac (LC), 48000 Hz, 5.1(side), fltp, 384 kb/s (default)
  Stream #0:2(eng): Subtitle: subrip (srt)
  Stream #0:3: Attachment: ttf
      Metadata:
        filename        : cover.jpg
        mimetype        : image/jpeg
  Stream #0:4: Data: bin_data
";
        let parsed = parse_ffmpeg_inventory(text);

        assert_eq!(parsed.tracks[0].key, 0);
        assert_eq!(parsed.tracks[0].kind, ConcatTrackKind::Video);
        assert_eq!(parsed.tracks[1].key, 1);
        assert_eq!(
            parsed.tracks[1].label,
            "Audio 1 · JPN · AAC · 5.1 · default"
        );
        assert_eq!(parsed.tracks[2].key, 2);
        assert_eq!(parsed.attachments[0].key, 3);
        assert_eq!(parsed.attachments[0].label, "cover.jpg");
        assert_eq!(
            parsed.attachments[0].mime_type.as_deref(),
            Some("image/jpeg")
        );
        assert!(parsed.attachments[0].selectable);
        assert_eq!(parsed.data_stream_count, 1);
        assert_eq!(parsed.chapter_count, Some(1));
    }

    #[test]
    fn ffmpeg_chapter_times_and_titles_are_listed() {
        let text = "\
Input #0, matroska,webm, from 'clip.mkv':
  Chapters:
    Chapter #0:0: start 0.000000, end 12.500000
      Metadata:
        title           : Opening
    Chapter #0:1: start 12.500000, end 60.000000
";

        let chapters = parse_ffmpeg_chapters(text);

        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].index, 0);
        assert_eq!(chapters[0].title.as_deref(), Some("Opening"));
        assert_eq!(chapters[0].start_seconds, 0.0);
        assert_eq!(chapters[0].end_seconds, Some(12.5));
        assert_eq!(chapters[1].index, 1);
        assert_eq!(chapters[1].title, None);
        assert_eq!(chapters[1].start_seconds, 12.5);
        assert_eq!(chapters[1].end_seconds, Some(60.0));
    }

    #[test]
    fn ffmpeg_global_metadata_excludes_stream_tags() {
        let text = "\
Input #0, matroska,webm, from 'clip.mkv':
  Metadata:
    title           : The sample
    encoder         : libebml v1.4.5
  Duration: 00:01:00.00, start: 0.000000, bitrate: 1000 kb/s
  Stream #0:0: Video: h264
    Metadata:
      BPS             : 7980261
";

        let entries = parse_ffmpeg_metadata(text);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].key, "title");
        assert_eq!(entries[0].value, "The sample");
        assert_eq!(entries[1].key, "encoder");
        assert_eq!(entries[1].value, "libebml v1.4.5");
    }

    #[test]
    fn an_unreadable_ffmpeg_listing_has_no_chapters() {
        let parsed = parse_ffmpeg_inventory("");
        assert_eq!(parsed.chapter_count, None);
        assert_eq!(parsed.data_stream_count, 0);
        assert!(parsed.tracks.is_empty());
    }
}
