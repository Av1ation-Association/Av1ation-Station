//! The encode worker loop: open input, build sequences, checkpoint, and translate progress.

use super::*;

pub(super) fn encode(
    request: EncodeRequest,
    sender: &Sender<EncodeEvent>,
    cancel: &Arc<AtomicBool>,
    seq_no: &Arc<AtomicU64>,
) -> Result<(), String> {
    let input_model: InputModel = serde_json::from_value(request.input)
        .map_err(|error| format!("The input is not valid: {error}"))?;
    let output_model: OutputModel = serde_json::from_value(request.output)
        .map_err(|error| format!("The output is not valid: {error}"))?;
    let encoder: Encoder = serde_json::from_value(request.encoder)
        .map_err(|error| format!("The encoder is not valid: {error}"))?;
    // The log names the encoder the run actually resolves; the typed value moves into the
    // engine below, so its document is captured first.
    let encoder_document = serde_json::to_value(&encoder).ok();
    let config: RunnerConfig = serde_json::from_value(request.sequence_config)
        .map_err(|error| format!("The sequence configuration is not valid: {error}"))?;
    // Read before the blob is moved into the engine: the pairs are not part of the
    // checkpoint the engine loads, and they must survive every reopen of the script.
    let custom_scene_data = script_data::custom_scene_data(request.condor.as_ref());
    let mut scenes = match request.condor {
        Some(value) => {
            serde_json::from_value::<SavedCondor>(value)
                .map_err(|error| format!("The saved engine state is not readable: {error}"))?
                .scenes
        }
        None => Vec::new(),
    };
    // A gap in the middle of the table cannot be encoded as a gap: one clip is opened and
    // spliced from these ranges, so an uncovered range would be cut out and shift every later
    // scene. The scene before the hole takes it, which is who was decoding those frames
    // anyway. The checkpoint then shares the repaired table through the engine's save
    // callback, so a run records the ranges it actually encoded.
    crate::run::reset::close_scene_gaps_in(&mut scenes);
    // A resumed encode's table already carries the chunks its previous run wrote. Reading
    // them before the engine starts is what keeps the first checkpoint from announcing a
    // table's worth of rows the rail has already shown.
    let announced = Arc::new(Announced::new(&scenes));

    let opener = InputOpener {
        sender,
        run_id: &request.run_id,
        seq_no: seq_no.as_ref(),
        cancel,
    };

    // A script input is evaluated when it is opened, so a graph built once at the start
    // would never see anything a later sequence produced. The table is defined from the
    // first open (empty on a first run, the saved scenes on a later one), and the graph is
    // rebuilt before every sequence with the current scene table and sequence data.
    let base_input = input_model.clone();
    let temp_dir = config
        .parallel_encoder
        .scenes_directory
        .display()
        .to_string();
    let first_sequence = request.sequences.first().map(String::as_str);
    let scenes_for_initial = scenes.clone();
    let script_scope = ScriptScope {
        custom: &custom_scene_data,
        temp_dir: &temp_dir,
        run_id: &request.run_id,
        video_path: &request.video_path,
    };
    let initial_input =
        with_scene_data(&base_input, &scenes, &config, &script_scope, first_sequence)?
            .unwrap_or(input_model);

    // The whole run shares one input and one `Condor`, as the CLI does: scene detection
    // leaves the decoder at EOF, and `ParallelEncoder` opens its own frame source per
    // worker, so a later sequence never reads the exhausted decoder. Rebuilding the
    // script replaces the graph, not the `Condor`, so scenes and checkpoints survive.
    let mut input = opener.open(&initial_input, "Opening input")?;
    // The log's run-start line describes the clip every sequence will process. The decoder
    // caches this, so a later sequence does not pay for it again.
    let source = input.clip_info().ok().map(|info| {
        let (width, height) = info.resolution;
        let fps = *info.frame_rate.numer() as f64 / *info.frame_rate.denom() as f64;
        (
            width,
            height,
            fps,
            u64::try_from(info.num_frames).unwrap_or(u64::MAX),
        )
    });
    let output = CoreOutput::new(&output_model)
        .map_err(|error| format!("The output could not be opened: {error}"))?;
    // Per-sequence input overrides are prepared with the same scene data before the first
    // sequence. Later sequences replace this snapshot only when a script needs the current
    // table; each sequence's input is opened when that sequence is built, not here.
    let initial_config =
        with_config_scene_data(&config, &scenes_for_initial, &script_scope, first_sequence)?;

    let checkpoint_error = Arc::new(Mutex::new(None::<String>));
    let checkpoint = Arc::clone(&request.checkpoint);
    let callback = checkpoint_callback(
        Arc::clone(&checkpoint_error),
        Arc::clone(cancel),
        checkpoint,
        sender.clone(),
        Arc::clone(seq_no),
        request.run_id.clone(),
        announced,
    );
    let condor = Condor::new(
        input,
        output,
        encoder,
        scenes,
        Some(config.clone()),
        callback,
    );
    // Sequences are built one at a time. A per-sequence input can be a second full
    // decoder graph, so keeping every configured override open for the whole run wastes
    // memory and makes an unrelated broken override fail a single-sequence run.
    let mut app = DefaultAndeanCondor {
        condor,
        sequences: Vec::new(),
    };

    // Run-start context, in the log only. A per-scene noise value is only meaningful beside
    // the source it was measured on and the settings that produced it, and neither is
    // recoverable from the scene table afterwards.
    let config_before = serde_json::to_value(&config).unwrap_or(serde_json::Value::Null);
    for line in sequence_log::run_start(
        source.map(|(width, height, fps, frames)| sequence_log::Source {
            path: &request.video_path,
            width,
            height,
            fps,
            frames,
        }),
        encoder_document.as_ref(),
        &request.sequences,
        &config_before,
    ) {
        emit(
            sender,
            &request.run_id,
            seq_no.as_ref(),
            EventNote {
                kind: EncodeEventKind::Detail,
                sequence: None,
                progress: None,
                message: line,
                frames: None,
                level: Some("info"),
                live: Live::default(),
            },
        );
    }

    // Opening a sequence's own input can fail before the sequence exists. Announce the
    // failed attempt before returning so the timeline records the sequence that could not
    // start; otherwise the run-level failure would be indistinguishable from a General
    // input failure.
    let announce_started = |id: &str, display: &str| {
        emit(
            sender,
            &request.run_id,
            seq_no.as_ref(),
            EventNote {
                kind: EncodeEventKind::Started,
                sequence: Some(id),
                progress: Some(0.0),
                message: format!("{display} started"),
                frames: None,
                level: Some("info"),
                live: Live::default(),
            },
        );
    };

    let mut failure = None;
    for (position, id) in request.sequences.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        // Drop the previous sequence before opening the next input, so two override
        // decoders are never held at once.
        app.sequences.clear();

        // Every sequence starts from a graph that knows what the run has produced so far:
        // detected scenes before Noise Detector, noise results before Target Quality, and
        // so on. The first sequence uses the graph opened above.
        let built = (|| -> Result<Box<dyn Sequence<DefaultSequenceData, RunnerConfig>>, String> {
            // Scene Concatenator reads the chunk files, not decoded frames. Reopening a
            // script for it changes the input document after the chunks were written and
            // makes their saved source context look stale. Keep the graph that produced the
            // chunks; the concatenator never opens it.
            let reopened = if position > 0 && id != "SceneConcatenator" {
                with_scene_data(
                    &base_input,
                    &app.condor.scenes,
                    &config,
                    &script_scope,
                    Some(id),
                )?
            } else {
                None
            };
            if let Some(model) = reopened {
                let reopened = opener.open(&model, &format!("Reopening the script for {id}"))?;
                app.condor.input = reopened;
            }
            // Prepare only this sequence's configuration. Building the whole set here used to
            // evaluate every script override, including overrides for sequences not in this run.
            let prepared = if position > 0 && has_script_override(&config) {
                Some(with_config_scene_data(
                    &config,
                    &app.condor.scenes,
                    &script_scope,
                    Some(id),
                )?)
            } else {
                None
            };
            let sequence_config = match &prepared {
                Some(prepared) => prepared,
                None if position == 0 => &initial_config,
                None => &config,
            };
            // Sequences such as Target Quality inherit an input from the condor's own
            // configuration rather than from their sequence document. The engine must hold the
            // prepared graph, or an inherited script opens without this run's injected values
            // and fails on `condor_temp_dir`.
            app.condor.sequence_config = sequence_config.clone();
            build_sequence(id, sequence_config, &opener)
        })();
        let sequence = match built {
            Ok(sequence) => sequence,
            Err(error) => {
                announce_started(id, id);
                return Err(error);
            }
        };
        app.sequences.push(sequence);
        // The engine names its own sequences; a log line that says `SceneDetector` reads
        // like a code identifier rather than the stage the user pressed.
        let display = app
            .sequences
            .last()
            .map_or_else(|| id.clone(), |sequence| sequence.details().name.to_owned());
        announce_started(id, &display);
        // What the table held before this sequence ran, so a resumed run's log divides only
        // the work it added by its own clock.
        let last_end_before = app
            .condor
            .scenes
            .last()
            .map_or(0, |scene| scene.end_frame as u64);
        let measured_before = app
            .condor
            .scenes
            .iter()
            .filter(|scene| {
                scene
                    .sequence_data
                    .get_noise_detection()
                    .is_ok_and(Option::is_some)
            })
            .count();
        // Parallel Encoder's ticks carry the aggregate frame count but no scene count. A
        // reader also needs to know how many of the video's scenes are done, and this is the
        // one place that sees both every completion and the table they are counted against.
        let resume = Resume::for_sequence(id, &app.condor.scenes, &config)?;

        let (progress_tx, progress_rx) = mpsc::channel::<SequenceProgressEvent>();
        let forwarder = thread::Builder::new()
            .name(format!("encode-events-{id}"))
            .spawn({
                let sender = sender.clone();
                let run_id = request.run_id.clone();
                let progress_seq = Arc::clone(seq_no);
                let id = id.clone();
                move || {
                    let mut resume = resume;
                    for event in progress_rx {
                        forward_progress(
                            &sender,
                            &run_id,
                            progress_seq.as_ref(),
                            &id,
                            event,
                            resume.as_mut(),
                        );
                    }
                }
            })
            .map_err(|error| format!("the progress bridge could not start: {error}"))?;

        let sequence_started = Instant::now();
        let outcome = app.process_one(Some(0), progress_tx, Arc::clone(cancel));
        let _ = forwarder.join();

        if let Some(error) = take_error(&checkpoint_error) {
            failure = Some(error);
            break;
        }
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        match outcome {
            Ok(((), (validation, initialization, processing))) => {
                for warning in validation.iter().chain(&initialization).chain(&processing) {
                    tracing::warn!(sequence = id.as_str(), "{warning}");
                    emit(
                        sender,
                        &request.run_id,
                        seq_no.as_ref(),
                        EventNote {
                            kind: EncodeEventKind::Warning,
                            sequence: Some(id.as_str()),
                            progress: None,
                            message: format!("{display}: {warning}"),
                            frames: None,
                            level: Some("warn"),
                            live: Live::default(),
                        },
                    );
                }

                // The sequences checkpoint themselves; this one closes the boundary, so a
                // cancel in the gap before the next sequence keeps what this one did.
                if let Err(error) = app.condor.save() {
                    failure = Some(format!("the engine state could not be saved: {error}"));
                    break;
                }

                // What this sequence produced, read from the table it just checkpointed.
                // These records are log-only: a five-thousand-scene video would otherwise
                // push every live progress event out of the replay buffer and the stream.
                let scenes: Vec<serde_json::Value> = app
                    .condor
                    .scenes
                    .iter()
                    .filter_map(|scene| serde_json::to_value(scene).ok())
                    .collect();
                let config_after = serde_json::to_value(&app.condor.sequence_config)
                    .unwrap_or(serde_json::Value::Null);
                let records = sequence_log::records(
                    id,
                    &scenes,
                    Context {
                        config_before: &config_before,
                        config_after: &config_after,
                        fps: source.map(|(_, _, fps, _)| fps),
                        elapsed_seconds: sequence_started.elapsed().as_secs_f64(),
                        last_end_before,
                        measured_before,
                    },
                );
                // A per-scene result is the evidence behind a summary, so it is debug; the
                // summary is what a reader opens the log for and stays info.
                for (lines, level) in [(records.detail, "debug"), (records.summary, "info")] {
                    for line in lines {
                        emit(
                            sender,
                            &request.run_id,
                            seq_no.as_ref(),
                            EventNote {
                                kind: EncodeEventKind::Detail,
                                sequence: Some(id.as_str()),
                                progress: None,
                                message: line,
                                frames: None,
                                level: Some(level),
                                live: Live::default(),
                            },
                        );
                    }
                }

                emit(
                    sender,
                    &request.run_id,
                    seq_no.as_ref(),
                    EventNote {
                        kind: EncodeEventKind::Completed,
                        sequence: Some(id),
                        progress: Some(100.0),
                        message: format!("{display} completed"),
                        frames: None,
                        level: Some("info"),
                        live: Live::default(),
                    },
                );
            }
            Err(error) => {
                failure = Some(explain_failure(id, &error.to_string()));
                break;
            }
        }
    }

    match failure {
        Some(message) => Err(message),
        None => Ok(()),
    }
}
