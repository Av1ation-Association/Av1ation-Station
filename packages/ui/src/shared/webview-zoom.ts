/** The smallest and largest zoom a desktop window accepts. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

/** One keyboard step. Ten presses cross the full range. */
export const ZOOM_STEP = 0.1;

/** Keep a zoom inside the range the host command also enforces. */
export function clampZoom(value: number): number {
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) / 100;
}

/** The next zoom after one step; the result never drifts below the minimum or above the maximum. */
export function steppedZoom(current: number, direction: "in" | "out"): number {
    return clampZoom(current + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP));
}
