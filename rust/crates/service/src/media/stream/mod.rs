//! Byte-range delivery of a video's source and finished output, plus the preview audio track.
//!
//! A `<video>` element cannot carry the API's bearer token and cannot attach to an in-memory
//! transport, so the player needs one ordinary URL it can seek. The service serves the file
//! itself rather than exposing a host path: the desktop window, a LAN browser, and the demo
//! all address the same route, and a range request never reads the whole file.
//!
//! The browser has no portable API for choosing one of a container's audio streams. When the
//! user picks a track, the service extracts that stream once into a cached audio-only file
//! and serves it under the same URL. A direct source request stays a byte-range copy of the
//! original file; extraction is an explicit, separate URL.
//!
//! A derived proxy (Decoded or Encoded) is not waited for: the build writes a fragmented
//! or live stream that the route serves as it grows, so the element decodes the first
//! fragment while the rest of the video is still being produced. See [`serve_building`].

use std::{
    collections::HashMap,
    io::SeekFrom,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, atomic::Ordering},
};

use av1ation_contracts::protocol::ErrorCode;
use av1ation_contracts::video::AudioTrackList;
use axum::{
    Json,
    body::Body,
    extract::{Path as AxumPath, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::watch;
use tokio_util::io::ReaderStream;

use crate::{
    api::error::error_response, project::config, project::projects::default_config, state::AppState,
};

/// Which file the player asked for. `original` is the decode source; `encode` is the
/// concatenated output a successful run left.
#[derive(Debug, Deserialize)]
pub(crate) struct MediaQuery {
    source: Option<String>,
    /// Zero-based audio-stream index. Absent plays the file's own default track.
    audio: Option<u32>,
    /// Which decode feeds the encoder for an encoded preview: `original` uses General,
    /// `decoded` (the default) uses the Encoding input override.
    encode_from: Option<String>,
    /// The absolute frame the player wants. A decoded stream starts here; an encoded
    /// request uses it to find the scene when the caller does not name the scene itself.
    frame: Option<usize>,
    /// How many decoded frames to stream. Absent means to the end of the video: playback
    /// must not stop at a window boundary and rebuild the decode, which is the stall the
    /// continuous stream removes.
    frames: Option<usize>,
    /// The scene an encoded preview covers, when the player already resolved it.
    scene: Option<usize>,
    /// A filmstrip still rather than a scrub still.
    ///
    /// The same frame is requested again whenever the strip remounts as the playhead
    /// crosses a scene, so this variant may be cached by the window while a scrub frame
    /// stays `no-store`: its URL changes with every pointer step. The value is the width the
    /// still is scaled to, so a 44 px rail row does not carry a full-resolution PNG; the
    /// URL carries the width, which keeps each size its own cache entry.
    thumb: Option<u32>,
}

/// The container and FFmpeg format a preview audio track is written as.
///
/// Every track is re-encoded, never copied. A copy keeps the stream's own timestamps, and a
/// cut file's tracks need not share a timeline: one source's FLAC begins at 251 s and claims
/// 23 minutes of audio while the picture is 31 s long, so the player's picture-relative seek
/// landed back on the track's head and the sound looped its first moments. Re-encoding from
/// the first decoded sample gives a track that starts at zero and matches the picture, is
/// portable in every WebView, and costs one pass per selected track. Preview sound exists to
/// judge sync, not to master from.
const PREVIEW_AUDIO: (&str, &str) = ("m4a", "mp4");

/// Stream one file with the range semantics a media element requires.
///
/// The route is only registered on the service, so the LAN middleware and its token gate
/// still apply to every request; a browser with no token gets the same uniform error a JSON
/// route would. `Accept-Ranges` is always advertised, and a single `bytes=` range is
/// answered with `206` and `Content-Range`; multi-range requests are refused because a
/// `<video>` never needs them.
pub(crate) async fn get_video_media(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    Query(query): Query<MediaQuery>,
    headers: HeaderMap,
) -> Response {
    let source = query.source.as_deref().unwrap_or("original");
    // An audio request is served from the original file and must not prepare a video
    // proxy: selecting a track while the picture is still on Original would otherwise
    // decode and encode the whole video just to hear it.
    if let Some(index) = query.audio {
        let audio = match audio_source_path(&state, &project_id, &video_id).await {
            Ok(audio) => audio,
            Err(response) => return response,
        };
        return match audio_file(&state, &audio, &video_id, source, index).await {
            Ok(path) => serve_file(&path, &headers).await,
            Err(response) => response,
        };
    }

    let prepared = match source {
        "decoded" => {
            preview_proxy(
                &state,
                &project_id,
                &video_id,
                PreviewRequest::Decoded {
                    start: query.frame.unwrap_or(0),
                    frames: query.frames,
                },
                false,
            )
            .await
        }
        "encode" => {
            let from_original = query.encode_from.as_deref() == Some("original");
            preview_proxy(
                &state,
                &project_id,
                &video_id,
                PreviewRequest::Encoded {
                    scene: query.scene,
                    frame: query.frame.unwrap_or(0),
                },
                from_original,
            )
            .await
        }
        other => match source_path(&state, &project_id, &video_id, other).await {
            Ok(path) => Ok(PreparedPreview::Ready(path)),
            Err(response) => Err(response),
        },
    };
    match prepared {
        Ok(PreparedPreview::Ready(path)) => serve_file(&path, &headers).await,
        Ok(PreparedPreview::Building(build)) => serve_building(build, &headers).await,
        Err(response) => response,
    }
}

/// One decoded frame as a PNG, for scrubbing the Decoded source.
///
/// This is the fast path the Scenes tab uses while the playhead moves: one frame is
/// decoded and encoded as a lossless still, so a scrub does not wait for a video window and
/// the picture carries no compression artefacts. The image is never cached, because the URL
/// changes with every frame the user passes over.
pub(crate) async fn get_video_frame(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    Query(query): Query<MediaQuery>,
) -> Response {
    if query
        .source
        .as_deref()
        .is_some_and(|source| source != "decoded")
    {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            "Only the Decoded source renders single frames.".to_owned(),
            Some("Use source=decoded.".to_owned()),
        );
    }
    let Some(frame) = query.frame else {
        return error_response(
            StatusCode::BAD_REQUEST,
            ErrorCode::InvalidConfig,
            "A frame index is required.".to_owned(),
            Some("Pass `frame=<index>`.".to_owned()),
        );
    };
    let Some(videos) = state.videos() else {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::Io,
            "The video store is not available.".to_owned(),
            Some("Restart the service with a writable app-data directory.".to_owned()),
        );
    };
    let record = match videos.record(&project_id, &video_id).await {
        Ok(Some(record)) => record,
        Ok(None) => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("No video matches `{video_id}`."),
                None,
            );
        }
        Err(error) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                error.to_string(),
                None,
            );
        }
    };
    let Some(projects) = state.projects() else {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::Io,
            "The project store is not available.".to_owned(),
            None,
        );
    };
    let project = match projects.document(&project_id).await {
        Ok(Some(project)) => project,
        Ok(None) => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("No project matches `{project_id}`."),
                None,
            );
        }
        Err(error) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Io,
                error.to_string(),
                None,
            );
        }
    };
    let Some(input) = preview_input(&project, &record, false) else {
        return error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            "This video has no input to preview.".to_owned(),
            Some("Choose a source in Configuration → General.".to_owned()),
        );
    };
    let Some(executable) = ffmpeg(&state).await else {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::PreflightFailed,
            "FFmpeg was not found, so a frame cannot be rendered.".to_owned(),
            Some("Install FFmpeg or choose it in Settings.".to_owned()),
        );
    };
    let video_path = record.input_path();
    let temp_dir = videos
        .chunk_directory(video_id.as_str(), record.temp_directory.as_deref())
        .display()
        .to_string();
    // A still can be the first frame a script is opened for, so it reads the same custom
    // pairs the run and the export would hand it.
    let condor = av1ation_engine::script::data::attach_custom_scene_data(
        record.condor.as_ref(),
        &record.custom_scene_data,
    );
    let sequence_config = {
        let mut document = config::materialise(&default_config(), &project, &record.overrides);
        config::inherit_sequence_inputs(&mut document, &record.input_path());
        document
            .get("sequences")
            .cloned()
            .unwrap_or(serde_json::Value::Null)
    };
    // A width of zero would ask FFmpeg to scale to nothing; clamp instead of refusing,
    // because a hand-written URL is not a configuration error.
    let thumb_width = query.thumb.map(|width| width.clamp(64, 1280));
    let cached = query.thumb.is_some();
    let task = tokio::task::spawn_blocking(move || {
        let context = av1ation_engine::media::preview::FrameContext {
            video_path: &video_path,
            temp_dir: &temp_dir,
            condor: condor.as_ref(),
            sequence_config: &sequence_config,
            ffmpeg: &executable,
        };
        av1ation_engine::media::preview::write_frame_png(&input, &context, frame, thumb_width)
    })
    .await;
    match task {
        Ok(Ok(png)) => {
            let mut response = Response::new(Body::from(png));
            *response.status_mut() = StatusCode::OK;
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
            response.headers_mut().insert(
                header::CACHE_CONTROL,
                if cached {
                    HeaderValue::from_static("private, max-age=300")
                } else {
                    HeaderValue::from_static("no-store")
                },
            );
            response
        }
        Ok(Err(message)) => preview_error(message),
        Err(error) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            format!("The frame task failed: {error}"),
            None,
        ),
    }
}

/// List the audio streams a source carries, for the player's track selector.
///
/// A missing FFmpeg is reported as an empty list with a readable detail rather than an
/// error: the rest of the preview and the Scenes tab still work without it.
pub(crate) async fn get_video_audio_tracks(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
    Query(_query): Query<MediaQuery>,
) -> Response {
    let path = match audio_source_path(&state, &project_id, &video_id).await {
        Ok(path) => path,
        Err(response) => return response,
    };
    let Some(executable) = ffmpeg(&state).await else {
        return Json(AudioTrackList {
            tracks: Vec::new(),
            detail: "FFmpeg was not found, so the source's audio tracks cannot be listed. Install FFmpeg or choose it in Settings.".to_owned(),
        })
        .into_response();
    };

    match list_audio(&executable, &path).await {
        Ok(tracks) if tracks.is_empty() => Json(AudioTrackList {
            tracks,
            detail: "This file has no audio streams.".to_owned(),
        })
        .into_response(),
        Ok(tracks) => Json(AudioTrackList {
            tracks,
            detail: "Choose a track to play it alongside the preview.".to_owned(),
        })
        .into_response(),
        Err(message) => Json(AudioTrackList {
            tracks: Vec::new(),
            detail: message,
        })
        .into_response(),
    }
}

mod audio;
mod concat;
mod preview;
pub(crate) use audio::ffmpeg;
use audio::*;
pub(crate) use concat::{get_video_concat_inventory, get_video_concat_source_info};
pub use preview::PreviewWriter;
use preview::*;
pub(crate) use preview::{EnginePreviewWriter, PreviewBuilds};
/// Resolve the file a `source` name addresses, with the errors both media routes share.
pub(crate) async fn source_path(
    state: &AppState,
    project_id: &str,
    video_id: &str,
    source: &str,
) -> Result<PathBuf, Response> {
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

    let path = match source {
        "original" => record.input_path(),
        "encode" => record.output_path(),
        other => {
            return Err(error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                format!("`{other}` is not a media source."),
                Some("Use `source=original` or `source=encode`.".to_owned()),
            ));
        }
    };
    if path.trim().is_empty() {
        return Err(error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("This video has no {source} file to play."),
            Some(
                "Choose the input file, or run the encode before comparing its output.".to_owned(),
            ),
        ));
    }
    let path = PathBuf::from(path);
    let metadata = match tokio::fs::metadata(&path).await {
        Ok(metadata) => metadata,
        Err(error) => {
            return Err(error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("{} could not be read: {error}", path.display()),
                Some(
                    "The file may have been moved or deleted since the video was queued."
                        .to_owned(),
                ),
            ));
        }
    };
    if !metadata.is_file() {
        return Err(error_response(
            StatusCode::NOT_FOUND,
            ErrorCode::NotFound,
            format!("{} is not a file.", path.display()),
            None,
        ));
    }
    Ok(path)
}

/// Serve one file with single-range semantics, or the whole file when no range was asked.
async fn serve_file(path: &Path, headers: &HeaderMap) -> Response {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("{} could not be read: {error}", path.display()),
                None,
            );
        }
    };
    let length = metadata.len();
    let range = match headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
    {
        Some(value) => match parse_range(value, length) {
            Ok(range) => range,
            Err(()) => {
                let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
                if let Ok(value) = HeaderValue::from_str(&format!("bytes */{length}")) {
                    response.headers_mut().insert(header::CONTENT_RANGE, value);
                }
                response
                    .headers_mut()
                    .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
                return response;
            }
        },
        None => None,
    };

    let (start, end) = range.unwrap_or((0, length.saturating_sub(1)));
    let body_length = end.saturating_sub(start).saturating_add(1);
    let mut file = match tokio::fs::File::open(path).await {
        Ok(file) => file,
        Err(error) => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("{} could not be opened: {error}", path.display()),
                None,
            );
        }
    };
    if let Err(error) = file.seek(SeekFrom::Start(start)).await {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            ErrorCode::Io,
            format!("{} could not be read: {error}", path.display()),
            None,
        );
    }

    let mut response = Response::new(Body::from_stream(ReaderStream::new(file.take(body_length))));
    *response.status_mut() = if range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type(path)),
    );
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Ok(value) = HeaderValue::from_str(&body_length.to_string()) {
        headers.insert(header::CONTENT_LENGTH, value);
    }
    if let Ok(value) = HeaderValue::from_str(&format!("bytes {start}-{end}/{length}")) {
        headers.insert(header::CONTENT_RANGE, value);
    }
    response
}

/// The FFmpeg executable the inventory accepted, otherwise `None`.
///
/// A built-in row has no stored path and is invoked by name; a custom row carries the path
/// the user chose, and replaces the built-in row in the same inventory.
/// Parse one `bytes=` request into an inclusive start and end.
///
/// `None` means the client asked for the whole file. `Err` is any malformed or unsatisfiable
/// request: a media element treats `416` as the end of the file, while a partial parse would
/// silently deliver the wrong bytes.
fn parse_range(value: &str, length: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(rest) = value.strip_prefix("bytes=") else {
        return Err(());
    };
    if rest.contains(',') || length == 0 {
        return Err(());
    }
    let Some((start, end)) = rest.split_once('-') else {
        return Err(());
    };
    let last = length.saturating_sub(1);
    if start.trim().is_empty() {
        let suffix = end.trim().parse::<u64>().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        let start = length.saturating_sub(suffix);
        return Ok(Some((start, last)));
    }
    let start = start.trim().parse::<u64>().map_err(|_| ())?;
    let end = if end.trim().is_empty() {
        last
    } else {
        end.trim().parse::<u64>().map_err(|_| ())?
    };
    if start > last || end < start {
        return Err(());
    }
    Ok(Some((start, end.min(last))))
}

/// A container type the player can attempt, or a neutral binary type it will reject.
fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mp4" | "m4v") => "video/mp4",
        Some("m4a") => "audio/mp4",
        Some("webm" | "weba") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("ts" | "m2ts") => "video/mp2t",
        Some("flac") => "audio/flac",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        PreviewBuilds, RangeIntent, content_type, decoded_span, has_moof, parse_audio_streams,
        parse_range, range_intent, tail_part, trim_preview_cache_with,
    };
    use axum::http::{HeaderMap, HeaderValue, header};
    use std::{
        fs::File,
        io::Write as _,
        path::Path,
        path::PathBuf,
        time::{Duration, UNIX_EPOCH},
    };

    /// A top-level box header followed by `body` zero bytes.
    fn boxed(kind: &[u8; 4], body: usize) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&u32::try_from(body + 8).expect("box size").to_be_bytes());
        bytes.extend_from_slice(kind);
        bytes.extend(std::iter::repeat_n(0_u8, body));
        bytes
    }

    #[tokio::test]
    async fn the_preview_cache_drops_its_oldest_files_and_spares_the_current_one() {
        let directory =
            std::env::temp_dir().join(format!("av1ation-preview-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).expect("cache dir");
        let mut written = Vec::new();
        for (index, name) in ["old.mp4", "newer.mp4", "current.mp4"]
            .into_iter()
            .enumerate()
        {
            let path = directory.join(name);
            let mut file = File::create(&path).expect("cache file");
            file.write_all(&[0_u8; 600]).expect("cache file");
            // The sweep orders by modification time. Set it explicitly so three writes in
            // one tick cannot make the test depend on the filesystem clock.
            let modified = UNIX_EPOCH
                + Duration::from_secs(1_700_000_000 + u64::try_from(index).expect("index"));
            file.set_modified(modified).expect("cache mtime");
            written.push(path);
        }
        // A build in progress must survive: another viewer may still be reading it.
        let part = directory.join("building.part");
        std::fs::write(&part, vec![0_u8; 600]).expect("part file");

        let current = directory.join("current.mp4");
        let removed = trim_preview_cache_with(&directory, &current, 900)
            .await
            .expect("sweep");

        assert_eq!(removed, 2, "the two oldest files account for the overflow");
        assert!(!written[0].exists(), "the oldest file is deleted first");
        assert!(!written[1].exists());
        assert!(
            current.exists(),
            "the file being built is never a candidate"
        );
        assert!(part.exists(), "a partial file belongs to a running build");
        std::fs::remove_dir_all(&directory).ok();
    }

    #[test]
    fn a_range_is_inclusive_and_clamped_to_the_file() {
        assert_eq!(parse_range("bytes=0-1", 7), Ok(Some((0, 1))));
        assert_eq!(parse_range("bytes=3-", 7), Ok(Some((3, 6))));
        assert_eq!(parse_range("bytes=0-100", 7), Ok(Some((0, 6))));
        assert_eq!(parse_range("bytes=-2", 7), Ok(Some((5, 6))));
        assert_eq!(parse_range("bytes=-100", 7), Ok(Some((0, 6))));
    }

    #[test]
    fn an_unsatisfiable_or_malformed_range_is_refused() {
        assert_eq!(parse_range("items=0-1", 7), Err(()));
        assert_eq!(parse_range("bytes=7-9", 7), Err(()));
        assert_eq!(parse_range("bytes=4-2", 7), Err(()));
        assert_eq!(parse_range("bytes=-0", 7), Err(()));
        assert_eq!(parse_range("bytes=0-1,3-4", 7), Err(()));
        assert_eq!(parse_range("bytes=0-1", 0), Err(()));
    }

    #[test]
    fn an_absent_decoded_frame_count_streams_to_the_end() {
        // Playback must not stop at a window boundary: absent means one stream for the rest
        // of the video, and the engine clamps the saturated end to the real frame count.
        assert_eq!(
            decoded_span(240, None),
            (240, usize::MAX, "decoded-240-end".to_owned())
        );
        assert_eq!(
            decoded_span(240, Some(120)),
            (240, 360, "decoded-240-120".to_owned())
        );
    }

    #[test]
    fn common_containers_have_a_video_type() {
        assert_eq!(content_type(Path::new("clip.mp4")), "video/mp4");
        assert_eq!(content_type(Path::new("clip.MKV")), "video/x-matroska");
        assert_eq!(content_type(Path::new("track.m4a")), "audio/mp4");
        assert_eq!(content_type(Path::new("track.flac")), "audio/flac");
        assert_eq!(
            content_type(Path::new("clip.bin")),
            "application/octet-stream"
        );
    }

    #[test]
    fn audio_tracks_are_parsed_in_audio_order() {
        let text = "\
Stream #0:1(eng): Audio: aac (LC), 48000 Hz, 5.1(side), fltp, 384 kb/s (default)
Stream #0:2(jpn): Audio: opus, 48000 Hz, stereo, fltp
Stream #0:3: Audio: dts (DTS), 48000 Hz, 5.1(side), fltp, 1536 kb/s
";
        let tracks = parse_audio_streams(text);

        assert_eq!(tracks.len(), 3);
        assert_eq!(tracks[0].index, 0);
        assert_eq!(tracks[0].language.as_deref(), Some("eng"));
        assert_eq!(tracks[0].codec.as_deref(), Some("aac"));
        assert_eq!(tracks[0].channels, Some(6));
        assert!(tracks[0].default);
        assert_eq!(tracks[1].index, 1);
        assert_eq!(tracks[1].channels, Some(2));
        assert!(!tracks[1].default);
        assert_eq!(tracks[2].index, 2);
        assert_eq!(tracks[2].channels, Some(6));
    }

    #[test]
    fn a_building_proxy_streams_only_a_range_that_starts_at_zero() {
        let ranging = |value: &str| {
            let mut headers = HeaderMap::new();
            headers.insert(header::RANGE, HeaderValue::from_str(value).expect("range"));
            headers
        };

        assert_eq!(range_intent(&HeaderMap::new()), RangeIntent::Whole);
        assert_eq!(range_intent(&ranging("bytes=0-")), RangeIntent::FromStart);
        // A probing prefix is streamed rather than cut short: a body that stops at the
        // asked-for byte would make the element re-request from the start.
        assert_eq!(
            range_intent(&ranging("bytes=0-2047")),
            RangeIntent::FromStart
        );
        assert_eq!(
            range_intent(&ranging("bytes=1024-")),
            RangeIntent::Elsewhere
        );
        assert_eq!(range_intent(&ranging("bytes=-512")), RangeIntent::Elsewhere);
        assert_eq!(range_intent(&ranging("items=0-")), RangeIntent::Elsewhere);
    }

    #[test]
    fn a_second_request_follows_the_running_build() {
        let builds = PreviewBuilds::default();
        let output = PathBuf::from("C:/cache/preview/decoded.mp4");
        let part = PathBuf::from("C:/cache/preview/decoded.1.part");

        let (first, started) = builds.claim(&output, || part.clone());
        assert!(started, "the first request owns the build");
        assert_eq!(first.part(), part);

        let (second, started) = builds.claim(&output, || {
            panic!("a follower must not create a second part file")
        });
        assert!(!started, "the second request follows the build");
        assert_eq!(second.part(), part);

        builds.finish(&output, &part, Err("the input did not open".to_owned()));
        assert_eq!(
            second.result(),
            Some(Err("the input did not open".to_owned()))
        );

        // A finished build is forgotten, so a later request starts a new one rather than
        // following a terminal result forever.
        let (_, started) = builds.claim(&output, || part.clone());
        assert!(started);
    }

    #[test]
    fn the_last_viewer_cancels_the_build_and_a_replacement_is_clean() {
        let builds = PreviewBuilds::default();
        let output = PathBuf::from("C:/cache/preview/encoded.mp4");
        let part = PathBuf::from("C:/cache/preview/encoded.1.part");

        let (first, started) = builds.claim(&output, || part.clone());
        assert!(started);
        let (second, started) = builds.claim(&output, || {
            panic!("a follower must not create a second part file")
        });
        assert!(!started);

        drop(first);
        assert!(
            !builds.is_cancelled(&output),
            "one viewer still attached must keep the build alive"
        );
        drop(second);
        assert!(
            builds.is_cancelled(&output),
            "the last viewer leaving must stop the build"
        );

        // A request arriving after the cancellation must not attach to the stream being
        // killed; it owns a fresh part file and its own cancellation flag.
        let replacement = PathBuf::from("C:/cache/preview/encoded.2.part");
        let (third, started) = builds.claim(&output, || replacement.clone());
        assert!(started);
        assert_eq!(third.part(), replacement);
        assert!(!builds.is_cancelled(&output));

        // The old builder finishing late cannot remove the replacement or publish a
        // result into its watchers.
        builds.finish(&output, &part, Err("cancelled".to_owned()));
        let (fourth, started) =
            builds.claim(&output, || panic!("the replacement is still running"));
        assert!(!started);
        assert_eq!(fourth.part(), replacement);

        builds.finish(&output, &replacement, Ok(()));
    }

    #[tokio::test]
    async fn a_building_proxy_streams_before_it_is_finished() {
        let directory =
            std::env::temp_dir().join(format!("av1ation-preview-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).expect("scratch directory");
        let output = directory.join("decoded.mp4");
        let part = directory.join("decoded.1.part");
        std::fs::write(&part, b"init").expect("first fragment");

        let builds = PreviewBuilds::default();
        let (build, started) = builds.claim(&output, || part.clone());
        assert!(started);
        let (chunks, mut body) = tokio::sync::mpsc::channel(4);
        let tail = tokio::spawn(tail_part(build, chunks));

        let first = body.recv().await.expect("first fragment").expect("media");
        assert_eq!(&first[..], b"init");

        // The next fragment reaches the body while the build still runs; this is the
        // property that lets the player start instead of waiting for the whole proxy.
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&part)
            .expect("growing part file");
        file.write_all(b"-more").expect("next fragment");
        drop(file);
        let next = body.recv().await.expect("next fragment").expect("media");
        assert_eq!(&next[..], b"-more");

        builds.finish(&output, &part, Ok(()));
        tokio::time::timeout(std::time::Duration::from_secs(2), tail)
            .await
            .expect("the body ends with the build")
            .expect("tail task");
        assert!(
            body.recv().await.is_none(),
            "a finished build closes the body"
        );

        std::fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[tokio::test]
    async fn a_failed_proxy_breaks_the_body_instead_of_ending_it() {
        let directory =
            std::env::temp_dir().join(format!("av1ation-preview-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).expect("scratch directory");
        let output = directory.join("encoded.mp4");
        let part = directory.join("encoded.1.part");
        std::fs::write(&part, b"init").expect("init segment");

        let builds = PreviewBuilds::default();
        let (build, _) = builds.claim(&output, || part.clone());
        let (chunks, mut body) = tokio::sync::mpsc::channel(4);
        tokio::spawn(tail_part(build, chunks));

        body.recv().await.expect("init segment").expect("media");
        builds.finish(
            &output,
            &part,
            Err("the encoder only supports 10-bit".to_owned()),
        );

        // The player can only tell a stopped encoder from a finished scene if the body
        // ends in an error, so the reason travels as one.
        let end = tokio::time::timeout(std::time::Duration::from_secs(2), body.recv())
            .await
            .expect("the body reacts to the failure")
            .expect("an error item");
        assert_eq!(
            end.expect_err("a broken body").to_string(),
            "the encoder only supports 10-bit"
        );

        std::fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn a_muxer_header_is_not_a_media_fragment() {
        let init = [
            boxed(b"ftyp", 8),
            boxed(b"moov", 120),
            // The box after `moov` has not finished arriving.
            boxed(b"moof", 64),
        ]
        .concat();
        assert!(!has_moof(&init[..init.len() - 1]));
        assert!(!has_moof(&init[..20]), "a partial box is not a fragment");
        assert!(has_moof(&init), "a complete moof is a fragment");

        // A bitstream can contain the four characters; only a box boundary counts.
        let mut payload = boxed(b"mdat", 64);
        payload[12..16].copy_from_slice(b"moof");
        assert!(!has_moof(&payload));
    }
}
