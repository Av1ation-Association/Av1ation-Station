# Releases

**Scope:** the release channels, version rules, platform matrix, unsigned distribution,
updater policy, and audit bundle. This document owns release policy; current delivery status
lives in [progress.md](progress.md), and the toolchain contents and provider rules live in
[packaging.md](packaging.md).

The release gate is **closed** until the hosted package validation and a tagged workflow run
pass. Windows and Linux installs are validated. macOS is built and published **best-effort**:
without a macOS host or certificate, its install, ad-hoc signing, and runtime behaviour are
not guaranteed. The updater is deferred, so no `latest.json` is produced. The reviewed
manifest, recipes, four-target lock, reusable toolchain and security workflows, the tag-driven
`release.yml`, and the readiness record are present. The local artifacts under `dist/release/`
are development evidence, not release candidates.

## Contents

- [Channels](#channels)
- [Source and tags](#source-and-tags)
- [Readiness record](#readiness-record)
- [Versions](#versions)
- [Platform matrix](#platform-matrix)
- [Artifact formats](#artifact-formats)
- [Uninstall](#uninstall)
- [Website download metadata](#website-download-metadata)
- [Unsigned distribution](#unsigned-distribution)
- [Toolchain lock gate](#toolchain-lock-gate)
- [Update policy](#update-policy)
- [Transparency](#transparency)
- [Tag-driven workflow](#tag-driven-workflow)
- [Publication and retention](#publication-and-retention)
- [Current gate](#current-gate)

## Channels

| Channel | Trigger | Tag | Publication | Updater |
| --- | --- | --- | --- | --- |
| Weekly tagged prerelease | Weekly tag push, from a clean `main` checkout | `v<base>-weekly.YYYYMMDD` | Automatic GitHub pre-release | Never |
| Release candidate | Manual tag | `v<base>-rc.<n>` | Draft GitHub release, manually published | Never |
| Stable | Manual tag | `v<base>` | Draft GitHub release, manually published | Stable only |
| Weekly tests | Weekly schedule | No release tag | No release artifacts | Not applicable |

`weekly.yml` remains a **test** workflow. It may run real encodes and coverage, but its
system packages are not release inputs. After all weekly jobs pass, a separate `weekly-tag`
job may create one tag for the UTC date and dispatch `release.yml`. It only does so from
`main`, only when the diff from the previous weekly tag contains a non-documentation path,
and only when the readiness record passes for the weekly channel. The explicit
`workflow_dispatch` is required because a tag pushed with `GITHUB_TOKEN` does not trigger
another workflow. `release.yml` still builds only the existing tag.

### Historical 0.1.0 preview

`v0.1.0-1` is the first published 0.1.0 pre-release. It was built before the channel
tooling existed, so it is not a fourth channel: `release:build` cannot produce it and
`release:preflight` rejects it as a new candidate. The checked-in website snapshot marks
it with `"channel": "legacy"`; the projection still derives its download URLs from that
tag because those are the published assets. Leave those URLs unchanged until a
channel-built release replaces the snapshot. New candidates always use the weekly, RC, or
stable tags in the table above.

A weekly run is skipped when the diff from the last weekly tag to `HEAD` contains only
documentation: `docs/**` and `*.md`. A change to `packaging/**`, `scripts/**`, source, tests,
or the lock is a code change and produces a weekly candidate. There is at most one weekly
tag per date; rerunning a failed workflow does not move an existing tag. If readiness is
pending, the tag job warns and creates nothing, so the weekly test suite can stay green
without leaving an immutable tag that the release workflow must reject.

## Source and tags

- Weekly candidates and release tags are built only from `main`.
- A release build starts from a clean checkout. A dirty worktree is never a release input.
- Every release build names its tag with `--tag`. `npm run release:build` and
  `npm run release:manifest` fail when it is absent; there is no implicit stable
  `v<package version>` default. `release.yml` builds from the tag ref, not the dispatching
  branch: it passes `refs/tags/<tag>` to the reusable toolchain and security workflows. A
  manual dispatch must name an existing tag; it does not build the default branch.
- The tag workflow requires the tag commit to be reachable from `main`, the package version
  to match the tag (the weekly base is allowed before CI stamps the commit suffix), and
  `Web checks gate`, `Rust checks gate`, and `Browser E2E gate` to be successful. A missing
  or failed context fails the run.
- Before creating a tag, run `npm run release:preflight -- --tag <tag> --artifacts <candidate>`.
  It checks the lock through `toolchain:verify`, tag/version agreement through
  `releaseShape`, the readiness record, required artifacts, updater key, forbidden
  `latest.json`, signing labels, and the audit bundle. It writes a JSON report and exits
  non-zero when any check fails; it does not create tags or publish.
- The tag commit must be reachable from the selected branch and must contain the lock and
  policy being claimed.
- Tags are immutable. Do not force-push, move, or reuse a release tag; a bad build gets a
  new patch or release-candidate number.
- The release manifest records the full source commit, the tag, and the branch; each
  target's audit bundle records the lock. A tag build checks out a detached HEAD, so it
  passes `--branch <name>`; an unresolved branch fails the manifest instead of guessing one.

## Readiness record

`release/readiness.json` records the transitive Python/plugin notices and fork provenance,
the one remaining attestation that CI cannot infer. Installer sizes and uninstall evidence
are generated by `scripts/release-package-check.mjs` inside the Windows and Linux package
jobs; a failed install, size report, or one-run uninstall fails the release workflow. The
macOS package job records DMG and app-ZIP sizes only; macOS install, ad-hoc signing, and
runtime behaviour remain **unverified** because no macOS host is available. Clean-VM/manual
UX checks and the updater are deferred. Every recorded gate must have `status: pass`,
non-empty `evidence`, and a real `verified_at` date; a pending, malformed, or unknown gate
fails closed.

`npm run release:readiness -- --tag <tag>` checks the record for the tag's channel.
`release.yml` runs that check before starting the packaging matrix, `release:preflight` runs
it again against the candidate, and the weekly tag job refuses to create a tag while a
common gate is pending. The record is deliberately checked in and reviewed: it is an
attestation with named evidence, not a claim inferred from a successful build.

## Versions

The single source is `package.json`; `npm run version:sync` propagates it to the Tauri
configuration, the workspace manifest, the workspace entries in `Cargo.lock`, and the
generated contract metadata. `npm run version:check` rejects drift.

| Channel | Tag | Package version | Notes |
| --- | --- | --- | --- |
| Weekly | `v0.1.0-weekly.20261116` | `0.1.0-weekly.20261116.<7-char-sha>` | The tag is the release identity; the package version adds the source commit. |
| Release candidate | `v0.1.0-rc.1` | `0.1.0-rc.1` | Exact tag/version match. |
| Stable | `v0.1.0` | `0.1.0` | Exact tag/version match. |

The weekly version is stamped only in the CI workspace; it is never committed. The release
verifier checks that the package version starts with the tag's SemVer base and carries the
recorded commit suffix. Stable and release-candidate tags must match the package version
exactly.

The Tauri configuration and the Rust workspace version must agree with `package.json` at
build time. An RC or weekly identifier is valid SemVer, but it is not a substitute for the
numeric version required by the Windows MSI installer; see [Artifact formats](#artifact-formats).

## Platform matrix

| Platform | Target | Variants | Bundle scope | Runner |
| --- | --- | --- | --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` | bundled, system | Full bundled set on Windows | `windows-2025` |
| Linux x64 | `x86_64-unknown-linux-gnu` | bundled, system | Full bundled set, including VapourSynth/Python and native metrics | `ubuntu-24.04` |
| macOS arm64 | `aarch64-apple-darwin` | bundled, system | Best-effort full set; install and signing unverified | `macos-15` |
| macOS x64 | `x86_64-apple-darwin` | bundled, system | Best-effort full set; install and signing unverified | `macos-15-intel` |

Every channel builds both variants for all four targets. The current local artifacts are not
release candidates: they predate the lock, and the observed Windows artifact lacks providers
the contract claims. No target is called full until its lock passes. Windows/Linux installs
are validated; macOS is published best-effort and is not a guaranteed-support target. A
bundle is not renamed to imply a capability it does not carry.

Excluded targets are Windows arm64 and Linux arm64. macOS arm64 and x64 are thin builds,
never universal, and are unverified. Linux is Ubuntu 24.04 / Debian 13 with glibc 2.39;
Ubuntu 22.04 and Debian 12 are not supported release baselines.

## Artifact formats

| Platform | Weekly and RC | Stable |
| --- | --- | --- |
| Windows | NSIS `.exe` and portable `.zip` | MSI, NSIS `.exe`, portable `.zip` |
| Linux | `.deb` and AppImage | `.deb` and AppImage |
| macOS | Ad-hoc-signed `.dmg` and `.app.zip` (unverified) | Ad-hoc-signed `.dmg` and `.app.zip` (unverified) |

Windows MSI is stable-only. Tauri's WiX bundler accepts only numeric prerelease/build
identifiers for MSI, and the weekly and RC identifiers contain words; attempting an MSI for
those channels is a release error, not a warning. NSIS and the portable ZIP carry the
prerelease build instead. macOS artifacts are built on hosted runners and published
best-effort; they are not signed with a Developer ID and are not notarised.

Linux RPM is not a release artifact. The supported Linux forms are the `.deb` and the
AppImage. The `.deb` declares WebKitGTK 4.1; the system variant also declares FFMS2. The
AppImage is built on the Ubuntu 24.04 baseline and documents the FUSE 2 fallback.

## Uninstall

On Windows, the MSI and NSIS uninstallers remove the installed application tree, Start Menu
shortcut, and uninstall registration. They deliberately leave the app-data directory
(`%APPDATA%\com.av1ation.station` on Windows) in place: it contains the user's settings,
projects, logs, caches, and unpacked tools. Delete that directory manually to remove all
user data and reclaim its space. The portable ZIP has no uninstaller; delete its extracted
folder and, if desired, the same app-data directory.

A Windows NSIS check measured an installed tree of 1,165.5 MiB over 8,931 files, with no
helper process left after installation. On 2026-11-16, fresh bundled and system NSIS installs
were each removed by one synchronous silent uninstall: the tree and Start Menu shortcut were
gone, no installed helper process remained, and the documented 1.3 GiB app-data directory was
retained. An earlier check had needed a second silent run; that leftover did not recur. The
Windows package job repeats this check on GitHub. Linux `.deb` installation and removal are
validated by the same package job. macOS ships a `.dmg` and app ZIP but has no validated
uninstaller; users delete the app and its app-data directory manually, and this path is
unverified.

## Website download metadata

The public site must build and render without a GitHub request. Its checked-in
`apps/website/release-manifest.json` is the published release manifest snapshot; its tag,
publication date, asset names, asset kinds, and byte sizes all come from that manifest. The
current snapshot is the historical `v0.1.0-1` preview described above, not a channel build.
The visible version comes from `package.json`, the repository's one version source.

Run `npm run release:website` to project the manifest into
`apps/website/src/site/release.generated.json`. Commit the source manifest and the generated
projection with the release, and do not hand-edit either one. When a release manifest is
prepared for publication, replace the checked-in snapshot with the complete release manifest,
regenerate the projection, and review the diff. The website derives its platform groups and
download links from the manifest rather than carrying a second asset list.

CI runs `npm run check:website-release -- --urls`. It rejects a stale projection and performs
a `HEAD` request for every installer, portable, and checksum URL, comparing GitHub's
`Content-Length` with the size in the manifest. A missing URL or a changed asset fails the
web gate.

## Unsigned distribution

The project will obtain neither an Authenticode certificate nor an Apple Developer ID. Its
v0.1 distribution policy is unsigned Windows and Linux, and ad-hoc signed without
notarisation on macOS. macOS is best-effort and unverified. Artifacts are never described as
signed, notarised, or publisher-verified.

| Platform | Trust state | User-facing consequence |
| --- | --- | --- |
| Windows | Unsigned | SmartScreen may warn; the release notes require SHA-256 verification before **More info → Run anyway**. |
| Linux | Unsigned | The `.deb`/AppImage rely on SHA-256 and the published audit bundle; there is no package-signing claim. |
| macOS | Ad-hoc signed, not notarised, unverified | Gatekeeper may block the downloaded app; the release notes must not claim `spctl` acceptance or a stapled ticket. |

An unsigned build may be published on the stable channel. Its release object and manifest
always carry `code_signed: false` and `notarized: false`; a code-signing certificate is not
planned. macOS ad-hoc signing is applied by the build but cannot be verified on a macOS host
in this phase.

## Toolchain lock gate

`packaging/toolchain.lock.json` is the only version input for a release. The manifest owns
the immutable source references; the lock records the built output for every component and
target: provenance URL, SHA-256, size, install path, the file list for directory artifacts,
and a target-tree digest that covers runtime files staged beside an executable. The lock is
generated, never hand-written.

`npm run toolchain:lock` reads the reviewed manifest and four built target trees, hashes the
actual files, and writes the lock. Its default input is `dist/cargo/toolchain/<target>/`; use
`--from <directory>` when the trees are elsewhere. It refuses to write unless every target
directory exists, every claimed artifact is present and non-empty, and every target has at
least one component without a duplicate install path. A source-built component's URL is its source provenance URL; its SHA-256 is the
built output. `--check` compares the generated lock with the checked-in file without writing;
`--target <triple> --check` checks one assembled tree against that target's lock entry,
which is what each package leg runs.

`npm run toolchain:verify` is the local and CI check after generation. It fails closed when:

- `packaging/toolchain.json` or `packaging/toolchain.lock.json` is absent;
- any of the four release targets is absent from the lock;
- a source is a branch, `latest`, or an unhashed URL;
- a claimed component has no artifact for a target;
- a lock component disagrees with the manifest's version, licence, or source;
- an artifact lacks a SHA-256, size, or install path under `tools/`;
- a target's install path is duplicated or does not match the manifest.

The verifier checks metadata and manifest/lock agreement. It does not inspect wheel tags,
SPDX licence IDs, build-tool versions, patch ancestry, or provider semantics.

There is no fallback to `dist/tools`, a system package manager, or a network lookup. A target
without a lock entry stays **not provided**; a channel with a missing target stays blocked.
The weekly skip rule never bypasses this gate.

Updating a component is a reviewed change to `packaging/toolchain.json` followed by
`toolchain:lock`, with the lock diff reviewed as part of the pull request. The lock is not
auto-bumped from upstream tags. A component with no stable, machine-readable source is not
claimed as bundled for that target.

The reviewed `packaging/toolchain.json` and `packaging/toolchain.lock.json` are present.
`npm run toolchain:verify` passes for all four targets; the remaining release gates are
outside the lock. The existing `dist/tools` tree is not a lock and cannot substitute for it.

## Update policy

v0.1 publishes **no in-app updater**. Settings → About reads the newest published release and
opens its page; nothing is downloaded and no installed copy updates itself. There is no
`latest.json`, minisign key, or auto-update claim. The updater is deferred until a later phase
that can provision and test its key; stable, RC and weekly releases all publish without it.

## Transparency

Every published target/variant release carries:

- `SHA256SUMS` for its installers and portable artifacts;
- that target's `toolchain.lock.json` as `<target>-toolchain.lock.json`;
- `THIRD_PARTY_NOTICES.md` as `<target>-THIRD_PARTY_NOTICES.md`, generated from the resolved
  component set;
- `PYTHON_NOTICES.md` as `<target>-PYTHON_NOTICES.md` and `PYTHON-LICENSES.txt` as
  `<target>-PYTHON-LICENSES.txt`, generated from the staged Python/plugin tree;
- `sbom.spdx.json` as `<target>-sbom.spdx.json`, with the bundle revision and target triple;
- `SOURCE-OFFER.md` as `<target>-SOURCE-OFFER.md`, naming the exact source revision, recipe,
  patches, and publication location for every GPL/LGPL component;
- `AUDIT-SHA256SUMS.txt` over that per-target audit upload set;
- a GitHub build-provenance attestation for each artifact's digest.

`npm run release:audit -- --tag <tag> --tools <trees>` writes this bundle per target under
`dist/release/audit/` from the reviewed manifest, lock and staged target trees. It copies the
lock unchanged and generates the top-level notices, Python/plugin notices and licence texts,
SPDX SBOM and source offer; `release:preflight` consumes the directory with `--audit-bundle`.

The attestation is keyless and is not a code signature. It binds the artifact to the
repository, commit, workflow, and builder, but it does not make Windows SmartScreen trust the
file. The release notes state that distinction.

A target's lock, notices, SBOM, and source offer never stand in for another target's. The
release workflow attaches them as `<target>-<file>` and writes `AUDIT-SHA256SUMS.txt` over
that upload set; `release:preflight` checks the bundle before the release is created.
`GET /api/toolchain` serves the target summary from the embedded lock. About lists the same
components with source links; its layout is provisional pending live Penpot board review.

## Tag-driven workflow

`release.yml` runs on `v*` tag pushes and on manual dispatch of an existing tag. The verify
job checks tag reachability, the version, and the three required CI contexts, then calls
`toolchain.yml` with the tag ref and `release-security.yml`. The publish job downloads
`release-*` and `toolchain-*` artifacts, rebuilds the combined checksums, generates the
per-target audit bundle from the staged trees, writes the manifest, and runs
`release:preflight` without `--code-signed`, `--notarized`, or `--updater`; it rejects
`latest.json` before upload. It attaches each target's lock, notices, Python notices and
licence texts, SPDX SBOM and source offer as `<target>-<file>` plus
`AUDIT-SHA256SUMS.txt`, attests the upload set, and creates weekly (prerelease), RC (draft
prerelease), or stable (draft) releases. The workflow does not pass a signing flag, does not
notarise, and does not publish an updater claim.

The generated notes include a `## Changes` draft from Conventional Commits since the
previous reachable release tag. The release owner edits that section and the limitations
before publishing; hand editing is expected and does not feed back into the manifest.

## Publication and retention

- A weekly tag publishes a GitHub pre-release automatically. The weekly test workflow creates
  at most one tag per UTC date after its jobs pass and the readiness record is complete. It
  is explicitly unsigned and has no updater.
- RC and stable tags create a **draft** GitHub release. A release owner checks the lock,
  checksums, unsigned labels, audit bundle, and source offer before publishing.
- The release manifest derives `channel` and `prerelease` from the tag and records
  `code_signed`, `notarized`, and the updater claim from explicit inputs. The tag must be
  supplied explicitly; a missing tag is an error, never a stable default. Weekly tags are
  always unsigned with no updater; RC tags are prereleases. The project does not produce
  code-signed or notarised releases and never enables the updater, so those manifest fields
  remain false.
- Keep the last eight weekly releases. Older weekly release objects may be removed; their
  tags remain and are never moved. Release candidates and stable releases are retained for
  audit.
- A bad stable release is unpublished or superseded by a fixed release. A bad weekly is
  superseded by the next weekly release.
- All artifacts are built from the tagged commit; the manifest records that commit, and the
  audit bundle carries each target's lock.

## Current gate

The following are unresolved and block publication:

1. **No hosted tag run.** `release.yml`, the package validation, and the audit and security
   gates are present, but no tag has been created or exercised. Run 43808022233 generated
   `packaging/toolchain.lock.json` for all four targets, and it passes `toolchain:verify`.
2. **Hosted package validation has not run.** `release-package-check.mjs` is wired into the
   Windows and Linux package jobs; it measures compressed and installed sizes, installs each
   variant, and requires a one-run uninstall. Local Windows evidence exists for both variants;
   Linux and the hosted job remain unproven. The GitHub-hosted job is the release gate.
3. **The weekly tag job has not produced a candidate.** It will create a tag only after the
   readiness record and weekly checks pass. The readiness record itself now passes; the tag
   path is the remaining GitHub action.

macOS is retained in the build and release matrix but is **not** a validated gate: the macOS
package job records artifact sizes, while install, ad-hoc signing, and runtime behaviour stay
unverified until a macOS host is available. The updater remains deferred. Unsigned
Windows/Linux distribution is the validated policy. The remaining order is: push the Phase 5
changes, run the hosted package validation, create a weekly candidate tag, and exercise the
tag-driven workflow.
