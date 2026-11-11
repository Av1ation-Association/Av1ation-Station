<p align="center">
  <img src="design/brand/av1ation-station-1280x640.png" alt="Av1ation Station" width="1280">
</p>

<p align="center">
  A desktop workspace for scene-aware, quality-targeted video encoding with
  <a href="https://github.com/BoatsMcGee/Av1an">Av1an</a>.
</p>

Queue videos, tune each one scene by scene, target a quality level, and watch every stage in one place along with VapourSynth scripting, preview, logs, and history where you need them. The
engine is built directly into the app, so scene data, metrics, progress, and errors are
structured values rather than scraped console output.

> **Pre-release.** Installers are planned for the full release. Build from source today; the release
> track and current status are in the
> [Releases page](https://github.com/Av1ation-Association/Av1ation-Station/releases) and
> [docs/progress.md](docs/progress.md).

## Features

- **See the whole pipeline** — derived stages, live progress, queue position, and retained
  work, read from the encoder itself.
- **Rich, interactive charts** — zoomable per-scene graphs with probe toggles and
  distribution, convergence, and quality-vs-size views; live checkpoint updates; and a
  statistics strip for mean, median, range, and percentiles, plus a sortable scene table.
- **Configure the encoder, not a wall of flags** — named, grouped, documented controls,
  advanced flags, custom builds, and a validated JSON editor.
- **Control the scenes** — a Scenes tab built as a video editor: rail, details, a single
  player, and a proportional timeline; compare Original, Decoded, and Encoded; edit easily
  with undo.
- **Quality targets** — per-scene probes, speed scaling, bitrate optimization, and a final
  quality check.
- **VapourSynth** — optional; native FFMS2 input works without it; bundled editor completion
  from generated scene data.
- **Batch processing** — run a project queue in order, one video at a time; a failed video
  does not abandon the rest.
- **Project templates** — save a configuration and apply it to another project.
- **History and logs** — append-only run history and anonymised log export.

## Get started

### Build from source today

On Windows, install the Rust, Node.js, npm, and Tauri prerequisites in
[CONTRIBUTING.md](CONTRIBUTING.md), then:

```bash
npm ci
npm run doctor
npm run dev
```

`npm run doctor` names anything missing. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/preflight.md](docs/preflight.md) for the full setup and provider rules.

### Planned for 1.0

Windows, macOS, and Linux installers are planned, carrying a pinned toolchain so a
normal install needs no separate Python, VapourSynth, FFmpeg, or encoder setup. Windows x64 is
first; macOS and Linux follow. See the
[Releases page](https://github.com/Av1ation-Association/Av1ation-Station/releases) and
[docs/progress.md](docs/progress.md).

LAN access is available from **Settings → Network** and is off by default.

## Contributing

Read [AGENTS.md](AGENTS.md), then [CONTRIBUTING.md](CONTRIBUTING.md). Current status is in
[docs/progress.md](docs/progress.md); the documentation index is [docs/README.md](docs/README.md).

## License

Av1ation Station links `andean-condor`, which is **GPL-3.0**. The combined work is therefore
distributed under the GPL-3.0. The [LICENSE](LICENSE) file is at the repository root.
