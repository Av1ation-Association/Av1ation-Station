# Penpot file versions

The `.penpot` export is about 50 MB, so it is **not committed**. This page is the durable
reference to the reviewed file; the binary lives in the external design archive.

When a board set is approved:

1. Create a named version in Penpot (`File → Save version`).
2. Export the `.penpot` file to the archive outside the repository.
3. Fill in the row below with the file ID, revision, named version, date, archive location
   and SHA-256 of the export.
4. Update the approval reference in `docs/progress.md` if the revision changed.

| Date | File | File ID | Revision | Named version | External export | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-30 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `547` | pending — create `phase-0-app-boards` | pending — archive outside git | — |
| 2026-10-30 | Av1ation Station | `122350ae-89ad-8027-8008-dbc020d446ed` | `569` | — draft only; website design deferred to Phase 6 (D31) | not applicable | — |

## Current review

- The application board set (`00`–`10`) was reviewed and approved at revision `547` on
  2026-10-30; the named `phase-0-app-boards` version and external export are still pending.
- `11 Website` has eight root boards drawn at working revision `569` on 2026-10-30; they
  are export-reviewed but not approved. They are a draft deferred to Phase 6 (D31), not a
  Phase 0 gate and not a `phase-0-website` candidate. The nested `Website / Demo / Browser`
  and `Website / Demo / App` boards carry the demo's real app chrome.
- The `.penpot` file is the only artefact that carries boards **and** tokens; the
  generators and `tokens.json` are the reviewable, diffable sources in this repository.
