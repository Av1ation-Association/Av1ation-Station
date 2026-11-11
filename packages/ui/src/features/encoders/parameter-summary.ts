import type { ParameterDescriptor } from "@av1ation/contracts";

/** The descriptor kinds the sheet can edit, in the order its select offers them. */
export const KIND_OPTIONS = ["Flag", "Number", "Decimal", "Text", "Choice", "Path"] as const;

export type ParameterKindName = (typeof KIND_OPTIONS)[number];

/**
 * The kind a descriptor is edited as.
 *
 * `Number` records whether the encoder accepts fractions, so a decimal stays decimal when
 * the sheet reopens and editing never silently makes CRF integral.
 */
export function kindOf(descriptor: ParameterDescriptor): ParameterKindName {
    if (typeof descriptor.kind === "string") {
        return descriptor.kind === "Flag" ? "Flag" : "Text";
    }
    if ("Path" in descriptor.kind) {
        return "Path";
    }
    if ("Number" in descriptor.kind) {
        return descriptor.kind.Number.integer ? "Number" : "Decimal";
    }
    if ("Choice" in descriptor.kind) {
        return "Choice";
    }
    return "Text";
}

/**
 * Whether a descriptor's number is a switch rather than a value.
 *
 * Encoders describe booleans as numbers when the CLI takes a value: SVT-AV1's
 * `--enable-qm 0|1` and aomenc's `--row-mt=0|1` are switches, not quantities. A descriptor
 * may say so explicitly, and `Auto` infers it from an integer range of exactly 0 to 1.
 * A flag is already a switch through `Toggle`; this predicate is only for numbers.
 */
export function isSwitchNumber(descriptor: ParameterDescriptor | undefined): boolean {
    if (descriptor === undefined) {
        return false;
    }
    const kind = descriptor.kind;
    if (typeof kind !== "object" || !("Number" in kind)) {
        return false;
    }
    if (descriptor.widget === "Switch") {
        return true;
    }
    if (descriptor.widget !== "Auto") {
        return false;
    }
    const spec = kind.Number;
    return spec.integer && spec.min === 0 && spec.max === 1;
}

export function defaultText(descriptor: ParameterDescriptor): string {
    const value = descriptor.default;
    if (value === undefined || value === null) {
        return "";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return "";
}

export function formatDefault(descriptor: ParameterDescriptor): string {
    const text = defaultText(descriptor);
    if (text === "") {
        return "—";
    }
    const clipped = text.length > 28 ? `${text.slice(0, 27)}…` : text;
    return kindOf(descriptor) === "Flag" ? (text === "true" ? "on" : "off") : clipped;
}

/** Whether the descriptor carries a default at all, as opposed to an empty value. */
export function hasDefault(descriptor: ParameterDescriptor): boolean {
    return descriptor.default !== undefined && descriptor.default !== null;
}

/** The default as a row reads it: a flag is on/off, an empty text is "empty". */
export function defaultLabel(descriptor: ParameterDescriptor): string {
    if (kindOf(descriptor) === "Flag") {
        return defaultText(descriptor) === "true" ? "on" : "off";
    }
    const text = defaultText(descriptor);
    return text === "" ? "empty" : text;
}

/** Parameters bucketed by the engine's own group name, ungrouped last. */
export function groupParameters(
    entries: Array<[string, ParameterDescriptor]>,
): Array<[string, Array<[string, ParameterDescriptor]>]> {
    const groups = new Map<string, Array<[string, ParameterDescriptor]>>();
    for (const entry of entries) {
        const name = entry[1].group ?? "Ungrouped";
        const bucket = groups.get(name);
        if (bucket === undefined) {
            groups.set(name, [entry]);
        } else {
            bucket.push(entry);
        }
    }
    return [...groups.entries()].sort(([left], [right]) =>
        left === "Ungrouped" ? 1 : right === "Ungrouped" ? -1 : left.localeCompare(right),
    );
}
