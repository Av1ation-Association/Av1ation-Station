import type { EncodeEvent } from "@av1ation/contracts";

import { useSyncExternalStore } from "react";

/**
 * The live status of the sequence a video is running.
 *
 * This is not pipeline state: whether a stage has run is derived on the server from the
 * engine's own data. This snapshot exists only so a running bar can show frames, speed, and
 * ETA between reloads, and it is dropped the moment the run's terminal event arrives.
 */
export type SequenceLive = {
    sequence: string;
    progress: number | null;
    /** `Encode`, `Compare`, `Quality`, or a worker's scene number. */
    phase: string | null;
    pass: number | null;
    /**
     * The most passes the sequence may run, when it names a ceiling.
     *
     * Target Quality stops as soon as every scene meets its target, so this is not a total:
     * a run can end after one pass. It must never divide the bar or become the denominator
     * of a `pass / max` label.
     */
    maxPasses: number | null;
    framesProcessed: number | null;
    framesTotal: number | null;
    scenesProcessed: number | null;
    scenesTotal: number | null;
    sceneIndex: number | null;
    sceneProgress: number | null;
    /**
     * The scenes workers are encoding right now.
     *
     * Parallel Encoder runs several at once, each on its own scene, so the aggregate bar
     * above cannot say which of them is nearly done. Empty for a sequence that runs alone.
     */
    workers?: readonly WorkerLive[];
    /** Frames per second, or scenes per second when the sequence counts scenes. */
    fps: number | null;
    fpsUnit: "frames" | "scenes" | null;
    etaSeconds: number | null;
    /** Local clock of the last published reading, so ticks can be throttled to a cadence. */
    measuredAt: number | null;
    /**
     * Ticks still inside the rate window.
     *
     * A rate measured between two adjacent events is a rate between two arrivals, not a
     * rate of work: Scene Detector emits a tick per frame, so the number became `1 frame /
     * inter-arrival`, which swung with delivery jitter. The window below is what makes the
     * published figure track the engine instead of the network. Internal to the sampler; a
     * screen should read `framesProcessed`.
     */
    samples?: readonly RateSample[];
};

/** One tick's place on the rate window: when it arrived and how far the sequence was. */
export type RateSample = {
    t: number;
    frames: number | null;
    scenes: number | null;
};

/**
 * One worker's own scene, as the Parallel Encoder page shows it.
 *
 * The engine names a worker after the scene it holds and sends no worker id, so a scene is
 * the only handle there is: its first tick creates the entry and the completion status the
 * engine sends for that scene removes it.
 */
export type WorkerLive = {
    /** The scene this worker holds, zero-based. */
    sceneIndex: number;
    /**
     * The encoder pass this worker is on.
     *
     * Passes belong to the worker, not the run: Parallel Encoder gives each scene to one
     * encoder process, and those processes reach pass two at different times. The aggregate
     * row cannot name one pass for all of them.
     */
    pass: number | null;
    /** The scene's own percentage. */
    progress: number | null;
    framesProcessed: number | null;
    framesTotal: number | null;
    /** Frames per second inside this scene. */
    fps: number | null;
    fpsUnit: "frames" | "scenes" | null;
    etaSeconds: number | null;
    /** Seconds this worker has held this scene. */
    elapsedSeconds: number | null;
    /** Local clock of this worker's last published reading. */
    measuredAt: number | null;
    /** When this worker first reported the scene; internal to the sampler. */
    startedAt?: number | null;
    /** Ticks still inside this worker's window; internal, like the sequence's samples. */
    samples?: readonly RateSample[];
};

/** Live status per video, keyed by {@link liveKey}. */
export type LiveSnapshot = Readonly<Record<string, SequenceLive>>;

let snapshot: LiveSnapshot = {};
const listeners = new Set<() => void>();

/** The key one video's live status lives under. */
export function liveKey(projectId: string, videoId: string): string {
    return `${projectId}\u0000${videoId}`;
}

function publish(next: LiveSnapshot): void {
    snapshot = next;
    for (const listener of listeners) {
        listener();
    }
}

/**
 * Fold one encode event into the live snapshot.
 *
 * A new pass, or a different step of one pass, starts a new rate window: measuring across
 * it would divide the new step's first frames by the previous step's elapsed time. A worker
 * moving to its next scene keeps its window, because the aggregate frame counter does not
 * restart with it.
 */
export function applyLive(
    previous: LiveSnapshot,
    event: EncodeEvent,
    now: number = Date.now(),
): LiveSnapshot {
    const key = liveKey(event.project_id, event.video_id);
    if (event.kind === "cancelled" || event.kind === "finished" || event.kind === "failed") {
        if (!(key in previous)) {
            return previous;
        }
        const next = { ...previous };
        delete next[key];
        return next;
    }

    const sequence = event.sequence;
    if (sequence === undefined || sequence === null) {
        return previous;
    }

    const before = previous[key]?.sequence === sequence ? previous[key] : undefined;
    const restarted = event.kind === "started" || before === undefined;
    const sameStream =
        before !== undefined && event.kind !== "started" && sameRateStream(before, event);
    // A new pass or step starts a new rate window even when the video's run continues.
    const fresh = restarted || !sameStream;

    const next: SequenceLive = {
        sequence,
        progress: event.kind === "started" ? 0 : (event.progress ?? before?.progress ?? null),
        phase: event.phase ?? (restarted ? null : (before.phase ?? null)),
        pass: event.pass ?? (restarted ? null : (before.pass ?? null)),
        maxPasses: event.max_passes ?? (restarted ? null : (before.maxPasses ?? null)),
        framesProcessed:
            event.frames_processed ?? (restarted ? null : (before.framesProcessed ?? null)),
        framesTotal: event.frames_total ?? (restarted ? null : (before.framesTotal ?? null)),
        scenesProcessed:
            event.scene_count ??
            event.scenes_processed ??
            (restarted ? null : (before.scenesProcessed ?? null)),
        scenesTotal: event.scenes_total ?? (restarted ? null : (before.scenesTotal ?? null)),
        sceneIndex: event.scene_index ?? (restarted ? null : (before.sceneIndex ?? null)),
        sceneProgress: event.scene_progress ?? (restarted ? null : (before.sceneProgress ?? null)),
        fps: fresh ? null : (before.fps ?? null),
        fpsUnit: fresh ? null : (before.fpsUnit ?? null),
        etaSeconds: fresh ? null : (before.etaSeconds ?? null),
        measuredAt: fresh ? null : (before.measuredAt ?? null),
        samples: fresh ? [] : (before.samples ?? []),
        workers: fresh ? [] : (before.workers ?? []),
    };

    if (event.kind === "completed") {
        next.progress = 100;
        next.fps = null;
        next.fpsUnit = null;
        next.etaSeconds = null;
        next.workers = [];
        return { ...previous, [key]: next };
    }

    if (event.kind === "started") {
        return { ...previous, [key]: next };
    }

    // A scene checkpoint carries the new scene row and its count, not a timing sample.
    // Measuring it as a scene rate would replace Scene Detector's frame FPS with a
    // one-off scenes/s and clear its ETA until the next frame tick.
    const carriesProgress =
        (event.frames_processed ?? null) !== null || (event.scenes_processed ?? null) !== null;
    if (carriesProgress) {
        const samples = next.samples ?? [];
        const last = samples[samples.length - 1];
        if (last === undefined || now - last.t >= RATE_SAMPLE_MS) {
            const sample: RateSample = {
                t: now,
                frames: next.framesProcessed,
                scenes: next.scenesProcessed,
            };
            next.samples = [...samples, sample].slice(-RATE_MAX_SAMPLES);
        }
        const reading = measureRate(before, next, now);
        if (reading !== null) {
            next.fps = reading.fps;
            next.fpsUnit = reading.unit;
            next.etaSeconds = reading.etaSeconds;
            next.measuredAt = reading.at;
        }
    }
    // A worker's own scene is measured the same way, but against its own frames.
    next.workers = updateWorkers(next.workers ?? [], event, now);
    return { ...previous, [key]: next };
}

/**
 * Fold one worker tick into the scenes currently encoding.
 *
 * A worker reports its scene's percentage and frame pair; the scene's final status arrives
 * with neither, which is what clears it from the list when the worker moves on.
 */
function updateWorkers(
    workers: readonly WorkerLive[],
    event: EncodeEvent,
    now: number,
): readonly WorkerLive[] {
    const sceneIndex = event.scene_index;
    if (sceneIndex === null || sceneIndex === undefined) {
        return workers;
    }
    const reported =
        (event.scene_progress ?? null) !== null || (event.scene_frames_processed ?? null) !== null;
    if (!reported) {
        return workers.some((worker) => worker.sceneIndex === sceneIndex)
            ? workers.filter((worker) => worker.sceneIndex !== sceneIndex)
            : workers;
    }
    const at = workers.findIndex((worker) => worker.sceneIndex === sceneIndex);
    const existing = at === -1 ? null : (workers[at] ?? null);
    const startedAt = existing?.startedAt ?? now;
    const pass = event.pass ?? existing?.pass ?? null;
    // A new pass restarts this scene's frame counter, so the previous pass's rate would be
    // measured against frames that no longer exist. The window starts again with it.
    const nextPass =
        existing !== null && pass !== null && existing.pass !== null && pass !== existing.pass;
    const worker: WorkerLive = {
        sceneIndex,
        pass,
        progress: event.scene_progress ?? existing?.progress ?? null,
        framesProcessed: event.scene_frames_processed ?? existing?.framesProcessed ?? null,
        framesTotal: event.scene_frames_total ?? existing?.framesTotal ?? null,
        fps: nextPass ? null : (existing?.fps ?? null),
        fpsUnit: nextPass ? null : (existing?.fpsUnit ?? null),
        etaSeconds: nextPass ? null : (existing?.etaSeconds ?? null),
        elapsedSeconds: (now - startedAt) / 1000,
        measuredAt: nextPass ? null : (existing?.measuredAt ?? null),
        startedAt,
        samples: nextPass ? [] : (existing?.samples ?? []),
    };
    const frames = worker.framesProcessed;
    if (frames !== null) {
        const samples = worker.samples ?? [];
        const last = samples[samples.length - 1];
        if (last === undefined || now - last.t >= RATE_SAMPLE_MS) {
            worker.samples = [...samples, { t: now, frames, scenes: null }].slice(
                -RATE_MAX_SAMPLES,
            );
        }
        const reading = measureRate(existing ?? undefined, worker, now);
        if (reading !== null) {
            worker.fps = reading.fps;
            worker.fpsUnit = reading.unit;
            worker.etaSeconds = reading.etaSeconds;
            worker.measuredAt = reading.at;
        }
    }
    return at === -1
        ? [...workers, worker]
        : workers.map((entry, index) => (index === at ? worker : entry));
}

/**
 * Whether two ticks describe the same stream of work.
 *
 * Only a tick that names something new ends the stream: a different pass, or a different
 * named step such as `Encode` → `Compare`, whose frame counter starts over. Everything else
 * continues it, because the bar above is the same bar:
 *
 * - a worker names its phase after the scene it holds, so a scene change must not restart
 *   the rate while the aggregate counter keeps counting;
 * - Parallel Encoder also emits the aggregate tick on its own between worker ticks, with no
 *   phase and no pass. That tick used to look like a step change and reset the window, which
 *   is why its FPS and ETA disappeared every time a worker reported.
 */
function sameRateStream(before: SequenceLive, event: EncodeEvent): boolean {
    // A worker's own pass change says nothing about the aggregate bar: each worker reaches
    // its next pass at a different moment, so honouring it here reset the whole encode's
    // rate once per worker and the published FPS swung with whichever scene spoke last.
    if (event.scene_index !== null && event.scene_index !== undefined) {
        return true;
    }
    if (event.pass !== null && event.pass !== undefined && event.pass !== before.pass) {
        return false;
    }
    if (event.phase === null || event.phase === undefined) {
        return true;
    }
    return before.phase === event.phase;
}

/**
 * The span of ticks one published rate averages over.
 *
 * The engine's work is bursty on a scale of seconds: a decoder hands over a batch of
 * frames, and Scene Detector writes a checkpoint after every scene, so a real 60 s run
 * produced anywhere from 2 to 60 frames in a second. Measured over four seconds it still
 * read 17-44 fps around a true 30; over ten seconds the same run sat inside 28-33. Ten
 * seconds is the shortest window that made the figure follow the machine rather than the
 * burst, and a reader watching a minutes-long stage never needs it to turn faster.
 */
const RATE_WINDOW_MS = 10_000;

/** How often a new reading replaces the published one; overlapping windows, not a reset. */
const RATE_PUBLISH_MS = 1_000;

/** The shortest span that can publish: a burst milliseconds apart is not a measurement. */
const RATE_MIN_SPAN_MS = 1_000;

/** How much of a fresh reading replaces the previous one; lower is steadier. */
const RATE_SMOOTHING = 0.4;

/**
 * How often a tick becomes a window sample.
 *
 * Scene Detector emits a tick per frame; keeping all of them would copy a thousand-element
 * array a hundred times a second to answer a question that changes once a second. A quarter
 * of a second resolves the window's ends far more finely than the published figure needs.
 */
const RATE_SAMPLE_MS = 250;

/** Bounds the buffer: one sample per quarter second, so this covers sixteen seconds. */
const RATE_MAX_SAMPLES = 64;

/**
 * The part of a live entry a rate window needs.
 *
 * The aggregate bar and one worker's scene measure the same way — counters over a sliding
 * window — so they share the sampler, its cadence and its smoothing.
 */
type RateSource = {
    fps: number | null;
    fpsUnit: "frames" | "scenes" | null;
    measuredAt: number | null;
    samples?: readonly RateSample[];
    framesProcessed: number | null;
    framesTotal: number | null;
    scenesProcessed?: number | null;
    scenesTotal?: number | null;
};

/**
 * Measure the rate of the stream this tick belongs to, and the ETA from its remaining work.
 *
 * Returns `null` when nothing new can be said: the window has not spanned a second yet, or
 * the published figure is younger than one cadence. Overlapping windows mean each reading
 * carries nine of the previous reading's ten seconds, so the number moves smoothly while
 * still responding to a real change in speed.
 */
function measureRate(
    before: RateSource | undefined,
    next: RateSource,
    now: number,
): {
    fps: number;
    unit: "frames" | "scenes";
    etaSeconds: number | null;
    at: number;
} | null {
    const samples = next.samples ?? [];
    if (before === undefined || samples.length === 0) {
        return null;
    }
    const measuredAt = next.measuredAt;
    if (measuredAt !== null && now - measuredAt < RATE_PUBLISH_MS) {
        return null;
    }
    // The window ends at this tick, not at the last buffered sample: the counters here are
    // the freshest the ETA can be, and the buffer only supplies the window's left edge.
    // The oldest tick still inside the window. Sorted by arrival, so the first match is it.
    const oldest = samples.find((sample) => now - sample.t <= RATE_WINDOW_MS);
    if (oldest === undefined || now - oldest.t < RATE_MIN_SPAN_MS) {
        return null;
    }
    const elapsed = (now - oldest.t) / 1000;
    const framesProcessed = next.framesProcessed ?? null;
    const framesTotal = next.framesTotal ?? null;
    const frames =
        framesProcessed !== null && oldest.frames !== null ? framesProcessed - oldest.frames : null;
    const scenesProcessed = next.scenesProcessed ?? null;
    const scenesTotal = next.scenesTotal ?? null;
    const scenes =
        scenesProcessed !== null && oldest.scenes !== null ? scenesProcessed - oldest.scenes : null;

    const smooth = (current: number, unit: "frames" | "scenes"): number =>
        before.fps === null || before.fpsUnit !== unit
            ? current
            : before.fps * (1 - RATE_SMOOTHING) + current * RATE_SMOOTHING;

    if (frames !== null && frames > 0) {
        const fps = smooth(frames / elapsed, "frames");
        const remaining =
            framesTotal === null ? null : Math.max(0, framesTotal - (framesProcessed ?? 0));
        return {
            fps,
            unit: "frames",
            etaSeconds: remaining === null ? null : remaining / fps,
            at: now,
        };
    }
    if (scenes !== null && scenes > 0) {
        const fps = smooth(scenes / elapsed, "scenes");
        const remaining =
            scenesTotal === null ? null : Math.max(0, scenesTotal - (scenesProcessed ?? 0));
        return {
            fps,
            unit: "scenes",
            etaSeconds: remaining === null ? null : remaining / fps,
            at: now,
        };
    }
    return null;
}

/** Record a batch of events, publishing one notification for the whole batch. */
export function recordLive(events: readonly EncodeEvent[], now?: number): void {
    let next = snapshot;
    for (const event of events) {
        next = applyLive(next, event, now);
    }
    if (next !== snapshot) {
        publish(next);
    }
}

/** Drop every live entry; the shell calls this when the stream reconnects. */
export function clearLive(): void {
    if (Object.keys(snapshot).length === 0) {
        return;
    }
    publish({});
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function read(): LiveSnapshot {
    return snapshot;
}

/** One video's live status, or `null` when nothing is running. */
export function useSequenceLive(projectId: string, videoId: string): SequenceLive | null {
    const current = useSyncExternalStore(subscribe, read, read);
    return current[liveKey(projectId, videoId)] ?? null;
}

/**
 * Whether a video other than this one holds the process-wide encode lock.
 *
 * The service runs one encode at a time for every project. The stream already carries the
 * running video, so a second project can explain the refusal instead of offering a Start
 * button the server is certain to answer with `409`. The same refusal still arrives from
 * the server if the user gets there first: this is the explanation before the click, not
 * the enforcement. A boolean keeps the store's snapshot stable between ticks, so the
 * header does not re-render for every progress event.
 */
export function useEncodeBlockedElsewhere(projectId: string, videoId: string): boolean {
    const current = useSyncExternalStore(subscribe, read, read);
    const own = liveKey(projectId, videoId);
    return Object.keys(current).some((key) => key !== own);
}

/**
 * Whether another project holds the process-wide encode lock.
 *
 * A project's queue is not locked by another project's run: the service refuses the start
 * and leaves every configuration, scene, and queue write allowed. The queue therefore asks
 * this to explain its Start buttons and nothing else, so navigating to a second project
 * never looks like a frozen editor.
 */
export function useProjectEncodeBlockedElsewhere(projectId: string): boolean {
    const current = useSyncExternalStore(subscribe, read, read);
    const prefix = `${projectId}\u0000`;
    return Object.keys(current).some((key) => !key.startsWith(prefix));
}

/** The one live run, with the project and video its key encodes. */
export interface ActiveRun {
    projectId: string;
    videoId: string;
    live: SequenceLive;
}

/**
 * The one run the service is currently executing.
 *
 * The service has a singleton, so the first snapshot entry is the whole answer. The strip
 * uses it to stay on screen while the user edits another project or video.
 */
export function useActiveRun(): ActiveRun | null {
    const current = useSyncExternalStore(subscribe, read, read);
    const key = Object.keys(current)[0];
    if (key === undefined) {
        return null;
    }
    const live = current[key];
    const separator = key.indexOf("\u0000");
    if (live === undefined || separator <= 0) {
        return null;
    }
    return {
        projectId: key.slice(0, separator),
        videoId: key.slice(separator + 1),
        live,
    };
}
