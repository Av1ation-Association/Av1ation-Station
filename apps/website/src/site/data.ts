import type { ParameterDescriptor } from "@av1ation/contracts";

import svtAv1Parameters from "virtual:svt-parameters";

export const FPS = 24;

/** Only SVT-AV1 is shown here, so the other encoders stay out of the initial bundle. */
export const SVT_PARAMETERS: Record<string, ParameterDescriptor> = svtAv1Parameters;

export function descriptor(key: string): ParameterDescriptor | undefined {
    return SVT_PARAMETERS[key];
}

export function sceneSeconds(frames: number): number {
    return frames / FPS;
}

const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000) {
        return `${decimal.format(bytes / 1_000_000)} MB`;
    }
    return `${integer.format(bytes / 1_000)} KB`;
}

export function formatFrames(frames: number): string {
    return `${integer.format(frames)} frames`;
}

export function formatTimecode(frames: number): string {
    const total = Math.round(sceneSeconds(frames));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

/** The stored `CLIParameter` shape `ParameterControl` expects, for a numeric value. */
export function numberOption(value: number): unknown {
    return { Number: { prefix: "--", delimiter: " ", value } };
}

/** The stored shape for a textual or choice value. */
export function stringOption(value: string): unknown {
    return { String: { prefix: "--", delimiter: " ", value } };
}

/** Wraps whatever a control hands back into the matching stored option. */
export function optionFor(next: string | number | boolean): unknown {
    if (typeof next === "boolean") {
        return { Bool: { prefix: "--", value: next } };
    }
    return typeof next === "number" ? numberOption(next) : stringOption(next);
}

/** The option a descriptor starts with, so a live example opens on a real value. */
export function defaultOption(spec: ParameterDescriptor | undefined): unknown {
    if (spec === undefined) {
        return stringOption("");
    }
    if (spec.kind === "Flag") {
        return { Bool: { prefix: "--", value: spec.default === true } };
    }
    if (typeof spec.kind === "object" && "Number" in spec.kind) {
        const value = typeof spec.default === "number" ? spec.default : (spec.kind.Number.min ?? 0);
        return numberOption(value);
    }
    if (typeof spec.kind === "object" && "Choice" in spec.kind) {
        const fallback = spec.kind.Choice.options[0]?.value ?? "";
        return stringOption(String(spec.default ?? fallback));
    }
    return stringOption(typeof spec.default === "string" ? spec.default : "");
}
