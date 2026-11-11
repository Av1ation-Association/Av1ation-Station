//! Process creation policy for child programs.
//!
//! The desktop host is a GUI-subsystem process, so it has no console. Windows gives a
//! console-subsystem child a new visible console unless the child is created with
//! `CREATE_NO_WINDOW`; a video pipeline spawns FFmpeg and encoders often enough that the
//! windows are the difference between a usable application and a flashing desktop.
//!
//! Every local `Command` that can start a console program goes through [`hide_console`].
//! The engine dependency owns its encoder and FFmpeg spawns and exposes no creation hook,
//! so [`keep_console_hidden`] also gives the process a hidden console those children
//! inherit.

use std::process::Command;

#[cfg(windows)]
use std::{
    ffi::c_void,
    path::PathBuf,
    process::{Child, Stdio},
    sync::{Mutex, OnceLock},
    time::Duration,
};

/// `CREATE_NO_WINDOW`. Ignored by Windows when the same call also names
/// `CREATE_NEW_CONSOLE` or `DETACHED_PROCESS`, which no local spawn does.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The hidden console host, kept alive for as long as this process runs.
#[cfg(windows)]
static CONSOLE_HOST: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

/// Guards the one-time attachment, so a second call does not spawn a second host.
#[cfg(windows)]
static CONSOLE_HOST_START: OnceLock<()> = OnceLock::new();

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn AttachConsole(process_id: u32) -> i32;
    fn GetConsoleWindow() -> *mut c_void;
}

/// Create a console-subsystem child without allocating a console window.
///
/// The flag only changes window creation; inherited pipes, exit status, and process
/// arguments are untouched. It is a no-op away from Windows, where the platform has no
/// equivalent visible-console problem.
#[cfg(windows)]
pub fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(CREATE_NO_WINDOW);
}

/// Create a child without a console window; the platform has no such concept here.
#[cfg(not(windows))]
pub fn hide_console(_command: &mut Command) {}

/// Give the process a hidden console for every console-subsystem child it starts.
///
/// The pinned engine creates encoders and FFmpeg itself and offers no creation-flags hook.
/// A GUI process with no console is what makes Windows show a new window for each of those
/// children. Attaching to a console that was created with `CREATE_NO_WINDOW` makes them
/// inherit it instead. `cmd /c more` is the smallest console program that stays alive while
/// its stdin pipe remains open; it exits with this process, so no host is left behind.
///
/// This runs once, before the first child is started. A host that already has a console
/// (the application was launched from a terminal) is left alone: its children inherit that
/// console and do not allocate another. Local spawns still call [`hide_console`] as a
/// fallback, so a failed attachment cannot make the application itself unusable.
#[cfg(windows)]
pub fn keep_console_hidden() {
    use std::os::windows::process::CommandExt;

    CONSOLE_HOST_START.get_or_init(|| {
        // Safety: read-only query for this process's current console.
        if !unsafe { GetConsoleWindow() }.is_null() {
            return;
        }

        let command = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .map(|root| root.join("System32").join("cmd.exe"))
            .filter(|path| path.is_file())
            .unwrap_or_else(|| PathBuf::from("cmd.exe"));
        let mut host = match Command::new(&command)
            .args(["/d", "/c", "more"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
        {
            Ok(host) => host,
            Err(error) => {
                tracing::warn!(
                    %error,
                    "the hidden console host could not start; child windows may appear"
                );
                return;
            }
        };

        // Console creation is not complete when `cmd` itself is created; it starts `more`
        // and allocates the console as part of that child's startup. Retry briefly instead
        // of assuming the first `AttachConsole` sees it.
        for _ in 0..100 {
            // Safety: the pid belongs to the child this call just created, and attaching
            // changes only this process's console association.
            if unsafe { AttachConsole(host.id()) } != 0 {
                let slot = CONSOLE_HOST.get_or_init(|| Mutex::new(None));
                if let Ok(mut slot) = slot.lock() {
                    *slot = Some(host);
                }
                return;
            }
            if host.try_wait().ok().flatten().is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }

        tracing::warn!("the hidden console host could not be attached; child windows may appear");
        let _ = host.kill();
        let _ = host.wait();
    });
}

/// The platform has no visible-console problem outside Windows.
#[cfg(not(windows))]
pub fn keep_console_hidden() {}
