import type { RunSummary } from "@av1ation/contracts";
import { Link } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";

import { RemoveButton } from "../../shared/RemoveButton";
import { runLength } from "../../shared/duration";
import type { HistoryRun } from "../../shared/model/history-model";
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

/**
 * One run's History card.
 *
 * The card owns the run-level measures, its sequence attempts, and the terminal message.
 * It is exported so a reference can show one real card without mounting the whole tab.
 */
export function HistoryRunCard({
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
