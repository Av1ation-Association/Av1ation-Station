import { useState, type ComponentProps } from "react";

import { useEncodeBlockedElsewhere, useSequenceLive, type SequenceLive } from "@av1ation/api";
import type { VideoFailure } from "@av1ation/contracts";
import { Lock, Play, RotateCcw, Square } from "lucide-react";

import {
    attemptPerformance,
    lastCompletedAttempt,
    performanceLine,
    type HistoryRun,
} from "../../shared/model/history-model";
import { liveSummary, liveWorkerLine } from "../../shared/model/sequence-live";
import type { TimelineStep } from "../../shared/model/video-timeline";
import { SequenceActionButton } from "./SequenceActionButton";
import { SequenceFailureRail } from "./SequenceFailureRail";

const TONE: Record<string, string> = {
    active: "border-info/30 bg-info-soft text-info",
    complete: "border-success/30 bg-success-soft text-success",
    incomplete: "border-warning/30 bg-warning-soft text-warning",
    failed: "border-danger/30 bg-danger-soft text-danger",
    skipped: "border-line-strong bg-raised text-ink-muted",
    never_run: "border-line-strong bg-raised text-ink-muted",
};

/**
 * The status of the sequences this section owns.
 *
 * Each row is a control: start a stage, stop the active one, or delete its data. The server
 * enforces the singleton and the prerequisites; the disabled state here only mirrors that
 * decision so the button does not offer work the request would refuse.
 */
export function SequenceRunBarLive({
    projectId,
    videoId,
    ...rest
}: Omit<ComponentProps<typeof SequenceRunBar>, "live" | "blockedElsewhere"> & {
    projectId: string;
    videoId: string;
}) {
    // The bar subscribes on its own row, so a progress tick does not re-render the whole
    // section editor and its draft history.
    const live = useSequenceLive(projectId, videoId);
    const blockedElsewhere = useEncodeBlockedElsewhere(projectId, videoId);
    return <SequenceRunBar {...rest} live={live} blockedElsewhere={blockedElsewhere} />;
}

export function SequenceRunBar({
    steps,
    live,
    locked,
    lockedLabel,
    runningVideo,
    blockedElsewhere = false,
    history,
    sceneCount,
    pending,
    refusal = null,
    runFailure = null,
    dirty = false,
    onSave,
    onRun,
    onStop,
    onResetData,
}: {
    steps: readonly TimelineStep[];
    /** The live status of the video's active sequence, when one is running. */
    live?: SequenceLive | null | undefined;
    locked: boolean;
    lockedLabel: string;
    /** Whether this video is the one holding the encode lock. */
    runningVideo: boolean;
    /** Another video is encoding, so no sequence here can start process-wide. */
    blockedElsewhere?: boolean;
    /** The video's recorded attempts, newest run first, for a finished row's throughput. */
    history?: readonly HistoryRun[] | undefined;
    /** The video's scene count, used only when the evidence line does not name it. */
    sceneCount?: number | undefined;
    pending: boolean;
    /** The refused start or stop for the sequence that issued it. */
    refusal?: { sequence: string; message: string } | null;
    /** The last run's failure, only when this section owns the sequence it reached. */
    runFailure?: VideoFailure | null;
    /** Whether this section's draft has changes a start must persist first. */
    dirty?: boolean;
    /** Saves the section draft; a start waits for a successful save. */
    onSave?: (() => Promise<boolean>) | undefined;
    onRun: (sequence: string) => void;
    onStop: (sequence: string) => void;
    /** Opens the guarded reset for a sequence; absent on a page that cannot own it. */
    onResetData?: ((step: TimelineStep) => void) | undefined;
}) {
    const [saving, setSaving] = useState(false);
    const run = async (sequence: string) => {
        if (!dirty || onSave === undefined) {
            onRun(sequence);
            return;
        }
        setSaving(true);
        try {
            if (await onSave()) {
                onRun(sequence);
            }
        } finally {
            setSaving(false);
        }
    };

    if (steps.length === 0) {
        return null;
    }

    const failedStep =
        runFailure === null ? undefined : steps.find((step) => step.id === runFailure.sequence);
    const failureSequence = failedStep?.name ?? runFailure?.sequence ?? null;
    const hasFailure = runFailure !== null && failureSequence !== null;

    return (
        <section
            aria-label="Sequence status"
            className={`relative mt-4 rounded-lg border ${
                hasFailure ? "border-danger/40" : "border-line"
            } bg-surface`}
        >
            {hasFailure ? (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-l-[7px] bg-danger"
                />
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                <h2 className="m-0 text-sm font-semibold text-ink">Sequence status</h2>
                <p className="m-0 text-[10.5px] text-ink-muted">
                    Start or stop a stage here, or from its card on the video&apos;s Configuration
                    page.
                </p>
            </div>
            {runFailure !== null && failureSequence !== null ? (
                <SequenceFailureRail sequence={failureSequence} message={runFailure.message} wide />
            ) : null}
            <ul className="m-0 list-none divide-y divide-line-subtle p-0">
                {steps.map((step) => {
                    const isActive = step.status === "active";
                    const status = isActive && live?.sequence === step.id ? live : null;
                    const progress = isActive ? (status?.progress ?? step.progress) : null;
                    // Parallel Encoder reports one scene per worker, so each active
                    // worker gets its own line under the aggregate row.
                    const workers = status?.workers ?? [];
                    // Only a finished stage quotes its recorded performance: a live row
                    // already carries its own rate and ETA, and an incomplete or failed
                    // stage must not show an older run's numbers as if they were this one.
                    const attempt =
                        isActive || step.status !== "complete" || history === undefined
                            ? null
                            : lastCompletedAttempt(history, step.id);
                    const performance = attempt === null ? null : attemptPerformance(attempt);
                    const performanceText =
                        performance === null
                            ? null
                            : performanceLine(
                                  performance,
                                  step.detail === null ? (sceneCount ?? null) : null,
                              );
                    const line = [
                        (status === null ? null : liveSummary(status)) ??
                            `${step.label}${step.detail === null ? "" : ` · ${step.detail}`}`,
                        performanceText,
                    ]
                        .filter((part): part is string => part !== null)
                        .join(" · ");
                    const reason = locked
                        ? lockedLabel
                        : blockedElsewhere
                          ? "Another video is encoding; only one sequence can run at a time."
                          : runningVideo
                            ? "Another sequence is running."
                            : !isActive && !step.runnable
                              ? "Its prerequisites have not run yet."
                              : null;
                    const runDisabled = reason !== null || pending || saving;
                    return (
                        <li key={step.id} className="min-w-0">
                            <div className="flex min-w-0 items-center gap-3 px-4 py-2.5 sm:px-5">
                                <span
                                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-medium whitespace-nowrap ${
                                        TONE[step.status] ?? TONE.never_run
                                    }`}
                                >
                                    {step.name}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <span
                                        className="block truncate text-[11px] text-ink-secondary"
                                        title={line}
                                    >
                                        {line}
                                    </span>
                                    {workers.length === 0 ? null : (
                                        <ul className="m-0 mt-0.5 list-none space-y-0.5 p-0">
                                            {workers.map((worker) => {
                                                const text = liveWorkerLine(worker);
                                                return (
                                                    <li
                                                        key={worker.sceneIndex}
                                                        className="truncate text-[10.5px] text-ink-muted"
                                                        title={text}
                                                    >
                                                        {text}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                                {progress === null ? null : (
                                    <span className="hidden w-28 shrink-0 sm:block">
                                        <span
                                            role="progressbar"
                                            aria-label={`${step.name} progress`}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={Math.round(progress)}
                                            className="block h-1 overflow-hidden rounded-full bg-line-subtle"
                                        >
                                            <span
                                                className="block h-full bg-brand transition-transform duration-200"
                                                style={{
                                                    transform: `scaleX(${String(
                                                        Math.max(0, Math.min(100, progress)) / 100,
                                                    )})`,
                                                    transformOrigin: "left",
                                                }}
                                            />
                                        </span>
                                    </span>
                                )}
                                <div className="flex shrink-0 items-center gap-0.5">
                                    {isActive ? (
                                        <SequenceActionButton
                                            icon={
                                                <Square
                                                    aria-hidden="true"
                                                    className="h-2.5 w-2.5"
                                                />
                                            }
                                            label="Stop"
                                            ariaLabel={`Stop ${step.name}`}
                                            title={`Stop ${step.name}`}
                                            disabled={pending}
                                            tone="danger"
                                            onClick={() => onStop(step.id)}
                                        />
                                    ) : (
                                        <SequenceActionButton
                                            icon={
                                                runDisabled ? (
                                                    <Lock
                                                        aria-hidden="true"
                                                        className="h-2.5 w-2.5"
                                                    />
                                                ) : (
                                                    <Play
                                                        aria-hidden="true"
                                                        className="h-2.5 w-2.5"
                                                    />
                                                )
                                            }
                                            label={
                                                step.status === "incomplete" ? "Resume" : "Start"
                                            }
                                            ariaLabel={`${
                                                step.status === "incomplete" ? "Resume" : "Start"
                                            } ${step.name}`}
                                            title={
                                                reason ??
                                                (step.status === "incomplete"
                                                    ? `Resume ${step.name} from the data it already wrote`
                                                    : `Run ${step.name}`)
                                            }
                                            disabled={runDisabled || !step.runnable}
                                            onClick={() => void run(step.id)}
                                        />
                                    )}
                                    {onResetData === undefined ||
                                    !(
                                        step.status === "complete" ||
                                        step.status === "incomplete" ||
                                        step.status === "failed" ||
                                        (step.id === "SpeedScaler" && step.runnable)
                                    ) ? null : (
                                        <SequenceActionButton
                                            icon={
                                                <RotateCcw aria-hidden="true" className="h-3 w-3" />
                                            }
                                            label="Reset data"
                                            ariaLabel={`Reset ${step.name} data`}
                                            title={
                                                locked ? lockedLabel : `Delete ${step.name} data`
                                            }
                                            disabled={locked || pending}
                                            tone="warning"
                                            onClick={() => onResetData(step)}
                                        />
                                    )}
                                </div>
                            </div>
                            {refusal?.sequence === step.id ? (
                                <p
                                    role="alert"
                                    className="mx-4 mb-2 rounded-md border border-danger/30 bg-danger-soft px-2 py-1.5 text-[10.5px] leading-relaxed text-danger sm:mx-5"
                                >
                                    {refusal.message}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
