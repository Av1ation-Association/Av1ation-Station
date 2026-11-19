# Penpot Design Specification

Design is finalized in Penpot before screen implementation begins. This document defines
the file structure, the token contract between Penpot and code, and the handoff ritual. It
is normative for the design phase described in `plan/03-ui.md`.

## Contents

- [1. Why a design file precedes code](#1-why-a-design-file-precedes-code)
- [2. File structure](#2-file-structure)
- [3. Boards required per surface](#3-boards-required-per-surface)
- [4. Token contract](#4-token-contract)
- [5. Handoff ritual](#5-handoff-ritual)
- [6. Component naming](#6-component-naming)
- [7. Accessibility annotations](#7-accessibility-annotations)
- [8. Content rules](#8-content-rules)
- [9. Definition of design-complete](#9-definition-of-design-complete)
- [10. Automation](#10-automation)

## 1. Why a design file precedes code

A screen is cheaper to change as a board than as a component tree. Three properties of this
application make that asymmetry unusually large:

- **Configuration surfaces dominate.** Project and Video screens render the same field set
  with different provenance and override affordances. Getting the hierarchy wrong in the
  design file costs one board edit; in code it costs a component rewrite plus a retest of
  every inheritance path.
- **Dense, stateful layouts.** The Video screen has three tabs. `Configuration` is the same
  field set with provenance; `Scenes` is one player, a proportional scene timeline, scene
  details, and the chart surface in a stable arrangement; `Logs` is the run log. That is a
  layout problem, and layout problems are resolved by looking at them.
- **Animation is part of the contract.** `frontend.md` §8 fixes a motion budget. Boards
  prove the budget is achievable before anyone writes a transition.

## 2. File structure

One Penpot file, one page per surface, so a reviewer can evaluate a surface independently.
Penpot pages have no per-file cap and no rate limit on the hosted service.

| Page | Contents |
| --- | --- |
| `00 Foundations` | colour ramps, finishes, type scale, spacing, radius, elevation, motion, icon set, logo mark, and the 1280×640 brand lockup |
| `01 Components` | primitives and composed components with all variants and states |
| `02 Shell` | top bar (way back, mark and wordmark, breadcrumb, actions), content outlet, command palette, toast region |
| `03 Home` | whole-row project list, empty state, create, delete confirm |
| `04 Settings` | tabbed appearance with theme and density previews, notifications, masonry dependency inventory with diagnostics, encoder catalogue and parameter/JSON editor, project templates, storage, network and pairing, about, and the tab-strip state specimen |
| `05 Project` | configuration section grid, queue, the five project states, and the script editor as its own surface |
| `06 Video` | `Configuration` with provenance and status; `Scenes` with one player, its `Original`/`Decode`/`Encode` sources behind one transport control, proportional timeline, scene details with honest per-sequence data, validation, charts; `Logs` as its own tab; source menu; scene encoder sheet; `Concatenation` with the track map inside its Method card |
| `07 Overlays` | dialogs, popovers, menus, banners, notification variants |
| `08 Motion` | annotated keyframes for every transition in the budget |
| `09 Archive` | the dated rollout snapshot policy; not a live board page |
| `10 Configuration` | one board per configuration section: General, scene detection, noise generation, target quality, encoding, concatenation, quality check; each starts from a back link to the Project section grid, keeps the breadcrumb a static trail, and puts Save/Cancel in the top bar |

Superseded boards are **removed**, not parked on the active page. A page full of retired
boards is what made the Penpot tab heavy enough for Chrome to discard it, and the file's
named version is the real rollback. Take a named version before a board set is replaced;
a replaced board that still needs auditing lives in that version, not in the live file.

**Boards, not frames.** Penpot's analogues are: `Board` for an artboard, `Board` with a
flex or grid layout for an auto-layout frame, `LibraryComponent` for a component,
`VariantContainer` for a component set, and a component instance for an instance. This
document uses the Penpot term wherever the distinction matters.

### 2.1 Theme

Every board is rendered in **dark mode**, the default theme for this application. Video
tooling and colour-grading work are conventionally dark, and the preview surface reads
correctly against a dark surround.

Dark is the default, not the only theme. Every colour consumed by a board is a semantic
token with a `Light`-theme alternative, so the light theme is produced by activating a
different token theme rather than by redrawing boards. A board that consumes a raw palette
value cannot theme and fails review.

## 3. Boards required per surface

Every surface ships this board set. A surface is not design-complete until all of them
exist and are approved.

| Board | Purpose |
| --- | --- |
| Populated | realistic content, not `Lorem ipsum`; use real encoder parameter names |
| Empty | first-run or no-items state with the action that fills it |
| Loading | skeleton matching the populated layout's geometry |
| Error | failure with cause, remediation, and a route to details |
| Narrow | minimum supported window width |
| Wide | maximum useful width; states what happens to whitespace |
| Overlays | each dialog/popover this surface owns, opened over the populated board |
| Interactions | hover, focus-visible, active, disabled, selected, and dirty states on interactive elements |

The four core states mirror `frontend.md` §11. A board set missing any of them fails review.

A surface whose chrome or layout changed after its set was drawn has exactly one active
set. The replaced boards are removed after a named version records them, and `progress.md`
states which surfaces have a complete new set and which are still in rework. Keeping
dozens of retired boards on a page is not a design record; it is what made the tab
suspendable.

`10 Configuration` is a surface page rather than a state page: one board per configuration
section. General, scene detection, noise generation, target quality, encoding,
concatenation and quality check each get their own board; the section map is not a screen
and has no board. A section board carries a back link to the project's section grid, not a
repeated rail: the grid is the one place sections are chosen, so a dirty draft cannot be
swapped by a sibling row. The grid never prints a scene count at project scope; scenes
belong to a selected video. The breadcrumb is a static trail. Each
Encoding parameter label carries an inline info icon; the tooltip holds the CLI key, the
parameter description and its documentation link, so no key is printed beside the label.
That component is `01 Components / Parameter info`, annotated with its keyboard model,
placement, hit target and accessible name; it is a component board rather than a clone of
Encoding, because a second dense screen costs tab performance and proves nothing extra.
The VapourSynth script page is drawn on `05 Project`, because a script is an input kind and
not a sequence section. It repeats the shell and puts Save/Cancel/dirty in the 56px top bar; it
has no footer and no second action row. The page exists because the project page is one
long scroll whose sections each need to be reviewed at full size. `10 Configuration` is a
section surface, not a standalone state surface: its populated board is the review unit,
while full-page loading, error, narrow and wide states come from the `02 Shell` and
`05 Project` sets. A section-specific loading or error belongs inside the section card, not
in a duplicate full-page board. `04 Settings` carries one tab board per tab, plus
`Project Templates` and the encoder parameter editor; each tab board repeats the same tab
strip, so adding a tab is one change in every board, not a bespoke header.

### 3.1 Public website

The public website is the one exception to board-first implementation. Marketing and
documentation pages are not application screens and are not transcribed from Penpot. They
are composed from the application's identity — its logo mark, semantic tokens, Inter and
JetBrains Mono, and real shared components — and may mount real application screens with
fixture data. They must not invent an application screen's layout; a mounted
app screen ships as it exists.

The site's review surface is the running page, its built output, and its accessibility and
bundle behavior, not a board. App screens remain governed by §3 and §9.

Foundations carries eight boards: `Colour`, `Finishes`, `Type`, `Spacing`, `Radius`,
`Motion`, `Logo`, and `Brand lockup`. The `Logo` board is the only place the app mark's
path, clear space and minimum size are specified; the mark is recoloured per theme, never
redrawn. `Brand lockup` is the approved 1280×640 image lockup — mark right-aligned, two
trails fading from its rear points, `Av1ation` above and `Station` below — and closes the
page on its own row at its native size. `Finishes` is not optional — the brushed
aluminium treatment is defined by tokens, and the board is the only place its gradient
stops, specular placement, and grain density are specified.

## 4. Token contract

Penpot tokens and CSS custom properties are the same names. Code does not hard-code a value
that exists as a token.

Penpot's token library is W3C Design Tokens Community Group (DTCG) format, so the
authoritative artefact is a DTCG JSON document committed to the repository and imported into
Penpot. Penpot is a consumer of that file, not the origin of truth; a token added in Penpot
must be exported back into it in the same change.

| Token set | DTCG `$type` | CSS custom property prefix | Consumed by |
| --- | --- | --- | --- |
| `color.primitive` | `color` | — | nothing directly; alias source only |
| `color.semantic` | `color` | `--color-*` | Tailwind v4 `@theme` |
| `space` | `spacing` | `--space-*` | Tailwind spacing scale |
| `radius` | `borderRadius` | `--radius-*` | `--radius-*` |
| `type` | `fontSizes`, `fontFamilies`, `fontWeights` | `--text-*`, `--leading-*` | Tailwind font-size scale |
| `motion` | `duration`, `cubicBezier` | `--duration-*`, `--ease-*` | transition utilities |

Tailwind v4 reads its theme from CSS, so the token layer is exported as a CSS block and
committed. There is no second source of truth and no build step translating Penpot JSON into
a Tailwind config.

Semantic tokens (`--color-surface-raised`, `--color-text-muted`, `--color-danger`) are
preferred over raw palette steps in component code. Themes are expressed by activating a
different semantic set; a component that references a raw ramp value cannot theme correctly
and fails review.

### 4.1 Two-tier aliasing

Sets are ordered and cascade. `color.primitive` holds every ramp step and is never applied
to a shape. `color.semantic` holds every token a board may use, and each value is a DTCG
alias to a primitive, for example `{color.primitive.neutral.925}`.

Themes activate sets, so `dark` and `light` each activate `color.primitive` plus their own
semantic overrides. A board renders in whichever theme is active, which is why dark-mode
boards and light-mode boards are the same boards.

Applying a token is asynchronous in the Plugin API; allow for that before asserting that a
binding took effect.

### 4.2 Authored geometry

Boards clip their content. A child positioned with page-absolute coordinates inside a board
that does not sit at the page origin is clipped away entirely, and the board exports blank
while still reporting its children. Every child is therefore positioned with board-relative
coordinates, and each board is verified by exporting it rather than by reading node
properties back.

Gradient stops in a fill are normalised: fill coordinates run 0–1 across the shape, not in
pixels. A pixel-valued gradient collapses to a flat colour without raising an error.

## 5. Handoff ritual

Per surface, in order:

1. Designer publishes boards on the surface's page and marks the page `Ready for review`.
2. Reviewer checks against §3 and the state checklist in `frontend.md` §11.
3. Feedback lands as Penpot comments on the specific board, not as prose in the issue.
4. Designer resolves comments and marks the page `Approved`.
5. Implementation begins. The approved board reference — a URL, or the Penpot file ID,
   revision and page name when the file is not distributable — is recorded in `progress.md`.
6. Any layout change discovered during implementation returns to the design file first, then
   code.

Step 6 is the rule that keeps the design authoritative. Discovering a constraint mid-build
is expected; silently diverging from the approved board is not.

## 6. Component naming

Penpot component names map to code component names one-to-one. `Dialog/Confirm` in Penpot is
`ConfirmDialog` in code, in the file that its feature owns. Variant properties map to props;
a variant property named `tone` with values `neutral | danger` is a `tone` prop with the same
values.

Components that exist only as a Penpot composition and have no code counterpart are marked
`_composition` in the name, so nobody looks for an implementation that is not meant to
exist.

Layers carry semantic names. A board is never named `Board` or `Rectangle 12`, because the
name is what the reviewer and the implementation both read.

## 7. Accessibility annotations

Each component page carries, per component:

- Keyboard model: which keys activate, move, and dismiss.
- Focus order and the focus-visible treatment.
- Accessible name source and role.
- Contrast ratios for each text/background pair, against WCAG AA, in **both themes**.
- Reduced-motion variant of any motion in the component.

These are review gates, not documentation. `frontend.md` §9 sets the standards.

## 8. Content rules

- Real encoder parameter names, real file paths of plausible length, real version strings.
  Placeholder copy hides truncation and overflow bugs that then appear in code.
- Longest-case strings appear in at least one board per surface.
- Every destructive action shows its confirm board.
- Error boards carry actual error text shape, including the path or dependency that failed.
- No text element repeats its layer name; Penpot already displays the name.

## 9. Definition of design-complete

A surface is design-complete when all of the following hold:

- Board set from §3 exists on its own page. The public website is exempt; §3.1 defines its
  review.
- Approval recorded in `progress.md` with a board URL, or the Penpot file ID, revision and
  page name when the file is not distributable.
- Every colour, spacing, radius, and type value is a bound token; no detached values.
- The surface renders correctly in both the `dark` and `light` token themes.
- Accessibility annotations from §7 present.
- Overlay boards exist for every interaction the surface can open.
- Motion for the surface is annotated on `08 Motion` within the budget.

## 10. Automation

The Penpot MCP server exposes `execute_code`, which runs arbitrary JavaScript against the
Penpot Plugin API in the connected file. Boards, layouts, components, variants, and token
bindings are therefore scriptable, and the design file can be generated and audited by an
agent.

Constraints that apply to any automated edit:

- MCP acts on the **currently focused page** of the connected file, and the plugin runs in
  the browser tab that connected it. The tab must stay open and awake for the duration.
- Only one tab may hold the MCP connection at a time.
- Remote MCP has no local filesystem access; export and import use `export_shape` and
  `import_image` against Penpot's own storage.
- Automated writes are reviewed like any other change: the generated boards are the
  deliverable, not the script that produced them.

### 10.1 Design sources survive tab suspension

The plugin's `storage` is **in memory**. A browser tab that suspends and reconnects loses
every helper stored there; the file does not lose its boards or tokens. The drawing kit is
therefore a repository file, [`design/penpot/kit.js`](../design/penpot/kit.js), not a
`storage` artefact:

1. Read `design/penpot/kit.js`.
2. Pass its contents once to `execute_code` in the connected tab. It installs `storage.K`
   (tokens resolved from the dark set, shape helpers, `chrome`, `mark`).
3. Re-apply it after any suspension before requesting an edit. Board scripts are ordinary
   calls on `K`; they are reproducible from the file plus the kit.

The kit deliberately resolves the `color.dark` set by name. A flat map keyed by token name
silently returns the light set, because both semantic sets reuse the same names.

Board generators live in `design/penpot/boards/`, one file per board set, and are idempotent:
each removes the boards of the same names before drawing them. A board is written as a script
first and then run, so a reset costs a re-injection rather than a redraw. A board that
exists only as an ad-hoc call is not reproducible and is treated as scratch work. Generators
end with `K.organize(page)`, which sorts the page's root boards row-major so the layer panel
matches the review order after a partial redraw. The reading order for every page is in the
board README.

An SVG import also leaves a hidden `base-background` rectangle inside every icon group. It
is invisible, so it passes a visual review while doubling the node count of the densest
boards. `K.icon` strips it after import; a board generated from the kit cannot reintroduce
it. The 2026-11-04 sweep removed 794 such layers from the live file and left zero hidden
layers, while the width and state pages were repacked so no board sits alone beside an
empty column.

The token library lives in the file and survives a reset, but it has no diff. After a token
change, run `design/penpot/export-tokens.js` and commit `design/penpot/tokens.json`; the
snapshot is the reviewable audit trail, while the Penpot library remains the source. The
`.penpot` export is about 50 MB and is not committed; `design/penpot/VERSIONS.md` records
the reviewed file ID, revision, named version and external export checksum. The recovery
procedure, inventory, and snapshot guidance are in
[`design/penpot/README.md`](../design/penpot/README.md).

### 10.3 Phase 6 design source

The live Penpot service is no longer available, and the owner has waived live-board
reconciliation. Remaining screen work proceeds from the checked-in generators, components
and semantic tokens; this is the normal design source for this phase, not a provisional
exception, and it is not a release gate. A surface that has no checked-in generator still
needs design input rather than an invented layout. See
[`docs/decisions.md`](decisions.md).
