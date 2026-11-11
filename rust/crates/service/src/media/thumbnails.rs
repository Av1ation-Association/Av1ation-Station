//! One keyframe grid per video, shared by the Scenes rail and the timeline.
//!
//! A still per request used to open a decoder, seek, and encode a PNG, so a screenful of
//! rows cost several decoders and the memory that went with them. This cache decodes one
//! keyframe-only pass with FFmpeg, assigns each five-second bin the first keyframe in it
//! (or the previous picture when the GOP contains none), and serves every later request as
//! a file read. The grid is five seconds and 320 px wide, which is enough for a 40 px rail
//! row and a timeline block and keeps a 24-minute episode near 2 MiB.
//!
//! FFmpeg writes keyframes named by their millisecond timestamp, not by output ordinal. The
//! `fps` filter alone is not enough: it maps a keyframe to the nearest grid point and can
//! drop the final keyframe, so a long GOP ended with repeated earlier frames and no file for
//! the tail. Timestamps make the bin a fact about the source instead of about the filter's
//! output count, and every bin from zero to the last keyframe is written in order.
//!
//! The build is single-flight per cache key. A request never waits for it: the manifest says
//! `building` and how many files already exist, so the rail fills in from the first file.
//! Hardware decode is several times faster on long sources, so every desktop platform gets
//! its native decoder first — D3D11VA on Windows, VideoToolbox on macOS, VAAPI on Linux.
//! Hardware is a hint, not a requirement: a refused device falls back to the same command
//! without `-hwaccel`, so a remote session or an old driver still gets a grid.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, UNIX_EPOCH},
};

use av1ation_contracts::protocol::ErrorCode;
use av1ation_contracts::video::{ThumbnailManifest, ThumbnailState};
use av1ation_engine::platform::hide_console;
use axum::{
    Json,
    body::Body,
    extract::{Path as AxumPath, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

use crate::{api::error::error_response, state::AppState};

/// Spacing of the keyframe grid. A scene's start frame maps to the keyframe in its bin.
const INTERVAL_MS: u64 = 5_000;
/// Enough pixels for a rail row and a block, without paying for a full-size still.
const WIDTH: u32 = 320;
/// FFmpeg's MJPEG quality scale, where a lower number is better.
const QUALITY: u32 = 5;
/// Bump when the command or the cache layout changes, so no old directory is reused.
const RECIPE_VERSION: u32 = 1;
/// Thumbnail bytes kept across every video, oldest grid first.
const CACHE_BUDGET_BYTES: u64 = 512 * 1024 * 1024;
/// Written only after FFmpeg exits successfully.
const MANIFEST_FILE: &str = "manifest.json";
/// Written when the extraction failed, so a repeated request does not start another decoder.
const ERROR_FILE: &str = "error.txt";
/// Keyframe staging, inside the cache directory but never served. `count_files` only counts
/// `thumb-*.jpg`, so a partial extraction cannot make a bin look ready.
const STAGING_DIR: &str = "keys";
/// A failed build is retried after this long: a busy GPU or a file another process holds is
/// often gone by then, and a permanently broken source changes its cache key or is retried
/// once per visit rather than in a loop.
const RETRY_AFTER: Duration = Duration::from_secs(60);
/// A bin ordinal beyond this means the timestamp is not a video's. Refusing beats writing a
/// file per bin until the disk fills.
const MAX_BINS: usize = 1_000_000;

/// The in-flight keys, shared by every request so concurrent first views start one decoder.
#[derive(Clone, Default)]
pub(crate) struct ThumbnailBuilds {
    running: Arc<Mutex<HashSet<String>>>,
}

impl ThumbnailBuilds {
    fn running(&self) -> MutexGuard<'_, HashSet<String>> {
        self.running
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn claim(&self, revision: &str) -> bool {
        self.running().insert(revision.to_owned())
    }

    fn release(&self, revision: &str) {
        self.running().remove(revision);
    }
}

/// Everything one build or one image request needs, resolved once.
struct CacheContext {
    source: PathBuf,
    directory: PathBuf,
    root: PathBuf,
    ffmpeg: String,
    revision: String,
}

/// What a video's thumbnail source resolved to before any build work.
enum Lookup {
    Thumbnails(CacheContext),
    Unavailable(String),
}

/// The manifest for one video's keyframe grid; starts the extraction when it is absent.
pub(crate) async fn get_thumbnails(
    State(state): State<AppState>,
    AxumPath((project_id, video_id)): AxumPath<(String, String)>,
) -> Response {
    let context = match lookup(&state, &project_id, &video_id).await {
        Ok(Lookup::Thumbnails(context)) => context,
        Ok(Lookup::Unavailable(detail)) => return unavailable(&detail),
        Err(response) => return response,
    };
    let available = count_files(&context.directory).await;
    if let Some(stored) = read_stored(&context.directory).await
        && stored.count > 0
        && available >= stored.count
    {
        return Json(manifest(
            &context,
            ThumbnailState::Ready,
            stored.count,
            String::new(),
        ))
        .into_response();
    }
    if let Some(detail) = read_error(&context.directory).await {
        // A failure used to be permanent: the error file made every later request answer
        // `failed` without ever starting another build. Retry a stale error, but answer
        // `building` so the screen polls the retry instead of hiding the thumbnails.
        if retry_due(&context.directory).await && state.thumbnails().claim(&context.revision) {
            let _ = tokio::fs::remove_file(context.directory.join(ERROR_FILE)).await;
            let response = Json(manifest(
                &context,
                ThumbnailState::Building,
                available,
                "Retrying the keyframe extraction.".to_owned(),
            ))
            .into_response();
            start_build(state.thumbnails().clone(), context);
            return response;
        }
        return Json(manifest(
            &context,
            ThumbnailState::Failed,
            available,
            detail,
        ))
        .into_response();
    }
    let response = Json(manifest(
        &context,
        ThumbnailState::Building,
        available,
        "Extracting keyframes in the background.".to_owned(),
    ))
    .into_response();
    if state.thumbnails().claim(&context.revision) {
        start_build(state.thumbnails().clone(), context);
    }
    response
}

/// One cached JPEG, or a 404 while its index is not written yet.
///
/// This route never starts a build: an image element would otherwise turn a cold rail into
/// one decoder per row, which is the cost the cache exists to remove.
pub(crate) async fn get_thumbnail(
    State(state): State<AppState>,
    AxumPath((project_id, video_id, raw_index)): AxumPath<(String, String, String)>,
) -> Response {
    let context = match lookup(&state, &project_id, &video_id).await {
        Ok(Lookup::Thumbnails(context)) => context,
        Ok(Lookup::Unavailable(detail)) => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                detail,
                Some("This video has no file FFmpeg can read for keyframes.".to_owned()),
            );
        }
        Err(response) => return response,
    };
    let index: u32 = match raw_index.parse() {
        Ok(index) => index,
        Err(_) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                ErrorCode::InvalidConfig,
                format!("`{raw_index}` is not a thumbnail index."),
                Some("Pass a zero-based whole number.".to_owned()),
            );
        }
    };
    let path = thumbnail_path(&context.directory, u64::from(index));
    let bytes = match tokio::fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return error_response(
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                format!("Thumbnail {index} is not written yet."),
                Some("Read the thumbnail manifest and retry after its count grows.".to_owned()),
            );
        }
    };
    let mut response = Response::new(Body::from(bytes));
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/jpeg"));
    // A revision is part of the URL, so this file can never change under the same path.
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );
    response
}

/// Resolve the video's source and the cache directory its grid belongs to.
async fn lookup(state: &AppState, project_id: &str, video_id: &str) -> Result<Lookup, Response> {
    let source =
        match crate::media::stream::source_path(state, project_id, video_id, "original").await {
            Ok(source) => source,
            Err(response) => return Err(response),
        };
    if source
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("vpy"))
    {
        return Ok(Lookup::Unavailable(
            "A VapourSynth script has no file FFmpeg can decode for thumbnails.".to_owned(),
        ));
    }
    let Some(data_dir) = state.data_dir.as_ref() else {
        return Ok(Lookup::Unavailable(
            "Thumbnails need a writable app-data directory.".to_owned(),
        ));
    };
    let Some(ffmpeg) = crate::media::stream::ffmpeg(state).await else {
        return Ok(Lookup::Unavailable(
            "FFmpeg was not found, so keyframes cannot be extracted.".to_owned(),
        ));
    };
    let metadata = match tokio::fs::metadata(&source).await {
        Ok(metadata) => metadata,
        Err(error) => {
            return Ok(Lookup::Unavailable(format!(
                "{} could not be read for thumbnails: {error}",
                source.display()
            )));
        }
    };
    let revision = revision(&source, &metadata);
    let root = data_dir.join("cache").join("thumbnails");
    Ok(Lookup::Thumbnails(CacheContext {
        directory: root.join(&revision),
        source,
        root,
        ffmpeg,
        revision,
    }))
}

/// A cache key that changes with the source and the grid.
///
/// The modification time catches an in-place re-render, and the size catches a replacement
/// that kept a timestamp. A content hash would deduplicate two copies of one file, but it
/// costs a full read before the first thumbnail, which is the wait this cache removes.
fn revision(source: &Path, metadata: &std::fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let fingerprint = format!(
        "v{RECIPE_VERSION}:{}:{}:{modified}:{INTERVAL_MS}:{WIDTH}:{QUALITY}",
        source.display(),
        metadata.len(),
    );
    format!(
        "{:016x}",
        crate::platform::hash::fnv1a(fingerprint.as_bytes())
    )
}

fn manifest(
    context: &CacheContext,
    state: ThumbnailState,
    available: u32,
    detail: String,
) -> ThumbnailManifest {
    ThumbnailManifest {
        state,
        revision: context.revision.clone(),
        interval_ms: INTERVAL_MS,
        width: WIDTH,
        available,
        detail,
    }
}

fn unavailable(detail: &str) -> Response {
    Json(ThumbnailManifest {
        state: ThumbnailState::Unavailable,
        revision: String::new(),
        interval_ms: INTERVAL_MS,
        width: WIDTH,
        available: 0,
        detail: detail.to_owned(),
    })
    .into_response()
}

fn start_build(builds: ThumbnailBuilds, context: CacheContext) {
    tokio::spawn(async move {
        let revision = context.revision.clone();
        let directory = context.directory.clone();
        let result = tokio::task::spawn_blocking(move || build(context)).await;
        match result {
            Ok(Ok(())) => {}
            Ok(Err(message)) => write_error(&directory, &message).await,
            Err(error) => {
                write_error(
                    &directory,
                    &format!("The thumbnail worker stopped unexpectedly: {error}"),
                )
                .await;
            }
        }
        builds.release(&revision);
    });
}

/// Run the extraction and publish its completion marker.
///
/// A previous attempt's bins are kept: the writer overwrites every bin atomically from the
/// first one, so an image element never loses a URL it already loaded while a retry runs.
/// Only the keyframe staging is cleared, because a partial keyframe set would mix two runs.
fn build(context: CacheContext) -> Result<(), String> {
    prepare(&context.directory)?;
    let hardware = hardware_args();
    let count = if hardware.is_empty() {
        extract(&context, &[])?
    } else {
        match extract(&context, &hardware) {
            Ok(count) => count,
            Err(hardware_error) => {
                let _ = std::fs::remove_dir_all(context.directory.join(STAGING_DIR));
                extract(&context, &[]).map_err(|software_error| {
                    format!("{hardware_error} The CPU fallback also failed: {software_error}")
                })?
            }
        }
    };
    if count == 0 {
        return Err("FFmpeg produced no keyframes this cache can use.".to_owned());
    }
    let _ = std::fs::remove_dir_all(context.directory.join(STAGING_DIR));
    write_stored(&context.directory, count)?;
    prune(&context.root, &context.directory);
    Ok(())
}

/// Make the cache directory ready for a build without discarding the bins it already has.
fn prepare(directory: &Path) -> Result<(), String> {
    std::fs::create_dir_all(directory).map_err(|error| {
        format!(
            "{} could not be created for thumbnails: {error}",
            directory.display()
        )
    })?;
    for name in [MANIFEST_FILE, ERROR_FILE] {
        match std::fs::remove_file(directory.join(name)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "{} could not be removed for a thumbnail build: {error}",
                    directory.join(name).display()
                ));
            }
        }
    }
    match std::fs::remove_dir_all(directory.join(STAGING_DIR)) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "{} could not be cleared for a thumbnail build: {error}",
                directory.join(STAGING_DIR).display()
            ));
        }
    }
    // A `.tmp` file is a bin whose rename never happened; it is never served.
    if let Ok(entries) = std::fs::read_dir(directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|extension| extension == "tmp") {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    std::fs::create_dir_all(directory.join(STAGING_DIR)).map_err(|error| {
        format!(
            "{} could not be created for keyframes: {error}",
            directory.join(STAGING_DIR).display()
        )
    })
}

/// The decoder arguments this platform can offer FFmpeg, ahead of the CPU path.
///
/// VAAPI needs an explicit render node; without one FFmpeg cannot initialise the device, so
/// Linux falls back to the CPU rather than asking for a decoder that is certain to fail. The
/// chosen device is still only a hint: the caller retries the whole command on the CPU when
/// the decoder refuses the stream.
fn hardware_args() -> Vec<&'static str> {
    #[cfg(target_os = "windows")]
    {
        vec!["-hwaccel", "d3d11va"]
    }
    #[cfg(target_os = "macos")]
    {
        vec!["-hwaccel", "videotoolbox"]
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        match ["/dev/dri/renderD128", "/dev/dri/renderD129"]
            .into_iter()
            .find(|path| Path::new(path).exists())
        {
            Some(device) => vec!["-hwaccel", "vaapi", "-vaapi_device", device],
            None => Vec::new(),
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        Vec::new()
    }
}

/// One keyframe-only pass. Bins are published while FFmpeg is still decoding.
///
/// The keyframes are named by their millisecond timestamp (`-frame_pts 1` with a 1/1000
/// encoder time base), so `Bins` can map each one to a five-second bin without parsing a log
/// or probing the stream again.
fn extract(context: &CacheContext, hardware: &[&str]) -> Result<u32, String> {
    let staging = context.directory.join(STAGING_DIR);
    std::fs::create_dir_all(&staging).map_err(|error| {
        format!(
            "{} could not be created for keyframes: {error}",
            staging.display()
        )
    })?;
    let log_path = staging.join("ffmpeg.log");
    let log = std::fs::File::create(&log_path).map_err(|error| {
        format!(
            "{} could not be written for thumbnails: {error}",
            log_path.display()
        )
    })?;
    let mut command = Command::new(&context.ffmpeg);
    hide_console(&mut command);
    command.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y"]);
    // An empty slice is the CPU path; a populated one is this platform's decoder. A refused
    // device is answered by the caller retrying this command once without it.
    command.args(hardware);
    command
        .args(["-skip_frame", "nokey", "-i"])
        .arg(&context.source)
        .args([
            "-an",
            "-sn",
            "-fps_mode",
            "passthrough",
            "-enc_time_base",
            "1/1000",
            "-vf",
        ])
        .arg(format!(
            "setpts=PTS-STARTPTS,scale={WIDTH}:-2:flags=bilinear"
        ))
        .args([
            "-c:v",
            "mjpeg",
            "-q:v",
            &QUALITY.to_string(),
            "-f",
            "image2",
            "-frame_pts",
            "1",
            // The scanner reads the staging directory while FFmpeg writes it. Without this,
            // a keyframe file that exists but is still being written could be published as
            // a truncated JPEG under a URL the rail treats as complete.
            "-atomic_writing",
            "1",
        ])
        .arg(staging.join("key-%d.jpg"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        // A file rather than a pipe: an unexpected amount of decoder output can never fill
        // a pipe and stall the child while this thread waits for it.
        .stderr(Stdio::from(log));
    let mut child = command
        .spawn()
        .map_err(|error| format!("FFmpeg could not start for thumbnails: {error}"))?;
    let mut bins = Bins::new(context.directory.clone());
    loop {
        if let Err(error) = bins.sync(&staging) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "FFmpeg could not be watched for thumbnails: {error}"
                ));
            }
        }
    }
    let status = child
        .wait()
        .map_err(|error| format!("FFmpeg could not be waited for thumbnails: {error}"))?;
    bins.sync(&staging)?;
    if !status.success() {
        return Err(format!(
            "FFmpeg could not extract thumbnails: {}",
            log_detail(&log_path)
        ));
    }
    Ok(bins.count())
}

/// The bins already published for one build, and how far they reach.
struct Bins {
    directory: PathBuf,
    next: usize,
}

impl Bins {
    fn new(directory: PathBuf) -> Self {
        Self { directory, next: 0 }
    }

    /// Publish every bin the keyframes written so far can answer.
    ///
    /// This runs while FFmpeg is still decoding, so it rescans a small directory and skips
    /// bins that are already published. A later keyframe belongs to a later bin, so a bin
    /// that has a source never needs another one.
    fn sync(&mut self, staging: &Path) -> Result<(), String> {
        let mut keyframes = keyframe_files(staging)?;
        keyframes.sort_by_key(|(timestamp, _)| *timestamp);
        let timestamps: Vec<u64> = keyframes.iter().map(|(timestamp, _)| *timestamp).collect();
        let sources = bin_sources(&timestamps)?;
        for (bin, source) in sources.iter().enumerate().skip(self.next) {
            let keyframe = keyframes.get(*source).ok_or_else(|| {
                "The keyframe index did not name a file the extraction wrote.".to_owned()
            })?;
            write_bin(&keyframe.1, &thumbnail_path(&self.directory, bin as u64))?;
        }
        self.next = self.next.max(sources.len());
        Ok(())
    }

    fn count(&self) -> u32 {
        u32::try_from(self.next).unwrap_or(u32::MAX)
    }
}

/// Every staged keyframe, as `(milliseconds from the first frame, path)`.
fn keyframe_files(staging: &Path) -> Result<Vec<(u64, PathBuf)>, String> {
    let entries = match std::fs::read_dir(staging) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "{} could not be read for keyframes: {error}",
                staging.display()
            ));
        }
    };
    let mut keyframes = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(stamp) = name
            .strip_prefix("key-")
            .and_then(|rest| rest.strip_suffix(".jpg"))
        else {
            continue;
        };
        let Ok(timestamp) = stamp.parse::<u64>() else {
            continue;
        };
        keyframes.push((timestamp, entry.path()));
    }
    Ok(keyframes)
}

/// The source keyframe each grid bin should show, in bin order.
///
/// The first keyframe in a bin is that bin's picture; a bin with no keyframe repeats the
/// previous one rather than leaving a hole. The final keyframe is always represented, even
/// when a filter's output count would have dropped it, and every index below the result's
/// length has a file, which is what lets the rail treat `available` as a prefix.
///
/// Choosing the *first* keyframe in a bin, not the last, also makes a build that publishes
/// bins while FFmpeg is still decoding produce the same grid as one that waited: a later
/// keyframe in a bin that already has its picture cannot change it.
fn bin_sources(timestamps: &[u64]) -> Result<Vec<usize>, String> {
    let mut sources: Vec<usize> = Vec::new();
    for (index, timestamp) in timestamps.iter().enumerate() {
        let bin = usize::try_from(*timestamp / INTERVAL_MS)
            .map_err(|_| "A keyframe timestamp is beyond this cache's range.".to_owned())?;
        if bin >= MAX_BINS {
            return Err(format!(
                "A keyframe at {timestamp} ms is beyond the range a video can span."
            ));
        }
        if sources.is_empty() {
            // The opening bins have no earlier keyframe; the first decodable picture covers
            // them, which is what a player shows there too.
            sources.resize(bin + 1, index);
        } else if bin >= sources.len() {
            let previous = *sources
                .last()
                .ok_or_else(|| "A keyframe index lost its previous bin.".to_owned())?;
            while sources.len() < bin {
                sources.push(previous);
            }
            sources.push(index);
        }
    }
    Ok(sources)
}

/// Publish one bin atomically.
///
/// The manifest counts a `thumb-*.jpg` and the rail mounts it immediately, so a half-written
/// JPEG would be a broken image with no retry. A hard link avoids the copy entirely; the
/// copy is the fallback for a filesystem that cannot link.
fn write_bin(source: &Path, target: &Path) -> Result<(), String> {
    let temporary = target.with_extension("tmp");
    if std::fs::hard_link(source, &temporary).is_err() {
        std::fs::copy(source, &temporary).map_err(|error| {
            format!(
                "{} could not be written for a thumbnail: {error}",
                temporary.display()
            )
        })?;
    }
    match std::fs::rename(&temporary, target) {
        Ok(()) => Ok(()),
        Err(_) if target.exists() => {
            // A previous pass already published this bin. Keeping its picture is better than
            // removing a file an image element may be reading.
            let _ = std::fs::remove_file(&temporary);
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::remove_file(&temporary);
            Err(format!(
                "{} could not be published for a thumbnail: {error}",
                target.display()
            ))
        }
    }
}

/// The last useful lines FFmpeg wrote before it failed.
fn log_detail(path: &Path) -> String {
    let Ok(text) = std::fs::read_to_string(path) else {
        return "FFmpeg failed without a message.".to_owned();
    };
    let mut lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("frame="))
        .rev()
        .take(3)
        .collect();
    lines.reverse();
    if lines.is_empty() {
        "FFmpeg failed without a message.".to_owned()
    } else {
        lines.join(" ")
    }
}

fn thumbnail_path(directory: &Path, index: u64) -> PathBuf {
    directory.join(format!("thumb-{:05}.jpg", index + 1))
}

#[derive(Serialize, Deserialize)]
struct StoredManifest {
    interval_ms: u64,
    width: u32,
    count: u32,
}

fn write_stored(directory: &Path, count: u32) -> Result<(), String> {
    let stored = StoredManifest {
        interval_ms: INTERVAL_MS,
        width: WIDTH,
        count,
    };
    let bytes = serde_json::to_vec(&stored)
        .map_err(|error| format!("The thumbnail manifest could not be encoded: {error}"))?;
    std::fs::write(directory.join(MANIFEST_FILE), bytes).map_err(|error| {
        format!(
            "{} could not be written: {error}",
            directory.join(MANIFEST_FILE).display()
        )
    })
}

async fn read_stored(directory: &Path) -> Option<StoredManifest> {
    let bytes = tokio::fs::read(directory.join(MANIFEST_FILE)).await.ok()?;
    let stored: StoredManifest = serde_json::from_slice(&bytes).ok()?;
    (stored.interval_ms == INTERVAL_MS && stored.width == WIDTH).then_some(stored)
}

async fn read_error(directory: &Path) -> Option<String> {
    let text = tokio::fs::read_to_string(directory.join(ERROR_FILE))
        .await
        .ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// Whether a recorded failure is old enough to try again.
async fn retry_due(directory: &Path) -> bool {
    let Ok(metadata) = tokio::fs::metadata(directory.join(ERROR_FILE)).await else {
        return true;
    };
    metadata.modified().map_or(true, |modified| {
        modified
            .elapsed()
            .map_or(true, |elapsed| elapsed >= RETRY_AFTER)
    })
}

async fn write_error(directory: &Path, message: &str) {
    // A build that could not even create its directory leaves nowhere to record the
    // reason; the log is the only remaining surface, and the next request retries.
    let _ = tokio::fs::create_dir_all(directory).await;
    if let Err(error) = tokio::fs::write(directory.join(ERROR_FILE), message).await {
        tracing::warn!(
            target: "av1ation_service::thumbnails",
            message = %error,
            "thumbnail failure could not be recorded"
        );
    }
}

async fn count_files(directory: &Path) -> u32 {
    let mut entries = match tokio::fs::read_dir(directory).await {
        Ok(entries) => entries,
        Err(_) => return 0,
    };
    let mut count = 0_u64;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("thumb-") && name.ends_with(".jpg") {
            count += 1;
        }
    }
    u32::try_from(count).unwrap_or(u32::MAX)
}

/// Delete the oldest grids until the cache is back under its budget.
///
/// The current grid is never a candidate: it may still be building, and its files are what
/// the request that started it is about to serve. A directory that cannot be removed is
/// skipped rather than counted as freed, which is what a file still open on Windows does.
fn prune(root: &Path, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    let mut directories = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let size = directory_size(&path);
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH);
        directories.push((path, size, modified));
    }
    let mut total: u64 = directories.iter().map(|(_, size, _)| *size).sum();
    if total <= CACHE_BUDGET_BYTES {
        return;
    }
    directories.sort_by_key(|(_, _, modified)| *modified);
    for (path, size, _) in directories {
        if total <= CACHE_BUDGET_BYTES {
            break;
        }
        if path == keep {
            continue;
        }
        if std::fs::remove_dir_all(&path).is_ok() {
            total = total.saturating_sub(size);
        }
    }
}

fn directory_size(directory: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| entry.metadata().ok())
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_grid_uses_one_numbered_file_per_bin() {
        let directory = Path::new("C:/cache");
        assert_eq!(
            thumbnail_path(directory, 0),
            directory.join("thumb-00001.jpg")
        );
        assert_eq!(
            thumbnail_path(directory, 41),
            directory.join("thumb-00042.jpg")
        );
    }

    #[test]
    fn a_changed_source_or_grid_changes_the_revision() {
        let directory = std::env::temp_dir().join("av1ation-thumbnail-revision");
        std::fs::create_dir_all(&directory).expect("temporary directory");
        let source = directory.join("source.mkv");
        std::fs::write(&source, b"first").expect("fixture");
        let first = std::fs::metadata(&source).expect("metadata");
        let before = revision(&source, &first);
        std::fs::write(&source, b"second-and-longer").expect("fixture");
        let second = std::fs::metadata(&source).expect("metadata");
        assert_ne!(before, revision(&source, &second));
        std::fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn a_script_source_has_no_grid_to_build() {
        assert!(
            Path::new("C:/scripts/grain.vpy")
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("vpy"))
        );
    }

    #[test]
    fn bins_take_the_first_keyframe_in_each_interval() {
        // Keyframes at 0, 12 and 24 seconds: bins 0-1 show the opening picture, 2-3 the
        // twelve-second keyframe, and 4 the final one. The old `fps` pass wrote five files
        // too, but its fifth was still the twelve-second frame because it dropped the last
        // keyframe; every scene from 20 seconds on showed the wrong picture.
        assert_eq!(
            bin_sources(&[0, 12_000, 24_000]).expect("bins"),
            vec![0, 0, 1, 1, 2]
        );
        // The first keyframe in a bin is its picture; later keyframes in that bin are not
        // needed, so a build that publishes early cannot disagree with one that waited.
        assert_eq!(
            bin_sources(&[0, 1_000, 4_000, 6_000]).expect("bins"),
            vec![0, 3]
        );
        // A source whose first keyframe is not at zero still has a file for bin zero.
        assert_eq!(bin_sources(&[12_000]).expect("bins"), vec![0, 0, 0]);
        assert!(bin_sources(&[]).expect("bins").is_empty());
    }

    #[test]
    fn an_implausible_keyframe_timestamp_is_refused() {
        let too_late = u64::try_from(MAX_BINS).unwrap_or(u64::MAX) * INTERVAL_MS;
        assert!(bin_sources(&[too_late]).is_err());
    }

    #[test]
    fn a_hardware_attempt_names_a_decoder_and_its_device() {
        let args = hardware_args();
        if args.is_empty() {
            return;
        }
        assert_eq!(args.first(), Some(&"-hwaccel"));
        assert!(args.len() >= 2);
        // VAAPI cannot initialise without a render node, and the caller's fallback only
        // works if the attempt did not name a device that does not exist.
        if let Some(position) = args.iter().position(|arg| *arg == "-vaapi_device") {
            let device = args.get(position + 1).expect("a VAAPI device path");
            assert!(Path::new(device).exists());
        }
    }

    #[test]
    fn a_build_is_claimed_once_per_revision() {
        let builds = ThumbnailBuilds::default();
        assert!(builds.claim("abc"));
        assert!(!builds.claim("abc"));
        builds.release("abc");
        assert!(builds.claim("abc"));
    }

    /// A real extraction with a GOP longer than the grid, ignored by default because it
    /// needs FFmpeg.
    ///
    /// Run with
    /// `cargo test -p av1ation-service --lib thumbnails::tests -- --ignored`.
    #[test]
    #[ignore = "needs FFmpeg; run with --ignored"]
    fn a_long_gop_grid_keeps_the_final_keyframe() {
        let scratch = av1ation_test_support::Scratch::new("av1ation-thumbnails");
        let root = scratch.path().to_path_buf();
        // mpeg4, not FFV1: this case exists to prove a GOP longer than the grid is
        // binned correctly, and an intra-only codec has a keyframe on every frame.
        let clip =
            av1ation_test_support::Clip::testsrc_with_keyframes(&root, 320, 240, 24, 30, 288);
        let directory = root.join("rev");
        build(CacheContext {
            source: clip.path().to_path_buf(),
            directory: directory.clone(),
            root: root.clone(),
            ffmpeg: av1ation_test_support::ffmpeg().to_owned(),
            revision: "rev".to_owned(),
        })
        .expect("the grid builds");
        let names: Vec<String> = std::fs::read_dir(&directory)
            .expect("cache directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("thumb-") && name.ends_with(".jpg"))
            .collect();
        assert_eq!(names.len(), 5, "one file per five-second bin through 24 s");
        let read = |name: &str| std::fs::read(directory.join(name)).expect("a published thumbnail");
        assert_eq!(read("thumb-00001.jpg"), read("thumb-00002.jpg"));
        assert_eq!(read("thumb-00003.jpg"), read("thumb-00004.jpg"));
        assert_ne!(
            read("thumb-00004.jpg"),
            read("thumb-00005.jpg"),
            "the final bin must be the 24-second keyframe, not a repeat of 12 seconds"
        );
    }
}
