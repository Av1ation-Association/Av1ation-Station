# Releases

**Scope:** the release channels, version rules, platform matrix, unsigned distribution,
updater policy, and audit bundle. This document owns release policy; current delivery status
lives in [progress.md](progress.md), and the toolchain contents and provider rules live in
[packaging.md](packaging.md).

The release gate is **closed** until the remaining packaging checks pass. The reviewed
manifest, recipes, four-target lock, reusable toolchain and security workflows, the
tag-driven `release.yml`, and the reviewed readiness record are present. No release tag has
exercised them, and the macOS, updater, clean-VM, size and uninstall gates below still block
publication. The local artifacts under `dist/release/` are development evidence, not release
candidates.

## Contents

- [Channels](#channels)
- [Source and tags](#source-and-tags)
- [Readiness record](#readiness-record)
- [Versions](#versions)
- [Platform matrix](#platform-matrix)
- [Artifact formats](#artifact-formats)
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

`release/readiness.json` is the reviewed record for gates CI cannot execute itself:
macOS relocation and nested ad-hoc signing, clean-VM installs, installer and installed
sizes, uninstall behaviour, transitive Python/plugin notices, the manual release test plan,
and (for stable releases) the signed updater path. Every gate that applies to the channel
must have `status: pass`, non-empty `evidence`, and a real `verified_at` date. A pending,
missing, malformed, or unknown gate fails closed.

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
| macOS arm64 | `aarch64-apple-darwin` | bundled, system | Full bundled set, including VapourSynth/Python and native metrics | `macos-15` |
| macOS x64 | `x86_64-apple-darwin` | bundled, system | Full bundled set, including VapourSynth/Python and native metrics | `macos-15-intel` |

Every channel uses all eight target/variant legs. A leg is not optional because another
target succeeds. Every bundled leg is intended to carry the full provider set. The current
local artifacts are not release candidates: they predate the lock, and the observed Windows
artifact lacks providers the contract claims. No target is called full until its lock and
smoke gate pass. A bundle is not renamed to imply a capability it does not carry.

Excluded targets are Windows arm64 and Linux arm64. macOS arm64 and x64 are thin builds,
never universal. macOS 15.0 is the floor, because the vsjetpack plugin wheels use
`macosx_15_0`. Linux is Ubuntu 24.04 / Debian 13 with glibc 2.39;
Ubuntu 22.04 and Debian 12 are not supported release baselines.

## Artifact formats

| Platform | Weekly and RC | Stable |
| --- | --- | --- |
| Windows | NSIS `.exe` and portable `.zip` | MSI, NSIS `.exe`, portable `.zip` |
| macOS | Ad-hoc-signed `.dmg` and `.app.zip` | Ad-hoc-signed `.dmg` and `.app.zip` |
| Linux | `.deb` and AppImage | `.deb` and AppImage |

Windows MSI is stable-only. Tauri's WiX bundler accepts only numeric prerelease/build
identifiers for MSI, and the weekly and RC identifiers contain words; attempting an MSI for
those channels is a release error, not a warning. NSIS and the portable ZIP carry the
prerelease build instead.

Linux RPM is not a release artifact. The supported Linux forms are the `.deb` and the
AppImage. The `.deb` declares WebKitGTK 4.1; the system variant also declares FFMS2. The
AppImage is built on the Ubuntu 24.04 baseline and documents the FUSE 2 fallback.

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

The project will not obtain an Authenticode certificate or an Apple Developer ID. Its
distribution policy is permanently unsigned on Windows and Linux, and ad-hoc signed without
notarisation on macOS. Artifacts are never described as signed, notarised, or
publisher-verified.

| Platform | Trust state | User-facing consequence |
| --- | --- | --- |
| Windows | Unsigned | SmartScreen may warn; the release notes require SHA-256 verification before **More info → Run anyway**. |
| macOS | Ad-hoc signed, not notarised | Gatekeeper blocks a downloaded app until the documented override; the release notes never claim `spctl` acceptance or a stapled ticket. |
| Linux | Unsigned | The `.deb`/AppImage rely on SHA-256 and the published audit bundle; there is no package-signing claim. |

An unsigned build may be published on the stable channel. Its release object and manifest
always carry `code_signed: false` and `notarized: false`; a code-signing certificate is not
planned.

Ad-hoc macOS signing covers every nested Mach-O before the outer `.app` is signed. The
release notes must name the Gatekeeper override and the absence of notarisation. The release
workflow must not imply code signing from the updater signature.

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

The updater is a **stable-only** channel. Weekly and release-candidate builds never write an
updater manifest and never offer themselves to installed copies.

The update artifact is verified with a project minisign key, separate from code signing. The
public key is compiled into the application; the private key and its password are supplied
to CI as secrets and are never committed. `npm run tauri signer generate` creates the key
pair when the release owner is ready to provision it.

- The updater checks a stable `latest.json`; it refuses downgrades and never installs
  silently. The user approves the download and restart.
- `createUpdaterArtifacts` and `latest.json` remain disabled until the public key is in the
  application and the private key is in CI. A stable release without those secrets publishes
  no updater claim.
- The stable updater covers Windows and the Linux AppImage. The macOS updater remains
  disabled because no Developer ID will be provisioned; ad-hoc signing is not a trusted
  macOS update identity. The `.dmg` and `.deb` are manual install and update paths.
- The updater signature proves the update manifest and artifact came from the project key.
  It does not make the initial installer trusted by Windows or macOS.

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
repository, commit, workflow, and builder, but it does not make Windows SmartScreen or
Gatekeeper trust the file. The release notes state that distinction.

A target's lock, notices, SBOM, and source offer never stand in for another target's. The
release workflow attaches them as `<target>-<file>` and writes `AUDIT-SHA256SUMS.txt` over
that upload set; `release:preflight` checks the bundle before the release is created. The
planned `GET /api/toolchain` summary and the About screen are not implemented yet; no
release may claim they are.

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
  always unsigned with no updater; RC tags are prereleases; only stable tags may enable the
  updater. The project does not produce code-signed or notarised releases, so both manifest
  flags remain false.
- Keep the last eight weekly releases. Older weekly release objects may be removed; their
  tags remain and are never moved. Release candidates and stable releases are retained for
  audit.
- A bad stable release is unpublished or superseded, and `latest.json` is repointed to the
  previous stable artifact. A bad weekly is superseded by the next weekly release.
- All artifacts are built from the tagged commit; the manifest records that commit, and the
  audit bundle carries each target's lock.

## Current gate

The following are unresolved and block publication:

1. **No hosted tag run.** `release.yml` and its audit and security gates are present,
   but no tag has been created or exercised. The weekly tag job is wired but has not run;
   it will skip while the readiness record is pending. Run 43808022233 generated
   `packaging/toolchain.lock.json` for all four targets, and it passes `toolchain:verify`.
2. **macOS relocation not proven.** The recipes stage the full macOS provider set, but the
   relocation, nested ad-hoc signing, and clean-install gate has not been run. Until it passes,
   macOS bundled variants must not claim to be verified.
3. **Updater key not provisioned.** No minisign public key is compiled in and no private key
   is in CI, so stable publication cannot claim an updater yet.
4. **Clean-VM, size and attestation gates not run.** No clean Windows, macOS or Ubuntu
   install has exercised the bundled trees; compressed and installed sizes and build-provenance
   attestations remain unmeasured. The audit generator produces the lock copy, top-level
   notices, Python/plugin notices, licence texts, SPDX SBOM and source offer; the fmetrics fork
   commit, upstream base and recipe digest are recorded, and the transitive-notices readiness
   gate is passed. The weekly tag job creates nothing while the other gates are pending.

Unsigned and ad-hoc distribution is the permanent policy, not a gate. The lock is
generated and verified. The remaining order is: prove macOS relocation and ad-hoc signing,
provision the updater key, pass the clean-VM, size and attestation gates, then create a tag
and exercise the tag-driven workflow, including the weekly tag job.
