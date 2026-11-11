# S1 — decoder init and prepared-source switch

**Question.** How long does it take to open a 10 s 1080p scene, report its clip info, and
produce the first frame — and how long does switching to an already-prepared source take?

**Pass criterion.** Init p50 ≤ 2.5 s and p95 ≤ 6 s; prepared-source switch p50 ≤ 250 ms.

## Method

Harness: `spikes/s1-decoder-init`, a throwaway binary against `av1ation-engine` and the
pinned engine. Fixture: 10 s, 1920×1080, 24 fps, 240 frames, H.264 in MP4, generated with
ffmpeg from `testsrc2`.

For each backend — native FFMS2 and VapourSynth BestSource — the binary performs 20 warm
iterations of `ensure_indexed` → `clip_info` → first frame → all 240 frames through the
engine's own `frame_feed`. The first, index-building open is reported separately. It then
opens both decoders once and alternates 40 first-frame reads between them, which is the
cost of switching to an already-prepared source.

Environment: Windows 11, Rust 2024, **debug profile** (the crate was linked against the
existing dev artifacts). The engine's decode work is backend C code; the Rust frame-feed
loop is slower in debug, so the full-scene numbers are conservative. Init and switch
thresholds are dominated by the decoders and pass by two orders of magnitude.

Command:

```sh
CARGO_TARGET_DIR=target node scripts/run-cargo.mjs run \
  --manifest-path spikes/s1-decoder-init/Cargo.toml -- spikes/fixtures/scene10.mp4
```

## Results

| Backend | Cold open | Open p50 / p95 | Clip info p50 / p95 | First frame p50 / p95 | Full scene p50 / p95 | Throughput p50 |
| --- | --- | --- | --- | --- | --- | --- |
| native FFMS2 | 80.0 ms | 60.8 / 66.2 ms | 0.0 / 0.0 ms | 0.0 / 0.0 ms | 476.9 / 527.9 ms | 503 fps |
| VapourSynth BestSource | 324.1 ms | 47.8 / 54.2 ms | 18.0 / 24.3 ms | 1.7 / 3.3 ms | 762.0 / 837.7 ms | 315 fps |

Prepared-source switch: **p50 0.6 ms, p95 3.0 ms, max 3.8 ms** over 40 swaps.

## Verdict

**Pass.** Warm init-to-first-frame is 61 ms on FFMS2 and 68 ms on BestSource, well inside
the 2.5 s median and 6 s p95 budgets. A swap between two open decoders is under 4 ms, far
inside the 250 ms switch budget.

**Design consequence.** The prepared range stays at **10 s**, the shortest value that keeps
a scene's boundaries addressable without a second prepare. Preview does not need a blocking
"prepare" step: the 1 s decode measured here fits behind a warm-up that starts when the
scene editor opens.

**Limitation.** The scan measures the engine's open and decode path, not an muxed fMP4
write; S2 covers the mux. The build is debug, so the full-scene time is an upper bound.
