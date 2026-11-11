import type {
    AnalyticsChartData,
    AnalyticsMetric,
    AnalyticsSource,
    AnalyticsView,
} from "./analytics-types";
import { formatBpp, integer, present, summarize } from "./analytics-format";
import type { SceneMetricSpec } from "./analytics-metric-types";
import { cumulativeOf, distribution, sceneLabels } from "./analytics-series";

export function sceneChart(spec: SceneMetricSpec, source: AnalyticsSource): AnalyticsChartData {
    const values = source.scenes.map((scene) => spec.value(scene, source));
    const references = spec.references?.(source) ?? [];
    return {
        shape: "line",
        x: { kind: "scene", labels: sceneLabels(source.scenes), title: "scene" },
        series: [{ key: spec.id, label: spec.label, pass: null, values }],
        y: { title: spec.label, format: spec.format },
        references,
        legend: false,
        slider: values.length > 150,
        description: `${spec.label} per scene across ${String(values.length)} scenes.`,
    };
}

export function sceneDistribution(
    spec: SceneMetricSpec,
    source: AnalyticsSource,
): AnalyticsChartData | null {
    const values = source.scenes.map((scene) => spec.value(scene, source));
    const counts = distribution([{ key: spec.id, label: spec.label, pass: null, values }], spec);
    if (counts.labels.length === 0) {
        return null;
    }
    return {
        shape: "bar",
        x: { kind: "category", labels: counts.labels, title: spec.label },
        series: counts.series.map((series) => ({
            key: series.key,
            label: series.label,
            pass: series.pass,
            values: series.values,
        })),
        y: { title: "scenes", format: integer },
        references: [],
        legend: false,
        slider: false,
        description: `How many scenes fall in each ${spec.label.toLowerCase()} range.`,
    };
}

export function sceneMetric(spec: SceneMetricSpec, source: AnalyticsSource): AnalyticsMetric {
    const values = source.scenes.map((scene) => spec.value(scene, source));
    const measured = present(values);
    const stats = [...summarize(measured, spec.format), ...(spec.extra?.(measured, source) ?? [])];
    const views: AnalyticsView[] = [
        {
            id: "scenes",
            label: "Per scene",
            help: "Every scene in pipeline order; a gap is a scene this sequence has not measured.",
            chart: measured.length === 0 ? null : sceneChart(spec, source),
            stats,
            empty: spec.empty,
        },
    ];
    if (spec.cumulative === true && measured.length > 0) {
        views.push({
            id: "cumulative",
            label: "Cumulative",
            help: "The running total across scenes, which shows how the work accumulates.",
            chart: {
                shape: "line",
                x: {
                    kind: "scene",
                    labels: sceneLabels(source.scenes),
                    title: "scene",
                },
                series: [
                    {
                        key: `${spec.id}-total`,
                        label: `${spec.label} total`,
                        pass: null,
                        values: cumulativeOf(values),
                    },
                ],
                y: { title: `${spec.label} total`, format: spec.format },
                references: [],
                legend: false,
                slider: values.length > 150,
                description: `Running total of ${spec.label.toLowerCase()} across scenes.`,
            },
            stats,
            empty: spec.empty,
        });
    }
    views.push({
        id: "distribution",
        label: "Distribution",
        help: "How many scenes fall in each range, so a typical value and an outlier are both visible.",
        chart: measured.length === 0 ? null : sceneDistribution(spec, source),
        stats,
        empty: spec.empty,
    });
    if (spec.frontierPoint !== undefined && measured.length > 0) {
        const points = source.scenes.flatMap((scene) => {
            const point = spec.frontierPoint?.(scene, source);
            return point === null || point === undefined
                ? []
                : [
                      {
                          x: point.x,
                          y: point.y,
                          label: `Scene ${String(scene.index + 1)}`,
                      },
                  ];
        });
        if (points.length > 0) {
            views.push({
                id: "frontier",
                label: "Quality vs size",
                help: "Quality against bits per pixel; the upper left is more quality for fewer bits.",
                chart: {
                    shape: "scatter",
                    x: {
                        kind: "value",
                        title: "bits per pixel",
                        format: formatBpp,
                    },
                    series: [
                        {
                            key: `${spec.id}-frontier`,
                            label: spec.label,
                            pass: null,
                            values: [],
                            points,
                        },
                    ],
                    y: { title: spec.label, format: spec.format },
                    references: spec.references?.(source) ?? [],
                    legend: false,
                    slider: false,
                    description: `${spec.label} against bits per pixel; the upper left is more efficient.`,
                },
                stats,
                empty: spec.empty,
            });
        }
    }
    return {
        id: spec.id,
        label: spec.label,
        help: spec.help,
        measured: measured.length,
        views,
    };
}
