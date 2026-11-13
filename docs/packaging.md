# Packaging and the bundled toolchain

**Scope:** the Phase 6 packaging contract. It specifies the bundle each installer carries,
the provider rules, and the release gate. Current delivery status lives in
[progress.md](progress.md).

The Windows x64 staging command is `npm run stage:tools`; it requires the full provider set.
On Linux the same command stages a **partial** tree with `--partial`: the encoders, FFmpeg,
MKVToolNix and scene model that the distribution provides, with VapourSynth/Python and the
native metrics left to System until the relocation and audit gates in §7 pass. The pinned
lock, verifier, and installers are part of this contract. A normal development build uses the
machine's toolchain unless a staged tree is supplied.

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
- [11. Phase 6 gates](#11-phase-6-gates)

## 1. What ships

| Bundle id | Contents | Provides | Licence |
| --- | --- | --- | --- |
| `vapoursynth` | CPython 3.14.10 (exact patch pinned in the lock) from python-build-standalone (`install_only`) for the target; the official VapourSynth core and VSScript R82; the target's `cp312-abi3` VapourSynth wheel; the ffms2 VapourSynth source plugin, `vszip`, the `vship` plugin where the target publishes it, and `vsjetpack` 2.2.6 with `full`, `gpu`, `cl` and `vulkan` and every wheel those pull for that target | the interpreter VSScript initialises and the script editor can fall back to; `Input::VapourSynth`, `Input::VapourSynthScript`, noise detection; source plugins, filters, VS-side metrics, and the `vstools`/`vskernels`/… imports a script expects | LGPL-3.0, PSF-2.0, and each plugin's SPDX identifier in the manifest |
| `ffms2` | the native FFMS2 library (`ffms2.dll`, `libffms2.dylib` or `libffms2.so`) the engine loads directly | native `Input::Video` | GPL-compatible; SPDX in the manifest |
| `encoder:aom` | the target's `aomenc` built from the pinned libaom source | `EncoderBase::Aom` | BSD-3-Clause |
| `encoder:svt-av1` | the target's `SvtAv1EncApp` built from the pinned SVT-AV1 source | `EncoderBase::SvtAv1` | BSD-3-Clause-Clear |
| `encoder:rav1e` | the target's `rav1e` | `EncoderBase::Rav1e` | BSD-2-Clause |
| `encoder:vpx` | the target's `vpxenc` built from the pinned libvpx source | `EncoderBase::Vpx` | BSD-3-Clause |
| `encoder:avm` | the target's `avmenc` built from the pinned libavm source | `EncoderBase::Avm` | BSD-3-Clause |
| `encoder:x264` | the target's `x264` | `EncoderBase::X264` | GPL-2.0-or-later |
| `encoder:x265` | the target's `x265` | `EncoderBase::X265` | GPL-2.0 |
| `encoder:vvenc` | the target's `vvencapp` built from the pinned VVenC source | `EncoderBase::Vvenc` | BSD-3-Clause-Clear |
| `ffmpeg` | an LGPL FFmpeg build for the target with `libvmaf`, libaom, libsvtav1 and libvpx enabled, and no `--enable-gpl`, `--enable-nonfree` | muxing, concatenation, the quality-check filter graph, `EncoderBase::FFmpeg` | LGPL-2.1-or-later |
| `mkvmerge` | MKVToolNix for the target | the muxing fallback | GPL-2.0 |
| `scene-model` | `transnetv2.onnx`, exported in CI from the official MIT weights with a pinned exporter | TransNetV2 scene detection | MIT |
| `metric:libvmaf` | the target's `libvmaf` and the model JSON files | `QualityMetric::VMAF` | BSD-2-Clause-Patent |
| `metric:libvship` | the target's `libvship` where a pinned, audited build exists | SSIMULACRA2 / BUTTERAUGLI / CVVDP on a usable GPU | MIT |
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

Every upstream artefact above is pinned by version **and** content hash. “A pinned, audited
build exists” is deliberate for `metric:libvship`: its releases are not yet published from a
stable, machine-readable channel with checksums. Until one is pinned, the row offers the
system provider; the bundle does not pretend to contain it. A staged build must expose the
handler C API (`Vship_InitHandler`, `Vship_ComputeHandler`, `Vship_Reset`); 5.1.1 is the
oldest version that does. An older plugin can load and still be rejected as incompatible,
which leaves the perceptual metrics on fmetrics.

The Python pin is 3.14 because that is the version VapourSynth targets, not because it is
the newest. R82's module is `cp312-abi3` with `requires-python >=3.12` and no upper bound,
and PyPI publishes it for Windows x64, Linux x86_64 (`manylinux_2_27`/`manylinux_2_28`) and
macOS 13+ arm64 and x64. The Windows recipe takes the wheel from the portable ZIP; macOS and
Linux install the target wheel from PyPI. Upstream's installation guide names 3.12 and later,
including 3.14. `vsjetpack` 2.2.6 declares 3.12–3.14.

`vsjetpack` is pure Python, but its extras are not: their native wheels do not cover every
target equally. Windows x64 carries the complete `full`, `gpu`, `cl` and `vulkan` set. macOS
and Linux bundle every plugin wheel published for that target, and the lock and About row
name any omission rather than claiming a plugin that is not there. The clean-VM stage test
(6.20) installs the target's extra set and imports its plugins on this pin before an
installer is approved; a plugin wheel that does not publish a 3.14 build is the one input
that can move the pin back, and it must be recorded in the lock. The extra also pulls
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
                             # (.exe only on Windows)
    lib/                     # libvmaf, libvship, fmetrics.dll / libfmetrics.*
    model/transnetv2.onnx
    vcruntime/               # Windows only: the app-local MSVC runtime DLLs
```

A partial staging tree contains only `bin/`, `lib/` and `model/`; a row with no staged artefact
is served by System, never by a placeholder file. Linux staging copies the ELF closure of
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
when the volumes differ) to the selected `ffmpeg` and `mkvmerge`. The engine resolves both
with `which`, so replacing a link takes effect on the next use without restarting. Encoders
do not need the directory: the launcher materialises the selected absolute executable into
the run's encoder document. Names lose `.exe` off Windows, and no script assumes a Windows
extension.

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
  appears as one row in the Dependencies screen and one source choice, even though the lock
  lists its wheels and binaries separately. The unit is the target's own; another target's
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
| `packaging/toolchain.json` | reviewed bill of materials: component id, upstream version, SPDX licence, source ref, build recipe, `provides`, install path. |
| `packaging/toolchain.lock.json` | generated resolution for every target: artefact URL, SHA-256, size, extracted file list, Python wheel URLs and hashes, built-output hashes and the toolchain versions that produced them. Never edited by hand. |
| `packaging/recipes/` | one script per source-built component, plus patches; it names the compiler/toolchain and the configure/CMake arguments. |
| `packaging/schema/` | the JSON Schema the verify job enforces. |

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
error. The lock adds the bytes: the actual asset URL, its SHA-256 and size, the source
archive hash, and, for components with an `apply`/`build` step, the hash of every output
file. The build reads **only the lock**. It never lets a release's “latest” page or a branch
decide what is built: a recipe may fetch a branch to reach a commit, but it rejects the
checkout when the head is not the recorded commit. A GitHub release asset is mutable, so the
hash in the lock is the pin even when the tag is immutable.

### 4.1 Updating

1. Edit `toolchain.json` (version, source ref, recipe).
2. Run `npm run toolchain:lock`. It resolves each target's sources, downloads the inputs,
   verifies the source commit, records every hash, and writes the lock.
3. Review the lock diff as part of the pull request. The diff is the audit trail: a version
   change is a few lines, not a committed binary.
4. `npm run toolchain:verify` is the same check CI runs. It fails on schema drift, a mutable
   ref (a git tag without a commit, a release asset without a hash), an unexpected file, a
   licence outside the allowlist, a component whose `provides` does not match its install, or
   a target whose install path or wheel tag names another platform.

The Python environment is assembled from an explicit wheel list in the lock **for each
target**; pip's resolver does not run at build time. Wheel installs use `--no-index
--require-hashes` after the verified files are staged. `vsjetpack` declares a hard dependency
on `vapoursynth-akarin`, which is an LGPL-3.0 plugin collection in the `akarin` namespace,
not a second core; the lock includes it where the target publishes it, and the official R82
wheel remains the only `vapoursynth` module. The wheel set is reviewed once and then
installed byte-for-byte; changing it is a lock change.

A pure-Python meta-package is not evidence that its native dependencies exist on a target.
The lock records the exact wheel tag, filename and hash per target, and the verify gate
rejects a wheel whose tag does not match the target triple (for example a `win_amd64` wheel
in a macOS artifact). `vsjetpack` itself is `py3-none-any`; its extras are not, and a target
whose required plugin wheel is absent is recorded as an incomplete plugin set rather than
silently filled from another platform.

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
runs `zig build --fetch`, applies `patches/0001-windows-portability.patch` to
`zig-pkg/fcvvdp-*` **on Windows only**, then runs `zig build --release=fast -Dshared=true`
and stages `zig-out/bin/fmetrics.dll`, `libfmetrics.dylib` or `libfmetrics.so` for the
target. On macOS/Linux the POSIX `sysconf()` path is already valid, so the portability patch
is neither applied nor claimed in the lock. The recipe reuses the fork's own
`av-metrics-fmetrics/scripts/install-fmetrics-windows.ps1` on Windows instead of a second
build script. The branch `add-windows-shared-build` is fetched only to reach the pinned
commit; the recipe rejects the checkout when its head differs. The library sits beside the
other native metrics and the service points the fmetrics, VMAF and VSHIP loader hints at
`tools/lib`.

The verify gate requires the fork commit to descend from the recorded upstream base, the
patch hash to match, and the Zig version to be in the lock. The source offer publishes the
fork commit, the upstream base and the patch. If upstream merges both changes, the component
moves back to the official repository as a version bump, not as a new exception.

## 5. CI

The Phase 6 contract adds a required `toolchain` job to `ci.yml` (Phase 5 work). It will run
on every pull request that touches `packaging/**` or a recipe, and on the default branch.
The heavier staging workflow will be `toolchain.yml`: it will run on the default branch, on
release tags, and as a dependency of `release.yml`, never on every pull request. The current
`ci.yml` runs web, Rust, and browser E2E only; none of the toolchain jobs below exists yet.

| Job | Runs | Gate |
| --- | --- | --- |
| `toolchain` (in `ci.yml`) | schema, immutable refs (no `latest`, no branch as the only pin, no git tag without a commit, no release asset without a hash), fork base and patch pins, recorded build-tool versions, SPDX allowlist, `provides`/install agreement per target, no `.pdb`/build trees in outputs, one `vapoursynth` provider per target, wheel tags matching the target | required on PRs that touch packaging; required on the default branch |
| `toolchain-build` (matrix: `windows-latest`, `macos-14`, `macos-13`, `ubuntu-24.04`) | recipes, staged Python, target wheel install, Tauri resource tree, notices, SBOM, source offer, one artefact per target | required before a release tag; not on every PR |
| `toolchain-smoke-<target>` | start the headless service with only `--tools-dir`, no toolchain on `PATH`, and no user VapourSynth config; assert every bundled row is available, the app-data TOML selects the bundled interpreter on macOS/Linux, and a fixture encode reaches a terminal event; verify the platform's native artefacts (PE signatures, Mach-O signatures, ELF linkage) | release candidate and nightly, one leg per target |
| `toolchain-outdated` | compare pinned versions with upstream tags; open one issue with the diff | scheduled, never blocking, never auto-bumps |

The build job is a matrix, not one job that builds four trees on one runner. Each leg caches
downloads and outputs by the SHA-256 of `toolchain.lock.json` **and its target triple**, so an
unchanged target costs a cache restore, not a rebuild. A cache is the only place a release
build takes a binary from; a cache miss runs that target's recipes again. The Windows leg runs
on `windows-latest`; the macOS legs are native thin builds (`macos-14` arm64 and `macos-13`
x64), never a universal binary; Linux builds on `ubuntu-24.04`, not `ubuntu-latest`, so the
glibc floor does not drift with the runner image. The engine's prebuilt ONNX Runtime requires
glibc 2.38; the Ubuntu 24.04 artifact emits GLIBC_2.39, so the effective floor is 2.39.

Signing is part of the same job, not a later manual step. Every bundled PE and DLL is
Authenticode-signed on Windows. On macOS, every nested Mach-O — `python3`, `libpython`,
`libvsscript`, ffms2, the metric libraries, VapourSynth plugins and extension modules — is
signed with the hardened runtime and a secure timestamp before the `.app` is signed and
notarised; `codesign --deep` is not a substitute for signing inside-out. On Linux the
recipes strip symbols and publish the ELF files with their SONAME/rpath intact; the `.deb`
declares its WebKitGTK dependency and the AppImage is built on the baseline image. The
installer and the updater are signed by the Phase 6 release tasks, which depend on this job.
A tool that cannot be signed is not shipped. Without a Developer ID, macOS uses ad-hoc
signing and documents the Gatekeeper override; that build is never described as notarised.

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
- `THIRD_PARTY_NOTICES.md` — generated from the target's resolved component set and the
  components' licence files.
- `sbom.spdx.json` — the same components as an SPDX document, with the bundle revision and
  target triple.
- `SOURCE-OFFER.md` — for every GPL/LGPL component, the exact source revision, the recipe,
  the patches and where the corresponding source archive is published. For `fmetrics` it
  also names the fork commit, the upstream base and, on Windows, the portability patch.
- `SHA256SUMS` — for the installers, the target's toolchain archive and the notices.

The service embeds a generated summary of the target's lock (id, version, licence, source
URL, artefact hash). `GET /api/toolchain` returns it without touching the filesystem, and
Settings → About renders it under **Bundled toolchain**, with the same rows and a link to
each source. Settings → Dependencies shows the selected source and version per capability.
The public documentation site can serve the same JSON per target; it never needs a live
service. One target's notices and SBOM do not stand in for another's.

Nothing in that summary contains a secret, a signing key, or a user path. Installed paths are
shown only in the local process's dependency rows.

## 7. Platforms

| Target | Release target | VapourSynth bundle |
| --- | --- | --- |
| Windows x64 (`x86_64-pc-windows-msvc`) | full bundle, primary, Windows 10/11 | bundled |
| macOS arm64 (`aarch64-apple-darwin`) | full bundle after 6.22, secondary | bundled after 6.22; System before |
| macOS x64 (`x86_64-apple-darwin`) | full bundle after 6.22, secondary | bundled after 6.22; System before |
| Linux x64 (`x86_64-unknown-linux-gnu`) | full bundle after 6.22, secondary | bundled after 6.22; System before |
| Windows arm64 (`aarch64-pc-windows-msvc`) | not supported | no wheel |
| Linux arm64 (`aarch64-unknown-linux-gnu`) | out of Phase 6; possible later with a reduced plugin set | wheel exists, plugin coverage is uneven |

Windows x64 is the first full bundle and the Phase 6 release gate. “Secondary” is a
build order, not a support tier: Phase 6 exits only with an installer for every listed
release target. R82 publishes wheels for all four of them, so VapourSynth is no longer the
reason the other targets wait; they wait on the relocation and signing gate in 6.22, not on
an artefact.

The macOS floor is **13.0**, because the VapourSynth and Python wheels are `macosx_13_0`.
Tauri's default `minimumSystemVersion` is older; 6.18 raises it to 13.0. A Mac on 11 or 12
keeps **System** VapourSynth and says so; it cannot load the bundled wheel. macOS installers
are thin (arm64 and x64), not universal: the Python, VapourSynth and plugin wheels are
architecture-specific, and a universal app would still need both trees.

The Linux floor is Ubuntu 24.04 / Debian 13. The engine's prebuilt ONNX Runtime requires
glibc 2.38, and the current Ubuntu 24.04 build emits GLIBC_2.39 symbols; the effective
artifact floor is therefore 2.39. Debian 12 and Ubuntu 22.04 cannot link this build. Both
supported distributions provide WebKitGTK 4.1. The `.deb` declares its WebKitGTK and GTK
dependency; the AppImage is built on that baseline.
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

This is why the packaged Windows build does not wait on macOS notarisation of a Python tree.
The Phase 6 exit criterion is an installer for every target, each carrying the largest
toolchain it can prove: Windows complete, macOS and Linux complete once 6.22 passes and
otherwise the executable/metrics subset with System VapourSynth.

## 8. Size and installer shape

The bundle is installed by the normal installer for the target; there is no first-run
download and no separate package manager. The `full,gpu,cl,vulkan` plugin set is large
(OpenVINO, DirectML and Vulkan payloads dominate it), so task 6.21 measures each target's
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
a per-variant `SHA256SUMS.txt`. `npm run release:build` builds bundled and system variants on
the host, clears only that host's platform directory so another platform's artifacts survive,
and writes the aggregate checksum list at `dist/release/SHA256SUMS.txt`, together with
`RELEASE-NOTES.md` and `release-manifest.json` for a manual GitHub pre-release. It also
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
- **LGPL FFmpeg.** The build uses `--disable-gpl --disable-nonfree`, with libvmaf, libaom,
  libsvtav1 and libvpx only. FFmpeg's licence text, the exact configure line and the source
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
- **Keeping macOS 10.13 as the minimum.** The bundled wheels are `macosx_13_0`; older Macs
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

## 11. Phase 6 gates

| Gate | Task | Pass condition |
| --- | --- | --- |
| Manifest and recipes exist for every target | 6.15 | `toolchain:verify` green; every claimed target has a source, licence, install path and wheel tag; no floating ref |
| Windows bundle builds and installs | 6.16, 6.18 | the installer lands `<resources>/tools`; the service starts with only `--tools-dir`, every bundled row is available, and a fixture encode completes |
| macOS bundle signs and notarises | 6.4, 6.16, 6.18, 6.22 | every nested Mach-O is signed with the hardened runtime, the `.app` passes `codesign --verify --deep --strict` and `spctl`, and a clean Mac runs the encode |
| Linux bundle builds and installs | 6.5, 6.16, 6.18, 6.22 | the `.deb` declares WebKitGTK and the AppImage runs on the 24.04 baseline; the service starts with only `--tools-dir` and completes a fixture encode |
| Fork-built fmetrics reproduces | 6.16 | the shared library builds from the pinned fork commit on every claimed target, the upstream-base and target patch checks pass, and a metric probe loads it |
| Provider selection works | 6.17, 6.19 | the mixed matrix in [plan/06-deployment.md](plan/06-deployment.md) passes, including a restart-required VapourSynth switch |
| Clean-VM behaviour per target | 6.20 | a machine with no Python, VapourSynth or FFmpeg encodes with the bundle only; macOS is 13+, Linux has WebKitGTK 4.1 and no other toolchain |
| Transparency assets ship per target | 6.23 | that target's lock, notices, SPDX and source offer are attached to the release and rendered in About |
| Size is acceptable per target | 6.21 | each target's measured installer size is recorded; the companion-installer fallback is chosen separately where needed |
| VapourSynth relocation on macOS/Linux | 6.22 | a wheel-based staged tree with its runtime `vapoursynth.toml` probes and signs successfully after being moved, or those platforms stay System and say so |
| Minimum OS is declared | 6.18 | macOS `minimumSystemVersion` is 13.0; the Linux package states WebKitGTK 4.1 and the glibc baseline |
