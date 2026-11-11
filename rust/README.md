# Rust workspace

All Rust code for Av1ation Station lives here. `apps/` contains only the JavaScript host
entries; the Tauri native host is a Cargo workspace member beside the shared crates.

```
rust/
├── Cargo.toml                 workspace and pinned engine dependency
├── Cargo.lock
├── crates/
│   ├── contracts/             boundary types + JSON Schema emitter
│   ├── engine/                andean-condor adapter and fake runner
│   └── service/               axum router, domain, persistence, SSE
├── desktop-shell/             Tauri window, IPC commands, capabilities, icons
└── target/                    build output (ignored)
```

The pinned toolchain is `../rust-toolchain.toml`. Run `cargo` from this directory, or use
the repository scripts, which set this directory as Cargo's working directory:

```bash
npm run test:rust
npm run lint:rust
npm run format:rust
```

Where new Rust code belongs:

| Change | Location |
| --- | --- |
| A type that crosses the HTTP boundary | `crates/contracts/src`, then `npm run contracts` |
| Engine integration, probing, preview, script execution, or a module seam | `crates/engine/src`, with [../docs/engine.md](../docs/engine.md) |
| HTTP route, persistence, domain rule, runtime supervision | `crates/service/src`, with [../docs/service.md](../docs/service.md) |
| Window, native dialog, opener, Tauri permission | `desktop-shell` |
| Build or packaging behavior | the owning crate's `build.rs`, `scripts/`, or `docs/packaging.md` |

The engine crate is grouped by integration domain (`run/`, `capability/`, `media/`,
`script/`); its module map and visibility rules are in [../docs/engine.md](../docs/engine.md).

The service is grouped by feature domain (`api/`, `project/`, `run/`, `media/`, `script/`,
`capability/`, `platform/`). `state.rs` is the shared composition root, and the module map
is in [../docs/service.md](../docs/service.md).

The service is a library used by both `service/src/bin/av1ation-service.rs` and the Tauri
host. The desktop shell must not grow domain logic that the browser or headless host needs.
