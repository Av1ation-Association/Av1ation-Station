import { clockParts } from "./clock";

const pad2 = (value: number) => String(value).padStart(2, "0");

/** A chart's seconds, with locale-aware decimals; a chart label is not a clock. */
function chartNumber(value: number, places: number): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: places,
        maximumFractionDigits: places,
    });
}

/** A scene-length readout: `m:ss.s`, or `h:mm:ss.s` past an hour. */
export function sceneLength(seconds: number): string {
    const parts = clockParts(seconds, 1);
    if (parts === null) {
        return "—";
    }
    const tail = `${pad2(parts.seconds)}.${parts.fraction}`;
    return parts.hours > 0
        ? `${String(parts.hours)}:${pad2(parts.minutes)}:${tail}`
        : `${String(parts.minutes)}:${tail}`;
}

/**
 * An analytics chart's seconds: two decimals under ten, one under two minutes, then
 * minutes. The locale decides the decimal separator; the unit stays explicit.
 */
export function chartSeconds(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value < 0) {
        return "—";
    }
    if (value < 10) {
        return `${chartNumber(value, 2)} s`;
    }
    if (value < 120) {
        return `${chartNumber(value, 1)} s`;
    }
    return `${chartNumber(value / 60, 1)} min`;
}

/** `1h 04m`, `4m 12s`, or `38s`; a long run reads better without seconds below an hour. */
export function runLength(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
        return "—";
    }
    const whole = Math.round(seconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const rest = whole % 60;
    if (hours > 0) {
        return `${String(hours)}h ${pad2(minutes)}m`;
    }
    if (minutes > 0) {
        return `${String(minutes)}m ${pad2(rest)}s`;
    }
    return `${String(rest)}s`;
}

/**
 * `m:ss` under an hour, `h:mm:ss` past it. `null` means there is no estimate, so a live
 * sentence omits the segment rather than printing `ETA —`.
 */
export function eta(seconds: number | null): string | null {
    if (seconds === null) {
        return null;
    }
    const parts = clockParts(seconds, 0);
    if (parts === null) {
        return null;
    }
    return parts.hours > 0
        ? `${String(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
        : `${String(parts.minutes)}:${pad2(parts.seconds)}`;
}

/**
 * A worker's hold time: `48.9s` under a minute, `2m 05s` past it. `null` means the line
 * has no hold value to show.
 */
export function workerHold(seconds: number | null): string | null {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
        return null;
    }
    if (seconds < 60) {
        const tenths = Math.round(seconds * 10);
        if (tenths < 600) {
            return `${(tenths / 10).toFixed(1)}s`;
        }
    }
    const whole = Math.round(seconds);
    return `${String(Math.floor(whole / 60))}m ${pad2(whole % 60)}s`;
}

/**
 * A probe's clip duration: `hh:mm:ss.mmm`. Zero is unknown here because the service derives
 * the value from the frame count and rate and writes `0.0` when the rate is unavailable.
 */
export function clipDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "—";
    }
    const parts = clockParts(seconds, 3);
    if (parts === null) {
        return "—";
    }
    return `${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}.${parts.fraction}`;
}
