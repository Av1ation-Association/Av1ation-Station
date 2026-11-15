import { useMemo, useState } from "react";

import { useVideo, useVideoHistory, useVideoRuns, useVideoState } from "@av1ation/api";
import { useParams } from "@tanstack/react-router";
import { History, RotateCw } from "lucide-react";

import { Button } from "../../shared/Button";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { ScreenMain } from "../../shared/ScreenMain";
import { DeleteRunDialog } from "./DeleteRunDialog";
import { HistoryRunCard } from "./HistoryRunCard";
import { Skeleton } from "../../shared/Skeleton";
import { VideoRunActions } from "../videos/VideoRunActions";
import { VideoTabs } from "../videos/VideoTabs";
import { historyRuns } from "../../shared/model/history-model";

/**
 * What happened, when, and how fast.
 *
 * The History tab is deliberately not the Queue's status: status is derived and can only
 * describe now. This reads the append-only timeline, which is the one persisted record of
 * elapsed time, repeated attempts, and a failure that happened before any sequence started.
 */
export function HistoryScreen() {
    const { projectId, videoId } = useParams({
        from: "/projects/$projectId/videos/$videoId/history",
    });
    const video = useVideo(projectId, videoId);
    const state = useVideoState(projectId, videoId);
    const history = useVideoHistory(projectId, videoId);
    const runs = useMemo(() => historyRuns(history.data?.entries ?? []), [history.data]);
    // The timeline does not know whether a log directory survived; this list does, so a
    // card only offers a delete when there is a file to remove.
    const logs = useVideoRuns(projectId, videoId);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const logByRun = new Map((logs.data ?? []).map((entry) => [entry.run_id, entry]));
    const deleteRun = runs.find((entry) => entry.runId === deleteTarget) ?? null;

    return (
        <ScreenMain className="flex min-h-[calc(100dvh-56px)] flex-col">
            <VideoTabs
                projectId={projectId}
                videoId={videoId}
                active="history"
                note={
                    runs.length === 0
                        ? "No runs recorded"
                        : `${String(runs.length)} ${runs.length === 1 ? "run" : "runs"} · newest first`
                }
            />
            <VideoRunActions projectId={projectId} videoId={videoId} state={state.data} />

            <div className="page flex-1 py-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">
                            History
                        </h1>
                        <p className="mt-1 mb-0 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-secondary">
                            Every attempt the engine recorded, with its duration and outcome. A
                            sequence that ran again appends a second entry; the current state of a
                            stage is still on Configuration.
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        className="h-8 px-2.5 text-[11px]"
                        disabled={history.isFetching}
                        onClick={() => void history.refetch()}
                    >
                        <RotateCw
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 ${history.isFetching ? "animate-spin" : ""}`}
                        />
                        Refresh
                    </Button>
                </div>

                {history.isPending ? (
                    <div className="space-y-3" aria-busy="true">
                        <Skeleton className="h-40 rounded-lg" />
                        <Skeleton className="h-40 rounded-lg" />
                    </div>
                ) : history.isError ? (
                    <LoadErrorPanel
                        heading="h2"
                        title="The history could not be read"
                        message={
                            history.error instanceof Error
                                ? history.error.message
                                : "The service did not respond."
                        }
                        retryLabel="Retry"
                        onRetry={() => void history.refetch()}
                    />
                ) : runs.length === 0 ? (
                    <section className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
                        <History
                            aria-hidden="true"
                            className="mx-auto h-8 w-8 text-ink-muted"
                            strokeWidth={1.4}
                        />
                        <h2 className="mt-3 mb-0 text-lg font-semibold text-ink">
                            Nothing has run yet
                        </h2>
                        <p className="mx-auto mt-2 mb-0 max-w-[52ch] text-[13px] leading-relaxed text-ink-secondary">
                            History records each sequence attempt as it finishes. Start a sequence
                            and its duration, frames, and outcome will appear here.
                        </p>
                    </section>
                ) : (
                    <div className="space-y-3">
                        {runs.map((run) => (
                            <HistoryRunCard
                                key={run.runId}
                                projectId={projectId}
                                videoId={videoId}
                                run={run}
                                log={logByRun.get(run.runId)}
                                onDelete={() => setDeleteTarget(run.runId)}
                            />
                        ))}
                    </div>
                )}

                <p className="mt-4 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                    {video.data === undefined
                        ? "Loading the video…"
                        : `${video.data.name} · history is appended, oldest first on disk and newest first here.`}
                </p>
            </div>

            {deleteRun === null ? null : (
                <DeleteRunDialog
                    projectId={projectId}
                    videoId={videoId}
                    runId={deleteRun.runId}
                    startedAt={deleteRun.startedAt}
                    kind="run"
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </ScreenMain>
    );
}
