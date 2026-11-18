# E6 media-probe spike

> **Planning record.** Current delivery status lives in [progress.md](../progress.md).

**Status:** complete. Keep the current probes; do not add a media-metadata library.

**Question.** Would `mediainfo.js` or `rsmediainfo` make the startup/add-video probe
faster or more portable than the current `mkvmerge`/FFmpeg probe path?

**Short answer.** No. The source probe is already in-process FFMS2/VapourSynth. The
subprocess metadata paths exist only for muxer-specific track identification, which neither
MediaInfo candidate provides.

## Where probing happens

| Path | Implementation | What it returns | Why it cannot move to MediaInfo |
| --- | --- | --- | --- |
| Add video / queue details | `av1ation_engine::media::video::probe_source_with` opens the input through `CoreInput::ensure_indexed` and reads `clip_info()` | Decoded width, height, frame count, frame rate, pixel format, bit depth, colour signalling | The result describes what the decoder will actually run, including a VapourSynth script's filters. MediaInfo reads container headers; it cannot evaluate the script or promise the decoder's frame count/format. |
| Scene Concatenator workbench (mkvmerge) | `mkvmerge --identify --identification-format json` | Muxer track IDs, track types, attachments and their namespace keys | MediaInfo reports metadata tracks, not the muxer's selection keys or attachment IDs the workbench must preserve. |
| Scene Concatenator workbench (FFmpeg) | `ffmpeg -i` metadata parsing | FFmpeg stream indexes and stream types | The mapping is FFmpeg's own; MediaInfo would add a second, differently numbered view. |
| Source probing | FFMS2/VapourSynth in the engine process | Exact decoded fields above | No subprocess starts; a metadata library would add work, not remove it. |

`ffprobe` is not on the source-probe path in this tree. The E6 backlog line names it, but
the current source probe is the decoder open described above; the only shell probes are the
Concat workbench's per-muxer identification.

## Candidates

| Candidate | Version examined | Licence | Footprint / integration | Coverage gap |
| --- | --- | --- | --- | --- |
| `mediainfo.js` | 0.3.8 (MediaInfoLib 26.05) | BSD-2-Clause | `MediaInfoModule.wasm` is 2.6 MB; needs a JavaScript/WASM runtime and file access through that runtime | Header metadata only; no decoded frame count or decoder pixel format; no muxer track IDs/attachments |
| `rsmediainfo` | 0.2.0 | Apache-2.0 or MIT | Rust wrapper; the default `bundled` feature downloads a MediaInfo shared library for the target at build time, which the release would have to stage and sign/test per platform | Same header-metadata limits; introduces a new native library to the pinned toolchain for no startup win |
| Current FFMS2/VapourSynth | workspace engine dependency | already shipped | In-process, no subprocess on the add-video path | Requires FFMS2 and, for script inputs, VapourSynth — already required to encode those inputs |
| Current FFmpeg/MKVToolNix | pinned toolchain | already shipped | Two short-lived processes, only when the Concat workbench asks for muxer mapping | Platform executable packaging already covered by the toolchain lock |

## Indicative timing

Windows x64, 2026-11-18, `dist/validation/a4-fixed/source.mkv` (358 KiB), ten sequential
runs per command, median wall time including process startup:

| Command | Median | Min | Max |
| --- | ---: | ---: | ---: |
| `ffprobe -show_format -show_streams` | 109 ms | 105 ms | 137 ms |
| `mkvmerge --identify --identification-format json` | 122 ms | 120 ms | 133 ms |
| `mediainfo --Output=JSON` (system CLI, for comparison) | 88 ms | 85 ms | 113 ms |

The 20–35 ms difference is smaller than the decoder open the source path already performs,
and the Concat workbench only runs when the user opens that tool. A native MediaInfo library
would remove process startup but add a platform shared library and still not supply the
muxer keys. A WASM library adds a runtime and 2.6 MB to the installed tree.

## Decision

Keep the current probes. E6 is closed with no replacement and no new dependency:

- source metadata stays with the decoder that will run the input;
- Concat keeps `mkvmerge --identify` for mkvmerge keys and FFmpeg metadata for FFmpeg keys;
- no `ffprobe` path is added.

The existing parser tests for `parse_mkvmerge_identify` and `parse_ffmpeg_metadata` remain
the contract coverage for the fields the workbench consumes. Revisit only if MediaInfo
exposes decoded-frame information or muxer selection keys, or if the toolchain stops
shipping MKVToolNix/FFmpeg.

## Sources

- [mediainfo.js](https://mediainfo.js.org/) and [npm package](https://www.npmjs.com/package/mediainfo.js) — version, BSD-2-Clause, package size.
- [mediainfo.js `dist` listing](https://app.unpkg.com/mediainfo.js@0.3.8/files/dist) — 2.6 MB WASM file.
- [rsmediainfo 0.2.0](https://docs.rs/crate/rsmediainfo/latest) — dual licence, bundled shared-library feature, platform staging.
- [ffprobe documentation](https://ffmpeg.org/ffprobe.html) — JSON stream/format output.
