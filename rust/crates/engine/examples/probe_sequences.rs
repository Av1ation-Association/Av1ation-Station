use andean_condor::models::sequence::DefaultSequenceConfig;
use serde_json::json;

fn main() {
    let candidates = [
        (
            "noise_detector",
            json!({ "reference_filters": [], "denoised_filters": [] }),
        ),
        (
            "noise_scaler",
            json!({ "threshold": 0.5, "minimum_scaler": 1.0 }),
        ),
        (
            "noise_scaler",
            json!({ "threshold": 0.5, "minimum_scaler": true }),
        ),
        (
            "target_quality",
            json!({ "metric": { "VMAF": {} }, "target_range": [0, 100] }),
        ),
        (
            "target_quality",
            json!({ "metric": { "VMAF": {} }, "target_range": [0.0, 100.0], "input": null, "metric_input": null }),
        ),
        (
            "quality_check",
            json!({ "metric": { "VMAF": {} }, "target_range": [0, 100] }),
        ),
    ];
    for (key, value) in candidates {
        let document = json!({ "sequences": { key: value } });
        match serde_json::from_value::<DefaultSequenceConfig>(document["sequences"].clone()) {
            Ok(parsed) => println!(
                "{key} {} -> {}",
                value,
                serde_json::to_string(&parsed).expect("serialise")
            ),
            Err(error) => println!("{key} {value} -> ERROR {error}"),
        }
    }
}
