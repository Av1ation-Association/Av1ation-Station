//! The terminal event is part of the wire contract, so its sequence number has to survive a
//! JSON client. This test uses an invalid input to fail before any decoder or encoder runs,
//! which keeps it off the real-encode gate.

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use av1ation_engine::{EncodeEventKind, EncodeRequest, EncodeRunner, RealRunner};

#[test]
fn a_failed_run_ends_with_a_safe_terminal_sequence() {
    let request = EncodeRequest {
        run_id: "terminal-sequence".to_owned(),
        project_id: "project".to_owned(),
        video_id: "video".to_owned(),
        input: serde_json::json!({}),
        video_path: "missing.mp4".to_owned(),
        output: serde_json::json!({}),
        encoder: serde_json::json!({}),
        sequence_config: serde_json::json!({}),
        condor: None,
        sequences: vec!["SceneDetector".to_owned()],
        checkpoint: Arc::new(|_value: serde_json::Value| Ok(())),
    };

    let handle = RealRunner.start(request).expect("the runner starts");
    let deadline = Instant::now() + Duration::from_secs(5);
    let event = loop {
        match handle.events.recv_timeout(Duration::from_millis(100)) {
            Ok(event) => break event,
            Err(_) if Instant::now() < deadline => {}
            Err(error) => panic!("no terminal event arrived: {error}"),
        }
    };

    assert_eq!(event.kind, EncodeEventKind::Failed);
    assert_eq!(
        event.seq, 0,
        "the terminal event is the first event of this run"
    );
    assert!(
        event.seq <= 9_007_199_254_740_991,
        "a JSON client cannot represent the terminal sequence"
    );
}
