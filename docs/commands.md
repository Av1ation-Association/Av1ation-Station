# Commands

Run every command from the repository root as `npm run <script>`. The four primary commands
are below; the sections after them list every script in `package.json` by purpose.

## Primary commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Fast local gate: all static checks plus the plain web and Rust test suites. No coverage. |
| `npm run verify` | Full local gate: static checks once, then the web and Rust coverage gates in parallel. |
| `npm run test:e2e` | Build the headless service and desktop SPA, then run the Playwright browser journeys. |
| `npm run test:real-encode` | Run all 12 ignored real-encode tests with the real toolchain; fails on a skipped test or a changed test count. |

The shared static profiles are `check:web`, `check:rust`, and `check:evidence`; `check:web`
runs the evidence profile. The matching test profiles are `verify:web` and `verify:rust`.
`check:static` composes the static profiles, and `verify` composes `check:static` with the
test profiles.

## Full script reference

### Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Tauri app in development with the `dist/dev-tools` provider cache. |
| `npm run dev:desktop` | Run only the desktop Vite host. |
| `npm run dev:tools` | Copy or link a release `tools/` tree into `dist/dev-tools`. |
| `npm run dev:web` | Run the LAN web Vite host. |
| `npm run dev:website` | Run the website demo Vite host. |
| `npm run dev:headless` | Start the headless service and the desktop Vite host on port 1420 for browser review. |
| `npm run tauri` | Run the Tauri CLI through the repository wrapper. |

### Tests and coverage

| Command | Purpose |
| --- | --- |
| `npm run test` | Run the plain web suite, then the plain Rust suite. |
| `npm run test:web` | Run Vitest once. |
| `npm run test:web:isolated` | Run Vitest with file isolation. |
| `npm run test:web:coverage` | Run Vitest with v8 coverage and write the JSON report under `dist/coverage/web/`. |
| `npm run test:inventory` | Regenerate `docs/test-inventory.md` from test and coverage reports. |
| `npm run check:test-inventory` | Validate inventory counts, the documentation baseline, and coverage evidence. |
| `npm run mutation:pilot` | Run the mutation-testing pilot. |
| `npm run coverage:check` | Evaluate the coverage policy from the available reports. |
| `npm run coverage:check:web` | Evaluate the frontend coverage policy and print the module report. |
| `npm run coverage:check:rust` | Evaluate the engine/service coverage policy and print the module report. |
| `npm run coverage:check:changed` | Check changed-line coverage against `BASE_SHA`. |
| `npm run coverage:report` | Write the nightly coverage trend report. |
| `npm run test:rust` | Run the full Rust workspace suite with `--locked`. |
| `npm run test:real-encode` | Run the ignored real-encode suite and reject skipped tests or a changed count. |
| `npm run check:disk-space` | Fail when free space is below the configured floor. |
| `npm run test:rust:coverage` | Run `llvm-cov` for the engine and service and write the Rust lcov report. |
| `npm run test:e2e:build` | Build or reuse the cached headless service and desktop SPA. |
| `npm run test:e2e:run` | Run Playwright against the built SPA and the real headless service. |
| `npm run test:e2e` | Run `test:e2e:build`, then `test:e2e:run`. |

### Build, release, and maintenance

| Command | Purpose |
| --- | --- |
| `npm run build` | Build every workspace host bundle. |
| `npm run build:desktop` | Build the desktop host bundle. |
| `npm run build:service` | Build the debug headless service used for review and E2E. |
| `npm run build:web` | Build the LAN web host bundle. |
| `npm run build:website` | Build the website host bundle. |
| `npm run build:website:gallery` | Build the website gallery variant. |
| `npm run build:system` | Build a desktop release using system providers only. |
| `npm run release:build` | Build both desktop release variants and aggregate checksums. |
| `npm run release:manifest` | Regenerate release notes and the manifest from existing artifacts. |
| `npm run clean:outputs` | Remove transient generated output. |
| `npm run clean:target` | Clean the Cargo target tree. |
| `npm run stage:tools` | Stage the release toolchain tree. |

### Formatting, linting, and static checks

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Typecheck the workspace projects, including the E2E and screenshot harnesses. |
| `npm run format` | Format web and Rust sources. |
| `npm run format:web` | Write Prettier formatting for the repository. |
| `npm run format:check` | Check web and Rust formatting. |
| `npm run format:check:web` | Check Prettier formatting for the repository. |
| `npm run format:rust` | Apply `rustfmt`. |
| `npm run format:check:rust` | Check `rustfmt`. |
| `npm run lint` | Run ESLint and Clippy. |
| `npm run lint:js` | Run ESLint. |
| `npm run lint:rust` | Run Clippy for all targets with warnings denied. |
| `npm run check` | Run all static checks, then the plain web and Rust test suites. |
| `npm run check:static` | Run the `check:web` and `check:rust` profiles. |
| `npm run check:feature-boundaries` | Enforce UI, API, and contract dependency boundaries. |
| `npm run check:service-modules` | Enforce service module ownership. |
| `npm run check:api-json` | Reject raw `Json<T>` types at the API boundary. |
| `npm run check:error-evidence` | Validate the error-evidence registry. |
| `npm run check:evidence` | Run the error-evidence and route-test-matrix checks. |
| `npm run check:web` | Run the shared web static profile. |
| `npm run check:rust` | Run the shared Rust static profile. |
| `npm run evidence:generate` | Regenerate the error-evidence registry. |
| `npm run check:docs` | Validate documentation links, anchors, and Contents maps. |
| `npm run check:route-matrix` | Validate the generated route-test matrix. |
| `npm run routes:matrix` | Regenerate the route-test matrix from the route manifest and tests. |
| `npm run verify:web` | Run web coverage, the frontend policy, inventory generation, and the inventory check. |
| `npm run verify:rust` | Run the full Rust suite, Rust coverage, and the Rust coverage policy. |
| `npm run verify` | Run all static checks once, then `verify:web` and `verify:rust` in parallel. |
| `npm run contracts` | Emit JSON Schema and regenerate the TypeScript and Zod contracts. |
| `npm run contracts:emit` | Emit JSON Schema only. |
| `npm run contracts:generate` | Regenerate TypeScript and Zod from the schema. |
| `npm run contracts:check` | Fail on contract drift. |
| `npm run routes` | Emit the route manifest and regenerate route paths and docs. |
| `npm run routes:emit` | Emit the route manifest only. |
| `npm run routes:generate` | Regenerate route paths and docs. |
| `npm run routes:check` | Fail on route manifest or generated-output drift. |
| `npm run doctor` | Check local prerequisites; add `-- --profile web`, `e2e`, or `real-encode` for one command's needs. |
| `npm run version:sync` | Propagate the package version to generated inputs. |
| `npm run version:check` | Fail on version drift. |

### Utilities

| Command | Purpose |
| --- | --- |
| `npm run screenshots` | Generate the deterministic both-theme screenshot gallery. |
| `npm run screenshots:features` | Generate the screenshot set selected by a feature group or screen id. |
| `npm run check:gallery` | Validate the generated screenshot gallery. |
| `npm run bench:playback` | Run the playback benchmark. |
| `npm run bench:thumbnails` | Run the thumbnail benchmark. |

## Notes

`package.json` remains the authoritative script list; update this page when a script is
added, renamed, or removed. `npm run doctor` is the setup check, not a gate: the base run
reports optional providers, while the `web`, `e2e`, and `real-encode` profiles turn the
requirements for those commands into failures.

`npm run test:e2e` needs Chromium installed once with `npx playwright install chromium`.
`npm run test:real-encode` needs the full real-encode toolchain described in
[CONTRIBUTING.md](../CONTRIBUTING.md#checks-and-tests) and
[testing.md](testing.md#nightly-real-encode-gate).

## CI and local verification

Pull-request CI runs the same named profiles as local verification:

| Environment | Profiles |
| --- | --- |
| Local `npm run verify` | `check:static`, then `verify:web` and `verify:rust` in parallel |
| CI web job | `check:web`, then `verify:web` |
| CI Rust job | `check:rust`, then `verify:rust` |
| CI browser job | `test:e2e` |
| Nightly real-encode job | `test:real-encode` |

`check:static` is `check:web` followed by `check:rust`. `check:web` includes
`check:evidence`, so `check:error-evidence` and `check:route-matrix` run locally and in CI.

Intentional differences:

- CI splits the static profiles across a Linux web job and a Windows Rust job; local
  `verify` runs both on the host machine.
- CI runs `coverage:check:changed` with the base commit and `npm run build`; local `verify`
  does neither. Changed-line coverage needs the pull-request diff.
- Local `verify` does not run E2E or the real-encode suite; CI runs those as separate jobs
  with the same `test:e2e` and `test:real-encode` profile names.
- The nightly coverage-trend job measures coverage reports without running the full verify
  gates. Screenshot and gallery checks remain advisory and are not part of either gate.
