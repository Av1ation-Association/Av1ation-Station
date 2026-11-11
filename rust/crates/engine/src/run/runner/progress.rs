//! Engine progress translation, resume tallies, and event construction.

use super::*;
use andean_condor::models::sequence::quality_check::QualityCheckConfig;

/// The part of a sequence's work that an earlier attempt already finished.
///
/// Two sequences run only the remainder: Parallel Encoder queues the scenes without a
/// chunk, and Quality Check scores only the scenes without scores. Each reports its tick
/// against that remainder, so a resumed run restarted a bar the user had already watched
/// fill. This holds the frozen prefix — read from the table the engine was opened with —
/// and places each tick on the video's own span.
pub(super) enum Resume {
    /// Parallel Encoder: the scene count, plus frames in the video's coordinates.
    Encoder(SceneTally),
    /// Quality Check: sampled frames already scored, out of the video's sampled frames.
    Scored {
        done: f64,
        total: f64,
        quality: QualityTally,
    },
}

impl Resume {
    /// The prefix the named sequence starts from, or `None` when it always runs everything.
    pub(super) fn for_sequence(
        id: &str,
        scenes: &[Scene<DefaultSequenceData>],
        config: &RunnerConfig,
    ) -> Option<Self> {
        match id {
            "ParallelEncoder" => Some(Self::Encoder(SceneTally::of(scenes))),
            "QualityCheck" => Self::scored(scenes, config),
            _ => None,
        }
    }

    /// Quality Check's span, from the strategy that picks frames and the scores already saved.
    pub(super) fn scored(
        scenes: &[Scene<DefaultSequenceData>],
        config: &RunnerConfig,
    ) -> Option<Self> {
        let check = config.quality_check.as_ref()?;
        let mut done = 0.0;
        let mut total = 0.0;
        let mut done_scenes = 0;
        for scene in scenes {
            let sampled_count = check
                .strategy
                .frame_indices(scene.start_frame, scene.end_frame)
                .len();
            let sampled = sampled_count as f64;
            total += sampled;
            // A scene is scored as a whole: a partial set is measured again, so only a
            // complete one counts toward the prefix.
            let scored = scene
                .sequence_data
                .get_quality_check()
                .map_or(0, |data| data.quality.scores.len());
            if sampled_count > 0 && scored == sampled_count {
                done += sampled;
                done_scenes += 1;
            }
        }
        (total > 0.0).then(|| Self::Scored {
            done,
            total,
            quality: QualityTally::new(scenes, check, done_scenes),
        })
    }

    /// Record one frame score and publish the scene's mean once every sampled frame is in.
    ///
    /// Quality Check emits a `FrameScore` for every frame it scores, but only some engine
    /// paths emit a final `SceneQuality` child. Native and VMAF scoring emit only the frames,
    /// so the runner has to complete the scene itself or the chart stays empty until the
    /// checkpoint lands after the whole run.
    pub(super) fn observe_quality(&mut self, status: &SequenceStatus) -> Option<(u32, f64)> {
        let Self::Scored { quality, .. } = self else {
            return None;
        };
        let SequenceStatus::Subprocess {
            child: Status::Processing { completion, .. },
            ..
        } = status
        else {
            return None;
        };
        quality.observe(completion)
    }

    /// The full-video sampled frames for a Quality Check tick.
    ///
    /// The engine reports only the frames this run still has to score. Adding the prefix the
    /// resume already finished gives the status line the same span as its progress bar, so
    /// its rate covers continuous counters and its ETA divides only the pending samples.
    pub(super) fn quality_frames(&self, status: &SequenceStatus) -> Option<(u64, u64)> {
        let Self::Scored { done, total, .. } = self else {
            return None;
        };
        let SequenceCompletion::Custom { completed, .. } = parent_completion(status)? else {
            return None;
        };
        if *total <= 0.0 {
            return None;
        }
        let processed = (*done + *completed).clamp(0.0, *total);
        Some((processed as u64, *total as u64))
    }

    /// The scenes this Quality Check run has scored, out of the full video.
    pub(super) fn quality_scenes(&self) -> Option<(u32, u32)> {
        let Self::Scored { quality, .. } = self else {
            return None;
        };
        quality.reported()
    }

    /// Count one finished scene, for the sequence that reports scenes through the stream.
    pub(super) fn observe(&mut self, status: &SequenceStatus) {
        if let Self::Encoder(tally) = self {
            tally.observe(status);
        }
    }

    /// Place an encoder tick on the video's span; `None` for the other sequences.
    pub(super) fn apply(&mut self, live: &mut Live) -> Option<(u32, u32)> {
        let Self::Encoder(tally) = self else {
            return None;
        };
        if let Some(frames) = live.frames
            && let Some(whole) = tally.reseat(frames)
        {
            live.frames = Some(whole);
            live.progress = Some((whole.0 as f64 / whole.1 as f64) * 100.0);
        }
        tally.reported()
    }

    /// Quality Check's percentage with the frames earlier attempts scored added back.
    ///
    /// Its tick counts the pending frames as its own total, so `25 / 100` after three
    /// quarters of the video was scored is really `325 / 400`.
    pub(super) fn rescore(&self, status: &SequenceStatus) -> Option<f64> {
        let Self::Scored { done, total, .. } = self else {
            return None;
        };
        let completion = parent_completion(status)?;
        let SequenceCompletion::Custom { completed, .. } = completion else {
            return None;
        };
        (*total > 0.0).then(|| ((done + completed) / total) * 100.0)
    }
}

/// The completion carried by a sequence's own status, without a child step's completion.
fn parent_completion(status: &SequenceStatus) -> Option<&SequenceCompletion> {
    match status {
        SequenceStatus::Whole(Status::Processing { completion, .. })
        | SequenceStatus::Subprocess {
            parent: Status::Processing { completion, .. },
            ..
        } => Some(completion),
        _ => None,
    }
}

/// Per-scene accumulation for Quality Check's frame stream.
#[derive(Debug, Default, Clone)]
pub(super) struct QualityTally {
    scenes: Vec<QualityScene>,
    done: u32,
    total: u32,
}

#[derive(Debug, Clone)]
struct QualityScene {
    start: u64,
    end: u64,
    expected: usize,
    seen: usize,
    sum: f64,
}

impl QualityTally {
    /// Build the expected sampled-frame count from the same strategy the engine uses.
    fn new(scenes: &[Scene<DefaultSequenceData>], check: &QualityCheckConfig, done: u32) -> Self {
        let mut total = 0;
        let scenes = scenes
            .iter()
            .map(|scene| {
                let expected = check
                    .strategy
                    .frame_indices(scene.start_frame, scene.end_frame)
                    .len();
                if expected > 0 {
                    total += 1;
                }
                QualityScene {
                    start: scene.start_frame as u64,
                    end: scene.end_frame as u64,
                    expected,
                    seen: 0,
                    sum: 0.0,
                }
            })
            .collect();
        Self {
            scenes,
            done,
            total,
        }
    }

    fn reported(&self) -> Option<(u32, u32)> {
        (self.total > 0).then_some((self.done, self.total))
    }

    /// Add one frame score, returning the completed scene's mean when it is whole.
    fn observe(&mut self, completion: &SequenceCompletion) -> Option<(u32, f64)> {
        let SequenceCompletion::FrameScore { frame, score } = completion else {
            return None;
        };
        let index = self.scenes.partition_point(|scene| scene.end <= *frame);
        let scene = self.scenes.get_mut(index)?;
        if *frame < scene.start || scene.expected == 0 || scene.seen >= scene.expected {
            return None;
        }
        scene.seen += 1;
        scene.sum += *score;
        if scene.seen < scene.expected {
            return None;
        }
        self.done = self.done.saturating_add(1);
        Some((
            u32::try_from(index).unwrap_or(u32::MAX),
            scene.sum / scene.seen as f64,
        ))
    }
}

/// How much of the whole video a Parallel Encoder run has covered.
///
/// Parallel Encoder queues only the scenes that still lack a chunk, so its own tick counts
/// the work this run has left and carries no scene count at all. A reader needs both figures
/// against the video: how many scenes are done, and where the frame bar sits in the video's
/// own span. The tally supplies them, seeded from the scenes earlier runs wrote, so a
/// resumed run continues the bar instead of restarting it.
pub(super) struct SceneTally {
    pub(super) total: u32,
    pub(super) done: u32,
    /// Frames every scene of the video holds, in the video's own coordinates.
    pub(super) total_frames: u64,
    /// Scenes already counted, so a scene that reports completion twice cannot inflate it.
    pub(super) seen: HashSet<u32>,
}

impl SceneTally {
    /// The video's scene count and frame span, and how many scenes already carry a chunk.
    pub(super) fn of(scenes: &[Scene<DefaultSequenceData>]) -> Self {
        let frames = |scene: &Scene<DefaultSequenceData>| {
            scene.end_frame.saturating_sub(scene.start_frame) as u64
        };
        let done = scenes
            .iter()
            .filter(|scene| {
                scene
                    .sequence_data
                    .get_parallel_encoder()
                    .is_ok_and(|data| data.bytes.is_some())
            })
            .count();
        Self {
            total: scenes.len() as u32,
            done: done as u32,
            total_frames: scenes.iter().map(frames).sum(),
            seen: HashSet::new(),
        }
    }

    /// Place one tick's frame pair on the video's span instead of this run's.
    ///
    /// The engine queues every scene without a written chunk, so the frames this run reports
    /// as its total are the video's frames minus the scenes earlier runs finished. Adding that
    /// difference to the run's completed count is what makes `3,441 / 3,850` read as
    /// `38,591 / 39,000` on a video whose last five scenes were left. `None` when the video
    /// has no frame span to place the tick against.
    pub(super) fn reseat(&self, (completed, total): (u64, u64)) -> Option<(u64, u64)> {
        if self.total_frames == 0 || total == 0 {
            return None;
        }
        let before = self.total_frames.saturating_sub(total);
        Some((
            before.saturating_add(completed).min(self.total_frames),
            self.total_frames,
        ))
    }

    /// Count one finished scene. The engine reports it as its own `Completed` child, which
    /// is also what clears the worker from the page's active list.
    pub(super) fn observe(&mut self, status: &SequenceStatus) {
        let SequenceStatus::Subprocess {
            child: Status::Completed { id },
            ..
        } = status
        else {
            return;
        };
        let Ok(scene) = id.parse::<u32>() else {
            return;
        };
        if self.seen.insert(scene) {
            self.done = self.done.saturating_add(1);
        }
    }

    /// The scenes finished and expected, for the aggregate tick.
    pub(super) fn reported(&self) -> Option<(u32, u32)> {
        (self.total > 0).then_some((self.done, self.total))
    }
}

pub(super) fn forward_progress(
    sender: &Sender<EncodeEvent>,
    run_id: &str,
    seq_no: &AtomicU64,
    sequence: &str,
    event: SequenceProgressEvent,
    mut resume: Option<&mut Resume>,
) {
    // A finished scene's byte size arrives as a `Custom` pair of two equal numbers. It is a
    // measurement of what a scene produced, not of how far the sequence has come, so it
    // goes to the log and never to the bar: as progress it read 100%, and as a tick with no
    // phase it also restarted the client's rate window, which is why Parallel Encoder's FPS
    // and ETA disappeared every time a worker finished a scene.
    if let SequenceStatus::Whole(Status::Processing {
        id,
        completion: SequenceCompletion::Custom {
            name, completed, ..
        },
        ..
    }) = &event.progress
        && name == "size"
    {
        // Scene ids are zero-based; a log line numbers them the way the table does.
        let scene = id
            .parse::<u32>()
            .map_or_else(|_| id.clone(), |index| index.saturating_add(1).to_string());
        emit(
            sender,
            run_id,
            seq_no,
            EventNote {
                kind: EncodeEventKind::Detail,
                sequence: Some(sequence),
                progress: None,
                message: format!(
                    "{sequence}: Scene {scene} wrote {} bytes",
                    *completed as u64
                ),
                frames: None,
                level: Some("debug"),
                live: Live::default(),
            },
        );
        return;
    }
    let mut live = describe(&event.progress);
    let mut quality = None;
    let mut tracks_quality = false;
    // A sequence that counts its own scenes keeps that count; Parallel Encoder reports
    // frames, so the tally counted beside the stream is what fills in the scene figure.
    let mut scenes = None;
    if let Some(resume) = resume.as_mut() {
        tracks_quality = matches!(resume, Resume::Scored { .. });
        resume.observe(&event.progress);
        // The frame pair, the percentage, and the ETA beside it all have to describe the
        // video, or the scene tally above them counts one span and the frames another.
        if let Some(percent) = resume.rescore(&event.progress) {
            live.progress = Some(percent);
        }
        scenes = resume.apply(&mut live);
        quality = resume.observe_quality(&event.progress);
        if let Some(frames) = resume.quality_frames(&event.progress) {
            live.frames = Some(frames);
        }
    }
    if live.scenes.is_none() {
        live.scenes = scenes.or_else(|| resume.as_deref().and_then(Resume::quality_scenes));
    }
    // Only Noise Detector's per-scene result measures the video's noise, and only Quality
    // Check's measures its quality. Target Quality reuses the same child shape for probe
    // scores, which its passes already carry, so its ticks must claim neither value.
    if sequence != "NoiseDetector" {
        live.noise = None;
    }
    if sequence == "QualityCheck" && tracks_quality {
        // The runner's mean is the value the scene table will hold after the checkpoint.
        // The engine may also send a `SceneQuality` child from its plugin path; publishing
        // both would apply the same scene twice.
        live.quality = quality;
    } else if sequence != "QualityCheck" {
        live.quality = None;
    }
    let stage = match event.sequence_type {
        SequenceType::Validation => "validating",
        SequenceType::Initialization => "preparing",
        SequenceType::Processing => "processing",
    };
    emit(
        sender,
        run_id,
        seq_no,
        EventNote {
            kind: EncodeEventKind::Progress,
            sequence: Some(sequence),
            progress: live.progress,
            message: format!("{sequence} {stage}: {}", live.message),
            frames: live.frames,
            // Preparation and validation describe the run's setup; the processing sweep is
            // one line per tick, which only a trace-level reader wants.
            level: Some(if matches!(event.sequence_type, SequenceType::Processing) {
                "trace"
            } else {
                "debug"
            }),
            live,
        },
    );
}

/// What one sequence tick says beyond its percentage.
///
/// A sequence that runs workers or passes reports a `Subprocess`: the parent is the whole
/// sequence's own bar, and the child is one scene's or one step's share of it. Reading the
/// child alone is what made Parallel Encoder's first scene show as the whole encode.
#[derive(Debug, Default, Clone, PartialEq)]
pub(super) struct Live {
    pub(super) progress: Option<f64>,
    pub(super) frames: Option<(u64, u64)>,
    pub(super) message: String,
    /// The step or worker this tick belongs to.
    pub(super) phase: Option<String>,
    /// The 1-based pass, when the sequence runs passes.
    pub(super) pass: Option<u8>,
    /// The most passes the sequence may run, when it names a ceiling.
    pub(super) max_passes: Option<u8>,
    /// Scenes finished and expected, for a sequence that counts scenes.
    pub(super) scenes: Option<(u32, u32)>,
    /// The one scene a worker is encoding.
    pub(super) scene: Option<u32>,
    /// That scene's own percentage.
    pub(super) scene_progress: Option<f64>,
    /// That scene's own frames, processed and expected.
    pub(super) scene_frames: Option<(u64, u64)>,
    /// The scene a per-scene measurement belongs to, and the value measured.
    ///
    /// Noise Detector reports one sampled value per scene. It is evidence about the video,
    /// not a completion value, so it never divides a bar; carrying it is what lets the
    /// measured-data charts plot each scene as it is measured.
    pub(super) noise: Option<(u32, f64)>,
    /// The scene Quality Check scored, and the score it measured.
    ///
    /// Quality Check reports the same child shape as Noise Detector. Its chart reads the
    /// scene table's `quality_score`, so carrying the value here is what lets the scores
    /// appear while the sequence is still running.
    pub(super) quality: Option<(u32, f64)>,
}

/// Read one engine status without losing the parent bar.
pub(super) fn describe(status: &SequenceStatus) -> Live {
    let (whole, child) = match status {
        SequenceStatus::Whole(whole) => (whole, None),
        SequenceStatus::Subprocess { parent, child } => (parent, Some(child)),
    };
    let mut live = Live::default();
    let parent_completion = match whole {
        Status::Processing { id, completion, .. } => {
            let measured = measure(completion);
            live.progress = measured.progress;
            live.frames = measured.frames;
            live.scenes = measured.scenes;
            live.message = id.clone();
            Some(completion)
        }
        // `initialize` reports `Completed` when its preparation is over; the sequence's own
        // terminal event is what reaches 100. Sending that stage marker as 100 made every
        // bar fill during preparation and fall back when processing began.
        Status::Completed { id } => {
            live.message = id.clone();
            None
        }
        Status::Failed { id, error, .. } => {
            live.message = format!("{id}: {error}");
            None
        }
    };

    let Some(child) = child else {
        return live;
    };
    // A worker names itself after the scene it encodes; a step names itself `Encode`,
    // `Compare`, or `Quality`.
    let mut child_completion = None;
    match child {
        Status::Processing { id, completion, .. } => {
            live.scene = id.parse::<u32>().ok();
            live.phase = Some(id.clone());
            child_completion = Some(completion);
        }
        Status::Completed { id } => {
            live.scene = id.parse::<u32>().ok();
            live.phase = Some(id.clone());
        }
        Status::Failed { id, error, .. } => {
            live.phase = Some(format!("{id}: {error}"));
        }
    }

    if let Some(completion) = child_completion {
        let measured = measure(completion);
        // A scene's reported quality is that scene's own measured value. Only the caller
        // knows which sequence produced it; `forward_progress` keeps it under the name that
        // sequence's page reads.
        if let SequenceCompletion::SceneQuality { index, score, .. } = completion {
            let scene = u32::try_from(*index).unwrap_or(u32::MAX);
            live.noise = Some((scene, *score));
            live.quality = Some((scene, *score));
        }
        if let SequenceCompletion::PassFrames { passes, .. } = completion {
            live.pass = Some(passes.0);
            live.max_passes = Some(passes.1);
        }
        // A worker's child status is that one scene's own bar, whatever shape it takes.
        if matches!(
            completion,
            SequenceCompletion::Percentage(_)
                | SequenceCompletion::Frames { .. }
                | SequenceCompletion::PassFrames { .. }
        ) {
            live.scene_progress = measured.progress;
            // A worker's child status counts frames inside its own scene. Carrying the pair
            // is what lets the page report that scene's rate and finish estimate while the
            // aggregate counters describe the whole encode.
            if live.scene.is_some() {
                live.scene_frames = measured.frames;
            }
        }
        // A worker's own bar is a detail; the sequence's bar comes from the parent.
        if live.frames.is_none() {
            live.frames = measured.frames;
        }
        if live.scenes.is_none() {
            live.scenes = measured.scenes;
        }
        // Target Quality reports passes over the same scenes: each pass encodes, then
        // compares, and each step reports its own 0-100. The pass count cannot divide the
        // bar. The sequence stops as soon as every scene meets its target, which happens
        // after one pass as readily as after the configured maximum, so a percentage spread
        // over that maximum would promise a run length the engine never promised. The bar is
        // the step's own progress instead, filling twice per pass.
        if let Some(SequenceCompletion::Passes { completed, total }) = parent_completion {
            if live.pass.is_none() {
                live.pass = Some(*completed);
                live.max_passes = Some(*total);
            }
            live.progress = measured.progress;
        } else if live.progress.is_none() {
            live.progress = measured.progress;
        }
    }

    live
}

/// One completion value, as the three things the UI can show.
#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub(super) struct Measured {
    pub(super) progress: Option<f64>,
    pub(super) frames: Option<(u64, u64)>,
    pub(super) scenes: Option<(u32, u32)>,
}

pub(super) fn measure(completion: &SequenceCompletion) -> Measured {
    let ratio = |completed: u64, total: u64| {
        if total == 0 {
            None
        } else {
            Some((completed as f64 / total as f64) * 100.0)
        }
    };
    match completion {
        SequenceCompletion::Percentage(percent) => Measured {
            progress: Some(*percent),
            ..Measured::default()
        },
        SequenceCompletion::Scenes { completed, total } => Measured {
            progress: ratio(*completed, *total),
            frames: None,
            scenes: Some((
                u32::try_from(*completed).unwrap_or(u32::MAX),
                u32::try_from(*total).unwrap_or(u32::MAX),
            )),
        },
        SequenceCompletion::Frames { completed, total }
        | SequenceCompletion::PassFrames {
            frames: (completed, total),
            ..
        } => Measured {
            progress: ratio(*completed, *total),
            frames: Some((*completed, *total)),
            scenes: None,
        },
        // A pass counter is not a completion: Target Quality's total is the configured
        // maximum, and a run can finish in one pass. `(pass - 1) / pass` (what the engine
        // sends before a pass) also read as two thirds of a three-pass run, which then fell
        // back to 0 when the pass's encode step began.
        SequenceCompletion::Passes { .. } => Measured::default(),
        // A measured result is evidence, not completion: the parent status carries the bar.
        SequenceCompletion::SceneQuality { .. } | SequenceCompletion::FrameScore { .. } => {
            Measured::default()
        }
        // AVSceneChange reports one extra progress value per detected scene as
        // `completed: scene_start, total: scene_end`. That ratio can sit near 100% while the
        // real frame sweep is at 5%, then the next frame progress falls back to 5%, which
        // makes the bar leap forward and shrink. The checkpoint write is the new-scene
        // signal; it carries no usable completion value, so it contributes no progress.
        SequenceCompletion::Custom { name, .. } if name == "new-scene" => Measured::default(),
        // Parallel Encoder reports a finished scene's byte size as a `Custom` pair whose two
        // halves are the same number. Read as a ratio it is 100%, so the encode's own bar
        // jumped to 100 at the first finished scene, and both the service's stage snapshot
        // and the cached state are monotonic and held it there for the rest of the run.
        // Bytes measure output, not completion.
        SequenceCompletion::Custom { name, .. } if name == "size" => Measured::default(),
        // `Custom` is the engine's escape hatch for any measured pair: indexing (0/1),
        // frame positions (Scene Detector's new-scene marker), byte counts, and frame
        // counts all use it. Noise Detector is the one sequence whose pair is a scene
        // tally (one sampled frame per scene); everything else is only a percentage.
        // Treating every pair as scenes made Scene Detector's indexing tick read as
        // `0/1 scenes` for the rest of the run.
        SequenceCompletion::Custom {
            name,
            completed,
            total,
        } => Measured {
            progress: if *total > 0.0 {
                Some((completed / total) * 100.0)
            } else {
                None
            },
            frames: None,
            scenes: (name == "Noise Detector").then_some((*completed as u32, *total as u32)),
        },
    }
}

/// The sequence-independent payload of one engine event.
pub(super) struct EventNote<'a> {
    pub(super) kind: EncodeEventKind,
    pub(super) sequence: Option<&'a str>,
    pub(super) progress: Option<f64>,
    pub(super) message: String,
    pub(super) frames: Option<(u64, u64)>,
    pub(super) level: Option<&'a str>,
    pub(super) live: Live,
}

pub(super) fn emit(
    sender: &Sender<EncodeEvent>,
    run_id: &str,
    seq_no: &AtomicU64,
    note: EventNote<'_>,
) {
    let seq = seq_no.fetch_add(1, Ordering::SeqCst);
    let _ = sender.send(EncodeEvent {
        run_id: run_id.to_owned(),
        seq,
        at: now_iso(),
        kind: note.kind,
        sequence: note.sequence.map(str::to_owned),
        progress: note.progress,
        message: note.message,
        level: note.level.map(str::to_owned),
        frames_processed: note.frames.map(|(processed, _)| processed),
        frames_total: note.frames.map(|(_, total)| total),
        phase: note.live.phase,
        pass: note.live.pass,
        max_passes: note.live.max_passes,
        scenes_processed: note.live.scenes.map(|(processed, _)| processed),
        scenes_total: note.live.scenes.map(|(_, total)| total),
        // A measurement names its own scene; a worker's tick names the one it holds.
        scene_index: note
            .live
            .scene
            .or_else(|| note.live.noise.map(|(index, _)| index))
            .or_else(|| note.live.quality.map(|(index, _)| index)),
        scene_progress: note.live.scene_progress,
        scene_frames_processed: note.live.scene_frames.map(|(processed, _)| processed),
        scene_frames_total: note.live.scene_frames.map(|(_, total)| total),
        // A tick describes work in flight; a finished chunk is its own event, emitted by
        // the checkpoint that recorded it.
        scene_bytes: None,
        scene_encode_ms: None,
        scene_noise: note.live.noise.map(|(_, value)| value),
        scene_quality: note.live.quality.map(|(_, value)| value),
        scene: None,
    });
}

pub(super) fn now_iso() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let days = (seconds / 86_400) as i64;
    let seconds_of_day = seconds % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        seconds_of_day / 3_600,
        (seconds_of_day % 3_600) / 60,
        seconds_of_day % 60
    )
}

pub(super) fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_index + 2) / 5 + 1) as u32;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    } as u32;
    if month <= 2 {
        year += 1;
    }
    (year, month, day)
}
