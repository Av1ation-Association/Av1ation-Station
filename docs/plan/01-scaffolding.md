# Phase 1 — Scaffolding

**Goal:** a working skeleton that proves every architectural assumption at the smallest
possible scale. Nothing here is a placeholder that gets thrown away; everything here is the
shape of the final thing.

**Exit criterion:** `npm run dev` launches the Tauri app, which loads the SPA over its own
embedded HTTP server and displays real data fetched from `andean-condor`'s model types
(through the generated contracts), with the single-encode guard already enforced by the
backend.

---

## 1. Entry criteria

- [x] Phase 0 documentation reviewed (2026-10-30)
- [x] Assumptions A1–A9 either accepted or replaced (2026-10-30)
- [x] Rust 1.97 toolchain available (1.97.1)
- [x] Confirmed that the pinned engine source resolves and `ort` links (1.2 spike)

## 2. Tasks

### 1.1 Repository reset

| # | Task | Notes |
| --- | --- | --- |
| 1.1.1 | Create orphan branch `condor` with no shared history | tag `v0-electron-final` at `fb44b60` first; `condor` is checked out but unborn until the initial commit (D1) |
| 1.1.2 | Initial commit: docs + infra files only | `.gitignore`, `.gitattributes`, `.editorconfig`, `LICENSE`, `rust-toolchain.toml`, `.nvmrc`, `CONTRIBUTING.md`, `.vscode/` |
| 1.1.3 | `.gitignore` for `node_modules`, `target`, `dist`, `test-results`, `.tauri` | |
| 1.1.4 | `.gitattributes` with `* text=auto eol=lf` for source, binary for media | `core.autocrlf` is on locally; normalise |
| 1.1.5 | `LICENSE` (GPL-3.0), `rust-toolchain.toml` (1.97), `.nvmrc` (Node 26) | |
| 1.1.6 | `README.md`, `AGENTS.md`, `docs/`, and `design/penpot/` from Phase 0 | include the draft `11 Website` generators if the draft is kept in-tree |
| 1.1.7 | `.vscode/launch.json` + `tasks.json` for one-click debugging | compound config: Tauri + Vite + headless service (D8) |

### 1.2 Engine dependency — the risky part

| # | Task | Notes |
| --- | --- | --- |
| 1.2.1 | Create a throwaway workspace in `spikes/1.2-engine-dependency/` with the `andean-condor` pin | record the SHA in `docs/progress.md`; do **not** add `[patch]` for the path-sibling metric crates (D30) |
| 1.2.2 | Pin `av-decoders` and `av-scenechange` to the revisions in the engine's lockfile | after `cargo generate-lockfile`, run `cargo update -p av-decoders --precise <sha>` and the same for `av-scenechange` |
| 1.2.3 | Build a scratch binary with `cargo build --locked` | the actual gate for this phase |
| 1.2.4 | If lockfile pinning fails: vendor `vendor/av1an` and `[patch]` to local paths | record as an ADR either way |
| 1.2.5 | Record the pins and lockfile result; delete the scratch workspace | the production lockfile is created with the workspace in 1.3 |
| 1.2.6 | Verify `ort` links with the default feature set on Windows | run from an MSVC Developer Prompt; keep GPU features off in the default build |

**Decision point.** If 1.2.3 or 1.2.6 fails and vendoring is needed, stop and write the ADR
before continuing. Do not silently switch strategies.

### 1.3 Cargo workspace

| # | Task | Notes |
| --- | --- | --- |
| 1.3.1 | Root `Cargo.toml` with the workspace and the pinned engine dependency | copy the 1.2 pins and add the lockfile |
| 1.3.2 | `crates/contracts` with `JsonSchema` derives on a first real type (`AppInfo`, `ProjectSummary`) | |
| 1.3.3 | `crates/engine` with the `EncodeRunner` trait and a `FakeRunner` | no real encoder yet |
| 1.3.4 | `crates/service` with `AppState`, `/api/health`, and the router factory | the router factory is what the headless binary will reuse |
| 1.3.5 | `av1ation-service --headless` binary | prints the bound port to stdout |
| 1.3.6 | Workspace lints, `rustfmt.toml`, `clippy` config | mirror the spirit of upstream's strict set |
| 1.3.7 | `cargo deny` config | GPL-3.0 allowed; advisories deny |

### 1.4 Contract pipeline

| # | Task | Notes |
| --- | --- | --- |
| 1.4.1 | `crates/contracts` bin `emit-schema` writing `schema/*.json` | deterministic output |
| 1.4.2 | `npm run contracts:generate` producing TS types + Zod | committed output |
| 1.4.3 | `npm run contracts` = emit + generate | the command AGENTS.md references |
| 1.4.4 | `--check` modes for both | CI gate in Phase 5 |
| 1.4.5 | One round-trip test: Rust → schema → TS → Zod parses a fixture | proves the pipeline works end to end |

### 1.5 npm workspace

| # | Task | Notes |
| --- | --- | --- |
| 1.5.1 | Root `package.json` with workspaces and scripts | `dev`, `build`, `test`, `lint`, `contracts` |
| 1.5.2 | `packages/config` — ESLint flat config, tsconfig bases, Prettier | |
| 1.5.3 | `packages/contracts` — generated output only | |
| 1.5.4 | `packages/api` — `Transport` interface, `HttpTransport`, `MockTransport`, one hook | proves the façade |
| 1.5.5 | `packages/ui` — tokens CSS, one headless primitive (`Button`), one screen (`/about`) | proves the design system |
| 1.5.6 | `apps/desktop` — Tauri shell + Vite entry, injects `HttpTransport` with the injected port | |
| 1.5.7 | `apps/web` — same UI, same transport, user-supplied origin | |
| 1.5.8 | `apps/website` — same UI, `MockTransport` with fixtures | host only; the public landing/docs/demo pages are Phase 6 work (D31) |
| 1.5.9 | ESLint `no-restricted-imports` forbidding `transport/` outside `packages/api` and `@tauri-apps/*` in `packages/ui`/`apps` | the boundary must be enforced from day one |
| 1.5.10 | TypeScript pinned to `6.x` | 7.x breaks `typescript-eslint` |

### 1.6 Tauri shell

| # | Task | Notes |
| --- | --- | --- |
| 1.6.1 | Tauri v2 config, single window, no devtools in release | |
| 1.6.2 | Spawn the `axum` server on a tokio runtime from `setup` | bind loopback, retry on collision |
| 1.6.3 | Inject the bound port into the webview | initialization script, not a hardcoded value |
| 1.6.4 | Plugins: single-instance, dialog, opener, log, window-state, os | minimal set |
| 1.6.5 | App-data path resolution via the platform directory helper | never `CARGO_MANIFEST_DIR` |
| 1.6.6 | Preflight module: VapourSynth, ffmpeg, mkvmerge detection | returns a list, not a boolean |
| 1.6.7 | Version propagation script: `package.json` → `tauri.conf.json` → crate | one version, one place |
| 1.6.8 | Graceful shutdown: cancel any run, flush logs | |

### 1.7 Singleton and guards (skeleton version)

| # | Task | Notes |
| --- | --- | --- |
| 1.7.1 | `EncodeLock` in `AppState` | `tokio::sync::Mutex<Option<RunHandle>>` |
| 1.7.2 | `POST /api/…/encode` returns `409` when locked, using `FakeRunner` | the invariant is proven before a real encoder exists |
| 1.7.3 | Config write endpoint returns `423` while locked | |
| 1.7.4 | `GET /api/events` SSE with a synthetic event source | fan-out proven early |
| 1.7.5 | Watchdog that releases the lock if the worker dies silently | |

### 1.8 Developer experience

| # | Task | Notes |
| --- | --- | --- |
| 1.8.1 | `.vscode/launch.json` with a compound config (Vite, Tauri, headless service) | retrospective §2 |
| 1.8.2 | `.vscode/tasks.json` for build/dev/test | |
| 1.8.3 | `.editorconfig` | |
| 1.8.4 | `npm run doctor` — checks Rust, Node, VapourSynth, ffmpeg, mkvmerge | saves a whole class of support questions |
| 1.8.5 | `CONTRIBUTING.md` pointing at AGENTS.md and the phase plans | |

## 3. Deliverables

- A repository with one commit replacing the Electron tree.
- `cargo build --workspace` and `npm run build` both succeed from clean.
- `npm run dev` opens a window showing the About screen with the real app version fetched
  from `/api/health`.
- `av1ation-service --headless` serves the same UI in a normal browser.
- `apps/website` serves the same UI from fixtures as a host only; the public
  landing/docs/demo pages are not part of this phase.
- The contract pipeline regenerates with no diff.
- The encode lock returns `409` on a second request.
- The port is discovered, not hardcoded.

## 4. Explicit non-goals

- Any real encoding.
- Any persistence beyond app settings.
- Monaco, charts, scene list, preview.
- LAN mode (the router supports it; the toggle arrives in Phase 3).
- CI configuration (Phase 5).

## 5. Exit checklist

- [ ] `cargo build --workspace` clean from a fresh clone
- [ ] `npm ci && npm run build` clean from a fresh clone
- [ ] `npm run dev` launches and shows real data
- [ ] desktop, web, and website hosts render the same screen
- [ ] `npm run contracts` produces no diff
- [ ] `cargo clippy -- -D warnings` and `npm run lint` clean
- [ ] `409` and `423` proven by a test, not by hand
- [ ] no path derived from `CARGO_MANIFEST_DIR` or `current_dir()` in shipped code
- [ ] `docs/progress.md` updated, including the pinned engine SHA and the resolution
      strategy chosen in 1.2

## 6. Time-box

Not estimated. The phase ends when the checklist is complete. If the engine dependency
cannot be resolved within two working sessions, escalate to the vendoring fallback rather
than continuing to fight the resolver.

## 7. Known traps

| Trap | Avoidance |
| --- | --- |
| Transitive `av-decoders`/`av-scenechange` branch head moves | pin both in `Cargo.lock` with `cargo update --precise`; build with `--locked` |
| Tauri dev server and the axum server fighting over a port | axum binds an ephemeral port and reports it |
| Webview asset protocol vs. HTTP-served SPA | serve the SPA from axum in development too, so there is one path |
| `openssl`/native TLS on Windows | avoid TLS dependencies entirely |
| Tauri build pulling in a second Rust toolchain | `rust-toolchain.toml` at the workspace root |
| VapourSynth arch mismatch (x64 vs x86) | preflight reports it; do not attempt to fix at runtime |
