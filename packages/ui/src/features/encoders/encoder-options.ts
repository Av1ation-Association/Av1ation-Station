import type { EncoderDescriptor, ParameterDescriptor } from "@av1ation/contracts";

/**
 * The engine's `options` map is a `CLIParameter` union keyed by the bare flag name, while the
 * catalogue keys parameters by their canonical spelling (`--crf`). These helpers are the one
 * conversion between the two so the editor never shows a raw union or writes a shape the
 * engine cannot read.
 */

/** The key the engine uses in `options`: the spelling without its dashes. */
export function optionName(canonical: string): string {
    return canonical.replace(/^-+/u, "");
}

/** The dashes a canonical spelling carries; `--` is the default for a custom flag. */
export function optionPrefix(canonical: string): string {
    return canonical.startsWith("--") ? "--" : canonical.startsWith("-") ? "-" : "--";
}

/** What a stored `CLIParameter` holds, independent of its union variant. */
export type OptionKind = "Bool" | "Number" | "String";

export interface OptionValue {
    kind: OptionKind;
    prefix: string;
    delimiter: string;
    value: string | number | boolean;
}

function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** Reads one stored option, or `null` when it is not a `CLIParameter`. */
export function readOption(parameter: unknown): OptionValue | null {
    const entry = record(parameter);
    if (typeof entry.Bool === "object" && entry.Bool !== null) {
        const body = record(entry.Bool);
        return {
            kind: "Bool",
            prefix: typeof body.prefix === "string" ? body.prefix : "--",
            delimiter: "",
            value: body.value === true,
        };
    }
    if (typeof entry.Number === "object" && entry.Number !== null) {
        const body = record(entry.Number);
        return {
            kind: "Number",
            prefix: typeof body.prefix === "string" ? body.prefix : "--",
            delimiter: typeof body.delimiter === "string" ? body.delimiter : " ",
            value: typeof body.value === "number" ? body.value : 0,
        };
    }
    if (typeof entry.String === "object" && entry.String !== null) {
        const body = record(entry.String);
        return {
            kind: "String",
            prefix: typeof body.prefix === "string" ? body.prefix : "--",
            delimiter: typeof body.delimiter === "string" ? body.delimiter : " ",
            value: typeof body.value === "string" ? body.value : "",
        };
    }
    return null;
}

/** Replaces the value of a stored option without changing its flag or delimiter. */
export function withOptionValue(parameter: unknown, value: string | number | boolean): unknown {
    const current = readOption(parameter);
    if (current === null) {
        return parameter;
    }
    if (current.kind === "Bool") {
        return { Bool: { prefix: current.prefix, value: value === true } };
    }
    if (current.kind === "Number") {
        const number = typeof value === "number" ? value : Number(value);
        return {
            Number: {
                prefix: current.prefix,
                delimiter: current.delimiter,
                value: Number.isFinite(number) ? number : 0,
            },
        };
    }
    return {
        String: {
            prefix: current.prefix,
            delimiter: current.delimiter,
            value: String(value),
        },
    };
}

/** The first value a parameter takes when the user sets it from the catalogue. */
export function startingValue(descriptor: ParameterDescriptor): string | number | boolean {
    // A flag is emitted when true and omitted when false, so setting one means turning it on.
    if (descriptor.kind === "Flag") {
        return true;
    }
    return defaultValue(descriptor) ?? "";
}

/** A descriptor's documented default, as the control's own type. */
export function defaultValue(descriptor: ParameterDescriptor): string | number | boolean | null {
    const value = descriptor.default;
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        const separator =
            "Collection" in descriptor.kind ? descriptor.kind.Collection.separator : " ";
        return value.map((entry) => String(entry)).join(separator);
    }
    return null;
}

/**
 * Builds the `CLIParameter` the engine serialises for one flag and value.
 *
 * The delimiter is the descriptor's own: `--crf 22` emits two argv entries while `--tune=0`
 * emits one. A parameter the catalogue does not describe is treated as space-separated text,
 * which is what a plain `--flag value` command line receives.
 */
export function buildOption(
    canonical: string,
    descriptor: ParameterDescriptor | undefined,
    value: string | number | boolean,
): unknown {
    const prefix = optionPrefix(canonical);
    // The contract carries the engine's own delimiter, so `Space` becomes the argv separator
    // and `Joined` carries the character the encoder expects.
    const delimiter =
        descriptor?.delimiter !== undefined &&
        descriptor.delimiter !== null &&
        typeof descriptor.delimiter === "object"
            ? descriptor.delimiter.Joined
            : " ";
    if (descriptor?.kind === "Flag") {
        return { Bool: { prefix, value: value === true } };
    }
    if (descriptor !== undefined && "Number" in descriptor.kind) {
        const number = typeof value === "number" ? value : Number(value);
        return {
            Number: {
                prefix,
                delimiter,
                value: Number.isFinite(number) ? number : 0,
            },
        };
    }
    return { String: { prefix, delimiter, value: String(value) } };
}

/**
 * The catalogue row a build is shown under.
 *
 * The base catalogue carries the researched label, description and range; the build's probe
 * carries what its own binary reported — the delimiter, the default it prints, and whether
 * the option takes a value at all. Both are evidence, so a fork that prints `--crf` without
 * a metavar still gets the documented label and 0.25 step, while a base row wrongly marked
 * a switch becomes numeric when the build proves it takes one.
 */
export function mergeDescriptor(
    base: ParameterDescriptor | undefined,
    probed: ParameterDescriptor | undefined,
): ParameterDescriptor | undefined {
    if (base === undefined) {
        return probed;
    }
    if (probed === undefined) {
        return base;
    }
    const baseIsFlag = base.kind === "Flag";
    return {
        ...probed,
        label: base.label === "" ? probed.label : base.label,
        description: base.description ?? probed.description,
        doc_link: base.doc_link ?? probed.doc_link,
        group: base.group ?? probed.group,
        advanced: base.advanced,
        kind: baseIsFlag && probed.kind !== "Flag" ? probed.kind : base.kind,
    };
}

/** A boolean flag the catalogue does not describe. */
export function buildBoolOption(canonical: string, value: boolean): unknown {
    return { Bool: { prefix: optionPrefix(canonical), value } };
}

/** A numeric flag the catalogue does not describe, with the space delimiter argv expects. */
export function buildNumberOption(canonical: string, value: number): unknown {
    return {
        Number: {
            prefix: optionPrefix(canonical),
            delimiter: " ",
            value: Number.isFinite(value) ? value : 0,
        },
    };
}

/** One stored option as the argv fragment the encoder receives. */
export function previewOption(canonical: string, parameter: unknown): string | null {
    const current = readOption(parameter);
    if (current === null) {
        return null;
    }
    const name = `${current.prefix}${optionName(canonical)}`;
    if (current.kind === "Bool") {
        return current.value === true ? name : null;
    }
    const separator = current.delimiter === "" ? "=" : current.delimiter;
    return `${name}${separator}${String(current.value)}`;
}

/** Whether a stored option still carries exactly its catalogue default. */
export function isDefaultOption(
    descriptor: ParameterDescriptor | undefined,
    parameter: unknown,
): boolean {
    const current = readOption(parameter);
    if (current === null || descriptor === undefined) {
        return false;
    }
    const expected = defaultValue(descriptor);
    if (expected === null) {
        return false;
    }
    if (typeof expected === "boolean") {
        return current.kind === "Bool" && current.value === expected;
    }
    return String(current.value) === String(expected);
}

/** The canonical spelling for a stored option, so the catalogue can describe it. */
export function canonicalOf(name: string, parameter: unknown): string {
    const current = readOption(parameter);
    return `${current?.prefix ?? "--"}${name}`;
}

/**
 * The flags an encoder uses for its quality quantizer, in probe order.
 *
 * The quantizer scale comes before CRF: SVT-AV1's `--crf` spans 1–70 but its actual QP scale
 * (and the value Target quality writes) ends at 63, so `--qp` is the bound that matters.
 */
const QUANTIZER_KEYS = ["--qp", "--cq-level", "--quantizer", "--qindex", "--crf", "-crf"];

/**
 * The quantizer bounds the selected encoder's own descriptor declares.
 *
 * Target quality probes that encoder's command line, so a range of 0–51 is wrong for rav1e
 * (0–255) and for SVT-AV1/x264, whose quality scales end at 63/69. The catalogue already
 * carries each flag's bounds; the screen asks it instead of assuming one scale.
 */
export function quantizerBounds(
    descriptor: EncoderDescriptor | undefined,
): { key: string; min: number; max: number } | null {
    if (descriptor === undefined) {
        return null;
    }
    for (const key of QUANTIZER_KEYS) {
        const parameter = descriptor.parameters[key];
        if (parameter === undefined || !("Number" in parameter.kind)) {
            continue;
        }
        const { min, max } = parameter.kind.Number;
        if (typeof min === "number" && typeof max === "number" && max > min) {
            return { key, min: Math.max(0, Math.trunc(min)), max: Math.trunc(max) };
        }
    }
    return null;
}

/** The catalogue entry that produces one encoder document variant, fork or built-in. */
export function descriptorForVariant(
    encoders: EncoderDescriptor[] | undefined,
    variant: string | null,
): EncoderDescriptor | undefined {
    if (variant === null) {
        return undefined;
    }
    return (encoders ?? []).find(
        (entry) =>
            typeof entry.default === "object" &&
            entry.default !== null &&
            Object.prototype.hasOwnProperty.call(entry.default, variant),
    );
}
