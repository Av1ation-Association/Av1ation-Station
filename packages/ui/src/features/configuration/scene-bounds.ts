/**
 * Scene bounds are stored as integer frames. The editor shows seconds only when the
 * probed rate belongs to one video; a project or template has no single rate to use.
 *
 * A seconds edit rounds to the nearest frame. The frame readout is the value that will be
 * written, so a rate such as 23.976 never hides the rounding in a decimal display.
 */

function validRate(frameRate: number | null | undefined): frameRate is number {
    return typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0;
}

/** Converts a seconds edit to the frame count the engine stores, or `null` when unrateable. */
export function secondsToFrames(
    seconds: number,
    frameRate: number | null | undefined,
): number | null {
    if (!validRate(frameRate) || !Number.isFinite(seconds) || seconds < 0) {
        return null;
    }
    return Math.round(seconds * frameRate);
}

/** Converts a stored frame bound to seconds, or `null` when the rate is unknown. */
export function framesToSeconds(
    frames: number,
    frameRate: number | null | undefined,
): number | null {
    if (!validRate(frameRate) || !Number.isFinite(frames)) {
        return null;
    }
    return frames / frameRate;
}

/** A short seconds value for the bound field: enough precision to expose the frame. */
export function formatSeconds(seconds: number): string {
    return String(Number(seconds.toFixed(3)));
}
