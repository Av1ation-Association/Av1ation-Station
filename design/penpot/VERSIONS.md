# Penpot file versions

The `.penpot` export is about 50 MB, so it is **not committed**. This page is the durable
reference to the reviewed file; the binary lives in the external design archive.

When a board set is approved:

1. Create a named version in Penpot (`File → Save version`).
2. Export the `.penpot` file to the archive outside the repository.
3. Fill in the row below with the file ID, revision, named version, date, archive location
   and SHA-256 of the export.
4. Update the approval reference in `docs/progress.md` if the revision changed.

| Date | File | File ID | Revision | Named version | External export | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-30 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `547` | pending — create `phase-0-app-boards` | pending — archive outside git | — |
| 2026-11-04 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `669` | `home-settings-project-resync` | pending — archive outside git | — |
| 2026-11-04 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `673` | pending — create `board-layout-and-cost` | pending — archive outside git | — |
| 2026-11-04 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `675` | pending — create `settings-project-refine` | pending — archive outside git | — |
| 2026-11-04 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `680` | `dependencies-provider-switch` | pending — archive outside git | — |
| 2026-11-09 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `681` | pending — create `video-pipeline-grid` | pending — archive outside git | — |

## Current review

- The Track Map and Project Templates round was completed at working revision `749` on
  2026-11-09. Track map now renders inside Video / Concatenation's Method card, with the
  encoded video locked and source-audio include switches; the retired `Video / Track map`
  child board is removed. Settings / Project Templates is a manager list with search, add,
  a default row, and a delete action per template. The checked-in generators match both
  boards, and the label corrections from revision `747` are carried into the generator
  sources. The generated boards were export-reviewed. Named version and external export
  are pending.

- Project width variants, Home chrome, and Settings tabs were synced at working revision `712`.
  `05 Project / Narrow` and `Wide` now use the generic three-film queue with Encoding / Ready /
  Queued states, 339 / 341 px queue panels, and the 1024 / 1920 frames. `03 Home` drops the
  retired "Most recently opened first" subtitle and closes with GitHub / Website / Documentation /
  About. `04 Settings` renames the tab to "Project Templates" across seven root boards and five
  tab-state strips. Exports of Project / Narrow, Project / Wide, Home / Populated, and Settings /
  Appearance were reviewed against the live 1024 / 1440 / 1920 screens.

- The Project page was repacked at revision `712`: Narrow and Wide sit at `y = 2248` and
  VapourSynth Script at `y = 3492`, removing four overlaps. A whole-file audit found no
  root-board overlaps. The root-board text audit found no local username or installation-path
  strings; it does not cover component-instance text. Shell carries no retired project rail.

- A board-by-board visual review at working revision `737` covered every page using fresh
  contact sheets and clone re-exports. It corrected populated Project queue controls, empty
  Project header alignment, Configuration breadcrumbs, Settings installation paths, and the
  directory/status collision in `Components / Rows`. `Configuration / Target quality` had a
  duplicate `aside` block covering all three cards; removing it restored the intended form.
  The first Components contact sheet was stale: fresh clones of Rows and Accessibility show
  only generic titles. No layout defect found in this pass remains open.

- A label proofread at working revision `747` covered all ten Settings boards and twelve Video
  boards at native size. It corrected the plural Project Templates breadcrumb, the
  `C:\Users\ichig` values in Storage and Dependencies, Storage's demo project name and
  singular counts, the encoder version, the template Encoding scenes-directory field, and the
  tab-state caption. Video project crumbs now read `Demo Project`; General shows a neutral
  `General set.` status; Track map says `Subtitles add` and `source stream 1 of 3`; Empty says
  detection writes the timeline; Scene encoder says `Scroll for all parameters`. A recursive
  text audit found no personal path, stale episode, or corrected copy string remaining.

- Generic-data pass at working revision `704`. Installation-specific content was removed from
the boards: the project is `Demo Project`, the queue uses `Big Buck Bunny`, `Sintel`, and
`Tears of Steel` with Ready / Encoding 42% / Queued states, Settings paths use
`C:\Users\designer`, and Video / Configuration reads
`General set.` instead of a failure. No board should carry a local username, personal
project name, or an all-error queue.

- All seven `10 Configuration` boards were rebuilt at working revision `697` on 2026-11-09
  against the live headless app captured at 1440 px. The 232 px section rail, in-board
  Cancel/Save, page eyebrow, `Optional` pill, and the retired `In the video context` panels
  are gone. General uses one full-width editor card (Input beside a 392 px Output column)
  and a full-width used-by card; every section uses the shipped 1056 px main / 300 px aside
  grid, with `What it produces` in the aside and the section note under the main column.
  Heights follow the live screens (General 1060, Scene detection 830, Noise generation 960,
  Target quality 700, Encoding 1320, Concatenation 620, Quality check 520). Export review of
  General, Scene detection, Noise generation, and the live measurements for Target quality,
  Encoding, Concatenation, and Quality check back the pass.

- `06 Video` is synced to the final tab set at working revision `688` on 2026-11-09. Every
  tabbed board now carries Configuration / Scenes / History / Logs, with Logs moved to
  x=338 and History at x=262, and `Video / History` is drawn at (3040, 0) at 1440 × 960 from
  its generator block, reusing the Scenes chrome and the Configuration Start button. The
  board was export-reviewed. `Video / Configuration` had already been redrawn at revision
  `681` as the shipped pipeline grid: seven cards on a three-column grid, General carrying
  the run-level failure rail, and per-section sequence rows and badges. The
  `video-pipeline-grid` named version and external export are pending.

- `Settings / Dependencies` now shows the expanded VapourSynth row: the Bundled and System
  source cards, the Active badge on the provider this process loaded, and the restart line
  that VSScript's once-per-process initialisation requires. Growing the board exposed an
  earlier overlap with `Settings / Project Template`; the five paired rows were re-packed on
  64 px gutters, so the page has no overlapping boards again. Working revision `680`, named
  version `dependencies-provider-switch`; the row is not yet approved, and its external
  export is pending. The pre-change file is the `dependencies-provider-switch-before`
  version at revision `678`.

- The Settings and Project sheets were corrected at working revision `675` on 2026-11-04:
  each child editor sits under its parent, Settings closes with About beside Tab states,
  Project pairs Narrow and Wide on the third row and closes with the VapourSynth Script
  subpage. Stale board names now match the visible labels. This supersedes the `673`
  geometry for those two pages. The `settings-project-refine` named version and external
  export are pending.
- The application board set (`00`–`10`) was reviewed and approved at revision `547` on
  2026-10-30; the named `phase-0-app-boards` version and external export are still pending.
- All 82 application boards were reflowed on working revision `673` on 2026-11-04. `03 Home`
  puts Narrow beside Wide, `05 Project` puts Narrow beside the script editor and closes the
  page with Wide, and `04 Settings` closes on the same 64 px grid; no page overlaps. The
  same pass removed 794 hidden SVG-import background layers and left zero hidden layers.
  That supersedes the `669` geometry and document cost, not its board content: Home,
  Settings and Project still match the shipped screens, while Configuration and Video remain
  in rework. The `board-layout-and-cost` named version and external export are pending.
- Home, Settings and Project were brought to the shipped screens at working revision `669`
  on 2026-11-04. That supersedes those pages' content approval above; the named
  `home-settings-project-resync` version records it, and its external export is pending.
- The `.penpot` file is the only artefact that carries boards **and** tokens; the
  generators and `tokens.json` are the reviewable, diffable sources in this repository.
