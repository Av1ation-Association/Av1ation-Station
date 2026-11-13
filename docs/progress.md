# Progress

The only current delivery-status surface. [README.md](README.md) is the documentation index;
the phase plans under `plan/` are historical planning records. Update this file in the same
pull request as the work.

**Legend:** `☐` not started · `◐` in progress · `☑` done · `⊘` blocked · `—` not applicable / deferred

---

## Dashboard

| Phase | State | Progress | Blocked by |
| --- | --- | --- | --- |
| 0 — Design | ☑ complete | documentation set reviewed, application boards approved, website design deferred to Phase 6, named app-board export pending | — |
| 1 — Scaffolding | ☑ complete | workspace, contracts, API/UI hosts, Tauri shell, guards, and developer scripts verified | — |
| 2 — Backend | ☑ complete | exit criterion met; API contract `v1`; raw engine stderr remains an upstream limitation | — |
| 3 — UI | ☑ complete | every screen, the scene editor, scene preview, charts, Logs, Monaco and LAN ship; axe pass and feature reorganization complete; Penpot live sync was unavailable, so no live board match is claimed | — |
| 4a — Spikes | ☑ | 5 / 5 with recorded verdicts | — |
| 4b — Testing | ☑ complete | real-service Playwright smoke, a validating fake-engine completion journey, held-open cancel/navigation journeys, a three-host capability pass (locked-scope writes and process-wide 409), LAN pairing, log filter/anonymised-export, foreign-origin/token/path-traversal security negatives, and scene bulk-configuration undo journeys, browser axe, an external-request guard, split E2E build/run with cached service and SPA artifacts, frontend and Rust coverage policy including changed-line reporting, split `verify:web`/`verify:rust` local gate with parallel `npm run verify`, CI test jobs, the unified both-theme screenshot gallery, the 68-cell four-state render matrix, boundary fixtures, and 10/10 error-path rows including the recorded native second-instance check | — |
| 5 — CI | ◐ | first PR workflow runs web, Rust, and browser E2E jobs behind always-on gates and skips them on docs-only pull requests; a scheduled nightly real-encode job now runs the 12 ignored tests; branch protection, release, and the remaining nightly jobs remain | — |
| 6 — Deployment | ◐ | local Windows bundled/system installers, portable ZIPs, and Linux bundled/system `.deb`/AppImage built; signing, macOS builds, updater, and website remain | Phase 5 |

**Current focus:** Phase 6 Windows/Linux pre-release packaging. Phases 3 and 4 are closed. 4.2.2 is
certified by the 68-cell four-state render matrix; 4.4's deterministic screenshot gallery and its
renderer-only CI artifact job are wired; 4.5's 47-fixture boundary coverage enumerates
every schema an API hook parses. The 4.6 matrix is complete: the native second-instance
check ran on the packaged Windows system build on 2026-11-12, where the second process
exited without a window and the first was restored from minimized and focused. The Phase 4b browser harness starts three headless services with
`--port 0`: a completing fake runner for create → add video → save → validate → run →
progress → completion → reload, a holding runner for start → navigate away and back via the run chip →
Save and leave / Discard → cancel → History, and a LAN-enabled holding runner for the
capability and pairing journeys. The capability journey proves active-video and project
writes return `423 LOCKED`, a sibling write succeeds, a second start returns `409 BUSY`, and
the in-place refusal is visible after a reload; the pairing journey exchanges the desktop
shortcode in a second browser context and creates a project and video over the network
origin. A log journey filters a completed run, enables the runner's source-path debug line,
and verifies the export preview redacts it; a security-negative journey refuses a foreign
origin and stale, wrong, or absent LAN tokens, and rejects path traversal outside the built
SPA; a scene journey selects two seeded ranges, writes
one bulk encoder document, and proves one undo restores both rows. Journeys run `axe` in
Chromium on the pipeline, General, Projects, History, pairing, and Logs screens, and a context
request guard aborts every non-service origin and asserts the list is empty at teardown. All
journeys use the typed run-journey module built on generated
paths and contracts, and the typed host module owns startup, health, the journal, logs, and
teardown. Each test attempt has a typed workspace with a unique project-name suffix, tracked
UI/HTTP projects, and cleanup after a pass. The draft-guard component harness covers clean
and blocked navigation, Stay, Discard, Save and leave, a rejected save, and the tab-switch
request path. `e2e/tsconfig.json` is part of `npm run typecheck`. The 68-cell four-state
matrix renders every route through `MockTransport`; the boundary registries have one
standalone fixture per hook shape and reject missing, orphaned, or unenumerated files; and
`npm run screenshots` captures 35 surfaces in both themes, publishes AVIF images with a
catalog and contact sheet, and can write a feature-only manifest for a selected group or
screen id. Its
workflow runs only on renderer paths and uploads an advisory artifact.

The lock and navigation pass of 2026-11-10 keeps project configuration and the encoding
video read-only, leaves sibling videos, other projects, and templates editable, allows
navigation during a run with a compact top-bar run chip, and still refuses every second start.

---

## Phase details

### Phase 4b — Testing (closed 2026-11-13)

| Item | State | Evidence |
| --- | --- | --- |
| 4.1 Rust tests | ☑ | 492 workspace tests pass (12 ignored); engine 73.90% and service 80.05% lines against enforced floors; the route matrix and failure, persistence, and property suites cover the reviewed cases. Schema v1 has no historical migration. |
| 4.2 Frontend tests | ☑ | coverage is enforced with 70%/60% floors, a 0.25-point ratchet, and critical-file floors; changed-line coverage reports existing frontend files and gates new files at 80%; the P0 screen-behaviour pass covers all 17 routed screens, including Scenes bulk encoder writes, the confirmed History run deletion, Settings hash-tab navigation, the encoder editor, About, Video General, ScriptEditor and the project, video, and template script pages, Transport, Network, FilterComposer, Home, AddVideos, and the project, video, and template section editors; a curated mutation pilot covers scene selection, config resolution, and run supervision (9/13 killed in the initial run, with the four survivors recorded as P2 hardening) |
| 4.2.2 Four-state certification | ☑ | 68 render cells over 17 route families; Pairing gate certified by LAN E2E, 12 structural N/A reasons recorded; behaviour is covered separately by the screen suites |
| 4.3 E2E | ☑ | 15 Playwright tests pass, including the all-route Chromium axe sweep; nine error-path rows are automated and the native second-instance row is a recorded release check; nightly runs the 12 ignored real-encode tests. |
| 4.4 Screenshots | ☑ | 35-surface both-theme gallery, AVIF catalog and contact sheet, optional feature manifest, renderer-only CI artifact, and `check:gallery` decoding every catalog image from a served copy |
| 4.5 Contract tests | ☑ | 47 hook-boundary fixtures (45 generated + 2 local) with missing/orphan and hook-enumeration checks; drift checks unchanged |
| 4.6 Error-path matrix | ☑ | 10 / 10 rows recorded; the native second-instance check ran against the packaged Windows system build on 2026-11-12 |

The spike verdicts and measurements live in [spikes/](spikes/) and [testing.md](testing.md).
The five gates passed; their records are evidence, not a second status tracker.

### Phase 5 — CI

| Item | State | Remaining |
| --- | --- | --- |
| 5.1 `ci.yml` | ◐ | web, Rust, and browser E2E jobs run; the full job matrix is incomplete |
| 5.2 `nightly.yml` | ◐ | the real-encode and coverage-trend jobs run; issue creation, screenshot generation, and dependency audits remain |
| 5.3 Branch protection | ☐ | required checks are not configured; require `Web checks gate`, `Rust checks gate`, and `Browser E2E gate` |
| 5.4 Caching and path filters | ☑ | cache steps exist; E2E cold/warm timings are recorded in `testing.md`; docs-only pull requests skip the heavy runners while the always-on gates report the required-check names |

### Phase 6 — Deployment

| Item | State | Remaining |
| --- | --- | --- |
| Installers and signing | ◐ | local Windows MSI/NSIS and bundled/system portable ZIPs plus Linux bundled/system `.deb`/AppImage; signing, macOS builds, and clean-VM checks remain |
| Updater and uninstall | ☐ | update delivery, rollback, and clean uninstall |
| Website | ☐ | design round and public build, including the `MockTransport` demo |
| Bundled toolchain | ◐ | Windows x64 staging is complete; Linux stages a partial tree; the pinned lock and verifier are pending, and both add VapourSynth after the relocation spike |
| Release transparency | ☐ | notices, SBOM, source offer, and final size measurements |

---

## Known gaps and release checks

| Gap | Impact | Next |
| --- | --- | --- |
| Penpot live file unavailable | Screen work cannot be checked against the approved live board; the known board discrepancies remain unverified | Reconnect the Penpot MCP and compare before the next screen change (AGENTS.md §2.12) |
| Named application-board export | The archived design set is not captured as a named version | Export when Penpot is reachable; not a Phase 1 blocker |
| `4.2.2` four-state certification | Certified by the 68-cell four-state render matrix, not as behaviour coverage; the separate screenshot catalog supplies the visual record | Add a route to `ROUTE_META` and its fixture detail to `packages/ui/src/test/route-cases.ts`; the matrix and axe pass derive from them |
| Full E2E journey | The smoke plus seven browser journeys, nine automated error-path rows, and the native second-instance release check exist; the nightly real-encode gate is now scheduled | — |
| Rust and frontend coverage | Package floors are enforced (72%/74% engine/service, 70%/60% API/UI), the ratchet allows 0.25 points, primary screens have critical-file floors, and `--modules` reports branch and function coverage beside lines | Keep `scripts/coverage-baseline.json` current after a reviewed coverage change; run `npm run check:test-inventory` after regenerating the inventory |
| Screenshot review set | The screenshot gallery uploads an advisory CI artifact; there is no pixel baseline or required check | Review the artifact on renderer changes; never add a merge gate |
| Branch protection and nightly | A red check does not yet block merge; the nightly real-encode job exists while the remaining nightly jobs wait | Phase 5 |
| Second-device LAN parity | Same-host pairing is verified; a second physical device is not | Phase 6 release check |
| Safari/WebKit preview | Chromium and the WebView2 family are verified; WebKit is not | Phase 6 release check |
| macOS/Linux VapourSynth relocation | The executable toolchain stages; the VapourSynth runtime waits on a signed relocation spike | Phase 6 |
| Linux bundled provider set | The staged tree carries the Debian encoders, FFmpeg, MKVToolNix, the scene model and their copied runtime libraries, with no pinned lock or verifier; VapourSynth/Python and the native metrics stay on System | Pin the Debian inputs, then add VapourSynth and metrics after the relocation and audit gates |
| Linux glibc floor | The engine's prebuilt ONNX Runtime requires glibc 2.38 and the current build emits GLIBC_2.39; Debian 12/Ubuntu 22.04 cannot link it | Ship the Debian 13/Ubuntu 24.04 pre-release; a custom ORT or lower-glibc build is needed to lower the floor |
| Raw engine stderr | Some upstream failures are not attributed to a sequence | Track upstream; failure text is already in `run.jsonl` |
| GitHub default branch | The implementation is on `condor`; `main` is still the Electron archive | Owner branch migration after the baseline commit |

---

## Deferred features

| Feature | Lands in | Why deferred |
| --- | --- | --- |
| Bundled VapourSynth on macOS and Linux | 6, after the relocation spike | the runtime must be signed and probed from a moved tree |
| Third-party sequence plugins | post-1.0 | needs a security review |
| Fuzzing the project loader | post-1.0 | valuable, not required for v0.1 |
