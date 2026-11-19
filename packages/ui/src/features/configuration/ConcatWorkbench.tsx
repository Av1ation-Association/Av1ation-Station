import { useState, type ReactNode } from "react";

import { useConcatInventory, usePickFile } from "@av1ation/api";
import type { ConcatMethodName } from "@av1ation/contracts";
import { ChevronDown, Plus } from "lucide-react";

import { Button } from "../../shared/Button";
import { RemoveButton } from "../../shared/RemoveButton";
import { Switch } from "../../shared/Switch";
import type { JsonSchema } from "../../shared/schema/config-schema";
import {
    chaptersFor,
    extraInputsOf,
    metadataFor,
    moveExtraInput,
    withChapter,
    withExtraInput,
    withExtraPath,
    withMetadata,
    withoutExtraInput,
    type TrackMap,
} from "./concat-model";
import { SourceDetailsSheet, type SourceDetailsView } from "./ConcatSourceDetails";
import { TrackMapPanel } from "./TrackMapEditor";

const FIELD_CLASS =
    "h-8 w-full rounded-md border border-line bg-sunken px-2 text-[11px] text-ink outline-none placeholder:text-ink-muted focus:border-brand disabled:opacity-50";

function Panel({
    title,
    description,
    aside,
    children,
}: {
    title: string;
    description: string;
    aside?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="mt-4 rounded-lg border border-line bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                    <h3 className="m-0 text-[13px] font-semibold text-ink">{title}</h3>
                    <p className="mt-0.5 mb-0 max-w-[72ch] text-[10.5px] leading-relaxed text-ink-muted">
                        {description}
                    </p>
                </div>
                {aside}
            </div>
            <div className="px-4 py-3.5 sm:px-5">{children}</div>
        </section>
    );
}

/**
 * Chapters copy is method-specific: FFmpeg can only copy the source chapters, while
 * mkvmerge can also rewrite their language and character set.
 */
export function ChaptersPanel({
    method,
    value,
    chapterCount,
    locked,
    onChange,
    onViewChapters,
}: {
    method: ConcatMethodName;
    value: unknown;
    chapterCount: number | null;
    locked: boolean;
    onChange: (next: unknown) => void;
    onViewChapters?: (() => void) | undefined;
}) {
    const chapters = chaptersFor(value);
    return (
        <Panel
            title="Chapters"
            description="Chapters are read from the source; the encoded chunks carry none of their own."
            aside={
                <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[9px] text-ink-muted tabular-nums">
                        {chapterCount === null ? "count unknown" : `${String(chapterCount)} source`}
                    </span>
                    {onViewChapters === undefined || chapterCount === 0 ? null : (
                        <Button
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={onViewChapters}
                        >
                            View chapters
                        </Button>
                    )}
                </div>
            }
        >
            <div className="flex items-center gap-3">
                <Switch
                    checked={chapters.copy}
                    disabled={locked}
                    label="Copy source chapters"
                    onChange={(next) => onChange(withChapter(value, { copy: next }))}
                />
                <div className="min-w-0 flex-1">
                    <p className="m-0 text-[11.5px] font-medium text-ink">Copy source chapters</p>
                    <p className="m-0 text-[10px] text-ink-muted">
                        {chapters.copy
                            ? "The source chapter list is written to the output."
                            : "The output has no chapter list."}
                    </p>
                </div>
                <span className="shrink-0 text-[9.5px] text-ink-secondary">
                    {chapters.copy ? "Copied" : "Dropped"}
                </span>
            </div>

            {chapters.copy && method === "mkvmerge" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                            Language
                        </span>
                        <input
                            className={FIELD_CLASS}
                            value={chapters.language ?? ""}
                            disabled={locked || !chapters.copy}
                            placeholder="eng"
                            onChange={(event) =>
                                onChange(
                                    withChapter(value, {
                                        language:
                                            event.target.value === "" ? null : event.target.value,
                                    }),
                                )
                            }
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                            Character set
                        </span>
                        <input
                            className={FIELD_CLASS}
                            value={chapters.charset ?? ""}
                            disabled={locked || !chapters.copy}
                            placeholder="UTF-8"
                            onChange={(event) =>
                                onChange(
                                    withChapter(value, {
                                        charset:
                                            event.target.value === "" ? null : event.target.value,
                                    }),
                                )
                            }
                        />
                    </label>
                </div>
            ) : null}

            {chapters.copy && method === "ffmpeg" ? (
                <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                    FFmpeg copies the source chapter list as-is; it cannot set a chapter language or
                    character set.
                </p>
            ) : null}
        </Panel>
    );
}

/**
 * Metadata copy-all or an explicit title and tag map. FFmpeg has no tag-writing path, so
 * only the copy switch is offered there.
 */
export function MetadataPanel({
    method,
    value,
    locked,
    onChange,
    onViewMetadata,
}: {
    method: ConcatMethodName;
    value: unknown;
    locked: boolean;
    onChange: (next: unknown) => void;
    onViewMetadata?: (() => void) | undefined;
}) {
    const metadata = metadataFor(value);
    const entries = Object.entries(metadata.tags);

    const setTags = (tags: Record<string, string>) => {
        onChange(withMetadata(value, { tags }));
    };

    return (
        <Panel
            title="Metadata"
            description="The container title and tags. Copy all is the default; an explicit map replaces it."
            aside={
                onViewMetadata === undefined ? undefined : (
                    <Button
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        onClick={onViewMetadata}
                    >
                        View metadata
                    </Button>
                )
            }
        >
            <div className="flex items-center gap-3">
                <Switch
                    checked={metadata.copy}
                    disabled={locked}
                    label="Copy source metadata"
                    onChange={(next) => onChange(withMetadata(value, { copy: next }))}
                />
                <div className="min-w-0 flex-1">
                    <p className="m-0 text-[11.5px] font-medium text-ink">Copy source metadata</p>
                    <p className="m-0 text-[10px] text-ink-muted">
                        {metadata.copy
                            ? "Titles and tags from the source are kept."
                            : "Only the settings below are written."}
                    </p>
                </div>
                <span className="shrink-0 text-[9.5px] text-ink-secondary">
                    {metadata.copy ? "Copied" : "Explicit"}
                </span>
            </div>

            {method === "mkvmerge" ? (
                <>
                    <label className="mt-3 block">
                        <span className="mb-1 block text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                            Title
                        </span>
                        <input
                            className={FIELD_CLASS}
                            value={metadata.title ?? ""}
                            disabled={locked}
                            placeholder="Leave empty to keep the source title"
                            onChange={(event) =>
                                onChange(
                                    withMetadata(value, {
                                        title:
                                            event.target.value === "" ? null : event.target.value,
                                    }),
                                )
                            }
                        />
                    </label>

                    <div className="mt-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                Tags
                            </span>
                            <Button
                                variant="secondary"
                                className="h-7 px-2 text-[10.5px]"
                                disabled={locked}
                                onClick={() => setTags({ ...metadata.tags, "": "" })}
                            >
                                <Plus aria-hidden="true" className="h-3 w-3" />
                                Add tag
                            </Button>
                        </div>
                        {entries.length === 0 ? (
                            <p className="mt-1.5 mb-0 text-[10px] text-ink-muted">
                                No explicit tags. Copy-all still keeps the source's tags.
                            </p>
                        ) : (
                            <div className="mt-1.5 space-y-1.5">
                                {entries.map(([key, tagValue], index) => (
                                    <div
                                        key={`${key}-${String(index)}`}
                                        className="flex items-center gap-1.5"
                                    >
                                        <input
                                            aria-label={`Tag ${String(index + 1)} name`}
                                            className={`${FIELD_CLASS} w-2/5 font-mono`}
                                            value={key}
                                            disabled={locked}
                                            placeholder="TITLE"
                                            onChange={(event) => {
                                                const next: Record<string, string> = {};
                                                for (const [entryKey, entryValue] of entries) {
                                                    next[
                                                        entryKey === key
                                                            ? event.target.value
                                                            : entryKey
                                                    ] = entryValue;
                                                }
                                                setTags(next);
                                            }}
                                        />
                                        <input
                                            aria-label={`Tag ${String(index + 1)} value`}
                                            className={FIELD_CLASS}
                                            value={tagValue}
                                            disabled={locked}
                                            placeholder="Value"
                                            onChange={(event) =>
                                                setTags({
                                                    ...metadata.tags,
                                                    [key]: event.target.value,
                                                })
                                            }
                                        />
                                        <RemoveButton
                                            target={`tag ${key}`}
                                            disabled={locked}
                                            onClick={() => {
                                                const next = { ...metadata.tags };
                                                delete next[key];
                                                setTags(next);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <p className="mt-2 mb-0 text-[10px] leading-relaxed text-ink-muted">
                    FFmpeg has no tag-writing path; its metadata setting is copy on or off.
                </p>
            )}
        </Panel>
    );
}

function ExtraInputCard({
    input,
    index,
    total,
    method,
    locked,
    projectId,
    videoId,
    optionRoot,
    onChange,
    onRemove,
    onMove,
}: {
    input: Record<string, unknown>;
    index: number;
    total: number;
    method: ConcatMethodName;
    locked: boolean;
    projectId: string;
    videoId: string;
    optionRoot?: JsonSchema | undefined;
    onChange: (next: Record<string, unknown>) => void;
    onRemove: () => void;
    onMove: (delta: number) => void;
}) {
    const path = typeof input.path === "string" ? input.path : "";
    const [expanded, setExpanded] = useState(false);
    const [draftPath, setDraftPath] = useState(path);
    const inventory = useConcatInventory(
        projectId,
        videoId,
        method,
        path,
        expanded && path.trim() !== "",
    );

    const commitPath = () => {
        const next = draftPath.trim();
        if (next === path) {
            return;
        }
        const updated = withExtraPath([input], 0, next)[0];
        if (updated !== undefined) {
            onChange(updated);
        }
    };

    const setField = (field: string, value: unknown) => {
        onChange({ ...input, [field]: value });
    };

    return (
        <div className="rounded-lg border border-line bg-sunken">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} extra input ${String(index + 1)}`}
                    data-tip={`${expanded ? "Collapse" : "Expand"} extra input ${String(index + 1)}`}
                    onClick={() => setExpanded((previous) => !previous)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-ink-muted hover:border-line hover:text-ink"
                >
                    <ChevronDown
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
                    />
                </button>
                <span className="shrink-0 font-mono text-[9.5px] text-ink-muted">
                    {String(index + 1).padStart(2, "0")}
                </span>
                <input
                    aria-label={`Extra input ${String(index + 1)} path`}
                    className={`${FIELD_CLASS} min-w-0 flex-1`}
                    value={draftPath}
                    disabled={locked}
                    placeholder="Paste a file path, or locate one on the desktop"
                    onChange={(event) => setDraftPath(event.target.value)}
                    onBlur={commitPath}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            commitPath();
                        }
                    }}
                />
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        aria-label={`Move extra input ${String(index + 1)} up`}
                        data-tip={`Move extra input ${String(index + 1)} up`}
                        data-tip-align="end"
                        disabled={locked || index === 0}
                        onClick={() => onMove(-1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-transparent text-ink-muted hover:border-line hover:text-ink disabled:opacity-30"
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        aria-label={`Move extra input ${String(index + 1)} down`}
                        data-tip={`Move extra input ${String(index + 1)} down`}
                        data-tip-align="end"
                        disabled={locked || index === total - 1}
                        onClick={() => onMove(1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-transparent text-ink-muted hover:border-line hover:text-ink disabled:opacity-30"
                    >
                        ↓
                    </button>
                    <RemoveButton
                        target={`extra input ${String(index + 1)}`}
                        disabled={locked}
                        onClick={onRemove}
                    />
                </div>
            </div>

            {expanded ? (
                <div className="border-t border-line">
                    <TrackMapPanel
                        method={method}
                        scope="extra"
                        tracks={input.tracks as TrackMap}
                        inventory={inventory.data}
                        detail={inventory.data?.detail}
                        pending={inventory.isPending}
                        error={
                            inventory.isError
                                ? "That input could not be inspected. Check the path or the muxer's availability."
                                : null
                        }
                        locked={locked}
                        optionRoot={optionRoot}
                        onChange={(next) => setField("tracks", next)}
                        onProbe={() => void inventory.refetch()}
                    />
                    <div className="space-y-4 px-4 pb-4 sm:px-5">
                        <ChaptersPanel
                            method={method}
                            value={input.chapters}
                            chapterCount={inventory.data?.chapter_count ?? null}
                            locked={locked}
                            onChange={(next) => setField("chapters", next)}
                        />
                        {method === "mkvmerge" ? (
                            <MetadataPanel
                                method={method}
                                value={input.metadata}
                                locked={locked}
                                onChange={(next) => setField("metadata", next)}
                            />
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/**
 * Extra inputs merge before the encoded scenes. Each row owns a query for its own source,
 * so a path that has not been probed shows no invented rows.
 */
export function ExtraInputsPanel({
    method,
    value,
    locked,
    projectId,
    videoId,
    optionRoot,
    onChange,
}: {
    method: ConcatMethodName;
    value: unknown;
    locked: boolean;
    projectId: string;
    videoId: string;
    optionRoot?: JsonSchema | undefined;
    onChange: (next: unknown) => void;
}) {
    const inputs = extraInputsOf(value);
    return (
        <Panel
            title="Extra inputs"
            description="Additional files merged before the encoded scenes, in the order shown. A changed path clears that input's source-specific choices."
            aside={
                <Button
                    variant="secondary"
                    className="h-7 shrink-0 px-2 text-[10.5px]"
                    disabled={locked}
                    onClick={() =>
                        onChange([
                            ...inputs,
                            { path: "", tracks: null, chapters: null, metadata: null },
                        ])
                    }
                >
                    <Plus aria-hidden="true" className="h-3 w-3" />
                    Add input
                </Button>
            }
        >
            {inputs.length === 0 ? (
                <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                    No extra inputs. Only this video's source supplies the stream map.
                </p>
            ) : (
                <div className="space-y-2">
                    {inputs.map((input, index) => (
                        <ExtraInputCard
                            key={`${String(index)}:${String(input.path ?? "")}`}
                            input={input}
                            index={index}
                            total={inputs.length}
                            method={method}
                            locked={locked}
                            projectId={projectId}
                            videoId={videoId}
                            optionRoot={optionRoot}
                            onChange={(next) => onChange(withExtraInput(value, index, next))}
                            onRemove={() => onChange(withoutExtraInput(value, index))}
                            onMove={(delta) => onChange(moveExtraInput(value, index, delta))}
                        />
                    ))}
                </div>
            )}
        </Panel>
    );
}

type WorkbenchProps = {
    projectId: string;
    videoId: string;
    method: ConcatMethodName;
    config: Record<string, unknown>;
    schema?: { node: JsonSchema; root: JsonSchema } | undefined;
    locked: boolean;
    onChange: (next: Record<string, unknown>) => void;
};

/**
 * The track map belongs inside the Method card; the source panels stack below it.
 * Both halves read the same inventory key, so two mounts still make one probe.
 */
export function VideoTrackMapSection({
    projectId,
    videoId,
    method,
    config,
    schema,
    locked,
    onChange,
}: WorkbenchProps) {
    const inventory = useConcatInventory(projectId, videoId, method);
    const pickFile = usePickFile();
    return (
        <TrackMapPanel
            method={method}
            scope="main"
            tracks={config.tracks as TrackMap}
            pickFile={
                pickFile === null ? undefined : () => pickFile({ title: "Choose an attachment" })
            }
            inventory={inventory.data}
            detail={inventory.data?.detail}
            pending={inventory.isPending}
            error={
                inventory.isError
                    ? "The source inventory could not be read. The map still shows the saved keys."
                    : null
            }
            locked={locked}
            optionRoot={schema?.root}
            onChange={(next) => onChange({ ...config, tracks: next })}
            onProbe={() => void inventory.refetch()}
        />
    );
}

/** Chapters, metadata, and extra inputs for the selected method. */
export function VideoConcatSources({
    projectId,
    videoId,
    method,
    config,
    schema,
    locked,
    onChange,
}: WorkbenchProps) {
    const inventory = useConcatInventory(projectId, videoId, method);
    const [sourceView, setSourceView] = useState<SourceDetailsView | null>(null);
    const set = (field: string, value: unknown) => {
        onChange({ ...config, [field]: value });
    };

    return (
        <>
            <ChaptersPanel
                method={method}
                value={config.chapters}
                chapterCount={inventory.data?.chapter_count ?? null}
                locked={locked}
                onChange={(next) => set("chapters", next)}
                onViewChapters={() => setSourceView("chapters")}
            />
            <MetadataPanel
                method={method}
                value={config.metadata}
                locked={locked}
                onChange={(next) => set("metadata", next)}
                onViewMetadata={() => setSourceView("metadata")}
            />
            <ExtraInputsPanel
                method={method}
                value={config.extra_inputs}
                locked={locked}
                projectId={projectId}
                videoId={videoId}
                optionRoot={schema?.root}
                onChange={(next) => set("extra_inputs", next)}
            />
            <p className="mt-3 mb-0 text-[10px] leading-relaxed text-ink-muted">
                Data streams are always copied and have no switch. A row's option fields come from
                the engine schema for this method and track kind.
            </p>
            <SourceDetailsSheet
                projectId={projectId}
                videoId={videoId}
                view={sourceView}
                onClose={() => setSourceView(null)}
            />
        </>
    );
}
