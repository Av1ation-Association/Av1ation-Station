/**
 * Split a non-negative number of seconds into clock parts after rounding to the target
 * precision.
 *
 * A duration and a frame position word the same clock differently, but both must split the
 * same number. Rounding the fraction independently from the whole seconds lets `59.96`
 * render as `0:60.0`; normalizing before the split makes the duration policies and
 * `formatTimecode` agree at a minute boundary. The caller owns the presentation.
 */
export type ClockPrecision = 0 | 1 | 2 | 3;

export interface ClockParts {
    hours: number;
    minutes: number;
    seconds: number;
    /** The fraction digits, already padded; empty at precision 0. */
    fraction: string;
}

export function clockParts(seconds: number, precision: ClockPrecision): ClockParts | null {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return null;
    }
    const scale = 10 ** precision;
    const total = Math.round(seconds * scale);
    const whole = Math.floor(total / scale);
    return {
        hours: Math.floor(whole / 3600),
        minutes: Math.floor((whole % 3600) / 60),
        seconds: whole % 60,
        fraction: precision === 0 ? "" : String(total % scale).padStart(precision, "0"),
    };
}
