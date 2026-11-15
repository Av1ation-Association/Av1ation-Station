# Public website documentation

This is the inventory for the public documentation under `/docs/`. It is the contract between
the page copy, the live content, and the screenshot pipeline. It is not a second set of
user-facing pages; the implementation lives in the website and its MDX content.

**Status:** implemented; all 48 pages, focused samples, widgets, and client-side search ship
with the website.

## Contents

- [1. Purpose and scope](#1-purpose-and-scope)
- [2. Decisions](#2-decisions)
- [3. Vocabulary](#3-vocabulary)
- [4. Page inventory](#4-page-inventory)
- [5. Task-page inventory](#5-task-page-inventory)
- [6. Reference inventory](#6-reference-inventory)
- [7. Live content](#7-live-content)
- [8. Screenshot inventory](#8-screenshot-inventory)
- [9. Authoring, routing, and search](#9-authoring-routing-and-search)
- [10. Build and verification](#10-build-and-verification)
- [11. Remaining risks and order of work](#11-remaining-risks-and-order-of-work)

## 1. Purpose and scope

`/docs/` is end-user documentation for installing, configuring, running, and troubleshooting
Av1ation Station. It explains the current `0.1.0` pre-release, not a future product. It does
not duplicate architecture, contracts, development setup, or contribution rules; a single
“For contributors” page links to those repository documents.

The manual is complete for the current application surface. It covers every registered
project, video, settings, template, and script surface that a user can reach, plus the
cross-cutting tasks that span them. It does not document unused API routes or unshipped
features.

The page set is deliberately task-first:

- **Get started** teaches the first install and first successful encode.
- **Concepts** explains the model a user needs in order to make good choices.
- **Guides** are task recipes with a visible outcome and a recovery path.
- **Reference** mirrors app surfaces and configuration areas for lookup.
- **Troubleshooting** starts from a symptom and ends at a diagnosis or support artifact.

All 48 pages ship together. There is no priority tier and no partial public manual. Internal
work can be sequenced, but the release gate is the complete set.

## 2. Decisions

| Decision | Choice | Consequence |
| --- | --- | --- |
| Audience | End users only | Contributor, architecture, contract, and test documents stay in the repository and are linked from one page. |
| Structure | Task-first Diátaxis | Get started, Concepts, Guides, Reference, Troubleshooting. |
| Reference depth | One page per configuration section and one page per surface | Seven configuration pages plus Home, Project, Video, Scenes, History/Logs, Settings, Templates, Encoders, Filters, Script API, and Shortcuts. |
| Authoring | MDX in the existing Vite/React site | Content is repository-owned; no separate docs framework. |
| Delivery | Client-rendered SPA with real `/docs/...` URLs | No per-page static HTML or version switcher in this release. |
| Live content | Focused samples of production components; widgets for one component | A guide mounts the described surface, not a copy of the application or a screenshot in poor context. |
| Captures | Deterministic gallery captures, both themes, native-scale crops | Screenshots carry transient, failed, heavy, or non-deterministic states, not routine prose. |
| Screenshot source | Existing 35-surface gallery, extended with docs states | No parallel screenshot system. |
| Install lead | Pre-release downloads first, source build as fallback | Unsigned Windows/Linux installers, macOS unavailable, and source build are stated explicitly. |
| Search | Client-side full-text index over all docs content | No server, no external search service, and no analytics. |
| Release scope | Everything ships together | All pages, focused samples, widgets, captures, and search are one release. |

### 2.1 Installation truth

The root README and the install page are written from the same release-manifest projection:
the `0.1.0` Windows/Linux pre-release downloads, labelled unsigned, with macOS unavailable
and the source build and GitHub Releases kept as fallback paths. Both name the same assets,
the same caveats, and the same fallback. Neither may claim a signed installer, a macOS build,
a stable channel, or an updater that the manifest does not provide.

The install page projects that manifest into Windows, Linux, macOS, and Source tabs. Each
platform tab names its bundled assets first and its system-toolchain assets second; macOS
states that no build is available and points at the source instructions. The page then
checks the toolchain, covers troubleshooting, and links to the first encode, so the two
surfaces cannot drift into different instructions.

### 2.2 Live-host gate

A focused sample mounts the production component, not a second application shell. It supplies
only the context the component needs: a local `ApiProvider` with `MockTransport`, a memory
router, or `DemoModeProvider` to suppress actions that would touch a file. The sample never
changes the site URL, never opens a page-level overlay, and never reaches the network. When a
state cannot be made deterministic this way, the guide uses a capture instead.

### 2.3 Capture provenance

All 60 captures come from the existing Playwright gallery and its fixtures, extended with the
six docs modes in §8.3. Unstable states are seeded through the gallery transport, never
captured from a real encode, and no figure is a hand-built HTML replica. The pairing form is a
capture-only mount of the real screen inside the harness, so the manual gains no public route.

## 3. Vocabulary

| Term | Meaning |
| --- | --- |
| **Page** | One public `/docs/...` URL and one MDX body. |
| **Section** | One H2 within a page. |
| **Task page** | A Get started tutorial or a Guide; it has an outcome, ordered steps, a result, and recovery. |
| **Reference page** | Lookup material for one surface or configuration area. |
| **Capture** | One deterministic screenshot case, generated in dark and light. |
| **Crop** | A native-scale region extracted from a capture for a documentation figure. |
| **Figure** | A capture or live component presented with alt text, a caption, and optional DOM annotations. |
| **Live widget** | One real UI component mounted inline with fixture data. |
| **Focused sample** | One production component, or a small set of them, mounted at article width with only the context its described action needs. |
| **Docs manifest** | The typed implementation index of pages, section headings, related pages, and search metadata. |

## 4. Page inventory

The media column lists capture inventory available to a page, not a requirement to show every
capture. Task and concept pages use media only where it explains the surrounding prose; the
reader-facing page must not become a screenshot gallery.

### 4.1 Get started and home

| ID | URL | Page | H2 sections | Primary media |
| --- | --- | --- | --- | --- |
| D00 | `/docs/` | Documentation | Start here · Understand the pipeline · Browse the manual · Get help · What this covers | Task cards; no full app mount. |
| T01 | `/docs/get-started/install` | Install and verify | Install · Check the toolchain · Troubleshooting · Next step | Platform-detected download tabs (`PlatformInstall`); `toolchain` focused sample of `DependencyInventory`; no screenshot gallery. |
| T02 | `/docs/get-started/first-encode` | Your first project and encode | Create a project · Add a video · Check the source and output · Start the run · Watch the pipeline · Read the result · Next steps | `new-project` and `run-control` focused samples. |
| T03 | `/docs/get-started/workspace` | Tour the workspace | Projects · Project workspace · Video workspace · Settings · Command palette and shortcuts · Where to go next | `video-config` and `command-palette` focused samples. |

### 4.2 Concepts

| ID | URL | Page | H2 sections | Primary media |
| --- | --- | --- | --- | --- |
| C01 | `/docs/concepts/pipeline` | How the pipeline works | The six stages · What each stage produces · Derived state · Optional stages · Retained work · Reading the pipeline | `video`, `quality-check`. |
| C02 | `/docs/concepts/configuration` | Configuration and inheritance | Project defaults · Video overrides · Whole-section replacement · Drafts and undo · The run lock · Templates are snapshots · Validation | `draft-actions` and `run-lock` focused samples; `project-general`, `video-scene-detection`, `video-general`. |
| C03 | `/docs/concepts/quality` | Quality targets and checks | Target quality and quality check · Metrics and ranges · Probing · Speed scaling and bitrate optimization · When scores mislead | `quality-metric`, `quality-range`, `speed-scaling`, and `bitrate-threshold` focused samples; live widget W03 (`SequenceAnalyticsCard`); `target-quality`, `quality-check`. |
| C04 | `/docs/concepts/scenes` | Scenes and preview | What a scene is · Detection · The scene table · Preview sources · Scene edits · Per-scene encoder · Retained chunks | `scene-table` and `scene-details` focused samples; `scenes`, `scene-sources`, `scene-encoder`, `scenes-invalid`. |
| C05 | `/docs/concepts/runs` | Runs, history, and logs | One run, many attempts · Outcomes · History · Logs · Export and redaction · What survives deletion | `history-item` and `log-filter` focused samples; `history`, `logs`, `log-export`, `history-failed`. |
| C06 | `/docs/concepts/scripting` | VapourSynth scripting | Where scripts live · Input kinds · The generated data module · Scene data · Validation and completion · Limits | `input-kinds` and `script-validation` focused samples; `video-script`, `project-script`, `template-script`. |

### 4.3 Guides

Every guide uses the same envelope: **Before you start**, numbered step H2s, **Check your
result**, **If it goes wrong**, and **Related reference**. The step H2s are listed in §5.

| ID | URL | Page | Primary media |
| --- | --- | --- | --- |
| G01 | `/docs/guides/configure-pipeline` | Configure the pipeline stages | No live sample; `project-general`, `project-scene-detection`, `project-noise-generation`, `project-encoding`, `project-target-quality`, `project-concatenation`, `project-quality-check`. |
| G02 | `/docs/guides/target-quality` | Hit a quality target | No live sample; `target-quality`, `quality-check`. |
| G03 | `/docs/guides/edit-scenes` | Inspect and edit scenes | `scenes`, `scenes-empty`, `scene-sources`, `scene-context-menu`, `scenes-multiselect`, `scenes-invalid`, `scene-encoder`. |
| G04 | `/docs/guides/compare-previews` | Compare Original, Decoded, and Encoded | `scenes`, `scene-sources`. |
| G05 | `/docs/guides/tune-encoder` | Tune encoder parameters | Live widget W01; `encoding`, `settings-encoders`. |
| G06 | `/docs/guides/input-filters` | Add and order input filters | No live sample; `project-general`, `filter-composer`. |
| G07 | `/docs/guides/concatenate` | Configure concatenation and tracks | No live sample; `video-concatenation`, `concat-track-sheet`. |
| G08 | `/docs/guides/templates` | Save and reuse a project template | No live sample; `settings-templates`, `template`, `template-section`, `template-script`, `project-template-picker`. |
| G09 | `/docs/guides/batch-queue` | Run and monitor a batch queue | `queue-selection` focused sample; `project`, `project-batch-selection`, `add-videos`, `video-running`, `project-empty-queue`. |
| G10 | `/docs/guides/script-scene-data` | Inject scene data into a VapourSynth script | `video-script`, `project-script`, `template-script`. |
| G11 | `/docs/guides/lan-access` | Pair and use a LAN browser | `network` focused sample; `settings-network`, `pairing-screen`, `settings-network-disabled`. |
| G12 | `/docs/guides/logs-evidence` | Review logs and export support evidence | No live sample; `history`, `logs`, `log-export`. |
| G13 | `/docs/guides/recover-run` | Recover from a failed or interrupted run | `video-failed`, `history-failed`, `logs`, `settings-dependencies-missing`. |
| G14 | `/docs/guides/storage` | Manage storage and retained work | `storage` and `retained-removal` focused samples; `settings-storage`, `video-general`. |
| G15 | `/docs/guides/dependencies` | Resolve dependencies and add encoder builds | No live sample; `settings-dependencies`, `settings-dependencies-missing`, `settings-encoders`, `encoder-build-form`. |

### 4.4 Reference

| ID | URL | Page | H2 sections | Primary media |
| --- | --- | --- | --- | --- |
| R01 | `/docs/reference/home` | Home and projects | Project list · Search · Create and rename · Delete · Disk size · States | `project-search` focused sample; `home`, `home-empty`, `home-error`. |
| R02 | `/docs/reference/project` | Project workspace and queue | Section grid · Queue · Shared section contract · Template application · States | `project`, `project-empty-queue`, `add-videos`, `project-template-picker`, `project-batch-selection`. |
| R03 | `/docs/reference/general` | General | Input kinds · Import method · Index · Script sources · Output · Filter list · States | `project-general`, `video-general`, `filter-composer`. |
| R04 | `/docs/reference/scene-detection` | Scene detection | Method · Scene lengths · Input override · Per-frame scores · Model · States | `project-scene-detection`, `video-scene-detection`. |
| R05 | `/docs/reference/noise-generation` | Noise generation | Detector · Scaler · Availability · States | `project-noise-generation`, `video-noise-generation`. |
| R06 | `/docs/reference/encoding` | Encoding | Input · Encoder · Saved builds · Executable · Passes · Colour and grain · Parameters · Add parameter · FFmpeg filter · Warnings · States | `encoding`, `settings-encoders`. |
| R07 | `/docs/reference/target-quality` | Target quality | Metric and range · Probes · Quantizer bounds · Interpolators · Probe strategy · Speed scaling · Bitrate optimization · Metric options · States | `target-quality`. |
| R08 | `/docs/reference/concatenation` | Concatenation | Project method · Video workbench · Track map · Track sheet · Chapters · Metadata · Attachments · Extra inputs · Muxer limits · States | `project-concatenation`, `video-concatenation`, `concat-track-sheet`. |
| R09 | `/docs/reference/quality-check` | Quality check | Metric · Strategy · Statistic · Input override · Retained chunks · Warning · States | `quality-check`. |
| R10 | `/docs/reference/video` | Video workspace and overrides | Tabs · Configuration grid · Overrides · Measured data · Clip details · Output · Scratch · Lock · States | `video`, `video-general`, `video-scene-detection`, `video-running`, `video-failed`. |
| R11 | `/docs/reference/scenes` | Scenes and player | Rail · Timeline · Details · Engine data · Sequence data · Player sources · Editing · Chunks · States | `scenes`, `scenes-empty`, `scene-sources`, `scene-context-menu`, `scenes-multiselect`, `scenes-invalid`, `scene-encoder`. |
| R12 | `/docs/reference/history-logs` | History and logs | History cards · Logs viewer · Filters and search · Sort · Follow · Export · Delete · States | `history`, `history-failed`, `logs`, `log-export`. |
| R13 | `/docs/reference/settings` | Settings | Appearance · Dependencies · Encoders · Project Templates · Storage · Network · About | `appearance` focused sample; six existing settings captures plus `settings-dependencies-missing`, `settings-network-disabled`. |
| R14 | `/docs/reference/templates` | Project templates | List and default · Overview · Section editor · Script · Apply to a project · Reset and delete · States | `settings-templates`, `template`, `template-section`, `template-script`. |
| R15 | `/docs/reference/encoders` | Encoders | Catalogue · Provider · Parameter table · Editor sheet · JSON · Saved builds · Overrides · States | Live widget W05; `settings-encoders`, `parameter-editor`, `encoder-json`, `encoder-build-form`. |
| R16 | `/docs/reference/filters` | Input filters | Two targets · Composer · FFMS2 OutputFormat · VapourSynth filters · Cross-field rules · Availability · States | `filter-composer`, `project-general`. |
| R17 | `/docs/reference/script-api` | Script data API | Scope · Variables · Scene fields · Sequence data · Enums and types · Validation · Examples | `video-script`, `project-script`, `template-script`. |
| R18 | `/docs/reference/shortcuts` | Keyboard shortcuts | Global commands · Player keys · Platform conventions · Command palette | `shortcuts-dialog`, `command-palette`. |

### 4.5 Troubleshooting and contributors

| ID | URL | Page | H2 sections | Primary media |
| --- | --- | --- | --- | --- |
| H01 | `/docs/troubleshooting/dependencies` | Missing tools and providers | Symptom · Check preflight · Read the row · Fix by provider · Restart · Still missing | `settings-dependencies`, `settings-dependencies-missing`, `settings-about`. |
| H02 | `/docs/troubleshooting/runs` | Failed or interrupted runs | Symptom · Find the failure · Diagnose · Recover · Prevent | `video-failed`, `history-failed`, `logs`, `video-blocked`. |
| H03 | `/docs/troubleshooting/lan` | LAN access and pairing | Symptom · Check the listener · Firewall · Pair · Revoke · Still failing | `settings-network`, `settings-network-disabled`, `pairing-screen`. |
| H04 | `/docs/troubleshooting/support` | Diagnostics and support | Collect · Logs · Diagnostics bundle · Redact · Report · What not to share | `log-export`, `settings-about`, `home-error`. |
| X01 | `/docs/contributing` | For contributors | Repository docs · Development setup · Architecture and contracts · Testing · Contributing | None; external repository links only. |

## 5. Task-page inventory

Each task page follows the same contract. A step has one action, one expected result, and at
most one live slot or capture. The “Live” line names the guide’s one frame or the step’s
widget. The “Done when” line is the user-visible success condition.

### T01 Install and verify

- **Outcome:** the application starts and every provider the first encode needs is available.
- **Before:** Windows 10/11 x64 or Ubuntu 24.04/Debian 13 x64; a source video; permission to
  install or a source-build toolchain.
- **Steps:** Install · Check the toolchain · Troubleshooting · Next step.
- **Done when:** Settings → Dependencies shows the required providers and Home loads.
- **Recovery:** H01; if no installer is offered, follow the source build section to
  [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Live:** `toolchain`, the production `DependencyInventory` with sample rows; `PlatformInstall` carries the download tabs.
- **Figures:** none.

### T02 Your first project and encode

- **Outcome:** one project with one queued video, a completed run, and a readable output.
- **Before:** T01 complete; a source video on a local disk; an output folder with free space.
- **Steps:** Create a project · Add a video · Check the source and output · Start the run ·
  Watch the pipeline · Read the result · Next steps.
- **Done when:** the video card and History say the run completed, the output exists, and the
  Logs tab has a record of the run.
- **Recovery:** G13; the create and add sheets are transient and use captures.
- **Live:** `new-project` under “Create a project” and `run-control` under “Start the run”.
- **Figures:** none.

### T03 Tour the workspace

- **Outcome:** the reader can move between Projects, a project, a video, Settings, and the
  command palette without guessing where a control lives.
- **Before:** T02 complete is useful but not required.
- **Steps:** Projects · Project workspace · Video workspace · Settings · Command palette and
  shortcuts.
- **Done when:** the reader can name the project-level and video-level configuration scopes
  and open the command palette.
- **Recovery:** R18 for every shortcut.
- **Live:** `video-config` under “Video workspace” and `command-palette` under “Command
  palette and shortcuts”.
- **Figures:** none.

### G01 Configure the pipeline stages

- **Outcome:** project-level defaults for General, Scene detection, Noise generation,
  Encoding, Target quality, Concatenation, and Quality check are saved.
- **Before:** a project exists; the source decoder and at least one encoder are available.
- **Steps:** General · Scene detection · Noise generation · Encoding · Target quality ·
  Concatenation · Quality check.
- **Done when:** each section card reads Set or Engine default deliberately, and no section
  is left with an accidental draft.
- **Recovery:** validation errors stay on the section page; the run lock is explained in C02.
- **Live:** none.
- **Figures:** `project-general`, `project-scene-detection`, `project-noise-generation`,
  `project-encoding`, `project-target-quality`, `project-concatenation`,
  `project-quality-check`.

### G02 Hit a quality target

- **Outcome:** a probe-based encode with a per-scene quantizer, an optional speed curve and
  bitrate threshold, and a final quality check.
- **Before:** G01 complete; an encoder that supports the chosen metric bounds; retained
  chunks are on if a quality check is expected.
- **Steps:** Enable target quality · Choose metric and range · Set probes and bounds · Add
  speed points · Set the bitrate threshold · Run and inspect · Check your result · If it goes
  wrong.
- **Done when:** Target quality reports probes and a chosen quantizer per scene; Quality
  check reports scores against the source.
- **Recovery:** a zero-probe or inverted range is refused; a filter warning is not an error.
- **Live:** none.
- **Figures:** `target-quality`, `quality-check`.

### G03 Inspect and edit scenes

- **Outcome:** a valid scene table after inspection and a deliberate structural edit.
- **Before:** scene detection has run; the video is not encoding.
- **Steps:** Detect scenes · Select and inspect · Split, merge, or delete · Undo · Edit
  multiple scenes · Set a scene encoder · Reset chunks · Check your result · If it goes wrong.
- **Done when:** the table has no gaps or overlaps and the intended edit is visible; one undo
  step is available for a structural edit.
- **Recovery:** an invalid boundary names the scene and blocks only the run action; chunk
  deletion is not restored by undo.
- **Live:** none; the player and Monaco are heavy, so this guide uses captures.
- **Figures:** `scenes`, `scenes-empty`, `scene-sources`, `scene-context-menu`,
  `scenes-multiselect`, `scenes-invalid`, `scene-encoder`.

### G04 Compare Original, Decoded, and Encoded

- **Outcome:** the reader can compare the same frame across the three preview sources and
  explain why a source is unavailable.
- **Before:** a queued source; Decoded needs a resolvable decode graph; Encoded needs a
  detected scene with a retained chunk.
- **Steps:** Open the source control · Compare Original and Decoded · Compare Encoded ·
  Switch without losing position · Understand unavailable sources · Check your result.
- **Done when:** the source control shows the selected source and the playhead stays on the
  same scene-relative frame across switches.
- **Recovery:** a missing source names the prerequisite; a paired LAN browser explains the
  media-token limitation.
- **Live:** none; the player is heavy and media playback is not a deterministic docs fixture.
- **Figures:** `scenes`, `scene-sources`.

### G05 Tune encoder parameters

- **Outcome:** a deliberate set of encoder parameters for the selected encoder or saved build.
- **Before:** G01 complete; the encoder is available; the parameter catalogue is loaded.
- **Steps:** Choose the encoder · Choose a saved build · Find and edit parameters · Add a
  parameter · Preview the command · Save · Check your result · If it goes wrong.
- **Done when:** the parameter header reports the intended `n of m set` count and Preview
  command shows the expected flags.
- **Recovery:** unset or invalid values stay inline; choosing a different encoder does not
  carry the previous executable.
- **Live:** W01, the real `ParameterValueGrid` with SVT-AV1 scratch values.
- **Figures:** `encoding`, `settings-encoders`.

### G06 Add and order input filters

- **Outcome:** an ordered filter list for the selected input kind.
- **Before:** a project exists; the input kind is known; VapourSynth is available if a
  VapourSynth filter is used.
- **Steps:** Choose the input kind · Add a filter · Fill the generated fields · Reorder and
  remove · Save · Check your result · If it goes wrong.
- **Done when:** each row has a one-line summary and the saved General document reflects the
  order.
- **Recovery:** invalid filter JSON is refused on save; a missing plugin is named by the
  preflight/script scan.
- **Live:** none.
- **Figures:** `project-general`, `filter-composer`.

### G07 Configure concatenation and tracks

- **Outcome:** a muxing method and track map that copy the encoded video and the intended
  source streams.
- **Before:** an encoded run produced chunks or an output; the chosen muxer is available.
- **Steps:** Choose the method · Probe the inventory · Map tracks · Edit a track · Copy
  chapters and metadata · Add attachments or extra inputs · Save · Check your result · If it
  goes wrong.
- **Done when:** the encoded video row is locked as the only video track and the intended
  audio, subtitle, attachment, and chapter data is included.
- **Recovery:** a missing muxer returns a readable inventory failure; an unmatched override
  stays visible and removable.
- **Live:** none.
- **Figures:** `video-concatenation`, `concat-track-sheet`.

### G08 Save and reuse a project template

- **Outcome:** a saved template that can be applied to a project without touching existing
  video overrides.
- **Before:** a project with a configuration worth reusing.
- **Steps:** Create a template · Edit a section · Edit the template script · Mark the default
  · Apply to a project · Reset or delete · Check your result.
- **Done when:** the template is listed, the default marker is deliberate, and applying it
  changes the project’s configuration and General section but not video overrides.
- **Recovery:** a dirty template guards navigation; resetting a template does not change
  existing projects.
- **Live:** none.
- **Figures:** `settings-templates`, `template`, `template-section`, `template-script`,
  `project-template-picker`.

### G09 Run and monitor a batch queue

- **Outcome:** a queue run in order, one video at a time, with a readable result per row.
- **Before:** at least one video; every queued video has a valid configuration; no other run
  holds the process-wide lock.
- **Steps:** Add the queue · Reorder · Select and run · Monitor · Stop · Read results · If it
  goes wrong.
- **Done when:** each selected video reaches a terminal state and the queue order is
  preserved; a failure does not abandon later rows.
- **Recovery:** a held lock is a control refusal, not a run failure; use History/Logs to find
  the actual failure.
- **Live:** none.
- **Figures:** `project`, `project-batch-selection`, `add-videos`, `video-running`,
  `project-empty-queue`.

### G10 Inject scene data into a VapourSynth script

- **Outcome:** a script that reads the generated `condor_data` module and uses a scene value.
- **Before:** a video with a VapourSynth or VapourSynth script input; a detected scene table if
  the script reads scenes.
- **Steps:** Open the script page · Read the variables · Edit the script · Use scene data ·
  Validate · Save · Check your result · If it goes wrong.
- **Done when:** Validate returns the clip or the expected interpreter error, and the saved
  script is used by the next run.
- **Recovery:** a missing source path still parses but cannot produce frames; a stale scene
  field is warned in the editor.
- **Live:** none; Monaco and the language server are heavy and stateful.
- **Figures:** `video-script`, `project-script`, `template-script`.

### G11 Pair and use a LAN browser

- **Outcome:** one paired browser can use the app over the local network, and access can be
  revoked.
- **Before:** Settings → Network; a trusted LAN; a free TCP port.
- **Steps:** Enable LAN · Read the address · Pair with code, link, or QR · Use the browser ·
  Revoke or disable · Firewall · If it goes wrong.
- **Done when:** the paired browser loads the app, the desktop session list shows it, and
  revoking it ends that token.
- **Recovery:** H03; the browser does not manage the listener it is using, by design.
- **Live:** none.
- **Figures:** `settings-network`, `pairing-screen`, `settings-network-disabled`.

### G12 Review logs and export support evidence

- **Outcome:** the right run’s log is found, filtered, and exported with redactions understood.
- **Before:** at least one run with a log directory.
- **Steps:** Open History · Open the log · Filter and search · Follow a live run · Export ·
  Review redactions · Delete a run · If it goes wrong.
- **Done when:** the exported text is the same text shown in the preview and contains no
  unredacted paths, filenames, hostnames, or addresses.
- **Recovery:** a live log cannot be deleted; a missing log directory falls back to the newest
  log.
- **Live:** none.
- **Figures:** `history`, `logs`, `log-export`.

### G13 Recover from a failed or interrupted run

- **Outcome:** the cause is identified, the cause is fixed, and the video reaches a completed
  state.
- **Before:** a failed, cancelled, or interrupted run; the video’s History and Logs.
- **Steps:** Read the failure · Find the failing sequence · Open the log · Fix the cause ·
  Resume or rerun · Verify · If it goes wrong.
- **Done when:** a new run completes and History shows the recovery attempt.
- **Recovery:** H02; a control refusal is not a run failure, and a cancelled run is not a
  failed run.
- **Live:** none; failed states are seeded captures.
- **Figures:** `video-failed`, `history-failed`, `logs`, `settings-dependencies-missing`.

### G14 Manage storage and retained work

- **Outcome:** the scratch location, retention setting, and retained work are deliberate.
- **Before:** Settings → Storage; a project with or without retained work.
- **Steps:** Read storage · Change scratch · Set retention · Remove retained work · Reveal
  app data · Check your result.
- **Done when:** the free-space figure, retention switch, and retained-work list match the
  chosen state.
- **Recovery:** a video with retained chunks refuses a scratch move until retained work is
  deleted; deleting retained work is not undoable.
- **Live:** none.
- **Figures:** `settings-storage`, `video-general`.

### G15 Resolve dependencies and add encoder builds

- **Outcome:** every capability the chosen workflow needs resolves to a provider, and a saved
  encoder build is available where expected.
- **Before:** T01 complete; Settings → Dependencies and Encoders.
- **Steps:** Run preflight · Read a row · Choose bundled or system · Locate a custom
  executable · Set the scene model or interpreter · Add a custom encoder build · Restart when
  required · If it goes wrong.
- **Done when:** the Diagnostics card reports the expected count, the chosen provider is
  active, and a new build appears in the catalogue without a restart.
- **Recovery:** H01; a VapourSynth or metric source change requires a restart, while encoder,
  FFmpeg, and mkvmerge changes apply on next use.
- **Live:** none.
- **Figures:** `settings-dependencies`, `settings-dependencies-missing`, `settings-encoders`,
  `encoder-build-form`.

## 6. Reference inventory

Reference pages are lookup material, not tutorials. They may link to a guide but must not
repeat a guide’s ordered steps. Field tables use the app’s labels and state **not applicable**
where a state cannot occur.

| ID | Must cover | Media and constraints |
| --- | --- | --- |
| R01 | Project list columns, last-accessed order, search, create, rename, delete, on-disk size, loading/empty/error/populated states. | `home`, `home-empty`, `home-error`; no locked state. |
| R02 | Seven section cards, Set/Engine default/Locked, queue rows, reorder, selection, bulk bar, add/remove, run lock, template application. | `project`, `project-empty-queue`, `add-videos`, `project-template-picker`, `project-batch-selection`. |
| R03 | FFMS2, VapourSynth, VapourSynth script, import method, FFMS2 index, file/text script sources, output modes, filter list, states. | `project-general`, `video-general`, `filter-composer`. |
| R04 | None, AVSceneChange, TransNetV2, minimum/maximum lengths, fast/standard, per-frame scores, input override, model location, states. | `project-scene-detection`, `video-scene-detection`. |
| R05 | Detector reference/denoised filters, WNNM default pair, scaler threshold/minimum/maximum/chroma, availability, states. | `project-noise-generation`, `video-noise-generation`. |
| R06 | Nine encoder families, saved builds, executable/PATH, passes, colour data, photon noise, parameters, add parameter, FFmpeg filter, filter warning, states. | `encoding`, `settings-encoders`. |
| R07 | Metrics and default ranges, maximum probes, quantizer bounds, interpolators, Whole/Skip/Subset, speed quantizers, bitrate sigma, metric options, states. | `target-quality`. |
| R08 | mkvmerge/FFmpeg/IVF, project vs video ownership, track map namespaces, locked encoded-video row, track sheet, chapters, metadata, attachments, extra inputs, muxer limits, states. | `project-concatenation`, `video-concatenation`, `concat-track-sheet`. |
| R09 | Metric, strategy, statistic, input override, retained chunks, FFmpeg-filter warning, states. | `quality-check`. |
| R10 | Four tabs, Configuration grid, overrides, measured data, clip details, exact output, scratch, run lock, states. | `video`, `video-general`, `video-scene-detection`, `video-running`, `video-failed`. |
| R11 | Rail, proportional timeline, details groups, engine data, sequence data, player sources, edit actions, chunk markers, read-only states. | `scenes`, `scenes-empty`, `scene-sources`, `scene-context-menu`, `scenes-multiselect`, `scenes-invalid`, `scene-encoder`. |
| R12 | Run cards, attempts, outcomes, log levels, server-side filters/sort, follow, export/redaction, delete, live/locked states. | `history`, `history-failed`, `logs`, `log-export`. |
| R13 | Appearance, Dependencies, Encoders, Project Templates, Storage, Network, About; per-tab actions and states. | Six existing settings captures plus `settings-dependencies-missing`, `settings-network-disabled`. |
| R14 | Template list/default, overview cards, section editor, template script, apply/reset/delete, states. | `settings-templates`, `template`, `template-section`, `template-script`. |
| R15 | Catalogue, provider, parameter table, editor sheet, JSON import/export/validation, saved builds, overrides, states. | W05; `settings-encoders`, `parameter-editor`, `encoder-json`, `encoder-build-form`. |
| R16 | FFMS2 vs VapourSynth targets, composer, filter fields, cross-field rules, plugin availability, states. | `filter-composer`, `project-general`. |
| R17 | Script scope, reserved variables, scene fields, sequence data, generated types, validation, examples. | `video-script`, `project-script`, `template-script`. |
| R18 | Save, discard, undo, redo, palette, run, player keys, platform modifier labels. | `shortcuts-dialog`, `command-palette`. |

## 7. Live content

The live contract has three levels:

1. **Focused sample** — one production component, or one small set of production components,
   mounted under the context it needs. It shows the described surface rather than a full
   application or a screenshot in poor context. A control can be as small as the real
   **New project** button when that is the action the step describes.
2. **Widget** — one real component mounted inline for a single reference value or preview,
   such as `ParameterValueGrid` or `SequenceAnalyticsCard`.
3. **Capture** — a deterministic screenshot for transient overlays, failed states, heavy
   editors/players, OS pickers, or states that cannot be seeded deterministically.

A focused sample is not a second application shell. It mounts the same component the app
uses, so its type scale, spacing, tokens, and responsive layout are the app's. It fills the
article width, never scrolls internally, and never opens a page-level overlay. The page is the
only scroll container. A **Reset** control remounts the sample with fresh local state.

### 7.1 Focused samples

| Kind | Page | Production component | Context |
| --- | --- | --- | --- |
| `toolchain` | T01 | `DependencyInventory` | Local `MockTransport` seeded with three capability rows; compact mode omits host-only model and Python groups. |
| `new-project` | T02 | `NewProjectButton` + `NewProjectForm` | Local `MockTransport`; the Create action accepts and shows the created name. |
| `run-control` | T02 | `RunControl` | Local running state; Start and Stop change only the sample. |
| `video-config` | T03 | `SectionCard` + two `SequenceSectionCard`s | Memory router and `DemoModeProvider`; responsive app grid, no run or reset actions. |
| `command-palette` | T03 | `CommandPalette` in `inline` mode | Memory router rooted at Settings and a local `MockTransport`; rendered in the card instead of an overlay, with no navigation. |
| `draft-actions` | C02 | `DraftActions` + `NumberField` | Local `useDraftHistory` draft with a saved baseline; Save, Discard, Undo, and Redo operate only on the sample. |
| `run-lock` | C02 | `SequenceActionButton` with lock icons | The real disabled sequence actions, with the service's lock reason in each tooltip. |
| `appearance` | R13 | `AppearancePanel` | Local `MockTransport`; theme, density, and motion controls persist only in the sample. |
| `project-search` | R01 | `SearchField` + `ProjectRow` | Local `MockTransport` project list; filtering, rename, and delete operate on the sample rows. |
| `quality-metric` | C03 | `MetricField` | The real metric control from the generated Target quality schema; selection stays in the sample. |
| `quality-range` | C03 | `TargetRangeField` + `QuantizerRangeField` | The real target and quantizer bounds; edits stay in the sample. |
| `speed-scaling` | C03 | `SpeedScalingCard` | The real point graph; drag or click a point, and the curve stays in the sample. |
| `bitrate-threshold` | C03 | `BitrateThresholdCurve` + `NumberField` | The real distribution graph; clicking or typing changes only the sample threshold. |
| `scene-table` | C04 | `SceneRail` | Fixture scenes with a local selection; the rail keeps the viewer's virtualized rows and proportional timeline. |
| `scene-details` | C04 | `SceneDetailsPanel` | Fixture scenes with the real details panel and local action handlers. |
| `history-item` | C05 | `HistoryRunCard` | One sample run with sequence attempts, measures, and a terminal failure message. |
| `log-filter` | C05 | `LogFilterBar` + `LogRow` | The shared viewer row renders sample records and highlights the search needle; level, search, and clear filters stay in the sample. |
| `queue-selection` | G09 | `ProjectQueueSection` | Local `MockTransport` queue of four videos; selecting a row reveals the real bulk bar and its actions. |
| `storage` | G14 | `StorageScratchCard` + `DraftActions` | Local `MockTransport`; the sample starts with an unsaved scratch path, and Save writes it to the sample settings. |
| `retained-removal` | G14 | `DeleteRetainedDialog` | Sample retained bytes; confirming removes only the sample's reported work. |
| `network` | G11 | `PairingScreen` in `embedded` mode | A sample code exchange accepts `ABCD-EFGH` and shows the paired state without leaving the page. |
| `input-kinds` | C06 | `InputEditor` | Local `MockTransport` input opened on a VapourSynth script; kind and source changes stay in the sample. |
| `script-validation` | C06 | `ScriptEditor` + `ScriptValidationResult` | A read-only invalid script and the service's failed check result. |

`@av1ation/ui/docs-widgets` exports `DocsSample`, which owns the sample label and **Reset**.
The website lazy-loads that module from the `LiveSample` MDX component. Every sample kind is
unique across the manual; `docs-content.test.ts` enforces that and the widget allowlist.

### 7.2 Live widgets

| ID | Page | Component | Data | Constraints |
| --- | --- | --- | --- | --- |
| W01 | G05 | `ParameterValueGrid` | SVT-AV1 descriptor group and scratch values | No save, no network, reset control. |
| W03 | C03 | `SequenceAnalyticsCard` | Captured quality-check analytics | Lazy ECharts chunk; fallback `quality-check`. |
| W05 | R15 | `ParameterValueGrid` | x265 descriptor preview | Scratch values; no draft. |

### 7.3 Sample host rules

- Mount the production component. A docs-only replica of an app widget is a defect, even if
  it looks similar at one viewport.
- Give the component only the context it needs: one local `ApiProvider` with `MockTransport`
  for data, a memory router for links and route metadata, or `DemoModeProvider` to suppress
  actions that would read a file or start a run.
- Never start an encode, read a file, receive a real service origin, or change the site URL.
- Never mount a page-level dialog or portal. `CommandPalette` takes `inline` for this case; the
  normal application still uses its modal dialog.
- Do not put a sample in an internal scroll area. Remove fixed heights and let the article
  page scroll; the responsive component width is the article width.
- Label the sample and provide a keyboard-reachable **Reset** that remounts local state.
- At 390 px the sample is one column and has no horizontal overflow. At 1280 px its width and
  the prose width are equal.

## 8. Screenshot inventory

The inventory uses **60 capture IDs**: the existing 35 gallery surfaces plus 25 new
documentation cases. Every capture is generated in dark and light from the same state.
Figures are native-scale crops; the complete surface is used only for a guide’s one context
image and for the “view full surface” link.

### 8.1 Existing captures

| Capture | Docs crop / figure | Pages |
| --- | --- | --- |
| `home` | Context; project rows | D00, T03, R01 |
| `project` | Section grid + queue header | T03, G09, R02, C01 |
| `project-general` | Input and Output cards; filter rows | C02, G01, R03, G06 |
| `project-scene-detection` | Method card and bounds | G01, R04 |
| `video` | Context; sequence cards | T02, T03, C01, G09, R10 |
| `scenes` | Rail, details, timeline; player crop | C04, G03, G04, R11 |
| `video-general` | Input and output | C02, T02, R10 |
| `history` | Run card and attempts | T02, C05, G12, G13, R12 |
| `video-scene-detection` | Override header and provenance | C02, G01, R04, R10 |
| `logs` | Level filters and rows | C05, G12, G13, R12, H02 |
| `video-script` | Editor and script-data panel | C06, G10, R17 |
| `project-script` | Editor and script-data panel | C06, G10, R17 |
| `template-script` | Editor and script-data panel | G08, R14, C06 |
| `template-section` | Section form | G08, R14 |
| `template` | Overview cards | G08, R14 |
| `settings-dependencies` | Capability rows and diagnostics | T01, G15, R13, H01 |
| `encoder-json` | Editor and located issues | R15 |
| `settings-appearance` | Theme and density miniatures | R13 |
| `settings-encoders` | Catalogue and parameter table | G05, G15, R15 |
| `settings-templates` | List and default marker | G08, R14 |
| `settings-storage` | Storage cards and retained work | G14, R13 |
| `settings-network` | LAN card, pairing, sessions | G11, R13, H03 |
| `settings-about` | Version, engine, support actions | T01, R13, H04 |
| `quality-check` | Score chart and statistics | C03, G02, R09 |
| `target-quality` | Metric, range, and speed graph | C03, G02, R07 |
| `encoding` | Encoder and parameter header | G01, G05, R06 |
| `home-empty` | Empty panel | T01, R01 |
| `home-error` | Error panel | R01, H04 |
| `project-empty-queue` | Empty queue target | T02, G09, R02 |
| `scenes-empty` | Empty rail and timeline | G03, R11 |
| `command-palette` | Palette dialog | T03, R18 |
| `parameter-editor` | Descriptor sheet | R15 |
| `scene-encoder` | Scene encoder sheet | G03, R11 |
| `add-videos` | Add-videos sheet | T02, G09, R02 |
| `log-export` | Export sheet and redacted preview | G12, R12, H04 |

### 8.2 New documentation captures

| Capture | State | Crop(s) | Pages | Fixture / prepare |
| --- | --- | --- | --- | --- |
| `home-create` | Home with the inline create form open | Form and first row | T02, G09 | Click **New project**. |
| `project-template-picker` | Project header with Apply Template picker open | Picker and header | G08, R02 | Click **Apply Template**. |
| `project-batch-selection` | Queue with two rows selected and the bulk bar visible | Rows and bulk bar | G09, R02 | Select two rows. |
| `project-noise-generation` | Project Noise generation route | Detector and scaler cards | G01, R05 | Direct route. |
| `project-encoding` | Project Encoding route | Encoder, passes, parameter header | G01, R06 | Direct route. |
| `project-target-quality` | Project Target quality route | Metric/range and probe controls | G01, R07 | Direct route. |
| `project-concatenation` | Project Concatenation route | Method card | G01, R08 | Direct route. |
| `project-quality-check` | Project Quality check route | Metric, strategy, warning | G01, R09 | Direct route. |
| `video-noise-generation` | Video Noise generation route | Detector, scaler, measured data | G01, R05 | Direct route. |
| `video-concatenation` | Video Concatenation route with populated inventory | Method and track map | G07, R08 | Seed `concat-inventory`. |
| `video-running` | Video Configuration with an active Parallel Encoder | Progress rows and run chip | T02, G09, C01, R10 | New `running` mode. |
| `video-failed` | Video Configuration with a failed run | Failure rail and owning card | G13, C05, H02, R10 | New `failed` mode. |
| `video-blocked` | Video Configuration with Start disabled by validation | Validation strip and Start | G13, H02, R10 | New `blocked` mode. |
| `filter-composer` | General with the Add filter sheet open | Composer and generated fields | G06, R03, R16 | Click **Add** in the filter list. |
| `scene-sources` | Scenes with the source popover open | Player and source list | G04, C04, R11 | Open the source control. |
| `scene-context-menu` | Scenes timeline context menu | Menu and scene block | G03, R11 | Right-click a covered range. |
| `scenes-multiselect` | Scenes with two adjacent scenes selected | Rail and aggregate details | G03, R11 | Shift-click two rows. |
| `scenes-invalid` | Scenes with an invalid boundary and the problem strip | Problem strip and marked block | G03, C04, R11 | New `invalid-scenes` fixture. |
| `history-failed` | History with a failed run card | Failed card and terminal message | G13, C05, R12, H02 | New `failed` mode. |
| `pairing-screen` | Standalone browser pairing form | Full form | G11, H03 | `?capture=pairing` harness. |
| `settings-dependencies-missing` | Dependencies with one unavailable capability and remediation | Unavailable row and Diagnostics | T01, G15, R13, H01 | New `missing-dependency` mode. |
| `settings-network-disabled` | Network with LAN off and no sessions | LAN card and empty sessions | G11, R13, H03 | New `lan-off` mode. |
| `shortcuts-dialog` | Keyboard Shortcuts dialog open over Home | Dialog | T03, R18 | Palette → **Keyboard Shortcuts**. |
| `encoder-build-form` | Encoders with Add build form open | Form and provider fields | G15, R15 | Click **+ Add build…**. |
| `concat-track-sheet` | Concatenation with a track options sheet open | Sheet and track row | G07, R08 | Open a track’s sliders. |

### 8.3 New fixture profiles

The gallery needs deterministic modes beyond the current
`populated | empty | empty-queue | empty-scenes | failing | loading` set:

- **`running`** — Scene detection, Noise generation, and Target quality complete; Parallel
  Encoder active with a deterministic progress value; a partial History attempt and live log.
- **`failed`** — a terminal failed run with `VideoState.failure`, a failure rail on the owning
  card, and a failed History card.
- **`blocked`** — a validation blocker with Start disabled and the reason visible.
- **`missing-dependency`** — one capability unavailable with a remediation, leaving the rest
  of the inventory populated.
- **`lan-off`** — LAN disabled, no sessions, no pairing token.
- **`invalid-scenes`** — a scene table with one deliberate gap or overlap and the problem
  strip visible.
- **`concat-inventory`** — a populated mkvmerge track map with video, audio, subtitles, and
  attachments.
- **`pairing`** — a capture-only demo mode that mounts the real `PairingScreen` with a mock
  pairing function.

These are docs states, not new product behavior. They must be seeded through the existing
`GalleryDemoTransport`/`seedGallery` path, not by editing the real service.

### 8.4 Figure rules

- Every figure has dark and light variants selected by the site theme. No figure is committed.
- A full-surface context image is allowed once per guide. Everything else is a native-scale
  crop; never shrink a 1280 px window into a 720 px prose column.
- Captions state what the figure teaches; alt text describes the visible surface and the
  state, not the surrounding prose.
- Callouts are DOM overlays with accessible labels; labels are never baked into the AVIF.
- A crop that drops the app chrome must name its scope in the caption (for example, “Video →
  Target quality, probe controls”).
- Screenshots are fallback evidence. Do not use a screenshot to claim an interaction that the
  user cannot perform in the current build.
- Mobile uses the same crop at responsive width, not a separate per-breakpoint capture set.

## 9. Authoring, routing, and search

### 9.1 Content layout

- MDX body files live under `apps/website/content/docs/` and mirror their public URL:
  `/docs` is `index.mdx`, `/docs/concepts/pipeline` is `concepts/pipeline.mdx`, and
  `/docs/troubleshooting/lan` is `troubleshooting/lan.mdx`.
- A typed `manifest.ts` owns the page ID, URL, title, group, description, related pages,
  and section headings. The MDX body declares any figure or focused sample; the content test
  checks that each sample kind is mounted at most once.
- The manifest and MDX tree must contain exactly the same 48 URL-derived paths. Filenames do
  not use inventory IDs, so the folder tree is readable without opening the manifest or this
  document. A missing or orphaned page fails the docs check.
- Pages are lazy-loaded by route; the docs home and search shell are eager. The focused
  samples and the ECharts/Monaco chunks load only when the page mounts them.
- Content uses the app’s terminology: project, video, section, sequence, scene, run, attempt,
  chunk, retained work, provider, capability, template, quality target. It does not rename
  them for marketing.

### 9.2 MDX components

Add a small component vocabulary; do not let MDX import arbitrary app internals:

- `DocsPage` — title, description, metadata, breadcrumbs, TOC, previous/next.
- `Steps` / `Step` — numbered task steps with anchors and expected-result slots.
- `Callout` — note, tip, warning, danger.
- `Figure` — theme-aware capture, native crop, alt, caption, zoom/full-surface link.
- `LiveWidget` — one of the allowlisted widgets.
- `LiveSample` — one focused sample kind (`toolchain`, `new-project`, `run-control`,
  `video-config`, `command-palette`, `draft-actions`, `appearance`, `project-search`,
  `run-lock`, `quality-metric`, `quality-range`, `speed-scaling`, `bitrate-threshold`,
  `scene-table`, `scene-details`, `history-item`, `log-filter`, `queue-selection`, `storage`,
  `retained-removal`, `network`, `input-kinds`, or `script-validation`), lazy-loaded from
  `@av1ation/ui/docs-widgets`.
- `Key` / `KeySequence` — platform-aware shortcuts.
- `FieldTable` — reference tables with stable row anchors.
- `PlatformInstall` — release-manifest tabs, bundled and system assets, and install notes.
- `RelatedLinks` — reference and next-task links.
- `CodeBlock` — copy action, shell label; no syntax-highlighting dependency is required.

### 9.3 Routing

- `/docs/` and `/docs/*` render the docs layout instead of `DocsStub`.
- The docs router updates `history.pushState` on internal links and listens to `popstate`;
  modifier-click and external links keep normal browser behavior.
- Direct navigation to `/docs/...` requires the website host to serve the site entry for the
  docs path. The build must document that fallback.
- On navigation: scroll to top, move focus to the page heading, update `document.title` and the
  meta description, and update `aria-current` in the sidebar.
- The site header remains the shared header; docs adds a sidebar, mobile contents drawer, and
  a search trigger. Do not create a second brand header.
- The in-page TOC is generated from the rendered page sections, excluding procedure-step
  headings, focused-sample headings, and the related-links footer. It has no repeated "On this
  page" label because it is already nested under the current page in the sidebar, and is hidden
  below the wide breakpoint.
- No version switcher. A `0.1.0` pre-release badge links to the release notes.

### 9.4 Search

- Search is client-side and lazy. Open with `Ctrl/⌘K` or the sidebar/search trigger.
- Generate `docs-search.json` from the MDX AST at build/dev time. Index page title, group,
  description, headings, prose, list items, table cells, figure captions, and code labels.
  Do not index live component internals.
- Use MiniSearch for ranking; show grouped results with page, section, and a short snippet.
  Keyboard: arrows move, Enter opens, Escape closes, focus returns to the trigger.
- A missing or stale index fails the docs build. No server, no external index, no analytics.
- Search must work with JavaScript enabled; there is no static fallback in this release.

### 9.5 Metadata and accessibility

- One `<h1>` per page; sections use H2, sub-sections H3. The TOC mirrors that order.
- The sidebar is a `nav` with an accessible name; the current page uses `aria-current="page"`.
- The mobile drawer traps focus, closes with Escape, and returns focus to its trigger.
- Every figure has alt text; every focused sample has a label, a sample-data note, and a
  keyboard-reachable reset.
- Samples and live widgets must remain usable without a pointer and must not trap focus.
- Docs pages pass the existing browser `axe` expectations for landmarks, headings, contrast,
  target size, and keyboard focus.
- The docs do not autoplay media; `run-control` starts idle, and no sample starts a real run.

### 9.6 Dependencies

Proposed additions, kept to the docs surface:

- `@mdx-js/rollup` and `remark-gfm` for MDX and tables.
- `unified`, `remark-parse`, `remark-mdx`, `mdast-util-to-string`, `unist-util-visit` for the
  build-time search index.
- `minisearch` for client-side ranking.
- No docs framework, syntax highlighter, analytics, or hosted search.

The exact versions are chosen at implementation time and recorded in the lockfile.

## 10. Build and verification

### 10.1 Page and figure checks

- The docs manifest and MDX files contain exactly the 48 page IDs in §4.
- Every figure ID resolves to a capture in `e2e/screenshots/catalog.ts` or the docs extension
  catalog, and every referenced capture has both theme variants.
- Every live slot resolves to an allowlisted widget or a live-frame route; no page mounts an
  arbitrary app route.
- Every internal docs link resolves, and every page has one H1 and unique H2 anchors.
- `npm run check:docs` passes after the new document and glossary entries are added.

### 10.2 Asset pipeline

1. `npm run screenshots` captures 60 cases in both themes from deterministic fixtures.
2. `npm run build:docs-shots` crops the named figures into
   `apps/website/public/docs-shots/`, dark and light, as AVIF. The directory is ignored.
3. `npm run build:website` refuses to build when a docs figure or theme variant is missing.
   The error names `npm run screenshots` and `npm run build:docs-shots`.
4. `npm run build:website:gallery` bypasses the docs guard, because the screenshot pipeline
   builds the site before it can capture the figures.
5. Do not commit screenshots, crops, or build output. Keep the existing mobile-tour guard and
   add the docs guard beside it.

### 10.3 Visual and runtime checks

- 390 px: drawer navigation, search modal, single-column figures, no horizontal overflow.
- 900 px: docs content readable; samples stay at article width and do not scroll internally.
- 1280 px: sidebar, TOC, native crops, and each focused sample mount at article width.
- Both themes: switches figures and sample tokens without a layout shift.
- Search: empty query, one result, no result, long query, keyboard selection, Escape.
- Focused sample: reset, sample-data label, no internal scroll, no page-level overlay, no site
  URL change, no real network. Expand a dependency row and create a project in the sample.
- Live widget: keyboard control, reset, fallback when its chunk fails.
- Direct load of `/docs/guides/edit-scenes` and `/docs/reference/encoding` returns the site
  entry and renders the page.

### 10.4 Commands

The implementation should finish with the narrowest relevant checks:

```bash
npm run typecheck
npm run check:docs
npm run build:website
npm run check:bundle-size
```

The screenshot and focused-sample checks are additional because they cover generated assets
and browser behavior, not because every prose edit needs them.

## 11. Remaining risks and order of work

### 11.1 Order

1. Extend the gallery fixtures and capture the 25 new cases in both themes (§8.3).
2. Author the 48 MDX pages against the captured and live media.
3. Generate the search index and wire routing, navigation, and the theme switch.
4. Run the checks in §10.

Steps 1–4 can proceed per guide once its media exists.

### 11.2 Focused-sample failure path

A sample that cannot mount the production component deterministically falls back to the
nearest capture; it does not become a docs-only replica or a full-app frame. This is a media
change, not a page removal.

### 11.3 Capture work

Twenty-five new captures need six seeded modes and one capture-only harness mount. The
`running`, `failed`, `blocked`, and `invalid-scenes` states are fixture states, so no capture
depends on timing, disk state, or a real encode. A state that cannot be seeded is not captured
rather than approximated, and the affected page uses the nearest honest figure.

### 11.4 Scope

This is a 48-page manual, 60 captures, 120 theme images, twenty-three focused samples, and three
live widgets. There are no full-app live frames. Everything ships together, so the release
gate is the complete set. There is no reduced first-release tier.

### 11.5 Non-goals

- No project import/export or migration guide; the archive routes are unused and there is no
  supported migration workflow.
- No versioned docs or stable-channel manual.
- No contributor, architecture, or API documentation on the public site; those remain in the
  repository.
- No static per-page HTML, SSR, or third-party search in this release.
