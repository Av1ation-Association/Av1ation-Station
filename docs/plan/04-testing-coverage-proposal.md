# Phase 4 — Coverage and Testing Practice Proposal

> **Planning record.** Current delivery status lives in [progress.md](../progress.md).

**Status:** proposal, not an accepted plan or a status change.
**Audit date:** 2026-11-12.
**Scope:** Phase 4a and 4b against the current tree.

## Verdict

Phase 4's foundations are strong: generated contracts, a real headless service behind
browser journeys, fake runners that make lock and cancel deterministic, isolated test data,
an external-request guard, and a measured coverage policy. The gap is not the existence of
testing. It is **what the coverage number and the route matrix are allowed to certify**.

The current practice is **B− (77/100)**. That is a solid pre-release engineering baseline,
not a failing grade. Phase 4b is **not ready to close** because three high-impact gaps
remain:

1. aggregate line coverage hides untested primary screens;
2. the four-state route matrix certifies rendering states, not screen behaviour; and
3. the coverage gate permits gradual erosion and is not enforced by the local aggregate
   command.

The two largest examples are concrete. `EncoderEditor.tsx` is a 192-line primary encoder
surface at **0.0% line coverage** even though its test file is named
`EncoderEditor.test.tsx`; that file imports and tests `ParameterControl`, not
`EncoderEditor`. `AboutPanel.tsx` is also at **0.0%**. The full frontend suite is otherwise
healthy: 821 tests pass, and `HomeScreen`, `ScenesScreen`, `VideoGeneralScreen`, the script
screens, and the preview transport remain below 50% line coverage.

**Recommendation:** adopt the P0 set in §6 before marking 4.1, 4.2, or 4.3 complete. Treat
P1 as the Phase 5 companion work; do not let a green package aggregate stand in for a screen
pass.

## 1. Method and evidence

Reviewed:

- [04-testing.md](04-testing.md), [05-ci.md](05-ci.md), and [testing.md](../testing.md);
- `docs/progress.md`, the current status surface;
- `.github/workflows/ci.yml` and `screenshots.yml`;
- `vitest.config.ts`, `playwright.config.ts`, and `playwright.screenshots.config.ts`;
- `scripts/check-coverage.mjs` and its tests;
- the route-state matrix, accessibility harness, screen tests, e2e specs, and Rust test
  modules.

Ran on 2026-11-12:

| Check | Result |
| --- | --- |
| `npm run test:web` | 821 tests, 116 files, 41.14 s |
| `npm run test:web:coverage` | 821 tests, 116 files, 46.20 s |
| `npm run coverage:check:web` | pass; API 73.35%, UI 62.60%, total 64.19% |
| `npm run test:rust` | attempted; terminated by a linker failure (`0xc0000142`), not a test assertion. No Rust result is claimed here. |

The Rust baseline below is the last recorded measurement in
`scripts/coverage-baseline.json` and [testing.md](../testing.md); it was not re-measured
during this audit. The cleanup stopped the stale service and build processes left by the
interrupted run.

## 2. Phase 4 inventory

### 2.1 Part 4a — feasibility spikes

| ID | Question | State | Evidence |
| --- | --- | --- | --- |
| S1 | Decoder init and prepared-source switch latency | complete | pass with numbers; 10 s prepared range, 61–68 ms warm init, 0.6 ms switch |
| S2 | fMP4 play/seek across WebView2 and Chromium | complete | pass; WebKit untested on Windows, recorded limitation |
| S3 | LAN first-frame latency | complete | pass; 16–30 ms on the LAN address, same-host limitation |
| S4 | Drag-sweep on 5,000 virtualized rows | complete | pass; zero long tasks over 5,000 rows |
| S5 | Per-scene VapourSynth template cost | complete | pass with a design decision; ordered single pass retained, per-range splice withheld |

**4a verdict:** complete and adequately evidenced. No proposal item reopens a spike.

### 2.2 Part 4b — task inventory

State meanings: **done** meets the written task; **partial** has useful evidence but not the
whole task; **N/A** has no applicable input yet; **open** has no implementation.

#### 4.1 Rust

| Task | State | Evidence and gap |
| --- | --- | --- |
| 4.1.1 full unit coverage for resolver, derivation, migration chain, anonymiser | partial | Resolver, derivation, and anonymiser tests exist. Recorded coverage is engine 72.78% and service 74.40%. The persistence code has a v1 schema only, so a historical migration chain is not yet exercisable. |
| 4.1.2 property tests for resolver and script materialisation | done | Two property suites, 128 resolver cases and 48 script-export cases per invocation. |
| 4.1.3 `FakeRunner` fail/cancel/panic/silent-death scenarios | partial | Route tests exercise a failing runner, a closed event stream, panic, disk full, and cancellation. `FakeRunner` itself only holds or completes; the failure cases live in test-only runners. The intent is met; the named mechanism is not. |
| 4.1.4 guard tests for `409`, `423`, `507` | done | Route and browser capability tests assert the statuses and error codes, including sibling-video write scope. |
| 4.1.5 route fixture/snapshot tests for every endpoint | partial | The manifest has 91 route entries and the route suite is organized by family. There is no mechanical assertion that every method on every route has a success, validation, not-found, and locked case. |
| 4.1.6 persistence atomicity, corruption, newer-schema refusal | done | Torn-write/corruption/newer-schema tests are present, including the warning that a corrupt project is not rewritten. |
| 4.1.7 migrations from every historical schema version | N/A | `SCHEMA_VERSION = 1`; no historical version exists. The task becomes applicable with schema v2. |
| 4.1.8 coverage targets 72% engine / 74% service | done as measurement; weak as enforcement | Both figures are at or above target in the recorded baseline, but targets are advisory and the gate is a 2 percentage-point aggregate drop. |

**4.1 verdict:** **B**. Strong domain and failure coverage; missing mechanical route-method
inventory, per-file floors, and a future migration harness.

#### 4.2 Frontend

| Task | State | Evidence and gap |
| --- | --- | --- |
| 4.2.1 unit tests for every function in `packages/api` and `ui/src/lib` | partial | API functions are 65.6% covered; UI functions are 57.2%. `http.ts` is 29.3% by line. Route and component tests exercise some of this indirectly, but “every function” is not evidenced. |
| 4.2.2 component tests for every screen, four states | done for the four-state claim, not a behaviour pass | 17 route families × 4 cells = 68 tests. Only 5 routes have a real empty collection state; the other 12 cells assert a written N/A reason. The 56 rendered cells are loading, error, and populated with one marker each. |
| 4.2.3 `axe-core` in the component pass | done | Every registered route family is rendered in jsdom. `color-contrast` and `target-size` are disabled because jsdom has no layout. |
| 4.2.4 selection math | done | Range, toggle, sweep, keyboard movement, frame lookup, and mixed aggregation have direct tests. |
| 4.2.5 SSE cache writing, out-of-order, duplicate, reconnect | done | Parser/reconnect tests cover malformed frames, a non-rewinding cursor, ticket retry, duplicate checkpoint replacement, and cache-gap refetch. |
| 4.2.6 draft/undo/redo through section editors | partial | Shared draft-session, dirty navigation, save/discard, tab switching, and scene bulk undo are covered. The template General section has input and active-undo tests. Project, video, and template section screens now have save/discard tests, and `ScriptEditorScreen` covers converting a file input to stored text, saving, and discarding later edits. The remaining routed screens still need the same behaviour treatment. |
| 4.2.7 coverage targets 70% API / 60% UI | done as measurement; weak as enforcement | Current API 73.35%, UI 62.60%. Targets are advisory; the enforceable rule is a 2-point aggregate drop. |

**4.2 verdict:** **C+ at the initial audit.** The harness is good; the result was uneven,
with only five of the 17 routed screen components carrying a same-named `*Screen.test.tsx`.
The P0 screen suites have since added real interaction tests for the named editors and
section screens; the remaining routed screens still need the same behaviour treatment.

#### 4.3 E2E

| Task | State | Evidence and gap |
| --- | --- | --- |
| 4.3.1 headless harness with free port discovery | done | Three services start on `--port 0`; the typed host module reads `AV1ATION_PORT` and health-checks before tests. |
| 4.3.2 create → add video → configure → run → complete → reload | done | `journey.spec.ts` through the built SPA and real service router. |
| 4.3.3 start → navigate → guard → cancel | done | `cancel-navigation.spec.ts` covers run chip, Stay, Discard, Save and leave, and cancellation. |
| 4.3.4 second start returns 409 and surfaces in the UI | done | `run-capabilities.spec.ts` asserts direct `409 BUSY` and the in-place refusal. |
| 4.3.5 dirty draft save/discard/stay | done | Covered in the held-open journey and draft-guard component harness. |
| 4.3.6 log filter and anonymised export | done | `log-export.spec.ts` verifies the count, source-path redaction, and placeholder. |
| 4.3.7 LAN token and second browser context | done | `lan-pairing.spec.ts` uses the advertised network origin and creates project/video there. |
| 4.3.8 scene multi-select, bulk config, one undo | done | `scene-bulk-config.spec.ts` proves one request and one undo for two rows. |
| 4.3.9 every-route `axe` | partial | Browser axe runs at 12 checkpoints across six route families, not all 17. The jsdom pass covers all routes but without contrast or target-size. The table below maps every family. |
| 4.3.10 nightly real-encode gate | done | `.github/workflows/nightly.yml` runs all 12 environment-gated Rust tests on generated clips and uploads their log and toolchain diagnostics. |

The 12 browser axe checkpoints are distributed across six of the 17 route families. The
unpaired LAN gate is exercised at `/` before pairing, so it is counted with the Home family;
the remaining five covered families are the project queue, the video pipeline, Video General,
History, and Logs.

| Route family | Browser axe | Checkpoints | Evidence |
| --- | --- | ---: | --- |
| Home — `/` (including the LAN pairing gate) | yes | 3 | `journey.spec.ts` “Projects”; `lan-pairing.spec.ts` “LAN pairing” and “LAN Projects” |
| Project — `/projects/$projectId` | yes | 1 | `lan-pairing.spec.ts` “LAN project queue” |
| Project General — `/projects/$projectId/config/general` | no | 0 | — |
| Project section — `/projects/$projectId/config/$section` | no | 0 | — |
| Video — `/projects/$projectId/videos/$videoId` | yes | 2 | `cancel-navigation.spec.ts` and `run-capabilities.spec.ts` “video pipeline” |
| Scenes — `/projects/$projectId/videos/$videoId/scenes` | no | 0 | — |
| Video General — `/projects/$projectId/videos/$videoId/config/general` | yes | 4 | `journey.spec.ts` and `cancel-navigation.spec.ts` “video General”; `run-capabilities.spec.ts` “locked video General” and “sibling video General” |
| History — `/projects/$projectId/videos/$videoId/history` | yes | 1 | `journey.spec.ts` “video History” |
| Video section — `/projects/$projectId/videos/$videoId/config/$section` | no | 0 | — |
| Logs — `/projects/$projectId/videos/$videoId/logs` | yes | 1 | `log-export.spec.ts` “video Logs” |
| Video script — `/projects/$projectId/videos/$videoId/script` | no | 0 | — |
| Project script — `/projects/$projectId/config/script` | no | 0 | — |
| Template script — `/settings/templates/$templateId/script` | no | 0 | — |
| Template section — `/settings/templates/$templateId/$section` | no | 0 | — |
| Template — `/settings/templates/$templateId` | no | 0 | — |
| Settings — `/settings` | no | 0 | — |
| Encoder JSON — `/settings/encoders/$encoderId/json` | no | 0 | — |
| **Total** | **6 of 17** | **12** | **11 families have no real-browser axe pass** |

**4.3 verdict:** **B**. Six meaningful journeys with real service routing, a request guard,
and typed helpers. The missing nightly real-engine path and incomplete browser a11y sweep
are the material gaps.

#### 4.4 Screenshots

| Task | State | Evidence |
| --- | --- | --- |
| 4.4.1 35 surfaces, both themes | done | 70 AVIF files plus catalog and contact sheet. |
| 4.4.2 AVIF + catalog + contact sheet | done | `dist/screenshots/`; no committed output. |
| 4.4.3 CI artifact for human review | done | `screenshots.yml` uploads the gallery and never gates. |
| 4.4.4 manual review workflow documented | done | `CONTRIBUTING.md` describes local and release-note use. |
| 4.4.5 no pixel gate | done by policy | Advisory only; no baseline. |
| 4.4.6 feature-only manifest | done | `screenshots:features -- <group-or-id>` writes `feature-screenshots.json`. |

**4.4 verdict:** **A−**. Clear policy and real output. The gallery is not a substitute for
behavioural coverage; a secure static origin and an image-load smoke check are still worth
adding for local review.

#### 4.5 Contract tests

| Task | State | Evidence |
| --- | --- | --- |
| 4.5.1 fixture for every top-level schema | done | 45 generated hook-boundary fixtures plus 2 local fixture registries. |
| 4.5.2 Zod round-trip for every fixture | done | Contracts and API boundary suites parse every fixture. |
| 4.5.3 hook response type has a fixture | done | The AST walk discovers every transport call and compares it with both registries; missing and orphan entries fail. |
| 4.5.4 `--check` modes as tests | done | `contracts:check` and `routes:check` run in CI and locally; schema, routes, and docs drift are checked. |

**4.5 verdict:** **A−**. This is the strongest part of the pyramid. It prevents
hand-maintained contract drift rather than only testing examples.

#### 4.6 Error paths

**4.6 verdict:** **B**. All ten rows have evidence, nine are automated, and the native
second-instance row is a recorded release check. The plan says “every row gets a test” and
lists a `DISK_FULL` code, a retried port collision, and an exportable corrupt project. The
implemented contract instead reports a bind error without retry, generic invalid-resource
text for corruption, and a terminal message rather than an error code. Those are reasonable
product decisions, but the plan and evidence disagree. The matrix should state the accepted
behaviour and distinguish automated from manual evidence.

## 3. Audit scorecard

### 3.1 Current measurements

Frontend, measured on 2026-11-12 from `npm run test:web:coverage`:

| Scope | Lines | Functions | Branches | Published target | Result |
| --- | --- | --- | --- | --- | --- |
| `packages/api` | 73.35% | 65.6% | 68.1% | 70% | above |
| `packages/ui` | 62.60% | 57.2% | 55.8% | 60% | above |
| frontend total | 64.19% | 58.63% | 57.02% | — | 0.01 below baseline; gate passes |

Rust, last recorded baseline (not re-run this pass):

| Scope | Lines | Published target | Result |
| --- | --- | --- | --- |
| `rust/crates/engine` | 72.78% | 72% | above target |
| `rust/crates/service` | 74.40% | 74% | above target |

The API and UI totals are above their targets, but the distributions are not equivalent.
The lowest files with at least 50 lines were:

| File | Line coverage | Lines |
| --- | --- | --- |
| `packages/ui/src/features/encoders/EncoderEditor.tsx` | 0.0% | 192 |
| `packages/ui/src/features/settings/AboutPanel.tsx` | 0.0% | 85 |
| `packages/ui/src/features/encoders/encoder-document.ts` | 1.9% | 53 |
| `packages/ui/src/features/preview/PlayerTransport.tsx` | 6.0% | 50 |
| `packages/ui/src/features/script/ScriptEditor.tsx` | 13.6% | 198 |
| `packages/ui/src/features/configuration/ConcatWorkbench.tsx` | 22.2% | 72 |
| `packages/ui/src/features/preview/preview-stream.ts` | 27.2% | 334 |
| `packages/api/src/transport/http.ts` | 29.3% | 75 |
| `packages/ui/src/features/settings/NetworkPanel.tsx` | 31.1% | 74 |
| `packages/ui/src/features/configuration/FilterComposer.tsx` | 31.9% | 182 |

The 192-line `EncoderEditor` is the clearest false signal. The file named
`EncoderEditor.test.tsx` imports `ParameterControl`; it has 10 tests for parameter widgets,
none for the encoder document editor, command preview, add-parameter flow, or fork controls.
`AboutPanel` has no direct test. Both can be at 0% while the package reports 62.6%.

### 3.2 Grade

Rubric: **A** 90–100 complete and enforced; **B** 80–89 strong with contained gaps; **C**
70–79 useful but inconsistent; **D** 60–69 partial; **F** below 60 or absent.

| Dimension | Weight | Grade | Score | Basis |
| --- | ---: | --- | ---: | --- |
| Strategy and test architecture | 10% | A− | 90 | Contract-first, fake-engine determinism, real router, isolated data, explicit non-goals. |
| Rust unit/route/persistence | 20% | B | 83 | 409/423/507, panic, silent death, disk full, corruption, property tests; route-method inventory and future migrations missing. |
| Frontend unit/component | 25% | C+ | 68 | Good harness and state tests, but 0% primary screens and only five of 17 routed screens with same-named tests. |
| E2E and system | 10% | B | 82 | Seven browser specs including six feature journeys, three hosts, LAN, lock scope, export, undo; no nightly real encode, 12 browser a11y checkpoints across six route families. |
| Contract tests | 10% | A− | 91 | 47 boundaries, AST enumeration, missing/orphan rejection, generated paths. |
| Coverage policy | 10% | C− | 60 | Measured, but line-only, aggregate, targets advisory, 2-point drop allows erosion. |
| Determinism and isolation | 5% | A− | 88 | TZ/locale/viewport fixed, no test sleeps, external request guard, temp data; CI retry 1. |
| CI enforcement | 5% | D+ | 58 | Three PR jobs and coverage checks exist; nightly, branch protection, full matrix, path filters absent. |
| Measurement and docs | 5% | C+ | 70 | Excellent prose, stale counts and timings, route matrix naming overstates behaviour. |
| **Weighted total** | **100%** | **B−** | **77** | |

The score is deliberately not “failed”. The tree has more real testing than most pre-release
desktops. The score says the project should not use “green” as synonymous with “covered”.

## 4. Findings

| ID | Severity | Finding | Consequence |
| --- | --- | --- | --- |
| F1 | high | Aggregate coverage hides untested primary modules. | A 0% encoder editor or settings panel can ship behind a 62.6% UI number. |
| F2 | high | The 68-cell matrix certifies loading/error/populated rendering, not user behaviour. 12 “empty” cells are N/A prose assertions. | “Every screen has four states” is not evidence that editing, saving, retries, or validation work. |
| F3 | high | The only enforceable coverage rule is a 2-point absolute line drop. Targets are advisory; functions and branches have no gate. | Coverage can slowly erode by up to 2 points per change, and low-value lines can mask missing branches. |
| F4 | high | 12 Rust tests are `#[ignore]`d and no nightly job runs them. | The real engine, VapourSynth, FFmpeg, and MKVToolNix paths are outside every automated gate. |
| F5 | medium | Browser axe checks 12 points across six of the 17 route families; jsdom disables contrast and target-size. | 11 route families lack a real-layout accessibility pass. |
| F6 | medium | `npm test` and `npm run check` do not run coverage checks. | A developer can pass the documented local aggregate while CI fails the coverage job. |
| F7 | medium | The 4.6 matrix mixes automated tests and a manual release check under “10/10”. | A reader cannot tell which rows are enforced; plan/implementation semantics drift. |
| F8 | medium | Test counts and timings in `testing.md` are stale: 703/110/27.8 s versus the current 821/116/41.1 s. | The documentation's “measured” evidence no longer matches the tree. |
| F9 | medium | Only five of the 17 routed screen components have same-named screen tests; `ProjectSectionScreen.test.tsx` only tests error/retry, and the template General test does not cover save/cancel/dirty. | Save/cancel/dirty and editor behaviour rely on matrix markers and E2E happy paths. |
| F10 | medium | E2E is one worker, `retries: 1` in CI, Windows-only, and has no flake trend. | A retry can hide a real race; platform coverage is narrower than the product matrix. |
| F11 | medium | `EncoderEditor.test.tsx` tests `ParameterControl`; `AboutPanel` has no test. | Test names and coverage reports create false confidence. |
| F12 | low | Scene validation has no property suite; project-loader fuzzing is deferred. | Enumerated cases are good; unenumerated malformed ranges and loader inputs remain open. |
| F13 | low | The screenshot gallery preview needs a directory server and AVIF MIME mapping. | A single-file preview returns 404 for every image; fixed for the local static server, but not guarded by a test. |
| F14 | low | The frontend coverage run spawns 116 workers and spends about 16 s on startup. | Wall-clock cost is high, but merging test files would trade isolation for speed; parallelize with Rust instead. |

## 5. Solution catalogue

Every candidate is listed once, grouped by layer. **Priority** is the recommended order, not
a commitment. Effort is S (under a day), M (1–3 days), L (more than 3 days).

### 5.1 Measurement and policy

| ID | Solution | Addresses | Effort | Priority |
| --- | --- | --- | --- | --- |
| M1 | Enforce the published targets as package floors now: API 70%, UI 60%, engine 72%, service 74%. Keep the baseline as a ratchet. | F3 | S | P0 |
| M2 | Reduce the tolerated drop from 2.00 to 0.25 percentage points and update the baseline only after review. | F3 | S | P0 |
| M3 | Add critical-file floors for primary screens and transport/persistence modules, starting at 50% lines or an explicit reviewed waiver. | F1 | M | P0 |
| M4 | Add changed-lines and new-file coverage in CI; report the diff coverage on every PR. | F1, F3 | M | P1 |
| M5 | Report and eventually gate function and branch coverage, not only lines. | F3 | S | P1 |
| M6 | Generate a test inventory from the actual runners and publish it as an artifact; stop hand-maintaining counts and timings in prose. | F8 | S | P0 |
| M7 | Add a coverage trend comment and a high-water-mark ratchet; do not add badges or per-line shaming. | F3 | S | P1 |
| M8 | Pilot mutation testing on three high-risk modules (config resolver, run supervisor, scene selection). | F1, F12 | M | P2 |
| M9 | Add branch-aware llvm-cov for Rust, with per-module floors rather than one crate aggregate. | F3 | M | P2 |

### 5.2 Rust

| ID | Solution | Addresses | Effort | Priority |
| --- | --- | --- | --- | --- |
| R1 | Generate a route-method × test matrix from `schema/routes/manifest.json`; fail when a method has no success/validation/not-found/locked case. | 4.1.5 | M | P0 |
| R2 | Add a named failure-mode fixture matrix covering fail-at-each-sequence, panic, silent death, cancel, disk full, and partial output; reuse the existing test runners. | 4.1.3, 4.6 | M | P0 |
| R3 | Expand persistence fault injection: torn write, permission failure, corrupt index, newer schema, and recovery after restart. | 4.1.6 | M | P1 |
| R4 | Add a schema-version fixture directory and migration-chain test harness now, with v1 as the only row; use it when v2 lands. | 4.1.7 | S | P2 |
| R5 | Add property tests for scene validation, log anonymisation, timeline ordering, and config materialisation. | F12 | S | P1 |
| R6 | Run the 12 environment-gated Rust targets on a scheduled nightly with generated media and retained logs. | F4 | L | P1 |
| R7 | Add a single-instance automation seam or keep the native check as an explicit release gate with its command and evidence in the matrix. | 4.6 row 8 | L | P2 |
| R8 | Use `cargo nextest` or a small concurrent runner for the gated targets; keep it out of PR CI. | F14 | S | P2 |

### 5.3 Frontend and accessibility

| ID | Solution | Addresses | Effort | Priority |
| --- | --- | --- | --- | --- |
| U1 | Create a behaviour suite for each of the 17 screen components: edit → validate → save → cancel, error → retry, and one empty/populated branch that the matrix cannot express. | F2, F9 | L | P0 |
| U2 | Split `EncoderEditor.test.tsx` into parameter-control tests and real `EncoderEditor` tests; add an `AboutPanel` test and a tab-panel marker assertion. | F11 | M | P0 |
| U3 | Raise coverage on the lowest primary modules: `ScriptEditor`, `preview-stream`, `PlayerTransport`, `NetworkPanel`, `FilterComposer`, `VideoGeneralScreen`, `AddVideosSheet`, `HomeScreen`. | F1 | M | P1 |
| U4 | Add project-section and template-section save/cancel/dirty tests with the real draft session, not only shared-hook tests. | 4.2.6 | M | P1 |
| U5 | Add direct tests for the HTTP transport and the query-cache update path; distinguish parser coverage from browser transport coverage. | F1 | S | P1 |
| U6 | Run browser axe on all 17 route families, including contrast and target size, with a populated marker and one interactive state per route. | F5, 4.3.9 | M | P0 |
| U7 | Add keyboard-parity tests for menus, dialogs, tabs, lists, and the command palette; axe does not prove operability. | F5 | M | P1 |
| U8 | Add a static-gallery smoke test: serve `dist/screenshots`, request every catalog image, assert HTTP 200, `image/avif`, and nonzero natural width. | F13 | S | P1 |
| U9 | Verify the Settings tab panels actually mount before an axe assertion; assert a panel-specific marker for every hash case. | F11 | S | P0 |

### 5.4 E2E and system

| ID | Solution | Addresses | Effort | Priority |
| --- | --- | --- | --- | --- |
| E1 | Add journeys for project/video configuration edit-save, template editing, encoder parameter editing, Settings, and script save; keep them focused and route-typed. | F2, F9 | L | P1 |
| E2 | Add a nightly real-encode 1 s clip smoke: create → run → progress → output → reload, with failure artifacts. | F4 | L | P1 |
| E3 | Replace the prose-only error matrix with a typed evidence registry: each row names a test id or an explicit manual release check. | F7 | S | P0 |
| E4 | Add a browser route sweep rather than more one-off axe calls; reuse `ROUTE_META` and a populated fixture transport. | F5 | M | P0 |
| E5 | Add a WebKit/WebView2 release smoke and a second-device LAN check; keep them out of PR CI. | platform gaps | L | P2 |
| E6 | Record flake attempts and retries; remove `retries` once a journey has a stable history. | F10 | S | P2 |
| E7 | Add security-negative E2E: foreign origin, expired token, wrong token, path traversal, and redaction of every path shape. | 4.6, security | M | P1 |
| E8 | Automate the single-instance focus check with a packaged app harness, or keep it manual with a signed evidence record. | 4.6 row 8 | L | P2 |

### 5.5 CI and operations

| ID | Solution | Addresses | Effort | Priority |
| --- | --- | --- | --- | --- |
| C1 | Add branch protection for the required checks and a merge queue; the repository has no such configuration. | F6, Phase 5 | M | P1 |
| C2 | Add `nightly.yml`: real encode, coverage trend, dependency audits, screenshot artifact, and issue creation on failure. | F4, Phase 5 | M | P1 |
| C3 | Add path filters and required gate jobs so a docs-only PR skips Rust without blocking merges. | Phase 5 | M | P1 |
| C4 | Run Vitest alongside Rust jobs; shard Playwright or use a matrix when the suite grows. | F14 | M | P2 |
| C5 | Add a CI assertion that the test inventory, coverage baseline, and docs counts match the run. | F8 | S | P1 |
| C6 | Add a periodic dependency/coverage report; keep screenshots advisory and never a pixel gate. | policy | S | P2 |

### 5.6 Rejected alternatives

These are deliberately **not** in the priority list:

| Alternative | Why not |
| --- | --- |
| 100% coverage as a gate | Encourages assertion-free tests and is especially meaningless for JSX and generated code. |
| Pixel-diff gating the screenshot gallery | Contradicts the approved advisory-gallery policy and makes font/platform noise a merge blocker. |
| Native-webview automation in PR CI | The historical `tauri-driver` attempt failed; keep native checks in the release checklist unless a reliable harness exists. |
| Real encodes on every pull request | Slow, environment-dependent, and duplicates the fake-runner route/state suite. Nightly only. |
| Replacing fake runners with a live service for unit tests | Loses determinism and makes lock/cancel tests timing-dependent. |
| Merging all frontend files into one Vitest worker | Saves about 16 s of startup but leaks jsdom state and turns one failure into many. Run suites in parallel instead. |
| Requiring the screenshot gallery for merge | Human review is the point; a required screenshot job would train people to ignore it. |

## 6. Prioritized proposal

### P0 — required to call Phase 4b complete

1. **Fix coverage policy semantics (M1, M2, M3, M6).** Enforce the published targets, add a
   review ratchet, add critical-file floors, and generate the test inventory. A package
   total may rise while a primary screen is untested; that is the failure mode to close.
2. **Add screen-behaviour suites (U1, U2, U4, U9).** Every route gets one real interaction
   test beyond the four-state matrix. Start with `EncoderEditor`, `AboutPanel`, the project
   and template section editors, `ScriptEditor`, `ScenesScreen`, `VideoGeneralScreen`, and
   `preview-stream`.
3. **Complete browser accessibility (U6, E4).** Run axe on all 17 route families with a
   populated marker and at least one interactive state; keep the jsdom pass as a fast
   pre-check, not the only coverage.
4. **Make the error matrix executable (R2, E3).** Each row names a test or an explicit
   manual release check. Automate fail-at-each-sequence, cancel, panic, silent death, and
   disk-full; state the accepted behaviour for corrupt projects and port collisions.
5. **Mechanically inventory Rust routes (R1).** A generated method matrix prevents a new
   route from being added without a status test.
6. **Make the local aggregate match CI (F6).** Either add coverage-enabled tests to
   `npm run check`, or introduce a documented `npm run verify` that includes them and use
   that name in the Phase 4 exit checklist.
7. **Correct the evidence wording (F7, F8).** Label the 68-cell matrix as a render matrix,
   distinguish manual from automated error rows, and replace stale counts with generated
   output.

### P1 — Phase 5 companion work

1. **Changed-lines and critical-file coverage (M4, M5).**
2. **Nightly real encode and dependency/coverage artifacts (R6, E2, C2).**
3. **Extended browser journeys for editing, settings, templates, and scripts (E1).**
4. **Transport and cache-path tests (U3, U5, E7).**
5. **Browser branch protection, path filters, and required gate jobs (C1, C3).**
6. **Gallery artifact smoke and test-inventory drift check (U8, C5).**
7. **Migration harness and scene property tests (R4, R5).**

### P2 — hardening after v0.1

1. Mutation testing pilot (M8) and branch-aware Rust coverage (M9).
2. WebKit/WebView2 and second-device checks (E5).
3. Native second-instance automation (R7, E8).
4. Fuzz/property testing of the project loader and timeline decoder.
5. Test sharding and flake telemetry once the suite grows (C4, E6).
6. Performance budgets for 5,000-scene selection and preview playback, reported but not
   gated on developer laptops.

### P3 — explicitly deferred

- 100% coverage.
- Screenshot pixel baselines.
- PR-time real encodes.
- Native webview automation without a reliable harness.
- Third-party sequence-plugin tests before the security review.

## 7. Proposed Phase 4b exit criteria

Replace “the pyramid is green” with a checklist that cannot be satisfied by a package total:

- [ ] API ≥ 70%, UI ≥ 60%, engine ≥ 72%, service ≥ 74%, enforced as floors, not advice.
- [ ] Frontend total ≥ 64.19% and each primary screen/transport module meets its reviewed
      floor or has a named waiver.
- [ ] Every one of the 17 route families has a behaviour test and a real-browser axe pass.
- [ ] Every Rust route method has a success, validation, not-found, and locked case where
      applicable.
- [ ] Every error-matrix row names an automated test or an explicit release check; the
      manual row is not counted as an automated test.
- [x] The 12 environment-gated Rust tests run on a nightly workflow.
- [ ] `npm test` (or `npm run verify`) runs the coverage policy locally.
- [ ] The test inventory, coverage baseline, and test counts are generated, not manually
      transcribed.
- [ ] No `sleep()` in tests; no test writes outside a temporary directory; no browser
      journey reaches an unapproved origin.
- [ ] The screenshot gallery remains advisory and has no pixel baseline.

## 8. Evidence limitations

- The Rust suite was not re-run successfully in this audit. `cargo test` reached linking
  and `link.exe` returned `0xc0000142`; the audit stopped the stale service and cargo
  processes, and no test assertion failure is reported. The Rust coverage figures are the
  recorded baseline, not a fresh measurement.
- The browser E2E suite was inspected, not re-run. Its two required prerequisites are a
  built desktop SPA and a built headless service; the existing documentation and workflows
  are the evidence for the journey inventory.
- The screenshot gallery was generated earlier in the same session and served through
  `scripts/serve-static.mjs`; all 70 images loaded in the preview after the AVIF MIME fix.
- Coverage is a line-oriented tool. It says which source lines ran; it does not prove an
  assertion would fail if the behaviour changed. That is why mutation testing, behaviour
  suites, and contract boundaries are in the proposal rather than a single higher number.

## 9. Decision requested

Choose one of these outcomes:

1. **Adopt P0 only** and keep Phase 4b open until the checklist in §7 passes. This is the
   recommended path for a v0.1 release candidate.
2. **Adopt P0 and P1** and close 4b when Phase 5 wires branch protection and nightly. This
   is the strongest path but delays the Phase 5 entry gate.
3. **Keep the current policy** and record the residual risks explicitly: untested primary
   screens, advisory targets, no nightly real encode, and no real-browser axe on 11 route
   families. This is acceptable only if the release notes and progress tracker say so.

The recommendation is **option 1 now, then option 2 as Phase 5 starts**. It preserves the
current deterministic suite and fixes the places where a green aggregate currently tells a
more optimistic story than the evidence supports.
