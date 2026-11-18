//! Headless service entry point used by browser E2E and local debugging.

use std::{path::PathBuf, process::ExitCode, sync::Arc};

use av1ation_engine::{
    CompletingRunner, EncodeRunner, FakeRunner, RealRunner,
    capability::preflight::{Capability, Probe},
};

fn value_after(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|arg| arg == flag)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

#[tokio::main]
async fn main() -> ExitCode {
    av1ation_service::keep_console_hidden();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let port = value_after(&args, "--port")
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(0);
    let web_root = value_after(&args, "--web-dir").map(PathBuf::from);
    let data_dir = value_after(&args, "--data-dir")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("AV1ATION_DATA_DIR").map(PathBuf::from));
    // A staged tree is a root-level `<resource>/tools`, never derived from this binary or
    // the working directory (AGENTS.md §2.5). Tests and developer hosts pass none, or name
    // a local stage through `AV1ATION_TOOLS_DIR` for the same code path as a release.
    let tools_dir = value_after(&args, "--tools-dir")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("AV1ATION_TOOLS_DIR").map(PathBuf::from));
    // The fake engine is a debug-only test seam. A release build never honours either
    // flag: silently pretending to encode would be worse than refusing the option. The
    // completing variant is separate because the lock/cancel tests need the holding one.
    let fake_engine = args.iter().any(|argument| argument == "--fake-engine");
    let fake_engine_complete = args
        .iter()
        .any(|argument| argument == "--fake-engine-complete");
    let fake_engine_requested = fake_engine || fake_engine_complete;
    let fake_preflight = args.iter().any(|argument| argument == "--fake-preflight");
    if fake_engine_requested && !cfg!(debug_assertions) {
        eprintln!("The fake engine is only available in debug builds; using the real engine");
    }
    if fake_preflight && !cfg!(debug_assertions) {
        eprintln!("The fake preflight is only available in debug builds; probing this machine");
    }
    let runner: Arc<dyn EncodeRunner> = if fake_engine_requested && cfg!(debug_assertions) {
        if fake_engine_complete {
            Arc::new(CompletingRunner)
        } else {
            Arc::new(FakeRunner)
        }
    } else {
        Arc::new(RealRunner)
    };
    av1ation_service::init_tracing_with_app_data(data_dir.as_deref());

    let service = if fake_preflight && cfg!(debug_assertions) {
        let Some(data_dir) = data_dir else {
            eprintln!("--fake-preflight needs --data-dir or AV1ATION_DATA_DIR");
            return ExitCode::FAILURE;
        };
        av1ation_service::serve_with_runner_probes_and_data_dir(
            port,
            web_root,
            data_dir,
            tools_dir,
            runner,
            fake_probes(),
        )
        .await
    } else {
        av1ation_service::serve_in_with_tools_and_runner(
            port, web_root, data_dir, tools_dir, runner,
        )
        .await
    };

    match service {
        Ok((address, mut service)) => {
            println!("AV1ATION_API=http://{address}");
            println!("AV1ATION_PORT={}", address.port());
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = service.wait() => {}
            }
            service.shutdown().await;
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("could not start the service: {error}");
            ExitCode::FAILURE
        }
    }
}

/// The fixed inventory the browser journeys validate against.
///
/// The fake runner never executes an encoder, so a host without SVT-AV1, FFmpeg or FFMS2
/// must still reach the same Start path as a developer machine. The ids are the real
/// capability rows; the details say this is the E2E seam rather than a discovered tool.
fn fake_probes() -> Vec<Probe> {
    fn available(id: &str, label: &str, capability: Capability) -> Probe {
        Probe {
            id: id.to_owned(),
            label: label.to_owned(),
            capability,
            available: true,
            detail: "Fake E2E provider".to_owned(),
            remediation: None,
            plugins: Vec::new(),
        }
    }

    vec![
        available("encoder:svt-av1", "SVT-AV1", Capability::Encode),
        available("ffmpeg", "FFmpeg", Capability::Muxing),
        available("ffms2", "FFMS2", Capability::Decode),
    ]
}
