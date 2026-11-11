import { Film, MoreHorizontal, Plus } from "lucide-react";

import type { GeneralDefaults } from "@av1ation/contracts";

import { AddVideosSheet } from "./AddVideosSheet";
import { Button } from "../../shared/Button";
import { Menu, MenuContent, MenuTrigger } from "../../shared/Menu";
import type { ProjectQueueController } from "./useProjectQueue";
import { QueueMenuItem } from "./QueueMenuItem";
import { QueueRow } from "./QueueRow";
import { QueueSkeleton } from "./QueueSkeleton";
import { RemoveVideosDialog } from "./RemoveVideosDialog";
import { RunControl } from "../../shared/RunControl";
import { SearchField } from "../../shared/SearchField";
import { formatBytes } from "../../shared/format";
import { shortcutHint } from "../../shared/shortcuts";

/** The project queue: filtering, selection, ordering, batch controls, and add/remove. */
export function ProjectQueueSection({
    queue,
    general,
}: {
    queue: ProjectQueueController;
    general: GeneralDefaults | undefined;
}) {
    return (
        <section
            id="queue"
            aria-labelledby="queue-heading"
            className="min-w-0 scroll-mt-20 rounded-lg border border-line bg-surface"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-5 pb-4 sm:px-6">
                <h2 id="queue-heading" className="m-0 text-base font-semibold text-ink">
                    Queue
                </h2>
                <p className="m-0 font-mono text-[10.5px] text-ink-muted tabular-nums">
                    {queue.queueRows.length === queue.videos.length
                        ? `${String(queue.videos.length)} ${queue.videos.length === 1 ? "video" : "videos"}`
                        : `${String(queue.queueRows.length)} of ${String(queue.videos.length)} videos`}
                    {queue.summary?.size_bytes === undefined || queue.summary.size_bytes === 0
                        ? null
                        : ` · ${formatBytes(queue.summary.size_bytes)} on disk`}
                    {queue.queueRows.length < 2 ? null : (
                        <span className="font-sans"> · drag to reorder</span>
                    )}
                </p>
                <div className="relative ml-auto flex flex-wrap items-center gap-2">
                    <SearchField
                        value={queue.queueQuery}
                        onChange={queue.setQueueQuery}
                        placeholder="Search queue"
                        label="Search the queue by name or path"
                        className="h-7 w-full sm:w-44"
                    />
                    {queue.batchActive ? (
                        <>
                            <span className="font-mono text-[10.5px] text-ink-secondary tabular-nums">
                                {queue.batchDone} of {queue.batch.data?.total ?? 0} done
                            </span>
                            <RunControl
                                running
                                pending={queue.stopBatch.isPending}
                                disabledReason="Stop the queue after the current video"
                                onStart={queue.runQueue}
                                onStop={queue.stopQueue}
                            />
                        </>
                    ) : (
                        <RunControl
                            running={false}
                            pending={queue.startBatch.isPending}
                            disabled={
                                queue.videos.length === 0 ||
                                queue.projectLocked ||
                                queue.blockedElsewhere
                            }
                            disabledReason={
                                queue.videos.length === 0
                                    ? "Add a video first"
                                    : queue.projectLocked
                                      ? "An encode is already running"
                                      : queue.blockedElsewhere
                                        ? "Another project is encoding; only one encode runs at a time"
                                        : "Run every video in queue order"
                            }
                            onStart={queue.runQueue}
                            onStop={queue.stopQueue}
                        />
                    )}
                    {queue.videos.length > 0 ? (
                        <Button
                            className="h-7 px-2.5 text-[12px]"
                            onClick={queue.openAdd}
                            data-tip="Choose several files at once"
                        >
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            Add videos
                        </Button>
                    ) : null}{" "}
                    <Menu>
                        <MenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Queue actions"
                                data-tip="More queue actions"
                                data-tip-align="end"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line-strong bg-raised text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink"
                            >
                                <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                        </MenuTrigger>
                        <MenuContent align="end" className="w-48" aria-label="Queue actions">
                            <QueueMenuItem onClick={queue.openAdd}>Add videos…</QueueMenuItem>
                            <QueueMenuItem
                                onClick={queue.selectAll}
                                disabled={queue.videos.length === 0}
                            >
                                Select all
                            </QueueMenuItem>
                            <QueueMenuItem
                                onClick={queue.clearSelection}
                                disabled={queue.selected.size === 0}
                            >
                                Clear selection
                            </QueueMenuItem>
                        </MenuContent>
                    </Menu>
                </div>
            </div>

            {queue.selectedVideos.length > 0 ? (
                <div
                    role="region"
                    aria-label="Queue selection"
                    className="mx-4 mb-3 flex min-h-8 flex-wrap items-center gap-2 rounded-md border border-line-subtle bg-sunken px-3 py-1.5 sm:mx-6 sm:gap-3"
                >
                    <span className="text-[11px] font-medium text-ink">
                        {queue.selectedVideos.length} selected
                    </span>
                    <span className="hidden text-[10px] text-ink-muted sm:inline">
                        {`Shift-click extends · ${shortcutHint("run")} runs one video · Esc clears`}
                    </span>
                    <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto">
                        <Button
                            variant="brandGhost"
                            className="h-6 px-2 text-[11px]"
                            onClick={queue.runSelected}
                            disabled={!queue.canRun || queue.start.isPending}
                            title={
                                queue.runDisabledReason ??
                                (queue.selectedVideos.length > 1
                                    ? "An encode holds the encoder; select one video to run it."
                                    : undefined)
                            }
                        >
                            {queue.start.isPending ? "Starting…" : "Run selected"}
                        </Button>
                        <Button
                            variant="dangerGhost"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => queue.setRemoving(queue.removableVideos)}
                            disabled={queue.removableVideos.length === 0}
                            title="Remove the selected videos except the one encoding"
                        >
                            Remove
                        </Button>
                        <Menu>
                            <MenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="More selection actions"
                                    className="inline-flex h-6 items-center rounded-sm px-2 text-[11px] text-ink-secondary hover:bg-hover hover:text-ink"
                                >
                                    More
                                </button>
                            </MenuTrigger>
                            <MenuContent
                                align="end"
                                className="w-48"
                                aria-label="More selection actions"
                            >
                                <QueueMenuItem onClick={queue.copySelectedPaths}>
                                    Copy input paths
                                </QueueMenuItem>
                                <QueueMenuItem onClick={queue.clearSelection}>
                                    Clear selection
                                </QueueMenuItem>
                            </MenuContent>
                        </Menu>
                    </div>
                </div>
            ) : null}

            {queue.actionError === null ? null : (
                <p
                    role="alert"
                    className="mx-4 mb-3 mt-0 text-[11.5px] leading-relaxed text-danger sm:mx-6"
                >
                    {queue.actionError}
                </p>
            )}

            <div className="pb-4">
                {queue.videosQuery.isPending ? (
                    <div className="px-4">
                        <QueueSkeleton />
                    </div>
                ) : null}

                {queue.videosQuery.isError ? (
                    <div
                        className="mx-6 mb-4 rounded-md border border-danger/30 bg-surface px-5 py-5"
                        role="alert"
                    >
                        <p className="m-0 text-sm font-medium text-ink">
                            The queue could not be loaded
                        </p>
                        <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-secondary">
                            {queue.videosQuery.error instanceof Error
                                ? queue.videosQuery.error.message
                                : "The local service did not respond."}
                        </p>
                        <Button
                            variant="secondary"
                            onClick={() => void queue.videosQuery.refetch()}
                            disabled={queue.videosQuery.isFetching}
                        >
                            {queue.videosQuery.isFetching ? "Retrying…" : "Retry"}
                        </Button>
                    </div>
                ) : null}

                {queue.videosQuery.data !== undefined && queue.videos.length === 0 ? (
                    <div className="mx-4 mb-4 rounded-lg border border-dashed border-line-strong bg-sunken px-4 py-10 text-center sm:mx-6 sm:px-6 sm:py-14">
                        <Film
                            aria-hidden="true"
                            className="mx-auto h-6 w-6 text-ink-secondary"
                            strokeWidth={1.4}
                        />
                        <h3 className="mt-3 mb-0 text-[15px] font-semibold text-ink">
                            Add videos to the queue
                        </h3>
                        <p className="mx-auto mt-1.5 mb-0 max-w-[52ch] text-[11.5px] leading-relaxed text-ink-secondary">
                            Files stay where they are; nothing is copied. Added videos inherit the
                            project&apos;s General defaults.
                        </p>
                        <p className="mt-4 mb-5 font-mono text-[9.5px] text-ink-muted">
                            MKV · MP4 · MOV · several at once
                        </p>
                        <Button className="h-8 px-3 text-[12px]" onClick={queue.openAdd}>
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            Add videos
                        </Button>
                    </div>
                ) : null}

                {queue.videos.length > 0 && queue.queueRows.length === 0 ? (
                    <div className="mx-4 mb-4 rounded-lg border border-dashed border-line-strong bg-sunken px-4 py-8 text-center sm:mx-6">
                        <p className="m-0 text-[12.5px] text-ink-secondary">
                            No video matches “{queue.queueQuery.trim()}”.
                        </p>
                    </div>
                ) : null}

                {queue.queueRows.length > 0 ? (
                    <ul className="m-0 list-none px-4 pb-2">
                        {queue.queueRows.map(({ video, index: queueIndex }, visibleIndex) => (
                            <QueueRow
                                key={video.id}
                                projectId={queue.projectId}
                                video={video}
                                index={visibleIndex}
                                count={queue.queueRows.length}
                                state={queue.states[queueIndex]?.data}
                                selected={queue.selected.has(video.id)}
                                locked={video.id === queue.activeVideoId}
                                startBlocked={queue.projectLocked || queue.blockedElsewhere}
                                blockedElsewhere={queue.blockedElsewhere}
                                onToggle={queue.toggle}
                                onMove={queue.moveVisible}
                                onDrop={(draggedId) => {
                                    const from = queue.videos.findIndex(
                                        (entry) => entry.id === draggedId,
                                    );
                                    if (from >= 0) {
                                        queue.move(from, queueIndex);
                                    }
                                }}
                                onRemove={() => queue.setRemoving([video])}
                                onRun={() => queue.runVideo(video)}
                                runPending={
                                    queue.start.isPending && queue.start.variables === video.id
                                }
                                stopPending={
                                    queue.cancel.isPending && queue.cancel.variables === video.id
                                }
                                refusal={
                                    queue.rowRefusal?.videoId === video.id
                                        ? queue.rowRefusal.message
                                        : null
                                }
                                onCancel={() => queue.cancelVideo(video)}
                            />
                        ))}
                    </ul>
                ) : null}
            </div>

            <AddVideosSheet
                projectId={queue.projectId}
                general={general}
                open={queue.adding}
                initialPaths={queue.addPaths}
                onClose={() => queue.setAdding(false)}
                onAdded={() => void queue.videosQuery.refetch()}
            />

            <RemoveVideosDialog
                dialogRef={queue.removeDialog}
                removing={queue.removing}
                retainedBytes={queue.retainedToRemove}
                pending={queue.remove.isPending}
                error={queue.remove.error}
                onClose={() => queue.setRemoving(null)}
                onConfirm={queue.confirmRemove}
            />
        </section>
    );
}
