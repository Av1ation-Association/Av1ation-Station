# Scene thumbnail benchmark

A scene thumbnail must cost one disk read, not one decoder. This page records what a
thumbnail costs under each strategy on real media, and the cache design the numbers support.

Run it with:

```
npm run bench:thumbnails -- --video "C:/media/episode.mkv"
```

The script probes each file, measures the per-request still approach the app used to take,
then measures one-pass extraction variants and serves the result through a mock cache. It
writes `docs/benchmarks/thumbnails.json`; these notes are the human copy. It needs FFmpeg on
`PATH` (or `--ffmpeg`/`--ffprobe`) and refuses to run while another FFmpeg process exists, so
peak memory is attributable. Hardware decode is on by default (`-hwaccel d3d11va`); `--no-hw`
measures the CPU fallback.

The mock server is part of the measurement, not the product. It stands in for the thumbnail
route: one cache directory, an index derived from the frame number, and a single-flight build
that collapses concurrent first requests into one FFmpeg process.

## Media and environment

Windows 11 · Intel i7-8700 · 32 GiB · GTX 1070 · FFmpeg n8.1.1 · Node 26.13 · 5 s interval ·
320 px wide · JPEG quality 5.

| File | Size | Frames | Keyframes | Thumbs at 5 s |
| --- | --- | --- | --- | --- |
| 1080p clip, 31.7 s | 0.14 GiB | 760 | 34 | 7 |
| 1080p episode, 23:40 | 1.50 GiB | 34,046 | 710 | 285 |

The clip is short enough to measure a cold build repeatedly; the episode is the shape the
cache has to survive. Both are H.264 1080p at 23.976 fps.

## Extraction

`seek-*` is the work the old `/frame` route did per request: seek, decode one frame, write
one image. `seek-png` uses PNG (what the route wrote). The concurrent row is six requests at
once, which is what one screenful of the rail did to the webview's six connections. The
keyframe rows decode only keyframes (`-skip_frame nokey`); the full-decode rows decode every
frame.

| Strategy | Clip | Episode | Files | Bytes | Peak FFmpeg (host) |
| --- | --- | --- | --- | --- | --- |
| `seek-png`, 12 frames, sequential | 4.13 s · 344 ms each | 3.69 s · 308 ms each | 12 | 0.86 / 0.80 MiB | 148 / 223 MiB |
| `seek-png`, 12 frames, 6 at once | 1.98 s · 944 ms each | 2.26 s · 1,039 ms each | 12 | 0.86 / 0.80 MiB | **870 / 1,166 MiB** |
| `keyframe`, CPU | 0.91 s | 19.50 s | 6 / 284 | 0.03 / 2.21 MiB | 160 / 194 MiB |
| `keyframe`, D3D11VA | **0.62 s** | **5.82 s** | 6 / 284 | 0.03 / 2.21 MiB | 192 / 239 MiB |
| `interval`, full decode, 5 s grid | 2.60 s | 64.52 s | 6 / 284 | 0.03 / 2.19 MiB | 158 / 247 MiB |
| `interval`, sprite 10×10 | 2.57 s | 64.47 s | 1 / 3 | 0.06 / 2.13 MiB | 164 / 294 MiB |

- **Keyframe-only decoding is 3.3× faster than a full decode.** Both grid strategies write
  284 thumbnails; `-skip_frame nokey` decodes 710 keyframes instead of 34,046 frames, and the
  `fps` filter picks one keyframe per 5 s bin. The grid is the same size; only the input to it
  is smaller. Production keeps the keyframe-only decode but replaces that filter with the
  timestamp-to-bin assignment described below, which uses the same decode and cannot drop the
  final keyframe.
- **Hardware decode is another 3.35× on the episode.** D3D11VA takes 5.82 s against 19.50 s
  on the CPU, and 0.62 s against 0.91 s on the clip. The GPU path is byte-identical: 284 files
  written by each path compare equal (`diff -rq` reports no difference), and so do CUDA
  (5.23 s) and DXVA2 (5.64 s) in a separate run. D3D11VA is the portable Windows choice
  because it covers NVIDIA, Intel and AMD; CUDA is NVIDIA-only.
- **The per-request lower bound is still 308 ms.** The old route also opened the input,
  ensured its FFmpeg index and wrote a PNG before the response; the live app measured 0.6 s
  on an indexed 756-frame clip and about 2 s on this episode. The harness's seek is therefore
  a floor, not an exaggeration.
- **Six concurrent stills cost six decoders.** Peak memory rose from 223 MiB to 1,166 MiB on
  the episode, and from 148 to 870 MiB on the clip. This is the linear scaling the rail
  produced; the app reached 12 GB after scrolling, because each request retained its decoder.
- **A sprite saves 3.4% of the bytes and nothing else.** 2.13 MiB against 2.21 MiB for 284
  individual JPEGs. It also completes only when its last tile is written, so it cannot show
  the first thumbnail early.
- **Hardware decode costs a little host memory, not a lot.** D3D11VA peaks at 239 MiB against
  the CPU's 194 MiB on the episode, because decoded surfaces are copied back for the scale
  and tile filters. GPU memory is not sampled by the harness, so the 239 MiB is the host
  process only.
- **Every desktop platform asks for its own decoder.** The service passes `d3d11va` on
  Windows, `videotoolbox` on macOS, and `vaapi` with an existing `/dev/dri/renderD*` device
  on Linux; each attempt is one keyframe-only pass, and a refusal is answered by retrying
  that command on the CPU. Only the Windows provider is measured here, so the macOS and
  Linux throughput is unmeasured rather than assumed; the encode rate of `-skip_frame nokey`
  is what the design depends on, and every platform gets it whether or not the GPU accepts
  the stream.

## Serving

`cached` serves the keyframe output as individual JPEGs with `cache-control: immutable`:
120 requests at the browser's six-connection concurrency. `cold` sends 30 concurrent requests
to an empty cache; the first starts the hardware keyframe build and every request waits for
its own index to be written, so early ones answer while the rest of the grid is still
building.

| Scenario | Clip | Episode |
| --- | --- | --- |
| 120 cached requests, 6 at once | 109.5 ms total · p50 4.8 ms · p95 8.7 ms | 126.7 ms total · p50 5.9 ms · p95 9.6 ms |
| Server RSS change, 120 cached | +6 MiB | +6 MiB |
| 30 concurrent cold requests | **1 build** · 0.69 s · 189 MiB | **1 build** · 5.77 s · 238 MiB |
| Cold p50 | 591 ms | 3.17 s |
| Time to first file | 436 ms | 559 ms |
| Time to half the files | 544 ms | 3.17 s |
| Time to all files | 624 ms | 5.82 s |
| A 30-row page of the old stills | 10.33 s of sequential decode | 9.23 s of sequential decode |

- **Request count is not the remaining cost.** 120 cached reads finish in 127 ms; each is
  about 6 ms of HTTP and file I/O. The 30-row page that used to spend 9.2 s decoding is now
  a few hundred milliseconds of reads even before browser caching.
- **Memory is flat in the number of requests.** Thirty concurrent cold requests ran one
  FFmpeg process at 238 MiB, the same peak as one request. One hundred and twenty cached
  requests moved the server's RSS by 6 MiB. Nothing on the serving path decodes.
- **The build is progressive.** File 1 exists at 559 ms; half the episode's thumbs exist by
  3.2 s; the last at 5.8 s. Thirty concurrent requests against the empty cache waited a median
  3.2 s because each waits only for its own index, not for the whole set. That is the property
  that makes a cold Scenes tab tolerable: the first rail rows show a picture while the rest
  are still being written.
- **A CPU fallback still works.** Without hardware decode the same design takes 19.5 s for
  the whole episode, 436 ms to the first file and 10.0 s to half. The UI must tolerate the
  partial set rather than waiting for completion.

## The design this supports

One extraction per video, keyed by the source and the grid, and every surface reads the same
files.

1. **Cache key.** Source absolute path, file size, modification time, interval, width and
   JPEG quality. The cache directory holds `thumb-00001.jpg` … and a manifest with
   `interval_ms`, `width` and `count`. A changed source or grid is a new key; the old
   directory is pruned, never read stale. A content hash would let two projects share a cache
   for the same file, but the path/size/mtime key is enough for one video and avoids hashing
   a multi-gigabyte source before the first thumbnail.
2. **One job per key, single-flight, hardware first.** The first request claims the key and
   spawns one FFmpeg (`-hwaccel d3d11va -skip_frame nokey -fps_mode passthrough
   -enc_time_base 1/1000 -vf setpts=PTS-STARTPTS,scale=<width>:-2 -frame_pts 1
   -c:v mjpeg -q:v 5`). It writes every keyframe named by its millisecond timestamp, and the
   service publishes bins while it decodes. The `fps` filter is deliberately not used: it
   maps a keyframe to the nearest grid point and can drop the final keyframe, which on a long
   GOP left the tail bins repeating an earlier picture. If hardware decode is unavailable or
   fails, the bins it already published are kept and the same build is retried once on the
   CPU, overwriting each bin atomically, so a URL that was served once never disappears. The
   build is not cancelled when a viewer leaves — a thumbnail cache is not a preview build —
   and a recorded failure is retried by the next request after 60 s instead of disabling the
   grid forever.
3. **Progressive serving.** The manifest reports `available`, how many bins exist. The UI
   mounts a thumbnail only for an index below `available`, and polls the manifest while
   `state` is `building`. A request for an index that is not written yet answers 404; it
   never starts a decoder. Files are immutable and browser-cached, because the revision is
   part of the URL.
4. **One thumbnail, both surfaces.** A scene's index is
   `floor(scene.start_frame / (interval × fps))`, clamped to `available - 1`. The rail row and
   the timeline block use the same index, the same URL and the same file. There is no second
   extraction for the timeline, and the second `<img>` is a browser cache hit. Each bin is
   the first keyframe in it, or the previous keyframe when the GOP contains none, so the
   picture is never from a later bin and the final keyframe is always represented.
5. **The first Scenes mount starts one build, not one per row.** The manifest request claims
   the key, so a cold rail draws placeholders and fills them in as bins are published instead
   of waiting for the whole grid. The cache key makes a return visit a manifest read and a
   handful of file reads. Opening a video for Configuration does not start a decode, so a
   video that is never shown on Scenes pays nothing.
6. **Budget.** 2.21 MiB per 24-minute episode at 320 px. A 512 MiB ceiling holds roughly 230
   episodes; prune least-recently-used directories, oldest first, after a build. Keep the
   cache out of the preview cache's 2 GiB budget: they have different lifetimes and different
   eviction reasons.
7. **No per-viewer cancellation.** Unlike the preview registry, thumbnails have no viewer
   count. The build is short and its output is shared by every later view; cancelling it when
   the first viewer leaves would make the second viewer pay for it again.

### Why not request all thumbnails in one response

A single multipart stream would save the ~127 ms that 120 cached requests cost, but it would
hold one connection for the 5.8 s cold build (19.5 s without hardware), needs a custom parser
in the UI, bypasses the browser's HTTP cache, and cannot be lazy-loaded. Indexed files cost
about 6 ms each, appear progressively from 559 ms, and the same URL is reused by the rail,
the timeline, and later views. A manifest that lists every index at once is still useful — it
tells the UI the full set before any file exists — but the bytes should stay individual
immutable files.

## Known limits

- **A cold build is 5.8 s with hardware decode, 19.5 s on the CPU.** Hardware decode is not
  guaranteed: remote desktop, old drivers, or unsupported codecs can reject D3D11VA, and the
  CPU fallback must be automatic and testable. Remote sessions are the common failure; the
  fallback is one extra build, not a broken screen.
- **Hardware output was identical on this machine, not on every machine.** H.264 decoding is
  deterministic in practice and `diff -rq` found no difference across the CPU, CUDA, D3D11VA
  and DXVA2 paths here, but a driver is free to produce different pixels. A thumbnail is a
  preview, so approximate output is acceptable; a test should compare dimensions and count,
  not bytes.
- **Thumbnails land on keyframes, not exact scene starts.** A bin shows its first keyframe,
  or the previous keyframe when the GOP has none, so a scene that starts late in its bin can
  show a picture up to one interval earlier and the final keyframe covers the tail. A screen
  that needs the exact frame must ask the frame route.
- **A script input has no thumbnail source.** FFmpeg cannot open a `.vpy` document. The cache
  can use the video's `source_path` when that is a real container, and otherwise reports no
  thumbnails; it must not fall back to opening the script per request.
- **The harness's still is a floor.** It seeks with FFmpeg rather than opening the service's
  decoder and writing PNG through the service, so its 308 ms per still is lower than the live
  0.6–2 s. The concurrency and memory comparison, which is the decision, is unaffected.
- **The mock server is not the service.** The numbers prove the extraction and serving shape.
  The route, cache budget and manifest are implemented in `rust/crates/service/src/media/thumbnails.rs`;
  its long-GOP extraction test is `#[ignore]`d and runs with `--ignored`. GPU memory is not
  measured; the reported peak is the host FFmpeg process.
