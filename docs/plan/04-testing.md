# Phase 4 — Testing

Two parts, executed at different times.

- **4a — Feasibility spikes.** Immediately after Phase 1. Five short experiments whose
  verdicts gate Phase 3's increments 2 and 3.
- **4b — The pyramid.** After Phase 3. Completes and enforces coverage.

**Exit criterion:** the pyramid is green in CI-shaped conditions, spikes S1–S5 have recorded
verdicts and any resulting design changes are reflected in the docs.

---

## 1. Part 4a — Feasibility spikes

### 1.1 Why before the UI

Four features can invalidate the architecture rather than merely disappoint:

| Feature | If infeasible… |
| --- | --- |
| preview transport | desktop and browser preview diverge → the single-SPA rule needs an exemption (an ADR, not a workaround) |
| decoder reload latency | preview becomes an explicit "prepare" step, changing the whole scene-editor UX |
| drag-select performance | the selection model changes shape |
| per-scene script template | the script editor ships without a per-scene template and exposes only the data module, changing the editor's promise |

Discovering this after building the scene list means building it twice.

### 1.2 Spike protocol

Each spike:

1. lives in `spikes/<id>/` with its own tiny `Cargo.toml` or `package.json`;
2. has a written question and a pass criterion in [testing.md](../testing.md#4-feasibility-spikes) —
   written *before* it runs;
3. records `p50`, `p95`, and the method;
4. produces a verdict of **pass**, **pass with a noted limitation**, or **fail**;
5. is deleted from `spikes/` after its verdict is recorded in
   [progress.md](../progress.md), except for the written record under `docs/spikes/`.

No spike code ships. A spike that turns out to be needed in the product is rewritten
properly with tests, not promoted.

### 1.3 Spike list

| ID | Task | Deliverable |
| --- | --- | --- |
| S1 | Measure decoder init + prepare for a 10 s scene, 20 iterations | p50/p95 table, recommended prepared range |
| S2 | Mux VapourSynth frames to fMP4; play and seek in WebView2 + Chromium | verdict per platform, seek correctness |
| S3 | Same stream over loopback, 1 GbE, 802.11ac | first-frame latency, buffering behaviour |
| S4 | Drag-sweep on 5,000 virtualized rows | long-task profile, verdict |
| S5 | Compare three per-scene VapourSynth range templates on a 10-minute fixture | fps, peak RSS, output equality, chosen template |

### 1.4 Spike exit criteria

- [ ] S1 verdict: prepared range default chosen and justified
- [ ] S2 verdict: transport confirmed or A4/D5 superseded with an ADR
- [ ] S3 verdict: LAN preview enabled, degraded, or disabled — documented
- [ ] S4 verdict: drag-select enabled or replaced with click/shift + range input
- [ ] S5 verdict: per-scene template shipped or explicitly withheld
- [ ] all five recorded in [progress.md](../progress.md) with numbers
- [ ] any doc change applied to [preview.md](../preview.md), [decisions.md](../decisions.md)

---

## 2. Part 4b — The pyramid

### 2.1 Rust

| # | Task | Notes |
| --- | --- | --- |
| 4.1.1 | Full unit coverage for resolver, derivation, migration chain, anonymiser | pure functions |
| 4.1.2 | Property tests for resolver and script materialisation | |
| 4.1.3 | `FakeRunner` scenarios: fail at each phase, cancel, panic, silent death | |
| 4.1.4 | Guard tests: `409`, `423`, `507`, `412` | status is contract |
| 4.1.5 | Route snapshot/fixture tests for every endpoint | |
| 4.1.6 | Persistence tests: atomicity (torn write), corruption, newer-version refusal | |
| 4.1.7 | Migration tests from every historical schema version | |
| 4.1.8 | `cargo llvm-cov` at 80% on `engine` and `service` | |

### 2.2 Frontend

| # | Task | Notes |
| --- | --- | --- |
| 4.2.1 | Unit tests for every function in `packages/api` and `ui/src/lib` | |
| 4.2.2 | Component tests with `MockTransport` for every screen | loading/empty/error/populated |
| 4.2.3 | `axe-core` in the component pass | violations fail |
| 4.2.4 | Selection-math tests: range, toggle, sweep, mixed aggregation | |
| 4.2.5 | SSE cache-writing tests: out-of-order, duplicate, reconnect with `since` | |
| 4.2.6 | Draft/undo/redo tests, including save/cancel/dirty through the section rail | |
| 4.2.7 | Coverage at 70% `api` / 60% `ui` | |

### 2.3 E2E

| # | Task | Notes |
| --- | --- | --- |
| 4.3.1 | Harness: build `av1ation-service --headless --fake-engine`, parse the port from stdout | |
| 4.3.2 | Journey: create project → add video → configure → validate → encode → progress → complete → reload | against `FakeRunner` |
| 4.3.3 | Journey: start → navigate away → guard blocks → cancel → navigate succeeds | |
| 4.3.4 | Journey: second encode attempt → `409` surfaced as a UI message | |
| 4.3.5 | Journey: dirty draft → leave → save/discard/stay | |
| 4.3.6 | Journey: log view → filter → export anonymised → preview contains no paths | |
| 4.3.7 | Journey: LAN mode on → token → second browser context authenticates → sees the same state | |
| 4.3.8 | Journey: scene multi-select → bulk config → single undo entry | gated on increment 3 |
| 4.3.9 | `axe` scan of every route in the E2E run | |
| 4.3.10 | One nightly real-encode smoke test on a 1 s clip, env-gated | not in PR CI |

### 2.4 Screenshots

| # | Task | Notes |
| --- | --- | --- |
| 4.4.1 | `npm run test:screenshots` — every route, both themes, key interactive states | local on demand and CI every PR |
| 4.4.2 | Output to gitignored `test-results/screenshots/` | |
| 4.4.3 | Upload the CI pass as a build artifact for human review | never a required check |
| 4.4.4 | Document the manual review workflow in `CONTRIBUTING.md` | |
| 4.4.5 | No pixel gate in CI | policy decision D10 |

### 2.5 Contract tests

| # | Task |
| --- | --- |
| 4.5.1 | Fixture for every top-level schema |
| 4.5.2 | Zod round-trip for every fixture |
| 4.5.3 | A coverage map asserting every hook's response type has a fixture |
| 4.5.4 | `--check` modes wired as tests, not only as scripts |

### 2.6 Error-path matrix

Every row in [architecture.md](../architecture.md#6-failure-modes-and-their-handling) gets a
test. This list is the specification for negative testing:

- [ ] VapourSynth missing → app usable, encode disabled, fix-it screen names it
- [ ] ffmpeg missing → same
- [ ] engine panic → `ENGINE_PANIC`, lock released, log preserved
- [ ] silent worker death → watchdog fires, lock released
- [ ] disk full → `DISK_FULL`, partial output retained
- [ ] corrupt project → recovery state, raw file exportable, not rewritten
- [ ] LAN client disconnect mid-stream → encode continues
- [ ] second app instance → focuses the first
- [ ] port collision → retried, port reported
- [ ] malformed SSE / out-of-order events → UI recovers via `since`

## 3. Deliverables

- Spike verdict document under `docs/spikes/`.
- Green pyramid with the coverage numbers above.
- E2E suite that runs against a real headless binary in a normal container.
- Error-path matrix complete.
- Screenshot command that works locally and is documented.

## 4. Explicit non-goals

- 100% coverage.
- Pixel-diff gating in CI.
- Native-webview automation.
- Fuzzing (worth adding later for the project-file loader; noted in `progress.md` as a
  follow-up, not a v0.1 requirement).

## 5. Exit checklist

- [ ] S1–S5 verdicts recorded with numbers
- [ ] `cargo test --workspace` green
- [ ] `npm test` green with coverage thresholds met
- [ ] E2E green against the headless binary
- [ ] `axe` clean on every route
- [ ] error-path matrix complete
- [ ] contract `--check` green
- [ ] no `sleep()` in any test
- [ ] no test touches real user data
- [ ] `docs/progress.md` updated with coverage numbers and spike results

## 6. Known traps

| Trap | Avoidance |
| --- | --- |
| E2E flakiness from fixed timeouts | wait on conditions and events only |
| Building the Rust binary once per test | build once, cache, pass the port |
| `FakeRunner` diverging from the real runner's event shapes | both implement one trait; a shared event-shape test asserts equivalence |
| Screenshot suite rotting | it is opt-in and documented; if it rots, it is deleted, not gated |
| Coverage chasing | thresholds are floors, not goals; a drop gate of 2% only |
| S2 passing on one platform and failing on another | verdict is per platform, recorded explicitly |
