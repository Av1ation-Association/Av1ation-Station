import { useEffect, useId, useState } from "react";

import type {
    ConcatInventory,
    ConcatMethodName,
    ConcatSourceTrack,
    ConcatTrackKind,
} from "@av1ation/contracts";
import { ChevronDown, FolderOpen, Lock, RefreshCw, SlidersHorizontal, X } from "lucide-react";

import { Button } from "../../shared/Button";
import { setDraftBlocker } from "../../shared/draft-blockers";
import { Sheet } from "../../shared/Sheet";
import { Switch } from "../../shared/Switch";
import {
    SchemaObjectFields,
    resolveSchema,
    type JsonSchema,
} from "../../shared/schema/config-schema";
import {
    attachmentProblems,
    isIncluded,
    materialize,
    nextAttachmentKey,
    optionCount,
    selectableTracks,
    trackKey,
    withTrackIncluded,
    withTrackOptions,
    withoutKey,
    type InputScope,
    type TrackMap,
} from "./concat-model";

export type { TrackMap } from "./concat-model";

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

const GROUP_TITLES: Record<ConcatTrackKind | "attachment", string> = {
    video: "Video",
    audio: "Audio",
    subtitle: "Subtitles",
    attachment: "Attachments",
};

const FIELD_CLASS =
    "h-8 w-full rounded-md border border-line bg-sunken px-2 text-[11px] text-ink outline-none placeholder:text-ink-muted focus:border-brand disabled:opacity-50";

/** An optional string field is absent when cleared, not an empty override. */
function optionalText(value: string): string | null {
    return value.trim() === "" ? null : value;
}

function trackDetail(track: ConcatSourceTrack): string {
    const bits = [String(track.key), track.codec ?? "Unknown"];
    if (track.kind === "audio" && track.channels !== null) {
        bits.push(`${String(track.channels)} ch`);
    }
    if (track.language !== null) {
        bits.push(track.language);
    }
    if (track.default) {
        bits.push("default");
    }
    return bits.join(" · ");
}

/** The container's own title wins over the probe's generated row label. */
function trackName(track: ConcatSourceTrack): string {
    const name = track.name?.trim();
    return name === undefined || name === "" ? track.label : name;
}

function variantType(node: JsonSchema): unknown {
    return node.properties?.type?.const ?? node.properties?.type?.enum?.[0];
}

/**
 * The generated track variant for one row kind.
 *
 * The fields come from the engine schema, never a hand-written list, so an encoder knob
 * added upstream appears here without a UI change. `type` and `copy` belong to the row, and
 * FFmpeg's video filter is omitted because it would filter the encoded scenes.
 */
export function trackOptionFields(
    root: JsonSchema | undefined,
    method: ConcatMethodName,
    kind: ConcatTrackKind,
): JsonSchema | null {
    if (root === undefined) {
        return null;
    }
    const def = root.$defs?.[method === "mkvmerge" ? "MkvmergeTrack" : "FfmpegTrack"];
    const direct = def === undefined ? null : resolveSchema(root, def);
    let variants = direct?.oneOf ?? direct?.anyOf ?? [];
    if (variants.length === 0) {
        const config = root.$defs?.[method === "mkvmerge" ? "MkvmergeConfig" : "FfmpegConfig"];
        const tracks = config?.properties?.tracks;
        const mapNode =
            tracks?.anyOf?.find((entry) => entry.additionalProperties !== undefined) ?? tracks;
        const additional = mapNode?.additionalProperties;
        const map =
            additional === undefined || typeof additional === "boolean"
                ? null
                : resolveSchema(root, additional);
        variants = map?.oneOf ?? map?.anyOf ?? [];
    }
    const variant = variants.find((entry) => variantType(entry) === kind);
    if (variant === undefined) {
        return null;
    }
    const resolved = resolveSchema(root, variant);
    const properties = { ...resolved.properties };
    delete properties.type;
    delete properties.copy;
    if (method === "ffmpeg" && kind === "video") {
        delete properties.filter;
    }
    return { ...resolved, properties, required: [] };
}

function GroupHeader({
    title,
    included,
    total,
    open,
    onToggle,
}: {
    title: string;
    included: number;
    total: number;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex w-full items-center gap-2 border-b border-line-subtle bg-raised/50 px-3 py-2 text-left"
        >
            <ChevronDown
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 text-ink-muted transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
            />
            <span className="min-w-0 flex-1 text-[10px] font-semibold tracking-[0.08em] text-ink-secondary uppercase">
                {title}
            </span>
            <span className="font-mono text-[9px] text-ink-muted tabular-nums">
                {included} / {total}
            </span>
        </button>
    );
}

/**
 * The track map is the core of the Method card.
 *
 * Rows are grouped by kind, and every row's switch is the shared `Switch`. Attachments on
 * mkvmerge share a numeric namespace with track IDs, so they are copied all-or-nothing and
 * carry a state label instead of a switch; an attachment the user adds is still removable.
 */
export function TrackMapPanel({
    method,
    scope,
    tracks,
    inventory,
    detail,
    pending = false,
    error = null,
    locked = false,
    optionRoot,
    pickFile,
    onChange,
    onProbe,
}: {
    method: ConcatMethodName;
    scope: InputScope;
    tracks: TrackMap;
    inventory?: ConcatInventory | undefined;
    detail?: string | undefined;
    pending?: boolean;
    error?: string | null;
    locked?: boolean;
    optionRoot?: JsonSchema | undefined;
    /** The host's native file picker, absent where the host has none. */
    pickFile?: (() => Promise<string | null>) | undefined;
    onChange: (next: Record<string, unknown> | null) => void;
    onProbe: () => void;
}) {
    const [closed, setClosed] = useState<Record<string, boolean>>({
        subtitle: true,
        attachment: true,
    });
    const [openOptions, setOpenOptions] = useState<string | null>(null);
    const [browseError, setBrowseError] = useState<string | null>(null);
    const blockerId = useId();
    const errorId = useId();

    const rows = inventory === undefined ? [] : selectableTracks(method, inventory, scope);
    const attachments = inventory?.attachments ?? [];
    const selectableAttachments = attachments.filter((attachment) => attachment.selectable);
    const map = tracks ?? {};

    const groups: Array<{ kind: ConcatTrackKind; rows: ConcatSourceTrack[] }> = [
        { kind: "video", rows: rows.filter((row) => row.kind === "video") },
        { kind: "audio", rows: rows.filter((row) => row.kind === "audio") },
        { kind: "subtitle", rows: rows.filter((row) => row.kind === "subtitle") },
    ].filter((group) => group.rows.length > 0);

    const additions = Object.entries(map).filter(([, value]) => {
        const entry = asRecord(value);
        return typeof entry?.path === "string";
    });
    const blocker = additions.reduce<string | null>((reason, [key, value]) => {
        if (reason !== null) {
            return reason;
        }
        const problems = attachmentProblems(method, value);
        if (problems.path !== null) {
            return `Added attachment ${key} has no file path. Choose a file before saving.`;
        }
        if (problems.mimeType !== null) {
            return `Added attachment ${key} needs a MIME type before FFmpeg can write it.`;
        }
        return null;
    }, null);
    useEffect(() => {
        setDraftBlocker(blockerId, blocker);
        return () => setDraftBlocker(blockerId, null);
    }, [blockerId, blocker]);
    const known = new Set<string>([
        ...rows.map(trackKey),
        ...selectableAttachments.map((attachment) => String(attachment.key)),
        ...additions.map(([key]) => key),
        ...(scope === "main" ? ["0"] : []),
    ]);
    const unmatched = Object.keys(map).filter((key) => !known.has(key));
    const optionTarget =
        openOptions === null
            ? null
            : (rows.find((track) => trackKey(track) === openOptions) ?? null);
    const optionFields =
        optionTarget === null || optionRoot === undefined
            ? null
            : trackOptionFields(optionRoot, method, optionTarget.kind);
    const optionValue =
        optionTarget === null
            ? {}
            : (asRecord(map[trackKey(optionTarget)]) ?? {
                  type: optionTarget.kind,
                  copy: true,
              });

    const attachmentIncluded = attachments.filter(
        (attachment) => !attachment.selectable || isIncluded(tracks, String(attachment.key)),
    ).length;
    const total = rows.length + (scope === "main" ? 1 : 0) + attachments.length;
    const included =
        rows.filter((row) => isIncluded(tracks, trackKey(row))).length +
        (scope === "main" ? 1 : 0) +
        attachmentIncluded;

    const toggle = (key: string, next: boolean) => {
        onChange(withTrackIncluded(method, tracks, inventory, scope, key, next));
        if (!next) {
            setOpenOptions(null);
        }
    };

    const updateAddition = (key: string, patch: Record<string, unknown>) => {
        const entry = asRecord(map[key]) ?? { type: "attachment", copy: true, path: "" };
        onChange({ ...map, [key]: { ...entry, ...patch } });
    };

    const addAttachment = () => {
        const key = String(nextAttachmentKey(tracks, inventory));
        const next = {
            ...materialize(method, inventory, scope),
            ...(tracks ?? {}),
            [key]: { type: "attachment", copy: true, path: "" },
        };
        onChange(next);
        setClosed((previous) => ({ ...previous, attachment: false }));
    };

    const browseAttachment = async (key: string) => {
        if (pickFile === undefined) {
            return;
        }
        setBrowseError(null);
        try {
            const selected = await pickFile();
            if (selected !== null) {
                updateAddition(key, { path: selected });
            }
        } catch (error) {
            setBrowseError(
                error instanceof Error ? error.message : "The file picker could not open.",
            );
        }
    };

    return (
        <div className="border-t border-line px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="m-0 text-[13px] font-semibold text-ink">Track map</h3>
                    <p className="mt-0.5 mb-0 max-w-[72ch] text-[10.5px] leading-relaxed text-ink-muted">
                        Choose what travels with the encoded video. Rows are keyed exactly as{" "}
                        {method === "mkvmerge" ? "mkvmerge" : "FFmpeg"} numbers them; an unmatched
                        saved key is kept rather than guessed at.
                    </p>
                </div>
                <Button
                    variant="secondary"
                    className="h-8 shrink-0 px-2.5 text-[11px]"
                    disabled={pending}
                    onClick={onProbe}
                >
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    Probe again
                </Button>
            </div>

            {error === null ? null : (
                <p
                    role="alert"
                    className="mt-3 mb-0 rounded-md border border-danger/40 bg-danger-soft px-2.5 py-2 text-[11px] leading-relaxed text-danger"
                >
                    {error}
                </p>
            )}

            {browseError === null ? null : (
                <p role="alert" className="mt-3 mb-0 text-[10.5px] leading-relaxed text-danger">
                    {browseError}
                </p>
            )}

            <div className="mt-3 overflow-hidden rounded-lg border border-line bg-sunken">
                <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
                    <span className="text-[11px] font-medium text-ink">
                        {scope === "main" ? "Main input" : "Extra input"}
                    </span>
                    <span className="font-mono text-[9.5px] text-ink-muted tabular-nums">
                        {included} included · {total} total
                    </span>
                </div>

                {pending ? (
                    <div className="space-y-2 px-3 py-3" aria-busy="true">
                        <div className="h-4 w-2/3 animate-pulse rounded bg-raised" />
                        <div className="h-4 w-1/2 animate-pulse rounded bg-raised" />
                    </div>
                ) : null}

                {!pending && scope === "main" ? (
                    <div className="flex items-center gap-3 border-b border-line-subtle px-3 py-2.5">
                        <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                        <div className="min-w-0 flex-1">
                            <p className="m-0 text-[11.5px] text-ink-muted">Video · encoded</p>
                            <p className="m-0 text-[10px] text-ink-muted">
                                From the encoded scenes
                            </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 font-mono text-[8.5px] tracking-[0.1em] text-ink-muted uppercase">
                            Always
                        </span>
                    </div>
                ) : null}

                {!pending
                    ? groups.map((group) => {
                          const open = closed[group.kind] !== true;
                          const groupIncluded = group.rows.filter((row) =>
                              isIncluded(tracks, trackKey(row)),
                          ).length;
                          return (
                              <div key={group.kind}>
                                  <GroupHeader
                                      title={GROUP_TITLES[group.kind] ?? "Tracks"}
                                      included={groupIncluded}
                                      total={group.rows.length}
                                      open={open}
                                      onToggle={() =>
                                          setClosed((previous) => ({
                                              ...previous,
                                              [group.kind]: open,
                                          }))
                                      }
                                  />
                                  {!open
                                      ? null
                                      : group.rows.map((track) => {
                                            const key = trackKey(track);
                                            const name = trackName(track);
                                            const on = isIncluded(tracks, key);
                                            const overrides = optionCount(map[key]);
                                            return (
                                                <div
                                                    key={key}
                                                    className="border-b border-line-subtle last:border-b-0"
                                                >
                                                    <div className="flex items-center gap-3 px-3 py-2.5">
                                                        <Switch
                                                            checked={on}
                                                            disabled={locked}
                                                            label={`Include ${name}`}
                                                            onChange={(next) => toggle(key, next)}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="m-0 truncate text-[11.5px] font-medium text-ink">
                                                                {name}
                                                            </p>
                                                            <p className="m-0 truncate font-mono text-[9.5px] text-ink-muted">
                                                                {trackDetail(track)}
                                                            </p>
                                                        </div>
                                                        <span
                                                            className={`shrink-0 text-[9.5px] ${on ? "text-ink-secondary" : "text-ink-muted"}`}
                                                        >
                                                            {on ? "Copied" : "Dropped"}
                                                        </span>
                                                        {overrides === 0 ? null : (
                                                            <span
                                                                aria-label={`${String(overrides)} ${
                                                                    overrides === 1
                                                                        ? "option"
                                                                        : "options"
                                                                } set`}
                                                                title="Non-default options"
                                                                className="shrink-0 rounded-full border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-[8.5px] leading-none text-ink-secondary tabular-nums"
                                                            >
                                                                {overrides}
                                                            </span>
                                                        )}
                                                        {!on || optionRoot === undefined ? null : (
                                                            <button
                                                                type="button"
                                                                aria-haspopup="dialog"
                                                                aria-label={`Options for ${name}`}
                                                                disabled={locked}
                                                                onClick={() => setOpenOptions(key)}
                                                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-ink-muted hover:border-line hover:text-ink disabled:opacity-40"
                                                            >
                                                                <SlidersHorizontal
                                                                    aria-hidden="true"
                                                                    className="h-3.5 w-3.5"
                                                                />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                              </div>
                          );
                      })
                    : null}

                {!pending && (scope === "main" || attachments.length > 0) ? (
                    <div>
                        <GroupHeader
                            title={GROUP_TITLES.attachment ?? "Attachments"}
                            included={attachmentIncluded}
                            total={attachments.length}
                            open={closed.attachment !== true}
                            onToggle={() =>
                                setClosed((previous) => ({
                                    ...previous,
                                    attachment: previous.attachment !== true,
                                }))
                            }
                        />
                        {closed.attachment === true ? null : (
                            <>
                                {attachments.map((attachment) => {
                                    const key = String(attachment.key);
                                    const on = isIncluded(tracks, key);
                                    return (
                                        <div
                                            key={`source-${key}`}
                                            className="flex items-center gap-3 border-b border-line-subtle px-3 py-2.5"
                                        >
                                            {attachment.selectable ? (
                                                <Switch
                                                    checked={on}
                                                    disabled={locked}
                                                    label={`Include ${attachment.label}`}
                                                    onChange={(next) => toggle(key, next)}
                                                />
                                            ) : (
                                                <Lock
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="m-0 truncate text-[11.5px] font-medium text-ink">
                                                    {attachment.label}
                                                </p>
                                                <p className="m-0 truncate font-mono text-[9.5px] text-ink-muted">
                                                    {key}
                                                    {attachment.mime_type === null
                                                        ? ""
                                                        : ` · ${attachment.mime_type}`}
                                                    {attachment.size_bytes === null
                                                        ? ""
                                                        : ` · ${(attachment.size_bytes / 1024).toFixed(1)} KiB`}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-[9.5px] text-ink-secondary">
                                                {attachment.selectable
                                                    ? on
                                                        ? "Copied"
                                                        : "Dropped"
                                                    : "Copy all"}
                                            </span>
                                        </div>
                                    );
                                })}
                                {additions.map(([key, value]) => {
                                    const entry = asRecord(value) ?? {};
                                    const name =
                                        typeof entry.attachment_name === "string"
                                            ? entry.attachment_name
                                            : "";
                                    const path = typeof entry.path === "string" ? entry.path : "";
                                    const description =
                                        typeof entry.attachment_description === "string"
                                            ? entry.attachment_description
                                            : "";
                                    const mimeType =
                                        typeof entry.attachment_mime_type === "string"
                                            ? entry.attachment_mime_type
                                            : "";
                                    const problems = attachmentProblems(method, entry);
                                    const pathErrorId = `${errorId}-${key}-path`;
                                    const mimeErrorId = `${errorId}-${key}-mime`;
                                    return (
                                        <div
                                            key={`added-${key}`}
                                            className="border-b border-line-subtle last:border-b-0"
                                        >
                                            <div className="flex items-center gap-3 px-3 py-2.5">
                                                <Lock
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="m-0 truncate text-[11.5px] font-medium text-ink">
                                                        {name !== "" ? name : "Added attachment"}
                                                    </p>
                                                    <p className="m-0 truncate font-mono text-[9.5px] text-ink-muted">
                                                        {path === "" ? "No file chosen" : path}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] text-brand uppercase">
                                                    Added
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label={`Remove attachment ${key}`}
                                                    disabled={locked}
                                                    onClick={() =>
                                                        onChange(withoutKey(tracks, key))
                                                    }
                                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-ink-muted hover:border-line hover:text-danger disabled:opacity-40"
                                                >
                                                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                            <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
                                                <div className="block sm:col-span-2">
                                                    <span className="mb-1 block text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                                        File
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            aria-label={`Added attachment ${key} path`}
                                                            aria-invalid={
                                                                problems.path === null
                                                                    ? undefined
                                                                    : true
                                                            }
                                                            aria-describedby={
                                                                problems.path === null
                                                                    ? undefined
                                                                    : pathErrorId
                                                            }
                                                            className={`${FIELD_CLASS} min-w-0 flex-1 ${problems.path === null ? "" : "border-danger"}`}
                                                            value={path}
                                                            disabled={locked}
                                                            placeholder="Absolute path to the attachment"
                                                            onChange={(event) =>
                                                                updateAddition(key, {
                                                                    path: event.target.value,
                                                                })
                                                            }
                                                        />
                                                        {pickFile === undefined ? null : (
                                                            <Button
                                                                variant="secondary"
                                                                aria-label={`Browse for added attachment ${key}`}
                                                                className="h-8 shrink-0 px-2.5 text-[11px]"
                                                                disabled={locked}
                                                                onClick={() =>
                                                                    void browseAttachment(key)
                                                                }
                                                            >
                                                                <FolderOpen
                                                                    aria-hidden="true"
                                                                    className="h-3.5 w-3.5"
                                                                />
                                                                Browse
                                                            </Button>
                                                        )}
                                                    </div>
                                                    {problems.path === null ? null : (
                                                        <p
                                                            id={pathErrorId}
                                                            className="mt-1 mb-0 text-[10px] leading-relaxed text-danger"
                                                        >
                                                            {problems.path}
                                                        </p>
                                                    )}
                                                </div>
                                                <label className="block">
                                                    <span className="mb-1 block text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                                        Name
                                                    </span>
                                                    <input
                                                        aria-label={`Added attachment ${key} name`}
                                                        className={FIELD_CLASS}
                                                        value={name}
                                                        disabled={locked}
                                                        placeholder="Optional display name"
                                                        onChange={(event) =>
                                                            updateAddition(key, {
                                                                attachment_name: optionalText(
                                                                    event.target.value,
                                                                ),
                                                            })
                                                        }
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="mb-1 block text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                                        MIME type
                                                        {method === "ffmpeg" ? " · required" : ""}
                                                    </span>
                                                    <input
                                                        aria-label={`Added attachment ${key} MIME type`}
                                                        aria-invalid={
                                                            problems.mimeType === null
                                                                ? undefined
                                                                : true
                                                        }
                                                        aria-describedby={
                                                            problems.mimeType === null
                                                                ? undefined
                                                                : mimeErrorId
                                                        }
                                                        className={`${FIELD_CLASS} ${problems.mimeType === null ? "" : "border-danger"}`}
                                                        value={mimeType}
                                                        disabled={locked}
                                                        placeholder="image/jpeg"
                                                        onChange={(event) =>
                                                            updateAddition(key, {
                                                                attachment_mime_type: optionalText(
                                                                    event.target.value,
                                                                ),
                                                            })
                                                        }
                                                    />
                                                    {problems.mimeType === null ? null : (
                                                        <p
                                                            id={mimeErrorId}
                                                            className="mt-1 mb-0 text-[10px] leading-relaxed text-danger"
                                                        >
                                                            {problems.mimeType}
                                                        </p>
                                                    )}
                                                </label>
                                                <label className="block sm:col-span-2">
                                                    <span className="mb-1 block text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                                        Description
                                                    </span>
                                                    <input
                                                        aria-label={`Added attachment ${key} description`}
                                                        className={FIELD_CLASS}
                                                        value={description}
                                                        disabled={locked}
                                                        placeholder="Optional description"
                                                        onChange={(event) =>
                                                            updateAddition(key, {
                                                                attachment_description:
                                                                    optionalText(
                                                                        event.target.value,
                                                                    ),
                                                            })
                                                        }
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    );
                                })}
                                {method === "mkvmerge" ? (
                                    <p className="m-0 px-3 py-2 text-[10px] leading-relaxed text-ink-muted">
                                        Source attachments are copied together. Their IDs share a
                                        numeric namespace with mkvmerge track IDs, so they cannot be
                                        toggled row by row.
                                    </p>
                                ) : null}
                                {scope === "main" ? (
                                    <div className="px-3 py-2">
                                        <Button
                                            variant="secondary"
                                            className="h-7 px-2 text-[10.5px]"
                                            disabled={locked}
                                            onClick={addAttachment}
                                        >
                                            Add attachment
                                        </Button>
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>
                ) : null}

                {!pending &&
                rows.length === 0 &&
                additions.length === 0 &&
                attachments.length === 0 ? (
                    <p className="m-0 px-3 py-4 text-[11px] leading-relaxed text-ink-muted">
                        {detail ?? "No streams were found for this input."}
                    </p>
                ) : null}

                {!pending && unmatched.length > 0 ? (
                    <div className="border-t border-line px-3 py-2">
                        <p className="m-0 text-[10px] leading-relaxed text-ink-muted">
                            Saved keys the probe did not report: {unmatched.join(", ")}. They are
                            kept so a temporary probe failure does not erase them.
                        </p>
                    </div>
                ) : null}
            </div>

            <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                {scope === "main"
                    ? "The encoded video is always included. Source video is never copied here."
                    : method === "mkvmerge"
                      ? "This extra input's video can be merged; its audio, subtitles, and attachments follow the same map."
                      : "FFmpeg never maps a second source video; its audio and subtitles can be copied."}
            </p>

            {optionTarget !== null && optionFields !== null && optionRoot !== undefined ? (
                <TrackOptionsSheet
                    title={`${trackName(optionTarget)} options`}
                    root={optionRoot}
                    schema={optionFields}
                    initial={optionValue}
                    onClose={() => setOpenOptions(null)}
                    onApply={(next) => {
                        onChange(
                            withTrackOptions(
                                method,
                                tracks,
                                inventory,
                                scope,
                                trackKey(optionTarget),
                                next,
                            ),
                        );
                        setOpenOptions(null);
                    }}
                />
            ) : null}
        </div>
    );
}

/**
 * One track's engine fields, staged in the shared sheet.
 *
 * The map row keeps its geometry whether a track has two options or twenty. Edits are
 * applied only by the footer, so closing the sheet with Escape or Cancel leaves the draft
 * map untouched.
 */
function TrackOptionsSheet({
    title,
    root,
    schema,
    initial,
    onClose,
    onApply,
}: {
    title: string;
    root: JsonSchema;
    schema: JsonSchema;
    initial: Record<string, unknown>;
    onClose: () => void;
    onApply: (next: Record<string, unknown>) => void;
}) {
    const [draft, setDraft] = useState<Record<string, unknown>>(initial);

    return (
        <Sheet
            open
            eyebrow="TRACK MAP · OPTIONS"
            title={title}
            description="Only this track changes. Fields come from the engine schema for this method and stream kind."
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => onApply(draft)}>Apply</Button>
                </>
            }
        >
            <SchemaObjectFields
                root={root}
                schema={schema}
                value={draft}
                onChange={(next) => setDraft(asRecord(next) ?? {})}
                depth={0}
            />
        </Sheet>
    );
}
