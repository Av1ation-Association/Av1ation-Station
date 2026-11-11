import type { AnalyticsStat } from "./analytics-types";

/* --------------------------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------------------------ */

export function fixed(value: number, places: number): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: places,
        maximumFractionDigits: places,
    });
}

export function integer(value: number): string {
    return Math.round(value).toLocaleString();
}

/** A count with its noun, because `1 scenes` reads like a bug in a user-visible figure. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${integer(count)} ${count === 1 ? singular : pluralForm}`;
}

export function finite(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The payload of an engine enum, which is tagged by its variant name.
 *
 * Scene Detector stores its bounds inside `method.AVSceneChange` (or `TransNetV2`), so a
 * chart that draws the configured limits has to read one level below the document path.
 * A variant without a body (or a document with none) is an empty map, never a guess.
 */
export function variantBody(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null) {
        return {};
    }
    const first = Object.values(value)[0];
    return typeof first === "object" && first !== null ? (first as Record<string, unknown>) : {};
}

/** The engine stores bitrates in bits per second, and a chart reads them in Mbps. */
export function formatMbps(value: number): string {
    return `${fixed(value / 1_000_000, 2)} Mbps`;
}

/** Bits per pixel is routinely a few hundredths, so it keeps four decimals. */
export function formatBpp(value: number): string {
    return fixed(value, 4);
}

export function formatQuantizer(value: number): string {
    return `Q${fixed(value, 0)}`;
}

/**
 * A score's precision, from the metric's own scale.
 *
 * VMAF and SSIMULACRA2 live in the tens, where a tenth is the useful resolution; Butteraugli
 * and CVVDP live near one, where a tenth would collapse a real spread into a single bucket.
 */
export function scoreFormat(range: [number, number] | null): (value: number) => string {
    const magnitude = range === null ? 100 : Math.max(Math.abs(range[0]), Math.abs(range[1]));
    const places = magnitude <= 5 ? 3 : 1;
    return (value) => fixed(value, places);
}

/* --------------------------------------------------------------------------------------------
 * Statistics
 * ------------------------------------------------------------------------------------------ */

export function present(values: readonly (number | null)[]): number[] {
    return values.filter((value): value is number => value !== null && Number.isFinite(value));
}

export function mean(values: readonly number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
    return quantile(values, 0.5);
}

/** Linear-interpolated quantile; a 95th percentile must not jump between two scenes. */
export function quantile(values: readonly number[], fraction: number): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const last = sorted.length - 1;
    const position = last * fraction;
    const lower = Math.floor(position);
    const weight = position - lower;
    const start = sorted[lower] ?? 0;
    const end = sorted[Math.min(last, lower + 1)] ?? start;
    return start + (end - start) * weight;
}

/** Population standard deviation, which is what a distribution's spread means here. */
export function deviation(values: readonly number[]): number {
    if (values.length < 2) {
        return 0;
    }
    const centre = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - centre) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

export function mode(values: readonly number[]): number | null {
    const counts = new Map<number, number>();
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    let best: number | null = null;
    let bestCount = 0;
    for (const [value, count] of counts) {
        if (count > bestCount) {
            best = value;
            bestCount = count;
        }
    }
    return best;
}

/** The four figures every measure gets, before its own extra tiles. */
export function summarize(
    values: readonly number[],
    format: (value: number) => string,
): AnalyticsStat[] {
    if (values.length === 0) {
        return [];
    }
    return [
        { label: "Mean", value: format(mean(values)) },
        { label: "Median", value: format(median(values)) },
        { label: "Range", value: `${format(Math.min(...values))}–${format(Math.max(...values))}` },
        {
            label: "p10–p90",
            value: `${format(quantile(values, 0.1))}–${format(quantile(values, 0.9))}`,
        },
    ];
}
