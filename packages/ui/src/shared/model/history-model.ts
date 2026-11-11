import type { TimelineRecord } from "@av1ation/contracts";

import { runLength } from "../duration";
import { elapsedSeconds, type RunOutcomeState } from "./run-presentation";

/** One sequence attempt, with the duration the server's two timestamps imply. */
export interface HistoryStep {
    sequence: string;
    outcome: Exclude<RunOutcomeState, "running" | "unrecorded">;
    startedAt: string;
    endedAt: string;
    durationSeconds: number | null;
    framesProcessed: number | null;
    framesTotal: number | null;
    fps: number | null;
    message: string | null;
}

/** One run: its sequence attempts, then its terminal record's outcome and message. */
export interface HistoryRun {
    runId: string;
    startedAt: string;
    endedAt: string;
    outcome: Exclude<RunOutcomeState, "unrecorded">;
    durationSeconds: number | null;
    message: string | null;
    steps: HistoryStep[];
    /** The entry that closed the run, when the timeline has one. */
    terminal: TimelineRecord | null;
    /** Frames processed across the run's attempts, when any attempt reported them. */
    frames: number | null;
}

function outcomeOf(value: string): HistoryStep["outcome"] {
    return value === "completed" || value === "cancelled" || value === "failed"
        ? value
        : "unrecognized";
}

/**
 * Group the append-only record into runs.
 *
 * The file is chronological, and every run ends with one run-level record (`sequence`
 * null). A run that is still in flight has attempts but no terminal record; it is shown
 * as running rather than hidden, because the newest run is the one a user is watching.
 * Ordering is newest first for reading, while each run's attempts keep their execution
 * order.
 */
export function historyRuns(entries: readonly TimelineRecord[]): HistoryRun[] {
    const byRun = new Map<string, { steps: HistoryStep[]; terminal: TimelineRecord | null }>();
    for (const entry of entries) {
        const bucket = byRun.get(entry.run_id) ?? { steps: [], terminal: null };
        if (entry.sequence === null) {
            bucket.terminal = entry;
        } else {
            bucket.steps.push({
                sequence: entry.sequence ?? "",
                outcome: outcomeOf(entry.outcome),
                startedAt: entry.started_at,
                endedAt: entry.ended_at,
                durationSeconds: elapsedSeconds(entry.started_at, entry.ended_at),
                framesProcessed: entry.frames_processed ?? null,
                framesTotal: entry.frames_total ?? null,
                fps: entry.fps ?? null,
                message: entry.message ?? null,
            });
        }
        byRun.set(entry.run_id, bucket);
    }

    const runs: HistoryRun[] = [];
    for (const [runId, bucket] of byRun) {
        const first = bucket.steps[0];
        const terminal = bucket.terminal;
        const startedAt = terminal?.started_at ?? first?.startedAt ?? "";
        const endedAt =
            terminal?.ended_at ??
            bucket.steps.reduce(
                (latest, step) => (step.endedAt > latest ? step.endedAt : latest),
                "",
            );
        const frames = bucket.steps.reduce(
            (total, step) =>
                step.framesProcessed === null ? total : (total ?? 0) + step.framesProcessed,
            null as number | null,
        );
        runs.push({
            runId,
            startedAt,
            endedAt,
            outcome: terminal === null ? "running" : outcomeOf(terminal.outcome),
            durationSeconds:
                startedAt === "" || endedAt === "" ? null : elapsedSeconds(startedAt, endedAt),
            message: terminal?.message ?? null,
            steps: bucket.steps,
            terminal,
            frames,
        });
    }
    return runs.sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1));
}

/**
 * The newest attempt of one sequence that finished, across every run.
 *
 * The list is newest first and each run's attempts keep their execution order, so the
 * first completed match walking backwards is the one a status row should quote.
 */
export function lastCompletedAttempt(
    runs: readonly HistoryRun[],
    sequence: string,
): HistoryStep | null {
    for (const run of runs) {
        for (let index = run.steps.length - 1; index >= 0; index -= 1) {
            const attempt = run.steps[index];
            if (attempt?.sequence === sequence && attempt.outcome === "completed") {
                return attempt;
            }
        }
    }
    return null;
}

/** The numbers a finished attempt recorded, in the units a status row prints. */
export interface AttemptPerformance {
    frames: number;
    durationSeconds: number;
    fps: number | null;
}

/**
 * Read one attempt's observed throughput.
 *
 * The timeline stores frames and wall-clock time; FPS is the server's own division of the
 * two, when it recorded one. A sequence that writes a value without decoding frames (Scene
 * Concatenator, the scalers) has nothing to report and returns `null`.
 */
export function attemptPerformance(attempt: HistoryStep): AttemptPerformance | null {
    const frames = attempt.framesProcessed ?? attempt.framesTotal;
    if (frames === null || frames === 0 || attempt.durationSeconds === null) {
        return null;
    }
    return { frames, durationSeconds: attempt.durationSeconds, fps: attempt.fps };
}

/**
 * One sentence describing a finished attempt: how much it processed, how long it took, and
 * how fast.
 *
 * `scenes` is the video's scene count, passed only when the row's evidence line does not
 * already name it; two different scene counts in one row would read as a contradiction.
 */
export function performanceLine(performance: AttemptPerformance, scenes: number | null): string {
    const frames = performance.frames.toLocaleString();
    const scope =
        scenes === null || scenes === 0
            ? `${frames} frames`
            : `${scenes.toLocaleString()} scenes (${frames} frames)`;
    const rate = performance.fps === null ? "" : `, ${performance.fps.toFixed(2)} fps`;
    return `${scope} in ${runLength(performance.durationSeconds)}${rate}`;
}
