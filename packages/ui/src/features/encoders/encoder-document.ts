import type { EncoderDescriptor } from "@av1ation/contracts";
import { resolveSchema, type JsonSchema } from "../../shared/schema/config-schema";
import { previewOption } from "./encoder-options";

/**
 * The nine encoders the engine drives, in the engine's own order.
 *
 * `group` is the codec family, so a list of nine entries never reads as nine equivalent
 * choices: four of them produce AV1 and two of those share the same descriptor shape.
 * The labels are the engine enum's friendly names; the executable (`aomenc`, `vpxenc`) is
 * what the Dependency screen names, not what a user chooses here.
 */
export const ENCODER_CHOICES = [
    { base: "svt-av1", variant: "SVTAV1", label: "SVT-AV1", group: "AV1" },
    { base: "aom", variant: "AOM", label: "AOM", group: "AV1" },
    { base: "rav1e", variant: "RAV1E", label: "rav1e", group: "AV1" },
    { base: "avm", variant: "AVM", label: "AVM", group: "AV1" },
    { base: "vpx", variant: "VPX", label: "VPX", group: "VP9" },
    { base: "x264", variant: "X264", label: "x264", group: "H.264" },
    { base: "x265", variant: "X265", label: "x265", group: "H.265" },
    { base: "vvenc", variant: "VVenC", label: "VVenC", group: "VVC" },
    { base: "ffmpeg", variant: "FFmpeg", label: "FFmpeg", group: "FFmpeg" },
] as const;

export function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** The body of the encoder variant this document selects. */
export function selectedBody(value: unknown): {
    variant: string | null;
    body: Record<string, unknown>;
} {
    const encoder = record(value);
    const variant = Object.keys(encoder)[0] ?? null;
    return variant === null
        ? { variant: null, body: {} }
        : { variant, body: record(encoder[variant]) };
}

/**
 * The engine variant a saved build starts from.
 *
 * A build's `default` is a complete engine encoder document, so the variant comes from its
 * own key rather than from a table the fork may predate. A build with no document cannot be
 * selected, because there is nothing to seed the project with.
 */
export function forkVariant(fork: EncoderDescriptor): string | null {
    return Object.keys(record(fork.default))[0] ?? null;
}

/** Compare two executable paths, tolerating the separators Windows returns in either form. */
export function sameBuildPath(
    left: string | null | undefined,
    right: string | null | undefined,
): boolean {
    if (left === null || left === undefined || right === null || right === undefined) {
        return false;
    }
    const normalize = (value: string) =>
        value.trim().replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
    return left.trim() !== "" && normalize(left) === normalize(right);
}

/**
 * The engine encoder document a saved build starts from.
 *
 * The build's own document already names its executable and its starting options, so it is
 * copied rather than reconstructed from the base encoder. This is the only way a build's
 * custom flags reach a project without being retyped; a build with no document seeds
 * nothing and is therefore not selectable.
 */
export function buildDocument(
    fork: EncoderDescriptor,
): { variant: string; body: Record<string, unknown> } | null {
    const variant = forkVariant(fork);
    if (variant === null) {
        return null;
    }
    const body = { ...record(record(fork.default)[variant]) };
    body.executable = fork.executable ?? null;
    body.options = record(body.options);
    if (hasField(variant, "pass") && body.pass === undefined) {
        body.pass = { All: 1 };
    }
    if (hasField(variant, "append_color_data") && body.append_color_data === undefined) {
        body.append_color_data = true;
    }
    if (hasField(variant, "ffmpeg_filter") && body.ffmpeg_filter === undefined) {
        body.ffmpeg_filter = null;
    }
    if (hasField(variant, "photon_noise") && body.photon_noise === undefined) {
        body.photon_noise = null;
    }
    return { variant, body };
}

/** The properties the selected variant actually carries, from the engine schema. */
export function variantSchema(
    root: JsonSchema,
    node: JsonSchema,
    variant: string | null,
): JsonSchema {
    if (variant === null) {
        return {};
    }
    const encoder = resolveSchema(root, node);
    const option = encoder.oneOf?.find((entry) => entry.properties?.[variant] !== undefined);
    const body = option?.properties?.[variant];
    return body === undefined ? {} : resolveSchema(root, body);
}

/**
 * `EncoderPasses` is always `All(n)` in this application.
 *
 * A specific pass belongs to an encoder's own multipass bookkeeping, not to a project
 * document, so the editor has one number and writes one variant.
 */
export function passCount(pass: unknown): number {
    const entry = record(pass);
    return typeof entry.All === "number" ? entry.All : 1;
}

export function nullableNumber(value: unknown): string {
    return typeof value === "number" ? String(value) : "";
}

/** The argv this encoder document would receive, for review before a run. */
export function commandPreview(
    executable: string | null,
    label: string,
    variant: string | null,
    options: Record<string, unknown>,
): string {
    const parts = [executable ?? label.toLowerCase().replaceAll(/\s+/gu, "-")];
    if (variant === "SVTAV1") {
        parts.push("--preset", "4");
    }
    for (const [name, parameter] of Object.entries(options)) {
        const fragment = previewOption(name, parameter);
        if (fragment !== null) {
            parts.push(fragment);
        }
    }
    return parts.join(" ");
}

/**
 * Whether one encoder body carries a field, read from the static list rather than the schema
 * so switching encoder can seed a complete body before React has rendered the new variant.
 */
export function hasField(variant: string, field: string): boolean {
    const photon = ["AOM", "RAV1E", "SVTAV1", "AVM"];
    if (field === "photon_noise") {
        return photon.includes(variant);
    }
    if (field === "pass") {
        return variant !== "FFmpeg";
    }
    if (field === "ffmpeg_filter") {
        return variant !== "FFmpeg";
    }
    if (field === "append_color_data") {
        return true;
    }
    return true;
}
