//! The engine sequence document this application actually runs.
//!
//! `DefaultSequenceConfig` is the upstream bundle: it omits Benchmarker and Speed Scaler even
//! though both sequences exist. Auto workers cannot be resolved without Benchmarker, and a
//! target-quality quantizer cannot become an encoder speed without Speed Scaler, so this
//! adapter adds exactly those two fields and delegates every other handler to the same
//! upstream structs. JSON stays flat, which keeps an existing project document readable.

use andean_condor::models::input::Input;
use andean_condor::models::sequence::{
    DefaultSequenceConfig, SequenceConfigHandler,
    benchmarker::{BenchmarkerConfig, BenchmarkerConfigHandler},
    bitrate_optimizer::{BitrateOptimizerConfig, BitrateOptimizerConfigHandler},
    noise_detector::{NoiseDetectorConfig, NoiseDetectorConfigHandler},
    noise_scaler::{NoiseScalerConfig, NoiseScalerConfigHandler},
    parallel_encoder::{ParallelEncoderConfig, ParallelEncoderConfigHandler},
    quality_check::{QualityCheckConfig, QualityCheckConfigHandler},
    scene_concatenator::{SceneConcatenatorConfig, SceneConcatenatorConfigHandler},
    scene_detector::SceneDetectorConfig,
    speed_scaler::{SpeedScalerConfig, SpeedScalerConfigHandler},
    target_quality::{TargetQualityConfig, TargetQualityConfigHandler},
};
use anyhow::Result;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Every sequence the default pipeline can resolve, including the two upstream omits.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct RunnerConfig {
    pub scene_detector: SceneDetectorConfig,
    pub noise_detector: Option<NoiseDetectorConfig>,
    pub noise_scaler: Option<NoiseScalerConfig>,
    pub target_quality: Option<TargetQualityConfig>,
    pub quality_check: Option<QualityCheckConfig>,
    pub bitrate_optimizer: BitrateOptimizerConfig,
    pub parallel_encoder: ParallelEncoderConfig,
    pub scene_concatenator: SceneConcatenatorConfig,
    #[serde(default)]
    pub benchmarker: BenchmarkerConfig,
    #[serde(default)]
    pub speed_scaler: SpeedScalerConfig,
}

impl From<DefaultSequenceConfig> for RunnerConfig {
    fn from(engine: DefaultSequenceConfig) -> Self {
        Self {
            scene_detector: engine.scene_detector,
            noise_detector: engine.noise_detector,
            noise_scaler: engine.noise_scaler,
            target_quality: engine.target_quality,
            quality_check: engine.quality_check,
            bitrate_optimizer: engine.bitrate_optimizer,
            parallel_encoder: engine.parallel_encoder,
            scene_concatenator: engine.scene_concatenator,
            benchmarker: BenchmarkerConfig::default(),
            speed_scaler: SpeedScalerConfig::default(),
        }
    }
}

impl SequenceConfigHandler for RunnerConfig {}

impl NoiseDetectorConfigHandler for RunnerConfig {
    fn noise_detector(&self) -> Result<&Option<NoiseDetectorConfig>> {
        Ok(&self.noise_detector)
    }

    fn noise_detector_mut(&mut self) -> Result<&mut Option<NoiseDetectorConfig>> {
        Ok(&mut self.noise_detector)
    }
}

impl NoiseScalerConfigHandler for RunnerConfig {
    fn noise_scaler(&self) -> Result<&Option<NoiseScalerConfig>> {
        Ok(&self.noise_scaler)
    }

    fn noise_scaler_mut(&mut self) -> Result<&mut Option<NoiseScalerConfig>> {
        Ok(&mut self.noise_scaler)
    }
}

impl TargetQualityConfigHandler for RunnerConfig {
    fn target_quality(&self) -> Result<&Option<TargetQualityConfig>> {
        Ok(&self.target_quality)
    }

    fn target_quality_mut(&mut self) -> Result<&mut Option<TargetQualityConfig>> {
        Ok(&mut self.target_quality)
    }
}

impl QualityCheckConfigHandler for RunnerConfig {
    fn quality_check(&self) -> Result<&Option<QualityCheckConfig>> {
        Ok(&self.quality_check)
    }

    fn quality_check_mut(&mut self) -> Result<&mut Option<QualityCheckConfig>> {
        Ok(&mut self.quality_check)
    }
}

impl BitrateOptimizerConfigHandler for RunnerConfig {
    fn bitrate_optimizer(&self) -> Result<&BitrateOptimizerConfig> {
        Ok(&self.bitrate_optimizer)
    }

    fn bitrate_optimizer_mut(&mut self) -> Result<&mut BitrateOptimizerConfig> {
        Ok(&mut self.bitrate_optimizer)
    }
}

impl ParallelEncoderConfigHandler for RunnerConfig {
    fn parallel_encoder(&self) -> Result<&ParallelEncoderConfig> {
        Ok(&self.parallel_encoder)
    }

    fn parallel_encoder_mut(&mut self) -> Result<&mut ParallelEncoderConfig> {
        Ok(&mut self.parallel_encoder)
    }
}

impl SceneConcatenatorConfigHandler for RunnerConfig {
    fn protected_sources(&self) -> Vec<PathBuf> {
        [
            self.scene_detector.input.as_ref(),
            self.parallel_encoder.input.as_ref(),
            self.noise_detector
                .as_ref()
                .and_then(|config| config.input.as_ref()),
            self.target_quality
                .as_ref()
                .and_then(|config| config.input.as_ref()),
            self.target_quality
                .as_ref()
                .and_then(|config| config.metric_input.as_ref()),
            self.quality_check
                .as_ref()
                .and_then(|config| config.input.as_ref()),
        ]
        .into_iter()
        .flatten()
        .filter_map(Input::path)
        .map(PathBuf::from)
        .collect()
    }

    fn scene_concatenator(&self) -> Result<&SceneConcatenatorConfig> {
        Ok(&self.scene_concatenator)
    }

    fn scene_concatenator_mut(&mut self) -> Result<&mut SceneConcatenatorConfig> {
        Ok(&mut self.scene_concatenator)
    }
}

impl BenchmarkerConfigHandler for RunnerConfig {
    fn benchmarker(&self) -> Result<&BenchmarkerConfig> {
        Ok(&self.benchmarker)
    }

    fn benchmarker_mut(&mut self) -> Result<&mut BenchmarkerConfig> {
        Ok(&mut self.benchmarker)
    }
}

impl SpeedScalerConfigHandler for RunnerConfig {
    fn speed_scaler(&self) -> Result<&SpeedScalerConfig> {
        Ok(&self.speed_scaler)
    }

    fn speed_scaler_mut(&mut self) -> Result<&mut SpeedScalerConfig> {
        Ok(&mut self.speed_scaler)
    }
}
