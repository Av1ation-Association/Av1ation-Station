//! Temporary: dump the schemas for the script stub generator.

use andean_condor::models::{encoder::Encoder, sequence::DefaultSequenceData};

fn main() {
    let data = schemars::schema_for!(DefaultSequenceData);
    let encoder = schemars::schema_for!(Encoder);
    std::fs::write(
        "target/sequence-data.schema.json",
        serde_json::to_string_pretty(&data).expect("schema json"),
    )
    .expect("write data schema");
    std::fs::write(
        "target/encoder.schema.json",
        serde_json::to_string_pretty(&encoder).expect("schema json"),
    )
    .expect("write encoder schema");
}
