use super::*;
use crate::project::videos::VideoStore;
use av1ation_engine::media::preview::{DecodeContext, PreviewContext, SceneOutput};
use serde_json::Value;
use std::{path::Path, sync::atomic::AtomicBool};

/// An opened decode graph that can write consecutive preview windows.
///
/// The trait keeps the service's window scheduler independent of the engine's concrete
/// session, so a route test can inject prepared bytes without opening a decoder or loading
/// VapourSynth. The graph is created and used on one thread; it is deliberately not required
/// to be `Send`, because the engine's internal decoder types are not.
pub trait DecodedWindowWriter {
    /// Write `[start, end)` to `output` through the graph this writer already opened.
    fn write_window(
        &mut self,
        ffmpeg: &str,
        output: &Path,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String>;
}

impl DecodedWindowWriter for av1ation_engine::media::preview::DecodedSession {
    fn write_window(
        &mut self,
        ffmpeg: &str,
        output: &Path,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        av1ation_engine::media::preview::DecodedSession::write_window(
            self, ffmpeg, output, start, end, cancel,
        )
    }
}

/// An opened decode graph that can encode consecutive scenes through it.
///
/// A scene build reads the same input the previous scene read, so the graph is reused the
/// same way a Decoded window reuses one. The trait keeps the service's scene scheduler
/// independent of the engine's session, so a route test can supply prepared bytes without
/// opening a decoder.
pub trait EncodedSceneWriter {
    /// Encode `[start, end)` with `encoder`, writing through `target`.
    fn write_scene(
        &mut self,
        encoder: &Value,
        target: &SceneOutput<'_>,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String>;

    /// Whether the graph can serve another scene after the last write.
    ///
    /// An encoder that refused its input leaves the decoder untouched; a frame the graph
    /// could not produce does not, and the pool opens a new graph instead of reusing it.
    fn is_usable(&self) -> bool;
}

impl EncodedSceneWriter for av1ation_engine::media::preview::EncodedSession {
    fn write_scene(
        &mut self,
        encoder: &Value,
        target: &SceneOutput<'_>,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        av1ation_engine::media::preview::EncodedSession::write_scene(
            self, encoder, target, start, end, cancel,
        )
    }

    fn is_usable(&self) -> bool {
        av1ation_engine::media::preview::EncodedSession::is_usable(self)
    }
}

/// The engine work a preview build performs, behind one seam.
///
/// The HTTP route must be testable without decoding a clip or running an encoder. Production
/// uses [`EnginePreviewWriter`]; a route test can inject a writer that emits a prepared
/// fragmented MP4 and still exercise the request parsing, cache, streaming, and response
/// headers. The methods are synchronous because the caller already runs them on a blocking
/// worker.
pub trait PreviewWriter: Send + Sync {
    /// Open the input's decode graph once, so consecutive windows reuse it.
    fn open_decoded(
        &self,
        input: &Value,
        context: &PreviewContext<'_>,
    ) -> Result<Box<dyn DecodedWindowWriter>, String>;

    /// Open the input's decode graph once, so consecutive scenes reuse it.
    ///
    /// The service holds this graph only while it is idle: a build that finds it in use
    /// opens a transient graph through [`Self::write_encoded`] instead, so a warm scene and
    /// the scene the user is waiting for still overlap.
    fn open_encoded(
        &self,
        input: &Value,
        context: &DecodeContext<'_>,
    ) -> Result<Box<dyn EncodedSceneWriter>, String>;

    /// Encode one scene from its first frame with the run's encoder.
    fn write_encoded(
        &self,
        input: &Value,
        encoder: &Value,
        context: &PreviewContext<'_>,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String>;

    /// Copy a scene's retained chunk into the browser container.
    fn remux_chunk(
        &self,
        input: &Value,
        chunk: &Path,
        context: &PreviewContext<'_>,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String>;
}

/// The production writer, which delegates to the engine's preview functions.
pub(crate) struct EnginePreviewWriter;

impl PreviewWriter for EnginePreviewWriter {
    fn open_decoded(
        &self,
        input: &Value,
        context: &PreviewContext<'_>,
    ) -> Result<Box<dyn DecodedWindowWriter>, String> {
        let decode = av1ation_engine::media::preview::DecodeContext {
            video_path: context.video_path,
            temp_dir: context.temp_dir,
            condor: context.condor,
            sequence_config: context.sequence_config,
        };
        Ok(Box::new(
            av1ation_engine::media::preview::DecodedSession::open(input, &decode)?,
        ))
    }

    fn open_encoded(
        &self,
        input: &Value,
        context: &DecodeContext<'_>,
    ) -> Result<Box<dyn EncodedSceneWriter>, String> {
        Ok(Box::new(
            av1ation_engine::media::preview::EncodedSession::open(input, context)?,
        ))
    }

    fn write_encoded(
        &self,
        input: &Value,
        encoder: &Value,
        context: &PreviewContext<'_>,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        av1ation_engine::media::preview::write_scene_encoded_proxy(
            input, encoder, context, start, end, cancel,
        )
    }

    fn remux_chunk(
        &self,
        input: &Value,
        chunk: &Path,
        context: &PreviewContext<'_>,
        start: usize,
        end: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        av1ation_engine::media::preview::remux_chunk_proxy(
            input, chunk, context, start, end, cancel,
        )
    }
}

/// Which derived picture the player asked for, and where.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PreviewRequest {
    /// The frames the Parallel Encoder receives, from `start`. `frames` bounds the stream;
    /// absent is the rest of the video, so one element can play without a boundary.
    Decoded { start: usize, frames: Option<usize> },
    /// One scene's chunk, produced from the scene's first frame by the run's encoder.
    Encoded {
        /// An index the caller already resolved, when it has one.
        scene: Option<usize>,
        /// The playhead, used to resolve the scene when no index was sent.
        frame: usize,
    },
}

/// Publishes a build's terminal result even when the engine or FFmpeg driver panics.
///
/// Without this, an unwinding blocking task would leave the registry entry alive, and
/// every follower would stream a body that never ends. The result is set on the normal
/// path and replaced with a readable error during unwinding.
pub(super) struct FinishOnDrop {
    builds: PreviewBuilds,
    output: PathBuf,
    part: PathBuf,
    result: Option<Result<(), String>>,
}

impl Drop for FinishOnDrop {
    fn drop(&mut self) {
        self.builds.finish(
            &self.output,
            &self.part,
            self.result
                .take()
                .unwrap_or_else(|| Err("The preview build stopped unexpectedly.".to_owned())),
        );
    }
}

/// What a proxy request can be served from: a finished file, or a build in progress.
pub(super) enum PreparedPreview {
    /// A cached proxy or the run's real output, served with ordinary byte ranges.
    Ready(PathBuf),
    /// A fragmented or live stream still being written, which the route serves as it grows.
    Building(PreviewBuild),
}

/// One proxy build that a request can follow while the encoder writes it.
///
/// Keeping the part path and the terminal result together lets a second viewer (or a
/// reopened tab) attach to the running build instead of starting a duplicate decode of the
/// same source. The part file is unique to one build; only a successful rename makes it the
/// cache file every later request reads.
pub(crate) struct PreviewBuild {
    /// The cache path that appears after a successful build.
    output: PathBuf,
    /// The growing file the build writes.
    part: PathBuf,
    /// `None` while the build runs, then its terminal result.
    done: watch::Receiver<Option<Result<(), String>>>,
    /// Set by the last viewer leaving; the builder checks it between frames.
    cancel: Arc<AtomicBool>,
    /// The registry this viewer must leave when the response body is dropped.
    builds: PreviewBuilds,
    /// Whether the body waits for real frames instead of the muxer's own header.
    awaits_fragment: bool,
}

impl Drop for PreviewBuild {
    fn drop(&mut self) {
        self.builds.release(&self.output, &self.part);
    }
}

impl PreviewBuild {
    /// The growing file, for a request that streams it.
    pub(super) fn part(&self) -> &Path {
        &self.part
    }

    /// The finished cache file, for a body that started after the part was published.
    pub(super) fn output(&self) -> &Path {
        &self.output
    }

    /// The flag the builder checks between frames.
    fn cancel(&self) -> &Arc<AtomicBool> {
        &self.cancel
    }

    /// The terminal result once the build ended, without waiting for it.
    pub(super) fn result(&self) -> Option<Result<(), String>> {
        self.done.borrow().clone()
    }

    /// The media type this build's finished file carries.
    fn content_type(&self) -> &'static str {
        content_type(&self.output)
    }

    /// Hold the body until the encoder has produced a frame, not just a muxer header.
    ///
    /// A fragmented proxy writes its `ftyp` and an empty `moov` as soon as FFmpeg starts, so
    /// a non-empty part file proves only that the muxer launched. An encoder that refuses the
    /// source (a 10-bit-only build handed 8-bit frames, for example) fails right after that,
    /// and if the body has already opened the diagnostic is lost: the element receives an
    /// init segment and a stream that stops. Waiting for the first fragment keeps the failure
    /// inside the route's first-byte window, where it is returned as the structured refusal
    /// that carries the encoder's own message.
    fn wait_for_fragment(mut self) -> Self {
        self.awaits_fragment = true;
        self
    }

    /// Whether the growing file already holds what the element needs to start.
    async fn has_first_fragment(&self) -> bool {
        if self.awaits_fragment {
            return has_media_fragment(&self.part).await;
        }
        tokio::fs::metadata(&self.part)
            .await
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false)
    }

    /// Wait for the build and return the finished cache file.
    ///
    /// A range that starts past zero cannot be answered from a growing file, so a seek
    /// waits here instead of receiving bytes from the wrong offset.
    async fn wait(mut self) -> Result<PathBuf, String> {
        loop {
            // Hold the watch guard only for the read: an `if let` scrutinee would keep
            // the non-`Send` lock across the awaits below and make the route non-`Send`.
            let result = self.done.borrow_and_update().clone();
            if let Some(result) = result {
                return match result {
                    Ok(()) => {
                        if finished_file(&self.output).await {
                            Ok(self.output.clone())
                        } else {
                            Err("The preview ended without writing its cache file.".to_owned())
                        }
                    }
                    Err(message) => Err(message),
                };
            }
            if self.done.changed().await.is_err() {
                return if finished_file(&self.output).await {
                    Ok(self.output.clone())
                } else {
                    Err("The preview ended without a result.".to_owned())
                };
            }
        }
    }
}

/// The process-wide registry of proxy builds, keyed by their finished cache path.
///
/// Two players opening the same source must share one decode and one encode. The registry
/// lives in `AppState` rather than in the request so a retry, a second window, and a re-open
/// after a failure all agree on what is already running.
#[derive(Clone, Default)]
pub(crate) struct PreviewBuilds {
    builds: Arc<Mutex<HashMap<PathBuf, PreviewJob>>>,
}

/// One running build behind a cache path.
pub(super) struct PreviewJob {
    part: PathBuf,
    done: watch::Sender<Option<Result<(), String>>>,
    /// Response bodies currently attached to this build. The count is guarded by the
    /// registry mutex, not atomic, so a viewer cannot attach in the same instant the last
    /// one cancels.
    viewers: usize,
    cancel: Arc<AtomicBool>,
}

impl PreviewBuilds {
    /// Follow the build for `output`, or register a new one named by `part`.
    ///
    /// The boolean is `true` for the request that must actually start the build; the others
    /// receive the same part file and the same terminal result. A build whose last viewer
    /// left is being killed, so a new request starts a replacement instead of attaching to
    /// a stream that is about to be truncated.
    pub(crate) fn claim(
        &self,
        output: &Path,
        part: impl FnOnce() -> PathBuf,
    ) -> (PreviewBuild, bool) {
        let mut builds = self
            .builds
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(job) = builds.get_mut(output) {
            if !job.cancel.load(Ordering::SeqCst) {
                job.viewers += 1;
                return (
                    PreviewBuild {
                        output: output.to_path_buf(),
                        part: job.part.clone(),
                        done: job.done.subscribe(),
                        cancel: Arc::clone(&job.cancel),
                        builds: self.clone(),
                        awaits_fragment: false,
                    },
                    false,
                );
            }
            // The old build owns its part file until it observes the flag and unwinds.
            // Removing the entry now makes this request the owner of a clean cache path.
            builds.remove(output);
        }
        let part = part();
        let (done, receiver) = watch::channel(None);
        let cancel = Arc::new(AtomicBool::new(false));
        builds.insert(
            output.to_path_buf(),
            PreviewJob {
                part: part.clone(),
                done,
                viewers: 1,
                cancel: Arc::clone(&cancel),
            },
        );
        (
            PreviewBuild {
                output: output.to_path_buf(),
                part,
                done: receiver,
                cancel,
                builds: self.clone(),
                awaits_fragment: false,
            },
            true,
        )
    }

    /// Leave one build. The last viewer stops a build that is still encoding, so switching
    /// sources does not leave a scene's full encode running in the background.
    fn release(&self, output: &Path, part: &Path) {
        let mut builds = self
            .builds
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(job) = builds.get_mut(output) else {
            return;
        };
        if job.part != part {
            return;
        }
        job.viewers = job.viewers.saturating_sub(1);
        if job.viewers == 0 {
            job.cancel.store(true, Ordering::SeqCst);
        }
    }

    /// Whether the running build has been told to stop.
    #[cfg(test)]
    pub(super) fn is_cancelled(&self, output: &Path) -> bool {
        self.builds
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(output)
            .is_some_and(|job| job.cancel.load(Ordering::SeqCst))
    }

    /// Publish a build's terminal result and forget it, so the next request starts clean.
    ///
    /// The part path makes this idempotent: a cancelled build whose entry was replaced by
    /// a new request cannot remove or finish that replacement.
    pub(crate) fn finish(&self, output: &Path, part: &Path, result: Result<(), String>) {
        let mut builds = self
            .builds
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(job) = builds.get(output) else {
            return;
        };
        if job.part != part {
            return;
        }
        let job = builds.remove(output);
        if let Some(job) = job {
            let _ = job.done.send(Some(result));
        }
    }
}

/// The engine input the Decoded and Encoded sources show.
///
/// Decoded means what the Parallel Encoder receives, so an Encoding input override wins
/// over General. The stored override document is materialised with the project first, so
/// inheritance behaves exactly as it does for a run.
pub(super) fn preview_input(
    project: &serde_json::Value,
    record: &crate::project::videos::VideoRecord,
    from_original: bool,
) -> Option<serde_json::Value> {
    if from_original {
        return Some(record.input.clone()).filter(|input| !input.is_null());
    }
    let mut document = config::materialise(&default_config(), project, &record.overrides);
    config::inherit_sequence_inputs(&mut document, &record.input_path());
    document
        .get("sequences")
        .and_then(|sequences| sequences.get("parallel_encoder"))
        .and_then(|encoder| encoder.get("input"))
        .filter(|input| !input.is_null())
        .cloned()
        .or_else(|| Some(record.input.clone()).filter(|input| !input.is_null()))
}

mod decoder;
mod proxy;
mod scene;

pub(crate) use decoder::{DECODER_IDLE_TIMEOUT, DecoderInput, PreviewDecoders, WindowRequest};
pub(crate) use proxy::*;
pub(crate) use scene::{PreviewSceneDecoders, SceneBuild};
