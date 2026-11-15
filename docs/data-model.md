# Data Model

How the engine's data model maps onto the application's own, how configuration
inheritance resolves, and how pipeline state is derived.

## Contents

- [1. The engine's model](#1-the-engines-model)
- [2. The application's model](#2-the-applications-model)
- [3. Config resolution](#3-config-resolution)
- [4. Derived state](#4-derived-state)
- [5. Scene-level model](#5-scene-level-model)
- [6. Persistence mapping](#6-persistence-mapping)
- [7. Validation model](#7-validation-model)

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
them as `Option` would invent a state the engine does not have. The engine has no `custom`
map on a scene. A user's own pairs are kept beside the checkpoint in the video record
(`custom_scene_data`) and merged into the table a script receives, because a field parked in
the engine's typed `sequence_data` would be dropped on its next load.

Three properties drive everything downstream:

1. **Scenes are always materialised.** A `Condor` loaded from disk knows its scene
   boundaries; it does not re-detect them to display them.
2. **Per-scene encoder overrides are native.** The scene editor is not a hack around the
   model, it is the model. Editing a scene edits `scene.encoder`; there is no parallel
   override table to keep in sync.
3. **`sequence_data` is the record of what actually happened.** `noise_detection.is_some()`
   means the noise detector produced data for that scene; an empty target-quality pass list
   means it has not. This is the data the timeline is derived from. Resumable results also
   carry `provenance.revision` and the declared context that produced them. A result
   without the current revision cannot be repaired by restarting a sequence: the engine
   refuses to reuse it, so its saved data must be reset.
4. **A hole in the table is read as part of the scene before it.** The saved table may leave
   a range uncovered (deleting a scene keeps its frames re-addable), but one clip is opened
   and spliced from these ranges: decoding a table literally would cut the hole out, shift
   every later scene's frames, and shorten the clip by however many frames the hole held.
   Every reader that builds a clip or an encode therefore closes the gap into the preceding
   scene first — `scenes_from_condor` for the probe, the frame still, the decode window, the
   encoded proxy and the exported script, and the run worker for the encode itself. A frame
   number then means the same picture in the probe, the clip, the chunk, and the timeline.
   Only a tail after the last scene may stay uncovered: it comes after every range and
   shifts nothing, so it is how the end of the source is trimmed.

## 2. The application's model

We do **not** re-declare the engine's types. `rust/crates/contracts` re-exports them and adds
only what the engine does not model:

```rust
pub struct Project {                       // the HTTP resource
    pub id: String,                        // UUID v4, also the directory name
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,                // UTC ISO-8601
    pub accessed_at: String,
    pub general: GeneralDefaults,          // what a newly added video starts from
}

// projects/<project-uuid>/project.json adds the engine configuration document.
// It is opaque JSON at the boundary and is addressed through `/config` and `/overrides`.
// There is no `ProjectConfig` Rust struct: the engine's serialised default document is the
// shape, and config resolution is a map of dotted leaf paths over it.

pub(crate) struct VideoRecord {            // videos/<video-uuid>.json
    pub(crate) schema_version: u32,
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) source_path: String,        // the file the queue entry was added with
    pub(crate) input: Value,               // engine `Input` JSON, materialised
    pub(crate) output: Value,              // engine `Output` JSON; `path` may be empty
    pub(crate) overrides: BTreeMap<String, Value>, // sparse, path-addressed
    pub(crate) condor: Option<Value>,      // the engine's own checkpoint blob
    pub(crate) custom_scene_data: BTreeMap<u32, BTreeMap<String, Value>>, // script-only pairs
    pub(crate) temp_directory: Option<String>,     // per-video scratch root
    pub(crate) order: u32,
    pub(crate) created_at: u64,            // epoch seconds on disk
}

pub struct AppSettings {
    pub theme: String,
    pub row_density: String,
    pub reduce_motion: bool,
    pub temp_dir: Option<String>,          // default temp root; project may override
    pub scene_model: Option<String>,       // one TransNetV2 ONNX file for the machine
    pub python_interpreter: Option<String>, // null: the service's resolved interpreter (system, then bundled)
    pub delete_chunks_on_success: bool,    // false by default
    pub project_templates: Vec<ProjectTemplate>, // saved complete documents, name order
    pub default_project_template_id: Option<String>, // copied at creation; null = engine defaults
    pub custom_tools: Vec<CustomTool>,     // accepted paths, re-probed on startup
    pub tool_sources: BTreeMap<String, String>, // bundle id -> "bundled" | "system"; absent = auto
}

pub struct CustomTool {
    pub kind: String,                      // aom | svt-av1 | rav1e | vpx | avm | x264 | x265 | vvenc | ffmpeg | mkvmerge
    pub path: String,
}
````custom_tools` is the saved half of the Dependencies screen. A path is written only after
its probe accepts the executable; discovery is re-run on every start, so a moved binary
becomes unavailable instead of silently remaining green. A rejected attempt is shown in the
current session but is never persisted and never replaces a saved path.

`tool_sources` is the other half: one entry per executable or metric capability, naming the
release bundle or the machine's install. It is a setting, not derived state, because it records the user's choice
rather than what was found; the availability behind each choice is re-probed. An absent id
means *bundled when present and healthy, otherwise system*, which is why a new install has
no ceremony and an old one keeps working. `vapoursynth` is the one compound id (runtime,
Python and plugins); every other id can move independently, and a saved `custom_tools` path
still wins for its family. The full rules and the bundle contents are in
[packaging.md](packaging.md).

`scene_model` is the one path a project never owns. The engine resolves TransNetV2's ONNX
file from the project's `model_path`, then `TRANSNETV2_MODEL_PATH`, then the bundle beside
the executable, then the per-user cache, and an explicit path that does not exist is an
error rather than a hint. The service stores the located file once; `launch` writes it into
the materialised run document only when the detector is `TransNetV2` and `model_path` is
still null, so a project that pins its own path keeps it. It is never copied into
`project.json`, and it is absent from the preflight count.

`project_templates` holds the saved templates. `default_project_template_id` names the one
`POST /api/projects` copies; when it is `null`, the create uses the engine's default
configuration and `GeneralDefaults::default()`. A template is a complete configuration and
General document, not a patch or a pointer. The copy happens in the same atomic write that
creates `project.json`, so there is no second write and no window in which a project exists
without a configuration. After creation the project and the template are independent.
Editing a template never mutates an existing project, and editing a project never mutates
the template. This is the same copy boundary as video creation: `GeneralDefaults` becomes a
materialised `Input` owned by the video. Project configuration inheritance is the
video-over-project resolution in §3; adding a third live layer would make a saved project
change without its owner editing it.

`GeneralDefaults` is the pathless projection of `Input` that a project can own before any
video exists. It carries the decoder choice, import method, FFMS2 index path, the script
source (a `.vpy` path or inline text), and the two ordered filter lists. When a video is
added, the service fills in the source path and assigns the sequence index, producing the
concrete `Input`. Generated `video_path`, `temp_dir`, and scene data are injected at
session/run preparation, not persisted as user configuration. At project scope the UI
therefore never shows a path for the source, only the default that new videos will use.

```rust
pub struct GeneralDefaults {
    pub input_kind: InputKind,
    pub output_mode: OutputMode,
    pub output_folder: Option<String>,       // folder policy only
    pub import_method: Option<VapourSynthImporter>,
    pub index_file: Option<String>,          // native FFMS2 .ffindex
    pub script_mode: Option<ScriptInputMode>,// File or Text
    pub script: Option<String>,              // File mode
    pub script_text: Option<String>,         // Text mode
    pub ffms2_filters: Vec<Value>,           // engine Ffms2Filter JSON
    pub vapour_synth_filters: Vec<Value>,    // engine VapourSynthFilter JSON
}
```

The filter lists are the engine's own typed JSON rather than a mirrored contract enum: the
service validates every entry by deserialising it into the pinned engine's `Ffms2Filter` or
`VapourSynthFilter`, and the General form is generated from the schemas the engine serves.
Both lists are retained when the other input kind is active, so switching kinds does not
discard filter work; only the selected kind's list is read when a video is added.

```rust
/// Sparse, path-addressed overrides. A missing path means "inherit".
/// A path is a leaf or one whole section root (`encoder`, `sequences.<key>`).
pub struct ConfigOverrides {
    pub fields: BTreeMap<String, JsonValue>,
}
```

Input and output are structural, not generic override fields. A video owns the effective
`Input`, because adding a video is what supplies the path; "override" for the input means
it differs structurally from the General default materialised for that path, and reset
replaces the whole input with that default. `ConfigOverrides.fields` addresses sequence
configuration and temp-directory settings only; it never carries a half-materialised input.

Per-scene encoder changes are written to `condor.scenes[i].encoder`, not to a second
`SceneOverride` map. Scene structural edits (split, merge, trim) rewrite `start_frame` and
`end_frame` on the engine's scenes and are persisted by the next `save()`. This is the same
reason there is no `script_path`: both facts already have a home on the engine model.

`GeneralDefaults.output_mode` and `output_folder` resolve only the folder. A video's engine
`Output` document always exists once the video is added, but its `path` may be empty until
it is chosen on that video's General screen; encoding preflight rejects an empty target
rather than inventing `{VIDEO}.mkv`, which can collide with the source. The project scope
never shows a filename field. The document also carries `overwrite` consent: this
application sets it when it chooses the target, and a document written before the field
existed is normalised to the same consent when a run is prepared. An explicit `false` from
an imported document is preserved and makes the engine refuse to replace an existing
distinct file.

`FieldPath` is a dotted path into the engine configuration document
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

1. Enumerate every leaf path in the engine's default configuration document.
2. For each path, look in `video.overrides.fields`. Hit → `Overridden`.
3. Else look in the project's configuration document. Hit → `Inherited`.
4. Else → `Default`, using the engine's `default_parameters()` / `Default` impl.

The leaf set is enumerated from the engine's own serialised default document, not from a
hand-written path list. Because `project.json` stores a full copy of those defaults, a leaf
that still equals its default reports `Default`; a differing leaf reports `Inherited`. An
explicit edit back to the default value is therefore indistinguishable from never editing
it, which is the limit of what a full-copy document can prove.

A one-key section whose child the default does not own is a replacement variant: the
engine's externally tagged enums (`encoder`, `scene_detector.method`) serialise that way, so
changing the variant replaces the section instead of inventing a child path. A save is
validated against the default shape and normalised back to the full document before it is
written, so a sparse request cannot leave a partial document on disk.

A **video** override is section-rooted. Its path is a leaf or one whole section root,
`encoder` or `sequences.<key>`; the video section editors write the whole part and drop the
key when the part again equals the project's value. That is what lets a video choose another
encoder variant without leaving the project's variant's leaves in the materialised document.
`GET …/videos/:vid/overrides` serves the raw map, because the effective config cannot report
where a whole-subtree override begins.

Merge semantics are per field kind, and a field is always resolved as a unit — there is no
partial-object merge, because partial merges on a nested config object produce states
nobody can reason about:

| Field kind | Merge | Rationale |
| --- | --- | --- |
| Scalar (number, bool, string, enum) | replace | obvious |
| Optional / nullable | replace, explicit `null` means "unset" and is distinguishable from absent | needed for flags with no default |
| List (e.g. target-quality probe list) | replace, never concatenate | concatenation makes order-dependent bugs |
| Nested struct | resolved per leaf, or replaced whole at a video section root | a leaf override never drops siblings; a video's whole-section override replaces deliberately |

Encoder options are outside the configuration document: they are resolved key-wise by §3.1, which is
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
    Incomplete,    // a resumable prefix, currently Scene Detector's cancelled sweep
    Complete,      // produced its data under the current config
    Active,        // a live run is executing it now
    Failed,        // the last attempt failed
    Skipped,       // deliberately not part of this video's chain
}
```

`Incomplete` is not a stored flag. Scene Detector writes each boundary as it is found, so a
cancelled sweep leaves a valid prefix. The service compares that prefix's last `end_frame`
with the source length reported by the latest Scene Detector attempt in the timeline. A
prefix that stops short is `Incomplete`, remains runnable, and is resumed by the same engine
call that skips already-written scenes.

The engine's data has no config-hash field, so "stale" is not a state we can derive. The
UI shows the data's `created_on` (where the engine records it) next to the section's last
saved timestamp and labels the block "produced before the last edit" as advisory metadata.
It never changes completion, because a config edit alone has not invalidated the data.

### 4.2 Derivation rules

| Sequence | Complete when | Runnable when |
| --- | --- | --- |
| Scene Detector | `scenes` non-empty, every scene has `start_frame < end_frame`, and the last `end_frame` reaches the source length reported by the last attempt | always (the only entry point); a shorter prefix is `Incomplete` and resumes from its last boundary |
| Noise Detector | all scenes have `noise_detection.is_some()` | scenes exist; VapourSynth is installed. A native `Input::Video` is accepted because the sequence builds its own VapourSynth graph from the FFMS2 decode. |
| Noise Scaler | every scene is below `threshold`, or ineligible (no photon-noise slot, or SVT-AV1 with `film-grain`), or has `noise_scaling.is_some()` | scenes exist; encoder is AOM, RAV1E, or SVT-AV1. A scene without a Noise Detector measurement is left untouched, so detection need not be complete. |
| Target Quality | every scene has at least one quality pass with a non-empty score set | scenes exist; encoders validate |
| Bitrate Optimizer | no completion field; it mutates target-quality data for the next run **and is treated as an action, not a state** | scenes exist; Target Quality has at least one pass; `bitrate_sigma_threshold` set |
| Parallel Encoder | every scene has an encoded chunk file (its `parallel_encoder.bytes` is evidence, not the test) | scenes exist; encoders validate |
| Serial Encoder | every scene has an encoded chunk file | scenes exist; encoders validate |
| Scene Concatenator | output file exists and is non-empty | every scene has an encoded chunk |
| Quality Check | every scene has a quality check with a non-empty score set | output file exists |
| Benchmarker | `parallel_encoder.workers` is set | scenes exist; `workers` unset |
| Speed Scaler | no completion field; it rewrites each scene's encoder speed, which is visible in that scene's encoder and is **not** a separate state | scenes exist; `speed_quantizers` has at least two pairs |

Note that Parallel Encoder and Scene Concatenator are the two sequences whose completion
depends on the **filesystem**, not only on `sequence_data`. That is deliberate and is what
makes crash recovery work. Speed Scaler and Bitrate Optimizer are actions, not phases: they
never enter `next`, and a full run applies them in front of Parallel Encoder when enabled.

Partial concatenation is never offered; the engine requires every requested scene, so a
missing chunk makes the row report how many are missing rather than offering a shorter
output.

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

`script_data` on the state response is a documentation projection of the same evidence, not
a fourth source of state. It is rebuilt on every request from the saved scene table, the
resolved configuration, and the live run id; it is never stored.

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
    pub index: u32,
    pub start_frame: u64,
    pub end_frame: u64,
    pub frame_count: u64,       // zero for an invalid or empty range
    pub encoded: bool,
    pub chunk_bytes: Option<u64>,
    pub quantizer: Option<f64>, // final Target Quality pass
    pub score: Option<f64>,     // mean of that pass's scores
    pub encoder_label: String,  // catalogue label, not the serde variant
    pub encoder_custom: bool,   // scene encoder differs from the video's resolved encoder
    pub custom_data: BTreeMap<String, Value>, // the record's pairs for this index
}
```

The list carries `scene_fingerprint`, a hash of the checkpoint's scene entries and the user's
pairs — the table a script receives. A script can change the picture from
`sequence_data`, so this value is what tells a preview that an edit affects the decode;
[preview.md](preview.md#32-cache-lifecycle) keys the preview cache by it.

Every engine scene carries a complete `Encoder`, so `encoder_custom` is provenance computed
by equality with the video's materialised encoder, never a stored flag. The table carries the
label and that flag only; a scene's full document is fetched on demand by
`GET …/scenes/:index/encoder`, because embedding thousands of option maps would make the
table its own memory problem. Writing an encoder to a selection goes through
`PUT …/scenes/encoder`: the video-level alternative is the existing `encoder` override, and
the two resources are deliberately not one route.

The rail's read model is a projection, not a second copy of the scene document: ranges,
the final pass, and the retained chunk are all the rail and timeline render.The scene editor's encoder sheet and per-scene sequence completion are part of this view,
reading the same engine scene rather than persisting a parallel record.

Multi-select operations (see [preview.md](preview.md#43-multi-select-semantics)) apply over a set of
`SceneView`s and write the affected `condor.scenes[i].encoder` values as one request, so one
user action is one undo step. Structural edits (split, merge, trim) rewrite the scene ranges
and are saved by the next engine checkpoint. There is no second scene override table; the
only per-scene map outside the engine is `custom_scene_data`, which is user data rather than
derived state and is cleared by an edit that renumbers scenes.

## 6. Persistence mapping

| Application concept | File |
| --- | --- |
| Project (name, engine configuration document, General defaults) | `projects/<id>/project.json` |
| VapourSynth script | inside the project's General input / the video `Input` as `VapourSynthScriptSource::Text` or `::Path` |
| Video entry (input, output, overrides, encoder override) | `projects/<id>/videos/<vid>.json` |
| Engine state for a video | embedded `condor` field in the video file, written by the engine's atomic `save_data` |
| Video timeline (append-only run history) | `projects/<id>/videos/<vid>/timeline.jsonl` |
| Encoded scene chunks | `temp/<video-uuid>/` (see [backend.md](backend.md#61-temporary-storage-for-encoded-chunks)) |
| Run logs | `logs/<run-id>/` |

The `condor` blob is stored **verbatim from the engine** (`Condor::as_data()` →
serialise). We do not reshape it, so an engine upgrade that adds fields works without a
migration, and a downgrade loses nothing it did not already ignore.

`schema_version` lives at the top of each file. There is no migration chain yet: this build
reads version 1, and a missing version is treated as 0 and parsed against the current
struct, so a field added since then must be defaulted in Rust. A newer version or a damaged
document refuses to load.

### 6.1 The video timeline

Derived state answers "what is true now". It cannot answer "what happened, when, and how
fast", because the evidence for elapsed time does not exist in the `condor` blob — a
completed sequence leaves its outputs but not its duration. The timeline is the durable
record of execution history, and it is the one thing persisted that is not a snapshot of
current state.

Append-only JSON Lines, one record per sequence attempt plus one terminal record per run:

```jsonc
{ "run_id": "01J...", "sequence": "SceneDetector",
  "started_at": "2026-02-11T09:14:02.113Z", "ended_at": "2026-02-11T09:16:44.902Z",
  "outcome": "completed",            // completed | cancelled | failed
  "frames_processed": 143820,        // when the sequence reports a frame count
  "frames_total": 143820,
  "fps": 958.4                       // frames_processed / wall duration
}
{ "run_id": "01J...", "sequence": null,
  "started_at": "2026-02-11T09:14:02.113Z", "ended_at": "2026-02-11T09:14:02.340Z",
  "outcome": "failed",
  "message": "the input could not be opened: …"
}
```

Why this shape:

- **Append-only.** A timeline entry is a historical fact. Re-running a sequence appends
  a second entry rather than overwriting the first, so a user can see that Scene Detector
  ran three times and that the last run used different settings.
- **Every run ends with one run-level record.** `sequence` is null on that record, and
  `message` carries the terminal event's text. A run that fails while opening its input
  has no sequence attempt to attach to, so this record is the only durable reason the
  page and queue can show.
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

The timeline **never** decides whether a sequence's data exists; `docs/architecture.md` §4.4
keeps that derivation on the filesystem and the `condor` blob. It supplies exactly two
display facts: a failed last attempt may label a sequence `Failed`, and the latest run-level
record supplies the reason shown for a run that failed. Neither overrides the engine's
answer about the data. The failure is run history; its `sequence` names the failed attempt,
while the sequence's own `Failed` status is still that sequence's latest attempt.

`VideoFailure.sequence` is the failed attempt's sequence id, or null when the run failed
before its first sequence. It is derived from the attempt with the same `run_id`; it does
not make the run-level record a sequence status and does not replace a sequence's own
`Failed` status.

`GET …/videos/:vid/history` serves the whole file as `VideoHistory.entries` for the History
tab, which groups entries by `run_id` and sorts runs newest first. That read is the only
place durations and repeated attempts are shown; the page's Configuration tab keeps reading
derived state and never infers a phase from history.

A user may forget one run, which is the History card's delete action. The service removes
that run's entries from the timeline and its `logs/<run-id>/` directory, because both
describe the same execution and leaving one behind orphans bytes no screen can reach. The rewrite is atomic like every other write,
and a live run id is refused with `409`: the forwarder is still appending to it. Derived
state is untouched — it comes from the engine's data and the chunks on disk, not from the
timeline — so forgetting a finished run changes History and nothing else.

## 7. Validation model

Three layers, deliberately not collapsed:

| Layer | Where | Purpose |
| --- | --- | --- |
| Schema | generated from Rust | shape, types, ranges |
| Semantic | `rust/crates/engine` | combinations the engine rejects (e.g. a target quality probe count of 0, an encoder that cannot do the requested pass mode) |
| Environmental | preflight | missing binaries, unwritable paths, insufficient disk |

The UI surfaces environmental failures (they are actionable by the user) immediately and
semantic failures on validate/save. The engine's own `validate()` warnings are shown as a
non-blocking advisory panel, because upstream treats them as advisory and we should not
out-strict the authority.
