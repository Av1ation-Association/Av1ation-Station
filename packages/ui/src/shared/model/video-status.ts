import type { VideoState } from "@av1ation/contracts";

export type VideoStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/** What a sequence is called in a chip. The engine's ids are implementation names. */
const STAGE_LABELS: Record<string, string> = {
    SceneDetector: "Scene Detection",
    NoiseDetector: "Noise Detection",
    NoiseScaler: "Noise Scaling",
    TargetQuality: "Target Quality",
    SpeedScaler: "Speed Scaling",
    BitrateOptimizer: "Bitrate Optimization",
    ParallelEncoder: "Encoding",
    SceneConcatenator: "Concatenation",
    QualityCheck: "Quality Check",
};

export function stageLabel(id: string): string {
    return STAGE_LABELS[id] ?? id;
}

/**
 * The chip a video shows in the queue and on its own page.
 *
 * The server's derived state is the only input: a client that guessed the phase from local
 * data would eventually disagree with the encoder. A chip always names the stage it is
 * talking about, and carries that stage's completion when the server can measure it — a
 * cancelled detection keeps the fraction it reached, which is what makes resuming legible.
 */
export function videoStatus(state: VideoState | undefined): {
    label: string;
    tone: VideoStatusTone;
    progress: number | null;
    progressLabel: string | null;
} {
    if (state === undefined) {
        return { label: "Loading", tone: "neutral", progress: null, progressLabel: null };
    }
    if (state.active) {
        const active = state.sequences.find((sequence) => sequence.status === "active");
        const stage = stageLabel(active?.id ?? "ParallelEncoder");
        const progress = active?.progress ?? null;
        return {
            label: progress === null ? stage : `${stage} ${String(Math.round(progress))}%`,
            tone: "info",
            progress,
            progressLabel: `${stage} progress`,
        };
    }
    // A run can fail before its first sequence starts, so the failure reason can exist
    // without a failed sequence row. The last run's outcome is what the chip reports.
    if (state.failure !== null && state.failure !== undefined) {
        return { label: "Failed", tone: "danger", progress: null, progressLabel: null };
    }
    if (state.output_exists) {
        return { label: "Encoded", tone: "success", progress: null, progressLabel: null };
    }
    if (state.sequences.some((sequence) => sequence.status === "Failed")) {
        return { label: "Failed", tone: "danger", progress: null, progressLabel: null };
    }
    if (state.scene_count === 0) {
        const detector = state.sequences.find((sequence) => sequence.id === "SceneDetector");
        // A first detection that stopped part-way has no scenes yet but does have a
        // fraction; it is still incomplete, not "not started".
        if (detector?.progress === null || detector?.progress === undefined) {
            return {
                label: "Not started",
                tone: "neutral",
                progress: null,
                progressLabel: null,
            };
        }
    }
    const next = state.next[0];
    if (next === undefined) {
        return { label: "In progress", tone: "neutral", progress: null, progressLabel: null };
    }
    if (next === "ParallelEncoder") {
        return {
            label: "Ready to encode",
            tone: "warning",
            progress: null,
            progressLabel: null,
        };
    }
    const sequence = state.sequences.find((entry) => entry.id === next);
    const stage = stageLabel(next);
    return {
        label: `${stage} incomplete`,
        tone: "warning",
        // A cancelled stage reports the fraction it covered, so the row can show how much
        // of it is already done without claiming it is running.
        progress: sequence?.progress ?? null,
        progressLabel: `${stage} progress`,
    };
}

/** The first non-empty line of a failure message, for the compact status rows. */
export function failureSummary(message: string): string {
    const first = message.split("\n").find((line) => line.trim() !== "");
    return first === undefined ? message : first.trim();
}

export const STATUS_CHIP_TONES: Record<VideoStatusTone, string> = {
    neutral: "border-line-strong bg-raised text-ink-secondary",
    info: "border-info/30 bg-info-soft text-info",
    success: "border-success/30 bg-success-soft text-success",
    warning: "border-warning/30 bg-warning-soft text-warning",
    danger: "border-danger/30 bg-danger-soft text-danger",
};
