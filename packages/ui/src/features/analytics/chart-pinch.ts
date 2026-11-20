/**
 * The zoom range a pinch produces, anchored at the pointer.
 *
 * `scale` is the ratio of the current finger distance to the distance at the start of the
 * gesture, so a value above one (fingers moving apart) zooms in. The range is expressed in
 * the same percentages as ECharts' `dataZoom` action and is clamped to the full extent with
 * a minimum width so a hard pinch cannot collapse the axis to nothing.
 */
export function pinchRange(
    [start, end]: readonly [number, number],
    centerPercent: number,
    scale: number,
    minimumWidth = 1,
): [number, number] {
    if (
        !Number.isFinite(scale) ||
        scale <= 0 ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start
    ) {
        return [start, end];
    }
    const width = Math.min(100, Math.max(minimumWidth, (end - start) / scale));
    const ratio = (centerPercent - start) / (end - start);
    let nextStart = centerPercent - ratio * width;
    let nextEnd = nextStart + width;
    if (nextStart < 0) {
        nextStart = 0;
        nextEnd = width;
    }
    if (nextEnd > 100) {
        nextEnd = 100;
        nextStart = 100 - width;
    }
    return [nextStart, nextEnd];
}
