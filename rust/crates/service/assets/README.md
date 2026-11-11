# Vendored Python language server

The script editor's IntelliSense requires a language server, and a user should not have to
install one. The service therefore embeds a pinned Jedi language server, unpacks it once into
its app-data directory, and runs it as `<chosen python> -c "from jedi_language_server.cli
import cli; cli()"` with that directory first on `PYTHONPATH`. A user who has Python 3.10+
gets completion, hover and diagnostics without installing anything; a user who also has
Pyright on `PATH` still gets Pyright.

**No archive is committed.** `python-lsp.lock` is the source of truth: it pins each
distribution's exact version, wheel URL and SHA-256 digest. `rust/crates/service/build.rs` runs
[`scripts/vendor-python-lsp.mjs`](../../../../scripts/vendor-python-lsp.mjs) before the crate
compiles, and the script downloads the wheels into `OUT_DIR`, verifies each digest, and
writes the deterministic archive the binary embeds. A local build and CI therefore produce
the same bytes from the same lock, and a review sees only text.

```sh
# The normal path: cargo build/test runs this for you.
node scripts/vendor-python-lsp.mjs

# An offline builder or a CI artifact cache can supply the archive directly.
AV1ATION_PYTHON_LSP_ZIP=/path/to/python-lsp.zip cargo build
```

Wheels are cached under `OUT_DIR/wheels`, so only the first build of a target directory
touches the network. Bumping a dependency means editing its `version` in
`python-lsp.lock`, running `node scripts/vendor-python-lsp.mjs --refresh-lock` to record the
new URL and digest, and bumping `lsp_bundle::VERSION` so an existing extraction is not
reused.

Each distribution keeps its `*.dist-info` directory, so its license and notice travel with
the code:

| Distribution | Version | License |
| --- | --- | --- |
| jedi | 0.20.1 | MIT |
| parso | 0.8.7 | MIT |
| jedi-language-server | 0.47.0 | MIT |
| pygls | 2.1.1 | Apache-2.0 |
| lsprotocol | 2025.0.0 | MIT |
| attrs | 26.1.0 | MIT |
| cattrs | 26.2.1 | MIT |
| docstring-to-markdown | 0.17 | MIT |
| typing-extensions | 4.16.0 | PSF-2.0 |
| importlib-metadata | 10.1.0 | Apache-2.0 |
| zipp | 4.1.2 | MIT |
