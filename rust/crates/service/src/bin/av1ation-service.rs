//! Headless service entry point used by browser E2E and local debugging.

use std::{path::PathBuf, process::ExitCode, sync::Arc};

use av1ation_engine::{EncodeRunner, FakeRunner, RealRunner};

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
    // The fake engine is a debug-only test seam. A release build never honours the flag:
    // silently pretending to encode would be worse than refusing the unsupported option.
    let fake_engine = args.iter().any(|argument| argument == "--fake-engine");
    if fake_engine && !cfg!(debug_assertions) {
        eprintln!("--fake-engine is only available in debug builds; using the real engine");
    }
    let runner: Arc<dyn EncodeRunner> = if fake_engine && cfg!(debug_assertions) {
        Arc::new(FakeRunner)
    } else {
        Arc::new(RealRunner)
    };
    av1ation_service::init_tracing_with_app_data(data_dir.as_deref());

    match av1ation_service::serve_in_with_tools_and_runner(
        port, web_root, data_dir, tools_dir, runner,
    )
    .await
    {
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
