# API

The HTTP surface of the service: naming and its exception list, input and script
documents, preview media, and the generated route table. Backend topology, persistence,
and error policy stay in [backend.md](backend.md).

## Contents

- [1. HTTP surface](#1-http-surface)
- [2. Inputs and scripts](#2-inputs-and-scripts)
- [3. Routes](#3-routes)

## 1. HTTP surface

Every route lives under `/api`. The API is lockstep with the application: there is no
version segment and no version header, so a service and a client are expected to ship
together. `api_version` in `/api/health` is diagnostic metadata for support and tests;
nothing negotiates a version from it. Naming is resource-oriented; a trailing verb is a
named command, and every one is listed in §3.

## 2. Inputs and scripts

`andean-condor` models a decoded input as a three-variant enum, and **the VapourSynth
script lives inside the input**, not beside it:

```rust
pub enum Input {
    Video { path, import_method: ImportMethod, filters: Vec<Ffms2Filter> },
    VapourSynth { path, import_method: VapourSynthImportMethod, cache_path, filters },
    VapourSynthScript { source: VapourSynthScriptSource, variables, index, filters,
                        stream_concurrently },
}

pub enum VapourSynthScriptSource { Path(PathBuf), Text(String) }
```

`Condor` carries exactly one `input`. Five sequences additionally carry **optional
per-sequence input overrides**, which fall back to the Condor input when `None`:

| Sequence                | Override fields                                       |
| ----------------------- | ----------------------------------------------------- |
| `SceneDetectorConfig`   | `input: Option<Input>`                                |
| `NoiseDetectorConfig`   | `input: Option<Input>`                                |
| `TargetQualityConfig`   | `input: Option<Input>`, `metric_input: Option<Input>` |
| `ParallelEncoderConfig` | `input: Option<Input>`                                |
| `QualityCheckConfig`    | `input: Option<Input>`                                |

The runner constructs **one sequence at a time**, immediately before that sequence runs, and
clears the previous one before opening the next input. This is deliberate: a per-sequence
input can be a second full decoder graph, and holding every configured override open for a
whole run wastes memory. It also means a request for Scene Detector never evaluates Parallel
Encoder's script, so an unrelated broken override cannot block a single-sequence run.

### Script evaluation and injected data

A `VapourSynthScript` is evaluated when its input is opened, not when a frame is requested.
A graph built once at the start of a run therefore cannot see anything a later sequence
produced. The runner opens the script before every sequence with the engine's current
`condor.scenes`, and replaces `condor.input`; the `Condor` itself, its checkpoints, and its
scenes are unchanged. A per-sequence script override receives the same current table when
that sequence is built, immediately before it runs.

Target Quality's probe input and Parallel Encoder's encode input are prepared once, when
their sequence opens, and kept for the rest of the run. Re-injecting the completed scene
table into Target Quality's probe input or Parallel Encoder's encode input would change the
document identity that the later sequence admits, so a fresh run freezes those documents after their owning sequence starts;
a resumed run without that sequence uses the stored input unchanged. This freezes only the
model's injected values: the generated `condor_data` module still reflects the scene table
while the owning sequence is running.

A script must tolerate an empty scene table: Scene Detector is the first sequence, so its
graph is evaluated before any scene exists. It must also return the same frame count and
format that Scene Detector measured, because detection ran on the unmodified graph.

A script's own imports are re-read when their file changes. VSScript keeps one CPython
runtime for the process, so `sys.modules` outlives an open; the engine drops the script's
local modules whose file stamp changed before every probe, check, preview, and sequence
open, while installed packages and the generated `condor_data` stay loaded. Editing a helper
such as `toolkit.py` therefore reaches the next open without restarting the app.

The service supplies these VSScript variables. VapourSynth exposes them to Python as
`bytes`, so a text value is read with `.decode()`; JSON values are accepted by
`json.loads` directly.

| Variable             | Value                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `condor_scenes`      | JSON array of `{index, start, end, data}` for every scene. `data` is the engine's `sequence_data`: `noise_detection`, `noise_scaling`, `target_quality`, `parallel_encoder`, and `quality_check`. |
| `condor_scene_count` | Number of scenes, as a decimal string.                                                                                                                                                            |
| `condor_temp_dir`    | The per-video scratch directory for chunks and sidecars.                                                                                                                                          |
| `condor_run_id`      | The run's correlation id.                                                                                                                                                                         |
| `condor_sequence`    | The sequence about to run, for example `ParallelEncoder`. Empty before the first sequence.                                                                                                        |

These keys are reserved: a user value with the same name is replaced. The table is derived
from `condor.scenes` at open time and is never persisted by the service. A script that reads Noise Detector's `data.noise_detection` therefore sees `null`
while Scene Detector and Noise Detector themselves are opening, and the result while Target
Quality, Parallel Encoder, or Quality Check is opening. Scripts that ignore these variables
are unaffected.

The generated `condor_data` module reads its document from the directory named by
`condor_temp_dir` in the evaluating script's frame, not from its own location. VSScript
keeps one Python runtime for the process, so `sys.modules` can hand a video the module
another video imported first; resolving the file per open keeps each script's scene table
and detector results its own. A call made after evaluation returns falls back to the JSON
beside the module.

The key table and its current values are served by
`GET /api/projects/:id/videos/:vid/state` as `script_data`: one entry per script input, with
the configuration path it occupies, the sequence whose open will see the values, and one row
per key carrying its description, source, Python format, and value. The value comes from the
same saved scenes and resolved configuration the next run will use, not from a second
implementation. `condor_scenes` is bounded to a 4 KiB preview because the state response is
not a data export; `bytes` still reports the full length and `truncated` marks the preview.
The UI therefore documents and previews what a script receives without evaluating it.

### Plugin namespaces are checked before a run

VSScript reports a missing plugin only when the script is opened, and its error names the
namespace (`No attribute with the name hqdn3d exists`) without saying that it is a plugin.
`POST …/encode` and `POST …/run` therefore read the script inputs the selected sequence list
will open — the General input plus each override the runner would construct — and check every
literal `core.<namespace>` and `core.<namespace>.<function>` against the loaded core. A
missing plugin returns `422` naming the plugin and the script's section before the singleton
is reserved; an override for a sequence outside the request is not read, matching lazy
sequence construction. The check is static by design: dynamic access through `getattr`,
`exec`, or a script that calls `LoadPlugin` is left to the open, whose `No attribute` error
is translated to the same plugin sentence by
[`script_plugins::explain_open_error`](../rust/crates/engine/src/script/plugins.rs).

`POST …/validate` runs the same scan for the video's derived chain and returns the misses as
`plugin_problems`, one row per namespace, section, and missing function. The page that owns
the input renders the row: General shows `General input`, and each Configuration page filters
the list to the input contexts it owns, so an Encoding script is reported on Encoding rather
than on every tab. `GET /api/projects/:id/scripts` and `GET /api/settings/templates/:template_id/scripts` run
the same scan over a project's General input and sequence overrides, or over the template and
its General defaults, and return `ScriptPluginReport` before any video is queued. The reports
are advisory: they do not block a sequence the user did not ask to run, and a host without
VapourSynth reports no plugin problems because there is no loaded core to compare against.
An unreadable script file is reported as `error`, not as a missing namespace.

Consequences for the API:

- **There is no dedicated `/script` endpoint.** A script is a field of an input, so it is
  read and written through the config endpoints. A project config returns `GeneralDefaults`
  (the pathless projection) including `VapourSynthScript { source: Text(..) | Path(..) }`;
  a video config returns the materialised `Input` with its source path.
- **`script.vpy` as a separate file is not required.** The script may be stored as
  `VapourSynthScriptSource::Text` inside the input. A `Path` variant is supported for users
  who prefer a real file, and the UI offers both, but the input is the source of truth
  either way.
- **Per-sequence inputs are first-class.** The config surface must expose the override
  slots above, each defaulting to "inherit from project input", because a VapourSynth-script
  input for the encoder and a native FFMS2 input for noise detection is a legitimate and
  useful configuration. Target quality has two slots: the input it encodes and the metric
  input it scores against.

## 3. Routes

Preview bytes are served by `GET …/media`; its JSON siblings are listed with the other
video routes. The stream ids are `original`, `decoded`, and `encode` (the player labels
`Original`, `Decoded`, `Encoded`). `source=original` is the queued source file.
`source=decoded&frame=N&frames=W` opens the Parallel Encoder input (falling back to General)
and streams W frames from N as lossless H.264 in fragmented MP4, preserving the input's own
bit depth. A window is the unit because it bounds the work and the cache file; the player
snaps N to a fixed grid, so a seek finds a window it already has. `source=encode&scene=S`
resolves one detected scene and
reproduces its whole chunk from the scene's own first frame; `frame=N` resolves the scene by
containment when the caller does not already know its index. `encode_from=original` chooses
the General input instead of the Parallel Encoder input. Both proxies are video only: a
browser appends them to a `SourceBuffer`, which rejects a segment whose index names a track
it does not hold, so the player takes sound from the source's own element. Both are cached
under `<app-data>/cache/preview`, keyed by the engine's proxy recipe, the input, the
encoder, the frame range, and the source's size and modification time, and both are
`.mp4`. The recipe names the codec, lossless mode, preset, GOP, bit-depth rule, and mux
flags, so a pipeline change invalidates the cache without a separate version number.
`GET …/frame?source=decoded&frame=N` renders one lossless PNG (16-bit for a 10-bit input)
for the scrubber; it is never cached.

Lossless H.264 is entropy coding, not a quality setting: a decoded frame is bit-identical to
the Y4M frame the encoder received. The software path encodes the two-second 10-bit 1080p
23.976 window at about 35 fps, ahead of the 24 fps the player needs. The service opens the
input's decode graph once per source identity on a dedicated thread and writes consecutive
windows through it; only the lossless encode and mux remain per window. A native `Video`
source may open a second graph while the first is busy, so an append does not wait for a
warm; every other input keeps one, because evaluating it twice allocates a second copy of
whatever it builds. The appended lead and the cache runway are sized from the measured bitrate and build time
against the `SourceBuffer` budget. Paused, the player fills at most six seconds of that lead
and warms up to 1.5 GiB of cache, so a build's mux overlaps the picture instead of landing
at a seam. Playing, it starts no warms: the script input's one decode graph belongs to the
append ahead of the playhead, and a warm would queue that append behind a build. Starting
playback aborts a paused warm; the next append reads a finished cache file or queues its
build.
NVENC is not used:
H.264 NVENC has no lossless profile, so it cannot produce the Decoded reference. The raw
alternative moves about 142 MB/s at 1080p 10-bit and is a local-connection path rather than
a LAN default.

The encoded path does not write an elementary stream to disk. The scene's encoder document
comes from the checkpoint, the engine builds its final-pass argument list, and the single
output-path argument is replaced with stdout. FFmpeg reads that bitstream on stdin and
copies it into fragmented MP4 (`-c:v copy`), so the picture is the encoder's own output
rather than a second-generation encode. Frames are fed from the scene's first frame because
rate control and keyframe placement depend on them; the player waits until the requested
frame is seekable before leaving its loading stage. The finished concatenated file is not a
substitute for a scene chunk. Consecutive scenes reuse one opened input: the engine keeps a
session per source identity and encodes each scene through it while it is idle, so only the
first scene of a review pays for script materialisation and graph construction (measured at
1.75 s of a 19.1 s warm build on a 261-scene 1080p project). A scene that arrives while that
graph is writing opens a transient one, so a warm and the playhead's own chunk still
overlap. An encoder refusal leaves the graph open; a frame the graph could not produce ends
the session.

The container is the one parameter the preview may pin. An SVT-AV1 build that exposes
`--webm` may default to Matroska even though a run reads IVF chunks back; the scene preview
then passes `--webm 0`. Mainline builds without that switch already write IVF, so the
preview leaves their output format alone. Every rate-control, filter, and colour option
stays exactly as the run configured it. A run's `--keyint 0` means one keyframe per chunk,
which would hold all fragments to the end, so the muxer also caps fragment length at half a
second and the
player can start while the scene is still encoding. A 10-bit-only encoder given 8-bit
decoded frames exits with a diagnostic; its stderr is read while frames are still being
fed, so the route fails with that line in about a second instead of consuming the scene
before reporting the build failure.

The route does not wait for a whole proxy. A request that opens the proxy is answered with
the growing part file as a chunked body, so the element decodes the first fragment while
the rest is still being produced. A request whose range starts past zero cannot be answered
from a growing file, so it waits for the finished cache file and then uses ordinary range
delivery. A second request for the same cache key follows the running build instead of
starting a duplicate decode, and the last viewer leaving stops it and removes the partial
file. A source that cannot be prepared is `422` with the reason before the body starts; a
failure after bytes have been sent closes the body. There is no `/preview` session endpoint; the media route prepares a source per request.
Its cache lifecycle is specified in [preview.md](preview.md).

<!-- routes:start -->

| Method   | Path                                                                     | Purpose                                                                                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`                                                            | app and engine package versions, pinned engine revision, API version, and the cached preflight report                                                                                                                                                                                                                                              |
| `GET`    | `/api/toolchain`                                                         | the bundled components recorded for this target's reviewed lock: versions, licences, source links, and artifact hashes                                                                                                                                                                                                                             |
| `GET`    | `/api/update`                                                            | newest published release from the forge; a repository with none answers with no `latest`                                                                                                                                                                                                                                                           |
| `GET`    | `/api/diagnostics/bundle`                                                | redacted support bundle for the chosen `projects` and log tail; built on request, written nowhere                                                                                                                                                                                                                                                  |
| `POST`   | `/api/preflight/refresh`                                                 | discard the cached report, probe again, and return the new report                                                                                                                                                                                                                                                                                  |
| `POST`   | `/api/preflight/probe`                                                   | probe one user-provided executable against a family and return its candidate check without saving it                                                                                                                                                                                                                                               |
| `POST`   | `/api/preflight/custom`                                                  | probe one user-provided executable and return its check (preflight.md §Custom executables)                                                                                                                                                                                                                                                         |
| `DELETE` | `/api/preflight/custom/:id`                                              | drop a user-provided executable and re-probe                                                                                                                                                                                                                                                                                                       |
| `POST`   | `/api/script/materialise`                                                | render a script as a standalone `.vpy` with the generated module and injected values                                                                                                                                                                                                                                                               |
| `GET`    | `/api/settings`                                                          | read the app settings document                                                                                                                                                                                                                                                                                                                     |
| `PATCH`  | `/api/settings`                                                          | replace only the settings fields the request presents                                                                                                                                                                                                                                                                                              |
| `PUT`    | `/api/settings/scene-model`                                              | the machine-level TransNetV2 ONNX path, or `null`                                                                                                                                                                                                                                                                                                  |
| `PUT`    | `/api/settings/python-interpreter`                                       | the interpreter the script editor's language server analyses, or `null`                                                                                                                                                                                                                                                                            |
| `PUT`    | `/api/settings/tool-source`                                              | one capability's provider, `bundled`, `system`, or `null` for automatic; a Bundled choice is refused when this install cannot resolve it                                                                                                                                                                                                           |
| `GET`    | `/api/settings/templates`                                                | list the project templates                                                                                                                                                                                                                                                                                                                         |
| `POST`   | `/api/settings/templates`                                                | create a project template seeded from the engine defaults                                                                                                                                                                                                                                                                                          |
| `PUT`    | `/api/settings/templates/default`                                        | set or clear the template a new project copies                                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/settings/templates/import`                                         | import one portable template archive under a unique name                                                                                                                                                                                                                                                                                           |
| `PUT`    | `/api/settings/templates/:template_id`                                   | replace a template's name, configuration, and General defaults                                                                                                                                                                                                                                                                                     |
| `DELETE` | `/api/settings/templates/:template_id`                                   | delete a project template                                                                                                                                                                                                                                                                                                                          |
| `GET`    | `/api/settings/templates/:template_id/export`                            | export one template with host paths removed and report them                                                                                                                                                                                                                                                                                        |
| `GET`    | `/api/settings/templates/:template_id/defaults`                          | read a template's effective configuration                                                                                                                                                                                                                                                                                                          |
| `PUT`    | `/api/settings/templates/:template_id/defaults`                          | replace a template's configuration                                                                                                                                                                                                                                                                                                                 |
| `POST`   | `/api/settings/templates/:template_id/defaults/reset`                    | reset a template to the engine defaults                                                                                                                                                                                                                                                                                                            |
| `POST`   | `/api/settings/templates/:template_id/defaults/reset/:section`           | reset one template section                                                                                                                                                                                                                                                                                                                         |
| `GET`    | `/api/settings/templates/:template_id/general`                           | read a template's General defaults                                                                                                                                                                                                                                                                                                                 |
| `PUT`    | `/api/settings/templates/:template_id/general`                           | replace a template's General defaults                                                                                                                                                                                                                                                                                                              |
| `GET`    | `/api/settings/templates/:template_id/scripts`                           | VapourSynth plugin problems in a template's inputs                                                                                                                                                                                                                                                                                                 |
| `GET`    | `/api/projects`                                                          | project summaries (index)                                                                                                                                                                                                                                                                                                                          |
| `POST`   | `/api/projects`                                                          | create from `name` (and optional `description`); copies the default project template, or the engine defaults when none is marked                                                                                                                                                                                                                   |
| `POST`   | `/api/projects/import`                                                   | import that archive as a new project; never reuses ids                                                                                                                                                                                                                                                                                             |
| `GET`    | `/api/projects/:project_id`                                              | project detail                                                                                                                                                                                                                                                                                                                                     |
| `PATCH`  | `/api/projects/:project_id`                                              | rename, description                                                                                                                                                                                                                                                                                                                                |
| `DELETE` | `/api/projects/:project_id`                                              | delete (guarded if a run is active)                                                                                                                                                                                                                                                                                                                |
| `GET`    | `/api/projects/:project_id/config`                                       | effective config + provenance, **including the input and its script**                                                                                                                                                                                                                                                                              |
| `PUT`    | `/api/projects/:project_id/config`                                       | replace project config; a changed encoder or Parallel Encoder input rewrites every inheriting scene and can delete the retained chunks it invalidates                                                                                                                                                                                              |
| `POST`   | `/api/projects/:project_id/config/impact`                                | the retained chunks a candidate project configuration would invalidate, without writing it                                                                                                                                                                                                                                                         |
| `PUT`    | `/api/projects/:project_id/general`                                      | replace the project's `GeneralDefaults`                                                                                                                                                                                                                                                                                                            |
| `POST`   | `/api/projects/:project_id/template`                                     | apply a saved template to a project                                                                                                                                                                                                                                                                                                                |
| `PUT`    | `/api/projects/:project_id/defaults`                                     | restore a project configuration and General snapshot                                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/projects/:project_id/scripts`                                      | VapourSynth plugin problems in the project's General input and enabled sequence overrides                                                                                                                                                                                                                                                          |
| `GET`    | `/api/projects/:project_id/export`                                       | portable JSON archive: configuration, queue, overrides, checkpoints                                                                                                                                                                                                                                                                                |
| `GET`    | `/api/projects/:project_id/videos`                                       | queue                                                                                                                                                                                                                                                                                                                                              |
| `POST`   | `/api/projects/:project_id/videos`                                       | add one video from an input path                                                                                                                                                                                                                                                                                                                   |
| `PATCH`  | `/api/projects/:project_id/videos/order`                                 | replace the queue order (`video_ids`)                                                                                                                                                                                                                                                                                                              |
| `POST`   | `/api/projects/:project_id/videos/remove`                                | remove several videos atomically                                                                                                                                                                                                                                                                                                                   |
| `GET`    | `/api/projects/:project_id/videos/:video_id`                             | video detail: paths, output existence, retained bytes                                                                                                                                                                                                                                                                                              |
| `DELETE` | `/api/projects/:project_id/videos/:video_id`                             | remove one video                                                                                                                                                                                                                                                                                                                                   |
| `DELETE` | `/api/projects/:project_id/videos/:video_id/chunks`                      | delete retained chunks; `423` while that video encodes                                                                                                                                                                                                                                                                                             |
| `DELETE` | `/api/projects/:project_id/videos/:video_id/runs/:run_id`                | forget one run's timeline entries and log directory                                                                                                                                                                                                                                                                                                |
| `GET`    | `/api/projects/:project_id/videos/:video_id/config`                      | effective config + provenance                                                                                                                                                                                                                                                                                                                      |
| `GET`    | `/api/projects/:project_id/videos/:video_id/general`                     | the video's engine `Input` and `Output` documents and its queued source                                                                                                                                                                                                                                                                            |
| `PUT`    | `/api/projects/:project_id/videos/:video_id/general`                     | replace both documents after validating paths and engine shapes; a changed source can delete the retained chunks it invalidates                                                                                                                                                                                                                    |
| `GET`    | `/api/projects/:project_id/videos/:video_id/storage`                     | its scratch directory, the inherited root, retained bytes, and the volume's free and total space                                                                                                                                                                                                                                                   |
| `PUT`    | `/api/projects/:project_id/videos/:video_id/storage`                     | point the scratch work at a directory of its own, or `null` to inherit; `409` while chunks are retained                                                                                                                                                                                                                                            |
| `GET`    | `/api/projects/:project_id/videos/:video_id/history`                     | the append-only timeline entries, oldest first                                                                                                                                                                                                                                                                                                     |
| `GET`    | `/api/projects/:project_id/videos/:video_id/media`                       | byte-range stream of `source=original`, `decoded` (lossless H.264 MP4 from `frame=N`, for `frames=W` or to the end when omitted), or `encode` (a `scene=S` chunk); `encode_from=original` selects the encode's input; `audio=N` serves a cached audio-only extraction of the original source; `206` for a range, `416` when it cannot be satisfied |
| `GET`    | `/api/projects/:project_id/videos/:video_id/frame`                       | one lossless PNG of `source=decoded&frame=N`, for scrubbing without a stream build                                                                                                                                                                                                                                                                 |
| `GET`    | `/api/projects/:project_id/videos/:video_id/audio-tracks`                | the source's audio streams as labels, language, codec, channels, and default flag, read from the container header                                                                                                                                                                                                                                  |
| `POST`   | `/api/projects/:project_id/videos/:video_id/concat-inventory`            | read one concatenation input's streams                                                                                                                                                                                                                                                                                                             |
| `POST`   | `/api/projects/:project_id/videos/:video_id/concat-source-info`          | read the source's chapters and global metadata                                                                                                                                                                                                                                                                                                     |
| `GET`    | `/api/projects/:project_id/videos/:video_id/thumbnails`                  | read the keyframe grid manifest                                                                                                                                                                                                                                                                                                                    |
| `GET`    | `/api/projects/:project_id/videos/:video_id/thumbnails/:index`           | serve one cached thumbnail                                                                                                                                                                                                                                                                                                                         |
| `POST`   | `/api/projects/:project_id/videos/:video_id/probe`                       | open the decode graph and return clip geometry, timing, pixel format and colour, or the reason it could not open; a script input is evaluated with its generated module and the reserved `condor_*` values, exactly as a run would                                                                                                                 |
| `GET`    | `/api/projects/:project_id/videos/:video_id/overrides`                   | the raw sparse override map                                                                                                                                                                                                                                                                                                                        |
| `PUT`    | `/api/projects/:project_id/videos/:video_id/overrides`                   | replace overrides; each path is a leaf or a whole `encoder`/`sequences.<key>` section; a changed encoder rewrites every inheriting scene's encoder, and a changed encoder or `sequences.parallel_encoder.input` can delete the chunks it invalidates                                                                                               |
| `DELETE` | `/api/projects/:project_id/videos/:video_id/overrides`                   | reset to inherited                                                                                                                                                                                                                                                                                                                                 |
| `GET`    | `/api/projects/:project_id/videos/:video_id/state`                       | derived phases and the `script_data` documentation view                                                                                                                                                                                                                                                                                            |
| `GET`    | `/api/projects/:project_id/videos/:video_id/scenes`                      | one row per scene: frame range, final Target Quality pass, retained chunk bytes, encoder label and override provenance                                                                                                                                                                                                                             |
| `PUT`    | `/api/projects/:project_id/videos/:video_id/scenes/encoder`              | write one encoder document to the named scenes that do not already carry it; optionally deletes only those scenes' retained chunks; rejects the whole request if any index is stale or a run holds the lock                                                                                                                                        |
| `POST`   | `/api/projects/:project_id/videos/:video_id/scenes/add`                  | insert a scene in an uncovered `start_frame`–`end_frame` range; moves every later chunk up one index                                                                                                                                                                                                                                               |
| `POST`   | `/api/projects/:project_id/videos/:video_id/scenes/split`                | split the scene containing `frame`; deletes its chunk and moves every later chunk up one index                                                                                                                                                                                                                                                     |
| `POST`   | `/api/projects/:project_id/videos/:video_id/scenes/merge`                | merge an adjacent scene selection; deletes the merged chunks and moves every later chunk down                                                                                                                                                                                                                                                      |
| `POST`   | `/api/projects/:project_id/videos/:video_id/scenes/reset`                | delete the selected scenes' retained chunks only                                                                                                                                                                                                                                                                                                   |
| `POST`   | `/api/projects/:project_id/videos/:video_id/scenes/undo`                 | restore the scene table before the last structural edit                                                                                                                                                                                                                                                                                            |
| `PATCH`  | `/api/projects/:project_id/videos/:video_id/scenes/:index`               | change one scene's boundaries                                                                                                                                                                                                                                                                                                                      |
| `DELETE` | `/api/projects/:project_id/videos/:video_id/scenes/:index`               | delete one scene; deletes its chunk and moves every later chunk down                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/projects/:project_id/videos/:video_id/scenes/:index/encoder`       | one scene's complete encoder document, for the details sheet                                                                                                                                                                                                                                                                                       |
| `PUT`    | `/api/projects/:project_id/videos/:video_id/scenes/:index/sequence-data` | replace one scene's custom sequence data                                                                                                                                                                                                                                                                                                           |
| `POST`   | `/api/projects/:project_id/videos/:video_id/validate`                    | preflight for one video, including missing VapourSynth plugin namespaces                                                                                                                                                                                                                                                                           |
| `POST`   | `/api/projects/:project_id/videos/:video_id/run`                         | **run one sequence** (body: sequence id)                                                                                                                                                                                                                                                                                                           |
| `POST`   | `/api/projects/:project_id/videos/:video_id/encode`                      | **run all sequences** (409 if busy)                                                                                                                                                                                                                                                                                                                |
| `DELETE` | `/api/projects/:project_id/videos/:video_id/encode`                      | cancel                                                                                                                                                                                                                                                                                                                                             |
| `POST`   | `/api/projects/:project_id/videos/:video_id/sequences/:sequence/reset`   | clear one sequence's derived data and scratch files; `422` when it has not run, `423` while the lock is held                                                                                                                                                                                                                                       |
| `GET`    | `/api/projects/:project_id/videos/:video_id/runs`                        | every run that has a log, newest first, joined to its timeline outcome                                                                                                                                                                                                                                                                             |
| `GET`    | `/api/projects/:project_id/queue`                                        | the queue batch: running state, current video, and stop reason                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/projects/:project_id/queue`                                        | start the batch named by `video_ids`, in that order; `409` when a run already owns the singleton                                                                                                                                                                                                                                                   |
| `DELETE` | `/api/projects/:project_id/queue`                                        | stop the batch and cancel its active run; `404` when none is running                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/encoders`                                                          | encoder catalogue + parameter descriptors                                                                                                                                                                                                                                                                                                          |
| `POST`   | `/api/encoders/probe`                                                    | probe one build as a fork of a base encoder without saving (preflight.md §Custom encoder definitions)                                                                                                                                                                                                                                              |
| `POST`   | `/api/encoders/forks`                                                    | save a probed encoder fork                                                                                                                                                                                                                                                                                                                         |
| `PUT`    | `/api/encoders/forks/:id`                                                | replace a fork's name, path, or parameter map                                                                                                                                                                                                                                                                                                      |
| `DELETE` | `/api/encoders/forks/:id`                                                | drop a saved fork                                                                                                                                                                                                                                                                                                                                  |
| `PUT`    | `/api/encoders/:id/parameters`                                           | replace one built-in encoder's descriptor set                                                                                                                                                                                                                                                                                                      |
| `DELETE` | `/api/encoders/:id/parameters`                                           | restore the engine's descriptors for one built-in encoder                                                                                                                                                                                                                                                                                          |
| `GET`    | `/api/storage`                                                           | retained work, scratch and app-data footprint, per-project rows                                                                                                                                                                                                                                                                                    |
| `GET`    | `/api/sequences`                                                         | sequence catalogue + config schema                                                                                                                                                                                                                                                                                                                 |
| `GET`    | `/api/config/schema`                                                     | the engine's configuration schema                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/config/filters`                                                    | `Ffms2Filter` and `VapourSynthFilter` schemas                                                                                                                                                                                                                                                                                                      |
| `GET`    | `/api/config/script-guide`                                               | the script-guide document                                                                                                                                                                                                                                                                                                                          |
| `GET`    | `/api/editor/language-server`                                            | whether a Python language server is available                                                                                                                                                                                                                                                                                                      |
| `GET`    | `/api/editor/interpreters`                                               | every Python interpreter the settings picker can offer                                                                                                                                                                                                                                                                                             |
| `GET`    | `/api/editor/lsp`                                                        | WebSocket bridge to that language server                                                                                                                                                                                                                                                                                                           |
| `POST`   | `/api/config/scripts/validate`                                           | validate one VapourSynth script and return its outcome                                                                                                                                                                                                                                                                                             |
| `DELETE` | `/api/runs/:run_id`                                                      | cancel that run                                                                                                                                                                                                                                                                                                                                    |
| `GET`    | `/api/runs/:run_id/events`                                               | event replay from `seq`                                                                                                                                                                                                                                                                                                                            |
| `GET`    | `/api/runs/:run_id/logs`                                                 | log page: `offset` or `tail=true`, plus `level` and `q`; filtering happens before slicing, so `total` is the match count                                                                                                                                                                                                                           |
| `DELETE` | `/api/runs/:run_id/logs`                                                 | remove the log directory; `409 BUSY` while that run is live, `404` when it is already gone. History keeps the run's record                                                                                                                                                                                                                         |
| `POST`   | `/api/runs/:run_id/logs/export`                                          | anonymised export                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/events`                                                            | SSE stream; `since` or `Last-Event-ID` replays from a sequence cursor                                                                                                                                                                                                                                                                              |
| `POST`   | `/api/events/ticket`                                                     | one-use streaming ticket for SSE or the editor WebSocket on a LAN session; loopback streams need none                                                                                                                                                                                                                                              |
| `POST`   | `/api/media/ticket`                                                      | mint a one-use media credential for a paired LAN session                                                                                                                                                                                                                                                                                           |
| `POST`   | `/api/pair`                                                              | exchange an eight-character pairing code for its session token; no bearer token, same-origin only, `401` for every invalid code, `429` with `Retry-After` after five failures from one peer in a minute                                                                                                                                            |
| `GET`    | `/api/lan`                                                               | LAN status, bound address, and paired sessions with their tokens and shortcodes                                                                                                                                                                                                                                                                    |
| `POST`   | `/api/lan/enable`                                                        | start the LAN listener                                                                                                                                                                                                                                                                                                                             |
| `POST`   | `/api/lan/disable`                                                       | stop the LAN listener                                                                                                                                                                                                                                                                                                                              |
| `POST`   | `/api/lan/rotate`                                                        | issue another pairing token; existing sessions remain until revoked                                                                                                                                                                                                                                                                                |
| `POST`   | `/api/lan/sessions/:session_id/revoke`                                   | revoke one paired browser                                                                                                                                                                                                                                                                                                                          |

<!-- routes:end -->

**Route naming.** A resource transition uses the resource URL and the HTTP method that
names it: `DELETE …/videos/:video_id` removes one video, `PATCH …/scenes/:index` changes one
scene's boundaries, and `PUT …/scenes/:index/sequence-data` replaces one scene's data. A
command keeps a trailing verb only when no resource at that path represents the action, and
every such path is listed below with the reason it stays. A new verb path adds a row here
rather than becoming an exception discovered later.

| Command                                                                                             | Why it is not a resource transition                                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `videos/remove`                                                                                     | Removes several videos atomically; a collection `DELETE` would need a request body, which intermediaries may drop.           |
| `scenes/add`                                                                                        | Inserts an uncovered frame range into the table and renumbers every later chunk; it does not create an independent resource. |
| `scenes/split`                                                                                      | The target is the scene containing a frame, not a resource id, and the edit renumbers every later scene.                     |
| `scenes/merge`                                                                                      | Consumes an adjacent selection, so there is no single resource to transition.                                                |
| `scenes/reset`                                                                                      | Deletes retained chunks for a selection; the scenes themselves stay.                                                         |
| `scenes/undo`                                                                                       | Restores the table before the last structural edit; that state has no resource URL.                                          |
| `preflight/refresh`                                                                                 | Re-probes the machine and replaces a cache; there is no stored preflight resource to `PUT`.                                  |
| `encoders/probe`                                                                                    | A dry run that creates nothing; the saved result is `POST encoders/forks`.                                                   |
| `script/materialise`                                                                                | Renders a derived `.vpy` from a script document; it creates no stored resource.                                              |
| `projects/import`, `settings/templates/import`                                                      | Create resources from an uploaded archive; the upload is the request body, not a resource at a path.                         |
| `config/scripts/validate`, `videos/:video_id/validate`, `videos/:video_id/probe`, `preflight/probe` | Dry runs that return a report and create nothing.                                                                            |
| `lan/enable`, `lan/disable`, `lan/rotate`, `lan/sessions/:session_id/revoke`                        | Listener and session lifecycle; there is one listener, not a collection.                                                     |
| `videos/:video_id/run`, `videos/:video_id/encode`                                                   | Start work; the resource is the run and its event stream, not the request.                                                   |
| `sequences/:sequence/reset`, `settings/templates/:template_id/defaults/reset`, `…/reset/:section`   | Clear derived state in place; the document at the path stays.                                                                |
| `runs/:run_id/logs/export`                                                                          | Renders a downloadable artifact rather than changing a resource.                                                             |

None is scheduled for a breaking rename during the stable window: the current shape is the
contract clients already use, and a rename would be a breaking change with no behavioural
gain. Some rows do have a plausible resource form — a collection `POST` for `scenes/add`, a
pairing-token resource for `lan/rotate`, a `PUT` for `preflight/refresh` — but adopting one
would change the contract rather than fix a defect, so each stays until a release that can
break clients.

`POST …/run` and `POST …/encode` share the lock, the cancellation path, and the event
stream. The only difference is which sequences execute: `encode` runs the full chain in
dependency order, `run` executes exactly the one named in the body, subject to the
transition rules in [runs.md](runs.md) §4.

Status codes matter and are part of the contract:

| Code  | Meaning                                                        |
| ----- | -------------------------------------------------------------- |
| `409` | a run is already active                                        |
| `423` | resource is locked by an active run                            |
| `422` | semantically invalid config, or an invalid sequence transition |
| `507` | insufficient disk space                                        |

The disk floor is a fixed **512 MiB** on both the output and scratch volumes; below
**2 GiB** the validation response warns but allows the run. The check walks to the nearest
existing ancestor, so a scratch directory that the engine has not created yet is still
measured on the volume it will use. An unreadable volume is a warning, not a refusal: a
network share must not become unusable for lack of evidence. See
[backend.md](backend.md#61-temporary-storage-for-encoded-chunks) §6.1.

**Project creation is a copy, not a link.** A marked project template is a complete
configuration and General document. `POST /api/projects` copies it into the new
`project.json` inside the same atomic create that writes the file; when no template is
marked default, the engine defaults are used. The new project is never briefly configless,
and a concurrent `PATCH /api/settings` cannot produce a half-copied project. The request
carries only a name and optional description; import is a separate endpoint and archive
schema. Later edits to a template do not propagate, and a project edit does not write back
to the template. This is the same reason overrides are copied into a materialised `Input`
at add time rather than referenced: a saved project must mean what it says.

**Queue order and bulk removal are server state.** `PATCH …/videos/order` takes the full
ordered `video_ids` list and rejects a list that is not a permutation of the current queue,
so a stale client cannot drop or duplicate a video. `POST …/videos/remove` takes a set of
ids and removes them in one lock check and one write; a partial failure leaves the queue
unchanged. A run locks ordering and removal for every video it owns until its terminal
event. Single-video `DELETE` remains for the row menu.

**A queue batch is service state, not a client loop.** `POST /queue` names the ids and
returns; one service task reserves the same singleton an explicit encode takes and walks the
list, so a second batch or encode is refused by one lock and one video's failure does not
abandon the rest. Membership is polled once per 1.2 s only while a batch is active; each
row's progress still comes from the pushed `video-state` cache. The batch therefore survives
navigation and reload, and a restart reports no batch rather than resuming stale work.
