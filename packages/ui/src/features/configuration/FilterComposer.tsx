import { useEffect, useMemo, useState } from "react";

import { Check, Lock, RotateCcw, Search, Unlink2 } from "lucide-react";

import { resolveSchema, type JsonSchema } from "../../shared/schema/config-schema";
import { Button } from "../../shared/Button";
import { NumberField } from "../../shared/NumberField";
import { Sheet } from "../../shared/Sheet";

const FIELD =
    "h-8 min-w-0 rounded-md border border-line-strong bg-sunken px-2 font-mono text-[10.5px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50";

/** Where a filter belongs in the type pane, in the order the pane groups them. */
const GROUPS: Record<string, string> = {
    Crop: "geometry",
    Resize: "geometry",
    Trim: "temporal",
    WNNM: "denoise",
    Bilateral: "denoise",
    Degrain: "denoise",
    ZoomDegrain: "denoise",
    FGS: "grain",
    Rescale: "geometry",
    OutputFormat: "output",
};

const GROUP_ORDER = ["recent", "geometry", "temporal", "denoise", "grain", "output"];

const FIELD_NOTES: Record<string, string> = {
    width: "Width in pixels. Paired with height by the aspect lock.",
    height: "Height in pixels. Paired with width by the aspect lock.",
    start: "First frame in the range. Inclusive.",
    end: "Last frame plus one. Exclusive, so it must be after the start.",
    scaler: "The engine's own scaler list; it is never typed by hand.",
    format: "The output pixel format the engine can produce.",
    bit_depth: "Bit depth of the converted clip. Unset keeps the decoded depth.",
    chroma: "Chroma layout. Monochrome is valid at every depth the engine maps.",
};

/** `OutputFormat` → `Output format`, `ZoomDegrain` → `Zoom DeGrain`. */
export function filterLabel(tag: string): string {
    if (tag === "OutputFormat") {
        return "Output format";
    }
    if (tag === "FGS") {
        return "Film grain synthesis";
    }
    if (tag === "WNNM") {
        return "WNNM denoise";
    }
    return tag.replace(/([a-z])([A-Z])/gu, "$1 $2");
}

function humanField(key: string): string {
    return key
        .replace(/_/gu, " ")
        .replace(/\b\w/gu, (match) => match.toUpperCase())
        .replace(/\bFps\b/u, "FPS");
}

/** One variant of the engine's filter enum, with the tag that names it on the wire. */
export interface FilterVariant {
    tag: string;
    schema: JsonSchema;
    /** The schema that carries `$defs`, so a `$ref` field can still be resolved. */
    root: JsonSchema;
}

/** Read every variant out of the engine's generated enum schema. */
export function filterVariants(schema: JsonSchema | undefined): FilterVariant[] {
    if (schema === undefined) {
        return [];
    }
    const root = resolveSchema(schema, schema);
    const entries = root.oneOf ?? root.anyOf ?? [];
    const variants: FilterVariant[] = [];
    for (const entry of entries) {
        const resolved = resolveSchema(root, entry);
        for (const [tag, sub] of Object.entries(resolved.properties ?? {})) {
            variants.push({ tag, schema: resolveSchema(root, sub), root });
        }
    }
    return variants;
}

/** The order a filter's fields are shown in, so geometry reads as geometry. */
const FIELD_ORDER = [
    "width",
    "height",
    "top",
    "bottom",
    "left",
    "right",
    "start",
    "end",
    "scaler",
    "format",
    "sigma",
    "sigma_s",
    "sigma_r",
    "radius",
    "iso",
    "chroma_iso",
];

/** The properties of one variant, with `null` unions and `$ref`s resolved to real schemas. */
function fieldsOf(variant: FilterVariant): Array<[string, JsonSchema]> {
    const schema = resolveSchema(variant.root, variant.schema);
    return Object.entries(schema.properties ?? {})
        .map(([key, sub]) => {
            // Resolve against the schema that owns `$defs`: the variant body does not carry
            // them, so a `$ref` would otherwise stay opaque and render as a text box.
            const resolved = resolveSchema(variant.root, sub);
            const options = resolved.anyOf ?? resolved.oneOf;
            const real = options?.find(
                (option) =>
                    !(Array.isArray(option.type) ? option.type : [option.type]).includes("null"),
            );
            return [
                key,
                real === undefined ? resolved : resolveSchema(variant.root, real),
            ] as const;
        })
        .sort(([left], [right]) => {
            const a = FIELD_ORDER.indexOf(left);
            const b = FIELD_ORDER.indexOf(right);
            if (a === -1 && b === -1) {
                return left.localeCompare(right);
            }
            return a === -1 ? 1 : b === -1 ? -1 : a - b;
        })
        .map(([key, schema]) => [key, schema]);
}

function isInteger(schema: JsonSchema): boolean {
    const type = Array.isArray(schema.type) ? schema.type : [schema.type];
    return type.includes("integer") || type.includes("number");
}

function isIntegerOnly(schema: JsonSchema): boolean {
    const type = Array.isArray(schema.type) ? schema.type : [schema.type];
    return type.includes("integer");
}

function isBoolean(schema: JsonSchema): boolean {
    const type = Array.isArray(schema.type) ? schema.type : [schema.type];
    return type.includes("boolean");
}

function choices(schema: JsonSchema): string[] | null {
    if (schema.enum !== undefined) {
        return schema.enum.filter((value): value is string => typeof value === "string");
    }
    if (Array.isArray(schema.oneOf)) {
        const values = schema.oneOf.flatMap((entry) =>
            entry.enum === undefined
                ? entry.const === undefined
                    ? []
                    : [entry.const]
                : entry.enum,
        );
        const strings = values.filter((value): value is string => typeof value === "string");
        return strings.length === values.length && strings.length > 0 ? strings : null;
    }
    return null;
}

/**
 * Values the engine documents but does not encode as a JSON Schema enum.
 *
 * `Ffms2Filter::OutputFormat::bit_depth` is a `u8` described as "8, 10 or 12", so the schema
 * only carries `minimum`/`maximum`. Offering the typed integer is how a user produces a
 * value the engine rejects (7, 9, 255); the documented set is the real contract.
 */
const KNOWN_CHOICES: Record<string, string[]> = {
    bit_depth: ["8", "10", "12"],
};

function isArray(schema: JsonSchema): boolean {
    const type = Array.isArray(schema.type) ? schema.type : [schema.type];
    return type.includes("array");
}

const RECENTS_KEY = "av1ation.filter-recents";

function readRecents(): string[] {
    try {
        const raw = window.localStorage.getItem(RECENTS_KEY);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((tag): tag is string => typeof tag === "string")
            : [];
    } catch {
        return [];
    }
}

function writeRecents(tag: string): void {
    try {
        const next = [tag, ...readRecents().filter((entry) => entry !== tag)].slice(0, 4);
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
        // A private browser refuses storage; recents are a convenience, not state.
    }
}

/**
 * The one filter composer.
 *
 * A filter is chosen in a searchable, grouped type pane and configured in the generated form
 * beside it, so the list behind the sheet never reflows mid-edit. The form is derived from the
 * pinned engine's own enum schema; the layouts below only decide which control a field gets.
 */
export function FilterComposer({
    open,
    target,
    schema,
    initial,
    onClose,
    onCommit,
}: {
    open: boolean;
    /** Whether this list is the native FFMS2 one or the VapourSynth one. */
    target: "ffms2" | "vapour_synth";
    schema: JsonSchema | undefined;
    /** The filter being edited, or `null` when adding. */
    initial: unknown | null;
    onClose: () => void;
    onCommit: (filter: unknown, again: boolean) => void;
}) {
    const variants = useMemo(() => filterVariants(schema), [schema]);
    const [query, setQuery] = useState("");
    const [recents, setRecents] = useState<string[]>(() => readRecents());
    const [selected, setSelected] = useState<string | null>(null);
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [again, setAgain] = useState(false);
    const [locked, setLocked] = useState(true);

    // Opening resets the composer to the filter it was opened for, so a second visit never
    // shows the fields of the previous one.
    useEffect(() => {
        if (!open) {
            return;
        }
        if (initial === null || typeof initial !== "object") {
            const first = target === "ffms2" ? "OutputFormat" : (variants[0]?.tag ?? null);
            setSelected(first);
            setDraft({});
            setQuery("");
            setAgain(false);
            setLocked(true);
            return;
        }
        const [tag, payload] = Object.entries(initial)[0] ?? [];
        setSelected(tag ?? null);
        setDraft(
            typeof payload === "object" && payload !== null
                ? (payload as Record<string, unknown>)
                : {},
        );
        setQuery("");
        setAgain(false);
        setLocked(true);
    }, [open, initial, target, variants]);

    const active = variants.find((variant) => variant.tag === selected) ?? null;
    const fields = active === null ? [] : fieldsOf(active);
    const hasSize =
        fields.some(([key]) => key === "width") && fields.some(([key]) => key === "height");

    const matches = variants.filter((variant) => {
        const label = filterLabel(variant.tag).toLowerCase();
        return (
            query.trim() === "" ||
            label.includes(query.trim().toLowerCase()) ||
            variant.tag.toLowerCase().includes(query.trim().toLowerCase())
        );
    });
    const recentTags = recents.filter((tag) => matches.some((variant) => variant.tag === tag));
    const grouped = GROUP_ORDER.filter((group) => group !== "recent").map((group) => ({
        group,
        entries: matches.filter(
            (variant) =>
                (GROUPS[variant.tag] ?? "advanced") === group && !recentTags.includes(variant.tag),
        ),
    }));

    const setField = (key: string, value: unknown) => {
        setDraft((previous) => ({ ...previous, [key]: value }));
    };

    const commit = () => {
        if (active === null) {
            return;
        }
        const payload: Record<string, unknown> = {};
        const fields = new Map(fieldsOf(active));
        for (const [key, value] of Object.entries(draft)) {
            if (value === undefined || value === "") {
                continue;
            }
            const field = fields.get(key) ?? {};
            if (typeof value === "string" && isArray(field)) {
                payload[key] = value
                    .split(",")
                    .map((part) => Number(part.trim()))
                    .filter((part) => Number.isFinite(part));
                continue;
            }
            // The editor keeps what was typed so a decimal can pass through `0.`. The
            // engine expects integers for these fields, and a string is rejected with
            // "invalid type: string \"10\", expected u8", so the value is converted here.
            if (typeof value === "string" && isInteger(field)) {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) {
                    continue;
                }
                payload[key] = isIntegerOnly(field) ? Math.trunc(parsed) : parsed;
                continue;
            }
            payload[key] = value;
        }
        writeRecents(active.tag);
        setRecents(readRecents());
        onCommit({ [active.tag]: payload }, again);
        if (again) {
            setDraft({});
            return;
        }
        onClose();
    };

    const resetSize = () => {
        setDraft((previous) => {
            const next = { ...previous };
            delete next.width;
            delete next.height;
            return next;
        });
        setLocked(true);
    };

    return (
        <Sheet
            open={open}
            width="wide"
            onClose={onClose}
            title={initial === null ? "Add filter" : "Edit filter"}
            description={`${target === "ffms2" ? "FFMS2" : "VapourSynth"} input · the list behind stays in place`}
            footer={
                <>
                    <label className="mr-auto flex items-start gap-2 text-[10.5px] text-ink-muted">
                        <input
                            type="checkbox"
                            checked={again}
                            onChange={(event) => setAgain(event.target.checked)}
                            className="mt-0.5 h-3 w-3 accent-[var(--brand-default)]"
                        />
                        <span className="min-w-0">
                            <span className="block text-ink-secondary">Add another</span>
                            Keeps the sheet open with the same type after Add.
                        </span>
                    </label>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={commit} disabled={active === null}>
                        {initial === null ? "Add filter" : "Save filter"}
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-[248px_minmax(0,1fr)]">
                <div className="min-w-0">
                    <label
                        htmlFor="filter-type"
                        className="text-[10.5px] font-medium text-ink-secondary"
                    >
                        Filter type
                    </label>
                    <div className="relative mt-1">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                            strokeWidth={1.8}
                        />
                        <input
                            id="filter-type"
                            autoFocus
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Filter type"
                            spellCheck={false}
                            className={`${FIELD} w-full pl-7`}
                        />
                    </div>

                    <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
                        {recentTags.length > 0 ? (
                            <div className="mb-2">
                                <p className="m-0 px-1 font-mono text-[9px] tracking-[0.14em] text-ink-muted uppercase">
                                    Recent
                                </p>
                                <VariantButtons
                                    variants={variants.filter((variant) =>
                                        recentTags.includes(variant.tag),
                                    )}
                                    selected={selected}
                                    onSelect={setSelected}
                                />
                            </div>
                        ) : null}
                        {grouped.map(({ group, entries }) =>
                            entries.length === 0 ? null : (
                                <div key={group} className="mb-2">
                                    <p className="m-0 px-1 font-mono text-[9px] tracking-[0.14em] text-ink-muted uppercase">
                                        {group}
                                    </p>
                                    <VariantButtons
                                        variants={entries}
                                        selected={selected}
                                        onSelect={setSelected}
                                    />
                                </div>
                            ),
                        )}
                        {matches.length === 0 ? (
                            <p className="m-0 px-1 py-2 text-[10.5px] text-ink-muted">
                                No filter matches that name.
                            </p>
                        ) : null}
                    </div>

                    <p className="mt-3 mb-0 text-[10px] leading-relaxed text-ink-muted">
                        The pane lists only filters valid for this input; an inapplicable type
                        cannot be chosen.
                    </p>
                </div>

                <div className="min-w-0 border-line sm:border-l sm:pl-5">
                    {active === null ? (
                        <p className="m-0 text-[11.5px] text-ink-muted">
                            Choose a filter type to configure it.
                        </p>
                    ) : (
                        <>
                            <h3 className="m-0 text-lg font-semibold text-ink">
                                {filterLabel(active.tag)}
                            </h3>
                            <p className="mt-0.5 mb-0 text-[10.5px] text-ink-muted">
                                {target === "ffms2"
                                    ? "Native FFMS2 conversion. Geometry is checked when a video is added."
                                    : "Source geometry is validated when a video is added."}
                            </p>

                            {hasSize ? (
                                <div className="mt-4">
                                    <p className="m-0 text-[10.5px] font-medium text-ink-secondary">
                                        Size · pixels
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <input
                                            aria-label="Width"
                                            inputMode="numeric"
                                            value={String(draft.width ?? "")}
                                            onChange={(event) =>
                                                setField(
                                                    "width",
                                                    event.target.value.replace(/\D/gu, ""),
                                                )
                                            }
                                            placeholder="Width"
                                            className={`${FIELD} w-[96px]`}
                                        />
                                        <button
                                            type="button"
                                            aria-label={
                                                locked ? "Aspect locked" : "Aspect unlocked"
                                            }
                                            data-tip={
                                                locked ? "Unlock aspect ratio" : "Lock aspect ratio"
                                            }
                                            data-tip-align="start"
                                            aria-pressed={locked}
                                            onClick={() => setLocked((value) => !value)}
                                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${
                                                locked
                                                    ? "border-brand bg-brand-soft text-brand"
                                                    : "border-line-strong bg-sunken text-ink-secondary"
                                            }`}
                                        >
                                            {locked ? (
                                                <Lock aria-hidden="true" className="h-3.5 w-3.5" />
                                            ) : (
                                                <Unlink2
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5"
                                                />
                                            )}
                                        </button>
                                        <span
                                            aria-hidden="true"
                                            className="text-[10px] text-ink-muted"
                                        >
                                            ×
                                        </span>
                                        <input
                                            aria-label="Height"
                                            inputMode="numeric"
                                            value={String(draft.height ?? "")}
                                            onChange={(event) =>
                                                setField(
                                                    "height",
                                                    event.target.value.replace(/\D/gu, ""),
                                                )
                                            }
                                            placeholder="Height"
                                            className={`${FIELD} w-[96px]`}
                                        />
                                        <button
                                            type="button"
                                            onClick={resetSize}
                                            aria-label="Reset size"
                                            title="Reset to the source size"
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-sunken text-ink-muted hover:text-ink"
                                        >
                                            <RotateCcw
                                                aria-hidden="true"
                                                className="h-3.5 w-3.5"
                                                strokeWidth={1.6}
                                            />
                                        </button>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                        <p className="m-0 text-[10px] text-ink-muted">
                                            {String(draft.width ?? "").trim() === "" ||
                                            String(draft.height ?? "").trim() === ""
                                                ? "Size not set · source size"
                                                : `Size · ${String(draft.width)} × ${String(draft.height)} px`}
                                        </p>
                                        <p className="m-0 text-[10px] text-ink-muted">
                                            {locked ? "Aspect locked" : "Aspect unlocked"}
                                        </p>
                                        <p className="m-0 text-[10px] text-ink-muted">
                                            Both dimensions are required for a reliable conversion
                                            when the source ratio is unknown.
                                        </p>
                                    </div>

                                    <>
                                        <p className="mt-3 mb-0 font-mono text-[9px] tracking-[0.14em] text-ink-muted uppercase">
                                            Presets
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {[
                                                { label: "2160p", width: "3840", height: "2160" },
                                                { label: "1440p", width: "2560", height: "1440" },
                                                { label: "1080p", width: "1920", height: "1080" },
                                                { label: "720p", width: "1280", height: "720" },
                                                { label: "540p", width: "960", height: "540" },
                                            ].map((preset) => (
                                                <button
                                                    key={preset.label}
                                                    type="button"
                                                    onClick={() =>
                                                        setDraft((previous) => ({
                                                            ...previous,
                                                            width: preset.width,
                                                            height: preset.height,
                                                        }))
                                                    }
                                                    className="h-7 rounded-md border border-line-strong bg-sunken px-2 text-[10.5px] text-ink-secondary transition-colors duration-150 hover:border-brand hover:text-ink"
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={resetSize}
                                                className="h-7 rounded-md border border-line-strong bg-sunken px-2 text-[10.5px] text-ink-secondary transition-colors duration-150 hover:border-brand hover:text-ink"
                                            >
                                                Source
                                            </button>
                                        </div>
                                        <p className="mt-1 mb-0 text-[10px] text-ink-muted">
                                            A preset fills the fields. It never locks them.
                                        </p>
                                    </>
                                </div>
                            ) : null}

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {fields
                                    .filter(
                                        ([key]) =>
                                            !(hasSize && (key === "width" || key === "height")),
                                    )
                                    .map(([key, field]) => (
                                        <FilterField
                                            key={key}
                                            name={key}
                                            schema={field}
                                            value={draft[key]}
                                            onChange={(value) => setField(key, value)}
                                        />
                                    ))}
                            </div>

                            <p className="mt-4 mb-0 text-[10px] leading-relaxed text-ink-muted">
                                The form is generated from the filter descriptor. A field the engine
                                does not have cannot be invented here.
                            </p>
                        </>
                    )}
                </div>
            </div>
        </Sheet>
    );
}

function VariantButtons({
    variants,
    selected,
    onSelect,
}: {
    variants: FilterVariant[];
    selected: string | null;
    onSelect: (tag: string) => void;
}) {
    return (
        <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {variants.map((variant) => {
                const active = variant.tag === selected;
                return (
                    <li key={variant.tag}>
                        <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => onSelect(variant.tag)}
                            className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors duration-150 ${
                                active
                                    ? "border-brand bg-brand-soft text-ink"
                                    : "border-transparent text-ink-secondary hover:bg-hover hover:text-ink"
                            }`}
                        >
                            {active ? (
                                <Check
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 shrink-0 text-brand"
                                />
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 shrink-0 rounded-sm border border-line-strong"
                                />
                            )}
                            <span className="min-w-0 flex-1 truncate text-[11.5px]">
                                {filterLabel(variant.tag)}
                            </span>
                            <span className="shrink-0 text-[9.5px] text-ink-muted capitalize">
                                {GROUPS[variant.tag] ?? "advanced"}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

function FilterField({
    name,
    schema,
    value,
    onChange,
}: {
    name: string;
    schema: JsonSchema;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    const enumerations = choices(schema) ?? KNOWN_CHOICES[name] ?? null;
    // The engine's own field documentation wins; the local notes only cover the fields a
    // build describes tersely.
    const note = schema.description ?? FIELD_NOTES[name];
    const label = (
        <span className="block text-[10.5px] font-medium text-ink-secondary">
            {humanField(name)}
        </span>
    );

    if (enumerations !== null) {
        return (
            <label className="min-w-0">
                {label}
                <select
                    aria-label={humanField(name)}
                    value={
                        typeof value === "string" || typeof value === "number" ? String(value) : ""
                    }
                    onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === "") {
                            onChange(undefined);
                        } else if (isIntegerOnly(schema)) {
                            // The stored document carries numbers (`bit_depth: 10`), so the
                            // select reads and writes a number; a string here was why an
                            // edit reopened with "Keep source" selected.
                            onChange(Number(raw));
                        } else {
                            onChange(raw);
                        }
                    }}
                    className={`${FIELD} mt-1 w-full`}
                >
                    <option value="">Keep source</option>
                    {enumerations.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
                {note === undefined ? null : (
                    <span className="mt-1 block text-[9.5px] text-ink-muted">{note}</span>
                )}
            </label>
        );
    }

    if (isBoolean(schema)) {
        return (
            <label className="flex min-w-0 items-center gap-2 self-end pb-1.5 text-[11px] text-ink-secondary">
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => onChange(event.target.checked ? true : undefined)}
                    className="h-3.5 w-3.5 accent-[var(--brand-default)]"
                />
                {humanField(name)}
            </label>
        );
    }

    if (isArray(schema)) {
        return (
            <div className="min-w-0">
                {label}
                <ArrayField
                    label={humanField(name)}
                    value={value}
                    itemSchema={schema.items}
                    onChange={onChange}
                />
                <span className="mt-1 block text-[9.5px] text-ink-muted">
                    {note ?? "One value per plane; leave empty to keep the filter's own default."}
                </span>
            </div>
        );
    }

    return (
        <div className="min-w-0">
            {label}
            <NumberField
                label={humanField(name)}
                value={
                    typeof value === "number"
                        ? value
                        : typeof value === "string" && value.trim() !== ""
                          ? Number(value)
                          : null
                }
                integer={isIntegerOnly(schema)}
                step={isIntegerOnly(schema) ? 1 : 0.1}
                min={schema.minimum}
                max={schema.maximum}
                onChange={onChange}
                className="mt-1"
                placeholder="Default"
            />
            {note === undefined ? null : (
                <span className="mt-1 block text-[9.5px] text-ink-muted">{note}</span>
            )}
        </div>
    );
}

/**
 * An array written as an editable list, never as delimiters in a text box.
 *
 * `WNNM::sigma` is three numbers (Y, Cb, Cr); asking the user to type `"3,0,0"` also
 * accepts `"3 0 0"`, `"3;0;0"`, and a stray empty item, none of which the engine reads the
 * way the user meant. Each item is its own field, and Add/Remove make the count explicit.
 */
function ArrayField({
    label,
    value,
    itemSchema,
    onChange,
}: {
    label: string;
    value: unknown;
    itemSchema: JsonSchema | undefined;
    onChange: (value: unknown) => void;
}) {
    const items = Array.isArray(value) ? value : [];
    const numeric = itemSchema === undefined ? true : isInteger(itemSchema);

    const write = (next: unknown[]) => onChange(next.length === 0 ? undefined : next);

    return (
        <div className="mt-1 space-y-1">
            {items.map((item, index) => (
                <div
                    key={`${label}-${String(index)}`}
                    className="flex min-w-0 items-center gap-1.5"
                >
                    {numeric ? (
                        <NumberField
                            label={`${label} item ${String(index + 1)}`}
                            value={
                                typeof item === "number"
                                    ? item
                                    : typeof item === "string" && item.trim() !== ""
                                      ? Number(item)
                                      : null
                            }
                            integer={itemSchema?.type === "integer"}
                            step={itemSchema?.type === "integer" ? 1 : 0.1}
                            onChange={(next) => {
                                const updated = [...items];
                                updated[index] = next;
                                onChange(updated);
                            }}
                            className="min-w-0 flex-1"
                        />
                    ) : (
                        <input
                            aria-label={`${label} item ${String(index + 1)}`}
                            value={
                                typeof item === "number" || typeof item === "string"
                                    ? String(item)
                                    : ""
                            }
                            onChange={(event) => {
                                const updated = [...items];
                                updated[index] = event.target.value;
                                onChange(updated);
                            }}
                            className={`${FIELD} min-w-0 flex-1`}
                        />
                    )}
                    <button
                        type="button"
                        aria-label={`Remove ${label} item ${String(index + 1)}`}
                        onClick={() => write(items.filter((_, at) => at !== index))}
                        className="shrink-0 rounded p-1 text-ink-muted hover:bg-hover hover:text-danger"
                    >
                        ×
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => write([...items, numeric ? 0 : ""])}
                className="h-7 rounded-md border border-line-strong bg-sunken px-2 text-[10.5px] text-ink-secondary hover:border-brand hover:text-ink"
            >
                + Add value
            </button>
        </div>
    );
}
