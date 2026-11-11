import { useEffect, useMemo, useRef, useState } from "react";

import {
    useCancelVideoEncode,
    useConfigSchemas,
    useEncoders,
    useProjectConfig,
    useResetSequenceData,
    useStartVideoSequence,
    useVideoGeneral,
    useProbeVideo,
    useSaveVideoOverrides,
    useVideo,
    useVideoConfig,
    useVideoHistory,
    useVideoOverrides,
    useVideoScenes,
    useVideoState,
    useVideoValidation,
} from "@av1ation/api";
import { useNavigate, useParams } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { InlineError } from "../../shared/InlineError";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { SequenceAnalyticsCard } from "../analytics/SequenceAnalyticsCard";
import { sequenceAnalytics } from "../analytics/sequence-analytics";
import { ScriptPluginNotice } from "../../shared/ScriptPluginNotice";
import { SequenceRunBarLive } from "../configuration/SequenceRunBar";
import { DraftActions } from "../../shared/TopBarActions";
import { VideoTabs } from "./VideoTabs";
import { inputKindOf, inputValueOf } from "../../shared/model/input-model";
import { useAllowNavigation } from "../../shared/UnsavedChanges";
import { useDraftSession } from "../../shared/useDraftSession";
import { documentFromValues } from "../../shared/schema/config-schema";
import { DEFINITIONS } from "../../shared/model/section-definitions";
import { historyRuns } from "../../shared/model/history-model";
import {
    ConcatenationEditor,
    SectionParts,
    encoderAppliesFilter,
    mergeDraft,
    schemaFor,
} from "../configuration/SectionEditor";
import { Skeleton } from "../../shared/Skeleton";
import {
    mergeSectionOverrides,
    sectionDraft,
    sectionOverrideCount,
    sectionOverridePaths,
} from "./video-overrides";
import {
    SECTION_PLUGIN_CONTEXTS,
    SECTION_SEQUENCES,
    isVideoOverrideSection,
    failureOwnerForSequence,
} from "../../shared/model/video-sections";
import { videoTimeline, type TimelineStep } from "../../shared/model/video-timeline";
import { VideoProbeContext } from "../../shared/video/video-probe";
import { resetDataCopy } from "../../shared/reset-copy";

/**
 * One sequence's configuration for one video.
 *
 * The controls are the project section's own, so a video cannot drift into a second editor.
 * What differs is what Save writes: a whole-section override for each part, or nothing when
 * the part now matches the project again. That keeps inheritance at the level the grid
 * offers and lets a section change shape — a different encoder variant, a different detector
 * — without the project's variant surviving underneath it.
 */
export function VideoSectionScreen() {
    const { projectId, videoId, section } = useParams({
        from: "/projects/$projectId/videos/$videoId/config/$section",
    });
    const definition = isVideoOverrideSection(section) ? DEFINITIONS[section] : null;

    const projectConfig = useProjectConfig(projectId);
    const videoConfig = useVideoConfig(projectId, videoId);
    const overrides = useVideoOverrides(projectId, videoId);
    const schemas = useConfigSchemas();
    const encoders = useEncoders();
    const video = useVideo(projectId, videoId);
    const general = useVideoGeneral(projectId, videoId);
    const state = useVideoState(projectId, videoId);
    const failure = state.data?.failure ?? null;
    const failureOwner = failureOwnerForSequence(failure?.sequence ?? null);
    const validation = useVideoValidation(projectId, videoId);
    const sceneTable = useVideoScenes(projectId, videoId);
    const scenes = useMemo(() => sceneTable.data?.scenes ?? [], [sceneTable.data]);
    const historyQuery = useVideoHistory(projectId, videoId);
    const runs = useMemo(() => historyRuns(historyQuery.data?.entries ?? []), [historyQuery.data]);
    const probe = useProbeVideo(projectId, videoId, scenes.length > 0);
    const frameRate = probe.data?.clip?.frame_rate ?? null;
    const sourceWidth = probe.data?.clip?.width ?? null;
    const sourceHeight = probe.data?.clip?.height ?? null;
    const save = useSaveVideoOverrides(projectId, videoId);
    const resetData = useResetSequenceData(projectId);
    const startSequence = useStartVideoSequence(projectId);
    const cancelEncode = useCancelVideoEncode(projectId);
    const [resetTarget, setResetTarget] = useState<TimelineStep | null>(null);
    const [refusal, setRefusal] = useState<{ sequence: string; message: string } | null>(null);
    const resetDialog = useRef<HTMLDialogElement>(null);
    const navigate = useNavigate();
    const allowNavigation = useAllowNavigation();

    // A sequence override starts from the same file General decodes, but a script names no
    // file of its own and the field should stay empty there.
    const probeScope = useMemo(() => {
        const generalInput = general.data?.input;
        const script = inputKindOf(generalInput) === "vapour_synth_script";
        const path = script ? "" : inputValueOf(generalInput).path;
        return {
            projectId,
            videoId,
            sourcePath: path === "" ? (video.data?.input_path ?? "") : path,
        };
    }, [general.data?.input, projectId, video.data?.input_path, videoId]);

    const baseDocument = useMemo(
        () =>
            projectConfig.data === undefined ? null : documentFromValues(projectConfig.data.values),
        [projectConfig.data],
    );
    const videoDocument = useMemo(
        () => (videoConfig.data === undefined ? null : documentFromValues(videoConfig.data.values)),
        [videoConfig.data],
    );

    const timeline = useMemo(() => videoTimeline(state.data), [state.data]);
    const sectionSteps = useMemo<TimelineStep[]>(() => {
        if (definition === null) {
            return [];
        }
        const all = timeline.phases.flatMap((phase) => phase.steps);
        return (SECTION_SEQUENCES[definition.id] ?? [])
            .map((id) => all.find((step) => step.id === id))
            .filter((step): step is TimelineStep => step !== undefined);
    }, [definition, timeline]);

    const locked = state.data?.active === true;
    const resolved = useMemo(
        () =>
            definition === null || schemas.data === undefined
                ? null
                : schemaFor(schemas.data, definition),
        [definition, schemas.data],
    );
    const fields = overrides.data?.fields ?? {};
    const count = definition === null ? 0 : sectionOverrideCount(fields, definition);

    const session = useDraftSession<Record<string, unknown>, Record<string, unknown>>({
        identity: `${projectId}/${videoId}/${section}`,
        label: definition?.title ?? "Video overrides",
        snapshot: definition === null || videoDocument === null ? undefined : videoDocument,
        toDraft: (server) => (definition === null ? {} : sectionDraft(definition, server)),
        save: async (draft, server) => {
            if (definition === null || baseDocument === null || overrides.data === undefined) {
                return false;
            }
            try {
                const next = mergeDraft(server, definition, draft);
                const merged = mergeSectionOverrides(
                    overrides.data.fields,
                    definition,
                    baseDocument,
                    next,
                );
                await save.mutateAsync({ fields: merged });
                toast.success(`${definition.title} overrides saved`);
                return true;
            } catch {
                return false;
            }
        },
        pending: save.isPending,
        active: definition !== null,
    });
    const draft = session.value;

    useEffect(() => {
        const dialog = resetDialog.current;
        if (dialog === null) {
            return;
        }
        if (resetTarget !== null && !dialog.open) {
            dialog.showModal();
        }
        if (resetTarget === null && dialog.open) {
            dialog.close();
        }
    }, [resetTarget]);

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

    const saveBeforeSequence = async (): Promise<boolean> => {
        const saved = await session.save();
        if (!saved) {
            toast.error(`Save ${definition?.title ?? "this section"} before starting a sequence.`);
        }
        return saved;
    };

    const runSequence = (sequence: string) => {
        setRefusal(null);
        startSequence.mutate(
            { videoId, sequence },
            { onError: (error) => setRefusal({ sequence, message: error.message }) },
        );
    };

    const stopSequence = (sequence: string) => {
        setRefusal(null);
        cancelEncode.mutate(videoId, {
            onError: (error) => setRefusal({ sequence, message: error.message }),
        });
    };

    const openScript = async (part: string) => {
        if (session.dirty) {
            const saved = await session.save();
            if (!saved) {
                toast.error(
                    `Save ${definition?.title ?? "this section"} before opening its script.`,
                );
                return;
            }
        }
        allowNavigation();
        void navigate({
            to: "/projects/$projectId/videos/$videoId/script",
            params: { projectId, videoId },
            search: { section: definition?.id ?? section, part },
        });
    };

    /** Remove every server-side override this section owns, then reset the draft to match. */
    const resetConfiguration = async () => {
        if (definition === null || baseDocument === null || overrides.data === undefined) {
            return;
        }
        const paths = sectionOverridePaths(definition);
        const next = Object.fromEntries(
            Object.entries(overrides.data.fields).filter(
                ([path]) =>
                    !paths.some((prefix) => path === prefix || path.startsWith(`${prefix}.`)),
            ),
        );
        try {
            await save.mutateAsync({ fields: next });
            session.resetTo(sectionDraft(definition, baseDocument));
            toast.success(`${definition.title} reset to the project configuration`);
        } catch {
            // The mutation error is rendered below the header with the rest of the section.
        }
    };

    // One derivation, one reader: the card draws the chart, the figures and the table from
    // the same catalogue, so a checkpoint cannot make one of them disagree with another.
    // Keep this above the missing-section return: hooks must run in the same order every time.
    const analytics = useMemo(
        () =>
            definition === null || videoDocument === null
                ? null
                : sequenceAnalytics(definition.id, {
                      scenes,
                      frameRate,
                      width: sourceWidth,
                      height: sourceHeight,
                      document: videoDocument,
                      outputExists: state.data?.output_exists === true,
                  }),
        [
            definition,
            scenes,
            videoDocument,
            frameRate,
            sourceWidth,
            sourceHeight,
            state.data?.output_exists,
        ],
    );

    if (definition === null) {
        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-line bg-surface p-6">
                    <h1 className="m-0 text-xl font-semibold text-ink">
                        No such configuration section
                    </h1>
                    <p className="mt-2 mb-0 text-[13px] leading-relaxed text-ink-secondary">
                        The address does not name a sequence a video can override.
                    </p>
                </div>
            </main>
        );
    }

    const pending =
        projectConfig.isPending ||
        videoConfig.isPending ||
        overrides.isPending ||
        schemas.isPending ||
        video.isPending;
    const failed =
        projectConfig.isError || videoConfig.isError || overrides.isError || schemas.isError;
    return (
        <main id="main" className="flex min-h-[calc(100dvh-56px)] flex-col">
            <VideoProbeContext.Provider value={probeScope}>
                <VideoTabs
                    projectId={projectId}
                    videoId={videoId}
                    active="configuration"
                    note={definition.title}
                />
                <div className="page flex-1 py-5">
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">
                                    {definition.title}
                                </h1>
                                <span
                                    className={`rounded-full border px-2 py-0.5 font-mono text-[8.5px] tracking-[0.12em] uppercase ${
                                        count > 0
                                            ? "border-warning/40 text-warning"
                                            : "border-line-strong text-ink-muted"
                                    }`}
                                >
                                    {count === 0
                                        ? "Inherited"
                                        : `${String(count)} ${count === 1 ? "override" : "overrides"}`}
                                </span>
                            </div>
                            <p className="mt-1 mb-0 max-w-[76ch] text-[11.5px] leading-relaxed text-ink-secondary">
                                {definition.description} This document applies to{" "}
                                <span className="font-medium text-ink">
                                    {video.data?.name ?? "this video"}
                                </span>{" "}
                                only; every other video keeps the project's values.
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            className="h-8 px-2.5 text-[11px]"
                            disabled={locked || save.isPending || count === 0}
                            title="Remove this section's overrides and inherit the project again"
                            // The page header's right edge is the window's, so the bubble grows
                            // inward instead of ending past the viewport.
                            data-tip-align="end"
                            onClick={() => void resetConfiguration()}
                        >
                            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                            Reset configuration
                        </Button>
                    </header>

                    <SequenceRunBarLive
                        projectId={projectId}
                        videoId={videoId}
                        steps={sectionSteps}
                        locked={locked}
                        lockedLabel={
                            video.data === undefined
                                ? "Locked while an encode runs"
                                : `${video.data.name} is encoding`
                        }
                        runningVideo={state.data?.active === true}
                        history={runs}
                        sceneCount={scenes.length}
                        pending={
                            resetData.isPending || startSequence.isPending || cancelEncode.isPending
                        }
                        refusal={refusal}
                        runFailure={failureOwner === definition.id ? failure : null}
                        dirty={session.dirty}
                        onSave={saveBeforeSequence}
                        onRun={runSequence}
                        onStop={stopSequence}
                        onResetData={setResetTarget}
                    />

                    {definition === null ? null : (
                        <div className="mt-4">
                            <ScriptPluginNotice
                                problems={validation.data?.plugin_problems ?? []}
                                contexts={SECTION_PLUGIN_CONTEXTS[definition.id]}
                            />
                        </div>
                    )}

                    {save.isError ? (
                        <InlineError className="mt-4 mb-0">
                            {save.error instanceof Error
                                ? `The overrides could not be saved: ${save.error.message}`
                                : "The overrides could not be saved."}
                        </InlineError>
                    ) : null}

                    {pending ? (
                        <div className="mt-5 space-y-4" aria-busy="true">
                            <Skeleton className="h-64 rounded-lg" />
                            <Skeleton className="h-40 rounded-lg" />
                        </div>
                    ) : null}

                    {failed ? (
                        <LoadErrorPanel
                            className="mt-5"
                            heading="h2"
                            title="This section could not be loaded"
                            message="The project, the video overrides, or the engine schema did not arrive."
                            retryLabel="Retry"
                            onRetry={() => {
                                void projectConfig.refetch();
                                void videoConfig.refetch();
                                void overrides.refetch();
                                void schemas.refetch();
                            }}
                        />
                    ) : null}

                    {resolved === null || draft === null || videoDocument === null ? null : (
                        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                            <div className="min-w-0 space-y-4">
                                <p className="m-0 rounded-md border border-line bg-sunken px-3 py-2 text-[10.5px] leading-relaxed text-ink-secondary">
                                    A part with no override is read from the project. Save writes
                                    only this section: a part that matches the project again stops
                                    being an override, and every other section keeps its own values.
                                </p>

                                {definition.id === "concatenation" ? (
                                    <ConcatenationEditor
                                        draft={draft}
                                        setDraft={session.setValue}
                                        locked={locked}
                                        scope="video"
                                        projectId={projectId}
                                        videoId={videoId}
                                        schema={resolved.parts[0]}
                                    />
                                ) : (
                                    <SectionParts
                                        definition={definition}
                                        resolved={resolved}
                                        draft={draft}
                                        setDraft={session.setValue}
                                        locked={locked}
                                        scope="video"
                                        encoderDocument={videoDocument}
                                        encoders={encoders.data}
                                        onEditScript={(part) => void openScript(part)}
                                        encodingFilter={encoderAppliesFilter(videoDocument)}
                                    />
                                )}

                                {analytics === null ? null : (
                                    <SequenceAnalyticsCard analytics={analytics} />
                                )}

                                <p className="m-0 max-w-[80ch] text-[11px] leading-relaxed text-ink-muted">
                                    {definition.note}
                                </p>
                            </div>

                            <aside className="min-w-0 space-y-4">
                                {definition.runOrder === undefined ? null : (
                                    <section className="rounded-lg border border-line bg-surface p-5">
                                        <h2 className="m-0 text-sm font-semibold text-ink">
                                            Run order
                                        </h2>
                                        <ol className="mt-4 mb-0 list-none space-y-3 p-0">
                                            {definition.runOrder.map((stage, index) => (
                                                <li key={stage.label} className="flex gap-2.5">
                                                    <span
                                                        aria-hidden="true"
                                                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[9px] text-ink-secondary"
                                                    >
                                                        {index + 1}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block text-[11.5px] font-medium text-ink">
                                                            {stage.label}
                                                        </span>
                                                        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                                                            {stage.detail}
                                                        </span>
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    </section>
                                )}
                                <section className="rounded-lg border border-line bg-surface p-5">
                                    <h2 className="m-0 text-sm font-semibold text-ink">
                                        What it produces
                                    </h2>
                                    <ul className="mt-4 mb-0 list-none space-y-3 p-0">
                                        {definition.outputs.map((output) => (
                                            <li key={output.label} className="flex gap-2.5">
                                                <span
                                                    aria-hidden="true"
                                                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-[11.5px] font-medium text-ink">
                                                        {output.label}
                                                    </span>
                                                    <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                                                        {output.detail}
                                                    </span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            </aside>
                        </div>
                    )}

                    <DraftActions
                        {...session.actions}
                        locked={locked}
                        lockedLabel={
                            video.data === undefined
                                ? "Locked while an encode runs"
                                : `${video.data.name} is encoding`
                        }
                    />
                </div>

                <dialog
                    ref={resetDialog}
                    aria-labelledby="reset-sequence-title"
                    onClose={() => setResetTarget(null)}
                    onClick={(event) => {
                        if (event.target === event.currentTarget && !resetData.isPending) {
                            setResetTarget(null);
                        }
                    }}
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
                            This is permanent. The sequence&apos;s configuration and every other
                            sequence&apos;s data are not changed.
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
                </dialog>
            </VideoProbeContext.Provider>
        </main>
    );
}
