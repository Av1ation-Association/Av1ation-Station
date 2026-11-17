# Phase 6 — Product backlog

> **Planning record.** Current delivery status lives in [progress.md](../progress.md).

**Status:** active planning and first fixes. This is the working catalog for the issues reported
after the bundled-toolchain release candidate. Update the Status column as work lands; keep
the verification column honest even when a check is deferred.

The list came in unordered. It is grouped below by the part of the product that owns the
decision, then ordered by what should be fixed first. Priority means product risk, not
difficulty: a P0 can corrupt a run or make an installer unusable, while a P2 is a polish or
investigation item.

## Priority meanings

| Priority | Meaning |
| --- | --- |
| **P0** | Blocks a trustworthy release, loses work/data, or makes the installed app fail to launch. |
| **P1** | A frequent workflow is wrong or an important capability is misleading; fix in the next feature batch. |
| **P2** | Polish, consistency, performance, or a research question that can wait without hiding a failure. |

## Release blockers found while this catalog was written

These are not in the original 25 items, but they are the reason the `v0.1.0-rc.2` release run
stopped. They stay at the top until a published release exists.

| ID | Blocker | Evidence | First move | Verification |
| --- | --- | --- | --- | --- |
| **R1** | Committed toolchain lock is stale against the trees built from `2892777`. | Run `44035777845`: `toolchain:lock --check` failed in the lock job and in all three package legs; the release job never reached publish. | Regenerated `packaging/toolchain.lock.json` from the three artifacts for run `44035777845` on the Linux baseline; the hash diff is reviewed. Do not move the tag again until the hosted gate passes. | `npm run toolchain:verify`; a hosted toolchain run where `lock` and every package leg pass; a release job that creates the draft/assets. |
| **R2** | Bundled Windows installers do not place the native `ffms2.dll` beside the executable. | Reported from the RC: NSIS/MSI install, then the app exits because the loader cannot find `ffms2.dll`. The staged tree has it under `tools/lib/`; the Tauri resource map only copied the tree. | Map `dist/tools/lib/ffms2.dll` to the Windows resource root and copy it beside the portable executable. Add an installer-content assertion. | Unit/lint check on the generated config; hosted NSIS install assertion in `release-package-check.mjs`; manual launch of the installed bundled build. MSI still needs the same assertion before the release is called verified. |
| **R3** | The package legs cache the Rust workspace from the repository root, which has no `Cargo.toml`. | `Swatinem/rust-cache` logs `could not find Cargo.toml` in each package leg. It did not cause the job failure, but it makes the cache miss and hides a real error in the log. | Point the action at `rust/` (or remove it from package legs if the cache is not worth a workspace path). | A package leg log with no `cargo metadata` error; the lock gate is the actual pass condition. |

`R1`'s lock is regenerated, `R2`'s DLL placement and `R3`'s cache path are implemented; all three still need a hosted release pass.

## Workstream A — Safety and data integrity

| ID | Status | Priority | Item | Why it matters | First move / code area | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | implemented | **P0** | Splitting, merging, or modifying a Scene must delete the affected encoded chunks and clear/reset their Sequence Data. | A retained chunk made from old boundaries can be muxed into a new sequence; the user sees a successful encode with the wrong pictures. | Service scene-edit routes invalidate retained chunks and clear `sequence_data`; split, merge, add, and delete remove every chunk because scene indices move, while a range edit removes only that scene's chunk. See `rust/crates/service/src/api/routes/scenes.rs` and `rust/crates/engine/src/run/reset.rs`. | Service tests: split and merge delete retained and partial chunks and clear sequence data; range/delete covers partial invalidation and undo. A browser edit-and-run check remains advisory. |
| A2 | implemented | **P1** | Exit guard triggers when nothing is running. | Every close asks about cancelling an encode that does not exist; users learn to dismiss the guard. | `packages/ui/src/app/QuitGuard.tsx` should consult `useActiveRun()` and call `transport.quit()` directly when it is `null`. Native close interception stays in `rust/desktop-shell/src/main.rs`. | Component test: no active run closes immediately; an active run opens the dialog and does not quit until confirmed. |
| A3 | planned | **P1** | Portable installations must write projects, settings, thumbnails, logs, scratch and VapourSynth config only inside the installation directory. | A “portable” build that leaves data in AppData is not portable and can mix two copies’ state. | Introduce an explicit portable marker/launch mode and resolve one data root from the executable directory before `serve_in_with_tools`; audit every `app_data_dir()` and `std::env::temp_dir()` call in the desktop/service. The service already accepts a single `data_dir`; make the host choose it. | Integration test with a temporary install root: start, create a project, change a setting, build a thumbnail, stop; assert the root contains every file and the real app-data/temp roots contain none. Manual unzip-and-run check. |

## Workstream B — Queue, menus, and shared controls

| ID | Status | Priority | Item | Why it matters | First move / code area | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | implemented | **P1** | Queue video overflow menu also navigates to the video page. | Opening actions is impossible without losing the queue position. | `QueueRow` menu trigger stops propagation; `MenuContent` is the shared portal and already excludes controls in `OpenRow`. Add the explicit guard at the trigger, not at every menu item. | Component test: click the row action trigger and assert the row's navigation callback was not called; the menu is open. |
| B2 | implemented | **P1** | Dropdowns can extend past the viewport. | Actions at the bottom of a long menu become unreachable. | Shared `MenuContent`: `collisionPadding`, an available-height cap, and scrolling for tall menus. Keep per-caller width only. | Component test with a constrained container; visual check on the queue and scene context menus. |
| B3 | implemented | **P1** | Some expandable icon-buttons do not expand; the queue row Start button is the example. | The button looks like an icon but never reveals its label, so the control is ambiguous. | The queue row gave `RunControl` a fixed 28px grid column, so its expanding label had no room. Both row layouts now give the control an `auto` column; `TopBarActions` and `SequenceActionButton` already use the same hover and focus-visible expansion. | Component test for the compact control's group, hover, and focus-visible wiring. A narrow/wide visual check remains for review. |
| B4 | planned | **P2** | Convert inconsistent buttons to expandable icon-buttons. | Two visual languages for the same “compact action” make rows harder to scan. | After B3, replace only controls that already have a label/tooltip and fit the compact column. Do not convert primary actions where the label is the affordance. | Screen-by-screen visual review; no behavior test unless a label becomes unreachable. |
| B5 | planned | **P2** | App-wide tooltip audit. | Some controls have no hint, some repeat the label, and disabled reasons are sometimes only in `title`. | Inventory every `data-tip`/`title`/`aria-label`; verify placement, delay, keyboard reachability, and that a disabled action still explains why. Reuse `Button`'s `title` translation. | Inventory table in this document or a follow-up; accessibility scan on the main screens. |

## Workstream C — Scene editor and timeline

| ID | Status | Priority | Item | Why it matters | First move / code area | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | implemented | **P2** | Timeline thumbnails look stretched. | A distorted still makes the scene rail feel low quality and can hide letterboxing/aspect mistakes. | `SceneTimeline` now gives each still a source-aspect wrapper anchored at the block's start; the block clips a narrow wrapper instead of stretching the picture across an arbitrary width. A missing probe aspect keeps the previous full-block crop, and the rail's fixed crop stays intentional. | Component tests for the source-aspect wrapper and the unknown-aspect fallback; visual check against a 2.39:1 and a 4:3 source remains for review. |
| C2 | implemented | **P1** | Scene Detection takes minimum/maximum length in frames, not seconds derived from the input frame rate. | Users think in seconds; changing the input rate silently changes the threshold. | `SceneDetectionEditor` now receives the video's probe frame rate. At video scope it edits seconds and rounds to the nearest frame; the frame count remains visible under each field. Project and template scope keep frames because one document applies to sources with different rates. See `scene-bounds.ts`. | Unit tests for 23.976/24/25/30/60 fps; component tests that a seconds edit sends the rounded frame count and that project scope stays in frames; docs update. |
| C3 | implemented | **P2** | Scene Engine details need more information. | The panel says “Engine data” but shows only one summary line; users cannot tell which metric, encoder, or source produced it. | `SceneDetailsPanel` now renders separate read-only rows for Target quality (quantizer and probe score), Quality check, Noise (value and scale), and Chunk (bytes and retained count). `scene-aggregate` carries the quality-check and noise ranges for a multiple selection. The encoder remains its own section above; custom sequence data stays below. A row that has not run shows `—` and its reason. | Component tests for the single-scene rows, missing-data reasons, and a multi-selection range; `scene-aggregate` tests the new summaries; docs update. |
| C4 | implemented | **P2** | The scene editor's delimiter text says the character's name instead of the character. | A visible “Space” where the actual separator matters is ambiguous; tabs/newlines are worse. | `delimiter-label` reads the stored `Delimiter` without changing it, and `DelimiterReadout` renders the visible glyph beside the accessible name. The parameter popover in `ParameterValueGrid` shows the separator and its argv shape, so the scene encoder sheet and Configuration → Encoding use the same readout. The parameter sheet also preserves an existing joined delimiter when another field is edited. | Unit tests for `Space`, `Joined("=")`, tab, and newline; the readout's accessible name and glyph are checked; a descriptor edit keeps `Joined("=")`. |
| C5 | implemented | **P2** | Pinch-to-zoom does not work on Apache ECharts, and there is no dedicated harness. | ECharts' `dataZoom` is the intended gesture but the browser/runtime path is unverified, especially in the Tauri WebView. | `e2e/chart-zoom.spec.ts` drives the real analytics widget on the documentation site through Chromium: wheel, Ctrl-wheel (the trackpad-pinch path), a two-finger touch pinch over CDP, recovery after a cancelled touch, and a reload reset. The visible SVG axis labels are the assertion, so the test observes the chart rather than its option object. The existing `dataZoom` settings needed no change; a native Tauri WebView pass is still manual. | `npm run test:e2e:chart` passes all five cases and is part of `npm run test:e2e`. The Tauri WebView gesture check remains manual. |

## Workstream D — Player, overlays, and desktop presence

| ID | Status | Priority | Item | Why it matters | First move / code area | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | implemented | **P1** | Enable zooming in the Tauri app, including shortcuts. | WebView zoom is currently inconsistent with the browser and with standard desktop expectations. | `set_webview_zoom` changes the webview's own scale (not CSS page zoom), clamped to 0.5–2.0. `WebviewZoom` binds `Ctrl/⌘ +` or `Ctrl/⌘ =`, `Ctrl/⌘ -`, and `Ctrl/⌘ 0`, defers in text fields and Monaco, and stays dormant where the host has no zoom capability. The shortcut reference lists the commands. | `zoom_factor` rejects non-finite values and clamps the range; `webview-zoom` and `WebviewZoom` tests cover stepping, reset, and text-field deferral; `matchesShortcut` covers both plus keys. A native keyboard check remains manual. |
| D2 | implemented | **P2** | Fullscreen video player should put the timeline below as an auto-shrinking overlay. | Fullscreen currently loses the scrubbing context; leaving fullscreen to seek defeats the mode. | `use-fullscreen-chrome` and `ScenePlayer`: the transport is an absolutely positioned overlay in fullscreen. It starts visible, hides after three seconds without pointer movement, and reveals again on pointer movement, keyboard input, or focus; the picture fills the section behind it. Outside fullscreen the transport keeps its normal in-flow bar. | Component test covers the idle hide, pointer reveal, and focus reveal; visual review in fullscreen with a long timeline remains. |
| D3 | planned | **P2** | Allow optional metric/Engine data overlay on the `<video>`. | Users cannot see the current metric or encoder context while judging a scene. | Read the same live/durable data as `RunChip` and scene details; render a small configurable overlay with an on/off setting and a choice of fields. Do not put it in the video element's DOM; use the stage overlay so fullscreen works. | Component test for toggle and persistence; visual check in normal and fullscreen. |
| D4 | planned | **P2** | Desktop notifications for run start, finish, and error. | Long encodes finish while the user is in another application. | Use Tauri's notification plugin from the host, triggered by the existing live run events; do not notify from the browser service when no desktop host exists. Respect a setting and the OS permission state. | Host command test with a fake notifier; manual Windows notification check; verify no notification when the setting is off. |

## Workstream E — Configuration, encoders, and presets

| ID | Status | Priority | Item | Why it matters | First move / code area | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | planned | **P1** | Manually adjust every default encoder parameter: docs, widgets, min/max/step/marks, plus forks and their parameters. | A number input for CRF and missing constraints produces invalid or surprising encodes; forks are not discoverable. For example CRF should be a slider 0–70, step 0.25, default mark at 30. | Start from `capability/descriptors/catalogue/*`, `ParameterControl`, `NumberField`, and docs generation. Give every shipped descriptor a label, description, unit, range, step, default, marks, and widget; mirror the same data in `apps/website/src/gallery/encoder-parameters.json` and the docs page. Add fork descriptors through the same schema. | Descriptor lint/test: no shipped parameter lacks a description or a valid range; widget tests for step/mark rendering; generated docs check. |
| E2 | planned | **P1** | Ship default preset templates (FFMS2 540p scene detector, SSIMULACRA2 target 79–81 with subset 11 and encoder preset 6, Photon Noise ISO 200, mkvmerge concatenator). | The first run is a blank configuration; the team's working recipes are tribal knowledge. | Add them as built-in project templates, not user files. Represent the scene-detector downscale as an explicit FFMS2/VapourSynth filter chain with no 10-bit conversion; use the existing target-quality and parallel-encoder schemas. | API test that the built-ins decode into the contract; a fixture run using each; UI test that they appear once and can be copied but not deleted. |
| E3 | planned | **P1** | Template import/export. | Sharing a working recipe currently means copying files by hand. | Define a versioned JSON envelope for a project template (or a set), validate on import, strip host paths/secrets, and expose import/export in Settings → Project Templates. Reuse the release manifest's schema-version discipline. | Round-trip test; malformed/unknown-version rejection; duplicate-name policy; browser download/upload test. |
| E4 | planned | **P1** | Dependencies save buttons should use the page-level undo/redo/save/discard pattern. | Every dependency row saves immediately, unlike every other editable page; an accidental Locate/source change is hard to review. | Move writes into a draft session owned by `SettingsScreen`/`DependencyInventory`; keep probe/locate as an explicit action that returns a candidate, not a commit. Use `useDraftSession` and `DraftActions`. | Component test: changing two rows then Discard restores both; Save sends one coherent update; restart-required rows keep their warning. |
| E5 | planned | **P1** | Dependencies should list VapourSynth plugin availability (BestSource, FFMS2, DGDecNV, vszip, vship, mvutensils, etc.). | “VapourSynth available” hides whether the plugin a script needs is installed. | Extend preflight's VapourSynth probe to enumerate plugin namespaces and their source/version; add a plugin sub-list to the VapourSynth dependency row. Distinguish bundled, system, and custom Python environments. | Rust probe test against staged and empty plugin directories; UI test that each namespace has an available/missing state; docs table. |
| E6 | planned | **P2** | Consider mediainfo.js or rsmediainfo instead of `mkvmerge -J`/ffprobe. | Media probing is on the startup/add-video path and currently shells out; a library could be faster and more portable. | Spike first: compare startup latency, codec/field coverage, licensing, WASM size, and Windows/Linux/macOS behavior against the current probes. Do not replace until the existing error/field contract is covered. | Benchmark table on the same fixtures; contract parity tests for fields currently consumed; decision record. |
| E7 | implemented | **P2** | Optional sequence stages use two different enable/disable controls. | Noise Detector and Noise Scaler showed explicit Enable/Disable buttons, while Target Quality and Quality Check used switches. The same state read differently across pages, and Target Quality kept a local switch instead of the shared primitive. | The shared `Switch` now owns every optional stage header in `NoiseGenerationEditor`, `SectionEditor`, `TargetQualityEditor`, and `QualityCheckEditor`; the local switch copies and Enable/Disable buttons are gone, and each stage's seed document and locked behavior are unchanged. | New off→on, on→off, and locked-state component tests cover the noise detector and scaler, target quality and bitrate optimization, speed scaling, quality check, and the generic optional branch; the five focused files pass 17 tests and the full configuration suite passes 99. Visual review of Configuration → Sequence across project, video, and template scope remains. |

## Workstream F — Loading, state, and navigation polish

| ID | Status | Priority | Item | Why it matters | First move / code area | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | implemented | **P2** | First Monaco load should show a skeleton and not stall navigation. | The first script/JSON visit blocks the route for up to two seconds with no feedback. | Script and JSON screens already load through `lazyRouteComponent`; the four routes now carry `MonacoRouteSkeleton` as their pending component with no pending delay. The router's `intent` preload still warms the chunk on hover or focus, so a deliberate visit does not pay the first fetch. | Component test uses a deferred lazy module and proves the skeleton is replaced by the editor; the route matrix still covers the loaded states. |
| F2 | implemented | **P2** | Delimiter display ambiguity (see C4). | Cross-reference to keep one owner. | Resolved in C4. | Same as C4. |

## Workstream G — Installation and release delivery

| ID | Status | Priority | Item | Why it matters | First move / code area | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | implemented, awaiting hosted run | **P0** | NSIS/MSI installers omit `ffms2.dll`; the app does not launch. | The installed app exits before the window because the native loader cannot resolve FFMS2. | `scripts/run-tauri.mjs` maps the DLL to the Windows resource root; `scripts/collect-release.mjs` copies it beside the portable executable; `scripts/release-package-check.mjs` asserts it after NSIS install. The MSI path still needs the same content assertion. | Hosted NSIS install check; manual installed-tree launch; MSI equivalent check before release sign-off. |
| G2 | planned | **P1** | Make the portable build truly portable (A3). | Cross-reference to the data-root audit. | Resolve the data root from the install directory when portable mode is present; pass that single root to the service. | Same as A3. |
| G3 | implemented, awaiting hosted run | **P2** | Regenerate the lock from CI artifacts and fix the root-cwd Rust cache. | Release credibility and log hygiene. | R1's lock is regenerated; R3 points the cache at `rust -> ../dist/cargo`. | `lock` and all package legs green; no `Cargo.toml` error in the package log. |

## Recommended order

1. **Release gate:** regenerate the lock from the `44035777845` target artifacts (R1), finish the
   Windows FFMS2 resource fix (G1/R2), and rerun the toolchain/package gates. These are
   prerequisites for any published RC, regardless of feature work.
2. **Data safety:** A1 (scene invalidation) before shipping any scene-edit or preset work. A bug
   here is silent and produces wrong output.
3. **Small correctness batch:** A2 (exit guard), B1 (queue menu), B2 (menu bounds), C4 (delimiter
   rendering), F1 (Monaco skeleton). These are local, testable, and do not need design review.
4. **Workflow batch:** C2 (seconds), E4 (dependencies draft), E1 (encoder descriptors), E5 (plugin
   inventory). E1 and E5 are prerequisites for E2's shipped presets.
5. **Feature batch:** D1 (Tauri zoom), D2–D4 (fullscreen, overlays, notifications), E3 (template
   import/export), B3/B4/B5 (control consistency and tooltips), C1/C3 (timeline and details).
6. **Research batch:** C5 (ECharts harness), E6 (media probe), A3/G2 (portable data root) once
   the install/resource story is settled.

## Design and review notes

- `AGENTS.md` §2.12 requires a Penpot board for screen work. B1, A2, B2, C4, and F1 are local
  behavior/loading fixes, not new layouts. B3/B4, C1, C3, D2, D3, E2/E3, and E7 change visible
  surfaces; compare them with the live board or record that the board is unavailable, as the
  earlier provisional boards already do.
- Do not move the release tag again for a feature batch. The tag currently points at the commit
  whose lock is stale; resolve R1 first and get explicit approval before retagging.
- Every fix should leave a focused test. A release-only assertion is acceptable for installer
  contents, but it does not substitute for a service test on scene invalidation or a component
  test on the queue menu.
