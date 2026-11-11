import { useEffect, useMemo, useRef, useState } from "react";

import { visibleWindow } from "../../shared/model/scene-layout";
import {
    passColorVariable,
    type AnalyticsMetric,
    type AnalyticsStat,
    type AnalyticsView,
    type AnalyticsViewId,
    type SequenceAnalytics,
} from "./sequence-analytics";

import { AnalyticsChart } from "./AnalyticsChart";
import { SearchField } from "../../shared/SearchField";

const ROW_HEIGHT = 24;
const TABLE_HEIGHT = 320;

function MetricTabs({
    metrics,
    active,
    onSelect,
}: {
    metrics: readonly AnalyticsMetric[];
    active: string;
    onSelect: (id: string) => void;
}) {
    if (metrics.length <= 1) {
        return null;
    }
    return (
        <div role="group" aria-label="Measure" className="flex flex-wrap gap-1">
            {metrics.map((metric) => {
                const selected = metric.id === active;
                return (
                    <button
                        key={metric.id}
                        type="button"
                        aria-pressed={selected}
                        title={metric.help}
                        onClick={() => onSelect(metric.id)}
                        className={`rounded-md border px-2.5 py-1 text-[10.5px] font-medium transition-colors duration-150 ${
                            selected
                                ? "border-brand/50 bg-brand-subtle text-brand"
                                : "border-line-strong bg-raised text-ink-secondary hover:border-line-strong hover:text-ink"
                        }`}
                    >
                        {metric.label}
                    </button>
                );
            })}
        </div>
    );
}

function ViewTabs({
    views,
    active,
    onSelect,
}: {
    views: readonly AnalyticsView[];
    active: string;
    onSelect: (id: AnalyticsViewId) => void;
}) {
    if (views.length <= 1) {
        return null;
    }
    return (
        <div role="group" aria-label="View" className="flex flex-wrap gap-1">
            {views.map((view) => {
                const selected = view.id === active;
                return (
                    <button
                        key={view.id}
                        type="button"
                        aria-pressed={selected}
                        title={view.help}
                        onClick={() => onSelect(view.id)}
                        className={`rounded-full border px-2 py-0.5 text-[9.5px] transition-colors duration-150 ${
                            selected
                                ? "border-line-strong bg-active text-ink"
                                : "border-transparent text-ink-muted hover:text-ink-secondary"
                        }`}
                    >
                        {view.label}
                    </button>
                );
            })}
        </div>
    );
}

function PassChips({
    passes,
    hidden,
    onToggle,
}: {
    passes: readonly number[];
    hidden: ReadonlySet<number>;
    onToggle: (pass: number) => void;
}) {
    const visible = passes.filter((pass) => !hidden.has(pass));
    if (passes.length < 2) {
        return null;
    }
    return (
        <div role="group" aria-label="Probe passes" className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5 text-[9px] text-ink-muted">Passes</span>
            {passes.map((pass) => {
                const shown = !hidden.has(pass);
                // Hiding the last visible pass would leave an empty chart with no way back
                // that is not obvious, so the final chip stays on instead.
                const last = shown && visible.length === 1;
                return (
                    <button
                        key={pass}
                        type="button"
                        aria-pressed={shown}
                        title={
                            shown
                                ? last
                                    ? "Keep at least one pass visible"
                                    : `Hide pass ${String(pass)}`
                                : `Show pass ${String(pass)}`
                        }
                        aria-disabled={last}
                        onClick={() => {
                            if (last) {
                                return;
                            }
                            onToggle(pass);
                        }}
                        className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] transition-opacity duration-150 ${
                            shown
                                ? "border-line-strong text-ink-secondary"
                                : "border-line text-ink-muted opacity-40"
                        }`}
                    >
                        <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                                background: shown ? passColorVariable(pass) : "currentColor",
                            }}
                        />
                        P{pass}
                    </button>
                );
            })}
        </div>
    );
}

function StatStrip({ stats }: { stats: readonly AnalyticsStat[] }) {
    if (stats.length === 0) {
        return null;
    }
    return (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line-subtle pt-3 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((stat) => (
                <div key={stat.label} className="min-w-0">
                    <dt className="m-0 truncate text-[9px] tracking-[0.06em] text-ink-muted uppercase">
                        {stat.label}
                    </dt>
                    <dd className="m-0 truncate font-mono text-[10.5px] text-ink tabular-nums">
                        {stat.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * The measured table, virtualized and sortable.
 *
 * It opens with the scene order the pipeline uses, and a header click re-sorts it without
 * changing the chart: a reader comparing two scenes should not lose the picture above. Only
 * the visible rows are mounted, so a 5,000-scene video is the same cost as a ten-scene one.
 */
function AnalyticsTable({ analytics }: { analytics: SequenceAnalytics }) {
    const { table } = analytics;
    const scroller = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);

    const rows = useMemo(() => {
        if (sort === null) {
            return table.rows;
        }
        return [...table.rows].sort((left, right) => {
            const a = left.cells[sort.column];
            const b = right.cells[sort.column];
            const result =
                a?.sort !== null &&
                a?.sort !== undefined &&
                b?.sort !== null &&
                b?.sort !== undefined
                    ? a.sort - b.sort
                    : (a?.text ?? "").localeCompare(b?.text ?? "");
            return sort.descending ? -result : result;
        });
    }, [sort, table]);

    // A search narrows the rows, never the chart: the picture above is what the reader is
    // reading, and this table is the evidence behind one point in it.
    const needle = query.trim().toLowerCase();
    const matching = useMemo(() => {
        if (needle === "") {
            return rows;
        }
        return rows.filter(
            (row) =>
                `scene ${String(row.scene)}`.includes(needle) ||
                row.cells.some((cell) => cell.text.toLowerCase().includes(needle)),
        );
    }, [needle, rows]);

    // A filtered list is shorter, so a scroll offset from the unfiltered one would leave
    // the reader below its end with an empty panel.
    useEffect(() => {
        if (scroller.current !== null) {
            scroller.current.scrollTop = 0;
        }
        setScrollTop(0);
    }, [needle]);

    const viewport = visibleWindow(matching.length, ROW_HEIGHT, scrollTop, TABLE_HEIGHT);

    if (table.columns.length === 0 || rows.length === 0) {
        return null;
    }

    return (
        <details className="mt-4 border-t border-line-subtle pt-3">
            <summary className="cursor-pointer text-[10.5px] text-ink-muted select-none">
                Inspect scenes{" "}
                <span className="font-mono text-[9.5px] tabular-nums">
                    {rows.length.toLocaleString()} rows
                </span>
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder="Search scenes and values"
                    label="Search the measured rows"
                    className="h-7 w-full sm:w-56"
                />
                {needle === "" ? null : (
                    <span className="font-mono text-[9.5px] text-ink-muted tabular-nums">
                        {matching.length.toLocaleString()} of {rows.length.toLocaleString()} rows
                    </span>
                )}
            </div>
            <div
                ref={scroller}
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                style={{ maxHeight: TABLE_HEIGHT }}
                className="mt-2 overflow-auto rounded-md border border-line"
            >
                <table className="w-full border-collapse text-left font-mono text-[10px] tabular-nums">
                    <caption className="sr-only">
                        Measured values per scene. Sort a column with its header.
                    </caption>
                    <thead>
                        <tr>
                            {table.columns.map((column, index) => {
                                const sorted = sort?.column === index;
                                return (
                                    <th
                                        key={column.id}
                                        scope="col"
                                        aria-sort={
                                            sorted
                                                ? sort.descending
                                                    ? "descending"
                                                    : "ascending"
                                                : "none"
                                        }
                                        className={`sticky top-0 z-10 bg-surface px-2 py-1.5 font-normal text-ink-muted ${
                                            column.numeric ? "text-right" : "text-left"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSort((current) =>
                                                    current?.column === index
                                                        ? {
                                                              column: index,
                                                              descending: !current.descending,
                                                          }
                                                        : {
                                                              column: index,
                                                              descending: false,
                                                          },
                                                );
                                                if (scroller.current !== null) {
                                                    scroller.current.scrollTop = 0;
                                                }
                                            }}
                                            className="inline-flex items-center gap-1 whitespace-nowrap hover:text-ink"
                                        >
                                            {column.label}
                                            <span aria-hidden="true" className="text-[8px]">
                                                {sorted ? (sort.descending ? "▼" : "▲") : ""}
                                            </span>
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        <tr aria-hidden="true" style={{ height: viewport.top }}>
                            <td colSpan={table.columns.length} />
                        </tr>
                        {matching.slice(viewport.start, viewport.end).map((row) => (
                            <tr
                                key={row.scene}
                                style={{ height: ROW_HEIGHT }}
                                className="border-t border-line-subtle"
                            >
                                {row.cells.map((cell, index) => (
                                    <td
                                        key={table.columns[index]?.id ?? String(index)}
                                        className={`px-2 py-0.5 ${
                                            table.columns[index]?.numeric
                                                ? "text-right text-ink"
                                                : "text-left text-ink-secondary"
                                        }`}
                                    >
                                        {cell.text}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        <tr
                            aria-hidden="true"
                            style={{
                                height: Math.max(0, viewport.height - viewport.end * ROW_HEIGHT),
                            }}
                        >
                            <td colSpan={table.columns.length} />
                        </tr>
                    </tbody>
                </table>
            </div>
            {needle !== "" && matching.length === 0 ? (
                <p className="mt-2 mb-0 text-[10.5px] text-ink-muted">
                    No row matches that search.
                </p>
            ) : null}
            <p className="mt-1.5 mb-0 text-[9.5px] leading-relaxed text-ink-muted">{table.note}</p>
        </details>
    );
}

/**
 * One sequence's analytics, dense but not crowded: one measure and one view at a time, with
 * the pass chips and the table in the same card so a reader never has to hunt for the number
 * behind a line. The card is the only place on the page that carries figures; the aside
 * keeps the run context, so two panels cannot drift into telling different stories.
 */
export function SequenceAnalyticsCard({
    analytics,
    title = "Measured data",
}: {
    analytics: SequenceAnalytics;
    title?: string;
}) {
    // Open on the measure that has data, not the section's first measure: Noise Detector and
    // Noise Scaler write different rows, so a detection-only run would otherwise land on an
    // empty scale-factor chart while its measurements sat one tab away.
    const opening = analytics.metrics.find((entry) => entry.measured > 0) ?? analytics.metrics[0];
    const [metricId, setMetricId] = useState(opening?.id ?? "");
    const [viewId, setViewId] = useState(opening?.views[0]?.id ?? "scenes");
    const [hiddenPasses, setHiddenPasses] = useState<ReadonlySet<number>>(() => new Set());

    const metric = analytics.metrics.find((entry) => entry.id === metricId) ?? analytics.metrics[0];
    const view = metric?.views.find((entry) => entry.id === viewId) ?? metric?.views[0];

    const passes = useMemo(() => {
        const values = new Set<number>();
        for (const series of view?.chart?.series ?? []) {
            if (series.pass !== null) {
                values.add(series.pass);
            }
        }
        return [...values].sort((left, right) => left - right);
    }, [view]);

    const chart = useMemo(() => {
        if (view?.chart === null || view?.chart === undefined) {
            return null;
        }
        return {
            ...view.chart,
            series: view.chart.series.filter(
                (series) => series.pass === null || !hiddenPasses.has(series.pass),
            ),
        };
    }, [hiddenPasses, view]);

    // The chip follows the selected measure, so a section whose detector has run and whose
    // scaler has not says exactly that instead of reporting the section's union as its own.
    const total = analytics.scenes;
    const measured = metric?.measured ?? 0;
    const coverage =
        total === 0
            ? "No scenes detected"
            : measured === total
              ? `All ${total.toLocaleString()} scenes`
              : `${measured.toLocaleString()} of ${total.toLocaleString()} scenes`;

    return (
        <section className="rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="m-0 text-sm font-semibold text-ink">{title}</h2>
                    {metric === undefined ? null : (
                        <p className="mt-1 mb-0 max-w-[86ch] text-[10.5px] leading-relaxed text-ink-secondary">
                            {metric.help}
                        </p>
                    )}
                </div>
                {metric === undefined ? null : (
                    <span
                        className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 font-mono text-[8.5px] text-ink-muted tabular-nums"
                        title="Scenes carrying a value for this measure"
                    >
                        {coverage}
                    </span>
                )}
            </div>

            {analytics.metrics.length === 0 ? (
                <div className="mt-4">
                    <p className="m-0 rounded-md border border-dashed border-line px-3 py-3 text-[10.5px] leading-relaxed text-ink-muted">
                        {analytics.empty}
                    </p>
                    {analytics.note === analytics.empty ? null : (
                        <p className="mt-3 mb-0 max-w-[90ch] text-[10px] leading-relaxed text-ink-muted">
                            {analytics.note}
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div className="mt-3">
                        <MetricTabs
                            metrics={analytics.metrics}
                            active={metric?.id ?? ""}
                            onSelect={(id) => {
                                const next = analytics.metrics.find((entry) => entry.id === id);
                                setMetricId(id);
                                // Keep the view when the new measure offers it, so switching
                                // from one pass metric's convergence to another does not jump
                                // back to the per-scene chart.
                                if (
                                    next !== undefined &&
                                    !next.views.some((entry) => entry.id === viewId)
                                ) {
                                    setViewId(next.views[0]?.id ?? "scenes");
                                }
                            }}
                        />
                    </div>

                    {view === undefined ? null : (
                        <>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <ViewTabs
                                    views={metric?.views ?? []}
                                    active={view.id}
                                    onSelect={setViewId}
                                />
                                <PassChips
                                    passes={passes}
                                    hidden={hiddenPasses}
                                    onToggle={(pass) => {
                                        setHiddenPasses((current) => {
                                            const next = new Set(current);
                                            if (next.has(pass)) {
                                                next.delete(pass);
                                            } else {
                                                next.add(pass);
                                            }
                                            return next;
                                        });
                                    }}
                                />
                            </div>

                            <div className="mt-2">
                                {chart === null ? (
                                    <p className="m-0 rounded-md border border-dashed border-line px-3 py-6 text-center text-[10.5px] leading-relaxed text-ink-muted">
                                        {view.empty}
                                    </p>
                                ) : (
                                    <>
                                        <AnalyticsChart
                                            data={chart}
                                            ariaLabel={chart.description}
                                        />
                                        <p className="mt-2 mb-0 text-[9.5px] leading-relaxed text-ink-muted">
                                            Ctrl/⌘ with the wheel or a pinch zooms around the
                                            pointer; drag the chart to pan
                                            {chart.slider ? ", or use the bar below it" : ""}.
                                        </p>
                                    </>
                                )}
                            </div>

                            <StatStrip stats={view.stats} />
                        </>
                    )}

                    <AnalyticsTable analytics={analytics} />

                    <p className="mt-3 mb-0 max-w-[90ch] text-[10px] leading-relaxed text-ink-muted">
                        {analytics.note}
                    </p>
                </>
            )}
        </section>
    );
}
