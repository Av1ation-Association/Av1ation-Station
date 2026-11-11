# Shell and navigation

The shell is one 56px top bar, mounted once. It owns global navigation, the Back target, and
the section-grid pattern; it never owns a screen's content or drafts.

## Navigation contract

### Navigation contract layout

- **Top bar.** The Back control, the mark (a link to Projects), the breadcrumb, and two icon
  actions: command palette and Settings.
- **No global sidebar.** Selecting a project makes it the work surface. Access to Projects is
  the mark and the breadcrumb root; Settings is always in the bar; About is reached from
  Home's footer or Settings → About rather than occupying a permanent control.
- **Palette.** It lists the global destinations. While Settings is open, it also lists every
  Settings tab so a jump between tabs does not need the strip. On a project or video route it
  lists that project's videos and that video's tabs, read from the route match rather than a
  second pathname parse; the tab list is the same one the video tab bar uses. Its footer
  prints the navigation keys, and its **Keyboard Shortcuts** entry opens a reference dialog.
- **Shortcut reference.** The dialog lists the whole chord scheme from
  `packages/ui/src/shortcuts.ts`, grouped into application commands and scene-player keys.
- **Back control.** Every screen except Home carries it, placed before the mark. Its mark is
  the logo mirrored to point left, with two tapered contrails that brighten on hover.
  Hovering expands it to show `Back to` above the contrails and the parent's name below them.
- **Breadcrumb.** Ancestors truncate from the left first; the current page never truncates.
- **Section grid.** The project screen uses it instead of a sidebar: General and the six
  sequence sections are cards in pipeline order — General, Scene detection, Noise generation,
  **Target quality**, **Encoding**, Concatenation, Quality check. The queue follows the grid,
  with its count and on-disk size in the section header.
- **Width.** Global surfaces start at the window gutter. Project and Configuration surfaces
  use the full window width; the video surface keeps its own column widths until it is
  reflowed.

### Navigation contract behavior

1. **Open the palette.** The palette lists global destinations and, on Settings, every tab.
   Its shortcut reference opens after the palette closes, because the palette's modal marks
   everything outside it hidden.
2. **Go back.** The target is computed from the route, not from browser history: a video
   subpage returns to the video; a video returns to the project; a project and Settings return
   to Projects; a Settings child returns to its Settings tab; a template section returns to
   its template summary; each script editor returns to the section that opened it.
3. **Open a section.** Each project card opens its own screen. Opening another section means
   returning to the grid, so a dirty draft cannot be swapped out by a sibling click without
   the guard.
4. **Keep the video local.** The video screen follows the same local-section pattern: on its
   Configuration tab the grid lists the video's sections; on its Scenes tab the column
   becomes the virtualized scene rail. Neither is global navigation, and neither exists on
   Home, Settings, or About.
5. **Keep the shell stable.** Only the outlet cross-fades; the top bar, breadcrumb, and
   draft actions do not remount.
6. **Write from the top bar.** Undo, Redo, Discard, Save, and the dirty state sit in the 56px
   top bar as expandable icon buttons. A section's content uses the reclaimed horizontal
   width.

### Navigation contract states

| State | Contract |
| --- | --- |
| Loading | The shell is mounted once; only the outlet shows a route skeleton. |
| Empty | Not applicable; the shell has no empty state. |
| Error | A route error renders in the outlet; the top bar and navigation remain usable. |
| Populated | The Back target, breadcrumb, and draft actions reflect the current route. |
| Locked | Not applicable; a dirty-draft guard can interrupt navigation, but the shell itself has no lock. |

### Navigation contract data and contracts

- **Back target.** Derived from the route, never from browser history.
- **Shortcuts.** `packages/ui/src/shortcuts.ts` is the single source for the palette's
  keyboard reference.
- **No stored navigation state.** The shell is mounted once; the current route supplies the
  breadcrumb and Back target.
