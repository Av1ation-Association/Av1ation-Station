# Decisions

Architecture decisions made after the implementation baseline. An entry is recorded here
while it is being settled; once accepted, its rule and rationale are folded into the document
that owns it, and the entry is removed. Numbers are sequential and are not reused.

## Entries

### 1. Public website uses the application identity

**Status:** accepted, website-only exception.

**Context.** The public website is not an application screen and has no Penpot board set.

**Decision.** The website is composed from the application's existing identity: its logo mark,
semantic tokens, Inter and JetBrains Mono, and real shared components. It may mount the real
application screens against fixture data, but it does not invent their layouts.

**Consequences.** `AGENTS.md` §2.12 and `docs/frontend-penpot.md` carry the website-only
exception. App screens remain board-governed. The site's review surface is the running page,
its build, and its budget; publication is still a release task.

### 2. About toolchain list built without the live board

**Status:** accepted for v0.1; live Penpot comparison unavailable and deferred.

**Context.** The About board exists only in the live Penpot `04 Settings` page; there is no
checked-in generator for it. On 2026-11-16 the live service was unavailable, and the owner
directed that it must not block delivery.

**Decision.** The **Bundled toolchain** list is added to the existing About panel using that
panel's card and token patterns. It does not introduce a new screen layout. The owner accepts
the checked-in layout provisionally for v0.1; the live `04 Settings / About` comparison is a
post-release design check, not a release gate.

**Consequences.** `docs/screens/settings.md` and `docs/progress.md` record the provisional
surface. This entry remains until the live comparison is recorded.

### 3. macOS ships best-effort; Windows/Linux are the validated targets

**Status:** accepted.

**Context.** The release owner has no macOS machine and no signing certificates. macOS must
remain in the build and release matrix, but its install, ad-hoc signing, and runtime cannot be
verified here. The updater key has no owner-accessible provisioning path.

**Decision.** Phase 5 builds and publishes Windows x64, Linux x64, and macOS arm64. The
hosted package job validates Windows/Linux installs and uninstalls, records macOS artifact
sizes, and does not claim macOS install or signing verification. macOS is labelled
best-effort and unverified; no macOS pass is a release gate. The updater remains deferred and
publishes no `latest.json`. Clean-VM and the manual release plan are deferred as v0.1 gates.

**Consequences.** `docs/releases.md` owns the three-target matrix and the best-effort macOS
labels; `docs/packaging.md` records the unverified macOS bundle; `docs/progress.md` marks
5.8/5.25/5.26 as partial and 5.6/5.13 as deferred. The package job keeps macOS artifacts in
the release but does not require a macOS host to pass it.

### 4. Phase 6 screens proceed from checked-in boards while Penpot is unavailable

**Status:** accepted provisionally; live-board reconciliation required before the stable tag.

**Context.** The Penpot MCP service is no longer available in this environment. Several Phase
6 items still need screen work, and the owner has authorised continuing the backlog without
the live file rather than stopping delivery.

**Decision.** Remaining Phase 6 screen work may be built from the checked-in
`design/penpot/boards/*.js` generators, the existing components, and the semantic tokens. A
screen built this way is accepted provisionally: it is called out in the hand-off, and every
changed screen is reconciled against the live board as soon as the Penpot service is
available. A surface with no checked-in generator at all is not invented; it is deferred for
design input instead.

**Consequences.** `AGENTS.md` §2.12 and `docs/frontend-penpot.md` describe the exception.
`docs/progress.md` records the provisional screens and the outstanding reconciliation. This
entry is removed only when the live comparison is recorded.

### 5. Portable data root follows the launch artifact

**Status:** accepted.

**Context.** A3 required every portable installation to keep projects, settings, logs,
thumbnails, scratch and VapourSynth configuration inside the installation directory. The
first slice shipped a `portable` marker only in the Windows ZIP. The macOS and Linux
portable forms were labelled portable but still wrote to the platform app-data directory,
and their executables do not run from a writable install directory: a macOS binary lives
inside `<Name>.app/Contents/MacOS`, and an AppImage binary lives in a read-only temporary
mount.

**Decision.** Portable mode stays an opt-in empty file named `portable`, resolved against
the artifact the user downloaded rather than the running binary:

- Windows: the executable's directory (the extracted ZIP).
- macOS: the directory holding the `.app` bundle. The ZIP ships the marker beside the
  bundle, outside its signature, and the data folder lands beside it on first run.
- Linux: the AppImage runtime's `$APPIMAGE` directory. The AppImage cannot carry a sibling
  file, so the user opts in by creating an empty `portable` file beside it. Without the
  marker it keeps the platform app-data directory.

**Consequences.** `rust/desktop-shell/src/main.rs` owns the artifact-directory resolution
and its tests; the service keeps deriving portable mode from the data root's parent, so no
second flag crosses the boundary. `scripts/collect-release.mjs` writes the marker into the
Windows ZIP and the macOS app ZIP, `scripts/release-package-check.mjs` checks both, and
`docs/packaging.md` and `docs/releases.md` record the three forms. Packaged unzip-and-run
checks remain pending, especially on macOS.
