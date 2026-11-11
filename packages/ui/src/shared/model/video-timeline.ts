import type { SequenceRunStatus, VideoState } from "@av1ation/contracts";

/** The pipeline phases a video's sequences belong to, in the order the run visits them. */
export type TimelinePhaseId =
    "detect" | "measure" | "score" | "encode" | "finalise" | "verify" | "other";

/** One sequence as the timeline prints it. */
export interface TimelineStep {
    /** The sequence id the run route accepts. */
    id: string;
    /** The engine's display name. */
    name: string;
    /** The server's derived status, unmodified. */
    status: SequenceRunStatus;
    /** The status in the words the row prints. */
    label: string;
    /** The server's evidence line, when it reported one. */
    detail: string | null;
    /** Whether the server says this sequence may run right now. */
    next: boolean;
    /** Whether its own prerequisites are satisfied, even if it is already complete. */
    runnable: boolean;
    /** Live completion percentage, only while the step is active. */
    progress: number | null;
}

/** One phase of the pipeline and the sequences that make it up. */
export interface TimelinePhase {
    id: TimelinePhaseId;
    label: string;
    steps: TimelineStep[];
}

/** What the line under the timeline says is happening, or why nothing can. */
export interface TimelineSummary {
    tone: "running" | "next" | "done" | "blocked";
    label: string;
    detail: string;
}

/** The whole derived timeline, computed from `/state` alone. */
export interface VideoTimeline {
    phases: TimelinePhase[];
    summary: TimelineSummary | null;
}

const PHASE_ORDER: { id: TimelinePhaseId; label: string }[] = [
    { id: "detect", label: "Detect" },
    { id: "measure", label: "Measure" },
    { id: "score", label: "Score" },
    { id: "encode", label: "Encode" },
    { id: "finalise", label: "Finalise" },
    { id: "verify", label: "Verify" },
    { id: "other", label: "Other" },
];

/** Where a sequence sits in the pipeline. Unknown ids stay visible rather than vanishing. */
function phaseOf(id: string): TimelinePhaseId {
    switch (id) {
        case "SceneDetector":
            return "detect";
        case "NoiseDetector":
        case "NoiseScaler":
            return "measure";
        case "TargetQuality":
        case "SpeedScaler":
        case "BitrateOptimizer":
            return "score";
        case "ParallelEncoder":
        case "SerialEncoder":
            return "encode";
        case "SceneConcatenator":
            return "finalise";
        case "QualityCheck":
            return "verify";
        default:
            return "other";
    }
}

/** The step's own status, in the shortest words that stay unambiguous. */
function statusLabel(
    status: SequenceRunStatus,
    progress: number | null,
    next: boolean,
    runnable: boolean,
): string {
    switch (status) {
        case "active":
            return progress === null ? "Running" : `Running ${String(Math.round(progress))}%`;
        case "incomplete":
            // The state is Incomplete; Resume is the action the row's button offers.
            return "Incomplete";
        case "complete":
            return "Done";
        case "failed":
            return "Failed";
        case "skipped":
            return "Skipped";
        default:
            // Action sequences are runnable but deliberately never enter `next`, because
            // they have no completion field. They are ready when their prerequisites are.
            return next || runnable ? "Ready" : "Not run";
    }
}

/**
 * Group the server's derived sequences into pipeline phases and describe the next action.
 *
 * This reads `VideoState` and nothing else: no local phase is remembered, so the timeline
 * cannot disagree with the encoder after a run, a reload, or a second browser.
 */
export function videoTimeline(state: VideoState | undefined): VideoTimeline {
    if (state === undefined) {
        return { phases: [], summary: null };
    }

    const phases: TimelinePhase[] = PHASE_ORDER.map((phase) => ({
        id: phase.id,
        label: phase.label,
        steps: [],
    }));
    const byId = new Map(phases.map((phase) => [phase.id, phase]));

    const steps: TimelineStep[] = state.sequences.map((sequence) => {
        const next = state.next.includes(sequence.id);
        const progress = sequence.status === "active" ? (sequence.progress ?? null) : null;
        return {
            id: sequence.id,
            name: sequence.name,
            status: sequence.status,
            label: statusLabel(sequence.status, progress, next, sequence.runnable),
            detail: sequence.detail ?? null,
            next,
            runnable: sequence.runnable,
            progress,
        };
    });
    for (const step of steps) {
        byId.get(phaseOf(step.id))?.steps.push(step);
    }

    return {
        phases: phases.filter((phase) => phase.steps.length > 0),
        summary: summarize(state, steps),
    };
}

function summarize(state: VideoState, steps: TimelineStep[]): TimelineSummary {
    const active = steps.find((step) => step.status === "active");
    if (active !== undefined) {
        return {
            tone: "running",
            label: "Running now",
            detail:
                active.progress === null
                    ? active.name
                    : `${active.name} · ${String(Math.round(active.progress))}%`,
        };
    }

    if (state.next.length > 0) {
        const names = state.next.map((id) => steps.find((step) => step.id === id)?.name ?? id);
        return { tone: "next", label: "Next", detail: names.join(" · ") };
    }

    const pending = steps.filter((step) => step.status !== "complete" && step.status !== "skipped");
    if (pending.length === 0) {
        return {
            tone: "done",
            label: "Finished",
            detail: state.output_exists
                ? "Every sequence has completed and the output is written."
                : "Every sequence has completed.",
        };
    }

    // A failed sequence stays runnable, so a retry is offered as the next action above; the
    // failure banner carries the reason. This branch is the genuine block: a pending
    // sequence the server will not schedule until earlier evidence exists.
    const waiting = pending.filter((step) => !step.next);
    return {
        tone: "blocked",
        label: "Waiting",
        detail:
            waiting.length === 0
                ? "No sequence can run until the earlier evidence is present."
                : `${waiting.map((step) => step.name).join(", ")} needs an earlier sequence first.`,
    };
}
