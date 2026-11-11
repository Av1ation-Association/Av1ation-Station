# Testing

## Contents

- [1. Strategy](#1-strategy)
- [2. Rust tests](#2-rust-tests)
- [3. Frontend tests](#3-frontend-tests)
- [4. Feasibility spikes](#4-feasibility-spikes)
- [5. Contract tests](#5-contract-tests)
- [6. Fixtures and test media](#6-fixtures-and-test-media)
- [7. What is not tested, and why](#7-what-is-not-tested-and-why)
- [8. Coverage policy](#8-coverage-policy)
- [9. Test data hygiene](#9-test-data-hygiene)

## 1. Strategy

Testing is front-loaded — before UI implementation — because it doubles as the feasibility
gate. Three features could invalidate the architecture, and it is much cheaper to find
that out from a 200-line spike than from a finished scene editor.

The pyramid:

```
        ┌──────────────────────────┐
        │  E2E (Playwright)        │  few, per user journey, against a real binary
        ├──────────────────────────┤
        │  Component (Vitest + RTL)│  screens and complex widgets
        ├──────────────────────────┤
        │  Unit (Vitest)           │  pure functions: resolution, derivation, formatting
        ├──────────────────────────┤
        │  Rust (cargo test)       │  domain, resolver, persistence, routes, ACL
        └──────────────────────────┘
```

Plus **contract tests**, which cut across all layers: schema emission, Zod round-trips, and
response-shape verification.

**What is checked in:** Rust unit and route tests under `rust/crates/*`, Vitest unit and
component tests under `packages/*`, a real-service Playwright smoke under `e2e/`, a
pull-request CI workflow, and frontend coverage reporting. A manual close-out journey on
2026-11-10 also drove the debug-only headless `--fake-engine` through create, progress, lock,
cancel, reload, Scenes, Logs, History, and a Settings write. The screenshot runner, the
automated full user-journey E2E suite, and Rust coverage are not wired yet. §3.5, the
remaining E2E work in §3.6, and the Rust half of §8 describe the target. Current commands are
`npm run test:web`, `npm run test:rust`, `npm run test:web:coverage`, and `npm run test:e2e`.

## 2. Rust tests

### 2.1 What is unit tested

| Target | Why it is testable |
| --- | --- |
| Config resolution (project + overrides → effective) | pure function |
| VapourSynth runtime config (staged path resolution, R82 TOML shape, entry merge) | pure functions plus a temp app-data directory |
| Derived state (Condor data → phases) | pure function over literals |
| Persistence (write, read, atomicity, newer-schema rejection) | `tempfile` directories |
| Preflight probe identity (unique encoder ids, missing executable) | structural; never requires VapourSynth |
| Custom executable probe (missing path, family stamp matching) | the probe takes an explicit path; a successful probe is also exercised manually against an installed encoder |
| Error mapping (`EngineError` → `ErrorBody`) | exhaustive match |
| Log anonymisation | pure transform over strings |
| Encoder/sequence descriptor generation | pure; the engine parameter map is mapped without a real encoder |
| Script variable table and its state view (scene table, count, temp dir, run id, sequence) | pure; the runner and the API share one table |
| Scene validation (gap, overlap, order, invalid range) | pure |
| Timeline record encode/decode | pure |
| Derived-state fixture table | committed `src/project/derive/fixtures/*.json` checkpoints, embedded with `include_str!` |

### 2.2 The fake sequence

`rust/crates/engine` defines `EncodeRunner`, so tests and the debug-only headless host inject
a `FakeRunner` that:

- emits `Started` at 0% and one `Progress` at 42% for the first requested sequence, so the
derived state names the active sequence;
- holds until cancelled, then emits `Cancelled` and a run-level `Finished`;
- makes the singleton lock and progress observable without a real encoder or a timing-dependent
  sleep.

This is what makes the encode pipeline and the live lock testable without VapourSynth,
FFmpeg, a GPU, or five minutes of wall clock. Failure and panic scenarios are route/unit
fixtures around the runner, not FakeRunner knobs.

### 2.3 Route tests

`axum` handlers are tested with `tower::ServiceExt::oneshot` against the real router with a
temp `AppPaths` and a fake runner. No network listener, no sleep, no port allocation.

Each endpoint gets: happy path, validation failure, not-found, and locked-by-run where
applicable. Status codes are asserted explicitly because they are part of the contract.

`/api/health` gets extra assertions because the preflight cache is the one piece of state
shared by every screen: the cache is unit-tested to probe once until refreshed, and
`POST /api/preflight/refresh` returns a report that the next health read serves. A custom
probe is asserted through the route, not only the engine: an unknown kind is `400`, a path
that does not exist is a `200` check with `available: false` and a remediation, and
removing it restores the detected inventory. The merge is unit-tested for replacement,
rejected-row retention, and the FFmpeg muxing target. Settings are tested separately: a
round-trip keeps an unrelated `theme` key, and a `config.json` written before startup is
re-probed into `/api/health` through `AppState::hydrate_preflight`.

The API route tests are one binary with a thin harness. `tests/api.rs` declares
`tests/api/{encoders,lan,logging,project,run,scenes,script,settings,system,video}.rs`,
mirroring the production route modules. A test belongs in the module that owns the handler
it exercises, not the one named by its wording. Shared request and fixture helpers live in
`tests/common/mod.rs`; the `real_encode_http` target includes the same module, so `send`,
project and video setup, SSE reads, and the fake runners have one implementation. The family
modules contain only tests. Keeping one test binary avoids a second link of the service and
keeps discovery in one place.

### 2.4 Property tests (planned)

`proptest` is not a dependency yet. At least two places deserve it:

- **config resolution**: for any project/override pair, `resolve` never panics, every
  emitted path exists in the schema, and `Overridden ⊆ overrides.fields`.
- **script materialisation**: for any scene set and injected data, the materialised script
  is always syntactically valid Python (checked by `rustpython-parser`), and always contains
  exactly one output assignment.
- **scene validation**: for any scene list, validation never panics and reports a gap,
  overlap, or ordering problem whenever one exists.

Property tests are cheap insurance for functions that are pure and total, which is where
edge cases nobody enumerated live.

## 3. Frontend tests

### 3.1 Unit

Vitest, no DOM. All pure logic from `packages/api` and `packages/ui/src`:
provenance formatting, phase-to-label mapping, duration formatting, selection math
(range vs. toggle vs. sweep), config-diff computation, log filtering.

### 3.2 Component

Vitest + React Testing Library + `MockTransport`, per file with a `// @vitest-environment
jsdom` docblock so the unit suite stays DOM-free. For each screen: loading, empty, error,
populated. `axe-core` is the accessibility gate: `packages/ui/src/app/a11y.test.tsx` renders
the real shell and lazy route at every destination and fails on a structural violation. jsdom
performs no layout, so that harness disables `color-contrast` and `target-size`; the contrast
half of the pass runs against the populated application in a real browser and was recorded in
[progress.md](progress.md).

Component tests render with the mock transport rather than mocking modules, which keeps
the transport contract under test. `MockTransport` takes an optional picker (`pickers`
argument) so a locator flow can be driven without a native dialog; the demo and website
hosts continue to omit it.

### 3.2.1 Live UI review

`npm run dev:headless` starts the desktop Vite host on port `1420`, the headless service on
port `8731`, and prints the review URL with the required service parameter. It reuses an
already-running Vite server and leaves a separately started one alone. Use `--static` to
serve the built SPA from the service without Vite.

When the preview tab is hidden, Chromium throttles
React Query's retry timers, so a route that receives an immediate 404 or 500 can remain on
its `aria-busy` skeleton after the first request with no visible retry. Bring the preview
panel forward before judging an error state, or give the review client a retry-disabled
query client; a pending skeleton is not an error-state pass. This is a property of the
hidden browser tab, not of the screen's error branch.

### 3.3 E2E smoke (first slice)

`npm run test:e2e` builds the desktop SPA and the headless service, starts the real service
with a fresh `dist/test-data/e2e` directory, and drives the built SPA from Chromium. The
service build is an explicit npm step; Playwright starts the prebuilt binary with
`--no-build`, so its startup timeout covers only process startup and health, not a cold Rust
compile. `build:service` caches the debug binary in `dist/cache/service/`, keyed by the Rust
sources, `Cargo.lock`, the toolchain pin, and the Python-LSP vendoring script. A source change
rebuilds; an unchanged checkout restores the binary after `clean:target`. On 2026-11-08 the
first uncached build was 125.2 s, a restored build was 0.8 s, and the full cached E2E
command was 10.2 s with a 4.1 s Playwright smoke. The current test reads
`/api/health`, creates a project through the UI, and opens Settings. It exercises the same
HTTP surface the desktop webview uses; it does not run an encode yet. The built page is
served on loopback, so it uses the local no-token transport; a network origin still shows
the LAN pairing form.

The full target remains Playwright driving a **real** build of the app's HTTP surface with
the complete create → add video → configure → run → cancel journey.

The key decision from the retrospective: **do not test through the native webview.**
`tauri-driver` was abandoned upstream after roughly ten commits of fighting it. Instead:

```
rust/desktop-shell  ──(same router)──  bin: av1ation-service --port 0
                                                    │
                                            Playwright browser
```

The desktop binary and the headless binary share `rust/crates/service`. The current smoke runs
the headless binary on a fixed review port and points Playwright at it. The full target
reads the port from stdout so parallel jobs cannot collide. The same CI job builds the SPA,
starts the service, and runs Chromium. Rust builds are slow, so the headless binary is
cached.

**Tests must not require an encode.** A `--fake-engine` flag swaps in `FakeRunner`, so E2E
runs a full user journey (create project → add video → configure → start → watch progress
→ cancel → navigate guard) in seconds with no VapourSynth.

Scene-editor E2E runs against the fake engine and a fixture session manifest. It covers
the `Configuration` and `Scenes` tabs, the scene rail and proportional timeline sharing one selection, the single
player's source control, `Decode` being absent when the Parallel Encoder input inherits,
`Decode` being present when it is overridden, the encode-input switch leaving the `Encode`
source and position unchanged, and the validation strip blocking only run errors. It also
covers the scene encoder sheet writing one per-scene override, and a not-yet-run sequence
rendering `—` rather than a fabricated value.

The real-encode tests are marked `#[ignore]` and are expected to run locally and on a
nightly CI job only, with `cargo test -- --ignored`. They generate their clips with FFmpeg
into a per-test `tempfile` directory: native FFMS2 with x264, the VapourSynth BestSource
default, a script that modifies one detected scene, and a live Noise Detector → Parallel
Encoder run. Generation uses FFV1 (lossless) except where the test needs a keyframe
interval, which uses the native `mpeg4` encoder; `libx264` is never required, because the
bundle the application ships is LGPL. The service suite also drives
create→encode→concatenate over HTTP and checks the persisted chunks, derived state,
timeline, and log. No test reads a committed clip: `AV1ATION_FFMPEG` selects a specific
binary, and `PATH` is the fallback.

### 3.4 Measured cost

Rust rows measured 2026-11-10 on Windows 11, Rust 1.97.1, Node 26.13.0. The test compile
is excluded from the table; this run compiled for 2m45s after the contract and route-test
splits. The frontend row is the 2026-11-10 run on the same machine.

| Suite | Tests | Wall (parallel harness) |
| --- | --- | --- |
| Engine unit | 124 | 0.36 s |
| Service unit | 219 | 31.01 s |
| Service route | 103 | 20.26 s |
| Contract and event integration | 5 | 0.08 s |
| Desktop shell and test support | 2 | 0.02 s |
| **Normal Rust total** | **453** | **≈51.7 s** |
| Engine real encode (gated) | 3 | 0.00 s |
| Script re-evaluation (gated) | 7 | 0.00 s |
| Service thumbnail (gated) | 1 | 0.00 s |
| Real encode over HTTP (gated) | 1 | 0.00 s |
| **Gated Rust total** | **12** | **≈0.00 s** (no-ops without their environment) |
| Frontend Vitest | 703 | 27.8 s (110 files; jsdom startup and transform dominate) |

The table reports the harness's own wall clock from a full
`cargo test --workspace --locked` run: 453 passed, 0 failed, and 12 ignored. The ignored
rows need FFmpeg, VapourSynth, an encoder, or MKVToolNix and return immediately without
them. The service unit and route binaries dominate the wall time.

**What is still worth doing, in order.**

1. **Run the gated targets concurrently when enabled.** Cargo runs test binaries one after
   another, and the gated targets are the slow ones when their environment is present.
   A small runner or `cargo nextest` would overlap them. This changes scheduling only, not
   coverage, and belongs on the nightly job, not in PR CI.
2. **Keep real encodes out of the PR path.** They are already `#[ignore]`d; do not “make CI
   realistic” by removing the attribute. The fake suite covers the same routes and state
   rules.
3. **Let the frontend suite start in parallel with Rust.** Vitest spends most of its
   28 s on 110 jsdom environments, imports, and transforms; running it alongside the Rust
   job hides it completely, while merging test files would not.
4. **Cache compilation and filter docs-only changes.** The warm compile is under a second,
   but a cold workspace build is the dominant cost and no test rewrite can fix it. That is
   Phase 5's `sccache`/`rust-cache` and path-filter work, not a reason to weaken tests.

Do not reduce the race iterations to save 0.3 s: they are the only check that a read racing
DELETE cannot recreate a project directory, and the failure is intermittent. Do not merge
the three script cases: one proves a fresh full encode sees scene data, one proves a live
Noise Detector pass reaches the script, and one proves saved noise results do in a resumed
encode; they fail for different reasons.

### 3.5 Screenshots (planned)

No screenshot runner or `test:screenshots` script exists yet. Policy: **generated in CI,
published as artifacts, never gating a merge.**

The previous application could only be screenshotted through the native webview, which made
pixel diffing unreliable. This application's UI is a browser app served by our own axum
router, so Playwright drives it in a normal container with a pinned browser version — which
makes deterministic screenshots achievable. The fMP4 preview removes the last native
decode surface: the suite seeks a fixture to a known presentation timestamp before the
capture, so the player frame does not depend on a platform media plugin.

What we deliberately still do **not** do is gate merges on pixel equality. Font rendering,
subpixel antialiasing, and GPU rasterisation differ across runner images and across
Playwright upgrades, so a pixel gate fails on dependency bumps and gets ignored — worse than
no gate.

The planned command writes to `dist/test-results/screenshots/` (gitignored) locally and
uploads the same directory as a build artifact in CI. No such command is wired yet.

Planned coverage: every route, both themes, and the key interactive states (empty, loading,
populated, error, multi-select, dirty draft). Determinism requirements: pinned Playwright
version, pinned browser, `TZ=UTC`, `LANG=en_US.UTF-8`, animations disabled via
`prefers-reduced-motion` emulation, and a fixed viewport.

### 3.6 What a full GitHub Actions integration test needs (planned)

The goal is a real end-to-end run in CI: build the app, start it, drive the UI, assert
outcomes. The first slice is wired: `.github/workflows/ci.yml` has a `Browser smoke` job,
and `playwright.config.ts` starts `dev-headless --static` against a fresh data directory.
The table below is the remaining target, including the fake-engine journey, port discovery,
and build reuse.

| Requirement | Why | How |
| --- | --- | --- |
| **A headless build of the service** | the desktop binary needs a display and a webview | `av1ation-service --port <free> --fake-engine`, sharing `rust/crates/service` with the desktop shell; the binary takes an explicit port and has no `--headless` flag |
| **`--fake-engine`** | a real encode needs VapourSynth, an encoder, and minutes of wall clock | debug builds swap in `FakeRunner`, which emits a sequence-scoped start and one progress tick and honours cancellation; release builds keep `RealRunner` |
| **Port discovery** | no fixed port may be assumed | the binary prints the bound port to stdout; the job parses it |
| **A built SPA** | the service serves the real frontend | `npm run build` output, served by the same router |
| **Pinned Playwright + browser** | version skew is the top source of flake | `npx playwright install --with-deps <pinned-version>` |
| **Deterministic environment** | timezone, locale, and animation all change pixels and timing | `TZ=UTC`, `LANG=en_US.UTF-8`, reduced-motion emulation, fixed viewport |
| **No network** | tests must not reach the internet | Playwright route blocking for all external hosts |
| **Isolated app-data** | tests must never touch real user data | `AV1ATION_DATA_DIR` pointed at a job temp directory |
| **Fixture media** | a real encode needs a real input | generated per test by `av1ation-test-support` into a `tempfile` directory; never committed |
| **Rust build cache** | Rust is the dominant cost | `sccache` or `Swatinem/rust-cache`, keyed on lockfile + toolchain |
| **Build once, reuse** | rebuilding per job wastes minutes | build the headless binary once, upload, download in the E2E job |

**What still cannot run in CI**, and is covered by the manual release checklist instead:

- Native webview specifics (drag-and-drop from the OS, native file dialogs, window state).
  One host invariant does not need a pointer: the desktop crate parses
  `capabilities/default.json` and asserts its `remote` pattern matches
  `http://127.0.0.1:<port>`. A pattern without the port builds cleanly but denies every
  dialog and documentation link at runtime, and no CI run can click a native dialog to
  discover that.
- Real encodes (nightly only, `#[ignore]`d, on a generated clip).
- GPU/DirectML paths (no CI runner with a GPU).
- macOS/Windows-specific packaging (release workflow only).

A same-host LAN page is a **plain-HTTP, non-secure context**. Browser APIs that require a
secure context must have a fallback or must not be used there; `crypto.randomUUID` failed on
the paired origin when a video was added. The journey must therefore include project and video
creation, not only reads. `packages/ui/src/shared/random-id.ts` is the shared fallback chain
(`randomUUID` → `getRandomValues` → timestamp), and `random-id.test.ts` covers all three
paths. These IDs are transient row identities, never credentials.

**The real-encode tests** are intended for the nightly workflow, not per-PR: they need
VapourSynth and an encoder installed on the runner, take minutes, and most changes are
already covered by the fake-engine suite. The nightly workflow itself is still Phase 5
work. The native FFMS2 case runs even when VapourSynth is absent.

### 3.7 Playback benchmark

`npm run bench:playback` is not a test and never gates: playback smoothness depends on the
machine's decoder, and a threshold that fails on a slow laptop teaches people to ignore the
suite. It drives the real Scenes tab in Chrome, plays each source for a fixed time, and
records presented-frame rate, frame-gap percentiles, stalls, first-frame and seek latency,
and the working sets of the app and the browser. The player's own recorder
(`packages/ui/src/playback-metrics.ts`) is what reports the frame numbers, so the instrument
is the component under test. Run it against a **release** service: a debug build feeds
21–27 fps and underruns playback by itself. Numbers and their interpretation live in
[benchmarks/playback.md](benchmarks/playback.md).

## 4. Feasibility spikes

<a id="spikes"></a>

Five spikes. Each is a throwaway binary or script, ≤1 day, that produces a **verdict and a
number**. Spikes live in `spikes/` and are deleted (or archived under
`docs/spikes/` as a written record) once their verdict is recorded.

| ID | Question | Method | Pass | Fail → action |
| --- | --- | --- | --- | --- |
| **S1** | decoder init latency for a patched script, and source-switch latency between General and an overridden Encoding input | Rust binary: build each decoder, decode 10 s scene to fMP4, repeat 20×, record p50/p95; then switch an already-prepared source and measure | init p50 ≤ 2.5 s, p95 ≤ 6 s; prepared-source switch p50 ≤ 250 ms | tighten prepared range, add pre-warm, or make preview an explicit prepare step with honest progress |
| **S2** | fMP4 muxing of VapourSynth frames, playable and seekable by `<video>` | write source-stream muxer, open in WebView2 + Chromium + Safari/WebKit | plays, seeks, timestamps monotonic, no A/V drift | fall back to scrubbed MJPEG + encoded-only preview; raises an ADR because desktop and browser diverge |
| **S3** | LAN streaming latency | same stream over loopback, 1 GbE, 802.11ac | first frame ≤ 3 s wired, ≤ 5 s wireless | lower preview resolution or prepared range; document degradation; disable in LAN mode if needed |
| **S4** | drag-select on 5,000 virtualized rows | component harness with synthetic scene list; Playwright trace + `PerformanceObserver` long tasks | no long task > 50 ms during a sweep | fall back to click/shift-click + numeric range field |
| **S5** | per-scene VapourSynth template that preserves decode throughput | 10-minute fixture; compare per-range splice, ordered single pass, and precomputed range module; measure fps and peak RSS on each | throughput within 10% of the unfiltered baseline; bounded memory; outputs match | ship no template; expose the data module for manual filtering and say the template is undecided |

Each spike writes its verdict into `docs/progress.md` and, if it changes a design decision,
into `docs/decisions.md`.

Spike outputs are recorded, not merged: no spike code ships.

All five ran on 2026-11-02; the written records, with method, numbers and limitations,
are under [docs/spikes](spikes/).
S1, S3, S4 and S5 pass; S2 passes with a platform limitation (WebKit is unavailable on
Windows) and S3 with a same-host limitation (no second device). S5 rejects the per-range
splice; the ordered single pass remains the documented per-scene option, while the default
template is a whole-clip script with no filter.

## 5. Contract tests

Cross-cutting, in `packages/contracts/src/index.test.ts` beside the generated output:

1. every top-level schema is parsed by a round-trip test;
2. every committed contract fixture parses against its generated Zod schema;
3. generated validators reject unknown keys, so a backend field added without a schema
   change fails at the boundary instead of being silently dropped;
4. `emit-schema --check` and generator `--check` produce no diff.

## 6. Fixtures and test media

Every fixture lives beside the one test that reads it and is embedded at compile time, so
no test resolves a path at run time and no fixture is shared by accident.

| Fixture | Content |
| --- | --- |
| `packages/contracts/src/fixtures/project-summary.json` | one populated Home project row |
| `packages/contracts/src/fixtures/project.json` | one project document |
| `packages/contracts/src/fixtures/run-started.json` | the accepted-encode response |
| `packages/contracts/src/fixtures/error-body.json` | a uniform error envelope with a hint |
| `service/src/project/derive/fixtures/empty.json` | loaded, no scenes |
| `service/src/project/derive/fixtures/detected.json` | scenes with boundaries, no sequence data |
| `service/src/project/derive/fixtures/partly-encoded.json` | detection plus partial Parallel Encoder work |
| `service/src/project/derive/fixtures/concatenated.json` | a completed chain with concatenated output |
| `service/tests/fixtures/missing-plugin.vpy` | a script that calls `core.hqdn3d`, used by the plugin-scan endpoint test with a fixture lookup table |
| media | never committed: `av1ation-test-support` generates it with FFmpeg into a per-test `tempfile` directory, FFV1 for clips that are compared and `mpeg4` where a keyframe interval is the subject |

The partly-encoded fixture covers the derived state that has no stored phase: detection is
complete while only some scene chunks exist. The concatenated fixture covers the terminal
row. Freshness is advisory and compares the data's `created_on` with the section's last
save; it never changes completion ([data-model.md](data-model.md#41-sequences-not-phases)).

## 7. What is not tested, and why

| Not tested | Reason |
| --- | --- |
| Visual regression in CI | §3.5 |
| Native webview behaviour | the retrospective's conclusion: no reliable driver |
| Real encodes in PR CI | slow, needs GPU/VapourSynth; nightly only |
| GPU/DirectML paths | no CI runner with a GPU; validated manually per release, recorded in the release checklist |
| Third-party crates | not our code |

## 8. Coverage policy

Frontend coverage is wired through `npm run test:web:coverage`, using the V8 provider over
`packages/api` and `packages/ui`. The CI web job uploads the lcov and JSON summary as an
artifact. It is reported, not gated, until the baseline has been reviewed.

Still planned:

- Rust: 80% line coverage on `rust/crates/engine` and `rust/crates/service`, measured with
  `cargo-llvm-cov`. No threshold on `rust/crates/contracts` (mostly derives).
- A drop greater than 2% fails the coverage check. An absolute threshold is a target, not a
  gate; gating on a number encourages meaningless tests.

## 9. Test data hygiene

Tests write only under the OS temporary directory and never to the real app-data
directory. A test that would touch user data must fail, and one is in the suite to prove
the guard works. Generated media uses `av1ation-test-support::Scratch`, a `tempfile`
directory that is removed when the test ends, including after a panic; no clip is
committed, and no test resolves a repository path at run time.
