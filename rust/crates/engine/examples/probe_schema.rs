fn main() {
    let schema = av1ation_engine::config_schemas().expect("schema");
    println!(
        "{}",
        serde_json::to_string_pretty(&schema).expect("serialise")
    );
}
