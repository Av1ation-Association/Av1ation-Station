## What changed

<!-- One or two sentences. Link the issue or decision when there is one. -->

## Checks

- [ ] `npm run verify` passes (static checks, full Rust suite, both coverage policies, inventory)
- [ ] `npm run test:e2e` passes if a user-facing flow changed
- [ ] `npm run contracts` was run and generated files are included if a Rust model changed
- [ ] `docs/progress.md` and any affected architecture/decision docs are updated
- [ ] No secrets, local paths, generated screenshots, or build output are included

## Notes for review

<!-- Screenshots are advisory and belong in CI artifacts, not merge gates. -->
