# Phase Plan — Overview

> **Planning record.** Current delivery status lives in [progress.md](../progress.md).

## 1. Purpose

Phase 0 plus five delivery phases, executed in order, each with a definition of done. The
order exists to remove risk early and to avoid building UI against an API that will change.

```mermaid
flowchart LR
    P0["Phase 0<br/>Design"] --> P1["Phase 1<br/>Scaffolding"]
    P1 --> P2["Phase 2<br/>Backend"]
    P1 --> P4a["Phase 4a<br/>Spikes"]
    P4a --> P3["Phase 3<br/>UI"]
    P2 --> P3
    P3 --> P4["Phase 4<br/>Testing"]
    P4 --> P5["Phase 5<br/>CI and delivery"]
```

Phase 4 is split deliberately: **spikes run early** (right after scaffolding), because
their verdicts decide what Phase 3 can build. The rest of Phase 4 (the full pyramid) runs
after the UI exists.

## 2. Why this order

| Ordering rule | Reason |
| --- | --- |
| Backend before UI | The UI is generated largely from contracts; writing screens first means rewriting them. |
| Spikes before UI | Preview and drag-select are the two features that could force an architectural change. Building them last means building them twice. |
| Testing after UI (mostly) | E2E needs screens. Unit tests are written continuously; Phase 4 is where the *pyramid* is completed and enforced. |
| CI after testing | There is no point automating checks that do not exist. |
| Release work last | Signing, notarisation, and updater infrastructure are only needed when artifacts are worth shipping. |

## 3. Phase summary

| Phase | Plan | Goal | Exit criterion |
| --- | --- | --- | --- |
| 0 | this doc set | decide and document everything | documents reviewed; no open question that blocks Phase 1; the application board set (`00`–`10`) approved. The public website is exempt from that set, so it is not a Phase 0 gate |
| 1 | [01-scaffolding.md](01-scaffolding.md) | the application builds and launches | `npm run dev` shows a real screen backed by a real endpoint |
| 2 | [02-backend.md](02-backend.md) | the engine runs behind a stable API | one real encode completes end-to-end through HTTP |
| 3 | [03-ui.md](03-ui.md) | every v0.1 screen is real | all v0.1 journeys work in the desktop app and a LAN browser |
| 4 | [04-testing.md](04-testing.md) | coverage is complete and spikes are resolved | the pyramid is green and S1–S5 have recorded verdicts |
| 5 | [05-ci.md](05-ci.md) | every check is automated and a tagged release ships | a pull request cannot merge with a red or missing check; a signed release installs, updates, and uninstalls cleanly; the public site is published |

## 4. Cross-phase rules

1. **Every phase keeps the build green.** No phase ends with a known broken build.
2. **Every phase updates [progress.md](../progress.md).** A phase that is not in the tracker
   did not happen.
3. **A decision change mid-phase is opened in [decisions.md](../decisions.md) first**, then
   folded into the owning document when accepted. The code follows the accepted rule, not
   the other way round.
4. **No phase implements a later phase's feature "while we are here."** Scope creep is how
   the previous application accumulated 20 recorded defects.
5. **Each phase ends with a retrospective note** in `progress.md`: what took longer than
   expected, and what to change in the next phase's plan.

## 5. v0.1 feature sequencing

Features deliberately staged across the increments. The phase column records where each
was scheduled; implementation status lives in [progress.md](../progress.md).

| Feature | Landed in | Scaffolding implication |
| --- | --- | --- |
| Monaco VapourSynth editor + Python formatting/linting | 3 (increment 2) | lazy chunk; Monaco loaded only when a script input is edited |
| Scene list, multi-select, drag-select | 3 (increment 3) | virtualization chosen now; selection store shape reserved |
| Scene editing and validation | 3 (increment 3) | scenes are the engine's own; edits write `condor.scenes[i].encoder` and ranges, with no `custom` side table |
| Scene data injected into the script | 2 (documentation view), 3 (script editor) | `Input::VapourSynthScript::variables` is the carrier; the key table and current values ship in `VideoState.script_data`; the `.pyi` stub ships with the scene-data module; S5 passed and the default template is a whole-clip no-op with optional per-scene examples  |
| Preview sources (`Original`, `Decode`, `Encode`) on one player | 3 (increment 3) | `/preview/*` routes reserved; cache directory reserved |
| Video execution timeline | 2 | append-only JSONL per video; separate from derived state |
| ECharts analytics | 3 (increment 3) | chart theme bound to CSS tokens now |
| Anonymised log export | 3 (increment 2) | log format JSONL from day one; anonymiser is a pure function |
| Encoder parameter catalogue UI | 2 | descriptors generated from the engine, not hardcoded |
| User-defined encoders via `--help` probe + JSON `$schema` | 2 | schema published with contracts |

The one thing scaffolding must get right for these is **directory layout and lazy-loaded
chunk boundaries**, because those are expensive to change later.

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation | Phase |
| --- | --- | --- | --- | --- |
| Transitive engine decoder versions move under a new engine rev | low | high — blocks all builds | released `av-decoders`/`av-scenechange` locked in `Cargo.lock`; review on engine bumps; build with `--locked`; vendor fallback documented  | 1 |
| VapourSynth/ffms2 native setup differs per machine | high | medium | the release bundles the toolchain ; preflight reports the selected provider and still offers a fix-it path for system choices | 1, 6 |
| A bundled dependency is unreviewable or drifts from what was audited | medium | high | `packaging/toolchain.lock.json` plus a required verify job; release publishes notices, SBOM and source offer  | 5, 6 |
| Preview infeasible on some platform (S2) | medium | high — architecture exemption | spike before UI; documented degradation path | 4a |
| Decoder re-init too slow to feel usable (S1) | medium | medium — UX downgrade | prepared-range model; pre-warm; honest progress | 4a |
| Upstream engine API changes | medium | medium | `EncodeEvent` adapter isolates the surface | continuous |
| Diagram/graph point counts too large to render | low | low | ECharts canvas + dataZoom; virtualized log | 3 |
| Per-scene script template defeats decoder cache | medium | medium — the script editor ships a whole-clip template and the data module, not a per-scene one | S5 compares splice, single-pass and precomputed-range templates before the editor promises one; the default is a no-op  | 4a |
| Rust build times slow CI | high | low–medium | cache `dist/cargo/`, split jobs, build headless binary once | 5 |
| Screen reader/keyboard coverage incomplete | medium | medium | axe in component tests; keyboard parity in review checklist | 3 |
| Two hosts drift apart | low | high | one bundle, transport injection, E2E exercises HTTP | 1, 3 |
