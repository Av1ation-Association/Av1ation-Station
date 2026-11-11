//! Provider selection for the bundled VapourSynth runtime.
//!
//! VSScript finds its Python through an implicit four-parent probe on Windows. On macOS and
//! Linux the wheel reads `$XDG_CONFIG_HOME/vapoursynth/vapoursynth.toml` instead, keyed by
//! the absolute path of the loaded VSScript library. A file generated in the staging tree
//! therefore points at paths the installed app no longer has. This module writes the file
//! under app data before the first preflight probe loads VSScript and points this process's
//! `XDG_CONFIG_HOME` at that directory.
//!
//! It is generated state, not a shipped file and not a user setting. It never writes
//! `~/.config`, and it preserves entries belonging to other VapourSynth installations. The
//! user's actual choice is `AppSettings.tool_sources["vapoursynth"]`; this module applies
//! it once, before VSScript initialises for the process.

use std::{
    env, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// The settings key for the VapourSynth provider. Runtime, Python and plugins are one unit.
pub(crate) const SETTING_ID: &str = "vapoursynth";

/// Where a VapourSynth runtime comes from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Source {
    Bundled,
    System,
}

impl Source {
    /// The wire value stored in `tool_sources` and reported by preflight.
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Bundled => "bundled",
            Self::System => "system",
        }
    }

    /// Parse a saved source, treating an unknown value as automatic.
    fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "bundled" => Some(Self::Bundled),
            "system" => Some(Self::System),
            _ => None,
        }
    }
}

/// The provider decision the preflight row reports after startup.
///
/// `selected` is what this process actually loaded, not merely what settings say. They
/// differ until a restart when a user changes the VapourSynth source.
#[derive(Clone, Debug)]
pub(crate) struct ProviderState {
    pub(crate) selected: Source,
    pub(crate) bundled_available: bool,
    pub(crate) bundled_detail: String,
}

/// The hosts whose VSScript needs the app-data TOML.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Platform {
    Windows,
    MacOs,
    Linux,
}

impl Platform {
    /// The library name the wheel installs and VSScript loads.
    fn vsscript_library(self) -> &'static str {
        match self {
            Self::Windows => "vsscript.dll",
            Self::MacOs => "libvsscript.dylib",
            Self::Linux => "libvsscript.so",
        }
    }

    /// Whether a file in `python/lib` is a loadable `libpython`.
    ///
    /// Linux names can carry a version suffix (`libpython3.14.so.1.0`), while macOS uses a
    /// plain `.dylib`. Static archives are never loadable and are excluded.
    fn is_libpython(self, name: &str) -> bool {
        let Some(rest) = name.strip_prefix("libpython") else {
            return false;
        };
        if !rest.starts_with("3.") {
            return false;
        }
        match self {
            Self::MacOs => name.ends_with(".dylib"),
            Self::Linux => {
                name.ends_with(".so")
                    || name.split_once(".so.").is_some_and(|(_, version)| {
                        version
                            .chars()
                            .all(|character| character.is_ascii_digit() || character == '.')
                    })
            }
            Self::Windows => false,
        }
    }
}

/// A resolved bundled runtime and the interpreter mtime VSScript validates against.
struct Runtime {
    vsscript: PathBuf,
    python: PathBuf,
    /// Present on macOS/Linux, where VSScript's TOML names the Python shared library.
    libpython: Option<PathBuf>,
    /// Whole seconds since the Unix epoch, which is what VSScript compares.
    python_modified: Option<u64>,
}

impl Runtime {
    /// The unescaped path VSScript uses as the TOML key.
    ///
    /// VSScript replaces a `/lib64/` component in the loaded library path with `/lib/`
    /// before comparing keys, so a tree installed below `lib64` needs the same spelling.
    fn key(&self) -> Option<String> {
        self.vsscript
            .to_str()
            .map(|path| path.replacen("/lib64/", "/lib/", 1))
    }

    /// One complete line in the shape the R82 parser reads.
    ///
    /// The mtime is quoted because the wheel's own `vapoursynth config` writes every value
    /// through its string escaper, and VSScript parses the final field as a string before
    /// comparing it numerically.
    fn config_line(&self) -> Option<String> {
        Some(format!(
            "{} = [{}, {}, \"{}\"]\n",
            toml_quote(&self.key()?)?,
            toml_string(&self.python)?,
            toml_string(self.libpython.as_deref()?)?,
            self.python_modified?
        ))
    }
}

/// Whether this host carries a complete staged VapourSynth runtime.
///
/// The settings route uses this to refuse a Bundled choice that would resolve to nothing;
/// the preflight row uses the richer [`prepare`] result for the same question.
pub(crate) fn bundled_available(tools_dir: Option<&Path>) -> bool {
    match (host_platform(), tools_dir) {
        (Some(platform), Some(tools_dir)) => bundled_runtime(tools_dir, platform).is_ok(),
        _ => false,
    }
}

/// Apply the saved provider choice and return what this process actually selected.
///
/// This must run before the first VSScript load: the Rust wrapper caches the selected
/// library once per process. `configured` is the raw `tool_sources["vapoursynth"]` value;
/// an unknown value is treated as automatic. Automatic selection prefers a healthy bundle
/// unless `VSSCRIPT_PATH` already names an explicit external runtime. An explicit System
/// choice drops an inherited `VSSCRIPT_PATH` only when it names the staged bundle, so the
/// screen's choice is not silently overridden by a stale environment variable.
pub(crate) async fn prepare(
    tools_dir: Option<&Path>,
    data_dir: Option<&Path>,
    configured: Option<&str>,
) -> ProviderState {
    let platform = host_platform();
    let configured = configured.and_then(Source::parse);
    let environment_override = env::var_os("VSSCRIPT_PATH").is_some();
    let (runtime, mut bundled_detail) = match (platform, tools_dir) {
        (Some(platform), Some(tools_dir)) => match bundled_runtime(tools_dir, platform) {
            Ok(runtime) => {
                let detail = format!("Bundled runtime · {}", runtime.vsscript.display());
                (Some(runtime), detail)
            }
            Err(detail) => (None, detail),
        },
        (None, _) => (
            None,
            "This host has no bundled VapourSynth runtime.".to_owned(),
        ),
        (Some(_), None) => (None, "This build carries no bundled toolchain.".to_owned()),
    };
    let mut bundled_available = runtime.is_some();
    let mut selected = choose_source(configured, environment_override, bundled_available);

    if selected == Source::System
        && configured == Some(Source::System)
        && let (Some(runtime), Some(value)) = (&runtime, env::var_os("VSSCRIPT_PATH"))
        && Path::new(&value) == runtime.vsscript
    {
        // SAFETY: startup, before VSScript is loaded and before any service thread reads
        // this variable. The screen's explicit System choice is the user's decision.
        unsafe { env::remove_var("VSSCRIPT_PATH") };
    }

    if selected == Source::Bundled {
        let Some(runtime) = runtime else {
            // The caller selected the bundle after it was removed, or automatic selection saw
            // an incomplete tree. Keep the process on the system provider and report why.
            selected = Source::System;
            bundled_available = false;
            return ProviderState {
                selected,
                bundled_available,
                bundled_detail,
            };
        };
        // A resolved runtime exists only for a host this build bundles, so this branch is
        // unreachable; keeping it total avoids an `expect` in the startup path.
        let Some(platform) = platform else {
            selected = Source::System;
            bundled_available = false;
            return ProviderState {
                selected,
                bundled_available,
                bundled_detail,
            };
        };
        match apply(&runtime, platform, data_dir).await {
            Ok(()) => {
                tracing::info!(
                    vsscript = %runtime.vsscript.display(),
                    python = %runtime.python.display(),
                    "the bundled VapourSynth runtime is configured"
                );
            }
            Err(error) => {
                tracing::warn!(
                    %error,
                    vsscript = %runtime.vsscript.display(),
                    "the bundled VapourSynth runtime could not be configured"
                );
                selected = Source::System;
                bundled_available = false;
                bundled_detail = error;
            }
        }
    }

    ProviderState {
        selected,
        bundled_available,
        bundled_detail,
    }
}

/// Pick the source for this process.
///
/// An explicit setting is honoured; a requested bundle that is absent falls back to the
/// system install so the application still starts. Automatic selection uses an explicit
/// `VSSCRIPT_PATH` as the user's external override, then prefers the bundle.
fn choose_source(
    configured: Option<Source>,
    environment_override: bool,
    bundled_available: bool,
) -> Source {
    match configured {
        Some(Source::Bundled) if bundled_available => Source::Bundled,
        Some(Source::Bundled) => Source::System,
        Some(Source::System) => Source::System,
        None if environment_override => Source::System,
        None if bundled_available => Source::Bundled,
        None => Source::System,
    }
}

/// Point the process at the selected runtime.
///
/// On Windows VSScript finds the interpreter through its four-parent probe, so naming the
/// library is enough. macOS/Linux need the app-data TOML before the library loads; the
/// environment is changed only after the write succeeds.
async fn apply(
    runtime: &Runtime,
    platform: Platform,
    data_dir: Option<&Path>,
) -> Result<(), String> {
    if platform == Platform::Windows {
        // SAFETY: startup, before VSScript is loaded and before any service thread reads this
        // variable. The selected runtime is the one the screen chose.
        unsafe { env::set_var("VSSCRIPT_PATH", &runtime.vsscript) };
        return Ok(());
    }

    let data_dir = data_dir.ok_or_else(|| {
        "The bundled VapourSynth runtime needs the application data directory.".to_owned()
    })?;
    write_config(data_dir, runtime)
        .await
        .map_err(|error| format!("The bundled VapourSynth runtime was not configured: {error}"))?;

    // SAFETY: startup, before VSScript is loaded and before any service thread reads these
    // variables. Setting them only after the config write succeeds keeps a failed write from
    // redirecting the loader.
    unsafe {
        if env::var_os("XDG_CONFIG_HOME").is_none_or(|value| Path::new(&value) != data_dir) {
            env::set_var("XDG_CONFIG_HOME", data_dir);
        }
        env::set_var("VSSCRIPT_PATH", &runtime.vsscript);
    }

    Ok(())
}

/// Resolve the three paths VSScript needs from one staged `tools/python` tree.
fn bundled_runtime(tools_dir: &Path, platform: Platform) -> Result<Runtime, String> {
    let python_root = tools_dir.join("python");
    if platform == Platform::Windows {
        let python = python_root.join("python.exe");
        if !python.is_file() {
            return Err(format!(
                "The bundled Python is missing ({}).",
                python.display()
            ));
        }
        let vsscript = python_root
            .join("Lib")
            .join("site-packages")
            .join("vapoursynth")
            .join(platform.vsscript_library());
        if !vsscript.is_file() {
            return Err(format!(
                "The bundled VapourSynth wheel is missing ({}).",
                vsscript.display()
            ));
        }
        return Ok(Runtime {
            vsscript,
            python,
            libpython: None,
            python_modified: None,
        });
    }

    let python = ["bin/python3", "bin/python"]
        .into_iter()
        .map(|relative| python_root.join(relative))
        .find(|path| path.is_file())
        .ok_or_else(|| "The bundled Python is missing.".to_owned())?;
    let library_dir = python_root.join("lib");
    let libpython = find_libpython(&library_dir, platform)
        .ok_or_else(|| "The bundled libpython is missing.".to_owned())?;
    let series = python_series(&libpython)
        .ok_or_else(|| "The bundled libpython has no Python version.".to_owned())?;
    let vsscript = find_vsscript(&library_dir, &series, platform)
        .ok_or_else(|| "The bundled VapourSynth wheel is missing.".to_owned())?;
    let python_modified = modified_seconds(&python)
        .ok_or_else(|| "The bundled Python has no modification time.".to_owned())?;

    Ok(Runtime {
        vsscript,
        python,
        libpython: Some(libpython),
        python_modified: Some(python_modified),
    })
}

/// The host's platform, or `None` for a target this build does not bundle.
fn host_platform() -> Option<Platform> {
    if cfg!(target_os = "windows") {
        Some(Platform::Windows)
    } else if cfg!(target_os = "macos") {
        Some(Platform::MacOs)
    } else if cfg!(target_os = "linux") {
        Some(Platform::Linux)
    } else {
        None
    }
}

/// Pick the shortest matching `libpython` name.
///
/// The unversioned `.so` a Python tree usually exposes is a symlink to the versioned real
/// file; either is loadable, and the unversioned name is what a relocatable tree refers to.
fn find_libpython(library_dir: &Path, platform: Platform) -> Option<PathBuf> {
    if platform == Platform::Windows {
        return None;
    }
    let mut candidates: Vec<PathBuf> = std::fs::read_dir(library_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| platform.is_libpython(name))
        })
        .collect();
    candidates.sort_by_key(|path| {
        path.file_name()
            .map(|name| name.to_string_lossy().len())
            .unwrap_or_default()
    });
    candidates.into_iter().next()
}

/// The `3.14` in `libpython3.14.dylib` or `libpython3.14.so.1.0`.
fn python_series(libpython: &Path) -> Option<String> {
    let name = libpython.file_name()?.to_str()?;
    let rest = name.strip_prefix("libpython")?;
    let series = rest
        .strip_suffix(".dylib")
        .or_else(|| rest.split_once(".so").map(|(series, _)| series))?;
    series.starts_with("3.").then(|| series.to_owned())
}

/// The VSScript library inside the wheel for the resolved Python series.
fn find_vsscript(library_dir: &Path, series: &str, platform: Platform) -> Option<PathBuf> {
    if platform == Platform::Windows {
        return None;
    }
    let candidate = library_dir
        .join(format!("python{series}"))
        .join("site-packages")
        .join("vapoursynth")
        .join(platform.vsscript_library());
    candidate.is_file().then_some(candidate)
}

/// Whole seconds since the Unix epoch, matching VSScript's `stat` comparison.
fn modified_seconds(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

/// Write or refresh the app-data TOML, preserving entries for other VSScript installs.
async fn write_config(data_dir: &Path, runtime: &Runtime) -> io::Result<PathBuf> {
    let directory = data_dir.join("vapoursynth");
    tokio::fs::create_dir_all(&directory).await?;
    let path = directory.join("vapoursynth.toml");
    let existing = match tokio::fs::read_to_string(&path).await {
        Ok(contents) => contents,
        Err(error) if error.kind() == io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error),
    };
    let key = runtime.key().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "the bundled VSScript path is not valid UTF-8",
        )
    })?;
    let line = runtime.config_line().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "the bundled VapourSynth paths cannot be represented in the VSScript config",
        )
    })?;
    let merged = merge_entry(&existing, &key, &line);
    if merged != existing {
        crate::platform::atomic::write(&path, merged.as_bytes()).await?;
    }
    Ok(path)
}

/// Replace the entry for `key` and keep every unrelated line.
fn merge_entry(existing: &str, key: &str, line: &str) -> String {
    let mut merged = String::with_capacity(existing.len() + line.len());
    for existing_line in existing.lines() {
        if line_key(existing_line).as_deref() == Some(key) {
            continue;
        }
        merged.push_str(existing_line);
        merged.push('\n');
    }
    merged.push_str(line);
    merged
}

/// The quoted key VSScript reads from the start of a line, unescaped the same way.
fn line_key(line: &str) -> Option<String> {
    if line.trim_start().starts_with('#') {
        return None;
    }
    let start = line.find('"')?;
    let rest = &line[start + 1..];
    let end = rest.find('"')?;
    Some(unescape_toml(&rest[..end]))
}

/// Remove the backslash escapes VSScript's parser ignores.
fn unescape_toml(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut characters = value.chars();
    while let Some(character) = characters.next() {
        if character == '\\' {
            if let Some(next) = characters.next() {
                output.push(next);
            }
        } else {
            output.push(character);
        }
    }
    output
}

/// Quote a path for the TOML line.
///
/// VSScript's parser finds the next quote instead of honouring an escape, so a path that
/// contains a quote or a newline cannot be represented and is rejected rather than written
/// as a line that would point somewhere else.
fn toml_string(path: &Path) -> Option<String> {
    toml_quote(path.to_str()?)
}

/// Quote a string with the escaping VSScript's parser understands.
fn toml_quote(text: &str) -> Option<String> {
    if text.contains(['"', '\n', '\r']) {
        return None;
    }
    Some(format!("\"{}\"", text.replace('\\', "\\\\")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary(name: &str) -> PathBuf {
        let directory = env::temp_dir().join(format!(
            "av1ation-vapoursynth-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&directory).expect("temp directory");
        directory
    }

    fn staged_tree(root: &Path, platform: Platform) -> Runtime {
        if platform == Platform::Windows {
            let python = root.join("python/python.exe");
            let vsscript = root
                .join("python/Lib/site-packages/vapoursynth")
                .join(platform.vsscript_library());
            for path in [&python, &vsscript] {
                std::fs::create_dir_all(path.parent().expect("parent")).expect("directory");
                std::fs::write(path, b"fixture").expect("fixture");
            }
        } else {
            let python = root.join("python/bin/python3");
            let library_dir = root.join("python/lib");
            let vsscript = library_dir
                .join("python3.14/site-packages/vapoursynth")
                .join(platform.vsscript_library());
            let libpython = library_dir.join(match platform {
                Platform::MacOs => "libpython3.14.dylib",
                Platform::Linux => "libpython3.14.so",
                Platform::Windows => unreachable!("the Windows fixture returns above"),
            });
            for path in [&python, &vsscript, &libpython] {
                std::fs::create_dir_all(path.parent().expect("parent")).expect("directory");
                std::fs::write(path, b"fixture").expect("fixture");
            }
        }
        bundled_runtime(root, platform).expect("the staged tree resolves")
    }

    #[test]
    fn a_staged_tree_resolves_the_interpreter_library_and_vsscript() {
        for (platform, library) in [
            (Platform::MacOs, "libvsscript.dylib"),
            (Platform::Linux, "libvsscript.so"),
        ] {
            let root = temporary("resolve");
            let runtime = staged_tree(&root, platform);
            assert_eq!(
                runtime.python,
                root.join("python/bin/python3"),
                "{platform:?}"
            );
            assert_eq!(
                runtime.vsscript,
                root.join(format!(
                    "python/lib/python3.14/site-packages/vapoursynth/{library}"
                )),
                "{platform:?}"
            );
            assert!(
                runtime
                    .libpython
                    .as_ref()
                    .is_some_and(|library| library.is_file()),
                "the resolved libpython exists for {platform:?}"
            );
            std::fs::remove_dir_all(root).expect("cleanup");
        }
    }

    #[test]
    fn a_staged_windows_tree_uses_the_four_parent_layout_without_a_toml() {
        let root = temporary("windows");
        let runtime = staged_tree(&root, Platform::Windows);

        assert_eq!(runtime.python, root.join("python/python.exe"));
        assert_eq!(
            runtime.vsscript,
            root.join("python/Lib/site-packages/vapoursynth/vsscript.dll")
        );
        assert!(runtime.config_line().is_none(), "Windows needs no TOML");
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn a_lib64_component_is_spelled_the_way_vsscript_compares_it() {
        let runtime = Runtime {
            vsscript: PathBuf::from("/opt/lib64/vapoursynth/libvsscript.so"),
            python: PathBuf::from("/opt/lib64/vapoursynth/bin/python3"),
            libpython: Some(PathBuf::from("/opt/lib64/vapoursynth/lib/libpython3.14.so")),
            python_modified: Some(1),
        };

        assert_eq!(
            runtime.key().as_deref(),
            Some("/opt/lib/vapoursynth/libvsscript.so")
        );
    }

    #[test]
    fn a_versioned_linux_library_still_names_its_python_series() {
        assert_eq!(
            python_series(Path::new("libpython3.14.so.1.0")),
            Some("3.14".to_owned())
        );
        assert!(Platform::Linux.is_libpython("libpython3.14.so.1.0"));
        assert!(!Platform::Linux.is_libpython("libpython3.14.so.1.0-gdb.py"));
        assert_eq!(
            python_series(Path::new("libpython3.14.dylib")),
            Some("3.14".to_owned())
        );
        assert_eq!(python_series(Path::new("libpython3.14.a")), None);
    }

    #[test]
    fn the_config_line_uses_the_same_shape_as_the_wheel_tool() {
        let root = temporary("line");
        let runtime = staged_tree(&root, Platform::Linux);
        let line = runtime.config_line().expect("a representable line");

        assert!(line.starts_with(&format!(
            "{} = [{}, {}, \"",
            toml_string(&runtime.vsscript).expect("vsscript path"),
            toml_string(&runtime.python).expect("interpreter path"),
            toml_string(runtime.libpython.as_deref().expect("library path"))
                .expect("quoted library path")
        )));
        assert!(line.ends_with("\"]\n"), "the mtime is a quoted field");
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn an_explicit_source_wins_and_an_absent_one_prefers_a_healthy_bundle() {
        assert_eq!(
            choose_source(Some(Source::System), false, true),
            Source::System
        );
        assert_eq!(
            choose_source(Some(Source::Bundled), false, true),
            Source::Bundled
        );
        assert_eq!(
            choose_source(None, false, true),
            Source::Bundled,
            "automatic selection prefers the bundle"
        );
        assert_eq!(
            choose_source(None, false, false),
            Source::System,
            "automatic selection falls back to the machine"
        );
        assert_eq!(
            choose_source(None, true, true),
            Source::System,
            "an explicit VSSCRIPT_PATH remains the user's provider"
        );
        assert_eq!(
            choose_source(Some(Source::Bundled), true, false),
            Source::System,
            "a missing bundle cannot be selected"
        );
    }

    #[tokio::test]
    async fn an_explicit_system_choice_does_not_write_the_bundled_toml() {
        let root = temporary("system");
        let tools = root.join("tools");
        staged_tree(
            &tools,
            host_platform().expect("this test host has a bundled layout"),
        );
        let data_dir = root.join("data");

        let state = prepare(Some(&tools), Some(&data_dir), Some("system")).await;

        assert_eq!(state.selected, Source::System);
        assert!(state.bundled_available);
        assert!(
            !data_dir.join("vapoursynth/vapoursynth.toml").exists(),
            "the system choice must not redirect VSScript at app data"
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[tokio::test]
    async fn a_missing_bundle_falls_back_to_system_and_says_why() {
        let root = temporary("missing");
        let state = prepare(Some(&root), Some(&root), Some("bundled")).await;

        assert_eq!(state.selected, Source::System);
        assert!(!state.bundled_available);
        assert!(
            state.bundled_detail.contains("missing"),
            "{}",
            state.bundled_detail
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn merging_replaces_the_staged_entry_and_keeps_other_installations() {
        let existing = concat!(
            "# an unrelated comment\n",
            "\"/opt/vapoursynth/libvsscript.so\" = [\"/opt/python3\", \"/opt/libpython3.so\", \"1\"]\n",
            "\"/staging/python/lib/python3.14/site-packages/vapoursynth/libvsscript.so\" = [\"/staging/python\", \"/staging/libpython.so\", \"2\"]\n",
        );
        let key = "/staging/python/lib/python3.14/site-packages/vapoursynth/libvsscript.so";
        let merged = merge_entry(
            existing,
            key,
            "\"/staging/python/lib/python3.14/site-packages/vapoursynth/libvsscript.so\" = [\"new\", \"newlib\", \"3\"]\n",
        );

        assert!(merged.contains("# an unrelated comment"));
        assert!(merged.contains("/opt/vapoursynth/libvsscript.so"));
        assert!(!merged.contains("\"/staging/python/lib/python3.14/site-packages/vapoursynth/libvsscript.so\" = [\"/staging/python\""));
        assert!(merged.ends_with(
            "\"/staging/python/lib/python3.14/site-packages/vapoursynth/libvsscript.so\" = [\"new\", \"newlib\", \"3\"]\n"
        ));
    }

    #[tokio::test]
    async fn writing_creates_the_app_data_config_and_is_idempotent() {
        let root = temporary("write");
        let runtime = staged_tree(&root.join("tools"), Platform::MacOs);
        let data_dir = root.join("data");

        let first = write_config(&data_dir, &runtime)
            .await
            .expect("first write");
        let first_contents = std::fs::read_to_string(&first).expect("read");
        let second = write_config(&data_dir, &runtime)
            .await
            .expect("second write");
        let second_contents = std::fs::read_to_string(&second).expect("read");

        assert!(first.ends_with("vapoursynth/vapoursynth.toml"));
        assert!(first_contents.starts_with(&format!(
            "{} = [",
            toml_string(&runtime.vsscript).expect("vsscript path")
        )));
        assert_eq!(first_contents, second_contents);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
