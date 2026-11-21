# Engine adapter

`rust/crates/engine` is the only crate that depends on `andean-condor`. It turns the
upstream library into the run contract the service consumes, and it owns no HTTP, UI, or
Tauri concern. The public contract lives in `src/lib.rs`; this document maps the
implementation behind it.

## 1. Four integration domains

The crate is grouped by the thing a developer is changing, not by the Rust construct. The
root module map is repeated in [`src/lib.rs`](../rust/crates/engine/src/lib.rs).

```
rust/crates/engine/src/
├── lib.rs                         run contract, root types, fake runner
├── platform.rs                    shared child-process console policy
├── run/
│   ├── runner/
│   │   ├── mod.rs                 worker thread, EncodeRunner, tests
│   │   ├── encode.rs              the run loop
│   │   ├── scripts.rs             run-scoped script materialisation
│   │   ├── sequence.rs            input opening and sequence construction
│   │   ├── checkpoint.rs          save callback and checkpoint events
│   │   └── progress.rs            progress translation and resume tallies
│   ├── sequence_config.rs         RunnerConfig and the sequence handlers
│   ├── sequence_log/
│   │   ├── mod.rs                 run-level records and formatting helpers
│   │   └── sequences.rs           one descriptor per engine sequence
│   └── reset.rs                   checkpoint edits (split, merge, reset, …)
├── capability/
│   ├── preflight/
│   │   ├── mod.rs                 probe inventory and capability model
│   │   ├── runtime.rs             VapourSynth and metric backend probes
│   │   └── tools.rs               executable families and encoder probes
│   ├── catalogue.rs               encoder catalogue and wire ids
│   └── scene_model.rs             Scene Detector model discovery
├── media/
│   ├── video.rs                   input/output documents and script materialisation
│   └── preview/
│       ├── mod.rs                 proxy context, cache recipe, shared FFmpeg helpers
│       ├── decoded.rs             decoded-frame proxies and stills
│       ├── encoded.rs             encodes from the run's own encoder settings
│       └── remux.rs               retained-chunk copies
└── script/
    ├── check.rs                   pre-save script evaluation
    ├── data.rs                    reserved variables and conditional scene data
    ├── export.rs                  standalone Python export
    ├── imports.rs                 VapourSynth import refresh (crate-private)
    ├── module/
    │   ├── mod.rs                 runtime module data and the write path
    │   └── source.rs              generated module, type stub, and template
    └── plugins.rs                 static plugin namespace diagnostics
```

`platform.rs` is a public root module for the child-process console policy shared by the
service and the desktop host; it is not one of the four integration domains.

The groups are public modules. Their child files are private implementation seams, except
where the parent deliberately re-exports a public item. `run::sequence_log` and
`script::imports` are crate-private because the service and the desktop shell never call
them directly.

## 2. Public surface and visibility

`lib.rs` carries the contract shared by the service, the fake runner, and the tests:
`EncodeRequest`, `EncodeHandle`, `EncodeEvent`, `EncodeRunner`, `EngineError`, and the
project defaults. `RealRunner` and `RunnerConfig` are re-exported at the root because they
are the two values the service names most often.

Inside a group:

- A public module path names the area, for example
  `av1ation_engine::capability::preflight::detect()`.
- A child file is private. The parent re-exports only the entry points another group or the
  service needs.
- `pub(super)` is a seam between a parent and its split children, or the minimum needed for
  the parent's test module. It is not a second public API.
- Tests stay in the parent module that owns the behaviour. A moved helper keeps its tests
  reachable through `pub(super)` rather than by widening the item to `pub`.

The old flat paths are gone. Add a caller at the group path; do not add a compatibility
alias at the old spelling. Two names for one module means two maps to keep correct.

## 3. Where a change belongs

| If you are changing… | Start in |
| --- | --- |
| The run's sequence loop, cancellation, or terminal event | `run/runner/encode.rs` |
| Values injected into a VapourSynth script during a run | `run/runner/scripts.rs` + `script/data.rs` |
| Which sequence is constructed, or how its input is opened | `run/runner/sequence.rs` |
| What a save announces to the UI | `run/runner/checkpoint.rs` |
| How engine progress becomes an `EncodeEvent` | `run/runner/progress.rs` |
| A sequence's per-scene or summary log line | `run/sequence_log/sequences.rs` |
| A checkpoint edit such as split, merge, or reset | `run/reset.rs` |
| Windows child-process console policy | `platform.rs` |
| A new encoder catalogue entry or wire id | `capability/catalogue.rs` |
| A new optional executable, library, or metric probe | `capability/preflight/` |
| An input/output document or script materialisation for a run | `media/video.rs` |
| A preview source, codec, or proxy recipe | `media/preview/` |
| The generated `condor_data` module or its stub | `script/module/source.rs` |
| A reserved variable's value or documentation source | `script/data.rs` |
| A script check, export, import refresh, or plugin diagnostic | the matching `script/` file |

If a change spans groups, keep the contract in `lib.rs` or in the owning group's parent
module. A child must not import a sibling's private helper; move the shared helper up or
give the parent a deliberate re-export.

## 4. Checks

```bash
node scripts/run-cargo.mjs test -p av1ation-engine --locked
node scripts/run-cargo.mjs clippy -p av1ation-engine --all-targets --locked -- -D warnings
node scripts/run-cargo.mjs fmt -p av1ation-engine -- --check
```

The engine suite uses fake sequences and fixture media; it needs no GPU, VapourSynth, or
real encode. A module move must keep those tests in their original parent modules and must
not add sleeps or polling.

## 5. Keeping the map true

`src/lib.rs`, this file, and the group `mod.rs` files are one map. A new group, a new child
seam, or a moved public item updates all three in the same change. The rationale for the
grouping is described above; the run contract and event semantics remain in [runs.md](runs.md).
