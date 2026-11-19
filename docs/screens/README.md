# Screens

Each surface below has its own contract. This page holds the design gate, the screen
inventory, and the index; the shared visual, state, and accessibility rules stay in
[frontend.md](../frontend.md).

## Penpot-first design gate

No screen implementation begins until its Penpot board set is approved. The designer
deliverable for each screen is: default populated state, the
[four §11 states](../frontend.md#11-error-and-empty-state-design) (loading, empty, error,
populated), and every interactive overlay it owns (menus, dialogs, toasts).
Implementation then transcribes the approved boards; it does not invent layout.

Boards are drawn in the dark theme, which is the application default. Penpot file structure,
the token contract, and the handoff conventions live in `docs/frontend-penpot.md`. The gate
is sequenced in Phase 3 of `docs/plan/03-ui.md`; the review checkpoint is recorded in
`docs/progress.md`.

## Screen table

| Screen | Responsibilities |
| --- | --- |
| Home | compact project list with path, retained size and video count; filter by name or path; create; inline rename; open OS directory; delete; footer links to GitHub, website, documentation and About |
| Settings | tabbed sections: appearance, dependency inventory and remediation, encoder catalogue and parameter editing, project templates, storage paths, network and pairing, about/version |
| Project | a section grid (General and six sequence cards) above the video queue; a card opens its section, and the script is edited on its own screen |
| Video | a tabbed surface — Configuration, Scenes, History and Logs — with Start in the shell's bar. Configuration is the General and six sequence cards, each carrying its derived sequence chips and opening its own screen; General also owns the scratch directory and the clip details sheet. Scenes is the no-scroll editor described in [Scenes tab layout](video.md#scenes-tab-layout), History reads the append-only timeline in [History tab](video.md#history-tab), and Logs is [Logs and anonymised export](video.md#logs-and-anonymised-export) |
| Settings → About | version, engine revision, licenses (GPL obligations), links to repository, website and documentation; release check; redacted support bundle |

## Surface documents

| Document | Covers |
| --- | --- |
| [Home](home.md) | project list, search, creation, deletion, retained-work size |
| [Settings](settings.md) | eight tabs: appearance, notifications, dependencies, encoders, project templates, storage, network, about |
| [Shell and navigation](shell.md) | top bar, back control, breadcrumb, section grid, palette and shortcuts |
| [Project and configuration](project.md) | section grid and queue, General, filter list, detection, noise, encoding, target quality, concatenation, quality check |
| [Script editor](script-editor.md) | Monaco, generated scene-data stub, save/cancel/dirty |
| [Video](video.md) | video Configuration overrides, Scenes, player and sources, Logs, History |

## Screen contract template

Every screen document follows the same order. A tabbed screen repeats the four concern
headings inside each tab, so one tab can be read end to end.

1. **Purpose.** One short paragraph: what the surface is for and what it owns.
2. **`## <Tab or section>`.** One heading per tab, sub-screen, or shared contract. Keep an
   existing section anchor where one already exists.
3. **`### <Section> layout`.** Regions, dimensions, board references, exact copy, and control
   inventory. Appearance only; no behavior.
4. **`### <Section> behavior`.** Numbered flows for ordered interactions, bullets for
   independent rules. Each rule states what happens and, only where surprising, a one-line
   `> Why:`.
5. **`### <Section> states`.** Loading, empty, error, populated, and locked/read-only. A
   state that cannot occur says **not applicable** and why.
6. **`### <Section> data and contracts`.** Route names, what is persisted or derived, and
   links to the owning backend document. Do not restate error, concurrency, or parser rules
   here.

The section name in each concern heading keeps every anchor unique.

**Shared contracts.** Project owns the full configuration-section contract; Video documents
its tab envelope, override rules, and differences, and links the Project section. Settings
→ Project Templates uses the same Project section contract.

**Writing rules.** Do not narrate development history, past bugs, or rejected alternatives.
State a counter-example only where it prevents a reader from repeating a likely mistake, in
one sentence. Tables are for inventories, state matrices, and exact labels; ordered behavior
stays numbered.
