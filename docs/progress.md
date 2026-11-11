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
| 4b — Testing | ◐ | real-service Playwright smoke, frontend coverage, and CI test jobs started; full journey, screenshots, Rust coverage, and the four-state certification remain | — |
| 5 — CI | ◐ | first PR workflow runs web, Rust, and browser-smoke jobs; branch protection, nightly, release, and the full job matrix remain | Phase 4 |
| 6 — Deployment | ☐ | per-target packaging contract recorded and planned as 6.15–6.23; installers not started | Phase 5 |

**Current focus:** Phase 4b. Phase 3 is closed; 4.2.2 remains the formal per-route component and
screenshot certification and is not claimed by the Phase 3 close-out.

The lock and navigation pass of 2026-11-10 keeps project configuration and the encoding
video read-only, leaves sibling videos, other projects, and templates editable, allows
navigation during a run with a compact top-bar run chip, and still refuses every second start.

---

## Open work

### Phase 4b — Testing

| Item | State | Remaining |
| --- | --- | --- |
| 4.1 Rust tests | ◐ | coverage measurement and the remaining engine and service edge cases |
| 4.2 Frontend tests | ◐ | coverage thresholds and the full component pass |
| 4.2.2 Four-state certification | ☐ | per-route loading, empty, error, and populated certification |
| 4.3 E2E | ◐ | one Chromium smoke exists; the full desktop and LAN journey suite is not wired |
| 4.4 Screenshots | ☐ | CI artifact job and advisory review set |
| 4.5 Contract tests | ◐ | drift checks exist; response-shape coverage continues with new routes |
| 4.6 Error-path matrix | ☐ | 0 / 10 rows recorded |

The spike verdicts and measurements live in [spikes/](spikes/) and [testing.md](testing.md).
The five gates passed; their records are evidence, not a second status tracker.

### Phase 5 — CI

| Item | State | Remaining |
| --- | --- | --- |
| 5.1 `ci.yml` | ◐ | web, Rust, and browser-smoke jobs run; the full job matrix is incomplete |
| 5.2 `nightly.yml` | ☐ | not started |
| 5.3 Branch protection | ☐ | required checks are not configured |
| 5.4 Caching and path filters | ◐ | cache steps exist; path filters and warm-cache timings are unvalidated |

### Phase 6 — Deployment

| Item | State | Remaining |
| --- | --- | --- |
| Installers and signing | ☐ | Windows, macOS, and Linux packaging, signing, notarisation, and checksums |
| Updater and uninstall | ☐ | update delivery, rollback, and clean uninstall |
| Website | ☐ | design round and public build, including the `MockTransport` demo |
| Bundled toolchain | ◐ | Windows x64 staging is complete; the pinned lock and verifier are pending, and macOS/Linux add VapourSynth after the relocation spike |
| Release transparency | ☐ | notices, SBOM, source offer, and final size measurements |

---

## Known gaps and release checks

| Gap | Impact | Next |
| --- | --- | --- |
| Penpot live file unavailable | Screen work cannot be checked against the approved live board; the known board discrepancies remain unverified | Reconnect the Penpot MCP and compare before the next screen change (AGENTS.md §2.12) |
| Named application-board export | The archived design set is not captured as a named version | Export when Penpot is reachable; not a Phase 1 blocker |
| `4.2.2` four-state certification | Phase 3 does not claim per-route component and screenshot certification | Complete in Phase 4b |
| Full E2E journey | One Chromium smoke does not cover every journey or LAN mode | Wire the journey suite in Phase 4b |
| Rust and frontend coverage | Rust has no coverage artifact; frontend coverage is reported but not gated | Add Rust coverage and frontend thresholds in Phase 4b |
| Screenshot review set | No CI artifact job | Add advisory screenshots; never a merge gate |
| Branch protection and nightly | A red check does not yet block merge; no nightly run | Phase 5 |
| Second-device LAN parity | Same-host pairing is verified; a second physical device is not | Phase 6 release check |
| Safari/WebKit preview | Chromium and the WebView2 family are verified; WebKit is not | Phase 6 release check |
| macOS/Linux VapourSynth relocation | The executable toolchain stages; the VapourSynth runtime waits on a signed relocation spike | Phase 6 |
| Raw engine stderr | Some upstream failures are not attributed to a sequence | Track upstream; failure text is already in `run.jsonl` |
| GitHub default branch | The implementation is on `condor`; `main` is still the Electron archive | Owner branch migration after the baseline commit |

---

## Deferred features

| Feature | Lands in | Why deferred |
| --- | --- | --- |
| Bundled VapourSynth on macOS and Linux | 6, after the relocation spike | the runtime must be signed and probed from a moved tree |
| Third-party sequence plugins | post-1.0 | needs a security review |
| Fuzzing the project loader | post-1.0 | valuable, not required for v0.1 |
