# Phase 2 — Backend

**Goal:** the real encoder runs end-to-end behind a stable, versioned, typed HTTP API, with
the singleton, cancellation, persistence, and derived state all enforced in Rust.

**Exit criterion:** from a clean state, a user can create a project, add a video, set a
config, start an encode, watch a live progress stream, cancel a second run, and reload the
app to find the results persisted — with every step reaching the real `andean-condor`, and
the whole flow covered by Rust tests.

---

## 1. Entry criteria

- [ ] Phase 1 exit checklist complete
- [ ] the engine dependency resolves and the `FakeRunner` path is proven
- [ ] a real VapourSynth install and a real ffmpeg are available on the development machine

## 2. Tasks

### 2.1 Contracts

| # | Task | Notes |
| --- | --- | --- |
| 2.1.1 | Re-export engine model types; add app types (`Project`, `VideoEntry`, overrides) | `crates/contracts` |
| 2.1.2 | `FieldPath`, `ResolvedValue`, `ValueSource`, `SceneView`, `SequenceState`, `VideoState` | discriminated unions |
| 2.1.3 | `ErrorCode` + `ErrorBody` + `Hint` | stable codes |
| 2.1.4 | `EncodeEvent` envelope (`run_id`, `seq`, `at`, payload) | our type, not the engine's |
| 2.1.5 | Constraint attributes (`range`, `length`) so Zod + UI inherit them | |
| 2.1.6 | Golden schema fixtures for every model | used by drift and round-trip tests |
| 2.1.7 | `Widget` descriptor enum + `Choice`/`Mark`, emitted alongside `ParameterKind` | [contracts.md](../contracts.md#63-widgets-and-presentations) |
| 2.1.8 | `encoder-definition.schema.json` published as the `$schema` for user encoder files | |
| 2.1.9 | Generated `.pyi` stub for the scene-data module, emitted with the same pipeline | [preview.md](../preview.md#typing-and-validation) |

### 2.2 Configuration resolution

| # | Task | Notes |
| --- | --- | --- |
| 2.2.1 | `resolve(project, overrides) -> EffectiveConfig` | pure, no I/O |
| 2.2.2 | Per-leaf path enumeration from the schema | not from a hand-written list |
| 2.2.3 | Merge semantics per field kind (replace; key-wise for `Encoder.options`) | [data-model.md](../data-model.md#3-config-resolution) |
| 2.2.4 | `snapshot()` returning fully materialised config + per-scene encoders | the basis of the immutability invariant |
| 2.2.5 | Property tests: no panic, every path in schema, `Overridden ⊆ overrides` | |
| 2.2.6 | Config timestamps, used only for advisory freshness display | no config hash is stored; see [data-model.md](../data-model.md#41-sequences-not-phases) |

### 2.3 Derived state

| # | Task | Notes |
| --- | --- | --- |
| 2.3.1 | `derive_state(condor, active_run) -> VideoState` | pure |
| 2.3.2 | Phase rules incl. the empty-scene-list and live-run-overrides-older-data cases | [data-model.md](../data-model.md#4-derived-state) |
| 2.3.3 | Freshness: compare `sequence_data.created_on` with the section's last-saved time, advisory only | never changes completion; no `Stale` state |
| 2.3.4 | Tests over every fixture in `condor/*.json` | empty, partial, complete, older-data |
| 2.3.5 | `Capabilities` model: global inventory projected onto one video's resolved input, encoder, metrics | [architecture.md](../architecture.md#7-capability-model) |
| 2.3.6 | Preflight must not disable encode or preview for a missing optional dependency | per-video, per-capability |

### 2.4 Encode pipeline

| # | Task | Notes |
| --- | --- | --- |
| 2.4.1 | Real `EngineRunner` implementing `EncodeRunner` | owns the `Condor` on one thread |
| 2.4.2 | `spawn_blocking` + dedicated thread; never on a runtime worker | |
| 2.4.3 | `validate()` → preflight panel; abort on error | |
| 2.4.4 | Bridge `mpsc<SequenceProgressEvent>` → `broadcast<EncodeEvent>` | non-blocking, lag-tolerant |
| 2.4.5 | Ring buffer for replay (`/api/runs/:id/events?since=`) | reload-safe |
| 2.4.6 | Cooperative cancel via `Arc<AtomicBool>` | |
| 2.4.7 | `catch_unwind` boundary → `EnginePanic` | lock always released |
| 2.4.8 | Watchdog on heartbeat | handles a silently dead worker |
| 2.4.9 | **`save_callback` sink** supplied at `Condor` construction; invoked by every `save()` call | atomic write, cheap enqueue, coalescing | [backend.md](../backend.md#33-live-data-during-a-run) |
| 2.4.10 | Disk space check before start → `507` | |
| 2.4.11 | **Sequence transition table** — the 11 sequences, their prerequisites, and the valid-transition graph | [backend.md](../backend.md#31-valid-transitions) |
| 2.4.12 | **`POST …/run`** — run exactly one named sequence, after checking the transition table | `422` on an invalid transition |
| 2.4.13 | **`POST …/encode`** — resolve the full chain from current state, skipping already-complete sequences | like the `condor` CLI root command |
| 2.4.14 | **Persist on every `save()`**, not per sequence and not only at the end | a cancel or power loss mid-sequence keeps detected scenes | |
| 2.4.15 | **Timeline recorder** — append one JSONL record per sequence attempt: start, end, outcome, frames processed, FPS | [data-model.md](../data-model.md#61-the-video-timeline) |
| 2.4.16 | **Chunk retention** — `delete_chunks_on_success` defaults `false`; explicit per-video delete action; space accounting | [backend.md](../backend.md#61-temporary-storage-for-encoded-chunks) |

### 2.5 Persistence

| # | Task | Notes |
| --- | --- | --- |
| 2.5.1 | `ProjectStore`: read/write `project.json`, video files, index | atomic writes |
| 2.5.2 | Index rebuild when missing or corrupt | index is a cache |
| 2.5.3 | `schema_version` + ordered migration chain, each with a fixture test | |
| 2.5.4 | Refuse-to-load-newer behaviour | never partially apply |
| 2.5.5 | Script stored in the input as `VapourSynthScriptSource::Text` or `::Path`; no separate `.vpy` sidecar | [backend.md](../backend.md#51-inputs-and-scripts) |
| 2.5.6 | Import/export a project as a single archive | needed for bug reports |
| 2.5.7 | Timeline append/read/prune with trailing-partial-line tolerance | |
| 2.5.8 | `AppSettings.project_defaults` as a full `ProjectConfig`; `POST /projects` clones it in the create write | no live link, no propagation |

### 2.6 HTTP surface

| # | Task | Notes |
| --- | --- | --- |
| 2.6.1 | Implement every route in [backend.md](../backend.md#5-http-surface) | |
| 2.6.2 | Status codes: `409`, `423`, `412`, `422`, `507` | part of the contract |
| 2.6.3 | SSE with `Last-Event-ID` resume | |
| 2.6.4 | `/api/encoders` and `/api/sequences` descriptors from the engine | drives the generated config UI |
| 2.6.5 | Enforce the lock on every mutating route | server is the authority |
| 2.6.6 | `oneshot` route tests for all of the above | no listener, no sleep |
| 2.6.7 | Queue order and bulk removal: permutation validation, one lock check, one atomic write | `PATCH …/videos/order`, `POST …/videos/remove` |

### 2.7 Logging and anonymisation

| # | Task | Notes |
| --- | --- | --- |
| 2.7.1 | JSONL per run + raw engine log + `meta.json` | |
| 2.7.2 | `tracing` layers: file, ring buffer, console | |
| 2.7.3 | Log paging endpoint | for the virtualized viewer |
| 2.7.4 | `anonymise()` pure transform + reverse map | fixture tests per category |
| 2.7.5 | Export endpoint with a preview response | user sees redactions first |

### 2.8 Preflight

| # | Task | Notes |
| --- | --- | --- |
| 2.8.1 | VapourSynth load + arch check | |
| 2.8.2 | ffmpeg / mkvmerge presence and version | |
| 2.8.3 | output dir writability, free space, retained-chunk accounting | |
| 2.8.4 | Encoder capability filtering | hide encoders that cannot run |
| 2.8.5 | `metrics::availability::libraries()` integration; per-metric backend coverage table | [backend.md](../backend.md#92-metrics) |
| 2.8.6 | VapourSynth plugin presence per plugin-backed metric (vship, vszip) | not derivable from `libraries()` |
| 2.8.7 | Remediation text per missing capability, naming the concrete install | |
| 2.8.8 | Surface as a list with actionable hints, grouped by capability | |

## 3. Deliverables

- Every route implemented and tested.
- One real encode completing through the HTTP API on a 1-second clip.
- Cancellation verified mid-encode, with the detected scenes retained.
- Derived state correct against all fixtures.
- Anonymised export verified against fixtures.
- `crates/service` buildable as `--headless` with the same behaviour.

## 4. Explicit non-goals

- Preview streams (`/preview/*` reserved, unimplemented).
- LAN auth (routes exist; token enforcement is Phase 3 with the settings UI).
- GPU/`ort` feature tuning beyond the default build.
- Third-party sequence plugins.

## 5. Exit checklist

- [ ] real encode completes end-to-end via HTTP
- [ ] second encode returns `409` under a real run, not only a fake one
- [ ] config write during a run returns `423`
- [ ] cancel produces a terminal `Cancelled` event and releases the lock
- [ ] cancelling Scene Detector mid-run retains the scenes detected so far
- [ ] chunk retention defaults to keeping chunks after success
- [ ] timeline records one entry per sequence attempt with frames and FPS
- [ ] killing the worker thread mid-run leaves the app usable
- [ ] every fixture in `condor/` produces the expected `VideoState`
- [ ] anonymiser fixtures green for every category in [security.md](../security.md#6-log-anonymisation)
- [ ] no `unwrap()` on user-derived data
- [ ] persisted files written by an old schema version load (migration test)
- [ ] `docs/progress.md` updated with the contract version

## 6. Known traps

| Trap | Avoidance |
| --- | --- |
| Converting engine errors ad hoc in handlers | one `From<EngineError>` match in one place |
| Holding a `RwLock` across `.await` | audit in review; clippy will not catch it |
| `broadcast` backpressure stalling the encoder | never `await` a send; drop and rely on the ring buffer |
| Older `sequence_data` treated as a different state | compare `created_on` for an advisory badge only; completion comes from the data, tested |
| Empty scene list making "all scenes have X" vacuously true | explicit empty-list rule, tested |
| A real encode in a unit test | only `FakeRunner`; real encodes are gated integration tests |
| Path joining with user strings | validate ULIDs, then join |
