# S2 — fMP4 mux, play and seek

**Question.** Can VapourSynth frames be muxed into a fragmented MP4 that a browser
`<video>` element plays and seeks, on the platforms the application ships to?

**Pass criterion.** Plays and seeks; timestamps monotonic; no A/V drift.

## Method

The spike muxes **VapourSynth-decoded frames**, not an encoder's output:

```sh
vspipe -c y4m clip.vpy - \
  | ffmpeg -f yuv4mpegpipe -i - -c:v libvpx-vp9 -b:v 2M -g 24 -keyint_min 24 \
      -movflags +frag_keyframe+empty_moov+default_base_moof -f mp4 scene10.mp4
```

The result is served by a 60-line Node server with `Accept-Ranges: bytes` and
`video/mp4`. `spikes/s2-fmp4/probe.html` loads the stream in a detached `<video>`, measures
load-to-first-`playing`, seeks to 5 s, waits for `seeked` and then for
`requestVideoFrameCallback`, and samples `currentTime` every 100 ms for 2 s.

Clients: the Freebuff preview Chromium; the installed Edge 156 through CDP
(`spikes/s2-fmp4/cdp-probe.mjs`, no Playwright) as the WebView2 engine family. No
WebKit build was available on this machine.

## Results

| Check | Chromium | Edge / WebView2 family |
| --- | --- | --- |
| Container | 10 `moof` + 10 `mdat` (1 s fragments), 10.0 s, 2.1 MB | same |
| Load to first playing (10 cold loads) | 21–68 ms | 23–48 ms |
| Seek to 5 s | currentTime 5.031, presented 5.042, 13 ms | currentTime 5.029, presented 5.042, 15–24 ms |
| Timestamps over 2 s playback | 0.089 → 2.097, non-decreasing | 0.100 → 2.118, non-decreasing |
| A/V drift | not applicable: the fixture has no audio | not applicable |

## Verdict

**Pass with a noted limitation.** The transport is confirmed: frames decoded by
VapourSynth mux into an fMP4 that both Chromium and the WebView2 engine family play and
seek frame-accurately, with monotonic timestamps. The limitation is coverage: the
**WebView2 control itself** was not instrumented, only Edge 156, its engine; and
Safari/WebKit was not tested because this is a Windows machine. A4 stands, and no
desktop-only transport exemption is needed.

**Design consequence.** The preview source is a range-served fMP4 file as designed in
[preview.md](../preview.md) §3.5. One-second fragments and `Accept-Ranges` are sufficient;
no MSE, HLS, or WebRTC layer is justified.
