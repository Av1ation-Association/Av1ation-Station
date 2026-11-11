//! The Python language server that ships inside the service binary.
//!
//! IntelliSense must work on a machine that has Python and no developer tooling, and a
//! sandboxed webview cannot start a process. The service can, so a wheelhouse is embedded
//! in the binary, unpacked once into app data, and run by the user's own interpreter.
//! Nothing is downloaded at run time and nothing is installed globally.
//!
//! The archive itself is generated, not committed: `assets/python-lsp.lock` pins the wheels
//! and `rust/crates/service/build.rs` runs the vendoring script before this crate compiles. A
//! review therefore reads a text diff, and a rebuild with the same lock reproduces the same
//! bytes.
//!
//! Unpacking into app data rather than importing from the archive matters: Jedi reads its
//! bundled typeshed stubs through the filesystem, which fails for a package living inside a
//! zip. The extracted tree is versioned by directory, so a later bundle can replace this
//! one without migrating anything.

use std::{
    fs,
    io::{Cursor, Error, ErrorKind},
    path::{Path, PathBuf},
    sync::Mutex,
};

/// The archive revision, also the directory name under app data.
///
/// Bump it whenever `assets/python-lsp.lock` changes: an existing extraction is reused only
/// when this string matches, so a stale tree can never shadow the new one.
pub(crate) const VERSION: &str = "jedi-language-server-0.47.0-py3.10";

/// What the UI calls the server when it comes from this archive.
pub(crate) const LABEL: &str = "jedi-language-server 0.47 (bundled)";

/// The oldest interpreter the vendored server supports. `jedi-language-server` declares
/// 3.10 itself, so an older Python would fail at import time with a traceback nobody sees.
pub(crate) const MINIMUM_PYTHON: (u64, u64) = (3, 10);

const MARKER: &str = ".complete";

/// The archive is embedded, so the binary is one file and a LAN or browser host needs no
/// resource directory of its own. `build.rs` writes it into `OUT_DIR` from the lock before
/// this module is compiled.
const ARCHIVE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/python-lsp.zip"));

/// One extraction per process at a time; two editors opening together must not interleave
/// writes into the same staging directory.
static UNPACKING: Mutex<()> = Mutex::new(());

/// Whether an interpreter version can run the vendored server.
///
/// An unparseable answer counts as unsupported: the probe already refuses a file that does
/// not run Python, so a version string shaped unexpectedly is a reason to leave completion
/// on the bundled tables rather than to spawn a server that may fail.
pub(crate) fn supports(version: &str) -> bool {
    let mut parts = version
        .split('.')
        .filter(|part| !part.is_empty())
        .map(|part| {
            part.chars()
                .take_while(char::is_ascii_digit)
                .collect::<String>()
        });
    let Some(major) = parts.next().and_then(|part| part.parse::<u64>().ok()) else {
        return false;
    };
    let Some(minor) = parts.next().and_then(|part| part.parse::<u64>().ok()) else {
        return false;
    };
    (major, minor) >= MINIMUM_PYTHON
}

/// The directory to put on `PYTHONPATH`, unpacking it on first use.
///
/// `None` means the server cannot be provided at all — a read-only data directory or a
/// corrupt archive. The caller falls back to whatever is installed on `PATH`, and the
/// editor keeps its bundled completion if nothing is.
pub(crate) fn directory(data_dir: &Path) -> Option<PathBuf> {
    let target = data_dir.join("python-lsp").join(VERSION);
    if target.join(MARKER).is_file() {
        return Some(target);
    }
    let _unpacking = UNPACKING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    // Another request may have finished while this one waited for the lock.
    if target.join(MARKER).is_file() {
        return Some(target);
    }
    if let Some(parent) = target.parent()
        && let Err(error) = fs::create_dir_all(parent)
    {
        tracing::warn!(
            directory = %parent.display(),
            %error,
            "the bundled language server has nowhere to unpack"
        );
        return None;
    }
    match unpack(&target) {
        Ok(()) => Some(target),
        Err(error) => {
            tracing::warn!(
                directory = %target.display(),
                %error,
                "the bundled language server could not be unpacked"
            );
            None
        }
    }
}

/// Unpack into a staging directory and rename it into place.
///
/// The rename is what makes the tree either absent or complete; the marker is written
/// inside the staging tree so a crash mid-copy cannot leave a directory that looks usable.
fn unpack(target: &Path) -> std::io::Result<()> {
    let staging = target.with_extension("unpacking");
    if staging.is_dir() {
        fs::remove_dir_all(&staging)?;
    }
    fs::create_dir_all(&staging)?;
    let mut archive = zip::ZipArchive::new(Cursor::new(ARCHIVE)).map_err(|error| {
        Error::new(
            ErrorKind::InvalidData,
            format!("the bundled language server archive is unreadable: {error}"),
        )
    })?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| {
            Error::new(
                ErrorKind::InvalidData,
                format!("the bundled language server archive is unreadable: {error}"),
            )
        })?;
        // `enclosed_name` refuses `..` and absolute paths, so a tampered archive cannot
        // write outside the app-data directory.
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let destination = staging.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination)?;
            continue;
        }
        if let Some(parent) = destination.parent()
            && let Err(error) = fs::create_dir_all(parent)
        {
            return Err(Error::new(
                error.kind(),
                format!("could not create {}: {error}", parent.display()),
            ));
        }
        let mut file = fs::File::create(&destination).map_err(|error| {
            Error::new(
                error.kind(),
                format!("could not write {}: {error}", destination.display()),
            )
        })?;
        std::io::copy(&mut entry, &mut file)?;
    }
    fs::write(staging.join(MARKER), VERSION)?;
    match fs::rename(&staging, target) {
        Ok(()) => Ok(()),
        Err(first) => {
            // Windows refuses to replace an existing directory. A tree that already carries
            // the marker was finished by a request that won the race, so this attempt just
            // yields its staging copy.
            if target.join(MARKER).is_file() {
                let _ = fs::remove_dir_all(&staging);
                return Ok(());
            }
            // An unmarked directory is an abandoned attempt, so discarding it loses nothing.
            if target.exists() {
                fs::remove_dir_all(target)?;
                fs::rename(&staging, target)?;
                return Ok(());
            }
            Err(first)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("av1ation-bundle-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).expect("a temp directory");
        directory
    }

    #[test]
    fn only_a_new_enough_python_can_run_the_server() {
        assert!(supports("3.14.7"));
        assert!(supports("3.10.0"));
        assert!(supports("3.11"));
        assert!(supports("4.0.0"));
        assert!(!supports("3.9.13"));
        assert!(!supports("2.7.18"));
        // A description rather than a version, and an empty answer, both stay unsupported.
        assert!(!supports("3"));
        assert!(!supports(""));
    }

    #[test]
    fn the_first_use_unpacks_a_runnable_server_and_the_next_reuses_it() {
        let data = scratch("unpack");
        let directory = directory(&data).expect("the embedded archive unpacks");
        assert!(
            directory
                .join("jedi_language_server")
                .join("__init__.py")
                .is_file()
        );
        assert!(directory.join("jedi").join("__init__.py").is_file());
        assert!(directory.join("BUNDLE.txt").is_file());
        assert!(directory.join(MARKER).is_file());

        // A marker is the whole test for reuse: deleting a file and asking again shows the
        // tree is handed back untouched rather than rebuilt.
        fs::remove_file(directory.join("BUNDLE.txt")).expect("a bundled file");
        let again = super::directory(&data).expect("the unpacked tree is reused");
        assert_eq!(again, directory);
        assert!(!again.join("BUNDLE.txt").exists());

        let _ = fs::remove_dir_all(data);
    }
}
