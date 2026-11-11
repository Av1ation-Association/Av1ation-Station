/**
 * Playback smoothness and latency, measured at the `<video>` element.
 *
 * The numbers answer three questions the player cannot answer from its own state: how long
 * the first frame took, whether frames were presented on time, and how many the decoder
 * dropped. They are collected from `requestVideoFrameCallback` and
 * `getVideoPlaybackQuality`, which report what the compositor actually did rather than what
 * the element was asked to do, so a stream that plays but stutters cannot look healthy.
 *
 * The arithmetic lives here, outside the component, because it has to be testable without a
 * browser: a summary that silently mis-report a stall is worse than no summary.
 */

/** A frame gap at or above this counts as a stall: long enough to be seen as a hitch. */
export const STALL_MS = 250;

/** One completed playback interval, for the console and the benchmark harness. */
export interface PlaybackSummary {
    /** Which preview source this interval played (`original`, `decoded`, `encode`). */
    source: string;
    /** Wall time between the first and last presented frame. */
    playedMs: number;
    /** Frames the compositor presented. */
    presented: number;
    /** Frames the decoder produced. */
    produced: number;
    /** Frames produced but not presented; Chrome reports these against the element. */
    dropped: number;
    /** `dropped / produced`, or zero when nothing was produced. */
    dropRate: number;
    /** Presented frames per second over `playedMs`. */
    fps: number;
    /** Median gap between presented frames. */
    intervalP50Ms: number | null;
    /** 95th-percentile gap; a tail above the frame interval is visible judder. */
    intervalP95Ms: number | null;
    /** Gaps of `STALL_MS` or more. */
    stalls: number;
    /** The longest single gap, in milliseconds. */
    longestStallMs: number;
    /** `play()` to the first presented frame of the last play interval. */
    firstFrameMs: number | null;
    /** A seek request to the next presented frame. */
    seekMs: number | null;
}

/**
 * Accumulates one source's playback until it is paused.
 *
 * `frame` is called once per presented frame; `quality` once, when the interval ends,
 * because Chrome exposes the counters only cumulatively.
 */
export class PlaybackRecorder {
    private readonly frames: number[] = [];
    private pendingPlayAt: number | null = null;
    private pendingSeekAt: number | null = null;
    private firstFrameMs: number | null = null;
    private seekMs: number | null = null;
    private produced = 0;
    private dropped = 0;

    constructor(private readonly source: string) {}

    /** `play()` was called; the next presented frame ends this wait. */
    playStarted(now: number): void {
        this.pendingPlayAt = now;
    }

    /** A seek was requested; the next presented frame ends this wait. */
    seekStarted(now: number): void {
        this.pendingSeekAt = now;
    }

    /** A frame reached the compositor. */
    frame(now: number): void {
        this.frames.push(now);
        if (this.pendingPlayAt !== null) {
            this.firstFrameMs = now - this.pendingPlayAt;
            this.pendingPlayAt = null;
        }
        if (this.pendingSeekAt !== null) {
            // The callback's timestamp is the frame's presentation time, which can precede
            // the request for a frame already decoded; a negative latency is meaningless.
            this.seekMs = Math.max(0, now - this.pendingSeekAt);
            this.pendingSeekAt = null;
        }
    }

    /** The element's cumulative counters, sampled when the interval ends. */
    quality(produced: number, dropped: number): void {
        this.produced = produced;
        this.dropped = dropped;
    }

    /** Whether anything was presented yet. */
    get hasFrames(): boolean {
        return this.frames.length > 0;
    }

    summary(): PlaybackSummary {
        const intervals: number[] = [];
        for (let index = 1; index < this.frames.length; index += 1) {
            intervals.push(this.frames[index]! - this.frames[index - 1]!);
        }
        const playedMs =
            this.frames.length > 1 ? this.frames[this.frames.length - 1]! - this.frames[0]! : 0;
        const stalls = intervals.filter((gap) => gap >= STALL_MS);
        return {
            source: this.source,
            playedMs,
            presented: this.frames.length,
            produced: this.produced,
            dropped: this.dropped,
            dropRate: this.produced > 0 ? this.dropped / this.produced : 0,
            fps:
                playedMs > 0 && this.frames.length > 1
                    ? ((this.frames.length - 1) * 1000) / playedMs
                    : 0,
            intervalP50Ms: percentile(intervals, 0.5),
            intervalP95Ms: percentile(intervals, 0.95),
            stalls: stalls.length,
            longestStallMs: stalls.length > 0 ? Math.max(...stalls) : 0,
            firstFrameMs: this.firstFrameMs,
            seekMs: this.seekMs,
        };
    }
}

/** Nearest-rank percentile, so a small sample does not invent an interpolated value. */
function percentile(values: readonly number[], fraction: number): number | null {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const rank = Math.ceil(fraction * sorted.length) - 1;
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

/** What the dev-only `window.__av1ationPlayback` hook exposes to the benchmark. */
export interface PlaybackHook {
    entries: PlaybackSummary[];
    /** Bumped whenever an entry is appended, so a harness can wait for the next interval. */
    version: number;
}

/** Entries kept in the hook; a session switch should not grow memory without bound. */
const HOOK_LIMIT = 64;

/**
 * Record a finished interval for the benchmark, and log it.
 *
 * This is dev-only: a release build has no harness to read it, and the screenshot and E2E
 * lanes drive the same component. Logging one line per pause is cheaper than a metrics
 * layer, and the line is what a human reads while tuning.
 */
export function publishPlayback(summary: PlaybackSummary): void {
    console.info(
        `[playback] ${summary.source}: ${summary.fps.toFixed(1)} fps, ` +
            `${(summary.dropRate * 100).toFixed(1)}% dropped, ` +
            `${String(summary.stalls)} stall(s)` +
            (summary.longestStallMs > 0
                ? ` (longest ${summary.longestStallMs.toFixed(0)} ms)`
                : "") +
            `, first frame ${summary.firstFrameMs === null ? "n/a" : `${summary.firstFrameMs.toFixed(0)} ms`}` +
            (summary.seekMs === null ? "" : `, seek ${summary.seekMs.toFixed(0)} ms`),
    );
    if (!import.meta.env.DEV) {
        return;
    }
    const scope = window as typeof window & {
        __av1ationPlayback?: PlaybackHook;
    };
    const hook = scope.__av1ationPlayback ?? { entries: [], version: 0 };
    hook.entries = [...hook.entries, summary].slice(-HOOK_LIMIT);
    hook.version += 1;
    scope.__av1ationPlayback = hook;
}
