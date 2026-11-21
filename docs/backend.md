# Backend

Rust side of Av1ation Station. Three shared crates plus the Tauri desktop host, one
dependency on the engine, one HTTP surface. All of it lives under `rust/`.

## Contents

- [1. Crate responsibilities](#1-crate-responsibilities)
- [2. The engine dependency](#2-the-engine-dependency)
- [3. Driving sequences](#3-driving-sequences)
- [4. Service state](#4-service-state)
- [5. HTTP surface](#5-http-surface)
- [6. Persistence](#6-persistence)
- [7. Logging and anonymisation](#7-logging-and-anonymisation)
- [8. Errors](#8-errors)
- [9. Preflight](#9-preflight)
- [10. Concurrency invariants](#10-concurrency-invariants)

## 1. Crate responsibilities

### `rust/crates/engine` — the integration boundary

Owns everything that touches `andean-condor`. No `axum`, no `tauri`, no serialization
concerns beyond what the engine's own `schemars` derives already provide.

The crate's module map and ownership rules are in [engine.md](engine.md); the run contract
and event semantics are specified in [runs.md](runs.md).

```rust
pub struct EncodeRequest {
    pub run_id: String,
    pub project_id: String,
    pub video_id: String,
    pub input: serde_json::Value,          // engine `Input` JSON
    pub video_path: String,                // what a script input is told to open
    pub output: serde_json::Value,         // engine `Output` JSON
    pub encoder: serde_json::Value,        // engine `Encoder` JSON
    pub sequence_config: serde_json::Value,// includes Benchmarker and Speed Scaler
    pub condor: Option<serde_json::Value>, // the persisted checkpoint, when one exists
    pub sequences: Vec<String>,            // exact sequence ids to execute, in order
    /// Called synchronously for every engine checkpoint, before the sequence continues.
    pub checkpoint: Arc<dyn Fn(serde_json::Value) -> Result<(), String> + Send + Sync>,
}

pub struct EncodeHandle {
    pub run_id: String,
    pub cancel: Arc<AtomicBool>,
    pub events: mpsc::Receiver<EncodeEvent>,
}

pub trait EncodeRunner: Send + Sync {
    fn start(&self, req: EncodeRequest) -> Result<EncodeHandle, EngineError>;
}
```

`EncodeEvent` is our own type, not `SequenceProgressEvent`. Converting at the boundary
means an upstream event-shape change breaks one adapter instead of the whole application,
and it lets us add correlation ids, timestamps, and a monotonic sequence number that the
engine does not provide.

Progress is one monotonic percentage per step. A stage's `Completed` marker only ends that
stage, a `new-scene` marker only records a boundary, and a scene's `size` pair only records
the bytes it wrote; none of them moves the bar, and only the sequence's own terminal event
reaches 100. Without that rule an initialization stage reports 100 and processing then resets
the bar to its real position, and Parallel Encoder latched at 100 after its first finished
scene, for the rest of the run.

Target Quality is the sequence whose bar restarts. It runs in passes, each pass encoding and
then comparing, and each step reports its own 0-100, so the bar fills twice per pass. Its
pass count cannot be a total: the engine sends the configured maximum, and the sequence stops
as soon as every scene meets its target, which happens after one pass as readily as after the
maximum. The event therefore carries that ceiling as `max_passes`, and a pass counter is not
a percentage — `(pass - 1) / pass`, which the engine sends before a pass, said two thirds of a
three-pass run and then fell to 0 when the encode began. The stage snapshot restarts at a new
`phase` or `pass` and stays monotonic inside one step. The sequence saves a checkpoint at the
end of each pass, so a finished pass is durable while the next one runs; the first event of a
new pass is when the shell refreshes the scene table, which is what makes the pass charts
gain a pass as it finishes instead of at the end of the run.

Parallel Encoder's own ticks count frames, not scenes, so the runner counts the scenes its
workers finish and attaches `scenes_processed`/`scenes_total` to every tick, seeded from the
scenes the engine already recorded bytes for. A resumed run still reports the video's
whole position: the frames of the scenes the earlier runs wrote are seeded into the bar, so
its first tick reads where the video actually stands rather than describing the remainder.
Quality Check seeds its bar the same way: scenes whose scores its previous run wrote are
counted before the first pending frame is compared. Its live counters are the video's
sampled frames and scored scenes; the ETA divides only the samples this run still has to
score.

A Parallel Encoder tick also names the scene one worker holds: `scene_index`,
`scene_progress`, and the scene's own `scene_frames_processed`/`scene_frames_total`. Those
frame counters are local to the scene, unlike the tick's aggregate `frames_processed`,
which counts the whole encode; only the local pair can measure that worker's rate and
finish estimate. A worker names itself after its scene because the engine sends no worker
id, so the scene's final status — a `Completed` child carrying the scene id and no
percentage — is what tells the UI that worker has moved on.

A finished chunk is the other half of that story. Parallel Encoder checkpoints a scene once
its chunk is written, with the size and the wall clock between its two timestamps, so the
checkpoint that recorded them emits `scene_bytes` and `scene_encode_ms` beside
`scene_index`. The client patches the cached row's `chunk_bytes`, `encoded`, and
`encode_ms` from it, which is what makes the rail mark the scene and the Encoding chart
plot its throughput while the other workers still run. A tick describes work in flight and
a table read is the only other source, so without this both kept the previous run's picture
until the sequence ended. The runner remembers the pair each scene already recorded,
including the chunks a resumed run starts with, so a chunk is announced once and a later
checkpoint never replays the table.

Noise Detector samples one frame per scene and reports that scene's value as a
`SceneQuality` child. Completion values cannot carry it: the value is evidence about the
video, not a fraction of the work, and the bar is the sequence's scene tally. It crosses
the boundary as `scene_noise` beside `scene_index`, only for this sequence. Quality Check
reports a `FrameScore` for every sampled frame while it compares; the runner accumulates
those scores against the scene's expected sampled frames and, once the scene is complete,
publishes their mean as `scene_quality`. Native and VMAF scoring paths never send a
`SceneQuality` child, so this accumulation is what makes their score chart move during the
run. The client patches the cached row's `quality_score` from that event. Target Quality's
`SceneQuality` belongs to a probe pass rather than to the video, so it crosses as neither
value. The client patches the cached scene table from these events, so the measured-data
charts and their statistics fill in scene by scene instead of appearing whole when the
terminal event lands.

The live event alone is not enough for a reader that arrives late. Both sequences write
their scene data only when they checkpoint: Noise Detector at the end of its run, Quality
Check after every scene has been scored. The supervisor keeps Noise Detector's values and
the scene-table read overlays them on the derived rows. The shell keeps both tallies from
the event stream, because a table read can still overtake the supervisor's copy, and applies
them to whichever read comes next. A page opened five seconds into a run shows all five
seconds, not only what arrived after it loaded. This is live execution state, like the
singleton and the stage snapshot: it is not persisted, and the terminal event discards it
because the checkpoint then holds the same values.

The trait exists so tests can substitute a fake runner that emits scripted event
sequences without VapourSynth, FFmpeg, or a real encode.

### `rust/crates/contracts` — the type surface

All types that cross the boundary live here and derive `schemars::JsonSchema` and
`serde::{Serialize, Deserialize}`. It also contains a `bin/emit-schema` target that
writes `schema/` to disk for the TypeScript generator.

Keeping this separate from `service` means the schema can be emitted in CI in seconds
without building the Tauri shell or the encoder.

### `rust/crates/service` — transport and orchestration

The `axum` router, application state, the encode singleton, persistence, SSE fan-out,
and error mapping. Depends on `engine` and `contracts`. Never depends on `tauri`.

This crate is also the **headless test target**: the `av1ation-service --port <port>`
binary exposes the same router as the desktop build. The checked-in Playwright smoke and
fake-engine journeys drive that real HTTP surface without a GUI, including LAN pairing,
locked-scope writes, and the process-wide `409`. Nine of the ten error-path rows are
automated; the native second-instance row was recorded as a packaged Windows release check
on 2026-11-12 (see [testing.md](testing.md#39-error-path-matrix)).

## 2. The engine dependency

`andean-condor` is a workspace member of the Av1an repository, not a published crate,
and it has **three path-sibling dependencies**:

```toml
# upstream andean-condor/Cargo.toml (abridged)
av-metrics-vmaf     = { path = "../av-metrics-vmaf" }
av-metrics-vship    = { path = "../av-metrics-vship" }
av-metrics-fmetrics = { path = "../av-metrics-fmetrics" }
```

Cargo resolves those path siblings from the same git source, so one dependency is enough:

```toml
# rust/Cargo.toml (workspace root)
[workspace.dependencies]
andean-condor = { git = "https://github.com/rust-av/Av1an", rev = "7e37c21dffd13fbc7825d60586c69104e95e71a4" }
```

`rust/crates/engine/build.rs` and the contract generator reject a path dependency or any other
repository URL, so generated metadata cannot silently describe a local checkout.

Do **not** add `[patch]` entries for the metric crates. Cargo rejects a patch that points
at the same source ("patches must point to different sources"), and the path siblings
already resolve from the repository. This was verified in the 1.2 dependency spike.

The engine's decoder dependencies are now released crates, not branch references:
`av-decoders 0.12.0` and `av-scenechange 0.25.0` resolve from crates.io, and `rust/Cargo.lock`
pins those versions. Earlier engine revisions took both from moving branches, which made a
regenerated lockfile capable of breaking the build; that hazard is gone. When bumping the
engine `rev`, regenerate the lockfile and review whether either crate's major or minor
version changed before committing. Build with `--locked` so the resolved graph is exact.

`[patch]` remains valid when the replacement is a **different** source, such as a local
vendored path. That is the fallback if a released decoder version cannot be used.

**If this becomes unstable, the fallback is vendoring.** Add a `vendor/av1an` subtree
at the pinned revision with `[patch]` pointing at local paths, and record it as an ADR.
Do not fork unless upstream refuses a needed change.

On Windows, run Cargo from a Developer Command Prompt, or call `vcvars64.bat` first. Git
Bash's `/usr/bin/link.exe` shadows the MSVC linker and build scripts fail with a link
error that names the Visual Studio installer. A local `rustc-wrapper = "kache"` is fine;
keep it in the gitignored project-local `.cargo/config.toml`, because kache is an optional
cache and a checkout without it must build with plain rustc. `KACHE_CACHE_DIR` may point at a
shared local store, such as `P:/kache-store`, so this checkout and the `andean-condor` checkout
reuse one cache instead of duplicating it. Do not pass
`-C link-arg=-fuse-ld=lld` to the MSVC target, where `link.exe` ignores it and emits
`LNK4044`. Use `-C linker=lld-link` if lld is intended.

Other dependency notes:

| Crate         | Note                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ort`         | pinned by upstream to `2.0.0-rc.12`; DirectML on Windows. GPU features are opt-in Cargo features so a CPU-only build is always possible.                                  |
| `vapoursynth` | requires VapourSynth at runtime and a matching arch; preflight-check it.                                                                                                  |
| `ffms2-sys`   | needs the ffms2 native library; guard with a preflight check.                                                                                                             |
| Lints         | upstream enables a very strict clippy set (`unwrap_used`, `cfg_not_test`, …). Those lints apply to the dependency only; our crates choose their own, slightly looser set. |

## 3. Driving sequences

The sequence catalogue, valid transitions, running one sequence vs. running all, the run
loop, live checkpoint data, progress fan-out, and derived state are specified in
[runs.md](runs.md).

## 4. Service state

```rust
pub struct AppState {
    pub(crate) info: AppInfo,                  // versions and API metadata
    pub(crate) runs: RunSupervisor,            // singleton lock, progress bridge, release rule
    pub(crate) preflight: PreflightCache,      // one cached probe list, shared by health and refresh
    pub(crate) settings: Option<SettingsStore>,
    pub(crate) projects: Option<ProjectStore>, // JSON documents + index
    pub(crate) videos: Option<VideoStore>,     // per-video documents and scratch directories
    pub(crate) timeline: Option<TimelineStore>,
    pub(crate) logs: Option<LogStore>,
    pub(crate) lan: LanController,             // LAN token and paired sessions
    pub(crate) disk: DiskProbe,
    pub(crate) preview_builds: PreviewBuilds,  // in-flight proxy builds, shared per cache key
}
```

The settings file is `<app-data>/config.json`. The desktop host supplies Tauri's resolved
app-data directory; the headless binary takes `--data-dir` or `AV1ATION_DATA_DIR`. A host
that passes no directory still runs, with settings persistence disabled.

`AppState` is passed to the router with `with_state(state)` and extracted as
`axum::extract::State<AppState>`; it is cheap to clone because its stores and guards are
shared handles. Nothing in it is a global; the desktop host builds it and hands a clone to
the server task on startup.

Settings writes share one seam. `SettingsStore` owns the lock, load, apply, and atomic save,
and every settings writer uses it. `PATCH /api/settings` is a merge patch: an absent field
keeps its stored value, a present field replaces it, and `temp_dir: null` clears the override.
Presence survives deserialization, so an absent field is distinguishable from `null`; the
response is the complete settings document.

## 5. HTTP surface

Route naming and its exception list, input and script documents, preview media, the
generated route table, and the run and queue endpoints are specified in [api.md](api.md).

## 6. Persistence

```
<app-data>/
├── config.json                 # app settings, including accepted custom executables
├── index.json                  # project summaries cache (rebuildable)
├── projects/
│   └── <project-uuid>/
│       ├── project.json        # name, description, config, general defaults
│       └── videos/
│           ├── <video-uuid>.json       # input, output, overrides, condor data
│           └── <video-uuid>/
│               └── timeline.jsonl      # append-only execution history (see §6.1)
├── temp/
│   └── <video-uuid>/           # per-video scratch space (see §6.1)
└── logs/
    ├── application.log       # service-wide records: startup, settings, failures
    └── <run-uuid>/
        ├── run.jsonl           # structured events
        └── meta.json           # command line, versions, environment
```

`engine.log` is intentionally absent: the pinned engine writes encoder stderr in-process
and exposes no file or callback. §7.1 records the consequence for diagnosis.

Decisions:

- **The VapourSynth script is not a separate file.** It lives inside the input as
  `VapourSynthScriptSource::Text` or `::Path` ([api.md](api.md) §2). At project scope that input is the
  pathless `GeneralDefaults`; a video materialises it with the source path. A `Path` variant
  is offered for users who want to edit the script in an external editor, but the input is
  the source of truth either way.
- **`project.json` holds inherited config; `videos/<id>.json` holds only overrides.** The
  effective config is always computed, never stored. This is what makes "reset to project
  value" a deletion rather than a copy.
- **A configuration save is checked and normalised.** `PUT /api/projects/:id/config`
  validates the document against the engine's own default shape, rejects an unknown section
  or field with `422`, materialises the full document, and writes it atomically. The
  response carries per-leaf provenance, and a read never writes. A one-key section whose
  child the default does not own is a replacement variant, because the engine's externally
  tagged enums serialise that way.
- **Writes are atomic** (temp file in the same directory, `fsync`, rename). The engine's
  own `save_data` does the same for condor state; match it.
- **`index.json` is a cache.** Corruption triggers a rebuild from `projects/*/project.json`.
  Every entry is also checked against its directory before the list is served, and the size
  is measured at that moment, so a project removed outside the app is never listed and a
  stale size is never replayed.
- **Reads never write.** A project's access time is held in memory by the store and made
  durable by the next create, rename, or delete. Only `POST /api/projects` creates a
  directory, so a read racing a delete cannot resurrect the project.
- **Migration** is version-gated but there is no migration chain yet: `project.json` and
  each video document carry a `schema_version`, and this build reads version 1. A missing
  version is treated as 0 and parsed against the current struct, so a field added since
  then must be defaulted in Rust. A newer version and a damaged document refuse to load;
  over HTTP both are `422` `INVALID_CONFIG`, because a client cannot fix either by retrying.
  A corrupt project is skipped by the Home list and its raw file is left untouched.
- **A project's configuration is copied at creation.** `POST /api/projects` copies the
  marked project template's configuration into the new `project.json` in the same atomic
  create; without a marked template it writes the engine's default encoder and sequence
  configuration. The project is never briefly configless. The file's `config` field is
  serialised by the engine, so a new project reflects that engine's defaults rather than a
  second table of numbers.
- **`index.json` is written after every create, rename, and delete**, and read for the
  project list. When it is missing, corrupt, or a different index version, the store rescans
  `projects/*/project.json` and rewrites it, so a lost cache costs one scan rather than the
  project list. A rewrite is serialised with the other rewrites, so two concurrent mutations
  cannot interleave a scan and a write and drop one of the new projects.

### 6.1 Temporary storage for encoded chunks

Encoded scene chunks are large — gigabytes per video — and must survive for the whole
encode so the concatenator can assemble them. Three candidate locations:

| Location                    | Pros                                                                               | Cons                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **OS `TEMP`**               | conventional; OS cleans up eventually                                              | the OS or a cleanup tool may delete files mid-encode; on Windows `TEMP` is often on the same volume as the system drive |
| **Next to the input video** | same volume as source and output, so no cross-device copy; survives reboots        | pollutes the user's media directories; may be read-only or on a network share                                           |
| **App-data `temp/`**        | fully under our control; predictable; survives reboots; easy to clean on uninstall | may be on a different volume from the output, costing a copy at concatenation time                                      |

**Decision: app-data `temp/<video-uuid>/`, with a user-configurable override in Settings.**

Rationale: the decisive factor is that losing these files mid-encode destroys hours of
work, and only a location we control avoids that. The OS `TEMP` directory is explicitly
unsafe here — Storage Sense, `tmpfiles.d`, and third-party cleaners all delete from it
without asking. Next to the input is the second-best choice and is offered as the override
for users whose app-data volume differs from their media volume.

Rules:

- One directory per video, named by video UUID, so concurrent work never collides and a
  crashed run's chunks are attributable.
- **Chunks are preserved by default after a successful run.** They are what makes a later
  Quality Check possible on an already-produced output, and what lets a user edit a few
  scenes and re-run Parallel Encoder for just those scenes instead of re-encoding the whole
  video. Deleting them would make both workflows impossible after the fact.
- **Automatic deletion is opt-in.** A `delete_chunks_on_success` setting defaults to
  `false`. Only when the user enables it are chunks removed after the final sequence
  completes, and even then only after the concatenated output exists and is non-empty.
  The removal holds the encode lock until it finishes, so a new run cannot write into a
  directory that is being removed. `DELETE …/videos/:vid/chunks` is the explicit action;
  a missing directory is `204`, an active run on that video is `423`.
- Chunks are therefore never deleted as an incidental step of any sequence. A sequence that
  would otherwise clean up leaves the files in place.
- The UI states, per video, how much space the retained chunks occupy and offers an explicit
  "delete chunks" action, so the default costs the user nothing but is never invisible.
- Removing a video deletes its scratch directory after the document is gone, and removing a
  project does the same for every video it queued; otherwise the retained files would have
  no resource left to address them. Cleanup is best-effort so a locked file cannot keep a
  removed video in the queue.
- The service exposes `retained_bytes` per video, and a project's `size_bytes` adds the
  retained bytes of every queued video to the project directory's size. The per-video walk
  over `temp/<video-uuid>/` sums chunk and probe file sizes. Source videos, `project.json`
  and logs are excluded. A project with no retained work reports only its document size.
- On startup, `temp/` entries older than the retention window (default 7 days) with no
  active run are reported to the user for cleanup, never deleted silently.
- Free-space checks account for the temp directory, not just the output directory, and
  account for retained chunks of completed videos. A run is refused with `507` below a
  512 MiB floor on either volume; below 2 GiB the validation result warns instead. The
  floor is deliberately not an estimate of the output size, which the encoder alone knows.
- The archive endpoint exports the configuration, queue, overrides, and the last engine
  checkpoint as one JSON document. Media and encoded chunks are excluded, so a bug report
  does not move gigabytes. Import validates every entry before creating a project, then
  writes the queue under new ids; a failure deletes the partially-created project.

## 7. Logging and anonymisation

### 7.1 Two log scopes

| Scope           | Contents                                                                              | Attribution                                               |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Application** | startup, preflight refresh, settings changes, project create/delete, service failures | none — process-wide                                       |
| **Run**         | everything a `Condor` sequence emits while processing one video                       | `run_id`, `video_id`, `project_id`, and the sequence name |

Run logs are attributed to one video. A queue of encodes therefore never produces an
undifferentiated stream: every run log line carries its `run_id`, `video_id`, and
`project_id`, because the run is created per video and the correlation id is stamped at
creation. Each run has its own file; the application file is process-wide, and the
`at` timestamp is the ordering key across the two.

```rust
pub struct LogRecord {
    pub seq: u64,                 // monotonic, ordering never depends on wall clock
    pub at: String,               // UTC ISO-8601
    pub level: String,            // info | warn | error
    pub scope: String,            // app | run
    pub run_id: String,
    pub video_id: String,
    pub project_id: String,
    pub sequence: Option<String>, // which sequence emitted it, when in a run
    pub message: String,
}
```

The service writes two scopes. `logs/application.log` is the application record: one
process-wide file, written by a `tracing` file layer and mirrored to stderr, covering
startup, settings changes, and service failures. `logs/<run-uuid>/run.jsonl` plus
`meta.json` is the run record, attributed to one project and video and paged by the log
endpoints. Both hosts install the same subscriber through
`init_tracing_with_app_data`; the desktop passes Tauri's resolved app-data directory.

The pinned engine writes encoder stderr in-process and exposes no file or callback for it,
so no `engine.log` exists. The log endpoints serve the service's own event view of the run.
A failed scene's event does carry the engine's `EncoderResult`, whose text includes that
encoder's stderr, so failure diagnosis is present in `run.jsonl` even though the
successful-pass stderr is discarded by the pinned engine. Capturing that stream requires
an upstream engine change and remains open work; the file tree above does not claim it.

Consequences:

- The log viewer filters by video without a separate indexing pass.
- Anonymised export is scoped to one video by default, which is also the right privacy
  default — exporting one video's log should not leak another's paths.
- A run's log directory is `logs/<run-uuid>/`, and the run id resolves to exactly one video.
- Deleting one log removes only its directory. The timeline record, the retained chunks and
  the video are untouched, so a run whose log is gone still appears in History. A live run
  is refused because it still appends to the file.

#### 7.1.1 What a sequence writes

A run log used to carry lifecycle text only: `Noise Detector completed` says nothing about
the noise it measured, so a wrong-looking result could only be checked by opening the
persisted checkpoint. `rust/crates/engine/src/run/sequence_log/` now turns the scene table the
sequence just checkpointed into records, so a logged value cannot differ from what the
engine wrote.

Every sequence ends with one summary record. Each of these also writes one record per
scene, because its result is per scene:

| Sequence         | Per-scene record                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Scene Detector   | `start` and `end` (the engine's half-open range), so a run's own boundaries can be compared with the table |
| Noise Detector   | `noise` to four decimals and `luminance`                                                                   |
| Target Quality   | final quantizer, mean score, bitrate, probe count; one summary per pass                                    |
| Parallel Encoder | chunk bytes, frames, bitrate, encode duration                                                              |

Measured values are logged to four decimals. Noise is routinely around `0.002`, and a
rounded readout made a real measurement look like zero.

A run also writes three context records before its first sequence: the source (file,
resolution, frame rate, frame count, requested sequences), the encoder (label and speed),
and the settings that change results (noise threshold and scaler range, target-quality
metric and probe cap, bitrate sigma, benchmark threshold, worker count).

These records are delivered as `Detail` and `Warning` engine events and are **log-only**:
the service appends them to `run.jsonl` and never broadcasts them, so a 5,000-scene video
cannot evict live progress from the SSE channel or the replay buffer. The Logs tab still
shows them as they are appended, because it follows the file's tail. `Warning` records carry
the engine's validation, initialization, and processing warnings at `warn`.

### 7.2 Anonymisation

`anonymise()` is a pure transform over lines, unit tested with fixtures. The full category
list and mechanics are in [security.md](security.md#6-log-anonymisation). The export
endpoint returns a preview so the user sees the redactions before saving.

## 8. Errors

One enum, one envelope, stable codes.

```rust
#[derive(Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ErrorBody {
    pub code: ErrorCode,            // stable, machine-readable; the only field to branch on
    pub message: String,            // human, already localised-ready
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,     // engine or OS text, never parsed by the UI
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,       // actionable recovery suggestion
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation: Option<String>,// the run this error belongs to, when it has one
}

pub enum ErrorCode {                // wire values are SCREAMING_SNAKE_CASE
    Busy, Locked, PreflightFailed, InvalidConfig, NotFound, Io,
    EnginePanic, EngineFailed, Cancelled, DiskFull, Unauthorized, Internal,
}
```

The categories are deliberately coarse: `code` is the unit of control flow, and the
specific reason travels in `message`, `detail`, and `hint`. A malformed request body, an
unknown custom-executable family, and an out-of-range value are therefore all
`INVALID_CONFIG`, distinguished by their message and hint rather than by three codes the UI
would have to enumerate. A throttled pairing request is `429` with the coarse retry-later
`BUSY` code, and `Retry-After` carries the delay. Adding a variant is an API change and
bumps the contract revision.

Every JSON request body is read through `ApiJson<T>` in
`rust/crates/service/src/api/json.rs`. It is the only body extractor in the service: a
missing or wrong content type, malformed JSON, and a shape mismatch all return `400`
`INVALID_CONFIG` with one generic message and hint, and the parser's own text is never
copied into `detail`. `npm run check:api-json` rejects a raw `Json<T>` parameter or a
`JsonRejection` outside that module, so a new handler cannot reopen the per-route mapping
the extractor replaced. One extractor keeps a malformed body's status and envelope identical
on every route; semantic validation still returns its specific `422`.

Rule: the frontend switches on `code`, never on `message`. Engine text goes in `detail`
and is displayed in an expandable block, never used for control flow. `correlation` is
present only when the error belongs to a run; a settings write has no run to point at.

`From<EngineError> for AppError` is a single exhaustive match in `rust/crates/service`; when
upstream adds a variant, the compiler points at the one place to update.

## 9. Preflight

`AppState` owns one `PreflightCache`: it probes on the first read, off the async executor,
caches the result, and `/api/health` returns that cached report; `POST
/api/preflight/refresh` discards it and probes again. The probe lives in
`rust/crates/engine`, so the service and the desktop host never keep separate tables of
executable names.

The full rules — required dependencies, bundled and system providers, custom encoder
definitions, metric backends, the check list, custom executables, and the optional Python
language server — are in [preflight.md](preflight.md). The route table in [api.md](api.md) §3 and
`architecture.md` §6 point there for the derivation.

## 10. Concurrency invariants

Collected here because they are the easiest thing to break:

1. `EncodeLock` is acquired before any worker is spawned and released only after the
   worker emits a terminal event or the watchdog fires.
2. A run freezes the configuration its snapshot depends on: the project's configuration and
   the encoding video's General, overrides, storage, scenes, and sequence reset return `423`.
   Sibling videos remain editable because their documents are not part of the snapshot. Queue
   order and removal lock only the active row. Another project keeps editing, because nothing
   it writes can reach a request the worker already materialised. There is no bypass
   parameter.
3. The encode singleton is process-wide. A start in a second project is refused with `409`
   naming the video and project that hold it; the refusal never changes that project's own
   state, and the UI reads the same live stream to disable the button before the click.
4. The preview decoder never shares a `Condor`, `Decoder`, or file handle with the encode
   worker.
5. `broadcast` senders never block; lagging is expected and handled.
6. Persistence writes never hold a `RwLock` across `.await`.
7. No `unwrap()` on anything derived from user input, filesystem contents, or the engine.
