//! The HTTP service shared by the Tauri shell and the headless binary.
//!
//! The shipped hosts run [`av1ation_engine::RealRunner`]; tests inject `FakeRunner` through
//! `serve_with_runner`, so the routes, the singleton, and the config lock are exercised
//! without an encoder. The router is the single surface both hosts mount.
//!
//! Modules are grouped by feature domain; [`state`] is the shared composition root. The
//! group map and where-change guidance are in `docs/service.md`.

mod api;
mod capability;
mod media;
mod platform;
mod project;
mod run;
mod script;
mod state;

use std::{
    fs::{File, OpenOptions},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use av1ation_engine::{EncodeRunner, RealRunner, capability::preflight::Probe};
use axum::Router;
use tokio::{net::TcpListener, sync::watch, task::JoinHandle};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing_subscriber::prelude::*;

pub use media::stream::PreviewWriter;
pub use state::AppState;

/// Give the process a hidden console for every console-subsystem child it starts.
///
/// This is the Windows-wide half of the child-process policy: local spawns set
/// `CREATE_NO_WINDOW` themselves, while the pinned engine's encoder and FFmpeg spawns have
/// no such hook and inherit the hidden console this creates. The desktop and headless hosts
/// call it before they start the service; see `av1ation_engine::platform`.
pub fn keep_console_hidden() {
    av1ation_engine::platform::keep_console_hidden();
}

/// A running service and the controls its host needs to stop it cleanly.
///
/// The desktop process and the headless binary both need to cancel a live encode and stop
/// accepting requests on the way out; a bare `JoinHandle` cannot express that.
pub struct ServiceHandle {
    state: AppState,
    shutdown: watch::Sender<bool>,
    task: JoinHandle<()>,
}

impl ServiceHandle {
    /// Cancel the active run, stop accepting connections, and wait briefly for the server
    /// task. A host that never calls this still exits when its process ends.
    pub async fn shutdown(self) {
        let _ = self.shutdown.send(true);
        self.state.shutdown().await;

        let mut task = self.task;
        tokio::select! {
            _ = &mut task => {}
            _ = tokio::time::sleep(Duration::from_secs(5)) => task.abort(),
        }
    }

    /// Wait for the server to stop on its own, for a host that has no shutdown trigger.
    pub async fn wait(&mut self) {
        let _ = (&mut self.task).await;
    }
}

/// Build the one router used by the embedded service and the headless binary.
pub fn router(state: AppState) -> Router {
    api::routes::router(state)
}

/// The route vocabulary as JSON, for the build-time client and docs generators.
///
/// This is build metadata, not a request handler: the hosts never call it, and the emitted
/// table is checked by `npm run routes:check` before either generated artifact is accepted.
pub fn route_manifest_json() -> String {
    api::routes::route_manifest_json()
}

/// Bind the service on loopback and return the resolved address plus its lifecycle handle.
/// Settings are written under `AV1ATION_DATA_DIR` when it is set.
pub async fn serve(
    port: u16,
    web_root: Option<PathBuf>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    serve_in(port, web_root, default_data_dir()).await
}

/// Bind the service with an explicit app-data directory. The desktop host passes Tauri's
/// resolved app-data path; `None` disables settings persistence for tests and throwaway
/// hosts.
pub async fn serve_in(
    port: u16,
    web_root: Option<PathBuf>,
    data_dir: Option<PathBuf>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    serve_in_with_tools(port, web_root, data_dir, None).await
}

/// Bind the service with an explicit app-data directory and staged toolchain.
///
/// `tools_dir` is the resolved `<resource>/tools` of a packaged install. Interpreter
/// discovery reads its Python as the last fallback, which is what lets a clean machine
/// start the vendored language server without a system Python; `None` keeps the host on
/// system providers only.
pub async fn serve_in_with_tools(
    port: u16,
    web_root: Option<PathBuf>,
    data_dir: Option<PathBuf>,
    tools_dir: Option<PathBuf>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    serve_in_with_tools_and_runner(port, web_root, data_dir, tools_dir, Arc::new(RealRunner)).await
}

/// Bind the service with an explicit app-data directory, staged toolchain and runner.
///
/// The shipped hosts use [`RealRunner`]. The debug-only headless `--fake-engine` flag and the
/// route tests inject `FakeRunner` through this entry point; keeping the composition in one
/// place means the preflight, storage and encoder-fork hydration paths stay identical.
pub async fn serve_in_with_tools_and_runner(
    port: u16,
    web_root: Option<PathBuf>,
    data_dir: Option<PathBuf>,
    tools_dir: Option<PathBuf>,
    runner: Arc<dyn EncodeRunner>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    serve_with_runner_in_tools(port, web_root, data_dir, tools_dir, runner).await
}

/// Bind the service with an injected runner and no settings persistence. Phase 2 tests use
/// this to mount the real engine without touching a user's app-data directory.
pub async fn serve_with_runner(
    port: u16,
    web_root: Option<PathBuf>,
    runner: Arc<dyn EncodeRunner>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    serve_with_runner_in(port, web_root, None, runner).await
}

/// Bind the service with an injected runner and an explicit settings directory.
pub async fn serve_with_runner_in(
    port: u16,
    web_root: Option<PathBuf>,
    data_dir: Option<PathBuf>,
    runner: Arc<dyn EncodeRunner>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    serve_with_runner_in_tools(port, web_root, data_dir, None, runner).await
}

async fn serve_with_runner_in_tools(
    port: u16,
    web_root: Option<PathBuf>,
    data_dir: Option<PathBuf>,
    tools_dir: Option<PathBuf>,
    runner: Arc<dyn EncodeRunner>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    let listener = TcpListener::bind(("127.0.0.1", port)).await?;
    let address = listener.local_addr()?;
    let state =
        AppState::with_runner_and_data_dir(web_root, runner, data_dir).with_tools_dir(tools_dir);
    if let Err(error) = state.seed_starter_template().await {
        tracing::warn!(%error, "the starter project template was not seeded");
    }
    // VSScript caches its library once per process, so the bundled config has to exist
    // before the first preflight probe. On Windows this is a no-op; there the wheel's
    // four-parent probe is authoritative.
    state.hydrate_vapoursynth().await;
    state.hydrate_toolchain().await;
    state.hydrate_preflight().await;
    state.hydrate_storage().await;
    state.hydrate_encoder_forks().await;
    serve_state(listener, address, state).await
}

/// Bind the service around a fixed dependency inventory.
///
/// This exists for tests and diagnostic hosts: it exercises the real listener and shutdown
/// path without loading the host's VapourSynth install or spawning ten encoder probes. The
/// inventory is the same `Probe` list the engine would return, so no route behaviour is
/// bypassed.
pub async fn serve_with_runner_and_probes(
    port: u16,
    web_root: Option<PathBuf>,
    runner: Arc<dyn EncodeRunner>,
    probes: Vec<Probe>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    let listener = TcpListener::bind(("127.0.0.1", port)).await?;
    let address = listener.local_addr()?;
    let state = AppState::with_runner_and_probes(web_root, runner, probes);
    serve_state(listener, address, state).await
}

/// Bind the debug fake-engine host with a fixed dependency inventory and real storage.
///
/// The browser journey must not depend on the machine's installed encoders or muxers. This
/// keeps the same listener, project stores, routes, and fake runner while replacing only
/// the probes, so the UI's validation and Start path remain exercised.
pub async fn serve_with_runner_probes_and_data_dir(
    port: u16,
    web_root: Option<PathBuf>,
    data_dir: PathBuf,
    tools_dir: Option<PathBuf>,
    runner: Arc<dyn EncodeRunner>,
    probes: Vec<Probe>,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    let listener = TcpListener::bind(("127.0.0.1", port)).await?;
    let address = listener.local_addr()?;
    let state = AppState::with_runner_probes_and_data_dir(web_root, runner, probes, data_dir)
        .with_tools_dir(tools_dir);
    if let Err(error) = state.seed_starter_template().await {
        tracing::warn!(%error, "the starter project template was not seeded");
    }
    state.hydrate_storage().await;
    state.hydrate_encoder_forks().await;
    serve_state(listener, address, state).await
}

async fn serve_state(
    listener: TcpListener,
    address: SocketAddr,
    state: AppState,
) -> std::io::Result<(SocketAddr, ServiceHandle)> {
    tracing::info!(
        %address,
        version = env!("CARGO_PKG_VERSION"),
        "the service is listening"
    );
    let mut app = router(state.clone());
    // The dev webview runs the UI on Vite's origin and calls the service over loopback; a
    // release webview and every LAN page are same-origin. CORS is therefore a development
    // affordance, limited to the two local Vite origins, and is absent from release builds.
    if cfg!(debug_assertions) {
        app = app.layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list([
                    "http://localhost:1420".parse().expect("valid origin"),
                    "http://127.0.0.1:1420".parse().expect("valid origin"),
                ]))
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        );
    }

    let (shutdown, mut shutdown_signal) = watch::channel(false);
    let task = tokio::spawn(async move {
        let result = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_signal.changed().await;
            })
            .await;
        if let Err(error) = result {
            tracing::error!(%error, "service stopped");
        }
    });

    Ok((
        address,
        ServiceHandle {
            state,
            shutdown,
            task,
        },
    ))
}

fn default_data_dir() -> Option<PathBuf> {
    std::env::var_os("AV1ATION_DATA_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// Initialise the service logger without overriding an embedding host's subscriber.
pub fn init_tracing() {
    init_tracing_with_app_data(default_data_dir().as_deref());
}

/// Initialise stderr logging plus the application-scope file at `<app-data>/logs/application.log`.
///
/// A missing or unwritable log directory degrades to stderr rather than preventing startup:
/// observability must not be the reason a user cannot encode. The embedding host passes its
/// resolved app-data path; the headless binary passes `--data-dir` or `AV1ATION_DATA_DIR`.
pub fn init_tracing_with_app_data(data_dir: Option<&Path>) {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "av1ation_service=info,av1ation_desktop=info,tower_http=info".into());
    let subscriber = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr));

    let Some(file) = data_dir.and_then(|directory| match application_log(directory) {
        Ok(file) => Some(file),
        Err(error) => {
            eprintln!(
                "application logging is stderr-only: {} could not be opened: {error}",
                directory.join("logs").join("application.log").display()
            );
            None
        }
    }) else {
        let _ = subscriber.try_init();
        return;
    };

    let file_layer = tracing_subscriber::fmt::layer()
        .with_ansi(false)
        .with_writer(Mutex::new(file));
    let _ = subscriber.with(file_layer).try_init();
}

fn application_log(data_dir: &Path) -> std::io::Result<File> {
    let directory = data_dir.join("logs");
    std::fs::create_dir_all(&directory)?;
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("application.log"))
}
