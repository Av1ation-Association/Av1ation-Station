# Settings

Settings is a tabbed screen: `Appearance`, `Dependencies`, `Encoders`, `Project Templates`,
`Storage`, `Network`, `About`. The tab strip replaces the page heading; the breadcrumb
already names the screen, so the content does not repeat it. A tab switch with a dirty draft
asks save / discard / stay before the panel changes.

## Contents

- [Appearance](#appearance)
- [Dependencies](#dependencies)
- [Encoders](#encoders)
- [Project Templates](#project-templates)
- [Storage](#storage)
- [Network](#network)
- [About](#about)

## Appearance

### Appearance layout

- Theme: `System`, `Dark`, `Light`.
- Row density: `Comfortable`, `Compact`.
- Reduced-motion switch, which mirrors the OS preference rather than replacing it.
- Each theme and density choice is drawn as a miniature of the window — a live skeleton, not
  a named option. Theme miniatures carry their own token values, because two themes are on
  screen at once.

### Appearance behavior

1. **Choose a theme or density.** The miniature previews the result immediately; there is no
   Apply button. Dark is the default.
2. **Change motion.** The switch mirrors the OS preference; it does not override it with a
   second independent setting.
3. **Persist.** Changes save through the settings endpoint as they are made.
4. **Leave.** A tab switch with a dirty draft asks save / discard / stay before the panel
   changes.

### Appearance states

| State | Contract |
| --- | --- |
| Loading | The tab shows its saved values and skeleton miniatures until settings resolve. |
| Empty | Not applicable; Appearance always has a theme, density, and motion value. |
| Error | A persistence failure stays inline; the last saved values remain visible. |
| Populated | The current theme, density, and motion choice are selected and previewed. |
| Locked | Not applicable; Settings is not part of an encode lock. |

### Appearance data and contracts

- **Settings document.** `GET` / `PATCH /api/settings`.
- **Tokens.** Theme values come from the shared token source; see
  [frontend-penpot.md](../frontend-penpot.md).
- **No Apply state.** Every change is persisted immediately.

## Dependencies

### Dependencies layout

- A dependency inventory, not a health banner on Home. Each row carries the observed version,
  status, and remediation.
- Rows are grouped by capability — decode, encode, **muxing**, metric — not by executable
  name.
- **VapourSynth** carries a **source** control: **Bundled** with the shipped runtime and
  **System** with the version the probe found. The inactive source stays visible.
- **Scene detection** is a model row above the executable groups.
- **Script editor** is an interpreter row with a picker and completion-provider line.
- **Diagnostics** is one action card beside the inventory: `N of M` available, a proportion
  bar, and **Run preflight**.
- Every row expands in place into its own editor: a saved path (or "Resolved on PATH"), one
  text field, and **Locate…**.
- A row that already uses a saved executable offers **Use the build on PATH**.

### Dependencies behavior

1. **Group by capability.** A capability may be satisfied by more than one provider. FFmpeg
   is a muxing provider, not a decoder. Versions are what the engine reports; there is no
   required-version column because no version requirements are defined.
2. **Read a null probe.** A null probe renders as "not installed" with the command to install
   it, never as a zero version.
3. **Choose the VapourSynth source.** It is the only row with a source control in this build,
   because it is the only capability whose bundle resolver is wired. Other executable and
   metric rows keep their existing probe and **Locate…** lifecycle until their resolver
   lands; the scene-model row stays a path plus the engine's search.
4. **Resolve an empty VapourSynth setting.** It reads as **Bundled** when the bundle is
   healthy, otherwise **System**; the control shows the resolved choice rather than an empty
   third state. Choosing a source saves immediately. A platform with no bundled runtime keeps
   the Bundled card visible but disabled, so the choices stay comparable.
5. **Restart after a VapourSynth source change.** VSScript and its Python initialise once per
   process. The row says so. It has no **Locate…** control: VapourSynth is a library unit
   rather than an executable family, so the two sources are the whole choice and
   `VSSCRIPT_PATH` remains an advanced external override.
6. **Treat the report as app-wide.** A missing dependency disables only the capability it
   names, never the app, and availability is not per-video. Refreshing keeps the previous rows
   visible while the new probe runs, because a probe that briefly replaces the list with a
   spinner makes a working install look broken.
7. **Edit a custom executable.** The row already names the capability and its saved path, so
   there is no separate "add a custom executable" form and no second family question. An
   expanded row holds the saved path and one text field beside **Locate…**. Locating is the
   whole action: the picker's result is probed and, when accepted, becomes the provider
   immediately, so there is no second probe-and-save button. A typed path applies with Enter.
8. **Use the family probe.** The probe is the same family probe the server always used
   ([preflight.md](../preflight.md) §Custom executables). An accepted path becomes the
   provider immediately, with no restart and no second screen.
9. **Locate mkvmerge.** `mkvmerge` is a locatable muxing executable even though it is not an
   encoder. It joins FFmpeg as a muxing provider (`ToolFamily::MkvMerge`), so a user who keeps
   MKVToolNix outside `PATH` can point the application at it instead of editing the
   environment.
10. **Set the scene model.** The one ONNX file the neural detector needs is a
    **Scene detection** row above the executable groups.
    - It is not project configuration: one file serves every project, so the row stores
      `AppSettings.scene_model`.
    - **Locate…** applies the picked path at once; **Use the engine's search** clears it.
    - The service refuses a relative path or a missing file before writing, because the path is
      the host's and a typo would otherwise surface at the start of an encode.
    - A host without a picker keeps the text field and applies it with **Save** or Enter. This
      is an application path, never a browser file.
11. **Set the script interpreter.** The **Script editor** row stores
    `AppSettings.python_interpreter`, the interpreter the language server analyses. Packages
    belong to an interpreter, so a venv's packages are invisible until this row names its
    `python`. The status chip shows the version the service read from the file, and says
    **Not verified** when the file did not answer rather than claiming the environment is in
    use.
12. **Show the completion provider.** The row names the provider under the interpreter —
    `Completion · jedi-language-server 0.47 (bundled)` when the shipped server will start —
    so the provider and its version are visible where the interpreter is chosen.
    - A host with no server shows no provider line, because completion there is the editor's
      own tables.
    - **Locate…** saves the picked executable; **Automatic** clears the setting.
    - The scene page's footer repeats the path and version, because that is where the user
      sees what completion is reading.
13. **Pick an interpreter.** The interpreter is a picker, not a text field. Its first entry is
    **Automatic — the machine's or bundled Python**; the rest are the interpreters
    `GET /api/editor/interpreters` confirmed, each labelled with its version, its path, and
    how it was found (`PATH`, `VIRTUAL_ENV`, `CONDA_PREFIX`, `py launcher`, `bundled`).
    Choosing one saves immediately, as **Locate…** does; a path the list does not name stays
    selected as **saved** rather than disappearing.
14. **Explain an empty setting.** The service resolves the system interpreter first and the
    staged bundled runtime last, and the row names whichever it chose. A clean install reads
    **Default · Python 3.14.10** with **from the bundled toolchain** in the helper line.
    **No Python found** is the one honest fallback, and the helper line explains it. The same
    interpreter is forwarded to the server, so the row and the completion it describes cannot
    disagree.
15. **Clear an interpreter.** **Automatic** is the clear action; there is no second "use the
    machine's Python" button, because it would do exactly what the first entry does. A host
    without a host picker keeps a text field and **Save** beside the picker, and Enter submits
    it.
16. **Revert an executable.** A row that already uses a saved executable offers **Use the
    build on PATH**. That is the only per-row action: expanding, probing, and reverting cover
    the lifecycle; there is no Edit/Remove pair to fall out of line with the status chip. The
    summary line keeps the same height in every row; actions live in the expanded body.
17. **Run diagnostics.** The **Diagnostics** card states `N of M` available, draws a
    proportion bar, and owns **Run preflight**. Running a probe is a diagnostic operation, not
    another inventory row, so it is not inline with the panel heading; as its own card it
    also stops the count and button from moving between tabs.
18. **Pick a path.** Every path is a text field with **Locate…** wherever the host can open a
    native file dialog.
    - The desktop host supplies the picker through the `dialog` plugin and passes it to the
      transport as an optional capability (`Transport.pickExecutable`), so the screen renders
      the button only when the host has one.
    - A LAN browser and the website demo fall back to the text field, and typing a path is
      always available ([AGENTS.md](../../AGENTS.md) §2.7).
    - A host that reports a dialog failure shows the reason and tells the user to type the
      path instead of silently doing nothing.
19. **Render the model.** Grouping, status vocabulary, and remediation text are defined by
    the preflight model in [preflight.md](../preflight.md); Settings renders that model and
    does not compute availability itself.

### Dependencies states

| State | Contract |
| --- | --- |
| Loading | Skeleton rows match the inventory; a refresh keeps previous rows visible while the probe runs. |
| Empty | Not applicable; the inventory always lists the capability groups. |
| Error | A failed probe is a row with its remediation, not an app error; a dialog failure stays inline; a host with no language server shows no provider line. |
| Populated | Rows show status, version, remediation, source controls, and the diagnostics card. |
| Locked | Not applicable; Settings is not part of an encode lock. |

### Dependencies data and contracts

- **Settings document.** `GET` / `PATCH /api/settings`; `custom_tools`, `scene_model`, and
  `python_interpreter` live in the one settings document.
- **Preflight inventory.** The report comes from the preflight model; see
  [preflight.md](../preflight.md).
- **Interpreter discovery.** `GET /api/editor/interpreters`; the selected interpreter is
  forwarded to the language server.
- **Diagnostics.** **Run preflight** is a diagnostic action, not a persisted setting.

## Encoders

### Encoders layout

- A master-detail catalogue of the encoders this engine build exposes, grouped into
  **Built-in** and **Your builds**.
- A built-in detail carries identity, availability from the preflight inventory, its
  provider, and an editable parameter table, in that order.
- The provider line names the executable in use and, when it is a saved override, carries
  **Use the build on PATH** beside it.
- **Locate…** is the only executable action on a host with a native dialog. A host without a
  picker keeps the text field and one probe button; a typed path applies with Enter.
- **+ Add build…** form: base encoder, display name, executable, **Locate…**, **Probe help
  output**, and **Save build**.
- **Parameter table.** Each row's first line is the human label with the CLI key in
  parentheses, **Constant Rate Factor (--crf)**. The second line carries the group, the
  description, the value type, and the default when one exists. A documentation icon follows
  the key when the descriptor has a link. The label is the edit affordance; the only trailing
  action is a trash icon that widens on hover or keyboard focus to reveal **Remove**.
- **Parameter editor sheet** (`04 Settings / Parameter editor`): live preview, key as prefix
  + name, label, description, documentation link, kind and widget, number constraints,
  up to eight optional slider marks, default and group, an **Advanced** switch, and declared
  `Requires` relations.
- **Open JSON** opens `/settings/encoders/:id/json`, the same descriptor set as one document
  in a bundled Monaco editor.

### Encoders behavior

1. **Choose an encoder.** The catalogue starts from the engine's own option map and layers a
   curated table over it, so a built-in opens with named, described parameters rather than
   bare option keys.
2. **Read a built-in.** Identity, availability, provider, and parameter table run in that
   order: the executable is what the table describes, and putting it above the table keeps
   it visible instead of below a long scroll.
3. **Revert a provider.** The revert sits next to the path it undoes, not in a second action
   row, and removes the override immediately.
4. **Add a build.** **+ Add build…** saves a build of an existing encoder as an additive fork.
   - The form picks the base encoder, a display name, and an executable.
   - **Locate…** probes at once; **Probe help output** re-runs it for a typed path.
   - The probe runs only `--version` and `--help`, verifies the family stamp, and parses option
     lines into typed descriptors.
   - **Save build** persists the executable and parsed parameters in
     `AppSettings.encoder_forks`; the new row appears at once, without a restart.
5. **Keep forks additive.** A fork is not a provider replacement: probing a built-in provider
   and adding a fork are different actions, and the built-in provider stays where it is.
6. **Curate from the encoder.** Names, descriptions, groups, and documentation links come
   from each encoder's own repository — the SVT-AV1 `Docs/Parameters.md` table, the aomenc
   source for AOM and AVM, `x265`'s CLI reference, vvenc's wiki, and the FFmpeg codec
   documentation. The table only adds flags the encoder accepts. An entry the engine already
   seeds keeps its observed kind, delimiter, and default; the curated row may fill a minimum,
   maximum, or step the engine leaves unstated.
7. **Use documented defaults.** A curated row the engine does not seed carries the shipped
   build's documented default — the SVT-AV1 `--full-help` output, which supersedes the
   upstream table where the two disagree — so a switch starts in the state the encoder
   actually uses. A preset-dependent default stays unset, because no single value is right for
   every preset. `vvenc` and `ffmpeg` seed no options at all, so their catalogue rows come
   entirely from this table.
8. **Edit a row.** Every parameter table is editable, for a built-in and for a fork. Clicking
   the label opens the parameter editor; there is no separate Edit button. The trash icon
   widens on hover or focus without changing the row height, and the widening is disabled
   under reduced motion.
9. **Edit a choice.** A choice kind declares whether its values are Text or Number.
   - Edits are a compact grid of rows — Value, optional Label, optional Description, and a
     remove action — with **Add value** appending a row.
   - A numbered choice stores the number the encoder receives while the row shows its label.
   - Values are drawn as radio, segmented, or a dropdown; `Auto` is the documented rule, radio
     or segmented up to four values and a dropdown above that.
   - A selected value's description appears beneath the control.
10. **Edit a path or text.** A path kind is a text field with a **Browse** button inside its
    right edge (the host picker; a browser keeps the field alone). A text kind can declare
    Email, URL, or ISO-8601 date-time so the field validates as the user types.
11. **Infer a switch.** A number whose range is 0–1 draws as a switch: `Auto` infers it from
    the range, and the Widget choice can force **Switch (0/1)**, which also sets the range. A
    switch always writes `0` or `1`, so its row action reads **Unset** — clearing the row is
    the only way back to the encoder's own default. A choice never degrades into a text field
    when the sheet reopens.
12. **Read the preview.** The preview carries the same info icon as a rendered parameter field
    (`01 Components / Parameter info`): click or keyboard focus opens the CLI key, the
    separator as a visible glyph and name (`␠ Space`, `⇥ Tab`, `⏎ Return`, or `=` for a joined
    delimiter) with its argv shape, the description, and the documentation link; Escape closes
    it and returns focus to the icon.
13. **Refuse invalid descriptors.** Keys are unique by prefix and name; a duplicate, an empty
    label, a non-numeric number default, an inverted range, or a relation that names the
    parameter itself is refused in the sheet and again by the service.
14. **Store overrides.** A built-in's edits are stored as an override beside its encoder id,
    not written over the engine definition: the override records the descriptors the user
    added or replaced and the engine keys the user removed, so an engine parameter added in a
    later build still appears unless it was deliberately hidden. **Restore engine
    descriptors** clears the override. A fork's edits are its own map.
15. **Re-probe a fork.** A saved fork is re-probed when the service starts, so its map follows
    the executable's current help instead of the one recorded when it was saved; an executable
    that cannot be read keeps its last good map. The probe remains best-effort: a help line
    with no value evidence stays a switch, prose that names a path or format stays text, and
    the raw help output stays available under the probe result for correction.
16. **Use a fork in a project.** Selecting a fork in a project's Encoding section writes its
    executable and starting options into that project's engine encoder document; the catalogue
    entry itself is never mutated by a project.
17. **Commit from the top bar.** The table's draft is committed from the shell's top bar like
    every other screen: while dirty, the bar shows **Unsaved changes** and the expandable
    **Undo**, **Redo**, **Discard**, and **Save** actions
    ([frontend.md §5](../frontend.md#5-draft-undoredo-and-save)); when clean it shows only the
    disabled Save, because a second **Saved** badge would repeat what the disabled action
    already says.
18. **Open JSON.** It validates against the generated contract on every edit, for JSON syntax
    and for the descriptor schema, and every problem is located.
    - The editor shades the exact characters and the list under it states `line 4, col 7`, the
      descriptor path, and the contract's message.
    - Selecting a problem moves the cursor to it and focuses the editor.
    - The generated schema reports a bad field as one issue naming only its descriptor and
      hides the field problem in `params.issues`, with a second union branch that always says
      `expected never`; the page unwraps both so the user reads `--crf.label`, not the
      machinery.
    - A field that is absent has no characters to shade, so the marker falls back to the
      descriptor key that should contain it.
    - The parameter preview appears only once the document validates, and **Save** stays
      disabled until then; a saved change rewrites the document in its pretty-printed form.
19. **Switch safely.** Switching to another encoder, another Settings destination, or another
    route with a dirty table asks before discarding it
    ([frontend.md §5](../frontend.md#5-draft-undoredo-and-save)). The card is keyed by
    encoder; the parameter pane and executable pane have distinct keys, so switching replaces
    both panes rather than appending a stale one.
20. **Preview parameters.** The preview is not a second rendering of the parameters: it is the
    same `ParameterValueGrid` that Configuration → Encoding draws, down to the control each
    descriptor's kind selects, so a flag is a switch here when it is a switch there and a
    bounded number is a slider with its default marked. A descriptor's curated marks are
    labelled under the track; a label that would collide appears when its own tick is hovered
    or focused.
    - Its groups are packed in masonry columns, not grid rows.
    - Its values are scratch — the document states descriptors, not values — so they start at
      each descriptor's default and never reach the draft.
    - Only a row whose descriptor documents a default is marked once the user changes it.
21. **Import and export.** **Export** writes the validated document to a file named in the
    host's save dialog. **Import** reads one, checks it before replacing anything, and asks
    before it replaces a dirty draft; a file the contract rejects is still opened, with its
    problems located under the editor, because a refused file cannot be corrected. A host
    with no filesystem keeps its download fallback.
22. **Use the bundled language service.** The editor's JSON language service is bundled and
    runs in its JSON worker, the same way the script page bundles Monaco because the window
    has no network.
    - It reads the emitted `schema/encoder/parameter-descriptor.json`, not a second hand-written
      description list.
    - Folding follows the document's objects; hovering a field states the contract's sentence
      about it; completion offers the descriptor's fields and the values of a closed set
      (`kind`'s `Flag`).
    - The service's own validation stays off, so it never paints a second, differently located
      set of squiggles. Word-based suggestions are off for the same reason.
23. **Reuse in Target Quality.** Target Quality has its own parameter override in the Target
    Quality section; it defaults to "Same as Encoding" and uses the same table. It is not a
    second encoder screen.

### Encoders states

| State | Contract |
| --- | --- |
| Loading | The catalogue and preflight availability render a skeleton; the selected detail keeps its place. |
| Empty | No saved builds is valid; the built-in catalogue still lists every encoder. A parameter table with no overrides opens on the engine and curated descriptors. |
| Error | A probe failure, invalid descriptor, failed import, or save error stays inline with the control that caused it. A refused import still opens with located problems. |
| Populated | The selected encoder, provider, parameter table, saved builds, and preview are visible. |
| Locked | Not applicable; Settings is not part of an encode lock. |

### Encoders data and contracts

- **Catalogue.** Encoder catalogue and preflight inventory; see
  [backend.md](../backend.md) and [preflight.md](../preflight.md).
- **Builds.** `AppSettings.encoder_forks`; additive, never a provider replacement.
- **Overrides.** Built-in edits are stored beside the encoder id; **Restore engine
  descriptors** clears them.
- **JSON.** `/settings/encoders/:id/json`; the emitted `schema/encoder/parameter-descriptor.json` is
  the only schema source.
- **Target Quality.** The same table is reused, with a "Same as Encoding" default.

## Project Templates

### Project Templates layout

- **A searchable template list, not one global document.** The list carries the template
  count, a search field, and a split **Add template** control. The primary side opens the
  Add dialog; the chevron menu carries **Import template…**. Each row has a star toggle, the
  template name, a detail line, a download action, and a delete action. The template marked
  default also carries a **Default** chip. On a data directory with no `config.json`, the list
  starts with one ordinary **Recommended** template; it has no badge and no separate Copy
  action.
- **Add template** opens a dialog with one name field, **Cancel**, and **Create**. Its copy
  says the new template starts from the engine defaults and is configured afterwards.
- **Import template…** opens a multi-file picker. The same importer accepts files dropped
  onto the Project Templates screen; an overlay names the drop action and the ten-file
  limit. The desktop host disables its native drop handler so the page receives the HTML5
  drop.
- **A row's download action** exports one template. An export with nothing removed saves
  immediately; an export that removed a host path first opens the portability report with
  **Included in the file** and **Removed for portability** columns. The exporting row's
  download button is disabled while its file is prepared, and a failure appears in the
  inline notice above the list.
- **One template's overview** carries an inline-editable name, a one-line explanation, seven
  cards in project order, and **Reset all to engine defaults**. The cards are General plus
  the six pipeline sections.
- **A section editor** reuses the project's `SectionParts` and draft contract. General uses
  the shared `GeneralDefaultsEditor` and `InputEditor`. Each editor carries **Discard** and
  **Save** in the shell's top bar and its own **Reset section** action.
- **The template script is its own page**, not a field. It reuses the Script editor and its
  tabs, including the generated `condor_data.pyi`. It opens from the input that owns the
  script.
- **Delete template** opens a confirmation stating that existing projects keep their copies
  and that the deletion cannot be undone.
- The Settings tab strip is one tab stop and its arrow keys move between the seven tabs.

### Project Templates behavior

1. **Search.** Search narrows the list by template name as the user types; a query that
   matches nothing offers the clear action. The count always describes the full list.
2. **Mark the default.** The star toggles the template new projects copy. One template is
   default at a time; a newly created first template becomes default automatically. Deleting
   the default promotes another existing template, or leaves no default when none remain.
3. **Add a template.** **Add template** requires a non-empty name. The service creates the
   template from the engine defaults and the new row appears in the list; open it to configure
   its sections. A refusal stays inline in the dialog. The chevron beside it opens **Import
   template…** without adding a second header button.
4. **Open and edit.** A row opens that template's overview. A card opens exactly one section
   editor, so a draft cannot be swapped for a sibling section without the shared leave guard.
5. **Rename.** The name on the overview is inline-editable. Enter or blur saves; Escape
   restores the stored name. The whole template is updated, so the service validates its
   configuration and General document on the same request.
6. **Reset one section.** **Reset section** returns that section to the engine defaults and
   keeps every other section's overrides. A dirty draft is discarded by the confirmed reset.
   Existing projects are not changed.
7. **Reset the template.** **Reset all to engine defaults** restores the configuration and
   General section after confirmation. It does not rename the template, change the default
   marker, or change an existing project.
8. **Delete a template.** The confirmation names the template and states that projects
   already created from it keep their own copy. **Delete** removes it; **Cancel** closes the
   dialog.
9. **Copy at creation.** A new project copies the template marked default into `project.json`;
   with no default template it starts from the engine defaults. Editing a project never
   changes a template, and editing a template never changes an existing project.
10. **First run.** When the service starts with no `config.json`, it seeds one ordinary
    **Recommended** template. It is not marked default, so a new project still starts from
    the engine defaults until the user stars a template. The seed runs once; an existing
    settings file, even one with no templates, is never changed.
11. **Apply to an existing project.** The Project screen's **Apply Template** picker lists the
    templates, marks the default, and calls `POST /api/projects/{project_id}/template` with the
    chosen `template_id`. It replaces that project's configuration and General section, keeps
    the video overrides, and offers Undo/Redo in the project top bar.
12. **Edit the script.** The script page saves either General's script or one sequence input's
    script, named by the `section` and `part` search params. A template has no video, so
    **Check** explains that a script can be evaluated only after it is in a project with a
    queued video.
13. **Guard a dirty template.** Switching a section, Settings tab, or route with a dirty draft
    asks first. The guard names the template document, never a project.
14. **Import a batch.** The picker and a drop share one importer. Up to ten `.json` files are
    read sequentially; an over-limit selection is refused before any file is read. Each
    imported template is a new row under a case-insensitive unique name (`Name`, `Name (2)`, …)
    and never becomes the default. A full success raises one toast. A partial failure keeps
    the rows that succeeded and shows an inline warning with one line per rejected file and
    **Choose another file**; the batch continues after each failure.
15. **Normalise on import.** The imported document is sanitized with the same rules as export
    before it is validated and saved, so a hand-edited archive cannot reintroduce a path the
    exporter would have removed.
16. **Report portability.** Export clears the output folder, the FFMS2 index, custom encoder
    executables, sequence scene directories, sequence input paths, a TransNetV2 model path,
    and a sequence output path. Labels name what was removed and never repeat the value. The
    General file-mode `.vpy` input is the one refusal: the file is the input, so export asks
    the user to switch to inline text or a different input kind.
17. **Keep authored content.** Inline VapourSynth scripts and script variables stay in the
    archive; the report states that they are included.
18. **Drop onto Project Templates.** A file drop is accepted only on that screen. A
    document-level guard prevents a dropped file elsewhere from navigating the webview.

### Project Templates states

| State | Contract |
| --- | --- |
| Loading | The list, overview cards, section editor, and script page render layout-matching skeletons. |
| Empty | No templates is valid: the list offers **Add template**, and a new project starts from the engine defaults until one is marked default. |
| Error | A list, template, section, or script load failure offers retry. Add, rename, save, reset, delete, export, import, and script failures stay inline with the action that caused them. |
| Populated | The list shows every template and its default marker; the overview shows all seven cards; a section shows its saved values and provenance. |
| Locked | Not applicable; template edits are independent of run locks. |

### Project Templates data and contracts

- **Settings document.** `AppSettings.project_templates` holds the list and
  `AppSettings.default_project_template_id` names the default. The fresh-directory seed is
  a server-side write to that same array; there is no built-in flag and no extra route.
- **Template list and creation.** `GET`/`POST /api/settings/templates`; creation sends
  `{ name }` and returns the new template.
- **Default marker.** `PUT /api/settings/templates/default` with `{ id }`, or
  `{ id: null }` to clear it.
- **One template.** `PUT`/`DELETE /api/settings/templates/{template_id}` replaces its name,
  configuration, and General document, or deletes it.
- **Configuration.** `GET`/`PUT /api/settings/templates/{template_id}/defaults`;
  `POST /api/settings/templates/{template_id}/defaults/reset`;
  `POST /api/settings/templates/{template_id}/defaults/reset/{section}`.
- **General.** `GET`/`PUT /api/settings/templates/{template_id}/general`.
- **Script scan.** `GET /api/settings/templates/{template_id}/scripts`.
- **Export.** `GET /api/settings/templates/{template_id}/export` returns
  `{ filename, archive, report }`. `archive` is the exact file; `report` carries removed
  labels, `includes_scripts`, and `includes_variables`.
- **Import.** `POST /api/settings/templates/import` takes one archive and returns
  `{ template, removed }`. The envelope is
  `{ kind: "av1ation.project-template", schema_version: 1, exported_at, template: { name,
  config, general } }`. Unknown fields are rejected; a wrong kind or an unknown version is a
  distinct `422`; malformed JSON is `400`.
- **Duplicate names.** Import suffixes the display name case-insensitively; it never
  overwrites a row and never sets `default_project_template_id`.
- **Apply to a project.** `POST /api/projects/{project_id}/template` with `{ template_id }`;
  `PUT /api/projects/{project_id}/defaults` restores the before/after snapshot used by
  Undo/Redo.
- **UI routes.** `/settings#project-templates`; `/settings/templates/<templateId>`;
  `/settings/templates/<templateId>/<section>`; `/settings/templates/<templateId>/script`.
- **Shared components.** `SectionParts`, `GeneralDefaultsEditor`, and `InputEditor`.

## Storage

### Storage layout

- Titled **Working space**; reads `/api/storage`, which measures every number at read time.
- **Temporary directory.** The scratch override: path field, **Change…**, and **Use
  default**; the free-space bar shows free of total and the retained bytes on that volume.
- **Application data.** The resolved app-data directory with **Reveal** and the log, manifest,
  catalogue, and total footprints.
- **Retention.** The **Keep encoded scene chunks after a successful run** switch, on by
  default.
- **Right column.** **Retained work by project** with a per-video breakdown link, the total,
  and one bar segment for encoded chunks.

### Storage behavior

1. **Measure on read.** Every number is measured at read time, not cached into a stale total.
2. **Change the scratch root.** The scratch override lives here and on the video's General.
   The free-space bar shows free of total and the retained bytes on that volume.
3. **Reveal app data.** The resolved app-data directory exposes its log, manifest, catalogue,
   and total footprints.
4. **Keep chunks.** The stored setting is the inverse (`delete_chunks_on_success`), but the UI
   never presents retention as an advanced opt-in. Turning it off removes the Quality Check
   and scene-only re-encode workflows.
5. **Save storage settings.** **Save storage settings** and **Cancel** sit in the shell's top
   bar like every other draft; a dirty path or retention change is guarded before a
   destination or route change.
6. **Delete per video.** There is no bulk delete. A project with no retained work is omitted
   from the retained-work list. A path that is not writable is rejected on selection, before
   it is saved.

### Storage states

| State | Contract |
| --- | --- |
| Loading | The tab shows skeleton totals and a disabled path field while `/api/storage` resolves. |
| Empty | No retained work is valid; the retained-work list omits projects with none and the total stays empty. |
| Error | A read failure stays inline; a path that is not writable is rejected on selection, before save. |
| Populated | Scratch path, free/total, app-data footprints, retention, and retained work by project are visible. |
| Locked | Not applicable; Settings is not part of an encode lock. |

### Storage data and contracts

- **Storage report.** `GET /api/storage`; every number is measured at read time.
- **Settings.** `temp_dir` and `delete_chunks_on_success`; the UI presents retention as the
  positive switch.
- **Scratch ownership.** The video's General and Settings own the override; see
  [backend.md](../backend.md) §6.1.
- **Deletion.** Per video only; no bulk delete.

## Network

### Network layout

- LAN access: the enable switch, the bound address and port, the pairing token,
  eight-character shortcode, QR, connected-session count, and revoke.
- The selected session shows its code and token with copy actions.
- The browser page accepts either the token or the code, a full pairing link, or the code with
  its hyphen, spaces, or lowercase omitted.
- The browser page is a standalone screen before the router mounts. It uses the same design
  tokens and shared Button, and keeps the service's retry countdown inline.

### Network behavior

1. **Enable LAN.** The switch starts the LAN listener and exposes the bound address and
   pairing material.
2. **Pair.** A session accepts the token, a full pairing link, or the shortcode with optional
   hyphen, spaces, or lowercase.
3. **Throttle bad codes.** Five bad codes from one address pause that address for the rest of
   a one-minute window; the form disables itself and counts the service's `Retry-After` down
   in place, then re-enables with the message cleared when the wait expires.
4. **State the firewall rule.** The screen states the rule needed for the chosen port and
   never claims the service is reachable on an address it is not bound to.
5. **Disable LAN.** Disabling revokes every token in the same action.

### Network states

| State | Contract |
| --- | --- |
| Loading | The tab shows skeleton controls while the settings and LAN status resolve. |
| Empty | LAN disabled is valid; there are no sessions to show. |
| Error | A refused bind, bad pairing, or throttled code stays inline; the retry countdown is shown in place. |
| Populated | The bound address, pairing material, sessions, and revoke actions are visible. |
| Locked | Not applicable; Settings is not part of an encode lock. |

### Network data and contracts

- **LAN settings and sessions.** The LAN controller owns the token, shortcode, sessions, and
  expiry; see [security.md](../security.md).
- **Pairing.** The browser page accepts the token or shortcode; the pairing route is
  same-origin.
- **Disable.** Revokes every token; no session survives.

## About

### About layout

- A Settings destination, not a route of its own, so the application has one About page.
- Version from `/api/health`, never a hardcoded string; the engine package version and pinned
  revision; the API contract; the GPL obligations and licence link; the repository, website,
  and documentation links.
- **Bundled toolchain.** A full-width card below the two-column cards lists the target lock's
  components: id, version, licence, source link, and artifact hash. The target triple and lock
  revision sit in the header. Installed paths are not part of the response.
- **Check now** and **Export…** actions.
- The diagnostics bundle's project list is one dropdown of checkboxes rather than a row per
  project, and starts on the project used most recently.

### About behavior

1. **Read the version.** Version comes from `/api/health`; the engine package version and
   pinned revision are shown with it, never hardcoded.
2. **Check for updates.** **Check now** reads the newest published release through
   `GET /api/update`; a repository with no release is a normal answer, and an available
   release opens its page rather than downloading anything.
3. **Export diagnostics.** **Export…** builds the bundle from `GET /api/diagnostics/bundle`
   only when pressed, then asks the host where to write it. The bundle is redacted by the
   service before the screen sees it, and the copy action never writes a file.
4. **Inspect the bundle.** The toolchain card reads `GET /api/toolchain` and renders the
   target's components from the lock embedded in the running binary. A component's **Source**
   link opens its provenance page; the hash is the reviewed artifact digest. The layout is
   accepted provisionally for v0.1 because the live Penpot board is unavailable; the live
   comparison is deferred.
5. **Link from elsewhere.** Home's footer links to `/settings#about`; the palette's About
   entry does the same.

### About states

| State | Contract |
| --- | --- |
| Loading | The version card and the toolchain card render skeletons. |
| Empty | No published release is a normal answer; the running build is still shown. An empty lock summary lists no components. |
| Error | Update-check, toolchain-summary, and diagnostics-export failures stay inline; the copy action does not write a file. |
| Populated | Version, contract, licences, links, actions, and the bundled components are visible. |
| Locked | Not applicable; Settings is not part of an encode lock. |

### About data and contracts

- **Health.** `GET /api/health`.
- **Toolchain.** `GET /api/toolchain`; the summary is embedded at build time from the target's
  reviewed lock and never reads the filesystem.
- **Updates.** `GET /api/update`; an available release opens its page.
- **Diagnostics.** `GET /api/diagnostics/bundle`; redacted server-side before the screen sees
  it.
