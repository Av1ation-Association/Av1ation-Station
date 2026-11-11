import { getIn } from "../../shared/schema/config-schema";

import type { AnalyticsReference, AnalyticsSource } from "./analytics-types";
import { finite } from "./analytics-format";

/**
 * The configured quality metric and its target range, from a sequence's own document.
 *
 * The engine serialises a metric enum as `{ "SSIMULACRA2": { "target_range": [74, 76], … } }`,
 * so the name and the range live behind the enum key rather than in fixed fields.
 */
export function qualityTarget(
    document: Record<string, unknown>,
    keys: readonly string[],
): { label: string; range: [number, number] | null } {
    const metric = getIn(document, [...keys, "metric"]);
    if (typeof metric === "string") {
        return { label: metric, range: null };
    }
    if (typeof metric !== "object" || metric === null) {
        return { label: "quality", range: null };
    }
    const first = Object.entries(metric as Record<string, unknown>)[0];
    if (first === undefined) {
        return { label: "quality", range: null };
    }
    const [label, config] = first;
    const range =
        typeof config === "object" && config !== null
            ? (config as Record<string, unknown>)["target_range"]
            : undefined;
    if (Array.isArray(range) && range.length === 2) {
        const low: unknown = range[0];
        const high: unknown = range[1];
        if (typeof low === "number" && typeof high === "number") {
            return { label, range: [low, high] };
        }
    }
    return { label, range: null };
}

export function targetReferences(
    target: { label: string; range: [number, number] | null },
    format: (value: number) => string,
): AnalyticsReference[] {
    if (target.range === null) {
        return [];
    }
    return [
        {
            value: target.range[0],
            label: `target ${format(target.range[0])}`,
            tone: "info",
        },
        {
            value: target.range[1],
            label: `target ${format(target.range[1])}`,
            tone: "info",
        },
    ];
}

export function threshold(source: AnalyticsSource, keys: readonly string[]): number | null {
    const value = getIn(source.document, [...keys]);
    return finite(typeof value === "number" ? value : null);
}
