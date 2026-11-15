use super::*;
use serde_json::json;

fn chain() -> Vec<ChainEntry> {
    vec![
        ("SceneDetector", "Scene Detector"),
        ("ParallelEncoder", "Parallel Encoder"),
        ("SceneConcatenator", "Scene Concatenator"),
    ]
}

fn status(state: &VideoState, id: &str) -> SequenceRunStatus {
    state
        .sequences
        .iter()
        .find(|sequence| sequence.id == id)
        .expect("the sequence is in the chain")
        .status
}

fn evidence<'a>(
    condor: Option<&'a Value>,
    chunks: &'a [String],
    output_exists: bool,
) -> Evidence<'a> {
    Evidence {
        condor,
        chunks,
        output_exists,
        retained_bytes: 0,
        active: None,
        run_id: None,
        failed: None,
        scene_source_frames: None,
    }
}

/// An empty scene list means detection has not run: no per-scene sequence is complete.
#[test]
fn an_empty_scene_list_is_never_run_not_vacuously_complete() {
    let condor = json!({ "scenes": [] });
    let state = derive("video", &chain(), &evidence(Some(&condor), &[], false));

    assert_eq!(state.scene_count, 0);
    assert_eq!(status(&state, "SceneDetector"), SequenceRunStatus::NeverRun);
    assert_eq!(
        status(&state, "ParallelEncoder"),
        SequenceRunStatus::NeverRun
    );
    assert_eq!(
        state.next,
        vec!["SceneDetector".to_owned()],
        "only detection is runnable before scenes exist"
    );
    assert!(!state.sequences[1].runnable);
}

#[test]
fn a_scene_list_that_stops_before_the_source_is_incomplete_and_resumable() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 },
        { "start_frame": 24, "end_frame": 48 }
    ] });
    let mut source = evidence(Some(&condor), &[], false);
    source.scene_source_frames = Some(240);
    let state = derive("video", &chain(), &source);

    assert_eq!(
        status(&state, "SceneDetector"),
        SequenceRunStatus::Incomplete
    );
    assert_eq!(state.sequences[0].detail.as_deref(), Some("20.0%, 2 found"));
    assert_eq!(
        state.sequences[0].progress,
        Some(20.0),
        "a cancelled detection reports the fraction it covered, so a queue row can\n             show it without pretending the run is still active"
    );
    assert_eq!(
        state.next.first().map(String::as_str),
        Some("SceneDetector"),
        "the full pipeline resumes detection before encoding"
    );
    assert!(
        state.next.contains(&"ParallelEncoder".to_owned()),
        "encoding stays runnable, but it is later in the chain"
    );
}

#[test]
fn reaching_the_source_end_is_what_makes_detection_complete() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 240 }
    ] });
    let mut source = evidence(Some(&condor), &[], false);
    source.scene_source_frames = Some(240);
    let state = derive("video", &chain(), &source);

    assert_eq!(status(&state, "SceneDetector"), SequenceRunStatus::Complete);
    assert_eq!(state.next, vec!["ParallelEncoder".to_owned()]);
}

#[test]
fn detected_scenes_make_the_encoder_runnable_but_not_complete() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 },
        { "start_frame": 24, "end_frame": 48 }
    ] });
    let state = derive("video", &chain(), &evidence(Some(&condor), &[], false));

    assert_eq!(status(&state, "SceneDetector"), SequenceRunStatus::Complete);
    assert_eq!(
        status(&state, "ParallelEncoder"),
        SequenceRunStatus::NeverRun
    );
    assert!(state.sequences[1].runnable);
    assert_eq!(
        state.next,
        vec!["ParallelEncoder".to_owned()],
        "a complete Scene Detector is not offered again"
    );
}

#[test]
fn chunk_files_are_what_make_the_encoder_complete() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 },
        { "start_frame": 24, "end_frame": 48 }
    ] });
    let chunks = vec!["00000.ivf".to_owned(), "00001.ivf".to_owned()];
    let state = derive("video", &chain(), &evidence(Some(&condor), &chunks, false));

    assert_eq!(
        status(&state, "ParallelEncoder"),
        SequenceRunStatus::Complete
    );
    assert!(
        state.sequences[2].runnable,
        "a finished chunk makes concatenation runnable"
    );
    assert_eq!(state.next, vec!["SceneConcatenator".to_owned()]);
}

#[test]
fn a_partly_encoded_video_reports_the_scenes_it_has() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 },
        { "start_frame": 24, "end_frame": 48 }
    ] });
    let chunks = vec!["00000.ivf".to_owned()];
    let state = derive("video", &chain(), &evidence(Some(&condor), &chunks, false));

    assert_eq!(
        status(&state, "ParallelEncoder"),
        SequenceRunStatus::NeverRun
    );
    assert_eq!(
        state.sequences[1].detail.as_deref(),
        Some("1/2 scenes encoded")
    );
}

#[test]
fn a_live_run_overrides_stored_completion() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 }
    ] });
    let chunks = vec!["00000.ivf".to_owned()];
    let mut evidence = evidence(Some(&condor), &chunks, true);
    evidence.active = Some(("SceneDetector", Some(41.5)));
    evidence.run_id = Some("run-1");

    let state = derive("video", &chain(), &evidence);

    assert_eq!(status(&state, "SceneDetector"), SequenceRunStatus::Active);
    assert_eq!(state.sequences[0].progress, Some(41.5));
    assert!(state.active);
    assert_eq!(state.run_id.as_deref(), Some("run-1"));
}

#[test]
fn a_failed_sequence_is_reported_from_the_timeline() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 }
    ] });
    let mut evidence = evidence(Some(&condor), &[], false);
    evidence.failed = Some("ParallelEncoder");

    let state = derive("video", &chain(), &evidence);

    assert_eq!(status(&state, "ParallelEncoder"), SequenceRunStatus::Failed);
    assert!(
        state.next.contains(&"ParallelEncoder".to_owned()),
        "a failed sequence can be retried"
    );
}

/// The output file is the only evidence that concatenation finished; a stored scene list
/// cannot prove it, because the file can be deleted outside the app.
#[test]
fn the_concatenator_is_complete_only_when_the_output_exists() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 }
    ] });
    let chunks = vec!["00000.ivf".to_owned()];

    let missing = derive("video", &chain(), &evidence(Some(&condor), &chunks, false));
    assert_eq!(
        status(&missing, "SceneConcatenator"),
        SequenceRunStatus::NeverRun
    );

    let present = derive("video", &chain(), &evidence(Some(&condor), &chunks, true));
    assert_eq!(
        status(&present, "SceneConcatenator"),
        SequenceRunStatus::Complete
    );
}

#[test]
fn scenes_carry_the_final_pass_and_the_chunk_that_belongs_to_them() {
    let inherited = av1ation_engine::default_project_config()["encoder"].clone();
    let condor = json!({ "scenes": [
        {
            "start_frame": 0,
            "end_frame": 240,
            "encoder": inherited.clone(),
            "sequence_data": { "target_quality": { "passes": [
                { "quantizer": 32.0, "scores": [80.0] },
                { "quantizer": 24.0, "scores": [90.0, 94.0] }
            ] } }
        },
        {
            "start_frame": 240,
            "end_frame": 480,
            "encoder": { "FFmpeg": {
                "executable": null,
                "options": {},
                "append_color_data": true
            } }
        },
        { "start_frame": 480, "end_frame": 480 }
    ] });
    let chunks = vec![
        ("00000.ivf".to_owned(), 1_024),
        ("00001.temp.264".to_owned(), 512),
        ("00002.ivf".to_owned(), 2_048),
        ("notes.txt".to_owned(), 8),
    ];

    let list = scenes(
        "video-1",
        Some(&condor),
        &std::collections::BTreeMap::new(),
        &chunks,
        Some(&inherited),
    );

    assert_eq!(list.video_id, "video-1");
    assert_eq!(list.total_frames, 480);
    assert_eq!(list.scenes.len(), 3);
    assert_eq!(list.scenes[0].frame_count, 240);
    assert_eq!(list.scenes[0].quantizer, Some(24.0));
    assert_eq!(list.scenes[0].score, Some(92.0));
    assert!(list.scenes[0].encoded);
    assert_eq!(list.scenes[0].chunk_bytes, Some(1_024));
    assert!(
        !list.scenes[1].encoded,
        "a half-written temp file is not a finished scene"
    );
    assert_eq!(list.scenes[1].chunk_bytes, None);
    assert_eq!(list.scenes[1].quantizer, None);
    assert_eq!(list.scenes[2].frame_count, 0, "an empty range is preserved");
    assert_eq!(list.scenes[2].chunk_bytes, Some(2_048));
    assert_eq!(list.scenes[0].encoder_label, "SVT-AV1");
    assert!(!list.scenes[0].encoder_custom);
    assert_eq!(list.scenes[1].encoder_label, "FFmpeg");
    assert!(
        list.scenes[1].encoder_custom,
        "a scene whose encoder differs from the video is an override"
    );
    assert_eq!(list.scenes[2].encoder_label, "Unknown encoder");
    assert!(
        !list.scenes[2].encoder_custom,
        "a missing encoder cannot claim an override"
    );
}

#[test]
fn a_video_without_a_checkpoint_has_no_scenes() {
    let list = scenes(
        "video-1",
        None,
        &std::collections::BTreeMap::new(),
        &[],
        None,
    );

    assert_eq!(list.total_frames, 0);
    assert!(list.scenes.is_empty());
}

/// A read during a Noise Detector run must include the values the run has already
/// reported: its checkpoint, which holds them, arrives only when the sequence ends.
#[test]
fn a_live_noise_measurement_fills_the_table_a_read_returns() {
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 },
        { "start_frame": 24, "end_frame": 48 }
    ] });
    let mut list = scenes(
        "video-1",
        Some(&condor),
        &std::collections::BTreeMap::new(),
        &[],
        None,
    );
    assert_eq!(list.scenes[1].noise, None);

    with_live_noise(&mut list, &std::collections::BTreeMap::from([(1, 0.0032)]));

    assert_eq!(list.scenes[1].noise, Some(0.0032));
    assert_eq!(
        list.scenes[0].noise, None,
        "only the measured scene changes"
    );
}

/// The committed checkpoints are the regression table for the phase rules: each one is
/// a saved `Condor` blob with a known consequence, independent of the inline cases.
#[test]
fn every_condor_fixture_produces_the_expected_state() {
    struct Case {
        file: &'static str,
        condor: &'static str,
        chunks: &'static [&'static str],
        output_exists: bool,
        scene_count: u32,
        statuses: [SequenceRunStatus; 3],
        next: &'static [&'static str],
    }

    let cases = [
        Case {
            file: "empty.json",
            condor: include_str!("fixtures/empty.json"),
            chunks: &[],
            output_exists: false,
            scene_count: 0,
            statuses: [
                SequenceRunStatus::NeverRun,
                SequenceRunStatus::NeverRun,
                SequenceRunStatus::NeverRun,
            ],
            next: &["SceneDetector"],
        },
        Case {
            file: "detected.json",
            condor: include_str!("fixtures/detected.json"),
            chunks: &[],
            output_exists: false,
            scene_count: 2,
            statuses: [
                SequenceRunStatus::Complete,
                SequenceRunStatus::NeverRun,
                SequenceRunStatus::NeverRun,
            ],
            next: &["ParallelEncoder"],
        },
        Case {
            file: "partly-encoded.json",
            condor: include_str!("fixtures/partly-encoded.json"),
            chunks: &["00000.ivf"],
            output_exists: false,
            scene_count: 2,
            statuses: [
                SequenceRunStatus::Complete,
                SequenceRunStatus::NeverRun,
                SequenceRunStatus::NeverRun,
            ],
            // The engine now refuses a concatenation with any scene missing, so only the
            // remaining encode is offered; the concat row still reports its missing count.
            next: &["ParallelEncoder"],
        },
        Case {
            file: "concatenated.json",
            condor: include_str!("fixtures/concatenated.json"),
            chunks: &["00000.ivf", "00001.ivf"],
            output_exists: true,
            scene_count: 2,
            statuses: [
                SequenceRunStatus::Complete,
                SequenceRunStatus::Complete,
                SequenceRunStatus::Complete,
            ],
            next: &[],
        },
    ];

    for case in cases {
        let condor: Value = serde_json::from_str(case.condor)
            .unwrap_or_else(|error| panic!("{}: {error}", case.file));
        let chunks: Vec<String> = case.chunks.iter().map(|name| (*name).to_owned()).collect();
        let state = derive(
            "video",
            &chain(),
            &evidence(Some(&condor), &chunks, case.output_exists),
        );

        assert_eq!(state.scene_count, case.scene_count, "{}", case.file);
        for (index, expected) in case.statuses.iter().enumerate() {
            assert_eq!(
                state.sequences[index].status, *expected,
                "{}: {}",
                case.file, state.sequences[index].id
            );
        }
        assert_eq!(
            state.next,
            case.next
                .iter()
                .map(|id| (*id).to_owned())
                .collect::<Vec<_>>(),
            "{}",
            case.file
        );
    }
}

#[test]
fn the_chain_follows_the_configuration_and_never_offers_the_serial_encoder() {
    let mut config = av1ation_engine::default_project_config();
    let simple = chain_for(&config);
    assert_eq!(
        simple.iter().map(|(id, _)| *id).collect::<Vec<_>>(),
        vec!["SceneDetector", "ParallelEncoder", "SceneConcatenator"]
    );
    assert!(!simple.iter().any(|(id, _)| *id == "SerialEncoder"));

    config["sequences"]["noise_detector"] = json!({ "input": null });
    config["sequences"]["quality_check"] = json!({
        "metric": "SSIMULACRA2",
        "strategy": "Whole",
        "statistic": "Mean",
        "input": null
    });
    let full = chain_for(&config);
    assert_eq!(
        full.iter().map(|(id, _)| *id).collect::<Vec<_>>(),
        vec![
            "SceneDetector",
            "NoiseDetector",
            "ParallelEncoder",
            "SceneConcatenator",
            "QualityCheck"
        ]
    );
}

#[test]
fn speed_and_bitrate_actions_follow_target_quality_when_configured() {
    let mut config = av1ation_engine::default_project_config();
    config["sequences"]["target_quality"] = json!({ "metric": "SSIMULACRA2" });
    config["sequences"]["speed_scaler"]["speed_quantizers"] = json!([[8, 20], [6, 35]]);
    config["sequences"]["bitrate_optimizer"]["bitrate_sigma_threshold"] = json!(2);

    let chain = chain_for(&config);
    assert_eq!(
        chain.iter().map(|(id, _)| *id).collect::<Vec<_>>(),
        vec![
            "SceneDetector",
            "TargetQuality",
            "SpeedScaler",
            "BitrateOptimizer",
            "ParallelEncoder",
            "SceneConcatenator"
        ]
    );
}

#[test]
fn noise_scaler_is_runnable_as_soon_as_scenes_exist() {
    let chain = vec![
        ("SceneDetector", "Scene Detector"),
        ("NoiseDetector", "Noise Detector"),
        ("NoiseScaler", "Noise Scaler"),
        ("ParallelEncoder", "Parallel Encoder"),
        ("SceneConcatenator", "Scene Concatenator"),
    ];
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 }
    ] });
    let state = derive("video", &chain, &evidence(Some(&condor), &[], false));

    let scaler = state
        .sequences
        .iter()
        .find(|sequence| sequence.id == "NoiseScaler")
        .expect("the scaler is in the chain");
    assert!(scaler.runnable, "scenes are the only prerequisite");
    assert_eq!(scaler.status, SequenceRunStatus::NeverRun);
    assert!(state.next.contains(&"NoiseScaler".to_owned()));
}

#[test]
fn noise_scaler_is_done_once_it_rewrote_any_scene() {
    // The engine skips a scene whose encoder has no photon noise, so a run leaves some
    // scenes unscaled; requiring all of them would report a finished sequence as ready.
    let chain = vec![
        ("SceneDetector", "Scene Detector"),
        ("NoiseDetector", "Noise Detector"),
        ("NoiseScaler", "Noise Scaler"),
        ("ParallelEncoder", "Parallel Encoder"),
        ("SceneConcatenator", "Scene Concatenator"),
    ];
    let condor = json!({ "scenes": [
        {
            "start_frame": 0,
            "end_frame": 24,
            "sequence_data": { "noise_scaling": { "scaler": 1.4 } }
        },
        { "start_frame": 24, "end_frame": 48, "sequence_data": { "noise_scaling": null } }
    ] });
    let state = derive("video", &chain, &evidence(Some(&condor), &[], false));

    let scaler = state
        .sequences
        .iter()
        .find(|sequence| sequence.id == "NoiseScaler")
        .expect("the scaler is in the chain");
    assert_eq!(scaler.status, SequenceRunStatus::Complete);
    assert_eq!(scaler.detail.as_deref(), Some("1/2 scenes scaled"));
    assert!(!state.next.contains(&"NoiseScaler".to_owned()));
}

#[test]
fn action_sequences_are_runnable_but_never_scheduled_as_next() {
    let chain = vec![
        ("SceneDetector", "Scene Detector"),
        ("TargetQuality", "Target Quality"),
        ("SpeedScaler", "Speed Scaler"),
        ("BitrateOptimizer", "Bitrate Optimizer"),
        ("ParallelEncoder", "Parallel Encoder"),
        ("SceneConcatenator", "Scene Concatenator"),
    ];
    let condor = json!({ "scenes": [
        {
            "start_frame": 0,
            "end_frame": 24,
            "sequence_data": { "target_quality": { "passes": [
                { "quantizer": 30.0, "scores": [90.0] }
            ] } }
        }
    ] });
    let state = derive("video", &chain, &evidence(Some(&condor), &[], false));

    let scaler = state
        .sequences
        .iter()
        .find(|sequence| sequence.id == "SpeedScaler")
        .expect("speed scaler");
    let optimizer = state
        .sequences
        .iter()
        .find(|sequence| sequence.id == "BitrateOptimizer")
        .expect("bitrate optimizer");
    assert!(scaler.runnable);
    assert!(optimizer.runnable);
    assert_eq!(scaler.status, SequenceRunStatus::NeverRun);
    assert_eq!(optimizer.status, SequenceRunStatus::NeverRun);
    assert_eq!(
        state.next,
        vec!["ParallelEncoder".to_owned()],
        "actions must not keep a finished pipeline unfinished"
    );
}

#[test]
fn bitrate_optimizer_needs_at_least_one_target_quality_pass() {
    let chain = vec![
        ("SceneDetector", "Scene Detector"),
        ("TargetQuality", "Target Quality"),
        ("BitrateOptimizer", "Bitrate Optimizer"),
        ("ParallelEncoder", "Parallel Encoder"),
    ];
    let condor = json!({ "scenes": [
        { "start_frame": 0, "end_frame": 24 }
    ] });
    let state = derive("video", &chain, &evidence(Some(&condor), &[], false));

    let optimizer = state
        .sequences
        .iter()
        .find(|sequence| sequence.id == "BitrateOptimizer")
        .expect("bitrate optimizer");
    assert!(!optimizer.runnable);
}

#[test]
fn a_live_checkpoint_row_matches_the_reloaded_table_row() {
    let encoder = av1ation_engine::capability::catalogue::encoders()
        .into_iter()
        .next()
        .expect("the engine offers an encoder")
        .default;
    let scene = json!({
        "start_frame": 48,
        "end_frame": 96,
        "encoder": encoder,
        "sequence_data": {},
    });
    let condor = json!({ "scenes": [scene.clone()] });

    let live = scene_view(0, &scene, None, Some(&encoder), Default::default());
    let table = scenes(
        "video",
        Some(&condor),
        &Default::default(),
        &[],
        Some(&encoder),
    );

    assert_eq!(live, table.scenes[0]);
    assert_eq!(live.start_frame, 48);
    assert_eq!(live.frame_count, 48);
    assert!(
        !live.encoded,
        "a checkpoint append has no retained chunk yet"
    );
}

#[test]
fn a_fingerprint_changes_only_with_the_document() {
    let first = json!({ "SVTAV1": { "photon_noise": { "iso": 200 } } });
    let second = json!({ "SVTAV1": { "photon_noise": { "iso": 200_000 } } });

    assert_eq!(encoder_fingerprint(&first), encoder_fingerprint(&first));
    assert_ne!(
        encoder_fingerprint(&first),
        encoder_fingerprint(&second),
        "a saved setting must read as a different picture"
    );
}

#[test]
fn a_scene_fingerprints_the_document_it_encodes_with() {
    let inherited = json!({ "aom": { "crf": 30 } });
    let changed = json!({ "aom": { "crf": 40 } });
    let own = json!({ "aom": { "crf": 50 } });
    let overriding = json!({ "start_frame": 0, "end_frame": 24, "encoder": own.clone() });
    let inheriting = json!({ "start_frame": 24, "end_frame": 48 });

    let override_row = scene_view(0, &overriding, None, Some(&inherited), Default::default());
    let inheriting_row = scene_view(1, &inheriting, None, Some(&inherited), Default::default());
    assert_eq!(
        override_row.encoder_fingerprint,
        Some(encoder_fingerprint(&own))
    );
    assert_eq!(
        inheriting_row.encoder_fingerprint,
        Some(encoder_fingerprint(&inherited))
    );

    // A video-level change moves every inheriting scene and leaves an override alone.
    let moved_override = scene_view(0, &overriding, None, Some(&changed), Default::default());
    let moved_inheriting = scene_view(1, &inheriting, None, Some(&changed), Default::default());
    assert_eq!(
        moved_override.encoder_fingerprint,
        override_row.encoder_fingerprint
    );
    assert_ne!(
        moved_inheriting.encoder_fingerprint,
        inheriting_row.encoder_fingerprint
    );

    // No resolved encoder at all is the one case with nothing to fingerprint.
    assert_eq!(
        scene_view(1, &inheriting, None, None, Default::default()).encoder_fingerprint,
        None
    );
}

#[test]
fn the_scene_table_fingerprint_covers_what_a_script_reads() {
    let condor = json!({
        "scenes": [
            { "start_frame": 0, "end_frame": 24, "sequence_data": { "noise_detection": { "noise": 5.0 } } },
            { "start_frame": 24, "end_frame": 48, "sequence_data": {} }
        ]
    });
    let none = std::collections::BTreeMap::new();
    let baseline = scene_fingerprint(Some(&condor), &none);
    assert_eq!(
        baseline,
        scene_fingerprint(Some(&condor), &none),
        "an unchanged table must not invalidate a decoded window"
    );

    // A user pair is merged into `sequence_data`, so a script's picture can change
    // without the source or the scene boundaries moving.
    let mut custom = std::collections::BTreeMap::new();
    custom.insert(
        0,
        std::collections::BTreeMap::from([("invert".to_owned(), json!(true))]),
    );
    assert_ne!(baseline, scene_fingerprint(Some(&condor), &custom));

    // A sequence's own measurement is part of the same table.
    let mut measured = condor.clone();
    measured["scenes"][0]["sequence_data"]["noise_detection"]["noise"] = json!(9.0);
    assert_ne!(baseline, scene_fingerprint(Some(&measured), &none));
}

#[test]
fn a_scene_carries_every_target_quality_pass_in_probe_order() {
    let scene = json!({
        "start_frame": 0,
        "end_frame": 24,
        "sequence_data": { "target_quality": { "passes": [
            {
                "quantizer": 30.0,
                "scores": [88.0, 92.0, 90.0],
                "bitrate": 1.5,
                "started_on": 1_000_u64,
                "completed_on": 4_000_u64
            },
            {
                "quantizer": 26.0,
                "scores": [74.0, 76.0],
                "bitrate": 3.25,
                "started_on": 4_000_u64,
                "completed_on": 4_000_u64
            }
        ] } }
    });

    let row = scene_view(0, &scene, None, None, Default::default());

    assert_eq!(row.passes.len(), 2, "both passes must reach the chart");
    assert_eq!(row.passes[0].pass, 1);
    assert_eq!(row.passes[0].quantizer, Some(30.0));
    assert_eq!(row.passes[0].score, Some(90.0));
    assert_eq!(row.passes[0].score_min, Some(88.0));
    assert_eq!(row.passes[0].score_max, Some(92.0));
    assert_eq!(row.passes[0].frames, 3);
    assert_eq!(row.passes[0].bitrate, Some(1.5));
    assert_eq!(row.passes[0].duration_ms, Some(3_000));

    // The flattened pair is the final pass, not the best-scoring one.
    assert_eq!(row.quantizer, Some(26.0));
    assert_eq!(row.score, Some(75.0));
    // Two equal timestamps are not a measurement; a zero duration would read as instant.
    assert_eq!(row.passes[1].duration_ms, None);
}

#[test]
fn a_scene_without_passes_has_no_target_quality_numbers() {
    let scene = json!({ "start_frame": 0, "end_frame": 24, "sequence_data": {} });
    let row = scene_view(0, &scene, None, None, Default::default());

    assert!(row.passes.is_empty());
    assert_eq!(row.quantizer, None);
    assert_eq!(row.score, None);
}

#[test]
fn a_scene_reports_the_time_its_chunk_took() {
    let scene = json!({
        "start_frame": 0,
        "end_frame": 48,
        "sequence_data": { "parallel_encoder": {
            "started_on": 1_700_000_000_000_u64,
            "completed_on": 1_700_000_001_500_u64,
            "bytes": 4_194_304_u64
        } }
    });

    let row = scene_view(0, &scene, Some(4_194_304), None, Default::default());

    assert_eq!(row.encode_ms, Some(1_500));
    assert_eq!(row.chunk_bytes, Some(4_194_304));
}

#[test]
fn only_a_non_empty_file_counts_as_written() {
    let root =
        std::env::temp_dir().join(format!("av1ation-output-is-written-{}", std::process::id()));
    let directory = root.join("directory");
    std::fs::create_dir_all(&directory).expect("create the test directory");
    let empty = root.join("empty.mkv");
    std::fs::write(&empty, b"").expect("write the zero-byte output");
    let written = root.join("written.mkv");
    std::fs::write(&written, b"encoded").expect("write the non-empty output");

    let cases = [
        ("an empty path", String::new(), false),
        (
            "a missing file",
            root.join("missing.mkv").display().to_string(),
            false,
        ),
        ("a zero-byte file", empty.display().to_string(), false),
        ("a directory", directory.display().to_string(), false),
        ("a non-empty file", written.display().to_string(), true),
    ];
    for (case, path, expected) in cases {
        assert_eq!(output_is_written(&path), expected, "{case}");
    }

    std::fs::remove_dir_all(&root).expect("remove the test directory");
}
