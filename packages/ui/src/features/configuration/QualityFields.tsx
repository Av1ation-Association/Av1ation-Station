import { useState, type ReactNode } from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import {
    SchemaObjectFields,
    resolveSchema,
    type JsonSchema,
} from "../../shared/schema/config-schema";
import { NumberField } from "../../shared/NumberField";

/**
 * The metric and probe controls Target quality and Quality check share.
 *
 * Both screens score frames with the same engine types (`QualityMetric`, `ProbeStrategy`,
 * `ProbeStatistic`), so the controls live in one place and the two screens cannot drift.
 * The values are written in the engine's own tagged-enum shape — never a flattened copy —
 * because the service validates the document against the same schema.
 */

const FIELD =
    "h-9 w-full min-w-0 rounded-md border border-line-strong bg-sunken px-2.5 text-[11.5px] text-ink focus:border-brand focus:outline-none disabled:opacity-50";

export const METRIC_KEYS = ["SSIMULACRA2", "VMAF", "BUTTERAUGLI", "XPSNR", "CVVDP"] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
    SSIMULACRA2: "SSIMULACRA2",
    VMAF: "VMAF",
    BUTTERAUGLI: "Butteraugli",
    XPSNR: "XPSNR",
    CVVDP: "CVVDP",
};

/**
 * The engine's per-metric starting range, taken from `DEFAULT_*_TARGET_RANGE`.
 *
 * The schema does not carry these numbers: Rust `Default` is not part of a JSON Schema, so a
 * new document seeded from the schema alone would score against 0–0. Switching metric writes
 * that metric's own range instead of keeping a range that belongs to another scale.
 */
const METRIC_BODIES: Record<MetricKey, Record<string, unknown>> = {
    SSIMULACRA2: {
        target_range: [74, 76],
        resolution: null,
        threads: null,
        gpu_id: null,
    },
    VMAF: {
        target_range: [94, 96],
        resolution: null,
        scaler: "bicubic",
        threads: 0,
        model: null,
        features: [],
    },
    BUTTERAUGLI: {
        target_range: [0.8, 1.2],
        resolution: null,
        threads: null,
        intensity_multiplier: null,
        norm: null,
        gpu_id: null,
    },
    XPSNR: {
        target_range: [44, 46],
        resolution: null,
    },
    CVVDP: {
        target_range: [9.4, 9.6],
        resolution: null,
        display_model: null,
        resize_to_display: null,
        disable_temporal: null,
        gpu_id: null,
    },
};

// Only fields with the same meaning in every variant travel with the user. `threads` does not:
// VMAF takes a plain count where 0 means automatic, while the other metrics take an optional
// count where unset means automatic, so carrying the number would change its meaning.
const SHARED_METRIC_FIELDS = ["resolution", "gpu_id"] as const;

/**
 * Metrics whose score is a whole number.
 *
 * Their range is stepped by one so the two fields behave like the encoder's quantizer range;
 * Butteraugli and CVVDP are decimals and keep a tenth of a point.
 */
const INTEGER_METRICS: readonly MetricKey[] = ["SSIMULACRA2", "VMAF", "XPSNR"];

export function isMetricKey(key: string): key is MetricKey {
    return (METRIC_KEYS as readonly string[]).includes(key);
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** The tagged variant and its body, defaulting to the engine's own metric. */
export function metricEntry(value: unknown): {
    key: MetricKey;
    body: Record<string, unknown>;
} {
    const [key, body] = Object.entries(asRecord(value))[0] ?? [];
    if (key !== undefined && isMetricKey(key)) {
        return { key, body: { ...METRIC_BODIES[key], ...asRecord(body) } };
    }
    return { key: "SSIMULACRA2", body: { ...METRIC_BODIES.SSIMULACRA2 } };
}

export function switchMetric(value: unknown, key: MetricKey): Record<string, unknown> {
    const current = metricEntry(value);
    if (current.key === key) {
        return { [key]: current.body };
    }
    const next: Record<string, unknown> = { ...METRIC_BODIES[key] };
    for (const field of SHARED_METRIC_FIELDS) {
        // Only a field the chosen metric declares may be carried: the engine's variants are
        // `additionalProperties: false`, so a leftover `gpu_id` on VMAF is a rejected save.
        if (
            current.body[field] !== undefined &&
            current.body[field] !== null &&
            field in METRIC_BODIES[key]
        ) {
            next[field] = current.body[field];
        }
    }
    return { [key]: next };
}

/** The target range lives inside the chosen metric, because its scale is metric-specific. */
export function withTargetRange(
    value: unknown,
    bound: 0 | 1,
    next: number,
): Record<string, unknown> {
    const { key, body } = metricEntry(value);
    const range = Array.isArray(body.target_range)
        ? (body.target_range as unknown[]).map((entry) => (typeof entry === "number" ? entry : 0))
        : [0, 0];
    range[bound] = next;
    return { [key]: { ...body, target_range: range } };
}

/** How many metric-specific options are set, for the disclosure's summary. */
export function metricOptionCount(value: unknown): number {
    const { key, body } = metricEntry(value);
    const defaults = METRIC_BODIES[key];
    return Object.entries(body).filter(
        ([field, entry]) =>
            field !== "target_range" &&
            entry !== null &&
            entry !== undefined &&
            !(Array.isArray(entry) && entry.length === 0) &&
            // A required field that still holds the engine's own value was not set by anyone.
            JSON.stringify(entry) !== JSON.stringify(defaults[field]),
    ).length;
}

/** The metric's own schema node, so its options are generated instead of hand-mirrored. */
function metricBodySchema(root: JsonSchema, node: JsonSchema, key: MetricKey): JsonSchema | null {
    let config = resolveSchema(root, node);
    // The sequence part is `anyOf [<config>, null]`; the fields live on the non-null half.
    const nullable = config.anyOf?.find(
        (entry) => !(Array.isArray(entry.type) ? entry.type : [entry.type]).includes("null"),
    );
    if (nullable !== undefined) {
        config = resolveSchema(root, nullable);
    }
    // The metric is the config's own `metric` property, which is a `$ref` to the tagged
    // union. Reading `oneOf` off the config found nothing and the disclosure opened empty.
    const metricRef = config.properties?.metric;
    if (metricRef === undefined) {
        return null;
    }
    const metric = resolveSchema(root, metricRef);
    const variant = metric.oneOf?.find((entry) => entry.properties?.[key] !== undefined);
    const bodyRef = variant?.properties?.[key];
    if (bodyRef === undefined) {
        return null;
    }
    const body = resolveSchema(root, bodyRef);
    const properties = Object.fromEntries(
        Object.entries(body.properties ?? {}).filter(([field]) => field !== "target_range"),
    );
    return {
        ...body,
        properties,
        required: (body.required ?? []).filter((field) => field !== "target_range"),
    };
}

/** The target band inside a metric, split out so a reference can mount it without the dropdown. */
export function TargetRangeField({
    value,
    onChange,
    disabled,
}: {
    value: unknown;
    onChange: (next: Record<string, unknown>) => void;
    disabled: boolean;
}) {
    const { key, body } = metricEntry(value);
    const range = Array.isArray(body.target_range) ? (body.target_range as unknown[]) : [0, 0];
    const whole = INTEGER_METRICS.includes(key);

    return (
        <div className="min-w-0">
            <span className="block text-[10.5px] font-medium text-ink-secondary">Target range</span>
            <div className="mt-1 flex items-center gap-1.5">
                <NumberField
                    value={typeof range[0] === "number" ? range[0] : 0}
                    label="Target range minimum"
                    disabled={disabled}
                    step={whole ? 1 : 0.1}
                    integer={whole}
                    onChange={(next) => onChange(withTargetRange(value, 0, next))}
                    className="w-[116px]"
                />
                <span className="text-[10.5px] text-ink-muted">to</span>
                <NumberField
                    value={typeof range[1] === "number" ? range[1] : 0}
                    label="Target range maximum"
                    disabled={disabled}
                    step={whole ? 1 : 0.1}
                    integer={whole}
                    onChange={(next) => onChange(withTargetRange(value, 1, next))}
                    className="w-[116px]"
                />
            </div>
        </div>
    );
}

/** The encoder's quantizer search bounds, shared with the sparse target-quality screen. */
export function QuantizerRangeField({
    value,
    onChange,
    min,
    max,
    disabled,
}: {
    value: unknown;
    onChange: (next: [number, number]) => void;
    min: number;
    max: number;
    disabled: boolean;
}) {
    const range = Array.isArray(value) ? value : [];
    const lower = typeof range[0] === "number" ? range[0] : min;
    const upper = typeof range[1] === "number" ? range[1] : max;

    return (
        <div className="min-w-0">
            <span className="block text-[10.5px] font-medium text-ink-secondary">
                Quantizer range
            </span>
            <div className="mt-1 flex items-center gap-1.5">
                <NumberField
                    label="Quantizer range minimum"
                    value={lower}
                    min={min}
                    max={max}
                    step={1}
                    integer
                    disabled={disabled}
                    onChange={(next) => onChange([next, upper])}
                    className="w-[116px]"
                />
                <span className="text-[10.5px] text-ink-muted">to</span>
                <NumberField
                    label="Quantizer range maximum"
                    value={upper}
                    min={min}
                    max={max}
                    step={1}
                    integer
                    disabled={disabled}
                    onChange={(next) => onChange([lower, next])}
                    className="w-[116px]"
                />
            </div>
        </div>
    );
}

export function MetricField({
    value,
    onChange,
    root,
    node,
    disabled,
    trailing,
    showRange = true,
}: {
    value: unknown;
    onChange: (next: Record<string, unknown>) => void;
    /** The generated schemas for the metric's optional body; omitted by a metric-only control. */
    root?: JsonSchema | undefined;
    node?: JsonSchema | undefined;
    disabled: boolean;
    /** A sibling control that shares the row, such as Maximum probes. */
    trailing?: ReactNode;
    /** A quality check scores frames; it chooses no target, so it hides the range. */
    showRange?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const { key, body } = metricEntry(value);
    const count = metricOptionCount(value);
    const extras =
        root === undefined || node === undefined ? null : metricBodySchema(root, node, key);

    return (
        <div className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="block min-w-0">
                    <span className="block text-[10.5px] font-medium text-ink-secondary">
                        Metric
                    </span>
                    <select
                        aria-label="Quality metric"
                        value={key}
                        disabled={disabled}
                        onChange={(event) => {
                            if (isMetricKey(event.target.value)) {
                                onChange(switchMetric(value, event.target.value));
                            }
                        }}
                        className={`${FIELD} mt-1`}
                    >
                        {METRIC_KEYS.map((option) => (
                            <option key={option} value={option}>
                                {METRIC_LABELS[option]}
                            </option>
                        ))}
                    </select>
                </label>

                {showRange ? (
                    <TargetRangeField value={value} onChange={onChange} disabled={disabled} />
                ) : null}

                {trailing === undefined ? null : <div className="min-w-0">{trailing}</div>}
            </div>

            {extras === null ? null : (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((previous) => !previous)}
                    className="mt-2 flex items-center gap-1 text-[10.5px] text-brand-text transition-colors duration-150 hover:text-ink"
                >
                    {open ? (
                        <ChevronDown aria-hidden="true" className="h-3 w-3" />
                    ) : (
                        <ChevronRight aria-hidden="true" className="h-3 w-3" />
                    )}
                    Metric options
                    <span className="text-ink-muted">· {count} set</span>
                </button>
            )}

            {open && extras !== null && root !== undefined ? (
                <div
                    aria-label="Metric options"
                    className="mt-2 rounded-md border border-line bg-sunken px-3"
                >
                    <SchemaObjectFields
                        root={root}
                        schema={extras}
                        value={body}
                        onChange={(next) => onChange({ [key]: asRecord(next) })}
                        depth={0}
                    />
                </div>
            ) : null}
        </div>
    );
}

export const STRATEGY_KEYS = ["Whole", "Skip", "Subset"] as const;
export type StrategyKey = (typeof STRATEGY_KEYS)[number];

const STRATEGY_LABELS: Record<StrategyKey, string> = {
    Whole: "Whole scene",
    Skip: "Skip every Nth frame",
    Subset: "Subset",
};

export const STATISTIC_KEYS = [
    "Mean",
    "Median",
    "Percentile",
    "Mode",
    "Minimum",
    "Maximum",
    "Harmonic",
    "StandardDeviationDistance",
    "RootMeanSquare",
] as const;
export type StatisticKey = (typeof STATISTIC_KEYS)[number];

const STATISTIC_LABELS: Record<StatisticKey, string> = {
    Mean: "Mean",
    Median: "Median",
    Percentile: "Percentile",
    Mode: "Mode",
    Minimum: "Minimum",
    Maximum: "Maximum",
    Harmonic: "Harmonic mean",
    StandardDeviationDistance: "Standard deviation distance",
    RootMeanSquare: "Root mean square",
};

function isStrategyKey(key: string): key is StrategyKey {
    return (STRATEGY_KEYS as readonly string[]).includes(key);
}

function isStatisticKey(key: string): key is StatisticKey {
    return (STATISTIC_KEYS as readonly string[]).includes(key);
}

/** The strategy variant; `Whole` is a bare string in the engine's own JSON. */
export function strategyEntry(value: unknown): {
    key: StrategyKey;
    skip: number;
    position: "Start" | "Middle" | "End";
    lengthKind: "Frames" | "Percentage";
    length: number;
} {
    if (typeof value === "string" && isStrategyKey(value)) {
        return { key: value, skip: 10, position: "Middle", lengthKind: "Frames", length: 11 };
    }
    const [key, raw] = Object.entries(asRecord(value))[0] ?? [];
    const body = asRecord(raw);
    if (key === "Skip") {
        return {
            key: "Skip",
            // The engine now rejects a zero stride; legacy documents may still carry one.
            skip: typeof body.skip === "number" ? Math.max(1, Math.trunc(body.skip)) : 10,
            position: "Middle",
            lengthKind: "Frames",
            length: 11,
        };
    }
    if (key === "Subset") {
        const length = asRecord(body.length);
        const [lengthKind, amount] = Object.entries(length)[0] ?? [];
        return {
            key: "Subset",
            skip: 10,
            position:
                body.position === "Start" || body.position === "End" ? body.position : "Middle",
            lengthKind: lengthKind === "Percentage" ? "Percentage" : "Frames",
            length: typeof amount === "number" ? amount : 11,
        };
    }
    return { key: "Whole", skip: 10, position: "Middle", lengthKind: "Frames", length: 11 };
}

export function withStrategy(
    value: unknown,
    patch: Partial<{
        key: StrategyKey;
        skip: number;
        position: "Start" | "Middle" | "End";
        lengthKind: "Frames" | "Percentage";
        length: number;
    }>,
): unknown {
    const current = { ...strategyEntry(value), ...patch };
    if (current.key === "Whole") {
        return "Whole";
    }
    if (current.key === "Skip") {
        return { Skip: { skip: Math.max(1, Math.trunc(current.skip)) } };
    }
    return {
        Subset: {
            position: current.position,
            length: { [current.lengthKind]: current.length },
        },
    };
}

export function statisticEntry(value: unknown): {
    key: StatisticKey;
    amount: number;
} {
    if (typeof value === "string" && isStatisticKey(value)) {
        return { key: value, amount: 1 };
    }
    const [key, raw] = Object.entries(asRecord(value))[0] ?? [];
    if (key === "Percentile") {
        return { key: "Percentile", amount: typeof raw === "number" ? raw : 1 };
    }
    if (key === "StandardDeviationDistance") {
        const sigma = asRecord(raw).sigma;
        return { key: "StandardDeviationDistance", amount: typeof sigma === "number" ? sigma : 1 };
    }
    return { key: "Mean", amount: 1 };
}

export function withStatistic(value: unknown, key: StatisticKey, amount: number): unknown {
    const current = statisticEntry(value);
    if (key !== "Percentile" && key !== "StandardDeviationDistance") {
        return key;
    }
    const next = key === current.key ? amount : 1;
    if (key === "Percentile") {
        return { Percentile: next };
    }
    return { StandardDeviationDistance: { sigma: next } };
}

export function ProbeFields({
    strategy,
    statistic,
    onStrategy,
    onStatistic,
    disabled,
}: {
    strategy: unknown;
    statistic: unknown;
    onStrategy: (next: unknown) => void;
    onStatistic: (next: unknown) => void;
    disabled: boolean;
}) {
    const probe = strategyEntry(strategy);
    const stat = statisticEntry(statistic);

    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block min-w-0">
                <span className="block text-[10.5px] font-medium text-ink-secondary">
                    Probe strategy
                </span>
                <select
                    aria-label="Probe strategy"
                    value={probe.key}
                    disabled={disabled}
                    onChange={(event) => {
                        if (isStrategyKey(event.target.value)) {
                            onStrategy(withStrategy(strategy, { key: event.target.value }));
                        }
                    }}
                    className={`${FIELD} mt-1`}
                >
                    {STRATEGY_KEYS.map((option) => (
                        <option key={option} value={option}>
                            {STRATEGY_LABELS[option]}
                        </option>
                    ))}
                </select>
            </label>

            {probe.key === "Skip" ? (
                <label className="block min-w-0">
                    <span className="block text-[10.5px] font-medium text-ink-secondary">
                        Skip every
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                        <NumberField
                            value={probe.skip}
                            label="Frames to skip"
                            disabled={disabled}
                            step={1}
                            integer
                            min={1}
                            onChange={(skip) =>
                                onStrategy(withStrategy(strategy, { skip: Math.max(1, skip) }))
                            }
                            className="w-[116px]"
                        />
                        <span className="shrink-0 font-mono text-[9.5px] text-ink-muted">
                            frames
                        </span>
                    </span>
                </label>
            ) : null}

            {probe.key === "Subset" ? (
                <>
                    <label className="block min-w-0">
                        <span className="block text-[10.5px] font-medium text-ink-secondary">
                            Position
                        </span>
                        <select
                            aria-label="Subset position"
                            value={probe.position}
                            disabled={disabled}
                            onChange={(event) => {
                                const position = event.target.value;
                                if (
                                    position === "Start" ||
                                    position === "Middle" ||
                                    position === "End"
                                ) {
                                    onStrategy(withStrategy(strategy, { position }));
                                }
                            }}
                            className={`${FIELD} mt-1`}
                        >
                            <option value="Start">Start</option>
                            <option value="Middle">Middle</option>
                            <option value="End">End</option>
                        </select>
                    </label>
                    <label className="block min-w-0 sm:col-span-2">
                        <span className="block text-[10.5px] font-medium text-ink-secondary">
                            Subset length
                        </span>
                        <span className="mt-1 grid min-w-0 grid-cols-[128px_minmax(0,1fr)] gap-1.5">
                            <select
                                aria-label="Subset length kind"
                                value={probe.lengthKind}
                                disabled={disabled}
                                onChange={(event) =>
                                    onStrategy(
                                        withStrategy(strategy, {
                                            lengthKind:
                                                event.target.value === "Percentage"
                                                    ? "Percentage"
                                                    : "Frames",
                                        }),
                                    )
                                }
                                className={FIELD}
                            >
                                <option value="Frames">Frames</option>
                                <option value="Percentage">Percent</option>
                            </select>
                            <span className="flex min-w-0 items-center gap-1.5">
                                <NumberField
                                    value={probe.length}
                                    label="Subset length value"
                                    disabled={disabled}
                                    step={probe.lengthKind === "Percentage" ? 0.1 : 1}
                                    integer={probe.lengthKind !== "Percentage"}
                                    min={probe.lengthKind === "Percentage" ? 0.01 : 1}
                                    max={probe.lengthKind === "Percentage" ? 100 : undefined}
                                    onChange={(length) =>
                                        onStrategy(
                                            withStrategy(strategy, {
                                                length:
                                                    probe.lengthKind === "Percentage"
                                                        ? Math.min(100, Math.max(0.01, length))
                                                        : Math.max(1, Math.trunc(length)),
                                            }),
                                        )
                                    }
                                    className="w-[116px]"
                                />
                                <span className="shrink-0 font-mono text-[9.5px] text-ink-muted">
                                    {probe.lengthKind === "Percentage" ? "%" : "frames"}
                                </span>
                            </span>
                        </span>
                    </label>
                </>
            ) : null}

            <label className="block min-w-0">
                <span className="block text-[10.5px] font-medium text-ink-secondary">
                    Statistic
                </span>
                <select
                    aria-label="Probe statistic"
                    value={stat.key}
                    disabled={disabled}
                    onChange={(event) => {
                        if (isStatisticKey(event.target.value)) {
                            onStatistic(withStatistic(statistic, event.target.value, stat.amount));
                        }
                    }}
                    className={`${FIELD} mt-1`}
                >
                    {STATISTIC_KEYS.map((option) => (
                        <option key={option} value={option}>
                            {STATISTIC_LABELS[option]}
                        </option>
                    ))}
                </select>
            </label>

            {stat.key === "Percentile" || stat.key === "StandardDeviationDistance" ? (
                <label className="block min-w-0">
                    <span className="block text-[10.5px] font-medium text-ink-secondary">
                        {stat.key === "Percentile" ? "Percentile" : "Sigma distance"}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                        <NumberField
                            value={stat.amount}
                            label={
                                stat.key === "Percentile" ? "Percentile value" : "Sigma distance"
                            }
                            disabled={disabled}
                            step={stat.key === "Percentile" ? 1 : 0.1}
                            integer={stat.key === "Percentile"}
                            onChange={(amount) =>
                                onStatistic(withStatistic(statistic, stat.key, amount))
                            }
                            className="w-[116px]"
                        />
                        <span className="shrink-0 font-mono text-[9.5px] text-ink-muted">
                            {stat.key === "Percentile" ? "0–100" : "σ"}
                        </span>
                    </span>
                </label>
            ) : null}
        </div>
    );
}
