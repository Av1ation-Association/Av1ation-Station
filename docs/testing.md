# Testing

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

## 2. Rust tests

### 2.1 What is unit tested

| Target | Why it is testable |
| --- | --- |
| Config resolution (project + overrides → effective) | pure function |
| Derived state (Condor data → phases) | pure function over literals |
| Persistence (write, read, atomicity, migration chain) | `tempfile` directories |
| Error mapping (`EngineError` → `ErrorBody`) | exhaustive match |
| Log anonymisation | pure transform over strings |
| Encoder/sequence descriptor generation | pure |
| Script materialisation (injected scene-data prelude) | pure |
| Scene validation (gap, overlap, order, invalid range) | pure |
| Timeline record encode/decode | pure |

### 2.2 The fake sequence

`crates/engine` defines `EncodeRunner`, so tests inject a `FakeRunner` that:

- emits a scripted `EncodeEvent` sequence (with configurable timing, including
  out-of-order and duplicate events, to prove the UI contract tolerates them);
- can fail at any chosen phase;
- can be cancelled at any point and must honour `AtomicBool` within one event;
- can panic on demand, to exercise the `catch_unwind` boundary.

This is what makes the encode pipeline testable without VapourSynth, FFmpeg, a GPU, or
five minutes of wall clock.

```rust
#[test]
fn cancel_during_target_quality_releases_lock() { /* ... */ }

#[test]
fn second_encode_attempt_returns_conflict() { /* ... */ }

#[test]
fn config_write_during_run_returns_locked() { /* ... */ }

#[test]
fn panicking_runner_yields_engine_panic_and_releases_lock() { /* ... */ }
```

### 2.3 Route tests

`axum` handlers are tested with `tower::ServiceExt::oneshot` against the real router with a
temp `AppPaths` and a fake runner. No network listener, no sleep, no port allocation.

Each endpoint gets: happy path, validation failure, not-found, and locked-by-run where
applicable. Status codes are asserted explicitly because they are part of the contract.

### 2.4 Property tests

At least two places deserve `proptest`:

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

Vitest, no DOM. All pure logic from `packages/api` and `packages/ui/src/lib`:
provenance formatting, phase-to-label mapping, duration formatting, selection math
(range vs. toggle vs. sweep), config-diff computation, log filtering.

### 3.2 Component

Vitest + React Testing Library + `MockTransport`. For each screen: loading, empty, error,
populated. `axe-core` runs in the same pass; violations fail.

Component tests render with the mock transport rather than mocking modules, which keeps
the transport contract under test.

### 3.3 E2E

Playwright, driving a **real** build of the app's HTTP surface.

The key decision from the retrospective: **do not test through the native webview.**
`tauri-driver` was abandoned upstream after roughly ten commits of fighting it. Instead:

```
apps/desktop/src-tauri  ──(same router)──  bin: av1ation-service --headless --port 0
                                                    │
                                            Playwright browser
```

The desktop binary and the headless binary share `crates/service`. A CI job runs the
headless binary, reads the port from stdout, and points Playwright at it. That is the same
HTTP surface the desktop webview uses, so coverage is real, and it runs in a normal
container.

Rust builds are slow, so the headless binary is built once per job and cached.

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

One smoke test *does* run a real encode, gated behind an env flag, and is expected to run
locally and on a nightly CI job only. It uses a 1-second generated test clip.

### 3.4 Screenshots

Policy: **generated in CI, published as artifacts, never gating a merge.**

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

| Command | Where | Output |
| --- | --- | --- |
| `npm run test:screenshots` | local, on demand | `test-results/screenshots/` (gitignored) |
| `npm run test:screenshots -- --ci` | CI, every PR | uploaded as a build artifact |

Coverage: every route, both themes, and the key interactive states (empty, loading,
populated, error, multi-select, dirty draft). Determinism requirements: pinned Playwright
version, pinned browser, `TZ=UTC`, `LANG=en_US.UTF-8`, animations disabled via
`prefers-reduced-motion` emulation, and a fixed viewport.

### 3.5 What a full GitHub Actions integration test needs

The goal is a real end-to-end run in CI: build the app, start it, drive the UI, assert
outcomes. Here is everything required, and why each piece is non-negotiable.

| Requirement | Why | How |
| --- | --- | --- |
| **A headless build of the service** | the desktop binary needs a display and a webview | `av1ation-service --headless --port 0 --fake-engine`, sharing `crates/service` with the desktop shell |
| **`--fake-engine`** | a real encode needs VapourSynth, an encoder, and minutes of wall clock | swaps in `FakeRunner`, which emits scripted events and honours cancellation |
| **Port discovery** | no fixed port may be assumed | the binary prints the bound port to stdout; the job parses it |
| **A built SPA** | the service serves the real frontend | `npm run build` output, served by the same router |
| **Pinned Playwright + browser** | version skew is the top source of flake | `npx playwright install --with-deps <pinned-version>` |
| **Deterministic environment** | timezone, locale, and animation all change pixels and timing | `TZ=UTC`, `LANG=en_US.UTF-8`, reduced-motion emulation, fixed viewport |
| **No network** | tests must not reach the internet | Playwright route blocking for all external hosts |
| **Isolated app-data** | tests must never touch real user data | `AV1ATION_DATA_DIR` pointed at a job temp directory |
| **Fixture media** | a real encode needs a real input | generated lazily by ffmpeg into a temp directory on first use; never committed |
| **Rust build cache** | Rust is the dominant cost | `sccache` or `Swatinem/rust-cache`, keyed on lockfile + toolchain |
| **Build once, reuse** | rebuilding per job wastes minutes | build the headless binary once, upload, download in the E2E job |

**What still cannot run in CI**, and is covered by the manual release checklist instead:

- Native webview specifics (drag-and-drop from the OS, native file dialogs, window state).
- Real encodes (nightly only, env-gated, on a 1-second clip).
- GPU/DirectML paths (no CI runner with a GPU).
- macOS/Windows-specific packaging (release workflow only).

**The one real-encode smoke test** runs nightly, not per-PR: it needs VapourSynth and an
encoder installed on the runner, takes minutes, and its signal is already covered by the
fake-engine suite for most changes.

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

## 5. Contract tests

Cross-cutting, in `packages/api/test/contracts`:

1. every top-level schema has a fixture;
2. every fixture parses against its generated Zod schema;
3. every response type used in a hook has a fixture (enforced by a coverage map);
4. `emit-schema --check` and generator `--check` produce no diff.

## 6. Fixtures and test media

| Fixture | Content |
| --- | --- |
| `condor/empty.json` | loaded, no scenes |
| `condor/detected.json` | scenes with boundaries, no sequence data |
| `condor/noise.json` | + noise detection |
| `condor/quality.json` | + target quality with per-scene quantizers |
| `condor/complete.json` | all phases complete |
| `condor/stale.json` | data present whose `created_on` predates the last config save |
| `condor/corrupt.json` | malformed, for the recovery path |
| media | synthesized on demand by ffmpeg into the temp directory (`testsrc2` + `sine`), deterministic seed and duration; never committed |

`stale.json` and `corrupt.json` cover the two failure modes that silently produce wrong
output: showing older data without the advisory freshness badge the engine can support, and
overwriting a project whose manifest failed to parse. The freshness comparison uses the
data's `created_on`, never a config hash, and never changes completion
([data-model.md](data-model.md#41-sequences-not-phases)). Both are hard requirements, so
both have fixtures.

## 7. What is not tested, and why

| Not tested | Reason |
| --- | --- |
| Visual regression in CI | §3.4 |
| Native webview behaviour | the retrospective's conclusion: no reliable driver |
| Real encodes in PR CI | slow, needs GPU/VapourSynth; nightly only |
| GPU/DirectML paths | no CI runner with a GPU; validated manually per release, recorded in the release checklist |
| Third-party crates | not our code |

## 8. Coverage policy

- Rust: 80% line coverage on `crates/engine` and `crates/service`, measured with
  `cargo-llvm-cov`. No threshold on `crates/contracts` (mostly derives).
- Frontend: 70% on `packages/api`, 60% on `packages/ui`. Statements, not branches;
  branch thresholds on generated code are noise.
- Coverage is reported, not gated per pull request, except that a drop > 2% fails. Gating
  on an absolute number encourages meaningless tests.

## 9. Test data hygiene

Tests write only to per-test `tempfile` directories and never to the real app-data
directory. A test that would touch user data must fail, and one is in the suite to prove
the guard works.
