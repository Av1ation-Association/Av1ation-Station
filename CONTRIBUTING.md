# Contributing

Read [AGENTS.md](AGENTS.md) first — it is the normative rule set for this repository.
This file covers process only.

## Before you start

1. Read the phase plan you are working in, under [docs/plan/](docs/plan/).
2. Check [docs/progress.md](docs/progress.md) for current status and open questions.
3. Check the assumption register in [docs/README.md](docs/README.md) — an assumption
   you disagree with is cheaper to change now than later.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Rust | `1.97` | pinned by `rust-toolchain.toml`; `rustup` will install it automatically |
| Node.js | `26` | pinned by `.nvmrc` |
| npm | `>=11` | npm workspaces |
| VapourSynth | R70+ | must be on the dynamic-linker path |
| An encoder | any of `aomenc`, `svt-av1`, `rav1e`, `x264`, `x265`, `ffmpeg` | at least one |

Run `npm run doctor` (once Phase 1 is complete) to verify your environment.

### Optional local build cache

If `kache` is installed, an untracked `.cargo/config.toml` can set
`rustc-wrapper = "kache"`, `KACHE_LOCAL_ONLY = "1"` and a local cache directory. Do not
commit a machine-specific cache path. On Windows, run Cargo from a Developer Command
Prompt (or call `vcvars64.bat`); Git Bash's `/usr/bin/link.exe` shadows the MSVC linker.
Do not pass `-C link-arg=-fuse-ld=lld` to the MSVC target — `link.exe` ignores it and emits
`LNK4044`. Use `-C linker=lld-link` if lld is intended.

## Workflow

1. Branch from `main` (or `condor` during the transition).
2. Make one logical change per commit, using Conventional Commits.
3. Keep the tree buildable at every commit.
4. Update [docs/progress.md](docs/progress.md) when a phase task changes state.
5. Open a pull request. CI must be green.

## Rules that are easy to get wrong

- Never call `invoke()`, `fetch()`, or `EventSource` outside `packages/api/src/transport/`.
- Never hand-write a type that mirrors a Rust struct — regenerate the contracts.
- Never persist pipeline state — derive it from the engine's data.
- Never derive paths from `CARGO_MANIFEST_DIR` or `current_dir()`.
- Never animate layout properties (`width`, `height`, `top`, `grid-template`).

The full list is in [AGENTS.md](AGENTS.md) §2 and §9.

## Screenshots

Screenshots are generated in CI for every pull request and uploaded as an artifact for
human review. They never gate a merge. Run the same suite locally on demand:

```bash
npm run test:screenshots
```

Output goes to `test-results/screenshots/`, which is gitignored. There is no CI pixel
gate — see [docs/testing.md](docs/testing.md) §3.4 for the reasoning.

## Reporting bugs

Use the GitHub issue tracker. Include:

- what you did, what you expected, what happened
- the output of `npm run doctor`
- an **anonymised** log export (the app generates one; never paste raw logs, they
  contain absolute paths and usernames)
