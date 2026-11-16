# Packaging and the bundled toolchain

**Scope:** the Phase 5 packaging contract. It specifies the bundle each installer carries,
the provider rules, and the release gate. Current delivery status lives in
[progress.md](progress.md). Release channels, unsigned distribution, and the updater policy
are owned by [releases.md](releases.md).

Every target stages the full provider set. `npm run stage:tools` accepts either a staged
`tools/` tree or a target directory produced by `npm run toolchain:build` and requires the
encoders, FFmpeg, MKVToolNix, the scene model, VapourSynth/Python and the native metrics.
The pinned lock, verifier, and installers are part of this contract. A normal development
build uses the machine's toolchain unless a staged tree is supplied.

Each release installs one toolchain per target under the application's resource directory.
Nothing is downloaded, resolved, or installed at run time, and no binary is committed to Git:
each target's bundle is assembled from pinned inputs by a build script that CI runs. The only
toolchain configuration written at runtime is the macOS/Linux VSScript config under app data
(§2); it is not a tool install and not a user-config change.

## Contents

- [1. What ships](#1-what-ships)
- [2. Layout](#2-layout)
- [3. Choosing a provider](#3-choosing-a-provider)
- [4. Manifest and lock](#4-manifest-and-lock)
- [5. CI](#5-ci)
- [6. Transparency](#6-transparency)
- [7. Platforms](#7-platforms)
- [8. Size and installer shape](#8-size-and-installer-shape)
- [9. Licence positions](#9-licence-positions)
- [10. Rejected and out of scope](#10-rejected-and-out-of-scope)
- [11. Phase 5 gates](#11-phase-5-gates)

## 1. What ships

| Bundle id | Contents | Provides | Licence |
| --- | --- | --- | --- |
| `vapoursynth` | CPython 3.14.10 (exact patch pinned in the lock) from python-build-standalone (`install_only`) for the target; the official VapourSynth core and VSScript R82; the target's `cp312-abi3` VapourSynth wheel; the ffms2 VapourSynth source plugin from the vs-wheels index (distinct from native FFMS2), `vszip`, and `vsjetpack` 3.0.0 with `full`, `gpu`, `cl` and `vulkan` and every wheel those pull for that target | the interpreter VSScript initialises and the script editor can fall back to; `Input::VapourSynth`, `Input::VapourSynthScript`, noise detection; source plugins, filters, VS-side metrics, and the `vstools`/`vskernels`/… imports a script expects | LGPL-3.0, PSF-2.0, and each plugin's licence identifier in the manifest |
| `ffms2` | the native FFMS2 library (`ffms2.dll`, `libffms2.dylib` or `libffms2.so`) the engine loads directly | native `Input::Video` | GPL-compatible; licence identifier in the manifest |
| `encoder:aom` | the target's `aomenc` built from the pinned libaom source | `EncoderBase::Aom` | BSD-3-Clause |
| `encoder:svt-av1` | the target's `SvtAv1EncApp` built from the pinned SVT-AV1 source | `EncoderBase::SvtAv1` | BSD-3-Clause-Clear |
| `encoder:rav1e` | the target's `rav1e` | `EncoderBase::Rav1e` | BSD-2-Clause |
| `encoder:vpx` | the target's `vpxenc` built from the pinned libvpx source | `EncoderBase::Vpx` | BSD-3-Clause |
| `encoder:avm` | the target's `avmenc` built from the pinned libavm source | `EncoderBase::Avm` | BSD-3-Clause |
| `encoder:x264` | the target's `x264` | `EncoderBase::X264` | GPL-2.0-or-later |
| `encoder:x265` | the target's `x265` | `EncoderBase::X265` | GPL-2.0 |
| `encoder:vvenc` | the target's `vvencapp` built from the pinned VVenC source | `EncoderBase::Vvenc` | BSD-3-Clause-Clear |
| `ffmpeg` | an LGPL FFmpeg build for the target from the pinned source, with autodetection disabled and no `--enable-gpl`, `--enable-nonfree`; muxing does not depend on the separately built encoder or metric libraries | muxing, concatenation, `EncoderBase::FFmpeg` | LGPL-2.1-or-later |
| `mkvmerge` | MKVToolNix for the target; on Windows, the executable and its MSYS2/Qt runtime DLL closure | the muxing fallback | GPL-2.0 |
| `scene-model` | `transnetv2.onnx`, exported in CI from the official MIT weights with a pinned exporter | TransNetV2 scene detection | MIT |
| `metric:libvmaf` | the target's `libvmaf` with its built-in VMAF models | `QualityMetric::VMAF` | BSD-2-Clause-Patent |
| `metric:libvship` | the target's `libvship` built from the pinned source and exposed through the handler C API | SSIMULACRA2 / BUTTERAUGLI / CVVDP on a usable GPU | MIT |
| `metric:fmetrics` | `fmetrics.dll` on Windows, `libfmetrics.dylib` or `libfmetrics.so` on macOS/Linux, built from the pinned `BoatsMcGee/fmetrics` shared-library commit; the Windows portability patch applies only on Windows | CPU backend for SSIMULACRA2 / BUTTERAUGLI / CVVDP | Apache-2.0 |
| `msvc-runtime` | the app-local Visual C++ runtime DLLs the Windows binaries link | — | Microsoft redistributable terms |
| `python-lsp` | the embedded Jedi bundle, unpacked into app data on first use; host-independent Python | script-editor IntelliSense | mixed; see `rust/crates/service/assets/README.md` |

`msvc-runtime` and `python-lsp` are internal payloads, not source choices; every other row is
a capability the Dependencies screen can point at the bundle or the machine. The OS webview
is not a bundle id: Windows uses WebView2, macOS WKWebView, and Linux WebKitGTK 4.1. Those
are platform dependencies, never staged under `<resources>/tools` and never selected in the
Dependencies screen.

A row is present only for a target that has an artefact. A component with no artefact for a
target omits that target's entry; the verifier treats the omission as **not provided**, not
as an error, and the Dependencies screen offers System only for that row.

Every upstream artefact above is pinned by version **and** content hash. `metric:libvship` is
built from its pinned source because its Codeberg releases are not a stable, machine-readable
wheel channel. The build must expose the handler C API (`Vship_InitHandler`,
`Vship_ComputeHandler`, `Vship_Reset`); 5.1.1 is the oldest version that does. A library that
loads but reports an incompatible API is rejected, which leaves the perceptual metrics on
fmetrics.

The Python pin is 3.14 because that is the version VapourSynth targets, not because it is
the newest. R82's module is `cp312-abi3` with `requires-python >=3.12` and no upper bound,
and PyPI publishes it for Windows x64, Linux x86_64 (`manylinux_2_27`/`manylinux_2_28`) and
macOS 13+ arm64 and x64. The recipe installs the target wheel into the pinned interpreter.
Upstream's installation guide names 3.12 and later, including 3.14. `vsjetpack` 3.0.0
requires Python 3.13 or newer and is installed with `--extra-index-url` pointing at the
vs-wheels simple index as well as PyPI.

`vsjetpack` is pure Python, but its extras are not: their native wheels do not cover every
target equally. Windows x64 and Linux x86_64 carry the complete `full`, `gpu`, `cl` and
`vulkan` set. macOS arm64 carries it; macOS x64 has no `hysteresis`, `mlrt-ncnn` or
`vs-placebo` wheel in 3.0.0, so the recipe builds those from the pinned sources. The lock and
About row name any omission rather than claiming a plugin that is not there. The clean-VM
stage test (5.24) imports the target's plugin set on this pin before an installer is
approved; a plugin wheel that does not publish a 3.14 build is the one input that can move
the pin back, and it must be recorded in the lock. The extra also pulls
`vapoursynth-bm3dcpu`, whose DLL targets the retired VapourSynth API 3 and is refused by R82;
the `vapoursynth-bm3d` wheel in the same extra supplies the `bm3d` namespace, so the
capability is present and the inert DLL is only dead weight.

Not bundled: a Node runtime or Pyright, CUDA/TensorRT/ROCm libraries, the
`vsjetpack[nvidia]` and `[amd]` extras, GPU drivers, Vulkan or DirectML runtimes shipped by
the OS/driver, and the OS webview.

`metric:fmetrics` is bundled but built rather than downloaded. Upstream emits only the static
`libfmetrics.a`, so the lock pins the shared-library commit in `BoatsMcGee/fmetrics` for every
target; on Windows it also carries the `fcvvdp` portability patch (§4.2). A machine without a
Vulkan-capable driver or with an unsupported GPU still runs; only the features that need that
device report unavailable, as the capability rules in [preflight.md](preflight.md)
already require.

## 2. Layout

```
<resource directory>/
  tools/
    python/                  # python-build-standalone install_only
      # Windows: python.exe, python3.dll, Lib/site-packages/
      # macOS/Linux: bin/python3, lib/python3.14/site-packages/
      #              libpython3.14.dylib or libpython3.14.so
      ...
        vapoursynth/         # the R82 wheel, including the platform VSScript library
        vapoursynth/plugins/ # ffms2, vszip, vship
        vsjetpack/ vstools/ …# vsjetpack and its target's dependencies
    bin/                     # aomenc, SvtAv1EncApp, rav1e, vpxenc, avmenc,
                             # x264, x265, vvencapp, ffmpeg, mkvmerge
                             # (.exe only on Windows), plus mkvmerge's
                             # Windows runtime DLL closure beside it
    lib/                     # libvmaf, libvship, fmetrics.dll / libfmetrics.*
    model/transnetv2.onnx
    vcruntime/               # Windows only: the app-local MSVC runtime DLLs
```

Every staging tree contains the full provider set; a row with no staged artefact is served by
System, never by a placeholder file. Linux staging copies the ELF closure of
`bin/` into `lib/` and writes `$ORIGIN` rpaths on the binaries and those libraries, because
Debian's `ffmpeg`, `mkvmerge` and `aomenc` do not run without their distribution libraries;
`patchelf` is therefore required for a Linux staging run. `lib/` then carries runtime
libraries as well as any metric libraries the tree includes.

On macOS/Linux the service also owns `<app-data>/vapoursynth/vapoursynth.toml`, written on
startup from the resolved library and interpreter paths and rewritten when those paths
change; it is generated state, not a shipped file.

The desktop host resolves the resource directory through Tauri and passes
`<resource>/tools` to the service. The headless binary takes `--tools-dir`; tests pass none,
which leaves the system providers in charge. `CARGO_MANIFEST_DIR` and `current_dir()` are
never used to find a tool (AGENTS.md §2.5).

A development host uses the same resolver. `tauri dev` reads `AV1ATION_TOOLS_DIR`; `npm run
dev` points it at `dist/dev-tools`, the persistent cache. `npm run dev:tools` copies the
release-staged `dist/tools` tree by default and resolves links, so a hand-staged `python/`
junction cannot leave the cache dependent on a machine-wide interpreter. `dist/dev-tools/`
therefore mirrors the release tree;
a full Python installation carrying excluded GPU packages is not a valid dev cache. The
headless binary accepts the same variable or `--tools-dir`. The directory is the same
`tools/` tree a release installs, so the VapourSynth layout, toolbin links and metric
environment are exercised exactly as in a packaged build. Nothing is installed system-wide
and no binary is committed; the cache is ignored and `cargo clean` leaves it alone. Stop
`npm run dev` before restaging, because Windows will not replace a DLL the running app has
loaded.

The base Tauri configuration maps only the frontend. The `run-tauri` wrapper generates a
release configuration that adds the `dist/tools` mapping; development therefore does not
copy a second tools tree into the Cargo target.


**The VapourSynth layout is load-bearing, and its probe is platform-specific.** On Windows,
VSScript finds its Python by walking four parent directories up from `vsscript.dll` and
looking for `python.exe` and `python3.dll`. With the module at
`tools/python/Lib/site-packages/vapoursynth/vsscript.dll`, those four parents are
`tools/python`, which is exactly where the bundled interpreter lives.

On macOS and Linux there is no four-directory `python.exe` probe. VSScript is
`libvsscript.dylib` or `libvsscript.so`, the interpreter is `tools/python/bin/python3`, and
`libpython3.14.dylib`/`.so` sits in `tools/python/lib`. The wheel's `vapoursynth config`
command records that interpreter and library in a TOML file keyed by the VSScript library
path; VSScript reads it from `$XDG_CONFIG_HOME/vapoursynth/vapoursynth.toml`. That path is
absolute, so a config generated in the staging directory is wrong after installation. The
service writes the same entries on startup to
`<app-data>/vapoursynth/vapoursynth.toml`, using the resolved `libvsscript`, `python3` and
`libpython` paths, and rewrites the file when an entry changes. It sets
`XDG_CONFIG_HOME` to `<app-data>` before loading VSScript. The
host also sets `VSSCRIPT_PATH` to the selected platform library and the loader path to
`tools/python/lib`, or the staged library carries an `@loader_path`/`$ORIGIN` reference. The
Jedi child receives the same `tools/python/bin/python3`; the script editor's interpreter
discovery already accepts that shape.

On every target the bundle uses a full CPython tree, never the embeddable ZIP: Windows needs
`python3.dll` in the shape VSScript probes, and macOS/Linux need `bin/python3`, `libpython`
and `site-packages` in the layout the module and the editor load. The bundle ships no
`Scripts/*.exe` and never runs `vapoursynth register-install` or `register-legacy-install`.
It never writes the user's VapourSynth configuration: Windows uses the implicit layout and
macOS/Linux use the app-data TOML, so neither touches `%APPDATA%\vapoursynth` or
`~/.config/vapoursynth`.
VSScript initialisation is once per process, so a layout mistake is a restart, not a retry;
CI asserts the target's staged probe reports a core version before an installer is built.

The R82 `VapourSynth64-Portable-R82.zip` is Windows-only and is not a Python runtime: it
carries documentation, the `vspipe.bat`/`pip.bat` helpers, and
`wheel/vapoursynth-82-cp312-abi3-win_amd64.whl`. The Windows recipe takes that wheel and
installs it into the pinned CPython; the bundle never runs the zip's helpers or looks for
the `python.exe` they expect beside them. Windows is self-configuring because the wheel sees
`python.exe` and `python3.dll` four directories above it. The wheel ships `.pdb` files beside
its DLLs, so Windows staging deletes them before the tree is hashed and packaged — the verify
gate rejects debug symbols in shipped output. macOS and Linux install the equivalent target
wheel from PyPI and generate the app-data TOML described above; the portable ZIP is never
used there.

`tools/bin` is not added to the user's `PATH`. At startup the service creates
`<app-data>/toolbin` and puts it first on the process `PATH`; it contains a hard link (copy
when the volumes differ) to the selected `ffmpeg` and `mkvmerge`. On Windows the bundled
`mkvmerge` also brings its sibling DLL closure into that directory: the link changes the
directory the loader searches, so the DLLs staged beside `tools/bin/mkvmerge.exe` have to be
beside the link too. Choosing System removes both the link and those runtime DLLs. The engine
resolves both programs with `which`, so replacing a link takes effect on the next use without
restarting. Encoders do not need the directory: the launcher materialises the selected
absolute executable into the run's encoder document. Names lose `.exe` off Windows, and no
script assumes a Windows extension.

For a bundled choice the service sets `VSSCRIPT_PATH` to the selected `vsscript.dll`,
`libvsscript.dylib` or `libvsscript.so`, `VMAF_LIB_DIR`, `FMETRICS_LIB_DIR`, `VSHIP_LIB_DIR` and
`VSHIP_PLUGIN_PATH` to `tools/lib` for the libraries the target stages, and
`TRANSNETV2_MODEL_PATH` to `tools/model/transnetv2.onnx` (a project that pins `model_path`,
or a saved `scene_model`, still wins). It does not rely on environment variables for Python:
on Windows VSScript finds the interpreter through the layout above, and on macOS/Linux the
host supplies the interpreter path and the loader path. The Jedi child keeps receiving the
selected interpreter exactly as [preflight.md](preflight.md#the-python-language-server-is-an-enhancement-never-a-dependency) describes.

## 3. Choosing a provider

Selection is per capability, not one global switch. `AppSettings.tool_sources` is a map from
the bundle id to `"bundled"` or `"system"`:

```json
"tool_sources": {
  "vapoursynth": "system",
  "encoder:svt-av1": "bundled",
  "ffmpeg": "system",
  "mkvmerge": "bundled",
  "metrics": "bundled"
}
```

The rules:

- An absent key means **auto**: the bundled provider when it is present and healthy,
  otherwise the system provider. A new install therefore uses the bundle with no setup.
- A saved accepted path in `AppSettings.custom_tools` beats both for its family, as it does
  today; removing the custom path restores the map's choice.
- `vapoursynth` is one unit: core, VSScript, the bundled Python, the plugin directory and
  vsjetpack travel together. A mixed core/plugin or core/Python selection is not offered,
  because VSScript loads one CPython and plugins are built against one core API. It therefore
  appears as one row in the Dependencies screen and one source choice, even though its staged
  tree contains wheels and binaries separately. The unit is the target's own; another target's
  Python or plugins are never substituted.
- Everything else is independent. System VapourSynth with bundled encoders, FFmpeg and
  mkvmerge is a supported combination, and so is the reverse. The dependencies screen must
  not disable one row because another is system.
- `metrics` is one unit because `tools/lib` is one directory and the native libraries
  initialise once per process. Every metric row that has a native backend offers the same
  choice; `metric:xpsnr` does not, because it comes from the VapourSynth plugin directory
  rather than `tools/lib`.
- The scene model is not a source choice: the bundle carries the ONNX file, and the existing
  `AppSettings.scene_model` path still overrides it, with the engine's search as the last
  resort. A “system model” would have no installation to discover.
- Changing the VapourSynth or metric source requires an application restart. The setting is
  written immediately and the screen says a restart is needed; VSScript and the native metric
  libraries initialise once per process, and the alternative is a second process, which the in-process service
  rejects. Encoder, FFmpeg and mkvmerge changes apply on the next use. The model is not a
  source choice.
- The Python interpreter setting remains separate. The bundled Python appears in the
  interpreter picker as `Bundled · Python 3.14.10 — <resource>/tools/python/python.exe` on
  Windows, or `<resource>/tools/python/bin/python3` on macOS/Linux, and is used by the
  bundled VapourSynth runtime. Discovery appends it after the system candidates, so it is
  the automatic fallback on a clean install; a user who wants their own pip packages still
  chooses their interpreter, exactly as today.
- A target with no artefact for a bundle id never enables a Bundled choice that resolves to
  nothing; the Bundled card stays visible but disabled, and System remains selectable.

Preflight reports the selected provider and the alternatives. A row gains a `providers`
list (`source`, `available`, `detail`, `active`, and `checked`), a `selected_source` and a
`configured_source`; the row's `detail` remains the engine's version report, and each
provider carries its own observed detail. The non-selected VapourSynth
runtime is reported as unchecked rather than counted as available; selecting it and
restarting is what probes it. Two VSScript libraries and two CPythons cannot share one
process, so the service never loads both to compare them. The System alternatives for
FFmpeg and MKVToolNix are unchecked while the bundled link is active, because the engine's
PATH probe would otherwise report that link as the machine's installation. A metric row is
active on the bundle only when its own library is staged, even though `metrics` is one
saved choice; the others keep loading from the system installation. While a bundled metric
library is loaded, that row's System alternative is unchecked too, because the loader
caches the library it opened. Custom rows keep their `custom:<kind>` ids and existing
add/remove rules.

The Dependencies screen renders the source control on every row whose capability has a
bundled resolver: VapourSynth, each encoder family, FFmpeg, MKVToolNix, and every metric
with a native backend. It offers **Bundled** (with the staged path or version) beside
**System** (with the probed version), while the existing **Locate…** action remains the
escape hatch for executable families and a custom path still wins. The row shows the source
this process resolves; a VapourSynth or metric source that has not been active yet is
labelled as needing a restart, with a **Restart now** action in the desktop host. The
scene-model row never gains the control, because the bundle carries one file and a
`scene_model` path already overrides it. The header's one-line summary names the toolchain
revision and the installed size.

## 4. Manifest and lock

Two checked-in files and a recipe directory produce the bundle:

| Path | Role |
| --- | --- |
| `packaging/toolchain.json` | reviewed bill of materials: component id, upstream version, licence identifier, source ref, build recipe, `provides`, install path. |
| `packaging/toolchain.lock.json` | generated resolution for every target: provenance URL, SHA-256, size, install path, the file list for directory artifacts, and a target-tree digest covering staged runtime files. Never edited by hand. |
| `packaging/recipes/` | one script per source-built component, plus patches; it names the compiler/toolchain and the configure/CMake arguments. |
| `packaging/schema/` | the JSON Schema for the manifest and lock; the verifier implements the review checks directly. |

`packaging/toolchain.json` names intent, not bytes:

```json
{
  "schema_version": 1,
  "revision": "2026.11.0",
  "components": [
    {
      "id": "encoder:svt-av1",
      "version": "4.3.0",
      "license": "BSD-3-Clause-Clear",
      "provides": ["encode:svt-av1"],
      "source": {
        "kind": "git",
        "url": "https://github.com/AOMediaCodec/SVT-AV1",
        "tag": "v4.3.0",
        "commit": "<40-hex>"
      },
      "build": { "recipe": "packaging/recipes/svt-av1.ps1", "toolchain": "vs2022-17.14" },
      "artifacts": {
        "x86_64-pc-windows-msvc": { "install": "tools/bin/SvtAv1EncApp.exe" },
        "aarch64-apple-darwin": { "install": "tools/bin/SvtAv1EncApp" },
        "x86_64-apple-darwin": { "install": "tools/bin/SvtAv1EncApp" },
        "x86_64-unknown-linux-gnu": { "install": "tools/bin/SvtAv1EncApp" }
      }
    },
    {
      "id": "vapoursynth",
      "version": "R82",
      "license": "LGPL-3.0",
      "provides": ["decode:vapoursynth"],
      "source": {
        "kind": "pypi",
        "project": "vapoursynth",
        "version": "82"
      },
      "artifacts": {
        "x86_64-pc-windows-msvc": {
          "install": "tools/python/Lib/site-packages/vapoursynth"
        },
        "aarch64-apple-darwin": {
          "install": "tools/python/lib/python3.14/site-packages/vapoursynth"
        },
        "x86_64-apple-darwin": {
          "install": "tools/python/lib/python3.14/site-packages/vapoursynth"
        },
        "x86_64-unknown-linux-gnu": {
          "install": "tools/python/lib/python3.14/site-packages/vapoursynth"
        }
      }
    }
  ]
}
```

A target missing from a component's `artifacts` map is not provided there; it is not an
error. The lock adds the bytes actually present in each target's built tree: the provenance
URL, SHA-256, size, install path, the file list for a directory artifact, and a digest of the
whole target tree so runtime files staged beside an executable are pinned too. The manifest
pins the source revision or downloaded input; the lock pins the built output. The build reads
**only the lock**. It never lets a release's “latest” page or a branch decide what is built.
A GitHub release asset is mutable, so the hash in the lock is the pin even when the tag is
immutable.

### 4.1 Updating

1. Edit `toolchain.json` (version, source ref, recipe).
2. Build each target with `npm run toolchain:build -- --target <triple>` (or let
   `toolchain.yml` do it). It writes `dist/cargo/toolchain/<target>/` and must contain every
   path claimed by that target's `artifacts` map.
3. Run `npm run toolchain:lock` (or `npm run toolchain:lock -- --from <directory>`). It hashes
   the actual files, records the manifest's immutable source references, and writes the lock.
   It refuses to write unless all four target directories and every claimed artifact exist,
   each artifact is non-empty, and each target has no duplicate install path.
4. Review the lock diff as part of the pull request. The diff is the audit trail: a version
   change is a few lines, not a committed binary.
5. Run `npm run toolchain:verify`. It checks manifest shape, immutable source refs, unhashed
   artifacts, lock revision/hash agreement, all four targets, component
   version/licence/source agreement, install paths under `tools/`, and duplicate install
   paths. It does not inspect wheel tags, SPDX licence IDs, build-tool versions, patch
   ancestry, or provider semantics.

The staged Python environment is a directory artifact in each target's lock; pip's resolver
runs during the component build, pinned to `vapoursynth==82`, `vsjetpack==3.0.0` and
`vapoursynth-ffms2==5.4.0`. The lock records the bytes that result, not every wheel that pip
downloaded, so a future build must compare the lock's directory hash. The vs-wheels simple
index supplies a `#sha256` fragment for the directly fetched ffms2 wheel. `vsjetpack`
declares a hard dependency
on `vapoursynth-akarin`, which is an LGPL-3.0 plugin collection in the `akarin` namespace,
not a second core; the lock includes it where the target publishes it, and the official R82
wheel remains the only `vapoursynth` module. The wheel versions are reviewed once; changing
one changes the component cache key and the generated directory hash in the lock.

A pure-Python meta-package is not evidence that its native dependencies exist on a target.
The lock records the staged file list and hashes per target. `toolchain:verify` checks the
install path against the manifest but cannot identify a wheel tag or prove which platform
produced a file; that selection belongs to the staging recipes and release review.
`vsjetpack` itself is `py3-none-any`; its extras are not, and a target whose required plugin
wheel is absent is recorded as an incomplete plugin set rather than silently filled from
another platform.

No `.env` participates in this. `.env`, `AV1ATION_TOOLCHAIN_CACHE` and
`AV1ATION_TOOLCHAIN_DIR` may point a local developer at a cache or a prepared tree; they
never name a version, and CI ignores them. A version in an environment variable is exactly
the kind of state that makes a release unreproducible.

### 4.2 Fork-built components

A component may be built from a fork only when the lock records the fork repository, the
full commit, the upstream base commit, and the SHA-256 of every patch. `fmetrics` is the
first: upstream `halidecx/fmetrics` emits only the static `libfmetrics.a`, and its `fcvvdp`
dependency calls POSIX-only `sysconf()`, so the bundle uses `BoatsMcGee/fmetrics` at
`ae87c8e5607063f0dcc8241b52cb143f6c9ad4ac`, based on upstream
`e8bf3cfe06fb78f51864804b2f7003667d4c5a71`. This follows the recipe the Av1an Windows
release CI uses, not a locally invented one.

The recipe pins Zig 0.16.0 (0.17 removed `b.build_root`, which the pinned `build.zig` uses),
runs `zig build --fetch`, then `zig build --release=fast -Dshared=true -Dstrip=true`, and
stages `zig-out/bin/fmetrics.dll`, `libfmetrics.dylib` or `libfmetrics.so` for the target.
The fork's shared-library build is used on every target; a Windows build that cannot produce
the shared library fails the component instead of falling back to the static archive. The
library sits beside the other native metrics and the service points the fmetrics, VMAF and
VSHIP loader hints at `tools/lib`.

The source offer and staging recipe record the fork commit, upstream base, patch hash, and
Zig version. `toolchain:verify` checks the manifest's source pin and lock agreement; it does
not establish ancestry, patch content, or the Zig version. If upstream merges both changes,
the component moves back to the official repository as a version bump, not as a new
exception.

## 5. CI

`toolchain.yml` validates the manifest and recipes on every run, plans the
component-by-target matrix, builds each component on its native runner, assembles one tree
per target, and verifies the committed lock against those built trees. It runs on manual
dispatch and on packaging changes to `main`, and is reusable by the tagged release workflow.

Every component has its own cache entry. The key is a SHA-256 of the target, the component's
canonical manifest entry, the recipe bytes, the shared recipe helper and the builder bytes.
The cache path is `dist/toolchain-cache/<target>/<component>`, so changing x264 cannot
invalidate aomenc, and a cache hit is a directory copy rather than a compile. The builder
writes the key into `component.json` only after verifying every artifact claimed by the
manifest; a stale or partial directory is rebuilt instead of trusted.

| Job | Runs | Gate |
| --- | --- | --- |
| `validate` | manifest shape, immutable source refs, recipe presence, recipe syntax | every push that touches packaging |
| `plan` | emit the component/target matrix and each component cache key | every run |
| `component` (matrix over every target and component) | build or restore one component; upload its cache directory | every toolchain run |
| `assemble` (matrix: `windows-2025`, `macos-15`, `macos-15-intel`, `ubuntu-24.04`) | merge the target's components, verify every claimed artifact, upload the target tree | after all components |
| `lock` | run `toolchain:lock --check` over the four target artifacts; fail on drift from the committed lock | after assembly |
| `package` | verify the target tree against the committed lock, stage it into `dist/tools`, build both Tauri variants, upload installers | manual dispatch with `package`; the committed lock is the only packaging input |

The component job is a matrix, not one job that builds a whole target on one runner. Each
leg restores only its own cache directory; the Windows leg runs on `windows-2025`; the macOS
legs are native thin builds (`macos-15` arm64 and `macos-15-intel` x64), never a universal
binary; Linux builds on `ubuntu-24.04`, not `ubuntu-latest`, so the glibc floor does not
drift with the runner image. The engine's prebuilt ONNX Runtime requires glibc 2.38; the
Ubuntu 24.04 artifact emits GLIBC_2.39, so the effective floor is 2.39.

`toolchain:verify` remains fail-closed: it does not accept a target tree in place of the
lock. The workflow never uploads or substitutes a lock generated in the same run; it checks
the committed lock against every assembled tree, and each package leg checks its own target
tree with `toolchain:lock --target <triple> --check`. A release workflow consumes the target
artifacts only after those checks pass.

Certificate-based code signing is **not planned**. The manual package job produces unsigned artifacts on
Windows and Linux. On macOS, every nested Mach-O — `python3`, `libpython`, `libvsscript`,
ffms2, the metric libraries, VapourSynth plugins and extension modules — is ad-hoc signed
inside-out before the `.app`; it is not notarised. `codesign --deep` is not a substitute for
signing inside-out. On Linux the recipes strip symbols and publish the ELF files with their
SONAME/rpath intact; the `.deb` declares its WebKitGTK dependency and the AppImage is built
on the baseline image.

The project will not obtain code-signing certificates. It therefore follows
[releases.md](releases.md): Windows and Linux artifacts are unsigned, macOS artifacts are
ad-hoc signed and not notarised, and every release says so. The updater signature is a
separate minisign key and does not make the installer trusted by the operating system. A
build is never described as signed or notarised when the corresponding signature is absent.

Reproducibility is a claim about inputs and recorded outputs, not a promise of bit-identical
binaries from every upstream build system. The lock pins every input per target; our recipes
record the compiler, SDK and flags; a release candidate rebuilds the source-built components
a second time on each target and compares hashes. A component that still differs carries
`"reproducible": false` with the reason, and the release notes list it. Third-party prebuilt
components are verified against their published digest and are not recompiled.

Each target's bundle is assembled under `dist/cargo/toolchain/<target>/`; it is ignored by Git
like the rest of `dist/`. CI uploads it as a content-addressed artefact and the release job
consumes the artefact for the same target. `git ls-files` is checked by `toolchain:verify`
for binary extensions and archive patterns, so an accidental `vendor/` commit fails before
review.

## 6. Transparency

A download page and an About screen are not an audit trail on their own. Each release
publishes, beside that target's installer:

- `toolchain.lock.json` — exactly what was built/downloaded for that target, with hashes.
- `THIRD_PARTY_NOTICES.md` — generated from the target's resolved component set, naming each
  component's licence identifier and source.
- `sbom.spdx.json` — the same components as an SPDX document, with the bundle revision and
  target triple.
- `SOURCE-OFFER.md` — for every GPL/LGPL component, the exact source revision, the recipe,
  the patches and where the corresponding source archive is published. For `fmetrics` it
  also names the fork commit, the upstream base and, on Windows, the portability patch.
- `SHA256SUMS` — for the installers, the target's toolchain archive and the notices.

`npm run release:audit -- --tag <tag>` generates the per-target audit directory from the
reviewed manifest and lock. It copies the target's lock unchanged and writes the notices,
SBOM and source offer; `release:preflight --audit-bundle` verifies it. The command refuses a
target that the lock does not resolve. Its notices and source offer cover the top-level
manifest components; the VapourSynth row's transitive Python/plugin notices and the fmetrics
upstream base remain publication gates.

The planned release bundle will embed a generated summary of the target's lock (id, version,
licence, source URL, artefact hash). **Not implemented yet:** `GET /api/toolchain` does not
exist, and Settings → About does not render a **Bundled toolchain** list. When built, the
route will return the summary without touching the filesystem, About will show the same rows
with a source link, and the public documentation site can serve the same JSON per target
without a live service. Settings → Dependencies already shows the selected source and version
per capability. One target's notices and SBOM do not stand in for another's.

Nothing in that summary contains a secret, a signing key, or a user path. Installed paths are
shown only in the local process's dependency rows.

## 7. Platforms

| Target | Release target | VapourSynth bundle |
| --- | --- | --- |
| Windows x64 (`x86_64-pc-windows-msvc`) | full bundle, primary, Windows 10/11 | bundled |
| macOS arm64 (`aarch64-apple-darwin`) | full bundle after 5.26, secondary | bundled after 5.26; System before |
| macOS x64 (`x86_64-apple-darwin`) | full bundle after 5.26, secondary | bundled after 5.26; System before |
| Linux x64 (`x86_64-unknown-linux-gnu`) | full bundle after 5.26, secondary | bundled after 5.26; System before |
| Windows arm64 (`aarch64-pc-windows-msvc`) | not supported | no wheel |
| Linux arm64 (`aarch64-unknown-linux-gnu`) | out of Phase 5; possible later with a reduced plugin set | wheel exists, plugin coverage is uneven |

Windows x64 is the first full bundle and the Phase 5 release gate. “Secondary” is a
build order, not a support tier: Phase 5 exits only with an installer for every listed
release target. R82 publishes wheels for all four of them, so VapourSynth is no longer the
reason the other targets wait; they wait on the relocation and signing gate in 5.26, not on
an artefact.

The macOS floor is **15.0**, because the vsjetpack plugin wheels are `macosx_15_0`; the
VapourSynth and Python wheels themselves still begin at `macosx_13_0`.
Tauri's default `minimumSystemVersion` is older; 5.22 raises it to 15.0. A Mac before 15
keeps **System** VapourSynth and says so; it cannot load the bundled plugin wheels. macOS installers
are thin (arm64 and x64), not universal: the Python, VapourSynth and plugin wheels are
architecture-specific, and a universal app would still need both trees.

The Linux floor is Ubuntu 24.04 / Debian 13. The engine's prebuilt ONNX Runtime requires
glibc 2.38, and the current Ubuntu 24.04 build emits GLIBC_2.39 symbols; the effective
artifact floor is therefore 2.39. Debian 12 and Ubuntu 22.04 cannot link this build. Both
supported distributions provide WebKitGTK 4.1. The `.deb` declares WebKitGTK and GTK; the
system variant also declares FFMS2. The AppImage is built on that baseline.
WebKitGTK is never copied into `<tools>`, and the app does not ask the user to install a
Python or VapourSynth runtime to make the webview work. Building on a newer image silently
raises the glibc floor, so the release job pins 24.04 rather than `ubuntu-latest`.

The other targets stage in this order:

1. Bundle the executable toolchain (encoders, FFmpeg, mkvmerge, model) and the native metric
   libraries; they are portable and do not need VapourSynth.
2. Bundle the VapourSynth runtime only after a relocation spike passes: on Linux a wheel in
   a staged Python tree with a verified `libpython` link and a runtime-generated
   `vapoursynth.toml`, on macOS the same with `install_name`/rpath rewriting and nested-code
   signing. The spike is a gate, not an assumption.
3. Until that gate passes, those platforms select **System** for `vapoursynth` and say so;
   the row never offers a bundle that is not there.

This is why the packaged Windows build does not wait on macOS ad-hoc signing of a Python tree.
The Phase 5 exit criterion is an installer for every target, each carrying the largest
toolchain it can prove: Windows complete, macOS and Linux complete once 5.26 passes and
otherwise the executable/metrics subset with System VapourSynth.

## 8. Size and installer shape

The bundle is installed by the normal installer for the target; there is no first-run
download and no separate package manager. The `full,gpu,cl,vulkan` plugin set is large
(OpenVINO, DirectML and Vulkan payloads dominate it), so task 5.25 measures each target's
compressed installer and installed size before the release candidate is approved. Sizes are
not shared between targets: a thin macOS build and a Linux AppImage have different contents
from the Windows bundle.

One installer per target is the default. If a target's measured compressed installer exceeds
2 GiB, the `scale` extra (OpenVINO) moves to an optional companion installer artefact built
from the same lock, still installed offline and still listed in the About screen. The core
bundle — Python, VapourSynth, plugins, encoders, FFmpeg, MKVToolNix, model, metrics — stays in
the main installer. A runtime download is never the fallback. A size decision for Windows does
not move a macOS or Linux component without its own measurement.

Local packaging writes each variant under `dist/release/<platform>/<variant>/`: installers
plus a portable artifact (a Windows ZIP, a zipped macOS `.app`, or the Linux AppImage), with
a per-variant `SHA256SUMS.txt`. `npm run release:build -- --tag <tag>` builds bundled and
system variants on the host, clears only that host's platform directory so another
platform's artifacts survive, and writes the aggregate checksum list at
`dist/release/SHA256SUMS.txt`, together with `RELEASE-NOTES.md` and `release-manifest.json`
for a manual GitHub release. The tag is required; a missing tag fails before any build and
never becomes an implicit stable release. It also
stages every uploadable file in the flat `dist/release/assets/` directory: each installer
or portable gets `-bundled` or `-system` inserted before its extension, `release-manifest`
rejects duplicate flat names, and `upload.asset_paths` lists only that one directory.
`SHA256SUMS-github.txt` uses those flat names; the aggregate `SHA256SUMS.txt` keeps the
platform and variant paths for local checks. The Cargo
`release/bundle/` tree and the expanded `dist/release/portable/` staging tree are
intermediate; remove them with `npm run clean:outputs` after the archives exist. `dist/tools`
is a staging input, not a release artifact.

## 9. Licence positions

The application is GPL-3.0 (A8). The bundle is compatible with it, but the obligations differ
by component and by target:

- **GPL executables.** `x265` and `mkvmerge` are GPL-2.0; `x264` is GPL-2.0-or-later. They are
  separate programs invoked over a command line, never linked into the application. The
  release ships their complete corresponding source (or a written offer) and the licence
  texts; the separate-program boundary is what keeps the GPL-2-only components distributable
  beside GPL-3 code.
- **LGPL FFmpeg.** The build uses `--disable-gpl --disable-nonfree --disable-autodetect`;
  VMAF is loaded directly from `libvmaf`, not through an FFmpeg filter.
  FFmpeg's licence text, the exact configure line and the source
  revision are published per target; x264/x265 encoding is provided by the standalone
  executables, not by linking them into FFmpeg.
- **Permissive components.** AV1/VP9/VVC encoders, libvmaf, libvship, TransNetV2 and Python
  keep their notices; the generated `THIRD_PARTY_NOTICES.md` is what the About screen links.
- **Apache-2.0 fmetrics.** The shared library is loaded at runtime, so its licence does not
  alter the application's GPL-3.0 terms. Its notice, fork commit, upstream base and the
  target's patch set are part of the source offer. The Windows portability patch is not
  claimed for macOS or Linux.
- **vsjetpack's GPL subtree.** `full` pulls `vapoursynth-mlrt-*` (GPL-3.0-or-later) and
  `vapoursynth-bestsource` (effectively GPL); these are compatible with the GPL-3.0
  application and their sources are part of the source offer. The `nvidia` and `amd` extras
  are excluded because they add proprietary CUDA/TensorRT/ROCm payloads and multiple
  gigabytes. A target's reduced plugin set is reflected in its notices; the release does not
  claim a plugin it does not ship.
- **System webview.** WebKitGTK and GTK on Linux, WKWebView on macOS and WebView2 on Windows
  are platform libraries, not entries in `<tools>`. The `.deb` declares the dependency; any
  library Tauri bundles into a target's artifact is enumerated in that artifact's notices.
- **Patents.** Copyright licences do not settle the HEVC, VVC or H.264 patent pools. The
  release owner records a patent position for the bundled `x265`/`vvenc`/`x264` binaries
  before the first public installer; AV1 is royalty-free under the AOMedia patent grant. This
  is a legal gate, not an engineering one.

## 10. Rejected and out of scope

- **System toolchain only.** The current first-run failure mode is the thing this removes;
  the preflight screen stays as the fallback for System choices, not as the setup story.
- **One `Bundled/System` switch for everything.** The requirement is any combination; a
  single switch cannot express it and would make the VapourSynth choice silently move FFmpeg.
- **Downloading tools on first run or updating them independently.** It needs a network,
  makes the shipped bytes differ from the audited bytes, and breaks offline use. Toolchain
  updates ride an application release.
- **An embeddable-Python ZIP.** Windows needs `python.exe` and `python3.dll` for VSScript's
  probe; macOS/Linux need `bin/python3` and a linkable `libpython`. The portable CPython tree
  is the layout upstream tests on every target.
- **One toolchain archive shared by every target.** Python, VapourSynth, plugins, encoders and
  metrics are native; a single archive would either ship unusable binaries or grow to four
  copies. The lock and staging tree are per target.
- **A universal macOS binary.** The Python, VapourSynth and plugin wheels are architecture-
  specific. Two thin installers are smaller and simpler than one bundle carrying both trees.
- **Bundling WebKitGTK under `<tools>`.** It is the OS webview and is not part of the
  VapourSynth/Python unit; the `.deb` dependency and the baseline AppImage are the supported
  route.
- **Writing the user's VapourSynth config.** Running `vapoursynth config` against
  `~/.config` would change a system install the user may rely on. The service writes its own
  TOML under app data and points `XDG_CONFIG_HOME` there.
- **Shipping a build-time `vapoursynth.toml`.** Its keys and interpreter paths are absolute;
  a file generated in the staging tree breaks when the app is installed elsewhere. Generate
  it at first use from the resolved paths.
- **Keeping macOS 13 or 14 as the minimum.** The vsjetpack plugin wheels are `macosx_15_0`; older Macs
  stay on System VapourSynth instead of receiving a bundle that cannot load.
- **Committing the bundle.** Binaries do not belong in Git; the manifest and lock are the
  reviewable source, and CI produces the bytes.
- **`.env` as the source of truth.** See §4.1; environment variables are local cache hints
  only.
- **Bundling Pyright/Node.** The vendoring rule rejects a second runtime; the Jedi bundle stays inside the
  service binary.
- **Building upstream `halidecx/fmetrics` unchanged.** It emits only a static library and
  its `fcvvdp` dependency calls POSIX-only `sysconf()`; the pinned `BoatsMcGee/fmetrics`
  commit supplies the shared target everywhere and the Windows patch where it is needed,
  and §4.2 records the delta.
- **Bundling the `nvidia`/`amd` vsjetpack extras.** Proprietary SDKs, multi-gigabyte
  payloads, and a GPU generation matrix that a bundled installer cannot meaningfully cover.
  A user may install them into the bundled Python as a custom environment.

## 11. Phase 5 gates

| Gate | Task | Pass condition |
| --- | --- | --- |
| Manifest and recipes exist for every target | 5.19 | `toolchain:verify` green; every claimed target has a source, licence, install path and lock entry; no floating ref |
| Windows bundle builds and installs | 5.20, 5.22 | the installer lands `<resources>/tools`; the service starts with only `--tools-dir`, every bundled row is available, and a fixture encode completes |
| macOS bundle is explicitly ad-hoc | 5.8, 5.20, 5.22, 5.26 | every nested Mach-O is ad-hoc signed with the hardened runtime, the `.app` passes `codesign --verify --deep --strict`, and the Gatekeeper override is documented; `spctl` rejection is expected without notarisation |
| Linux bundle builds and installs | 5.9, 5.20, 5.22, 5.26 | the `.deb` declares WebKitGTK; the system `.deb` also declares FFMS2, and the AppImage runs on the 24.04 baseline; the service starts with only `--tools-dir` and completes a fixture encode |
| Fork-built fmetrics reproduces | 5.20 | the shared library builds from the pinned fork commit on every claimed target, the upstream-base and target patch checks pass, and a metric probe loads it |
| Provider selection works | 5.21, 5.23 | the mixed matrix in [plan/05-ci.md](plan/05-ci.md#16-manual-release-test-plan) passes, including a restart-required VapourSynth switch |
| Clean-VM behaviour per target | 5.24 | a machine with no Python, VapourSynth or FFmpeg encodes with the bundle only; macOS is 15+, Linux has WebKitGTK 4.1 and no other toolchain |
| Transparency assets ship per target | 5.27 | that target's lock, notices, SPDX and source offer are attached to the release and rendered in About |
| Size is acceptable per target | 5.25 | each target's measured installer size is recorded; the companion-installer fallback is chosen separately where needed |
| VapourSynth relocation on macOS/Linux | 5.26 | a wheel-based staged tree with its runtime `vapoursynth.toml` probes and signs successfully after being moved, or those platforms stay System and say so |
| Minimum OS is declared | 5.22 | macOS `minimumSystemVersion` is 15.0; the Linux package states WebKitGTK 4.1 and the glibc baseline |
