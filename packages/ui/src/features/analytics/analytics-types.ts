import type { SceneView } from "@av1ation/contracts";

/**
 * What a sequence measured, reduced to the charts and figures its page shows.
 *
 * Every value is derived from the engine's own scene table, the retained chunks, and the
 * video's configuration. Nothing here is a second model of the pipeline: a scene the
 * sequence has not reached is a gap, never a zero, and a pass that recorded no score is
 * absent rather than plotted at the origin.
 */
export interface AnalyticsSource {
    scenes: readonly SceneView[];
    /** Source frame rate, for turning frames and bytes into rates. */
    frameRate: number | null;
    width: number | null;
    height: number | null;
    /** The video's effective configuration document, for thresholds and metric names. */
    document: Record<string, unknown>;
    outputExists: boolean;
}

export interface AnalyticsPoint {
    x: number;
    y: number;
    label: string;
}

/** One plotted line, bar group, or scatter series. */
export interface AnalyticsSeries {
    key: string;
    label: string;
    /** The probe pass this series belongs to, when the measure is per pass. */
    pass: number | null;
    /** Line and bar values, index-aligned with the x labels. */
    values: readonly (number | null)[];
    /** Scatter points; a chart uses one or the other. */
    points?: readonly AnalyticsPoint[];
}

/** A threshold or target edge drawn across a chart. */
export interface AnalyticsReference {
    value: number;
    label: string;
    tone: "warning" | "info";
}

export type AnalyticsXAxis =
    | { kind: "scene" | "category"; labels: readonly string[]; title: string }
    | { kind: "value"; title: string; format: (value: number) => string };

export interface AnalyticsChartData {
    shape: "line" | "bar" | "scatter";
    x: AnalyticsXAxis;
    series: readonly AnalyticsSeries[];
    y: { title: string; format: (value: number) => string };
    references: readonly AnalyticsReference[];
    /** Draw a legend for series that are not passes; the pass chips are its legend. */
    legend: boolean;
    /**
     * Show a zoom slider under the chart.
     *
     * Zooming is always available — the wheel, or a pinch — because a short chart with one
     * crowded cluster needs it as much as a long one. The slider is the visible affordance,
     * so it only earns its height when the x axis has many slots.
     */
    slider: boolean;
    /** One sentence a screen reader gets instead of the picture. */
    description: string;
}

export interface AnalyticsStat {
    label: string;
    value: string;
}

export type AnalyticsViewId = "scenes" | "distribution" | "convergence" | "frontier" | "cumulative";

export interface AnalyticsView {
    id: AnalyticsViewId;
    label: string;
    /** How to read this view, in one sentence. */
    help: string;
    /** Null when the sequence has not written the values this view needs. */
    chart: AnalyticsChartData | null;
    stats: readonly AnalyticsStat[];
    empty: string;
}

export interface AnalyticsMetric {
    id: string;
    label: string;
    /** What the measure is and how to read it, shown under the metric picker. */
    help: string;
    /**
     * Scenes carrying a value for this measure.
     *
     * It is per measure, not per section: Noise Detector writes the noise of every scene
     * while Noise Scaler writes nothing until it runs, so a section-wide count would claim
     * the scaler had measured scenes it never touched.
     */
    measured: number;
    views: readonly AnalyticsView[];
}

export interface AnalyticsColumn {
    id: string;
    label: string;
    numeric: boolean;
}

export interface AnalyticsCell {
    text: string;
    /** Numeric sort key; a text column leaves it null and sorts by its text. */
    sort: number | null;
}

export interface AnalyticsTable {
    columns: readonly AnalyticsColumn[];
    rows: readonly { scene: number; cells: readonly AnalyticsCell[] }[];
    /** What a dash in the table means for this section. */
    note: string;
}

export interface SequenceAnalytics {
    metrics: readonly AnalyticsMetric[];
    table: AnalyticsTable;
    /** What this sequence measured, and what a gap means. */
    note: string;
    /** Shown when the sequence has not written anything yet. */
    empty: string;
    /** Detected scenes, the denominator of every measure's `measured` count. */
    scenes: number;
}
