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
