import { clockParts } from "./clock";

/** Retained work only: chunks and probe files, never the source media. */
export function formatBytes(bytes: number): string {
    if (bytes <= 0) {
        return "—";
    }
    const units = ["B", "KB", "MB", "GB", "TB"] as const;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const rounded = unit === 0 || value >= 100 ? Math.round(value) : Number(value.toFixed(1));
    return `${String(rounded)} ${units[unit] ?? "B"}`;
}

/** Zero retained work is a fact, not an unknown; an em dash reads like a failed read. */
export function retainedLabel(bytes: number): string {
    return bytes <= 0 ? "No retained work" : `${formatBytes(bytes)} retained`;
}

/**
 * The preview player's position readout when the frame rate is unknown: `m:ss.s`, or
 * `h:mm:ss.s` past an hour. A position, not a duration.
 */
export function formatPlaybackClock(seconds: number): string {
    const parts = clockParts(seconds, 1);
    if (parts === null) {
        return "—";
    }
    const tail = `${String(parts.seconds).padStart(2, "0")}.${parts.fraction}`;
    return parts.hours > 0
        ? `${String(parts.hours)}:${String(parts.minutes).padStart(2, "0")}:${tail}`
        : `${String(parts.minutes)}:${tail}`;
}

/**
 * A frame position as a full `HH:MM:SS.s` timecode, when the decoder's rate is known.
 *
 * The Scenes surfaces show timecode beside frame numbers everywhere, and the board writes
 * the full clock even under a minute. A short `m:ss.s` reads as a duration, not a position.
 */
export function formatTimecode(frame: number, frameRate: number | null): string {
    if (frameRate === null || !Number.isFinite(frameRate) || frameRate <= 0) {
        return `frame ${frame.toLocaleString()}`;
    }
    const parts = clockParts(Math.max(0, frame / frameRate), 1);
    if (parts === null) {
        return `frame ${frame.toLocaleString()}`;
    }
    return `${String(parts.hours).padStart(2, "0")}:${String(parts.minutes).padStart(2, "0")}:${String(parts.seconds).padStart(2, "0")}.${parts.fraction}`;
}

/**
 * The frame a typed timecode names, or `null` when the text is not a timecode.
 *
 * Accepts what `formatTimecode` writes (`HH:MM:SS.s`) and the shorter forms a user actually
 * types (`MM:SS.s`, `SS.s`). Parsing is deliberately narrow: a transport field that silently
 * turns "abc" into frame 0 sends the picture somewhere the user did not ask for.
 */
export function parseTimecode(text: string, frameRate: number | null): number | null {
    const trimmed = text.trim();
    if (trimmed === "" || frameRate === null || !Number.isFinite(frameRate) || frameRate <= 0) {
        return null;
    }
    const parts = trimmed.split(":");
    if (parts.length > 3) {
        return null;
    }
    let seconds = 0;
    for (const part of parts) {
        if (!/^\d+(\.\d+)?$/u.test(part)) {
            return null;
        }
        seconds = seconds * 60 + Number(part);
    }
    if (!Number.isFinite(seconds) || seconds < 0) {
        return null;
    }
    return Math.round(seconds * frameRate);
}

/**
 * The frame a rail query names: a bare integer is a frame, while a decimal or colon form is
 * a timecode parsed by `parseTimecode`.
 *
 * The rail has one field for both, so the two forms need one unambiguous rule. A bare
 * integer keeps the rail's existing frame entry; a decimal point is what makes a value a
 * time. When the source length is known, a position past its last frame is refused.
 */
export function parseFrameQuery(
    text: string,
    frameRate: number | null,
    lastFrame: number | null,
): number | null {
    const trimmed = text.trim();
    if (trimmed === "") {
        return null;
    }
    const frame = /^\d+$/u.test(trimmed) ? Number(trimmed) : parseTimecode(trimmed, frameRate);
    if (frame === null || !Number.isSafeInteger(frame) || frame < 0) {
        return null;
    }
    return lastFrame === null || frame <= lastFrame ? frame : null;
}

/** The last component of a Windows or POSIX path. */
export function baseName(path: string): string {
    const parts = path.split(/[\\/]/u);
    return parts[parts.length - 1] ?? path;
}

import type { GeneralDefaults } from "@av1ation/contracts";

/**
 * The output path a video would get from the project defaults. The service owns the real
 * derivation; this mirrors it for the preview so the form says what Save will produce.
 */
export function deriveOutputPath(
    general: Pick<GeneralDefaults, "output_mode"> & {
        output_folder?: string | null | undefined;
    },
    input: string,
): string {
    const segments = input.split(/[\\/]/u);
    const file = segments.pop() ?? "";
    const stem = file.replace(/\.[^.]+$/u, "");
    if (stem === "") {
        return "";
    }
    const folder =
        general.output_mode === "folder" ? (general.output_folder ?? "") : segments.join("\\");
    return `${folder.replace(/[\\/]$/u, "")}\\${stem}.av1.mkv`;
}

/** Everything before the last separator, or an empty string when there is none. */
export function parentPath(path: string): string {
    const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return index > 0 ? path.slice(0, index) : "";
}
