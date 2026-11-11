import { useMemo } from "react";

import {
    useProject,
    useProjectConfig,
    useProjectScriptPlugins,
    useProjectVideos,
    useUpdateGeneral,
    useVideoStates,
} from "@av1ation/api";
import type { GeneralDefaults } from "@av1ation/contracts";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { InlineError } from "../../shared/InlineError";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import {
    GeneralDefaultsEditor,
    generalDefaultsChanges,
    generalDefaultsIncomplete,
    generalDefaultsPayload,
} from "../configuration/GeneralDefaultsEditor";
import { ScriptPluginNotice } from "../../shared/ScriptPluginNotice";
import { DraftActions } from "../../shared/TopBarActions";
import { useAllowNavigation } from "../../shared/UnsavedChanges";
import { useDraftSession } from "../../shared/useDraftSession";
import { documentFromValues } from "../../shared/schema/config-schema";
import type { ProjectSectionId } from "../../shared/model/project-sections";
import { GENERAL_PLUGIN_CONTEXTS } from "../../shared/model/video-sections";

interface InputUse {
    label: string;
    detail: string;
    section: ProjectSectionId;
    path: string;
}

const INPUT_USES: InputUse[] = [
    {
        label: "Scene detection",
        detail: "The detector reads this graph unless its section overrides the input.",
        section: "scene-detection",
        path: "sequences.scene_detector.input",
    },
    {
        label: "Noise generation",
        detail: "The detector samples this graph; the scaler has no input of its own.",
        section: "noise-generation",
        path: "sequences.noise_detector.input",
    },
    {
        label: "Target quality",
        detail: "The probe decodes this graph unless the section supplies another.",
        section: "target-quality",
        path: "sequences.target_quality.input",
    },
    {
        label: "Target quality · metric",
        detail: "Only the metric uses this second graph, when the section enables one.",
        section: "target-quality",
        path: "sequences.target_quality.metric_input",
    },
    {
        label: "Encoding",
        detail: "Every encoder worker reads this graph unless Parallel Encoder overrides it.",
        section: "encoding",
        path: "sequences.parallel_encoder.input",
    },
    {
        label: "Quality check",
        detail: "The check scores this graph when it is enabled.",
        section: "quality-check",
        path: "sequences.quality_check.input",
    },
];

/** One stage's input decision, read from the project's effective configuration. */
function useRows(projectId: string) {
    const config = useProjectConfig(projectId);
    return useMemo(() => {
        const values = config.data?.values ?? {};
        const document = config.data === undefined ? null : documentFromValues(config.data.values);
        return INPUT_USES.map((entry) => {
            const resolved = values[entry.path];
            const override = resolved !== undefined && resolved.value !== null;
            return {
                ...entry,
                override,
                source: resolved?.source ?? "default",
                active:
                    document === null ||
                    ((entry.section !== "target-quality" || document.target_quality !== null) &&
                        (entry.section !== "noise-generation" ||
                            document.noise_detector !== null) &&
                        (entry.section !== "quality-check" || document.quality_check !== null)),
            };
        });
    }, [config.data]);
}

/**
 * The project's General document.
 *
 * It owns only the facts that are true for every video: which decoder the project starts
 * from and where its outputs go. A source path and an index file name one file, so they are
 * deliberately absent here; those are written on the video that owns the file. A sequence
 * may override the input, which is the list below the editor.
 */
export function ProjectGeneralScreen() {
    const { projectId } = useParams({
        from: "/projects/$projectId/config/general",
    });
    const navigate = useNavigate();
    const allowNavigation = useAllowNavigation();
    const project = useProject(projectId);
    const videos = useProjectVideos(projectId);
    const states = useVideoStates(
        projectId,
        (videos.data ?? []).map((video) => video.id),
    );
    const update = useUpdateGeneral(projectId);
    const plugins = useProjectScriptPlugins(projectId);
    const rows = useRows(projectId);

    const locked = states.some((query) => query.data?.active === true);
    const activeIndex = states.findIndex((query) => query.data?.active === true);
    const activeVideo = activeIndex < 0 ? undefined : videos.data?.[activeIndex];
    const source = project.data?.general;

    const session = useDraftSession<GeneralDefaults, GeneralDefaults>({
        identity: `${projectId}/general`,
        label: "Project General",
        snapshot: source,
        toDraft: (general) => general,
        save: async (draft) => {
            const incomplete = generalDefaultsIncomplete(draft);
            if (incomplete !== null) {
                toast.error(incomplete);
                return false;
            }
            try {
                await update.mutateAsync(generalDefaultsPayload(draft));
                toast.success("Project General saved");
                return true;
            } catch {
                return false;
            }
        },
        changes: (draft, baseline) => generalDefaultsChanges(baseline, draft),
        comparable: generalDefaultsPayload,
        pending: update.isPending,
    });
    const value = session.value;

    const openScript = async () => {
        if (session.dirty) {
            const saved = await session.save();
            if (!saved) {
                return;
            }
        }
        allowNavigation();
        void navigate({
            to: "/projects/$projectId/config/script",
            params: { projectId },
        });
    };

    return (
        <main id="main" className="page py-6">
            <header className="border-b border-line pb-4">
                <h1 className="sr-only">General</h1>
                <p className="m-0 max-w-[76ch] text-[12px] leading-relaxed text-ink-secondary">
                    Applies to every video added to the queue. A sequence can override its own
                    input. The exact source and index path belong to a video, because another video
                    in the same project would collide with them.
                </p>
            </header>

            {update.isError ? (
                <InlineError className="mt-4 mb-0">
                    {update.error instanceof Error
                        ? `The General document could not be saved: ${update.error.message}`
                        : "The General document could not be saved."}
                </InlineError>
            ) : null}

            {project.isError ? (
                <LoadErrorPanel
                    className="mt-5"
                    title="This project could not be loaded"
                    onRetry={() => void project.refetch()}
                />
            ) : project.isPending || value === null ? (
                <div className="mt-5 space-y-4" aria-busy="true">
                    <div className="h-64 animate-pulse rounded-lg border border-line bg-surface" />
                    <div className="h-48 animate-pulse rounded-lg border border-line bg-surface" />
                </div>
            ) : (
                <div className="mt-5 space-y-4">
                    <ScriptPluginNotice
                        problems={plugins.data?.problems ?? []}
                        error={plugins.data?.error}
                        contexts={GENERAL_PLUGIN_CONTEXTS}
                    />
                    <section className="rounded-lg border border-line bg-surface px-4 py-5 sm:px-6">
                        <GeneralDefaultsEditor
                            value={value}
                            onChange={(next) => session.setValue(next)}
                            disabled={locked}
                            idPrefix="project-general"
                            onEditScript={() => void openScript()}
                        />
                    </section>

                    <section
                        aria-labelledby="where-input-used"
                        className="rounded-lg border border-line bg-surface"
                    >
                        <div className="border-b border-line px-4 py-4 sm:px-5">
                            <h2
                                id="where-input-used"
                                className="m-0 text-base font-semibold text-ink"
                            >
                                Where this input is used
                            </h2>
                            <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                                Every sequence starts here and can override its own input. An
                                override is independent; it inherits nothing after it is saved.
                            </p>
                        </div>
                        <ul className="m-0 list-none p-0">
                            <li className="grid gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_72px] sm:items-center sm:px-5">
                                <div className="min-w-0">
                                    <p className="m-0 text-[12px] font-medium text-ink">General</p>
                                    <p className="m-0 text-[10.5px] text-ink-muted">
                                        The document above.
                                    </p>
                                </div>
                                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-muted uppercase">
                                    This input
                                </span>
                                <Link
                                    to="/projects/$projectId/config/general"
                                    params={{ projectId }}
                                    className="text-[11px] text-brand-text hover:underline"
                                >
                                    Edit
                                </Link>
                            </li>
                            {rows.map((row) => (
                                <li
                                    key={row.path}
                                    className="grid gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_120px_72px] sm:items-center sm:px-5"
                                >
                                    <div className="min-w-0">
                                        <p className="m-0 text-[12px] font-medium text-ink">
                                            {row.label}
                                        </p>
                                        <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                                            {row.detail}
                                        </p>
                                    </div>
                                    <span
                                        className={`font-mono text-[10px] tracking-[0.08em] uppercase ${
                                            row.override ? "text-warning" : "text-ink-muted"
                                        }`}
                                    >
                                        {row.override
                                            ? "Override"
                                            : row.active
                                              ? "Inherited"
                                              : "Off"}
                                    </span>
                                    <Link
                                        to="/projects/$projectId/config/$section"
                                        params={{
                                            projectId,
                                            section: row.section,
                                        }}
                                        className="text-[11px] text-brand-text hover:underline"
                                    >
                                        Edit
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                        A VapourSynth script belongs to the input that uses it. Its editor is opened
                        from that input; there is no single project script.
                    </p>
                </div>
            )}

            <DraftActions
                {...session.actions}
                locked={locked}
                lockedLabel={
                    activeVideo === undefined
                        ? "Locked while an encode runs"
                        : `${activeVideo.name} is encoding`
                }
            />
        </main>
    );
}
