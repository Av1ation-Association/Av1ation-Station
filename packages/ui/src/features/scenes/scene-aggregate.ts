import type { SceneView } from "@av1ation/contracts";

/**
 * The single-versus-multiple selection rules for the scene details panel.
 *
 * The panel is an edit context, not a list of rows: a field shows one value when every
 * selected scene agrees and a `mixed` badge when they do not. Keeping that rule here makes
 * "50 scenes, one custom encoder" testable without mounting the panel or a player.
 */
export interface NumericSummary {
    min: number;
    max: number;
    median: number;
    count: number;
}

export interface EncoderSummary {
    /** The shared label, or `Mixed` when the selection carries more than one encoder. */
    label: string;
    mixed: boolean;
    /** How many selected scenes carry an encoder different from the video's. */
    customCount: number;
}

export interface SceneSelectionSummary {
    count: number;
    frames: number;
    durationSeconds: number | null;
    encodedCount: number;
    retainedBytes: number;
    quantizer: NumericSummary | null;
    score: NumericSummary | null;
    qualityScore: NumericSummary | null;
    noise: NumericSummary | null;
    noiseScaler: NumericSummary | null;
    encoder: EncoderSummary;
}

/** Whether every value agrees; a mixed result must be shown as a badge, never a guess. */
export function shared<T>(values: readonly T[]): { mixed: boolean; value: T | null } {
    if (values.length === 0) {
        return { mixed: false, value: null };
    }
    const first = values[0] as T;
    return {
        mixed: values.some((value) => value !== first),
        value: first,
    };
}

/** Min, max, and median over the values that exist; absent fields do not count as zero. */
export function numericSummary(
    values: readonly (number | null | undefined)[],
): NumericSummary | null {
    const present = values.filter((value): value is number => typeof value === "number");
    if (present.length === 0) {
        return null;
    }
    const sorted = [...present].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const median =
        sorted.length % 2 === 0
            ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
            : (sorted[middle] ?? 0);
    return {
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        median,
        count: present.length,
    };
}

function encoderSummary(scenes: readonly SceneView[]): EncoderSummary {
    const labels = scenes.map((scene) => scene.encoder_label);
    const { mixed, value } = shared(labels);
    return {
        label: mixed ? "Mixed" : (value ?? "—"),
        mixed,
        customCount: scenes.filter((scene) => scene.encoder_custom).length,
    };
}

/** Aggregate one selection without inventing a value for a scene that has none. */
export function sceneSelectionSummary(
    scenes: readonly SceneView[],
    frameRate: number | null,
): SceneSelectionSummary {
    const frames = scenes.reduce((total, scene) => total + scene.frame_count, 0);
    return {
        count: scenes.length,
        frames,
        durationSeconds:
            frameRate === null || frameRate <= 0 || scenes.length === 0 ? null : frames / frameRate,
        encodedCount: scenes.filter((scene) => scene.encoded).length,
        retainedBytes: scenes.reduce((total, scene) => total + (scene.chunk_bytes ?? 0), 0),
        quantizer: numericSummary(scenes.map((scene) => scene.quantizer)),
        score: numericSummary(scenes.map((scene) => scene.score)),
        qualityScore: numericSummary(scenes.map((scene) => scene.quality_score)),
        noise: numericSummary(scenes.map((scene) => scene.noise)),
        noiseScaler: numericSummary(scenes.map((scene) => scene.noise_scaler)),
        encoder: encoderSummary(scenes),
    };
}
