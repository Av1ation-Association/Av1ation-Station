# Decisions

Architecture Decision Records. Every entry is a decision that constrains the
implementation. If something is not here, it is not decided.

Status values: **Accepted**, **Accepted (assumption)**, **Proposed**, **Superseded**.

---

## D1 — Rewrite on a clean orphan branch, `condor`

**Status:** Accepted

**Context.** The previous Electron application is committed at `fb44b60` with ~168 files of
history. Three options existed: a new repository, a fresh commit in this one, or an orphan
branch.

**Decision.** An **orphan branch `condor`** with no shared history, carrying only the new
tree. `main` is left untouched at `fb44b60` so the Electron history stays recoverable.

**Rationale.** A fresh commit in the same history means every future `git log` shows 168
files of deleted Electron code, and every bisect walks through it. A new repository loses
issue and release continuity. An orphan branch gives a clean history for the new application
while keeping the old one reachable on `main`.

**Migration path** (executed by the repository owner on GitHub, in this order):

1. Archive the old branches — `main` stays as-is locally; no archive branch is created
   because `main` itself is the archive.
2. Switch the GitHub default branch to `condor`.
3. Rename `main` → `av1an-electron`.
4. Rename `condor` → `main`.

**Consequences.** Until step 4, the default branch name differs from the eventual one, so
CI config and documentation must not hardcode `main`. Local clones need
`git checkout condor` explicitly.

**Rejected.** New repo (loses issue/release continuity); same-history commit (permanently
noisy log); orphan branch *replacing* main immediately (loses the safety of having the old
tree on the default branch during transition).

---

## D2 — Link `andean-condor` as a pinned git dependency

**Status:** Accepted (assumption A9; dependency mechanics refined by D30)

**Context.** `andean-condor` is a workspace member of `BoatsMcGee/Av1an`, not a published
crate (`av1an 0.5.2` on crates.io is the legacy crate). The previous app shelled out to
the CLI and scraped files.

**Decision.** Depend on it as a library via `git` at a pinned `rev`. Its path-sibling
metric crates resolve from the same source; D30 records how the transitive branch
dependencies are pinned.

**Rationale.** The whole point of the rewrite is structured data instead of scraped text.
A CLI sidecar would work, but it would re-inherit every failure mode the retrospective
documented: unattributed errors, no scene data, no cancellation semantics, and an extra
process to package per platform.

**Upstream merge.** Av1an upstream will eventually merge or replace its `master` branch.
When that happens the pinned `rev`, the two transitive branch pins and `Cargo.lock` move
in the same commit. Until then, pinning to a commit is the only stable option — a branch
reference would let an upstream push change our build without warning.

**Consequences.** Build depends on an unreleased repository; the lockfile and branch pins
must be maintained in lockstep. If upstream restructures, the fallback is vendoring (§
[backend.md](backend.md#2-the-engine-dependency)).

**Rejected.** CLI sidecar (the thing we are escaping); `av1an` 0.5.2 (wrong generation,
different API, lacks the sequence model); fork-and-publish to a private registry (needs
infrastructure before the first line of code).

---

## D3 — npm workspaces monorepo

**Status:** Accepted

**Decision.** npm workspaces with `apps/{desktop,web,website}` and
`packages/{contracts,api,ui,config}`, plus a Cargo workspace with
`crates/{contracts,engine,service}`.

**Rationale.** Three UI hosts sharing one component library, one API layer, and one set of
contracts. Alternative package managers (pnpm, yarn) are faster, but npm is what Tauri's
tooling and the CI images assume, and the dependency graph is small enough that workspace
protocol support (`workspace:*`) is not needed.

**Consequences.** Everything shares one hoisted `node_modules`; version conflicts surface
as a single resolution, which is a feature here. Publishing packages to a registry is not a
goal.

**Rejected.** Turborepo/Nx (adds a build orchestrator we do not need at three apps); pnpm
(better, but the Tauri templates and docs assume npm — revisit if install times become
painful).

---

## D4 — axum embedded in the Tauri process

**Status:** Accepted

**Decision.** A single `axum` router serves the SPA, the API, SSE events, and preview
streams. It binds loopback always, and the LAN interface only when the user enables it.

**Rationale.** The desktop webview and a LAN browser must resolve to the same code, or the
"one UI, no drift" requirement is unachievable. Tauri IPC cannot be reached by a browser, so
HTTP is the common denominator. Running the server in-process avoids a second binary, a
second lifecycle, and a second state store.

**Consequences.** The desktop app talks to its own localhost, which is a small and
well-understood cost. It also means E2E tests can run against a headless build of the same
router — a large testing win, and the reason native-driver testing is unnecessary.

**Rejected.** Tauri-IPC-only (breaks LAN); separate server process (sidecar redux);
WebSocket-only (SSE is simpler for one-directional progress and preview needs plain HTTP
range anyway).

---

## D5 — Fragmented MP4 in a `<video>` element for preview

**Status:** Accepted (assumption A4, gated by spike S2)

**Decision.** Preview streams are fragmented MP4 served over HTTP with range support and
played by the browser's native `<video>` element. No `mpv`, no `libmpv`, no native window.

**Rationale.** The requirement that live preview work in a browser forces a
browser-playable transport. Embedding `mpv` renders into a native surface that a remote
browser cannot see, so it would create a second preview implementation — exactly the
divergence the project is trying to prevent. fMP4 gives seeking and buffering for free.

**Consequences.** Preview latency is bounded by fragment production rather than a live
pipeline; a prepared-range model is required (see [preview.md](preview.md)). If S2 fails on
a platform, this decision is revisited with an ADR — not quietly worked around.

**Rejected.** mpv/libmpv (cannot serve browsers); WebRTC (signalling, codec negotiation,
proxy-hostile, too complex); HLS (manifest overhead for no gain on a LAN); MJPEG for
everything (no seeking, poor quality per byte).

---

## D6 — Tailwind CSS v4 + a headless component layer

**Status:** Accepted

**Decision.** Tailwind v4 via `@tailwindcss/vite`, with headless primitives vendored into
`packages/ui` and edited in place; `class-variance-authority`, `tailwind-merge`,
`lucide-react`.

**Rationale.** The UI is dense and custom: a virtualized scene list, a config form generated
from a schema, charts, an embedded editor. A component kit with its own theming system
(MUI, Mantine, Chakra) would fight both Tailwind and that density. A headless layer gives
accessible behaviour with code we own, which matters for the animation and accessibility
requirements.

**Which headless layer — Radix or Base UI.** Both are unstyled, accessible, and composable.
The deciding factor is **how little custom component code we have to write**, because that
is the tech-debt surface:

| Consideration | Radix | Base UI |
| --- | --- | --- |
| Maturity / ecosystem | larger, longer track record, more examples | newer, smaller ecosystem |
| Component coverage | broader (more primitives out of the box) | narrower, but covers what we need |
| Customisation model | `asChild` composition; parts are explicit | CSS-variable-driven; fewer wrapper nodes |
| Bundle weight | moderate | lighter — fewer DOM nodes per component |
| Styling ergonomics with Tailwind | well-trodden, many examples | designed around CSS variables, which suits our token file |
| Risk | low | newer API, fewer battle-tested patterns |

**Decision: Radix, with Base UI as the documented fallback.** Radix wins on coverage and
ecosystem maturity, and the components we need most (dialog, popover, select, tabs, tooltip,
switch, slider, scroll-area) are all stable there. Base UI is the better long-term bet on
weight and DOM simplicity, and we revisit it once it has a comparable primitive set.

**Minimising custom components** is the actual goal, so the rules are:

1. **Never write a component that a headless primitive already covers.** Before adding
   anything to `packages/ui/src/components/`, check the primitive list.
2. **Vendor, don't wrap.** We copy the primitive source in and edit it, rather than building
   a wrapper layer that has to track upstream API changes.
3. **One component per interaction pattern.** A "field row" is one component used by the
   config renderer, the override editor, and the settings screen — not three.
4. **The config renderer is the only schema-driven surface.** Everything else is ordinary
   composition.

**Consequences.** We own the component code, including its bugs. Upgrades are manual diff
and merge rather than a version bump. Accepted: the component count we need is small
(~25).

**Rejected.** MUI (heaviest, opinionated theming); Mantine (good, but a second styling
system alongside Tailwind); Chakra (v3 migration churn); Headless UI (fewer primitives than
Radix); CSS Modules (loses the utility-driven consistency the design tokens depend on).

---

## D7 — `schemars` → JSON Schema → generated TypeScript + Zod

**Status:** Accepted

**Decision.** All boundary types derive `schemars::JsonSchema` in `crates/contracts`. A
binary emits committed JSON Schema; a generator produces committed TypeScript types and Zod
validators. CI fails on drift.

**Rationale.** An encoder's parameter set differs per encoder and per fork, so a
hand-maintained metadata file plus hand-maintained matching types is wrong for any build
its author did not test, and its wrongness surfaces at runtime rather than at compile time.
The engine already derives `JsonSchema` on every model, so this is nearly free. It also
makes the configuration form schema-driven, which means a new upstream encoder appears in
the UI without a frontend change.

**Consequences.** Generated files are committed and reviewed. A Rust model change is a
two-step commit (change + regenerate), enforced by CI.

**Rejected.** `ts-rs` (generates types only, no JSON Schema, so no schema-driven forms and
no Zod); `tauri-specta` (Tauri-IPC-oriented, and we do not use IPC for data);
hand-written types (cannot track encoder forks); OpenAPI-first with a spec as the source of
truth (means maintaining the spec by hand or generating a much larger artifact than we
need).

---

## D8 — ESLint + Prettier + npm scripts

**Status:** Accepted

**Decision.** ESLint 10 with `typescript-eslint` as a flat config in `packages/config`,
Prettier 3, and plain npm scripts wired into CI. TypeScript pinned to 6.x because
`typescript-eslint` does not yet accept 7.x.

**Rationale.** Ubiquitous, Tauri-template-compatible, and requires no task runner. The repo
is small enough that `npm run -ws` is sufficient orchestration.

**Consequences.** No remote caching; CI re-lints everything. Acceptable at this size.

**Rejected.** oxlint/oxfmt (much faster, but plugin coverage for the React and import rules
we rely on is incomplete — worth revisiting); Biome (single tool is attractive, but its
ESLint compatibility layer is not full); Nx/Turborepo (see D3).

---

## D9 — Server state in TanStack Query; Zustand only for ephemeral UI state

**Status:** Accepted

**Decision.** All server-derived data lives in TanStack Query's cache. SSE events write into
that same cache via `setQueryData`. Zustand holds selection, panel sizes, and the config
draft; `zundo` provides undo/redo for the draft.

**Rationale.** Progress events and REST reads must not fight over ownership of the same
data. One cache with two writers has a single source of truth and no synchronisation code.
The retrospective's "pure business logic outside components" principle pushes the rest into
`packages/api`.

**Consequences.** Cache keys become an API of their own and must be centralised. No
duplicating server data into Zustand — that rule is in AGENTS.md §5.

**Rejected.** Redux Toolkit (more ceremony, and RTK Query duplicates Query); Zustand-only
(hand-rolled caching and invalidation); SWR (less capable mutation/optimistic-update
surface); no data library (the status quo that produced the previous app's sync bugs).

---

## D10 — Testing pyramid with a headless HTTP target; screenshots in CI as artifacts

**Status:** Accepted (assumption A3)

**Decision.** `cargo test` with a fake `EncodeRunner`; Vitest + RTL with a `MockTransport`;
Playwright against a headless build of the same router. Screenshots are **generated in CI
and published as build artifacts for human review**, but they **never gate a merge**.

**Rationale.** The retrospective's finding was that `tauri-driver` cost ~10 commits and was
abandoned, and that pixel comparison on shared runners produced false failures. Testing the
HTTP surface gets real integration coverage in a normal container.

The screenshot half of that conclusion is now **outdated for this project**. The previous
app could only be screenshotted through the native webview, which is why pixel diffing was
unreliable. Here the UI is a browser app served by our own axum router, so Playwright can
drive it in a normal container with a pinned browser version. That makes deterministic
screenshots achievable.

What we still do **not** do is gate merges on pixel equality. Font rendering, subpixel
antialiasing, and GPU rasterisation still differ across runner images and across Playwright
upgrades, so a pixel gate would fail on dependency bumps and be ignored — which is worse
than no gate. Generating them as artifacts keeps the visual record without the false
failures.

**Consequences.** No automated coverage of native-webview specifics (drag-and-drop, native
dialogs). Those are covered by a manual release checklist. Screenshots cost CI time and
produce artifacts humans must actually look at.

**Rejected.** `tauri-driver`/WebDriver (proven unworkable); Electron-for-Tauri test harnesses
(not a thing); pixel-diff gating in CI (maintenance sink, see rationale).

---

## D11 — Package naming and module boundaries

**Status:** Accepted

**Decision.** Rust crates are `av1ation-engine`, `av1ation-contracts`, `av1ation-service`.
npm packages are `@av1ation/contracts`, `@av1ation/api`, `@av1ation/ui`, `@av1ation/config`.

**Rationale.** Prefixing npm packages avoids collisions with a future publish and makes
imports self-documenting. Crate suffixes describe the layer (`-service` is the transport,
`-engine` is the integration).

---

## D12 — GPL-3.0 for the combined work

**Status:** Accepted (assumption A8)

**Context.** `andean-condor` is GPL-3.0. Statically linking it into the application makes
the combined work a derivative.

**Decision.** The application is distributed under GPL-3.0, with the source available in
this repository and a license notice in the About screen.

**Consequences.** The application cannot be relicensed permissively; distributing binaries
requires offering source. This is consistent with the upstream project and with the
application's nature.

---

## D13 — No multi-window, no multi-document

**Status:** Accepted (assumption A6)

**Decision.** One window on desktop. Everything else is a route.

**Rationale.** The single-encode-at-a-time invariant, the navigation guard, and the LAN
session model all become substantially harder with multiple windows: a window can be closed
mid-encode, a second window can attempt a second encode, and window-scoped state has no
equivalent in a browser tab. Every requirement in the brief is satisfiable with routes.

**Consequences.** Users cannot watch a log in a separate window. Mitigated by a route-level
log view and the command palette.

---

## D14 — LAN auth via a bearer token and pairing code, no accounts

**Status:** Accepted (assumption A7)

**Decision.** LAN mode generates a token, delivers it for pairing, requires it on every
non-static route, and uses short-lived tickets for SSE.

**Rationale.** There are no users to authenticate, so an account system would add database,
login UI, password reset, and recovery for zero benefit. A per-run token is the smallest
mechanism that stops a passive LAN neighbour, which is the actual threat.

**Pairing: QR code *and* shortcode.** Two delivery mechanisms, because they serve different
situations:

| Method | When it is better |
| --- | --- |
| **QR code** | the user has the desktop app on screen and a phone in hand — scan and go |
| **Shortcode** | the user is typing on a keyboard (desktop browser, laptop, TV remote), or the QR is unreadable because the window is small or the screen is shared |

The shortcode is a short human-transcribable string derived from the token — 8 characters
from an unambiguous alphabet (no `0`/`O`, `1`/`I`/`l`), grouped like `ABCD-EFGH`. It is
**not** a second secret: it is an encoding of the same token, so it carries the same
authority and expires on the same schedule. The pairing screen shows both, and the browser
accepts either.

Flow:

1. User enables LAN mode. The app shows the bound address, a QR code, and the shortcode.
2. Phone scans the QR → URL carries the token in the fragment → SPA moves it to
   `sessionStorage` and strips the fragment.
3. Keyboard user types the shortcode into the browser's pairing field → the browser
   exchanges it for the token via `POST /api/pair` → same result.
4. Both paths end with the token in `sessionStorage`, used as a bearer header thereafter.

The shortcode adds no new attack surface beyond the token itself, and it removes the most
common failure mode of QR-only pairing: a user who cannot scan and has no way to type a
256-bit string.

**Consequences.** Anyone with the token is fully authorized; stated plainly in the UI. Token
rotation is the recovery path. TLS is deliberately not provided.

**Rejected.** No auth at all (the whole LAN becomes an unauthenticated RCE surface via encode
routes and script editing — unacceptable); mTLS (certificate distribution for a phone browser
is worse UX than a token, and we would still be self-signed); OAuth/accounts (infrastructure
for no users).

---

## D15 — Single-instance application

**Status:** Accepted

**Decision.** The Tauri `single-instance` plugin focuses the existing window instead of
starting a second process.

**Rationale.** Two processes would both try to own the app-data directory, both could bind
HTTP ports, and both could start an encode. Enforcing one process makes the singleton
invariant structural rather than defensive.

---

## D16 — No telemetry; user-initiated anonymised log export only

**Status:** Accepted

**Decision.** The application makes no unsolicited network requests. Diagnostics are exported
by the user, after anonymisation.

**Rationale.** A local video tool has no legitimate need for usage analytics, and the log
contents are the most privacy-sensitive artifact in the system (paths, filenames, hostnames).
Collecting them implicitly would be a defect, not a feature.

---

## D17 — Widget type is a separate axis from value type

**Status:** Accepted

**Decision.** `ParameterDescriptor` carries both `kind: ParameterKind` and
`widget: Widget`. `Widget` is `Auto`, `Slider`, `NumberInput`, `ChoiceInput`,
`TextInput`, `Toggle`, `PathPicker`, `DurationInput`, or `CollectionInput`, and is chosen
per parameter. `Choice.value` is a typed `Value`, not a string. A single- or multi-select
is the same `ChoiceInput`; cardinality lives in `ChoiceSpec.multiple`.

**Rationale.** A value's type and constraints do not determine how it should be edited. CRF
is a number best edited with a slider; a frame count is a number that needs a plain input;
SVT-AV1's `--tune` is numeric on the command line but a labelled choice to a human (`0` =
VQ, `1` = PSNR, `2` = SSIM). Deriving the control from the type alone produces the wrong
control for all three. Once choices carry typed values, the old `LabelledNumber` widget is
redundant: `--tune` is a `Choice` of numbers rendered segmented, not a separate value kind.

**Consequences.** An over-long or misordered option set can force `Radio`, `Segmented`, or
`Dropdown`; the default `Auto` uses four options as the threshold. A widget whose declared
kind cannot support it (a `Slider` without `min`/`max`) is a descriptor error rejected at
load, not a broken control at render. `LabelledNumber` is removed from the contract, which
is a schema version bump.

**Rejected.** Deriving the widget from `ParameterKind` plus constraints (gets CRF wrong and
cannot express ordered labels); separate `Select` and `MultiSelect` widgets (duplicates
every renderer branch; cardinality is a property of the choices); keeping `LabelledNumber`
now that choice values are typed (two shapes for one concept). Letting the frontend decide
per field (scatters the same decision across many components).

---

## D18 — User encoder definitions are JSON with a published `$schema`

**Status:** Accepted

**Decision.** A user-added encoder is described by `encoders/<id>.json` under app-data,
carrying `"$schema": "https://av1ation.app/schema/encoder-definition.schema.json"`.

**Rationale.** The file is authored by users and must be validated in their editor, not only
at load time. A `$schema` key gives completion, inline documentation, and validation for the
widget and constraint vocabulary, which is the part most likely to be wrong. TOML has no
equivalent, so a TOML file means authoring blind and discovering mistakes when the app
refuses to load it.

**Consequences.** The schema document is emitted by the contracts pipeline and published
alongside the app. An invalid definition is reported with the failing schema path and the
encoder is excluded rather than half-loaded.

**Rejected.** TOML (no `$schema`, no editor support); requiring hand-written JSON Schema
(too steep); no user extensibility (cannot track encoder forks).

---

## D19 — Chunks are retained by default; deletion is opt-in

**Status:** Accepted

**Decision.** `delete_chunks_on_success` defaults to `false`. Encoded scene chunks survive a
successful run unless the user opts in, and an explicit per-video action deletes them.

**Rationale.** Retained chunks are what make two workflows possible after an encode has
finished: running Quality Check on the produced output, and editing a few scenes then
re-running Parallel Encoder for only those scenes. Deleting them makes both impossible
without re-encoding the whole video. The cost is disk space, which is visible and
reclaimable; the cost of deletion is unrecoverable work.

**Consequences.** The UI shows retained-chunk size per video and offers explicit deletion.
Free-space checks account for retained chunks. No sequence deletes chunks as an incidental
step.

**Rejected.** Delete on success (destroys the two workflows above); a per-run prompt (asks
the same question repeatedly and trains the user to dismiss it).

---

## D20 — Design is finalized in Penpot before screen implementation

**Status:** Accepted

**Decision.** Every screen has an approved Penpot board set before its implementation tasks
start. The board set and handoff ritual are specified in
[frontend-penpot.md](frontend-penpot.md). Penpot is self-hostable under MPL-2.0, stores
tokens in W3C DTCG format, and exposes its Plugin API to the Penpot MCP server, so the
design file is a first-class repository artefact rather than an opaque external document.

**Rationale.** Configuration surfaces dominate this application, and the Project and Video
screens render the same field set with different provenance. Getting that hierarchy wrong in
the design file costs one board edit; in code it costs a component rewrite plus a retest of
every inheritance path. Dense stateful layouts and the motion budget are likewise cheaper to
resolve by looking at them. DTCG tokens make the design file and the Tailwind theme the same
data, so neither can drift.

**Consequences.** The design gate is an entry criterion in
[plan/03-ui.md](plan/03-ui.md), not a parallel track. A layout change discovered during
implementation returns to the design file first. Boards are drawn in the dark theme, which
is the application default.

**Rejected.** Descriptions plus implementation (defers layout decisions to the most
expensive place to make them). A proprietary hosted design tool (its plan limits cap pages
per file and cap automation calls, and its file format is not inspectable, so the design
file cannot be audited or regenerated from the repository).

---

## D21 — Brushed aluminium is a structural finish, not a brand texture

**Status:** Accepted

**Decision.** Chrome surfaces — title bar, navigation rail, toolbar, inspector headers,
panel edges — carry a brushed aluminium finish. The dark theme uses an **anodised** reading:
a near-black dyed body (`#0b0e12` at the core) with a single bright specular chamfer along
the top edge. The light theme uses a **mill finish** reading: a cool desaturated silver
ramp from `#c6ced8` to `#ffffff`. Both are vertical linear gradients with a 1px horizontal
grain overlay at ±3% luminance, a 1px top catch-light, and a 1px bottom shadow.

Interactive fills do not carry the finish. Primary buttons, focus rings, active navigation
items, and status colours keep the accent palette, so a control never depends on a texture
to read as pressable or focused.

**Rationale.** A metallic finish supplies the material identity the user asked for while
staying neutral enough to sit behind dense configuration surfaces. Confining it to chrome
keeps the one property that matters for a tool that encodes video — that state is legible —
from competing with a texture. Anodising rather than a lighter metal in the dark theme also
prevents large chrome areas from lifting the surface luminance and washing out the
near-black content region the rest of the palette is built around.

**Consequences.** `finish.metal.*` tokens exist in both semantic sets. Boards under
`Foundations / Finishes` are the reference rendering; the CSS equivalent is a repeating
linear-gradient over the body gradient. The finish never appears in an SVG or raster asset,
so it inherits theme changes.

**Rejected.** Aluminium on every surface including buttons and inputs (texture competes with
state colours and reads as noise at form density). A photorealistic metal texture (does not
theme, does not scale across the theme switch, and cannot be expressed as tokens).

---

## D22 — Global navigation is a 56px top bar; there is no sidebar

**Status:** Accepted

**Context.** Earlier boards drew a 232px persistent sidebar with Home, Settings, About and
recent projects. It reserved that width on every surface, including the project and video
screens where the current project is the only thing the user is working on. Once a project
is open, the other destinations are not the task, and the page title plus the sidebar's
active row duplicated the same orientation twice.

**Decision.** The application shell is one 56px bar: the mark at the left (a link to
Projects), the breadcrumb next to it, and three icon actions at the right — search, command
palette, Settings. There is no global sidebar. Home is the hub for projects, About and
documentation; Settings is always one control away in the bar and in the application menu;
About is reachable from Home's footer and from Settings → About. The project screen owns a
**local** 232px section rail for its configuration sections and queue. Every project
section screen repeats that same local rail, with the current section active, so one
navigation model covers the overview and the screens below it. The rail is not global
navigation.

**Rationale.** Reclaiming 232px is material on the densest screens, but the stronger reason
is hierarchy: a selected project should read as the work surface, not as one item in a list
of places. A bar plus breadcrumb gives orientation and a route home without keeping every
destination permanently visible. It also deletes a whole class of states — collapsed rail,
nav-item hover/active, recent-project rows — that had to be designed and tested on every
surface.

**Consequences.** Global surfaces (Home, Settings, About) are drawn with the bar and
content that starts at the window gutter. Project and Configuration surfaces reserve the
232px local rail; section screens repeat it rather than switching to a second section
picker.
Breadcrumb truncation removes ancestors before the current page. The `02 Shell` boards and
all six-state screen sets were redrawn; replaced boards are removed after a named version
records them, never parked on the active page. `frontend.md` §7.5 is the prose contract.
D21's "navigation rail" now refers only to the project-local section rail. D28 records the
section-screen rail after the breadcrumb-menu compromise was rejected in review.

**Rejected.** A permanent icon-only rail (still consumes width, and its unlabelled icons
need tooltips to be usable). A collapsible sidebar (keeps the complexity and the states, and
most users either pin it open or never open it). Removing breadcrumbs and relying on the
window title (the title is not a link and does not show hierarchy).

---

## D23 — Parameter identity is prefix plus name; catalogue and selection are separate

**Status:** Accepted

**Context.** `EncoderDefinition.parameters` was a `Vec<ParameterDescriptor>` with a
`key: String` and a separate `cli: Option<CliShape>`. A user could add `crf` twice, and
nothing said which value the encoder would receive. The engine's real parameter shape is a
`HashMap<String, CLIParameter>` whose key is the bare name and whose entries carry a prefix
and delimiter; the name is not inside `CLIParameter`.

**Decision.** The parameter identity is `ParameterKey { prefix, name }`, and an encoder
catalogue is a `BTreeMap<ParameterKey, ParameterDescriptor>`. Prefix is part of identity, so
`--crf` and `-crf` are distinct entries, but the catalogue is separate from the selected
values: `EncoderSelection.values` contains only the parameters the user set. A descriptor's
`default` is a suggested initial value, never an applied override. A selection rejects two
set keys with the same `name`, because Condor's map is keyed by name and would otherwise
silently drop one.

**Rationale.** Structural uniqueness is the only reliable answer to "which value do we
apply?". Separating catalogue from selection is what makes "inherit the encoder's own
default" representable, and what prevents a displayed default from overriding an encoder
setting the user never touched. Including the value or delimiter in the key would make
`22` and `"22"` different parameters, which they are not.

**Consequences.** JSON object keys must be strings, so `ParameterKey` serialises as
`"--crf"`; the loader rejects duplicate keys rather than letting the last one win.
`BTreeMap` replaces `HashMap` so generated files have deterministic order. A catalogue may
contain both spellings, but at most one may be set in a profile: this is the engine's
limitation and is stated in the validation error, not hidden by the UI.

**Rejected.** `Vec<ParameterDescriptor>` plus a duplicate check at save (the invalid state
still exists while editing); `HashMap` with nondeterministic JSON order; a key that includes
the delimiter or value (breaks uniqueness); a separate `CliShape` struct (restates prefix,
delimiter, and flag/value already held by the key and kind).

---

## D24 — Icon actions expand their own control

**Status:** Accepted

**Context.** The first icon-action design kept the button at 32px and revealed a label in a
separate absolutely positioned plaque, with a negative translate. It avoided layout work but
read as a tooltip: the label floated beside the control instead of belonging to it, and the
plaque could overlap the next action. The requested interaction is one control growing to
contain its icon and its word, horizontally, with the option to expand left at a trailing
edge.

**Decision.** The host control expands in width from the icon-only size to the measured
icon + label + padding, and the label fades and slides into that new interior. The icon
stays anchored at the leading edge for right expansion, or the trailing edge for left
expansion. `160ms` in, `100ms` out. This is a deliberate exception to the default rule
against animating layout properties, permitted by AGENTS.md §6's opt-in clause because the
requested interaction is itself the width change. It is scoped to one control at a time, is
never used inside a virtualized row that cannot absorb the width, and is instant under
`prefers-reduced-motion`.

**Rationale.** A label that belongs to its control is easier to read and harder to
misattribute than a floating plaque, and expansion gives the hover target the same geometry
as the label. The width change is bounded to a single inline-size control, so its layout
cost is one sibling reflow per hover, not a page-wide recalculation. The overlay approach
was cheaper at paint time but produced the wrong affordance and a collision class the design
had to solve with z-index.

**Consequences.** `IconAction` exposes `expand` and `direction`, measures the label once, and
reserves the expanded width only in rows whose layout can absorb it. The tooltip is not used
for the label; it remains available for extra description. Status chips reuse the same
component and the same budget. The delete action in a compact project row expands to the
left so the row does not push the table edge.

**Rejected.** An absolutely positioned plaque (reads as a tooltip, overlaps neighbours); a
fixed-width button whose label is always present but clipped (the clipped word is
unreadable); animating every row's width (layout thrash in a virtualized list).

---

## D25 — Adding a filter is one sheet

**Status:** Accepted

**Context.** The first Add-filter flow used a searchable popover anchored to the button,
then wrote the filter's form inline beside the list. It kept the list visible, but the
same decision was split across two surfaces: choosing a type changed the page behind the
popover, and the form's own escape route competed with the popover's. Repeating a filter
meant reopening both.

**Decision.** Add opens a single sheet. Its left pane is a searchable filter-type list
with recents and groups; its right pane is the generated form for the selected type. The
footer has Cancel and Add, plus **Add another**, which keeps the sheet open on the same
type. `Duplicate` on a configured row copies every field and inserts below it, and presets
fill fields without locking them. The native FFMS2 input has one type, so its sheet omits
the type pane entirely.

**Rationale.** One sheet gives one escape route, one scroll position, and one place for the
Confirm action. The type pane can stay mounted while the form changes, so search text and
selection survive a misfire. A popover plus an inline form was arguably faster for a single
filter, but it moved the list under the pointer and made the form's location depend on the
viewport. Repeats are covered by Add another and Duplicate instead of by keeping the form
permanently inline.

**Consequences.** The filter descriptor generates both the type metadata and the fields;
there is still no hand-authored form per filter. `frontend.md` §7.6.2 is the prose
contract; the board is `01 Components / Filter composer`.

**Rejected.** A modal wizard with one field per step (too many clicks for a five-field
filter); a popover picker plus an inline form (splits the decision and reflows the list);
a raw JSON textarea (the exact thing this design exists to remove).

---

## D26 — Superseded boards are removed, not archived on the page

**Status:** Accepted

**Context.** `frontend-penpot.md` originally required every replaced board to stay on its
page, renamed `— superseded` and parked to the right. By the end of the second design pass
that had accumulated roughly fifty retired boards and their detached component fragments.
The pages had become heavy enough for Chrome to discard the Penpot tab during a working
session, which repeatedly cut the design pass short.

**Decision.** A replaced board is removed from the live file. Before a set is replaced,
take a Penpot named version; that version is the audit record. `progress.md` records which
surfaces have a complete new set. The `09 Archive` page is not a graveyard for retired
boards.

**Rationale.** A named version is a cheaper and more complete record than a pile of boards
that no one reads, and it does not cost a tab. The archived boards had already stopped
being reviewed; they only affected rendering cost and the ability to find the active set.

**Consequences.** `frontend-penpot.md` §2 and §3 and `design/penpot/README.md` state the
removal policy. The fifty retired boards and their nested fragments were deleted; the
active pages now hold only current boards. Losing the browser tab no longer loses the
session, because `design/penpot/` carries the kit and the generators.

**Rejected.** Keeping the archive on-page (the suspension cause); deleting without a named
version (loses the audit trail); moving boards to `09 Archive` in the same file (same
rendering cost even when the page is not visible).

---

## D27 — One preview player with selectable decode sources

**Status:** Accepted

**Context.** The scene editor originally drew two synchronized `<video>` elements — one
decoded, one encoded — and kept both loaded so a swap was instant. The VapourSynth input
can be much more expensive to decode than the General input, so a user reviewing an encode
does not always want the filtered decode as the comparison. The encoded scene also has no
single decoded counterpart when the Parallel Encoder input overrides the General input.

**Decision.** The Scenes tab has one `<video>` element. It plays one of up to three
sources, labelled `Original`, `Decode`, and `Encode`: the General input decode, the
Parallel Encoder input decode when that input is overridden, and the encoded scene. When
`Encode` is selected, the input source it is compared against is `Decode` by default or
`Original`; `Decode` is offered only when the Parallel Encoder input is overridden. The
encoded stream remains the retained chunk; `Preview scene` produces a session encode. No
second player is mounted, and switching preserves scene-relative time.

**Rationale.** Two synchronized elements cost two decoders, two buffers, and a
synchronization contract the user cannot see; swapping one element serves the same
comparison. `Decode` is the default input source because it is what the encoder actually
saw, so the comparison isolates encode quality instead of mixing in filter differences.
`Original` stays available for review when the filter graph is expensive, but it is a
provenance choice, not a claim that one source is fast.

**Consequences.** A preview session prepares up to two decoders and keys each input's
revision separately ([preview.md](preview.md#32-session-lifecycle),
[preview.md](preview.md#36-one-player-up-to-three-sources)). Availability is per source,
not per video. Geometry and frame count can differ after `Resize`, `Crop`, or `Trim`, so
the client maps by scene-relative time and disables pixel comparison when they differ. The
source list is a transport popover, not a third column: the player, timeline and details
keep the full main-column width. The old dual-player keyframe board on `08 Motion` is
obsolete and removed; no cross-element synchronization is specified.

**Rejected.** Two synchronized players (double the decoders and a synchronization contract
for an interaction that is a source change on one element). Decoding only the General input
(cannot show what the encoder receives). Decoding only the Parallel Encoder input (a slow
filter graph becomes mandatory for every review). Labelling a source "fast" or "slow" in
the UI (the cost depends on the filter graph and the machine; the labels age badly and say
nothing about provenance).

---

## D28 — Configuration section screens repeat the local section rail

**Status:** Accepted

**Context.** D22 removed the global sidebar and kept a project-local rail on the overview.
Section screens then took the full window width and turned the current breadcrumb into a
section menu. That gave the same eight destinations two navigation models: a visible rail
on Project and Video, and a hidden menu on Configuration. The breadcrumb also stopped
being a location trail and became a control, while the section's status dot, the scene
count and the queue were one click away on the screens where a user configures them.

**Decision.** Every Configuration section screen repeats the Project rail: 232px wide,
starting below the 56px top bar, with the same rows, status dots, active
state and queue footer. The rail navigates directly on a section screen; on the overview it
scroll-spies. The breadcrumb is a static trail. Save, Cancel and the dirty indicator remain
in the top bar. Content starts at `x = 264` and is 1144px inside the 32px gutters. The rail
collapses into the same slide-over as the overview at the minimum width. There is no
Configuration-specific navigation component and no section-menu board.

**Rationale.** A user who has just chosen a section should not have to learn a second way
to change it. The rail keeps all eight destinations and their status visible, makes a
section switch one click instead of two, and restores the breadcrumb's single job. The
width cost is real: parameter fields reflow from five 256px columns to five 208px columns,
and the side column narrows from 480 to 392px. The reflow is preferable to two navigation
models, and the denser fields still hold a label, one help line, a control and a reset.

**Consequences.** `frontend.md` §7.5–7.6 and `frontend-penpot.md` describe one rail model
for Project and Configuration. The `Configuration / Section menu` board and its
`crumbMenu` support are removed. The generator shells use `K.sectionRail` and a 1208px
content column; Encoding's parameter card is five 208px fields and its info icon sits inline
after the label, with the CLI key in the tooltip. All seven Configuration section boards are
on the same rail and grid. A future section screen that omits the rail is the defect, not a
variant. Video's Configuration tab keeps its existing local rail until that surface is
reflowed; its scene column is a different control and is not part of this decision.

**Rejected.** Keeping the breadcrumb menu on Configuration (two navigation models, hidden
status, two clicks per switch). A full-width section screen with no section navigation
(the user can only leave through the breadcrumb root). A second, narrower rail for
Configuration (same width and metrics avoid a third component).

---

## D29 — No embedded database in v0.1

**Status:** Accepted

**Context.** A2 reserved SQLite "for future query needs" without naming a query. The actual
stores are a project manifest per project, a rebuildable Home index, an append-only JSONL
execution timeline, and run logs. All are small, local, and single-user.

**Decision.** v0.1 ships no embedded database and no database service. Project manifests are
JSON, the Home index is rebuilt from them, the execution timeline is append-only JSONL, and
logs are files. There is no SQLite dependency in the workspace.

**Rationale.** A database would add a schema, migrations, and a second source of truth for
data that already has a file representation and no query workload. It would also put the
timeline in a store that could be mistaken for derived state. JSON/JSONL keeps the data
inspectable, diffable, and recoverable with the file system alone.

**Consequences.** A2 is simplified to "JSON + rebuildable index"; `architecture.md` §8 no
longer lists SQLite as an available crate. If a query need appears, it is a new ADR, not a
quiet dependency.

**Rejected.** SQLite for the Home index (the index is derivable and tiny), SQLite for the
timeline (append-only JSONL is simpler and failure-tolerant), SQLite for project config
(adds migrations for no benefit).

---

## D30 — Pin transitive engine branches in Cargo.lock, not `[patch]`

**Status:** Accepted

**Context.** The 1.2 spike tested the documented `[patch]` block. Cargo rejects it with
"patch for `av-metrics-fmetrics` points to the same source, but patches must point to
different sources". Removing the block resolves all four packages from the single
`andean-condor` git source. The remaining break was transitive: the engine takes
`av-decoders` and `av-scenechange` from branches, and the branch heads had moved past the
revisions in the engine's own lockfile, changing a `from_raw` signature and breaking the
compile.

**Decision.** One pinned `andean-condor` git dependency, no `[patch]` for its path
siblings. `Cargo.lock` pins `av-decoders` and `av-scenechange` to the revisions in the
engine's lockfile. Build with `--locked`. Re-pin all three revisions together when the
engine moves.

**Rationale.** Cargo cannot express a same-source patch, and the lockfile is the supported
mechanism for pinning a transitive branch. `--locked` makes a moved branch fail the build
instead of silently changing it. This is smaller than vendoring and keeps the dependency
readable.

**Consequences.** A2 is unchanged by this decision; A9 is refined. `backend.md` §2, `AGENTS.md` §10 and
plan task 1.2 describe the lockfile flow. A deleted or regenerated lockfile can resolve
to a newer branch and break the engine; CI must use `--locked`. If a future branch cannot
be pinned by the lockfile, vendor to local paths and record that as a new ADR.

**Rejected.** Same-source `[patch]` (Cargo error); tracking branch heads (non-reproducible);
vendoring now (unnecessary complexity); editing `Cargo.lock` by hand (use `cargo update
--precise`).

---

## D31 — Website design is deferred out of Phase 0

**Status:** Accepted

**Context.** Phase 0 treated the public landing, documentation and demo boards as an exit
requirement. The application board set (`00`–`10`) was approved at revision `547`. A draft
`11 Website` set was drawn at revision `569`, but it is not approved, and the public site
does not need to exist before the desktop scaffold or the backend.

**Decision.** Phase 0 ends with the documentation set and the application board set. The
public website design round moves to Phase 6, alongside the public-site release work, and
must be approved there before the site is built or published. The `11 Website` boards remain
an unapproved draft and are not a Phase 0 gate; no `phase-0-website` named version is
required. D20 still applies when the website round starts: no page is implemented before its
boards are approved.

**Rationale.** Phase 1 proves the repository, contracts, service and shell. A release-time
marketing and documentation surface cannot answer any of those questions, and leaving it on
the Phase 0 gate delays implementation for work that will be reviewed against a finished
app chrome anyway. Keeping the draft preserves the review work without treating it as an
approval.

**Consequences.** `frontend-penpot.md`, `plan/00-overview.md`, `plan/06-deployment.md`,
`progress.md`, and the design README record the deferred state. The draft generators stay in
`design/penpot/boards/` so Phase 6 does not redraw the surface from scratch. Phase 1 may
scaffold `apps/website` with `MockTransport`, but it must not implement the landing,
documentation or demo pages before 6.13 approves their boards.

**Rejected.** Keeping the website on the Phase 0 gate (blocks the scaffold for a
release-time surface); deleting the draft (wastes the review work and loses the information
architecture); approving the draft without review (violates D20).

---

## Platform and tooling decisions

| Decision | Choice | Note |
| --- | --- | --- |
| Rust edition | 2024, toolchain pinned to 1.97 | forced by the engine |
| Node | **26 LTS** (verified 26.13.0) | `.nvmrc` and CI both pin 26 |
| TypeScript | 6.x | 7.x blocked by `typescript-eslint` peer range |
| Router | TanStack Router | typed params + cancelable `beforeLoad` |
| Charts | Apache ECharts | see below |
| Editor | Monaco | see below |
| Motion | `motion` | see [frontend.md](frontend.md#8-animation-budget) |
| Toasts | `sonner` | strict policy, §6 of frontend.md |
| Command palette | `cmdk` | keyboard-first navigation |
| Virtualization | `@tanstack/react-virtual` | 5,000-row scene list |

### Charts: ECharts over alternatives

| Option | Verdict |
| --- | --- |
| **ECharts** | Chosen: dataZoom for large series, brush selection, statistical box plots, canvas renderer that handles 10k+ points, and a mature theme system we can bind to CSS tokens. |
| Recharts | Simpler API, but SVG rendering degrades on the point counts target-quality and frame-score plots produce. |
| visx | Maximum control, but we would build axes, zoom, and brushing ourselves. |
| Chart.js | Adequate, weakest for statistical/brush interactions. |
| uPlot | Fastest, but too low-level for the interaction set required. |

Cost: bundle size, mitigated by tree-shaken per-chart imports behind a lazy loader.

### Editor: Monaco over alternatives

| Option | Verdict |
| --- | --- |
| **Monaco** | Chosen: the requirements ask for it, it is the familiar VS Code editing surface, and it supports registering a Python language plus completion/hover providers wired to our own API. |
| CodeMirror 6 | Lighter and more embeddable, genuinely competitive; rejected only because the requirement named Monaco and the team's expectation is Monaco-like fidelity. |
| Ace | Dated. |

Python tooling inside Monaco: syntax via the built-in Monaco Python tokenizer or a
Monarch grammar; formatting via `@wasm-fmt/ruff_fmt` (WASM, no Python runtime); linting via
a lightweight custom provider plus optional Pyright in a worker. Formatting is the only
mandatory piece — a linter inside a 200-line `.vpy` is nice-to-have, and shipping a
Python-LSP in a WASM worker is a large cost for it.

---

## Assumptions (confirmed 2026-10-30)

Recorded in [README.md](README.md#assumption-register). Summarised here:

| ID | Assumption |
| --- | --- |
| A1 | v0.1 scope excludes Monaco editing, scene editor, preview, and charts |
| A2 | JSON files per project plus a rebuildable index; no SQLite (D29) |
| A3 | Test stack as in D10; screenshots generated in CI as artifacts, never gating |
| A4 | No `mpv`; fMP4 preview (D5) |
| A5 | Node 26 LTS, verified with 26.13.0 |
| A6 | No multi-window (D13) |
| A7 | Token auth for LAN (D14) |
| A8 | GPL-3.0 (D12) |
| A9 | Engine pinned to a commit; transitive branches pinned in `Cargo.lock` (D2, D30) |
