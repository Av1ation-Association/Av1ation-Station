# Scenes playback benchmark

The player's goal is smooth, faithful picture with bounded memory: no stalls, no dropped
frames, and a Decoded frame that is bit-identical to what the encoder receives. This page
records what the app actually does, not what it is meant to do.

Run it with:

```
npm run bench:playback -- --seconds 10
```

The script finds the running service, opens the Scenes tab in Chrome, switches to each
source, plays for the requested time, seeks back one second, and reads the player's own
summary. It writes `docs/benchmarks/playback.json`; these notes are the human copy.

**The media is disposable.** The run creates a temporary project, queues a synthetic source,
and deletes the project when it ends (`--keep` leaves it in place). The source is rendered
once into the OS temp directory, only if it is missing: 90 s of 1080p 24 fps 10-bit H.264
from three FFmpeg test patterns — `gradients`, `mandelbrot`, and `life` (Conway's game of
life) — each 30 s, with a silent AAC track. Ten-bit because that is what the app is for:
the lossless proxy has to preserve the fixture's depth, so an 8-bit fixture would not
exercise the path every project uses.

A headless release service is the honest host, because a debug build runs the same decode
and lossless encode at about half speed (21–27 fps against 46–50 fps). Point the script at
one with `--service`; a release build allows no cross-origin page, so the browser needs
`--no-cors`.

```
./dist/cargo/release/av1ation-service.exe --port 51555 --data-dir %TEMP%/av1ation-bench-data
node scripts/bench-playback.mjs --service http://127.0.0.1:51555 --no-cors --seconds 10
```

## Contents

- [What is measured](#what-is-measured)
- [Environment](#environment)
- [Results — cold cache, 1080p 10-bit synthetic source](#results--cold-cache-1080p-10-bit-synthetic-source)
- [Decoded windows after the look-ahead](#decoded-windows-after-the-look-ahead)
- [Why an encoded seek costs a decode walk](#why-an-encoded-seek-costs-a-decode-walk)
- [What this measurement changed](#what-this-measurement-changed)
- [Known limits](#known-limits)

## What is measured

| Number | Source | Why it is the right one |
| --- | --- | --- |
| fps, stalls, p50/p95 frame gap | `requestVideoFrameCallback` | Counts frames the compositor **presented**. `timeupdate` fires 4×/s regardless of the picture, so it cannot show a hitch. |
| first frame | `play()` → first presented frame | What the user waits for after pressing play. |
| seek | `seeking` → next presented frame | The cost of moving the playhead inside a prepared proxy. |
| dropped / produced | `getVideoPlaybackQuality()` | Chrome's own counters. Trustworthy for a finished file; see the caveat below for a growing one. |
| app memory | working set of the service and its children, sampled every 250 ms | Holds the decode, the lossless encode, and the muxer while a proxy is built. |
| browser memory | working set of the benchmark browser's process tree | Holds the decoded frames the player shows. |

The benchmark drives the **real player** in a real browser, so a change that only looks good
in a unit test cannot pass itself. A source that fails to become playable is reported with
the player's own error as soon as it appears; the run does not sit on a timeout.

## Environment

Windows 11 · GTX 1070 (driver 582.78) · Chrome · release `av1ation-service` · Vite host on
`:1420`. Media: the synthetic 90 s source above, covered by nine ten-second manual scenes
(the benchmark adds the ranges; it does not run scene detection).

## Results — cold cache, 1080p 10-bit synthetic source

| Source | Ready (s) | First frame (ms) | Seek (ms) | Drag (ms) | fps | Dropped | Stalls | p95 gap (ms) | App (MiB) | Browser (MiB) | Total (MiB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Original | 0.1 | 82 | 27 | 3 | 24.0 | 0 / 195 | 0 | 67 | 766 | 897 | 1663 |
| Decoded | 1.2 | 46 | 39 | — | 23.9 | 0 / 197 | 0 | 67 | 766 | 985 | 1751 |
| Encoded | 23.1 | 32 | 662 | 3449 | 24.0 | 0 / 198 | 0 | 67 | 766 | 953 | 1719 |

Baseline with the page open and nothing playing: 766 MiB app, 763 MiB browser.

Frames, drops, stalls and memory come from a ten-second steady run (`--no-seek --no-drag`).
`Ready`, `First frame`, `Seek` and `Drag` come from an eight-second gesture run, because a
freeze counted inside a steady interval only dilutes the frame rate. A Decoded transport
moves between decoded windows instead of seeking in place, so it has no drag number.

- **Every source presents the source rate with no dropped frames and no stalls.** The
  playhead and the sound follow presented frames, so the number is what reached the screen
  rather than what the media clock claimed.
- **A cold encoded cut holds, then resumes.** A separate probe played one chunk at 24.0 fps
  with 0 drops to its last frame, showed **Buffering the preview** for the 13 s the next
  chunk still needed to encode, and resumed by itself at the cut, continuing into the
  appended chunk. A cut whose chunk is already cached is an append with no wait. The wait is
  the encoder's throughput on this machine, not the player: encoding a ten-second 1080p
  10-bit scene takes about 21 s, so it cannot be pre-built inside the ten seconds the current
  scene plays.
- **Decoded seeks in 39 ms**, against 7.5 s of frozen picture while the same proxy grew
  under `<video src>`. The proxy is appended through MediaSource, so the bytes already
  received are addressable. The next window's build starts with the opening one, and three
  further windows are prebuilt as cache files, so the append that reaches one before the
  seam is normally a local read.
- **Original seeks in 27 ms** and needs no proxy at all; it is the control.
- **Encoded seeks in 662 ms, and that is the bitstream, not the transport** (§ the walk
  below). One backwards seek used to be written to the element more than once — the
  element's own `timeupdate` fed the new frame back to the screen, which asked for it again —
  and a six-step sweep wrote six targets, each abandoning the walk already running.
  `preview-seek.ts` keeps one seek in flight, so a gesture costs one walk. The six-step sweep
  measured 3449 ms in the run above, against 995 ms before the cut hold existed: the sweep
  lands on a player that has just resumed from a hold, so it pays the walk and the wait
  together. Treat both numbers as a factor when a build is in flight, not as fixed latency.
- **Encoded is ready in 23 s cold**, which is the SVT-AV1 build of one ten-second 1080p
  10-bit scene. Warm, the finished cache file answers immediately.
- **Memory is steady.** The service stays between 766 and 862 MiB across the measured runs;
  the browser adds 120–220 MiB over baseline for the decoded picture.

## Decoded windows after the look-ahead

A decoded window used to be requested only once the previous one had been appended. The
player now holds one response in flight ahead of the append, inside the same byte budget it
measures for the lead. A decoded-only run records every window request, so the seam is
visible directly: `Request at` is relative to the first request after Play, `First byte` is
the service opening the stream, `Done` is its last byte, and `Gap` is the request's start
minus the previous body's end — a negative gap means the next build began while the current
window was still arriving.

| Window | Request at (s) | First byte (ms) | Done (ms) | Gap (ms) |
| --- | --- | --- | --- | --- |
| frame 144 · 6 s | 0.00 | 1847 | 1862 | — |
| frame 192 · 8 s | 3.86 | 2069 | 2119 | 1997 |
| frame 240 · 10 s | 3.86 | 2069 | 2218 | −2119 |
| frame 288 · 12 s | 6.06 | 1132 | 1491 | −19 |

- **The look-ahead overlaps the next build with the current download.** Window 240 is
  requested at 3.86 s, while window 192's body does not end until 5.98 s; window 288 starts
  19 ms before 240's body ends. That idle gap is what the change removes.
- **It adds no throughput.** A two-second window takes 1.1–2.1 s to build here, close to its
  own playback time, so the lead is the margin rather than the seam. The run presents
  22.0 fps with 0 stalls and a 67 ms p95 gap: the interval is bounded by the builds.
- **The first run of this measurement exposed a trim bug, now fixed.** At a playhead of
  1.84 s the element's buffered ranges were `[[2, 6]]`: a trim to 0.34 s had discarded the
  whole window holding the playhead, because `SourceBuffer.remove` drops the entire appended
  window it touches. The picture then stalled for 6.2 s with ten seconds still buffered. The
  cut now stops at the start of the window the playhead is playing, and the same run plays
  without stalls.

This run measured Decoded only; the table above is the earlier full run, and its Encoded
row predates both changes. `playback.json` holds this decoded run, including the window rows.

## Why an encoded seek costs a decode walk

The cost is in the chunk, and this is what it is:

| Measurement | Result |
| --- | --- |
| Keyframes in one scene chunk | **1**, at the scene's first frame (ffprobe over packet flags; a 4 s scene of this project is 96 packets with one `K`) |
| Chromium, 240-frame walk | **903 ms** → 3.8 ms/frame |
| FFmpeg, the same stream | **355 ms for 96 frames** → 3.7 ms/frame, so the browser is not the slow part |
| One frame as a 16-bit PNG, decoded in the service | **1009 ms** (354 ms of decode, the rest PNG and its 8.5 MB transfer) |

A run encodes each scene as its own chunk with the project's `--keyint`, and with `--keyint 0`
there is one random-access point per chunk. Moving back inside it therefore makes any
decoder walk from the scene's first frame. The three ways to be faster were measured or
reasoned about and are not used:

- **Adding keyframes to the preview encode.** It makes a different chunk: at a fixed CRF the
  rate control redistributes bits around every extra keyframe, so the picture stops being
  the run's own output. That is the property the Encoded source exists to show. See [preview.md](../preview.md#44-the-single-player-and-its-sources).
- **A still rendered by the service.** It measured slower than the element's own walk
  (1009 ms against 903 ms for the same scene length), and it decodes the same frames: there
  is no shortcut on the decoding side, only an extra PNG.
- **A lossless, all-intra rendition of the decoded chunk.** Pixel-exact, and it needs an
  all-intra lossless encode of every frame before it can be shown, which costs more than the
  walk it replaces and writes tens of megabytes per second.

## What this measurement changed

The first run of this harness is why the player no longer streams a Decoded source to the end
of the video. That design wrote a **1.5 GB** partial file per view, took **155 s** before
Encoded could start, and left several such builds running at once; Encoded then looked
"stalled with no encoder process" because the machine had no CPU left to spawn it.

- One Decoded window is now **2 s of source**, aligned to a fixed frame grid. A six-second
  window measured 73.5-117.3 MiB, close to Chromium's roughly 150 MB `SourceBuffer` cap
  once more than one is retained; two seconds makes the unit small enough to append several
  and still trim behind the playhead. The next window's build starts with the opening one,
  and the player prebuilds the cache runway its measured build time calls for (three windows
  initially on this machine) as cache files. A warm starts while the last appended window is
  still downloading, so a builder overlaps the client's append instead of idling until it
  finishes. A native `Video` source keeps up to two decode graphs: the second opens only
  while the first is busy, so an append does not wait for a warm. Every other input keeps
  one, because evaluating it twice allocates a second copy of whatever it builds. Warms run
  only while paused: playing, a warm would make the next append queue behind the single
  decode graph. Paused, the client fills at most six seconds of `SourceBuffer` lead and
  warms up to 1.5 GiB of cache runway (at most sixty windows), so a build slower than
  realtime keeps working and the resume reads cached windows. Starting playback aborts a
  paused warm, and the append that starts reading ahead takes the graph. Each window reuses an open graph for its source identity; only the lossless
  encode and mux are per window.
  Alignment is what makes a seek cheap: the window containing the target has usually been
  built already.
- `Decoded` and `Encoded` are attached through **MediaSource**. The page fetches the
  growing proxy and appends it, so a seek inside received bytes is a buffer lookup; the next
  window or scene chunk is appended at its own offset instead of remounting the element.
- The proxies are **video only**. A `SourceBuffer` rejects a segment whose index names a
  track it does not hold, and the player takes sound from the source's own element.
- Encoded builds exactly one chunk ahead, once the current chunk has finished encoding, and appends only the scene after the playhead's own while the buffered picture stays within a minute of the playhead. The append used to chain through every following scene while the element was paused.
- **A gesture pays for one walk, not one per tick.** `packages/ui/src/preview-seek.ts` keeps
  a single seek in flight: a scrub writes only its newest target, once the gesture pauses, and
  a request that arrives mid-walk waits for that walk instead of abandoning it. A step is a
  deliberate move and is still written at once. Opening a chunk at a frame used to write the
  same target from `loadedmetadata`, `canplay`, and the playhead effect in turn.
- **Sound is placed when the walk lands, not when it is requested.** The audio element used
  to jump to a frame the picture had not reached, so a one-second walk played a second of
  sound from the wrong place.
- **The wait says what it is.** An Encoded seek shows a labelled notice
  (`data-preview-seeking`) instead of a picture that looks frozen for no reason.
- **The presented frame is the clock, and buffer policy follows the source.** The playhead
  and the timeline advance only on frames `requestVideoFrameCallback` reports; the sound is
  paused with the picture and put back in step on the next shown frame. Decoded, the editor
  reference, never holds for buffer: it presents each appended frame as it lands so a
  slower-than-realtime decode stays viewable. Encoded holds and resumes at three quarters of
  a second of lead, so a scene chunk is not uncovered one fragment at a time.
- **A chunk build cannot take the decoder's cores.** The preview encoder runs at idle process
  priority (Windows `IDLE_PRIORITY_CLASS`). Below normal still took a share of every core:
  with a build in flight, Encoded fell to 11.3 fps with a 5.4 s freeze. At idle the same
  run held **24.0 fps, 0 dropped, 0 stalls**. Priority is scheduling only; the bitstream is
  unchanged.
- **A trim no longer cuts into the window that is playing.** `SourceBuffer.remove` discards
  the whole appended window the cut touches, so a trim 1.5 s behind a playhead near a window
  start left the playhead outside the buffer and stalled the picture for six seconds. The
  cut now stops at the window boundary.
- A one-frame playhead difference no longer restarts the stream. The old threshold spawned
  six full builds in four seconds; the service log shows **one** build per view.
- The preview cache is capped at **2 GiB**, oldest finished file first, so windows cannot
  fill the disk.

## Known limits

- **An Encoded seek costs one keyframe walk** (§Why an encoded seek costs a decode walk). It
  is bounded by the scene's own encoding settings, not by the player.
- **A cold cut waits for that scene's encode.** The next chunk is built while the current
  one plays, but a ten-second scene takes about 21 s to encode on this machine, so it cannot
  finish inside the ten seconds it replaces. The player holds at the cut with **Buffering the
  preview** (13 s in the probe above) and resumes by itself; a cached chunk is an append with
  no wait. Holding instead of playing on a starved buffer is deliberate: it is the only way
  to avoid skipping frames.
- **A scene shorter than its own encode time cannot be buffered ahead.** The next chunk is
  built once the current one finishes, so a scene that takes longer to encode than to play
  will reach its end before the next chunk is ready. Longer scenes — where a cut is not
  immediately followed by another — are covered.
- **The player trims 1 s behind the playhead, and stops at the start of the window it is
  playing.** A `remove` that reaches into a window discards the whole window, so the cut
  never enters the playing one; a seek further back than the retained second is outside the
  buffer and re-opens a window from cache, which is a build on a cold cache.
- **Chrome under-reports decoded frames on a chunked stream.** `totalVideoFrames` read 23
  while rVFC presented 243 in an earlier run, so the drop percentage is a lower bound. The
  frame-gap numbers are the reliable ones.
- **Memory here is working set**, which includes memory-mapped cache pages. It is the right
  number for "what does this cost the machine", not for "how many bytes did the decoder
  allocate".
