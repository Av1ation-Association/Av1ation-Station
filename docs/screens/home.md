# Home

The project list is the landing surface and the only place projects are created, renamed, or removed. Rows are compact and carry two text lines, not a six-column table.

## Project list

### Project list layout

| Cell | Source | Notes |
| --- | --- | --- |
| Name | project manifest | line one, 14px medium; the name opens the project; a pencil action starts inline rename |
| Path + open directory | resolved project path | line two; a folder button precedes the path and reveals it in the OS file manager where the host has one |
| On disk | project directory | trailing stack, right-aligned; recursive size of the project directory (manifest, run logs, chunks, probes), e.g. `47.9 GB on disk` |
| Videos | derived from project state | trailing stack, right-aligned; completed / total, e.g. `7 / 12 videos` |
| Delete | — | row action only; destructive confirm states what is removed on disk. The column is unlabelled |

- Name and path take all remaining width. Size and video count stack vertically in one
  right-aligned cell immediately before the delete action, so a short list does not leave a
  wide dead gap.
- Dates are hidden at this width. Created and last-updated are available on the project and
  video detail screens, where they matter for diagnosing staleness.
- A search field sits in the list's header line beside **New project**. It is a real
  `type="search"` input with a clear action.
- Home has exactly one primary action, **New project**. There is no **Import** action.
- **New project** opens an inline form below the header, not a dialog. It carries one
  `Project name` field (maximum 120 characters), **Create project**, and **Cancel**.
- The footer names the application and, once health resolves, its version. It links to
  GitHub, Website, and Documentation, and its **About** link opens `/settings#about`.

### Project list behavior

1. **Open.** A row opens its project. The list stays in last-accessed order, so the project a
   user returns to is first.
2. **Search.** Search narrows the list in place, matching a project's name or folder path
   case-insensitively. Ordering is never part of the query — a filtered list keeps the same
   last-accessed order.
3. **No match.** A search that matches nothing says so and offers the clear action rather
   than an empty list.
4. **Create.** **New project** reveals the inline form and moves focus to the name field.
   - The submitted name is trimmed. An empty name or one longer than 120 characters is
     refused; **Create project** stays disabled while the field is empty or the request runs.
   - Success closes the form, clears the field, and shows a toast. A refusal stays inline in
     the form with the service's message. **Cancel** closes the form without creating.
   - The new project copies the project template marked default; with no default template it
     starts from the engine defaults.
5. **Rename.** The pencil action appears on row hover or keyboard focus. It opens an input in
   the name cell with the current name selected.
   - Enter or blur commits; Escape restores the stored name. An unchanged name closes the
     input without a request.
   - The service requires 1–120 characters. A refusal stays inline under the row; success
     keeps the list in place and shows a toast.
6. **Last accessed.** Last-accessed is distinct from last-updated: opening a project updates
   access time without marking its configuration dirty.
7. **On-disk size.** The number is the recursive size of the project directory, not the size
   of the source video. It includes the manifest, run logs, and each video's chunk and probe
   trees; source videos are outside the project and are not counted. The cell shows `—` only
   when the service reports zero.
8. **Open the folder.** Where the host supplies a path-reveal capability, the folder button
   opens the project directory in the OS file manager. A LAN browser or demo keeps the
   static icon and its explanation instead of offering an action it cannot perform.
9. **Delete.** Delete opens a confirmation naming the project and its path. The copy states
   that the project directory — manifest, run logs, and retained chunks — is removed, and
   that source video files stay where they are. The dialog repeats the row's `size_bytes`
   figure. **Delete project** performs the removal; **Cancel** closes the dialog. A refusal
   stays inline in the dialog. The service refuses while that project has an active run.

### Project list states

| State | Contract |
| --- | --- |
| Loading | Skeleton rows match the final two-line row layout. |
| Empty | The list shows a dashed **No projects yet** panel with **New project**; search has nothing to narrow. The inline create form may be open above it. |
| Error | A list load failure shows an inline retry. Create, rename, reveal, and delete failures stay inline with the action that caused them. |
| Populated | Rows show name, path, retained size, video count, and the delete action. |
| Locked | Not applicable; Home has no section lock. A delete the service refuses stays inline. |

### Project list data and contracts

- **Routes.** `GET /api/projects`; `POST /api/projects` with `{ name }`;
  `PATCH /api/projects/{project_id}` with `{ name }`; and
  `DELETE /api/projects/{project_id}`.
- **Unused archive routes.** `POST /api/projects/import` and
  `GET /api/projects/{project_id}/export` exist, but Home exposes neither yet.
- **Version.** `GET /api/health` supplies the footer version; it is never hardcoded.
- **On-disk size.** `size_bytes` is the recursive project-directory size, measured when the
  list is read; source media and other projects are outside it.
- **Deletion.** Removes the project directory, including its manifest and run logs, and every
  queued video's retained chunks. Source media survives.
- **Footer links.** Repository, website, documentation, and About links come from the shared
  link constants; About is `/settings#about`.
- **No persisted view state.** Search and ordering are view state; last-accessed is the only
  order stored by the project.
