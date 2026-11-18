# Contributing

Read [AGENTS.md](AGENTS.md) first — it is the normative rule set for this repository.
This file covers setup, local commands, and the pull-request workflow.

## Contents

- [Repository state](#repository-state)
- [Before you start](#before-you-start)
- [Prerequisites](#prerequisites)
- [Local development](#local-development)
- [Checks and tests](#checks-and-tests)
- [Build and package](#build-and-package)
- [Workflow](#workflow)
- [Rules that are easy to get wrong](#rules-that-are-easy-to-get-wrong)
- [Screenshots](#screenshots)
- [Reporting bugs](#reporting-bugs)
- [Reference](#reference)

## Repository state

The implementation lives on `main`, the default branch. The Electron archive is
`v0.0.1-electron`.

## Before you start

1. Find your task in [docs/progress.md](docs/progress.md), then read its phase plan under
   [docs/plan/](docs/plan/).
2. Read the assumption register in [docs/README.md](docs/README.md); those are unconfirmed
   decisions, cheaper to change now than later.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Rust | `1.97` | pinned by `rust-toolchain.toml`; `rustup` installs it automatically |
| Platform build tools | [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) | Windows: MSVC, Windows SDK, WebView2; macOS: Xcode CLT; Linux: WebKitGTK 4.1 and appindicator |
| Node.js | `26` | pinned by `.nvmrc` |
| npm | `>=11` | npm workspaces |
| VapourSynth | R70+ | loaded through VSScript; set `VSSCRIPT_PATH` if it is not discoverable |
| An encoder | any of `aomenc`, `SvtAv1EncApp`, `rav1e`, `vpxenc`, `avmenc`, `x264`, `x265`, `vvencapp`, `ffmpeg` | at least one |

A system VapourSynth, FFmpeg, MKVToolNix, or encoder is required only when that capability
uses the System provider; a staged bundle can supply any of them. See
[docs/preflight.md](docs/preflight.md) for provider rules.

Install dependencies, then check the environment:

```bash
npm ci
npm run doctor
```

The browser E2E suite needs Chromium once:

```bash
npx playwright install chromium
```

For a focused run, use the matching doctor profile:

| Profile | Checks |
| --- | --- |
| `npm run doctor -- --profile web` | Node/npm, Vitest and its coverage provider, test-output space |
| `npm run doctor -- --profile e2e` | The web checks plus Cargo/Rust, Chromium, MSVC on Windows, and build space |
| `npm run doctor -- --profile real-encode` | FFmpeg with libx264, MKVToolNix, VapourSynth, BestSource, x264, SVT-AV1, MSVC, and project/temp space |

## Local development

| Task | Command |
| --- | --- |
| Run the desktop app | `npm run dev` |
| Review the desktop UI in a browser | `npm run dev:headless` |
| Run one Vite host | `npm run dev:desktop`, `npm run dev:web`, or `npm run dev:website` |
| Run the Tauri CLI | `npm run tauri` |
| Import a release tools tree | `npm run dev:tools -- --from <path-to-tools>` |

`npm run dev:web` is the LAN host and needs a LAN token from **Settings → Network**; use
`npm run dev:headless` for local browser review without one.

`tauri dev` has no `<resource>/tools` directory. The embedded service reads `AV1ATION_TOOLS_DIR`,
which `npm run dev` points at `dist/dev-tools`. A fresh checkout has no cache: use system
providers, or copy a release `tools/` tree into it.

### Provider cache

- `npm run dev:tools -- --from <path>` copies a release tree. After `npm run stage:tools`
  creates `dist/tools`, plain `npm run dev:tools` copies it by default.
- `stage:tools` stages the full provider set on every target. Point it at a target tree with
  `--from dist/cargo/toolchain/<triple>` (or at a `tools/` directory). Linux staging copies
  the shared-library closure into `tools/lib`, writes `$ORIGIN` rpaths, and requires
  `patchelf`.
- Stop `npm run dev` before restaging; Windows cannot replace a loaded DLL. Every capability
  reports its own provider. VapourSynth source changes need the restart offered by the
  Dependencies screen.
- The copy resolves links so a staged `python/` junction does not depend on a machine-wide
  interpreter. `cargo clean` removes `dist/cargo/` but not the toolchain cache.
- Do not point the cache at a full Python installation: the CUDA/TensorRT/PySide6 payload is
  release-excluded and belongs outside the repository. No binary is committed or installed
  system-wide.

### Optional local build cache

Skip this unless you already use `kache`.

- In an untracked `.cargo/config.toml`, set `rustc-wrapper = "kache"`, set
  `KACHE_LOCAL_ONLY = "1"`, and choose a local cache directory. Keep it machine-local, on
  the `dist/cargo/` volume, and capped (for example `KACHE_MAX_SIZE = "8GiB"`).
- On Windows, run Cargo from a Developer Command Prompt or call `vcvars64.bat`; Git Bash's
  `/usr/bin/link.exe` shadows the MSVC linker. Do not pass `-C link-arg=-fuse-ld=lld` to the
  MSVC target; use `-C linker=lld-link` if lld is intended.

### Build outputs

Every generated artifact lives under one ignored root, `dist/`:

| Path | Contains |
| --- | --- |
| `dist/cargo/` | Cargo target, including `debug/` and `release/` |
| `dist/apps/<host>/` | Desktop, LAN web, and website Vite builds |
| `dist/tools/` | Release-staged toolchain |
| `dist/dev-tools/` | Persistent cache used by `npm run dev` |
| `dist/cache/` | Reusable local build caches such as the E2E service binary and SPA build |
| `dist/tsbuildinfo/` | TypeScript incremental state |
| `dist/coverage/web/` | Vitest coverage summary, lcov, and HTML report |
| `dist/coverage/rust/` | Rust lcov report |
| `dist/coverage/coverage-trend.md` | Nightly coverage trend report |
| `dist/test-results/` | Playwright traces and screenshots |
| `dist/playwright-report/` | Playwright HTML report |
| `dist/test-data/` | Disposable service data for local review and E2E |
| `dist/release/` | Local installers and archives |

Cargo uses the committed `rust/.cargo/config.toml`; the root `.cargo/config.toml` stays
machine-local. Generated Tauri schemas stay under `rust/desktop-shell/gen/` because Tauri
writes them beside its configuration.

### Build budget

| Concern | Guidance |
| --- | --- |
| Debug info | Development and test builds use `debug = "line-tables-only"` and omit dependency debug info. For local-variable debugging, set `CARGO_PROFILE_DEV_DEBUG=2` (and `CARGO_PROFILE_TEST_DEBUG=2`); affected artifacts rebuild. |
| Resting budget | The retained budget is **15 GB**. `npm run clean:outputs` removes transient output; `npm run clean:target` removes the Rust build tree. The optional kache cache is capped at 8 GiB and is not removed by either command. |
| E2E cache | `npm run test:e2e` reuses the service binary from `dist/cache/service/` and the SPA from `dist/cache/e2e/`; an unchanged checkout restores both after `clean:target`. See [docs/testing.md §3.3](docs/testing.md#33-e2e-smoke-and-fake-engine-journey). |

A cold Rust build can exceed 15 GB while `dist/cargo` and kache coexist; run `clean:target`
when the resting budget matters more than the next rebuild.

### Headless UI review

`npm run dev:headless` starts the service on port 8731 and Vite on port 1420, then prints the
URL that carries the service origin. Use `--static` to serve the built SPA from the service
instead of Vite. This is the manual review loop; the automated suite starts its own service
on an ephemeral port.

## Checks and tests

| Command | Use it for |
| --- | --- |
| `npm run check` | Fast pass: static checks plus the plain web and Rust test suites. |
| `npm run verify` | Full pass: static checks once, then web and Rust coverage gates in parallel. |
| `npm run test:e2e` | Build the headless service and SPA, then run the Playwright browser journeys. |
| `npm run test:real-encode` | Run the environment-gated real-encode suite with the real toolchain. |
| `npm audit --audit-level=high` | Audit JavaScript dependencies; high and critical advisories fail. |
| `cargo audit --file rust/Cargo.lock` | Audit Rust dependencies; install `cargo-audit` once with `cargo install cargo-audit --locked`. |
| `cargo deny --manifest-path rust/Cargo.toml check licenses bans sources` | Release-time licence, ban, and source policy; use cargo-deny 0.20.2 and the reviewed `deny.toml`. |
| `gitleaks dir . --config .gitleaks.toml --redact --verbose --exit-code 1` | Release-time repository secret scan; use gitleaks 8.30.1 and the reviewed allowlist. |
| `npm run tauri -- build --no-bundle` | Compile the Tauri shell without producing installers. |

`npm run verify` is the full local gate: it runs `check:web` and `check:rust`, then
`verify:web` and `verify:rust` concurrently. Use the matching pair for the side you changed:

| Changed | Run |
| --- | --- |
| Web/TypeScript only | `npm run check:web`, then `npm run verify:web` |
| Rust/service only | `npm run check:rust`, then `npm run verify:rust` |
| Contracts, routes, or both sides | `npm run verify` |

`check:web` includes the error-evidence and route-matrix checks. CI runs the same named
profiles, then adds changed-line coverage and `npm run build:ci`; the npm audit runs in the
web job, the Rust audit in the Rust job, and E2E, push-only Tauri compile, and weekly
real-encode remain separate jobs. The changed-line checks need the pull-request base commit.
CI uses `build:ci` because the publishable website build needs generated screenshot captures,
which are not committed.

`npm run verify` does not include `test:e2e` or `test:real-encode`; run those explicitly. For
test architecture, coverage floors, E2E setup, weekly real-encode, and screenshot policy,
see [docs/testing.md](docs/testing.md). The complete script list is in
[docs/commands.md](docs/commands.md); the CI/local comparison is in
[docs/commands.md#ci-and-local-verification](docs/commands.md#ci-and-local-verification).

## Build and package

| Command | Result |
| --- | --- |
| `npm run build` | Builds the three host SPAs into `dist/apps/`; the website needs the generated docs and mobile-tour captures, so run `npm run screenshots` first. No installer. |
| `npm run build:ci` | Compiles the three hosts for CI and clean checkouts; the website uses its gallery variant, so generated captures are not required. |
| `npm run build:service` | Builds the debug headless service used by review and E2E. |
| `npm run stage:tools` | Stages the release toolchain tree under `dist/tools`. |
| `npm run release:build -- --tag <tag>` | Builds both desktop variants on the host, then aggregate checksums and notes; the tag is required and the bundled variant requires a staged `dist/tools` tree. |
| `npm run tauri build` | Builds the bundled-provider desktop release; requires `dist/tools`. |
| `npm run build:system` | Builds the system-provider desktop release; no bundled tools. |
| `npm run release:manifest -- --tag <tag>` | Regenerates notes and the manifest from existing build output; requires a prior `release:build` and the explicit tag. |

### Release order

Before creating a release tag, confirm `release/readiness.json` has reviewed evidence for the
channel and run `npm run release:readiness -- --tag <tag>`. A pending manual gate blocks
the tag workflow and `release:preflight`.

1. Optional: run `npm run screenshots:features -- <feature-group-or-screen-id>` before
   `release:build`, or before rerunning `release:manifest`, so the notes include the feature
   section.
2. For the bundled variant, stage the toolchain before building. Build a target with
   `npm run toolchain:build -- --target <triple>`, then run
   `npm run stage:tools -- --from dist/cargo/toolchain/<triple>`. On Linux install
   `patchelf` first.
3. Build both variants with `npm run release:build -- --tag <tag>`. Add `--skip-bundled`
   for a system-only build or `--skip-system` for a bundled-only build. The tag is required;
   the command fails before building when it is absent. Do not add `--code-signed` or
   `--notarized`; the project ships unsigned Windows/Linux artifacts and ad-hoc macOS
   artifacts. Add `--updater` only when that claim is true.
4. Rerun `npm run release:manifest -- --tag <tag>` after changing the artifacts or adding
   feature screenshots; it requires the checksum file written by step 3. The generated
   `## Changes` draft comes from Conventional Commits since the previous reachable tag;
   edit it, the limitations, and the checksums before publishing.

Bundled releases carry the staged `dist/tools` tree; system releases use installed
providers. See [docs/preflight.md](docs/preflight.md) for provider selection.

`release:build` writes `dist/release/<platform>/bundled/` and
`dist/release/<platform>/system/`. Each contains the host's installers and a portable
artifact. The manifest stages upload files in `dist/release/assets/`; when the audit bundle
is present it also writes the single `Av1ation-Station_<version>_metadata.zip` there. Upload
every file from that flat directory, not the nested build folders. The portable form is a
ZIP on Windows, a zipped `.app` on macOS, and the AppImage on Linux.

Both wrappers default to the host's installer types: `msi`/`nsis` on Windows, `dmg`/`app` on
macOS, and `deb`/`rpm`/`appimage` on Linux. Set `AV1ATION_BUNDLES` for another set.

Linux release builds target Debian 13 or Ubuntu 24.04; the engine's prebuilt ONNX Runtime
needs glibc 2.38, and current artifacts emit GLIBC_2.39. These are local, unsigned artifacts;
the tag-driven release workflow packages and publishes them only through the Phase 5 gates.
See [docs/packaging.md](docs/packaging.md) for the packaging contract.

After changing generated inputs, run the matching generator:

| Change | Command |
| --- | --- |
| Rust model or schema | `npm run contracts` |
| API routes | `npm run routes` |
| Version bump | `npm run version:sync` |

Each command has a `:check` counterpart that detects drift.

## Workflow

1. Branch from `main`.
2. Make one logical change per commit, using Conventional Commits.
3. Keep the tree buildable at every commit.
4. Update [docs/progress.md](docs/progress.md) when a phase task changes state.
5. Open a pull request. The `Web checks gate`, `Rust checks gate`, and
   `Browser E2E gate` statuses must be green; a docs-only pull request skips the
   runners but still reports all three gates.

Branch protection requires those three aggregate statuses, not the underlying runner jobs.
It is enabled on `main`; the owner retains admin bypass until a second writer/reviewer is
available.

## Rules that are easy to get wrong

- Never call `invoke()`, `fetch()`, or `EventSource` outside `packages/api/src/transport/`.
- Never hand-write a type that mirrors a Rust struct — regenerate the contracts.
- Never persist pipeline state — derive it from the engine's data.
- Never derive paths from `CARGO_MANIFEST_DIR` or `current_dir()`.
- Never animate layout properties (`width`, `height`, `top`, `grid-template`).

The full list is in [AGENTS.md](AGENTS.md) §2 and §9.

## Screenshots

- `npm run screenshots` captures 35 surfaces in dark and light and publishes AVIF images
  with `catalog.json`, an `index.html` contact sheet, and a usage contract under
  `dist/screenshots/`. It is an advisory CI artifact with no pixel threshold.
- `npm run screenshots:features -- <feature-group-or-screen-id>` writes only the selected
  group or screen for release notes. The selector is required so a release cannot fall back
  to a generic gallery.

See [docs/testing.md](docs/testing.md) §3.5, §3.8, and §3.9 for the determinism rules,
catalog contract, and error-path matrix.

## Reporting bugs

Use the GitHub issue tracker. Include:

- what you did, what you expected, what happened
- the output of `npm run doctor`
- an **anonymised** log export (the app generates one; never paste raw logs, they contain
  absolute paths and usernames)

## Reference

| Need | Read |
| --- | --- |
| Architecture and dependency direction | [docs/architecture.md](docs/architecture.md) |
| Every npm script | [docs/commands.md](docs/commands.md) |
| Testing, coverage, E2E, and screenshots | [docs/testing.md](docs/testing.md) |
| Providers and tool availability | [docs/preflight.md](docs/preflight.md) |
| Packaging and release contents | [docs/packaging.md](docs/packaging.md) |
| Current status and open tasks | [docs/progress.md](docs/progress.md) |
| Documentation index | [docs/README.md](docs/README.md) |
