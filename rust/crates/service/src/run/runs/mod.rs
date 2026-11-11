//! Supervision of the single in-flight encode.
//!
//! The supervisor owns the singleton lock, the event fan-out, the live-stage snapshot, and
//! the timeline writer. Routes only build a fully materialised request, start it, cancel it,
//! and subscribe. The lock is reserved before the runner is asked to start, so two concurrent
//! requests cannot both launch an encoder, and it is released by the first terminal event or
//! by a stream that closes without one.

mod events;
use events::{forward_events, update_stage, wire_event};

use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use av1ation_contracts::queue::QueueBatchStatus;
use av1ation_contracts::run::{EncodeEvent, EncodeEventKind, RunStarted};
use av1ation_engine::{
    EncodeEvent as EngineEvent, EncodeEventKind as EngineEventKind, EncodeRequest, EncodeRunner,
};
use tokio::sync::{Mutex, broadcast, mpsc};

use crate::{
    project::derive,
    project::settings::SettingsStore,
    project::videos::VideoStore,
    run::logs::{LogMeta, LogStore, record_for},
    run::retention::ChunkRetention,
    run::timeline::{Attempt, TimelineEntry, TimelineStore, now_epoch},
};

/// Why a run could not be started. The router maps each variant to its HTTP contract.
pub(crate) enum StartError {
    Busy(String),
    Engine(String),
}

/// What a live run is doing right now, for the derived state and the UI.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ActiveStage {
    pub(crate) run_id: String,
    pub(crate) sequence: Option<String>,
    pub(crate) progress: Option<f64>,
    /// The step inside the sequence this snapshot belongs to, so a new step can restart it.
    phase: Option<String>,
    /// The pass inside the sequence this snapshot belongs to, for the same reason.
    pass: Option<u8>,
}

/// The service's view of the one run allowed at a time.
#[derive(Clone)]
pub(crate) struct RunSupervisor {
    runner: Arc<dyn EncodeRunner>,
    lock: Arc<Mutex<Option<RunHandle>>>,
    events: broadcast::Sender<EncodeEvent>,
    stage: Arc<StdMutex<Option<ActiveStage>>>,
    /// The current run's events, so a client that reconnects can replay instead of having
    /// missed them. Only the current run is kept; older runs are history, not state.
    history: Arc<StdMutex<(Option<String>, Vec<EncodeEvent>)>>,
    timeline: Option<TimelineStore>,
    logs: Option<LogStore>,
    /// The retention decision for a finished run's chunks. Supervision only times the
    /// call; whether chunks are kept is the policy's answer, not the supervisor's.
    retention: ChunkRetention,
    /// The queue batch that is currently walking a project's videos, if any. It is live
    /// execution state, like the singleton: a restart has no batch to resume, and every
    /// row's own status is still derived from its checkpoint.
    batch: Arc<StdMutex<Option<BatchRun>>>,
    /// Noise Detector values this run has measured but not yet checkpointed.
    ///
    /// Its sequence writes the scene data only when it saves, at the end of its run, so a
    /// reader that opened the scene table mid-run would otherwise see nothing for the scenes
    /// already sampled. The events carry each value as it is produced; keeping them here is
    /// what makes that read whole. Live state, not persistence: the terminal event discards
    /// it, because the checkpoint then holds the same values.
    live_noise: Arc<StdMutex<Option<LiveNoise>>>,
}

/// One live run's per-scene Noise Detector values.
struct LiveNoise {
    run_id: String,
    project_id: String,
    video_id: String,
    values: BTreeMap<u32, f64>,
}

/// One batch in flight. Only ids are held: status is derived per video, and the batch's
/// remaining count is the list it has not started yet.
struct BatchRun {
    project_id: String,
    queue: VecDeque<String>,
    current: Option<String>,
    total: u32,
    stop: Arc<AtomicBool>,
}

/// How many events one run keeps for replay. The UI only needs the last screenful after a
/// reload, and a scene-dense encode emits a few events per scene.
const HISTORY_LIMIT: usize = 4096;

/// The fastest live progress is mirrored to SSE and the replay buffer.
///
/// Scene Detector reports every analysed frame and an encoder reports every progress line;
/// those rates are far above what a screen can paint. Logs and the timeline still see every
/// tick; this only bounds the disposable live stream. Scene checkpoints and every state
/// transition bypass the gate, so the rail and the final state never wait for it.
const LIVE_PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// The stream a progress tick belongs to. A pass, a step, and a worker each measure rate
/// independently; coalescing them together would hide all but one worker's progress.
#[derive(Debug, Hash, PartialEq, Eq)]
struct ProgressKey {
    sequence: Option<String>,
    phase: Option<String>,
    pass: Option<u8>,
    scene: Option<u32>,
}

/// Rate-limit disposable progress events without touching their durable records.
#[derive(Debug, Default)]
struct ProgressThrottle {
    last: HashMap<ProgressKey, Instant>,
}

impl ProgressThrottle {
    fn should_publish(&mut self, event: &EncodeEvent, now: Instant) -> bool {
        // A checkpoint is how the rail learns a scene exists; it is never disposable.
        if event.kind != EncodeEventKind::Progress || event.scene.is_some() {
            return true;
        }
        // A worker's scene ending names the scene and carries nothing to measure. It arrives
        // right behind that scene's last frame, inside the interval, so gating it would leave
        // the page listing a scene no worker holds for the rest of the run.
        if event.scene_index.is_some() && event.scene_progress.is_none() {
            return true;
        }
        let key = ProgressKey {
            sequence: event.sequence.clone(),
            phase: event.phase.clone(),
            pass: event.pass,
            scene: event.scene_index,
        };
        if self
            .last
            .get(&key)
            .is_some_and(|last| now.saturating_duration_since(*last) < LIVE_PROGRESS_INTERVAL)
        {
            return false;
        }
        self.last.insert(key, now);
        true
    }
}

struct RunHandle {
    run_id: String,
    project_id: String,
    video_id: String,
    cancel: Arc<AtomicBool>,
}

impl RunSupervisor {
    pub(crate) fn new(
        runner: Arc<dyn EncodeRunner>,
        timeline: Option<TimelineStore>,
        logs: Option<LogStore>,
        videos: Option<VideoStore>,
        settings: Option<SettingsStore>,
    ) -> Self {
        let (events, _) = broadcast::channel(256);
        Self {
            runner,
            lock: Arc::new(Mutex::new(None)),
            events,
            stage: Arc::new(StdMutex::new(None)),
            history: Arc::new(StdMutex::new((None, Vec::new()))),
            timeline,
            logs,
            retention: ChunkRetention::new(videos, settings),
            batch: Arc::new(StdMutex::new(None)),
            live_noise: Arc::new(StdMutex::new(None)),
        }
    }

    /// The batch a project is currently running, if any.
    pub(crate) fn batch_status(&self, project_id: &str) -> QueueBatchStatus {
        let batch = self
            .batch
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match batch.as_ref() {
            Some(batch) if batch.project_id == project_id => QueueBatchStatus {
                project_id: project_id.to_owned(),
                active: true,
                total: batch.total,
                remaining: u32::try_from(batch.queue.len()).unwrap_or(u32::MAX),
                current_video_id: batch.current.clone(),
            },
            _ => QueueBatchStatus {
                project_id: project_id.to_owned(),
                active: false,
                total: 0,
                remaining: 0,
                current_video_id: None,
            },
        }
    }

    /// Start a batch. A second batch, or a batch beside a live run, is refused: the queue
    /// drives the same singleton an explicit run uses.
    pub(crate) async fn begin_batch(
        &self,
        project_id: &str,
        video_ids: Vec<String>,
    ) -> Result<QueueBatchStatus, ()> {
        let lock = self.lock.lock().await;
        if lock.is_some() || video_ids.is_empty() {
            return Err(());
        }
        drop(lock);
        // The guard is scoped, not merely dropped: a `std::sync::MutexGuard` that is moved
        // out with `drop` still counts as live across the next await, and a handler's
        // future must stay `Send` for axum to accept it.
        {
            let mut batch = self
                .batch
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if batch.is_some() {
                return Err(());
            }
            let total = u32::try_from(video_ids.len()).unwrap_or(u32::MAX);
            *batch = Some(BatchRun {
                project_id: project_id.to_owned(),
                queue: video_ids.into(),
                current: None,
                total,
                stop: Arc::new(AtomicBool::new(false)),
            });
        }
        // A single run can reserve the singleton between the two checks. The batch would
        // then start nothing, so withdraw it instead of leaving an active batch beside an
        // unrelated run.
        if self.lock.lock().await.is_some() {
            self.end_batch(project_id);
            return Err(());
        }
        Ok(self.batch_status(project_id))
    }

    /// Take the next video for this batch, or `None` when the list is exhausted, the batch
    /// was stopped, or another project's batch replaced it.
    pub(crate) fn next_batch_video(&self, project_id: &str) -> Option<String> {
        let mut batch = self
            .batch
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let run = batch.as_mut()?;
        if run.project_id != project_id || run.stop.load(Ordering::SeqCst) {
            return None;
        }
        let next = run.queue.pop_front()?;
        run.current = Some(next.clone());
        Some(next)
    }

    /// Ask a project's batch to stop. The active run is cancelled separately by the route,
    /// so the batch cannot start another video after this one winds down.
    pub(crate) fn stop_batch(&self, project_id: &str) -> bool {
        let batch = self
            .batch
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match batch.as_ref() {
            Some(run) if run.project_id == project_id => {
                run.stop.store(true, Ordering::SeqCst);
                true
            }
            _ => false,
        }
    }

    /// Clear the batch once its loop has returned.
    pub(crate) fn end_batch(&self, project_id: &str) {
        let mut batch = self
            .batch
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if batch
            .as_ref()
            .is_some_and(|run| run.project_id == project_id)
        {
            *batch = None;
        }
    }

    /// Whether a batch for this project has been asked to stop.
    pub(crate) fn batch_stopped(&self, project_id: &str) -> bool {
        self.batch
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
            .is_some_and(|run| run.project_id == project_id && run.stop.load(Ordering::SeqCst))
    }

    /// Reserve the singleton, then hand the fully materialised request to the runner.
    ///
    /// The request carries the run id the caller already stamped on its checkpoint sink, so
    /// the log directory, the timeline, and the events agree on one id.
    pub(crate) async fn start(&self, request: EncodeRequest) -> Result<RunStarted, StartError> {
        let mut lock = self.lock.lock().await;
        if let Some(run) = lock.as_ref() {
            return Err(StartError::Busy(run.run_id.clone()));
        }

        let run_id = request.run_id.clone();
        let project_id = request.project_id.clone();
        let video_id = request.video_id.clone();
        // Whether this run is the one that produces the final output. Only then may the
        // opt-in `delete_chunks_on_success` setting discard the retained chunks.
        let finishes_output = request
            .sequences
            .iter()
            .any(|sequence| sequence == "SceneConcatenator");
        let finish_project_id = project_id.clone();
        let finish_video_id = video_id.clone();
        let event_run_id = run_id.clone();
        let event_project_id = project_id.clone();
        let event_video_id = video_id.clone();
        // The scene rows a checkpoint appends are labelled against the encoder this run
        // resolved, so a live row and the table read after the run agree on provenance.
        let event_encoder = request.encoder.clone();
        let handle = self
            .runner
            .start(request)
            .map_err(|error| StartError::Engine(error.to_string()))?;

        let cancel = Arc::clone(&handle.cancel);
        *lock = Some(RunHandle {
            run_id: run_id.clone(),
            project_id,
            video_id,
            cancel: Arc::clone(&cancel),
        });
        self.set_stage(Some(ActiveStage {
            run_id: run_id.clone(),
            sequence: None,
            progress: None,
            phase: None,
            pass: None,
        }));
        *self
            .history
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = (Some(run_id.clone()), Vec::new());
        drop(lock);

        // A log directory that cannot be created must not stop an encode: logging is
        // observability, not a prerequisite.
        let mut log = self.logs.as_ref().and_then(|store| {
            let meta = LogMeta {
                run_id: run_id.clone(),
                project_id: event_project_id.clone(),
                video_id: event_video_id.clone(),
                started_at: crate::project::videos::iso8601(crate::run::timeline::now_epoch()),
            };
            match store.open(&meta) {
                Ok(log) => Some(log),
                Err(error) => {
                    tracing::warn!(%error, run_id, "the run log could not be opened");
                    None
                }
            }
        });

        let (sender, receiver) = mpsc::unbounded_channel();
        let bridge = std::thread::Builder::new()
            .name(format!("encode-events-{run_id}"))
            .spawn({
                let stage = Arc::clone(&self.stage);
                let history = Arc::clone(&self.history);
                let timeline = self.timeline.clone();
                let run_id = event_run_id;
                let project_id = event_project_id;
                let video_id = event_video_id;
                move || {
                    let mut attempt: Option<Attempt> = None;
                    // Every run gets one terminal record, even when it fails before a
                    // sequence starts. That record is what makes the reason readable
                    // after the live event has gone.
                    let run_started = now_epoch();
                    let mut terminal = false;
                    let mut throttle = ProgressThrottle::default();
                    for event in handle.events {
                        // Every record reaches the file first, including the log-only
                        // detail and warning kinds. Those explain what a sequence produced,
                        // not what the run is doing now, so they stop here rather than
                        // reaching the stage, the timeline, the replay buffer or SSE.
                        if let Some(log) = log.as_mut() {
                            let record = record_for(&event, &project_id, &video_id);
                            if let Err(error) = log.append(&record) {
                                tracing::warn!(%error, run_id, "a run log line was not written");
                            }
                        }
                        let Some(wire) = wire_event(&event, &project_id, &video_id, &event_encoder)
                        else {
                            continue;
                        };
                        // The timeline is written before the stage is released: a terminal
                        // event's record has to exist by the time the run looks idle, or a
                        // delete issued the instant a run ends removes the log and then the
                        // record arrives to re-create the History card.
                        // The timeline is written from this thread, which is not an async
                        // context, so an append cannot stall the runtime.
                        if let Some(store) = &timeline {
                            match event.kind {
                                EngineEventKind::Started => {
                                    if let Some(open) = attempt.take() {
                                        let entry = open.finish("cancelled", None);
                                        let _ = store.append(&project_id, &video_id, &entry);
                                    }
                                    attempt = event
                                        .sequence
                                        .as_deref()
                                        .map(|sequence| Attempt::start(&run_id, sequence));
                                }
                                EngineEventKind::Progress => {
                                    if let Some(open) = attempt.as_mut()
                                        && open.sequence == event.sequence.as_deref().unwrap_or("")
                                    {
                                        open.observe(event.frames_processed, event.frames_total);
                                    }
                                }
                                EngineEventKind::Completed => {
                                    if let Some(open) = attempt.take() {
                                        let entry = open.finish("completed", None);
                                        let _ = store.append(&project_id, &video_id, &entry);
                                    }
                                }
                                // A log-only record never opens, closes, or attributes a
                                // timeline attempt; it describes one that already ran.
                                EngineEventKind::Detail | EngineEventKind::Warning => {}
                                EngineEventKind::Cancelled
                                | EngineEventKind::Failed
                                | EngineEventKind::Finished => {
                                    // The engine closes a cancelled run with `Cancelled` and
                                    // then a `Finished` marker. Both are terminal, but a run
                                    // has one outcome: the first terminal event wins, so a
                                    // cancellation is never rewritten as a completion. The
                                    // later marker is still broadcast; only its timeline
                                    // record is dropped.
                                    if !terminal {
                                        terminal = true;
                                        let outcome = match event.kind {
                                            EngineEventKind::Failed => "failed",
                                            EngineEventKind::Cancelled => "cancelled",
                                            _ => "completed",
                                        };
                                        if let Some(open) = attempt.take() {
                                            let entry = open.finish(
                                                outcome,
                                                (event.kind != EngineEventKind::Finished)
                                                    .then(|| event.message.clone()),
                                            );
                                            let _ = store.append(&project_id, &video_id, &entry);
                                        }
                                        let entry = TimelineEntry {
                                            run_id: run_id.clone(),
                                            sequence: None,
                                            started_at: crate::project::videos::iso8601(
                                                run_started,
                                            ),
                                            ended_at: crate::project::videos::iso8601(now_epoch()),
                                            outcome: outcome.to_owned(),
                                            frames_processed: None,
                                            frames_total: None,
                                            fps: None,
                                            message: Some(event.message.clone()),
                                        };
                                        let _ = store.append(&project_id, &video_id, &entry);
                                    }
                                }
                            }
                        }
                        update_stage(&stage, &event);
                        if !throttle.should_publish(&wire, Instant::now()) {
                            continue;
                        }
                        {
                            let mut buffer = history
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner());
                            if buffer.1.len() >= HISTORY_LIMIT {
                                buffer.1.remove(0);
                            }
                            buffer.1.push(wire.clone());
                        }
                        if sender.send(wire).is_err() {
                            break;
                        }
                    }

                    // A worker that vanished mid-sequence still attempted that sequence,
                    // and the run itself needs a terminal record so its silence is not
                    // mistaken for a run that never happened.
                    if let Some(open) = attempt.take() {
                        let entry = open.finish("cancelled", None);
                        if let Some(store) = &timeline {
                            let _ = store.append(&project_id, &video_id, &entry);
                        }
                    }
                    if !terminal && let Some(store) = &timeline {
                        let entry = TimelineEntry {
                            run_id,
                            sequence: None,
                            started_at: crate::project::videos::iso8601(run_started),
                            ended_at: crate::project::videos::iso8601(now_epoch()),
                            outcome: "failed".to_owned(),
                            frames_processed: None,
                            frames_total: None,
                            fps: None,
                            message: Some("The run ended without a terminal event.".to_owned()),
                        };
                        let _ = store.append(&project_id, &video_id, &entry);
                    }
                }
            });

        if let Err(error) = bridge {
            // The bridge could not start, so stop the runner before releasing its lock;
            // otherwise a second run could start while the first still encodes.
            cancel.store(true, Ordering::SeqCst);
            self.release(&run_id).await;
            return Err(StartError::Engine(error.to_string()));
        }

        tokio::spawn(forward_events(
            self.clone(),
            run_id.clone(),
            finish_project_id,
            finish_video_id,
            finishes_output,
            receiver,
        ));
        Ok(RunStarted { run_id })
    }

    pub(crate) async fn config_locked(&self) -> bool {
        self.lock.lock().await.is_some()
    }

    /// Whether an encode in *this project* holds the project-configuration lock.
    ///
    /// A run snapshots its encoder and sequence documents when it starts, so another
    /// project's configuration cannot affect it. This check covers documents that every
    /// video in the project inherits: applying a template, restoring defaults, and editing
    /// General or a project section. Those writes would change what the running video reads
    /// on its next sequence, so the whole project stays read-only.
    pub(crate) async fn config_locked_for(&self, project_id: &str) -> bool {
        self.lock
            .lock()
            .await
            .as_ref()
            .is_some_and(|run| run.project_id == project_id)
    }

    /// Whether *this video* is the one the active run is encoding.
    ///
    /// A video's own General, overrides, storage, scenes, and sequence data do not belong to
    /// any other queue row. Locking them by project would freeze every sibling while one
    /// video runs, even though editing a sibling cannot change the document the worker
    /// already holds. The process-wide singleton still refuses a second start.
    pub(crate) async fn config_locked_for_video(&self, project_id: &str, video_id: &str) -> bool {
        self.lock
            .lock()
            .await
            .as_ref()
            .is_some_and(|run| run.project_id == project_id && run.video_id == video_id)
    }

    /// The live run's stage, if any. Reads do not await and never block the encoder.
    pub(crate) fn stage(&self) -> Option<ActiveStage> {
        self.stage
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    /// Cancel the run for one video. Cancelling by project and video rather than by run id
    /// keeps the route's address the same as the resource it acts on.
    pub(crate) async fn cancel_video(&self, project_id: &str, video_id: &str) -> Option<String> {
        let lock = self.lock.lock().await;
        if let Some(run) = lock.as_ref()
            && run.project_id == project_id
            && run.video_id == video_id
        {
            run.cancel.store(true, Ordering::SeqCst);
            return Some(run.run_id.clone());
        }
        None
    }

    /// The project and video a live run belongs to, for per-video derived state.
    pub(crate) async fn active_video(&self) -> Option<(String, String)> {
        self.lock
            .lock()
            .await
            .as_ref()
            .map(|run| (run.project_id.clone(), run.video_id.clone()))
    }

    /// Ask the active run to stop. The lock stays held until its terminal event arrives.
    pub(crate) async fn cancel(&self, run_id: &str) -> bool {
        let lock = self.lock.lock().await;
        if let Some(run) = lock.as_ref()
            && run.run_id == run_id
        {
            run.cancel.store(true, Ordering::SeqCst);
            return true;
        }
        false
    }

    /// Cancel whatever is running during host shutdown, and stop a batch so it cannot
    /// start the next video while the host is going away.
    pub(crate) async fn cancel_active(&self) -> bool {
        {
            let batch = self
                .batch
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(batch) = batch.as_ref() {
                batch.stop.store(true, Ordering::SeqCst);
            }
        }
        let lock = self.lock.lock().await;
        if let Some(run) = lock.as_ref() {
            run.cancel.store(true, Ordering::SeqCst);
            return true;
        }
        false
    }

    /// Wait for a cancelled worker to publish its terminal event and release the lock.
    pub(crate) async fn wait_for_idle(&self, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        loop {
            if self.lock.lock().await.is_none() {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    pub(crate) fn subscribe(&self) -> broadcast::Receiver<EncodeEvent> {
        self.events.subscribe()
    }

    /// Events of the most recently buffered run with `seq` at or above `since`.
    ///
    /// This is what an SSE reconnect can use: the `Last-Event-ID` header carries only the
    /// sequence number, and during a run there is exactly one run it can belong to.
    pub(crate) fn replay_latest(&self, since: u64) -> Option<Vec<EncodeEvent>> {
        self.replay_from(None, since)
    }

    /// Events of the buffered run with `seq` at or above `since`, or `None` when the
    /// requested run is not the buffered one.
    pub(crate) fn replay(&self, run_id: &str, since: u64) -> Option<Vec<EncodeEvent>> {
        self.replay_from(Some(run_id), since)
    }

    fn replay_from(&self, run_id: Option<&str>, since: u64) -> Option<Vec<EncodeEvent>> {
        let buffer = self
            .history
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (buffered, events) = &*buffer;
        match run_id {
            Some(requested) if buffered.as_deref() != Some(requested) => return None,
            None if buffered.is_none() => return None,
            _ => {}
        }
        Some(
            events
                .iter()
                .filter(|event| event.seq >= since)
                .cloned()
                .collect(),
        )
    }

    fn publish(&self, event: EncodeEvent) {
        self.track_live_noise(&event);
        let _ = self.events.send(event);
    }

    /// Keep the per-scene measurements the live run has reported so far.
    ///
    /// A started event replaces the previous run's tally, so two runs' values can never
    /// mix; a terminal event discards it. Everything else only adds a scene's value, which
    /// is the one thing a scene-table read cannot get from the checkpoint mid-run.
    fn track_live_noise(&self, event: &EncodeEvent) {
        let mut live = self
            .live_noise
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if event.kind.is_terminal() {
            if live
                .as_ref()
                .is_some_and(|live| live.run_id == event.run_id)
            {
                *live = None;
            }
            return;
        }
        if event.kind == EncodeEventKind::Started
            && event.sequence.as_deref() == Some("NoiseDetector")
        {
            *live = Some(LiveNoise {
                run_id: event.run_id.clone(),
                project_id: event.project_id.clone(),
                video_id: event.video_id.clone(),
                values: BTreeMap::new(),
            });
            return;
        }
        let Some((index, value)) = event.scene_index.zip(event.scene_noise) else {
            return;
        };
        let entry = live.get_or_insert_with(|| LiveNoise {
            run_id: event.run_id.clone(),
            project_id: event.project_id.clone(),
            video_id: event.video_id.clone(),
            values: BTreeMap::new(),
        });
        if entry.run_id == event.run_id {
            entry.values.insert(index, value);
        }
    }

    /// The measurements this video's live run has produced so far, by scene index.
    pub(crate) fn live_noise(&self, project_id: &str, video_id: &str) -> BTreeMap<u32, f64> {
        let live = self
            .live_noise
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match live.as_ref() {
            Some(live) if live.project_id == project_id && live.video_id == video_id => {
                live.values.clone()
            }
            _ => BTreeMap::new(),
        }
    }

    fn set_stage(&self, stage: Option<ActiveStage>) {
        *self
            .stage
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = stage;
    }

    /// Release the singleton only when the finished run still owns it, so a stale
    /// forwarder cannot release a newer run.
    async fn release(&self, run_id: &str) {
        let mut lock = self.lock.lock().await;
        if lock
            .as_ref()
            .is_some_and(|run| run.run_id.as_str() == run_id)
        {
            *lock = None;
        }
        drop(lock);
        if self
            .stage()
            .is_none_or(|stage| stage.run_id.as_str() == run_id)
        {
            self.set_stage(None);
        }
    }

    /// Apply the chunk-retention policy once a run that produced the final output
    /// finishes.
    ///
    /// Retained chunks are the default because they make a later Quality Check and a
    /// partial re-encode possible. Deletion happens only when the user asked for it and
    /// only after the output exists and is non-empty; a failed or cancelled run keeps
    /// everything it produced.
    async fn delete_chunks_after_success(&self, project_id: &str, video_id: &str) {
        self.retention
            .after_final_output(project_id, video_id)
            .await;
    }
}

/// Keep the stage snapshot in step with the event stream.
#[cfg(test)]
mod tests;
