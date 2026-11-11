# S4 — drag-sweep over 5,000 virtualized rows

**Question.** Can a pointer drag select across a 5,000-row virtualized scene list without a
main-thread stall?

**Pass criterion.** No long task > 50 ms during a sweep.

## Method

Harness: `spikes/s4-drag-sweep`, a throwaway Vite + React page. It renders 5,000 scene rows
with manual windowing — a spacer of `rows × 44 px` and only the visible slice mounted — and
a pointer handler that computes the anchor on `pointerdown` and the focus on `pointermove`,
exactly the selection model the scene rail will use.

`window.__spike.run(120)` dispatches a real `pointerdown`, then 120 `pointermove` events
while scrolling from the first row to the last over 2 s, one per animation frame. A
`PerformanceObserver({entryTypes:["longtask"]})` records any task over 50 ms; the run also
counts animation frames and the mounted row nodes, and reads the rendered selection label.

Environment: the preview Chromium, 1280×800 viewport, three consecutive runs.

## Results

| Run | Sweep duration | Frames | Rows selected | Mounted nodes | Long tasks | Max task |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2,032 ms | 120 | 4,943 | 24 | 0 | 0 ms |
| 2 | 2,033 ms | 120 | 4,943 | 24 | 0 | 0 ms |
| 3 | 2,033 ms | 120 | 4,943 | 24 | 0 | 0 ms |

That is 59 fps across the sweep with 24 DOM nodes standing in for 5,000 rows.

## Verdict

**Pass.** No long task appeared in any run. Drag-sweep selection ships; the click/shift
fallback is not needed.

**Design consequence.** Increment 3 keeps the virtualized rail with drag-sweep and the
shared selection store. The row height and window overscan used here (44 px, 8 rows) are
safe starting values for the scene rail.
