use andean_condor::models::sequence::{
    noise_detector::NoiseDetectorConfig, noise_scaler::NoiseScalerConfig,
    quality_check::QualityCheckConfig, target_quality::TargetQualityConfig,
};

fn main() {
    println!(
        "noise_detector={}",
        serde_json::to_string(&NoiseDetectorConfig::default()).expect("serialise")
    );
    println!(
        "noise_scaler={}",
        serde_json::to_string(&NoiseScalerConfig::default()).expect("serialise")
    );
    println!(
        "target_quality={}",
        serde_json::to_string(&TargetQualityConfig::default()).expect("serialise")
    );
    println!(
        "quality_check={}",
        serde_json::to_string(&QualityCheckConfig::default()).expect("serialise")
    );
}
