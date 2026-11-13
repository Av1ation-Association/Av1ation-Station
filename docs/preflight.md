# Preflight

`AppState` owns one `PreflightCache`. It probes on the first read, off the async executor,
and caches the result; `/api/health` returns the cached report and `POST
/api/preflight/refresh` discards it and probes again. A browser reload therefore reads the
same result instead of spawning the toolchain again. The probe itself lives in
`rust/crates/engine`, so the service and the desktop host never maintain separate tables of
executable names. Each result is also logged once when it is cached.

The release contract in [packaging.md](packaging.md) pins one toolchain per target; the
service resolves every binary through one module,
`rust/crates/service/src/capability/toolchain.rs`, shared by preflight, launch and the PATH
shim. The desktop passes `<resource>/tools`; a development host
passes the same tree through `AV1ATION_TOOLS_DIR` (the headless binary also accepts
`--tools-dir`). `AppSettings.tool_sources` chooses `bundled` or `system` per capability, an
absent key means _bundled when present, otherwise system_, and an accepted `custom_tools`
path still wins over both.

Every row whose capability can resolve two providers reports a `providers` list (source,
availability, and detail), a `selected_source` (what this process loaded) and a
`configured_source` (the saved choice, absent for automatic selection), while the row's
`detail` remains the engine's report. That is VapourSynth, each encoder family, FFmpeg,
MKVToolNix, and every
metric with a native backend. Encoder, FFmpeg and mkvmerge choices apply on the next use: the
launcher writes the selected absolute executable into the run's encoder document, and
`<app-data>/toolbin` holds links to the selected FFmpeg and mkvmerge first on `PATH`.
VapourSynth and `metrics` are one process-wide choice each, because VSScript and the native
metric libraries initialise once; changing either reports the old source as active until the
application restarts. The metric rows still report their own active source: a metric whose
library the target does not stage loads from the system installation even when the shared
choice is Bundled. For a bundled choice the service points `VMAF_LIB_DIR`,
`FMETRICS_LIB_DIR`, `VSHIP_LIB_DIR` and `VSHIP_PLUGIN_PATH` at `tools/lib`, but only for the
libraries this target stages, so a system library the bundle does not carry keeps its own
hints. A missing bundled component does not make a capability unavailable
while its system provider works, and a selected System provider that is broken is reported
as such instead of silently falling back. `PUT /api/settings/tool-source` writes the choice
and rejects a Bundled request when this install carries no resolvable staged provider, so
the screen never promises a restart that cannot work. The response is the settings document,
and `null` removes the entry and restores automatic selection. The inactive VapourSynth
runtime is reported as unchecked rather than probed, because loading two VSScript libraries
and two CPythons in one process is unsupported. The System alternatives for FFmpeg and
MKVToolNix are unchecked too while the bundled link is active, because the service's own
`toolbin` entry is the program the engine's PATH probe would report as the machine's. A
metric row whose bundled library is loaded shows its System alternative unchecked for the
same reason: the loader caches what it opened, so only a restart with System selected
probes the machine's own library.

## Contents

- [What is actually required](#what-is-actually-required)
- [Custom encoder definitions](#custom-encoder-definitions)
- [Metrics](#metrics)
- [Checks](#checks)
- [Custom executables](#custom-executables)
- [The Python language server is an enhancement, never a dependency](#the-python-language-server-is-an-enhancement-never-a-dependency)

## What is actually required

`andean-condor` decodes through **either** native FFMS2 **or** VapourSynth, and encodes
through **standalone encoder executables** — `aomenc`, `SvtAv1EncApp`, `rav1e`, `vpxenc`,
`avmenc`, `x264`, `x265`, `vvencapp`, or `ffmpeg` itself. Neither VapourSynth nor FFmpeg is
universally required:

| Dependency                            | Required for                                                                                                                                             | Not required for                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **VapourSynth**                       | any `Input::VapourSynth` or `Input::VapourSynthScript`; noise detection on **any** input, because the sequence builds its own graph from an FFMS2 decode | native `Input::Video` (FFMS2) decoding, and encoding from a native input that does not run noise detection |
| **FFMS2**                             | native `Input::Video`                                                                                                                                    | VapourSynth inputs                                                                                         |
| **At least one encoder executable**   | encoding                                                                                                                                                 | scene detection, noise detection, target quality                                                           |
| **FFmpeg**                            | muxing/concatenation paths that shell out to it                                                                                                          | encoding itself, when the chosen encoder writes a directly concatenable format                             |
| **`mkvmerge`**                        | the muxing fallback                                                                                                                                      | everything else                                                                                            |
| **VMAF**                              | `QualityMetric::VMAF`                                                                                                                                    | every other metric; any sequence that does not score                                                       |
| **SSIMULACRA2 / BUTTERAUGLI / CVVDP** | the corresponding `QualityMetric` variant, via any one of three backends                                                                                 | every other metric                                                                                         |
| **XPSNR**                             | `QualityMetric::XPSNR`                                                                                                                                   | every other metric                                                                                         |

VapourSynth is a library the engine opens in-process, not a CLI it shells out to. Discovery
is VSScript's: `VSSCRIPT_PATH`, the path printed by `vapoursynth get-vsscript`, or the
platform `VSScript` library, or the `vsscript.dll` inside the selected bundled Python.
On Windows, once the wheel's `vsscript.dll` is loaded, its four-parent probe finds the
bundled interpreter implicitly. On macOS/Linux the service writes `<app-data>/vapoursynth/vapoursynth.toml` before the first
probe, keyed by the staged `libvsscript` path and checking the staged `python3` mtime, and
points this process's `XDG_CONFIG_HOME` at app data; it preserves entries for other
VapourSynth installations and never writes the user's config. `vspipe` is not part of that
path — a machine can have a loadable VapourSynth and no `vspipe`, and the reverse is not a
usable probe. The engine probe therefore loads the API, creates a VSScript environment and
a core, and reports the core version and API revision. Encoder probes use the engine's own `EncoderBase` list and
`Encoder::validate`, so executable names never drift from the encoder defaults.

## Custom encoder definitions

A saved fork uses the same family probe. The definition owns the executable and its probe
arguments (`--version` and `--help`); the service runs only those arguments, never project
media or encode arguments. The family stamp check rejects a path that does not identify as
the requested encoder, and the help parse produces the fork's descriptor map. Saving a fork
is separate from the Settings → Dependencies provider probe in [Custom executables](#custom-executables): a fork is additive and
is selected per project, while a provider probe replaces the built-in row's executable. A
saved fork's map is that probe result, so it is re-probed when the service starts; without
that, a description the parser has since learned to type would stay wrong on disk forever.
`parameters_edited` records that the user changed the map, and such a fork is never
re-probed; saving an executable path clears the flag because that probe is what the user
asked for. An executable that cannot be read at startup keeps its last good map.

Forks live in `AppSettings.encoder_forks`, under `encoder_forks` in `config.json`. Each one
is `{ id, label, base, executable, version, parameters }`, where `base` is the engine encoder
id (`aom`, `svt-av1`, `rav1e`, `vpx`, `avm`, `x264`, `x265`, or `vvenc`). `GET /api/encoders`
appends one `EncoderDescriptor` per fork with `fork: true` and `base` naming its family, so
the Encoders list can group builds without guessing from the label. Selecting a fork in a
project writes `executable` and the fork's starting `options` into that project's engine
`Encoder` document; the project keeps those values and never references the catalogue.

A built-in's descriptor edits are an `EncoderParameterOverride` under
`AppSettings.encoder_overrides`, keyed by encoder id. It stores the complete descriptor map
the editor showed plus the engine keys that map omits, so the merge on read is
`(engine - removed) + parameters`. Storing removals is what keeps an engine parameter added
by a later build visible without resurrecting one the user deleted. `PUT` with the engine's
own map is treated as a reset; `DELETE` always clears the override. A fork is rejected by
this route because its parameters are part of the fork document.

The probe is best-effort by design (`screens/settings.md`). Lines shaped like
`--flag <value>   description` become descriptors; numeric metavars and `[min - max]` ranges
become `Number`, a bracketed list of bare names such as `[c, mmx, sse]` becomes a text
`Choice`, `[0: main, 1: high]` becomes a numbered `Choice` with labels, a file or directory
metavariable (and prose such as `Path to the configuration file`) becomes `Path`, and a line
with no value evidence becomes `Flag`. A text value whose prose names an email, URL, or
ISO-8601 timestamp carries that format for the editor's validation; prose that names a
format otherwise stays plain `Text`.
A line the parser cannot type is skipped, never guessed, and the raw help text ships with
`EncoderForkProbe.detail` so the user can add or correct descriptors. The parser reads
`--long=<value>` and `-x, --long <value>` spellings, folds indented continuation lines into
the description so a wrapped range and a stated default survive, and uses the long spelling
as the canonical key. A path is validated
before anything is saved, and an update that changes the path re-probes it and replaces the
saved path only after acceptance.

So the preflight rules are:

- **Encoding is disabled only when no encoder executable is available**, or when the
  _selected_ encoder's executable is missing. A missing `ffmpeg` does not disable encoding.
- **Preview of a scene is available whenever the scene's input can be decoded.** A native
  FFMS2 input previews fine with no VapourSynth installed; a VapourSynth input requires it.
  The per-scene capability is derived from that scene's resolved input, not from a global
  flag.
- **A missing VapourSynth disables the VapourSynth input kinds and noise detection**, and
  the UI offers native FFMS2 for decoding rather than dead-ending. It does not disable
  encoding. Noise detection is not part of the encode dependency set, even though an FFMS2
  input cannot run it without VapourSynth.
- **A metric is available when at least one backend that implements it is usable.** The
  metric catalogue is filtered per metric, not per library.

## Metrics

Metric availability is a property of the machine, not of the build: `libvship` and
`libvmaf` are opened with `dlopen` at runtime, so the same binary supports different
metrics on different systems. The engine exposes this directly — the service calls
`metrics::availability::libraries()` and must not reimplement the probes.

`libraries()` returns one `MetricLibraryInfo` per native library (`libvship`, `fmetrics`,
`libvmaf`) with `available`, `version`, diagnostic `details`, and — for GPU libraries — the
enumerated `devices`, each carrying the `id` that is the `gpu_id` a user selects. An
integrated device is usually not what these metrics should run on, which is why the
library's default prefers a discrete one.

The engine's dispatch is `metrics::engine(&metric, input_is_vapoursynth) -> Option<Engine>`,
a pure function of the metric, the input kind, and which libraries loaded. Its precedence is
fixed:

1. **`libvship`**, if it implements the metric and can run.
2. **`fmetrics`**, if it implements the metric and the VapourSynth plugin branch is not the
   better choice. `fmetrics` is skipped for a VapourSynth input when a plugin exists for
   that metric, because a VapourSynth input already has the graph a plugin needs, while an
   FFMS2 input would have to build one purely to score.
3. **The VapourSynth plugin branch**, reached by returning `None` from `engine()`.
4. **`libvmaf`**, for `VMAF` only. Its caller is special-cased and has no plugin branch.

Backend coverage is therefore not uniform, and preflight must model it per metric:

| Metric      | `libvship` | `fmetrics` | VapourSynth plugin   | `libvmaf` |
| ----------- | ---------- | ---------- | -------------------- | --------- |
| VMAF        | no         | no         | no                   | **yes**   |
| SSIMULACRA2 | yes        | yes        | yes (`vship` plugin) | no        |
| BUTTERAUGLI | yes        | yes        | yes (`vship` plugin) | no        |
| CVVDP       | yes        | yes        | yes (`vship` plugin) | no        |
| XPSNR       | no         | no         | yes (`vszip` plugin) | no        |

Consequences the preflight must express:

- **XPSNR has exactly one backend.** Without VapourSynth and the `vszip` plugin it is
  unavailable, with no fallback.
- **VMAF has exactly one backend.** Without `libvmaf` it is unavailable, with no fallback.
- **SSIMULACRA2, BUTTERAUGLI, and CVVDP degrade.** A machine with no GPU, no VapourSynth,
  but a loadable `fmetrics` still supports all three. A machine with none of the three
  backends supports none of them.
- **`libvship` loading is not sufficient.** It is compiled per-backend against a GPU driver
  and scoring additionally requires a device that passes `Vship_GPUFullCheck`. A library
  that loaded but enumerated no usable device is reported as loaded with an empty device
  list, and that distinction is what the remediation text must act on.

`Engine::VapourSynth` is a branch in the engine crate rather than a dlopened library, so
`engine()` reports it as always available. Whether the _plugin_ is present is a separate
question the service must answer, which is why the plugin column above is not derivable
from `libraries()`. The engine preflight emits one `metric:*` row per metric: it reads
`libraries()` once and resolves the `vship` and `vszip` namespaces through
`Core::get_plugin_by_namespace`, then marks a metric available when any backend in its
column is usable. A row that is unavailable names the concrete install, not a generic
"metric missing".

When a metric is unavailable, remediation names the concrete install, not the abstraction:

| Unavailable                                     | Remediation                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| VMAF                                            | install `libvmaf`; set `VMAF_LIB_DIR` for a non-standard location; supply an explicit model path when built-in models are absent |
| SSIMULACRA2 / BUTTERAUGLI / CVVDP, all backends | install `fmetrics` for a CPU path, or `libvship` plus a Vulkan driver for a GPU path, or VapourSynth plus the `vship` plugin     |
| SSIMULACRA2 / BUTTERAUGLI / CVVDP, GPU only     | no usable device passed `Vship_GPUFullCheck`; choose another device by `gpu_id`, or install `fmetrics`                           |
| XPSNR                                           | install VapourSynth and the `vszip` plugin                                                                                       |

## Checks

| Check                                                                                                                 | Failure effect                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| At least one encoder executable from the selected provider or `PATH` (or configured), using the engine's encoder list | encode disabled                                                                                        |
| The _selected_ encoder's executable present                                                                           | that encoder unavailable in the catalogue                                                              |
| VapourSynth loadable through VSScript, with a matching architecture                                                   | VapourSynth input kinds unavailable; noise detection unavailable                                       |
| FFMS2 library loadable                                                                                                | native input kind unavailable                                                                          |
| `ffmpeg` present                                                                                                      | muxing paths that need it unavailable                                                                  |
| `mkvmerge` present                                                                                                    | muxing fallback unavailable                                                                            |
| `metrics::availability::libraries()` per-library status                                                               | filters the metric catalogue per [Metrics](#metrics)                                                                  |
| VapourSynth plugin presence, per plugin-backed metric                                                                 | removes that metric when no native backend covers it                                                   |
| VapourSynth filter plugins (`vszip`, `mvutensils`, `zoomvtools`, `com.vs.fgs`, `vodesfunc`/`vskernels`/`vsscale`)     | removes exactly the filters that need the missing module; core `Crop`/`Resize`/`Trim` remain available |
| VapourSynth namespaces referenced by a video's script inputs                                                          | `/validate` lists them in `plugin_problems`; a run returns `422` for the sequences it would open       |
| output directory writable                                                                                             | encode disabled                                                                                        |
| temp directory writable and at least 512 MiB free                                                                     | encode disabled (`507`)                                                                                |
| free disk space above 2 GiB                                                                                           | warning only                                                                                           |
| metric has at least one usable backend for the selected input                                                         | target quality blocked only when that metric is selected                                               |
| engine crate reports its supported encoders                                                                           | filter the catalogue                                                                                   |

Preflight is a **list of results**, not a boolean, so the fix-it screen can name each
missing component and link to it. This is the single most common source of "it doesn't
work" reports in this class of application.

## Custom executables

A user may point the app at an encoder, FFmpeg, or mkvmerge binary that is not on `PATH`. The
same interrogation answers both questions, because both are "what can this program do?":
`preflight::probe_tool` runs the family's version command with a five-second timeout and
returns the path, the version line, and a status the report can carry.

| `kind`    | Version command | Accepted stamp                    |
| --------- | --------------- | --------------------------------- |
| `aom`     | `--help`        | `AOMedia Project AV1` or `aomenc` |
| `svt-av1` | `--version`     | `SVT-AV1` or `SvtAv1EncApp`       |
| `rav1e`   | `--version`     | `rav1e`                           |
| `vpx`     | `--help`        | `VP8/VP9` or `vpxenc`             |
| `avm`     | `--help`        | `AOMedia Project AV2` or `avmenc` |
| `x264`    | `--version`     | `x264`                            |
| `x265`    | `--version`     | `x265`                            |
| `vvenc`   | `--help`        | `vvenc`                           |
| `ffmpeg`  | `-version`      | `ffmpeg version`                  |
| `mkvmerge` | `--version`   | `mkvmerge`                         |

The family list is the engine's own `EncoderBase` list plus `mkvmerge`, so it never trails
the encoders the engine can drive; a test fails when an encoder has no family. The `kind` is
the engine's encoder name (`aom`, `svt-av1`, `rav1e`, `vpx`, `avm`, `x264`, `x265`, `vvenc`),
`ffmpeg`, or `mkvmerge`, whose families satisfy their muxing rows instead of an `encoder:`
row.

A program is accepted only when its output contains the family's stamp. An executable
that runs but is silent, times out, or prints another family's stamp is reported as
unavailable with that output as the detail, not treated as valid. The version command is
run with no project arguments, and the child is killed at the timeout rather than left
behind the service. Two stamps are deliberately tight: avmenc rejects `--version` and
answers `--help`, so AV2 is identified through its usage text, and the AV1 stamp names
`AOMedia Project AV1` because that same help text names AV2 for the sibling encoder. Without
that distinction one libaom lineage would validate the other.

`POST /api/preflight/custom` takes `{ kind, path }` and returns one `PreflightCheck` with
`origin: "custom"`. The row id is `custom:<kind>` even when it replaces a detected row, so
removing it restores the row underneath. The server replaces any earlier custom check for
the same kind. An accepted custom encoder takes the place of its `encoder:<id>` row and
its capability, so an absent `PATH` binary stops disabling encoding. An accepted custom
FFmpeg or mkvmerge takes the place of its muxing row.

Sending the same `kind` again with a new path is how an existing executable is edited: the
probe runs first, and only an accepted result replaces the saved path, so a correction never
requires a delete. The family is part of the saved identity, so editing cannot silently move
a path from one encoder family to another.

An **accepted** path is a setting: it is written to `config.json` under `custom_tools`
before the in-memory inventory changes, and a failed write returns `500`
`IO` rather than showing a row that will disappear on restart. That
field is part of the single settings document returned by `GET /api/settings`, so theme,
temporary-directory override, chunk retention, and accepted executables are one object with
one file. `PATCH /api/settings` deliberately does not accept `custom_tools`: a path is only ever
written through the probe, so the settings write preserves the list instead of replacing it
with unvalidated input. The patch's absent fields keep their stored values, a present field
replaces its value, and an explicit `null` clears `temp_dir`; every settings writer uses the
same locked read-modify-write seam, so a template or custom-tool write cannot erase an
unrelated field. A
**rejected** probe is transient and is appended as `custom:<kind>:failed` with a
`(rejected)` label, so it never hides a detected or previously saved binary that still
works and never overwrites the saved path. Adding a working executable for a kind that
previously had a rejected attempt clears that attempt.

**The scene model is a file, not a capability.** The TransNetV2 detector needs one ONNX
model, and one model serves every project. `PUT /api/settings/scene-model` stores a single
absolute, existing path in `AppSettings.scene_model`, or clears it when the body is `null`
or empty; it is refused and never written when the path is relative or the file is missing,
because the engine treats an explicit path that does not exist as an error rather than a
hint. `launch` writes the stored path into the materialised
`sequences.scene_detector.method.TransNetV2.model_path` only when the project leaves that
field null, so a project that pins its own model keeps it. The path is never copied into
`project.json`, it is not an executable family, and it does not change the preflight count
or any capability's availability.

On startup the service reads `custom_tools`, re-probes every saved path, and only then
starts serving. A saved executable that has since been moved or replaced appears as
unavailable under the same `custom:<kind>` id; it is retained, not silently dropped, so the
user can correct or remove it. The settings file is read and written as a JSON object, so
unrelated settings keys survive this phase's writes.

## The Python language server is an enhancement, never a dependency

`GET /api/editor/language-server` reports the server the editor would start: a
`pyright-langserver` on `PATH` first, because an install the user made on purpose should not
be overridden, then the bundled Jedi, then `jedi-language-server`, then `pylsp`. A `PATH`
probe only checks that a file exists; it never starts the server, so opening the script page
does not wait on a slow server. The response also names a temporary workspace under the OS
temp directory, where `condor_data.pyi` is rewritten from the same generator the runner
uses.

The bundle is what makes IntelliSense work on a machine with no developer tooling, and the
staged bundled Python extends that to a machine with no system Python at all. `rust/crates/service/assets/python-lsp.lock` pins the versions, wheel URLs, and SHA-256
digests of Jedi, parso, pygls, and their dependencies; `rust/crates/service/build.rs` runs
`scripts/vendor-python-lsp.mjs` before the crate compiles, and that script verifies each
wheel against the lock and writes the deterministic archive the binary embeds with
`include_bytes!`. No archive is committed — a review reads a text diff, and a later CI job
produces the same bytes by building the crate. Wheels are cached under the build
directory, so only the first build of a target directory downloads anything, and
`AV1ATION_PYTHON_LSP_ZIP` supplies an archive produced elsewhere to keep an offline build
off the network. `lsp_bundle` unpacks the archive once into
`<app-data>/python-lsp/<bundle version>` and runs it as
`<interpreter> -c "from jedi_language_server.cli import cli; cli()"` with that directory
first on `PYTHONPATH`, ahead of any inherited value. The entry function is called directly
because the wheel ships no `__main__.py`. Extraction writes a staging tree and renames it
into place, and the version in the directory name is the marker, so a changed bundle never
reuses a stale one. Every distribution keeps its `dist-info` directory, so its license
travels with the code; bumping a pin means editing the lock, refreshing it with
`--refresh-lock`, and bumping `lsp_bundle::VERSION`.

Packages belong to an interpreter, so a venv or a second install is invisible to every
server until `python_interpreter` names its executable. Settings → Dependencies stores that
path through `PUT /api/settings/python-interpreter`, which accepts only an absolute path to
an existing file and keeps a path whose environment is not mounted right now; `null`
clears it.

With no setting the service resolves the interpreter itself, in the order an editor
extension uses: the environment `VIRTUAL_ENV` names, then `CONDA_PREFIX`, then `python`
before `python3` on `PATH` (reversed elsewhere, because on Windows `python3` is usually the
Store alias), then the installs the Windows launcher reports through `py -0p`, then the
staged bundled Python at `<tools-dir>/python`. Every candidate is confirmed by asking it for
a version, so an App Execution Alias that opens the Store is skipped instead of forwarded.
The bundled runtime is last on purpose: a user's own `pip` packages live in their system
Python and must not be hidden behind the bundle. On a clean install it is the only
candidate, and the vendored Jedi therefore starts with nothing installed. The inventory
reports the interpreter the editor will forward — the setting, or that resolved one — with
the version it answered within a five-second deadline and the rule that chose it as
`interpreter_source` (`setting`, `path`, `virtual_env`, `conda_prefix`, `launcher`,
`bundled`). Resolving a default
is what keeps the families from each making a different guess: Pyright reads `PATH`, and
jedi and pylsp analyse the environment they were installed into. The bundled Jedi needs no
forwarding to land in the right environment, because that interpreter is the one that
starts it; the editor's initialization options still name it so a `PATH` server agrees.

`GET /api/editor/interpreters` lists what the picker offers: the saved setting first, then
`VIRTUAL_ENV`, `CONDA_PREFIX`, `python`/`python3` on `PATH`, the installs the Windows
launcher reports through `py -0p`, and finally the staged bundled Python. Each candidate is
run once for its version and the `sys.executable` behind any alias, so one install is listed
once and an entry the service could not confirm is left out. A saved path is listed even
when it no longer answers, because hiding it would move the user to a different environment
silently. The bundled entry is only present when `<tools-dir>/python` exists; a build with
no staged tree does not offer an interpreter it cannot run.

The editor forwards that interpreter in each family's own place: `python.pythonPath` answered
over `workspace/configuration` for Pyright, `workspace.environmentPath` in Jedi's
initialization options, and `plugins.jedi.environment` inside the `pylsp` settings tree,
which pylsp is given both as an initialization option and as a `didChangeConfiguration`
notification because it does not ask the client for configuration. When nothing resolves at
all the editor sends nothing and a server falls back to the `python` its own environment
resolves.
That stub's document classes are rendered from the engine models' `JsonSchema`, so the
editor completes a field only when the engine serialises it. They are grouped under one
`cd.types` namespace — `types.sequence`, `types.data`, and `types.encoder` — and nested
inside the class that references them, while the module level lists only the values a
script reads. That keeps `cd.sequence_config` distinct from the type it carries: a script
typing `cd.SequenceConfig` finds no such value.

`GET /api/editor/lsp` upgrades to a WebSocket and owns one child process for the life of
the socket. The bridge converts one JSON message per frame to LSP's `Content-Length`
framing on the child's stdio, forwards every frame without interpreting it, and kills the
child when the socket closes. Frames that are not JSON objects are dropped rather than
written, because one bad frame would desynchronise the stream. The LAN listener accepts
the same one-use ticket as the event stream for this route, since a browser cannot attach
the bearer header to a WebSocket; the ticket is consumed on upgrade, so the URL cannot be
replayed.

Absence is not a failure: when no server can run — no Python 3.10 or newer, no staged
runtime, a read-only app-data directory — the editor keeps its bundled completion tables and
the inventory says why. Nothing is downloaded at run time and nothing is installed on the
machine; both bundles are build artifacts of this repository. `--tools-dir` names the
staged tree for the headless binary, and the desktop host passes its resolved
`<resource>/tools`; neither path is derived from the manifest directory or the working
directory.

`DELETE /api/preflight/custom/:id` removes a custom row and restores the detected row in
its original position. `id` is the full `custom:<kind>` or `custom:<kind>:failed` value
returned by the probe. Removing an accepted row updates `config.json` first; a failed
write leaves both the file and the cache unchanged. Every custom check is a file probe
with a short timeout, so the route is cheap enough to run on demand and is never called
from a render.
