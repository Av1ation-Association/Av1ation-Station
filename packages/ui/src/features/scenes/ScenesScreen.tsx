import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
} from "react";

import {
    useEncodeBlockedElsewhere,
    useProbeVideo,
    useSceneThumbnail,
    useStartVideoSequence,
    useVideo,
    useVideoScenes,
    useVideoState,
} from "@av1ation/api";
import { useParams } from "@tanstack/react-router";
import { Film, Lock, PanelLeftOpen, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { ScreenMain } from "../../shared/ScreenMain";
import { sceneAtFrame, sceneValidation, sceneWarnings } from "../../shared/model/scene-layout";
import { SceneContextMenu } from "./SceneContextMenu";
import { SceneDetailsPanel } from "./SceneDetailsPanel";
import { SceneEditDialogs } from "./SceneEditDialogs";
import { useSceneCommands, type SceneCommandEffects } from "./useSceneCommands";
import { SceneEncoderSheet } from "./SceneEncoderSheet";
import { PreviewOverlay } from "../preview/PreviewOverlay";
import { ScenePlayer, type PreviewSource } from "../preview/ScenePlayer";
import { SceneRail } from "./SceneRail";
import { SceneTimeline } from "./SceneTimeline";
import { DetectionLiveDetail } from "./DetectionLiveDetail";
import { NO_SELECTION, reconcile, selectScene, type SceneSelection } from "./scene-selection";
import { sceneGapAt, selectedScenes } from "./scene-screen-model";
import { ScenesVideoTabs } from "./ScenesVideoTabs";
import { useCompactScenes } from "./useCompactScenes";
import { VideoRunActions } from "../videos/VideoRunActions";
import { VideoTabs } from "../videos/VideoTabs";

const NO_CUSTOM_DATA: Record<string, unknown> = {};

/**
 * The Scenes tab: one rail, one proportional timeline, and one shared selection.
 *
 * The page never scrolls. Its surfaces divide the window instead, because scrolling over a
 * timeline has to mean pan or zoom for an editor's muscle memory to hold; a page scroll
 * would steal that gesture. The rail keeps its own scroll, so 5,000 scenes stay virtualized.
 */
export function ScenesScreen() {
    const { projectId, videoId } = useParams({
        from: "/projects/$projectId/videos/$videoId/scenes",
    });
    const video = useVideo(projectId, videoId);
    const state = useVideoState(projectId, videoId);
    const blockedElsewhere = useEncodeBlockedElsewhere(projectId, videoId);
    const list = useVideoScenes(projectId, videoId);
    const scenes = useMemo(() => list.data?.scenes ?? [], [list.data]);
    // The probe is what makes the ruler reach the end of the source before the first scene
    // exists, so it must run even while the table is empty.
    const probe = useProbeVideo(projectId, videoId);
    const frameRate = probe.data?.clip?.frame_rate ?? null;
    const sourceFrames = probe.data?.clip?.frame_count ?? list.data?.total_frames ?? 0;
    const aspectRatio =
        probe.data?.clip !== null &&
        probe.data?.clip !== undefined &&
        probe.data.clip.width > 0 &&
        probe.data.clip.height > 0
            ? probe.data.clip.width / probe.data.clip.height
            : null;
    // The rail and the timeline ask the same lookup, so one scene never draws two
    // different frames and a shared URL is a cache hit rather than a second extraction.
    const thumbnailFor = useSceneThumbnail(projectId, videoId, frameRate);

    const [selection, setSelection] = useState<SceneSelection>(NO_SELECTION);
    const [playhead, setPlayhead] = useState<number | null>(null);
    const [source, setSource] = useState<PreviewSource>("original");
    const [actionError, setActionError] = useState<string | null>(null);
    const [encoderOpen, setEncoderOpen] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [canUndo, setCanUndo] = useState(false);
    const [railOpen, setRailOpen] = useState(true);
    const [detailsBelow, setDetailsBelow] = useState(false);
    const compact = useCompactScenes();
    // A compact window has no side column to put the details in, so they always follow the
    // timeline there and the tab-bar placement toggle has nothing to choose between.
    const below = detailsBelow || compact;
    const [detailsWidth, setDetailsWidth] = useState(320);
    const [trackHeight, setTrackHeight] = useState(84);
    const [contextMenu, setContextMenu] = useState<{ frame: number } | null>(null);
    const detailsDrag = useRef<{ x: number; width: number } | null>(null);
    const timelineDrag = useRef<{ y: number; height: number } | null>(null);
    const start = useStartVideoSequence(projectId);
    const warnings = useMemo(() => sceneWarnings(scenes), [scenes]);
    const issues = useMemo(() => sceneValidation(scenes), [scenes]);
    const firstError = issues.find((issue) => issue.severity === "error") ?? null;
    const locked = state.data?.active === true;
    const detection = state.data?.sequences.find((sequence) => sequence.id === "SceneDetector");
    // The state query is patched by the started event, so it is the stable signal for the
    // page's own render. The live detail is a leaf below, where a per-frame tick can
    // repaint one line without touching the rail or the timeline.
    const detecting = detection?.status === "active";
    const detectionFallback =
        typeof detection?.progress === "number"
            ? `${String(Math.round(detection.progress))}%`
            : null;

    // The component is reused when the route's video changes. A selection that named the
    // previous video's scenes must not be carried into the new list.
    useEffect(() => {
        setSelection(NO_SELECTION);
        setPlayhead(null);
        setSource("original");
        setActionError(null);
        setEncoderOpen(false);
        setConfirmReset(false);
        setConfirmDelete(false);
        setCanUndo(false);
    }, [projectId, videoId]);

    useEffect(() => {
        setSelection((current) => reconcile(current, scenes.length));
    }, [scenes.length]);

    const firstFrame = 0;
    const lastFrame = sourceFrames;
    useEffect(() => {
        setPlayhead((current) => {
            if (sourceFrames <= 0) {
                return current === null ? null : Math.max(0, current);
            }
            if (current === null) {
                return 0;
            }
            return Math.max(0, Math.min(current, sourceFrames - 1));
        });
    }, [sourceFrames]);

    // An encoded stream covers exactly one scene, and the player aligns a decoded stream
    // to the service's fixed window. Both have to come from the same playhead the rail and
    // timeline write, or the element would remount on every frame.
    const sceneIndex = useMemo(() => {
        if (playhead === null || scenes.length === 0) {
            return null;
        }
        const index = sceneAtFrame(scenes, playhead);
        const scene = index === null ? undefined : scenes[index];
        return scene !== undefined && playhead >= scene.start_frame && playhead < scene.end_frame
            ? index
            : null;
    }, [scenes, playhead]);
    const previewScene = sceneIndex === null ? null : (scenes[sceneIndex] ?? null);
    // Decoded owns its own stream start: one continuous stream from wherever the user
    // chose it. Only an encoded scene has a fixed first frame the player must align to.
    const previewBaseFrame =
        source === "encode" && sceneIndex !== null ? (scenes[sceneIndex]?.start_frame ?? 0) : 0;
    // The player keeps its own active chunk while playback crosses a cut, so it needs each
    // scene's first frame to keep that chunk's timeline and to continue into the next one.
    const sceneStarts = useMemo(() => scenes.map((scene) => scene.start_frame), [scenes]);
    // A gap is only visible when a scene's end is known: scene `n` may end before scene
    // `n + 1` starts, and both derived preview sources have to skip those frames.
    const sceneEnds = useMemo(() => scenes.map((scene) => scene.end_frame), [scenes]);
    // The pictured chunk is a product of each scene's encoder document, so the player needs
    // the fingerprints to notice a settings change and reopen its element.
    const encoderFingerprints = useMemo(
        () => scenes.map((scene) => scene.encoder_fingerprint),
        [scenes],
    );

    const chosen = selectedScenes(scenes, selection);
    const selectedWarnings = [...selection.selected].filter(
        (index) => warnings[index] === true,
    ).length;
    const canDetect =
        state.data !== undefined &&
        !locked &&
        !blockedElsewhere &&
        state.data.next.includes("SceneDetector");

    const selectedIndices = useMemo(
        () => [...selection.selected].sort((left, right) => left - right),
        [selection.selected],
    );

    // The command seam owns the mutation and its shared guard; the screen keeps the editor
    // state it renders. Each command names only what its own result changes.
    const applySceneEffects = (effects: SceneCommandEffects) => {
        if (effects.selection !== undefined) {
            setSelection(effects.selection);
        }
        if (effects.playhead !== undefined) {
            setPlayhead(effects.playhead);
        }
        if (effects.closeMenu === true) {
            setContextMenu(null);
        }
        if (effects.canUndo !== undefined) {
            setCanUndo(effects.canUndo);
        }
        if (effects.closeReset === true) {
            setConfirmReset(false);
        }
        if (effects.closeDelete === true) {
            setConfirmDelete(false);
        }
    };

    const {
        busy,
        resetPending,
        deletePending,
        resetError,
        deleteError,
        addSceneAt,
        splitAt,
        mergeSelection,
        changeRange,
        changeCustomData,
        deleteSelected: performDelete,
        resetOutputs: performReset,
        undo: performUndo,
    } = useSceneCommands({
        projectId,
        videoId,
        locked,
        scenes,
        sourceFrames,
        selectedIndices,
        onApplied: applySceneEffects,
    });

    const openIssue = (index: number) => {
        setSelection(selectScene(NO_SELECTION, index, "replace", scenes.length));
        const scene = scenes[index];
        if (scene !== undefined) {
            setPlayhead(scene.start_frame);
        }
    };

    const runDetection = () => {
        if (locked || blockedElsewhere) {
            return;
        }
        setActionError(null);
        start.mutate(
            { videoId, sequence: "SceneDetector" },
            { onError: (error) => setActionError(error.message) },
        );
    };

    const askDelete = () => {
        if (locked || busy || chosen.length !== 1) {
            return;
        }
        setContextMenu(null);
        setConfirmDelete(true);
    };

    const resetSelection = () => {
        if (locked || busy || selectedIndices.length === 0) {
            return;
        }
        setContextMenu(null);
        setConfirmReset(true);
    };

    const copyText = (text: string, label: string) => {
        void navigator.clipboard
            .writeText(text)
            .then(() => toast.success(`${label} copied`))
            .catch(() => toast.error("The clipboard is not available."));
        setContextMenu(null);
    };

    // One transport key map for the tab. The rail, timeline, and player each keep their own
    // selection behaviour, but arrows and WASD must not mean different things depending on
    // which of them happens to have focus.
    useEffect(() => {
        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }
            const target = event.target;
            if (
                target instanceof HTMLElement &&
                target.closest("input, textarea, select, button, a, summary") !== null
            ) {
                return;
            }
            const key = event.key.toLowerCase();
            const direction =
                key === "arrowup" || key === "w"
                    ? "up"
                    : key === "arrowdown" || key === "s"
                      ? "down"
                      : key === "arrowleft" || key === "a"
                        ? "left"
                        : key === "arrowright" || key === "d"
                          ? "right"
                          : null;
            if (direction === null) {
                return;
            }
            event.preventDefault();
            const base = playhead ?? firstFrame;
            if (direction === "left" || direction === "right") {
                if (lastFrame <= 0) {
                    return;
                }
                setPlayhead(
                    Math.max(
                        0,
                        Math.min(
                            Math.max(0, lastFrame - 1),
                            base + (direction === "left" ? -1 : 1),
                        ),
                    ),
                );
                return;
            }
            if (scenes.length === 0) {
                return;
            }
            const index = sceneAtFrame(scenes, base) ?? 0;
            const nextIndex = Math.max(
                0,
                Math.min(scenes.length - 1, index + (direction === "up" ? -1 : 1)),
            );
            const scene = scenes[nextIndex];
            if (scene === undefined) {
                return;
            }
            setSelection(selectScene(selection, nextIndex, "replace", scenes.length));
            setPlayhead(scene.start_frame);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [scenes, selection, playhead, firstFrame, lastFrame]);

    if (video.isPending) {
        return (
            <ScreenMain
                aria-busy="true"
                className="flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden"
            >
                <h1 className="sr-only">Scenes</h1>
                <VideoTabs
                    projectId={projectId}
                    videoId={videoId}
                    active="scenes"
                    note="Loading scenes"
                />
                <VideoRunActions projectId={projectId} videoId={videoId} state={state.data} />
                <div className="flex min-h-0 flex-1 gap-3 px-3 py-3">
                    <div className="w-[300px] animate-pulse rounded-lg border border-line bg-surface" />
                    <div className="flex-1 animate-pulse rounded-lg border border-line bg-surface" />
                </div>
            </ScreenMain>
        );
    }

    if (video.isError) {
        return (
            <ScreenMain className="flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden">
                <h1 className="sr-only">Scenes</h1>
                <VideoTabs
                    projectId={projectId}
                    videoId={videoId}
                    active="scenes"
                    note="The video could not be opened"
                />
                <VideoRunActions projectId={projectId} videoId={videoId} state={state.data} />
                <div className="page flex min-h-0 flex-1 items-start justify-center overflow-y-auto py-10">
                    <div
                        className="w-full max-w-[600px] rounded-lg border border-danger/30 bg-surface p-6"
                        role="alert"
                    >
                        <h2 className="m-0 text-xl font-semibold text-ink">
                            This video could not be opened
                        </h2>
                        <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                            {video.error instanceof Error
                                ? video.error.message
                                : "The service did not respond."}
                        </p>
                        <Button variant="secondary" onClick={() => void video.refetch()}>
                            Retry
                        </Button>
                    </div>
                </div>
            </ScreenMain>
        );
    }

    const note =
        scenes.length === 0 ? (
            detecting ? (
                <>
                    Detecting
                    <DetectionLiveDetail
                        projectId={projectId}
                        videoId={videoId}
                        fallback={detectionFallback}
                        prefix=" · "
                    />
                </>
            ) : (
                "Detection has not run"
            )
        ) : (
            <>
                {scenes.length.toLocaleString()} {scenes.length === 1 ? "scene" : "scenes"} ·{" "}
                {sourceFrames.toLocaleString()} frames
                {detecting ? (
                    <>
                        {" "}
                        · Detecting
                        <DetectionLiveDetail
                            projectId={projectId}
                            videoId={videoId}
                            fallback={detectionFallback}
                            prefix=" · "
                        />
                    </>
                ) : null}
            </>
        );

    const contextGap =
        contextMenu === null ? null : sceneGapAt(scenes, sourceFrames, contextMenu.frame);

    const railEmpty = (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <Film aria-hidden="true" className="h-6 w-6 text-ink-muted" strokeWidth={1.4} />
            <p className="m-0 text-[12px] font-medium text-ink">
                {detecting ? "Detecting scenes…" : "No scenes yet"}
            </p>
            <p className="m-0 text-[10px] leading-relaxed text-ink-muted">
                {detecting ? (
                    <>
                        Detection is running
                        <DetectionLiveDetail
                            projectId={projectId}
                            videoId={videoId}
                            fallback={detectionFallback}
                            prefix=" · "
                        />
                        . Each scene lands here as it is saved.
                    </>
                ) : (
                    "Detect scenes, or right-click the timeline to add one manually."
                )}
            </p>
            {actionError === null ? null : (
                <p
                    role="alert"
                    className="m-0 w-full rounded-md border border-danger/30 bg-danger-soft px-2 py-1.5 text-[10px] leading-relaxed text-danger"
                >
                    {actionError}
                </p>
            )}
            <Button
                variant="secondary"
                className="mt-1 h-7 px-2.5 text-[10px]"
                disabled={!canDetect || start.isPending}
                onClick={runDetection}
                data-tip={
                    state.data === undefined
                        ? "Loading the run state…"
                        : locked
                          ? detecting
                              ? "Scene detection is already running."
                              : "An encode is running; wait for it to finish."
                          : blockedElsewhere
                            ? "Another video is encoding; only one sequence can run at a time."
                            : state.data.next.includes("SceneDetector")
                              ? undefined
                              : "Scene detection is not the next sequence for this video."
                }
            >
                <Play aria-hidden="true" className="h-3 w-3" />
                {start.isPending ? "Starting…" : detecting ? "Detecting…" : "Run scene detection"}
            </Button>
            <p className="m-0 mt-0.5 text-[9px] leading-snug text-ink-muted">
                {state.data === undefined
                    ? "Loading the run state…"
                    : locked
                      ? detecting
                          ? "Scenes appear as checkpoints land."
                          : "Detection waits for the running encode."
                      : blockedElsewhere
                        ? "Detection waits for the other video's encode."
                        : state.data.next.includes("SceneDetector")
                          ? "Runs only Scene Detector."
                          : "Nothing is runnable right now."}
            </p>
        </div>
    );

    // One panel, two placements: beside the video, or under the timeline. Rendering the same
    // element in both branches keeps its local edit state from being thrown away by a toggle.
    const detailsPanel = (
        <SceneDetailsPanel
            scenes={chosen}
            total={scenes.length}
            frameRate={frameRate}
            playhead={playhead}
            warnings={selectedWarnings}
            locked={locked}
            busy={busy}
            onEditEncoder={() => setEncoderOpen(true)}
            onSplit={() => {
                if (playhead !== null) {
                    splitAt(playhead);
                }
            }}
            onMerge={mergeSelection}
            onDelete={askDelete}
            onReset={resetSelection}
            onSetRange={(startFrame, endFrame) => {
                const scene = chosen[0];
                if (scene !== undefined) {
                    changeRange(scene.index, startFrame, endFrame);
                }
            }}
            customData={chosen[0]?.custom_data ?? NO_CUSTOM_DATA}
            onCustomData={(values) => {
                const scene = chosen[0];
                if (scene !== undefined) {
                    changeCustomData(scene.index, values);
                }
            }}
            canUndo={canUndo}
            onUndo={performUndo}
            className={
                compact
                    ? "max-h-[60vh] w-full shrink-0"
                    : detailsBelow
                      ? "h-[220px] max-h-[40%] w-full shrink-0"
                      : "min-h-0 w-[var(--scene-details-width)] shrink-0"
            }
            style={
                {
                    "--scene-details-width": `${String(detailsWidth)}px`,
                } as CSSProperties
            }
        />
    );

    return (
        <ScreenMain className="flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden">
            {/* The tab strip is navigation, not the page's title: without this the screen has
                no level-one heading and a screen reader's heading list starts at the panel. */}
            <h1 className="sr-only">Scenes</h1>
            <ScenesVideoTabs
                projectId={projectId}
                videoId={videoId}
                note={note}
                compact={compact}
                detailsBelow={detailsBelow}
                onToggleDetails={() => setDetailsBelow((below) => !below)}
                issues={issues}
                onOpenIssue={openIssue}
            />
            <VideoRunActions
                projectId={projectId}
                videoId={videoId}
                state={state.data}
                blockedReason={
                    firstError === null || locked
                        ? null
                        : `${firstError.message} Fix the scene boundaries before starting.`
                }
            />

            {locked ? (
                <p
                    role="status"
                    className="m-0 flex shrink-0 items-center gap-1.5 border-b border-line bg-sunken px-4 py-1.5 text-[10.5px] text-ink-muted"
                >
                    <Lock aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                    Read-only while a sequence runs. The table still updates live.
                </p>
            ) : null}

            {list.isPending ? (
                <div className="flex min-h-0 flex-1 gap-3 px-3 py-3">
                    <div className="w-[300px] animate-pulse rounded-lg border border-line bg-surface" />
                    <div className="flex flex-1 flex-col gap-3">
                        <div className="flex-1 animate-pulse rounded-lg border border-line bg-surface" />
                        <div className="h-28 animate-pulse rounded-lg border border-line bg-surface" />
                    </div>
                </div>
            ) : list.isError ? (
                <div className="flex min-h-0 flex-1 items-start justify-center px-4 py-10">
                    <div
                        className="w-full max-w-[600px] rounded-lg border border-danger/30 bg-surface p-6"
                        role="alert"
                    >
                        <h2 className="m-0 text-base font-semibold text-ink">
                            The scene table could not be read
                        </h2>
                        <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                            {list.error instanceof Error
                                ? list.error.message
                                : "The service did not respond."}
                        </p>
                        <Button variant="secondary" onClick={() => void list.refetch()}>
                            Retry
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                    {railOpen ? (
                        <SceneRail
                            scenes={scenes}
                            selection={selection}
                            onSelectionChange={setSelection}
                            onSeek={setPlayhead}
                            frameRate={frameRate}
                            thumbnailFor={thumbnailFor}
                            sourceFrames={probe.data?.clip?.frame_count ?? null}
                            emptyState={railEmpty}
                            onCollapse={() => setRailOpen(false)}
                            className="hidden w-[232px] shrink-0 rounded-none border-y-0 border-l-0 lg:flex"
                        />
                    ) : (
                        <div className="hidden w-8 shrink-0 items-start justify-center border-r border-line bg-surface pt-2 lg:flex">
                            <button
                                type="button"
                                aria-label="Show the scene rail"
                                data-tip="Show the scene rail"
                                data-tip-align="start"
                                onClick={() => setRailOpen(true)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                            >
                                <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                    {/* The page scrolls only when its three bands genuinely do not fit: a
                        short window, or the details placed under the timeline. The row keeps
                        a floor so the player is never the band that gives way. */}
                    <div className="page flex min-h-0 flex-1 flex-col gap-3 overflow-x-clip overflow-y-auto py-3">
                        <div
                            className={`flex gap-3 ${
                                below ? "flex-col" : "flex-row"
                            } ${compact ? "shrink-0" : "min-h-[160px] flex-1"}`}
                        >
                            {below ? null : detailsPanel}

                            {below ? null : (
                                <div
                                    role="separator"
                                    aria-orientation="vertical"
                                    aria-label="Resize scene details"
                                    data-tip="Drag to resize the details panel"
                                    onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                                        event.preventDefault();
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        detailsDrag.current = {
                                            x: event.clientX,
                                            width: detailsWidth,
                                        };
                                    }}
                                    onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                                        const drag = detailsDrag.current;
                                        if (drag === null) {
                                            return;
                                        }
                                        setDetailsWidth(
                                            Math.max(
                                                240,
                                                Math.min(620, drag.width + event.clientX - drag.x),
                                            ),
                                        );
                                    }}
                                    onPointerUp={() => {
                                        detailsDrag.current = null;
                                    }}
                                    onPointerCancel={() => {
                                        detailsDrag.current = null;
                                    }}
                                    className="hidden w-1.5 shrink-0 cursor-col-resize touch-none rounded-full bg-line/40 transition-colors hover:bg-brand/40 md:block"
                                />
                            )}

                            <ScenePlayer
                                projectId={projectId}
                                videoId={videoId}
                                source={source}
                                onSourceChange={setSource}
                                frameRate={frameRate}
                                playhead={playhead}
                                onSeek={setPlayhead}
                                baseFrame={previewBaseFrame}
                                sceneIndex={sceneIndex}
                                sceneStarts={sceneStarts}
                                sceneEnds={sceneEnds}
                                encoderFingerprints={encoderFingerprints}
                                sceneFingerprint={list.data?.scene_fingerprint ?? ""}
                                totalFrames={sourceFrames}
                                overlay={
                                    <PreviewOverlay
                                        projectId={projectId}
                                        videoId={videoId}
                                        scene={previewScene}
                                    />
                                }
                                className={
                                    compact
                                        ? "h-[clamp(200px,52vh,420px)] shrink-0"
                                        : "min-h-0 flex-1"
                                }
                            />
                        </div>

                        <div
                            role="separator"
                            aria-orientation="horizontal"
                            aria-label="Resize the timeline"
                            data-tip="Drag to resize the timeline"
                            onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                                event.preventDefault();
                                event.currentTarget.setPointerCapture(event.pointerId);
                                timelineDrag.current = {
                                    y: event.clientY,
                                    height: trackHeight,
                                };
                            }}
                            onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                                const drag = timelineDrag.current;
                                if (drag === null) {
                                    return;
                                }
                                setTrackHeight(
                                    Math.max(
                                        48,
                                        Math.min(260, drag.height + drag.y - event.clientY),
                                    ),
                                );
                            }}
                            onPointerUp={() => {
                                timelineDrag.current = null;
                            }}
                            onPointerCancel={() => {
                                timelineDrag.current = null;
                            }}
                            className="h-1.5 shrink-0 cursor-row-resize touch-none rounded-full bg-line/40 transition-colors hover:bg-brand/40"
                        />

                        <SceneContextMenu
                            frame={contextMenu?.frame ?? null}
                            frameRate={frameRate}
                            gap={contextGap}
                            scenes={scenes}
                            selectedIndices={selectedIndices}
                            locked={locked}
                            busy={busy}
                            onClose={() => setContextMenu(null)}
                            onAdd={() => {
                                if (contextMenu !== null) {
                                    addSceneAt(contextMenu.frame);
                                }
                            }}
                            onSplit={() => {
                                if (contextMenu !== null) {
                                    splitAt(contextMenu.frame);
                                }
                            }}
                            onMerge={mergeSelection}
                            onReset={resetSelection}
                            onCopy={copyText}
                        >
                            <SceneTimeline
                                scenes={scenes}
                                selection={selection}
                                onSelectionChange={setSelection}
                                onSeek={setPlayhead}
                                playhead={playhead}
                                frameRate={frameRate}
                                thumbnailFor={thumbnailFor}
                                totalFrames={sourceFrames}
                                trackHeight={trackHeight}
                                aspectRatio={aspectRatio}
                                onContextMenu={(frame) => setContextMenu({ frame })}
                                className="shrink-0"
                            />
                        </SceneContextMenu>

                        {below ? detailsPanel : null}

                        {probe.isError ? (
                            <p
                                role="status"
                                className="m-0 rounded-md border border-line bg-surface px-3 py-2 text-[10px] leading-relaxed text-ink-muted"
                            >
                                Durations and timecode are unavailable because the source probe
                                failed. Frame numbers are shown instead.
                            </p>
                        ) : null}
                    </div>
                    <SceneEncoderSheet
                        open={encoderOpen}
                        onClose={() => setEncoderOpen(false)}
                        onSaved={() => setCanUndo(true)}
                        projectId={projectId}
                        videoId={videoId}
                        scenes={chosen}
                        locked={locked}
                    />
                </div>
            )}

            <SceneEditDialogs
                confirmReset={confirmReset}
                confirmDelete={confirmDelete}
                selectedCount={selectedIndices.length}
                busy={busy}
                resetPending={resetPending}
                deletePending={deletePending}
                resetError={resetError}
                deleteError={deleteError}
                onCancelReset={() => setConfirmReset(false)}
                onConfirmReset={performReset}
                onCancelDelete={() => setConfirmDelete(false)}
                onConfirmDelete={performDelete}
            />
        </ScreenMain>
    );
}
