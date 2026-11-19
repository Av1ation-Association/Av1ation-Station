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
Media byte fetches are the one exception: the preview player owns its proxy requests
because `MediaSource` needs the response body. It may call `fetch()` only on
transport-provided media URLs and only inside `features/preview/`.

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

Run `npm run contracts` after changing any Rust model. `npm run contracts:check` fails on
drift; the Rust CI job runs it. Contract models live in the public
module for their schema group (`av1ation_contracts::<group>`); `lib.rs` declares the modules
and `API_VERSION` and re-exports no contract type.

### 2.4 One encode at a time, enforced in Rust

The singleton is enforced in the backend with a mutex, not in the UI with a disabled
button. The UI reflects the lock; it does not implement it. While a run is active, project
configuration and the encoding video's General, overrides, storage, scenes, and sequence
reset are read-only, and that is enforced server-side. Sibling videos, other projects, and
templates stay editable; every start and batch is refused process-wide with `409`, and
navigation is never blocked by a run.

### 2.5 Never derive paths from the manifest directory

`CARGO_MANIFEST_DIR` and `std::env::current_dir()` are development-only accidents. Use
the resolved resource directory, or an explicit app-data path obtained from the platform
directory helper.

### 2.6 One version, one place

The version lives in `package.json`. `npm run version:sync` propagates it to
`tauri.conf.json`, the workspace manifest, the five workspace entries in `Cargo.lock`, and
the generated contract metadata. Nothing else hardcodes a version string. The desktop and
web hosts read it from `/api/health` at runtime; `MockTransport` imports the generated
constant instead of carrying its own copy.

### 2.7 No native-window dependencies in shared UI

Anything that can only render into a native window (embedding `mpv`, an OS-level video
surface, a native overlay) cannot live in shared UI code, because the LAN browser and
website demo cannot render it. Pick a transport that works in a `<video>` element
instead.

A host file picker is the same hazard. The desktop host injects `HttpTransportOptions.pick*`
from `apps/desktop/src/main.tsx` only when `__TAURI_INTERNALS__` exists; every other host
keeps the shared text field, because a LAN browser's filesystem is not the host's. Handing a
picker to a browser session turns every **Locate…** into a rejected invoke.

A plugin command also needs its permission in `rust/desktop-shell/capabilities/default.json`
(this build grants `dialog:allow-open`, `dialog:allow-save`, `opener:allow-open-path`, and
`opener:allow-reveal-item-in-dir`; custom app commands need their own entries in
`permissions/`). Without it the call fails at runtime with a generic "refused by the host"
message that names neither the plugin nor the permission.

### 2.8 Capabilities are scoped, never global

A missing optional dependency removes exactly the capability it provides and nothing else.
`andean-condor` has independent decode paths and independent encode paths, so:

- VapourSynth is required only for `Input::VapourSynth` and `Input::VapourSynthScript`.
  Native `Input::Video` decodes through FFMS2 with no VapourSynth present.
- FFmpeg is required only for muxing paths that shell out to it. Encoding uses standalone
  encoder executables, and FFmpeg is only one of them.
- A metric is available when at least one backend implementing it is usable.

Never gate an action on a dependency that the action does not actually need. Availability
comes from the preflight inventory in `docs/preflight.md`, projected per video, never from
a process-wide boolean. A user-provided executable is probed into that same inventory and
becomes the provider for exactly its own capability. Accepted paths are settings and are
re-probed on startup; rejected attempts are transient.

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

The `condor_data` module and its `.pyi` stub come from one generator,
`rust/crates/engine/src/script/module/source.rs`; the runner rewrites the module into the scenes
directory before every sequence. The editor's completion is parsed from that stub, so a new
injected value or field must land in both or the editor documents a module that cannot
import. Only values the runner actually knows belong there. `video_path` is the queued
video's source, injected per run, so it is empty only for the template or an empty queue;
it is the path a script input opens, because a script document cannot name a file shared
by every video.

### 2.11 Retained chunks are the default

Encoded scene chunks are kept after a successful run unless the user opts in to deleting
them. They are what makes a later Quality Check possible and what lets a user re-run
Parallel Encoder for edited scenes only. Never delete them as an incidental step of a
sequence. See `docs/backend.md` §6.1.

### 2.12 Design is approved in Penpot before it is coded

Screen implementation transcribes approved Penpot boards; it does not invent layout. Boards
are drawn in the dark theme. If a constraint is discovered mid-build, the board is updated
first. See [`docs/frontend-penpot.md`](docs/frontend-penpot.md).

The checked-in `design/penpot/boards/*.js` scripts are not the whole file: boards such as
`Project / Script editor` and `Components / Filter composer` exist only in the live Penpot
project. Read the live file through the Penpot MCP before building a screen, and export the
board rather than inferring its layout from a neighbouring one.

**The live Penpot service is unavailable and live-board reconciliation is waived.** The
owner has withdrawn it as a release dependency. The checked-in `design/penpot/boards/*.js`
generators, existing components, and semantic tokens are the design source for remaining
screen work. Do not stop work waiting for Penpot, and do not treat the missing live
comparison as an open release gate. A surface with no checked-in generator at all still
needs design input rather than an invented layout; record that separately in
`docs/decisions.md`.

**The public website is exempt from this rule.** Marketing and documentation pages are
composed from the application's identity — its logo mark, semantic tokens, Inter and
JetBrains Mono, and shared components — and may mount real application screens with fixture
data. They must not invent an application screen's layout. The app screens remain governed by
this section; the website-only exception is recorded in [`docs/decisions.md`](docs/decisions.md)
and [`docs/frontend-penpot.md`](docs/frontend-penpot.md).

### 2.13 Documentation is authoritative, not narrative

`docs/` states what the architecture **is**. It does not record what was considered and
rejected, what a previous application did, or how a decision changed. Keep a
counter-example only where it prevents a reader from repeating a mistake that looks
reasonable, and give the reason in one sentence.

A decision is opened in `docs/decisions.md`; once accepted, its rule and rationale move to
the document that owns it and the entry is removed.

### 2.14 The released toolchain is bundled, pinned and selectable

A release installs its toolchain under the resolved resource directory. Nothing is
downloaded at install or run time, no binary or archive is committed, and no path is
derived from the manifest directory or the working directory. The reviewed
`packaging/toolchain.json`, its recipes and `packaging/toolchain.lock.json` are committed. The
lock is the only version input, `npm run toolchain:verify` is a required release check, and
the build resolves nothing from the network. The verifier fails closed when the lock is
missing or incomplete. Phase 5 keeps the release gate closed until the remaining packaging
checks pass. Provider choice is per
capability — bundled or system, with `custom_tools` still winning — never one global switch,
and it is enforced by the service rather than by the screen. See
[`docs/packaging.md`](docs/packaging.md).

### 2.15 Routes are declared once and derived

Every API route is one group in `rust/crates/service/src/api/routes/manifest.rs`: the path,
a stable id, and one entry per method carrying its handler, owner module, and docs purpose.
The macro emits the axum registration and `ROUTES`; `schema/routes/manifest.json`,
`packages/api/src/api/generated/paths.ts`, and the route table in `docs/backend.md` are
generated. `npm run routes:check` rejects `.route(` elsewhere, hard-coded production `/api`
paths, owner drift, and stale docs prose. Add a route by adding one group and running
`npm run routes`; never edit a generated file by hand.

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
              rust/crates/service   (axum, domain, engine)
                    |
              rust/crates/engine    (andean-condor integration)
                    |
              andean-condor
```

| Layer | May depend on | May **not** depend on |
| --- | --- | --- |
| `rust/crates/engine` | `andean-condor`, `av-*` | `axum`, `tauri`, any UI concern |
| `rust/crates/service` | `rust/crates/engine`, `axum`, `tokio` | `tauri` |
| `rust/desktop-shell` | `rust/crates/service`, `tauri` | UI logic |
| `packages/api` | `packages/contracts`, React, TanStack Query | any component or JSX |
| `packages/ui` | `packages/api`, `packages/contracts` | `@tauri-apps/api` directly |
| `apps/*` (web) | `packages/ui` | another `apps/*` |

`rust/crates/test-support` is test-only: it may depend on `tempfile` and on nothing else in
this workspace, and only a `[dev-dependencies]` table may point at it.

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
- `andean_condor` names two things `Input`: `core::input::Input` is an opened decoder
  (`ensure_indexed`, `clip_info`), `models::input::Input` is the stored document. A helper
  that evaluates a document needs both, aliased.
- A raw string literal whose content starts with `"""` loses a quote to the `r#"`
  delimiter; start the literal with a newline and `trim_start()`. Python reports it as an
  unterminated string far below the real cause.
- Progress is pushed from the engine's `mpsc::Sender<SequenceProgressEvent>` and fanned
  out to subscribers. Do not add polling.
- A sequence number is shared by progress and terminal events. A per-kind sentinel such as
  `u64::MAX` fails the generated contract: Zod rejects integers past 2^53, the stream drops
  the event, and the run never reaches a terminal state.
- Every run appends one run-level timeline record (`sequence: null`) carrying the terminal
  message. It is the only durable reason a failure before the first sequence can show.

## 5. TypeScript rules

- `strict: true`, no `any` at a boundary, no non-null assertions on API results.
- TypeScript is pinned to `6.x`; `typescript-eslint` does not yet support `7.x`.
- Server data lives in TanStack Query. Ephemeral UI state (selection, panel sizes,
  playback position) lives in React state/context; nothing derived from the server is
  copied into it.
- No `useEffect` that fetches. Use a query.
- Undo/redo applies to the *configuration draft*, not to server state.
- Every async path has an error branch that surfaces a user-visible message.
- One editor per context, not per scope. A project or template input document never states
  a source path or an FFMS2 index (a second video would collide); a video's own input
  states both. A sequence override is an independent document that inherits when null, so
  the shared editor is passed the sequence's own value, never the project's.
- Engine JSON Schema carries no Rust `Default`: `defaultFor()` yields `[]` and `0`. A screen
  that enables an optional sequence must seed real starting values (the noise detector's
  WNNM pair, a usable scaler range), or the new document encodes nothing.
- Monaco is bundled, not fetched: the desktop window has no network. Import the worker as
  `monaco-editor/editor/editor.worker.js?worker` — the package's exports map prefixes
  `esm/vs/` itself, so the ESM path does not resolve. Completion comes from the generated
  stub, never a hand-written symbol list.
- The encode stream is mounted once, by the shell (`useEncodeEvents()`). Progress events
  patch the cached `video-state` key in place; screens must read that cache instead of
  opening a second subscription, which duplicates every tick and refetch.

## 6. Styling rules

- Tailwind utilities plus headless primitives (Radix). No CSS-in-JS, no additional component
  library.
- Design tokens live in one CSS file as custom properties. Primitives are vendored into
  `packages/ui` and edited in place.
- Animation is limited to `transform` and `opacity`. Never animate layout properties.
  Layout-affecting transitions are opt-in and must be justified in review.
- Respect `prefers-reduced-motion`.
- Long lists are virtualized. A scene list of 5,000 entries must not create 5,000 nodes.
- A row is edited by activating its name; there is no separate **Edit** button. Destructive
  row actions are icon buttons that expand to reveal their label on hover, so the name
  column stays aligned with its neighbours.
- Penpot boards carry designer annotations in the same text boxes as the copy. Ship the
  layout, not the notes: a helper line must read as end-user copy or be deleted.

## 7. Testing rules

Detail in [`docs/testing.md`](docs/testing.md).

- New business logic ships with a unit test. New endpoints ship with a request/response
  test. New user flows ship with an E2E test. Route tests live in
  `rust/crates/service/tests/api/<family>.rs`, named for the production route module they
  exercise; shared HTTP fixtures live in `tests/common/mod.rs`.
- Tests must not require a GPU, a VapourSynth install, or a real encode. Use the fake
  sequence and fixture media.
- Screenshots are **generated by a manual CI dispatch as artifacts for human review, and
  never gate a merge**. The website and release notes consume them, but the gallery remains
  a manual dispatch and does not run automatically. The same suite runs locally on demand.
  Pixel comparisons are advisory; no screenshot baseline is a required check.
- No `sleep()` in tests. Wait on a condition or an event.
- To review the desktop UI in a browser, run the headless service
  (`./dist/cargo/debug/av1ation-service.exe --port <p> --data-dir %APPDATA%/com.av1ation.station`)
  and the desktop Vite host on port **1420**. Debug builds allow CORS only for
  `localhost:1420` and `127.0.0.1:1420`; any other port makes every request fail with
  `net::ERR_FAILED`. `apps/web` is not an alternative: it refuses to start without a LAN
  token.
- A stale `av1ation-service.exe` locks the linker output, so the next build fails with
  `failed to remove file …: Access is denied`. Find it with `tasklist | grep av1ation` and
  stop that PID; killing the background shell leaves the child running.
- A VapourSynth smoke script needs an explicit YUV format
  (`core.std.BlankClip(format=vs.YUV420P10)`); the engine rejects the RGB default, and the
  rejection reads like a broken check rather than a test-script mistake.

## 8. Git and process

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- One logical change per commit. Keep the tree buildable at every commit.
- Update [`docs/progress.md`](docs/progress.md) when a phase task changes state.
- Any change to an invariant in §2 requires a new entry in
  [`docs/decisions.md`](docs/decisions.md) in the same pull request.
- Generated artifacts are committed: contracts, the schema snapshot, and the lockfiles.
  Never commit build output, `dist/`, or screenshots.
- Do not commit without explicit approval of the contents, the commit message, and the
  description. Commit messages follow the established pattern; do not add a description
  or body without explicit approval of that description.

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
them, because Cargo rejects a patch that points at the same source. The engine now takes
`av-decoders` and `av-scenechange` from crates.io releases, so the transitive branch
hazard no longer exists.

- Bumping the engine revision means regenerating `Cargo.lock` in the same commit and
  checking that its transitive decoder versions did not move unintentionally.
- Build with `--locked` so a dependency cannot silently change the graph.
- Never edit vendored engine sources. If upstream must change, patch upstream, or fork
  and record an ADR.
- The engine is not `Send`-friendly across every internal type; keep it owned by a single
  worker thread behind a channel.
