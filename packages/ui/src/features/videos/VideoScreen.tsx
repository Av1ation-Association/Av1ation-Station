import { useMemo, useState } from "react";

import {
    useCancelVideoEncode,
    useProject,
    useResetSequenceData,
    useResetVideoOverrides,
    useSaveVideoOverrides,
    useStartVideoSequence,
    useVideo,
    useVideoConfig,
    useVideoGeneral,
    useVideoOverrides,
    useVideoState,
    useVideoStorage,
} from "@av1ation/api";
import { Link, useParams } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { useDemoMode } from "../../shared/demo-mode";
import { DialogFrame } from "../../shared/DialogFrame";
import { ScreenMain } from "../../shared/ScreenMain";
import { inputSummary } from "../../shared/model/input-model";
import { SectionBadge, SectionCard } from "../../shared/SectionCard";
import { SequenceSectionCardLive } from "../configuration/SequenceSectionCard";
import { SequenceFailureRail } from "../configuration/SequenceFailureRail";
import { VideoRunActions } from "./VideoRunActions";
import { VideoTabs } from "./VideoTabs";
import { documentFromValues } from "../../shared/schema/config-schema";
import { retainedLabel } from "../../shared/format";
import { resetDataCopy } from "../../shared/reset-copy";
import { DEFINITIONS } from "../../shared/model/section-definitions";
import { sectionSummary } from "../../shared/model/section-summary";
import { failureSummary } from "../../shared/model/video-status";
import { videoTimeline, type TimelineStep } from "../../shared/model/video-timeline";
import { sectionOverrideCount } from "./video-overrides";
import {
    SECTION_SEQUENCES,
    VIDEO_OVERRIDE_SECTIONS,
    failureOwnerForSequence,
} from "../../shared/model/video-sections";

/** The override roots that belong to one configuration card. */
const SECTION_RESET_PREFIXES: Record<string, readonly string[]> = {
    "scene-detection": ["sequences.scene_detector"],
    "noise-generation": ["sequences.noise_detector", "sequences.noise_scaler"],
    "target-quality": [
        "sequences.target_quality",
        "sequences.speed_scaler",
        "sequences.bitrate_optimizer",
    ],
    encoding: ["encoder", "sequences.parallel_encoder", "sequences.benchmarker"],
    concatenation: ["sequences.scene_concatenator"],
    "quality-check": ["sequences.quality_check"],
};

/**
 * One video's configuration map.
 *
 * The tabs are the video's own surfaces; this page is only the Configuration one. The
 * General card owns the input, the output file, and the scratch directory because they are
 * one document about the file, and each sequence card carries the derived status of the
 * sequences it configures. Clicking anywhere on a card is the only navigation control.
 */
export function VideoScreen() {
    const { projectId, videoId } = useParams({
        from: "/projects/$projectId/videos/$videoId",
    });
    const project = useProject(projectId);
    const video = useVideo(projectId, videoId);
    const state = useVideoState(projectId, videoId);
    const config = useVideoConfig(projectId, videoId);
    const general = useVideoGeneral(projectId, videoId);
    const overrides = useVideoOverrides(projectId, videoId);
    const storage = useVideoStorage(projectId, videoId);
    const demo = useDemoMode();
    const reset = useResetVideoOverrides(projectId, videoId);
    const resetData = useResetSequenceData(projectId);
    const startSequence = useStartVideoSequence(projectId);
    const cancel = useCancelVideoEncode(projectId);
    const saveOverrides = useSaveVideoOverrides(projectId, videoId);

    const [confirmReset, setConfirmReset] = useState(false);
    const [resetTarget, setResetTarget] = useState<TimelineStep | null>(null);
    const [refusal, setRefusal] = useState<{ sequence: string; message: string } | null>(null);

    const locked = state.data?.active === true;
    const document = useMemo(
        () => (config.data === undefined ? {} : documentFromValues(config.data.values)),
        [config.data],
    );
    const fields = overrides.data?.fields ?? {};
    const failure = state.data?.failure ?? null;
    const failureOwner = failureOwnerForSequence(failure?.sequence ?? null);
    const overrideCount = Object.keys(fields).length;
    const timeline = useMemo(() => videoTimeline(state.data), [state.data]);
    const steps = useMemo(() => timeline.phases.flatMap((phase) => phase.steps), [timeline]);

    const runSequence = (sequence: string) => {
        setRefusal(null);
        startSequence.mutate(
            { videoId, sequence },
            {
                onError: (error) => setRefusal({ sequence, message: error.message }),
            },
        );
    };

    const stopRun = (sequence: string) => {
        setRefusal(null);
        cancel.mutate(videoId, {
            onError: (error) => setRefusal({ sequence, message: error.message }),
        });
    };

    const confirmResetData = () => {
        if (resetTarget === null) {
            return;
        }
        const target = resetTarget;
        resetData.mutate(
            { videoId, sequence: target.id },
            {
                onSuccess: () => {
                    setResetTarget(null);
                    toast.success(`${target.name} data reset`);
                },
                onError: (error) => toast.error(error.message),
            },
        );
    };

    const resetSectionConfiguration = (section: string) => {
        const prefixes = SECTION_RESET_PREFIXES[section] ?? [];
        const next = Object.fromEntries(
            Object.entries(fields).filter(
                ([path]) =>
                    !prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)),
            ),
        );
        saveOverrides.mutate(
            { fields: next },
            {
                onSuccess: () => toast.success("Section reset to the project configuration"),
                onError: (error) => toast.error(error.message),
            },
        );
    };

    const confirmResetAll = () => {
        reset.mutate(undefined, {
            onSuccess: () => {
                setConfirmReset(false);
                toast.success("Every override removed; the video inherits the project again");
            },
        });
    };

    if (video.isPending) {
        return (
            <ScreenMain aria-busy="true" className="flex min-h-[60vh] flex-col">
                <div className="h-11 border-b border-line" />
                <div className="page py-6">
                    <div className="h-2.5 w-36 animate-pulse rounded-sm bg-raised" />
                    <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {[0, 1, 2, 3, 4, 5].map((card) => (
                            <div
                                key={card}
                                className="h-[132px] animate-pulse rounded-lg border border-line bg-surface"
                            />
                        ))}
                    </div>
                </div>
            </ScreenMain>
        );
    }

    if (video.isError) {
        return (
            <ScreenMain className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-danger/30 bg-surface p-6" role="alert">
                    <h1 className="m-0 text-xl font-semibold text-ink">
                        This video could not be opened
                    </h1>
                    <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                        {video.error instanceof Error
                            ? video.error.message
                            : "The service did not respond."}
                    </p>
                    <Button variant="secondary" onClick={() => void video.refetch()}>
                        Retry
                    </Button>
                </div>
            </ScreenMain>
        );
    }

    const detail = video.data;
    const generalFailure = failureOwner === "general" ? failure : null;
    const generalCard = (
        <SectionCard
            title="General"
            lines={[
                general.data === undefined
                    ? "Loading the input…"
                    : inputSummary(general.data.input),
                detail.output_path === "" ? "No output file chosen" : detail.output_path,
                storage.data === undefined
                    ? "Retained work is measured on read"
                    : `${retainedLabel(storage.data.retained_bytes)}${
                          storage.data.custom ? " · own directory" : " · project directory"
                      }`,
            ]}
            badge={<SectionBadge tone="custom">Video</SectionBadge>}
            failed={generalFailure !== null}
            alert={
                generalFailure === null ? undefined : (
                    <SequenceFailureRail sequence="General" message={generalFailure.message} />
                )
            }
        />
    );

    return (
        <ScreenMain className="flex min-h-[calc(100dvh-56px)] flex-col">
            <VideoTabs
                projectId={projectId}
                videoId={videoId}
                active="configuration"
                note={
                    state.data === undefined
                        ? undefined
                        : `${String(state.data.scene_count)} ${
                              state.data.scene_count === 1 ? "scene" : "scenes"
                          } · ${
                              overrideCount === 0
                                  ? "inherits every section"
                                  : `${String(overrideCount)} ${overrideCount === 1 ? "override" : "overrides"}`
                          }`
                }
            />
            <VideoRunActions
                projectId={projectId}
                videoId={videoId}
                state={state.data}
                locked={locked}
                lockedLabel={
                    video.data === undefined
                        ? "Locked while an encode runs"
                        : `${video.data.name} is encoding`
                }
            />

            <div className="page flex-1 py-5">
                {failure === null || failureOwner !== null ? null : (
                    <div
                        role="alert"
                        className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
                    >
                        <p className="m-0 text-[12px] font-medium text-danger">
                            The last run failed
                        </p>
                        <p
                            className="mt-1 mb-0 line-clamp-3 font-mono text-[11px] leading-relaxed break-words text-danger/90"
                            title={failure.message}
                        >
                            {failureSummary(failure.message)}
                        </p>
                    </div>
                )}

                <div className="mb-3 flex flex-wrap items-center gap-3">
                    <h1 className="m-0 text-[15px] font-semibold text-ink">Pipeline</h1>
                    <p className="m-0 max-w-[80ch] text-[11px] text-ink-muted">
                        {demo
                            ? "Watch the sample encode move through each sequence. The cards report the current step, progress, and the data that sequence produced; the tabs open Scenes, History, and Logs."
                            : "Each card owns its sequence settings, an individual start and stop, and the data that sequence produced. Click anywhere else on a card to edit its configuration; there is no draft to lose by switching."}
                    </p>
                    {demo ? null : overrideCount > 0 ? (
                        <Button
                            variant="ghost"
                            className="ml-auto h-7 px-2 text-[11px]"
                            disabled={locked || reset.isPending}
                            onClick={() => setConfirmReset(true)}
                        >
                            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                            Reset all overrides
                        </Button>
                    ) : (
                        <span className="ml-auto text-[10.5px] text-ink-muted">
                            Every section inherits the project
                        </span>
                    )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {demo ? (
                        <div className="block min-w-0 rounded-lg">{generalCard}</div>
                    ) : (
                        <Link
                            to="/projects/$projectId/videos/$videoId/config/general"
                            params={{ projectId, videoId }}
                            className="group block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                            {generalCard}
                        </Link>
                    )}

                    {VIDEO_OVERRIDE_SECTIONS.map((entry) => {
                        const count = sectionOverrideCount(fields, DEFINITIONS[entry.id]);
                        const ids = SECTION_SEQUENCES[entry.id] ?? [];
                        const sectionSteps = ids
                            .map((id) => steps.find((step) => step.id === id))
                            .filter((step): step is TimelineStep => step !== undefined);
                        return (
                            <SequenceSectionCardLive
                                key={entry.id}
                                projectId={projectId}
                                videoId={videoId}
                                section={entry.id}
                                title={entry.label}
                                lines={sectionSummary(entry.id, document)}
                                badge={
                                    <SectionBadge tone={count > 0 ? "custom" : "neutral"}>
                                        {count === 0
                                            ? "Inherited"
                                            : `${String(count)} ${count === 1 ? "override" : "overrides"}`}
                                    </SectionBadge>
                                }
                                steps={sectionSteps}
                                locked={locked}
                                lockedLabel={
                                    video.data === undefined
                                        ? "Locked while an encode runs"
                                        : `${video.data.name} is encoding`
                                }
                                runningVideo={state.data?.active === true}
                                onRun={runSequence}
                                onStop={stopRun}
                                onResetData={setResetTarget}
                                onResetConfiguration={() => resetSectionConfiguration(entry.id)}
                                resetConfigurationDisabled={count === 0}
                                pending={
                                    startSequence.isPending ||
                                    cancel.isPending ||
                                    resetData.isPending ||
                                    saveOverrides.isPending
                                }
                                refusal={refusal}
                                runFailure={failureOwner === entry.id ? failure : null}
                            />
                        );
                    })}
                </div>

                <p className="mt-4 mb-0 max-w-[92ch] text-[10.5px] leading-relaxed text-ink-muted">
                    {project.data === undefined
                        ? "Loading the project…"
                        : timeline.summary === null
                          ? `Overrides apply to ${detail.name} only; every other video keeps the project's configuration.`
                          : `${timeline.summary.label} · ${timeline.summary.detail}`}
                </p>
            </div>

            <DialogFrame
                open={confirmReset}
                onDismiss={() => setConfirmReset(false)}
                dismissible={!reset.isPending}
                labelledBy="reset-overrides-title"
                className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="border-b border-line px-5 py-4">
                    <h2 id="reset-overrides-title" className="m-0 text-base font-semibold">
                        Reset all overrides?
                    </h2>
                </div>
                <div className="px-5 py-4">
                    <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
                        This removes {String(overrideCount)}{" "}
                        {overrideCount === 1 ? "override" : "overrides"} from this video. Every
                        sequence inherits the project's configuration again; the source and output
                        file are untouched.
                    </p>
                    {reset.isError ? (
                        <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                            {reset.error instanceof Error
                                ? reset.error.message
                                : "The overrides could not be removed. Try again."}
                        </p>
                    ) : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                    <Button
                        variant="secondary"
                        onClick={() => setConfirmReset(false)}
                        disabled={reset.isPending}
                    >
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={confirmResetAll} disabled={reset.isPending}>
                        {reset.isPending ? "Removing…" : "Reset overrides"}
                    </Button>
                </div>
            </DialogFrame>

            <DialogFrame
                open={resetTarget !== null}
                onDismiss={() => setResetTarget(null)}
                dismissible={!resetData.isPending}
                labelledBy="reset-sequence-title"
                className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="border-b border-line px-5 py-4">
                    <h2 id="reset-sequence-title" className="m-0 text-base font-semibold">
                        Reset {resetTarget?.name ?? "sequence"} data?
                    </h2>
                </div>
                <div className="px-5 py-4">
                    <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
                        {resetTarget === null
                            ? ""
                            : resetDataCopy(resetTarget.id, resetTarget.name)}
                    </p>
                    <p className="m-0 mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11.5px] leading-relaxed text-warning">
                        This is permanent. The sequence's configuration and every other sequence's
                        data are not changed.
                    </p>
                    {resetData.isError ? (
                        <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                            {resetData.error instanceof Error
                                ? resetData.error.message
                                : "The data could not be reset. Try again."}
                        </p>
                    ) : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                    <Button
                        variant="secondary"
                        onClick={() => setResetTarget(null)}
                        disabled={resetData.isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        onClick={confirmResetData}
                        disabled={resetData.isPending}
                    >
                        {resetData.isPending ? "Deleting…" : "Delete data"}
                    </Button>
                </div>
            </DialogFrame>
        </ScreenMain>
    );
}
