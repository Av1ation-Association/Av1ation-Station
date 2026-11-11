import { useState } from "react";

import { useOpenPath, useRevealPath, useSequenceLive } from "@av1ation/api";
import type { VideoState, VideoSummary } from "@av1ation/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import {
    ArrowDown,
    ArrowUp,
    Copy,
    FolderOpen,
    GripVertical,
    Layers,
    MoreHorizontal,
    Trash2,
} from "lucide-react";

import { baseName, formatBytes, parentPath } from "../../shared/format";
import { eta } from "../../shared/duration";
import {
    STATUS_CHIP_TONES,
    failureSummary,
    stageLabel,
    videoStatus,
} from "../../shared/model/video-status";
import { ListRow, ROW_NAME_CLASS } from "../../shared/ListRow";
import { Menu, MenuContent, MenuTrigger } from "../../shared/Menu";
import { QueueMenuItem } from "./QueueMenuItem";
import { RunControl } from "../../shared/RunControl";

/**
 * The live chip of the one video that is actually running.
 *
 * Only the running row mounts this, so a progress tick repaints one small label rather than
 * the whole queue. The durable state cache is not written on progress; this leaf reads the
 * shell's live store directly.
 */
function QueueLiveStatus({
    projectId,
    videoId,
    sequence,
    fallback,
}: {
    projectId: string;
    videoId: string;
    sequence: string;
    /** The last durable label, used until the first live tick arrives. */
    fallback: string;
}) {
    const live = useSequenceLive(projectId, videoId);
    if (live === null || live.sequence !== sequence) {
        return <>{fallback}</>;
    }
    const label =
        live.progress === null
            ? fallback
            : `${stageLabel(sequence)} ${String(Math.round(live.progress))}%`;
    const parts: string[] = [];
    // The chip names the stage and its percentage; the scene tally says how much of the
    // video that percentage covers. A sequence that counts its own scenes reports a running
    // count, while Parallel Encoder reports finished-of-total against the scene table.
    const scenes = live.scenesProcessed;
    if (scenes !== null && scenes > 0) {
        const total = live.scenesTotal;
        parts.push(
            total === null || total === 0
                ? `${String(scenes)} ${scenes === 1 ? "scene" : "scenes"}`
                : `${String(scenes)}/${String(total)} scenes`,
        );
    }
    const etaText = eta(live.etaSeconds);
    if (etaText !== null) {
        parts.push(`ETA ${etaText}`);
    }
    return (
        <>
            {label}
            {parts.length === 0 ? null : (
                <span className="ml-1 font-normal tabular-nums opacity-80">
                    · {parts.join(" · ")}
                </span>
            )}
        </>
    );
}

/** The progress line under one queue row, read from the live store while it runs. */
function QueueLiveProgress({
    projectId,
    videoId,
    sequence,
    running,
    label,
    fallback,
}: {
    projectId: string;
    videoId: string;
    sequence: string;
    running: boolean;
    label: string;
    fallback: number | null;
}) {
    const live = useSequenceLive(projectId, videoId);
    const progress =
        live !== null && live.sequence === sequence ? (live.progress ?? fallback) : fallback;
    return <ProgressLine progress={progress} running={running} label={label} />;
}

function ProgressLine({
    progress,
    running,
    label,
}: {
    progress: number | null;
    running: boolean;
    label: string;
}) {
    if (progress === null) {
        return null;
    }
    return (
        <div
            className="absolute right-2 bottom-0 left-16 h-[3px] overflow-hidden bg-raised"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            data-progress-state={running ? "running" : "paused"}
        >
            {/* Running work is brand-coloured and moves; work that stopped part-way stays
                visible in the warning tone, so a paused 37% can never be mistaken for an
                encode in flight. */}
            <div
                className={`h-full origin-left transition-transform duration-200 motion-reduce:transition-none ${
                    running ? "bg-brand" : "bg-warning/70"
                }`}
                style={{
                    transform: `scaleX(${progress / 100})`,
                }}
            />
        </div>
    );
}

export interface QueueRowProps {
    projectId: string;
    video: VideoSummary;
    index: number;
    count: number;
    state: VideoState | undefined;
    selected: boolean;
    /** This row is the video the active run is encoding. */
    locked: boolean;
    /** Any encode in this project holds the singleton; Start is disabled. */
    startBlocked?: boolean;
    /** Another project's encode holds the lock; this row still edits, but cannot start. */
    blockedElsewhere?: boolean;
    onToggle: (videoId: string, extend: boolean) => void;
    /** Move by visible position; a filtered queue passes its own neighbours. */
    onMove: (from: number, to: number) => void;
    onDrop: (draggedId: string) => void;
    onRemove: () => void;
    /** Begin this video's next sequence without opening it. */
    onRun: () => void;
    runPending: boolean;
    stopPending: boolean;
    /** The refused start or stop for this row. */
    refusal?: string | null;
    onCancel: () => void;
}

/** One queue entry. The whole queue's derived state comes from the server, not from the row. */
export function QueueRow({
    projectId,
    video,
    index,
    count,
    state,
    selected,
    locked,
    startBlocked = false,
    blockedElsewhere = false,
    onToggle,
    onMove,
    onDrop,
    onRemove,
    onRun,
    runPending,
    stopPending,
    refusal = null,
    onCancel,
}: QueueRowProps) {
    const revealPath = useRevealPath();
    const openPath = useOpenPath();
    const navigate = useNavigate();
    const [rowError, setRowError] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState(false);
    const status = videoStatus(state);
    const retained = state?.retained_bytes ?? 0;
    const running = state?.active === true;
    const activeSequence =
        state?.sequences.find((sequence) => sequence.status === "active")?.id ?? null;
    const canStart = !startBlocked && !blockedElsewhere && (state?.next.length ?? 0) > 0;

    const reveal = (path: string) => {
        setRowError(null);
        if (revealPath === null) {
            return;
        }
        void revealPath(path).catch((error: unknown) => {
            setRowError(error instanceof Error ? error.message : "The folder could not be opened.");
        });
    };

    const openFolder = (path: string) => {
        setRowError(null);
        if (openPath === null) {
            return;
        }
        void openPath(path).catch((error: unknown) => {
            setRowError(error instanceof Error ? error.message : "The folder could not be opened.");
        });
    };

    const copyInput = () => {
        setRowError(null);
        void navigator.clipboard.writeText(video.input_path).catch(() => {
            setRowError("The input path could not be copied to the clipboard.");
        });
    };

    const outputDirectory = parentPath(video.output_path);

    return (
        <ListRow
            className={`queue-row grid min-h-16 grid-cols-[16px_16px_minmax(0,1fr)_28px_28px] items-center gap-2 px-2 py-3 sm:grid-cols-[16px_16px_minmax(0,1fr)_auto_28px_28px] sm:gap-3 ${selected ? "" : "hover:bg-hover/60"}`}
            onOpen={() =>
                void navigate({
                    to: "/projects/$projectId/videos/$videoId",
                    params: { projectId, videoId: video.id },
                })
            }
            liProps={{
                className: `relative ${selected ? "bg-brand-soft" : ""} ${
                    dropTarget ? "border-t-2 border-t-brand" : ""
                }`,
                onDragOver: (event) => {
                    if (locked) {
                        return;
                    }
                    event.preventDefault();
                    setDropTarget(true);
                },
                onDragLeave: () => setDropTarget(false),
                onDrop: (event) => {
                    event.preventDefault();
                    setDropTarget(false);
                    // The id, not the row's position: a filtered queue's visible
                    // position is not an index into the queue the service reorders.
                    const dragged = event.dataTransfer.getData("text/plain");
                    if (dragged !== "" && dragged !== video.id) {
                        onDrop(dragged);
                    }
                },
            }}
            leading={
                <>
                    <input
                        type="checkbox"
                        checked={selected}
                        disabled={locked}
                        aria-label={`Select ${video.name}`}
                        onClick={(event) => onToggle(video.id, event.shiftKey)}
                        onChange={() => {}}
                        className="h-3.5 w-3.5 accent-[var(--brand-default)] disabled:opacity-40"
                    />

                    <button
                        type="button"
                        draggable={!locked}
                        disabled={locked}
                        aria-label={`Reorder ${video.name}`}
                        data-tip={
                            locked
                                ? "The encoding video cannot be moved while it runs."
                                : "Drag to reorder"
                        }
                        onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", video.id);
                            event.dataTransfer.effectAllowed = "move";
                        }}
                        className="flex h-6 w-4 cursor-grab items-center justify-center text-ink-muted hover:text-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <GripVertical aria-hidden="true" className="h-4 w-4" />
                    </button>
                </>
            }
            name={
                <Link
                    to="/projects/$projectId/videos/$videoId"
                    params={{ projectId, videoId: video.id }}
                    data-tip={`Open ${video.name}`}
                    className={ROW_NAME_CLASS}
                >
                    {video.name}
                </Link>
            }
            detail={
                <>
                    <div className="mt-0.5 flex min-w-0 cursor-text flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-ink-muted">
                        <span className="min-w-0 truncate" data-tip={video.input_path}>
                            {baseName(video.input_path)}
                        </span>
                        {retained === 0 ? null : (
                            <>
                                <span aria-hidden="true">·</span>
                                <span className="shrink-0">{formatBytes(retained)} retained</span>
                            </>
                        )}
                        <span
                            className={`inline-flex shrink-0 items-center self-center rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap tabular-nums sm:hidden ${STATUS_CHIP_TONES[status.tone]}`}
                        >
                            {activeSequence === null ? (
                                status.label
                            ) : (
                                <QueueLiveStatus
                                    projectId={projectId}
                                    videoId={video.id}
                                    sequence={activeSequence}
                                    fallback={status.label}
                                />
                            )}
                        </span>
                    </div>
                    {state?.failure === null || state?.failure === undefined ? null : (
                        <p
                            className="mt-1 mb-0 line-clamp-2 cursor-text text-[10.5px] leading-snug break-words text-danger"
                            data-tip={state.failure.message}
                        >
                            {failureSummary(state.failure.message)}
                        </p>
                    )}
                </>
            }
            trailing={
                <>
                    <span
                        className={`hidden shrink-0 items-center self-center rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap tabular-nums sm:inline-flex ${STATUS_CHIP_TONES[status.tone]}`}
                    >
                        {activeSequence === null ? (
                            status.label
                        ) : (
                            <QueueLiveStatus
                                projectId={projectId}
                                videoId={video.id}
                                sequence={activeSequence}
                                fallback={status.label}
                            />
                        )}
                    </span>

                    <RunControl
                        running={running}
                        pending={running ? stopPending : runPending}
                        disabled={running ? false : !canStart}
                        disabledReason={
                            locked
                                ? "This video is already running"
                                : blockedElsewhere
                                  ? "Another project is encoding; only one encode runs at a time"
                                  : startBlocked
                                    ? "Another video is already running"
                                    : state !== undefined && state.next.length === 0
                                      ? "This video has no next sequence to run"
                                      : undefined
                        }
                        onStart={onRun}
                        onStop={onCancel}
                        compact
                        size="sm"
                    />

                    <Menu>
                        <MenuTrigger asChild>
                            <button
                                type="button"
                                aria-label={`Actions for ${video.name}`}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-hover hover:text-ink"
                            >
                                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </MenuTrigger>
                        <MenuContent
                            align="end"
                            className="w-56"
                            aria-label={`Actions for ${video.name}`}
                        >
                            <QueueMenuItem
                                onClick={() => reveal(video.input_path)}
                                disabled={revealPath === null}
                                icon={<FolderOpen className="h-3.5 w-3.5" />}
                                reason="A browser tab cannot open the file manager; use the desktop app."
                            >
                                Open input location
                            </QueueMenuItem>
                            <QueueMenuItem
                                onClick={() => openFolder(outputDirectory)}
                                disabled={
                                    openPath === null ||
                                    outputDirectory === "" ||
                                    state?.output_exists !== true
                                }
                                icon={<FolderOpen className="h-3.5 w-3.5" />}
                                reason={
                                    openPath === null
                                        ? "A browser tab cannot open the file manager; use the desktop app."
                                        : state?.output_exists !== true
                                          ? "The output file has not been written yet."
                                          : "The output path has no directory."
                                }
                            >
                                Open output location
                            </QueueMenuItem>
                            <QueueMenuItem
                                onClick={() => {}}
                                disabled
                                icon={<Layers className="h-3.5 w-3.5" />}
                                reason="Retained chunk paths are not exposed by the service yet."
                            >
                                Open retained chunks
                            </QueueMenuItem>
                            <QueueMenuItem
                                onClick={copyInput}
                                icon={<Copy className="h-3.5 w-3.5" />}
                            >
                                Copy input path
                            </QueueMenuItem>
                            <QueueMenuItem
                                onClick={() => {
                                    setRowError(null);
                                    void navigator.clipboard
                                        .writeText(video.output_path)
                                        .catch(() =>
                                            setRowError(
                                                "The output path could not be copied to the clipboard.",
                                            ),
                                        );
                                }}
                                icon={<Copy className="h-3.5 w-3.5" />}
                            >
                                Copy output path
                            </QueueMenuItem>
                            <div className="my-1 border-t border-line" />
                            <QueueMenuItem
                                onClick={() => {
                                    onMove(index, index - 1);
                                }}
                                disabled={locked || index === 0}
                                icon={<ArrowUp className="h-3.5 w-3.5" />}
                                reason={
                                    locked
                                        ? "The encoding video cannot be moved while it runs."
                                        : undefined
                                }
                            >
                                Move up
                            </QueueMenuItem>
                            <QueueMenuItem
                                onClick={() => {
                                    onMove(index, index + 1);
                                }}
                                disabled={locked || index === count - 1}
                                icon={<ArrowDown className="h-3.5 w-3.5" />}
                                reason={
                                    locked
                                        ? "The encoding video cannot be moved while it runs."
                                        : undefined
                                }
                            >
                                Move down
                            </QueueMenuItem>
                            {state?.active === true ? (
                                <QueueMenuItem
                                    onClick={() => {
                                        onCancel();
                                    }}
                                >
                                    Cancel this encode
                                </QueueMenuItem>
                            ) : null}
                            <div className="my-1 border-t border-line" />
                            <QueueMenuItem
                                onClick={() => {
                                    onRemove();
                                }}
                                disabled={locked}
                                danger
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                                reason={
                                    locked
                                        ? "The encoding video cannot be removed while it runs."
                                        : undefined
                                }
                            >
                                Remove
                            </QueueMenuItem>
                        </MenuContent>
                    </Menu>
                </>
            }
            below={
                <>
                    {index === count - 1 ? null : (
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-2 bottom-0 h-px bg-line"
                        />
                    )}

                    {activeSequence === null ? (
                        status.progress === null ? null : (
                            <ProgressLine
                                progress={status.progress}
                                running={running}
                                label={`${video.name} ${status.progressLabel ?? "progress"}`}
                            />
                        )
                    ) : (
                        <QueueLiveProgress
                            projectId={projectId}
                            videoId={video.id}
                            sequence={activeSequence}
                            running={running}
                            label={`${video.name} ${stageLabel(activeSequence)} progress`}
                            fallback={status.progress}
                        />
                    )}

                    {refusal === null ? null : (
                        <p
                            role="alert"
                            className="mt-0 mb-2 px-2 text-[11px] leading-relaxed text-danger"
                        >
                            {refusal}
                        </p>
                    )}

                    {rowError === null ? null : (
                        <p role="alert" className="mt-0 mb-2 px-2 text-[11px] text-danger">
                            {rowError}
                        </p>
                    )}
                </>
            }
        />
    );
}
