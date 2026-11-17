import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { SceneView } from "@av1ation/contracts";
import {
    Combine,
    Info,
    Plus,
    RotateCcw,
    Scissors,
    Trash2,
    TriangleAlert,
    Undo2,
    X,
} from "lucide-react";

import { sceneLength } from "../../shared/duration";
import { formatBytes, formatTimecode } from "../../shared/format";
import { sceneSelectionSummary, type NumericSummary } from "./scene-aggregate";
import { Button } from "../../shared/Button";

function quantizerValue(summary: NumericSummary | null): string {
    if (summary === null) {
        return "—";
    }
    const min = Math.round(summary.min);
    const max = Math.round(summary.max);
    return min === max ? `Q${String(min)}` : `Q${String(min)}–Q${String(max)}`;
}

function scoreValue(summary: NumericSummary | null): string {
    if (summary === null) {
        return "—";
    }
    return summary.min === summary.max
        ? summary.min.toFixed(1)
        : `${summary.min.toFixed(1)}–${summary.max.toFixed(1)}`;
}

function noiseValue(summary: NumericSummary | null): string {
    if (summary === null) {
        return "—";
    }
    return summary.min === summary.max
        ? summary.min.toFixed(2)
        : `${summary.min.toFixed(2)}–${summary.max.toFixed(2)}`;
}

function scaleValue(summary: NumericSummary | null): string {
    if (summary === null) {
        return "—";
    }
    return summary.min === summary.max
        ? `×${summary.min.toFixed(2)}`
        : `×${summary.min.toFixed(2)}–×${summary.max.toFixed(2)}`;
}

/** One read-only engine fact: its source, the value, and why the value is absent. */
function EngineFact({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2 border-t border-line-subtle py-1 first:border-t-0 first:pt-0">
            <span className="shrink-0 text-[9px] tracking-[0.06em] text-ink-muted uppercase">
                {label}
            </span>
            <span className="min-w-0 text-right font-mono text-[9.5px] leading-relaxed text-ink-secondary">
                {value}
                <span className="mt-0.5 block text-[9px] leading-relaxed text-ink-muted">
                    {detail}
                </span>
            </span>
        </div>
    );
}

/**
 * The kind a pair stores. The three buttons choose one; `json` only appears for a pair an
 * older build stored as an array or object, which the typed rows cannot express.
 */
type CustomKind = "string" | "number" | "boolean" | "json";

type CustomPair = {
    key: string;
    kind: CustomKind;
    text: string;
    flag: boolean;
};

/**
 * The engine fields a custom pair must not shadow.
 *
 * Mirrors the service so a collision is reported beside the row instead of after a round
 * trip. The service still owns the rule; this only spares the user the wait.
 */
const RESERVED_CUSTOM_KEYS = new Set([
    "scene_detection",
    "noise_detection",
    "noise_scaling",
    "target_quality",
    "parallel_encoder",
    "quality_check",
]);

const MAX_CUSTOM_PAIRS = 64;

/** Rows are typed: a string keeps its text verbatim, a number is the text read as one, and a
 * boolean is the switch. Nothing is parsed by guessing, so `true` stays a word and `1` is
 * a number because the button said so. */
function customPairs(values: Readonly<Record<string, unknown>>): CustomPair[] {
    return Object.entries(values).map(([key, value]) => {
        if (typeof value === "boolean") {
            return { key, kind: "boolean", text: "", flag: value };
        }
        if (typeof value === "string") {
            return { key, kind: "string", text: value, flag: false };
        }
        if (typeof value === "number") {
            return { key, kind: "number", text: String(value), flag: false };
        }
        // Arrays and objects predate the typed rows. They stay editable as JSON so saving
        // another pair does not silently drop a value this editor cannot represent.
        return {
            key,
            kind: "json",
            text: JSON.stringify(value) ?? "",
            flag: false,
        };
    });
}

function customValues(
    pairs: readonly CustomPair[],
): { values: Record<string, unknown> } | { error: string } {
    const values: Record<string, unknown> = {};
    for (const pair of pairs) {
        const key = pair.key.trim();
        if (key === "") {
            continue;
        }
        if (key.length > 64 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            return {
                error: `“${key}” is not a Python name; use letters, digits and underscores.`,
            };
        }
        if (RESERVED_CUSTOM_KEYS.has(key)) {
            return {
                error: `“${key}” is written by the engine; choose another key.`,
            };
        }
        if (Object.hasOwn(values, key)) {
            return { error: `“${key}” appears twice.` };
        }
        if (pair.kind === "boolean") {
            values[key] = pair.flag;
            continue;
        }
        if (pair.kind === "string") {
            values[key] = pair.text;
            continue;
        }
        if (pair.kind === "number") {
            const text = pair.text.trim();
            const number = Number(text);
            if (text === "" || !Number.isFinite(number)) {
                return {
                    error: `“${key}” needs a number, for example 0.5 or 24.`,
                };
            }
            values[key] = number;
            continue;
        }
        try {
            values[key] = JSON.parse(pair.text);
        } catch {
            return {
                error: `“${key}” needs valid JSON, for example 0.5, true, "text", or [1, 2].`,
            };
        }
    }
    if (Object.keys(values).length > MAX_CUSTOM_PAIRS) {
        return {
            error: `At most ${String(MAX_CUSTOM_PAIRS)} pairs fit on one scene.`,
        };
    }
    return { values };
}

/**
 * One icon in the panel's action bar.
 *
 * The bar is icon-only so five actions fit a 320 px column. Each one keeps its sentence in
 * `aria-label` and in the tooltip, which is the only place the action is spelled out.
 */
function SceneAction({
    label,
    tip,
    disabled,
    danger = false,
    alignEnd = false,
    onClick,
    children,
}: {
    label: string;
    tip: string;
    disabled: boolean;
    danger?: boolean;
    alignEnd?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            data-tip={tip}
            data-tip-placement="up"
            data-tip-align={alignEnd ? "end" : undefined}
            disabled={disabled}
            onClick={onClick}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary transition-colors duration-150 enabled:hover:bg-raised disabled:opacity-35 ${
                danger ? "enabled:hover:text-danger" : "enabled:hover:text-ink"
            }`}
        >
            {children}
        </button>
    );
}

/**
 * The user's own key/value pairs, merged into the scene table a script receives.
 *
 * The whole map is saved from one edit, because the service stores it as a unit. A blur
 * with an invalid pair keeps the draft visible and refuses the request: dropping the row
 * would silently lose what the user typed, and sending it would be refused anyway.
 */
function CustomDataEditor({
    values,
    disabled,
    onCommit,
}: {
    values: Readonly<Record<string, unknown>>;
    disabled: boolean;
    onCommit: (values: Record<string, unknown>) => void;
}) {
    const stored = JSON.stringify(values);
    const [pairs, setPairs] = useState<CustomPair[]>(() => customPairs(values));
    const [error, setError] = useState<string | null>(null);

    // Only a stored map that actually changed may replace the draft; an unchanged refetch
    // must not wipe a row the user is halfway through typing.
    useEffect(() => {
        setPairs(customPairs(JSON.parse(stored) as Record<string, unknown>));
        setError(null);
    }, [stored]);

    const commit = (next: CustomPair[]) => {
        const result = customValues(next);
        setPairs(next);
        if ("error" in result) {
            setError(result.error);
            return;
        }
        setError(null);
        if (JSON.stringify(result.values) !== stored) {
            onCommit(result.values);
        }
    };

    const edit = (at: number, change: Partial<CustomPair>) => {
        setPairs((current) =>
            current.map((pair, index) => (index === at ? { ...pair, ...change } : pair)),
        );
    };

    return (
        <div className="mt-1.5">
            <p className="m-0 text-[9px] leading-relaxed text-ink-muted">
                Read in a script as{" "}
                <span className="font-mono text-ink-secondary">
                    condor_data.scenes[i].sequence_data.&lt;key&gt;
                </span>
                . Each pair keeps the type you add it as.
            </p>
            <div className="mt-1.5 flex flex-col gap-1">
                {pairs.map((pair, at) => (
                    <div
                        key={at}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1"
                    >
                        <input
                            type="text"
                            aria-label={`Custom key ${String(at + 1)}`}
                            value={pair.key}
                            disabled={disabled}
                            maxLength={64}
                            placeholder="key"
                            onChange={(event) => edit(at, { key: event.target.value })}
                            onBlur={() => commit(pairs)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                }
                                if (event.key === "Escape") {
                                    setPairs(
                                        customPairs(JSON.parse(stored) as Record<string, unknown>),
                                    );
                                    setError(null);
                                    event.currentTarget.blur();
                                }
                            }}
                            className="h-6 min-w-0 rounded border border-line bg-sunken px-1.5 font-mono text-[10px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50"
                        />
                        {pair.kind === "boolean" ? (
                            <span className="flex min-w-0 items-center gap-1.5">
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={pair.flag}
                                    aria-label={`Custom value ${String(at + 1)}`}
                                    disabled={disabled}
                                    onClick={() =>
                                        commit(
                                            pairs.map((current, index) =>
                                                index === at
                                                    ? {
                                                          ...current,
                                                          flag: !current.flag,
                                                      }
                                                    : current,
                                            ),
                                        )
                                    }
                                    className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 transition-colors duration-150 disabled:opacity-50 ${
                                        pair.flag
                                            ? "justify-end border-brand bg-brand/30"
                                            : "justify-start border-line bg-sunken"
                                    }`}
                                >
                                    <span className="h-2.5 w-2.5 rounded-full bg-ink" />
                                </button>
                                <span className="font-mono text-[9px] text-ink-muted">
                                    {pair.flag ? "true" : "false"}
                                </span>
                            </span>
                        ) : (
                            <input
                                type="text"
                                aria-label={`Custom value ${String(at + 1)}`}
                                value={pair.text}
                                disabled={disabled}
                                placeholder={
                                    pair.kind === "string"
                                        ? "text"
                                        : pair.kind === "number"
                                          ? "0.5"
                                          : "JSON"
                                }
                                onChange={(event) => edit(at, { text: event.target.value })}
                                onBlur={() => commit(pairs)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.currentTarget.blur();
                                    }
                                    if (event.key === "Escape") {
                                        setPairs(
                                            customPairs(
                                                JSON.parse(stored) as Record<string, unknown>,
                                            ),
                                        );
                                        setError(null);
                                        event.currentTarget.blur();
                                    }
                                }}
                                className="h-6 min-w-0 rounded border border-line bg-sunken px-1.5 font-mono text-[10px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50"
                            />
                        )}
                        <button
                            type="button"
                            aria-label={`Remove custom pair ${pair.key === "" ? String(at + 1) : pair.key}`}
                            data-tip="Remove this pair"
                            data-tip-align="end"
                            disabled={disabled}
                            onClick={() => commit(pairs.filter((_, index) => index !== at))}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors duration-150 enabled:hover:text-danger disabled:opacity-35"
                        >
                            <X aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                        </button>
                    </div>
                ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
                {(
                    [
                        ["string", "String"],
                        ["number", "Number"],
                        ["boolean", "Boolean"],
                    ] as const
                ).map(([kind, label]) => (
                    <button
                        key={kind}
                        type="button"
                        disabled={disabled || pairs.length >= MAX_CUSTOM_PAIRS}
                        onClick={() =>
                            setPairs([...pairs, { key: "", kind, text: "", flag: false }])
                        }
                        className="inline-flex h-6 items-center gap-1 rounded border border-dashed border-line-strong px-1.5 text-[9.5px] text-ink-secondary transition-colors duration-150 enabled:hover:text-ink disabled:opacity-50"
                    >
                        <Plus aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                        Add {label}
                    </button>
                ))}
            </div>
            {error === null ? null : (
                <p role="alert" className="m-0 mt-1 text-[9.5px] leading-relaxed text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}

/**
 * One editable scene boundary.
 *
 * The request is sent on blur or Enter, not on every keystroke: a half-typed number would
 * otherwise be written as a range and invalidate the scene's measurements. The field
 * restores the stored value when the text is not a usable frame number, so a rejected edit
 * leaves the table unchanged.
 */
function RangeField({
    label,
    value,
    detail,
    disabled,
    onCommit,
}: {
    label: string;
    value: number;
    detail: string;
    disabled: boolean;
    onCommit: (next: number) => void;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => {
        setText(String(value));
    }, [value]);

    const commit = () => {
        const parsed = Number(text);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
            setText(String(value));
            return;
        }
        // The field shows what the service confirms, never the text of a request that may
        // still be refused: a rejected edit used to leave a number here that no scene had.
        setText(String(value));
        if (parsed !== value) {
            onCommit(parsed);
        }
    };

    return (
        <div className="min-w-0">
            <p className="m-0 text-[9px] tracking-[0.08em] text-ink-muted uppercase">{label}</p>
            <input
                type="text"
                inputMode="numeric"
                aria-label={label}
                value={text}
                disabled={disabled}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    // Enter blurs and lets the blur handler commit, so one edit is one
                    // request: committing here as well sent a second PATCH for the same
                    // boundary before the first had answered.
                    if (event.key === "Enter") {
                        event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                        setText(String(value));
                        event.currentTarget.blur();
                    }
                }}
                className="mt-1 h-7 w-full min-w-0 rounded-md border border-line bg-sunken px-2.5 font-mono text-[11px] text-ink tabular-nums focus:border-brand focus:outline-none disabled:opacity-50"
            />
            <p className="m-0 mt-1 truncate font-mono text-[9px] text-ink-muted tabular-nums">
                {detail}
            </p>
        </div>
    );
}

function RangeBox({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="min-w-0">
            <p className="m-0 text-[9px] tracking-[0.08em] text-ink-muted uppercase">{label}</p>
            <p className="m-0 mt-1 truncate rounded-md border border-line bg-sunken px-2.5 py-1.5 font-mono text-[11px] text-ink tabular-nums">
                {value}
            </p>
            <p className="m-0 mt-1 truncate font-mono text-[9px] text-ink-muted tabular-nums">
                {detail}
            </p>
        </div>
    );
}

/**
 * The selection's details, laid out as the board's vertical scene panel.
 *
 * A 320 px column cannot carry a six-across field grid without truncating every label to
 * two letters. The board stacks one field group per row instead: range, encoder, then the
 * engine data the scene produced. A multiple selection uses the same groups with ranges and
 * counts, and only the encoder carries a `mixed` badge.
 */
export function SceneDetailsPanel({
    scenes,
    total,
    frameRate,
    playhead,
    warnings,
    locked,
    busy = false,
    onEditEncoder,
    onSplit,
    onMerge,
    onDelete,
    onReset,
    onSetRange,
    customData,
    onCustomData,
    canUndo,
    onUndo,
    className = "",
    style,
}: {
    scenes: readonly SceneView[];
    total: number;
    frameRate: number | null;
    playhead: number | null;
    warnings: number;
    /** True while an encode holds the configuration lock. */
    locked: boolean;
    /** True while a scene edit is still being written. */
    busy?: boolean;
    onEditEncoder: () => void;
    onSplit: () => void;
    onMerge: () => void;
    onDelete: () => void;
    onReset: () => void;
    /** Replaces one scene's boundaries; the service never moves a neighbour. */
    onSetRange: (startFrame: number, endFrame: number) => void;
    /** The single selected scene's custom pairs; empty for a multiple selection. */
    customData: Readonly<Record<string, unknown>>;
    onCustomData: (values: Record<string, unknown>) => void;
    canUndo: boolean;
    onUndo: () => void;
    className?: string | undefined;
    style?: CSSProperties | undefined;
}) {
    const summary = sceneSelectionSummary(scenes, frameRate);
    const single = scenes.length === 1 ? scenes[0] : undefined;
    const first = scenes[0];
    const last = scenes[scenes.length - 1];
    const rangeDetail =
        summary.durationSeconds === null
            ? "Rate unknown"
            : `${summary.frames.toLocaleString()} frames · ${sceneLength(summary.durationSeconds)}`;
    const encoderDetail =
        summary.encoder.customCount === 0
            ? "Inherited from the video"
            : summary.encoder.customCount === summary.count
              ? summary.count === 1
                  ? "Custom for this scene"
                  : `Custom for all ${String(summary.count)} scenes`
              : `${String(summary.encoder.customCount)} of ${String(summary.count)} custom`;
    const engineDetail =
        summary.encodedCount === 0
            ? "No retained chunks yet."
            : summary.encodedCount === summary.count
              ? "All selected scenes have a retained chunk."
              : `${String(summary.encodedCount)} of ${String(summary.count)} selected scenes have a retained chunk.`;
    const probeDetail =
        summary.score === null
            ? "Target Quality has not scored this selection yet."
            : summary.score.count === summary.count
              ? `Mean score ${scoreValue(summary.score)}`
              : `Mean score ${scoreValue(summary.score)} over ${String(summary.score.count)} of ${String(summary.count)} scenes`;
    const checkDetail =
        summary.qualityScore === null
            ? "Quality check has not run."
            : summary.qualityScore.count === summary.count
              ? "Mean score"
              : `Over ${String(summary.qualityScore.count)} of ${String(summary.count)} scenes`;
    const noiseDetail =
        summary.noise === null
            ? "Noise Detector has not run."
            : summary.noiseScaler === null
              ? "No scale applied"
              : `Scale ${scaleValue(summary.noiseScaler)}`;

    return (
        <section
            aria-labelledby="scene-details-heading"
            style={style}
            className={`flex min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}
        >
            <div className="shrink-0 border-b border-line-subtle px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                    <h2
                        id="scene-details-heading"
                        className="m-0 text-[15px] font-semibold text-ink"
                    >
                        {scenes.length === 0
                            ? "Details"
                            : single === undefined
                              ? `${String(summary.count)} scenes`
                              : `Scene ${String(single.index + 1).padStart(2, "0")}`}
                    </h2>
                    <span className="shrink-0 font-mono text-[9.5px] text-ink-muted tabular-nums">
                        {scenes.length === 0
                            ? ""
                            : /* "01 of 5" beside "Scene 02" read as a scene number; the count
                                 is the selection's. */
                              `${String(scenes.length)} of ${total.toLocaleString()} selected`}
                    </span>
                </div>
                {scenes.length === 0 ? null : (
                    <>
                        <p className="m-0 mt-1 truncate font-mono text-[10px] text-ink-secondary tabular-nums">
                            {first === undefined || last === undefined
                                ? ""
                                : `frames ${first.start_frame.toLocaleString()} – ${Math.max(
                                      first.start_frame,
                                      last.end_frame - 1,
                                  ).toLocaleString()}`}
                        </p>
                        <p className="m-0 mt-0.5 truncate font-mono text-[9px] text-ink-muted tabular-nums">
                            {first === undefined || last === undefined
                                ? ""
                                : `${formatTimecode(first.start_frame, frameRate)} – ${formatTimecode(
                                      Math.max(first.start_frame, last.end_frame - 1),
                                      frameRate,
                                  )}`}
                        </p>
                    </>
                )}
            </div>

            {scenes.length === 0 ? (
                <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto px-4 py-4">
                    <p className="m-0 text-[12px] font-medium text-ink-secondary">
                        No scene selected
                    </p>
                    <p className="m-0 mt-1 text-[11px] leading-relaxed text-ink-muted">
                        Choose a block on the timeline or a row in the scene rail to see its range,
                        encoder, and what the engine produced.
                    </p>
                </div>
            ) : (
                <>
                    <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <p className="m-0 text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                Range
                            </p>
                            {warnings > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[9.5px] text-warning">
                                    <TriangleAlert
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                        strokeWidth={1.8}
                                    />
                                    {warnings === 1
                                        ? "1 invalid boundary"
                                        : `${String(warnings)} invalid boundaries`}
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                            {single === undefined ? (
                                <>
                                    <RangeBox
                                        label="Start frame"
                                        value={
                                            first === undefined
                                                ? "—"
                                                : first.start_frame.toLocaleString()
                                        }
                                        detail={
                                            first === undefined
                                                ? "—"
                                                : formatTimecode(first.start_frame, frameRate)
                                        }
                                    />
                                    <RangeBox
                                        label="End frame"
                                        value={
                                            last === undefined
                                                ? "—"
                                                : Math.max(
                                                      last.start_frame,
                                                      last.end_frame - 1,
                                                  ).toLocaleString()
                                        }
                                        detail={
                                            last === undefined
                                                ? "—"
                                                : formatTimecode(
                                                      Math.max(
                                                          last.start_frame,
                                                          last.end_frame - 1,
                                                      ),
                                                      frameRate,
                                                  )
                                        }
                                    />
                                </>
                            ) : (
                                <>
                                    <RangeField
                                        label="Start frame"
                                        value={single.start_frame}
                                        detail={formatTimecode(single.start_frame, frameRate)}
                                        disabled={locked || busy}
                                        onCommit={(next) => {
                                            onSetRange(next, single.end_frame);
                                        }}
                                    />
                                    <RangeField
                                        label="End frame"
                                        value={Math.max(single.start_frame, single.end_frame - 1)}
                                        detail={formatTimecode(
                                            Math.max(single.start_frame, single.end_frame - 1),
                                            frameRate,
                                        )}
                                        disabled={locked || busy}
                                        onCommit={(next) => {
                                            onSetRange(single.start_frame, next + 1);
                                        }}
                                    />
                                </>
                            )}
                        </div>
                        <p className="m-0 mt-1.5 text-[9.5px] text-ink-muted">{rangeDetail}</p>
                        {single === undefined ? null : (
                            <p className="m-0 mt-0.5 text-[9.5px] text-ink-muted">
                                Editing a boundary never moves its neighbour; a gap or overlap is
                                flagged below.
                            </p>
                        )}

                        <div className="my-3 border-t border-line-subtle" />

                        <p className="m-0 text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                            Encoder
                        </p>
                        <div className="mt-1.5 flex items-center gap-1 rounded-md border border-line bg-sunken py-1 pr-1 pl-2.5">
                            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink">
                                {summary.encoder.label}
                            </span>
                            {summary.encoder.mixed ? (
                                <span className="shrink-0 rounded-full border border-line-strong bg-raised px-1.5 py-px text-[8px] tracking-[0.06em] text-ink-secondary uppercase">
                                    mixed
                                </span>
                            ) : null}
                            <Button
                                variant="secondary"
                                className="h-6 shrink-0 px-2 text-[9.5px]"
                                disabled={locked || busy}
                                onClick={onEditEncoder}
                                data-tip={
                                    locked
                                        ? "An encode is running; its configuration cannot change."
                                        : busy
                                          ? "The last scene edit is still being written."
                                          : "Open the same parameter editor as Configuration"
                                }
                            >
                                Change
                            </Button>
                        </div>
                        <p className="m-0 mt-1 text-[9.5px] leading-relaxed text-ink-muted">
                            {encoderDetail}.
                        </p>

                        <div className="my-3 border-t border-line-subtle" />

                        <div className="flex items-baseline justify-between gap-2">
                            <p className="m-0 text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                Engine data
                            </p>
                            <span className="shrink-0 text-[9px] text-ink-muted">Read-only</span>
                        </div>
                        <div className="mt-1.5">
                            <EngineFact
                                label="Target quality"
                                value={quantizerValue(summary.quantizer)}
                                detail={probeDetail}
                            />
                            <EngineFact
                                label="Quality check"
                                value={scoreValue(summary.qualityScore)}
                                detail={checkDetail}
                            />
                            <EngineFact
                                label="Noise"
                                value={noiseValue(summary.noise)}
                                detail={noiseDetail}
                            />
                            <EngineFact
                                label="Chunk"
                                value={
                                    summary.encodedCount === 0
                                        ? "—"
                                        : formatBytes(summary.retainedBytes)
                                }
                                detail={engineDetail}
                            />
                        </div>

                        {single === undefined ? null : (
                            <>
                                <div className="my-3 border-t border-line-subtle" />
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="m-0 text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                        Sequence data
                                    </p>
                                    <span className="shrink-0 text-[9px] text-ink-muted">
                                        Script-readable
                                    </span>
                                </div>
                                <CustomDataEditor
                                    values={customData}
                                    disabled={locked || busy}
                                    onCommit={onCustomData}
                                />
                            </>
                        )}

                        <div className="mt-3 flex items-center gap-1.5 text-[9.5px] text-ink-muted">
                            <Info
                                aria-hidden="true"
                                className="h-3 w-3 shrink-0"
                                strokeWidth={1.6}
                            />
                            <span className="truncate">
                                Playhead{" "}
                                <span className="font-mono text-ink-secondary tabular-nums">
                                    {playhead === null ? "—" : formatTimecode(playhead, frameRate)}
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="shrink-0 border-t border-line-subtle px-2 py-1.5">
                        <div className="flex items-center gap-0.5">
                            <SceneAction
                                label="Undo last scene edit"
                                tip="Undo last edit"
                                disabled={locked || busy || !canUndo}
                                onClick={onUndo}
                            >
                                <Undo2
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.8}
                                />
                            </SceneAction>
                            <span className="flex-1" />
                            <SceneAction
                                label="Split at the playhead"
                                tip="Split at playhead"
                                disabled={
                                    locked || busy || playhead === null || scenes.length !== 1
                                }
                                onClick={onSplit}
                            >
                                <Scissors
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.8}
                                />
                            </SceneAction>
                            <SceneAction
                                label="Merge selected scenes"
                                tip="Merge scenes"
                                disabled={locked || busy || scenes.length < 2}
                                onClick={onMerge}
                            >
                                <Combine
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.8}
                                />
                            </SceneAction>
                            <SceneAction
                                label="Delete this scene; its frames become uncovered"
                                tip="Delete scene"
                                disabled={locked || busy || single === undefined}
                                danger
                                onClick={onDelete}
                            >
                                <Trash2
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.8}
                                />
                            </SceneAction>
                            <SceneAction
                                label="Reset chunks so the encoder writes them again"
                                tip="Reset chunks"
                                disabled={locked || busy}
                                alignEnd
                                onClick={onReset}
                            >
                                <RotateCcw
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.8}
                                />
                            </SceneAction>
                        </div>
                        {locked || busy ? (
                            <p className="m-0 mt-1 text-center text-[9px] text-ink-muted">
                                {locked
                                    ? "Read-only while a run holds the configuration lock."
                                    : "Saving the last scene edit…"}
                            </p>
                        ) : null}
                    </div>
                </>
            )}
        </section>
    );
}
