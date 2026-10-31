# Av1ation Station

Av1ation Station is a desktop GUI for [Av1an](https://github.com/BoatsMcGee/Av1an), built
directly on the `andean-condor` library rather than on the `condor` command-line tool.

> **Status: Phase 0 complete; Phase 1 scaffolding next.** The architecture, decision
> records and phase plans are reviewed, and the application Penpot board set is approved.
> The public website design (landing, documentation, demo) is deferred to Phase 6 (D31);
> the current `11 Website` boards are an unapproved draft. No application code exists yet.
> Implementation begins with the repository reset in
> [Phase 1 — Scaffolding](docs/plan/01-scaffolding.md).

The encoder stack is linked into the Rust backend as a library. Progress, scene data,
quality metrics, and errors are structured values rather than scraped text, and there is
no sidecar process to keep in sync.

---

## What it does

- **Projects** own a queue of videos and a shared configuration.
- **Videos** inherit that configuration and may override any individual field.
- **A derived timeline** shows where each video is in the pipeline — scenes detected,
  noise measured, target quality chosen, encoded — computed from the encoder's own
  data rather than from a stored state machine.
- **A scene editor and live preview** let you tune a VapourSynth script per scene and
  see the result before committing to an encode.
- **Remote access over the LAN** through a browser, using the same UI code as the
  desktop application and the same UI code as the public demo.

## Stack at a glance

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 (Rust 1.97, edition 2024) |
| Engine | `andean-condor` linked as a git-pinned library |
| Backend service | `axum` embedded in the Tauri process, plus Tauri IPC |
| Frontend | React 19 + TypeScript 6 + Vite 8 |
| Routing / data | TanStack Router, TanStack Query |
| Styling / components | Tailwind CSS v4, headless primitives (Radix), lucide |
| Editor | Monaco (Python / VapourSynth) |
| Charts | Apache ECharts |
| Preview | Fragmented MP4 over HTTP, played by `<video>` |
| Contracts | `schemars` → JSON Schema → generated TypeScript + Zod |
| Tests | cargo test, Vitest, Playwright against a headless service binary |

Rationale and rejected alternatives for each row are in
[`docs/decisions.md`](docs/decisions.md).

## Documentation map

| Document | Read it when you want to know… |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | how the pieces fit together and what may depend on what |
| [docs/backend.md](docs/backend.md) | how the Rust side is organised and how the engine is driven |
| [docs/frontend.md](docs/frontend.md) | how the React app is organised and how state is held |
| [docs/contracts.md](docs/contracts.md) | how Rust types become TypeScript without drift |
| [docs/data-model.md](docs/data-model.md) | how config inheritance and derived state work |
| [docs/preview.md](docs/preview.md) | how the scene editor and preview stream work |
| [docs/testing.md](docs/testing.md) | how we test, and the feasibility spikes |
| [docs/security.md](docs/security.md) | LAN exposure, auth, and log anonymisation |
| [docs/decisions.md](docs/decisions.md) | every architectural decision and its alternatives |
| [docs/plan/](docs/plan/00-overview.md) | the phase plans |
| [docs/progress.md](docs/progress.md) | current status of everything |
| [AGENTS.md](AGENTS.md) | binding rules for anyone — human or agent — writing code |

## Phase overview

| Phase | Name | Exit criterion |
| --- | --- | --- |
| 0 | Design | this documentation is reviewed; app boards approved; website design deferred to Phase 6 |
| 1 | Scaffolding | the application builds, launches, and shows a real screen |
| 2 | Backend | the engine runs end-to-end behind a stable, typed API |
| 3 | UI | every v0.1 screen is implemented against that API |
| 4 | Testing | the pyramid is green and the five spikes have verdicts |
| 5 | CI | every check runs automatically on every pull request |
| 6 | Deployment | signed, versioned artifacts and the public website ship |

Testing work is deliberately front-loaded inside Phase 4 to run *before* the UI is
finished, because three features could invalidate the architecture if they turn out to
be infeasible. See [docs/plan/04-testing.md](docs/plan/04-testing.md).

## Development prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Rust | `1.97.x` (pinned by `rust-toolchain.toml`) | edition 2024 is required by the engine |
| Node.js | `26 LTS` (verified 26.13.0) | see assumption A5 |
| npm | `>=11` | npm workspaces |
| VapourSynth | R70+ | must be on the dynamic-linker path |
| FFmpeg | any recent build | used by the engine for muxing |
| VMAF / VSHIP / FMetrics | resolved from the pinned engine source | see [docs/backend.md](docs/backend.md) |

Windows is the primary target. Linux and macOS are buildable from Phase 1 and become
release targets in Phase 6.

## Contributing

Read [AGENTS.md](AGENTS.md) first — it is the normative rule set. Then read the phase
plan you are working in and update [docs/progress.md](docs/progress.md) as you go.

```bash
# once Phase 1 is complete
npm install
npm run dev          # Vite + Tauri, hot reload
npm run test         # Vitest
npm run test:e2e     # Playwright against the headless service
npm run lint         # ESLint + rustfmt + clippy
npm run contracts    # regenerate and verify contracts
```

## License

Av1ation Station is a GUI. It links `andean-condor`, which is **GPL-3.0**. The combined
work is therefore distributed under the GPL-3.0. The `LICENSE` file is at the repository
root ([decisions.md](docs/decisions.md) D12).
