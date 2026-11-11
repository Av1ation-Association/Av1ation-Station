import type { ComponentProps, ReactNode } from "react";

import { useEncodeBlockedElsewhere, useSequenceLive, type SequenceLive } from "@av1ation/api";
import type { VideoFailure } from "@av1ation/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { Lock, Play, RotateCcw, Square } from "lucide-react";

import { liveSummary } from "../../shared/model/sequence-live";
import type { TimelineStep } from "../../shared/model/video-timeline";
import { Button } from "../../shared/Button";
import { OpenRow } from "../../shared/OpenRow";
import { SequenceActionButton } from "./SequenceActionButton";
import { SequenceFailureRail } from "./SequenceFailureRail";

/** The sequence actions a configuration card can offer. */
type SequenceAction = "run" | "stop" | "reset";

const CHIP_TONE: Record<string, string> = {
    success: "border-success/30 bg-success-soft text-success",
    info: "border-info/30 bg-info-soft text-info",
    danger: "border-danger/30 bg-danger-soft text-danger",
    warning: "border-warning/30 bg-warning-soft text-warning",
    neutral: "border-line-strong bg-raised text-ink-muted",
};

function toneOf(step: TimelineStep): keyof typeof CHIP_TONE {
    if (step.status === "active") {
        return "info";
    }
    if (step.status === "complete") {
        return "success";
    }
    if (step.status === "incomplete") {
        return "warning";
    }
    if (step.status === "failed") {
        return "danger";
    }
    if (step.next) {
        return "warning";
    }
    return "neutral";
}

function actionTitle(action: SequenceAction, step: TimelineStep, reason: string | null): string {
    if (reason !== null) {
        return reason;
    }
    if (action === "run") {
        if (step.status === "incomplete") {
            return `Resume ${step.name} from the data it already wrote`;
        }
        return step.status === "complete" ? `Run ${step.name} again` : `Run ${step.name}`;
    }
    if (action === "stop") {
        return `Stop ${step.name}`;
    }
    return `Delete ${step.name} data`;
}

/**
 * One configuration section with its sequences' live controls.
 *
 * The card navigates to the section, and the sequence rows are controls inside it: start
 * one step, stop the active one, or delete its data after a confirmation. The title is the
 * link and the card widens the pointer target, so the copy stays selectable instead of
 * sitting under an overlay that turns every word into a button.
 */
export function SequenceSectionCardLive(
    props: Omit<ComponentProps<typeof SequenceSectionCard>, "live" | "blockedElsewhere">,
) {
    // Subscribe here, not on the Configuration page: one progress tick must repaint one
    // card's live line, not the whole section grid and its drafts.
    const live = useSequenceLive(props.projectId, props.videoId);
    const blockedElsewhere = useEncodeBlockedElsewhere(props.projectId, props.videoId);
    return <SequenceSectionCard {...props} live={live} blockedElsewhere={blockedElsewhere} />;
}

export function SequenceSectionCard({
    projectId,
    videoId,
    section,
    title,
    lines,
    badge,
    steps,
    live,
    locked,
    lockedLabel,
    runningVideo,
    blockedElsewhere = false,
    onRun,
    onStop,
    onResetData,
    onResetConfiguration,
    resetConfigurationDisabled,
    pending,
    refusal = null,
    runFailure = null,
}: {
    projectId: string;
    videoId: string;
    section: string;
    title: string;
    lines: string[];
    badge: ReactNode;
    steps: readonly TimelineStep[];
    /** The live status of the video's active sequence, when one is running. */
    live?: SequenceLive | null | undefined;
    locked: boolean;
    lockedLabel: string;
    runningVideo: boolean;
    /** Another video is encoding, so no sequence here can start process-wide. */
    blockedElsewhere?: boolean;
    onRun: (sequence: string) => void;
    onStop: (sequence: string) => void;
    onResetData: (step: TimelineStep) => void;
    onResetConfiguration: () => void;
    resetConfigurationDisabled: boolean;
    pending: boolean;
    /** The refused start or stop for the sequence that issued it. */
    refusal?: { sequence: string; message: string } | null;
    /** The last run's failure, only when this card owns the sequence it reached. */
    runFailure?: VideoFailure | null;
}) {
    const navigate = useNavigate();
    const active = steps.find((step) => step.status === "active");
    // The card shows the same live sentence as the sequence page, so the bar and the card
    // cannot disagree about the pass or the ETA.
    const activeLive = active !== undefined && live?.sequence === active.id ? live : null;
    const progress = activeLive?.progress ?? active?.progress ?? null;
    const reason = locked
        ? lockedLabel
        : blockedElsewhere
          ? "Another video is encoding; only one sequence can run at a time."
          : runningVideo
            ? "Another sequence is running."
            : null;
    const failedStep =
        runFailure === null ? undefined : steps.find((step) => step.id === runFailure.sequence);
    const failureSequence = failedStep?.name ?? runFailure?.sequence ?? null;
    const hasFailure = runFailure !== null && failureSequence !== null;

    return (
        <OpenRow
            as="article"
            // No `overflow-hidden`: a card control's tooltip is a pseudo-element on that
            // control, so the card's own clipping would cut every bubble at its wall.
            className={`relative flex h-full min-h-[132px] min-w-0 cursor-pointer flex-col rounded-lg border ${
                hasFailure
                    ? "border-danger/40 hover:border-danger/60"
                    : "border-line hover:border-line-strong"
            } bg-surface transition-colors duration-150 hover:bg-raised focus-within:border-brand`}
            onOpen={() =>
                void navigate({
                    to: "/projects/$projectId/videos/$videoId/config/$section",
                    params: { projectId, videoId, section },
                })
            }
        >
            {hasFailure ? (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-l-[7px] bg-danger"
                />
            ) : null}
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="flex min-w-0 items-start justify-between gap-2 px-4 pt-3.5">
                    <h2 className="m-0 text-[15px] font-semibold text-ink">
                        <Link
                            to="/projects/$projectId/videos/$videoId/config/$section"
                            params={{ projectId, videoId, section }}
                            aria-label={`Open ${title} configuration`}
                            className="rounded-sm hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                            {title}
                        </Link>
                    </h2>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {resetConfigurationDisabled ? null : (
                            <Button
                                variant="ghost"
                                className="h-6 px-1.5 text-[9.5px]"
                                disabled={locked || pending}
                                data-tip="Reset this section to the project's configuration"
                                data-tip-align="end"
                                onClick={onResetConfiguration}
                            >
                                <RotateCcw aria-hidden="true" className="h-3 w-3" />
                                Reset config
                            </Button>
                        )}
                        {badge}
                    </div>
                </div>
                {runFailure !== null && failureSequence !== null ? (
                    <SequenceFailureRail sequence={failureSequence} message={runFailure.message} />
                ) : null}
                <div className="mt-1.5 min-w-0 space-y-0.5 px-4">
                    {lines.map((line) => (
                        // The tip is on the paragraph, not on its truncating child: a tooltip
                        // drawn by a box with `overflow: hidden` is clipped to that box, and
                        // the bubble opens below the line.
                        <p
                            key={line}
                            className="m-0 min-w-0 cursor-text text-[10.5px] leading-relaxed text-ink-secondary"
                            data-tip={line}
                        >
                            <span className="block truncate">{line}</span>
                        </p>
                    ))}
                </div>

                {/* This row sits on the card's clipped bottom edge, so its action
                    tooltips open upward into the card; each is right-aligned so a wide
                    sentence cannot run past the card's right edge. */}
                <div className="mt-auto space-y-1 px-3 pb-2 pt-2.5" data-tips="up">
                    {steps.length === 0 ? (
                        <p className="m-0 rounded-md border border-dashed border-line px-2 py-1.5 text-[9.5px] text-ink-muted">
                            No sequence for this section in the current pipeline.
                        </p>
                    ) : (
                        <>
                            {steps.map((step) => {
                                const isActive = step.status === "active";
                                const liveLine =
                                    isActive && live?.sequence === step.id
                                        ? liveSummary(live)
                                        : null;
                                const runLabel = step.status === "incomplete" ? "Resume" : "Start";
                                const tone = toneOf(step);
                                // Speed Scaler stores no completion field, but its reset is
                                // real: it restores every scene speed to the main encoder's.
                                // Bitrate Optimizer has no safe reset and is never offered one.
                                const resetReady =
                                    step.status === "complete" ||
                                    step.status === "incomplete" ||
                                    step.status === "failed" ||
                                    (step.id === "SpeedScaler" && step.runnable);
                                const runBlocked = reason !== null || (!isActive && !step.runnable);
                                return (
                                    <div key={step.id} className="min-w-0">
                                        <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-line-subtle bg-sunken/55 px-1.5 py-1">
                                            <span
                                                className={`shrink-0 cursor-text rounded-full border px-1.5 py-px text-[8.5px] whitespace-nowrap ${CHIP_TONE[tone]}`}
                                                title={step.detail ?? step.name}
                                            >
                                                {step.name}
                                            </span>
                                            <span
                                                className="min-w-0 cursor-text truncate text-[9.5px] text-ink-muted"
                                                title={liveLine ?? step.detail ?? step.label}
                                            >
                                                {liveLine ??
                                                    `${step.label}${
                                                        step.detail === null
                                                            ? ""
                                                            : ` · ${step.detail}`
                                                    }`}
                                            </span>
                                            <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
                                                        title={actionTitle("stop", step, null)}
                                                        disabled={pending}
                                                        tone="danger"
                                                        onClick={() => onStop(step.id)}
                                                    />
                                                ) : (
                                                    <SequenceActionButton
                                                        icon={
                                                            runBlocked ? (
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
                                                        label={runLabel}
                                                        ariaLabel={`${runLabel} ${step.name}`}
                                                        title={actionTitle(
                                                            "run",
                                                            step,
                                                            runBlocked ? reason : null,
                                                        )}
                                                        disabled={
                                                            runBlocked || pending || !step.runnable
                                                        }
                                                        onClick={() => onRun(step.id)}
                                                    />
                                                )}
                                                {resetReady ? (
                                                    <SequenceActionButton
                                                        icon={
                                                            <RotateCcw
                                                                aria-hidden="true"
                                                                className="h-2.5 w-2.5"
                                                            />
                                                        }
                                                        label="Reset data"
                                                        ariaLabel={`Reset ${step.name} data`}
                                                        title={`Delete ${step.name} data`}
                                                        disabled={locked || pending}
                                                        tone="warning"
                                                        onClick={() => onResetData(step)}
                                                    />
                                                ) : null}
                                            </div>
                                        </div>
                                        {refusal?.sequence === step.id ? (
                                            <p
                                                role="alert"
                                                className="mt-1 mb-0 rounded-md border border-danger/30 bg-danger-soft px-2 py-1 text-[9.5px] leading-relaxed text-danger"
                                            >
                                                {refusal.message}
                                            </p>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>

            <div
                role={active === undefined ? undefined : "progressbar"}
                aria-label={active === undefined ? undefined : `${active.name} progress`}
                aria-valuemin={active === undefined ? undefined : 0}
                aria-valuemax={active === undefined ? undefined : 100}
                aria-valuenow={
                    active === undefined || active.progress === null
                        ? undefined
                        : Math.round(active.progress)
                }
                className="h-1 w-full shrink-0 overflow-hidden rounded-b-[7px] bg-line-subtle"
            >
                <div
                    className="h-full bg-brand transition-transform duration-200"
                    style={{
                        transform: `scaleX(${String(
                            active === undefined || progress === null
                                ? 0
                                : Math.max(0, Math.min(100, progress)) / 100,
                        )})`,
                        transformOrigin: "left",
                    }}
                />
            </div>
        </OpenRow>
    );
}
