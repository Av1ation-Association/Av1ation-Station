//! Shared HTTP fixtures for the `api` and `real_encode_http` test targets.
#![allow(dead_code)]

pub(crate) use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex, atomic::AtomicBool},
    time::{Duration, Instant},
};

pub(crate) use av1ation_engine::{
    EncodeEvent, EncodeEventKind, EncodeHandle, EncodeRequest, EncodeRunner, EngineError,
    FakeRunner,
    capability::preflight::{Capability, Probe},
};
pub(crate) use av1ation_service::{AppState, router, serve_with_runner_and_probes};
pub(crate) use axum::body::to_bytes;
pub(crate) use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
pub(crate) use http_body_util::BodyExt;
pub(crate) use serde_json::Value;
pub(crate) use tokio::time::timeout;
pub(crate) use tower::ServiceExt;

/// A runner that starts and then closes its event stream without a terminal event, which
/// is the "silent worker death" the supervisor must survive.
pub(crate) struct SilentRunner;

impl EncodeRunner for SilentRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        let (sender, receiver) = std::sync::mpsc::channel();
        drop(sender);
        Ok(EncodeHandle {
            run_id: request.run_id,
            cancel: Arc::new(AtomicBool::new(false)),
            events: receiver,
        })
    }
}

/// Records the encoder document preparation hands to the runner, then starts the fake run.
/// This is the preparation boundary: a route assertion cannot see the resolved document.
pub(crate) struct EncoderRecordingRunner {
    pub(crate) encoder: Arc<Mutex<Option<Value>>>,
}

impl EncodeRunner for EncoderRecordingRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        *self.encoder.lock().expect("the encoder record") = Some(request.encoder.clone());
        FakeRunner.start(request)
    }
}

/// Fails before a sequence starts, the way a bad input or a script exception does, so the
/// failure has no sequence row to attach to.
pub(crate) struct FailingRunner;

impl EncodeRunner for FailingRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        let (sender, receiver) = std::sync::mpsc::channel();
        sender
            .send(EncodeEvent {
                run_id: request.run_id.clone(),
                seq: 0,
                at: String::new(),
                kind: EncodeEventKind::Failed,
                sequence: None,
                progress: None,
                message: "the input could not be opened: no such file".to_owned(),
                level: None,
                frames_processed: None,
                frames_total: None,
                phase: None,
                pass: None,
                max_passes: None,
                scenes_processed: None,
                scenes_total: None,
                scene_index: None,
                scene_progress: None,
                scene_frames_processed: None,
                scene_frames_total: None,
                scene_bytes: None,
                scene_encode_ms: None,
                scene_noise: None,
                scene_quality: None,
                scene: None,
            })
            .expect("the event receiver is open");
        drop(sender);
        Ok(EncodeHandle {
            run_id: request.run_id,
            cancel: Arc::new(AtomicBool::new(false)),
            events: receiver,
        })
    }
}

/// Fails after a sequence starts, the way a panic or a mid-write disk-full does.
///
/// The runner leaves a partial output file behind: the supervisor's terminal event must not
/// delete what the encoder already wrote, because that file is the evidence a retry needs.
pub(crate) struct CrashingRunner {
    pub(crate) message: &'static str,
    pub(crate) sequence: &'static str,
}

impl EncodeRunner for CrashingRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        if let Some(output) = request.output.get("path").and_then(Value::as_str)
            && !output.is_empty()
        {
            if let Some(parent) = Path::new(output).parent() {
                std::fs::create_dir_all(parent).expect("partial output directory");
            }
            std::fs::write(output, b"partial").expect("partial output");
        }
        let (sender, receiver) = std::sync::mpsc::channel();
        for (seq, (kind, message)) in [
            (EncodeEventKind::Started, "ParallelEncoder started"),
            (EncodeEventKind::Failed, self.message),
        ]
        .into_iter()
        .enumerate()
        {
            sender
                .send(EncodeEvent {
                    run_id: request.run_id.clone(),
                    seq: seq as u64,
                    at: String::new(),
                    kind,
                    sequence: Some(self.sequence.to_owned()),
                    progress: None,
                    message: message.to_owned(),
                    level: None,
                    frames_processed: None,
                    frames_total: None,
                    phase: None,
                    pass: None,
                    max_passes: None,
                    scenes_processed: None,
                    scenes_total: None,
                    scene_index: None,
                    scene_progress: None,
                    scene_frames_processed: None,
                    scene_frames_total: None,
                    scene_bytes: None,
                    scene_encode_ms: None,
                    scene_noise: None,
                    scene_quality: None,
                    scene: None,
                })
                .expect("the event receiver is open");
        }
        drop(sender);
        Ok(EncodeHandle {
            run_id: request.run_id,
            cancel: Arc::new(AtomicBool::new(false)),
            events: receiver,
        })
    }
}

/// Saves one scene table before starting, so the test can prove a cancel keeps the work
/// already checkpointed.
pub(crate) struct CheckpointingRunner;

impl EncodeRunner for CheckpointingRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        (request.checkpoint)(serde_json::json!({
            "scenes": [
                { "start_frame": 0, "end_frame": 24 },
                { "start_frame": 24, "end_frame": 48 }
            ]
        }))
        .map_err(EngineError::Rejected)?;
        FakeRunner.start(request)
    }
}

/// Reports one measured scene and then holds its stream open, which is the state a page
/// opened mid-run reads: the measurement is live and the sequence has not checkpointed.
pub(crate) struct LiveNoiseRunner {
    pub(crate) release: std::sync::Mutex<Option<std::sync::mpsc::Receiver<()>>>,
}

impl EncodeRunner for LiveNoiseRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        let (sender, receiver) = std::sync::mpsc::channel();
        let hold = self
            .release
            .lock()
            .expect("the release lock")
            .take()
            .expect("the runner starts once");
        let run_id = request.run_id.clone();
        let worker_run_id = run_id.clone();
        std::thread::spawn(move || {
            let events: [(EncodeEventKind, Option<u32>, Option<f64>); 2] = [
                (EncodeEventKind::Started, None, None),
                (EncodeEventKind::Progress, Some(0), Some(0.0032)),
            ];
            for (seq, (kind, index, noise)) in events.into_iter().enumerate() {
                let _ = sender.send(EncodeEvent {
                    run_id: worker_run_id.clone(),
                    seq: seq as u64,
                    at: String::new(),
                    kind,
                    sequence: Some("NoiseDetector".to_owned()),
                    progress: Some(50.0),
                    message: "measured".to_owned(),
                    level: None,
                    frames_processed: None,
                    frames_total: None,
                    phase: None,
                    pass: None,
                    max_passes: None,
                    scenes_processed: Some(1),
                    scenes_total: Some(2),
                    scene_index: index,
                    scene_progress: None,
                    scene_frames_processed: None,
                    scene_frames_total: None,
                    scene_bytes: None,
                    scene_encode_ms: None,
                    scene_noise: noise,
                    scene_quality: None,
                    scene: None,
                });
            }
            // Hold the stream open until the test has read the table, so the measurement
            // can only come from the live tally and not from a checkpoint.
            let _ = hold.recv();
        });
        Ok(EncodeHandle {
            run_id,
            cancel: Arc::new(AtomicBool::new(false)),
            events: receiver,
        })
    }
}

/// Emits a complete run that ends in `Finished`, so the opt-in cleanup path can be
/// exercised without an encoder or a real concatenation.
pub(crate) struct FinishingRunner;

impl EncodeRunner for FinishingRunner {
    fn start(&self, request: EncodeRequest) -> Result<EncodeHandle, EngineError> {
        let (sender, receiver) = std::sync::mpsc::channel();
        let run_id = request.run_id.clone();
        let worker_run_id = run_id.clone();
        std::thread::spawn(move || {
            for (seq, (kind, sequence, message)) in [
                (
                    EncodeEventKind::Started,
                    Some("SceneConcatenator".to_owned()),
                    "concat started",
                ),
                (
                    EncodeEventKind::Completed,
                    Some("SceneConcatenator".to_owned()),
                    "concat completed",
                ),
                (EncodeEventKind::Finished, None, "run finished"),
            ]
            .into_iter()
            .enumerate()
            {
                let _ = sender.send(EncodeEvent {
                    run_id: worker_run_id.clone(),
                    seq: seq as u64,
                    at: String::new(),
                    kind,
                    sequence,
                    progress: None,
                    message: message.to_owned(),
                    level: None,
                    frames_processed: None,
                    frames_total: None,
                    phase: None,
                    pass: None,
                    max_passes: None,
                    scenes_processed: None,
                    scenes_total: None,
                    scene_index: None,
                    scene_progress: None,
                    scene_frames_processed: None,
                    scene_frames_total: None,
                    scene_bytes: None,
                    scene_encode_ms: None,
                    scene_noise: None,
                    scene_quality: None,
                    scene: None,
                });
            }
        });
        Ok(EncodeHandle {
            run_id,
            cancel: Arc::new(AtomicBool::new(false)),
            events: receiver,
        })
    }
}

pub(crate) fn test_probes() -> Vec<Probe> {
    vec![
        Probe {
            id: "vapoursynth".to_owned(),
            label: "VapourSynth".to_owned(),
            capability: Capability::Decode,
            available: true,
            detail: "Core R80 · API 4.3".to_owned(),
            remediation: None,
            plugins: vec![av1ation_engine::capability::preflight::PluginProbe {
                namespace: "bs".to_owned(),
                label: "BestSource".to_owned(),
                available: true,
                detail: "Loaded · C:/plugins/libbestsource.dll".to_owned(),
            }],
        },
        Probe {
            id: "encoder:vvenc".to_owned(),
            label: "Fraunhofer Versatile Video Encoder".to_owned(),
            capability: Capability::Encode,
            available: false,
            detail: "vvencapp not found on PATH".to_owned(),
            remediation: Some("Install `vvencapp` and put it on PATH.".to_owned()),
            plugins: Vec::new(),
        },
    ]
}

pub(crate) fn health_state() -> AppState {
    AppState::with_runner_and_probes(None, Arc::new(FakeRunner), test_probes())
}

pub(crate) fn start_request(project_id: &str, video_id: &str) -> Request<Body> {
    Request::post(format!(
        "/api/projects/{project_id}/videos/{video_id}/encode"
    ))
    .body(Body::empty())
    .unwrap()
}

/// Writing the project configuration is the lock probe: it is rejected with `423` while a
/// run owns the singleton.
pub(crate) fn config_request(project_id: &str) -> Request<Body> {
    Request::put(format!("/api/projects/{project_id}/config"))
        .header("content-type", "application/json")
        .body(Body::from("{}"))
        .unwrap()
}

pub(crate) async fn create_project(app: Router, name: &str) -> String {
    let request = Request::post("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(format!(r#"{{"name":"{name}"}}"#)))
        .unwrap();
    let (status, created) = send(app, request).await;
    assert_eq!(status, StatusCode::CREATED);
    created["id"].as_str().expect("project id").to_owned()
}

/// Add a queue entry backed by a real file, because starting an encode now resolves a
/// materialised request from the video document rather than starting an empty one.
pub(crate) async fn add_video(app: Router, project_id: &str, dir: &std::path::Path) -> String {
    let source = dir.join("source.mkv");
    tokio::fs::write(&source, b"fixture")
        .await
        .expect("source file");
    let output = dir.join("output.mkv");
    let request = Request::post(format!("/api/projects/{project_id}/videos"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::json!({
                "input_path": source.display().to_string(),
                "output_path": output.display().to_string()
            })
            .to_string(),
        ))
        .unwrap();
    let (status, created) = send(app, request).await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created["id"].as_str().expect("video id").to_owned()
}

pub(crate) async fn wait_for_start(app: Router, project_id: &str, video_id: &str) -> String {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, body) = send(app.clone(), start_request(project_id, video_id)).await;
        if status == StatusCode::ACCEPTED {
            return body["run_id"].as_str().expect("run id").to_owned();
        }
        assert_eq!(status, StatusCode::CONFLICT);
        assert!(
            Instant::now() < deadline,
            "the singleton was never released"
        );
        tokio::task::yield_now().await;
    }
}

pub(crate) async fn wait_for_config_write(app: Router, project_id: &str) {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let (status, _) = send(app.clone(), config_request(project_id)).await;
        if status == StatusCode::OK {
            return;
        }
        assert_eq!(status, StatusCode::LOCKED);
        assert!(Instant::now() < deadline, "configuration stayed locked");
        tokio::task::yield_now().await;
    }
}

pub(crate) fn web_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!("av1ation-static-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).expect("temporary web root");
    std::fs::write(root.join("index.html"), "<h1>Av1ation</h1>").expect("index file");
    root
}

pub(crate) async fn next_sse_event(body: &mut Body) -> String {
    let frame = timeout(Duration::from_secs(2), body.frame())
        .await
        .expect("SSE frame timed out")
        .expect("SSE stream ended")
        .expect("SSE frame error");
    let data = frame.into_data().expect("SSE data frame");
    String::from_utf8(data.to_vec()).expect("UTF-8 SSE data")
}

pub(crate) async fn next_event_of_kind(body: &mut Body, kind: &str) -> String {
    loop {
        let event = next_sse_event(body).await;
        if event.contains(&format!("\"kind\":\"{kind}\"")) {
            return event;
        }
    }
}

/// Build one request for the table-driven route-surface tests. The body is JSON when present
/// and empty otherwise, so a call site can describe a method/path/body row without repeating
/// the header and body plumbing.
pub(crate) fn route_request(method: &str, path: &str, body: Option<Value>) -> Request<Body> {
    let builder = Request::builder().method(method).uri(path);
    match body {
        Some(body) => builder
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    }
}

pub(crate) async fn send(app: Router, request: Request<Body>) -> (StatusCode, Value) {
    let response = app.oneshot(request).await.expect("router response");
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 4_000_000)
        .await
        .expect("response body");
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("json response")
    };
    (status, json)
}

/// The one envelope every unreadable JSON body returns, including the parser's omission.
pub(crate) fn assert_unreadable_body(status: StatusCode, body: &Value) {
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "INVALID_CONFIG");
    assert_eq!(body["message"], "The request body could not be read.");
    assert_eq!(body["hint"], "Reload the app; if it persists, update it.");
    assert!(
        body.get("detail").is_none(),
        "the parser's text must stay out of the envelope: {body}"
    );
}

/// Stage the two paths the host's bundled VapourSynth resolver requires.
pub(crate) fn stage_vapoursynth(tools: &Path) {
    let python = tools.join("python");
    let fixtures: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            python.join("python.exe"),
            python.join("Lib/site-packages/vapoursynth/vsscript.dll"),
        ]
    } else {
        let library = if cfg!(target_os = "macos") {
            "libvsscript.dylib"
        } else {
            "libvsscript.so"
        };
        let libpython = if cfg!(target_os = "macos") {
            "libpython3.14.dylib"
        } else {
            "libpython3.14.so"
        };
        vec![
            python.join("bin/python3"),
            python.join("lib").join(libpython),
            python
                .join("lib/python3.14/site-packages/vapoursynth")
                .join(library),
        ]
    };
    for fixture in fixtures {
        std::fs::create_dir_all(fixture.parent().expect("fixture parent"))
            .expect("fixture directory");
        std::fs::write(fixture, b"fixture").expect("fixture");
    }
}

pub(crate) fn project_dir() -> PathBuf {
    std::env::temp_dir().join(format!("av1ation-api-projects-{}", uuid::Uuid::new_v4()))
}

/// The base-provider path a test's settings document configures.
///
/// It is derived from the test's own data directory, so a fixture never names a path that
/// exists on the machine running the suite. The file is not created: preparation uses the
/// configured path verbatim when no located build exists.
pub(crate) fn base_provider_path(dir: &Path) -> String {
    dir.join("SvtAv1EncApp-base.exe").display().to_string()
}

/// Removes a test root once its background writers have stopped.
///
/// A cancel is acknowledged before the event thread appends the run's terminal timeline
/// record, and a thumbnail build can still be writing when its manifest response returns.
/// Removing the tree straight away can then race one last write and fail with
/// `DirectoryNotEmpty` on Windows. Retry the delete while the writer settles; every
/// assertion has already run by then.
pub(crate) fn cleanup_after_writers(directory: &Path) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match std::fs::remove_dir_all(directory) {
            Ok(()) => return,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(error) => {
                assert!(Instant::now() < deadline, "cleanup after writers: {error}");
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    }
}

pub(crate) fn project_state(dir: &std::path::Path) -> AppState {
    AppState::with_runner_probes_and_data_dir(
        None,
        Arc::new(FakeRunner),
        test_probes(),
        dir.to_path_buf(),
    )
}

pub(crate) fn script_input(text: &str) -> Value {
    serde_json::json!({
        "VapourSynthScript": {
            "source": { "Text": text },
            "variables": {},
            "index": 0,
            "filters": [],
            "stream_concurrently": true
        }
    })
}

pub(crate) fn epoch() -> Value {
    serde_json::json!({ "secs_since_epoch": 0, "nanos_since_epoch": 0 })
}

/// A scene as the engine checkpoints it, with one Noise Detector result so the documented
/// `condor_scenes` value can be checked against the data the runner would inject.
pub(crate) fn saved_scene(encoder: Value) -> Value {
    serde_json::json!({
        "start_frame": 0,
        "end_frame": 24,
        "sub_scenes": null,
        "encoder": encoder,
        "sequence_data": {
            "scene_detection": {
                "scenecut_scores": null,
                "transnetv2_scores": null,
                "created_on": epoch()
            },
            "noise_detection": {
                "noise": 5.5,
                "luminance": 0.4,
                "created_on": epoch()
            },
            "noise_scaling": null,
            "target_quality": { "passes": [] },
            "parallel_encoder": {
                "started_on": null,
                "completed_on": null,
                "bytes": null
            },
            "quality_check": {
                "quality": {
                    "quantizer": 0.0,
                    "scores": [],
                    "bitrate": 0.0,
                    "started_on": 0,
                    "completed_on": 0
                }
            }
        }
    })
}

pub(crate) fn directory(dir: &std::path::Path, video_id: &str) -> String {
    dir.join("temp").join(video_id).display().to_string()
}

/// One template id the caller can edit. A fresh install starts with none, so this creates a
/// Default row the first time; an existing row is reused and its default mark is checked.
pub(crate) async fn saved_template_id(app: &Router) -> String {
    let (status, settings) = send(
        app.clone(),
        Request::get("/api/settings").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    if let Some(id) = settings["project_templates"][0]["id"].as_str() {
        assert_eq!(settings["default_project_template_id"], id);
        return id.to_owned();
    }
    let (status, created) = send(
        app.clone(),
        Request::post("/api/settings/templates")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"name":"Default"}"#))
            .unwrap(),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created["name"], "Default");
    created["id"].as_str().expect("template id").to_owned()
}
