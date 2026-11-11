import { useEffect, useMemo, useRef } from "react";

import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import {
    passColorToken,
    type AnalyticsChartData,
    type AnalyticsSeries,
} from "./sequence-analytics";
import { useResolvedTheme } from "../../shared/theme";

// Only the pieces a sequence chart uses are registered, so the desktop bundle does not carry
// the whole charting library. The SVG renderer keeps text crisp at any zoom and needs no
// canvas, which also keeps the chart usable in a window with no GPU acceleration.
echarts.use([
    BarChart,
    LineChart,
    ScatterChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    SVGRenderer,
]);

/** The palette's fallbacks, used before the stylesheet has resolved or in a bare test DOM. */
const FALLBACK_ACCENTS = [
    "#38bdf8",
    "#a78bfa",
    "#2dd4bf",
    "#fbbf24",
    "#34d399",
    "#f472b6",
] as const;

function token(name: string, fallback: string): string {
    if (typeof document === "undefined") {
        return fallback;
    }
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value === "" ? fallback : value;
}

function seriesColor(series: AnalyticsSeries, index: number): string {
    if (series.pass !== null) {
        const fallback =
            FALLBACK_ACCENTS[(Math.max(1, series.pass) - 1) % FALLBACK_ACCENTS.length] ??
            FALLBACK_ACCENTS[0];
        return token(passColorToken(series.pass), fallback);
    }
    return index === 0 ? token("--brand-default", "#38bdf8") : token("--text-muted", "#8b95a7");
}

function escapeHtml(text: string): string {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/** A scatter tooltip names the scene and both axes; the axis tooltip covers the rest. */
function scatterTooltip(data: AnalyticsChartData): (params: unknown) => string {
    return (params: unknown) => {
        const first = Array.isArray(params) ? params[0] : params;
        if (typeof first !== "object" || first === null) {
            return "";
        }
        const value = (first as { value?: unknown }).value;
        if (!Array.isArray(value) || value.length < 2) {
            return "";
        }
        const x = value[0];
        const y = value[1];
        const label = value[2];
        const xText =
            typeof x === "number" && data.x.kind === "value" ? data.x.format(x) : String(x);
        const yText = typeof y === "number" ? data.y.format(y) : String(y);
        const name = typeof label === "string" ? escapeHtml(label) : "";
        return `${name}<br/>${escapeHtml(xText)} · ${escapeHtml(yText)}`;
    };
}

/**
 * One row per measured series at the hovered x, and never the reference lines.
 *
 * A reference is drawn as its own series, so the axis tooltip would otherwise repeat the
 * threshold as if it were a scene value. `seriesIndex` is what separates the two: the
 * references are appended after every data series.
 */
function axisTooltip(data: AnalyticsChartData): (params: unknown) => string {
    return (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const first = list[0];
        if (typeof first !== "object" || first === null) {
            return "";
        }
        const heading = first as { axisValueLabel?: unknown; axisValue?: unknown };
        const title =
            typeof heading.axisValueLabel === "string"
                ? heading.axisValueLabel
                : typeof heading.axisValue === "string"
                  ? heading.axisValue
                  : typeof heading.axisValue === "number" && data.x.kind === "value"
                    ? data.x.format(heading.axisValue)
                    : "";
        const rows = list.flatMap((entry) => {
            if (typeof entry !== "object" || entry === null) {
                return [];
            }
            const item = entry as {
                seriesIndex?: unknown;
                value?: unknown;
                marker?: unknown;
            };
            const index = typeof item.seriesIndex === "number" ? item.seriesIndex : -1;
            const series = data.series[index];
            if (series === undefined) {
                return [];
            }
            const raw = Array.isArray(item.value) ? item.value.at(-1) : item.value;
            const text = typeof raw === "number" ? escapeHtml(data.y.format(raw)) : "—";
            const marker = typeof item.marker === "string" ? item.marker : "";
            return [`${marker}${escapeHtml(series.label)} · ${text}`];
        });
        return [title === "" ? "" : escapeHtml(title), ...rows].join("<br/>");
    };
}

function optionFor(data: AnalyticsChartData, theme: "dark" | "light"): echarts.EChartsCoreOption {
    const text = token("--text-muted", theme === "dark" ? "#8b95a7" : "#5b6678");
    const strong = token("--text-secondary", theme === "dark" ? "#a3afc2" : "#3d4757");
    const grid = token("--border-subtle", theme === "dark" ? "#1a202b" : "#e6eaf0");
    const axis = token("--border-default", theme === "dark" ? "#232b38" : "#d5dbe4");
    const surface = token("--bg-overlay", theme === "dark" ? "#232b38" : "#ffffff");
    const warning = token("--state-warning", "#fbbf24");
    const info = token("--state-info", "#60a5fa");
    const slider = data.slider;

    const series = data.series.map((entry, index) => {
        const color = seriesColor(entry, index);
        if (data.shape === "scatter") {
            return {
                type: "scatter" as const,
                name: entry.label,
                data: (entry.points ?? []).map((point) => [point.x, point.y, point.label]),
                symbolSize: 5,
                itemStyle: { color, opacity: 0.75 },
                large: (entry.points?.length ?? 0) > 2_000,
                largeThreshold: 2_000,
                animation: false,
            };
        }
        // An isolated measurement between two gaps draws no segment, so a sparse series
        // shows nothing at all without its symbols. That is what a partially measured
        // sequence looks like — six sampled scenes among hundreds of empty ones — and the
        // points are the only thing there to see. A dense series can hide them instead.
        const measured = entry.values.filter((value) => value !== null).length;
        const sparse = measured <= 40;
        return {
            type: data.shape === "bar" ? ("bar" as const) : ("line" as const),
            name: entry.label,
            data: [...entry.values],
            showSymbol: data.shape === "line" && (entry.values.length <= 40 || sparse),
            // ECharts hides symbols it thinks the axis is too busy for when this is `auto`.
            // A sparse measurement is the only mark on the chart, so draw every one of them.
            showAllSymbol: data.shape === "line" ? true : undefined,
            symbolSize: 4,
            connectNulls: false,
            smooth: false,
            lineStyle: { width: 1.5, color },
            itemStyle: { color },
            barMaxWidth: 16,
            // A long series is read, not animated; animating thousands of points makes every
            // metric switch feel like a stall.
            animation: entry.values.length <= 400,
        };
    });

    // A reference is its own line series rather than a `markLine`: ECharts drops a mark line
    // whose axis carries small decimals (noise around 0.002 draws nothing), and a series in
    // the chart's own units survives that case. The references follow the data series, which
    // is what lets the tooltip tell them apart by index.
    const scatterExtent = data.series.flatMap((entry) =>
        (entry.points ?? []).map((point) => point.x),
    );
    const scatterFrom = scatterExtent.length === 0 ? 0 : Math.min(...scatterExtent);
    const scatterTo = scatterExtent.length === 0 ? 0 : Math.max(...scatterExtent);
    const referenceSeries = data.references.flatMap((reference) => {
        const color = reference.tone === "warning" ? warning : info;
        const points =
            data.shape === "scatter"
                ? [
                      [scatterFrom, reference.value],
                      [scatterTo, reference.value],
                  ]
                : data.x.kind === "value"
                  ? null
                  : // Both scene and category axes have one slot per label.
                    data.x.labels.map(() => reference.value);
        if (points === null) {
            return [];
        }
        return [
            {
                type: "line" as const,
                name: reference.label,
                data: points,
                showSymbol: false,
                symbol: "none",
                silent: true,
                animation: false,
                z: 1,
                lineStyle: { width: 1, color, type: "dashed" as const },
                itemStyle: { color },
                endLabel: {
                    show: true,
                    formatter: reference.label,
                    color: text,
                    fontSize: 9,
                    // Anchor the text's right edge inside the grid and lift it over the line:
                    // the default end anchor draws the label past the chart's right wall.
                    offset: [0, -4],
                    align: "right",
                    verticalAlign: "bottom",
                },
                tooltip: { show: false },
            },
        ];
    });

    const valueFormat = data.x.kind === "value" ? data.x.format : null;
    const xLabels = data.x.kind === "value" ? [] : data.x.labels;
    const categoryAxis =
        data.x.kind === "value" && valueFormat !== null
            ? {
                  type: "value" as const,
                  name: data.x.title,
                  nameLocation: "middle" as const,
                  nameGap: 24,
                  nameTextStyle: { color: text, fontSize: 9 },
                  axisLabel: {
                      color: text,
                      fontSize: 9,
                      formatter: (value: number) => valueFormat(value),
                  },
                  axisLine: { lineStyle: { color: axis } },
                  splitLine: { show: false },
              }
            : {
                  type: "category" as const,
                  data: [...xLabels],
                  boundaryGap: data.shape === "bar",
                  axisLabel: {
                      color: text,
                      fontSize: 9,
                      hideOverlap: true,
                      // Scene labels are numbers on the axis; the card says what they are.
                      formatter: (value: string) =>
                          data.x.kind === "scene" ? value.replace("Scene ", "") : value,
                  },
                  axisLine: { lineStyle: { color: axis } },
                  axisTick: { show: false },
                  splitLine: { show: false },
              };

    return {
        animation: false,
        textStyle: {
            fontFamily: token("--font-stack-mono", "ui-monospace, monospace"),
            color: text,
        },
        grid: {
            left: 8,
            right: 14,
            top: 26,
            bottom: slider ? 40 : 6,
            containLabel: true,
        },
        tooltip: {
            trigger: data.shape === "scatter" ? "item" : "axis",
            axisPointer: { type: "line", lineStyle: { color: axis } },
            backgroundColor: surface,
            borderColor: axis,
            borderWidth: 1,
            padding: [6, 8],
            textStyle: { color: strong, fontSize: 10 },
            formatter: data.shape === "scatter" ? scatterTooltip(data) : axisTooltip(data),
        },
        legend:
            data.legend && data.series.length > 1
                ? {
                      top: 0,
                      right: 0,
                      itemWidth: 10,
                      itemHeight: 2,
                      textStyle: { color: text, fontSize: 9 },
                      // A reference is a series only for drawing; it is not a measurement and
                      // must not offer itself as a line the reader can switch off.
                      data: data.series.map((entry) => entry.label),
                  }
                : { show: false },
        xAxis: categoryAxis,
        yAxis: {
            type: "value",
            name: data.y.title,
            nameLocation: "end",
            nameGap: 10,
            nameTextStyle: { color: text, fontSize: 9, align: "left" },
            scale: data.shape !== "bar",
            min: data.shape === "bar" ? 0 : undefined,
            axisLabel: {
                color: text,
                fontSize: 9,
                formatter: (value: number) => data.y.format(value),
            },
            axisLine: { show: false },
            splitLine: { lineStyle: { color: grid } },
        },
        // Zooming is always in, not only for a long series: a chart with one crowded
        // cluster needs it more than a long one. The wheel zooms around the pointer;
        // a trackpad pinch arrives as a wheel and takes the same path. A drag pans, and
        // the slider is added when the axis has enough slots to make it legible.
        dataZoom: [
            {
                type: "inside",
                xAxisIndex: 0,
                zoomOnMouseWheel: true,
                moveOnMouseWheel: false,
                moveOnMouseMove: true,
                preventDefaultMouseMove: true,
                throttle: 60,
                brushSelect: false,
            },
            ...(slider
                ? [
                      {
                          type: "slider" as const,
                          xAxisIndex: 0,
                          height: 12,
                          bottom: 4,
                          borderColor: axis,
                          backgroundColor: "transparent",
                          fillerColor: token("--brand-subtle", "#082f49"),
                          handleStyle: { color: axis },
                          moveHandleStyle: { color: axis },
                          textStyle: { color: text, fontSize: 8 },
                          brushSelect: false,
                      },
                  ]
                : []),
        ],
        series: [...series, ...referenceSeries],
    };
}

/**
 * One sequence's measured series, drawn with the design tokens.
 *
 * The chart is a picture of the model, not a second model: every series, label and reference
 * arrives already derived, so the same numbers feed the tooltip, the statistics strip and the
 * table. Passes are coloured from the accent tokens, which is what lets the chips above the
 * chart act as its legend.
 */
export function AnalyticsChart({
    data,
    height = 260,
    ariaLabel,
}: {
    data: AnalyticsChartData;
    height?: number;
    ariaLabel: string;
}) {
    const element = useRef<HTMLDivElement | null>(null);
    const instance = useRef<echarts.EChartsType | null>(null);
    const theme = useResolvedTheme();
    const option = useMemo(() => optionFor(data, theme), [data, theme]);

    useEffect(() => {
        const host = element.current;
        if (host === null) {
            return;
        }
        const chart = echarts.init(host, undefined, { renderer: "svg" });
        instance.current = chart;
        const observer = new ResizeObserver(() => chart.resize());
        observer.observe(host);
        // The chart owns the wheel while the pointer is over it: without this the page
        // scrolls instead and the chart looks like it cannot zoom at all. The chart's own
        // handler still receives the event because only the default is stopped.
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
        };
        host.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            host.removeEventListener("wheel", onWheel);
            observer.disconnect();
            chart.dispose();
            instance.current = null;
        };
    }, []);

    useEffect(() => {
        instance.current?.setOption(option, { notMerge: true });
    }, [option]);

    // `pan-y` keeps the page scrolling under a touch drag while denying the browser its own
    // pinch zoom, so a two-finger pinch reaches the chart's zoom controller.
    return (
        <div
            ref={element}
            role="img"
            aria-label={ariaLabel}
            style={{ height, touchAction: "pan-y" }}
            className="w-full"
        />
    );
}
