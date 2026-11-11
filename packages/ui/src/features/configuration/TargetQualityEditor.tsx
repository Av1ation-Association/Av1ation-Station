import {
    useMemo,
    useState,
    type Dispatch,
    type MouseEvent as ReactMouseEvent,
    type SetStateAction,
} from "react";

import type { EncoderDescriptor, ParameterDescriptor } from "@av1ation/contracts";

import { InputOverrideEditor } from "./InputOverrideEditor";
import { NumberField } from "../../shared/NumberField";
import { MetricField, ProbeFields } from "./QualityFields";
import { ParameterControl } from "../encoders/parameter-control";
import { SpeedScalingCard } from "./SpeedScalingCard";
import {
    buildOption,
    canonicalOf,
    descriptorForVariant,
    optionName,
    quantizerBounds,
    startingValue,
    withOptionValue,
} from "../encoders/encoder-options";
import { emptyInputValue, inputFromValue } from "../../shared/model/input-model";
import type { JsonSchema } from "../../shared/schema/config-schema";
import type { DocumentScope } from "../../shared/model/project-sections";

const FIELD =
    "h-9 w-full min-w-0 rounded-md border border-line-strong bg-sunken px-2.5 font-mono text-[11.5px] text-ink focus:border-brand focus:outline-none disabled:opacity-50";

const INTERPOLATORS = [
    { id: "Linear", label: "Linear" },
    { id: "Quadratic", label: "Quadratic" },
    { id: "Natural", label: "Natural" },
    { id: "FritschCarlson", label: "Fritsch–Carlson" },
    { id: "Pchip", label: "PCHIP" },
    { id: "Catmull", label: "Catmull–Rom" },
    { id: "Akima", label: "Akima" },
    { id: "CubicPolynomial", label: "Cubic polynomial" },
] as const;

/**
 * What enabling Target quality writes.
 *
 * The engine schema carries no Rust `Default`, so `defaultFor()` would produce a zero target
 * range and a metric with no range at all. These are the engine's own defaults: SSIMULACRA2
 * at 74–76, four probes, 0–51 quantizers, and the Fritsch–Carlson/PCHIP interpolation pair.
 */
const TARGET_START = {
    metric: {
        SSIMULACRA2: {
            target_range: [74, 76],
            resolution: null,
            threads: null,
            gpu_id: null,
        },
    },
    maximum_probes: 4,
    // Replaced with the selected encoder's own scale when the stage is enabled; 0–51 is x264's
    // scale, not every encoder's.
    quantizer_range: [0, 51],
    interpolators: ["FritschCarlson", "Pchip"],
    input: null,
    metric_input: null,
    probing: { encoder_options: null, strategy: "Whole", statistic: "Mean" },
};

type Draft = Record<string, unknown>;

function asRecord(value: unknown): Draft {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Draft)
        : {};
}

function numberAt(value: unknown, index: number, fallback: number): number {
    const entry = Array.isArray(value) ? value[index] : undefined;
    return typeof entry === "number" ? entry : fallback;
}

/** A switch reads as the stage's on/off state without a second Enable button. */
function Switch({
    checked,
    onChange,
    label,
    disabled,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:opacity-50 ${
                checked ? "border-brand bg-brand" : "border-line-strong bg-sunken"
            }`}
        >
            <span
                aria-hidden="true"
                className={`h-3.5 w-3.5 rounded-full bg-ink transition-transform duration-150 ${
                    checked ? "translate-x-[18px] bg-on-brand" : "translate-x-[3px]"
                }`}
            />
        </button>
    );
}

/**
 * One probe-only encoder override list.
 *
 * `probing.encoder_options` is the same `CLIParameter` map the encoder uses, so a value is
 * edited with the same control as Encoding and never as a JSON object. An empty map is
 * written back as `null`, the engine's "probe with Encoding's own options" state.
 */
function ProbeOptions({
    value,
    onChange,
    descriptor,
    disabled,
}: {
    value: unknown;
    onChange: (next: Record<string, unknown> | null) => void;
    descriptor: ReturnType<typeof descriptorForVariant>;
    disabled: boolean;
}) {
    const options = useMemo(
        () =>
            typeof value === "object" && value !== null && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {},
        [value],
    );
    const [adding, setAdding] = useState("");
    const entries = Object.entries(options);
    const available = useMemo(
        () =>
            Object.entries(descriptor?.parameters ?? {})
                .filter(([canonical]) => options[optionName(canonical)] === undefined)
                .sort(([left], [right]) => left.localeCompare(right)),
        [descriptor, options],
    );
    const groups = useMemo(() => {
        const map = new Map<string, Array<[string, ParameterDescriptor]>>();
        for (const entry of available) {
            const group = entry[1].group ?? "Other";
            map.set(group, [...(map.get(group) ?? []), entry]);
        }
        return [...map.entries()];
    }, [available]);

    return (
        <div className="border-t border-line-subtle pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="m-0 text-[11.5px] font-medium text-ink">Probe encoder options</h3>
                <span className="font-mono text-[9.5px] text-ink-muted">
                    {String(entries.length)} set
                </span>
            </div>
            <p className="mt-0.5 mb-0 max-w-[80ch] text-[10px] leading-relaxed text-ink-muted">
                Applied to probe runs only. Every other encode keeps Encoding&rsquo;s command line,
                so an override here cannot change the final output.
            </p>
            {entries.length === 0 ? (
                <p className="mt-2 mb-0 text-[10.5px] text-ink-muted">
                    No override. The probe runs with Encoding&rsquo;s options.
                </p>
            ) : (
                <ul className="m-0 mt-2 grid list-none gap-x-4 gap-y-2 p-0 sm:grid-cols-2 2xl:grid-cols-3">
                    {entries.map(([name, parameter]) => {
                        const canonical = canonicalOf(name, parameter);
                        const entry = Object.entries(descriptor?.parameters ?? {}).find(
                            ([key]) => optionName(key) === name,
                        );
                        return (
                            <li key={name} className="min-w-0 border-b border-line-subtle pb-2">
                                <span className="flex min-w-0 items-start gap-1">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[10.5px] font-medium text-ink">
                                            {entry?.[1].label ?? name}{" "}
                                            <span className="font-mono text-[9px] font-normal text-ink-muted">
                                                {entry?.[0] ?? canonical}
                                            </span>
                                        </span>
                                        {entry?.[1].description === null ||
                                        entry?.[1].description === undefined ||
                                        entry[1].description === "" ? null : (
                                            <span className="mt-0.5 block truncate text-[9.5px] text-ink-muted">
                                                {entry[1].description}
                                            </span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`Remove probe override ${name}`}
                                        disabled={disabled}
                                        onClick={() => {
                                            const next = { ...options };
                                            delete next[name];
                                            onChange(Object.keys(next).length === 0 ? null : next);
                                        }}
                                        className="shrink-0 rounded px-1 text-[11px] text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-danger disabled:opacity-40"
                                    >
                                        ×
                                    </button>
                                </span>
                                <span className="mt-1 block">
                                    <ParameterControl
                                        descriptor={entry?.[1]}
                                        parameter={parameter}
                                        disabled={disabled}
                                        onChange={(next) =>
                                            onChange({
                                                ...options,
                                                [name]: withOptionValue(parameter, next),
                                            })
                                        }
                                    />
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
            {available.length === 0 ? null : (
                <select
                    aria-label="Add probe encoder override"
                    value={adding}
                    disabled={disabled}
                    onChange={(event) => {
                        const canonical = event.target.value;
                        setAdding("");
                        const entry = available.find(([key]) => key === canonical);
                        if (entry === undefined) {
                            return;
                        }
                        onChange({
                            ...options,
                            [optionName(canonical)]: buildOption(
                                canonical,
                                entry[1],
                                startingValue(entry[1]),
                            ),
                        });
                    }}
                    className={`${FIELD} mt-2 max-w-[280px] font-sans`}
                >
                    <option value="">Add a probe override…</option>
                    {groups.map(([group, entriesForGroup]) => (
                        <optgroup key={group} label={group}>
                            {entriesForGroup.map(([canonical, entry]) => (
                                <option key={canonical} value={canonical}>
                                    {entry.label} ({canonical})
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            )}
        </div>
    );
}

const CURVE_WIDTH = 720;
const CURVE_HEIGHT = 180;
// Room for the rotated density title on the left, the tick row, and the sigma title beneath.
const CURVE_INSET = { left: 52, right: 16, top: 18, bottom: 44 };

/**
 * The bitrate distribution with the optimization threshold marked.
 *
 * The x-axis is standard deviations above the average scene bitrate, matching the number
 * the engine compares against. Everything to the right of the selected threshold is shaded
 * because those are the scenes that will be re-encoded.
 */
function SigmaCurve({
    value,
    onChange,
    disabled,
}: {
    value: number;
    onChange: (next: number) => void;
    disabled: boolean;
}) {
    const x = (sigma: number) =>
        CURVE_INSET.left +
        (Math.min(10, Math.max(0, sigma)) / 10) *
            (CURVE_WIDTH - CURVE_INSET.left - CURVE_INSET.right);
    const y = (density: number) =>
        CURVE_INSET.top + (1 - density) * (CURVE_HEIGHT - CURVE_INSET.top - CURVE_INSET.bottom);

    const baseline = CURVE_HEIGHT - CURVE_INSET.bottom;
    const density = (sigma: number) => Math.exp(-(sigma * sigma) / 2);
    const curve = Array.from({ length: 201 }, (_, index) => {
        const sigma = index / 20;
        // The right half of a standard normal, so the axis is directly in sigmas.
        return `${index === 0 ? "M" : "L"}${String(x(sigma))},${String(y(density(sigma)))}`;
    }).join(" ");
    // The filled area is what makes the descent read as a bell at a glance; the stroke alone
    // is a thin line against the grid and was easy to miss.
    const area = `${curve} L${String(x(10))},${String(baseline)} L${String(x(0))},${String(
        baseline,
    )} Z`;

    const pick = (event: ReactMouseEvent<SVGSVGElement>) => {
        if (disabled) {
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const local = ((event.clientX - rect.left) / rect.width) * CURVE_WIDTH;
        const sigma =
            ((local - CURVE_INSET.left) / (CURVE_WIDTH - CURVE_INSET.left - CURVE_INSET.right)) *
            10;
        onChange(Math.min(10, Math.max(1, Math.round(sigma * 10) / 10)));
    };

    return (
        <svg
            role="img"
            aria-label="Bitrate distribution by standard deviation"
            viewBox={`0 0 ${String(CURVE_WIDTH)} ${String(CURVE_HEIGHT)}`}
            onClick={pick}
            className="w-full cursor-pointer rounded-md border border-line bg-app"
        >
            <rect
                x={x(value)}
                y={CURVE_INSET.top}
                width={x(10) - x(value)}
                height={baseline - CURVE_INSET.top}
                fill="var(--state-warning)"
                opacity={0.14}
            />
            {/* Grid: every even sigma up, and four bands down, so a point can be read
                against both axes instead of only the horizontal one. */}
            {[0, 2, 4, 6, 8, 10].map((tick) => (
                <g key={`gx-${String(tick)}`}>
                    <line
                        x1={x(tick)}
                        x2={x(tick)}
                        y1={CURVE_INSET.top}
                        y2={baseline}
                        stroke="var(--border-default)"
                    />
                    <text
                        x={x(tick)}
                        y={baseline + 12}
                        textAnchor="middle"
                        className="fill-ink-muted font-mono text-[8px]"
                    >
                        {tick === 0 ? "avg" : `σ${String(tick)}`}
                    </text>
                </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                <g key={`gy-${String(fraction)}`}>
                    <line
                        x1={CURVE_INSET.left}
                        x2={CURVE_WIDTH - CURVE_INSET.right}
                        y1={y(fraction)}
                        y2={y(fraction)}
                        stroke="var(--border-default)"
                    />
                    <text
                        x={CURVE_INSET.left - 6}
                        y={y(fraction) + 3}
                        textAnchor="end"
                        className="fill-ink-muted font-mono text-[8px]"
                    >
                        {String(fraction)}
                    </text>
                </g>
            ))}
            <line
                x1={CURVE_INSET.left}
                x2={CURVE_INSET.left}
                y1={CURVE_INSET.top}
                y2={baseline}
                stroke="var(--border-strong)"
            />
            <line
                x1={CURVE_INSET.left}
                x2={CURVE_WIDTH - CURVE_INSET.right}
                y1={baseline}
                y2={baseline}
                stroke="var(--border-strong)"
            />
            <path d={area} fill="var(--brand-default)" opacity={0.1} />
            <path
                d={curve}
                fill="none"
                stroke="var(--brand-default)"
                strokeWidth={2}
                strokeLinecap="round"
            />
            <line
                x1={x(value)}
                x2={x(value)}
                y1={CURVE_INSET.top}
                y2={baseline}
                stroke="var(--state-warning)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
            />
            <circle cx={x(value)} cy={y(density(value))} r={4} fill="var(--state-warning)" />
            <text
                x={x(value)}
                y={CURVE_INSET.top - 5}
                textAnchor="middle"
                className="fill-warning font-mono text-[9px]"
            >
                σ {value}
            </text>
            {/* The y title is vertical, as a density axis is normally written. */}
            <text
                transform={`translate(14 ${String((CURVE_INSET.top + baseline) / 2)}) rotate(-90)`}
                textAnchor="middle"
                className="fill-ink-secondary text-[9px]"
            >
                Share of scenes
            </text>
            <text
                x={(CURVE_INSET.left + CURVE_WIDTH - CURVE_INSET.right) / 2}
                y={CURVE_HEIGHT - 8}
                textAnchor="middle"
                className="fill-ink-secondary text-[9px]"
            >
                Standard deviations above the average scene bitrate
            </text>
        </svg>
    );
}

/**
 * Target quality in the order the engine runs it.
 *
 * The metric chooses its own scale, so its target range sits in the metric row and switching
 * metric rewrites that range. Bitrate optimization consumes the quantizer and bitrate the
 * probe produced, so it follows on the same screen; its threshold is the engine's `Option`,
 * and an unset threshold is how the engine skips the stage.
 *
 * Speed scaling follows because it consumes the probe's quantizer, and bitrate optimization
 * follows that because it consumes the encoded scene's rate.
 */
export function TargetQualityEditor({
    parts,
    draft,
    setDraft,
    locked,
    scope,
    encoderDocument,
    encoders,
    onEditScript,
    onEditMetricScript,
}: {
    parts: {
        target: { root: JsonSchema; node: JsonSchema };
        bitrate: { root: JsonSchema; node: JsonSchema };
    };
    draft: Draft;
    setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    locked: boolean;
    scope: DocumentScope;
    /** The saved encoder document, whose quantizer scale the probe searches. */
    encoderDocument: Record<string, unknown> | null;
    /** The catalogue, so the probe's bounds come from the selected encoder's descriptor. */
    encoders?: EncoderDescriptor[] | undefined;
    /** Opens the script page for the probe input. */
    onEditScript?: (() => void) | undefined;
    /** Opens the script page for the metric comparison input. */
    onEditMetricScript?: (() => void) | undefined;
}) {
    const encoderVariant = Object.keys(asRecord(encoderDocument?.encoder))[0] ?? null;
    const encoderDescriptor = descriptorForVariant(encoders, encoderVariant);
    const bounds = quantizerBounds(encoderDescriptor) ?? { key: "--crf", min: 0, max: 63 };
    const target = asRecord(draft.target_quality);
    // An earlier build wrote `{}` when an optional sequence was enabled from the schema. It has
    // no settings to run, so the screen reads it as off rather than showing fabricated defaults
    // as though they had been saved.
    const enabled = Object.keys(target).length > 0;
    const incomplete =
        !enabled && draft.target_quality !== null && draft.target_quality !== undefined;
    const bitrate = asRecord(draft.bitrate_optimizer);
    const speedScaler = asRecord(draft.speed_scaler);
    const threshold =
        typeof bitrate.bitrate_sigma_threshold === "number"
            ? bitrate.bitrate_sigma_threshold
            : null;

    const setTarget = (next: unknown) =>
        setDraft((previous) =>
            previous === null ? previous : { ...previous, target_quality: next },
        );
    const setBitrate = (next: unknown) =>
        setDraft((previous) =>
            previous === null ? previous : { ...previous, bitrate_optimizer: next },
        );
    const setSpeedScaler = (speed_quantizers: Array<{ speed: number; quantizer: number }> | null) =>
        setDraft((previous) =>
            previous === null
                ? previous
                : {
                      ...previous,
                      speed_scaler: {
                          speed_quantizers:
                              speed_quantizers === null
                                  ? []
                                  : speed_quantizers.map((point) => [point.speed, point.quantizer]),
                      },
                  },
        );

    const patchTarget = (patch: Draft) => setTarget({ ...TARGET_START, ...target, ...patch });
    const enableTarget = () =>
        setTarget({
            ...TARGET_START,
            quantizer_range: [bounds.min, bounds.max],
        });
    const probing = asRecord(target.probing);
    const metricInput = target.metric_input ?? null;

    const interpolators = Array.isArray(target.interpolators)
        ? (target.interpolators as unknown[])
        : ["FritschCarlson", "Pchip"];

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                        <h2 className="m-0 flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
                            1 · Target quality
                            <span className="rounded-full border border-line-strong px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-ink-muted uppercase">
                                Optional
                            </span>
                        </h2>
                    </div>
                    <Switch
                        label="Target quality"
                        checked={enabled}
                        disabled={locked}
                        onChange={(next) => {
                            if (next) {
                                enableTarget();
                            } else {
                                setTarget(null);
                            }
                        }}
                    />
                </div>

                {enabled ? (
                    <div className="space-y-5 px-4 py-4 sm:px-5">
                        <MetricField
                            value={target.metric}
                            onChange={(metric) => patchTarget({ metric })}
                            root={parts.target.root}
                            node={parts.target.node}
                            disabled={locked}
                            trailing={
                                <label className="block">
                                    <span className="block text-[10.5px] font-medium text-ink-secondary">
                                        Maximum probes
                                    </span>
                                    <input
                                        aria-label="Maximum probes"
                                        type="number"
                                        min={1}
                                        max={255}
                                        value={
                                            typeof target.maximum_probes === "number"
                                                ? target.maximum_probes
                                                : 4
                                        }
                                        disabled={locked}
                                        onChange={(event) =>
                                            patchTarget({
                                                maximum_probes: Math.max(
                                                    1,
                                                    Math.trunc(Number(event.target.value) || 1),
                                                ),
                                            })
                                        }
                                        className={`${FIELD} mt-1 max-w-[120px]`}
                                    />
                                </label>
                            }
                        />

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="min-w-0">
                                <span className="block text-[10.5px] font-medium text-ink-secondary">
                                    Quantizer range
                                </span>
                                <div className="mt-1 flex items-center gap-1.5">
                                    <NumberField
                                        label="Quantizer range minimum"
                                        value={numberAt(target.quantizer_range, 0, bounds.min)}
                                        min={bounds.min}
                                        max={bounds.max}
                                        step={1}
                                        integer
                                        disabled={locked}
                                        onChange={(next) => {
                                            const current = [
                                                numberAt(target.quantizer_range, 0, bounds.min),
                                                numberAt(target.quantizer_range, 1, bounds.max),
                                            ];
                                            current[0] = next;
                                            patchTarget({ quantizer_range: current });
                                        }}
                                        className="w-[116px]"
                                    />
                                    <span className="text-[10.5px] text-ink-muted">to</span>
                                    <NumberField
                                        label="Quantizer range maximum"
                                        value={numberAt(target.quantizer_range, 1, bounds.max)}
                                        min={bounds.min}
                                        max={bounds.max}
                                        step={1}
                                        integer
                                        disabled={locked}
                                        onChange={(next) => {
                                            const current = [
                                                numberAt(target.quantizer_range, 0, bounds.min),
                                                numberAt(target.quantizer_range, 1, bounds.max),
                                            ];
                                            current[1] = next;
                                            patchTarget({ quantizer_range: current });
                                        }}
                                        className="w-[116px]"
                                    />
                                </div>
                            </div>

                            {[0, 1].map((index) => (
                                <label key={index} className="block min-w-0">
                                    <span className="block text-[10.5px] font-medium text-ink-secondary">
                                        {index === 0
                                            ? "First interpolation"
                                            : "Second interpolation"}
                                    </span>
                                    <select
                                        aria-label={
                                            index === 0
                                                ? "First interpolation method"
                                                : "Second interpolation method"
                                        }
                                        value={
                                            typeof interpolators[index] === "string"
                                                ? String(interpolators[index])
                                                : ""
                                        }
                                        disabled={locked}
                                        onChange={(event) => {
                                            const next = Array.isArray(target.interpolators)
                                                ? [...(target.interpolators as unknown[])]
                                                : ["FritschCarlson", "Pchip"];
                                            next[index] = event.target.value;
                                            patchTarget({ interpolators: next });
                                        }}
                                        className={`${FIELD} mt-1 font-sans`}
                                    >
                                        {INTERPOLATORS.map((method) => (
                                            <option key={method.id} value={method.id}>
                                                {method.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>
                        <p className="m-0 max-w-[80ch] text-[10px] leading-relaxed text-ink-muted">
                            The lower bound must stay below the upper one, and both interpolators
                            are used in that order. The range is where the probe searches
                            {encoderDescriptor === undefined
                                ? ""
                                : ` for ${encoderDescriptor.label} (${bounds.min}–${bounds.max} on ${bounds.key})`}
                            ; the metric&rsquo;s target range decides which score is accepted.
                        </p>

                        <ProbeFields
                            strategy={probing.strategy}
                            statistic={probing.statistic}
                            onStrategy={(strategy) =>
                                patchTarget({ probing: { ...probing, strategy } })
                            }
                            onStatistic={(statistic) =>
                                patchTarget({ probing: { ...probing, statistic } })
                            }
                            disabled={locked}
                        />

                        <ProbeOptions
                            value={probing.encoder_options ?? null}
                            onChange={(encoder_options) =>
                                patchTarget({ probing: { ...probing, encoder_options } })
                            }
                            descriptor={encoderDescriptor}
                            disabled={locked}
                        />

                        <div className="border-t border-line-subtle pt-4">
                            <InputOverrideEditor
                                scope={scope}
                                value={target.input ?? null}
                                onChange={(input) => patchTarget({ input })}
                                disabled={locked}
                                idPrefix="target-quality-input"
                                onEditScript={onEditScript}
                            />
                            <p className="mt-1 mb-0 max-w-[80ch] text-[10px] leading-relaxed text-ink-muted">
                                Denoising the input graph in VapourSynth gives more reliable scores.
                                The metric compares against the frames this input produces.
                            </p>
                        </div>

                        <label className="flex cursor-pointer items-start gap-2.5 border-t border-line-subtle pt-4">
                            <input
                                type="checkbox"
                                checked={metricInput !== null}
                                disabled={locked}
                                onChange={(event) =>
                                    patchTarget({
                                        metric_input: event.target.checked
                                            ? inputFromValue(emptyInputValue("ffms2"), null)
                                            : null,
                                    })
                                }
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand-default)]"
                            />
                            <span className="min-w-0">
                                <span className="text-[11.5px] font-medium text-ink">
                                    Score against a different input
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-muted">
                                    Off by default. Only the metric reads this graph; the encoder
                                    still reads the input above.
                                </span>
                            </span>
                        </label>
                        {metricInput === null ? null : (
                            <div className="pl-6">
                                <InputOverrideEditor
                                    scope={scope}
                                    value={metricInput}
                                    onChange={(next) => patchTarget({ metric_input: next })}
                                    disabled={locked}
                                    idPrefix="target-quality-metric-input"
                                    showHeading={false}
                                    onEditScript={onEditMetricScript}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="m-0 px-4 py-5 text-[11.5px] text-ink-muted sm:px-5">
                        {incomplete
                            ? "This sequence was saved without any settings. Turn it on to write a complete document; Save is still required."
                            : "Target quality is off. Every scene is encoded with the fixed quantizer Encoding sets."}
                    </p>
                )}
            </section>

            <SpeedScalingCard
                value={speedScaler.speed_quantizers}
                disabled={locked}
                maxQuantizer={bounds.max}
                onChange={setSpeedScaler}
            />

            <section className="rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                        <h2 className="m-0 flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
                            3 · Bitrate optimization
                            <span className="rounded-full border border-line-strong px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-ink-muted uppercase">
                                Requires Encoding
                            </span>
                        </h2>
                    </div>
                    <Switch
                        label="Bitrate optimization"
                        checked={threshold !== null}
                        disabled={locked}
                        onChange={(next) =>
                            setBitrate({ ...bitrate, bitrate_sigma_threshold: next ? 2 : null })
                        }
                    />
                </div>

                {threshold === null ? (
                    <p className="m-0 px-4 py-5 text-[11.5px] text-ink-muted sm:px-5">
                        Off. Every scene keeps the quantizer the probe chose.
                    </p>
                ) : (
                    <div className="space-y-3 px-4 py-4 sm:px-5">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="block max-w-[160px]">
                                <span className="block text-[10.5px] font-medium text-ink-secondary">
                                    Sigma threshold
                                </span>
                                <NumberField
                                    label="Bitrate sigma threshold"
                                    value={threshold}
                                    min={1}
                                    max={10}
                                    step={0.1}
                                    onChange={(next) =>
                                        setBitrate({
                                            ...bitrate,
                                            bitrate_sigma_threshold: Math.min(
                                                10,
                                                Math.max(1, next),
                                            ),
                                        })
                                    }
                                    className="mt-1"
                                />
                            </label>
                            <p className="m-0 max-w-[64ch] pb-1 text-[10px] leading-relaxed text-ink-muted">
                                Scenes whose bitrate is at least this many standard deviations above
                                the average are re-encoded. Click the curve or type a value; 1–10,
                                with 2 as the engine&rsquo;s default.
                            </p>
                        </div>
                        <SigmaCurve
                            value={threshold}
                            disabled={locked}
                            onChange={(next) =>
                                setBitrate({ ...bitrate, bitrate_sigma_threshold: next })
                            }
                        />
                    </div>
                )}
            </section>
        </div>
    );
}
