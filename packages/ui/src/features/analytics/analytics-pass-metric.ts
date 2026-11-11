import type { ScenePassView, SceneView } from "@av1ation/contracts";

import type {
    AnalyticsChartData,
    AnalyticsMetric,
    AnalyticsSeries,
    AnalyticsSource,
    AnalyticsStat,
    AnalyticsView,
} from "./analytics-types";
import { formatBpp, integer, mean, median, present, quantile, summarize } from "./analytics-format";
import type { PassMetricSpec } from "./analytics-metric-types";
import { distribution, sceneLabels } from "./analytics-series";

export function passCount(source: AnalyticsSource): number {
    return source.scenes.reduce((most, scene) => Math.max(most, scene.passes?.length ?? 0), 0);
}

export function passSeries(
    spec: PassMetricSpec,
    source: AnalyticsSource,
    carry = false,
): AnalyticsSeries[] {
    const count = passCount(source);
    return Array.from({ length: count }, (_, position) => ({
        key: `${spec.id}-p${String(position + 1)}`,
        label: `P${String(position + 1)}`,
        pass: position + 1,
        values: source.scenes.map((scene) => {
            const pass = passAt(scene, position, carry);
            return pass === undefined ? null : spec.value(pass, scene, source);
        }),
    }));
}

/**
 * One scene's probe at a pass position.
 *
 * Target Quality stops probing a scene once it converges, so a later pass has no probe for
 * that scene. The per-scene chart carries the last probe forward instead of breaking the
 * line there: the scene did not lose its measurement, it simply stopped receiving new ones.
 * A statistic over probes still reads the recorded passes only, because a carried value is
 * not a probe that ran.
 */
export function passAt(
    scene: SceneView,
    position: number,
    carry: boolean,
): ScenePassView | undefined {
    const passes = scene.passes ?? [];
    return carry ? (passes[position] ?? passes[passes.length - 1]) : passes[position];
}

export function convergence(
    spec: PassMetricSpec,
    source: AnalyticsSource,
): AnalyticsChartData | null {
    const series = passSeries(spec, source);
    if (series.length === 0) {
        return null;
    }
    const labels = series.map((entry) => entry.label);
    const means = series.map((entry) => {
        const measured = present(entry.values);
        return measured.length === 0 ? null : mean(measured);
    });
    const medians = series.map((entry) => {
        const measured = present(entry.values);
        return measured.length === 0 ? null : median(measured);
    });
    return {
        shape: "line",
        x: { kind: "category", labels, title: "probe pass" },
        series: [
            { key: `${spec.id}-mean`, label: "Mean", pass: null, values: means },
            {
                key: `${spec.id}-median`,
                label: "Median",
                pass: null,
                values: medians,
            },
        ],
        y: { title: spec.label, format: spec.format },
        references: spec.references?.(source) ?? [],
        legend: true,
        slider: false,
        description: `Mean and median ${spec.label.toLowerCase()} for each probe pass.`,
    };
}

export function convergenceStats(spec: PassMetricSpec, source: AnalyticsSource): AnalyticsStat[] {
    const series = passSeries(spec, source);
    const summaries = series.map((entry) => present(entry.values));
    const first = summaries[0] ?? [];
    const last = summaries[summaries.length - 1] ?? [];
    if (first.length === 0 || last.length === 0) {
        return [];
    }
    const firstMean = mean(first);
    const lastMean = mean(last);
    const delta = lastMean - firstMean;
    const arrow = delta === 0 ? "→" : delta > 0 ? "↑" : "↓";
    const change = spec.convergenceChange?.(Math.abs(delta)) ?? spec.format(Math.abs(delta));
    return [
        { label: "First pass", value: spec.format(firstMean) },
        { label: "Final pass", value: spec.format(lastMean) },
        {
            label: "Moved",
            value: delta === 0 ? "No change" : `${arrow} ${change}`,
        },
        {
            label: "Final spread",
            value: `${spec.format(quantile(last, 0.1))}–${spec.format(quantile(last, 0.9))}`,
        },
        {
            label: "Probes",
            value: integer(summaries.reduce((sum, entries) => sum + entries.length, 0)),
        },
        {
            label: "Scenes",
            value: integer(
                source.scenes.filter((scene) =>
                    (scene.passes ?? []).some((pass) => spec.value(pass, scene, source) !== null),
                ).length,
            ),
        },
    ];
}

export function passMetric(spec: PassMetricSpec, source: AnalyticsSource): AnalyticsMetric {
    const series = passSeries(spec, source);
    const measured = present(series.flatMap((entry) => [...entry.values]));
    const carrying = source.scenes.filter(
        (scene) =>
            present((scene.passes ?? []).map((pass) => spec.value(pass, scene, source))).length > 0,
    ).length;
    const stats = [
        { label: "Probes", value: integer(measured.length) },
        { label: "Scenes", value: integer(carrying) },
        ...summarize(measured, spec.format),
        ...(spec.extra?.(measured, source) ?? []),
    ];
    const views: AnalyticsView[] = [
        {
            id: "scenes",
            label: "Per scene",
            help: "One line per probe pass; hide passes with the chips to compare the ones that matter.",
            chart:
                measured.length === 0
                    ? null
                    : {
                          shape: "line",
                          x: {
                              kind: "scene",
                              labels: sceneLabels(source.scenes),
                              title: "scene",
                          },
                          series: passSeries(spec, source, true),
                          y: { title: spec.label, format: spec.format },
                          references: spec.references?.(source) ?? [],
                          legend: false,
                          slider: source.scenes.length > 150,
                          description: `${spec.label} for every probe pass of every scene; a scene that stopped probing carries its last pass forward.`,
                      },
            stats,
            empty: spec.empty,
        },
        {
            id: "distribution",
            label: "Distribution",
            help: "How many probes landed in each range, one bar group per pass.",
            chart:
                measured.length === 0
                    ? null
                    : (() => {
                          const counts = distribution(
                              series.map((entry) => ({
                                  key: entry.key,
                                  label: entry.label,
                                  pass: entry.pass,
                                  values: entry.values,
                              })),
                              spec,
                          );
                          return counts.labels.length === 0
                              ? null
                              : {
                                    shape: "bar" as const,
                                    x: {
                                        kind: "category" as const,
                                        labels: counts.labels,
                                        title: spec.label,
                                    },
                                    series: counts.series,
                                    y: {
                                        title: "probes",
                                        format: integer,
                                    },
                                    references: [],
                                    legend: false,
                                    slider: false,
                                    description: `How many probes fall in each ${spec.label.toLowerCase()} range.`,
                                };
                      })(),
            stats,
            empty: spec.empty,
        },
    ];
    const convergenceChart = convergence(spec, source);
    if (convergenceChart !== null) {
        views.push({
            id: "convergence",
            label: "Convergence",
            help: "How the average moved from the first probe to the last, across every scene.",
            chart: convergenceChart,
            stats: convergenceStats(spec, source),
            empty: spec.empty,
        });
    }
    if (spec.frontierPoint !== undefined && measured.length > 0) {
        const seriesPoints = series.flatMap((entry) => {
            const pass = entry.pass;
            if (pass === null) {
                return [];
            }
            const points = source.scenes.flatMap((scene) => {
                const scenePass = scene.passes?.[pass - 1];
                if (scenePass === undefined) {
                    return [];
                }
                const point = spec.frontierPoint?.(scenePass, scene, source);
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
            return points.length === 0
                ? []
                : [
                      {
                          key: entry.key,
                          label: entry.label,
                          pass: entry.pass,
                          values: [],
                          points,
                      },
                  ];
        });
        if (seriesPoints.length > 0) {
            views.push({
                id: "frontier",
                label: "Quality vs size",
                help: "Each pass's score against the bits per pixel it cost; the upper left is more efficient.",
                chart: {
                    shape: "scatter",
                    x: {
                        kind: "value",
                        title: "bits per pixel",
                        format: formatBpp,
                    },
                    series: seriesPoints,
                    y: { title: spec.label, format: spec.format },
                    references: spec.references?.(source) ?? [],
                    legend: false,
                    slider: false,
                    description: `${spec.label} against bits per pixel for every probe pass.`,
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
        measured: carrying,
        views,
    };
}
