# Data Model

How the engine's data model maps onto the application's own, how configuration
inheritance resolves, and how pipeline state is derived.

## 1. The engine's model

`andean-condor` gives us a compact, already-serialisable model. Verbatim shape:

```rust
pub struct Condor<S, C> {
    pub input: Input,                 // enum, not a path
    pub output: Output,               // path + container tags, not a path
    pub encoder: Encoder,
    pub scenes: Vec<Scene<S>>,
    pub sequence_config: C,
}

pub struct Scene<S> {
    pub start_frame: usize,          // inclusive
    pub end_frame: usize,            // exclusive
    pub sub_scenes: Option<Vec<SubScene>>,
    pub encoder: Encoder,            // per-scene override
    pub sequence_data: S,
}
```

`Input` is the three-variant enum in [backend.md](backend.md#51-inputs-and-scripts):
`Video`, `VapourSynth`, or `VapourSynthScript`, each carrying its decoder choice and ordered
filters, and the script variant carrying the script itself. There is no separate project
script field.

and the default sequence bundle (optionality is the engine's, not ours):

```rust
pub struct DefaultSequenceConfig {
    pub scene_detector: SceneDetectorConfig,          // always present
    pub noise_detector: Option<NoiseDetectorConfig>,
    pub noise_scaler: Option<NoiseScalerConfig>,
    pub target_quality: Option<TargetQualityConfig>,
    pub quality_check: Option<QualityCheckConfig>,
    pub bitrate_optimizer: BitrateOptimizerConfig,   // always present
    pub parallel_encoder: ParallelEncoderConfig,     // always present
    pub scene_concatenator: SceneConcatenatorConfig, // always present
}

pub struct DefaultSequenceData {
    pub scene_detection: SceneDetectorData,
    pub noise_detection: Option<NoiseDetectorData>,
    pub noise_scaling: Option<NoiseScalerData>,
    pub target_quality: TargetQualityData,           // passes may be empty
    pub parallel_encoder: ParallelEncoderData,       // byte count, no chunk list
    pub quality_check: QualityCheckData,
}
```

The optional *config* fields mean "this sequence is not part of the chain". The optional
*data* fields mean "this sequence has not run". `TargetQualityData`, `ParallelEncoderData`,
and `QualityCheckData` are always present structs whose contents may be empty; treating
them as `Option` would invent a state the engine does not have. There is no `custom` map
on a scene; the engine has no such field.

Three properties drive everything downstream:

1. **Scenes are always materialised.** A `Condor` loaded from disk knows its scene
   boundaries; it does not re-detect them to display them.
2. **Per-scene encoder overrides are native.** The scene editor is not a hack around the
   model, it is the model. Editing a scene edits `scene.encoder`; there is no parallel
   override table to keep in sync.
3. **`sequence_data` is the record of what actually happened.** `noise_detection.is_some()`
   means the noise detector produced data for that scene; an empty target-quality pass list
   means it has not. This is the data the timeline is derived from.

## 2. The application's model

We do **not** re-declare the engine's types. `crates/contracts` re-exports them and adds
only what the engine does not model:

```rust
pub struct Project {
    pub id: ProjectId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub accessed_at: DateTime<Utc>,
    pub config: ProjectConfig,             // inherited base; no video path
}

pub struct ProjectConfig {
    pub input: InputDefaults,
    pub output: OutputPolicy,
    pub encoder: EncoderSelection,
    pub sequences: DefaultSequenceConfig,
    pub temp_dir: Option<PathBuf>,         // None means the app-data default
}

pub struct VideoEntry {
    pub id: VideoId,
    pub source_path: PathBuf,
    pub input: Input,                      // materialised from InputDefaults
    pub output: Option<Output>,            // exact file, set on the video screen
    pub overrides: ConfigOverrides,        // sparse, path-addressed
    pub encoder_override: Option<EncoderSelection>,
    pub condor: Option<Condor<DefaultSequenceData, DefaultSequenceConfig>>,
    pub added_at: DateTime<Utc>,
}

pub struct AppSettings {
    pub theme: Theme,
    pub temp_dir: Option<PathBuf>,         // default temp root; project may override
    pub delete_chunks_on_success: bool,    // false by default
    pub project_defaults: ProjectConfig,   // copied at project creation, never live-linked
}
```

`project_defaults` is a full `ProjectConfig`, not a patch and not a pointer to one project.
`POST /api/projects` deserialises it into the new `project.json` in the same atomic write
that creates the project; there is no second write and no window in which a project exists
without a configuration. After creation the two documents are independent. Editing the
defaults never mutates an existing project, and editing a project never mutates the
defaults. This is a deliberate copy, not inheritance: project configuration inheritance is
the video-over-project resolution in §3, and adding a third live layer would make a saved
project change without its owner editing it.

`InputDefaults` is the pathless projection of `Input` that a project can own before any
video exists. It carries the same decoder choice, import method, and ordered filter list;
`VapourSynthScript` carries the script itself, exactly as the engine stores it. When a video
is added, the service fills in the source path and assigns the sequence index, producing the
concrete `Input`. Generated `video_path`, `temp_dir`, and scene data are injected at
session/run preparation, not persisted as user configuration. At project scope the UI
therefore never shows a path, only the default that new videos will use.

```rust
pub enum InputDefaults {
    Video { import_method: ImportMethod, filters: Vec<Ffms2Filter> },
    VapourSynth {
        import_method: VapourSynthImportMethod,
        cache_path: Option<PathBuf>,
        filters: Vec<VapourSynthFilter>,
    },
    VapourSynthScript {
        source: VapourSynthScriptSource,   // Path or Text
        filters: Vec<VapourSynthFilter>,
        stream_concurrently: bool,
    },
}

pub enum OutputPolicy {
    NextToInput,          // folder only; the video supplies the exact file
    Folder(PathBuf),
}

/// Sparse, path-addressed overrides. A missing path means "inherit".
pub struct ConfigOverrides {
    pub fields: BTreeMap<FieldPath, JsonValue>,
}
```

Input and output are structural, not generic override fields. A video owns the effective
`Input`, because adding a video is what supplies the path; "override" for the input means
it differs structurally from `ProjectConfig.input` materialised for that path, and reset
replaces the whole input with that default. `ConfigOverrides.fields` addresses sequence
configuration and temp-directory settings only; it never carries a half-materialised input.

Per-scene encoder changes are written to `condor.scenes[i].encoder`, not to a second
`SceneOverride` map. Scene structural edits (split, merge, trim) rewrite `start_frame` and
`end_frame` on the engine's scenes and are persisted by the next `save()`. This is the same
reason there is no `script_path`: both facts already have a home on the engine model.

`OutputPolicy` resolves only the folder. A video's exact output file is `None` until it is
chosen on that video's General screen; encoding preflight rejects an unset target rather
than inventing `{VIDEO}.mkv`, which can collide with the source. The project scope never
shows a filename field.

`FieldPath` is a dotted path into `ProjectConfig`
(`"sequences.target_quality.maximum_probes"`, `"output"`). `JsonValue` is deliberate: the
override set is data, validated against the generated schema for the field it addresses.
Adding a config field upstream does not require a new struct field here.

Why sparse-and-path-addressed rather than `Option<T>` per field:

- "Reset to inherited" is a key deletion, with no ambiguity about the difference between
  `null` and absent.
- Adding a field upstream works without a migration.
- The UI's provenance badge is trivially derivable per path.
- The override set is small (typically <10 entries), so the diff and the wire payload stay
  small.

## 3. Config resolution

<a id="config-resolution"></a>

Resolution is a **pure function**, unit tested, used identically by the config endpoint,
the state endpoint, and the encoder snapshot.

```
resolve(project.config, video.overrides) -> EffectiveConfig
```

```rust
pub struct EffectiveConfig {
    pub values: BTreeMap<FieldPath, ResolvedValue>,
}

pub struct ResolvedValue {
    pub value: JsonValue,
    pub source: ValueSource,
}

pub enum ValueSource {
    Default,      // the engine's own default; neither project nor video set it
    Inherited,    // project set it; video did not override
    Overridden,   // video set it
}
```

Algorithm:

1. Enumerate every field path in the schema for `ProjectConfig`.
2. For each path, look in `video.overrides.fields`. Hit → `Overridden`.
3. Else look in `project.config`. Hit → `Inherited`.
4. Else → `Default`, using the engine's `default_parameters()` / `Default` impl.

Merge semantics are per field kind, and a field is always resolved as a unit — there is no
partial-object merge, because partial merges on a nested config object produce states
nobody can reason about:

| Field kind | Merge | Rationale |
| --- | --- | --- |
| Scalar (number, bool, string, enum) | replace | obvious |
| Optional / nullable | replace, explicit `null` means "unset" and is distinguishable from absent | needed for flags with no default |
| List (e.g. target-quality probe list) | replace, never concatenate | concatenation makes order-dependent bugs |
| Nested struct | **not** merged; resolved per leaf path | an override of `sequences.target_quality` never silently drops sibling leaves |

Encoder options are outside `ProjectConfig`: they are resolved key-wise by §3.1, which is
the only key-wise merge. That exception is called out because it is the place where a
reviewer would otherwise assume whole-object replacement.

### 3.1 Encoder resolution

Encoder selection is a two-level override, not a config field:

```
scene.encoder (if the scene has an override)
  └─ video.encoder_override
       └─ project.config.encoder
```

`Encoder.options` resolves key-wise from the same three levels. This lets a user set
"crf 30 at project level, scene 12 at crf 18" with two small overrides.

### 3.2 Snapshot for encoding

Before a run starts the resolver produces a **fully materialised** `DefaultSequenceConfig`
and a materialised `Encoder` per scene, with no references to project or video state.
Everything the worker needs is owned. This is the mechanism behind the "config cannot
change under a running encode" invariant: there is nothing left to change. Materialising a
concatenation configuration includes its output block: for FFmpeg that block must exist
even when it has no track overrides, because an absent block means video-only output rather
than the application's include-all default.

## 4. Derived state

<a id="derived-state"></a>

There is no stored pipeline state. State is a pure function of a `Condor`'s data plus the
live run, computed in the backend.

### 4.1 Sequences, not phases

```rust
pub enum SequenceRunStatus {
    NeverRun,
    Complete,      // produced its data under the current config
    Active,        // a live run is executing it now
    Failed,        // the last attempt failed
    Skipped,       // deliberately not part of this video's chain
}
```

The engine's data has no config-hash field, so "stale" is not a state we can derive. The
UI shows the data's `created_on` (where the engine records it) next to the section's last
saved timestamp and labels the block "produced before the last edit" as advisory metadata.
It never changes completion, because a config edit alone has not invalidated the data.

### 4.2 Derivation rules

| Sequence | Complete when | Runnable when |
| --- | --- | --- |
| Scene Detector | `scenes` non-empty and every scene has `start_frame < end_frame` | always (the only entry point) |
| Noise Detector | all scenes have `noise_detection.is_some()` | scenes exist; VapourSynth is installed. A native `Input::Video` is accepted because the sequence builds its own VapourSynth graph from the FFMS2 decode. |
| Noise Scaler | every scene is below `threshold`, or ineligible (no photon-noise slot, or SVT-AV1 with `film-grain`), or has `noise_scaling.is_some()` | Noise Detector complete; encoder is AOM, RAV1E, or SVT-AV1. The engine leaves lower-noise and ineligible scenes untouched. |
| Target Quality | every scene has at least one quality pass with a non-empty score set | scenes exist; encoders validate |
| Bitrate Optimizer | no completion field; it mutates target-quality data for the next run **and is treated as an action, not a state** | Target Quality has at least one pass |
| Parallel Encoder | every scene has an encoded chunk file (its `parallel_encoder.bytes` is evidence, not the test) | scenes exist; encoders validate |
| Serial Encoder | every scene has an encoded chunk file | scenes exist; encoders validate |
| Scene Concatenator | output file exists and is non-empty | at least one encoded chunk exists |
| Quality Check | every scene has a quality check with a non-empty score set | output file exists |
| Benchmarker | `parallel_encoder.workers` is set | scenes exist; `workers` unset |
| Speed Scaler | no completion field; it rewrites each scene's encoder speed, which is visible in that scene's encoder and is **not** a separate state | quantizers known (Target Quality or Bitrate Optimizer) |

Note that Parallel Encoder and Scene Concatenator are the two sequences whose completion
depends on the **filesystem**, not only on `sequence_data`. That is deliberate and is what
makes crash recovery work.

Two refinements the implementation must respect:

### 4.3 Evidence sources and precedence

Three sources, newest wins:

| Precedence | Source | Proves | Cost |
| --- | --- | --- | --- |
| 1 | live run progress | what is happening now | free |
| 2 | `condor.scenes[*].sequence_data` | what a sequence recorded | free, in memory |
| 3 | temp directory listing | which scenes have encoded chunks on disk | one `read_dir`, cached |

The filesystem check is the only one with I/O, so it is cached with a short TTL and
invalidated by run events. It is what makes "resume where it left off" work after a crash:
if Parallel Encoder was stopped halfway, the chunk files say exactly which scenes finished,
with no `Condor` instantiated and no sequence started.

### 4.4 Refinements the implementation must respect

1. **"All scenes" is not trivially true for zero scenes.** An empty scene list means
   detection has not run, so a sequence requiring per-scene data is `NeverRun`, not
   vacuously `Complete`. This is the classic bug in derived-state code.
2. **A live run overrides completion.** If a run is active, the sequence it is working on is
   `Active` with its percentage, regardless of stale data from a previous run. Re-running a
   video with different settings starts from a `Condor` that still carries old
   `sequence_data`, so this case is real, not theoretical.
3. **Freshness is advisory.** A config edit does not delete data the engine still has, and
   the engine does not stamp a config hash. The service compares the data's `created_on`
   with the section's last-saved time for display only. It does not invent a `Stale` state,
   because that would require persisted pipeline state (AGENTS §2.2).
4. **`next` is a list.** Several sequences may be simultaneously runnable — after Scene
   Detector, both Noise Detector and Target Quality are valid. The API returns all of them
   and the UI offers all of them; it does not pick one.

### 4.5 Why derive rather than persist

- The engine already stores the truth. A second copy can only disagree.
- A user can edit `project.json` or replace a script by hand; a persisted state machine
  would then be lying.
- Derived state is testable with zero mocking: construct a `Condor` literal, assert the
  sequence states.

The cost is that derivation must be fast. It is O(scenes) over in-memory data plus one
cached directory listing, called on demand and after events.

## 5. Scene-level model

Because scenes carry their own encoder and their own sequence data, the scene editor is a
first-class part of the data model, not a UI overlay. A scene has no separate decoder: the
decoder belongs to the video's input, and per-scene filtering is the script reading scene
data (AGENTS §2.10).

```rust
pub struct SceneView {
    pub index: usize,
    pub start_frame: usize,
    pub end_frame: usize,
    pub frame_count: usize,
    pub encoder: ResolvedEncoder,       // with source provenance
    pub sequences: Vec<SequenceState>,  // scene-level completion
    pub metrics: Option<SceneMetrics>,  // quantizer, score, bitrate from target quality
}
```

Multi-select operations (see [preview.md](preview.md#43-multi-select-semantics)) apply over a set of
`SceneView`s and write the affected `condor.scenes[i].encoder` values as one request, so one
user action is one undo step. Structural edits (split, merge, trim) rewrite the scene ranges
and are saved by the next engine checkpoint. There is no scene-level `custom` map and no
second scene override table.

## 6. Persistence mapping

| Application concept | File |
| --- | --- |
| Project (name, `ProjectConfig` including `InputDefaults`, video list) | `projects/<id>/project.json` |
| VapourSynth script | inside `ProjectConfig.input` / the video `Input` as `VapourSynthScriptSource::Text` or `::Path` |
| Video entry (input, output, overrides, encoder override) | `projects/<id>/videos/<vid>.json` |
| Engine state for a video | embedded `condor` field in the video file, written by the engine's atomic `save_data` |
| Video timeline (append-only run history) | `projects/<id>/videos/<vid>/timeline.jsonl` |
| Encoded scene chunks | `temp/<video-ulid>/` (see [backend.md](backend.md#61-temporary-storage-for-encoded-chunks)) |
| Run logs | `logs/<run-id>/` |

The `condor` blob is stored **verbatim from the engine** (`Condor::as_data()` →
serialise). We do not reshape it, so an engine upgrade that adds fields works without a
migration, and a downgrade loses nothing it did not already ignore.

`schema_version` lives at the top of each file. Migrations are an ordered chain in
`crates/service/src/persist/migrate.rs`, each a pure function, each with a fixture test.

### 6.1 The video timeline

Derived state answers "what is true now". It cannot answer "what happened, when, and how
fast", because the evidence for elapsed time does not exist in the `condor` blob — a
completed sequence leaves its outputs but not its duration. The timeline is the durable
record of execution history, and it is the one thing persisted that is not a snapshot of
current state.

Append-only JSON Lines, one record per sequence attempt:

```jsonc
{ "run_id": "01J...", "sequence": "SceneDetector",
  "started_at": "2026-02-11T09:14:02.113Z", "ended_at": "2026-02-11T09:16:44.902Z",
  "outcome": "completed",            // completed | cancelled | failed
  "frames_processed": 143820,        // when the sequence reports a frame count
  "frames_total": 143820,
  "fps": 958.4,                      // frames_processed / wall duration
  "workers": 16,                     // when the sequence runs in parallel
  "detail": { }                      // sequence-specific summary, small and scalar
}
```

Why this shape:

- **Append-only.** A timeline entry is a historical fact. Re-running a sequence appends
  a second entry rather than overwriting the first, so a user can see that Scene Detector
  ran three times and that the last run used different settings.
- **JSON Lines, not a JSON array.** An append is a single line write, so a crash mid-write
  loses at most one record and never corrupts the file. The reader tolerates a trailing
  partial line.
- **`frames_processed` and `fps` are recorded, not recomputed.** Wall-clock duration is
  only observable while the sequence runs; deriving it later from file mtimes is wrong
  because a cancelled run and a completed run can leave the same artifacts.
- **`outcome` distinguishes cancellation from failure.** A user who cancels wants to see
  that they cancelled, not a failure.
- **Bounded.** Entries older than the retention window are pruned on project open, and the
  file is compacted when pruned. The timeline is a UI aid, not an audit log; the run logs
  under `logs/<run-id>/` are the audit trail.

The timeline is **never** used to derive current state. `docs/architecture.md` §4.4 keeps
derivation on the filesystem and the `condor` blob, so a timeline that disagrees with
reality cannot make the UI lie about what is currently true. It is rendered as history
alongside the derived state, and the two are visually distinct.

## 7. Validation model

Three layers, deliberately not collapsed:

| Layer | Where | Purpose |
| --- | --- | --- |
| Schema | generated from Rust | shape, types, ranges |
| Semantic | `crates/engine` | combinations the engine rejects (e.g. a target quality probe count of 0, an encoder that cannot do the requested pass mode) |
| Environmental | preflight | missing binaries, unwritable paths, insufficient disk |

The UI surfaces environmental failures (they are actionable by the user) immediately and
semantic failures on validate/save. The engine's own `validate()` warnings are shown as a
non-blocking advisory panel, because upstream treats them as advisory and we should not
out-strict the authority.
