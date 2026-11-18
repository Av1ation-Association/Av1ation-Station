//! Run-scoped data injected into VapourSynth script inputs.

use super::*;

/// The run-scoped values every script materialisation shares.
///
/// A data module is written with the run's own scene table, id, and scratch directory, and
/// a script that reads one of those reads all of them, so they travel as one value rather
/// than as four arguments repeated at every open.
pub(super) struct ScriptScope<'a> {
    pub(super) custom: &'a script_data::CustomSceneData,
    pub(super) temp_dir: &'a str,
    pub(super) run_id: &'a str,
    pub(super) video_path: &'a str,
}

/// Add the reserved engine variables to a script input and write its data module.
///
/// Returns `None` for every other input kind, so this is a no-op on the native and
/// generated VapourSynth paths. The value table lives in [`script_data`], which is also what
/// the API serves as documentation, so the two cannot drift. The table is derived from the
/// engine's own scenes and is never persisted by the service, which stores only `scenes`.
///
/// The module is rewritten here, not once per run, because a script is reopened before every
/// sequence: the module a later open imports has to describe the table that open decodes.
pub(super) fn with_scene_data(
    model: &InputModel,
    scenes: &[Scene<DefaultSequenceData>],
    config: &RunnerConfig,
    scope: &ScriptScope<'_>,
    sequence: Option<&str>,
) -> Result<Option<InputModel>, String> {
    if !matches!(model, InputModel::VapourSynthScript { .. }) {
        return Ok(None);
    }
    // The path travels with the run, not with the input: a script document is shared by
    // every video in the project, and each video opens its own file.
    let data = script_module::module_data(
        scenes,
        scope.custom,
        config,
        scope.temp_dir,
        scope.run_id,
        sequence,
        scope.video_path,
    );
    script_module::write_module(scope.temp_dir, &script_module::module_source(), &data)
        .map_err(|error| format!("the script's data module could not be written: {error}"))?;
    let mut model = model.clone();
    let InputModel::VapourSynthScript { variables, .. } = &mut model else {
        return Ok(None);
    };
    for variable in script_data::injected_variables(
        scenes,
        scope.custom,
        config,
        scope.temp_dir,
        scope.run_id,
        sequence,
        scope.video_path,
    ) {
        variables.insert(variable.key.to_owned(), variable.value);
    }
    Ok(Some(model))
}

/// Whether any sequence carries its own script input. Only then must the current
/// sequence's configuration be prepared with the latest scene table before it is built.
pub(super) fn has_script_override(config: &RunnerConfig) -> bool {
    fn script(input: &Option<InputModel>) -> bool {
        input
            .as_ref()
            .is_some_and(|input| matches!(input, InputModel::VapourSynthScript { .. }))
    }
    script(&config.scene_detector.input)
        || config
            .noise_detector
            .as_ref()
            .is_some_and(|noise| script(&noise.input))
        || config
            .target_quality
            .as_ref()
            .is_some_and(|quality| script(&quality.input) || script(&quality.metric_input))
        || script(&config.parallel_encoder.input)
        || config
            .quality_check
            .as_ref()
            .is_some_and(|quality| script(&quality.input))
}

/// Apply the latest scene data to every per-sequence script input, so an override is
/// re-evaluated on the same footing as the Condor input.
///
/// Each input is labelled with the sequence that owns it, not the sequence currently being
/// built. Target Quality's probe document is also read when Parallel Encoder is admitted,
/// so its injected variables must stay identical across that boundary or the engine sees
/// the same script as a changed source.
pub(super) fn with_config_scene_data(
    config: &RunnerConfig,
    scenes: &[Scene<DefaultSequenceData>],
    scope: &ScriptScope<'_>,
) -> Result<RunnerConfig, String> {
    fn inject(
        input: &mut Option<InputModel>,
        scenes: &[Scene<DefaultSequenceData>],
        config: &RunnerConfig,
        scope: &ScriptScope<'_>,
        sequence: &str,
    ) -> Result<(), String> {
        if let Some(prepared) = input
            .as_ref()
            .map(|model| with_scene_data(model, scenes, config, scope, Some(sequence)))
            .transpose()?
            .flatten()
        {
            *input = Some(prepared);
        }
        Ok(())
    }

    // A script reads the document as written, not the copy whose inputs this call rewrites
    // with the run's scene table, so the injected value is the unmodified document.
    let document = config.clone();
    let mut config = config.clone();
    inject(
        &mut config.scene_detector.input,
        scenes,
        &document,
        scope,
        "SceneDetector",
    )?;
    if let Some(noise) = config.noise_detector.as_mut() {
        inject(&mut noise.input, scenes, &document, scope, "NoiseDetector")?;
    }
    if let Some(quality) = config.target_quality.as_mut() {
        inject(
            &mut quality.input,
            scenes,
            &document,
            scope,
            "TargetQuality",
        )?;
        inject(
            &mut quality.metric_input,
            scenes,
            &document,
            scope,
            "TargetQuality",
        )?;
    }
    inject(
        &mut config.parallel_encoder.input,
        scenes,
        &document,
        scope,
        "ParallelEncoder",
    )?;
    if let Some(quality) = config.quality_check.as_mut() {
        inject(&mut quality.input, scenes, &document, scope, "QualityCheck")?;
    }
    Ok(config)
}
