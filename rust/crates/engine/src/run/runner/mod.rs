//! The real encode worker: the one place a `Condor` is constructed, driven, and dropped.
//!
//! One input is opened per run and one `Condor` owns it for every sequence, which is how
//! `condor` itself drives the engine. Reopening the input per sequence changes the clip
//! description a later sequence sees and leaves the decoder wherever the previous sequence
//! stopped, so the run is built once and advanced in place.
//!
//! The worker owns the engine on a dedicated thread for the whole run. Progress arrives
//! from the engine's own `mpsc::Sender<SequenceProgressEvent>` and is translated into our
//! event shape; nothing polls. Cancellation is the engine's `AtomicBool`, never a thread
//! abort.

use std::{
    collections::{HashMap, HashSet},
    panic::{AssertUnwindSafe, catch_unwind},
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        mpsc::{self, Sender},
    },
    thread,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use crate::script::module as script_module;
use andean_condor::{
    core::{
        AndeanCondor, Condor, DefaultAndeanCondor, SaveCallback, SequenceProgressEvent,
        SequenceType, SequenceWarnings, SequenceWarningsTuple,
        input::{Input as CoreInput, OpenProgress},
        output::Output as CoreOutput,
        sequence::{
            Sequence, SequenceCompletion, SequenceStatus, Status, benchmarker::Benchmarker,
            bitrate_optimizer::BitrateOptimizer, noise_detector::NoiseDetector,
            noise_scaler::NoiseScaler, parallel_encoder::ParallelEncoder,
            quality_check::QualityCheck, scene_concatenator::SceneConcatenator,
            scene_detector::SceneDetector, speed_scaler::SpeedScaler,
            target_quality::TargetQuality,
        },
    },
    models::{
        Condor as CondorModel,
        encoder::Encoder,
        input::Input as InputModel,
        output::Output as OutputModel,
        scene::Scene,
        sequence::{
            DefaultSequenceData, noise_detector::NoiseDetectorDataHandler,
            parallel_encoder::ParallelEncoderDataHandler, quality_check::QualityCheckDataHandler,
        },
    },
    utils::cancellation::Cancellation,
};
use serde::Deserialize;

use crate::{
    EncodeEvent, EncodeEventKind, EncodeHandle, EncodeRequest, EncodeRunner, EngineError,
    RunnerConfig, SceneUpdate,
    run::sequence_log::{self, Context},
    script::data as script_data,
};

/// The persisted half of a saved `Condor` this worker reuses.
///
/// Input, output, encoder, and sequence config come from the request's snapshot, so a
/// finished run cannot resurrect an old configuration. Scenes are the only engine state
/// that must survive, because they carry per-scene encoders and `sequence_data`.
#[derive(Deserialize)]
pub(super) struct SavedCondor {
    pub(super) scenes: Vec<Scene<DefaultSequenceData>>,
}

/// The runner the service uses outside tests.
#[derive(Debug, Default, Clone, Copy)]
pub struct RealRunner;

impl EncodeRunner for RealRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        let (sender, receiver) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = Arc::clone(&cancel);
        let run_id = request.run_id.clone();
        let thread_run_id = run_id.clone();

        thread::Builder::new()
            .name(format!("encode-{run_id}"))
            .spawn(move || {
                // One counter for the whole run, including the terminal event. The terminal
                // used to carry `u64::MAX`, which JSON clients cannot represent safely and
                // the generated Zod validator rejected, so the UI never cleared the lock.
                let seq_no = Arc::new(AtomicU64::new(0));
                // A panic inside the engine must fail the run, not take the process down.
                let result = catch_unwind(AssertUnwindSafe(|| {
                    encode(request, &sender, &worker_cancel, &seq_no)
                }));
                let terminal = match result {
                    Ok(Ok(())) if worker_cancel.load(Ordering::SeqCst) => {
                        (EncodeEventKind::Cancelled, "Encode cancelled".to_owned())
                    }
                    Ok(Ok(())) => (EncodeEventKind::Finished, "Encode finished".to_owned()),
                    Ok(Err(message)) => (EncodeEventKind::Failed, message),
                    Err(_) => (
                        EncodeEventKind::Failed,
                        "The engine panicked inside the encode worker".to_owned(),
                    ),
                };
                emit(
                    &sender,
                    &thread_run_id,
                    seq_no.as_ref(),
                    EventNote {
                        kind: terminal.0,
                        sequence: None,
                        progress: None,
                        message: terminal.1,
                        frames: None,
                        level: None,
                        live: Live::default(),
                    },
                );
            })
            .map_err(|error| EngineError::Worker(error.to_string()))?;

        Ok(EncodeHandle {
            run_id,
            cancel,
            events: receiver,
        })
    }
}

mod checkpoint;
mod encode;
mod progress;
mod scripts;
mod sequence;

use checkpoint::*;
use encode::encode;
use progress::*;
use scripts::*;
use sequence::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("av1ation-runner-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temporary dir");
        dir
    }
    use andean_condor::models::{
        encoder::{Encoder, EncoderBase},
        scene::Scene,
        sequence::{
            DefaultSequenceData, noise_detector::NoiseDetectorData,
            parallel_encoder::ParallelEncoderData, quality_check::QualityCheckData,
            target_quality::types::QualityPass,
        },
    };
    use serde_json::json;

    fn chunked_scene(
        start_frame: usize,
        end_frame: usize,
        bytes: u64,
        started_on: u128,
        completed_on: u128,
    ) -> Scene<DefaultSequenceData> {
        Scene {
            start_frame,
            end_frame,
            sub_scenes: None,
            encoder: Encoder::default_from_base(&EncoderBase::X264, false),
            sequence_data: DefaultSequenceData {
                parallel_encoder: ParallelEncoderData {
                    invalidated: false,
                    provenance: None,
                    started_on: Some(started_on),
                    completed_on: Some(completed_on),
                    bytes: Some(bytes),
                },
                ..Default::default()
            },
        }
    }

    #[test]
    fn a_resumed_tables_chunks_are_not_announced_again() {
        // A resumed Parallel Encoder starts with the chunks its previous run wrote. The
        // first checkpoint must not replay a table's worth of rows the rail already shows.
        let scenes = vec![chunked_scene(0, 24, 1_024, 1_000, 2_500)];
        let mut recorded = recorded_chunks(&scenes);

        assert!(take_new_chunks(&mut recorded, &scenes).is_empty());
    }

    #[test]
    fn one_new_chunk_is_announced_once() {
        let scenes = vec![
            chunked_scene(0, 24, 1_024, 1_000, 2_500),
            chunked_scene(24, 48, 0, 1_000, 2_500),
        ];
        let mut recorded = RecordedChunks::new();

        assert_eq!(
            take_new_chunks(&mut recorded, &scenes),
            vec![(0, 1_024, 1_500)]
        );
        // The checkpoint after this one carries the same pair; it is the same chunk.
        assert!(take_new_chunks(&mut recorded, &scenes).is_empty());
    }

    #[test]
    fn a_re_encoded_chunk_is_announced_with_its_new_pair() {
        // An edited scene is encoded again, so its checkpoint replaces the recorded pair.
        let mut recorded = recorded_chunks(&[chunked_scene(0, 24, 1_024, 1_000, 2_500)]);
        let scenes = vec![chunked_scene(0, 24, 2_048, 3_000, 3_600)];

        assert_eq!(
            take_new_chunks(&mut recorded, &scenes),
            vec![(0, 2_048, 600)]
        );
    }

    #[test]
    fn an_empty_or_unstamped_chunk_is_not_announced() {
        // Two default timestamps are not a measurement, and a zero would read as an
        // instant encode.
        let scenes = vec![
            chunked_scene(0, 24, 0, 1_000, 2_500),
            chunked_scene(24, 48, 1_024, 2_500, 2_500),
        ];
        let mut recorded = RecordedChunks::new();

        assert!(take_new_chunks(&mut recorded, &scenes).is_empty());
    }

    fn script_model() -> InputModel {
        serde_json::from_value(json!({
            "VapourSynthScript": {
                "source": { "Text": "clip.set_output()" },
                "variables": {},
                "index": 0,
                "filters": [],
                "stream_concurrently": true
            }
        }))
        .expect("a script input")
    }

    #[test]
    fn an_indexing_custom_tick_does_not_claim_a_scene_count() {
        // Scene Detector's initialize step reports `0 of 1` while it indexes the input.
        // That is not a scene tally; carrying it into the live line made every detection
        // run read `0/1 scenes` until the terminal event replaced it.
        let status = SequenceStatus::Whole(Status::Processing {
            id: "Scene Detector".to_owned(),
            completion: SequenceCompletion::Custom {
                name: "Indexing Input".to_owned(),
                completed: 0.0,
                total: 1.0,
            },
        });

        let live = describe(&status);

        assert_eq!(live.scenes, None);
        assert_eq!(live.progress, Some(0.0));
    }

    #[test]
    fn a_worker_reports_its_own_scenes_frames_and_not_the_encodes() {
        // Parallel Encoder sends one child bar per worker. The child counts frames inside
        // its scene and the parent counts the whole encode; only the child can measure
        // that worker's rate, so the page needs both.
        let status = SequenceStatus::Subprocess {
            parent: Status::Processing {
                id: "Parallel Encoder".to_owned(),
                completion: SequenceCompletion::Frames {
                    completed: 4_000,
                    total: 40_000,
                },
            },
            child: Status::Processing {
                id: "96".to_owned(),
                completion: SequenceCompletion::PassFrames {
                    passes: (1, 1),
                    frames: (40, 120),
                },
            },
        };

        let live = describe(&status);

        assert_eq!(live.scene, Some(96));
        assert_eq!(
            live.scene_frames,
            Some((40, 120)),
            "the worker's own scene is what its rate and ETA measure"
        );
        assert_eq!(
            live.frames,
            Some((4_000, 40_000)),
            "the aggregate bar still describes the whole encode"
        );
        assert_eq!(live.scene_progress, Some(40.0 / 120.0 * 100.0));
    }

    #[test]
    fn a_finished_workers_scene_carries_no_percentage() {
        // This is how the page learns a worker has moved on: the scene's final status
        // names it and reports nothing to measure.
        let status = SequenceStatus::Subprocess {
            parent: Status::Processing {
                id: "Parallel Encoder".to_owned(),
                completion: SequenceCompletion::Frames {
                    completed: 4_120,
                    total: 40_000,
                },
            },
            child: Status::Completed {
                id: "96".to_owned(),
            },
        };

        let live = describe(&status);

        assert_eq!(live.scene, Some(96));
        assert_eq!(live.scene_progress, None);
        assert_eq!(live.scene_frames, None);
    }

    #[test]
    fn a_script_receives_sequence_data_and_the_sequence_being_started() {
        let data = DefaultSequenceData {
            noise_detection: Some(NoiseDetectorData {
                noise: 5.5,
                luminance: 0.4,
                created_on: UNIX_EPOCH,
            }),
            ..Default::default()
        };
        let scene = Scene {
            start_frame: 0,
            end_frame: 24,
            sub_scenes: None,
            encoder: Encoder::default_from_base(&EncoderBase::X264, false),
            sequence_data: data,
        };

        let custom = script_data::CustomSceneData::new();
        let config = RunnerConfig::default();
        let scope = ScriptScope {
            custom: &custom,
            temp_dir: "C:\\temp",
            run_id: "run-1",
            video_path: "C:\\media\\clip.mkv",
        };
        let prepared = with_scene_data(
            &script_model(),
            &[scene],
            &config,
            &scope,
            Some("TargetQuality"),
        )
        .expect("the data module writes")
        .expect("a script input is prepared");
        let InputModel::VapourSynthScript { variables, .. } = prepared else {
            panic!("the prepared input is still a script");
        };

        assert_eq!(variables["condor_sequence"], "TargetQuality");
        assert_eq!(variables["condor_run_id"], "run-1");
        assert_eq!(variables["condor_temp_dir"], "C:\\temp");
        assert_eq!(variables["condor_video_path"], "C:\\media\\clip.mkv");
        let table: serde_json::Value =
            serde_json::from_str(&variables["condor_scenes"]).expect("a JSON scene table");
        assert_eq!(table[0]["start"], 0);
        assert_eq!(table[0]["end"], 24);
        assert_eq!(
            table[0]["data"]["noise_detection"]["noise"], 5.5,
            "Noise Detector's result must reach the script"
        );
    }

    #[test]
    fn a_script_override_is_prepared_with_the_same_sequence_data() {
        let mut config = RunnerConfig::default();
        config.parallel_encoder.input = Some(script_model());
        let custom = script_data::CustomSceneData::default();
        let temp_dir = scratch_dir("script-override");
        let scope = ScriptScope {
            custom: &custom,
            temp_dir: temp_dir.to_str().expect("temporary path"),
            run_id: "run-1",
            video_path: "C:\\media\\clip.mkv",
        };
        let prepared = with_config_scene_data(&config, &[], &scope, Some("ParallelEncoder"))
            .expect("the data module writes");
        let Some(InputModel::VapourSynthScript { variables, .. }) = prepared.parallel_encoder.input
        else {
            panic!("the override is still a script");
        };
        assert_eq!(variables["condor_sequence"], "ParallelEncoder");
        assert_eq!(variables["condor_scenes"], "[]");
        assert_eq!(variables["condor_video_path"], "C:\\media\\clip.mkv");
    }

    #[test]
    fn injected_variables_are_not_persisted_but_user_variables_are() {
        let value = json!({
            "input": {
                "VapourSynthScript": {
                    "source": { "Text": "clip.set_output()" },
                    "variables": {
                        "condor_scenes": "[]",
                        "condor_sequence": "ParallelEncoder",
                        "user_value": "keep me"
                    }
                }
            },
            // The condor's sequence config carries the same script documents, so the
            // prepared copy must not smuggle a run's temporary paths into a checkpoint.
            "sequence_config": {
                "parallel_encoder": {
                    "input": {
                        "VapourSynthScript": {
                            "source": { "Text": "clip.set_output()" },
                            "variables": {
                                "condor_temp_dir": "C:\\\\temp",
                                "user_value": "keep me too"
                            }
                        }
                    }
                }
            }
        });
        let clean = without_injected_variables(value);
        let variables = &clean["input"]["VapourSynthScript"]["variables"];
        assert_eq!(variables["user_value"], "keep me");
        assert!(variables.get("condor_scenes").is_none());
        assert!(variables.get("condor_sequence").is_none());
        let nested = &clean["sequence_config"]["parallel_encoder"]["input"]["VapourSynthScript"]["variables"];
        assert_eq!(nested["user_value"], "keep me too");
        assert!(nested.get("condor_temp_dir").is_none());
    }

    #[test]
    fn building_scene_detector_does_not_open_an_unrelated_override() {
        let mut config = RunnerConfig::default();
        config.parallel_encoder.input = Some(
            serde_json::from_value(json!({
                "Video": {
                    "path": "C:\\does-not-exist\\clip.mkv",
                    "import_method": { "FFMS2": { "index": null, "cache_path": null } },
                    "filters": []
                }
            }))
            .expect("a native override"),
        );
        let (sender, _receiver) = mpsc::channel();
        let seq_no = AtomicU64::new(0);
        let cancel = Arc::new(AtomicBool::new(false));
        let opener = InputOpener {
            sender: &sender,
            run_id: "run-1",
            seq_no: &seq_no,
            cancel: &cancel,
        };

        let sequence = build_sequence("SceneDetector", &config, &opener)
            .expect("Scene Detector must not open Parallel Encoder's input");

        assert_eq!(sequence.details().name, "Scene Detector");
    }

    #[test]
    fn a_stage_completion_does_not_move_the_progress_bar() {
        let live = describe(&SequenceStatus::Whole(Status::Completed {
            id: "Scene Detector".to_owned(),
        }));

        assert_eq!(live.progress, None);
        assert_eq!(live.frames, None);
        assert_eq!(live.message, "Scene Detector");
    }

    #[test]
    fn a_new_scene_marker_does_not_move_the_progress_bar() {
        let marker = SequenceCompletion::Custom {
            name: "new-scene".to_owned(),
            completed: 95.0,
            total: 100.0,
        };
        assert_eq!(measure(&marker).progress, None);

        let indexing = SequenceCompletion::Custom {
            name: "Indexing Input".to_owned(),
            completed: 1.0,
            total: 4.0,
        };
        assert_eq!(measure(&indexing).progress, Some(25.0));
    }

    #[test]
    fn a_worker_reports_its_scene_without_taking_over_the_sequence_bar() {
        // Parallel Encoder: the parent is the whole encode, the child is one scene.
        let live = describe(&SequenceStatus::Subprocess {
            parent: Status::Processing {
                id: "Parallel Encoder".to_owned(),
                completion: SequenceCompletion::Frames {
                    completed: 50,
                    total: 200,
                },
            },
            child: Status::Processing {
                id: "12".to_owned(),
                completion: SequenceCompletion::PassFrames {
                    passes: (1, 2),
                    frames: (100, 200),
                },
            },
        });

        assert_eq!(live.progress, Some(25.0));
        assert_eq!(live.frames, Some((50, 200)));
        assert_eq!(live.scene, Some(12));
        assert_eq!(live.scene_progress, Some(50.0));
        assert_eq!((live.pass, live.max_passes), (Some(1), Some(2)));
    }

    /// Noise Detector measures one value per scene. The charts read the scene table, so the
    /// value has to cross the event boundary as it is measured, not when the run ends.
    #[test]
    fn a_noise_measurement_carries_its_scene_and_value() {
        let (sender, receiver) = mpsc::channel();
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "NoiseDetector",
            tick(SequenceStatus::Subprocess {
                parent: Status::Processing {
                    id: "Noise Detector".to_owned(),
                    completion: SequenceCompletion::Custom {
                        name: "Noise Detector".to_owned(),
                        completed: 12.0,
                        total: 275.0,
                    },
                },
                child: Status::Processing {
                    id: "Noise".to_owned(),
                    completion: SequenceCompletion::SceneQuality {
                        index: 11,
                        quantizer: 0.0,
                        score: 0.0032,
                        bitrate: 0.0,
                    },
                },
            }),
            None,
        );
        drop(sender);
        let event = receiver.recv().expect("noise event");
        assert_eq!(event.scene_index, Some(11));
        assert_eq!(event.scene_noise, Some(0.0032));
        assert_eq!(event.scene_quality, None);
        // The bar is the sequence's scene tally, not the one sampled value.
        assert_eq!(event.progress, Some(12.0 / 275.0 * 100.0));
    }

    /// Target Quality's compare step reports a scene score in the same shape. A probe's
    /// score belongs to one pass, so it must not be presented as measured noise.
    #[test]
    fn another_sequence_s_scene_score_is_not_a_noise_measurement() {
        let (sender, receiver) = mpsc::channel();
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "TargetQuality",
            tick(SequenceStatus::Subprocess {
                parent: Status::Processing {
                    id: "Target Quality".to_owned(),
                    completion: SequenceCompletion::Passes {
                        completed: 1,
                        total: 4,
                    },
                },
                child: Status::Processing {
                    id: "Compare".to_owned(),
                    completion: SequenceCompletion::SceneQuality {
                        index: 3,
                        quantizer: 28.0,
                        score: 91.5,
                        bitrate: 4_000_000.0,
                    },
                },
            }),
            None,
        );
        drop(sender);
        let event = receiver.recv().expect("compare event");
        assert_eq!(event.scene_noise, None);
        assert_eq!(event.scene_quality, None);
    }

    /// Quality Check reports one score per finished scene in the same child shape as Noise
    /// Detector. Its score chart reads the scene table's quality score, so the value must
    /// cross the event boundary as its own measurement rather than as noise.
    #[test]
    fn a_quality_check_score_carries_its_scene_and_value() {
        let (sender, receiver) = mpsc::channel();
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "QualityCheck",
            tick(SequenceStatus::Subprocess {
                parent: Status::Processing {
                    id: "Quality Check".to_owned(),
                    completion: SequenceCompletion::Custom {
                        name: "Quality Check".to_owned(),
                        completed: 12.0,
                        total: 100.0,
                    },
                },
                child: Status::Processing {
                    id: "Quality".to_owned(),
                    completion: SequenceCompletion::SceneQuality {
                        index: 7,
                        quantizer: 0.0,
                        score: 94.5,
                        bitrate: 4_000_000.0,
                    },
                },
            }),
            None,
        );
        drop(sender);
        let event = receiver.recv().expect("quality check event");
        assert_eq!(event.scene_index, Some(7));
        assert_eq!(event.scene_quality, Some(94.5));
        assert_eq!(event.scene_noise, None);
        assert_eq!(event.progress, Some(12.0));
    }

    /// Native and VMAF Quality Check paths emit a score for every frame and never send the
    /// `SceneQuality` child the plugin path sends. The runner has to assemble the scene from
    /// those frames, or the score chart stays empty until the end-of-run checkpoint.
    #[test]
    fn a_quality_check_scene_is_published_when_its_frames_are_complete() {
        let scenes = vec![chunked_scene(0, 3, 0, 0, 0), chunked_scene(3, 5, 0, 0, 0)];
        let config = RunnerConfig {
            quality_check: Some(Default::default()),
            ..RunnerConfig::default()
        };
        let mut resume = Resume::scored(&scenes, &config)
            .expect("valid probe strategy")
            .expect("a quality tally");

        let send = |resume: &mut Resume, frame: u64, score: f64| {
            let (sender, receiver) = mpsc::channel();
            forward_progress(
                &sender,
                "run-1",
                &AtomicU64::new(0),
                "QualityCheck",
                tick(SequenceStatus::Subprocess {
                    parent: Status::Processing {
                        id: "Quality Check".to_owned(),
                        completion: SequenceCompletion::Custom {
                            name: "Quality Check".to_owned(),
                            completed: frame as f64 + 1.0,
                            total: 5.0,
                        },
                    },
                    child: Status::Processing {
                        id: "Quality".to_owned(),
                        completion: SequenceCompletion::FrameScore { frame, score },
                    },
                }),
                Some(resume),
            );
            drop(sender);
            receiver.recv().expect("a quality check frame event")
        };

        let first_frame = send(&mut resume, 0, 90.0);
        assert_eq!(first_frame.scene_quality, None);
        assert_eq!(first_frame.frames_processed, Some(1));
        assert_eq!(first_frame.frames_total, Some(5));
        assert_eq!(first_frame.scenes_processed, Some(0));
        assert_eq!(first_frame.scenes_total, Some(2));

        let second_frame = send(&mut resume, 1, 96.0);
        assert_eq!(second_frame.scene_quality, None);
        assert_eq!(second_frame.frames_processed, Some(2));
        assert_eq!(second_frame.scenes_processed, Some(0));

        let first_done = send(&mut resume, 2, 96.0);
        assert_eq!(first_done.scene_index, Some(0));
        assert_eq!(first_done.scene_quality, Some(94.0));
        assert_eq!(first_done.scene_noise, None);
        assert_eq!(first_done.frames_processed, Some(3));
        assert_eq!(first_done.scenes_processed, Some(1));

        let third_frame = send(&mut resume, 3, 86.0);
        assert_eq!(third_frame.scene_quality, None);
        assert_eq!(third_frame.frames_processed, Some(4));
        assert_eq!(third_frame.scenes_processed, Some(1));

        let second_done = send(&mut resume, 4, 90.0);
        assert_eq!(second_done.scene_index, Some(1));
        assert_eq!(second_done.scene_quality, Some(88.0));
        assert_eq!(second_done.frames_processed, Some(5));
        assert_eq!(second_done.frames_total, Some(5));
        assert_eq!(second_done.scenes_processed, Some(2));
        assert_eq!(second_done.scenes_total, Some(2));
    }

    /// A resumed check scores only the pending scenes, but its counters describe the video:
    /// the frames and scenes an earlier attempt finished are part of both numerator and
    /// denominator. Only the ETA's remaining work comes from the pending span.
    #[test]
    fn a_resumed_quality_check_counts_the_whole_video() {
        let mut scored = chunked_scene(0, 3, 0, 0, 0);
        scored.sequence_data.quality_check = QualityCheckData {
            quality: QualityPass {
                scores: vec![90.0, 91.0, 92.0],
                ..Default::default()
            },
        };
        let scenes = vec![scored, chunked_scene(3, 5, 0, 0, 0)];
        let config = RunnerConfig {
            quality_check: Some(Default::default()),
            ..RunnerConfig::default()
        };
        let mut resume = Resume::scored(&scenes, &config)
            .expect("valid probe strategy")
            .expect("a quality tally");

        let (sender, receiver) = mpsc::channel();
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "QualityCheck",
            tick(SequenceStatus::Subprocess {
                parent: Status::Processing {
                    id: "Quality Check".to_owned(),
                    completion: SequenceCompletion::Custom {
                        name: "Quality Check".to_owned(),
                        completed: 1.0,
                        total: 2.0,
                    },
                },
                child: Status::Processing {
                    id: "Quality".to_owned(),
                    completion: SequenceCompletion::FrameScore {
                        frame: 3,
                        score: 86.0,
                    },
                },
            }),
            Some(&mut resume),
        );
        drop(sender);
        let event = receiver.recv().expect("a quality check frame event");

        assert_eq!(event.frames_processed, Some(4));
        assert_eq!(event.frames_total, Some(5));
        assert_eq!(event.scenes_processed, Some(1));
        assert_eq!(event.scenes_total, Some(2));
        assert_eq!(event.progress, Some(80.0));
    }

    /// One processing tick, as the engine sends it.
    fn tick(progress: SequenceStatus) -> SequenceProgressEvent {
        SequenceProgressEvent {
            sequence_type: SequenceType::Processing,
            index: 0,
            details: andean_condor::core::sequence::SequenceDetails {
                name: "Parallel Encoder",
                description: "Encodes a set of scenes in parallel.",
                version: "0.0.1",
            },
            progress,
        }
    }

    /// `finalize_scene` reports a scene's byte size as two equal numbers. Read as a ratio
    /// that is 100%, which is what latched the whole encode's bar at 100 after the first
    /// finished scene and kept it there for the rest of the run.
    #[test]
    fn a_finished_scene_s_byte_size_is_not_progress() {
        let size = SequenceCompletion::Custom {
            name: "size".to_owned(),
            completed: 9_000_000.0,
            total: 9_000_000.0,
        };

        assert_eq!(measure(&size).progress, None);
        assert_eq!(
            describe(&SequenceStatus::Whole(Status::Processing {
                id: "35".to_owned(),
                completion: size,
            }))
            .progress,
            None
        );
    }

    /// The size report is a measurement of output, so it belongs in the log. As a progress
    /// tick it also carried no phase, which restarted the client's rate window and dropped
    /// the FPS and ETA every time a worker finished a scene.
    #[test]
    fn a_scene_size_report_is_a_detail_record_not_a_progress_tick() {
        let (sender, receiver) = mpsc::channel();
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "ParallelEncoder",
            tick(SequenceStatus::Whole(Status::Processing {
                id: "35".to_owned(),
                completion: SequenceCompletion::Custom {
                    name: "size".to_owned(),
                    completed: 9_000_000.0,
                    total: 9_000_000.0,
                },
            })),
            None,
        );
        drop(sender);
        let events: Vec<EncodeEvent> = receiver.iter().collect();

        assert_eq!(events.len(), 1, "one status is one record");
        assert_eq!(events[0].kind, EncodeEventKind::Detail);
        assert_eq!(events[0].progress, None);
        assert!(
            events[0].message.contains("9000000"),
            "the size is the whole point of the record: {}",
            events[0].message
        );
    }

    /// Each finished scene is one child `Completed`; a repeated report for the same scene
    /// is not a second scene.
    #[test]
    fn a_finished_worker_counts_one_scene_once() {
        let mut tally = SceneTally {
            total: 4,
            done: 1,
            total_frames: 40,
            seen: HashSet::new(),
        };
        let done = |id: &str| SequenceStatus::Subprocess {
            parent: Status::Processing {
                id: "Parallel Encoder".to_owned(),
                completion: SequenceCompletion::Frames {
                    completed: 10,
                    total: 40,
                },
            },
            child: Status::Completed { id: id.to_owned() },
        };

        tally.observe(&done("2"));
        tally.observe(&done("2"));
        tally.observe(&done("3"));

        assert_eq!(tally.reported(), Some((3, 4)));
    }

    /// Parallel Encoder's own ticks count frames; the tally beside the stream is what gives
    /// the aggregate bar a scene count to print.
    #[test]
    fn the_aggregate_tick_carries_the_scene_tally() {
        let (sender, receiver) = mpsc::channel();
        let mut resume = Resume::Encoder(SceneTally {
            total: 8,
            done: 3,
            total_frames: 2_000,
            seen: HashSet::new(),
        });
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "ParallelEncoder",
            tick(SequenceStatus::Whole(Status::Processing {
                id: "Parallel Encoder".to_owned(),
                completion: SequenceCompletion::Frames {
                    completed: 500,
                    total: 2_000,
                },
            })),
            Some(&mut resume),
        );
        drop(sender);
        let events: Vec<EncodeEvent> = receiver.iter().collect();

        assert_eq!(events[0].progress, Some(25.0));
        assert_eq!(events[0].frames_processed, Some(500));
        assert_eq!(events[0].frames_total, Some(2_000));
        assert_eq!(events[0].scenes_processed, Some(3));
        assert_eq!(events[0].scenes_total, Some(8));
    }

    /// A resumed run queues only the scenes that still lack a chunk, so the engine's own
    /// frame pair describes what this run has left. Reporting it unchanged beside the
    /// video's scene tally made a nearly finished encode read `273/278 scenes (3,441/3,850
    /// frames) · 89.38%` and its ETA describe the last five scenes rather than the video.
    #[test]
    fn a_resumed_encoder_tick_reports_the_video_s_whole_frame_span() {
        let (sender, receiver) = mpsc::channel();
        let mut resume = Resume::Encoder(SceneTally {
            total: 278,
            done: 273,
            // The five scenes this run queued hold 3,850 of the video's 39,000 frames.
            total_frames: 39_000,
            seen: HashSet::new(),
        });
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "ParallelEncoder",
            tick(SequenceStatus::Whole(Status::Processing {
                id: "Parallel Encoder".to_owned(),
                completion: SequenceCompletion::Frames {
                    completed: 3_441,
                    total: 3_850,
                },
            })),
            Some(&mut resume),
        );
        drop(sender);
        let event = receiver.recv().expect("the aggregate tick");

        assert_eq!(event.frames_processed, Some(38_591));
        assert_eq!(event.frames_total, Some(39_000));
        assert_eq!(event.progress, Some((38_591.0 / 39_000.0) * 100.0));
        assert_eq!(event.scenes_processed, Some(273));
        assert_eq!(event.scenes_total, Some(278));
    }

    /// Quality Check scores only the scenes without scores, and its tick divides this run's
    /// position by those pending frames. On a resume that restarted the bar at zero behind
    /// frames the user had already watched fill, so the earlier scores are added back.
    #[test]
    fn a_resumed_quality_check_counts_the_frames_it_already_scored() {
        let resume = Resume::Scored {
            done: 300.0,
            total: 400.0,
            quality: QualityTally::default(),
        };
        let status = SequenceStatus::Subprocess {
            parent: Status::Processing {
                id: "Quality Check".to_owned(),
                completion: SequenceCompletion::Custom {
                    name: "Quality Check".to_owned(),
                    completed: 25.0,
                    total: 100.0,
                },
            },
            child: Status::Processing {
                id: "Quality".to_owned(),
                completion: SequenceCompletion::FrameScore {
                    frame: 900,
                    score: 91.5,
                },
            },
        };

        assert_eq!(resume.rescore(&status), Some(81.25));

        let (sender, receiver) = mpsc::channel();
        forward_progress(
            &sender,
            "run-1",
            &AtomicU64::new(0),
            "QualityCheck",
            tick(status),
            Some(&mut Resume::Scored {
                done: 300.0,
                total: 400.0,
                quality: QualityTally::default(),
            }),
        );
        drop(sender);
        let event = receiver.recv().expect("a quality check tick");

        assert_eq!(event.progress, Some(81.25));
        // The pair is the video's sampled frames: 300 already scored plus 25 this run.
        assert_eq!(event.frames_processed, Some(325));
        assert_eq!(event.frames_total, Some(400));
    }

    /// A first Quality Check run has nothing to add: its pending frames are the video's
    /// sampled frames, so the rescore lands on the engine's own percentage.
    #[test]
    fn a_first_quality_check_run_keeps_the_engine_s_percentage() {
        let status = SequenceStatus::Whole(Status::Processing {
            id: "Quality Check".to_owned(),
            completion: SequenceCompletion::Custom {
                name: "Quality Check".to_owned(),
                completed: 25.0,
                total: 400.0,
            },
        });
        let resume = Resume::Scored {
            done: 0.0,
            total: 400.0,
            quality: QualityTally::default(),
        };

        assert_eq!(resume.rescore(&status), describe(&status).progress);
    }

    #[test]
    fn a_pass_sequence_reports_the_step_s_own_progress_twice_per_pass() {
        let at = |phase: &str, done: u64| {
            describe(&SequenceStatus::Subprocess {
                parent: Status::Processing {
                    id: "Target Quality".to_owned(),
                    completion: SequenceCompletion::Passes {
                        completed: 2,
                        total: 4,
                    },
                },
                child: Status::Processing {
                    id: phase.to_owned(),
                    completion: SequenceCompletion::Frames {
                        completed: done,
                        total: 100,
                    },
                },
            })
        };

        // Every pass fills the bar twice: encoding from 0 to 100, then comparing from 0 to
        // 100 again. Dividing by the configured maximum of four passes put pass 2 at 25% and
        // pretended the run could not end sooner, which it can.
        assert_eq!(at("Encode", 0).progress, Some(0.0));
        assert_eq!(at("Encode", 100).progress, Some(100.0));
        assert_eq!(at("Compare", 0).progress, Some(0.0));
        assert_eq!(at("Compare", 20).progress, Some(20.0));
        assert_eq!(at("Compare", 100).progress, Some(100.0));
        assert_eq!(at("Compare", 20).pass, Some(2));
        assert_eq!(at("Compare", 20).max_passes, Some(4));
    }

    #[test]
    fn a_pass_counter_is_not_a_percentage_of_the_run() {
        // Before a pass, Target Quality announces `(pass - 1) of pass`: before its second
        // pass, `1 of 2`, not `2 of 4`. Read as a ratio it put the bar at 50% and labelled
        // the row "Pass 1" while pass 2 was about to start, so a tick with no step reports
        // neither a percentage nor a pass position.
        let live = describe(&SequenceStatus::Whole(Status::Processing {
            id: "Target Quality".to_owned(),
            completion: SequenceCompletion::Passes {
                completed: 2,
                total: 3,
            },
        }));

        assert_eq!(live.progress, None);
        assert_eq!((live.pass, live.max_passes), (None, None));
    }

    #[test]
    fn a_noise_detector_child_result_keeps_the_scene_bar() {
        let live = describe(&SequenceStatus::Subprocess {
            parent: Status::Processing {
                id: "Noise Detector".to_owned(),
                completion: SequenceCompletion::Custom {
                    name: "Noise Detector".to_owned(),
                    completed: 41.0,
                    total: 275.0,
                },
            },
            child: Status::Processing {
                id: "Quality".to_owned(),
                completion: SequenceCompletion::SceneQuality {
                    index: 7,
                    quantizer: 0.0,
                    score: 0.0021,
                    bitrate: 0.0,
                },
            },
        });

        assert_eq!(live.progress, Some(41.0 / 275.0 * 100.0));
        assert_eq!(live.scenes, Some((41, 275)));
        assert_eq!(live.phase.as_deref(), Some("Quality"));
    }

    #[test]
    fn a_native_input_is_not_rewritten() {
        let native: InputModel = serde_json::from_value(json!({
            "Video": {
                "path": "C:\\media\\clip.mkv",
                "import_method": { "FFMS2": { "index": null, "cache_path": null } },
                "filters": []
            }
        }))
        .expect("a native input");
        let custom = script_data::CustomSceneData::new();
        let config = RunnerConfig::default();
        let temp_dir = scratch_dir("native-input");
        let scope = ScriptScope {
            custom: &custom,
            temp_dir: temp_dir.to_str().expect("temporary path"),
            run_id: "run",
            video_path: "",
        };
        assert!(
            with_scene_data(&native, &[], &config, &scope, None)
                .expect("a native input needs no module")
                .is_none()
        );
    }
}
