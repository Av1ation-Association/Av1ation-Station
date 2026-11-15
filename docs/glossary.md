# Glossary

Terms used by the code, the documents, and the repository paths. A term appears here when
its meaning is narrower than its everyday use or when its location is not obvious. Terms
are grouped by domain and alphabetised within each group so a definition can be found
without scanning the whole file.

## Contents

- [Runtime and structure](#runtime-and-structure)
- [Contracts and settings](#contracts-and-settings)
- [Projects, videos, and runs](#projects-videos-and-runs)
- [Editing and presentation](#editing-and-presentation)
- [Concatenation](#concatenation)
- [Testing and evidence](#testing-and-evidence)
- [Public documentation](#public-documentation)
- [Build and delivery](#build-and-delivery)
- [Reading the top level](#reading-the-top-level)

## Runtime and structure

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Crate** | A Cargo package in the Rust workspace. | `rust/crates/*`, `rust/desktop-shell` |
| **Desktop shell** | The native Tauri process: window, single-instance plugin, dialogs, opener, permissions, and embedded service startup. | `rust/desktop-shell` |
| **Engine** | The adapter around `andean-condor`; it turns engine callbacks into structured events and owns the fake runner used by tests. | `rust/crates/engine` |
| **Engine group** | One of the four integration domains in the engine adapter: `run`, `capability`, `media`, or `script`. | `rust/crates/engine/src/<group>` |
| **Feature slice** | One UI domain folder containing its screen, components, model, and tests. | `packages/ui/src/features/<domain>` |
| **Host** | A runnable entry point that mounts the shared UI and supplies a transport. The desktop, LAN web, and website demo are the three hosts. | `apps/*/src` |
| **Package** | An npm workspace package. | `packages/*` |
| **Route-family test module** | One module under `rust/crates/service/tests/api` that holds the HTTP tests for the production route module of the same name. Shared fixtures live in `tests/common/mod.rs`. | `rust/crates/service/tests/api/<family>.rs` |
| **Runner seam** | A focused file under `run/runner/` that owns one part of the worker loop; its children remain private to the runner. | `rust/crates/engine/src/run/runner` |
| **Service** | The HTTP backend used by the desktop webview and LAN browsers: routes, state, persistence, SSE, and run supervision. | `rust/crates/service` |
| **Service group** | One of the seven feature domains in the service: `api`, `project`, `run`, `media`, `script`, `capability`, or `platform`. | `rust/crates/service/src/<group>` |
| **Transport** | The injected interface through which the UI reaches a host: HTTP/SSE, mock, or native host capabilities. | `packages/api/src/transport` |

## Contracts and settings

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Capability** | A named operation the machine can perform, independent of which provider supplies it. | preflight inventory |
| **Contract** | A Rust boundary type that derives `JsonSchema`. The schema is emitted, and the TypeScript/Zod mirror is generated. | `rust/crates/contracts` |
| **Contract module** | One of the ten public Rust modules under `rust/crates/contracts/src` that mirrors a schema group. A caller names it directly; `lib.rs` re-exports no contract type. | `rust/crates/contracts/src/<group>.rs` |
| **Generated contract** | The checked-in output of the schema → TypeScript/Zod pipeline. It is committed but never hand-edited. | `packages/contracts/src` |
| **Host-path field** | A settings row whose value is a filesystem path on the host: one draft, picker, save-or-probe lifecycle, pending state, last result, and separate field and save failures. The row supplies its value, operation, and copy; the field owns the lifecycle. | `packages/ui/src/features/settings/useHostPathField.ts`, `HostPathField.tsx`; [settings.md](screens/settings.md) |
| **Provider** | The concrete executable or runtime that satisfies a capability, such as a specific encoder or VapourSynth runtime. | preflight and Settings → Dependencies |
| **Schema document** | One emitted JSON Schema file for a boundary contract, written into its group and never hand-edited. | `schema/<group>/<file>.json` |
| **Schema group** | The feature directory under `schema/` that an emitted contract belongs to. The group is recorded beside the filename and model in the emitter's entry list, not inferred from the name. | `schema/<group>`, `rust/crates/contracts/src/bin/emit-schema.rs` |
| **Settings document** | The single `AppSettings` object stored at `<app-data>/config.json` and returned by `GET /api/settings`; it contains the general fields and the validated settings owned by other routes. | `schema/settings/app-settings.json` |
| **Settings merge patch** | A partial `AppSettingsUpdate` where an absent field keeps its stored value, a present field replaces it, and `null` clears a nullable field such as `temp_dir`. | `AppSettingsUpdate`, `PATCH /api/settings` |
| **Settings write seam** | The one `SettingsStore` path that locks, loads, applies, and saves `<app-data>/config.json`; every settings writer uses it. | `rust/crates/service/src/project/settings.rs` |
| **Writable settings field** | A field in `AppSettingsUpdate`; custom tools, templates, forks, and other settings with their own routes are not writable through the merge patch. | `rust/crates/contracts/src/settings.rs` |

## Projects, videos, and runs

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Attempt** | One sequence record in a video's timeline; History lists attempts inside their run. | `docs/data-model.md` §6.1 |
| **Control refusal** | A Start or Stop request the service rejects before it changes the video's run state, such as a held lock or an unmet prerequisite. It is distinct from a **Run** failure, which is a run that began and ended badly. | run routes, `packages/ui/src/features/{videos,configuration,projects}`; [frontend.md](frontend.md#11-error-and-empty-state-design) |
| **Project** | A named collection with a queue of videos and one shared configuration document. | service storage, `project.json` |
| **Run** | One encode execution and its append-only event/log timeline. | `rust/crates/service/src/run/runs/` |
| **Run failure** | A run that began and ended badly. The latest run-level failure is attached to the video's derived state and names the sequence it failed at when the run reached one; a failure before the first sequence names none. It is distinct from a **Control refusal**, which changes no run state. | `VideoFailure`, `docs/data-model.md` §6.1 |
| **Run outcome** | The contract's five-value `RunOutcome`. `unknown` means the log predates the run-level timeline record, not an unrecognized terminal record. | `schema/run/run-outcome.json`, `packages/contracts/src` |
| **Run presentation** | The shared outcome label and tone, run timestamp, and elapsed-seconds calculation used by History, Logs, and the delete dialog. Known-duration formatting belongs to **Duration presentation**. | `packages/ui/src/shared/model/run-presentation.ts` |
| **Scene** | A frame range detected within a video; the unit of chunk output, preview, and scene-local edits. | engine model, `packages/ui/src/features/scenes` |
| **Sequence** | One engine pipeline stage such as Scene Detection, Encoding, or Target Quality. | `rust/crates/engine`, `packages/ui/src/features/configuration` |
| **Terminal record** | The run-level timeline entry (`sequence: null`) that closes a run and carries its terminal message. | `docs/data-model.md` §6.1 |
| **Unrecognized outcome** | A terminal timeline record whose outcome is outside `completed`, `cancelled`, and `failed`; History shows `Unknown`. | `packages/ui/src/shared/model/history-model.ts` |
| **Unrecorded outcome** | A run with no run-level timeline record; Logs shows no outcome chip. | `packages/ui/src/shared/model/run-presentation.ts` |
| **Validation blocker** | A reason a video's current configuration cannot start: missing source, unwritable path, missing capability, plugin problem, or insufficient space. It is shown before Start and is distinct from a **Control refusal**. | `VideoValidation.blockers` |
| **Video** | A queued source file with materialised input/output documents and optional configuration overrides. | service storage |

## Editing and presentation

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Clock parts** | The normalized hour/minute/second/remainder decomposition shared by duration presentations and frame timecode. Rounding happens before the split, so a minute boundary never renders `:60`. | `packages/ui/src/shared/clock.ts` |
| **Design token** | A CSS custom property sourced from the Penpot token document and shared by UI and charts. | `packages/ui/src/styles.css` |
| **Draft** | An unsaved configuration edit; it is client state until the server accepts a whole-resource write. | `packages/ui/src/shared/useDraftHistory.ts` |
| **Draft adapter** | The project-, video-, or General-specific functions that turn a server document into a draft and a draft back into a save payload; they keep inheritance and whole-part replacement out of the session. | `buildDraft`/`mergeDraft`, `sectionDraft`/`mergeSectionOverrides`, `generalDefaultsPayload` |
| **Draft identity** | The route/document key for a draft, such as project plus section or video plus section. A change of identity resets the session; a refetch of the same identity does not discard a dirty draft. | route params; [frontend.md](frontend.md#5-draft-undoredo-and-save) |
| **Draft session** | The one client lifecycle for one editable configuration document: history, saved baseline, dirty and change list, navigation guard, save/discard transition, and top-bar actions. | `useDraftSession`, `packages/ui/src/shared` |
| **Duration presentation** | One seconds value written for one reader: scene length, chart value, run length, ETA, worker hold, or clip duration. Each reader has a named policy; absence and zero are contextual, not one universal format. | `packages/ui/src/shared/duration.ts` |
| **Frame query** | The scene rail's find grammar: a bare integer is a frame; `SS.s`, `MM:SS.s`, and `HH:MM:SS.s` are timecodes; an out-of-range query is refused rather than clamped. The player's Timecode field stays clock-only, and its Frame field is separate. | `packages/ui/src/shared/format.ts`, `SceneRail.tsx`; [preview.md](preview.md#42-scene-editing) |
| **Host capability** | An optional transport operation supplied by a host, such as a picker or media URL. Absence is a supported host, not an error. | `packages/api/src/api/host.ts` |
| **Invalidation stack** | A named set of cache keys refetched together after a mutation. | `packages/api/src/api/invalidate.ts` |
| **Playback clock** | The preview player's time readout when the frame rate is unknown; a position, not a duration. | `packages/ui/src/shared/format.ts` |
| **Query key** | The array that identifies a TanStack Query cache entry; invalidation matches it by prefix. | `packages/api/src/api/keys.ts` |
| **Saved baseline** | The last server-accepted draft value. Dirty and the guard compare against it, never against the query cache; it advances only after a successful save. | draft session; [frontend.md](frontend.md#5-draft-undoredo-and-save) |
| **Timecode** | A frame position written as a clock, not a duration. `formatTimecode` writes it; the player's Frame field is the explicit frame entry. | `packages/ui/src/shared/format.ts` |

## Concatenation

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Attachment addition** | A new file attached to the output by path, distinct from an attachment copied from the source container. | `MkvmergeConfig`, `FfmpegConfig`; [video.md](screens/video.md#concatenation-workbench) |
| **Encoded video row** | The locked output video track formed by the encoded scenes. It is not a source-video replacement and cannot be dropped from this screen. | `ConcatInventory`; [video.md](screens/video.md#concatenation-workbench) |
| **Source details** | The read-only chapters and global metadata of a video's source, read on demand for display. It is independent of the selected muxer and distinct from the **Source inventory**; it is never persisted. | `ConcatSourceInfo`, `ConcatSourceDetails.tsx` |
| **Source inventory** | The selected muxer's own report of a source file's streams, attachments, and chapters. It is read-only input to the track map, never persisted. | `ConcatInventory`; [video.md](screens/video.md#concatenation-workbench) |
| **Track map** | A method's per-source selection and overrides, keyed by that muxer's own identifiers. `null` means copy every selectable source track. | `SceneConcatenatorConfig.method.*.tracks`; [video.md](screens/video.md#concatenation-workbench) |
| **Unmatched override** | A saved track-map entry whose key the latest source inventory does not report. It is retained and removable instead of being applied to another row. | concatenation model; [video.md](screens/video.md#concatenation-workbench) |

## Testing and evidence

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Boundary schema** | A contract type that crosses an API boundary as a hook response or a top-level request body. Nested schemas are covered through their parent boundary. | `packages/contracts/src/boundaries.ts`, `packages/contracts/src/fixtures/boundary/` |
| **Error-path row** | One failure mode from architecture §6 with recorded evidence: an automated test at a named layer, or a named manual release check. | [testing.md](testing.md) |
| **Four-state certification** | The automated per-route-family evidence that loading, empty, error, and populated states exist. A structurally impossible state is recorded as `N/A` with its reason. | [testing.md](testing.md) |
| **Screenshot gallery** | The deterministic, both-theme, no-encode image set for every catalogued surface, with AVIF images, a catalog, and a contact sheet. | `e2e/screenshots/`, `dist/screenshots/` |
| **Feature screenshot manifest** | The optional subset written for release notes when a feature run selects one group or screen id. | `dist/screenshots/feature-screenshots.json` |
| **Route family** | One path registered in `ROUTE_META`; dynamic section values share the family. It is the unit of four-state certification. | `packages/ui/src/app/route-meta.ts` |

## Public documentation

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Capture** | One deterministic screenshot case in the gallery catalog, rendered in both themes. | [website-docs.md](website-docs.md#8-screenshot-inventory), `e2e/screenshots/catalog.ts` |
| **Crop** | A native-scale region cut from a capture for one documentation figure; never a resized application window. | [website-docs.md](website-docs.md#84-figure-rules) |
| **Docs manifest** | The typed index of public pages, live slots, and search metadata that the build checks against the page inventory. | [website-docs.md](website-docs.md#9-authoring-routing-and-search) |
| **Figure** | One capture or live component presented with alt text, a caption, and optional DOM annotations. | [website-docs.md](website-docs.md#84-figure-rules) |
| **Focused sample** | A production component, or a small set of them, mounted in a docs page under only the provider, router, or demo context its described action needs. | [website-docs.md](website-docs.md#7-live-content) |
| **Live widget** | One real UI component mounted inline in a docs page with fixture data, without the application shell. | [website-docs.md](website-docs.md#7-live-content) |
| **Page** | One public `/docs/...` URL and its single MDX body. | [website-docs.md](website-docs.md#4-page-inventory) |
| **Reference page** | Lookup material for one application surface or configuration area, with no ordered task. | [website-docs.md](website-docs.md#6-reference-inventory) |
| **Task page** | A Get started tutorial or a Guide, with an outcome, ordered steps, a result, and a recovery path. | [website-docs.md](website-docs.md#5-task-page-inventory) |

## Build and delivery

| Term | Meaning | Primary location |
| --- | --- | --- |
| **Build output root** | The one ignored tree for generated artifacts: Cargo target, host builds, toolchains, caches, coverage, and test reports. | `dist/` |
| **Build provenance attestation** | A keyless GitHub attestation binding an artifact digest to its repository, commit, workflow, and builder. It is not a code signature. | GitHub Actions attestations; [releases.md](releases.md#transparency) |
| **Dev toolchain cache** | A real-file copy of the staged toolchain used by `npm run dev`; it mirrors the release tree and survives `cargo clean`. | `dist/dev-tools/`, `scripts/dev-tools.mjs` |
| **Generated artifact** | A file produced by a build or contract step, such as `schema/<group>/*.json`, generated contracts, or lockfiles. | `schema/`, `packages/contracts/src`, `rust/Cargo.lock` |
| **Kache store** | The optional local Rust compiler cache, capped at 8 GiB. It is regenerable and is not part of the repository. | configured `KACHE_CACHE_DIR`, `.cargo/config.toml` |
| **Release channel** | One of the weekly, release-candidate, or stable publication lines. Weekly tests are not a channel. | [releases.md](releases.md#channels) |
| **Release output** | Locally built installers and archives. The expanded portable tree and Tauri debug copies are transient. | `dist/release` |
| **Service build cache** | A debug `av1ation-service` binary keyed by the Rust sources and lockfile, so an unchanged checkout can restore it after `clean:target`. | `dist/cache/service/`, `scripts/build-service.mjs` |
| **Staged toolchain** | The release-pruned `tools/` tree that a release bundle installs under `<resources>/tools`. | `dist/tools`, `scripts/stage-tools.mjs` |
| **Toolchain lock** | The generated per-target record of every component's immutable source, artifact URL, SHA-256, size, and install path. | `packaging/toolchain.lock.json`; [releases.md](releases.md#toolchain-lock-gate) |
| **Unsigned release** | A release with no Authenticode signature, Developer ID, or notarisation ticket; it must carry explicit labels and hash verification instructions. | [releases.md](releases.md#unsigned-distribution) |
| **Updater signature** | A project minisign signature over an update manifest and artifact, independent of OS code signing and used only on the stable channel. | `plugins.updater`; [releases.md](releases.md#update-policy) |
| **Weekly release** | An automatically published, tagged prerelease from a weekly code change; it has no updater entry and is retained for a limited window. | [releases.md](releases.md#channels) |

## Reading the top level

- `rust/` — every Rust crate and the native desktop shell.
- `apps/` — runnable JavaScript hosts only.
- `packages/` — shared TypeScript libraries.
- `dist/` — generated build output only; see the **Build output root** entry above.
- `docs/` — normative architecture, guides, plans, and decisions.
- `design/` — Penpot source and generator scripts.
- `e2e/`, `schema/`, `scripts/` — cross-cutting test, contract, and tooling inputs.
  Fixtures live beside the test that reads them; media is generated, not committed.
