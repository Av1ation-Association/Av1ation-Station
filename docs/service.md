# Service

`rust/crates/service` is the HTTP backend shared by the Tauri shell, a LAN browser, and the
headless binary. It owns persistence, project and video documents, run supervision, media
delivery, and the generated-contract boundary; it does not depend on Tauri or the UI.

## 1. Seven feature domains

The crate is grouped by the thing a developer is changing, not by the protocol or the Rust
construct. The map is repeated in [`src/lib.rs`](../rust/crates/service/src/lib.rs).

```
rust/crates/service/src/
├── lib.rs                         public entry points and server lifecycle
├── state.rs                       AppState: shared composition root
├── api/
│   ├── mod.rs
│   ├── error.rs                   browser-facing error envelope
│   ├── json.rs                    the one request-body extractor
│   ├── lan.rs                     opt-in LAN listener and token gate
│   ├── static_files.rs            public shell assets
│   └── routes/
│       ├── manifest.rs            the one route vocabulary: paths, handlers, owners, purposes
│       ├── mod.rs                 router assembly and shared handler helpers
│       ├── encoders.rs            encoder descriptors, parameters, and forks
│       ├── lan.rs                 media tickets, pairing, and LAN sessions
│       ├── logging.rs             run logs and exports
│       ├── project.rs             project documents and archives
│       ├── run.rs                 queue, encode start, and event streams
│       ├── scenes.rs              structural scene edits
│       ├── script.rs              schemas, language server, and script documents
│       ├── settings.rs            settings and templates
│       ├── system.rs              health, updates, preflight, and storage
│       └── video/
│           ├── mod.rs             video handler imports and re-exports
│           ├── document.rs        per-video settings, storage, and overrides
│           ├── queue.rs           queue membership, removal, and chunk deletion
│           └── state.rs           derived state, scene encoders, and validation
├── project/
│   ├── mod.rs
│   ├── config.rs                  effective configuration resolution
│   ├── derive/
│   │   ├── mod.rs                 chain and state derivation
│   │   ├── scenes.rs              scene table and chunk evidence
│   │   └── tests.rs               derivation fixtures
│   ├── projects/
│   │   ├── mod.rs                 project documents and summaries
│   │   └── store.rs               project persistence
│   ├── settings.rs                application settings and templates
│   ├── templates.rs               portable template sanitizer and export document
│   ├── starter.rs                 the fresh-data-directory template seed
│   └── videos/
│       ├── invalidation.rs        project-level chunk invalidation per video
│       ├── mod.rs                 per-video documents and chunk paths
│       └── store.rs               video persistence
├── run/
│   ├── mod.rs
│   ├── anonymise.rs               log export transform
│   ├── logs.rs                    per-run JSONL logs
│   ├── prepare.rs                 validated run plan and typed refusals
│   ├── retention.rs               chunk-retention policy
│   ├── runs/
│   │   ├── mod.rs                 singleton lock and event fan-out
│   │   ├── events.rs              progress throttling and stage mapping
│   │   └── tests.rs               run bookkeeping fixtures
│   └── timeline.rs                append-only execution history
├── media/
│   ├── mod.rs
│   ├── stream/
│   │   ├── mod.rs                 media routes and file serving
│   │   ├── audio.rs               audio-track extraction
│   │   ├── concat.rs              concat source metadata
│   │   └── preview/
│   │       ├── mod.rs             preview build registry
│   │       ├── decoder.rs         decode graphs shared by Decoded windows
│   │       ├── proxy.rs           proxy build and live streaming
│   │       └── scene.rs           idle decode graphs reused by Encoded scenes
│   └── thumbnails.rs              shared keyframe grid
├── script/
│   ├── mod.rs
│   ├── lsp.rs                     language-server WebSocket bridge
│   ├── lsp_bundle.rs              embedded Python wheelhouse
│   ├── script_data.rs             injected-variable documentation view
│   └── scripts.rs                 VapourSynth plugin checks
├── capability/
│   ├── mod.rs
│   ├── descriptors/
│   │   ├── mod.rs                 encoder parameter vocabulary
│   │   └── catalogue/
│   │       ├── mod.rs             encoder-to-catalogue lookup and fork composition
│   │       ├── aom.rs             AOM options
│   │       ├── avm.rs             AVM options
│   │       ├── ffmpeg.rs          FFmpeg options
│   │       ├── rav1e.rs           rav1e options
│   │       ├── svt_av1.rs         SVT-AV1 options
│   │       ├── vpx.rs             libvpx options
│   │       ├── vvenc.rs           VVenC options
│   │       ├── x264.rs            x264 options
│   │       ├── x265.rs            x265 options
│   │       └── forks/
│   │           ├── mod.rs         shipped fork table lookup
│   │           ├── essential.rs   SVT-AV1-Essential options
│   │           └── five_fish.rs   SVT-AV1-5Fish options
│   ├── forks/
│   │   ├── mod.rs                 user encoder-build probes
│   │   ├── known.rs               shipped fork profiles and detection
│   │   └── help.rs                encoder help parsing
│   ├── preflight/
│   │   ├── mod.rs                 cached dependency inventory
│   │   └── providers.rs           provider projection
│   ├── toolchain.rs               staged toolchain and provider paths
│   └── vapoursynth.rs             VapourSynth provider selection
└── platform/
    ├── mod.rs
    ├── atomic.rs                  durable file replacement
    ├── diagnostics.rs             update check and support bundle
    ├── disk.rs                    free-space policy
    ├── hash.rs                    non-cryptographic identity
    └── storage.rs                 storage summary
```

`state.rs` stays at the root because it is the composition root every group receives. It
wires the stores and supervisors together; it is not a feature domain. `api/` is the only
group allowed to depend on every domain, because it is the HTTP edge. Feature groups depend
on `state::AppState` and on the stores they actually use, never on a route handler.

## 2. Public surface and visibility

`lib.rs` exposes only the values a host needs: `AppState`, `ServiceHandle`, `router`, the
`serve*` constructors, and the tracing initialisers. The route table remains
`api::routes::router` inside the crate; `route_manifest_json` is the one build-metadata
export, used only by `emit-routes`.

Inside a group:

- Group modules are `pub(crate)` so a sibling group can name the path. They are not
  re-exported from the crate root and are not part of the public API.
- The files under `api/routes/` stay private to `api::routes`; the route table calls them.
  A split handler module re-exports its handlers to the route table, which is the only
  caller.
- A helper shared by more than one group belongs in the group that owns the rule, not in a
  new catch-all module.
- Tests remain in the module that owns the behaviour. A test module large enough to hide
  the code under test may move to a sibling `tests.rs` without becoming a new seam.

The old flat module paths are gone. Add a caller at the group path; do not add a
compatibility alias at the old spelling. `npm run check:service-modules` enforces both the
tree and that rule.

## 3. Where a change belongs

| If you are changing… | Start in |
| --- | --- |
| A route path, handler, owner, or docs purpose | `api/routes/manifest.rs` |
| A project, queue, or per-video handler | `api/routes/project.rs`, `api/routes/video/`, or `api/routes/scenes.rs` |
| The error envelope, static serving, or LAN token gate | `api/` |
| A JSON request body or its rejection envelope | `api/json.rs` |
| Project or video persistence | `project/projects/` or `project/videos/` |
| Effective configuration, inheritance, or validation | `project/config.rs` |
| Derived pipeline state | `project/derive/` |
| Settings, templates, the starter seed, default scripts, or a portable template file | `project/settings.rs`, `project/starter.rs`, `project/templates.rs` |
| Run preparation, sequence selection, or pre-start validation | `run/prepare.rs` |
| The singleton, progress bridge, or cancellation | `run/runs/` |
| Timeline records or a run's log files | `run/timeline.rs` or `run/logs.rs` |
| Chunk deletion after success | `run/retention.rs` |
| Byte-range media, audio extraction, or a derived preview build | `media/stream/` |
| The thumbnail grid | `media/thumbnails.rs` |
| Script checks, injected data, or the language server | `script/` |
| A parameter descriptor or its encoder catalogue | `capability/descriptors/` |
| A fork probe or a preflight row | `capability/forks/` or `capability/preflight/` |
| Toolchain resolution or VapourSynth provider selection | `capability/toolchain.rs` or `capability/vapoursynth.rs` |
| Atomic writes, disk readings, hashing, or diagnostics | `platform/` |
| A new shared store or supervisor field | `state.rs` |

A new endpoint that needs a new rule extends the owning domain first, then calls it from
`api/routes/`. A route handler must not become the place a domain rule lives.

## 4. Checks

```bash
npm run check:service-modules
npm run check:api-json
npm run routes:check
node scripts/run-cargo.mjs test -p av1ation-service --test api --locked
node scripts/run-cargo.mjs test -p av1ation-service --locked
node scripts/run-cargo.mjs clippy -p av1ation-service --all-targets --locked -- -D warnings
node scripts/run-cargo.mjs fmt -p av1ation-service -- --check
```

The route integration target is one binary: `tests/api.rs` is the harness, and
`tests/api/<family>.rs` mirrors `api/routes/` for the ten route families. Shared HTTP
fixtures live in `tests/common/mod.rs`; `real_encode_http` includes the same module, so there
is one `send` and one set of project, video, and runner fixtures.

The service suite uses fixture media and the fake runner; it needs no GPU, VapourSynth, or
real encode. A module move keeps the existing tests in their parent modules and does not
change route behaviour. `npm run check:api-json` rejects a raw `Json<T>` parameter or
`JsonRejection` outside `api/json.rs`, so a new handler cannot reintroduce the per-route
mapping the extractor replaced.

## 5. Keeping the map true

`src/lib.rs`, this file, and the group `mod.rs` files are one map. A new group, a moved
module, or a changed ownership rule updates all three in the same change.
`npm run check:service-modules` parses the fenced tree in this file, compares it with every
`.rs` file under `src/` except `bin/`, rejects a root module other than `lib.rs` or
`state.rs`, and rejects a reference to a retired flat path. It runs in `npm run check` and
in the Rust CI job. The rationale for the grouping is described above; the HTTP contract and run semantics
remain in [api.md](api.md) and [runs.md](runs.md), and persistence in [backend.md](backend.md).
