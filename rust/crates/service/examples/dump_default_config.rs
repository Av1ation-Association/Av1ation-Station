fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(&av1ation_engine::default_project_config())
            .expect("serialise")
    );
}
