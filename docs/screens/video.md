# Video

Video is one queued video's configuration and results, reached from a queue row or Home's
recent list. Its tab strip is its own navigation — **Configuration**, **Scenes**, **History**,
**Logs** — and every tab renders it, so the active tab is always visible. The shell's
breadcrumb names the video and the section; **Start** is the one primary action and lives in
the shell's top bar, because it begins the next derived sequence rather than adding page
chrome.

## Contents

- [Configuration](#configuration)
- [Measured data](#measured-data)
- [Concatenation workbench](#concatenation-workbench)
- [Scenes](#scenes)
- [Player and its sources](#player-and-its-sources)
- [Logs](#logs)
- [History](#history)

## Configuration

### Configuration layout

- Four tabs: **Configuration**, **Scenes**, **History**, **Logs**. Every tab renders the
  strip; the active tab is visible.
- Configuration is a section grid: **General** and the six sequence sections each fill a
  card. The whole card is the destination; the back control returns to the grid.
- Each sequence card carries the derived status of the sequences it configures as chips.
  Noise generation shows detection and scaling separately. A section whose sequences are
  absent from the chain says so rather than guessing a phase.
- The current grid and chips replace a separate Sequence timeline; history is a tab and no
  longer competes with configuration for vertical space.
- The General card's Input area contains the condensed clip strip: resolution, frame rate,
  frame count, duration, and pixel format. **All details** opens the sheet.
- A sequence section header states how many of the section's parts the video replaces and
  offers **Reset section**.
- The **Measured data** card closes every sequence section; its contract is below.

### Configuration behavior

1. **Open a section.** The whole card opens that section's project editor scoped to this
   video. The back control returns to the grid, so switching sections cannot silently discard
   another section's draft.
2. **Start the next sequence.** **Start** in the shell top bar begins the next derived
   sequence; the screen does not add a second primary action.
3. **Place a failure rail.** When the last run failed, the danger rail belongs to the card
   that owns it: the sequence's card, General for a failure before sequence 1, or the matching
   section bar on a section page. Only a sequence id with no card remains a page banner.
4. **Read the derived card.** A sequence card is present in every section so its empty state
   can name the prerequisite. Its figures are derived from the engine's objects and the
   chunks on disk, never from a stored phase, and a section with no data yet is never drawn as
   a zero-filled chart.
5. **Edit General's input.** General owns the video's engine `Input` and `Output` documents
   and its scratch directory. The input is the shared `InputEditor` in its concrete mode, so
   it names the source path and its FFMS2 index; a `VapourSynthScript` input names no file, so
   a separate **Source file** row supplies the path its injected `video_path` receives.
6. **Read the clip strip.** The strip lives inside the Input card because it describes that
   decode graph. **All details** opens a sheet with bit depth, colour primaries, transfer,
   matrix, range, chroma location, both paths, and retained bytes. An unsignalled field says
   so; a failed probe stays in the strip as a readable reason with a retry. The probe is the
   same open a sequence performs, so an index it builds is reused by the first encode.
7. **Name the output.** The output is the exact file the concatenator writes. **Save to…**
   opens the host save dialog seeded with that file, so the user names the file rather than
   only its folder; **Project default** restores the derived name. **Open** opens the folder
   that contains the file, which is a video's own directory rather than the project's.
   Changing the file moves an existing output on save and refuses to overwrite a file already
   at the destination. New output documents carry the engine's overwrite consent, and an
   older one is treated the same when a run is prepared, so a rerun of the same target
   replaces it.
8. **Change the scratch directory.** The scratch directory is read-only in place, with
   **Change…** and **Project default**. A video's chunks record absolute paths in the
   encoder's sidecars, so the service refuses the move while retained work exists. The card
   says so, offers the confirmed **Delete retained** action, and only then enables the move.
   Retained bytes and free space are measured on every read.
9. **Override a section.** Each sequence card opens that section's project editor scoped to
   this video. Its header states how many of the section's parts the video replaces and offers
   **Reset section**, which restores the project's value in the draft; Save commits.
10. **Show the video-only additions.** On top of the project view, a video section shows:
    - the sequence's derived status and live progress, and the one action valid next;
    - its own measured data, as one card described in [Measured data](#measured-data);
    - the exact output file on General, with a reveal action when it exists;
    - the video's probed clip metadata on Video details.
11. **Respect the configuration lock.** While a run holds the configuration lock, section
    editing is read-only and the section bar names the reason. Selection, scrubbing, copy
    actions, and playback stay available where the tab owns them.
12. **Read a finished sequence status row.** The **Sequence status** row on Configuration
    quotes the append-only timeline for a stage that has finished: the newest completed
    attempt supplies its frames, duration, and fps, and the row adds the video's scene count
    only when its own evidence line does not already name one. A live row keeps the event
    stream's sentence instead, and an incomplete or failed stage never borrows an earlier
    run's numbers.
13. **Read a live Target Quality row.** It names its pass without a denominator and reports
    the current step's own percentage: a run may finish in one pass, so the engine's
    configured maximum is a ceiling, not a total. The bar fills while encoding and fills again
    while comparing, in every pass.
14. **Resume Parallel Encoder or Quality Check.** Both sequences run only what an earlier
    attempt left — scenes without a chunk, scenes without scores — so their own tick counts
    the remainder. The row places that tick on the video's whole span — frames for the
    encoder, sampled frames for the check — and keeps its scene tally.
15. **Read Quality Check's rate.** Its rate is sampled frames per second and is labelled
    **sampled FPS**; its counters are the video's scored scenes and sampled frames, not the
    pending remainder. The finish estimate divides only the samples this run still has to
    score at that rate, so a resumed run can read 80% while the ETA describes its remaining
    fifth.
16. **Read Parallel Encoder's worker lines.** A live row carries one line per scene a worker
    holds — its pass, percentage, own frame pair, hold time, rate, and finish estimate —
    because the aggregate row cannot say which of several concurrent scenes is nearly done.
    - The pass belongs to the worker, not the row: each encoder process reaches its next pass
      when its own scene does.
    - Each line measures that scene's frames, not the encode's.
    - The elapsed time is the worker's hold, which on a resume is shorter than the scene's
      total encoding time.
    - The directory card shows only the aggregate row and its summary.
17. **Read the aggregate row as the video's.** Parallel Encoder queues only scenes that still
    lack a chunk, so the engine's own frame pair counts what is left. The row re-seats it on
    the scene table's whole frame span, and the percentage and ETA follow that span. Without
    that, a resumed run finishing its last five scenes would read
    `273/278 scenes (3,441/3,850 frames) · 89.38%`, mixing the video's scene count with the
    run's remaining frames.

### Configuration states

| State | Contract |
| --- | --- |
| Loading | The section grid and the selected card render their skeleton; existing cards keep their place. |
| Empty | A sequence can be absent from the chain; its card says so and names the prerequisite. No section is drawn as a zero-filled chart. |
| Error | A failed probe stays in the clip strip with a reason and retry; a failed run's rail belongs to its owning card or section; a refused output move or overwrite stays inline. |
| Populated | Cards show derived status chips, progress, the one valid next action, and their video-only values. |
| Locked | While a run holds the configuration lock, section editing is read-only and the bar names the reason. |

### Configuration data and contracts

- **Video documents.** Engine `Input` and `Output`, scratch directory, and retained work;
  the section contract is owned by [project.md](project.md#shared-section-contract).
- **Video overrides.** Each section is the project editor scoped to the video; **Reset
  section** restores the project value in the draft.
- **Status.** Derived from `condor.scenes[*].sequence_data`, encoded chunks, and the event
  stream; never stored as a phase.
- **Timeline.** The append-only record read by History and quoted by finished status rows;
  see [data-model.md](../data-model.md) §6.1.
- **Output.** The exact file the concatenator writes; retained bytes and free space are
  measured on every read.

## Measured data

### Measured data layout

Every sequence section ends with one **Measured data** card. The card is a projection of one
catalogue, `packages/ui/src/sequence-analytics.ts`, keyed by the section's route id, so a
section that owns several sequences reports them together instead of stacking one chart per
sequence.

| Section | Measures | Sequences whose work the card shows |
| --- | --- | --- |
| Scene detection | scene length, in seconds once the source is probed | Scene Detector |
| Noise generation | measured noise, scale factor | Noise Detector, Noise Scaler |
| Target quality | probe quantizer, probe score, probe bitrate, probe speed, efficiency, speed preset | Target Quality, Speed Scaler, Bitrate Optimizer |
| Encoding | chunk size, bitrate, encode time, encode speed | Parallel Encoder, Serial Encoder (the note names the worker count Benchmarker resolved) |
| Quality check | score, bitrate, efficiency | Quality Check |
| Concatenation | retained chunk size | Scene Concatenator |

A measure carries only the views that fit it: **Per scene** (one line per probe pass),
**Distribution**, **Convergence** for a probe measure, **Quality vs size** when the source's
resolution and frame rate are known, and **Cumulative** for bytes on disk.

Pass chips above the chart hide and reveal individual probes; the last visible one cannot be
hidden, so a chart is never empty with no obvious way back.

The statistics strip summarises the selected measure — mean, median, range, p10–p90, and two
tiles specific to it — and **Inspect scenes** opens a virtualized, sortable table of the same
values, so a 5,000-scene video costs no more than a ten-scene one. One measure and one view are
drawn at a time; the tabs are the configuration, not a second copy of the data.

### Measured data behavior

1. **Zoom the chart.** The chart is the zoom surface: Ctrl/⌘ with the wheel — also what a
   trackpad pinch sends — or a two-finger touch pinch zooms around the pointer, a drag pans,
   and a long axis adds the thumb bar as the coarse control. A plain wheel still scrolls the
   page, so reading a stack of charts never traps a gesture.
2. **Keep partial series.** A partially measured series keeps its point symbols: an isolated
   measurement between two gaps draws no line, and the six scenes a scaler touched must not
   be invisible among hundreds of empty ones.
3. **Search the table.** **Inspect scenes** carries its own search field, which narrows the
   table only; the chart above keeps every row the reader was looking at.
4. **Derive, never store.** Every figure comes from `condor.scenes[*].sequence_data` and the
   retained chunks. A scene a sequence has not reached is a gap, never a zero.
5. **Choose the opening measure.** The card opens on the first measure that has data. Its chip
   counts the scenes carrying a value for the **selected** measure, so a section whose
   detector has run and whose scaler has not says exactly that. A measure with nothing yet
   shows its own empty state and prerequisite instead of a zero-filled chart.
6. **Compare by bits per pixel.** Efficiency and the frontier view use bits per pixel rather
   than Mbps, because a bitrate only compares scenes at one resolution: score divided by bits
   per pixel is the quality a pass bought for its size. Bitrate Optimizer's threshold is
   projected onto the final probe as a reference line, so the scenes it re-quantizes are the
   ones above it. Speed Scaler's per-scene preset is offered beside the probes rather than as
   a separate section.
7. **Keep four decimals.** Measured values keep four decimals in the chart, its tooltip, and
   the table. Noise is routinely around `0.002`, so the display never rounds before `.0001`.

### Measured data states

| State | Contract |
| --- | --- |
| Loading | The card shows its selected measure's skeleton; no zero-filled chart is drawn. |
| Empty | The selected measure shows its own empty state and prerequisite, not zeros. |
| Error | A failed source probe or unreadable retained chunk stays in the card as a readable reason. |
| Populated | The selected measure and view render together with their pass chips and statistics. |
| Locked | Not applicable; the card is read-only in every state. |

### Measured data and contracts

- **Catalogue.** `packages/ui/src/sequence-analytics.ts`, keyed by section route id.
- **Source.** `condor.scenes[*].sequence_data` plus retained chunks; nothing is stored.
- **Table.** **Inspect scenes** reads the same catalogue; its search narrows only the table.
- **Views.** Per scene, distribution, convergence, quality vs size, cumulative.

## Concatenation workbench

### Concatenation layout

- The project sets the method. A video inherits it, and its Method card adds the workbench for
  mkvmerge or FFmpeg. IVF has no body: its method is the whole configuration.
- The workbench is one **Method** card followed by **Chapters**, **Metadata**, and **Extra
  inputs** cards.
- The Chapters card's **View chapters** action opens the read-only **Source details** sheet on
  its Chapters tab; the Metadata card's **View metadata** action opens the same sheet on its
  Metadata tab.
- The track map is grouped by video, audio, subtitles, and attachments. Every source row's
  switch is the shared `Switch`; the encoded video row is locked.
- A row's sliders button opens the shared right-side sheet, which renders the generated
  engine fields for that method and track kind.
- An added attachment has its own row with **File**, **Name**, **MIME type**, and
  **Description** fields.

### Concatenation behavior

1. **Read chapters and metadata.** The two tabs share one source-info document from one
   FFmpeg process, so switching views does not start another probe. The snapshot stays fresh
   for 60 seconds; reopening the sheet after that reads the source again. Neither view changes
   the draft.
2. **Edit a track.** A dropped row says **Dropped** rather than only changing colour. Sheet
   edits are staged and only **Apply** writes them, so Cancel or Escape leaves the draft map
   untouched. `type` and `copy` are row state, and FFmpeg's video `filter` is omitted because
   it would filter the encoded scenes. A row with explicit options shows their count beside
   its copied/dropped state.
3. **Keep probe namespaces separate.** Keys are the probe's own namespace: `mkvmerge
   --identify` track IDs, or FFmpeg source stream indices. The two are never offset into one
   another. Key `0` is reserved for the encoded video on the main input.
4. **Materialize the map.** `null` is include-all; adding a row option or attachment first
   materializes the full proposal, and **Reset map** writes `null` again. A saved key the
   probe does not report stays in the map and is named in the panel, so a re-probe can reveal
   an unmatched override without silently remapping it to a different stream.
5. **Copy the encoded video only.** The encoded scenes are the output's only video track; the
   source video is never copied. For mkvmerge the encoder passes `--no-video` for the source
   and a video entry must be key `0`, addressing the encoded group; for FFmpeg, a `Video`
   entry targets the concatenated track `0`. The interface shows one locked
   **Video · from encoded scenes** row and never offers a source-video row.
6. **Include source streams.** The remaining output streams come from the video's General
   input: audio, subtitles, and attachments can be included or dropped. FFmpeg additionally
   allows a non-copy codec and an audio or subtitle filter per included track. Video filtering
   is impossible in both methods. FFmpeg data streams are copied automatically whenever
   source tracks are configured and are shown as a read-only note, because the engine maps
   them unconditionally.
7. **Attach files.** mkvmerge source attachments are copy-all and read-only because their IDs
   share a namespace with track IDs; new attachments can still be added under unused keys.
   FFmpeg source attachments remain selectable because its stream indices are unique.
   - On a host with a native picker, **File** also offers **Browse…**; the browser host keeps
     the path field, because its filesystem is not the host's.
   - An added attachment needs a file path; an FFmpeg addition with a path also needs a MIME
     type.
   - The field is marked invalid and the shared draft blocker keeps Save disabled until both
     rules pass.
8. **Hide what the method ignores.** FFmpeg offers no chapter language or charset, no
   extra-input metadata, and no video filter, because the engine ignores or rejects those
   settings. mkvmerge extra inputs expose only the chapter and metadata copy flags that are
   effective for an extra.
9. **Probe the inventory.** The inventory is read-only; the draft remains the authority and
   the inventory is never persisted. The service probes with the selected muxer:

| Muxer | Command | Parsed result |
| --- | --- | --- |
| mkvmerge | `mkvmerge --identify --identification-format json <path>` | Track IDs, types, codec, language, name, default and forced flags, channel count, attachment metadata, and chapter count. Parses the JSON even when mkvmerge exits non-zero after writing a complete identification. No offset is applied. |
| FFmpeg | `-hide_banner -nostdin -i <path>` | Video, audio, subtitle, attachment, and data stream lines, their source indices, language/title, flags, channels, and attachment metadata. Data streams are counted, not returned as selectable rows. Chapter count is best-effort; `null` means unknown, not zero. |

10. **Call the inventory hook.** `POST
    /api/projects/{project_id}/videos/{video_id}/concat-inventory` returns the typed
    inventory.
    - `path` is absent for the main input, which uses the video's original source file, not the
      VapourSynth script; it is present for an extra input.
    - Missing tools and unreadable files return an empty list and a readable `detail`, matching
      the audio-track route: the screen stays usable and explains the failure.
    - It never silently applies a partial map.
    - Parsers are pure functions tested against captured output fixtures; a parser must not
      require the executable in CI.
11. **One hook per surface.** The screen calls one inventory hook keyed by project, video,
    method, and path, disabled for IVF and empty paths. **Probe again** refetches it. An
    extra-input card calls the same hook with its own path. Derived counts and row labels come
    from the inventory; the draft is never copied from it.

### Concatenation states

| State | Contract |
| --- | --- |
| Loading | The Method and track cards show skeletons; an inventory probe keeps the draft visible. |
| Empty | IVF has no body; a probe with no selectable tracks shows its readable `detail` rather than a partial map. |
| Error | An unreadable file or missing muxer returns an empty inventory and a readable message; sheet validation stays inline. |
| Populated | Track map, attachment rows, chapter/metadata views, and inventory-derived counts are visible. |
| Locked | While a run holds the configuration lock, the workbench is read-only; its sheet cannot write the draft. |

### Concatenation data and contracts

- **Method.** Project-owned; the video inherits it. IVF has no workbench body.
- **Track map.** Draft map with probe keys; `null` is include-all.
- **Inventory.** `POST /api/projects/{project_id}/videos/{video_id}/concat-inventory`.
- **Source info.** One FFmpeg source-info document; Chapters and Metadata share it for 60
  seconds.
- **Generated fields.** The sheet renders the engine's generated method and track fields.

## Scenes

<a id="scenes-tab-layout"></a>

### Scenes layout

- The tab is an editor, not a dashboard; while a run holds the configuration lock it is a
  read-only view of the same layout.
- The virtualized scene rail is the left edge. The selection's details and editor sit
  immediately right of it behind a resizable split; the single player fills the rest of that
  row; one full-width proportional timeline spans the bottom. A timeline block draws its still
  at the source aspect and anchors it at the block's start; a narrow block clips that still
  rather than stretching it, while the rail keeps its compact crop.
- The details pane takes the width the letterboxed frame does not need — a 16:9 frame is
  pillarboxed in a wide column — and dragging the split trades pane width for video width.
  The player letterboxes the frame inside the row's remaining height instead of growing to
  the video's aspect.
- Source selection is a transport control that opens a popover; there is no source column
  beside the player. The transport bar wraps its settings cluster onto a second row when the
  pane is too narrow for one row, so no control is clipped.
- The scene rail appears at `lg`; below that it is hidden and the details/player row uses the
  full width. Below `md` the tab is one scrolling column: the player takes 52 vh (clamped to
  200–420 px), the timeline follows, and the details sit under the timeline, so the tab bar's
  placement toggle is hidden there.
- Elsewhere the page does not scroll; the player row keeps a 160 px floor, so a window too
  short for the three bands scrolls the page instead of squeezing the picture out of its row.
  The rail keeps its own scroll, and the timeline stays horizontal with its zoom control
  instead of wrapping.
- Rail rows are compact: the scene number, the frame range, and the duration or start
  timecode beneath it. A warning icon follows the frame range, and only scenes that need
  attention draw one; a valid scene adds no green dot. The rail's header carries the count and
  a **Find frame or time** field. The footer carries the scene and frame totals. A row list
  longer than the rail draws only the rows that fit above the footer.
- **Timeline.** One block per scene, width proportional to `end_frame - start_frame`, with a
  ruler that always shows timecode and frame numbers together; the playhead repeats both, so
  there is no unit toggle. Blocks carry selection, a warning marker for invalid boundaries,
  and a chunk marker when a retained encoded chunk exists. **Fit** restores the whole source.
- **Details.** A 320 px column of stacked groups — Range, Encoder, Engine data, Sequence data
  — not a multi-column field grid: at that width a six-across grid truncates every label to a
  few letters. The encoder field shows the inherited or overridden encoder with its
  provenance (`Inherited · SVT-AV1` or `Custom · SVT-AV1`); the expand affordance beside the
  `Encoder` label opens the **scene encoder sheet**.
- **Engine data.** Read-only rows for the selected scene's sequences: Target quality
  (quantizer and probe score), Quality check mean score, Noise Detector value and scale, and
  Chunk bytes with the retained count. A multiple selection shows each row's range and how
  many scenes contributed. A field that has not run shows `—` and its reason; the encoder
  remains the separate section above and custom sequence data stays below.
- **Sequence data.** The selected scene's custom map, read by a VapourSynth script as
  `condor_data.scenes[i].sequence_data.<key>`. Rows are typed string, number, or boolean; a
  legacy array or object stays editable as JSON. The whole map is saved from one edit.
- A single icon-only action bar is pinned to the bottom of the panel instead of four labelled
  buttons always taking height: **Undo**, **Split**, **Merge**, **Delete**, and **Reset chunks**
  (delete the retained chunk), each with its sentence in the tooltip and accessible name.

### Scenes behavior

1. **Find a frame or time.** A bare integer is a frame; `SS.s`, `MM:SS.s`, and `HH:MM:SS.s`
   are time. Enter jumps to the scene containing that frame and seeks the player to it; a
   query outside the source is refused with an inline error rather than clamped. The player's
   **Frame** and **Timecode** fields remain separate, and its timecode field stays clock-only.
2. **Select in the rail.** A click selects the scene. A drag selects a range; rows give the
   sweep discrete targets. Clicking below the rail's last row or pressing `Escape` clears the
   selection. The rail and timeline share one selection store.
3. **Select in the timeline.** A click selects the scene and seeks to the **clicked frame**,
   not the scene's first frame; a press that moves pans the zoomed window instead, so one
   gesture never seeks and scrolls at once.
4. **Navigate the timeline.** The wheel pans the visible window and Ctrl/⌘ + wheel zooms
   around the pointer; on touch, one finger pans and two fingers pinch-zoom around them;
   double-clicking the track, or the **Fit** control, restores the whole source. The page
   itself never scrolls, so these gestures have nowhere else to go.
5. **Coalesce at fit-to-width.** Blocks below 3 px are coalesced into a density band rather
   than rendering thousands of sub-pixel nodes; selected and chunk-bearing scenes stay visible
   as markers, and zooming in restores individual blocks.
6. **Draw the full source.** The timeline is drawn over the probe's full frame count, not the
   end of the last detected scene, so frames beyond a partial detection are seekable. Scene
   blocks keep a strong boundary rule and centre their index with a length in both seconds and
   frames.
7. **Edit the encoder.** The scene encoder sheet is the same encoder-parameter editor
   Configuration uses — same catalogue, descriptors, widgets, and constraints — scoped to the
   selection. The parameter info popover prints the CLI separator as a glyph and name (`␠ Space`,
   `⇥ Tab`, `⏎ Return`, or `=` for a joined delimiter), so a joined flag is not mistaken for two
   arguments. It opens on the scene's current scope: **Inherited** shows the video encoder's
   resolved values read-only, **Custom for scene** makes them editable, and **Apply to scene**
   writes the override. **Reset to inherited** deletes it. It is not a second encoding
   configuration.
8. **Separate engine data from custom data.**
   - **Engine data** is read-only. It lists quantizer, score, retained bytes, and chunk count;
     a field whose sequence has not run shows `—` and a reason such as `Quality check has not
     run`, never a zero or a guessed value. Availability is per field.
   - **Sequence data** is the selected scene's editable custom map. A row is a string, number,
     or boolean and keeps the type it was added as; a legacy array or object stays editable as
     JSON. The whole map is saved from one edit, up to 64 pairs. A key the engine owns is
     refused beside the row and again by the service.
   - A multiple selection shows aggregate engine data and no custom editor.
9. **Edit the scene.** The editable things are the scene's bounds and encoder, its custom
   sequence data, and the input script that changes the frames. A multi-selection shows the
   aggregate fields and the same actions with an explicit scope; the encoder sheet then shows
   the common value or `mixed`, with a `set for all N` action.
10. **Keep a valid set clean.** A valid set adds no strip, so the editor keeps its height. When
    a structural edit produces a problem, a strip appears between the details row and the
    timeline and names the problem, the scene index, and the block it marks; each problem
    links to its scene. It never blocks editing; it blocks only the run action for errors.
11. **Use an empty table.** An empty scene table does not block the tab. The timeline spans the
    whole source from frame zero, so it still scrubs and still opens the context menu; the
    rail's empty state offers **Run Scene detection**, and right-clicking an uncovered range
    offers **Add scene here** once a checkpoint exists.
12. **Grow the live table.** Every checkpoint the engine saves during detection carries the
    row it appended, and the shell's one SSE writer splices it into the cached scene table.
    The rail, the timeline, the scene count, and the Scene Detector row grow as the engine
    finds scenes; there is no refetch and no polling for this data.
13. **Patch a measurement.** A Noise Detector tick patches the row it just measured with the
    value it produced, so the measured-data chart and the statistics beneath it fill in scene
    by scene; the chart still reads this one table rather than a second live model.
    - The table read itself carries the run's measurements so far, so opening the page mid-run
      shows the scenes measured before it loaded.
    - The shell keeps the same tally from the stream and fills whichever table read comes
      next; a new Noise Detector run replaces the tally and a terminal event discards it.
14. **Refresh Target Quality per pass.** Target Quality checkpoints once per pass, so the
    first event of a new pass refreshes the table: its charts gain each finished pass while
    the next one encodes, rather than only when the sequence ends.
15. **Patch Parallel Encoder as chunks land.** Its checkpoint carries each newly written
    chunk's size and wall-clock duration, and the shell patches that row's `encoded`,
    `chunk_bytes`, and `encode_ms`: the rail's chunk marker and the Encoding chart's per-scene
    figures move while the remaining workers still run, instead of only when the sequence ends
    and a table read reconciles them.
16. **Reconcile a gap once.** A checkpoint that would leave a gap in the cached table — a
    missed event, or a read still in flight — triggers one reconciliation refetch instead of a
    partial splice.
17. **Stay read-only while this video encodes.** Only the video the worker is encoding is
    read-only: split, merge, **Reset chunks**, and the scene encoder sheet are disabled, with
    one strip naming the reason. Sibling videos stay editable. Selection, scrubbing, copy
    actions, and playback stay available so arriving rows can be inspected.
18. **Split and add.** Right-clicking a frame inside a scene offers **Split at this frame**;
    right-clicking an uncovered range offers **Add scene here**, which writes the gap from the
    previous scene's end to the next scene's start (or the source end). The action bar's split
    is enabled only for one selected scene with a playhead; both edits clear the selection and
    retain one undo step.
19. **Merge.** Select two or more adjacent scenes and choose **Merge selected scenes**. The
    selection becomes one scene from its first start to its last end. Every later index moves,
    so retained chunks and probe scratch for the affected table are deleted. The selection is
    cleared and one undo step is available. A non-adjacent selection is refused.
20. **Delete.** Delete is enabled for exactly one selected scene. The confirmation states that
    the scene leaves the table, its frames become uncovered, its retained chunk and later
    scenes' scratch are deleted, and one undo step is available. The chunks themselves are not
    restored by that undo; encoding writes them again.
21. **Reset chunks.** **Reset chunks** deletes retained chunks for every selected scene after
    confirmation. Scene ranges, custom sequence data, and the finished output stay. There is no
    undo; run Encoding to write the chunks again.
22. **Undo.** **Undo** restores the scene table before the last structural edit or bulk scene
    encoder assignment and clears the selection. One bulk write is one entry, so a single
    undo restores every scene in the selection. It does not restore chunks already deleted,
    and **Reset chunks** is not undoable.

### Scenes states

| State | Contract |
| --- | --- |
| Loading | The rail and timeline show skeletons; the player keeps its 160 px floor. |
| Empty | The rail offers **Run Scene detection**; the timeline still scrubs and opens its context menu from frame zero. |
| Error | A probe or detection failure stays in the rail or problem strip; an invalid boundary names its scene and block, and blocks only the run action. A refused merge, failed chunk reset, or failed scene delete stays inline with the action. |
| Populated | Rail, details, timeline, player, and shared selection are visible; chunk markers reflect retained work. |
| Locked | A run holding the configuration lock makes the tab read-only; selection, scrubbing, copy, and playback remain. |

### Scenes data and contracts

- **Scene table.** `GET /api/projects/{project_id}/videos/{video_id}/scenes`; derived from
  `condor.scenes[*]`; a checkpoint appends its row, and SSE patches the cached table.
- **Measured data.** The same table feeds the chart; no second live model.
- **Structural edits.** `POST …/scenes/add`, `POST …/scenes/split`, `POST …/scenes/merge`,
  `POST …/scenes/undo`; `PATCH` or `DELETE …/scenes/{index}` changes one scene's range or
  removes it.
- **Chunks.** `POST …/scenes/reset` deletes only the selected scenes' retained chunks. Retained
  chunks supply the rail and timeline markers; there is no stored scene count.
- **Sequence data.** `PUT …/scenes/{index}/sequence-data` replaces one scene's custom map. The
  pairs live beside the checkpoint, not in it, because the engine drops an unknown
  sequence-data field when it loads the document; the runner merges them into the table it
  builds for a script.
- **Encoder.** `PUT …/scenes/encoder` writes one encoder document to named scenes;
  `GET …/scenes/{index}/encoder` reads one scene's complete encoder document.
- **Player.** See [Player and its sources](#the-player-and-its-sources).

## Player and its sources

<a id="the-player-and-its-sources"></a>

### Player layout

One `<video>` element. The transport's source control switches its `src`; no second player is
mounted, and no hidden element keeps playing.

| Source | UI label | Content | Available when |
| --- | --- | --- | --- |
| `original` | `Original` | the queued source file, served as it is | the General input has a path |
| `decoded` | `Decoded` | a lossless H.264 window of the Parallel Encoder input | the decode graph resolves; it falls back to General |
| `encode` | `Encoded` | one detected scene's chunk, produced by the run's exact encoder | a detected scene contains the playhead |

The source list is a transport popover anchored above the source control, so the control that
opened it stays visible. The active source carries the selected row; a source that cannot be
played is disabled and says what would enable it. The default is `Original`.

The toolbar carries a real volume slider beside the mute toggle, previous-frame before
play/pause, and the next-frame control after it. A source with more than one audio stream
adds an audio-track selector, on every preview source.

### Player behavior

1. **Serve a range.** `GET …/videos/:vid/media?source=…` answers a single `bytes=` range with
   `206` and `Content-Range`, so the player seeks without downloading the whole source.
   `original` is the source file; `decoded` and `encode` are prepared proxies served as they
   grow, with `no-store` so a re-encoded output cannot be served from a stale cache. A missing
   file, an unknown source, and an unsatisfiable range have distinct responses rather than an
   empty stage.
2. **Describe a source by origin.** The UI does not label a source fast or slow: each option
   says where its frames come from.
3. **Prepare Decoded.** It streams a bounded window of lossless H.264 in fragmented MP4 from
   the playhead, preserving the input's bit depth; the player prefetches the next window so
   playback crosses the boundary without rebuilding the stream. A lossless PNG follows the
   playhead while the user is paused, so a scrub does not wait for a stream.
4. **Prepare Encoded.** It resolves the scene containing the playhead, runs the configured
   encoder executable with that scene's exact encoder parameters, and pipes its stdout
   through FFmpeg with `-c:v copy`. Neither path writes an elementary stream to disk.
5. **Cache the proxy.** FFmpeg writes it under `<app-data>/cache/preview`, keyed by the input,
   the encoder, the frame range, and the source's size and modification time. The first
   request is not held until the whole proxy exists: the route streams the growing file, so
   the element starts on the first fragment. A seek before the prefix exists waits for the
   finished cache file, and later requests serve it with the same range semantics as
   `Original`.
6. **Wait for a seekable frame.** For `Encode`, the loading stage stays until the requested
   frame is seekable (`seeked` at the scene-relative target), not merely until metadata
   arrives; the rest of the scene continues behind it. A build stops when its last viewer
   leaves.
7. **Disable unavailable Encoded.** It is disabled when no detected scene contains the
   playhead. It also chooses whether its frames come from `Decoded` (the default) or
   `Original`, matching the input-source control.
8. **Switch without resetting.** Switching preserves the scene-relative frame and never resets
   the playhead to zero. Only the selected source is attached, so a switch cannot double the
   audio or leave a hidden decode running. A container or codec the window cannot decode shows
   one readable message and leaves the scene table, selection, and timeline usable.
9. **Use a LAN browser.** A paired LAN browser has no media URL: a `<video>` request cannot
   carry the session bearer token, and the service does not put credentials in URLs. It gets
   an explanatory stage instead of a request that silently 401s. The loopback desktop window
   streams directly.
10. **Synchronise the playhead.** The player reports its position on every `timeupdate` and
    seeks when the shared playhead changes, with a tolerance below one frame so playback and
    the rail cannot tug each other.
11. **Choose audio.** `GET …/audio-tracks` lists the container's streams (FFmpeg, read from
    the header) and `…/media?source=original&audio=N` serves the chosen stream as a cached
    audio-only file.
    - The extraction is one container copy for codecs the browser plays and an AAC transcode
      for codecs it does not.
    - All preview sources take their sound from the source file, so the list does not change
      with the selected source.
    - A file with no streams mounts no audio element at all, and a missing FFmpeg omits the
      selector, because the source itself still plays.
    - A track that genuinely fails says so in a notice the user can dismiss; an autoplay block
      or a pause that aborts a pending `play()` is not a track failure.
12. **Keyboard.** `Space` or `K` plays or pauses, the arrow keys step one frame (`Shift` steps
    ten), `V` toggles the picture between `Original` and `Encoded` (the source control selects
    `Decoded`), `F` toggles full screen, and `R` resets the wheel zoom.
    - In full screen the transport is an overlay on the bottom of the picture. It starts
      visible, slides away after three seconds without pointer movement, and returns on a
      pointer movement, key press, or keyboard focus. The picture fills the space behind it,
      so seeking never requires leaving full screen.
    - A press that moves pans the picture, or pinch-zooms it with two fingers on touch; a
      click that does not move toggles playback, so a gesture never does both.
    - Two fingers zoom around the point between them and keep that point under the fingers,
      up to 8×.
    - `Space` is transport everywhere on the tab and never changes the selection.

### Player states

| State | Contract |
| --- | --- |
| Loading | The stage holds until the requested frame is seekable, not merely until metadata arrives. |
| Empty | A queued video with no input path has no `Original`; the stage explains what would enable a source. |
| Error | Missing file, unknown source, unsatisfiable range, decode failure, or LAN token refusal each show a distinct readable stage. |
| Populated | One source is attached; the source control, toolbar, audio selector, and shared playhead are visible. |
| Locked | Playback and selection stay available during a run; editing the encoder parameters does not. |

### Player data and contracts

- **Media.** `GET …/videos/:vid/media?source=…`; one range response, `206` and `Content-Range`.
- **Audio.** `GET …/audio-tracks`; chosen stream served as a cached audio-only file.
- **Proxy cache.** `<app-data>/cache/preview`, keyed by input, encoder, frame range, source
  size, and modification time.
- **Transport.** The preview player owns its proxy requests because `MediaSource` needs the
  response body; it calls `fetch()` only on transport-provided URLs and only inside
  `features/preview/` ([AGENTS.md](../../AGENTS.md) §2.1).
- **LAN.** A paired browser has no media URL; the stage explains the token limitation.

## Logs

<a id="logs-and-anonymised-export"></a>

### Logs layout

- **Logs** lists every run of the video that has a log directory, newest first.
- The selector labels each run with its start time and its recorded outcome, and the chip
  repeats that outcome; a run with no terminal record shows no outcome chip rather than a
  placeholder that has to be decoded.
- **Trace**, **Debug**, **Info**, **Warn**, and **Error** are independent filter toggles;
  **All** turns every level back on.
- Column headers — **#**, **Time**, **Level**, **Sequence**, **Message** — sort through the
  service before the page is sliced.
- The viewer opens the selected run at its **tail**, not its first line.
- **Follow** is available only while the selected run is live. **Refresh** re-reads both the
  run list and the log.
- **Export** builds the anonymised text on the server, shows it in a sheet, and downloads
  exactly that text as `av1ation-<run-id>.jsonl`.
- **Delete** removes the selected log after a confirmation sheet naming the run.

### Logs behavior

1. **Start from the empty state.** The empty state sends the user back to the video, because
   no log can exist before a run starts.
2. **Filter the levels.** Trace and Debug start off because they carry one line per progress
   tick and one per scene. The last active level cannot be switched off.
3. **Sort server-side.** A second click reverses the direction; the scrollbar and page offsets
   therefore describe the sorted result, not a browser-side reorder of one page.
4. **Preselect a run.** A `?run=` search parameter preselects one of those runs, which is how a
   History card opens its own log; an id whose directory no longer exists falls back to the
   newest, and the selector remains the viewer's own control afterwards.
5. **Page the tail.** `GET /api/runs/{run_id}/logs` accepts `tail=true` or an `offset`, and the
   server applies the level and search filters before slicing, so the total — and therefore
   the virtual scrollbar — describes the matches rather than the whole file. The page fetches
   only the aligned `400`-record pages under the viewport; a fixed `22px` row renders only the
   visible slice plus overscan, so a 31,204-line log never creates 31,204 nodes.
6. **Read a row.** Rows show sequence number, time, level, sequence, and message; the message
   is one line with the full text in its title. Search matches messages and sequence names and
   marks the hit.
7. **Copy a row.** Rows are selectable text, so a drag selects a line to copy on a touch screen
   as it does with a mouse. A right click opens a menu with **Copy message**, **Copy line**,
   and **Copy run id**; a long press opens the same menu at the finger. Both routes copy
   through the host clipboard and report the result in the toast strip.
8. **Follow a live run.** **Follow** polls the tail once per 1.2 seconds and keeps the newest
   line in view; scrolling up pauses it explicitly, and the footer says `Paused` until the
   switch is turned on again. The toggle is disabled once the run ends, because there is no
   further tail to follow.
9. **Export.** The sheet states the line count and how many values were redacted, and a
   disclosure lists every placeholder beside the value it replaced. The preview shows the
   first 200 lines; the download contains the whole file. A host that cannot write a file
   still has **Copy**, so the export is usable in a LAN browser.
10. **Delete.** Delete is refused while that run is live, because the service will not delete a
    file it is still writing; the run's timeline record, retained chunks, and the video are
    untouched. The selector is built from the log directories, so the deleted run leaves it
    and the viewer falls back to the newest remaining log, or to the empty state when none is
    left.

### Logs states

| State | Contract |
| --- | --- |
| Loading | The run selector and row viewport render skeletons; no spinner replaces the viewer. |
| Empty | No run log exists: the empty state sends the user back to the video. |
| Error | A missing FFmpeg, unreadable log, or live-delete refusal stays inline; the viewer stays usable. |
| Populated | The selected run, filters, sorted virtual rows, and follow state are visible. |
| Locked | Delete is disabled while the run is live; reading and copying stay available. |

### Logs data and contracts

- **Runs.** Log directories indexed by run id; newest first.
- **Log page.** `GET /api/runs/{run_id}/logs` with `tail` or `offset`; server-side level and search
  filters.
- **Export.** Server-built anonymised JSONL, `av1ation-<run-id>.jsonl`; 200-line preview,
  whole-file download, **Copy** fallback.
- **Delete.** Removes the log only; the timeline record, chunks, and video are untouched.

## History

<a id="history-tab"></a>

### History layout

History answers the two questions derived state cannot: what ran more than once, and how long
did it take. It reads `GET …/videos/:vid/history`, the append-only timeline from
[data-model.md](../data-model.md) §6.1, and groups entries by `run_id`, newest run first.

- Each run is a card with its start, id, outcome chip, total duration, and processed frames.
- Its sequence attempts are a vertical timeline — dot, connector, sequence name, duration,
  frames, and fps — so a repeated attempt is visibly a second entry rather than a replaced
  one.
- A run whose terminal record has a message shows it under the attempts, in the danger
  treatment when it failed.
- Every card carries **Delete run**, disabled while that run is live.
- A run that still has a log directory also carries **Open log**, a link to the Logs tab with
  `?run=` set.
- The page has no playhead and no selection: it is reading history, not driving the editor.

### History behavior

1. **Name the outcome.** A run with attempts but no terminal record is `Running`; a terminal
   record whose outcome is outside `completed`, `cancelled`, and `failed` is `Unknown`; a run
   with only a terminal record says that the run ended before any sequence started.
2. **Delete a run.** It is the History action, not the Logs one: a modal names the run and
   confirms, then removes both the timeline entries and the log directory, because a card left
   with neither action nor data is what a reader reports as "delete does not work".
   - A modal is used rather than the Logs viewer's side sheet because the confirmation is one
     sentence over the card that asked for it.
   - The run's chunks and the video are untouched; the modal says so.
3. **Open a log.** A card links to the Logs tab with `?run=` set, so it opens the viewer on its
   own run instead of leaving the newest log selected.
4. **Delete a card with no log.** A card without a log keeps **Delete run** and loses only the
   open action: there is nothing to open, but its history is still there to forget.

### History states

| State | Contract |
| --- | --- |
| Loading | Run cards render their skeleton; no playhead or selection appears. |
| Empty | No runs yet: the empty state names that history begins with the first run. |
| Error | An unreadable timeline or log directory stays inline; the rest of the cards remain. |
| Populated | Cards show outcomes, attempts, durations, frames, fps, and their actions. |
| Locked | **Delete run** is disabled for a live run; reading and **Open log** stay available. |

### History data and contracts

- **Timeline.** `GET …/videos/:vid/history`; append-only, grouped by `run_id`, newest first.
- **Delete.** Removes timeline entries and the log directory; chunks and video are untouched.
- **Log link.** `?run=` on the Logs tab; a missing directory falls back to the newest log.
- **Derived state.** History is never read to decide current state; only the sequence status
  row quotes finished attempts.
