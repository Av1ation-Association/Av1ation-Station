use andean_condor::models::sequence::DefaultSequenceConfig;
use serde_json::json;

fn parse(key: &str, value: serde_json::Value) -> String {
    let mut document = serde_json::to_value(DefaultSequenceConfig::default()).expect("default");
    document[key] = value;
    match serde_json::from_value::<DefaultSequenceConfig>(document) {
        Ok(parsed) => serde_json::to_string(&parsed).expect("serialise"),
        Err(error) => format!("ERROR {error}"),
    }
}

fn main() {
    for candidate in [
        json!({ "metric": { "Bogus": {} } }),
        json!({ "metric": { "VMAF": { "target_range": [0, 100] } } }),
        json!({ "metric": { "VMAF": { "target_range": [0, 100] }, "PSNR": {} } }),
    ] {
        println!(
            "target_quality {candidate} -> {}",
            parse("target_quality", candidate.clone())
        );
    }
    for candidate in [
        json!({ "metric": { "VMAF": { "target_range": [0, 100] } }, "strategy": "Bogus" }),
        json!({ "metric": { "VMAF": { "target_range": [0, 100] } }, "statistic": "Bogus" }),
    ] {
        println!(
            "quality_check {candidate} -> {}",
            parse("quality_check", candidate.clone())
        );
    }
    for candidate in [
        json!({ "threshold": 5.0, "minimum_scaler": 1.0, "maximum_scaler": 10.0, "scale_chroma": false }),
        json!({ "reference_filters": [], "denoised_filters": [] }),
    ] {
        println!(
            "candidate {candidate} -> {}",
            parse("noise_scaler", candidate.clone())
        );
    }
}
