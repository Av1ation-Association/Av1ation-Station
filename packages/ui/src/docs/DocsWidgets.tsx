import { useState } from "react";

import {
    ApiProvider,
    MockTransport,
    useDeleteProject,
    useHealth,
    useProjects,
    useSettings,
    useUpdateSettings,
} from "@av1ation/api";
import type {
    LogRecord,
    PreflightCheck,
    PreflightReport,
    ProjectSummary,
    RunSummary,
    SceneView,
    ScriptCheck,
    StorageOverview,
    VideoSummary,
} from "@av1ation/contracts";
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from "@tanstack/react-router";
import { Lock, Trash2 } from "lucide-react";

import { CommandPalette } from "../app/CommandPalette";
import { ROUTE_META } from "../app/route-meta";
import { SequenceActionButton } from "../features/configuration/SequenceActionButton";
import { SequenceSectionCard } from "../features/configuration/SequenceSectionCard";
import { InputEditor } from "../features/configuration/InputEditor";
import { BitrateThresholdCurve } from "../features/configuration/TargetQualityEditor";
import { MetricField, QuantizerRangeField, TargetRangeField } from "../features/configuration/QualityFields";
import { SpeedScalingCard } from "../features/configuration/SpeedScalingCard";
import { HistoryRunCard } from "../features/logs/HistoryRunCard";
import { LEVELS, type Level } from "../features/logs/log-format";
import { LogFilterBar } from "../features/logs/LogFilterBar";
import { LogRow } from "../features/logs/LogRow";
import { ScriptEditor } from "../features/script/ScriptEditor";
import { ScriptValidationResult } from "../features/script/ScriptValidationResult";
import { ProjectRow } from "../features/projects/HomeScreen";
import { ProjectQueueSection } from "../features/projects/ProjectQueueSection";
import { NewProjectButton, NewProjectForm } from "../features/projects/NewProject";
import { useProjectQueue } from "../features/projects/useProjectQueue";
import { DeleteRetainedDialog } from "../features/videos/DeleteRetainedDialog";
import { SceneDetailsPanel } from "../features/scenes/SceneDetailsPanel";
import { SceneRail } from "../features/scenes/SceneRail";
import { NO_SELECTION, type SceneSelection } from "../features/scenes/scene-selection";
import { AppearancePanel } from "../features/settings/AppearancePanel";
import { DependencyInventory } from "../features/settings/DependencyInventory";
import { PairingScreen } from "../features/settings/PairingScreen";
import { StorageScratchCard } from "../features/settings/settings-panels";
import { Button } from "../shared/Button";
import { formatBytes } from "../shared/format";
import { NumberField } from "../shared/NumberField";
import { DraftActions, TopBarTargetContext } from "../shared/TopBarActions";
import { useDraftHistory } from "../shared/useDraftHistory";
import { DemoModeProvider } from "../shared/demo-mode";
import { emptyInputValue, type InputValue } from "../shared/model/input-model";
import type { HistoryRun } from "../shared/model/history-model";
import { RunControl } from "../shared/RunControl";
import { SearchField } from "../shared/SearchField";
import { SectionBadge, SectionCard } from "../shared/SectionCard";
import type { TimelineStep } from "../shared/model/video-timeline";

const SAMPLE_NOTES = {
    toolchain: "The real dependency inventory with sample provider rows. Changes stay in the sample.",
    "new-project": "The real create form. The created project stays in the sample.",
    "run-control": "The real Start/Stop control. The sample run does not start an encode.",
    "video-config": "The real section cards in demo mode. Run and reset actions are omitted.",
    "command-palette": "The real palette. Filtering works; selecting a command stays in the sample.",
    "draft-actions":
        "The real top-bar draft actions. Change the value, then save, discard, undo, or redo in the sample.",
    "run-lock":
        "The real encoding controls, disabled while another run holds the lock. Hover them for the service's reason.",
    appearance:
        "The real appearance controls. Choices stay in the sample and do not change the manual's theme.",
    "project-search":
        "The real project rows and search field. Filtering, renaming, and deleting stay in the sample.",
    "scene-table":
        "The real scene rail. Select a scene or range; the timeline stays proportional in the sample.",
    "scene-details":
        "The real details panel. Read a selected scene's range, encoder state, measurements, and chunk.",
    "log-filter":
        "The real log filter bar and viewer rows over sample records. Level, search, and clear controls apply to the sample only.",
    "history-item":
        "One real History card. Its attempts, measures, and terminal message describe the sample run.",
    "quality-metric":
        "The real metric control from Target quality. Choosing a metric stays in the sample.",
    "quality-range":
        "The real target and quantizer range controls. Edits stay in the sample and do not set an encode.",
    "speed-scaling":
        "The real speed-scaling graph. Drag a point or click the graph; the curve stays in the sample.",
    "bitrate-threshold":
        "The real bitrate-distribution graph. Click or type a threshold; only the sample changes.",
    "input-kinds":
        "The real input editor, opened on a VapourSynth script. Changes stay in the sample.",
    "script-validation":
        "The real read-only editor with an invalid script and the service's failed check.",
    "queue-selection":
        "The real queue section. Select a row to reveal the same bulk actions the application uses.",
    storage:
        "The real scratch card. Edit the path and save it; the sample starts with an unsaved draft.",
    "retained-removal":
        "The real retained-work confirmation. Deleting changes only the sample's reported size.",
    network:
        "The real pairing form. Enter ABCD-EFGH; the exchange stays in the sample.",
} as const;

const TOOLCHAIN_CHECKS: readonly PreflightCheck[] = [
    {
        id: "vapoursynth",
        label: "VapourSynth",
        capability: "decode",
        available: true,
        detail: "Core R70 · API 4.3",
        selected_source: "bundled",
        configured_source: "bundled",
        providers: [
            {
                source: "bundled",
                available: true,
                detail: "Bundled runtime · tools/python/Lib/site-packages/vapoursynth",
                active: true,
                checked: true,
            },
            {
                source: "system",
                available: false,
                detail: "Restart with System selected to probe this machine's VapourSynth.",
                active: false,
                checked: false,
            },
        ],
    },
    {
        id: "ffmpeg",
        label: "FFmpeg",
        capability: "muxing",
        available: true,
        detail: "ffmpeg version 7.1",
        selected_source: "bundled",
        configured_source: "bundled",
        providers: [
            {
                source: "bundled",
                available: true,
                detail: "Bundled FFmpeg",
                active: true,
                checked: true,
            },
            {
                source: "system",
                available: true,
                detail: "System FFmpeg on PATH",
                active: false,
                checked: true,
            },
        ],
    },
    {
        id: "encoder:svt-av1",
        label: "SVT-AV1",
        capability: "encode",
        available: true,
        detail: "SVT-AV1 3.0.0",
        selected_source: "system",
        configured_source: "system",
        providers: [
            {
                source: "bundled",
                available: true,
                detail: "Bundled SVT-AV1",
                active: false,
                checked: true,
            },
            {
                source: "system",
                available: true,
                detail: "SvtAv1EncApp on PATH",
                active: true,
                checked: true,
            },
        ],
    },
];

const TOOLCHAIN_REPORT: PreflightReport = {
    checks: [...TOOLCHAIN_CHECKS],
    available_count: TOOLCHAIN_CHECKS.length,
    total_count: TOOLCHAIN_CHECKS.length,
};

function cloneChecks(): PreflightCheck[] {
    return TOOLCHAIN_CHECKS.map((check) => ({
        ...check,
        ...(check.providers === undefined
            ? {}
            : { providers: check.providers.map((provider) => ({ ...provider })) }),
    }));
}

function createToolchainTransport(): MockTransport {
    const transport = new MockTransport();
    const checks = cloneChecks();
    transport.health.preflight = {
        checks,
        available_count: checks.length,
        total_count: checks.length,
    };
    transport.baseChecks.splice(0, transport.baseChecks.length, ...cloneChecks());
    return transport;
}

function ToolchainBody() {
    const health = useHealth();
    return (
        <DependencyInventory
            compact
            report={health.data?.preflight ?? TOOLCHAIN_REPORT}
        />
    );
}

function ToolchainSample() {
    const [transport] = useState(createToolchainTransport);
    return (
        <ApiProvider transport={transport}>
            <ToolchainBody />
        </ApiProvider>
    );
}

function NewProjectBody() {
    const [open, setOpen] = useState(false);
    const [created, setCreated] = useState<string | null>(null);
    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                <NewProjectButton
                    expanded={open}
                    onClick={() => {
                        setCreated(null);
                        setOpen((current) => !current);
                    }}
                />
                {created === null ? null : (
                    <p className="m-0 text-[11.5px] text-ink-secondary">
                        Created “{created}” in the sample.
                    </p>
                )}
            </div>
            {open ? (
                <div className="mt-3">
                    <NewProjectForm
                        onClose={() => setOpen(false)}
                        onCreated={setCreated}
                    />
                </div>
            ) : null}
        </div>
    );
}

function NewProjectSample() {
    const [transport] = useState(() => new MockTransport());
    return (
        <ApiProvider transport={transport}>
            <NewProjectBody />
        </ApiProvider>
    );
}

function RunControlBody() {
    const [running, setRunning] = useState(false);
    return (
        <div className="flex flex-wrap items-center gap-3">
            <RunControl
                running={running}
                pending={false}
                onStart={() => setRunning(true)}
                onStop={() => setRunning(false)}
            />
            <p className="m-0 text-[11.5px] text-ink-secondary">
                {running
                    ? "Stop ends this sample run without touching a file."
                    : "Start begins the next runnable sequence for this video."}
            </p>
        </div>
    );
}

function step(id: string, name: string): TimelineStep {
    return {
        id,
        name,
        status: "never_run",
        label: "Not run",
        detail: "No data yet",
        next: false,
        runnable: true,
        progress: null,
    };
}

function VideoConfigBody() {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SectionCard
                title="General"
                lines={[
                    "Native video · C:\\media\\clip.mkv",
                    "Output · C:\\media\\clip.av1.mkv",
                    "Retained work · 2.1 GB",
                ]}
                badge={<SectionBadge tone="custom">Video</SectionBadge>}
            />
            <SequenceSectionCard
                projectId="demo-project"
                videoId="demo-video"
                section="target-quality"
                title="Target quality"
                lines={["VMAF · target 93", "Probes · 4 per scene", "Speed points · 3"]}
                badge={<SectionBadge tone="custom">2 overrides</SectionBadge>}
                steps={[step("QualityMetric", "Quality metric")]}
                locked={false}
                lockedLabel="Locked while an encode runs"
                runningVideo={false}
                onRun={() => undefined}
                onStop={() => undefined}
                onResetData={() => undefined}
                onResetConfiguration={() => undefined}
                resetConfigurationDisabled={false}
                pending={false}
            />
            <SequenceSectionCard
                projectId="demo-project"
                videoId="demo-video"
                section="encoding"
                title="Encoding"
                lines={["SVT-AV1 · crf 32", "Preset 8 · 10-bit", "Grain synthesis · on"]}
                badge={<SectionBadge tone="custom">1 override</SectionBadge>}
                steps={[step("Av1Encoder", "AV1 encode")]}
                locked={false}
                lockedLabel="Locked while an encode runs"
                runningVideo={false}
                onRun={() => undefined}
                onStop={() => undefined}
                onResetData={() => undefined}
                onResetConfiguration={() => undefined}
                resetConfigurationDisabled={false}
                pending={false}
            />
        </div>
    );
}

const videoRoot = createRootRoute({
    staticData: ROUTE_META["/"],
    component: VideoConfigBody,
});

function createVideoRouter() {
    return createRouter({
        routeTree: videoRoot,
        history: createMemoryHistory({ initialEntries: ["/"] }),
    });
}

function VideoConfigSample() {
    const [router] = useState(createVideoRouter);
    return (
        <DemoModeProvider enabled>
            <RouterProvider router={router} />
        </DemoModeProvider>
    );
}

const paletteRoot = createRootRoute({
    staticData: ROUTE_META["/"],
    component: Outlet,
});

function PaletteBody() {
    return (
        <CommandPalette
            inline
            open
            onOpenChange={() => undefined}
            onShowShortcuts={() => undefined}
        />
    );
}

const paletteSettings = createRoute({
    getParentRoute: () => paletteRoot,
    path: "/settings",
    staticData: ROUTE_META["/settings"],
    component: PaletteBody,
});

function createPaletteRouter() {
    return createRouter({
        routeTree: paletteRoot.addChildren([paletteSettings]),
        history: createMemoryHistory({ initialEntries: ["/settings"] }),
    });
}

function CommandPaletteSample() {
    const [transport] = useState(() => new MockTransport());
    const [router] = useState(createPaletteRouter);
    return (
        <ApiProvider transport={transport}>
            <RouterProvider router={router} />
        </ApiProvider>
    );
}

const DRAFT_BASELINE = 24;
const DRAFT_START = 20;

function DraftActionsBody() {
    const [target, setTarget] = useState<HTMLDivElement | null>(null);
    const [saved, setSaved] = useState(DRAFT_BASELINE);
    // The sample starts a step away from its saved baseline, so the four actions are
    // visible immediately. Keyboard history is off so the manual keeps its own undo.
    const history = useDraftHistory<number>(DRAFT_START, false);
    const draft = history.value ?? saved;
    const dirty = draft !== saved;

    return (
        <TopBarTargetContext.Provider value={target}>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-line bg-app/95 px-4 py-2">
                    <span className="text-[13px] font-medium text-ink">Scene detection</span>
                    <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[10px] text-ink-secondary">
                        Project
                    </span>
                    <div ref={setTarget} className="ml-auto flex min-w-0 items-center gap-2" />
                </div>
                <div className="px-4 py-4">
                    <label
                        htmlFor="docs-draft-minimum"
                        className="block text-[11px] font-medium text-ink-secondary"
                    >
                        Minimum scene length
                    </label>
                    <NumberField
                        id="docs-draft-minimum"
                        label="Minimum scene length"
                        value={draft}
                        min={1}
                        max={240}
                        integer
                        className="mt-1.5 w-40"
                        onChange={(next) => history.setValue(next)}
                    />
                    <p className="mt-2 mb-0 font-mono text-[10.5px] text-ink-muted">
                        Saved {saved} · Draft {draft}
                    </p>
                </div>
            </div>
            <DraftActions
                dirty={dirty}
                pending={false}
                onSave={() => {
                    if (history.value === null) {
                        return;
                    }
                    setSaved(history.value);
                    history.reset(history.value);
                }}
                onDiscard={() => history.reset(saved)}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.undo}
                onRedo={history.redo}
                showLabels
            />
        </TopBarTargetContext.Provider>
    );
}

function AppearanceSample() {
    const [transport] = useState(() => new MockTransport());
    return (
        <ApiProvider transport={transport}>
            <AppearancePanel />
        </ApiProvider>
    );
}

const PROJECT_SAMPLE: ProjectSummary[] = [
    {
        accessed_at: "2026-11-12T10:00:00Z",
        completed_videos: 1,
        created_at: "2026-10-01T09:00:00Z",
        id: "docs-aurora",
        name: "Aurora Documentary",
        path: "C:\\Media\\aurora",
        size_bytes: 2_400_000_000,
        video_count: 2,
    },
    {
        accessed_at: "2026-11-11T10:00:00Z",
        completed_videos: 0,
        created_at: "2026-10-02T09:00:00Z",
        id: "docs-boreal",
        name: "Boreal Short",
        path: "D:\\Work\\boreal",
        size_bytes: 0,
        video_count: 1,
    },
    {
        accessed_at: "2026-11-10T10:00:00Z",
        completed_videos: 3,
        created_at: "2026-10-03T09:00:00Z",
        id: "docs-coast",
        name: "Coastal Tests",
        path: "C:\\Captures\\coast",
        size_bytes: 780_000_000,
        video_count: 3,
    },
];

function ProjectSearchBody() {
    const projects = useProjects();
    const remove = useDeleteProject();
    const [query, setQuery] = useState("");
    const [error, setError] = useState<string | null>(null);
    const all = projects.data ?? [];
    const needle = query.trim().toLocaleLowerCase();
    const visible =
        needle === ""
            ? all
            : all.filter(
                  (project) =>
                      project.name.toLocaleLowerCase().includes(needle) ||
                      project.path.toLocaleLowerCase().includes(needle),
              );

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 font-mono text-[10.5px] text-ink-muted">
                    {visible.length} of {all.length} projects
                </p>
                <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder="Search projects"
                    label="Search projects by name or path"
                    className="h-8 w-full sm:w-64"
                />
            </div>
            {projects.isPending ? (
                <p className="mt-3 mb-0 text-[11.5px] text-ink-secondary">Loading projects…</p>
            ) : null}
            {error === null ? null : (
                <p role="alert" className="mt-2 mb-0 text-[11px] text-danger">
                    {error}
                </p>
            )}
            {visible.length > 0 ? (
                <ul className="mt-3 mb-0 list-none divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface p-0">
                    {visible.map((project) => (
                        <ProjectRow
                            key={project.id}
                            project={project}
                            onDelete={() => {
                                setError(null);
                                remove.mutate(project.id, {
                                    onError: (failure) => setError(failure.message),
                                });
                            }}
                        />
                    ))}
                </ul>
            ) : all.length > 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-line-strong bg-surface px-5 py-6 text-center">
                    <p className="m-0 text-sm font-medium text-ink">
                        No projects match “{query.trim()}”
                    </p>
                    <Button
                        variant="secondary"
                        className="mt-3 h-8 px-2.5 text-[11.5px]"
                        onClick={() => setQuery("")}
                    >
                        Clear search
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

const projectSearchRoot = createRootRoute({
    staticData: ROUTE_META["/"],
    component: ProjectSearchBody,
});

const projectSearchProject = createRoute({
    getParentRoute: () => projectSearchRoot,
    path: "/projects/$projectId",
    staticData: ROUTE_META["/projects/$projectId"],
    component: () => null,
});

function ProjectSearchSample() {
    const [transport] = useState(() => {
        const next = new MockTransport();
        next.routes.set("/api/projects", PROJECT_SAMPLE.map((project) => ({ ...project })));
        return next;
    });
    const [router] = useState(() =>
        createRouter({
            routeTree: projectSearchRoot.addChildren([projectSearchProject]),
            history: createMemoryHistory({ initialEntries: ["/"] }),
        }),
    );
    return (
        <ApiProvider transport={transport}>
            <RouterProvider router={router} />
        </ApiProvider>
    );
}

const SCENE_SAMPLE: SceneView[] = [
    {
        index: 0,
        start_frame: 0,
        end_frame: 48,
        frame_count: 48,
        encoded: true,
        chunk_bytes: 2_400_000,
        quantizer: 24,
        score: 92,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
        custom_data: { shot: "establishing" },
    },
    {
        index: 1,
        start_frame: 48,
        end_frame: 96,
        frame_count: 48,
        encoded: false,
        quantizer: 27,
        score: 88,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
    },
    {
        index: 2,
        start_frame: 96,
        end_frame: 144,
        frame_count: 48,
        encoded: true,
        chunk_bytes: 1_800_000,
        quantizer: 22,
        score: 95,
        encoder_label: "SVT-AV1",
        encoder_custom: true,
        custom_data: { shot: "close" },
    },
];

function oneScene(index: number): SceneSelection {
    return { selected: new Set([index]), anchor: index, cursor: index };
}

function reindexScenes(scenes: readonly SceneView[]): SceneView[] {
    return scenes.map((scene, index) => ({ ...scene, index }));
}

function SceneSampleBody({ mode }: { mode: "rail" | "details" }) {
    const [scenes, setScenes] = useState<SceneView[]>(SCENE_SAMPLE);
    const [selection, setSelection] = useState<SceneSelection>(oneScene(0));
    const [playhead, setPlayhead] = useState(24);
    const [undoStack, setUndoStack] = useState<
        Array<{ scenes: SceneView[]; selection: SceneSelection }>
    >([]);
    const [notice, setNotice] = useState<string | null>(null);
    const selected = [...selection.selected]
        .sort((left, right) => left - right)
        .map((index) => scenes[index])
        .filter((scene): scene is SceneView => scene !== undefined);
    const single = selected.length === 1 ? selected[0] : undefined;
    const first = selected[0];
    const last = selected.at(-1);

    const apply = (nextScenes: SceneView[], nextSelection: SceneSelection, message: string) => {
        setUndoStack((stack) => [...stack, { scenes, selection }].slice(-1));
        setScenes(nextScenes);
        setSelection(nextSelection);
        setNotice(message);
    };

    const split = () => {
        if (single === undefined || playhead === null) {
            return;
        }
        if (playhead <= single.start_frame || playhead >= single.end_frame) {
            setNotice("Place the playhead inside the selected scene before splitting.");
            return;
        }
        const left: SceneView = {
            ...single,
            end_frame: playhead,
            frame_count: playhead - single.start_frame,
            encoded: false,
            chunk_bytes: null,
        };
        const right: SceneView = {
            ...single,
            start_frame: playhead,
            frame_count: single.end_frame - playhead,
            encoded: false,
            chunk_bytes: null,
        };
        const next = [...scenes];
        next.splice(single.index, 1, left, right);
        apply(reindexScenes(next), oneScene(single.index + 1), "Split at the playhead.");
    };

    const merge = () => {
        if (first === undefined || last === undefined || selected.length < 2) {
            return;
        }
        const indices = new Set(selected.map((scene) => scene.index));
        const merged: SceneView = {
            ...first,
            end_frame: last.end_frame,
            frame_count: last.end_frame - first.start_frame,
            encoded: false,
            chunk_bytes: null,
            quantizer: null,
            score: null,
            custom_data: {},
        };
        const next = scenes.filter((scene) => !indices.has(scene.index));
        next.splice(first.index, 0, merged);
        apply(reindexScenes(next), oneScene(first.index), "Merged the selected range.");
    };

    const remove = () => {
        if (selected.length === 0) {
            return;
        }
        const indices = new Set(selected.map((scene) => scene.index));
        apply(
            reindexScenes(scenes.filter((scene) => !indices.has(scene.index))),
            NO_SELECTION,
            "Deleted the selected scenes; the gap stays visible.",
        );
    };

    const reset = () => {
        if (selected.length === 0) {
            return;
        }
        const indices = new Set(selected.map((scene) => scene.index));
        const next = scenes.map((scene) =>
            indices.has(scene.index)
                ? {
                      ...scene,
                      encoded: false,
                      chunk_bytes: null,
                      quantizer: null,
                      score: null,
                  }
                : scene,
        );
        apply(next, selection, "Reset the selected chunks; the ranges stay.");
    };

    const undo = () => {
        const previous = undoStack.at(-1);
        if (previous === undefined) {
            return;
        }
        setScenes(previous.scenes);
        setSelection(previous.selection);
        setUndoStack(undoStack.slice(0, -1));
        setNotice("Undid the last structural edit.");
    };

    if (mode === "rail") {
        return (
            <SceneRail
                scenes={scenes}
                selection={selection}
                onSelectionChange={setSelection}
                onSeek={setPlayhead}
                frameRate={24}
                height={280}
                className="min-w-0"
            />
        );
    }

    return (
        <div>
            <SceneDetailsPanel
                    scenes={selected}
                    total={scenes.at(-1)?.end_frame ?? 0}
                    frameRate={24}
                    playhead={playhead}
                    warnings={0}
                    locked={false}
                    onEditEncoder={() =>
                        setNotice("Encoder editing opens the configuration editor in the app.")
                    }
                    onSplit={split}
                    onMerge={merge}
                    onDelete={remove}
                    onReset={reset}
                    onSetRange={(startFrame, endFrame) => {
                        if (single === undefined) {
                            return;
                        }
                        apply(
                            reindexScenes(
                                scenes.map((scene) =>
                                    scene.index === single.index
                                        ? {
                                              ...scene,
                                              start_frame: startFrame,
                                              end_frame: endFrame,
                                              frame_count: Math.max(0, endFrame - startFrame),
                                          }
                                        : scene,
                                ),
                            ),
                            selection,
                            "Changed the selected scene's boundaries.",
                        );
                    }}
                    customData={single?.custom_data ?? {}}
                    onCustomData={(values) => {
                        if (single === undefined) {
                            return;
                        }
                        setScenes((current) =>
                            current.map((scene) =>
                                scene.index === single.index
                                    ? { ...scene, custom_data: values }
                                    : scene,
                            ),
                        );
                    }}
                    canUndo={undoStack.length > 0}
                    onUndo={undo}
                    className="min-h-[420px]"
                />
            <p className="mt-2 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                {notice ?? "Select a scene, then use the action bar at the bottom of the details panel."}
            </p>
        </div>
    );
}

const LOG_SAMPLE: LogRecord[] = [
    {
        at: "2026-11-12T10:00:00Z",
        level: "info",
        message: "Run started for 'Aurora Documentary'.",
        project_id: "docs-aurora",
        run_id: "docs-run",
        scope: "run",
        seq: 0,
        sequence: null,
        video_id: "docs-video",
    },
    {
        at: "2026-11-12T10:00:02Z",
        level: "info",
        message: "SceneDetector found 3 scenes.",
        project_id: "docs-aurora",
        run_id: "docs-run",
        scope: "run",
        seq: 1,
        sequence: "SceneDetector",
        video_id: "docs-video",
    },
    {
        at: "2026-11-12T10:00:04Z",
        level: "debug",
        message: "Probing target quality at 4 points per scene.",
        project_id: "docs-aurora",
        run_id: "docs-run",
        scope: "run",
        seq: 2,
        sequence: "TargetQuality",
        video_id: "docs-video",
    },
    {
        at: "2026-11-12T10:00:07Z",
        level: "warn",
        message: "Scene 02 has a gap before the next boundary.",
        project_id: "docs-aurora",
        run_id: "docs-run",
        scope: "run",
        seq: 3,
        sequence: "ParallelEncoder",
        video_id: "docs-video",
    },
    {
        at: "2026-11-12T10:00:08Z",
        level: "error",
        message: "SVT-AV1 exited with status 1.",
        project_id: "docs-aurora",
        run_id: "docs-run",
        scope: "run",
        seq: 4,
        sequence: "ParallelEncoder",
        video_id: "docs-video",
    },
    {
        at: "2026-11-12T10:00:09Z",
        level: "info",
        message: "Run finished with a failed outcome.",
        project_id: "docs-aurora",
        run_id: "docs-run",
        scope: "run",
        seq: 5,
        sequence: null,
        video_id: "docs-video",
    },
];

function LogFilterBody() {
    const [searchInput, setSearchInput] = useState("");
    const [levels, setLevels] = useState<ReadonlySet<Level>>(
        () => new Set(LEVELS.map((entry) => entry.value)),
    );
    const needle = searchInput.trim().toLocaleLowerCase();
    const visible = LOG_SAMPLE.filter((record) => {
        if (!levels.has(record.level as Level)) {
            return false;
        }
        if (needle === "") {
            return true;
        }
        return (
            record.message.toLocaleLowerCase().includes(needle) ||
            (record.sequence ?? "").toLocaleLowerCase().includes(needle)
        );
    });
    const filtered = levels.size < LEVELS.length || searchInput.trim() !== "";

    return (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <LogFilterBar
                searchInput={searchInput}
                onSearchChange={setSearchInput}
                levels={levels}
                onAllLevels={() => setLevels(new Set(LEVELS.map((entry) => entry.value)))}
                onToggleLevel={(level) =>
                    setLevels((current) => {
                        const next = new Set(current);
                        if (next.has(level)) {
                            if (next.size === 1) {
                                return current;
                            }
                            next.delete(level);
                        } else {
                            next.add(level);
                        }
                        return next;
                    })
                }
                total={visible.length}
                filtered={filtered}
            />
            {visible.length === 0 ? (
                <p className="m-0 px-4 py-8 text-center text-[11.5px] text-ink-secondary">
                    No lines match. Clear the search or enable another level.
                </p>
            ) : (
                <div role="log" aria-label="Sample log lines" className="py-1">
                    {visible.map((record) => (
                        <LogRow
                            key={record.seq}
                            record={record}
                            search={searchInput.trim()}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

const QUEUE_PROJECT: ProjectSummary = {
    accessed_at: "2026-11-12T10:00:00Z",
    completed_videos: 1,
    created_at: "2026-11-01T09:00:00Z",
    id: "docs-queue",
    name: "Queue sample",
    path: "C:\\Media\\queue",
    size_bytes: 3_200_000_000,
    video_count: 4,
};

const QUEUE_VIDEOS: VideoSummary[] = ["Opening", "Interview", "B-roll", "Credits"].map(
    (name, index) => ({
        created_at: "2026-11-01T09:00:00Z",
        id: `docs-video-${String(index)}`,
        input_path: `C:\\Media\\queue\\${name.toLowerCase().replace(" ", "-")}.mkv`,
        name,
        order: index,
        output_path: `C:\\Media\\queue\\${name.toLowerCase().replace(" ", "-")}.av1.mkv`,
    }),
);

function QueueSelectionBody() {
    const queue = useProjectQueue(QUEUE_PROJECT.id);
    return <ProjectQueueSection queue={queue} general={undefined} />;
}

const queueRoot = createRootRoute({
    staticData: ROUTE_META["/"],
    component: QueueSelectionBody,
});

const queueVideo = createRoute({
    getParentRoute: () => queueRoot,
    path: "/projects/$projectId/videos/$videoId",
    staticData: ROUTE_META["/projects/$projectId/videos/$videoId"],
    component: () => null,
});

function QueueSelectionSample() {
    const [transport] = useState(() => {
        const next = new MockTransport();
        next.routes.set("/api/projects", [{ ...QUEUE_PROJECT }]);
        next.videos.set(
            QUEUE_PROJECT.id,
            QUEUE_VIDEOS.map((video) => ({ ...video })),
        );
        return next;
    });
    const [router] = useState(() =>
        createRouter({
            routeTree: queueRoot.addChildren([queueVideo]),
            history: createMemoryHistory({ initialEntries: ["/"] }),
        }),
    );
    return (
        <ApiProvider transport={transport}>
            <RouterProvider router={router} />
        </ApiProvider>
    );
}

const STORAGE_SAMPLE: StorageOverview = {
    app_data_bytes: 184_000_000,
    app_data_directory: "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station",
    catalogue_bytes: 8_400_000,
    default_directory: "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\temp",
    free_bytes: 780_000_000_000,
    log_bytes: 24_000_000,
    manifest_bytes: 1_200_000,
    projects: [
        {
            id: "docs-aurora",
            name: "Aurora Documentary",
            retained_bytes: 2_400_000_000,
            video_count: 2,
        },
        {
            id: "docs-coast",
            name: "Coastal Tests",
            retained_bytes: 780_000_000,
            video_count: 3,
        },
    ],
    retained_bytes: 3_180_000_000,
    temporary_directory: "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\temp",
    total_bytes: 2_000_000_000_000,
    video_count: 5,
};

function StorageSampleBody() {
    const [target, setTarget] = useState<HTMLDivElement | null>(null);
    const settings = useSettings();
    const update = useUpdateSettings();
    const [value, setValue] = useState("D:\\scratch");
    const saved = settings.data?.temp_dir ?? STORAGE_SAMPLE.default_directory;
    const dirty = value.trim() !== saved.trim();

    return (
        <TopBarTargetContext.Provider value={target}>
            <div className="flex min-h-8 flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-ink">Scratch directory</span>
                <div
                    ref={setTarget}
                    className="ml-auto flex min-h-8 min-w-0 items-center justify-end overflow-hidden"
                />
            </div>
            <StorageScratchCard
                value={value}
                placeholder={saved}
                freeBytes={STORAGE_SAMPLE.free_bytes ?? null}
                totalBytes={STORAGE_SAMPLE.total_bytes ?? null}
                retainedBytes={STORAGE_SAMPLE.retained_bytes}
                canPick={false}
                onChange={setValue}
                onPick={undefined}
                onUseDefault={() => setValue("")}
            />
            <DraftActions
                dirty={dirty}
                pending={update.isPending}
                onSave={() =>
                    update.mutate({
                        temp_dir: value.trim() === "" ? null : value.trim(),
                    })
                }
                onDiscard={() => setValue(saved)}
                showLabels
            />
            {update.isError ? (
                <p role="alert" className="mt-2 mb-0 text-[11.5px] text-danger">
                    {update.error instanceof Error
                        ? update.error.message
                        : "The storage setting could not be saved."}
                </p>
            ) : null}
        </TopBarTargetContext.Provider>
    );
}

function StorageSample() {
    const [transport] = useState(() => new MockTransport());
    return (
        <ApiProvider transport={transport}>
            <StorageSampleBody />
        </ApiProvider>
    );
}

function RetainedRemovalBody() {
    const [open, setOpen] = useState(false);
    const [retained, setRetained] = useState(2_400_000_000);
    const [deleted, setDeleted] = useState(false);
    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <div className="min-w-0">
                    <p className="m-0 text-[12px] font-medium text-ink">Encoded scene chunks</p>
                    <p className="mt-0.5 mb-0 font-mono text-[10.5px] text-ink-muted">
                        {retained === 0 ? "No retained work" : `${formatBytes(retained)} retained`}
                    </p>
                </div>
                <Button
                    variant="dangerGhost"
                    className="h-8 px-2.5 text-[11px]"
                    disabled={retained === 0}
                    onClick={() => setOpen(true)}
                >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    Delete retained
                </Button>
            </div>
            <DeleteRetainedDialog
                open={open}
                retainedBytes={retained}
                pending={false}
                error={null}
                onClose={() => setOpen(false)}
                onConfirm={() => {
                    setRetained(0);
                    setDeleted(true);
                    setOpen(false);
                }}
            />
            {deleted ? (
                <p className="mt-2 mb-0 text-[10.5px] text-ink-muted">
                    Removed the sample's retained chunks; its output and history stay.
                </p>
            ) : null}
        </div>
    );
}

function NetworkSample() {
    const [paired, setPaired] = useState(false);
    if (paired) {
        return (
            <div className="rounded-lg border border-line bg-surface px-5 py-6">
                <p className="m-0 text-sm font-medium text-ink">Browser paired in the sample</p>
                <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                    The form exchanged the code for a sample token and would mount the application
                    shell. Reset starts the exchange again.
                </p>
            </div>
        );
    }
    return (
        <div>
            <PairingScreen
                embedded
                pair={async () => ({ token: "a".repeat(64) })}
                onPaired={() => setPaired(true)}
            />
            <p className="mt-2 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                Enter ABCD-EFGH and choose Pair; no request leaves the sample.
            </p>
        </div>
    );
}

const QUALITY_METRIC_START: Record<string, unknown> = {
    SSIMULACRA2: {
        target_range: [74, 76],
        resolution: null,
        threads: null,
        gpu_id: null,
    },
};

function RunLockSample() {
    return (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-4 py-3.5">
                <p className="m-0 text-[12px] font-medium text-ink">Run lock</p>
                <p className="mt-0.5 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                    Another video holds the process-wide encode lock. The service refuses these
                    actions; the tooltips carry its reason.
                </p>
            </div>
            <div className="space-y-1.5 px-3 py-3">
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-line-subtle bg-sunken/55 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-secondary">
                        Scene detection
                    </span>
                    <SequenceActionButton
                        icon={<Lock aria-hidden="true" className="h-2.5 w-2.5" />}
                        label="Start"
                        ariaLabel="Start Scene detection"
                        title="Aurora Documentary is encoding; only one sequence can run at a time."
                        disabled
                        onClick={() => undefined}
                    />
                </div>
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-line-subtle bg-sunken/55 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-secondary">
                        Target quality
                    </span>
                    <SequenceActionButton
                        icon={<Lock aria-hidden="true" className="h-2.5 w-2.5" />}
                        label="Reset data"
                        ariaLabel="Reset Target quality data"
                        title="Target quality data is locked while the encoding video runs."
                        disabled
                        tone="warning"
                        onClick={() => undefined}
                    />
                </div>
            </div>
        </div>
    );
}

function QualityMetricSample() {
    const [metric, setMetric] = useState<Record<string, unknown>>(QUALITY_METRIC_START);
    return (
        <div className="rounded-lg border border-line bg-surface px-4 py-4 sm:px-5">
            <MetricField
                value={metric}
                onChange={setMetric}
                disabled={false}
                showRange={false}
            />
        </div>
    );
}

function QualityRangeSample() {
    const [metric, setMetric] = useState<Record<string, unknown>>(QUALITY_METRIC_START);
    const [quantizers, setQuantizers] = useState<[number, number]>([0, 51]);
    return (
        <div className="grid gap-4 rounded-lg border border-line bg-surface px-4 py-4 sm:grid-cols-2 sm:px-5">
            <TargetRangeField value={metric} onChange={setMetric} disabled={false} />
            <QuantizerRangeField
                value={quantizers}
                onChange={setQuantizers}
                min={0}
                max={51}
                disabled={false}
            />
        </div>
    );
}

function SpeedScalingSample() {
    const [points, setPoints] = useState<unknown>([
        [8, 20],
        [6, 35],
        [4, 50],
    ]);
    return (
        <SpeedScalingCard
            value={points}
            disabled={false}
            maxQuantizer={51}
            onChange={(next) =>
                setPoints(
                    next === null ? null : next.map((point) => [point.speed, point.quantizer]),
                )
            }
        />
    );
}

function BitrateThresholdSample() {
    const [threshold, setThreshold] = useState(2);
    return (
        <div className="rounded-lg border border-line bg-surface px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="block max-w-[160px]">
                    <span className="block text-[10.5px] font-medium text-ink-secondary">
                        Sigma threshold
                    </span>
                    <NumberField
                        label="Bitrate sigma threshold"
                        value={threshold}
                        min={1}
                        max={10}
                        step={0.1}
                        onChange={setThreshold}
                        className="mt-1"
                    />
                </label>
                <p className="m-0 max-w-[54ch] pb-1 text-[10px] leading-relaxed text-ink-muted">
                    Scenes at least this many standard deviations above the average bitrate are
                    re-encoded. Click the curve or type a value.
                </p>
            </div>
            <BitrateThresholdCurve
                value={threshold}
                onChange={setThreshold}
                disabled={false}
            />
        </div>
    );
}

const HISTORY_SAMPLE: HistoryRun = {
    runId: "docs-run-2026-11-12",
    startedAt: "2026-11-12T10:00:00Z",
    endedAt: "2026-11-12T10:02:04Z",
    outcome: "failed",
    durationSeconds: 124,
    message: "ParallelEncoder failed: SVT-AV1 exited with status 1 while encoding scene 4.",
    frames: 2_160,
    terminal: null,
    steps: [
        {
            sequence: "SceneDetector",
            outcome: "completed",
            startedAt: "2026-11-12T10:00:00Z",
            endedAt: "2026-11-12T10:00:29Z",
            durationSeconds: 29,
            framesProcessed: 2_160,
            framesTotal: 2_160,
            fps: 74.48,
            message: null,
        },
        {
            sequence: "ParallelEncoder",
            outcome: "failed",
            startedAt: "2026-11-12T10:00:29Z",
            endedAt: "2026-11-12T10:02:04Z",
            durationSeconds: 95,
            framesProcessed: 720,
            framesTotal: 2_160,
            fps: 7.58,
            message: "SVT-AV1 exited with status 1.",
        },
    ],
};

const HISTORY_SAMPLE_LOG: RunSummary = {
    run_id: HISTORY_SAMPLE.runId,
    started_at: HISTORY_SAMPLE.startedAt,
    ended_at: HISTORY_SAMPLE.endedAt,
    outcome: "failed",
    message: HISTORY_SAMPLE.message,
};

function HistorySampleBody() {
    return (
        <HistoryRunCard
            projectId="docs-aurora"
            videoId="docs-video"
            run={HISTORY_SAMPLE}
            log={HISTORY_SAMPLE_LOG}
            onDelete={() => undefined}
        />
    );
}

const historySampleRoot = createRootRoute({
    staticData: ROUTE_META["/"],
    component: HistorySampleBody,
});

const historySampleLogs = createRoute({
    getParentRoute: () => historySampleRoot,
    path: "/projects/$projectId/videos/$videoId/logs",
    staticData: ROUTE_META["/projects/$projectId/videos/$videoId/logs"],
    component: () => null,
});

function HistorySample() {
    const [router] = useState(() =>
        createRouter({
            routeTree: historySampleRoot.addChildren([historySampleLogs]),
            history: createMemoryHistory({ initialEntries: ["/"] }),
        }),
    );
    return <RouterProvider router={router} />;
}

function InputKindsSampleBody() {
    const [value, setValue] = useState<InputValue>(() => ({
        ...emptyInputValue("vapour_synth_script"),
        script: "C:\\Scripts\\grade.vpy",
    }));
    return (
        <div className="rounded-lg border border-line bg-surface px-4 py-4 sm:px-5">
            <InputEditor
                value={value}
                onChange={setValue}
                idPrefix="docs-input"
                mode="input"
            />
        </div>
    );
}

function InputKindsSample() {
    const [transport] = useState(() => new MockTransport());
    return (
        <ApiProvider transport={transport}>
            <InputKindsSampleBody />
        </ApiProvider>
    );
}

const INVALID_SCRIPT = `import vapoursynth as vs
core = vs.core
clip = core.std.BlankClip(width=1920, height=1080, format=vs.YUV420P10)
clip.set_output(`;

const INVALID_SCRIPT_CHECK: ScriptCheck = {
    status: "invalid",
    detail: "SyntaxError: '(' was never closed (line 4)",
};

function ScriptValidationSample() {
    const [transport] = useState(() => new MockTransport());
    return (
        <ApiProvider transport={transport}>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                    <span className="font-mono text-[10.5px] text-ink">invalid-script.vpy</span>
                    <span className="rounded border border-line px-1.5 py-0.5 text-[9.5px] tracking-[0.08em] text-ink-muted uppercase">
                        Read-only
                    </span>
                </div>
                <ScriptEditor
                    value={INVALID_SCRIPT}
                    stub=""
                    variables={[]}
                    readOnly
                    height="170px"
                    ariaLabel="Invalid VapourSynth script"
                    path="invalid-script.vpy"
                />
                <div className="border-t border-line px-4 py-3">
                    <ScriptValidationResult
                        check={INVALID_SCRIPT_CHECK}
                        emptyDetail="Validate runs the script and asks the clip it returns."
                    />
                </div>
            </div>
        </ApiProvider>
    );
}

const SAMPLES = {
    toolchain: {
        label: "Toolchain",
        note: SAMPLE_NOTES.toolchain,
        render: () => <ToolchainSample />,
    },
    "new-project": {
        label: "New project",
        note: SAMPLE_NOTES["new-project"],
        render: () => <NewProjectSample />,
    },
    "run-control": {
        label: "Run control",
        note: SAMPLE_NOTES["run-control"],
        render: () => <RunControlBody />,
    },
    "video-config": {
        label: "Video configuration",
        note: SAMPLE_NOTES["video-config"],
        render: () => <VideoConfigSample />,
    },
    "command-palette": {
        label: "Command palette",
        note: SAMPLE_NOTES["command-palette"],
        render: () => <CommandPaletteSample />,
    },
    "draft-actions": {
        label: "Draft actions",
        note: SAMPLE_NOTES["draft-actions"],
        render: () => <DraftActionsBody />,
    },
    appearance: {
        label: "Appearance",
        note: SAMPLE_NOTES.appearance,
        render: () => <AppearanceSample />,
    },
    "project-search": {
        label: "Project search",
        note: SAMPLE_NOTES["project-search"],
        render: () => <ProjectSearchSample />,
    },
    "run-lock": {
        label: "Run lock",
        note: SAMPLE_NOTES["run-lock"],
        render: () => <RunLockSample />,
    },
    "quality-metric": {
        label: "Probe metric",
        note: SAMPLE_NOTES["quality-metric"],
        render: () => <QualityMetricSample />,
    },
    "quality-range": {
        label: "Range and bounds",
        note: SAMPLE_NOTES["quality-range"],
        render: () => <QualityRangeSample />,
    },
    "speed-scaling": {
        label: "Speed scaling",
        note: SAMPLE_NOTES["speed-scaling"],
        render: () => <SpeedScalingSample />,
    },
    "bitrate-threshold": {
        label: "Bitrate optimization",
        note: SAMPLE_NOTES["bitrate-threshold"],
        render: () => <BitrateThresholdSample />,
    },
    "scene-table": {
        label: "Scene table",
        note: SAMPLE_NOTES["scene-table"],
        render: () => <SceneSampleBody mode="rail" />,
    },
    "scene-details": {
        label: "Scene details",
        note: SAMPLE_NOTES["scene-details"],
        render: () => <SceneSampleBody mode="details" />,
    },
    "history-item": {
        label: "History item",
        note: SAMPLE_NOTES["history-item"],
        render: () => <HistorySample />,
    },
    "input-kinds": {
        label: "Input kinds",
        note: SAMPLE_NOTES["input-kinds"],
        render: () => <InputKindsSample />,
    },
    "script-validation": {
        label: "Script validation",
        note: SAMPLE_NOTES["script-validation"],
        render: () => <ScriptValidationSample />,
    },
    "log-filter": {
        label: "Log filter",
        note: SAMPLE_NOTES["log-filter"],
        render: () => <LogFilterBody />,
    },
    "queue-selection": {
        label: "Queue selection",
        note: SAMPLE_NOTES["queue-selection"],
        render: () => <QueueSelectionSample />,
    },
    storage: {
        label: "Storage",
        note: SAMPLE_NOTES.storage,
        render: () => <StorageSample />,
    },
    "retained-removal": {
        label: "Retained work",
        note: SAMPLE_NOTES["retained-removal"],
        render: () => <RetainedRemovalBody />,
    },
    network: {
        label: "Network",
        note: SAMPLE_NOTES.network,
        render: () => <NetworkSample />,
    },
} as const;

export type DocsSampleKind = keyof typeof SAMPLES;

/**
 * A focused documentation example.
 *
 * It mounts the production component against sample data; it is not a screenshot, a second
 * application shell, or a docs-only visual copy. Reset remounts the sample so a reader can
 * start the interaction again without reloading the page.
 */
export function DocsSample({ kind }: { kind: DocsSampleKind }) {
    const [generation, setGeneration] = useState(0);
    const sample = SAMPLES[kind];
    return (
        <section className="docs-app-widget" aria-label={`${sample.label} sample`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[0.16em] text-ink-muted uppercase">
                    Live sample · {sample.label}
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setGeneration((current) => current + 1)}
                >
                    Reset
                </Button>
            </div>
            <div key={generation} className="min-w-0">
                {sample.render()}
            </div>
            <p className="mt-2 mb-0 text-[10.5px] leading-relaxed text-ink-muted">{sample.note}</p>
        </section>
    );
}
