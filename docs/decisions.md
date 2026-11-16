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

**Decision.** Phase 5 builds and publishes Windows x64, Linux x64, and macOS arm64/x64. The
hosted package job validates Windows/Linux installs and uninstalls, records macOS artifact
sizes, and does not claim macOS install or signing verification. macOS is labelled
best-effort and unverified; no macOS pass is a release gate. The updater remains deferred and
publishes no `latest.json`. Clean-VM and the manual release plan are deferred as v0.1 gates.

**Consequences.** `docs/releases.md` owns the four-target matrix and the best-effort macOS
labels; `docs/packaging.md` records the unverified macOS bundle; `docs/progress.md` marks
5.8/5.25/5.26 as partial and 5.6/5.13 as deferred. The package job keeps macOS artifacts in
the release but does not require a macOS host to pass it.
