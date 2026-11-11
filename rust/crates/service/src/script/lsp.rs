//! The Python language server the script editor can use.
//!
//! Completion is bundled into the webview because a sandboxed window cannot start a
//! process. The service can, so it runs a language server and bridges LSP over a
//! WebSocket. A server the user installed on `PATH` is preferred; otherwise the vendored
//! Jedi in [`crate::script::lsp_bundle`] runs inside the resolved interpreter — the saved setting,
//! the machine's own Python, or the staged bundled runtime. A packaged install therefore
//! gets real completion on a clean machine with no system Python. Nothing is downloaded and
//! nothing is installed on the machine. The editor keeps its own tables only when no server
//! can run at all.
//!
//! The bridge forwards JSON-RPC frames, converting between one WebSocket text message and
//! the `Content-Length` framing LSP uses on stdio. It does not interpret the protocol, so a
//! server-specific request is the server's business.

use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use av1ation_contracts::encoder::{PythonInterpreter, PythonInterpreters};
use av1ation_contracts::script::LanguageServerInfo;
use av1ation_engine::platform::hide_console;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    sync::mpsc,
};

/// One server family this build knows how to start.
struct Candidate {
    /// Stable key the editor reports, `pyright`, `jedi`, or `pylsp`.
    kind: &'static str,
    /// What the UI shows when the server is found.
    label: &'static str,
    /// Executable names to look for on PATH, without an extension on Windows.
    executables: &'static [&'static str],
    /// Arguments that put the server on stdio.
    args: &'static [&'static str],
}

/// Pyright first: its inference and stub handling are the closest to the VS Code experience
/// the editor is imitating. Jedi is the pip-installable fallback, and `pylsp` is common in
/// distributions that ship neither of the two names.
const CANDIDATES: &[Candidate] = &[
    Candidate {
        kind: "pyright",
        label: "Pyright",
        executables: &["pyright-langserver"],
        args: &["--stdio"],
    },
    Candidate {
        kind: "jedi",
        label: "jedi-language-server",
        executables: &["jedi-language-server"],
        args: &[],
    },
    Candidate {
        kind: "pylsp",
        label: "Python LSP Server",
        executables: &["pylsp"],
        args: &[],
    },
];

/// A probe result with everything the bridge needs to spawn the process.
pub(crate) struct Installed {
    pub(crate) kind: &'static str,
    pub(crate) label: &'static str,
    /// The file to start: a server shim from `PATH`, or the interpreter that runs the
    /// bundled server.
    pub(crate) program: PathBuf,
    pub(crate) args: &'static [&'static str],
    /// The extracted bundle, placed on the child's `PYTHONPATH`. `None` for a `PATH`
    /// server, whose own installation already makes its package importable.
    pub(crate) python_path: Option<PathBuf>,
}

/// Find a server to run, without starting it.
///
/// The probe only checks that a file exists: a language server can be slow to answer
/// `--version`, and the editor's fallback should never wait on a probe to render.
pub(crate) fn installed(
    data_dir: Option<&Path>,
    interpreter: Option<&str>,
    tools_dir: Option<&Path>,
) -> Option<Installed> {
    let default = default_interpreter(tools_dir);
    installed_with(data_dir, interpreter, default)
}

fn installed_with(
    data_dir: Option<&Path>,
    configured: Option<&str>,
    default: Option<DefaultInterpreter>,
) -> Option<Installed> {
    // An explicit Pyright comes first: its inference is the closest to Pylance, and choosing
    // the bundled server over an install the user made on purpose would be surprising.
    if let Some(server) = on_path(&CANDIDATES[..1]) {
        return Some(server);
    }
    if let Some(server) = bundled(data_dir, configured, default) {
        return Some(server);
    }
    on_path(&CANDIDATES[1..])
}

/// The first candidate in `families` that has a file on `PATH`.
fn on_path(families: &[Candidate]) -> Option<Installed> {
    let path = env::var_os("PATH")?;
    let directories: Vec<PathBuf> = env::split_paths(&path).collect();
    families.iter().find_map(|candidate| {
        let program = find_in(&directories, candidate.executables)?;
        Some(Installed {
            kind: candidate.kind,
            label: candidate.label,
            program,
            args: candidate.args,
            python_path: None,
        })
    })
}

/// The vendored server, run by an interpreter that can import it.
///
/// Both halves have to exist: without Python 3.10+ there is nothing to run it in, and
/// without a writable app-data directory there is nowhere to unpack the package tree that
/// Jedi needs on disk.
fn bundled(
    data_dir: Option<&Path>,
    configured: Option<&str>,
    default: Option<DefaultInterpreter>,
) -> Option<Installed> {
    // Cheap checks first: unpacking 30 MB of package tree for an interpreter that cannot
    // run it would be pure waste.
    let (python, version) = analysed_interpreter(configured, default)?;
    if !crate::script::lsp_bundle::supports(&version) {
        return None;
    }
    let directory = crate::script::lsp_bundle::directory(data_dir?)?;
    Some(Installed {
        kind: "jedi",
        label: crate::script::lsp_bundle::LABEL,
        program: python,
        // The wheel has no `__main__.py` — its console script calls this function — so the
        // entry point is invoked directly instead of through `-m`.
        args: &["-c", "from jedi_language_server.cli import cli; cli()"],
        python_path: Some(directory),
    })
}

/// The interpreter the bundled server runs in: the saved setting when it still answers,
/// otherwise the machine's own, together with the version that was verified.
///
/// The resolved `sys.executable` is used rather than the path as typed, so a launcher alias
/// and a Store alias both start the interpreter that was actually probed.
fn analysed_interpreter(
    configured: Option<&str>,
    default: Option<DefaultInterpreter>,
) -> Option<(PathBuf, String)> {
    if let Some(path) = configured.map(str::trim).filter(|path| !path.is_empty())
        && let Some(probe) = probe(Path::new(path))
    {
        return Some((probe.executable, probe.version));
    }
    default.map(|default| (default.executable, default.version))
}

/// The interpreter the editor points a server at when the user has saved no setting.
///
/// A language server told nothing resolves its own environment: Pyright reads `PATH`, but
/// jedi and pylsp analyse the environment they were installed into, which is the tooling
/// venv rather than the one a user's packages live in. Resolving the interpreter here and
/// forwarding it makes every family analyse the Python a shell would run, so a `pip install`
/// is visible without a setting. The order follows a Python editor extension: an activated
/// environment first, then `PATH`, then installs the Windows launcher reports, then the
/// staged bundled runtime. That last candidate is what makes a clean install work.
struct DefaultInterpreter {
    executable: PathBuf,
    version: String,
    /// Which rule chose it: `path`, `virtual_env`, `conda_prefix`, `launcher`, or `bundled`.
    source: &'static str,
}

/// One place an interpreter might be, before anything is run.
///
/// Named apart from the server [`Candidate`] above: that one is a language server family,
/// this one is a Python the editor could analyse.
struct InterpreterCandidate {
    path: PathBuf,
    source: &'static str,
}

/// What an interpreter answered, and the executable it really is.
///
/// The second fact is not garnish: on Windows `python` on `PATH` can be an App Execution
/// Alias and `py -0p` names the install behind it, so the executable is the key that stops
/// the picker offering one Python twice.
struct Probe {
    version: String,
    executable: PathBuf,
}

/// One interpreter for the whole answer: what the editor forwards, and what the row names.
struct Chosen {
    path: String,
    version: Option<String>,
    source: &'static str,
    /// The phrase the detail line uses, including where the choice came from.
    description: String,
}

/// The inventory row the script editor reads.
///
/// `interpreter` is always the interpreter the editor will forward, not only the saved
/// setting. The row exists to state which environment completion comes from, and "the
/// server's default" is not an answer a user can check; naming the machine's own `python`
/// also keeps Pyright, jedi, and pylsp analysing the same one.
pub(crate) fn info(
    data_dir: Option<&Path>,
    interpreter: Option<&str>,
    tools_dir: Option<&Path>,
) -> LanguageServerInfo {
    info_with(data_dir, interpreter, default_interpreter(tools_dir))
}

fn info_with(
    data_dir: Option<&Path>,
    interpreter: Option<&str>,
    default: Option<DefaultInterpreter>,
) -> LanguageServerInfo {
    let chosen = chosen(interpreter, default.as_ref());
    let analysed = chosen.as_ref().map(|chosen| chosen.description.clone());
    let Some(server) = installed_with(data_dir, interpreter, default) else {
        return LanguageServerInfo {
            available: false,
            kind: String::new(),
            label: "Bundled completion".to_owned(),
            command: None,
            workspace: None,
            interpreter: chosen.as_ref().map(|chosen| chosen.path.clone()),
            interpreter_version: chosen.as_ref().and_then(|chosen| chosen.version.clone()),
            interpreter_source: chosen.as_ref().map(|chosen| chosen.source.to_owned()),
            detail: format!(
                "The bundled language server needs Python 3.10 or newer and a writable app-data directory, and no server or usable interpreter was found, so completion stays on the bundled tables. {}",
                match analysed {
                    Some(analysed) => format!(
                        "Point the interpreter at a Python 3.10+ install (currently {analysed}) to start it, or install Pyright (`npm i -g pyright`)."
                    ),
                    None => "Install Python 3.10+, use a build with the bundled toolchain, or install Pyright (`npm i -g pyright`) to start it."
                        .to_owned(),
                }
            ),
        };
    };
    let workspace = workspace().ok();
    let command = match (&server.python_path, server.args.is_empty()) {
        (None, _) => server.program.display().to_string(),
        (Some(_), false) => format!("{} {}", server.program.display(), server.args.join(" ")),
        (Some(_), true) => server.program.display().to_string(),
    };
    LanguageServerInfo {
        available: true,
        kind: server.kind.to_owned(),
        label: server.label.to_owned(),
        command: Some(command),
        workspace: workspace
            .as_ref()
            .map(|directory| directory.display().to_string()),
        interpreter: chosen.as_ref().map(|chosen| chosen.path.clone()),
        interpreter_version: chosen.as_ref().and_then(|chosen| chosen.version.clone()),
        interpreter_source: chosen.as_ref().map(|chosen| chosen.source.to_owned()),
        detail: match analysed {
            Some(analysed) => format!(
                "Completion, hover, and diagnostics come from {} analysing {analysed}.",
                server.label
            ),
            None => format!(
                "Completion, hover, and diagnostics come from {}; it has no Python interpreter to analyse, so choose one above.",
                server.label
            ),
        },
    }
}

/// The saved setting wins; otherwise the machine's own interpreter is named.
fn chosen(configured: Option<&str>, default: Option<&DefaultInterpreter>) -> Option<Chosen> {
    let configured = configured.map(str::trim).filter(|path| !path.is_empty());
    if let Some(path) = configured {
        let version = probe(Path::new(path)).map(|probe| probe.version);
        let description = match &version {
            Some(version) => format!("`{path}` (Python {version})"),
            None => format!("`{path}`, which did not report a version"),
        };
        return Some(Chosen {
            path: path.to_owned(),
            version,
            source: "setting",
            description,
        });
    }
    let default = default?;
    let path = default.executable.display().to_string();
    let origin = match default.source {
        "virtual_env" => "`VIRTUAL_ENV`",
        "conda_prefix" => "`CONDA_PREFIX`",
        "launcher" => "the Windows launcher",
        "bundled" => "the bundled toolchain",
        _ => "`PATH`",
    };
    Some(Chosen {
        description: format!(
            "Python {} at `{path}`, found through {origin}",
            default.version
        ),
        path,
        version: Some(default.version.clone()),
        source: default.source,
    })
}

/// Resolve the interpreter the machine would run, verified by asking it for a version.
///
/// Verification is the point rather than a formality: on Windows the `python3` App
/// Execution Alias is a file that opens the Store instead of running Python, so trusting a
/// name would leave the editor describing an interpreter it cannot analyse through.
fn default_interpreter(tools_dir: Option<&Path>) -> Option<DefaultInterpreter> {
    candidates(tools_dir).into_iter().find_map(|candidate| {
        let probe = probe(&candidate.path)?;
        Some(DefaultInterpreter {
            executable: probe.executable,
            version: probe.version,
            source: candidate.source,
        })
    })
}

/// Every interpreter the picker may offer, the saved setting first.
///
/// A setting that no longer answers is still listed: the row already says it is unverified,
/// and dropping it from the picker would silently move the user to a different environment
/// than the one the server will be told to analyse. The staged bundled Python is listed
/// last, so a packaged install always has a real choice even with no system Python.
pub(crate) fn interpreters(
    configured: Option<&str>,
    tools_dir: Option<&Path>,
) -> PythonInterpreters {
    let mut found: Vec<PythonInterpreter> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    if let Some(path) = configured.map(str::trim).filter(|path| !path.is_empty()) {
        let probe = probe(Path::new(path));
        seen.push(dedupe_key(
            probe
                .as_ref()
                .map_or(Path::new(path), |probe| probe.executable.as_path()),
        ));
        found.push(PythonInterpreter {
            path: path.to_owned(),
            version: probe.map(|probe| probe.version),
            source: "setting".to_owned(),
        });
    }
    for candidate in candidates(tools_dir) {
        let Some(probe) = probe(&candidate.path) else {
            continue;
        };
        let key = dedupe_key(&probe.executable);
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        found.push(PythonInterpreter {
            path: probe.executable.display().to_string(),
            version: Some(probe.version),
            source: candidate.source.to_owned(),
        });
    }
    PythonInterpreters {
        interpreters: found,
    }
}

/// Windows paths differ only by case, and the launcher and `PATH` can name one install.
fn dedupe_key(executable: &Path) -> String {
    let key = executable.display().to_string();
    if cfg!(windows) {
        key.to_ascii_lowercase()
    } else {
        key
    }
}

/// Every place an interpreter could be, in the order an editor extension would try them.
///
/// The staged runtime is appended last. It is the only candidate on a clean machine, and
/// putting it first would hide the user's own `pip` packages behind the bundle's.
fn candidates(tools_dir: Option<&Path>) -> Vec<InterpreterCandidate> {
    let mut candidates = Vec::new();
    for (variable, source) in [
        ("VIRTUAL_ENV", "virtual_env"),
        ("CONDA_PREFIX", "conda_prefix"),
    ] {
        let Some(root) = env::var_os(variable) else {
            continue;
        };
        for executable in environment_interpreters(Path::new(&root), source == "virtual_env") {
            candidates.push(InterpreterCandidate {
                path: executable,
                source,
            });
        }
    }
    if let Some(path) = env::var_os("PATH") {
        let directories: Vec<PathBuf> = env::split_paths(&path).collect();
        // `python` first on Windows: `python3` there is usually the Store alias.
        let names: &[&str] = if cfg!(windows) {
            &["python", "python3"]
        } else {
            &["python3", "python"]
        };
        for name in names {
            if let Some(executable) = find_in(&directories, &[*name]) {
                candidates.push(InterpreterCandidate {
                    path: executable,
                    source: "path",
                });
            }
        }
    }
    for executable in launcher_interpreters() {
        candidates.push(InterpreterCandidate {
            path: executable,
            source: "launcher",
        });
    }
    if let Some(executable) = bundled_python(tools_dir) {
        candidates.push(InterpreterCandidate {
            path: executable,
            source: "bundled",
        });
    }
    candidates
}

/// The interpreter inside a staged toolchain, if this host carries one.
///
/// `python-build-standalone`'s `install_only` tree keeps `python.exe` at the root on
/// Windows and under `bin/` elsewhere; no other layout is accepted, because VSScript finds
/// the same interpreter by that Windows shape. A path check is enough here: the caller's
/// probe decides whether the file actually runs Python.
fn bundled_python(tools_dir: Option<&Path>) -> Option<PathBuf> {
    let root = tools_dir?.join("python");
    let candidates: &[&str] = if cfg!(windows) {
        &["python.exe"]
    } else {
        &["bin/python3", "bin/python"]
    };
    candidates
        .iter()
        .map(|relative| root.join(relative))
        .find(|path| path.is_file())
}

/// Pythons the Windows launcher knows, including installs no `PATH` entry names.
///
/// The launcher's own inventory is read instead of guessing at registry keys; a machine
/// without `py` simply contributes nothing.
fn launcher_interpreters() -> Vec<PathBuf> {
    if !cfg!(windows) {
        return Vec::new();
    }
    let mut process = std::process::Command::new("py");
    process
        .arg("-0p")
        .stdin(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut process);
    let Ok(output) = process.output() else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(launcher_path)
        .collect()
}

/// ` -V:3.14[-64] *   C:\\Python314\\python.exe` — the path begins at its drive letter.
fn launcher_path(line: &str) -> Option<PathBuf> {
    let colon = line.find(":\\")?;
    let path = PathBuf::from(line.get(colon.saturating_sub(1)..)?.trim());
    path.is_file().then_some(path)
}

/// Where an environment root keeps its interpreter. A venv adds a `Scripts` directory on
/// Windows; conda keeps `python.exe` at the root itself.
fn environment_interpreters(root: &Path, venv: bool) -> Vec<PathBuf> {
    if cfg!(windows) {
        return vec![if venv {
            root.join("Scripts").join("python.exe")
        } else {
            root.join("python.exe")
        }];
    }
    vec![
        root.join("bin").join("python3"),
        root.join("bin").join("python"),
    ]
}

/// A broken interpreter must not hold the settings page open, so the probe is bounded the
/// same way the encoder help scan is.
const INTERPRETER_TIMEOUT: Duration = Duration::from_secs(5);

/// Ask one interpreter for its version and the executable it really is.
///
/// Packages belong to an interpreter, so the setting is only trustworthy when the file
/// actually runs Python. A missing file, a non-executable, a non-zero exit, or a silent
/// answer all mean the path cannot be honoured; the caller reports that instead of
/// pretending the environment is in use.
fn probe(executable: &Path) -> Option<Probe> {
    let mut process = std::process::Command::new(executable);
    process
        .args([
            "-c",
            "import sys; print(sys.version.split()[0]); print(sys.executable)",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_console(&mut process);

    let mut child = process.spawn().ok()?;
    let deadline = Instant::now() + INTERPRETER_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let output = child.wait_with_output().ok()?;
                let text = String::from_utf8_lossy(&output.stdout);
                let mut lines = text.lines().map(str::trim);
                let version = lines.next().unwrap_or_default().to_owned();
                if version.is_empty() || version.len() > 80 {
                    return None;
                }
                let executable = lines
                    .next()
                    .filter(|path| !path.is_empty())
                    .map_or_else(|| executable.to_path_buf(), PathBuf::from);
                return Some(Probe {
                    version,
                    executable,
                });
            }
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(20));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

/// The temporary project the server analyses.
///
/// A language server resolves `import condor_data` from the workspace on disk, so the
/// generated stub is written there before the editor opens. The script itself never needs
/// to be written: it arrives as an opened document and is updated in place.
pub(crate) fn workspace() -> std::io::Result<PathBuf> {
    let directory = env::temp_dir().join("av1ation-station-lsp");
    fs::create_dir_all(&directory)?;
    let stub = av1ation_engine::script::module::stub_source();
    let path = directory.join("condor_data.pyi");
    // Rewrite on every read: an upgraded application must not keep describing the previous
    // module shape to the language server.
    if fs::read_to_string(&path).unwrap_or_default() != stub {
        fs::write(path, stub)?;
    }
    Ok(directory)
}

/// Names with the host's executable extensions, so a `.cmd` shim installed by npm is found.
fn find_in(directories: &[PathBuf], names: &[&str]) -> Option<PathBuf> {
    let extensions = executable_extensions();
    for name in names {
        for directory in directories {
            // The extension wins over the bare name. An npm global install writes both a
            // POSIX shell script called `pyright-langserver` and the `.cmd` shim Windows
            // can run; spawning the shell script fails with "not a valid Win32 application".
            for extension in &extensions {
                let candidate = directory.join(format!("{name}{extension}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
            let direct = directory.join(name);
            if direct.is_file() {
                return Some(direct);
            }
        }
    }
    None
}

fn executable_extensions() -> Vec<String> {
    if !cfg!(windows) {
        return Vec::new();
    }
    env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_owned())
        .split(';')
        .filter(|extension| !extension.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

/// Own the server process for one WebSocket connection.
pub(crate) async fn bridge(socket: WebSocket, server: Installed) {
    let mut command = Command::new(&server.program);
    command.args(server.args);
    if let Some(directory) = &server.python_path {
        // The bundle is first so its pinned Jedi and parso win over anything installed in
        // the user's environment; an inherited `PYTHONPATH` still contributes its entries,
        // because that is where some users keep their own packages.
        let mut entries = vec![directory.clone()];
        if let Some(existing) = env::var_os("PYTHONPATH") {
            entries.extend(env::split_paths(&existing));
        }
        command.env(
            "PYTHONPATH",
            env::join_paths(entries).unwrap_or_else(|_| directory.clone().into()),
        );
    }
    hide_console(&mut command);
    let mut command = tokio::process::Command::from(command);
    let mut child = match command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            tracing::warn!(
                program = %server.program.display(),
                %error,
                "the language server did not start"
            );
            return;
        }
    };

    let Some(mut stdin) = child.stdin.take() else {
        return;
    };
    let Some(stdout) = child.stdout.take() else {
        return;
    };
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::debug!(message = %line, "language server");
            }
        });
    }

    // A reader task owns stdout. Reading in the `select!` below would cancel a partially
    // read frame whenever the socket produced a message, corrupting the stream.
    let (sender, mut receiver) = mpsc::channel::<String>(64);
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        while let Some(payload) = read_frame(&mut reader).await {
            if sender.send(payload).await.is_err() {
                break;
            }
        }
    });

    let (mut sink, mut stream) = socket.split();
    loop {
        tokio::select! {
            outgoing = receiver.recv() => {
                let Some(payload) = outgoing else {
                    break;
                };
                if sink.send(Message::Text(payload.into())).await.is_err() {
                    break;
                }
            }
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        // Only JSON-RPC objects cross. A frame that is not one is a client
                        // bug, and writing it would desynchronise the server's framing.
                        if serde_json::from_str::<serde_json::Value>(&text).is_ok()
                            && write_frame(&mut stdin, &text).await.is_err()
                        {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }

    let _ = child.kill().await;
}

async fn read_frame<R: AsyncBufRead + Unpin>(reader: &mut R) -> Option<String> {
    let mut length = 0_usize;
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line).await {
            Ok(0) | Err(_) => return None,
            Ok(_) => {}
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some(rest) = trimmed.strip_prefix("Content-Length:") {
            length = rest.trim().parse().ok()?;
        }
    }
    if length == 0 {
        return None;
    }
    let mut payload = vec![0_u8; length];
    reader.read_exact(&mut payload).await.ok()?;
    String::from_utf8(payload).ok()
}

async fn write_frame<W: AsyncWriteExt + Unpin>(
    writer: &mut W,
    payload: &str,
) -> std::io::Result<()> {
    writer
        .write_all(format!("Content-Length: {}\r\n\r\n", payload.len()).as_bytes())
        .await?;
    writer.write_all(payload.as_bytes()).await?;
    writer.flush().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_server_is_found_by_name() {
        let directory = env::temp_dir().join(format!("av1ation-lsp-test-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("a temp directory");
        let executable = directory.join("jedi-language-server");
        fs::write(&executable, b"").expect("a placeholder executable");

        let found = find_in(std::slice::from_ref(&directory), &["jedi-language-server"]);
        assert_eq!(found.as_deref(), Some(executable.as_path()));
        assert!(find_in(std::slice::from_ref(&directory), &["pyright-langserver"]).is_none());
        let _ = fs::remove_dir_all(directory);
    }

    #[cfg(windows)]
    #[test]
    fn a_windows_shim_wins_over_the_bare_shell_script() {
        let directory = env::temp_dir().join(format!("av1ation-lsp-shim-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("a temp directory");
        fs::write(directory.join("pyright-langserver"), b"#!/bin/sh\n").expect("a shell shim");
        let shim = directory.join("pyright-langserver.cmd");
        fs::write(&shim, b"@echo off\r\n").expect("a command shim");

        let found = find_in(std::slice::from_ref(&directory), &["pyright-langserver"]);
        assert_eq!(found.as_deref(), Some(shim.as_path()));
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn a_path_that_is_not_an_interpreter_reports_no_version() {
        let missing = env::temp_dir().join("av1ation-missing-python");
        assert!(probe(&missing).is_none());
    }

    #[test]
    fn the_picker_keeps_a_saved_interpreter_that_no_longer_answers() {
        let missing = env::temp_dir().join("av1ation-missing-python");
        let found = interpreters(Some(&missing.display().to_string()), None);
        let saved = found
            .interpreters
            .first()
            .expect("the saved setting is listed first");
        assert_eq!(saved.source, "setting");
        assert_eq!(saved.version, None);
        // Every other entry is one the service confirmed by running it.
        for entry in found.interpreters.iter().skip(1) {
            assert_ne!(entry.source, "setting");
            assert!(entry.version.is_some());
        }
    }

    #[cfg(windows)]
    #[test]
    fn a_launcher_line_is_parsed_from_its_drive_letter() {
        let directory =
            env::temp_dir().join(format!("av1ation-py-launcher-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("a temp directory");
        let executable = directory.join("python.exe");
        fs::write(&executable, b"").expect("a placeholder executable");
        let line = format!(" -V:3.14[-64] *   {}", executable.display());
        assert_eq!(launcher_path(&line).as_deref(), Some(executable.as_path()));
        assert!(launcher_path(" -V:3.14 *").is_none());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn the_inventory_names_the_configured_interpreter() {
        let info = info(None, Some("  C:/Python314/python.exe  "), None);
        assert_eq!(info.interpreter.as_deref(), Some("C:/Python314/python.exe"));
        assert_eq!(info.interpreter_source.as_deref(), Some("setting"));
        assert!(info.detail.contains("C:/Python314/python.exe"));
    }

    #[test]
    fn a_machine_default_is_named_with_its_origin() {
        let info = info_with(
            None,
            None,
            Some(DefaultInterpreter {
                executable: PathBuf::from("C:/Python314/python.exe"),
                version: "3.14.7".to_owned(),
                source: "path",
            }),
        );
        // The row can only be trusted if the path it shows is the one the editor forwards.
        assert_eq!(info.interpreter.as_deref(), Some("C:/Python314/python.exe"));
        assert_eq!(info.interpreter_version.as_deref(), Some("3.14.7"));
        assert_eq!(info.interpreter_source.as_deref(), Some("path"));
        assert!(info.detail.contains("found through `PATH`"));
    }

    #[test]
    fn the_bundled_runtime_is_named_as_the_bundled_toolchain() {
        let info = info_with(
            None,
            None,
            Some(DefaultInterpreter {
                executable: PathBuf::from(
                    "C:/Program Files/Av1ation Station/tools/python/python.exe",
                ),
                version: "3.14.10".to_owned(),
                source: "bundled",
            }),
        );
        // A clean install has no system Python, so the row must still name a real path and
        // say where it came from rather than presenting the bundle as a machine default.
        assert_eq!(info.interpreter_source.as_deref(), Some("bundled"));
        assert_eq!(info.interpreter_version.as_deref(), Some("3.14.10"));
        assert!(
            info.interpreter
                .as_deref()
                .is_some_and(|path| path.contains("tools/python/python.exe"))
        );
        assert!(info.detail.contains("found through the bundled toolchain"));
    }

    #[test]
    fn the_staged_bundle_contributes_a_python_only_when_it_exists() {
        let directory = std::env::temp_dir().join(format!("av1ation-tools-{}", std::process::id()));
        let executable = directory.join("python").join(if cfg!(windows) {
            "python.exe"
        } else {
            "bin/python3"
        });
        fs::create_dir_all(executable.parent().expect("a parent")).expect("a temp directory");
        fs::write(&executable, b"").expect("a placeholder interpreter");

        assert_eq!(bundled_python(Some(&directory)), Some(executable.clone()));
        assert_eq!(bundled_python(None), None);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn the_saved_setting_wins_over_the_machine_default() {
        let info = info_with(
            None,
            Some("C:/venvs/encode/Scripts/python.exe"),
            Some(DefaultInterpreter {
                executable: PathBuf::from("C:/Python314/python.exe"),
                version: "3.14.7".to_owned(),
                source: "path",
            }),
        );
        assert_eq!(
            info.interpreter.as_deref(),
            Some("C:/venvs/encode/Scripts/python.exe")
        );
        assert_eq!(info.interpreter_source.as_deref(), Some("setting"));
    }

    #[test]
    fn a_saved_interpreter_that_does_not_answer_falls_back_to_the_machine_default() {
        let chosen = analysed_interpreter(
            Some("C:/missing/python.exe"),
            Some(DefaultInterpreter {
                executable: PathBuf::from("C:/Python314/python.exe"),
                version: "3.14.7".to_owned(),
                source: "path",
            }),
        )
        .expect("the verified default is used");
        assert_eq!(chosen.0, PathBuf::from("C:/Python314/python.exe"));
        assert_eq!(chosen.1, "3.14.7");

        // Without a data directory there is nowhere to unpack the bundle, so no server.
        assert!(bundled(None, None, None).is_none());
    }

    #[test]
    fn an_activated_environment_is_the_first_candidate() {
        let root = Path::new("C:/venvs/encode");
        let venv = environment_interpreters(root, true);
        let conda = environment_interpreters(root, false);
        assert!(venv[0].ends_with(if cfg!(windows) {
            "Scripts/python.exe"
        } else {
            "bin/python3"
        }));
        assert!(conda[0].ends_with(if cfg!(windows) {
            "python.exe"
        } else {
            "bin/python3"
        }));
    }

    #[test]
    fn the_workspace_carries_the_generated_stub() {
        let directory = workspace().expect("a workspace directory");
        let stub = fs::read_to_string(directory.join("condor_data.pyi")).expect("the stub");
        assert!(stub.contains("video_path"));
        assert!(stub.contains("class Scene"));
    }

    #[tokio::test]
    async fn lsp_frames_are_read_back_without_their_headers() {
        let payload = r#"{"jsonrpc":"2.0","id":1,"result":[]}"#;
        let bytes = format!("Content-Length: {}\r\n\r\n{payload}", payload.len());
        let mut reader = BufReader::new(bytes.as_bytes());
        assert_eq!(read_frame(&mut reader).await.as_deref(), Some(payload));
        assert!(read_frame(&mut reader).await.is_none());
    }
}
