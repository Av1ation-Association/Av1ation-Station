import { concatenation, encoding } from "./analytics-encoding";
import { noiseDetection, sceneDetection } from "./analytics-detection";
import { qualityCheck } from "./analytics-quality-check";
import { targetQuality } from "./analytics-target-quality";
import type { AnalyticsSource, SequenceAnalytics } from "./analytics-types";

export type {
    AnalyticsCell,
    AnalyticsChartData,
    AnalyticsColumn,
    AnalyticsMetric,
    AnalyticsPoint,
    AnalyticsReference,
    AnalyticsSeries,
    AnalyticsSource,
    AnalyticsStat,
    AnalyticsTable,
    AnalyticsView,
    AnalyticsViewId,
    AnalyticsXAxis,
    SequenceAnalytics,
} from "./analytics-types";
export { passColorToken, passColorVariable } from "./analytics-pass-colors";

/**
 * Every measure and figure one configuration page can show for its sequence.
 *
 * The section is the route's own identifier, so the chart layer never guesses which
 * sequence a page belongs to; a section with no measurement returns an empty catalogue and
 * says so rather than inventing a series.
 */
export function sequenceAnalytics(section: string, source: AnalyticsSource): SequenceAnalytics {
    switch (section) {
        case "scene-detection":
            return sceneDetection(source);
        case "noise-generation":
            // One card for both of the section's sequences, because they write the same
            // per-scene noise rows: two cards would show one measurement twice.
            return noiseDetection(source);
        case "target-quality":
            // Target Quality, Speed Scaler and Bitrate Optimizer all write into these rows,
            // so the probes, the optimizer's line and the scaled presets belong together.
            return targetQuality(source);
        case "encoding":
            // Benchmarker records no scene value; its one result is the worker count it
            // resolved onto Parallel Encoder's document, which this section's note reports.
            return encoding(source);
        case "concatenation":
            return concatenation(source);
        case "quality-check":
            return qualityCheck(source);
        default:
            return {
                metrics: [],
                table: { columns: [], rows: [], note: "" },
                note: "This section has no measured data.",
                empty: "This section has no measured data.",
                scenes: source.scenes.length,
            };
    }
}
