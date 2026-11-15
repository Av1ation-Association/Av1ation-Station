//! Input opening and construction of the next engine sequence.

use super::*;

/// The message a request gets when it names a sequence this build does not offer.
pub(super) fn sequence_unavailable(id: &str) -> String {
    if id == "SerialEncoder" {
        return "SerialEncoder is not available: the engine's serial encoder joins its \
                progress reporter before dropping the reporter's sender, so it deadlocks \
                unless the encoder reports one line per frame. Use ParallelEncoder with \
                one worker instead."
            .to_owned();
    }
    format!("Sequence `{id}` is not available for this video")
}

/// Turn an engine error into something a user can act on.
///
/// The engine's streaming Parallel Encoder reports a dead frame channel instead of the
/// encoder exit that caused it: the streaming worker discards the encoder's
/// `EncoderResult`, so the child's stderr never reaches this process. The message names the
/// likely cause rather than pretending the channel is the problem.
pub(super) fn explain_failure(sequence: &str, message: &str) -> String {
    if message.contains("frame production failed") && message.contains("disconnected channel") {
        return format!(
            "{sequence} failed: the encoder exited before consuming its frames \
             ({message}). Check the encoder parameters and that the encoder binary runs on \
             its own; the engine's streaming encoder discards its stderr."
        );
    }
    if message.contains("cannot resume") || message.contains("were invalidated") {
        return format!(
            "{sequence} failed: the saved result no longer matches the current source, \
             scenes, encoder or metric, so it cannot be reused ({message}). Open Data and \
             reset the named sequences; the source and configuration are kept."
        );
    }
    format!("{sequence} failed: {message}")
}

pub(super) fn take_error(slot: &Arc<Mutex<Option<String>>>) -> Option<String> {
    slot.lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take()
}

/// Opens the inputs one run needs, reporting the engine's index progress as events.
pub(super) struct InputOpener<'a> {
    pub(super) sender: &'a Sender<EncodeEvent>,
    pub(super) run_id: &'a str,
    pub(super) seq_no: &'a AtomicU64,
    pub(super) cancel: &'a Arc<AtomicBool>,
}

impl InputOpener<'_> {
    pub(super) fn open(&self, data: &InputModel, label: &str) -> Result<CoreInput, String> {
        crate::script::imports::refresh(data);
        // Indexing reports one unit per percent, so one event per decile is enough.
        let mut last_decile = 0_u64;
        CoreInput::ensure_indexed(
            data,
            |progress| match progress {
                OpenProgress::Indexing { current, total } if total > 0 => {
                    let decile = (current.saturating_mul(100) / total).min(100) / 10;
                    if decile > last_decile {
                        last_decile = decile;
                        emit(
                            self.sender,
                            self.run_id,
                            self.seq_no,
                            EventNote {
                                kind: EncodeEventKind::Progress,
                                sequence: None,
                                progress: Some(decile as f64 * 10.0),
                                message: format!("{label}: indexing {}%", decile * 10),
                                frames: None,
                                level: Some("debug"),
                                live: Live::default(),
                            },
                        );
                    }
                }
                OpenProgress::Indexing { .. } => {}
                OpenProgress::Opening => emit(
                    self.sender,
                    self.run_id,
                    self.seq_no,
                    EventNote {
                        kind: EncodeEventKind::Progress,
                        sequence: None,
                        progress: None,
                        message: label.to_owned(),
                        frames: None,
                        level: Some("debug"),
                        live: Live::default(),
                    },
                ),
            },
            Some(self.cancel.as_ref()),
        )
        .map_err(|error| {
            let message = error.to_string();
            crate::script::plugins::explain_open_error(data, &message)
                .unwrap_or_else(|| format!("the input could not be opened: {message}"))
        })
    }

    /// Open a per-sequence input override, or inherit the run's input when it is absent.
    fn open_optional(&self, input: &Option<InputModel>) -> Result<Option<CoreInput>, String> {
        input
            .as_ref()
            .map(|input| self.open(input, "Opening sequence input"))
            .transpose()
    }
}

/// Drive the same engine loop upstream implements for `DefaultSequenceConfig`.
///
/// The upstream `AndeanCondor` trait is implemented only for the default config, and the
/// default config cannot carry Benchmarker or Speed Scaler. The loop is reproduced here
/// against [`RunnerConfig`] so both sequences can run without forking the engine crate.
impl AndeanCondor<DefaultSequenceData, RunnerConfig>
    for DefaultAndeanCondor<DefaultSequenceData, RunnerConfig>
{
    fn condor(&self) -> &Condor<DefaultSequenceData, RunnerConfig> {
        &self.condor
    }

    fn condor_mut(&mut self) -> &mut Condor<DefaultSequenceData, RunnerConfig> {
        &mut self.condor
    }

    fn load(
        save_file_path: &Path,
    ) -> anyhow::Result<Option<CondorModel<DefaultSequenceData, RunnerConfig>>> {
        if !save_file_path.exists() {
            return Ok(None);
        }
        let data = std::fs::read_to_string(save_file_path)?;
        Ok(Some(serde_json::from_str(&data)?))
    }

    fn process_one(
        &mut self,
        processor_index: Option<usize>,
        progress_event_tx: mpsc::Sender<SequenceProgressEvent>,
        cancelled: Arc<AtomicBool>,
    ) -> anyhow::Result<((), SequenceWarningsTuple)> {
        self.process_one_cancel(processor_index, progress_event_tx, cancelled.into())
    }

    fn process_one_cancel(
        &mut self,
        processor_index: Option<usize>,
        progress_event_tx: mpsc::Sender<SequenceProgressEvent>,
        cancellation: Cancellation,
    ) -> anyhow::Result<((), SequenceWarningsTuple)> {
        cancellation.check()?;
        let index = processor_index.unwrap_or(0);
        let processor = &mut self.sequences[index];
        let details = processor.details();

        let (_, validation_warnings) = processor.validate(&mut self.condor)?;
        let (progress_tx, progress_rx) = mpsc::channel();
        let event_tx = progress_event_tx.clone();
        let initialization_progress_thread = thread::spawn(move || -> anyhow::Result<()> {
            for progress in progress_rx {
                event_tx.send(SequenceProgressEvent {
                    sequence_type: SequenceType::Initialization,
                    index,
                    details,
                    progress,
                })?;
            }
            Ok(())
        });
        let initialized = processor.initialize_cancel(&mut self.condor, progress_tx, &cancellation);
        initialization_progress_thread
            .join()
            .map_err(|_| anyhow::anyhow!("the initialization progress bridge panicked"))??;
        let (_, initialization_warnings) = initialized?;

        let (progress_tx, progress_rx) = mpsc::channel();
        let process_progress_thread = thread::spawn(move || -> anyhow::Result<()> {
            for progress in progress_rx {
                progress_event_tx.send(SequenceProgressEvent {
                    sequence_type: SequenceType::Processing,
                    index,
                    details,
                    progress,
                })?;
            }
            Ok(())
        });
        let executed =
            processor.execute_cancel(&mut self.condor, progress_tx, cancellation.clone());
        process_progress_thread
            .join()
            .map_err(|_| anyhow::anyhow!("the processing progress bridge panicked"))??;
        let (_, process_warnings) = executed?;

        Ok((
            (),
            (
                validation_warnings,
                initialization_warnings,
                process_warnings,
            ),
        ))
    }

    fn process_all(
        &mut self,
        progress_event_tx: mpsc::Sender<SequenceProgressEvent>,
        cancelled: Arc<AtomicBool>,
    ) -> anyhow::Result<Vec<((), SequenceWarningsTuple)>> {
        self.process_all_cancel(progress_event_tx, cancelled.into())
    }

    fn process_all_cancel(
        &mut self,
        progress_event_tx: mpsc::Sender<SequenceProgressEvent>,
        cancellation: Cancellation,
    ) -> anyhow::Result<Vec<((), SequenceWarningsTuple)>> {
        let mut warnings = Vec::with_capacity(self.sequences.len());
        for index in 0..self.sequences.len() {
            cancellation.check_forced()?;
            if cancellation.is_cancelled() {
                break;
            }
            warnings.push(self.process_one_cancel(
                Some(index),
                progress_event_tx.clone(),
                cancellation.clone(),
            )?);
        }
        Ok(warnings)
    }

    fn validate(&mut self) -> anyhow::Result<((), SequenceWarnings)> {
        let mut warnings = Vec::new();
        CoreInput::validate(&self.condor.input.as_data())?;
        CoreOutput::validate(&self.condor.output.as_data())?;
        self.condor.encoder.validate()?;
        for scene in &self.condor.scenes {
            scene.encoder.validate()?;
        }
        for processor in &mut self.sequences {
            let (_, processor_warnings) = processor.validate(&mut self.condor)?;
            warnings.extend(processor_warnings);
        }
        Ok(((), warnings))
    }
}

/// Build exactly one sequence for the run's next step.
///
/// A sequence is constructed only when it is about to run, so its input is opened then and
/// released before the next sequence is built. A request for Scene Detector therefore never
/// touches Parallel Encoder's script, and a full pipeline never holds every override decoder
/// at once. A sequence whose config is `None` is not offered, matching the derived chain.
///
/// The engine's `SerialEncoder` is deliberately absent. It joins its progress reporter
/// before dropping the reporter's sender, so it deadlocks unless the encoder reports
/// exactly one progress line per frame. The CLI runs `ParallelEncoder` instead.
pub(super) fn build_sequence(
    id: &str,
    config: &RunnerConfig,
    opener: &InputOpener<'_>,
) -> Result<Box<dyn Sequence<DefaultSequenceData, RunnerConfig>>, String> {
    let sequence: Box<dyn Sequence<DefaultSequenceData, RunnerConfig>> = match id {
        "SceneDetector" => match &config.scene_detector.input {
            Some(input) => {
                let opened = opener.open(input, "Opening the scene detector input")?;
                Box::new(
                    SceneDetector::with_input(opened, Some(config.scene_detector.method.clone()))
                        .map_err(|error| {
                            format!("the scene detector rejected its input: {error}")
                        })?,
                )
            }
            None => Box::new(SceneDetector::new(config.scene_detector.method.clone())),
        },
        "NoiseDetector" => {
            let Some(noise) = &config.noise_detector else {
                return Err(sequence_unavailable(id));
            };
            Box::new(NoiseDetector {
                input: opener.open_optional(&noise.input)?,
            })
        }
        "NoiseScaler" => {
            if config.noise_scaler.is_none() {
                return Err(sequence_unavailable(id));
            }
            Box::new(NoiseScaler {})
        }
        "TargetQuality" => {
            let Some(quality) = &config.target_quality else {
                return Err(sequence_unavailable(id));
            };
            Box::new(TargetQuality::new(
                opener.open_optional(&quality.input)?,
                opener.open_optional(&quality.metric_input)?,
            ))
        }
        // Speed scaling turns the chosen quantizer into the encoder's speed. It only has
        // work when the user supplied at least two interpolation points.
        "SpeedScaler" => {
            if config.speed_scaler.speed_quantizers.len() < 2 {
                return Err(sequence_unavailable(id));
            }
            Box::new(SpeedScaler {})
        }
        "BitrateOptimizer" => Box::new(BitrateOptimizer {}),
        // Auto workers are resolved by Benchmarker, which writes the count it found back
        // into the Parallel Encoder config before that sequence runs.
        "Benchmarker" => Box::new(Benchmarker {
            input: opener.open_optional(&config.parallel_encoder.input)?,
        }),
        "ParallelEncoder" => Box::new(ParallelEncoder::new(
            opener.open_optional(&config.parallel_encoder.input)?,
        )),
        "SceneConcatenator" => Box::new(SceneConcatenator {}),
        "QualityCheck" => {
            let Some(quality) = &config.quality_check else {
                return Err(sequence_unavailable(id));
            };
            Box::new(QualityCheck::new(opener.open_optional(&quality.input)?))
        }
        _ => return Err(sequence_unavailable(id)),
    };
    Ok(sequence)
}
