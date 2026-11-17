#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Desktop host: one embedded service, one window, no sidecar process.

use std::{error::Error, io, sync::Mutex};

use av1ation_service::ServiceHandle;
use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

struct ServiceTask(Mutex<Option<ServiceHandle>>);

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_text_file,
            restart_app,
            set_webview_zoom,
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
            let data_dir = app.path().app_data_dir()?;
            // The service owns the one process-wide subscriber: stderr plus the
            // application-scope file under the resolved app-data directory.
            av1ation_service::init_tracing_with_app_data(Some(&data_dir));
            let (address, service) = tauri::async_runtime::block_on(
                av1ation_service::serve_in_with_tools(0, web_root, Some(data_dir), tools_dir),
            )
            .map_err(|error| io::Error::other(error.to_string()))?;
            app.manage(ServiceTask(Mutex::new(Some(service))));

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
                .initialization_script(&script)
                .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // The shared modal asks before anything is cancelled; a second close request
                // while it is open is ignored by the webview's own dialog handling.
                api.prevent_close();
                let _ = window.emit("quit-requested", ());
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
    use tauri::{Url, utils::acl::RemoteUrlPattern};

    use super::{export_file_name, zoom_factor};

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
        assert!(permissions.contains(&"allow-save-text-file"));
        assert!(!permissions.contains(&"allow-write-text-file"));
    }
}
