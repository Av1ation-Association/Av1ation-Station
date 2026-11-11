# Contributing

Read [AGENTS.md](AGENTS.md) first — it is the normative rule set for this repository.
This file covers process only.

## Repository state

The implementation lives on the orphan branch `condor`; `main` remains the Electron archive
at `fb44b60` until the owner switches the default branch and renames it. The orphan keeps
the new history free of deleted Electron files while preserving the old tree, and CI and
documentation must not hardcode `main` until the rename is complete.

## Before you start

1. Read the phase plan you are working in, under [docs/plan/](docs/plan/).
2. Check [docs/progress.md](docs/progress.md) for current status and open questions.
3. Check the assumption register in [docs/README.md](docs/README.md) — an assumption
   you disagree with is cheaper to change now than later.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Rust | `1.97` | pinned by `rust-toolchain.toml`; `rustup` will install it automatically |
| Platform build tools | Tauri 2 prerequisites | Windows: MSVC, Windows SDK, WebView2; macOS: Xcode CLT; Linux: WebKitGTK 4.1 and appindicator |
| Node.js | `26` | pinned by `.nvmrc` |
| npm | `>=11` | npm workspaces |
| VapourSynth | R70+ | loaded through VSScript; set `VSSCRIPT_PATH` if it is not discoverable |
| An encoder | any of `aomenc`, `SvtAv1EncApp`, `rav1e`, `vpxenc`, `avmenc`, `x264`, `x265`, `vvencapp`, `ffmpeg` | at least one |

A system VapourSynth, FFmpeg, MKVToolNix or encoder is needed only when that capability is
on the System provider; a staged bundle can supply every one of them.

Install dependencies with `npm ci`, then run `npm run doctor` to verify your environment.
The browser smoke needs Chromium once: `npx playwright install chromium`.

### Bundled providers in a dev build

`tauri dev` has no `<resource>/tools`: it serves Vite and runs the embedded service from the
build tree. The service reads a staged tree from `AV1ATION_TOOLS_DIR`; `npm run dev` points
it at `dist/dev-tools`, the persistent, self-contained cache, and says so when it is missing.
A fresh checkout has neither cache. Use system providers, or copy a `tools/` tree from a
release bundle (or another machine) into the cache:

```
npm run dev:tools -- --from <path-to-tools>
```

After a release tree exists, plain `npm run dev:tools` copies `dist/tools` by default.
`dist/tools` is the pruned release toolchain produced by `npm run stage:tools` from the
`dist/dev-tools` cache; it is the same `tools/` layout an installer carries (`bin/`, `lib/`,
`python/`, `model/`). `stage:tools` is a Windows-only packaging step, not the bootstrap for a
fresh checkout. The copy resolves links so a staged `python/` junction cannot leave the cache
dependent on a machine-wide interpreter; `cargo clean` removes `dist/cargo/` but never the
toolchain. Do
not point the cache at a full Python installation: the CUDA/TensorRT/PySide6 payload is
release-excluded and belongs outside the repository. No binary is committed and nothing is
installed system-wide.

The base Tauri config maps only the frontend. `npm run tauri build` uses a generated
release config that adds `dist/tools` and copies the resulting installers into `dist/release`;
therefore a dev run never copies a second tools tree into the Cargo target. Stop `npm run dev`
before restaging, because the cache is
real files and Windows will not replace a DLL the running app has loaded. A partial tree is
valid: each capability reports its own provider, and a row with no staged artefact offers
System only. The VapourSynth runtime initialises once, so switching its source needs the
restart the Dependencies screen offers.

### Optional local build cache

If `kache` is installed, an untracked `.cargo/config.toml` can set
`rustc-wrapper = "kache"`, `KACHE_LOCAL_ONLY = "1"` and a local cache directory. Do not
commit a machine-specific cache path. On Windows, run Cargo from a Developer Command
Prompt (or call `vcvars64.bat`); Git Bash's `/usr/bin/link.exe` shadows the MSVC linker.
Do not pass `-C link-arg=-fuse-ld=lld` to the MSVC target — `link.exe` ignores it and emits
`LNK4044`. Use `-C linker=lld-link` if lld is intended. Keep the local cache on the
same volume as `dist/cargo/` and cap it (for example `KACHE_MAX_SIZE = "8GiB"`), so cache
growth cannot consume the space the build tree needs.

### Build output layout

Every generated artifact lives under one ignored root, `dist/`:

| Path | Contains |
| --- | --- |
| `dist/cargo/` | Cargo target, including `debug/` and `release/` |
| `dist/apps/<host>/` | Desktop, LAN web, and website Vite builds |
| `dist/tools/` | Release-staged toolchain |
| `dist/dev-tools/` | Persistent cache used by `npm run dev` |
| `dist/cache/` | Reusable local build caches such as the E2E service binary |
| `dist/tsbuildinfo/` | TypeScript incremental state |
| `dist/coverage/` | Vitest coverage reports |
| `dist/test-results/` | Playwright traces and screenshots |
| `dist/playwright-report/` | Playwright HTML report |
| `dist/test-data/` | Disposable service data for local review and E2E |
| `dist/release/` | Local installers and archives |

Cargo uses the committed `rust/.cargo/config.toml`; the root `.cargo/config.toml` stays
machine-local. The generated Tauri schemas remain under `rust/desktop-shell/gen/` because
Tauri writes them beside its configuration.

### Build output size

Development and test builds use `debug = "line-tables-only"` and carry no debug info for
dependencies (`[profile.dev]` and `[profile.test]` in `rust/Cargo.toml`). The project volume is
small, and full debug info plus the units Cargo retains for old metadata hashes had filled
it. Line tables keep panic and backtrace file:line information; only local-variable
inspection is lost. For a debugging session that needs it, opt back in with
`CARGO_PROFILE_DEV_DEBUG=2` (and `CARGO_PROFILE_TEST_DEBUG=2` for tests); the affected
artifacts are rebuilt.

The retained local budget is **15 GB** at rest. The transient trees are removed with
`npm run clean:outputs` (Tauri's debug tools copy, expanded portable output, and failed
staging leftovers) and `npm run clean:target` (the whole Rust build tree). The optional kache
cache remains capped at 8 GiB; it is not deleted by either command. A cold Rust build can
push the live tree above 15 GB while `dist/cargo` and kache coexist; run `clean:target` when
the resting budget matters more than the next rebuild's speed. `npm run typecheck` is
incremental and parallel; `npm run test:e2e` builds the service before Playwright, so its
web-server timeout no longer covers a hidden cold compile. `build:service` caches the debug
binary in `dist/cache/service/`, keyed by the Rust sources and lockfile, so an unchanged
checkout restores it after `clean:target`.

### Headless UI review

`npm run dev:headless` starts the service on port 8731 and Vite on port 1420, then prints
the URL that carries the service origin. Use `--static` to serve the built SPA from the
service instead of Vite. This is the browser loop used by the Playwright smoke.

## Local checks

```bash
npm run check       # all local gates: format, lint, typecheck, tests, contracts, routes, boundaries, docs, version
npm run build       # production host bundles; CI also runs this
npm run test:e2e    # real headless service + built SPA + Chromium
```

These are plain npm scripts with no task runner or remote cache; the workspace is small
enough that `npm run -ws` is sufficient orchestration. The browser smoke needs Chromium
once: `npx playwright install chromium`.

## Build and package

`npm run build` builds the three host SPAs into `dist/apps/`; it does not produce a desktop
installer. `npm run build:service` builds the debug headless binary used by the browser review
and E2E loop.

A local desktop installer build has two variants:

```bash
npm run tauri build  # bundled providers; requires a staged dist/tools tree
npm run build:system # system providers; no bundled tools
```

Both collect Tauri's installers and archives into `dist/release`. The bundled build adds
`dist/tools` to the release resources; stage it first with `npm run stage:tools`, which
assembles the tree for the host platform, or use `npm run build:system`. `build:system`
defaults to that host's installer types: `msi` and `nsis` on Windows, `dmg` and `app` on
macOS, `deb`, `rpm` and `appimage` on Linux. Set `AV1ATION_BUNDLES` for another set. These
are local, unsigned artifacts; signing and the release workflow are Phase 6 work.

After changing generated inputs, run the matching generator:

```bash
npm run contracts    # Rust model/schema changes; contracts:check detects drift
npm run routes       # API route changes; routes:check detects drift
npm run version:sync # version bump; version:check detects drift
```

## Workflow

1. Branch from `condor` until the default branch is renamed; `main` is still the Electron archive.
2. Make one logical change per commit, using Conventional Commits.
3. Keep the tree buildable at every commit.
4. Update [docs/progress.md](docs/progress.md) when a phase task changes state.
5. Open a pull request. The web, Rust, and browser-smoke jobs must be green.

Branch protection is the Phase 5 exit criterion; until it is enabled, a green workflow is
not yet a merge gate.

## Rules that are easy to get wrong

- Never call `invoke()`, `fetch()`, or `EventSource` outside `packages/api/src/transport/`.
- Never hand-write a type that mirrors a Rust struct — regenerate the contracts.
- Never persist pipeline state — derive it from the engine's data.
- Never derive paths from `CARGO_MANIFEST_DIR` or `current_dir()`.
- Never animate layout properties (`width`, `height`, `top`, `grid-template`).

The full list is in [AGENTS.md](AGENTS.md) §2 and §9.

## Screenshots

The pull-request workflow uploads Playwright traces and failures. No screenshot runner or
`test:screenshots` script is checked in yet. The planned policy is
to generate screenshots in CI for every pull request and upload them as an artifact for
human review; they never gate a merge. See [docs/testing.md](docs/testing.md) §3.6 for the
policy and its determinism requirements.

## Reporting bugs

Use the GitHub issue tracker. Include:

- what you did, what you expected, what happened
- the output of `npm run doctor`
- an **anonymised** log export (the app generates one; never paste raw logs, they
  contain absolute paths and usernames)
