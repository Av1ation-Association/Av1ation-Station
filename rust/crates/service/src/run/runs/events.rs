use super::*;

pub(super) fn update_stage(stage: &Arc<StdMutex<Option<ActiveStage>>>, event: &EngineEvent) {
    let mut slot = stage
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(current) = slot.as_mut() else {
        return;
    };
    if current.run_id != event.run_id {
        return;
    }
    match event.kind {
        EngineEventKind::Started => {
            current.sequence = event.sequence.clone();
            current.progress = Some(0.0);
            current.phase = None;
            current.pass = None;
        }
        EngineEventKind::Progress => {
            if event.sequence.is_some() {
                current.sequence = event.sequence.clone();
            }
            // A new step or pass restarts the bar by design: Target Quality fills 0-100
            // while encoding, then 0-100 again while comparing, in every pass, because its
            // pass count is a ceiling rather than a total. `phase` and `pass` are what tell
            // a restart from a regression.
            let step_changed = (event.phase.is_some() && event.phase != current.phase)
                || (event.pass.is_some() && event.pass != current.pass);
            if event.phase.is_some() {
                current.phase = event.phase.clone();
            }
            if event.pass.is_some() {
                current.pass = event.pass;
            }
            // Within one step completion never regresses. The engine's scene detector used
            // to emit a transient per-scene value larger than the frame sweep; the engine
            // omits it now, and a monotonic step still protects the UI from any other
            // reporter that mixes two completion scales inside one step.
            if let Some(progress) = event.progress {
                current.progress = Some(if step_changed {
                    progress
                } else {
                    current
                        .progress
                        .map_or(progress, |previous| progress.max(previous))
                });
            }
        }
        EngineEventKind::Completed => {
            current.sequence = event.sequence.clone();
            current.progress = Some(100.0);
        }
        EngineEventKind::Cancelled | EngineEventKind::Finished | EngineEventKind::Failed => {
            *slot = None
        }
        // A detail or warning record describes what a sequence produced, not what the run
        // is doing, so it never moves the stage.
        EngineEventKind::Detail | EngineEventKind::Warning => {}
    }
}

/// Turn an engine event into the wire event, adding the run's owner at the boundary.
///
/// The engine does not know which queue entry it is encoding for; the supervisor does. The
/// two ids are what lets the shell write the event into the exact Query key without first
/// resolving the run id through another request.
///
/// `None` is a record that belongs only in the run log. One function decides what crosses
/// the boundary, so a new log-only kind cannot start flooding the stream by omission.
pub(super) fn wire_event(
    event: &EngineEvent,
    project_id: &str,
    video_id: &str,
    inherited_encoder: &serde_json::Value,
) -> Option<EncodeEvent> {
    let kind = match event.kind {
        EngineEventKind::Started => EncodeEventKind::Started,
        EngineEventKind::Progress => EncodeEventKind::Progress,
        EngineEventKind::Completed => EncodeEventKind::Completed,
        EngineEventKind::Cancelled => EncodeEventKind::Cancelled,
        EngineEventKind::Finished => EncodeEventKind::Finished,
        EngineEventKind::Failed => EncodeEventKind::Failed,
        EngineEventKind::Detail | EngineEventKind::Warning => return None,
    };
    Some(EncodeEvent {
        project_id: project_id.to_owned(),
        video_id: video_id.to_owned(),
        run_id: event.run_id.clone(),
        seq: event.seq,
        at: event.at.clone(),
        kind,
        sequence: event.sequence.clone(),
        progress: event.progress,
        message: event.message.clone(),
        frames_processed: event.frames_processed,
        frames_total: event.frames_total,
        phase: event.phase.clone(),
        pass: event.pass,
        max_passes: event.max_passes,
        scenes_processed: event.scenes_processed,
        scenes_total: event.scenes_total,
        scene_index: event.scene_index,
        scene_progress: event.scene_progress,
        scene_frames_processed: event.scene_frames_processed,
        scene_frames_total: event.scene_frames_total,
        // A finished chunk carries the size and duration its checkpoint recorded, so the
        // rail and the Encoding chart can patch that row instead of waiting for a read.
        scene_bytes: event.scene_bytes,
        scene_encode_ms: event.scene_encode_ms,
        // A measured value is evidence, not completion: it updates the scene the charts
        // read while the sequence's own bar keeps its scene tally.
        scene_noise: event.scene_noise,
        // Quality Check scores a scene at a time; the client patches that row so its chart
        // fills before the run's terminal table read.
        scene_quality: event.scene_quality,
        // A checkpoint append has no retained chunk yet; the transition after the sequence
        // reads the full table and fills chunk markers, custom data, and any later per-scene
        // data. A custom pair never affects the row's derived figures, so an empty map here
        // is the honest value rather than a second read of the video record per event.
        scene: event.scene.as_ref().map(|update| {
            derive::scene_view(
                update.index,
                &update.scene,
                None,
                Some(inherited_encoder),
                Default::default(),
            )
        }),
        scene_count: event.scene.as_ref().map(|update| update.count),
    })
}

pub(super) async fn forward_events(
    supervisor: RunSupervisor,
    run_id: String,
    project_id: String,
    video_id: String,
    finishes_output: bool,
    mut receiver: mpsc::UnboundedReceiver<EncodeEvent>,
) {
    while let Some(event) = receiver.recv().await {
        let terminal = event.kind.is_terminal();
        if terminal {
            // Delete before releasing the singleton, so a new run cannot start writing
            // chunks into the directory this run is removing. The output is the proof that
            // the run succeeded; a cancelled or failed run keeps its chunks.
            if finishes_output && event.kind == EncodeEventKind::Finished {
                supervisor
                    .delete_chunks_after_success(&project_id, &video_id)
                    .await;
            }
            // Release before publishing, so a client that sees the terminal event can
            // immediately start the next run.
            supervisor.release(&run_id).await;
        }
        supervisor.publish(event);
        if terminal {
            return;
        }
    }

    // A closed stream without a terminal event is a silently dead worker; the lock must
    // not outlive it.
    supervisor.release(&run_id).await;
}
