# Project screen and configuration

The project surface is a **section grid plus the queue**. It owns project-level defaults
and queue operations; a card opens one section screen, and the script editor is a separate
route. Every section is a draft until saved, and the server enforces the run lock.

## Contents

- [Section grid](#section-grid)
- [Shared section contract](#shared-section-contract)
- [Queue](#queue)
- [General](#general)
- [Filter list](#filter-list)
- [Scene detection](#scene-detection)
- [Noise generation](#noise-generation)
- [Encoding](#encoding)
- [Target quality](#target-quality)
- [Concatenation](#concatenation)
- [Quality check](#quality-check)

## Section grid

### Section grid layout

| Area | Owns |
| --- | --- |
| General | input kind, filters, script path or text, output folder; the FFMS2 index and source path only in the video context |
| Scene detection | method, minimum/maximum scene length, input override |
| Noise generation | noise detector and noise scaler, in that order, with one input override |
| Target quality | target quality, speed scaling, then bitrate optimization, with individual controls for each |
| Encoding | input, encoder, passes, colour data, photon noise, parameters, FFmpeg filter |
| Concatenation | method; the video owns the track map, chapters and metadata |
| Quality check | metric, strategy, statistic, input override |
| Queue | videos, per-video derived state, reorder, multi-select, add/remove, run/cancel |

- Seven cards in pipeline order: General, Scene detection, Noise generation, **Target
  quality**, **Encoding**, Concatenation, Quality check. General is one card, not an
  always-open summary above the grid.
- Each card shows its title and whether the section is **Set** or still using the **Engine
  default**. A card that a run locks shows **Locked**.
- The grid uses the full content width and has no sidebar. The queue follows it, with the
  queue count and on-disk size in its header.
- The 56px top bar carries Back, undo, redo, **Discard**, **Save**, and the dirty-state
  indicator. Section content uses the reclaimed horizontal width.
- The project header carries **Apply Template**. Its picker is searchable, lists the saved
  templates, and marks the default. It is disabled while the project is locked or no template
  exists.

### Section grid behavior

1. **Open a section.** Selecting a card opens exactly that section's screen. The only way
   back to its siblings is the grid, which is also the deliberate point at which a draft is
   saved or discarded.
2. **Read the card.** A card states whether it is set or using the engine default. The grid
   is never disabled by a lock; the card says **Locked** because configuration writes are
   refused by the server while a run is active.
3. **Leave the section.** Back returns to the grid. A dirty draft meets the shared leave
   guard, whose primary action saves and leaves.
4. **Keep section boundaries.** Scene detection and Noise generation are separate screens
   because they answer different questions and produce different data. Noise detection and
   scaling stay together because the scaler consumes the detector's per-scene value.
5. **Benchmarking has no section.** It is the `Auto` branch of Encoding's worker control;
   its threshold and memory cap sit in that branch, where the value is used.
6. **Target quality owns three stages.** Target quality, speed scaling, and bitrate
   optimization share one screen because all three consume the per-scene quantizer the probe
   produced. All three are visible with their own run controls.
7. **Apply a template.** **Apply Template** opens a searchable picker of every saved template.
   Applying one replaces the project's configuration and General section, never a video's
   overrides, and keeps the project's name and queue. The service refuses while the project
   is locked. The project top bar's Undo and Redo restore the before/after snapshot.

### Section grid states

| State | Contract |
| --- | --- |
| Loading | The grid renders skeleton cards while the project configuration loads. |
| Empty | Not applicable; a project always has seven section cards. |
| Error | A project load failure uses the screen-level error panel. Card-state errors stay inline. |
| Populated | Cards show **Set** or **Engine default**; the queue follows the grid. |
| Locked | Cards remain navigable and say **Locked**; section controls are read-only. |

### Section grid data and contracts

- **Routes.** Project detail and configuration routes; queue routes; template application
  through `GET /api/settings/templates` and
  `POST /api/projects/{project_id}/template`. See
  [backend.md §5](../backend.md#5-http-surface).
- **Derived card state.** Set, Engine default, and Locked are derived from the project
  configuration and the live run. No card state is stored.
- **Queue.** Order and membership are server state; selection is ephemeral. See [Queue](#queue).

## Shared section contract

### Shared section contract layout

- Every section page uses the same chrome: the top bar with Back, undo/redo, **Discard**,
  **Save**, and the dirty indicator; a full-width content area; no footer and no second pair
  of save actions.
- The section body is the form. The top bar is the only save surface.

### Shared section contract behavior

1. **Draft and save.** Edits are local. Save writes and stays on the screen; Discard restores
   the last saved state without leaving. There is no implicit save on navigation, because a
   user who is experimenting needs a way out and a user who is done needs a deliberate
   commit. The full contract is [frontend.md §5](../frontend.md#5-draft-undoredo-and-save).
2. **Lock.** A project section is locked while a run in **this project** is active. The
   encoding video's own sections are locked instead; its siblings stay editable. A video
   encoding in another project leaves every field here editable. The one encode the service
   allows is process-wide, so every Start and batch control reads the live stream and
   disables itself with the reason when another video holds it.
3. **Input override.** Every sequence input override is one `InputOverrideEditor` around the
   shared `InputEditor`, so no section falls back to a schema-shaped object form for a
   decode.
   - The choice is between the context's own input and an override; the override uses the
     same three-kind editor General uses.
   - A sequence may decode with FFMS2 and its own filters, with VapourSynth and a source
     plugin, or with a script.
   - Each sequence's value is its own; an absent value means the run's input, not a copy of
     it.
4. **Script plugin notice.** A VapourSynth input may call a plugin this machine does not
   have, and the engine notices only when it opens the script. Each page reads the scan and
   renders `ScriptPluginNotice` for its own contexts: General shows `General input`; Target
   Quality owns both the probe input and the metric input; Concatenation owns none. The
   notice is not on the shared video bar, so a broken Encoding script is reported on
   Encoding rather than on every tab.
5. **Project and template script scans.** A project's pages read
   `GET /api/projects/{project_id}/scripts`; a template's editor reads
   `GET /api/settings/templates/{template_id}/scripts`, so a broken script is visible before a
   video is queued. Video pages read `plugin_problems` from `POST …/validate`.
6. **Remediation.** Each notice row names the namespace, and the function when only that is
   missing, then the install or removal that fixes it. It is advisory: a problem in an input
   the next sequence does not open stays a warning, while Start still refuses the sequence
   list it would actually construct.
7. **Document scope.** A source path and an FFMS2 index identify one file, so they are shown
   only in the video context, which owns that file. A project or template document is
   abstract: those two fields are absent there.
   - The launch route fills the video's own source into every sequence input that names none
     before the document reaches the engine.
   - That is the engine's own convention: a sequence's optional input overrides the run's input
     and is otherwise inherited, so a project-level detection or encoder override still decodes
     each video's source.
   - The video context shows the path and index through the same component, with no second
     form.
8. **Scope is named in copy.** The same scope names the document **Project input**,
   **Template input**, or **Video input**. A stored script says which document keeps it.
   Settings → Project Templates passes `template`, so a template override never claims to be
   stored in a project.
9. **Project versus video context.** The project context exposes defaults only: no per-video
   clip info, no sequence progress or data, and no output file name. The video context reuses
   the same section components and adds the video's status and progress, its sequence data,
   its probed `clip_info`, and an exact output file.
10. **Whole-document overrides.** A video override replaces one whole section document
    (`encoder`, or `sequences.<sequence>`), not leaves inside it. A section that changes
    shape — a different encoder variant or detector method — must replace the inherited
    document rather than leave its keys beside the chosen variant. The differences are in
    [Video](video.md).

> **Why:** the grid is the save/discard boundary, so a sibling click cannot silently discard
> a draft. The lock is enforced by the server (`423`) rather than by disabled inputs alone.

### Shared section contract states

| State | Contract |
| --- | --- |
| Loading | Section chrome renders immediately; the body shows a layout-matching skeleton and controls stay disabled until the configuration query resolves. |
| Empty | The section still renders and names its prerequisite; a filter list or probe area is never a blank page. |
| Error | A load failure uses the screen-level error panel with a retry. Save, probe, and validation errors stay inline with the field that caused them. |
| Populated | Saved values and provenance badges are visible; derived chips reflect the current state. |
| Locked | The whole section is read-only; Add, Edit, Remove, and Save are disabled, and writes answer `423`. |

### Shared section contract data and contracts

- **Routes.** Project and video configuration routes; `GET /api/projects/{project_id}/scripts`;
  `GET /api/settings/templates/{template_id}/scripts`; `POST …/validate`. See
  [backend.md §5](../backend.md#5-http-surface).
- **Persistence.** The draft is local. Save replaces the resource and the server validates
  it. A project's sections refuse writes while its run holds the lock; sibling video
  overrides and template writes stay available.
- **Three permanent rules.**
  - The scenes directory is per-video and owned by the service, not a section field.
  - The scratch override lives on the video's General and in Settings → Storage; project
    General does not duplicate it.
  - Output belongs to General: a folder at project scope, an exact file at video scope; the
    concatenator's output is not configured again.
  - A VapourSynth script is one input for the whole video, not a section; per-scene behaviour
    comes from the script reading injected scene data ([AGENTS.md](../../AGENTS.md) §2.10).

## Queue

### Queue layout

- The queue is a list of videos, not a table. Each row has two inner lines: the video name,
  then the input file name, its duration, and the encoded size once known.
- While a video is encoding, the size is an estimate labelled `est.`; a queued or failed row
  shows no size rather than a dash. The state chip is centred against the row's full height.
- A failed run adds its reason as a danger line under the metadata. It can exist before any
  sequence row is marked failed, so the chip follows the run.
- A drag handle at the start changes order; the order is the run order. A search field in the
  header, left of the run control, narrows rows by name or input path.
- A checkbox selects rows; Shift-click extends, and dragging across the list sweeps a range.
  Selection raises one bulk bar above the rows with **Run**, **Remove**, and **More**.
- A three-pixel progress bar sits on the bottom edge while a video's run is active or paused;
  queued and completed rows do not reserve an empty bar.
- The empty queue is one dashed drop target with the same Add action. The populated header
  states that files can be dropped there.

### Queue behavior

1. **Reorder.** Drag a row by its grip, or use Move up / Move down. The order is the run
   order.
2. **Filter.** Search narrows rows by name or input path without changing the queue. Every
   row keeps its position in the unfiltered order, so Move up, Move down, and a drag still
   name the rows they would move once the filter is cleared.
3. **Select.** Checkbox selects; Shift-click extends; a drag sweeps a range. The bulk bar is
   one action on the selection, not a repeated per-row control.
4. **Add.** Drop files anywhere on the queue and they append in drop order; the file picker
   is an alternative, not the only way in. A drop that adds files and a drag that reorders
   are different gestures: rows carry the grip, the card accepts files.
5. **Progress.** The progress bar appears only while the run is active or paused.
6. **Row actions.** The trailing overflow menu holds **Open input location**, **Open output
   location** (disabled until the output exists), **Open retained chunks**, **Copy input
   path**, **Copy output path**, **Move up**, **Move down**, and red-on-hover **Remove**.
   Each item carries its icon. Unavailable actions are present with the reason, not silently
   absent.
7. **Remove.** Removing a video with retained work states how much will be deleted and
   requires confirmation. Removing a queue entry never deletes the source file.
8. **Order is server state.** A drop produces one `PATCH` that replaces the queue order; the
   list does not optimistically reorder itself twice. A run locks only the active row's
   order and removal until it reaches a terminal state; siblings remain editable, and the
   server rejects the active-row mutation with `423` rather than relying on a disabled
   control.

### Queue states

| State | Contract |
| --- | --- |
| Loading | Skeleton rows while the queue query resolves. |
| Empty | One dashed drop target with the Add action. |
| Error | Queue load failure uses an inline retry; add and remove failures stay inline; a failed run adds its danger line. |
| Populated | Rows show name, input, duration, size, and state; selection raises the bulk bar. |
| Locked | The active row cannot be reordered or removed; sibling rows stay editable and Add remains available. The server answers `423` for the active row. Open and copy actions remain available. |

### Queue data and contracts

- **Routes.** `GET …/videos`; `POST …/videos`; `PATCH …/videos/order`;
  `POST …/videos/remove`; `DELETE …/videos/:video_id`. See
  [backend.md §5](../backend.md#5-http-surface).
- **Order and membership.** Server state, because they change what the next client runs.
- **Selection.** Ephemeral React state, not persisted, cleared by navigation. The drag is
  ephemeral until drop.
- **Retained size.** `retained_bytes` is derived from chunk and probe files; the source video
  is excluded.

## General

### General layout

- **Input kind.** A radio group: `FFMS2`, `VapourSynth`, `VapourSynth script`. Each kind owns
  an ordered filter list.
- **Filter families.** FFMS2 accepts `Ffms2Filter`; VapourSynth and VapourSynth script accept
  the engine's ten `VapourSynthFilter` variants listed under [Filter list](#filter-list).
- **VapourSynth import method.** A second radio group (`FFmpegSource`, `BestSource`,
  `L-SMASH-Works`, `DGDecNV`), shown only for the VapourSynth kind and stored on the
  project's General defaults.
- **FFMS2 index.** An optional `.ffindex` path; empty lets the engine place the index beside
  the source.
- **Script sources at project scope.** Two rows: a located `.vpy` file used as written, or
  inline script text stored in the project document. The selected row carries its own
  control: the file row holds the path field with **Locate** inside it; the stored-text row
  holds the line count and **Open editor**.
- **Output.** `Next to input` or `Specific folder`, drawn with the same choice cards as the
  input radio group. The cards share one row where the column can carry them; the
  specific-folder path and picker appear below only while that mode is selected.
- **No file name.** The default never reuses the source name; the video screen chooses the
  exact output file. The pixel format is owned by the input filter list, so Output carries no
  format field. The scratch root is app-wide in Settings → Storage; project General does not
  duplicate it.

### General behavior

1. **Own the list.** Each input kind owns its ordered filter list, stored as the engine's own
   typed JSON, never a comma-separated string or a hand-written mirror. A script's list is
   chained onto its output node, which lets an Encoding override add an output-stage filter
   without rewriting the script.
2. **Respect the defaults.** An empty FFMS2 or VapourSynth list keeps the engine's 10-bit
   conversion, which is why a new project starts with an explicit `OutputFormat` or `Resize`
   row rather than an invisible constructor. A script with an empty list is left exactly as
   the script produced it.
3. **Choose the import method.** The VapourSynth import method is shown only for the
   VapourSynth kind and stored on the project's General defaults. An empty FFMS2 `.ffindex`
   lets the engine place the index beside the source.
4. **Choose a script source.** At project scope, **VapourSynth script** offers a located
   `.vpy` file or inline text. A mode never adds a detached control row below the group, so
   choosing a source does not change the section height by more than the field it reveals.
   Both sources receive the injected scene table; neither is copied, rewritten, or written
   into app-data. `stream_concurrently` stays at its bounded-memory default. These are
   advanced controls, not part of the Add-filter form.
5. **Switch at video scope.** Selecting a `.py` or `.vpy` file switches the input to
   `VapourSynthScript::Path` and hides the codec-decoder choices. The script page shows that
   the file is used as written and offers to store a script in the app, which converts the
   input to `::Text` and warns that the external file's folder is no longer on the import
   path.
6. **Choose output.** At project scope, `Next to input` or `Specific folder` uses the shared
   choice cards. There is no file-name field; the video screen chooses the exact output file.
   The pixel format comes from the input filter list.
7. **Do not claim clip data.** The project input carries no clip info because there is no
   video yet. The video context adds the probed `clip_info`.

### General states

| State | Contract |
| --- | --- |
| Loading | The configuration skeleton is shown while General and the filter schemas load. |
| Empty | A new project starts with an explicit `OutputFormat` or `Resize` row; an empty script filter list is valid and leaves the script output untouched. At project scope there is no source path. |
| Error | Invalid filter JSON is rejected on save with the same engine decode the run uses; a bad `.ffindex` or save failure stays inline. |
| Populated | The selected input kind, import method, filter list, and output policy are visible with provenance. |
| Locked | All fields are read-only; writes answer `423`. |

### General data and contracts

- **Routes.** `GET`/`PUT` the project or video General document; `GET /api/config/filters`
  for the engine filter schemas. See [backend.md §5](../backend.md#5-http-surface).
- **Filter catalogue.** Field-by-field ownership is in
  [filter-catalogue.md](../filter-catalogue.md).
- **Scope.** A project document has no source path or FFMS2 index; a video's General has
  both. Script text and file paths are stored in the document that owns them.

## Filter list

### Filter list layout

- Add opens **one sheet**, the **filter composer** (`01 Components / Filter composer`), not a
  picker followed by a second surface.
- The sheet has a searchable type pane grouped by geometry, temporal, denoise, and grain,
  with recent types first. The chosen filter's generated form sits beside it, so the list
  behind never reflows mid-edit.
- `Resize` gets the board's size row: width, an aspect lock, height, reset, with
  1080p/720p/540p presets that fill the fields without locking them. Every other filter
  renders its fields in two columns ordered geometry-first.
- Rows show a one-line summary (`Resize · 1920×1080 · lanczos`), a grip, and a trash action.
- FFMS2 has one schema variant, `OutputFormat`; VapourSynth and VapourSynth script accept
  `Crop`, `Resize`, `Trim`, `Rescale`, `WNNM`, `Bilateral`, `Degrain`, `ZoomDegrain`, and
  `FGS`.

### Filter list behavior

1. **Add.** Add opens the sheet. Selecting a variant swaps the fields in place; Confirm
   inserts the filter at the end of the list. For FFMS2 the sheet opens on `OutputFormat`
   directly and never offers Crop, Trim, or a scaler choice.
2. **Cancel.** Escape closes the sheet without changing the list.
3. **Reorder.** Drag a row by its grip, with the same grip and top-edge drop line the video
   queue uses. There is no duplicate action.
4. **Remove.** The trash action removes the row.
5. **Generate, never invent.** Every field is generated from the engine schema the service
   serves; a field the engine does not expose cannot be invented in the form.
6. **Respect project scope.** At project scope the source is unknown, so the sheet does not
   fabricate a resolution or crop bound. Geometry that needs the source is validated when a
   video is added. Invalid filter JSON is rejected by the service when General is saved,
   using the same engine decode the run uses.

> **Why:** one sheet avoids a list that reflows between a popover and an inline form and
> keeps the escape route unambiguous. A duplicate filter is a second edit of every field,
> not a shortcut.

### Filter list states

| State | Contract |
| --- | --- |
| Loading | The sheet shows its schema skeleton while `/api/config/filters` resolves. |
| Empty | No rows is valid; General shows the Add action and the engine's conversion default applies. |
| Error | A schema failure is reported in the sheet; invalid filter JSON is rejected on save. |
| Populated | Rows show their one-line summaries and can be edited, reordered, and removed. |
| Locked | Add, Edit, reorder, and remove are disabled; the sheet cannot open. |

### Filter list data and contracts

- **Schema.** `/api/config/filters` serves `schema_for!(Ffms2Filter)` and
  `schema_for!(VapourSynthFilter)` from the pinned engine.
- **Storage.** The engine's own typed JSON, never a hand-written mirror.
- **Catalogue.** [filter-catalogue.md](../filter-catalogue.md).

## Scene detection

### Scene detection layout

- **Method card first.** A small radio group: `None`, `AVSceneChange`, or `TransNetV2`.
  `AVSceneChange` adds a second radio group for fast/standard. All methods carry minimum and
  maximum scene length, side by side. A video section edits them in seconds once its source is
  probed and shows the stored frame count beneath each field; project and template scope keep a
  `frames` field because one document applies to sources with different rates.
- **Input card.** `Project input` and `Custom input` radios. A custom input is edited by the
  same `InputEditor` General uses: the same three kind cards, source plugin, script source,
  and engine-schema filter list.
- **Variables.** A custom script's `variables` map is an ordered key/value list. A repeated
  key is marked and Save stays disabled until the names are distinct.
- **Scores.** A **Save per-frame scores** switch sits inside the Method card, shown only for
  the two methods that produce scores. It is off by default.
- **Model note.** The TransNetV2 ONNX model is not edited here. It is one machine-level file
  in [Settings → Dependencies](settings.md), applied to every project whose detector is
  `TransNetV2` and whose `model_path` is unset. The section says where it is set and that the
  fast/standard pair does not apply to it.

### Scene detection behavior

1. **Choose the method.** The method card comes first because it decides what every later
   field means.
2. **Edit the input.** A custom input uses the shared `InputEditor`. A repeated variable key
   is refused rather than collapsed, because the engine stores one map and the second row
   would silently overwrite the first.
3. **Respect scope.** At project scope the input names no file; the video context adds the
   source path and index. Clearing the override restores the project input.
4. **Save scores.** The switch is inside the Method card, not a separate Options card; a
   separate card would be a section with one switch. It is off because it floods the config.
5. **Edit in a unit the scope can know.** A video's seconds edit rounds to the nearest frame
   at the probe rate; the frame readout is the exact stored value. Project and template scope
   stay in frames because no single rate exists there.
6. **Explain `None`.** `None` produces one arbitrary scene; the detector writes scenes as
   they are found.
7. **Use the machine model.** TransNetV2's model is set once in Settings → Dependencies. It
   applies to every matching project and does not use the fast/standard pair.

### Scene detection states

| State | Contract |
| --- | --- |
| Loading | Method and input schemas load into a skeleton. |
| Empty | No scenes yet is valid; the detector can run. The screen explains that `None` still produces one scene. |
| Error | A duplicate variable, invalid input, or save failure stays inline; the model note names the missing machine setting. |
| Populated | Method, scene lengths (seconds on a probed video, frames otherwise), input scope, and score option are visible. |
| Locked | All fields are read-only; writes answer `423`. |

### Scene detection data and contracts

- **Configuration.** The sequence document owns the method, scene bounds, input override,
  and score switch.
- **Script scan.** `plugin_problems` from `POST …/validate` for the video context; project
  pages use `GET …/projects/:id/scripts`.
- **Model.** `AppSettings.scene_model`; see [preflight.md](../preflight.md).

## Noise generation

### Noise generation layout

- This screen owns both the noise detector and the noise scaler, in that order.
- **Detector.** An optional input override (the shared editor), then a reference filter list
  and a denoised filter list. Each row shows its one-line summary with **Edit** and a remove
  icon; both open the same filter composer.
- **Scaler.** Four fields — threshold, minimum scaler, maximum scaler, and `scale_chroma` —
  sit on one row at desktop width and wrap to two below it, so the three numbers are
  compared rather than scrolled past. An availability chip states whether detection has
  produced values yet.

### Noise generation behavior

1. **Enable the detector.** Enabling it writes the engine's WNNM pair rather than two empty
   lists.
2. **Use the shared composer.** Reference and denoised filter rows open the same Filter list
   sheet as General.
3. **Accept a video input.** A video input is valid here: the engine builds a VapourSynth
   graph from the FFMS2 decode, so the screen warns only when VapourSynth is not installed,
   not when the input is not already VapourSynth.
4. **Respect scope.** A project template names no source; a video's override carries the path
   and FFMS2 index for that one file.

> **Why:** an empty detector pair would measure unfiltered against unfiltered and report no
> grain, so enabling the detector seeds real WNNM filters.

### Noise generation states

| State | Contract |
| --- | --- |
| Loading | Detector and scaler configuration load into a skeleton. |
| Empty | The detector may be disabled and the scaler may have no values yet; the availability chip says so. |
| Error | VapourSynth missing is a warning; filter and save failures stay inline. |
| Populated | Detector filters, scaler values, and measured noise are visible. |
| Locked | All fields are read-only; writes answer `423`. |

### Noise generation data and contracts

- **Configuration.** The sequence document owns both the detector and scaler; the scaler
  consumes the detector's per-scene value.
- **Measured data.** Derived from `condor.scenes[*].sequence_data`; see
  [Video § Measured data](video.md#measured-data).
- **Script scan.** `plugin_problems` from `POST …/validate`.

## Encoding

### Encoding layout

- **Input first.** The parallel-encoder input is labelled **Input**, like every other input,
  because it is the decode the encoder workers read.
- **Encoder selection.** The nine encoders are one radio grid with availability from the
  preflight inventory. Saved builds from Settings → Encoders follow in a **Your builds**
  grid, each row naming its label and base. A build with no executable is still offered,
  marked **not located**; selecting one warns that the run falls back to the base encoder's
  provider and links to **Manage encoders**.
- **Executable.** One field with **Locate…** and **Use PATH**, which clears the override back
  to the catalogue's provider. There is no second build picker; `Encoder.executable` already
  is the build selection.
- **Passes.** A number written as `EncoderPasses::All(n)`. A specific pass of a set is
  internal to the encoder's own multipass run and has no UI.
- **Colour and grain.** `append_color_data` is on by default. Photon noise is offered for
  AOM, RAV1E, SVT-AV1, and AVM only: a switch, then `iso` (required), `chroma_iso`, `width`
  and `height` (optional, `Source` when empty), and the custom coefficient overrides behind
  one disclosure. The two switches share the first row; the photon fields span the card
  below, four across from 2K up and two across below.
- **Parameters.** One card per flag this project sets, from the encoder definition's
  [descriptors](settings.md), grouped by the descriptor's `group`. A group is half the card
  and cards run two across; a group with one parameter takes the width it has.
- **Parameter card.**
  - The first line is the label with the CLI key in parentheses (`Constant Rate Factor
    (--crf)`) and the documentation link; the description follows, then the control.
  - The control is chosen by the descriptor's kind: a switch for a flag, a number field with
    bounds and unit, radio or segmented buttons up to four choices and a dropdown above that,
    a text field otherwise.
  - A bounded integer scale of 100 or less also gets a slider; a long range stays a field.
  - Remove sits inline with the label.
- **Parameter header.** `n of m set`, a search field that narrows by key, label, or
  description with the same match as Settings → Encoders, **Add parameter**, and **Preview
  command**.
- **Add parameter sheet.** The catalogue's unset descriptors grouped by name and searchable,
  a `Show advanced` disclosure, and one field for a flag the catalogue does not list. A value
  is written as the engine's own `CLIParameter`; a JSON object is never offered as a value
  editor.
- **FFmpeg filter.** An optional graph that applies to every frame before the encoder
  receives it, requires FFmpeg on `PATH`, and is absent, not disabled, for the FFmpeg
  encoder because that encoder filters through its own options. The field carries a clear
  button inline; empty means no filter.
- **Resets.** Every parameter reset control is inline with its value row, on the same
  baseline as the field it resets, not at the far edge of the column.

### Encoding behavior

1. **Choose an encoder.** Choosing one writes that variant's own document and never carries
   the previous encoder's executable over. A build of x264 is not a build of SVT-AV1.
2. **Choose a saved build.** Choosing a build copies its own engine document: executable
   (null for a pathless build), starting options, and the value of every field that document
   states. The parameters section reads the union of the base catalogue and that build's
   probed descriptors, with the build's label, group, and description winning where both
   define a flag. A pathless build also writes a disabled marker option so its identity
   survives a reload; the marker is hidden from the parameter list and never reaches argv.
3. **Match by executable or marker.** A located build is matched by the executable the
   document runs, not by the base variant alone, so the built-in and any number of builds of
   the same family are distinct choices. A pathless build is matched by its marker. Choosing
   the built-in from a build clears both the executable back to `PATH` and the marker.
4. **Set passes.** Passes is a number written as `EncoderPasses::All(n)`; a specific pass has
   no UI.
5. **Set colour and photon noise.** `append_color_data` is on by default. The Photon noise
   switch writes `null` when off, so an encoder without the field never carries a
   half-configured one. Noise scaling writes a per-scene `photon_noise.iso`; this section's
   ISO is the fallback for scenes the scaler leaves unchanged, and the UI says so instead of
   implying the value always wins.
6. **Guard a video's retained chunks.** On a video's Configuration, saving a change to the
   encoder, its settings, its parameters, or the Input is intercepted when an affected scene
   already has a retained chunk, because Parallel Encoder skips a scene that has one. An
   encoder change counts the inheriting encoded scenes: the write leaves a scene with its own
   encoder alone. An Input change counts every encoded scene, because a custom encoder still
   reads the new frames. The dialog offers an unchecked **Keep the N existing chunks**
   checkbox; Save sends the overrides and `clear_chunks` in one request. A worker-count change
   invalidates nothing. The project's own Encoding save writes defaults and touches no
   video's chunks.
7. **Edit parameters.** Add, edit, search, and remove parameter cards. A bounded integer
   scale of 100 or less gets a slider; a long range stays a field.
8. **Add an unlisted parameter.** The Add parameter sheet is the only path; a value is an
   engine `CLIParameter`, not a JSON object editor.
9. **Filter with FFmpeg.** Because Quality Check scores the source while encoding scored the
   filtered frames, an active filter shows **Scoring may be inaccurate** here and repeats it
   in Quality Check. The application never claims a filtered encode was scored against the
   same picture.
10. **Keep custom parameters here.** Custom encoder parameters live on this screen, not on a
    separate Benchmarking screen.

### Encoding states

| State | Contract |
| --- | --- |
| Loading | Encoder catalogue and preflight availability load into a skeleton. |
| Empty | No parameters set reads `0 of m`; no saved builds is valid; Add parameter and Preview command remain available; no FFmpeg filter is set. |
| Error | Preflight unavailable, probe failure, invalid parameter, or a missing FFmpeg for the filter stays inline with the control that caused it. Selecting a pathless build shows its warning inline instead of blocking the selection. |
| Populated | Selected encoder, executable, passes, colour/grain settings, parameter cards, and saved builds are visible; a pathless build says **not located**. |
| Locked | All fields are read-only; writes answer `423`. |

### Encoding data and contracts

- **Catalogue and builds.** Encoder catalogue, encoder forks, and preflight inventory. See
  [backend.md §5](../backend.md#5-http-surface).
- **Configuration.** The sequence document owns the encoder document and parameter values;
  values are engine `CLIParameter`.
- **Descriptors.** The generated encoder definition and its parameter descriptors; see
  [contracts.md](../contracts.md) and [Settings → Encoders](settings.md).

## Target quality

### Target quality layout

One screen, three stages in run order: **Target quality**, **Speed scaling**, **Bitrate
optimization**. Each stage has its own run control.

- **Target quality.** Metric and target range, maximum probes, quantizer range, interpolator
  pair, probe strategy and statistic, and an optional input override. The metric input exists
  in the engine but is an advanced disclosure for feature parity; the default is off.
  Flavour text under Input recommends denoising the input graph in VapourSynth for more
  reliable scores, rather than presenting a second input as the normal path.
- **Validation.** `maximum_probes >= 1`, a lower range bound below the upper bound, and
  exactly two interpolators.
- **Probe encoder options.** `probing.encoder_options` is offered behind a **Probe encoder
  options** disclosure: overrides are written as the same `CLIParameter` map and apply to
  probe runs only, so the final encode keeps Encoding's command line.
- **Target range.** Belongs to the metric, not the sequence. It defaults to the engine's
  per-metric range (VMAF 94–96, SSIMULACRA2 74–76, Butteraugli 0.8–1.2, XPSNR 44–46, CVVDP
  9.4–9.6); switching metric uses that metric's range.
- **Metric options.** The chosen metric's options — resolution override, threads where they
  exist, GPU id on GPU metrics, VMAF's model/features/scaler, Butteraugli's intensity and
  norm, CVVDP's display model — sit behind one `Metric options` disclosure that shows how
  many values are set.
- **Probe strategy.** The engine's own `Whole`, `Skip { skip }`, or
  `Subset { position, length }`; the control reveals the fields of the chosen variant. The
  engine rejects a zero skip stride, so the field's minimum is 1 and a legacy zero is shown
  as 1. The run boundary applies the same repair without rewriting the saved document. A
  percentage subset length is greater than 0 and at most 100.
- **Quantizer bounds.** Come from the selected encoder's own descriptor — rav1e ends at 255,
  SVT-AV1 at 63, x265 at 51 — rather than a fixed 0–51; enabling the stage seeds that
  encoder's range.
- **Speed scaling.**
  - The engine's `speed_quantizers` is a list of encoder-speed/quantizer pairs.
  - Each pair is serialized `[speed, quantizer]`, the order the pinned engine reads; the card
    and table present quantizer first because that is the axis the probe produces.
  - The card plots quantizer on the horizontal axis and speed on the vertical axis, and points
    are added or removed on the graph itself.
  - The list is disabled until the sequence is enabled, and Save refuses fewer than two points
    because interpolation needs two.
  - The engine adapter writes the sequence into its default bundle, so the document can carry
    the list.
- **Bitrate optimization.** One sigma threshold control (1–10), with the prerequisite that
  encoding has produced bitrates. It is always present in the engine's sequence document,
  and an unset threshold is how the stage is skipped, so the switch writes
  `bitrate_sigma_threshold: null` rather than removing the part. The preview of flagged
  scenes needs bitrates, so it appears on the video after a run rather than here.
- **Quality Check target.** Quality Check's score chart draws this target range only when its
  own metric matches Target Quality's. Its metric document also carries a hidden default
  range, because the engine uses one metric type for both sequences; that default must not
  be drawn as a target when the two sequences score different scales.

### Target quality behavior

1. **Run in order.** Target quality, Speed scaling, and Bitrate optimization share one screen
   because all three consume the per-scene quantizer the probe produced.
2. **Choose the metric and range.** The target range belongs to the metric. Switching metric
   uses that metric's range; the options disclosure shows how many values are set.
3. **Validate.** Save refuses fewer than one probe, an inverted range, or a count other than
   two interpolators.
4. **Probe with overrides.** Probe encoder options apply to probe runs only; the final encode
   keeps Encoding's command line.
5. **Edit speed points.** Add or remove points on the graph; the list stays disabled until
   the sequence is enabled; Save refuses fewer than two points.
6. **Set the bitrate threshold.** The threshold is always present; `null` skips the stage.
   The flagged-scene preview appears on the video after a run.
7. **Read completion honestly.** Speed scaling and bitrate optimization have no completion
   field, so their rows read `Ready`, not `Done`.

### Target quality states

| State | Contract |
| --- | --- |
| Loading | Metric, encoder bounds, and probe data load into a skeleton. |
| Empty | No probes, no score, and no bitrates is valid; stages show their prerequisites and their run controls. |
| Error | Validation and metric failures stay inline; a probe failure names the metric or encoder that failed. |
| Populated | Probe scores, speed points, and the bitrate threshold are visible; the target range is drawn only for a matching metric. |
| Locked | All fields are read-only; writes answer `423`. |

### Target quality data and contracts

- **Configuration.** The sequence document owns target quality, speed scaling, and bitrate
  optimization.
- **Probe data.** `condor.scenes[*].sequence_data` and the retained probe passes; see
  [data-model.md](../data-model.md).
- **Completion.** No stored completion field; the row reads `Ready` until a full run applies
  the stage.

## Concatenation

### Concatenation layout

- **Project scope.** The only field is the method: `mkvmerge`, `FFmpeg`, or `IVF`. The method
  label is **FFmpeg**, with the project's trademark spelling.
- **No project workbench.** Track maps, chapters, metadata, attachments, and extra inputs
  describe a particular set of encoded streams, so they are configured on the **video**
  screen, not here.
- **No duplicate ownership.** Output and the scenes directory are owned by General and the
  service; they are not inputs and are not repeated as read-only fields. Quality check is a
  separate section, not part of concatenation.
- **Video scope.** The Method card adds that method's workbench: mkvmerge gets the track map,
  chapters, metadata, attachments, and extra inputs; FFmpeg gets its track map, chapters,
  metadata, data streams, and extra inputs; IVF has none. The workbench layout, source
  inventory, key namespaces, and muxer limits are in
  [Video](video.md#concatenation-workbench).

### Concatenation behavior

1. **Choose the project method.** At project scope the method is the whole configuration.
2. **Switch the video method.** At video scope, switching method replaces the other method's
   body with the schema defaults.
3. **Keep one variant.** The engine accepts exactly one method variant; a carried-over track
   key would address a different stream.
4. **Configure the workbench on Video.** The project section does not duplicate the track
   map, chapters, metadata, attachments, or extra inputs.

### Concatenation states

| State | Contract |
| --- | --- |
| Loading | The method card loads into a skeleton. |
| Empty | At project scope the method is the only field; no video workbench exists. |
| Error | A method or save failure stays inline. |
| Populated | The project method is visible; the video's workbench is on its own screen. |
| Locked | The method is read-only; writes answer `423`. |

### Concatenation data and contracts

- **Project document.** The method field.
- **Video document.** The method's workbench; see
  [Video](video.md#concatenation-workbench).
- **Ownership.** Output and scenes directory belong to General and the service.

## Quality check

### Quality check layout

- Metric with the same `Metric options` disclosure as Target quality, strategy, statistic,
  and an optional input override.
- Strategy is `Whole`, `Skip`, or `Subset` with the same variant fields as Target quality.
- A warning appears when the Encoding configuration applies an FFmpeg filter, because the
  scored frames then differ from the source the metric compares against and the score may be
  inaccurate.

### Quality check behavior

1. **Choose the strategy.** The same `Whole`, `Skip`, and `Subset` variants as Target quality.
2. **Score retained chunks.** The check runs against retained chunks and explains that
   deleting them makes the check impossible.
3. **Show the filter warning.** An active Encoding FFmpeg filter makes the score potentially
   inaccurate; the warning repeats here.

### Quality check states

| State | Contract |
| --- | --- |
| Loading | Metric options and retained-chunk availability load into a skeleton. |
| Empty | No retained chunks or no completed run is valid; the screen explains what is needed. |
| Error | A metric or scoring failure stays inline; the filter warning is not an error. |
| Populated | Scores and the selected strategy/statistic are visible. |
| Locked | All fields are read-only; writes answer `423`. |

### Quality check data and contracts

- **Configuration.** The sequence document owns metric, strategy, statistic, and input
  override.
- **Retained chunks.** The check reads the video's retained chunks; deleting them removes the
  input to the check. See [backend.md](../backend.md) §6.1.
- **Warning source.** Encoding's FFmpeg filter. See [Encoding](#encoding).
