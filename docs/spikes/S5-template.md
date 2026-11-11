# S5 — per-scene VapourSynth template throughput

**Question.** Which frame-range template keeps decode throughput within 10% of the
unfiltered baseline, with bounded memory and identical output?

**Pass criterion.** Throughput within 10% of the unfiltered 1080p baseline, bounded memory,
identical output on every candidate.

## Method

Fixture: 600 s, 1920×1080, 24 fps, 14,400 frames of H.264 in MP4, generated from
`testsrc2`. Forty 15 s scenes; every third scene (14 of 40) is filtered with
`std.Expr("x 0.9 *")` on all three planes.

Harness: `spikes/s5-template/run_spike.py`, which generates four scripts:

1. **baseline** — `core.bs.VideoSource`, no filter, no splice.
2. **per-range splice** — every scene sliced, filtered where required, one `std.Splice`.
3. **ordered single pass** — the same parts spliced progressively in frame order.
4. **precomputed range module** — the same graph as (2), with the ranges imported from a
   generated Python module instead of embedded literals.

Each script ran three times. Throughput is wall time for all 14,400 frames; peak RSS is
sampled from `tasklist` every 100 ms; output equality compares SHA-256 of the decoded y4m
at frames 0, 361, 4,000, 7,000 and 14,399 across the three filtered variants.

## Results

| Script | fps (three runs) | Median | vs baseline | Peak RSS |
| --- | --- | --- | --- | --- |
| baseline | 448.5, 462.1, 412.8 | **448.5** | — | 22.8 MB |
| per-range splice | 383.2, 388.1, 412.4 | 388.1 | 86.5% | 22.8 MB |
| ordered single pass | 421.3, 420.9, 421.4 | **421.3** | **93.9%** | 22.8 MB |
| precomputed range module | 427.2, 417.8, 423.8 | 423.8 | 94.5% | 22.5–22.8 MB |

Output equality: **identical** at every sampled frame (`splice_ordered_equal` and
`splice_module_equal` both true). Memory is flat across all variants and all runs.

## Verdict

**Pass with the ordered single-pass splice.** It holds 93.9% of the unfiltered
throughput over three runs, inside the 10% budget, and it is the most consistent variant
(420.9–421.4 fps). The precomputed-module variant also passes at 94.5%, so the range data
source is not the cost. The per-range splice is rejected: its median is 86.5%, outside the
budget, and its runs spread from 383 to 412 fps. Because the baseline itself spreads from
412.8 to 462.1 fps, the 10% band is close to the machine's own noise; the template is
chosen for consistency, not because a splice cliff was isolated.

**Design consequence.** The optional per-scene example uses an **ordered single pass over
the scene table**: it slices each range in frame order and splices progressively, with ranges
read from the generated module, never evaluated per frame in Python. The single end-of-graph
splice is not offered as an example. `preview.md` §3.3 records the example; the default
template is a whole-clip script with no filter , and the example owns no values beyond
`video_path`, `temp_dir` and `scenes`.

**Limitation.** The fixture is synthetic (`testsrc2`), which decodes faster than real
photographic 1080p; the pass is a ratio between graphs on the same source, not an absolute
preview speed. The 10% band is close to the machine's own run-to-run noise (baseline
412–462 fps), so the three-run median, not a single run, is the evidence.

## Follow-up — per-scene filter allocations (2026-11-06)

S5 varied the range and splice shape only. Its filter was a stateless `std.Expr`, and its
memory figure is **CPU RSS**, so it could not see a plugin's own allocations. A template
that passes this spike can still fail on a real denoiser.

Measured on the project's 278-scene, 1920×1080 10-bit source with vszipcu NLMeans (CUDA):

| Graph | Instances | Peak device memory | Throughput |
| --- | --- | --- | --- |
| one NLMeans per scene | 278, built until the card filled | ~7.9 GB at 8 instances; allocation fails | never reached frame 0 |
| one per distinct strength, then slice | 2 | 2.9 GB | 22.3 fps |
| one instance over the whole clip | 1 | 2.0 GB | 21.2–22.7 fps (two runs) |

One instance costs ~0.9 GB at this resolution. Memory grows linearly with the instance
count, so the per-scene graph is an unbounded cost in scene count, not a fixed overhead.
The grouped graph is not slower: 22.3 fps against 21.2–22.7 fps for the single instance is
within run-to-run noise, because the same frames are filtered and the spurious instances
were never evaluated.

`vszipcu`'s `num_streams` is a further memory-for-speed knob. One stream per instance
drops the two-variant graph to 2.2 GB at 20.6 fps (one single-stream instance is 1.6 GB),
so it trades ~9% throughput for ~0.8 GB; the toolkit's default of two streams keeps
throughput at parity and is the recommended setting.

**Correction to the template.** The ordered single pass remains the right splice shape, but
it constructs no filter inside the loop. A device-allocating filter is built once per
distinct parameter set over the whole source, and each scene takes a slice of that variant.
The cost is one instance per distinct parameter set; a single parameter set for the whole
clip is the only way to one instance.

**FrameEval follow-up.** A continuous parameter cannot be grouped, so `std.FrameEval` was
measured with two readers alternating between two scenes. A one-scene cache rebuilt the
filter for every frame (40 builds for 40 frames, 5.9 fps); a scene-keyed LRU(2) built it
twice and ran at 9.5 fps, against 10.6 fps for the grouped graph. The cache is bounded, but
its hits depend on how far apart the readers' scenes are, so it stays an escape hatch and
not the default.
