import type { ScenePassView, SceneView } from "@av1ation/contracts";

import { finite, present } from "./analytics-format";
import type { AnalyticsSource } from "./analytics-types";

/* --------------------------------------------------------------------------------------------
 * Binaries
 * ------------------------------------------------------------------------------------------ */

export function sceneLabels(scenes: readonly SceneView[]): string[] {
    return scenes.map((_, index) => `Scene ${String(index + 1)}`);
}

/** Bits per second a scene's chunk cost, in the unit the engine records bitrates in. */
export function sceneChunkBitrate(scene: SceneView, frameRate: number | null): number | null {
    const bytes = finite(scene.chunk_bytes);
    if (bytes === null || bytes <= 0 || scene.frame_count === 0) {
        return null;
    }
    if (frameRate === null || frameRate <= 0) {
        return null;
    }
    const seconds = scene.frame_count / frameRate;
    return (bytes * 8) / seconds;
}

/** Bits per pixel the scene's chunk cost, the size side of a quality-to-size ratio. */
export function sceneChunkBpp(scene: SceneView, source: AnalyticsSource): number | null {
    const bytes = finite(scene.chunk_bytes);
    if (bytes === null || bytes <= 0) {
        return null;
    }
    if (
        source.width === null ||
        source.height === null ||
        source.width <= 0 ||
        source.height <= 0 ||
        scene.frame_count === 0
    ) {
        return null;
    }
    return (bytes * 8) / (scene.frame_count * source.width * source.height);
}

/**
 * Bits per pixel a probe pass cost.
 *
 * The engine records a probe's bitrate in bits per second, so the pixel rate comes from the
 * source's frame rate and resolution rather than from the probe's own frame count.
 */
export function passBpp(pass: ScenePassView, source: AnalyticsSource): number | null {
    if (
        pass.bitrate === undefined ||
        pass.bitrate === null ||
        pass.bitrate <= 0 ||
        source.frameRate === null ||
        source.frameRate <= 0 ||
        source.width === null ||
        source.height === null ||
        source.width <= 0 ||
        source.height <= 0
    ) {
        return null;
    }
    return pass.bitrate / (source.width * source.height * source.frameRate);
}

/**
 * Score per bit-per-pixel: the quality a scene buys for its size. Higher is better.
 *
 * Butteraugli is an inverse metric, so a *lower* score is the better picture and dividing
 * the score by the size would reward distortion. Its quality is the reciprocal instead;
 * the epsilon only keeps a perfect zero from becoming an infinity no chart can plot.
 */
const INVERSE_EPSILON = 1e-6;
export function efficiencyOf(
    score: number | null,
    bpp: number | null,
    inverse = false,
): number | null {
    if (score === null || bpp === null || bpp <= 0) {
        return null;
    }
    const quality = inverse ? 1 / (Math.max(0, score) + INVERSE_EPSILON) : score;
    return quality / bpp;
}

/**
 * Whether a configured metric improves as its score falls.
 *
 * The catalogue lives in the engine, so this reads the metric's own name rather than a
 * second table of metrics that would drift from it. Butteraugli is the one inverse metric
 * the engine offers today; a non-inverse metric keeps the score as its quality.
 */
export function isInverseMetric(label: string): boolean {
    return label.toLowerCase().includes("butteraugli");
}

export function cumulativeOf(values: readonly (number | null)[]): (number | null)[] {
    let total = 0;
    let seen = false;
    return values.map((value) => {
        if (value === null) {
            return seen ? total : null;
        }
        seen = true;
        total += value;
        return total;
    });
}

/**
 * Equal-width buckets over the measured range.
 *
 * A range that does not move gets one bucket instead of twelve identical labels; a flat
 * measurement is an answer, not a chart to hide.
 */
export function bucketsOf(
    values: readonly number[],
    count: number,
): { low: number; high: number }[] {
    if (values.length === 0) {
        return [];
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!(max > min)) {
        return [{ low: min, high: max }];
    }
    const step = (max - min) / count;
    return Array.from({ length: count }, (_, index) => ({
        low: min + step * index,
        // The last edge takes the maximum, so no measured value falls outside the chart.
        high: index === count - 1 ? max : min + step * (index + 1),
    }));
}

export function countsIn(
    values: readonly number[],
    buckets: readonly { low: number; high: number }[],
): number[] {
    return buckets.map((bucket, index) => {
        const last = index === buckets.length - 1;
        return values.filter(
            (value) => value >= bucket.low && (last ? value <= bucket.high : value < bucket.high),
        ).length;
    });
}

export interface Histogram {
    labels: string[];
    series: { key: string; label: string; pass: number | null; values: number[] }[];
}

export function distribution(
    inputs: readonly {
        key: string;
        label: string;
        pass: number | null;
        values: readonly (number | null)[];
    }[],
    spec: {
        format: (value: number) => string;
        bucketLabel?: ((low: number, high: number) => string) | undefined;
        discrete?: boolean | undefined;
    },
): Histogram {
    const all = inputs.flatMap((input) => present(input.values));
    if (all.length === 0) {
        return { labels: [], series: [] };
    }
    if (spec.discrete === true) {
        const distinct = [...new Set(all)].sort((left, right) => left - right);
        return {
            labels: distinct.map((value) => spec.format(value)),
            series: inputs.map((input) => ({
                key: input.key,
                label: input.label,
                pass: input.pass,
                values: distinct.map(
                    (value) =>
                        present(input.values).filter((entry) => Math.abs(entry - value) < 1e-9)
                            .length,
                ),
            })),
        };
    }
    const buckets = bucketsOf(all, 12);
    const bucketLabel =
        spec.bucketLabel ??
        ((low: number, high: number) =>
            low === high ? spec.format(low) : `${spec.format(low)}–${spec.format(high)}`);
    return {
        labels: buckets.map((bucket) => bucketLabel(bucket.low, bucket.high)),
        series: inputs.map((input) => ({
            key: input.key,
            label: input.label,
            pass: input.pass,
            values: countsIn(present(input.values), buckets),
        })),
    };
}
