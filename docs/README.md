# Documentation

This directory is normative. Where a document and the code disagree, the document is
wrong and must be fixed in the same pull request as the code.

## Index

| Document | Scope |
| --- | --- |
| [architecture.md](architecture.md) | topology, process model, workspace layout, dependency direction, runtime flows |
| [backend.md](backend.md) | Rust crates, engine integration, concurrency, persistence, errors |
| [frontend.md](frontend.md) | React app, transport façade, state strategy, styling, animation, a11y, screens |
| [frontend-penpot.md](frontend-penpot.md) | Penpot file structure, token contract, handoff ritual, design-complete definition |
| [contracts.md](contracts.md) | JSON Schema → TypeScript/Zod pipeline, encoder parameters, filter descriptors |
| [filter-catalogue.md](filter-catalogue.md) | every engine input filter, its fields, controls, and app-owned constraints |
| [data-model.md](data-model.md) | `Condor` model mapping, config inheritance, derived state |
| [preview.md](preview.md) | scene editor, VapourSynth reload, fragmented-MP4 preview |
| [testing.md](testing.md) | test pyramid, fixtures, screenshot policy, feasibility spikes |
| [security.md](security.md) | LAN exposure, auth, threat model, log anonymisation |
| [decisions.md](decisions.md) | ADR log and this assumption register's history |
| [plan/00-overview.md](plan/00-overview.md) | phase map and sequencing |
| [plan/01-scaffolding.md](plan/01-scaffolding.md) | repository, workspace, dependency and shell tasks |
| [plan/02-backend.md](plan/02-backend.md) | engine integration, persistence, HTTP and preflight tasks |
| [plan/03-ui.md](plan/03-ui.md) | shell, screens, configuration renderer and guards |
| [plan/04-testing.md](plan/04-testing.md) | test pyramid, fixtures and spike procedures |
| [plan/05-ci.md](plan/05-ci.md) | pipeline jobs, caching and branch protection |
| [plan/06-deployment.md](plan/06-deployment.md) | release matrix, signing, packaging and updates |
| [progress.md](progress.md) | live status tracker |

## Start here

| If you need to answer… | Read |
| --- | --- |
| what the system is made of, and which way dependencies point | [architecture.md](architecture.md) |
| what the service does with the engine, a run, or a config write | [backend.md](backend.md) + [data-model.md](data-model.md) |
| what a screen, route, interaction or state should be | [frontend.md](frontend.md) |
| what the design file must contain before code starts | [frontend-penpot.md](frontend-penpot.md) |
| which encoder parameter, filter or widget field exists | [contracts.md](contracts.md) + [filter-catalogue.md](filter-catalogue.md) |
| how preview works and which spike gates it | [preview.md](preview.md) |
| what must be tested and which experiments must pass | [testing.md](testing.md) |
| why a choice was made, or which assumptions are still open | [decisions.md](decisions.md) + the register below |
| what is happening now and what comes next | [progress.md](progress.md) + [plan/00-overview.md](plan/00-overview.md) |

## Conventions

- **Decisions are numbered `D1…Dn`** in [decisions.md](decisions.md). Anything that is
  not in that file is not a decision, it is an accident.
- **Assumptions are numbered `A1…An`** in the register below. An assumption is a
  decision made without the user's explicit confirmation. Each has a default, a
  rationale, and a phase before which it must be confirmed or replaced.
- **Spikes are numbered `S1…Sn`** in [testing.md](testing.md). A spike is a throwaway
  experiment whose only deliverable is a verdict.
- Requirements language: **must**, **should**, **may** carry their RFC 2119 meanings.

## Assumption register

These exist because the scaffolding must not be blocked on open questions. Each one is
a real decision already made, written down so it can be reversed cheaply. All nine were
confirmed on 2026-10-30; the phase column records where the assumption is first exercised.

| ID | Assumption | Exercised in |
| --- | --- | --- |
| A1 | **v0.1 scope** — home, settings, about, project configuration defaults, video queue, video configuration with inheritance, video timeline, logs, and one real end-to-end encode. Monaco editing, scene editor, preview, and charts ship in later increments. | 2 |
| A2 | **Persistence** — one JSON document per project under the app-data directory, plus a small rebuildable index for the home screen. No SQLite or other embedded database; the execution timeline is append-only JSONL. | 2 |
| A3 | **Test stack** — Vitest for unit/component, Playwright against a real headless service binary for E2E, `cargo test` with fake sequences for Rust. Screenshots are generated in CI as artifacts for human review and never gate a merge; the same suite runs locally on demand. | 4 |
| A4 | **`mpv` is not used.** Preview renders through `<video>` with a fragmented-MP4 stream in both the desktop app and the browser, preserving the single-source-of-truth rule. S2 verifies play/seek on each platform. | 4a (spike S2); Phase 3 increment 3 |
| A5 | **Node 26 LTS** — `.nvmrc` and CI pin 26; local development is verified with 26.13.0. | 1 |
| A6 | **No multi-window.** The desktop app is a single window; secondary views are routes. This keeps the encode guard and the LAN session model simple. | 3 |
| A7 | **Auth for LAN access** — a per-run bearer token plus a QR/deep-link handoff; no user accounts, no password database. When LAN mode is off, the server binds loopback only and needs no token; when on, every non-static request requires the token, including loopback, so the rules never vary by source address. | 3 |
| A8 | **License** — the combined work is GPL-3.0 because `andean-condor` is GPL-3.0. | 1 |
| A9 | **`andean-condor` is pinned to a commit**, not a branch or tag. Cargo resolves its three path-sibling metric crates from the same git source; the engine's transitive `av-decoders` and `av-scenechange` branches are pinned in `Cargo.lock` and built with `--locked` (D30). | 1 |

### Reversing an assumption

1. Change the row above to `Superseded by Dxx`.
2. Add the new decision to [decisions.md](decisions.md).
3. Update every document that referenced the assumption.
4. If it affected a completed phase, add a task to [progress.md](progress.md) rather than
   silently diverging.
