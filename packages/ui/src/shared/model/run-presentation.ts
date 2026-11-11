import type { RunOutcome } from "@av1ation/contracts";

import type { VideoStatusTone } from "./video-status";

/**
 * The UI's run outcome vocabulary.
 *
 * `unrecorded` is the contract's `unknown`: the log predates the run-level timeline
 * record, so there is no outcome to show. `unrecognized` is a terminal record whose
 * outcome is outside the engine's known set; the run ended, but this UI cannot name how.
 * Keeping them separate is what lets Logs omit a chip while History still says `Unknown`.
 */
export type RunOutcomeState =
    "running" | "completed" | "cancelled" | "failed" | "unrecorded" | "unrecognized";

/** A recorded outcome's chip copy, or the fact that no outcome was recorded. */
export type RunOutcomePresentation =
    { recorded: false } | { recorded: true; label: string; tone: VideoStatusTone };

const OUTCOMES: Record<
    Exclude<RunOutcomeState, "unrecorded">,
    { label: string; tone: VideoStatusTone }
> = {
    running: { label: "Running", tone: "info" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "warning" },
    failed: { label: "Failed", tone: "danger" },
    unrecognized: { label: "Unknown", tone: "neutral" },
};

/**
 * Translate the contract's outcome at the API boundary.
 *
 * The contract's `unknown` describes a log without a run-level timeline record, so it is
 * the UI's `unrecorded`, not a terminal outcome the UI failed to name.
 */
export function fromContractOutcome(outcome: RunOutcome): RunOutcomeState {
    switch (outcome) {
        case "running":
            return "running";
        case "completed":
            return "completed";
        case "cancelled":
            return "cancelled";
        case "failed":
            return "failed";
        case "unknown":
            return "unrecorded";
        default:
            return "unrecognized";
    }
}

/** The chip a run shows, or the absence of one when no outcome was recorded. */
export function runOutcome(state: RunOutcomeState): RunOutcomePresentation {
    if (state === "unrecorded") {
        return { recorded: false };
    }
    const presentation = OUTCOMES[state];
    return { recorded: true, label: presentation.label, tone: presentation.tone };
}

/** The run's start in the reader's locale, with a stable date part. */
export function runWhen(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

/**
 * Seconds between a start and an end, or `null` when either instant is missing or the
 * range is invalid. A live run has no end, so it has no elapsed duration.
 */
export function elapsedSeconds(start: string, end: string | null | undefined): number | null {
    if (end === null || end === undefined) {
        return null;
    }
    const from = new Date(start).getTime();
    const to = new Date(end).getTime();
    if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
        return null;
    }
    return (to - from) / 1000;
}
