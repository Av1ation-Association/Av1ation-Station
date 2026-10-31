# AGENTS.md

Normative rules for anyone — human or AI agent — contributing to Av1ation Station.
If a rule here conflicts with a comment in the code, this file wins. If a rule
conflicts with reality, change this file in the same pull request that changes reality.

Read [`docs/architecture.md`](docs/architecture.md) before your first change.

---

## 1. What this project is

A Tauri 2 desktop GUI for Av1an, built on the `andean-condor` **library**. There is no
sidecar process, no CLI invocation, and no file-scraping for progress. If you find
yourself wanting to spawn `condor`, stop and read
[`docs/backend.md`](docs/backend.md).

## 2. Non-negotiable invariants

Do not weaken these without an ADR.

### 2.1 One transport façade

The frontend never calls `invoke()`, `fetch()`, or `EventSource` outside of
`packages/api/src/transport/`. All application data access goes through the single
typed façade exported from `packages/api`. Three hosts — the desktop webview, a LAN
browser, and the website demo — inject a different transport into the same façade.

If you add a new backend capability and touch a component to reach it, you have done it
wrong.

### 2.2 State is derived, never persisted

Video pipeline state (initialised, scenes detected, noise measured, target quality
chosen, encoded) is computed from the engine's own data — `condor.scenes[*].sequence_data`,
the encoded chunks on disk, and the live progress stream. There is no `state` column, no
`status` file, no `last_known_phase` field.

Persisting a state machine means it will eventually disagree with the encoder. Derive it
instead. See [`docs/data-model.md`](docs/data-model.md#4-derived-state).

The one exception is the execution **timeline** (`docs/data-model.md` §6.1), which records
what happened and when. It is history, it is append-only, and it is never read to decide
current state.

### 2.3 Contracts are generated, not written

Rust model types derive `schemars::JsonSchema`. JSON Schema is emitted by a test, and
TypeScript types plus Zod validators are generated from it. Hand-written duplicate
transport types are forbidden: an encoder parameter set differs per encoder and per fork,
so a hand-maintained profile is wrong for any build its author did not test.

Run `npm run contracts` after changing any Rust model. CI fails on drift.

### 2.4 One encode at a time, enforced in Rust

The singleton is enforced in the backend with a mutex, not in the UI with a disabled
button. The UI reflects the lock; it does not implement it. Configuration is read-only
for the duration of an encode, and that is enforced server-side too.

### 2.5 Never derive paths from the manifest directory

`CARGO_MANIFEST_DIR` and `std::env::current_dir()` are development-only accidents. Use
the resolved resource directory, or an explicit app-data path obtained from the platform
directory helper.

### 2.6 One version, one place

The version lives in `package.json`. A script propagates it to `tauri.conf.json` and the
Rust crate. Nothing else hardcodes a version string; the frontend reads it from the API
at runtime.

### 2.7 No native-window dependencies in shared UI

Anything that can only render into a native window (embedding `mpv`, an OS-level video
surface, a native overlay) cannot live in shared UI code, because the LAN browser and
website demo cannot render it. Pick a transport that works in a `<video>` element
instead.

### 2.8 Capabilities are scoped, never global

A missing optional dependency removes exactly the capability it provides and nothing else.
`andean-condor` has independent decode paths and independent encode paths, so:

- VapourSynth is required only for `Input::VapourSynth` and `Input::VapourSynthScript`.
  Native `Input::Video` decodes through FFMS2 with no VapourSynth present.
- FFmpeg is required only for muxing paths that shell out to it. Encoding uses standalone
  encoder executables, and FFmpeg is only one of them.
- A metric is available when at least one backend implementing it is usable.

Never gate an action on a dependency that the action does not actually need. Availability
comes from the preflight inventory in `docs/backend.md` §9, projected per video, never from
a process-wide boolean.

### 2.9 Every `save()` is a checkpoint

The engine calls `condor.save()` repeatedly while a sequence runs, through the
`save_callback` supplied at construction. Every call is persisted before the sequence
continues, so a cancel or a power loss mid-sequence keeps the work already done — detected
scenes, scored scenes, and so on.

Do not batch checkpoints to sequence completion, and do not poll for them. See
`docs/backend.md` §3.3.

### 2.10 The script is one input for the whole video

A VapourSynth script is a single input, not one per scene. Per-scene behaviour comes from
the script reading injected scene data and applying it to frame ranges itself, using
`Input::VapourSynthScript::variables` or a generated data module. Do not build a design
that assumes a script per scene, and do not rewrite user Python. See
`docs/preview.md` §3.3.

### 2.11 Retained chunks are the default

Encoded scene chunks are kept after a successful run unless the user opts in to deleting
them. They are what makes a later Quality Check possible and what lets a user re-run
Parallel Encoder for edited scenes only. Never delete them as an incidental step of a
sequence. See `docs/backend.md` §6.1.

### 2.12 Design is approved in Penpot before it is coded

Screen implementation transcribes approved Penpot boards; it does not invent layout. Boards
are drawn in the dark theme. If a constraint is discovered mid-build, the board is updated
first. See [`docs/frontend-penpot.md`](docs/frontend-penpot.md).

### 2.13 Documentation is authoritative, not narrative

`docs/` states what the architecture **is**. It does not record what was considered and
rejected, what a previous application did, or how a decision changed. Keep a
counter-example only where it prevents a reader from repeating a mistake that looks
reasonable, and give the reason in one sentence.

Decisions and their rationale live in `docs/decisions.md`, which is the only place a
rejected alternative belongs.

## 3. Layering

Dependencies point downward only.

```
apps/desktop   apps/web   apps/website
      \           |          /
       packages/ui  packages/api
              \       /
            packages/contracts
                    |
       ─────────────┼─────────────
              crates/service   (axum, domain, engine)
                    |
              crates/engine    (andean-condor integration)
                    |
              andean-condor
```

| Layer | May depend on | May **not** depend on |
| --- | --- | --- |
| `crates/engine` | `andean-condor`, `av-*` | `axum`, `tauri`, any UI concern |
| `crates/service` | `crates/engine`, `axum`, `tokio` | `tauri` |
| `apps/desktop` (Rust) | `crates/service`, `tauri` | UI logic |
| `packages/api` | `packages/contracts` | React, any component |
| `packages/ui` | `packages/api`, `packages/contracts` | `@tauri-apps/api` directly |
| `apps/*` (web) | `packages/ui` | another `apps/*` |

Business logic that can be tested without React belongs in `packages/api` or in Rust —
not in a component. The previous application's most reusable code was the logic it
extracted out of components.

## 4. Rust rules

- `rustfmt` clean, `clippy --all-targets -- -D warnings` clean. The engine crate ships a
  deliberately strict lint set in its own `Cargo.toml`; mirror the spirit, not the exact
  list.
- `unwrap()`, `expect()`, and `panic!()` are forbidden in library code paths that can be
  reached by user input. Use the error taxonomy in
  [`docs/backend.md`](docs/backend.md#8-errors).
- Every `pub` item gets a doc comment stating *why* it exists, not what it does.
- Blocking work (`andean-condor` is synchronous) runs on `spawn_blocking` or a dedicated
  thread, never on an `async` executor thread.
- Cancellation is cooperative via the engine's `Arc<AtomicBool>`; never `abort()` a task
  that is inside the encoder.
- Progress is pushed from the engine's `mpsc::Sender<SequenceProgressEvent>` and fanned
  out to subscribers. Do not add polling.

## 5. TypeScript rules

- `strict: true`, no `any` at a boundary, no non-null assertions on API results.
- TypeScript is pinned to `6.x`; `typescript-eslint` does not yet support `7.x`.
- Server data lives in TanStack Query. Zustand holds only ephemeral UI state (selection,
  panel sizes, playback position). Nothing derived from the server is copied into
  Zustand.
- No `useEffect` that fetches. Use a query.
- Undo/redo applies to the *configuration draft*, not to server state.
- Every async path has an error branch that surfaces a user-visible message.

## 6. Styling rules

- Tailwind utilities plus headless primitives (Radix). No CSS-in-JS, no additional component
  library.
- Design tokens live in one CSS file as custom properties. Primitives are vendored into
  `packages/ui` and edited in place.
- Animation is limited to `transform` and `opacity`. Never animate layout properties.
  Layout-affecting transitions are opt-in and must be justified in review.
- Respect `prefers-reduced-motion`.
- Long lists are virtualized. A scene list of 5,000 entries must not create 5,000 nodes.

## 7. Testing rules

Detail in [`docs/testing.md`](docs/testing.md).

- New business logic ships with a unit test. New endpoints ship with a request/response
  test. New user flows ship with an E2E test.
- Tests must not require a GPU, a VapourSynth install, or a real encode. Use the fake
  sequence and fixture media.
- Screenshots are **generated in CI as artifacts for human review and never gate a
  merge**. The same suite runs locally on demand. Pixel comparisons are advisory; no
  screenshot baseline is a required check.
- No `sleep()` in tests. Wait on a condition or an event.

## 8. Git and process

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- One logical change per commit. Keep the tree buildable at every commit.
- Update [`docs/progress.md`](docs/progress.md) when a phase task changes state.
- Any change to an invariant in §2 requires a new entry in
  [`docs/decisions.md`](docs/decisions.md) in the same pull request.
- Generated artifacts are committed: contracts, the schema snapshot, and the lockfiles.
  Never commit build output, `target/`, `dist/`, or screenshots.

## 9. Forbidden shortcuts

| Don't | Do instead |
| --- | --- |
| Add an IPC call inside a component | extend `packages/api` |
| Hand-write a type that mirrors a Rust struct | generate it |
| Store pipeline state | derive it |
| Guard a configuration change with a disabled input only | also reject it server-side |
| Patch a dependency by editing `node_modules` or `~/.cargo` | pin, `[patch]`, or vendor |
| Disable a failing test | fix it, or delete it with a reason |
| Overwrite a screenshot baseline without review | review the diff |
| Reach into `apps/website` from `apps/desktop` | promote to `packages/ui` |

## 10. Working with the engine dependency

`andean-condor` is a git dependency, not a published crate. Cargo resolves its three
path-sibling metric crates from the same git source; do not add `[patch]` entries for
them, because Cargo rejects a patch that points at the same source. The engine's
transitive `av-decoders` and `av-scenechange` branches are pinned by the committed
`Cargo.lock`.

- Bumping the engine revision means re-pinning the two transitive branch revisions and
  regenerating `Cargo.lock` in the same commit.
- Build with `--locked` so a moved branch cannot silently change the graph.
- Never edit vendored engine sources. If upstream must change, patch upstream, or fork
  and record an ADR.
- The engine is not `Send`-friendly across every internal type; keep it owned by a single
  worker thread behind a channel.
