# Penpot design sources

The design file lives in Penpot. This directory holds the **reproducible** part: the
drawing kit, one generator per board set, and a token snapshot. If the Penpot tab suspends,
the plugin's in-memory `storage` is cleared; the boards and token library survive in the
file. Nothing here replaces the file — it replaces the helpers that die with the tab.

## Rehydrate after a tab reset

1. Open the Penpot project and run the Penpot MCP plugin from Penpot's plugin menu.
   Plugins do not auto-run after a browser restart; until one connects, every call answers
   `no heartbeat for Ns`. After an ordinary tab suspension, focusing the existing tab is
   enough.
2. Pass the contents of [`kit.js`](kit.js) to the Penpot MCP `execute_code` tool. It
   installs `storage.K`.
3. Pass the relevant file from [`boards/`](boards/). Each script is idempotent: it
   removes the board with the same name before drawing, so re-running never duplicates.
4. Verify by exporting the board (`export_shape`) — a board that reports children but
   exports blank has positioned them outside its own bounds.

Do not rebuild helpers by hand in the plugin. If a helper is missing, add it to `kit.js`
first and re-inject; that is the only copy that survives.

## Tokens

The token library in the Penpot file is the source of truth for values; the repository
keeps an inspectable snapshot so token drift is reviewable in a diff.

- Run [`export-tokens.js`](export-tokens.js) in the connected tab after any token change.
- The committed snapshot is [`tokens.json`](tokens.json); re-run the exporter and commit the diff after any token change.
- A board is token-compliant only when it binds semantic tokens; the snapshot does not
  prove binding, it only proves the values.
- Both semantic sets reuse the same token names. Resolve `color.dark` by set name, never
  by building a flat name→value map.

## Board inventory

`boards/` is the authoritative list of what can be regenerated. Most boards currently in
the file predate this directory and have no generator; the external `.penpot` snapshot is
their backup. `11 Website` is generator-backed by three scripts, one per surface family,
and is an unapproved draft deferred to Phase 6 . Do not treat it as a Phase 0 approval
gate, and do not add new boards as ad-hoc calls.

| Script | Boards | Page |
| --- | --- | --- |
| `boards/chrome-refresh.js` | the `chrome /` layers of any application board, from the crumbs already there | `02`–`07`, `10` |
| `boards/configuration-general-detection.js` | `General`, `Scene detection`, `Noise generation` | `10 Configuration` |
| `boards/configuration-encode-quality.js` | `Encoding`, `Target quality`, `Concatenation`, `Quality check` | `10 Configuration` |
| `boards/components-filter-composer.js` | `Components / Filter composer` | `01 Components` |
| `boards/components-icon-actions.js` | `Components / Icon actions` | `01 Components` |
| `boards/components-parameter-info.js` | `Components / Parameter info` | `01 Components` |
| `boards/video.js` | `Video / Configuration`, `Video / Scenes`, `Video / Logs`, `Video / History`, `Video / Source menu`, `Video / Scene encoder`, `Video / Empty`, `Video / Loading`, `Video / Error`, `Video / Narrow`, `Video / Wide` | `06 Video` |
| `boards/video-concatenation.js` | `Video / Concatenation` | `06 Video` |
| `boards/home-states.js` | `Home / Populated`, `Home / Empty`, `Home / Loading`, `Home / Error`, `Home / Narrow`, `Home / Wide` | `03 Home` |
| `boards/project-states.js` | `Project / Populated`, `Project / Empty`, `Project / Loading`, `Project / Error`, `Project / Narrow`, `Project / Wide` | `05 Project` |
| `boards/settings-project-defaults.js` | `Settings / Project Templates`, `Settings / Project Templates / Encoding` | `04 Settings` |
| `boards/settings-tab-states.js` | `Settings / Tab states` | `04 Settings` |
| `boards/motion-icon-expand.js` | `Motion / Icon action expand — 160ms` | `08 Motion` |
| `boards/website-landing.js` | `Website / Landing`, `Website / Landing / Narrow` | `11 Website` |
| `boards/website-docs.js` | `Website / Docs`, `Website / Docs / Narrow`, `Website / Docs / Article`, `Website / Docs / Article / Narrow` | `11 Website` |
| `boards/website-demo.js` | `Website / Demo`, `Website / Demo / Narrow`, nested `Website / Demo / Browser`, `Website / Demo / App` | `11 Website` |

`chrome-refresh.js` is the exception to one-script-per-board-set: it redraws only the 56 px
bar on boards that already exist, so a change to the shared shell does not cost a redraw of
every screen. Set `storage.chromeBoard = 'Project / Populated'` to patch one board per call;
with no value it walks every application board. It preserves each board's crumbs and
leaves everything below `y = 56` alone. The bar itself is drawn by `K.chrome` in `kit.js`:
the way back (the mirrored mark and two tapering trails) at the head, the mark and wordmark,
the divider, the trail, and the command-palette and Settings actions. The root screen — the
single `Projects` crumb — is the one trail without a way back.

The script editor exists in the file only; export a `.penpot` snapshot after review until
its generator is committed. The six Home boards are generator-backed from `home-states.js`
and share the heading, the whole-row project target and the pinned footer. All six Project
boards are generator-backed from `project-states.js` and share the **Configuration and
Defaults** panel and the queue, with the queue in a right column on the Wide board. The
`configuration-encoding.js` generator is retired and has been removed; its board was
replaced by the two scripts above. The website scripts draw eight root boards plus the
nested browser/app boards; the browser frame is a board, not a rectangle, so the app Home
keeps its real 56px chrome and geometry.

## Board layout

Root boards sit on a 64 px grid: a left column at `x = 0`, a right column one gutter
away (`x = left width + 64`), rows packed by the tallest board plus 64. The 1440 px pages
therefore use `x = 1504`; `00 Foundations` (1276 px boards) uses 1340 and `01 Components`
(1400 px) uses 1464. A 1920 px Wide board shares its row with a 1024 px Narrow board on a
3008 px page; elsewhere it closes its page.

The pages revised in this round pack their last rows instead of stacking them. On `03 Home`,
Narrow (1024 px) and Wide (1920 px) share the third row at `x = 0` and `x = 1088`, so the
width pair reads together and the page is 3008 × 3008 rather than 3008 × 3840. On
`05 Project`, the same width pair shares the third row at `x = 0` and `x = 1088`; the
live-only `Project / VapourSynth Script` subpage closes the page on its own row. On
`04 Settings`, the tab boards fill two columns, each child editor sits directly under its
parent, and `Storage`/`Network` followed by `About`/`Tab states` close the page. On those
three pages no state or tab board is parked alone while the next column has room; a subpage
gets its own row when pairing it would split its parent group. Every page was audited on
2026-11-04: no overlaps, and every row is separated by at least a 64 px gutter.

**Layer order is review order.** Root boards sort row-major: top to bottom, then left to
right. Every generator ends with `K.organize(page)`, so a full or partial redraw cannot
leave the panel in creation order. Do not rely on creation origins either: single-board
generators place the board at its final coordinate, and the set scripts apply their
`LAYOUT` table before organizing.

| Page | Reading order (`/` starts a row) |
| --- | --- |
| `00 Foundations` | Colour, Finishes / Type, Spacing / Radius, Motion / Logo. The 1276 px boards fill the left column and the 1320 px boards the right; mixing widths closes the 64 px gutter to 20. |
| `01 Components` | Buttons, Inputs / Status, Navigation / Rows, Accessibility / Input types (collections and ranges), Input types (unknown descriptor) / Icon actions, Filter composer / Parameter info. |
| `02 Shell` | Chrome, Narrow / States. |
| `03 Home` | Populated, Empty / Loading, Error / Narrow, Wide. The width pair shares a row. |
| `04 Settings` | Appearance, Dependencies / Encoders, Project Templates / `Settings / Encoders / Parameter editor`, `Settings / Project Templates / Encoding` / Storage, Network / About, Tab states. The two child editors sit under their parents; the tab-state specimen closes the page. |
| `05 Project` | Populated, Empty / Loading, Error / Narrow, Wide / VapourSynth Script. The width pair shares the third row; the script child closes the page. |
| `06 Video` | Configuration, Scenes / Logs, Source menu / Scene encoder, Concatenation / Empty, Loading / Error, Narrow / Wide. |
| `07 Overlays` | Confirm delete, Command palette / Guard · unsaved draft, Guard · encode running / Menus and popovers, Banners / Notifications. |
| `08 Motion` | State feedback — 100ms, Surface enter and exit — 160ms / Icon action expand — 160ms, Route transition — 240ms / Progress, selection, reduced motion. |
| `10 Configuration` | General, Scene detection / Noise generation, Target quality / Encoding, Concatenation / Quality check. |
| `11 Website` | Landing, Landing Narrow / Docs, Docs Narrow / Docs article, Docs article Narrow / Demo, Demo Narrow. |

`09 Archive` holds no boards by design and takes no place in the review order.

**Document cost.** Penpot's SVG importer keeps a hidden `base-background` rectangle inside
every imported icon group. It is invisible, so a visual review never catches it, but it
duplicated every icon and was 7.6% of the document. `K.icon` removes it at the source, so a
regenerated icon group is single-path. The 2026-11-04 sweep removed 794 of them from the
live file; a full audit then found zero hidden layers across 82 application boards. Do not
add a hidden background to a generated icon.

`11 Website` carries one page-sized rectangle named `Website / Canvas` behind all boards,
filled with `color.bg.sunken`. It is a rectangle, not a board: it keeps the gutters and the
area around the set dark during review, is excluded from the board inventory, and is
inserted at layer index 0 so it can never cover a board. It is `2512 × 5532` at
`(-120, -120)`, covering the 64px gutters around the `2272 × 5292` board field.

Every Configuration section board is a full-width project section screen: there is no local
section rail, no queue footer, and no in-board Cancel/Save pair. Section navigation lives on
the Project screen; a section is edited in place and returns through the shared shell.
Content starts at `x = 32` and runs to the 32 px right gutter at 1440 px. Do not add a footer.

`K.sectionRail` is retired. Do not call it in a Configuration generator; a board that still
shows a 232 px rail is stale and must be rebuilt from the shipped `ProjectSectionScreen` /
`ProjectGeneralScreen` geometry.

## Performance

The plugin executes on the Penpot tab's main thread, and every `create*` plus token
`applyToken` is a document operation. A 300-shape board takes long enough that a
whole-set redraw stalls the tab and can cross Chrome's discard threshold.

The other half of the problem is the browser, not the document. The MCP plugin sends a
heartbeat from the Penpot tab and the server drops the connection after about 30 seconds
without one. Chrome throttles timers in a backgrounded tab, and an inactive Penpot tab is
quickly a "sleeping" tab. A call then fails with `no heartbeat` before any code runs, even
though the file is intact. Keep the Penpot tab **focused or visible on a second display**
while a board is being drawn or exported, and add its origin to Chrome's
`Performance → Always keep these sites active` list. Do not keep a second Penpot tab open:
only one holds the socket. When a call does fail, focus the tab once and retry the same
call; a reset only loses `storage` (re-inject `kit.js` once), never the boards.

The document rules:

- Redraw **one board**, never the set: `storage.videoOnly = 'scenes'` (or `'encoder'`, …),
  and `storage.configSection = 'general' | 'scene' | 'noise' | 'encoding' | 'target' |
  'concatenation' | 'quality'` for a Configuration section. A full run is only for a
  rebuild from scratch.
- **Clone** a rendered board when the variant only adds an overlay. `videoBackdrop()`
  in `boards/video.js` clones `Video / Scenes` for the source menu and encoder sheet;
  rebuilding their backdrop is pure waste. Do **not** clone a dense Configuration screen
  for a component state: add a small component board instead. A tooltip does not need a
  second copy of the rail, the queue and five parameter fields behind it.
- The Encoding parameter card is one row of five 208 px fields, grouped under Quality,
  Speed, Threading and Filtering, not a row list. Each field is a label with an inline info
  icon, one help line, and one control; the CLI key lives in the info tooltip, never beside
  the label. The card should stay 196 px tall.
- **Patch a sub-surface** when the change is local. `storage.videoOnly = '__none__'`
  plus `storage.videoPatch = 'details'` re-draws only the Scenes details card.
- Keep one surface per page and no retired boards on it . Penpot holds every shape
  on the page even when it is outside the viewport.
- A new board over ~250 shapes should clone a template or be split; do not add a second
  full copy of a dense backdrop.
- Export **one board at a time** and only after a batch of patches. An export is a full
  render of the board and is the most expensive call; the page export is never needed.
- The website set is three scripts (`website-landing.js`, `website-docs.js`,
  `website-demo.js`); run one at a time. The docs script alone draws four root boards, so
  export them individually rather than re-exporting the page.
- Inspect geometry with `execute_code` (shape names, bounds, font sizes) before exporting.
  Most alignment defects are cheaper to find as numbers than as pixels.

## Snapshots

Penpot named versions (`File → Save version`) are the cheap rollback. The `.penpot` export
is about 50 MB and is **not committed**. After a board set is approved, create a named
version and export the file to the project's external design archive. Record the file ID,
revision, named version, export date, location and SHA-256 in [`VERSIONS.md`](VERSIONS.md).
The website boards were drawn at revision `569`; [`VERSIONS.md`](VERSIONS.md) records the
current working revision.
They are a draft deferred to Phase 6 , not a Phase 0 review candidate. Freeze the
application set as `phase-0-app-boards`; the website round creates its own named version
when its boards are approved. The repository holds the generators, `tokens.json`, and that
manifest; the binary stays outside git.

The file is the only artefact that carries boards **and** tokens at once. `tokens.json` is
a reviewable snapshot, not an import format. Recreating a lost library means importing the
external `.penpot` snapshot or re-entering values in Penpot's token editor.

## Troubleshooting `no heartbeat`

- **After a browser restart:** the plugin is not running. Open the project, launch the
  Penpot MCP plugin, and retry. The file is untouched.
- **After a long pause:** focus the existing Penpot tab; a click usually re-registers it.
- **Two tabs:** only one can hold the connection. Close the duplicate.
- **Plugin says connected but calls still fail:** the MCP server is holding the old socket.
  Reconnect the Penpot integration (or restart the server) and launch the plugin again.

## Keeping the tab alive

The plugin runs in a browser tab, so Chrome may suspend it when it is backgrounded.
Heavy pages make that more likely. Two things prevent it:

- Add the Penpot origin to Chrome's **Always keep these sites active** list
  (`chrome://settings/performance`), so Memory Saver never discards the tab.
- Keep one Penpot tab; only one can hold the MCP connection.

Keep the current page light as well (banded fills over thousands of hairlines, collapsed
repeated rows, large sets split across pages, and no graveyard of superseded boards). This
reduces the chance of a discard but does not override the browser setting. When a page
starts to feel heavy, remove the retired boards rather than hiding them: a purchased tab
session is not worth a design record the named versions already hold.
