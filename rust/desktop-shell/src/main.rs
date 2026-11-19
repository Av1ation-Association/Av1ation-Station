#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Desktop host: one embedded service, one window, no sidecar process.

use std::{
    error::Error,
    io,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use av1ation_service::ServiceHandle;
use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

struct ServiceTask(Mutex<Option<ServiceHandle>>);

/// Whether the webview currently has a run whose cancellation needs confirmation.
///
/// The close button must not depend on a round trip through JavaScript to decide whether it
/// can simply close: the first press with no active run used to be swallowed while the
/// asynchronous quit-request listener was still being consulted. The webview publishes this
/// state whenever the active run changes, so the host can close immediately in the common
/// case and only intercept when there is something to cancel.
struct QuitGuardState(AtomicBool);

#[derive(Debug, PartialEq, Eq)]
enum CloseAction {
    Close,
    Confirm,
}

fn close_action(active_run: bool) -> CloseAction {
    if active_run {
        CloseAction::Confirm
    } else {
        CloseAction::Close
    }
}

/// The marker a portable release ships beside its executable.
const PORTABLE_MARKER: &str = "portable";

/// Choose the one data root the embedded service owns.
///
/// A portable distribution is unpacked into a writable directory, so its state belongs in a
/// `data` sibling that can be copied or deleted with it. An installed build keeps Tauri's
/// platform app-data directory; the marker is a file, not a directory, so an accidental
/// folder cannot move a normal install.
fn resolve_data_root(executable: &Path, appimage: Option<&Path>, app_data: PathBuf) -> PathBuf {
    install_directory(executable, appimage)
        .filter(|install| install.join(PORTABLE_MARKER).is_file())
        .map_or(app_data, |install| install.join("data"))
}

/// The directory holding the artifact the user downloaded, not the binary inside it.
///
/// The marker has to sit beside that artifact: a macOS executable lives inside
/// `<Name>.app/Contents/MacOS`, and an AppImage's executable lives in a read-only temporary
/// mount. Writing a marker or data into either place would be lost on the next launch, so
/// both forms resolve to the artifact's own directory instead.
fn install_directory(executable: &Path, appimage: Option<&Path>) -> Option<PathBuf> {
    if let Some(appimage) = appimage.filter(|path| path.is_file()) {
        return appimage.parent().map(Path::to_path_buf);
    }
    // A macOS app is a bundle. The marker belongs beside the bundle, where the portable zip
    // can carry it and an application update cannot replace it. Every other platform runs
    // the executable from the directory the user extracted, so only macOS walks outward.
    #[cfg(target_os = "macos")]
    {
        if let Some(bundle) = bundle_parent(executable) {
            return Some(bundle);
        }
    }
    executable.parent().map(Path::to_path_buf)
}

/// The directory above the innermost `.app` bundle that contains `executable`.
///
/// It is compiled for tests on every host so the bundle layout is covered by the resolver
/// suite even where no `.app` can be launched.
#[cfg(any(target_os = "macos", test))]
fn bundle_parent(executable: &Path) -> Option<PathBuf> {
    executable
        .ancestors()
        .find(|ancestor| {
            ancestor
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("app"))
        })
        .and_then(Path::parent)
        .map(Path::to_path_buf)
}

/// Publish the webview's current run state to the window-close decision.
#[tauri::command]
fn set_quit_guard(state: tauri::State<'_, QuitGuardState>, active: bool) {
    state.0.store(active, Ordering::SeqCst);
}

/// Keep only the final component of the suggested export name.
///
/// The dialog treats a path-shaped suggestion as a starting directory. The webview only
/// gets to name the file, so a directory it supplies is discarded rather than honoured.
fn export_file_name(suggested_name: &str) -> String {
    std::path::Path::new(suggested_name)
        .file_name()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "export.txt".to_owned())
}

/// Ask the user where to save text, then write only that selected path.
///
/// The webview supplies the bytes and dialog labels, never a destination. The native dialog
/// is owned by the host, so a compromised page cannot turn this into an arbitrary write.
#[tauri::command]
async fn save_text_file(
    app: tauri::AppHandle,
    suggested_name: String,
    text: String,
    title: Option<String>,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let mut dialog = app
        .dialog()
        .file()
        .set_title(title.unwrap_or_else(|| "Export".to_owned()))
        .set_file_name(export_file_name(&suggested_name));
    let extensions: Vec<&str> = extensions
        .iter()
        .map(|extension| extension.trim().trim_start_matches('.'))
        .filter(|extension| !extension.is_empty())
        .collect();
    if !extensions.is_empty() {
        dialog = dialog.add_filter("File", &extensions);
    }

    let Some(path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("The selected path is not a local file: {error}"))?;
    std::fs::write(&path, text)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

/// Bound a requested webview zoom and reject a value JSON cannot carry reliably.
///
/// The frontend steps in tenths, but the command is the authority: a malformed invoke must
/// not leave the window at an unusable scale.
fn zoom_factor(factor: f64) -> Result<f64, String> {
    if !factor.is_finite() {
        return Err("The zoom factor must be a finite number.".to_owned());
    }
    Ok(factor.clamp(0.5, 2.0))
}

/// Set the webview's own zoom, not a CSS transform.
///
/// Scaling the webview keeps fixed pixel chrome, Monaco, and the preview consistent; a CSS
/// page zoom would leave native-sized surfaces behind.
#[tauri::command]
fn set_webview_zoom(window: tauri::WebviewWindow, factor: f64) -> Result<(), String> {
    let factor = zoom_factor(factor)?;
    window
        .set_zoom(factor)
        .map_err(|error| format!("could not set the webview zoom: {error}"))
}

/// Restart the process so a provider choice that initialises once takes effect.
///
/// The command is reachable only through the transport facade, so a LAN browser cannot
/// restart the host it is paired with.
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Stop the service, cancelling its worker, then close the process.
///
/// The window's close button only asks the frontend for confirmation; this command is the
/// confirmation. Shutting the service down here means the active run is cancelled before
/// the process exits, instead of relying on the OS to tear down its threads.
#[tauri::command]
async fn quit_app(app: tauri::AppHandle) {
    let service = app
        .try_state::<ServiceTask>()
        .and_then(|state| state.0.lock().ok().and_then(|mut service| service.take()));
    if let Some(service) = service {
        service.shutdown().await;
    }
    app.exit(0);
}

fn main() {
    // Windows allocates a console for every console child a GUI process starts. The engine
    // starts encoders and FFmpeg itself, so it needs a hidden console to inherit before any
    // of them exist. Local spawns also request `CREATE_NO_WINDOW` as a fallback.
    av1ation_service::keep_console_hidden();
    if let Err(error) = run() {
        eprintln!("av1ation-desktop could not start: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    // A second launch must bring the existing window back, not merely mark a
                    // minimized window as foreground: the user sees nothing if it stays iconic.
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            },
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_text_file,
            restart_app,
            set_webview_zoom,
            set_quit_guard,
            quit_app
        ])
        .setup(|app| {
            // `debug_assertions` is also true for `tauri build --debug`; `dev` is the
            // Tauri-set cfg that distinguishes `tauri dev` from any packaged build. A dev
            // tree has no `<resource>/web`; it serves Vite instead. Its toolchain is opt-in
            // through `AV1ATION_TOOLS_DIR`, so a developer can point at a staged tree (or
            // the `dist/dev-tools` cache) without installing anything system-wide.
            let resources = if cfg!(dev) {
                None
            } else {
                Some(app.path().resource_dir()?)
            };
            let web_root = resources.as_ref().map(|directory| directory.join("web"));
            let tools_dir = if cfg!(dev) {
                std::env::var_os("AV1ATION_TOOLS_DIR")
                    .filter(|value| !value.is_empty())
                    .map(std::path::PathBuf::from)
            } else {
                resources.as_ref().map(|directory| directory.join("tools"))
            };

            // Tauri's generated AppImage launcher exports a distribution Python home
            // (`$APPDIR/usr`) that cannot import the standalone interpreter's standard
            // library. Prefer the bundled `tools/python` tree whenever a launcher supplies
            // an inherited Python home.
            if let Some(tools) = tools_dir.as_ref()
                && std::env::var_os("PYTHONHOME").is_some()
            {
                unsafe { std::env::set_var("PYTHONHOME", tools.join("python")) };
            }

            // Tauri resolves the platform app-data directory; the service never derives it
            // from the manifest or the current directory.
            let app_data = app.path().app_data_dir()?;
            let appimage = std::env::var_os("APPIMAGE").map(std::path::PathBuf::from);
            let data_dir = std::env::current_exe()
                .map(|executable| {
                    resolve_data_root(&executable, appimage.as_deref(), app_data.clone())
                })
                .unwrap_or(app_data);
            // The service owns the one process-wide subscriber: stderr plus the
            // application-scope file under the resolved app-data directory.
            av1ation_service::init_tracing_with_app_data(Some(&data_dir));
            let (address, service) = tauri::async_runtime::block_on(
                av1ation_service::serve_in_with_tools(0, web_root, Some(data_dir), tools_dir),
            )
            .map_err(|error| io::Error::other(error.to_string()))?;
            app.manage(ServiceTask(Mutex::new(Some(service))));
            app.manage(QuitGuardState(AtomicBool::new(false)));

            let origin = format!("http://{address}");
            tracing::info!(%origin, "embedded service is listening");

            let script = format!(
                "Object.defineProperty(window, '__AV1ATION_SERVICE_ORIGIN__', \
                 {{ value: {origin:?}, writable: false }});"
            );

            let window_url = if cfg!(dev) {
                WebviewUrl::App("index.html".into())
            } else {
                WebviewUrl::External(
                    origin
                        .parse()
                        .map_err(|error| io::Error::other(format!("invalid origin: {error}")))?,
                )
            };

            WebviewWindowBuilder::new(app, "main", window_url)
                .title("Av1ation Station")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                // The templates screen owns HTML5 file drops. Tauri's native handler would
                // consume them on Windows before the page sees a drag event.
                .disable_drag_drop_handler()
                .initialization_script(&script)
                .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let active_run = window
                    .app_handle()
                    .try_state::<QuitGuardState>()
                    .is_some_and(|state| state.0.load(Ordering::SeqCst));
                if close_action(active_run) == CloseAction::Confirm {
                    // The shared modal asks before anything is cancelled; a second close
                    // request while it is open is ignored by the webview's own dialog.
                    api.prevent_close();
                    let _ = window.emit("quit-requested", ());
                }
                // With no active run, leave the close request alone. Tauri closes the last
                // window and the exit path below shuts the service down.
            }
        })
        .build(tauri::generate_context!())?
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event
                && let Some(state) = app.try_state::<ServiceTask>()
                && let Ok(mut service) = state.0.lock()
                && let Some(service) = service.take()
            {
                tauri::async_runtime::block_on(service.shutdown());
            }
        });

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use tauri::{Url, utils::acl::RemoteUrlPattern};

    use super::{
        CloseAction, bundle_parent, close_action, export_file_name, resolve_data_root, zoom_factor,
    };

    fn scratch_install(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "av1ation-desktop-data-root-{}-{name}",
            std::process::id()
        ))
    }

    #[test]
    fn a_portable_marker_beside_the_executable_moves_the_data_root() {
        let root = scratch_install("windows");
        let install = root.join("install");
        let app_data = root.join("appdata");
        std::fs::create_dir_all(&install).expect("install directory");
        let executable = install.join("av1ation-desktop.exe");

        std::fs::write(install.join("portable"), b"").expect("portable marker");
        assert_eq!(
            resolve_data_root(&executable, None, app_data.clone()),
            install.join("data"),
            "a portable marker keeps all service state beside the executable"
        );

        std::fs::remove_file(install.join("portable")).expect("remove marker");
        assert_eq!(
            resolve_data_root(&executable, None, app_data.clone()),
            app_data,
            "an installed build keeps the platform app-data directory"
        );

        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_macos_bundle_resolves_to_the_directory_above_it() {
        let root = scratch_install("macos");
        let install = root.join("install");
        let bundle = install.join("Av1ation Station.app");
        let executable = bundle
            .join("Contents")
            .join("MacOS")
            .join("av1ation-desktop");
        std::fs::create_dir_all(executable.parent().expect("Contents/MacOS"))
            .expect("bundle directory");

        assert_eq!(
            bundle_parent(&executable),
            Some(install.clone()),
            "the install directory is the one holding the .app, not Contents/MacOS"
        );
        assert_eq!(
            bundle_parent(&install.join("av1ation-desktop")),
            None,
            "a plain executable is not inside a bundle"
        );

        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn an_appimage_marker_beside_the_artifact_moves_the_data_root() {
        let root = scratch_install("appimage");
        let artifacts = root.join("artifacts");
        std::fs::create_dir_all(&artifacts).expect("artifact directory");
        let appimage = artifacts.join("Av1ation Station_0.1.0_x86_64.AppImage");
        std::fs::write(&appimage, b"").expect("appimage artifact");
        // The AppImage runtime executes from a read-only mount, so the executable's own
        // parent is never the install directory.
        let executable = root
            .join("mount")
            .join("usr")
            .join("bin")
            .join("av1ation-desktop");
        std::fs::create_dir_all(executable.parent().expect("mount bin")).expect("mount directory");
        let app_data = root.join("appdata");

        std::fs::write(artifacts.join("portable"), b"").expect("portable marker");
        assert_eq!(
            resolve_data_root(&executable, Some(&appimage), app_data.clone()),
            artifacts.join("data"),
            "an AppImage keeps data beside the file the user launched"
        );

        std::fs::remove_file(artifacts.join("portable")).expect("remove marker");
        assert_eq!(
            resolve_data_root(&executable, Some(&appimage), app_data.clone()),
            app_data,
            "without the marker the AppImage keeps the platform app-data directory"
        );

        // A stale APPIMAGE value must not turn a normal launch into portable mode.
        std::fs::write(artifacts.join("portable"), b"").expect("portable marker");
        let missing = root.join("moved.AppImage");
        assert_eq!(
            resolve_data_root(&executable, Some(&missing), app_data.clone()),
            app_data,
            "a missing APPIMAGE path falls back to the executable's own directory"
        );

        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_close_without_an_active_run_is_not_intercepted() {
        assert_eq!(close_action(false), CloseAction::Close);
        assert_eq!(close_action(true), CloseAction::Confirm);
    }

    #[test]
    fn an_export_name_cannot_supply_a_directory() {
        assert_eq!(export_file_name("scenes.txt"), "scenes.txt");
        let nested = format!("parent{}scenes.txt", std::path::MAIN_SEPARATOR);
        assert_eq!(export_file_name(&nested), "scenes.txt");
        assert_eq!(export_file_name("../../scenes.txt"), "scenes.txt");
        assert_eq!(export_file_name(""), "export.txt");
        #[cfg(windows)]
        {
            assert_eq!(
                export_file_name("C:\\Users\\someone\\scenes.txt"),
                "scenes.txt"
            );
            assert_eq!(export_file_name("C:\\"), "export.txt");
        }
    }

    #[test]
    fn zoom_is_bounded_and_finite() {
        assert_eq!(zoom_factor(1.0).expect("valid"), 1.0);
        assert_eq!(zoom_factor(0.1).expect("clamped"), 0.5);
        assert_eq!(zoom_factor(4.0).expect("clamped"), 2.0);
        assert!(zoom_factor(f64::NAN).is_err());
        assert!(zoom_factor(f64::INFINITY).is_err());
    }

    /// The packaged window loads the embedded service on an ephemeral loopback port, so the
    /// capability's remote pattern must accept any port. A pattern without the wildcard
    /// matches only port 80, which denies every plugin call from the real window and turns a
    /// native dialog into "refused by the host".
    #[test]
    fn the_capability_grants_the_loopback_origin_on_any_port() {
        // Embedded, so the test cannot resolve a path relative to the manifest directory.
        let source = include_str!("../capabilities/default.json");
        let capability: serde_json::Value =
            serde_json::from_str(source).expect("the capability file is JSON");
        let patterns: Vec<RemoteUrlPattern> = capability["remote"]["urls"]
            .as_array()
            .expect("the capability declares remote urls")
            .iter()
            .filter_map(serde_json::Value::as_str)
            .map(|pattern| pattern.parse().expect("a valid URL pattern"))
            .collect();

        let origin: Url = "http://127.0.0.1:52557/api/health"
            .parse()
            .expect("a loopback origin");
        assert!(
            patterns.iter().any(|pattern| pattern.test(&origin)),
            "no remote pattern in capabilities/default.json matches {origin}"
        );

        // The capability may grant the dialog-and-write command, but never a command that
        // accepts a destination path from the webview.
        let permissions: Vec<&str> = capability["permissions"]
            .as_array()
            .expect("the capability declares permissions")
            .iter()
            .filter_map(serde_json::Value::as_str)
            .collect();
        assert!(permissions.contains(&"core:event:allow-listen"));
        assert!(permissions.contains(&"core:event:allow-unlisten"));
        assert!(!permissions.contains(&"core:event:default"));
        // The notification host reads focus; a toast click restores a minimized window.
        assert!(permissions.contains(&"core:window:allow-is-focused"));
        assert!(permissions.contains(&"core:window:allow-unminimize"));
        assert!(permissions.contains(&"core:window:allow-set-focus"));
        assert!(permissions.contains(&"allow-save-text-file"));
        assert!(permissions.contains(&"notification:default"));
        assert!(permissions.contains(&"allow-set-quit-guard"));
        assert!(!permissions.contains(&"allow-write-text-file"));
    }
}
