# Documentation

The architecture documents in this directory are normative. Where one and the code
disagree, the document is wrong and must be fixed in the same pull request as the code.
Plans, dated records, and benchmark evidence describe intent or measured evidence; they are
not current behaviour. Current delivery status lives only in [progress.md](progress.md).

## Index

### Process and contribution

| Document | Scope |
| --- | --- |
| [../AGENTS.md](../AGENTS.md) | binding rules for anyone — human or agent — writing code |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | local setup, build and test commands, packaging, and the pull-request workflow |

### System and contracts

| Document | Scope |
| --- | --- |
| [architecture.md](architecture.md) | topology, process model, workspace layout, where changes belong, dependency direction, runtime flows |
| [data-model.md](data-model.md) | `Condor` model mapping, config inheritance, derived state |
| [backend.md](backend.md) | Rust crates, engine integration, concurrency, persistence, errors |
| [api.md](api.md) | HTTP surface, route naming and exceptions, input and script documents, preview media, and the generated route table |
| [runs.md](runs.md) | sequence catalogue, valid transitions, run loop, live checkpoint data, progress fan-out, derived state |
| [contracts.md](contracts.md) | JSON Schema → TypeScript/Zod pipeline, encoder parameters, filter descriptors |
| [preflight.md](preflight.md) | required tools, bundled and system providers, custom executables, metric backends, optional language server |
| [packaging.md](packaging.md) | bundled toolchain contents, layout, provider selection, lock, and release transparency; the Phase 5 packaging contract |
| [releases.md](releases.md) | weekly, RC, and stable channels; tags and versions; platform matrix; unsigned distribution; updater and audit policy |
| [security.md](security.md) | LAN exposure, auth, threat model, log anonymisation, bundled supply chain |

### Implementation maps

| Document | Scope |
| --- | --- |
| [engine.md](engine.md) | engine module map, visibility, and where a change in the adapter belongs |
| [service.md](service.md) | service module map, group ownership, and where a service change belongs |
| [frontend.md](frontend.md) | React app, transport façade, state strategy, styling, animation, and a11y |
| [screens/README.md](screens/README.md) | per-surface screen contracts: Home, Settings, shell, Project, script editor, Video |
| [frontend-penpot.md](frontend-penpot.md) | Penpot file structure, token contract, handoff ritual, design-complete definition |
| [filter-catalogue.md](filter-catalogue.md) | every engine input filter, its fields, controls, and app-owned constraints |
| [preview.md](preview.md) | scene editor, VapourSynth reload, fragmented-MP4 preview |
| [website-docs.md](website-docs.md) | public manual inventory: page set, task recipes, focused samples, screenshot cases, authoring and build checks |

### Reference

| Document | Scope |
| --- | --- |
| [commands.md](commands.md) | every npm script, grouped by purpose, with the four local gates first |
| [glossary.md](glossary.md) | definitions of project terms and their primary locations |

### Quality and delivery

| Document | Scope |
| --- | --- |
| [testing.md](testing.md) | test pyramid, fixtures, screenshot policy, feasibility spikes |
| [test-inventory.md](test-inventory.md) | generated Vitest and Playwright test inventory; do not edit by hand |
| [route-test-matrix.md](route-test-matrix.md) | generated route-method × Rust-test matrix from the route manifest |
| [error-evidence.json](error-evidence.json) | typed evidence registry behind the error-path table |
| [plan/00-overview.md](plan/00-overview.md) | phase map and sequencing |
| [plan/01-scaffolding.md](plan/01-scaffolding.md) | repository, workspace, dependency and shell tasks |
| [plan/02-backend.md](plan/02-backend.md) | engine integration, persistence, HTTP and preflight tasks |
| [plan/03-ui.md](plan/03-ui.md) | shell, screens, configuration renderer and guards |
| [plan/04-testing.md](plan/04-testing.md) | test pyramid, fixtures and spike procedures |
| [plan/04-testing-coverage-proposal.md](plan/04-testing-coverage-proposal.md) | Phase 4 coverage inventory, testing-practice audit, and prioritized improvement proposal |
| [plan/05-ci.md](plan/05-ci.md) | pipeline jobs, caching, branch protection, the release matrix, signing and updates |
| [plan/06-product-backlog.md](plan/06-product-backlog.md) | post-RC product backlog and the first-stable gate |
| [plan/07-quality-hardening.md](plan/07-quality-hardening.md) | pre-release quality hardening, generated-artifact gates, and maintainability fixes |
| [progress.md](progress.md) | the only current delivery-status surface, with every open phase task |
| [decisions.md](decisions.md) | open post-baseline decisions |
| [changelog.md](changelog.md) | post-baseline dated implementation history; empty until the first entry |

### Evidence and design records

| Record | Scope |
| --- | --- |
| [benchmarks/playback.md](benchmarks/playback.md) | measured scene-player frame rate, stalls, seek latency, and memory |
| [benchmarks/thumbnails.md](benchmarks/thumbnails.md) | measured scene-thumbnail extraction and cache strategies |
| [spikes/S1-decoder-init.md](spikes/S1-decoder-init.md) | decoder initialization and prepared-source switch cost |
| [spikes/S2-fmp4.md](spikes/S2-fmp4.md) | fragmented-MP4 preview transport, play, and seek |
| [spikes/S3-lan-latency.md](spikes/S3-lan-latency.md) | LAN media time to first frame |
| [spikes/S4-drag-sweep.md](spikes/S4-drag-sweep.md) | 5,000-scene selection and virtualization |
| [spikes/S5-template.md](spikes/S5-template.md) | per-scene VapourSynth template comparison |

## Start here

| If you need to answer… | Read |
| --- | --- |
| how to set up, run, test, or package the application | [CONTRIBUTING.md](../CONTRIBUTING.md) + [AGENTS.md](../AGENTS.md) |
| which command to run for a local check, verification, E2E, or real encode | [commands.md](commands.md) |
| what the system is made of, and which way dependencies point | [architecture.md](architecture.md) |
| what a term means, or where an area of responsibility lives | [glossary.md](glossary.md) + [architecture.md](architecture.md#31-where-a-change-belongs) |
| what the service does with the engine, a run, or a config write | [backend.md](backend.md) + [runs.md](runs.md) + [data-model.md](data-model.md) |
| which tools are required, or why an action is unavailable | [preflight.md](preflight.md) |
| where a change in the engine adapter belongs | [engine.md](engine.md) + [backend.md](backend.md) |
| where a change in the service belongs | [service.md](service.md) + [backend.md](backend.md) |
| what a screen, route, interaction or state should be | [screens/README.md](screens/README.md) + [frontend.md](frontend.md) |
| what the design file must contain before code starts | [frontend-penpot.md](frontend-penpot.md) |
| which encoder parameter, filter or widget field exists | [contracts.md](contracts.md) + [filter-catalogue.md](filter-catalogue.md) |
| how preview works and which spike gates it | [preview.md](preview.md) |
| which API route exists, or how to add one | [api.md](api.md#3-routes) + [AGENTS.md](../AGENTS.md#215-routes-are-declared-once-and-derived) |
| what must be tested and which experiments must pass | [testing.md](testing.md) |
| why a choice was made, or which assumptions are still open | the owning architecture document + [decisions.md](decisions.md) for open post-baseline decisions + the register below |
| what ships in the installer, or which provider a tool comes from | [packaging.md](packaging.md) |
| which release channel, tag, version, or platform artifact a build belongs to | [releases.md](releases.md) |
| what is happening now and what comes next | [progress.md](progress.md) |
| how the phases are sequenced | [plan/00-overview.md](plan/00-overview.md) |

## Reading paths

| Goal | Read in order |
| --- | --- |
| make a first contribution | [CONTRIBUTING.md](../CONTRIBUTING.md) → [AGENTS.md](../AGENTS.md) → [architecture.md](architecture.md) → [testing.md](testing.md) |
| understand the system | [architecture.md](architecture.md) → [glossary.md](glossary.md) → [backend.md](backend.md) → [frontend.md](frontend.md) → [testing.md](testing.md) |
| change the engine or service | [engine.md](engine.md) → [service.md](service.md) → [backend.md](backend.md) → [data-model.md](data-model.md) |
| change a screen | [frontend.md](frontend.md) → [screens/README.md](screens/README.md) → the surface page → [frontend-penpot.md](frontend-penpot.md) |
| change a boundary type | [contracts.md](contracts.md) → [data-model.md](data-model.md) → [backend.md](backend.md) |
| add or change an API route | [AGENTS.md](../AGENTS.md#215-routes-are-declared-once-and-derived) → [service.md](service.md) → [api.md](api.md#3-routes) |
| prepare a release | [releases.md](releases.md) → [packaging.md](packaging.md) → [security.md](security.md) → [plan/05-ci.md](plan/05-ci.md#15-release-workflow) → [progress.md](progress.md) |

## Conventions

- **Status has one owner.** [progress.md](progress.md) is the only place that states phase
  delivery status. The root README may state pre-release availability and link to the public
  download page; it links here for phase status. Phase plans under `docs/plan/` are historical
  records:
  they keep tasks, exit criteria, and checkboxes as evidence, and open with a banner pointing
  to `progress.md`. Domain documents keep durable technical facts and limitations; they do
  not restate delivery status. `npm run check:docs` rejects a status block in the root README
  and a plan without its banner.
- **Navigation has one owner.** This index is the only documentation map. The root README is
  the end-user entry point and links here; it does not duplicate the index or the phase table.
- **Post-baseline decisions are opened in [decisions.md](decisions.md)** and numbered
  sequentially. Once accepted, their rule and rationale move to the owning architecture
  document and the entry is removed; choices already stated there are not repeated in the
  log.
- **Assumptions are numbered `A1…An`** in the register below. An assumption is a
  decision made without the user's explicit confirmation. Each has a default, a
  rationale, and a phase before which it must be confirmed or replaced.
- **Spikes are numbered `S1…Sn`** in [testing.md](testing.md). A spike is a throwaway
  experiment whose only deliverable is a verdict.
- **Long reference documents open with `Contents`.** A reference document under `docs/`
  other than this index, with six or more H2 headings, must list every heading in order with
  its exact anchor; `npm run check:docs` verifies the map. Execution plans under `docs/plan/`
  and spike records under `docs/spikes/` are exempt because they are process records, not
  reference material. Link to the section anchor, not to a file position, so a
  cross-document reference keeps working when prose moves.
- Requirements language: **must**, **should**, **may** carry their RFC 2119 meanings.

## Assumption register

These exist because the scaffolding must not be blocked on open questions. Each one is
a real decision already made, written down so it can be reversed cheaply. All nine were
confirmed on 2026-10-30; the phase column records where the assumption is first exercised.

| ID | Assumption | Exercised in |
| --- | --- | --- |
| A1 | **v0.1 scope** — home, settings, about, project configuration defaults, video queue, video configuration with inheritance, video timeline, logs, and one real end-to-end encode. Monaco editing, scene editing, preview, charts, and LAN access shipped in increments 2–3. | 2 |
| A2 | **Persistence** — one JSON document per project under the app-data directory, plus a small rebuildable index for the home screen. No SQLite or other embedded database; the execution timeline is append-only JSONL. | 2 |
| A3 | **Test stack** — Vitest for unit/component, `cargo test` with fake sequences, and a Playwright smoke plus fake-engine completion, held-open cancel/navigation, locked-scope/`409`, and LAN pairing journeys against the real headless service are in the tree. The pull-request CI workflow and the frontend/Rust coverage policy are checked in. The screenshot gallery and error-path matrix are wired; branch protection requires the three aggregate gates. | 4 |
| A4 | **`mpv` is not used.** Preview renders through `<video>` with a fragmented-MP4 stream in both the desktop app and the browser, preserving the single-source-of-truth rule. S2 confirmed play/seek in Chromium and the WebView2 engine family on 2026-11-02; WebKit remains a release check. | 4a (spike S2); Phase 3 increment 3 |
| A5 | **Node 26 LTS** — `.nvmrc` pins 26 and `package.json` requires Node `>=26` with npm `>=11`; local development is verified with 26.13.0 and npm 11.20.0. CI reads the same `.nvmrc`. | 1 |
| A6 | **No multi-window.** The desktop app is a single window; secondary views are routes. This keeps the encode guard and the LAN session model simple. | 3 |
| A7 | **Auth for LAN access** — one bearer token per paired browser plus a QR/deep-link and eight-character-code handoff; no user accounts, no password database. When LAN mode is off, the server binds loopback only and needs no token; when on, the LAN listener requires a token for every API request while loopback stays unauthenticated. Sessions expire after 24 hours and are revoked individually. | 3 |
| A8 | **License** — the combined work is GPL-3.0 because `andean-condor` is GPL-3.0. | 1 |
| A9 | **`andean-condor` is pinned to a commit**, not a branch or tag. Cargo resolves its three path-sibling metric crates from the same git source; its released `av-decoders` and `av-scenechange` dependencies are locked in `Cargo.lock` and built with `--locked`. | 1 |

### Reversing an assumption

1. Change the row above to `Superseded by Dxx`.
2. Add the new decision to [decisions.md](decisions.md).
3. Update every document that referenced the assumption.
4. If it affected a completed phase, add a task to [progress.md](progress.md) rather than
   silently diverging.
