import type { ScenePassView, SceneView } from "@av1ation/contracts";

import type { AnalyticsReference, AnalyticsSource, AnalyticsStat } from "./analytics-types";

/* --------------------------------------------------------------------------------------------
 * Metric construction
 * ------------------------------------------------------------------------------------------ */

export interface MetricBase {
    id: string;
    label: string;
    help: string;
    format: (value: number) => string;
    /** Bucket caption for a distribution, when a bucket is a range rather than one value. */
    bucketLabel?: ((low: number, high: number) => string) | undefined;
    /** Bucket by exact value, for a measure on a coarse scale such as a preset. */
    discrete?: boolean | undefined;
    /** Extra summary tiles after Mean, Median, Range and p10–p90. */
    extra?: ((values: readonly number[], source: AnalyticsSource) => AnalyticsStat[]) | undefined;
    empty: string;
}

export interface SceneMetricSpec extends MetricBase {
    value: (scene: SceneView, source: AnalyticsSource) => number | null;
    references?: ((source: AnalyticsSource) => AnalyticsReference[]) | undefined;
    /** Show the running total of this value across scenes. */
    cumulative?: boolean | undefined;
    /** One point per scene, for a quality-against-size view. */
    frontierPoint?:
        | ((scene: SceneView, source: AnalyticsSource) => { x: number; y: number } | null)
        | undefined;
}

export interface PassMetricSpec extends MetricBase {
    value: (pass: ScenePassView, scene: SceneView, source: AnalyticsSource) => number | null;
    references?: ((source: AnalyticsSource) => AnalyticsReference[]) | undefined;
    frontierPoint?:
        | ((
              pass: ScenePassView,
              scene: SceneView,
              source: AnalyticsSource,
          ) => { x: number; y: number } | null)
        | undefined;
    /** Convergence tiles replace the generic per-scene summary on the pass view. */
    convergenceChange?: ((value: number) => string) | undefined;
}
