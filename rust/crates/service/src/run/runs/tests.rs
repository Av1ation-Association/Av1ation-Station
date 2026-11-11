use super::*;

fn event(kind: EngineEventKind) -> EngineEvent {
    EngineEvent {
        run_id: "run-1".to_owned(),
        seq: 3,
        at: "2026-01-01T00:00:00Z".to_owned(),
        kind,
        sequence: Some("NoiseDetector".to_owned()),
        progress: None,
        message: "line".to_owned(),
        level: None,
        frames_processed: None,
        frames_total: None,
        phase: None,
        pass: None,
        max_passes: None,
        scenes_processed: None,
        scenes_total: None,
        scene_index: None,
        scene_progress: None,
        scene_frames_processed: None,
        scene_frames_total: None,
        scene_bytes: None,
        scene_encode_ms: None,
        scene_noise: None,
        scene_quality: None,
        scene: None,
    }
}

fn wire(kind: EncodeEventKind, phase: Option<&str>) -> EncodeEvent {
    EncodeEvent {
        project_id: "p".to_owned(),
        video_id: "v".to_owned(),
        run_id: "run-1".to_owned(),
        seq: 1,
        at: "2026-01-01T00:00:00Z".to_owned(),
        kind,
        sequence: Some("SceneDetector".to_owned()),
        progress: Some(1.0),
        message: "line".to_owned(),
        frames_processed: None,
        frames_total: None,
        phase: phase.map(str::to_owned),
        pass: None,
        max_passes: None,
        scenes_processed: None,
        scenes_total: None,
        scene_index: None,
        scene_progress: None,
        scene_frames_processed: None,
        scene_frames_total: None,
        scene_bytes: None,
        scene_encode_ms: None,
        scene_noise: None,
        scene_quality: None,
        scene: None,
        scene_count: None,
    }
}

#[test]
fn live_progress_is_coalesced_per_stream_but_transitions_are_not() {
    let mut throttle = ProgressThrottle::default();
    let start = Instant::now();

    assert!(throttle.should_publish(&wire(EncodeEventKind::Progress, None), start));
    assert!(!throttle.should_publish(
        &wire(EncodeEventKind::Progress, None),
        start + Duration::from_millis(50),
    ));
    assert!(throttle.should_publish(
        &wire(EncodeEventKind::Progress, None),
        start + Duration::from_millis(101),
    ));

    // A worker's own stream is measured independently of its neighbour's.
    assert!(throttle.should_publish(
        &wire(EncodeEventKind::Progress, Some("1")),
        start + Duration::from_millis(102),
    ));
    assert!(throttle.should_publish(
        &wire(EncodeEventKind::Progress, Some("2")),
        start + Duration::from_millis(102),
    ));

    // `started` and `completed` must always reach the screen, whatever is queued.
    assert!(throttle.should_publish(
        &wire(EncodeEventKind::Started, None),
        start + Duration::from_millis(103),
    ));
    assert!(throttle.should_publish(
        &wire(EncodeEventKind::Completed, None),
        start + Duration::from_millis(104),
    ));
}

#[test]
fn a_finished_workers_scene_is_never_throttled_away() {
    // Parallel Encoder clears a scene from the page with a tick that names it and
    // carries no percentage. That tick follows the scene's final frame closely, so the
    // interval would drop it — and the page would keep a frozen line for a worker that
    // has already moved on.
    let mut throttle = ProgressThrottle::default();
    let start = Instant::now();
    let mut tick = wire(EncodeEventKind::Progress, Some("96"));
    tick.scene_index = Some(96);
    tick.scene_progress = Some(99.0);
    assert!(throttle.should_publish(&tick, start));

    let mut done = tick.clone();
    done.scene_progress = None;
    done.scene_frames_processed = None;
    done.scene_frames_total = None;
    assert!(
        throttle.should_publish(&done, start + Duration::from_millis(5)),
        "the scene's end must reach the screen inside the progress interval"
    );
}

fn supervisor() -> RunSupervisor {
    RunSupervisor::new(
        Arc::new(av1ation_engine::FakeRunner),
        None,
        None,
        None,
        None,
    )
}

/// One noise measurement, as the engine broadcasts it.
fn measured(index: u32, noise: f64) -> EncodeEvent {
    EncodeEvent {
        sequence: Some("NoiseDetector".to_owned()),
        scene_index: Some(index),
        scene_noise: Some(noise),
        ..wire(EncodeEventKind::Progress, None)
    }
}

/// Noise Detector's checkpoint lands at the end of its run, so a page opened mid-run can
/// only learn the earlier scenes from the live events. The scene-table read asks the
/// supervisor for them.
#[test]
fn a_live_noise_measurement_is_available_to_a_scene_read() {
    let supervisor = supervisor();
    supervisor.publish(measured(0, 0.004));
    supervisor.publish(measured(1, 0.0025));

    let values = supervisor.live_noise("p", "v");
    assert_eq!(values.get(&0), Some(&0.004));
    assert_eq!(values.get(&1), Some(&0.0025));
    assert!(
        supervisor.live_noise("p", "other").is_empty(),
        "another video's table must not show this run's measurements"
    );
}

/// A new Noise Detector run starts from an empty tally: the previous run's values are in
/// the checkpoint, and keeping them would show a stale measurement for a scene the new
/// run has not sampled yet.
#[test]
fn a_new_noise_run_replaces_the_previous_measurements() {
    let supervisor = supervisor();
    supervisor.publish(measured(0, 0.004));
    let mut started = wire(EncodeEventKind::Started, None);
    started.sequence = Some("NoiseDetector".to_owned());
    supervisor.publish(started);

    assert!(supervisor.live_noise("p", "v").is_empty());
}

/// By the time the run ends the checkpoint holds the same values, so the live tally is
/// discarded rather than left to shadow a later edit.
#[test]
fn a_terminal_event_discards_the_live_measurements() {
    let supervisor = supervisor();
    supervisor.publish(measured(0, 0.004));
    supervisor.publish(wire(EncodeEventKind::Finished, None));

    assert!(supervisor.live_noise("p", "v").is_empty());
}

#[test]
fn a_new_step_or_pass_restarts_the_live_stage_bar() {
    // Target Quality fills the bar while encoding, then again while comparing, in every
    // pass. Its pass count is a ceiling, so no reading may be a share of the maximum.
    let stage = Arc::new(StdMutex::new(Some(ActiveStage {
        run_id: "run-1".to_owned(),
        sequence: Some("TargetQuality".to_owned()),
        progress: None,
        phase: None,
        pass: None,
    })));
    let current = || {
        stage
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
            .and_then(|stage| stage.progress)
    };

    let mut tick = event(EngineEventKind::Progress);
    tick.sequence = Some("TargetQuality".to_owned());
    tick.phase = Some("Encode".to_owned());
    tick.pass = Some(1);
    tick.progress = Some(90.0);
    update_stage(&stage, &tick);
    assert_eq!(current(), Some(90.0));

    // Inside one step a lower reading is a mixed scale, not a restart.
    tick.progress = Some(80.0);
    update_stage(&stage, &tick);
    assert_eq!(current(), Some(90.0));

    // Comparing is a new step, so it starts its own 0-100.
    let mut compare = tick.clone();
    compare.phase = Some("Compare".to_owned());
    compare.progress = Some(5.0);
    update_stage(&stage, &compare);
    assert_eq!(current(), Some(5.0));

    // So is the next pass's encode step, even at the same phase name.
    let mut next = compare;
    next.pass = Some(2);
    next.phase = Some("Encode".to_owned());
    next.progress = Some(1.0);
    update_stage(&stage, &next);
    assert_eq!(current(), Some(1.0));
}

#[test]
fn a_detail_or_warning_record_never_reaches_the_live_stream() {
    let encoder = serde_json::json!(null);
    for kind in [EngineEventKind::Detail, EngineEventKind::Warning] {
        assert!(
            wire_event(&event(kind), "p", "v", &encoder).is_none(),
            "{kind:?} must stay in the run log"
        );
    }

    let progress = wire_event(&event(EngineEventKind::Progress), "p", "v", &encoder)
        .expect("progress is broadcast");
    assert_eq!(progress.kind, EncodeEventKind::Progress);
    assert_eq!(progress.project_id, "p");
    assert_eq!(progress.sequence.as_deref(), Some("NoiseDetector"));
}
