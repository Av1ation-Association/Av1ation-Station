import { useEffect, useState, type ReactNode } from "react";

import { Plus, X } from "lucide-react";

import { NumberField } from "../NumberField";

/**
 * The subset of JSON Schema the engine emits that the configuration form understands.
 *
 * `schemars` generates this from the engine's own types, so the form does not carry a second
 * list of fields. Any shape this renderer does not understand falls back to a validated JSON
 * text area instead of disappearing.
 */
export interface JsonSchema {
    $ref?: string;
    $defs?: Record<string, JsonSchema>;
    title?: string;
    description?: string;
    type?: string | string[];
    enum?: unknown[];
    const?: unknown;
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    prefixItems?: JsonSchema[];
    additionalProperties?: boolean | JsonSchema;
    minimum?: number;
    maximum?: number;
    format?: string;
}

function humanize(key: string): string {
    const acronyms: Record<string, string> = {
        id: "ID",
        crf: "CRF",
        qp: "QP",
        vmaf: "VMAF",
        gpu: "GPU",
        fps: "FPS",
        ffmpeg: "FFmpeg",
        mkvmerge: "mkvmerge",
        ssimulacra2: "SSIMULACRA2",
        xpsnr: "XPSNR",
        cvvdp: "CVVDP",
    };
    const words = key
        .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
        .replace(/[_-]+/gu, " ")
        .trim()
        .split(/\s+/u);
    return words
        .map((word) => acronyms[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

export function resolveSchema(root: JsonSchema, node: JsonSchema): JsonSchema {
    let current = node;
    const seen = new Set<string>();
    while (current.$ref !== undefined) {
        const name = current.$ref.split("/").pop() ?? "";
        if (seen.has(name)) {
            break;
        }
        seen.add(name);
        const target = root.$defs?.[name];
        if (target === undefined) {
            break;
        }
        current = target;
    }
    return current;
}

const resolve = resolveSchema;

function types(node: JsonSchema): string[] {
    if (node.type === undefined) {
        return [];
    }
    return Array.isArray(node.type) ? node.type : [node.type];
}

function nullable(node: JsonSchema): boolean {
    return (
        types(node).includes("null") ||
        (node.anyOf?.some((entry) => types(entry).includes("null")) ?? false) ||
        (node.oneOf?.some((entry) => types(entry).includes("null")) ?? false)
    );
}

function withoutNull(node: JsonSchema): JsonSchema {
    const list = types(node);
    if (list.length === 0) {
        return node;
    }
    const rest: JsonSchema = { ...node };
    delete rest.type;
    const kept = list.filter((entry) => entry !== "null");
    if (kept.length === 0) {
        return rest;
    }
    return { ...rest, type: kept.length === 1 ? (kept[0] ?? "null") : kept };
}

function optionLabel(option: Option): string {
    return option.kind === "scalar"
        ? option.label
        : `${option.key.charAt(0).toUpperCase()}${option.key.slice(1)}`;
}

function nonNullVariant(node: JsonSchema): JsonSchema | null {
    if (!Array.isArray(node.anyOf)) {
        return null;
    }
    return node.anyOf.find((entry) => !types(entry).includes("null")) ?? null;
}

interface ScalarOption {
    kind: "scalar";
    value: unknown;
    label: string;
    schema: JsonSchema;
}

interface TaggedOption {
    kind: "tagged";
    key: string;
    schema: JsonSchema;
}

type Option = ScalarOption | TaggedOption;

function optionsOf(root: JsonSchema, node: JsonSchema): Option[] | null {
    if (!Array.isArray(node.oneOf)) {
        return null;
    }
    const options: Option[] = [];
    for (const raw of node.oneOf) {
        const variant = resolve(root, raw);
        if (variant.const !== undefined) {
            options.push({
                kind: "scalar",
                value: variant.const,
                label: String(variant.const),
                schema: variant,
            });
            continue;
        }
        if (variant.enum !== undefined) {
            for (const value of variant.enum) {
                options.push({ kind: "scalar", value, label: String(value), schema: variant });
            }
            continue;
        }
        const properties = variant.properties ?? {};
        const keys = Object.keys(properties);
        if (keys.length === 1 && variant.required?.includes(keys[0] ?? "")) {
            const key = keys[0] ?? "";
            const child = properties[key];
            options.push({
                kind: "tagged",
                key,
                schema: child === undefined ? {} : resolve(root, child),
            });
            continue;
        }
        options.push({ kind: "scalar", value: {}, label: "Object", schema: variant });
    }
    return options.length === 0 ? null : options;
}

/** Builds a structurally valid value for a schema, used when enabling an optional section. */
export function defaultFor(root: JsonSchema, raw: JsonSchema, depth = 0): unknown {
    const node = resolve(root, raw);
    if (depth > 12) {
        return null;
    }
    if (node.const !== undefined) {
        return node.const;
    }
    if (node.enum !== undefined && node.enum.length > 0) {
        return node.enum[0];
    }
    if (Array.isArray(node.oneOf)) {
        const options = optionsOf(root, node) ?? [];
        const first = options[0];
        if (first === undefined) {
            return null;
        }
        return first.kind === "scalar"
            ? first.value
            : { [first.key]: defaultFor(root, first.schema, depth + 1) };
    }
    if (Array.isArray(node.anyOf)) {
        const variant = nonNullVariant(node);
        return variant === null ? null : defaultFor(root, variant, depth + 1);
    }
    const list = types(node);
    if (list.includes("null") && list.length === 1) {
        return null;
    }
    if (list.includes("boolean")) {
        return false;
    }
    if (list.includes("integer") || list.includes("number")) {
        return node.minimum ?? 0;
    }
    if (list.includes("string")) {
        return "";
    }
    if (list.includes("array")) {
        if (node.prefixItems !== undefined) {
            return node.prefixItems.map((entry) => defaultFor(root, entry, depth + 1));
        }
        return [];
    }
    if (list.includes("object") || node.properties !== undefined) {
        const result: Record<string, unknown> = {};
        for (const key of node.required ?? []) {
            const child = node.properties?.[key];
            if (child !== undefined) {
                result[key] = defaultFor(root, child, depth + 1);
            }
        }
        return result;
    }
    return null;
}

function setIn(value: unknown, path: string[], next: unknown): unknown {
    const [head, ...rest] = path;
    if (head === undefined) {
        return next;
    }
    if (Array.isArray(value)) {
        const index = Number(head);
        const copy = [...value];
        copy[index] = rest.length === 0 ? next : setIn(copy[index], rest, next);
        return copy;
    }
    const source =
        typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    return {
        ...source,
        [head]: rest.length === 0 ? next : setIn(source[head], rest, next),
    };
}

export function getIn(value: unknown, path: string[]): unknown {
    let current = value;
    for (const key of path) {
        if (typeof current !== "object" || current === null) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

/** Rebuilds the full configuration document from the service's flattened effective values. */
export function documentFromValues(
    values: Record<string, { value: unknown }>,
): Record<string, unknown> {
    let document: unknown = {};
    for (const [path, entry] of Object.entries(values)) {
        document = setIn(document, path.split("."), entry.value);
    }
    return document as Record<string, unknown>;
}

export function updateIn(
    value: unknown,
    path: string[],
    updater: (previous: unknown) => unknown,
): unknown {
    return setIn(value, path, updater(getIn(value, path)));
}

const FIELD =
    "h-8 w-full min-w-0 rounded-md border border-line-strong bg-app px-2.5 text-[12px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50";

function JsonValueEditor({
    value,
    onChange,
    nested = false,
}: {
    value: unknown;
    onChange: (next: unknown) => void;
    nested?: boolean;
}) {
    const [text, setText] = useState(() => JSON.stringify(value ?? null, null, nested ? 2 : 0));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setText(JSON.stringify(value ?? null, null, nested ? 2 : 0));
        setError(null);
    }, [value, nested]);

    const commit = (next: string) => {
        try {
            onChange(JSON.parse(next) as unknown);
            setError(null);
        } catch {
            setError("That is not valid JSON.");
        }
    };

    return (
        <div className="min-w-0">
            <textarea
                value={text}
                onChange={(event) => {
                    setText(event.target.value);
                    setError(null);
                }}
                onBlur={() => commit(text)}
                rows={nested ? 4 : 2}
                spellCheck={false}
                className={`w-full min-w-0 rounded-md border bg-app px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-secondary ${
                    error === null ? "border-line-strong" : "border-danger"
                }`}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
                {error === null ? (
                    <span className="text-[10px] text-ink-muted">JSON</span>
                ) : (
                    <span className="text-[10px] text-danger">{error}</span>
                )}
                <button
                    type="button"
                    onClick={() => commit(text)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-ink-secondary hover:bg-hover hover:text-ink"
                >
                    Apply
                </button>
            </div>
        </div>
    );
}

function FieldFrame({
    title,
    description,
    required,
    source,
    children,
}: {
    title: string;
    description?: string | undefined;
    required: boolean;
    source?: string | undefined;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0 py-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[12px] font-medium break-words text-ink">
                    {title}
                    {required ? <span className="ml-1 text-brand-text">*</span> : null}
                </span>
                {source !== undefined && source !== "default" ? (
                    <span className="rounded-full border border-line bg-raised px-1.5 py-px text-[9px] text-ink-secondary">
                        {source}
                    </span>
                ) : null}
            </div>
            {description === undefined ? null : (
                <p className="mt-0.5 mb-1.5 max-w-[76ch] text-[10.5px] leading-relaxed text-ink-muted">
                    {description}
                </p>
            )}
            <div className="mt-1 min-w-0">{children}</div>
        </div>
    );
}

/**
 * One node of the engine schema. The caller owns the value and the change handler, which keeps
 * the draft immutable and makes undo/redo in the screen a single state reference.
 */
export function SchemaField({
    root,
    schema,
    value,
    onChange,
    name,
    required = false,
    source,
    depth = 0,
}: {
    root: JsonSchema;
    schema: JsonSchema;
    value: unknown;
    onChange: (next: unknown) => void;
    name?: string | undefined;
    required?: boolean | undefined;
    source?: string | undefined;
    depth?: number | undefined;
}) {
    const rawNode = resolve(root, schema);
    const node = withoutNull(rawNode);
    const isNullable = nullable(rawNode);
    const title = name === undefined ? (node.title ?? "Value") : humanize(name);
    const nullableObject =
        isNullable &&
        (value === null || value === undefined) &&
        (node.properties !== undefined || Array.isArray(node.oneOf) || Array.isArray(node.anyOf));

    if (nullableObject && name !== undefined) {
        return (
            <FieldFrame
                title={title}
                description={node.description}
                required={required}
                source={source}
            >
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-subtle bg-sunken px-2.5 py-1.5">
                    <span className="text-[11px] text-ink-secondary">
                        {name === "input" ? "Inherited from the project input." : "Not set."}
                    </span>
                    <button
                        type="button"
                        onClick={() => onChange(defaultFor(root, rawNode, depth + 1))}
                        className="rounded px-1.5 py-0.5 text-[11px] text-brand-text hover:bg-hover"
                    >
                        {name === "input" ? "Override…" : "Set…"}
                    </button>
                </div>
            </FieldFrame>
        );
    }

    if (depth > 14) {
        return (
            <FieldFrame title={title} required={required} source={source}>
                <JsonValueEditor value={value} onChange={onChange} nested />
            </FieldFrame>
        );
    }

    if (Array.isArray(node.oneOf)) {
        const options = optionsOf(root, node);
        if (options === null) {
            return (
                <FieldFrame
                    title={title}
                    description={node.description}
                    required={required}
                    source={source}
                >
                    <JsonValueEditor value={value} onChange={onChange} />
                </FieldFrame>
            );
        }

        const selectedScalar = options
            .filter((option): option is ScalarOption => option.kind === "scalar")
            .find((option) => JSON.stringify(option.value) === JSON.stringify(value));
        const selectedTagged =
            typeof value === "object" && value !== null
                ? options
                      .filter((option): option is TaggedOption => option.kind === "tagged")
                      .find((option) => Object.prototype.hasOwnProperty.call(value, option.key))
                : undefined;
        const selected = selectedTagged ?? selectedScalar;

        const choose = (index: number) => {
            const option = options[index];
            if (option === undefined) {
                return;
            }
            onChange(
                option.kind === "scalar"
                    ? option.value
                    : { [option.key]: defaultFor(root, option.schema, depth + 1) },
            );
        };

        const tagged = selectedTagged;
        const payload =
            tagged === undefined || typeof value !== "object" || value === null
                ? undefined
                : (value as Record<string, unknown>)[tagged.key];

        return (
            <FieldFrame
                title={title}
                description={node.description}
                required={required}
                source={source}
            >
                <select
                    value={
                        selected === undefined
                            ? ""
                            : options.indexOf(selected) === -1
                              ? ""
                              : String(options.indexOf(selected))
                    }
                    onChange={(event) => choose(Number(event.target.value))}
                    className={FIELD}
                >
                    {selected === undefined ? <option value="">Choose…</option> : null}
                    {options.map((option, index) => (
                        <option
                            key={`${option.kind}-${optionLabel(option)}-${String(index)}`}
                            value={index}
                        >
                            {optionLabel(option)}
                        </option>
                    ))}
                </select>
                {tagged === undefined ? null : (
                    <div className="mt-1 border-l border-line-subtle pl-3">
                        <SchemaObjectFields
                            root={root}
                            schema={tagged.schema}
                            value={payload}
                            onChange={(next) => onChange({ [tagged.key]: next })}
                            depth={depth + 1}
                        />
                    </div>
                )}
            </FieldFrame>
        );
    }

    if (Array.isArray(node.anyOf)) {
        const variant = nonNullVariant(node);
        if (variant === null) {
            return (
                <FieldFrame
                    title={title}
                    description={node.description}
                    required={required}
                    source={source}
                >
                    <JsonValueEditor value={value} onChange={onChange} />
                </FieldFrame>
            );
        }
        return (
            <SchemaField
                root={root}
                schema={variant}
                value={value}
                onChange={onChange}
                name={name}
                required={required}
                source={source}
                depth={depth + 1}
            />
        );
    }

    const list = types(node);

    if (list.includes("boolean")) {
        return (
            <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => onChange(event.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand-default)]"
                />
                <span className="min-w-0">
                    <span className="block text-[12px] font-medium break-words text-ink">
                        {title}
                    </span>
                    {node.description === undefined ? null : (
                        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                            {node.description}
                        </span>
                    )}
                </span>
            </label>
        );
    }

    if (list.includes("integer") || list.includes("number")) {
        const integer = list.includes("integer");
        return (
            <FieldFrame
                title={title}
                description={node.description}
                required={required}
                source={source}
            >
                {isNullable ? (
                    <input
                        aria-label={title}
                        type="number"
                        value={typeof value === "number" ? value : ""}
                        min={node.minimum}
                        max={node.maximum}
                        step={integer ? 1 : "any"}
                        onChange={(event) => {
                            const text = event.target.value;
                            onChange(
                                text === ""
                                    ? null
                                    : integer
                                      ? Number.parseInt(text, 10)
                                      : Number(text),
                            );
                        }}
                        className={`${FIELD} max-w-[200px] font-mono tabular-nums`}
                    />
                ) : (
                    <NumberField
                        label={title}
                        value={typeof value === "number" ? value : (node.minimum ?? 0)}
                        min={node.minimum}
                        max={node.maximum}
                        integer={integer}
                        onChange={onChange}
                        className="max-w-[200px]"
                    />
                )}
            </FieldFrame>
        );
    }

    if (list.includes("string")) {
        if (node.enum !== undefined) {
            const text = typeof value === "string" ? value : "";
            return (
                <FieldFrame
                    title={title}
                    description={node.description}
                    required={required}
                    source={source}
                >
                    <select
                        value={text}
                        onChange={(event) => onChange(event.target.value)}
                        className={FIELD}
                    >
                        {isNullable ? <option value="">Not set</option> : null}
                        {node.enum.map((entry) => (
                            <option key={String(entry)} value={String(entry)}>
                                {humanize(String(entry))}
                            </option>
                        ))}
                    </select>
                </FieldFrame>
            );
        }
        return (
            <FieldFrame
                title={title}
                description={node.description}
                required={required}
                source={source}
            >
                <input
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) =>
                        onChange(
                            event.target.value === "" && isNullable ? null : event.target.value,
                        )
                    }
                    placeholder={isNullable ? "Not set" : undefined}
                    spellCheck={false}
                    className={`${FIELD} font-mono text-[11px]`}
                />
            </FieldFrame>
        );
    }

    if (list.includes("array")) {
        if (node.prefixItems !== undefined) {
            const items = Array.isArray(value) ? value : [];
            // A pixel pair reads as Width and Height, not as "Resolution 1" and
            // "Resolution 2"; the engine's tuple order is fixed, so the labels are too.
            const labels = title === "Resolution" ? ["Width", "Height"] : null;
            return (
                <FieldFrame
                    title={title}
                    description={node.description}
                    required={required}
                    source={source}
                >
                    <div className="grid gap-2 sm:grid-cols-2">
                        {node.prefixItems.map((entry, index) => (
                            <SchemaField
                                key={index}
                                root={root}
                                schema={entry}
                                value={items[index]}
                                onChange={(next) =>
                                    onChange(
                                        node.prefixItems?.map((_, cursor) =>
                                            cursor === index ? next : items[cursor],
                                        ),
                                    )
                                }
                                name={labels?.[index] ?? `${title} ${String(index + 1)}`}
                                depth={depth + 1}
                            />
                        ))}
                    </div>
                    {isNullable && items.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => onChange(null)}
                            className="mt-1 rounded px-1.5 py-0.5 text-[10.5px] text-ink-muted hover:bg-hover hover:text-ink"
                        >
                            Unset
                        </button>
                    ) : null}
                </FieldFrame>
            );
        }
        const items = Array.isArray(value) ? value : [];
        const itemSchema = node.items;
        if (itemSchema === undefined) {
            return (
                <FieldFrame
                    title={title}
                    description={node.description}
                    required={required}
                    source={source}
                >
                    <JsonValueEditor value={value} onChange={onChange} nested />
                </FieldFrame>
            );
        }
        return (
            <FieldFrame
                title={title}
                description={node.description}
                required={required}
                source={source}
            >
                <div className="space-y-2">
                    {items.length === 0 ? (
                        <p className="m-0 text-[10.5px] text-ink-muted">No entries.</p>
                    ) : null}
                    {items.map((entry, index) => (
                        <div
                            key={index}
                            className="flex min-w-0 items-start gap-2 rounded-md border border-line bg-sunken px-2 py-1.5"
                        >
                            <div className="min-w-0 flex-1">
                                <SchemaField
                                    root={root}
                                    schema={itemSchema}
                                    value={entry}
                                    onChange={(next) =>
                                        onChange(
                                            items.map((current, cursor) =>
                                                cursor === index ? next : current,
                                            ),
                                        )
                                    }
                                    name={`${title} ${String(index + 1)}`}
                                    depth={depth + 1}
                                />
                            </div>
                            <button
                                type="button"
                                aria-label={`Remove ${title} ${String(index + 1)}`}
                                data-tip={`Remove ${title} ${String(index + 1)}`}
                                data-tip-align="end"
                                onClick={() =>
                                    onChange(items.filter((_, cursor) => cursor !== index))
                                }
                                className="mt-1 rounded p-1 text-ink-muted hover:bg-hover hover:text-ink"
                            >
                                <X aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() =>
                            onChange([...items, defaultFor(root, itemSchema, depth + 1)])
                        }
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2 text-[11px] text-ink-secondary hover:bg-hover hover:text-ink"
                    >
                        <Plus aria-hidden="true" className="h-3 w-3" />
                        Add {humanize(title).toLowerCase()} entry
                    </button>
                </div>
            </FieldFrame>
        );
    }

    if (list.includes("object") || node.properties !== undefined) {
        if (
            node.properties === undefined &&
            typeof node.additionalProperties === "object" &&
            node.additionalProperties !== null
        ) {
            return (
                <FieldFrame
                    title={title}
                    description={node.description}
                    required={required}
                    source={source}
                >
                    <JsonValueEditor value={value} onChange={onChange} nested />
                </FieldFrame>
            );
        }
        return (
            <FieldFrame
                title={title}
                description={node.description}
                required={required}
                source={source}
            >
                <SchemaObjectFields
                    root={root}
                    schema={node}
                    value={value}
                    onChange={onChange}
                    depth={depth + 1}
                />
            </FieldFrame>
        );
    }

    return (
        <FieldFrame
            title={title}
            description={node.description}
            required={required}
            source={source}
        >
            <JsonValueEditor value={value} onChange={onChange} />
        </FieldFrame>
    );
}

export function SchemaObjectFields({
    root,
    schema,
    value,
    onChange,
    depth,
}: {
    root: JsonSchema;
    schema: JsonSchema;
    value: unknown;
    onChange: (next: unknown) => void;
    depth: number;
}) {
    const node = resolve(root, schema);
    const properties = node.properties ?? {};
    const required = new Set(node.required ?? []);
    const object =
        typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    if (Object.keys(properties).length === 0) {
        return <JsonValueEditor value={value} onChange={onChange} nested />;
    }

    return (
        <div className="divide-y divide-line-subtle">
            {Object.entries(properties).map(([key, child]) => (
                <SchemaField
                    key={key}
                    root={root}
                    schema={child}
                    value={object[key]}
                    onChange={(next) =>
                        onChange({
                            ...object,
                            [key]: next,
                        })
                    }
                    name={key}
                    required={required.has(key)}
                    depth={depth}
                />
            ))}
        </div>
    );
}
