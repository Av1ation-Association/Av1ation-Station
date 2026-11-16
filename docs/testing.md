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
component tests under `packages/*`, real-service Playwright smoke and fake-engine journey
tests under `e2e/`, a pull-request CI workflow, and frontend and Rust coverage policy. A
manual close-out journey on 2026-11-10 also drove the debug-only headless `--fake-engine`
through create, progress, lock, cancel, reload, Scenes, Logs, History, and a Settings write.
The browser suite now covers scope-lock writes, the process-wide `409`, LAN pairing, browser
`axe`, and an external-request guard. Its route lists, like the render matrix and gallery, derive
from `ROUTE_META`. The ten-row error-path matrix is recorded in §3.9;
nine rows are automated and the native second-instance row is a release check, last run on
2026-11-12. The deterministic screenshot gallery is described in §3.5 and its catalog
contract in §3.8. The remaining E2E target is in §3.6. The full command reference is
[commands.md](commands.md); `npm run check` is the fast local gate, `npm run verify` is the
full gate, and `npm run test:e2e` / `npm run test:real-encode` cover the browser and
real-toolchain suites described below.

## 2. Rust tests

### 2.1 What is unit tested

| Target                                                                                    | Why it is testable                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Config resolution (project + overrides → effective)                                       | pure function                                                                                                |
| VapourSynth runtime config (staged path resolution, R82 TOML shape, entry merge)          | pure functions plus a temp app-data directory                                                                |
| Derived state (Condor data → phases)                                                      | pure function over literals                                                                                  |
| Persistence (write, read, atomicity, newer-schema rejection)                              | `tempfile` directories                                                                                       |
| Preflight probe identity (unique encoder ids, missing executable)                         | structural; never requires VapourSynth                                                                       |
| Custom executable probe (missing path, family stamp matching)                             | the probe takes an explicit path; a successful probe is also exercised manually against an installed encoder |
| Error mapping (`EngineError` → `ErrorBody`)                                               | exhaustive match                                                                                             |
| Log anonymisation                                                                         | pure transform over strings                                                                                  |
| Encoder/sequence descriptor generation                                                    | pure; the engine parameter map is mapped without a real encoder                                              |
| Script variable table and its state view (scene table, count, temp dir, run id, sequence) | pure; the runner and the API share one table                                                                 |
| Scene validation (gap, overlap, order, invalid range)                                     | pure                                                                                                         |
| Timeline record encode/decode                                                             | pure                                                                                                         |
| Derived-state fixture table                                                               | committed `src/project/derive/fixtures/*.json` checkpoints, embedded with `include_str!`                     |

### 2.2 The fake sequence

`rust/crates/engine` defines `EncodeRunner`, so tests and the debug-only headless host inject
one of two runners:

- `FakeRunner` emits `Started` at 0% and one `Progress` at 42% for the first requested
  sequence, so the derived state names the active sequence; it holds until cancelled, then
  emits `Cancelled` and a run-level `Finished`.
- `CompletingRunner` emits the same `Started` and `Progress`, holds a 400 ms progress
  window, emits a debug-level `Source file: <path>` detail for the log-export journey,
  then emits `Completed` at 100% and a run-level `Finished`; cancellation during the window
  still emits `Cancelled` and `Finished`. The detail stays in the run log and never moves
  the live stage or the timeline.

Both make the singleton lock, progress, and terminal state observable without a real encoder
or a timing-dependent sleep. `FakeRunner` is used where a run must stay open; the completion
journey uses `CompletingRunner` so it can assert completion and reload, and the
cancel/navigation journey uses `FakeRunner` so the run is still active when the page
navigates. Failure and panic scenarios
are route/unit fixtures around the runners, not runner knobs. Both are selected by the
debug-only flags; a release build ignores them and always chooses `RealRunner`.

### 2.3 Route tests

`axum` handlers are tested with `tower::ServiceExt::oneshot` against the real router with a
temp `AppPaths` and a fake runner. No network listener, no sleep, no port allocation.

Each endpoint gets: happy path, validation failure, not-found, and locked-by-run where
applicable. Status codes are asserted explicitly because they are part of the contract.
`npm run check:route-matrix` reads the reviewed applicability policy in
`scripts/route-test-requirements.mjs` and fails when a route method has no test or when its
matched tests do not assert every required status family. The policy requires a success
case for every method, validation for a JSON/query boundary, not-found for a resource
lookup, and locked for a run-guarded write. The only exceptions are reviewed entries in
`scripts/route-test-waivers.json`: a whole-method waiver for a route that cannot be tested
hermetically, or a per-category waiver for a status the host cannot produce. Waivers must
name a real route method, carry their reason into the report, and cannot waive coverage that
already exists. A stale waiver, an unknown category, or a route method without a policy
entry also fails the check.

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

### 2.4 Property tests

`proptest` is a dev-dependency of `service` and `engine`; the engine suite also uses
`rustpython-parser` to parse the generated Python. Each suite fixes its own case count so a
failure is reproducible:

- **config resolution**: arbitrary JSON documents and overrides never panic; a project built
  only from paths in the defaults resolves only to paths in those defaults; the paths
  reported as `Overridden` are exactly the override map's keys; materialising the defaults
  returns the same document; and every override survives materialisation at its path.
- **script materialisation**: for generated scene tables, custom scene data, and strings
  that need escaping, the embedded export parses as Python and carries exactly one
  `out.set_output()` assignment.
- **scene-gap repair**: arbitrary sorted scene tables only move the end of the scene before
  a hole; starts stay put, a covered table is left alone, and a deliberate tail is kept.
- **log anonymisation**: generated email addresses never reach the exported text, and the
  audit map retains the original value under the placeholder that replaced it.
- **timeline accounting**: arbitrary out-of-order or repeated frame observations keep the
  widest count, subtract only the attempt's first position, never underflow, and produce a
  finite throughput value.

Property tests are cheap insurance for functions that are pure and total, which is where
edge cases nobody enumerated live. The project loader and timeline decoder remain
candidates for the same treatment.

## 3. Frontend tests

### 3.1 Unit

Vitest, no DOM. All pure logic from `packages/api` and `packages/ui/src`:
provenance formatting, phase-to-label mapping, duration formatting, selection math
(range vs. toggle vs. sweep), config-diff computation, log filtering.

### 3.2 Component

Vitest + React Testing Library + `MockTransport`, per file with a `// @vitest-environment
jsdom` docblock so the unit suite stays DOM-free. For each screen: loading, empty, error,
populated. `axe-core` is the accessibility gate: the `packages/ui/src/app/a11y-*.test.tsx`
route-family files render
the real shell and lazy route for all 17 route families and fails on a structural violation.
`a11y-demo.test.tsx` repeats the scan for the four screens embedded in the marketing page,
with the host's `main` around them, so a nested landmark is a failure.
The four-state matrix and axe pass take their route list from `ROUTE_META` through
`packages/ui/src/test/route-cases.ts`; its detail map is keyed by `RoutePath`, so a new
registry route cannot be omitted from either without a typecheck failure. The behaviour
suites add real interactions on top of that render matrix, including `EncoderEditor`, the
Settings panels, and the About actions. jsdom performs no layout, so that harness disables
`color-contrast` and `target-size`; the browser route sweep in
`e2e/a11y-route-sweep.spec.ts` visits every registry route and every Settings hash against
the populated application in Chromium, including contrast, target size, and the
accessible-name checks that need real layout.

Each web test file gets a fresh fork and module graph. File-scoped `vi.mock` factories
cannot share a cache: the route and axe suites load every screen under Monaco stubs, and
a broad file can otherwise leave a later component with an editor or provider instance
different from the one its test mounted. The extra process and jsdom startup roughly
doubles the frontend suite's wall time, but makes mocks and contexts independent of file
order. File isolation is the default; there is no separate isolated command.

Component tests render with the mock transport rather than mocking modules, which keeps
the transport contract under test. `MockTransport` takes an optional picker (`pickers`
argument) so a locator flow can be driven without a native dialog; the demo and website
hosts continue to omit it. The draft guard's provider has its own router-backed harness:
clean and blocked navigation, Stay, Discard, Save and leave, a rejected save, and the
tab-switch request path.

Screen and component mounts share one test-only adapter,
`packages/ui/src/test/render.tsx`. `renderRoute` takes `ui` and
`{ transport, route, initialEntry, stubs?, topBar?, queryClient? }`; it mounts one screen
at a memory-history URL using the real `ROUTE_META` and `routeFor` path metadata, with only
the sibling routes named in `stubs` mounted as empty destinations. It returns the RTL result
plus the router and optional top-bar target. `renderWithApi(ui, { transport, queryClient? })`
is the lower-level provider mount for component tests; its default query client disables
retries. It also returns `rerenderWithApi(ui)`, which rerenders through the same provider
and query client, so a component test does not rebuild the provider stack on every state
change.

`packages/ui/src/test/setup.ts` is registered as Vitest's `setupFiles`. It owns the jsdom
dialog top-layer shim, the router's missing `scrollTo`, and `cleanup` plus body reset. Tests
must not add local copies. The renderer deliberately mounts no application shell, lazy

Script screens share `packages/ui/src/test/fake-monaco.tsx`. Its fake editor calls the real
`beforeMount` and `onMount` callbacks, so tests invoke the production completion and hover
providers and the touch-scroll listeners without a canvas or worker. Its fake language-server
channel answers initialize, completion, and hover messages, and can fail or stay silent, so
the LSP path and its bundled fallback are both exercised.
routes, palette, or toaster; the `a11y-*` route-family suites remain the real-shell pass.
The draft guard's
provider keeps its own two-route harness because it tests navigation blocking, not a screen.
`use-preview-audio.test.tsx` keeps a provider wrapper because `renderHook` has no component
tree to pass through `renderWithApi`; the app-shell suites (`a11y` and `CommandPalette`)
mount `ApiProvider` directly around the shell they exercise.

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

### 3.3 E2E smoke and fake-engine journey

Before the first browser run, `npm run doctor -- --profile e2e` checks the Playwright
Chromium download, Cargo/Rust, MSVC on Windows, installed JavaScript dependencies, and free
space on the build volume. It catches a missing browser before `test:e2e:build` starts.

`npm run test:e2e` has two steps. `npm run test:e2e:build` prepares the desktop SPA and the
headless service; `npm run test:e2e:run` starts the real service with fresh
`dist/test-data/e2e` directories and drives the built SPA from Chromium. The aggregate
command runs both for local use and CI. The run step never compiles: Playwright starts the
prebuilt binary directly, so its startup timeout covers only process startup and health.

Both artifacts are reused. `build:service` caches the debug binary in `dist/cache/service/`,
keyed by the Rust sources, `Cargo.lock`, the toolchain pin, and the Python-LSP vendoring
script. `test:e2e:build` adds a content-keyed SPA cache under `dist/cache/e2e/`, covering the
desktop app and the UI, API, contracts, and config packages plus the lockfile. A source
change rebuilds; an unchanged checkout restores the build after `clean:target`. The host
profiles also pass the debug-only `--fake-preflight` seam, which supplies a fixed
dependency inventory so validation and Start do not depend on the machine's installed
SVT-AV1, FFmpeg, or FFMS2. The fake runner remains separate; `--fake-preflight` changes no
run behaviour.

The suite starts three headless services on `--port 0`: one with `--fake-engine-complete`
for the completion journey, one with `--fake-engine` for the held-open journey, and one with
`--fake-engine` plus LAN enabled for the capability and pairing journeys. It reads each bound
port from the `AV1ATION_PORT` line on stdout and health-checks all three before any test
runs. The typed host module in `e2e/support/hosts.ts` owns the profiles, startup and health,
per-host logs, the journal at `dist/test-data/e2e/origin.json`, and teardown; `globalSetup`
and `globalTeardown` are thin adapters, and fixtures expose the typed `hosts` records. After
the LAN host is healthy, setup calls `POST /api/lan/enable`, records the advertised network
origin and pairing shortcode, and leaves the loopback origin available for verification.
Playwright's `webServer` cannot own these processes because it needs a URL before a service
can report a port.

The separate LAN host isolates the process-wide run guard from the held-open journey. A
failed cancellation on `holding` cannot leave the `lan` host busy before its tests begin.

On 2026-11-12, with `node_modules` installed and the Cargo target plus both E2E caches
empty, the split build took 44 s (SPA 3.7 s, service 39 s) and the suite 51 s, for a 95 s
cold cycle. Re-running both steps reused the service and SPA in 0.2 s and completed the
suite in 51 s. The suite is dominated by the 27 s route sweep; the completion journey itself
is about 3.7 s.

The smoke reads `/api/health`, creates a project through the UI, and opens Settings. The
journey then creates a project, adds a video with a fixture path, saves the video General
document, validates the saved document against the typed preflight, starts the run,
observes `progress`, `completed`, and `finished` through the run replay endpoint, waits for
the video to become inactive, verifies `Completed` in History, and reloads the page. The
completing runner writes a terminal timeline record but does not fabricate a Condor
checkpoint, so the replay stream and History are the completion evidence. The smoke and
completion journey exercise the same HTTP surface the desktop webview uses; no browser
journey needs a real encode, VapourSynth, FFmpeg, or a GPU. The built page is served on loopback, so it uses the
local no-token transport; a network origin still shows the LAN pairing form.

The held-open journey starts a run, leaves the video for its project, and asserts the run
chip survives without a dialog. It then opens an editable sibling video, makes its output
draft dirty, clicks the run chip, and verifies the unsaved-changes dialog blocks the
navigation; Stay keeps the draft and Discard returns to the running video. A second dirty
draft chooses **Save and leave**; the test reads the sibling's General document back over
HTTP to prove the write happened before navigation. It stops the run and verifies
`cancelled` and `finished` plus `Cancelled` in History after a reload. This proves leaving
does not cancel the run and that the dirty-draft guard still works while a run holds the
singleton.

The log-export journey waits for a completed run on the completing host, opens its Logs
tab, and filters by the message text; the matching count proves the filter ran before the
page was sliced. It then enables Debug to reveal the runner's source-path detail and opens
the export sheet. The preview carries a `PATH` placeholder, the review reports one redacted
value, and the preview contains neither the fixture's absolute path nor any drive-letter
path.

The security-negative journey sits beside that redaction check. It proves a foreign
`Origin` is refused for both pairing and an authenticated project write, that missing,
wrong, and stale LAN bearer tokens return `401`, and that literal and percent-encoded `..`
paths cannot read a sentinel outside the built SPA root. The traversal probe uses raw HTTP
because a URL parser would normalise the path first. Session TTL is 24 hours, so the test
produces a stale credential by disabling and re-enabling the completing host's listener;
the 24-hour wait itself is not part of the browser suite.

The scene bulk-config journey seeds two ranges over HTTP because the fake runner
deliberately fabricates no Condor checkpoint. It selects both rows in the rail, opens the
scene encoder sheet, chooses the two-scene scope, changes one encoder parameter, and saves.
The test observes exactly one `PUT …/scenes/encoder`, checks that both typed rows report
custom provenance, then invokes Undo once: exactly one `POST …/scenes/undo` restores both
rows, and the command is disabled afterwards because the single entry has been consumed.

The capability journey starts a run through the UI on the LAN host and then walks the
run-lock matrix. A direct second start returns `409 BUSY` naming the active video and
project; writes to the active video's General document and overrides return `423 LOCKED`;
a sibling's override write still succeeds. The active General screen shows its output and
Save disabled with the running label, while a fresh reload of the sibling (which has not
received the live event) leaves Start enabled; clicking it is the user-reachable `409` path,
and the test asserts the in-place alert. The journey cancels the run and checks the terminal
state. Browser `axe` runs on the pipeline, the locked General, and the sibling General.

The LAN pairing journey opens a second browser context at the advertised network origin
rather than loopback. It sees the pairing form, exchanges the desktop shortcode, then
creates a project and a video from that plain-HTTP non-secure page. Creation is deliberate:
`crypto.randomUUID` is unavailable there, so the journey covers the shared fallback chain.
The test verifies both objects over the loopback API, reloads the paired page, and asserts
the token stays out of the URL hash.

The browser journeys run `axe-core` in Chromium on the pipeline, General, Projects, History,
and pairing screens. `e2e/support/network.ts` installs a context-level request guard:
requests to the known service origins are allowed, and every other request is aborted and
recorded. Fixture teardown asserts the recorded list is empty, so a font, telemetry call, or
CDN dependency cannot make a journey pass while reaching the internet. All journeys use the
typed run-journey module in
`e2e/support/run-journey.ts`: it creates or attaches to Project/Video handles, starts or
attaches to a Run, and exposes event, terminal, idle, and history waits. Requests use the
generated route builders from `@av1ation/api/paths` and parse the generated Zod contracts;
an unexpected status or shape throws an `E2eRequestError` naming the method, path, and
status. The completion journey keeps UI create/add/Start, while the held-open journey uses
HTTP setup/start and keeps the browser driving the guard and Stop. Each test attempt also
gets a typed workspace from `e2e/support/workspace.ts`: it appends a random suffix to
project names, creates HTTP setup projects through the run-journey module, and registers
handles for projects created through the UI. Fixture teardown deletes registered projects
only when the test passed; a failed attempt keeps its project for inspection, and a retry
starts with a new name. Fixture media stays in the spec's `testInfo.outputDir`.
`e2e/tsconfig.json` is part of `npm run typecheck`, so both screenshot harnesses are
typechecked too.

The key decision from the retrospective: **do not test through the native webview.**
`tauri-driver` was abandoned upstream after roughly ten commits of fighting it. Instead:

```
rust/desktop-shell  ──(same router)──  bin: av1ation-service --port 0
                                                    │
                                            Playwright browser
```

The desktop binary and the headless binary share `rust/crates/service`. The E2E setup runs
the headless binary on an OS-assigned port and parses the printed origin, so parallel jobs
cannot collide. The same CI job builds the SPA, starts the service, and runs Chromium. Rust
builds are slow, so the headless binary is cached.

**Tests must not require an encode.** `--fake-engine` selects the debug-only `FakeRunner`,
which holds a run open for lock, cancel, and navigation tests; `--fake-engine-complete`
selects `CompletingRunner`, which emits a terminal completion after a short progress window.
The completion journey uses the completing runner; release builds keep `RealRunner`.

Scene-editor E2E runs against the fake engine and a fixture session manifest. It covers
the `Configuration` and `Scenes` tabs, the scene rail and proportional timeline sharing one selection, the single
player's source control, `Decode` being absent when the Parallel Encoder input inherits,
`Decode` being present when it is overridden, the encode-input switch leaving the `Encode`
source and position unchanged, and the validation strip blocking only run errors. It also
covers the scene encoder sheet writing one per-scene override, and a not-yet-run sequence
rendering `—` rather than a fabricated value.

The environment-gated real-encode tests are marked `#[ignore]` and are expected to run
locally and on the weekly CI job only, with `cargo test -- --ignored`. They generate their
clips with FFmpeg into a per-test `tempfile` directory: native FFMS2 with x264, the VapourSynth BestSource
default, a script that modifies one detected scene, and a live Noise Detector → Parallel
Encoder run. Generation uses FFV1 (lossless) except where the test needs a keyframe
interval, which uses the native `mpeg4` encoder; clip generation never requires `libx264`.
The preview test does need FFmpeg's `libx264` encoder for its H.264 proxy, so the weekly
job installs a full FFmpeg build rather than the application's LGPL bundle. The service suite also drives
create→encode→concatenate over HTTP and checks the persisted chunks, derived state,
timeline, and log. No test reads a committed clip: `AV1ATION_FFMPEG` selects a specific
binary, and `PATH` is the fallback.

#### Weekly environment-gated real-encode gate

`.github/workflows/weekly.yml` runs Mondays at 03:17 UTC and on `workflow_dispatch`, and skips
a scheduled run when nothing outside documentation changed since the previous successful
scheduled run. It installs
FFmpeg with libx264, MKVToolNix, pinned x264 and SVT-AV1 builds, and VapourSynth R80 with
BestSource, then runs `npm run test:real-encode`. That command is the same locally and in CI:
it executes `cargo test --workspace --locked --no-fail-fast -- --ignored --test-threads=1
--nocapture`. The tests generate their own clips with FFmpeg through
`av1ation-test-support`; no media file is committed. `--test-threads=1` avoids interleaving
VSScript's process-wide Python runtime.

The command writes `dist/real-encode/real-encode.log` and treats any `skipped:` line or an
empty test run as a failure, because a missing optional dependency must not turn the weekly
run green. The suite's size comes from the `#[ignore]` attributes in the workspace; no
workflow constant or documentation list needs updating when a test is added. The workflow
uploads that log and `dist/real-encode/toolchain.txt` even when the job fails. The generated
clips themselves live in per-test `tempfile` directories and are removed when each test
finishes.

Run the same gate locally with:

```bash
npm run doctor -- --profile real-encode
npm run test:real-encode
```

The local prerequisites are the tools in the preceding paragraph. `npm run doctor --
--profile real-encode` checks FFmpeg with libx264, MKVToolNix, VapourSynth, BestSource, x264,
SVT-AV1, Cargo/Rust, MSVC on Windows, and both the project and temp volumes. The base
`npm run doctor` only reports optional providers; the profile turns those into failures. If
a dependency is missing, its tests print `skipped:` and the command exits non-zero instead
of reporting a partial pass. Use the weekly workflow's pinned installation steps as the
reference environment.

#### Weekly coverage trend

The same workflow's `coverage-trend` job runs on Windows in parallel with the real-encode
job. It measures frontend coverage into `dist/coverage/web/` and Rust coverage into
`dist/coverage/rust/`, then runs `coverage:report`, which evaluates both areas against the
reviewed baseline and writes `dist/coverage/coverage-trend.md`. The workflow appends that
Markdown to the GitHub run summary and uploads `dist/coverage/` as an artifact. The separate
producer directories mean a web coverage run cannot delete the Rust lcov report that a
combined report still needs. This is the scheduled visibility record for package totals,
critical-file floors, and the lowest line/branch/function modules; it is not a merge gate. A
policy failure still turns the weekly job red, so a regression is visible rather than being
recorded as a green run.

#### Weekly dependency audit

The workflow's `dependency-audit` job runs on Ubuntu, installs `cargo-audit`, and executes
`npm run audit:dependencies`. That command writes
`dist/audits/{npm.json,cargo.json,summary.json,report.md}` and reports npm high/critical
findings and Cargo vulnerabilities. When findings exist, the job opens or updates one issue
titled `Weekly dependency audit findings`; when the audit is clean, it comments and closes
that issue. Findings are advisory and do not fail the job; a scanner or parse failure does
fail the job and leaves the issue unchanged. It does not run on pull requests and is not a
required status. The screenshot gallery is not part of this workflow; it is the separate
manual run described in §3.5.

### 3.4 Measured cost

Rust rows measured 2026-11-13 on Windows 11, Rust 1.97.1, Node 26.13.0. The test compile
is excluded from the table; this run reused warm test binaries. The frontend inventory is
from the same machine and date.

| Suite                          | Tests     | Wall (parallel harness)                                     |
| ------------------------------ | --------- | ----------------------------------------------------------- |
| Engine unit                    | 130       | 0.43 s                                                      |
| Service unit                   | 229       | 9.24 s                                                      |
| Service route                  | 130       | 14.37 s                                                     |
| Contract and event integration | 5         | 0.00 s                                                      |
| Desktop shell and test support | 2         | 0.00 s                                                      |
| **Normal Rust total**          | **496**   | **≈24.0 s**                                                 |
| Engine real encode (gated)     | 3         | 0.00 s                                                      |
| Script re-evaluation (gated)   | 7         | 0.00 s                                                      |
| Service thumbnail (gated)      | 1         | 0.00 s                                                      |
| Real encode over HTTP (gated)  | 1         | 0.00 s                                                      |
| **Gated Rust total**           | **12**    | **≈0.00 s** (no-ops without their environment)              |
| Frontend Vitest                | generated | see [test-inventory.md](test-inventory.md); jsdom dominates |

The frontend row is deliberately not hand-maintained: `npm run test:web:coverage` writes the
Vitest test-result JSON, and `npm run test:inventory` reads it and writes
[test-inventory.md](test-inventory.md) without rerunning the suite. Pass
`-- --rerun` to `test:inventory` only when a standalone inventory run is needed. The
Rust rows report the harness's own wall clock from the last recorded full
`cargo test --workspace --locked` run: 496 passed, 0 failed, with the environment-gated
suite excluded. Those rows need FFmpeg, VapourSynth, an encoder, or MKVToolNix and return
immediately without them. The service unit and route binaries dominate the wall time.

#### 3.4.1 PR CI workflow timings

Measured 2026-11-13 on Windows 11 with Node 26.13.0 and Rust 1.97.1, using warm npm,
Cargo, Playwright, and service caches; the web row was re-measured 2026-11-14 with per-file
Vitest isolation. The command sets match `ci.yml` apart from the Rust audit step added
later, which is excluded from the figures below. The changed-line checks used `HEAD^` as
the base.

| Workflow path                    | Local command set                                                                                       | Measured          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| Docs-only `changes`              | `npm ci && npm run check:docs`                                                                          | 57 s              |
| Web checks                       | `npm audit`, `check:web`, `verify:web`, changed-line frontend coverage, `build:ci`, `check:bundle-size` | 122 s             |
| Rust checks                      | `check:rust`, `verify:rust`, changed-line Rust coverage                                                 | 164 s             |
| Browser E2E                      | `npx playwright install chromium`, `test:e2e`                                                           | 99 s              |
| Full-PR local component estimate | 57 s install + slowest job (Rust)                                                                       | **221 s (3m41s)** |
| Measured local component sum     | install + web + Rust + E2E                                                                              | **442 s (7m22s)** |

The per-job rows exclude `npm ci`, hosted-runner setup, and the `changes` and gate jobs.
Hosted CI runs `npm ci` in each parallel job, and the 57 s install above is the measured cost
of that command. The web row was measured alone with warm caches; the E2E and Rust rows
retain the 2026-11-13 measurements, where Web and E2E ran concurrently and Rust was rerun
alone after E2E teardown so the shared Windows workspace did not lock
`av1ation-service.exe`. The 221 s full-PR figure is a **local component estimate** (install
plus the slowest measured job), not a measured full-PR wall time. The 442 s figure is the
**sum of the component rows**, not a single end-to-end CI run. The static profiles, full
tests, and `verify:web` pass locally, including frontend coverage at 75.02% total and 73.56%
UI against baselines 74.91% and 73.46%. No hosted run of the current three-gate workflow exists yet, and the only hosted CI run used the
older workflow shape and failed. Hosted confirmation is pending for both exit items.

**What is still worth doing, in order.**

1. **Run the gated targets concurrently when enabled.** Cargo runs test binaries one after
   another, and the gated targets are the slow ones when their environment is present.
   A small runner or `cargo nextest` would overlap them. This changes scheduling only, not
   coverage, and belongs on the weekly job, not in PR CI.
2. **Keep real encodes out of the PR path.** They are already `#[ignore]`d; do not “make CI
   realistic” by removing the attribute. The fake suite covers the same routes and state
   rules.
3. **Let the frontend suite start in parallel with Rust.** Vitest spends most of its
   startup on test-file environments, imports, and transforms; running it alongside the
   Rust job hides that cost, while merging test files would not.
4. **Cache compilation and filter docs-only changes.** The warm compile is under a second,
   but a cold workspace build is the dominant cost and no test rewrite can fix it. That is
   Phase 5's `sccache`/`rust-cache` and path-filter work, not a reason to weaken tests.
   The measured PR timings are in §3.4.1.

Do not reduce the race iterations to save 0.3 s: they are the only check that a read racing
DELETE cannot recreate a project directory, and the failure is intermittent. Do not merge
the three script cases: one proves a fresh full encode sees scene data, one proves a live
Noise Detector pass reaches the script, and one proves saved noise results do in a resumed
encode; they fail for different reasons.

### 3.5 Screenshot gallery

`npm run screenshots` produces the single deterministic surface gallery used by docs,
guides, the website, and, when explicitly requested, release notes. It generates a tiny
fixture clip and thumbnails with FFmpeg, builds `@av1ation/website` with an absolute asset
base, starts `scripts/serve-static.mjs` on port 8740, and drives the built SPA in Chromium.
The website host injects `MockTransport`; a `?gallery=` query parameter seeds the rich
gallery fixture. That fixture has one project, three videos, a full encoder and filter
configuration, per-video overrides, a completed pipeline, quality scores, logs, history,
templates, editable scripts, thumbnails, and generated media. Its run data is captured from
a real SVT-AV1 encode through the scene detector, parallel encoder, concatenator, and quality
check — 2,160 frames, fourteen scenes, and CVVDP scores — then normalised into
`apps/website/src/gallery/real-run.json` and `encoder-parameters.json`. The normal website
demo stays empty. Capture itself needs no service, real encode, encoder, or browser network
access.

The pass captures **35 distinct surfaces in both themes**. The catalog covers all 17 route
families once, the six Settings tabs that a route alone does not name, the three
configuration screens that carry the feature story, three product empty states, Home's error
state, and five overlays: the command palette, parameter editor, scene encoder, Add videos,
and log export.
Both themes come from the same page and data state. Before each capture, the spec waits for
that surface's populated marker, rejects any visible `[aria-busy="true"]` surface or known
loading placeholder, waits for media where the screen embeds it, and waits for Monaco where
the editor is part of the surface. A shell that renders without its data fails the shot
rather than producing an empty screenshot.

The dark and light projects use the same fixed viewport (1280×720), UTC, `en-US`, reduced
motion, and browser-emulated colour scheme. Scrolling pages are full-page document shots;
fixed panes and overlays are viewport shots. The published image is AVIF only, converted
with FFmpeg's `libaom-av1` still-picture mode, and every catalog entry records its two theme
paths and both pixel dimensions.

Output is gitignored:

```
dist/screenshots/
├── avif/<id>-dark.avif + <id>-light.avif
├── catalog.json
├── index.html
└── README.md
```

The same pass writes the six mobile tour crops to the gitignored
`apps/website/public/demo-tour/`. A normal website build fails before compiling when any
are missing or invalid and prints the two regeneration commands; the gallery build skips
that check because it runs before the captures exist.

`index.html` is a local contact sheet with a theme toggle and feature filters. `README.md`
is the usage contract for consumers; §3.8 describes the catalog shape. The gallery is
deliberately not a pixel comparison: there is no committed baseline and no required check.
`.github/workflows/screenshots.yml` runs the same command on manual dispatch, uploads
`dist/screenshots/` as the `screenshots` artifact, and never gates a merge. It is manual
because its output is website and release asset material, and the website that consumes it
is not designed yet; an automatic run would produce images nothing reads. Reviewers download
the artifact and compare it with the previous pass; a visual regression is raised as a
review comment, not by a threshold.

The command fails when FFmpeg is unavailable, the build fails, a capture fails, either
theme is missing, an image cannot be converted, or the publisher sees inconsistent copy
between themes. It never falls back to stale images. FFmpeg is the only external
prerequisite: the script uses `dist/dev-tools/bin/ffmpeg` when present, otherwise `ffmpeg`
on `PATH`; `AV1ATION_FFMPEG` selects a specific binary.

`npm run screenshots:features -- <feature-group-or-screen-id>` runs the same gallery and
writes `dist/screenshots/feature-screenshots.json` for only that selection. A selector is
required: a group name includes every screen in the group, while a screen id includes one
surface. Both exact forms are preferred; case-insensitive matching is a fallback, and an
exact id wins over a group name when the two could collide. For example:

```sh
npm run screenshots:features -- Quality
npm run screenshots:features -- quality-check
npm run screenshots:features -- "Runs and logs"
```

A normal run removes the manifest, so release notes only carry screenshots when a feature
run explicitly selects them. A real encode is not byte-reproducible; this fixture is,
because no engine timing reaches the page.

### 3.6 What the full GitHub Actions integration test needs

The CI path builds the app, starts it, drives the UI, and asserts outcomes.
`.github/workflows/ci.yml` has a `Browser E2E` job that runs the `npm run test:e2e`
profile. Job-level path filters run only the affected language: a package or website change
skips Rust, a Rust change skips Web unless it touches contract/route sources, and Browser E2E
runs whenever either changes. A docs-only pull request skips all three runners while the
changes job runs `npm run check:docs`; a docs change paired with Rust-only work also runs
that check there because Web is skipped; the always-running
`Web checks gate`, `Rust checks gate`, and `Browser E2E gate` jobs report the required
statuses. These three aggregate gates are the only required checks; do not require the
underlying `web`, `rust`, or `e2e` jobs directly. `.github/workflows/trial-linux.yml` is a
manual dispatch that runs copies of the `rust` and `e2e` jobs on `ubuntu-latest` to see
whether they need the Windows runners; it is not a gate and reports no required status. Keep the filters on the jobs rather than the
`pull_request` trigger, or the gates are skipped too and required checks stay pending. `e2e/support/hosts.ts` starts three headless services on `--port 0` — complete,
holding, and LAN-enabled — against fresh data directories. The table tracks the full target; the headless
build, fake runners, port discovery, built SPA, isolated data, deterministic
locale/timezone/motion, service-build cache, and external-host blocking are wired. The
one-build fan-out across CI jobs remains CI work.

| Requirement                         | Why                                                                    | How                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A headless build of the service** | the desktop binary needs a display and a webview                       | `av1ation-service --port 0` with `--fake-engine-complete` or `--fake-engine`, sharing `rust/crates/service` with the desktop shell; the binary takes an explicit port and has no `--headless` flag |
| **`--fake-engine`**                 | a real encode needs VapourSynth, an encoder, and minutes of wall clock | debug builds swap in `FakeRunner`, which holds a run open for lock and cancel tests, or `CompletingRunner`, which emits progress and a terminal completion; release builds keep `RealRunner`       |
| **`--fake-preflight`**              | the UI validates before Start, but the fake runner needs no encoder    | debug-only headless flag injects the fixed encoder, muxing, and decode rows the journey validates; release builds probe this machine instead                                                       |
| **Port discovery**                  | no fixed port may be assumed                                           | `e2e/support/hosts.ts` parses each service's `AV1ATION_PORT` line                                                                                                                                  |
| **A built SPA**                     | the service serves the real frontend                                   | the E2E build's SPA output, served by the same router                                                                                                                                              |
| **Pinned Playwright + browser**     | version skew is the top source of flake                                | `npx playwright install --with-deps <pinned-version>`                                                                                                                                              |
| **Deterministic environment**       | timezone, locale, and animation all change pixels and timing           | `TZ=UTC`, `LANG=en_US.UTF-8`, reduced-motion emulation, fixed viewport                                                                                                                             |
| **No network**                      | tests must not reach the internet                                      | a context route guard allows only the known service origins, aborts and records everything else, and teardown asserts the list is empty                                                            |
| **Isolated app-data**               | tests must never touch real user data                                  | `AV1ATION_DATA_DIR` pointed at a job temp directory                                                                                                                                                |
| **Fixture media**                   | a real encode needs a real input                                       | generated per test by `av1ation-test-support` into a `tempfile` directory; never committed                                                                                                         |
| **Rust build cache**                | Rust is the dominant cost                                              | `sccache` or `Swatinem/rust-cache`, keyed on lockfile + toolchain                                                                                                                                  |
| **Build once, reuse**               | rebuilding per job wastes minutes                                      | build the headless binary once, upload, download in the E2E job                                                                                                                                    |

**What still cannot run in CI**, and is covered by the manual release checklist instead:

- Native webview specifics (drag-and-drop from the OS, native file dialogs, window state).
  One host invariant does not need a pointer: the desktop crate parses
  `capabilities/default.json` and asserts its `remote` pattern matches
  `http://127.0.0.1:<port>`. A pattern without the port builds cleanly but denies every
  dialog and documentation link at runtime, and no CI run can click a native dialog to
  discover that.
- Real encodes (weekly only, `#[ignore]`d, on a generated clip).
- GPU/DirectML paths (no CI runner with a GPU).
- macOS/Windows-specific packaging (release workflow only).

A same-host LAN page is a **plain-HTTP, non-secure context**. Browser APIs that require a
secure context must have a fallback or must not be used there; `crypto.randomUUID` failed on
the paired origin when a video was added. The journey must therefore include project and video
creation, not only reads. `packages/ui/src/shared/random-id.ts` is the shared fallback chain
(`randomUUID` → `getRandomValues` → timestamp), and `random-id.test.ts` covers all three
paths. These IDs are transient row identities, never credentials.

**The real-encode tests** run in `.github/workflows/weekly.yml`, not per-PR: they need
VapourSynth, an encoder, FFmpeg, and MKVToolNix installed on the runner, take minutes, and
most changes are already covered by the fake-engine suite. The native FFMS2 case can run
without VapourSynth, but the weekly gate fails if any environment-gated test skips.

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

### 3.8 Using the screenshot catalog

`catalog.json` is the machine-readable contract. Its top-level fields are `version`,
`viewport`, `themes`, `features` (the eight curated groups), and `screens`. Every screen
carries `id`, `title`, `caption`, `alt`, `route`, `feature`, `frame`, `dimensions` for each
theme, and `images` for each theme. A consumer selects `images.dark` or `images.light`
itself; there is no second list and no fixed file name.
`frame: "document"` means the image is a full-page capture, so its height can exceed the
1280×720 viewport; `frame: "viewport"` marks a fixed pane or overlay. `dimensions` carries
the actual width and height for each theme because document heights are not the same as the
viewport.

`feature-screenshots.json` is written only by `npm run screenshots:features -- <selector>`.
Its top-level `selection` records the resolved `kind` (`feature` or `screen`) and `value`;
`screens` contains exactly that group's or screen's entries. `npm run release:manifest`
reads the file when present and adds a `feature_screenshots` array plus a Feature
screenshots section to the generated release notes. Without the file there is no feature
section and no screenshot placeholder. The notes use `PASTE_*_IMAGE_URL` placeholders for
an inline GitHub upload; the AVIF files stay in the local, gitignored gallery. This keeps
release notes scoped to the specific new feature rather than attaching the whole catalog.

The gallery exercises the shared screens with deterministic fixture data; it does not prove
Workers, native-webview, or real-decoder behaviour. `npm run screenshots` ends with
`npm run check:gallery`, which serves `dist/screenshots`, requests every path in the catalog,
asserts HTTP 200 with `image/avif`, and decodes every image to a nonzero natural size. See
`dist/screenshots/README.md` after a run for the same contract beside the images.

### 3.9 Error-path matrix

The ten rows below are generated from the typed registry in
[`error-evidence.json`](error-evidence.json), so each row names a test or a dated manual
release check instead of prose. They are the negative-test specification for the runtime faults in
[architecture.md](architecture.md#62-runtime-faults). Runtime failures are terminal
messages: `VideoFailure` carries `message`, `at`, `run_id`, and `sequence`; there is no
error-code field. The service records the engine's own text in the run-level timeline
record and keeps the log and any partial output. Rows 1–7 and 9–10 are automated; row 8 is
a release-check row because it needs a native window. It was run on 2026-11-12 against the
packaged Windows system portable layout built from this tree.

<!-- error-evidence:start -->

| #   | Failure                          | Behaviour                                                                                                                                             | Evidence                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | VapourSynth missing              | Native input still validates and starts; a script input names the missing runtime; the Start panel renders the blocker and links to Dependencies.     | `rust/crates/service/tests/api/video.rs::a_missing_vapoursynth_only_blocks_the_script_inputs_that_need_it`; `packages/ui/src/features/videos/VideoRunActions.test.tsx::names validation blockers and links to Dependencies when a provider is missing`                                                                                      |
| 2   | FFmpeg missing                   | Only the FFmpeg muxing path is unavailable; another muxing provider still permits encode. No muxing provider at all is a blocker.                     | `rust/crates/service/tests/api/video.rs::a_missing_ffmpeg_does_not_block_encoding_when_mkvtoolnix_is_available`; `rust/crates/service/tests/api/video.rs::validating_a_video_reports_a_missing_source_and_writable_directories`; `rust/crates/service/tests/api/video.rs::concat_source_info_is_a_typed_empty_result_when_ffmpeg_is_absent` |
| 3   | Engine panic                     | The run ends with the engine's terminal message, releases the singleton, preserves the log, and keeps partial output.                                 | `rust/crates/service/tests/api/run.rs::an_engine_panic_leaves_a_terminal_message_log_and_partial_output`; `rust/crates/service/tests/api/run.rs::a_failure_at_each_pipeline_sequence_names_that_sequence`                                                                                                                                   |
| 4   | Silent worker death              | A closed event channel releases the singleton and appends `The run ended without a terminal event.`                                                   | `rust/crates/service/tests/api/run.rs::a_closed_event_stream_releases_the_singleton`                                                                                                                                                                                                                                                        |
| 5   | Disk full                        | The terminal message is retained, the partial file stays on disk, and the lock is released.                                                           | `rust/crates/service/tests/api/run.rs::a_mid_write_disk_full_keeps_the_partial_file_and_releases_the_lock`; `rust/crates/service/tests/api/run.rs::a_failure_at_each_pipeline_sequence_names_that_sequence`                                                                                                                                 |
| 6   | Corrupt project                  | The list skips the project, the detail returns `422 INVALID_CONFIG` with a generic message, and the raw file is not rewritten or disclosed.           | `rust/crates/service/tests/api/project.rs::a_corrupt_project_document_is_an_invalid_resource_not_a_server_fault`                                                                                                                                                                                                                            |
| 7   | LAN client disconnect mid-stream | Dropping the SSE socket does not stop the LAN listener; the encode owns its own worker and the event fan-out has no backpressure into it.             | `rust/crates/service/tests/api/lan.rs::lan_access_is_opt_in_and_requires_its_token`                                                                                                                                                                                                                                                         |
| 8   | Second app instance              | The second process exits without opening a window; the first window is restored from minimized, shown, and focused.                                   | Manual release check · 2026-11-12: Packaged Windows system portable layout built from this tree; second process exited 0 in 215 ms; first window was no longer minimized and the foreground PID matched.                                                                                                                                    |
| 9   | Port collision                   | Startup reports the bind error without retrying; an ephemeral port keeps the collision rare.                                                          | `rust/crates/service/tests/api/system.rs::a_port_collision_is_reported_as_a_bind_error_without_retrying`                                                                                                                                                                                                                                    |
| 10  | Malformed or out-of-order SSE    | Malformed and schema-invalid frames are discarded, the reconnect cursor only moves forward, and the next reconnect resumes from the last accepted id. | `packages/api/src/transport/event-stream.test.ts::survives malformed frames and never rewinds its reconnect cursor`                                                                                                                                                                                                                         |

<!-- error-evidence:end -->

## 4. Feasibility spikes

<a id="spikes"></a>

Five spikes. Each is a throwaway binary or script, ≤1 day, that produces a **verdict and a
number**. Spikes live in `spikes/` and are deleted (or archived under
`docs/spikes/` as a written record) once their verdict is recorded.

| ID     | Question                                                                                                              | Method                                                                                                                                     | Pass                                                                            | Fail → action                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **S1** | decoder init latency for a patched script, and source-switch latency between General and an overridden Encoding input | Rust binary: build each decoder, decode 10 s scene to fMP4, repeat 20×, record p50/p95; then switch an already-prepared source and measure | init p50 ≤ 2.5 s, p95 ≤ 6 s; prepared-source switch p50 ≤ 250 ms                | tighten prepared range, add pre-warm, or make preview an explicit prepare step with honest progress   |
| **S2** | fMP4 muxing of VapourSynth frames, playable and seekable by `<video>`                                                 | write source-stream muxer, open in WebView2 + Chromium + Safari/WebKit                                                                     | plays, seeks, timestamps monotonic, no A/V drift                                | fall back to scrubbed MJPEG + encoded-only preview; raises an ADR because desktop and browser diverge |
| **S3** | LAN streaming latency                                                                                                 | same stream over loopback, 1 GbE, 802.11ac                                                                                                 | first frame ≤ 3 s wired, ≤ 5 s wireless                                         | lower preview resolution or prepared range; document degradation; disable in LAN mode if needed       |
| **S4** | drag-select on 5,000 virtualized rows                                                                                 | component harness with synthetic scene list; Playwright trace + `PerformanceObserver` long tasks                                           | no long task > 50 ms during a sweep                                             | fall back to click/shift-click + numeric range field                                                  |
| **S5** | per-scene VapourSynth template that preserves decode throughput                                                       | 10-minute fixture; compare per-range splice, ordered single pass, and precomputed range module; measure fps and peak RSS on each           | throughput within 10% of the unfiltered baseline; bounded memory; outputs match | ship no template; expose the data module for manual filtering and say the template is undecided       |

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

Cross-cutting, in `packages/contracts/src/` beside the generated output:

1. `index.test.ts` parses the four hand-written transport fixtures and rejects unknown
   keys, so a backend field added without a schema change fails at the boundary instead of
   being silently dropped;
2. `boundaries.test.ts` parses every fixture in `src/fixtures/boundary/` against the schema
   the API hook boundary uses. `BOUNDARY_FIXTURES` in `src/boundaries.ts` is the
   hand-maintained registry: it lists all 45 generated hook response and top-level request
   shapes. `ConfigSchemas`, the engine's raw JSON Schema envelope, and `RemovedVideoIds`, the
   remove-videos response, have no generated Rust model, so they are registered with their
   fixtures in `packages/api/src/api/boundaries.ts`; the two registries cover 47 boundaries;
3. `packages/api/src/api/boundaries.test.ts` walks every `transport.get`, `post`,
   `putJson`, `patchJson`, and `subscribe` call with the TypeScript AST, normalises the
   `.array()` modifier, and compares the discovered names against both registries. It fails
   when a named schema has no fixture, when a registry entry has no hook, or when a new
   inline response schema is not explicitly classified;
4. the contracts test discovers fixtures from disk and fails when a registry entry has no
   file (`missing`) or a file has no registry entry (`orphan`), so a new hook cannot
   silently skip its fixture and a stale fixture cannot accumulate;
5. `emit-schema --check` and generator `--check` produce no diff.

## 6. Fixtures and test media

Most fixtures live beside the one test that reads them and are embedded at compile time.
The boundary corpus is split by source: the generated contracts registry imports its
fixtures, and the API-side local registry imports the ungenerated responses. Both tests
discover their files from disk so they can reject a missing or orphaned fixture.

| Fixture                                                   | Content                                                                                                                                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/fixtures/project-summary.json`    | one populated Home project row                                                                                                                                                                |
| `packages/contracts/src/fixtures/project.json`            | one project document                                                                                                                                                                          |
| `packages/contracts/src/fixtures/run-started.json`        | the accepted-encode response                                                                                                                                                                  |
| `packages/contracts/src/fixtures/error-body.json`         | a uniform error envelope with a hint                                                                                                                                                          |
| `packages/contracts/src/fixtures/boundary/**/*.json`      | one standalone populated response or top-level request per generated contract hook boundary; mirrors `schema/` by group                                                                       |
| `packages/api/src/api/fixtures/*.json`                    | the ungenerated hook responses: the engine JSON Schema envelope from `useConfigSchemas` and the removed video ids from `useRemoveVideos`                                                      |
| `service/src/project/derive/fixtures/empty.json`          | loaded, no scenes                                                                                                                                                                             |
| `service/src/project/derive/fixtures/detected.json`       | scenes with boundaries, no sequence data                                                                                                                                                      |
| `service/src/project/derive/fixtures/partly-encoded.json` | detection plus partial Parallel Encoder work                                                                                                                                                  |
| `service/src/project/derive/fixtures/concatenated.json`   | a completed chain with concatenated output                                                                                                                                                    |
| `service/tests/fixtures/missing-plugin.vpy`               | a script that calls `core.hqdn3d`, used by the plugin-scan endpoint test with a fixture lookup table                                                                                          |
| media                                                     | never committed: `av1ation-test-support` generates it with FFmpeg into a per-test `tempfile` directory, FFV1 for clips that are compared and `mpeg4` where a keyframe interval is the subject |

The partly-encoded fixture covers the derived state that has no stored phase: detection is
complete while only some scene chunks exist. The concatenated fixture covers the terminal
row. Freshness is advisory and compares the data's `created_on` with the section's last
save; it never changes completion ([data-model.md](data-model.md#41-sequences-not-phases)).

## 7. What is not tested, and why

| Not tested               | Reason                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Visual regression in CI  | the gallery in §3.5 is advisory and has no pixel baseline or committed images              |
| Native webview behaviour | the retrospective's conclusion: no reliable driver                                         |
| Real encodes in PR CI    | slow, needs GPU/VapourSynth; weekly only                                                   |
| GPU/DirectML paths       | no CI runner with a GPU; validated manually per release, recorded in the release checklist |
| Third-party crates       | not our code                                                                               |

## 8. Coverage policy

### 8.1 Frontend and local gate

Package coverage is measured by two commands and judged by one adapter. Frontend coverage is
produced by `npm run test:web:coverage`, using the V8 provider over `packages/api` and
`packages/ui`; its summary, lcov, and HTML report are written under `dist/coverage/web/`.
Before a focused web run, `npm run doctor -- --profile web` checks Node/npm, Vitest and its
coverage provider, and free space for the report. `npm run coverage:check:web` reads the JSON
summary, aggregates line coverage
by package, and compares it with `scripts/coverage-baseline.json`. The published targets are
floors: API 70%, UI 60%, engine 72%, and service 74%. A package below its floor fails. A
reviewed change may drop at most 0.25 percentage points from the recorded baseline;
`scripts/coverage-critical.json` adds a 50% line floor for primary screens and transport
modules, with only explicitly reviewed waivers. A package aggregate can therefore no longer
hide an untested primary screen. `--modules` prints the lowest frontend files with line,
branch, and function percentages and the lowest Rust files with line and function
percentages, so a reviewer sees branch and function regressions that a line-only aggregate
would hide. `npm run verify` is the local aggregate: it runs the static checks once, then
executes `verify:web` and `verify:rust` concurrently. `verify:web` runs one web coverage
pass, its policy, the generated inventory, and the inventory drift check. `verify:rust`
runs the full plain Rust suite, the engine/service coverage pass, and its policy. Together
they run the same coverage commands as CI, which invokes the same named `check:web` /
`verify:web` and `check:rust` / `verify:rust` profiles; the changed-line checks stay CI-only
because they need a base commit and the pull-request diff. See
[commands.md](commands.md#ci-and-local-verification) for the full comparison. `npm run check` remains the faster
static-plus-plain-tests loop and does not enforce coverage. `npm run
check:test-inventory` fails when a Markdown count or file row disagrees with the runner
summary, or when a baseline number disagrees with `docs/testing.md`. It also rejects a fresh coverage summary more than 0.25
points below the recorded baseline; upward drift is accepted because the baseline is a
floor, not a snapshot. The coverage policy owns the same 0.25-point ratchet, so the two
checks cannot disagree about a reviewed drop.

### 8.2 Rust coverage

Rust coverage is produced by `npm run test:rust:coverage`. The command checks free space on
the Cargo target volume before compiling, then runs `cargo llvm-cov` for
`av1ation-engine` and `av1ation-service` only and writes
`dist/coverage/rust/rust-lcov.info`.
Those are the two crates the policy measures; `rust/crates/contracts` has no threshold
because it is mostly derives, and the desktop/test-support crates add build time without
adding a measured module. `npm run coverage:check:rust` aggregates line coverage for
`rust/crates/engine` and `rust/crates/service` against the same baseline and the 72%/74%
targets. The preflight uses 6 GiB as the floor and accepts
`AV1ATION_MIN_FREE_GIB` to override it deliberately. The Rust commands require
`cargo-llvm-cov` and the `llvm-tools-preview` component; CI installs both. `npm run coverage:check` runs both policies against the baseline.

On Windows, run the coverage command from a Visual Studio Developer Command Prompt
(`vcvars64.bat`) with the MSVC tool directory ahead of Git's `usr\bin`. The default Git Bash
PATH resolves Git's `link.exe`; coverage attempts there failed while linking instrumented test
binaries with `0xc0000142` (`STATUS_DLL_INIT_FAILED`). The clean-environment run on
2026-11-14 passed 490 tests, with the environment-gated suite excluded, and wrote a 1.4 MB
lcov report;
`npm run coverage:check:rust` then passed with engine 73.68% and service 79.98%. The clean
rerun does not by itself prove linker ordering was the only cause, but it is the reproducible
local prerequisite. CI performs the same setup explicitly: the PR Rust job and the weekly
coverage-trend job run `ilammy/msvc-dev-cmd` and fail if the first `link.exe` does not
resolve under Visual Studio.

### 8.3 Coverage-run performance

The coverage command leaves Cargo at its default job count. On 2026-11-12, with dependencies
already compiled and only `av1ation-engine` and `av1ation-service` forced to rebuild, `--jobs 1`
took 336 s and the default took 106 s; both runs include the same 23 s test phase and lcov
merge. A warm suite is 23–24 s either way, because Cargo still runs test binaries serially.
`cargo nextest` ran the same normal test set in 27.6 s and took 49 s including its nextest-specific
package rebuild. It would add a CI tool install and did not beat the Cargo test phase, so the
coverage command does not use it. The plain `npm run test:rust` remains in `verify` because
coverage measures only the engine and service crates; the full suite also exercises the
unmeasured workspace packages.

### 8.4 Baseline

The baseline refreshed from the 2026-11-13 coverage run is API 83.07%, UI 73.46%, total
74.91%; Rust engine 73.90%, service 80.05%. It is above every published target and is the
reference for the 0.25-point ratchet. The CI web and Rust jobs invoke the same scripts and
upload the reports; the Rust job also runs the full workspace suite before the measured
engine/service coverage run. Update the baseline only after reviewing a coverage change; the
critical-file floors are reviewed at the same time. A target is a floor, not a substitute for
a behaviour test.

### 8.5 Changed-line coverage

Changed-line coverage is reported separately from the package totals. The frontend and Rust
jobs already emit lcov, so `npm run coverage:check:changed -- --frontend` and
`npm run coverage:check:changed -- --rust` intersect those line hits with the added lines from
`git diff` against `BASE_SHA` (or `HEAD^` locally). Modified files are report-only while the
policy is introduced; a new frontend or Rust source file must meet the reviewed 80% floor in
`scripts/coverage-changed.json`. The current baseline above is unchanged and is printed with
each report. Both CI jobs run the check after generating coverage and append the table to the
job summary. Use `--worktree` to include tracked uncommitted changes or `--report-only` to
preview a new-file failure without failing the command.

### 8.6 Mutation pilot

Mutation testing is a bounded pilot, not a merge gate. `npm run mutation:pilot` applies the
curated edits in `scripts/mutation-pilot.config.json` one at a time against scene selection,
config resolution, and run supervision, then restores the source and reports killed and
surviving mutants. The configuration is deliberately small and dependency-free; a generated
mutation run is still the broader next step. Pass `--target <id>` to run one target, or
`--validate` to check that every configured edit still matches its source exactly once.
The initial run killed 9 of 13 mutants (69.23%): scene selection 2/5, config resolution 3/4,
and run supervision 4/4. The four survivors are the scene cursor-at-end, zero PageDown size,
and cursor-versus-anchor toggle cases, plus `metric_input` path inheritance.

## 9. Test data hygiene

Tests write only under the OS temporary directory and never to the real app-data
directory. A test that would touch user data must fail, and one is in the suite to prove
the guard works. Generated media uses `av1ation-test-support::Scratch`, a `tempfile`
directory that is removed when the test ends, including after a panic; no clip is
committed, and no test resolves a repository path at run time.
