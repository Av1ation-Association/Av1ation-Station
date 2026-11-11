/**
 * The concatenation workbench's pure model.
 *
 * Every helper that interprets a key receives the input scope, because key `0` is the
 * encoded video on the main input and a real source video on an mkvmerge extra input. The
 * model never invents an offset between mkvmerge IDs and FFmpeg stream indices.
 */
import type {
    ConcatInventory,
    ConcatMethodName,
    ConcatSourceTrack,
    ConcatTrackKind,
} from "@av1ation/contracts";

/** The engine's track map: `null` means include every source stream. */
export type TrackMap = Record<string, unknown> | null | undefined;

/** Which input a map belongs to. */
export type InputScope = "main" | "extra";

export type ChaptersValue = {
    copy: boolean;
    language: string | null;
    charset: string | null;
};

export type MetadataValue = {
    copy: boolean;
    title: string | null;
    tags: Record<string, string>;
};

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/** The source key exactly as the probe reported it. No arithmetic. */
export function trackKey(track: ConcatSourceTrack): string {
    return String(track.key);
}

/** The rows the workbench may include at this scope. */
export function selectableTracks(
    method: ConcatMethodName,
    inventory: ConcatInventory,
    scope: InputScope,
): ConcatSourceTrack[] {
    return inventory.tracks.filter((track) => {
        if (track.kind !== "video") {
            return true;
        }
        // Main input video is always the encoded scenes. An mkvmerge extra input can merge
        // its own video track; FFmpeg never maps a source video.
        return scope === "extra" && method === "mkvmerge";
    });
}

function entryType(kind: ConcatTrackKind): string {
    return kind === "subtitle" ? "subtitle" : kind;
}

/** The engine entry for one source stream. */
export function trackEntry(kind: ConcatTrackKind, options?: Record<string, unknown>) {
    return { type: entryType(kind), copy: true, ...options };
}

/** The include-all proposal, materialized only when an edit needs an explicit map. */
export function materialize(
    method: ConcatMethodName,
    inventory: ConcatInventory | undefined,
    scope: InputScope,
): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    if (scope === "main") {
        // The encoded scenes are the output video. This entry declares the track the engine
        // already owns; it is not a source-video pick.
        next["0"] = { type: "video", copy: true };
    }
    if (inventory !== undefined) {
        for (const track of selectableTracks(method, inventory, scope)) {
            next[trackKey(track)] = trackEntry(track.kind);
        }
        for (const attachment of inventory.attachments) {
            if (attachment.selectable) {
                next[String(attachment.key)] = { type: "attachment", copy: true };
            }
        }
    }
    return next;
}

export function isIncluded(tracks: TrackMap, key: string): boolean {
    if (tracks === null || tracks === undefined) {
        return true;
    }
    const entry = record(tracks[key]);
    return entry === null || entry.copy !== false;
}

/**
 * How many explicit option fields one map entry carries.
 *
 * `type` and `copy` are row state, not options, and an absent value is not an override. A
 * false boolean is still explicit (`commentary: false` says the flag must be off), so only
 * null, undefined, and the empty string are ignored.
 */
export function optionCount(value: unknown): number {
    const entry = record(value);
    if (entry === null) {
        return 0;
    }
    return Object.entries(entry).filter(
        ([field, current]) =>
            field !== "type" &&
            field !== "copy" &&
            current !== null &&
            current !== undefined &&
            current !== "",
    ).length;
}

function kindOf(
    inventory: ConcatInventory | undefined,
    key: string,
): ConcatTrackKind | "attachment" {
    const track = inventory?.tracks.find((entry) => trackKey(entry) === key);
    if (track !== undefined) {
        return track.kind;
    }
    return "attachment";
}

/**
 * Writes one include/drop decision, then returns to `null` only when the map is exactly the
 * include-all proposal again: no dropped row, no option, no attachment addition, and no
 * unmatched override.
 */
export function withTrackIncluded(
    method: ConcatMethodName,
    current: TrackMap,
    inventory: ConcatInventory | undefined,
    scope: InputScope,
    key: string,
    include: boolean,
): Record<string, unknown> | null {
    const next =
        current === null || current === undefined
            ? materialize(method, inventory, scope)
            : { ...current };
    const existing = record(next[key]) ?? {};
    next[key] = {
        ...existing,
        type: existing.type ?? entryType(kindOf(inventory, key) as ConcatTrackKind),
        copy: include,
    };
    return collapse(method, next, inventory, scope);
}

function collapse(
    method: ConcatMethodName,
    next: Record<string, unknown>,
    inventory: ConcatInventory | undefined,
    scope: InputScope,
): Record<string, unknown> | null {
    const sourceKeys = new Set<string>();
    if (inventory !== undefined) {
        for (const track of selectableTracks(method, inventory, scope)) {
            sourceKeys.add(trackKey(track));
        }
        for (const attachment of inventory.attachments) {
            if (attachment.selectable) {
                sourceKeys.add(String(attachment.key));
            }
        }
    }
    for (const [key, value] of Object.entries(next)) {
        if (scope === "main" && key === "0") {
            continue;
        }
        const entry = record(value);
        if (entry === null) {
            return next;
        }
        if (entry.path !== undefined && entry.path !== null) {
            return next;
        }
        if (entry.copy === false) {
            return next;
        }
        if (Object.keys(entry).some((field) => field !== "type" && field !== "copy")) {
            return next;
        }
        if (!sourceKeys.has(key)) {
            return next;
        }
    }
    return null;
}

/** Updates one track's options, first materializing the include-all proposal. */
export function withTrackOptions(
    method: ConcatMethodName,
    current: TrackMap,
    inventory: ConcatInventory | undefined,
    scope: InputScope,
    key: string,
    options: Record<string, unknown>,
): Record<string, unknown> | null {
    const next =
        current === null || current === undefined
            ? materialize(method, inventory, scope)
            : { ...current };
    const existing = record(next[key]) ?? {};
    next[key] = {
        ...existing,
        type: existing.type ?? entryType(kindOf(inventory, key) as ConcatTrackKind),
        copy: existing.copy ?? true,
        ...options,
    };
    return collapse(method, next, inventory, scope);
}

export function withoutKey(current: TrackMap, key: string): Record<string, unknown> | null {
    if (current === null || current === undefined) {
        return null;
    }
    const next = { ...current };
    delete next[key];
    return next;
}

/** Why an added attachment cannot be written, field by field. */
export function attachmentProblems(
    method: ConcatMethodName,
    value: unknown,
): { path: string | null; mimeType: string | null } {
    const entry = record(value) ?? {};
    const path = typeof entry.path === "string" ? entry.path.trim() : "";
    const mimeType =
        typeof entry.attachment_mime_type === "string" ? entry.attachment_mime_type.trim() : "";
    return {
        path: path === "" ? "Choose a file for this attachment." : null,
        mimeType:
            method === "ffmpeg" && path !== "" && mimeType === ""
                ? "FFmpeg needs a MIME type for an attached file."
                : null,
    };
}

/** A key above every source track, source attachment, and existing addition. */
export function nextAttachmentKey(
    tracks: TrackMap,
    inventory: ConcatInventory | undefined,
): number {
    let highest = 0;
    for (const key of Object.keys(tracks ?? {})) {
        const value = Number(key);
        if (Number.isInteger(value) && value > highest) {
            highest = value;
        }
    }
    for (const track of inventory?.tracks ?? []) {
        highest = Math.max(highest, track.key);
    }
    for (const attachment of inventory?.attachments ?? []) {
        highest = Math.max(highest, attachment.key);
    }
    return highest + 1;
}

export function chaptersFor(value: unknown): ChaptersValue {
    const entry = record(value) ?? {};
    return {
        copy: entry.copy !== false,
        language: typeof entry.language === "string" ? entry.language : null,
        charset: typeof entry.charset === "string" ? entry.charset : null,
    };
}

export function withChapter(value: unknown, patch: Partial<ChaptersValue>): ChaptersValue | null {
    const next = { ...chaptersFor(value), ...patch };
    return next.copy && next.language === null && next.charset === null ? null : next;
}

export function metadataFor(value: unknown): MetadataValue {
    const entry = record(value) ?? {};
    const tags = record(entry.tags) ?? {};
    return {
        copy: entry.copy !== false,
        title: typeof entry.title === "string" ? entry.title : null,
        tags: Object.fromEntries(
            Object.entries(tags).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
        ),
    };
}

export function withMetadata(value: unknown, patch: Partial<MetadataValue>): MetadataValue | null {
    const next = { ...metadataFor(value), ...patch };
    return next.copy && next.title === null && Object.keys(next.tags).length === 0 ? null : next;
}

export function extraInputsOf(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.map(record).filter((entry) => entry !== null) : [];
}

export function withExtraInput(
    value: unknown,
    index: number,
    next: Record<string, unknown>,
): Record<string, unknown>[] {
    return extraInputsOf(value).map((entry, cursor) => (cursor === index ? next : entry));
}

export function withoutExtraInput(value: unknown, index: number): Record<string, unknown>[] {
    return extraInputsOf(value).filter((_, cursor) => cursor !== index);
}

export function moveExtraInput(
    value: unknown,
    index: number,
    delta: number,
): Record<string, unknown>[] {
    const list = extraInputsOf(value);
    const target = index + delta;
    if (target < 0 || target >= list.length) {
        return list;
    }
    const copy = [...list];
    const [entry] = copy.splice(index, 1);
    if (entry !== undefined) {
        copy.splice(target, 0, entry);
    }
    return copy;
}

/** A changed path is a different source, so its source-specific choices are cleared. */
export function withExtraPath(
    value: unknown,
    index: number,
    path: string,
): Record<string, unknown>[] {
    const current = extraInputsOf(value)[index] ?? {};
    return withExtraInput(value, index, {
        ...current,
        path,
        tracks: null,
        chapters: null,
        metadata: null,
    });
}
