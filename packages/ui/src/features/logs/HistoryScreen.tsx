import { useMemo, useState } from "react";

import { useVideo, useVideoHistory, useVideoRuns, useVideoState } from "@av1ation/api";
import type { RunSummary } from "@av1ation/contracts";
import { Link, useParams } from "@tanstack/react-router";
import { History, RotateCw, ScrollText } from "lucide-react";

import { Button } from "../../shared/Button";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { DeleteRunDialog } from "./DeleteRunDialog";
import { RemoveButton } from "../../shared/RemoveButton";
import { Skeleton } from "../../shared/Skeleton";
import { VideoRunActions } from "../videos/VideoRunActions";
import { VideoTabs } from "../videos/VideoTabs";
import { historyRuns, type HistoryRun } from "../../shared/model/history-model";
import { runLength } from "../../shared/duration";
import { runOutcome, runWhen } from "../../shared/model/run-presentation";
import { STATUS_CHIP_TONES } from "../../shared/model/video-status";

/** The dot and connector a vertical timeline draws for one attempt. */
function StepRow({ step, last }: { step: HistoryRun["steps"][number]; last: boolean }) {
    const tone =
        step.outcome === "completed"
            ? "border-success bg-success"
            : step.outcome === "failed"
              ? "border-danger bg-danger"
              : step.outcome === "cancelled"
                ? "border-warning bg-warning"
                : "border-line-strong bg-line-strong";
    return (
        <li className="relative flex gap-3 pb-3 last:pb-0">
            <span className="relative flex w-3 shrink-0 justify-center">
                <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 rounded-full border-2 ${tone}`}
                />
                {last ? null : (
                    <span
                        aria-hidden="true"
                        className="absolute top-4 bottom-[-2px] w-px bg-line-strong"
                    />
                )}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[12px] font-medium text-ink">{step.sequence}</span>
                    <span className="font-mono text-[10px] text-ink-muted tabular-nums">
                        {runLength(step.durationSeconds)}
                    </span>
                    {step.framesProcessed === null ? null : (
                        <span className="font-mono text-[10px] text-ink-muted tabular-nums">
                            {step.framesProcessed.toLocaleString()}
                            {step.framesTotal === null
                                ? " frames"
                                : ` / ${step.framesTotal.toLocaleString()} frames`}
                        </span>
                    )}
                    {step.fps === null ? null : (
                        <span className="font-mono text-[10px] text-ink-muted tabular-nums">
                            {step.fps.toFixed(2)} fps
                        </span>
                    )}
                    {step.outcome === "completed" ? null : (
                        <span className="text-[9.5px] tracking-[0.06em] text-ink-muted uppercase">
                            {step.outcome}
                        </span>
                    )}
                </div>
                {step.message === null || step.outcome === "completed" ? null : (
                    <p className="mt-1 mb-0 line-clamp-3 font-mono text-[10px] leading-relaxed break-words text-danger">
                        {step.message}
                    </p>
                )}
            </div>
        </li>
    );
}

function RunCard({
    projectId,
    videoId,
    run,
    log,
    onDelete,
}: {
    projectId: string;
    videoId: string;
    run: HistoryRun;
    /** The log directory this run still has, or `undefined` once it is gone. */
    log: RunSummary | undefined;
    onDelete: () => void;
}) {
    // A run is deletable whenever it is not the live one: the timeline entry the card reads
    // is what the action removes, and that entry exists whether or not a log survived.
    const live = log?.outcome === "running" || run.outcome === "running";
    const outcome = runOutcome(run.outcome);
    return (
        <section className="rounded-lg border border-line bg-surface px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle pb-2.5">
                <div className="min-w-0">
                    <p className="m-0 text-[12px] font-medium text-ink">
                        {run.startedAt === "" ? "Run" : runWhen(run.startedAt)}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="m-0 font-mono text-[9.5px] text-ink-muted">{run.runId}</p>
                        {log === undefined ? null : (
                            <Link
                                to="/projects/$projectId/videos/$videoId/logs"
                                params={{ projectId, videoId }}
                                search={{ run: run.runId }}
                                aria-label={`Open log for run ${run.runId}`}
                                className="inline-flex items-center gap-1 rounded text-[10px] text-brand-text transition-colors duration-150 hover:text-brand hover:underline focus-visible:text-brand focus-visible:underline"
                            >
                                <ScrollText aria-hidden="true" className="h-3 w-3" />
                                Open log
                            </Link>
                        )}
                    </div>
                </div>
                {outcome.recorded ? (
                    <span
                        className={`ml-auto rounded-full border px-2 py-0.5 text-[9.5px] font-medium ${STATUS_CHIP_TONES[outcome.tone]}`}
                    >
                        {outcome.label}
                    </span>
                ) : null}
                <span className="font-mono text-[10.5px] text-ink-secondary tabular-nums">
                    {runLength(run.durationSeconds)}
                </span>
                {run.frames === null ? null : (
                    <span className="font-mono text-[10px] text-ink-muted tabular-nums">
                        {run.frames.toLocaleString()} frames
                    </span>
                )}
                <RemoveButton
                    target={run.runId}
                    label="Delete run"
                    onClick={onDelete}
                    // A live run still appends to its history and log; the service refuses
                    // the same delete, so the card says why before the request is sent.
                    disabled={live}
                />
            </div>

            {run.steps.length === 0 ? (
                <p className="mt-2 mb-0 text-[11px] leading-relaxed text-ink-secondary">
                    This run wrote a terminal record without any sequence attempts. The message
                    below is the only reason it left.
                </p>
            ) : (
                <ol className="mt-2 mb-0 list-none p-0">
                    {run.steps.map((step, index) => (
                        <StepRow
                            key={`${step.sequence}-${step.startedAt}-${String(index)}`}
                            step={step}
                            last={index === run.steps.length - 1}
                        />
                    ))}
                </ol>
            )}

            {run.message === null ? null : (
                <p
                    data-tip={run.message}
                    className={`mt-2 mb-0 line-clamp-4 rounded-md border px-3 py-2 font-mono text-[10.5px] leading-relaxed break-words ${
                        run.outcome === "failed"
                            ? "border-danger/30 bg-danger-soft text-danger"
                            : "border-line-subtle bg-sunken text-ink-secondary"
                    }`}
                >
                    {run.message}
                </p>
            )}
        </section>
    );
}

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
        <main id="main" className="flex min-h-[calc(100dvh-56px)] flex-col">
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
                            <RunCard
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
        </main>
    );
}
