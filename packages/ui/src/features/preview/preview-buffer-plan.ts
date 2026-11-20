/**
 * The buffer policy for the Decoded source, derived from what the session has measured.
 *
 * The player used to keep a fixed four seconds of appended lead and a fixed three windows
 * of cache ahead. Those numbers were guesses from one machine: a source whose lossless rate
 * is lower can hold far more in the same `SourceBuffer`, while a slower build needs a
 * deeper cache runway to keep the same lead. This module turns the two measurements the
 * session actually has — how many bytes a window costs and how long it took to build — into
 * the number of windows to append and build ahead.
 *
 * The ceiling is memory, not time. Chromium refuses an append once a `SourceBuffer` reaches
 * roughly 150 MB, so the plan spends a fixed byte budget and converts it to seconds with the
 * measured rate. A cheap 720p source therefore gets a longer lead than a grainy 1080p one
 * without a second configuration value, and a build slower than a window deepens the cache
 * runway rather than pretending the fixed three windows are enough.
 */

/**
 * Bytes a MediaSource session may retain.
 *
 * Chromium's own ceiling is about 150 MB for one `SourceBuffer`. The remaining headroom
 * covers the init segment, the in-flight append, and a trim that lands one update late.
 */
export const SOURCE_BUFFER_BUDGET_BYTES = 140 * 1024 * 1024;

/** Seconds of played picture kept so a short backward step is a buffer hit. */
export const RETAIN_BEHIND_SECONDS = 1;

/**
 * Extra seconds left behind a trim, so it cannot cut the GOP the playhead is in.
 *
 * The lossless proxy is encoded with a 25-frame GOP (about 1.04 s). A `remove` whose end
 * lands inside the group that is playing makes Chromium roll the playhead back to a
 * keyframe it just discarded; half a second of guard keeps the cut in the previous group.
 * It is not part of the retention budget because it is headroom, not seekable history.
 */
export const TRIM_GUARD_SECONDS = 0.5;

/**
 * Seconds of media the paused player may append before it stops filling the SourceBuffer.
 *
 * Chromium's usable cap on these lossless windows is about 150 MB, and the next window
 * still has to fit. An adaptive plan can overestimate the rate of a grainy source and fill
 * to 8–10 s, at which point that next append is refused and playback waits on the quota
 * rather than on a build. Six seconds is two to three windows of headroom under every
 * measured rate; the deeper runway lives in the preview cache, not in the element.
 */
export const PAUSED_MSE_MAX_SECONDS = 6;

/**
 * Cache bytes a paused player may fill before it stops warming windows.
 *
 * The service keeps a 2 GiB preview cache of finished windows, so a runway below that
 * ceiling is not evicted while it is being built. Paused is the one time the player can
 * spend the whole budget: a slow decoder then has minutes of cache to draw on instead of
 * the few seconds the playing lead can hold.
 */
export const PAUSED_CACHE_BUDGET_BYTES = 1536 * 1024 * 1024;

/**
 * The most warm requests a paused player may have outstanding.
 *
 * The byte budget already bounds a grainy source to a few dozen windows; this bounds the
 * request fan-out for a cheap one, where the same bytes would name hundreds of windows.
 */
export const MAX_PAUSED_PREBUILD_WINDOWS = 60;

/** Lossless 1080p 10-bit rate measured across the two test projects, in bytes per second. */
const ASSUMED_BYTES_PER_SECOND = 15 * 1024 * 1024;

/** Window build time measured on those projects while the player was running. */
const ASSUMED_BUILD_SECONDS = 1.4;

/** How much one observation moves the smoothed values; four or five windows settle a plan. */
const OBSERVATION_WEIGHT = 0.35;

/** Fewer than two appended windows leaves the next build in the seam's critical path. */
const MIN_LEAD_WINDOWS = 2;

/** A cache runway deeper than this spends disk and encoder time on a seek nobody may make. */
const MAX_PREBUILD_WINDOWS = 6;

/**
 * One window's build, as the player observed it.
 *
 * `bytes` is the response's own length; a fragmented proxy is chunked, so this is the only
 * way to learn the source's lossless rate. `buildSeconds` is wall time from the request to
 * the last byte, which includes the queue the service may have given the build.
 */
export type WindowObservation = {
    buildSeconds: number;
    bytes: number;
    windowSeconds: number;
};

/** What the prefetcher and the MediaSource session should do with their memory. */
export type PreviewBufferPlan = {
    /** Appended-and-buffered seconds to keep after the playhead. */
    leadSeconds: number;
    /** Seconds to buffer while paused, where nothing is consuming the lead. */
    pausedLeadSeconds: number;
    /** Windows to build beyond the appended horizon without appending them. */
    prebuildWindows: number;
    /** Windows to build beyond the appended horizon while the element is paused. */
    pausedPrebuildWindows: number;
    /** Bytes the plan expects the session to retain, for diagnostics and tests. */
    retainedBytes: number;
    /** The smoothed rate the plan used, so a later observation can move it. */
    bytesPerSecond: number;
    /** The smoothed build time the plan used. */
    buildSeconds: number;
};

/**
 * The starting plan before the session has measured anything.
 *
 * It uses the measured test-project values rather than zero, so the first window already
 * starts a real pipeline; the first completed warm replaces them with this machine's own
 * numbers.
 */
export function initialPreviewPlan(windowSeconds: number): PreviewBufferPlan {
    return planFor(windowSeconds, ASSUMED_BUILD_SECONDS, ASSUMED_BYTES_PER_SECOND);
}

/**
 * Fold one completed window into the plan.
 *
 * Both values are smoothed instead of replaced: a single slow build during a seek or a
 * concurrent encode would otherwise double the lead, and a single fast cache hit during
 * warm-up would starve the next seam. An observation without usable bytes or time is
 * ignored, so a failed or cancelled warm cannot change the plan.
 */
export function observePreviewWindow(
    plan: PreviewBufferPlan,
    observation: WindowObservation,
    windowSeconds: number,
): PreviewBufferPlan {
    if (observation.buildSeconds <= 0 || observation.bytes <= 0 || observation.windowSeconds <= 0) {
        return plan;
    }
    const bytesPerSecond = observation.bytes / observation.windowSeconds;
    return planFor(
        windowSeconds,
        blend(plan.buildSeconds, observation.buildSeconds),
        blend(plan.bytesPerSecond, bytesPerSecond),
    );
}

function blend(previous: number, observed: number): number {
    return previous * (1 - OBSERVATION_WEIGHT) + observed * OBSERVATION_WEIGHT;
}

/**
 * Turn measured rates into window counts.
 *
 * The lead is whole windows because an append cannot stop in the middle of one. The budget
 * holds the rate constant and lets the seconds vary, which is why a cheaper source buffers
 * further ahead. A source whose single window exceeds the whole budget gets one lead
 * window: no plan can make that fit, and the append path's quota recovery trims the played
 * part instead of failing the picture.
 */
function planFor(
    windowSeconds: number,
    buildSeconds: number,
    bytesPerSecond: number,
): PreviewBufferPlan {
    const window = Math.max(0.5, windowSeconds);
    const budgetSeconds = SOURCE_BUFFER_BUDGET_BYTES / bytesPerSecond;
    const affordableWindows = Math.floor((budgetSeconds - RETAIN_BEHIND_SECONDS) / window) - 1;
    const wantedWindows = Math.ceil((buildSeconds * 3 + 2) / window);
    const leadWindows = Math.max(
        1,
        Math.min(affordableWindows, Math.max(MIN_LEAD_WINDOWS, wantedWindows)),
    );
    const leadSeconds = leadWindows * window;
    // Nothing consumes a paused buffer, so the whole SourceBuffer is the lead; the
    // playing plan keeps a window of headroom for the in-flight append and the retained
    // second behind the playhead.
    const pausedWindows = Math.max(1, Math.floor(budgetSeconds / window));
    const pausedLeadSeconds = pausedWindows * window;
    const prebuildWindows = Math.min(
        MAX_PREBUILD_WINDOWS,
        Math.max(2, Math.ceil((buildSeconds * 3) / window)),
    );
    const pausedPrebuildWindows = Math.min(
        MAX_PAUSED_PREBUILD_WINDOWS,
        Math.max(
            prebuildWindows,
            Math.floor(PAUSED_CACHE_BUDGET_BYTES / (window * bytesPerSecond)),
        ),
    );
    return {
        leadSeconds,
        pausedLeadSeconds,
        prebuildWindows,
        pausedPrebuildWindows,
        retainedBytes: (RETAIN_BEHIND_SECONDS + leadSeconds + window) * bytesPerSecond,
        bytesPerSecond,
        buildSeconds,
    };
}
