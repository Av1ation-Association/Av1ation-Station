import { useEffect, useMemo, useRef, useState } from "react";

import {
    useCancelVideoEncode,
    usePickVideoFiles,
    useProjectEncodeBlockedElsewhere,
    useProjectVideos,
    useProjects,
    useQueueBatch,
    useRemoveVideos,
    useReorderVideos,
    useStartQueueBatch,
    useStartVideoEncode,
    useStopQueueBatch,
    useVideoStates,
} from "@av1ation/api";
import type { VideoSummary } from "@av1ation/contracts";

import { isModalOpen, isTextEntryTarget, useShortcut } from "../../shared/shortcuts";

// Stable fallbacks keep the queue memos from recomputing when a query has no data yet; a
// fresh `[]` in the dependency list would invalidate them on every render.
const NO_VIDEOS: VideoSummary[] = [];

/**
 * The project queue's state and actions.
 *
 * The screen owns layout; this controller owns the selected rows, filtered order, the
 * singleton run guards, and every queue mutation. Keeping it here means the queue section
 * is presentational and the header can read the same lock without a second derivation.
 */
export function useProjectQueue(projectId: string) {
    const summaries = useProjects();
    const summary = summaries.data?.find((entry) => entry.id === projectId);
    const videosQuery = useProjectVideos(projectId);
    const videos = videosQuery.data ?? NO_VIDEOS;
    const states = useVideoStates(
        projectId,
        videos.map((video) => video.id),
    );

    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [actionError, setActionError] = useState<string | null>(null);
    const [rowRefusal, setRowRefusal] = useState<{
        videoId: string;
        message: string;
    } | null>(null);
    const [adding, setAdding] = useState(false);
    const [addPaths, setAddPaths] = useState<readonly string[]>([]);
    const [removing, setRemoving] = useState<VideoSummary[] | null>(null);
    const [queueQuery, setQueueQuery] = useState("");
    // The selection anchor is an id: a filter or a reorder can move a row, and an index
    // remembered from before either would extend the selection from the wrong row.
    const anchor = useRef<string | null>(null);
    const removeDialog = useRef<HTMLDialogElement>(null);
    const pickVideos = usePickVideoFiles();

    // The queue is filtered where it is ordered, and each row keeps its own position in
    // the unfiltered queue: the status list, drag targets and reorder request are all
    // indexed by that position, never by the row's place in the filtered view.
    const queueRows = useMemo(() => {
        const needle = queueQuery.trim().toLocaleLowerCase();
        return videos
            .map((video, index) => ({ video, index }))
            .filter(
                ({ video }) =>
                    needle === "" ||
                    video.name.toLocaleLowerCase().includes(needle) ||
                    video.input_path.toLocaleLowerCase().includes(needle),
            );
    }, [videos, queueQuery]);
    const visibleVideos = queueRows.map((entry) => entry.video);

    const remove = useRemoveVideos(projectId);
    const reorder = useReorderVideos(projectId);
    const start = useStartVideoEncode(projectId);
    const cancel = useCancelVideoEncode(projectId);
    // One encode runs for the whole service. A run in another project does not lock this
    // queue for editing, so only the Start buttons and the batch control read this.
    const blockedElsewhere = useProjectEncodeBlockedElsewhere(projectId);
    const batch = useQueueBatch(projectId);
    const startBatch = useStartQueueBatch(projectId);
    const stopBatch = useStopQueueBatch(projectId);
    const batchActive = batch.data?.active === true;
    const batchDone = batch.data === undefined ? 0 : batch.data.total - batch.data.remaining;

    const activeIndex = states.findIndex((query) => query.data?.active === true);
    const activeVideoId = activeIndex < 0 ? undefined : videos[activeIndex]?.id;
    const projectLocked = activeVideoId !== undefined;

    const runQueue = () => {
        if (videos.length === 0 || batchActive || projectLocked || blockedElsewhere) {
            return;
        }
        setActionError(null);
        startBatch.mutate(
            videos.map((video) => video.id),
            { onError: (error) => setActionError(error.message) },
        );
    };

    const stopQueue = () => {
        setActionError(null);
        stopBatch.mutate(undefined, {
            onError: (error) => setActionError(error.message),
        });
    };

    const selectedVideos = videos.filter((video) => selected.has(video.id));
    const removableVideos = selectedVideos.filter((video) => video.id !== activeVideoId);
    const single = selectedVideos.length === 1 ? selectedVideos[0] : undefined;
    const singleIndex = single === undefined ? -1 : videos.findIndex((v) => v.id === single.id);
    const singleState = singleIndex < 0 ? undefined : states[singleIndex]?.data;
    const canRun =
        single !== undefined &&
        !projectLocked &&
        !blockedElsewhere &&
        (singleState?.next.length ?? 0) > 0;

    const retainedToRemove = (removing ?? []).reduce((total, video) => {
        const index = videos.findIndex((entry) => entry.id === video.id);
        return total + (index < 0 ? 0 : (states[index]?.data?.retained_bytes ?? 0));
    }, 0);

    useEffect(() => {
        const dialog = removeDialog.current;
        if (dialog === null) {
            return;
        }
        if (removing !== null && !dialog.open) {
            dialog.showModal();
        }
        if (removing === null && dialog.open) {
            dialog.close();
        }
    }, [removing]);

    useEffect(() => {
        if (selected.size === 0) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setSelected(new Set());
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected.size]);

    const toggle = (videoId: string, extend: boolean) => {
        if (videoId === activeVideoId) {
            return;
        }
        const anchorId = anchor.current;
        const from =
            anchorId === null ? -1 : visibleVideos.findIndex((video) => video.id === anchorId);
        const to = visibleVideos.findIndex((video) => video.id === videoId);
        if (to < 0) {
            return;
        }
        setSelected((previous) => {
            const next = new Set(previous);
            // A shift range covers the rows the user can see. Extending through hidden
            // rows would select entries the queue view never showed.
            if (extend && from >= 0) {
                const first = Math.min(from, to);
                const last = Math.max(from, to);
                for (let cursor = first; cursor <= last; cursor += 1) {
                    const entry = visibleVideos[cursor];
                    if (entry !== undefined) {
                        next.add(entry.id);
                    }
                }
            } else if (next.has(videoId)) {
                next.delete(videoId);
            } else {
                next.add(videoId);
            }
            return next;
        });
        anchor.current = videoId;
    };

    const move = (from: number, to: number) => {
        if (from === to || to < 0 || to >= videos.length) {
            return;
        }
        if (activeVideoId !== undefined) {
            const running = videos.findIndex((video) => video.id === activeVideoId);
            const first = Math.min(from, to);
            const last = Math.max(from, to);
            if (first <= running && running <= last) {
                return;
            }
        }
        const ids = videos.map((video) => video.id);
        const [moved] = ids.splice(from, 1);
        if (moved === undefined) {
            return;
        }
        ids.splice(to, 0, moved);
        setActionError(null);
        reorder.mutate(ids, {
            onError: (error) => setActionError(error.message),
        });
    };

    /** Move to a neighbour the filtered view shows, not to a hidden one beside it. */
    const moveVisible = (from: number, to: number) => {
        const source = queueRows[from];
        const target = queueRows[to];
        if (source === undefined || target === undefined) {
            return;
        }
        move(source.index, target.index);
    };

    const openAdd = () => {
        if (pickVideos === null) {
            // A LAN browser has no host filesystem; the sheet's text fields are the only
            // way to name a file there, and a blank row is what it opens with.
            setAddPaths([]);
            setAdding(true);
            return;
        }
        setActionError(null);
        void pickVideos()
            .then((paths) => {
                if (paths.length > 0) {
                    setAddPaths(paths);
                    setAdding(true);
                }
            })
            .catch((error: unknown) =>
                setActionError(
                    error instanceof Error
                        ? `The file picker could not open: ${error.message}`
                        : "The file picker could not open.",
                ),
            );
    };

    const runVideo = (video: VideoSummary) => {
        if (projectLocked || blockedElsewhere) {
            return;
        }
        setRowRefusal(null);
        start.mutate(video.id, {
            onError: (error) => setRowRefusal({ videoId: video.id, message: error.message }),
        });
    };

    const cancelVideo = (video: VideoSummary) => {
        setRowRefusal(null);
        cancel.mutate(video.id, {
            onError: (error) => setRowRefusal({ videoId: video.id, message: error.message }),
        });
    };

    const runSelected = () => {
        if (!canRun || single === undefined) {
            return;
        }
        runVideo(single);
    };

    // Enter belongs to a focused field or button; the chord runs the one selected video,
    // and never behind a dialog the user is still answering.
    useShortcut("run", runSelected, {
        when: () => !isTextEntryTarget(document.activeElement) && !isModalOpen(),
    });

    const selectAll = () => {
        setSelected(
            new Set(
                visibleVideos
                    .filter((video) => video.id !== activeVideoId)
                    .map((video) => video.id),
            ),
        );
    };

    const clearSelection = () => setSelected(new Set());

    const copySelectedPaths = () => {
        setActionError(null);
        void navigator.clipboard
            .writeText(selectedVideos.map((video) => video.input_path).join("\n"))
            .catch(() => setActionError("The input paths could not be copied to the clipboard."));
    };

    const confirmRemove = () => {
        if (removing === null) {
            return;
        }
        const target = removing;
        remove.mutate(
            target.map((video) => video.id),
            {
                onSuccess: () => {
                    setRemoving(null);
                    setSelected(new Set());
                },
            },
        );
    };

    const runDisabledReason = projectLocked
        ? "An encode is already running."
        : blockedElsewhere
          ? "Another project is encoding; only one encode runs at a time."
          : selectedVideos.length > 1
            ? "An encode holds the encoder; select one video to run it."
            : singleState === undefined
              ? "The video's state is still loading."
              : (singleState.next.length ?? 0) === 0
                ? "This video has no next sequence to run."
                : undefined;

    return {
        projectId,
        summaries,
        summary,
        videosQuery,
        videos,
        states,
        selected,
        setSelected,
        actionError,
        rowRefusal,
        adding,
        setAdding,
        addPaths,
        removing,
        setRemoving,
        queueQuery,
        setQueueQuery,
        removeDialog,
        remove,
        reorder,
        start,
        cancel,
        blockedElsewhere,
        batch,
        startBatch,
        stopBatch,
        batchActive,
        batchDone,
        activeVideoId,
        projectLocked,
        queueRows,
        visibleVideos,
        selectedVideos,
        removableVideos,
        single,
        singleState,
        canRun,
        retainedToRemove,
        runQueue,
        stopQueue,
        toggle,
        move,
        moveVisible,
        openAdd,
        runVideo,
        cancelVideo,
        runSelected,
        selectAll,
        clearSelection,
        copySelectedPaths,
        confirmRemove,
        runDisabledReason,
    };
}

export type ProjectQueueController = ReturnType<typeof useProjectQueue>;
