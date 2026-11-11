import type { SequenceLive, WorkerLive } from "@av1ation/api";

import { eta, workerHold } from "../duration";

/**
 * A live sequence line for the status strips.
 *
 * The event stream reports a sequence's own bar plus the step or worker it is on; this
 * module is the one place that turns that into the sentence a user reads, so the sequence
 * page, its card, and the directory cannot word the same run differently.
 */

/** Two decimals under ten, one above it: `6.54 FPS`, `131.4 FPS`. */
function rateText(
    fps: number | null,
    unit: "frames" | "scenes" | null,
    sampled = false,
): string | null {
    if (fps === null || !Number.isFinite(fps) || fps <= 0) {
        return null;
    }
    const value = fps >= 10 ? fps.toFixed(1) : fps.toFixed(2);
    const label = unit === "scenes" ? "scenes/s" : sampled ? "sampled FPS" : "FPS";
    return `${value} ${label}`;
}

/** A sequence's own rate, or `null` before it has measured one. */
export function formatRate(live: SequenceLive): string | null {
    return rateText(live.fps, live.fpsUnit, live.sequence === "QualityCheck");
}

function counts(live: SequenceLive): string | null {
    const sampled = live.sequence === "QualityCheck";
    const scenes =
        live.scenesProcessed === null
            ? null
            : live.scenesTotal === null
              ? `${String(live.scenesProcessed)} ${live.scenesProcessed === 1 ? "scene" : "scenes"}`
              : `${String(live.scenesProcessed)}/${String(live.scenesTotal)} scenes`;
    const frames =
        live.framesTotal === null
            ? null
            : `${String(live.framesProcessed ?? 0)}/${String(live.framesTotal)} ${
                  sampled ? "sampled frames" : "frames"
              }`;
    if (scenes !== null && frames !== null) {
        return `${scenes} (${frames})`;
    }
    return scenes ?? frames;
}

/**
 * The active step's line, or `null` when the event carried nothing to show yet.
 *
 * A worker's own id is its scene number, so it is not repeated here as a step name; each
 * worker's line is {@link liveWorkerLine}.
 */
export function liveSummary(live: SequenceLive | null): string | null {
    if (live === null) {
        return null;
    }
    const parts: string[] = [];
    // The current pass only. Its maximum is a ceiling Target Quality may never reach — it
    // stops once every scene meets its target — so `pass / max` would claim a total the
    // engine has not promised. Parallel Encoder reports the same pass for every scene it
    // holds, so it belongs on the worker lines below rather than twice in the summary.
    if (live.pass !== null && live.sequence !== "ParallelEncoder") {
        parts.push(`Pass ${String(live.pass)}`);
    }
    const worker = live.sceneIndex !== null && live.sceneProgress !== null;
    if (!worker && live.phase !== null) {
        parts.push(live.phase);
    }
    const tally = counts(live);
    if (tally !== null) {
        parts.push(tally);
    }
    if (live.progress !== null) {
        parts.push(`${live.progress.toFixed(2)}%`);
    }
    const rate = formatRate(live);
    if (rate !== null) {
        parts.push(rate);
    }
    const etaText = eta(live.etaSeconds);
    if (etaText !== null) {
        parts.push(`ETA ${etaText}`);
    }
    return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * The scene one worker is encoding, with that worker's own rate and finish estimate.
 *
 * Parallel Encoder holds one scene per worker, so the aggregate row above cannot say which
 * of them is nearly done. The scene's own frame pair is what the worker's rate measures;
 * the sequence's counters describe the whole encode and would credit every worker with
 * every other worker's frames. The elapsed time is how long this worker has held the
 * scene, which on a resume is shorter than the scene's total encoding time.
 */
export function liveWorkerLine(worker: WorkerLive): string {
    // The scene's name, percentage and counters read as one phrase; the rate and the
    // estimate are separate facts, so the separators go between groups. The pass is the
    // worker's own: an encoder process reaches its second pass when its scene does, which
    // is not the moment another worker does.
    const prefix = worker.pass === null ? "" : `Pass ${String(worker.pass)} · `;
    const scene = [`Scene ${String(worker.sceneIndex + 1)}:`];
    if (worker.progress !== null) {
        scene.push(`${worker.progress.toFixed(2)}%`);
    }
    const frames =
        worker.framesTotal === null
            ? null
            : `${String(worker.framesProcessed ?? 0)}/${String(worker.framesTotal)} frames`;
    const elapsed = workerHold(worker.elapsedSeconds);
    if (frames !== null && elapsed !== null) {
        scene.push(`(${frames}) in ${elapsed}`);
    } else if (frames !== null) {
        scene.push(`(${frames})`);
    } else if (elapsed !== null) {
        scene.push(`in ${elapsed}`);
    }
    const parts = [`${prefix}${scene.join(" ")}`];
    const rate = rateText(worker.fps, worker.fpsUnit);
    if (rate !== null) {
        parts.push(rate);
    }
    const etaText = eta(worker.etaSeconds);
    if (etaText !== null) {
        parts.push(`ETA ${etaText}`);
    }
    return parts.join(" · ");
}
