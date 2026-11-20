import { useMemo } from "react";

import {
    useConfigSchemas,
    useEncoders,
    useProject,
    useProjectChunkImpact,
    useProjectConfig,
    useProjectScriptPlugins,
    useProjectVideos,
    useSaveProjectConfig,
    useVideoStates,
} from "@av1ation/api";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { InlineError } from "../../shared/InlineError";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { ScriptPluginNotice } from "../../shared/ScriptPluginNotice";
import { Skeleton } from "../../shared/Skeleton";
import { DraftActions } from "../../shared/TopBarActions";
import { useAllowNavigation } from "../../shared/UnsavedChanges";
import { useDraftSession } from "../../shared/useDraftSession";
import { DEFINITIONS } from "../../shared/model/section-definitions";
import { isProjectSection } from "../../shared/model/project-sections";
import { SECTION_PLUGIN_CONTEXTS } from "../../shared/model/video-sections";
import { documentFromValues } from "../../shared/schema/config-schema";
import {
    ConcatenationEditor,
    SectionParts,
    buildDraft,
    encoderAppliesFilter,
    mergeDraft,
    schemaFor,
} from "../configuration/SectionEditor";
import { SceneEncoderChunkGuard } from "../scenes/SceneEncoderChunkGuard";
import { useChunkGuard } from "../scenes/useChunkGuard";

/**
 * One configuration section. The form is generated from the engine's JSON Schema, so every
 * section — including an optional sequence that starts null — is editable from the same
 * component. The screen owns one draft; Save and Cancel live in the shell's top bar.
 */
export function ProjectSectionScreen() {
    const { projectId, section } = useParams({
        from: "/projects/$projectId/config/$section",
    });
    const known = isProjectSection(section) && section !== "general";
    const definition = known ? DEFINITIONS[section] : null;

    const navigate = useNavigate();
    const allowNavigation = useAllowNavigation();
    const project = useProject(projectId);
    const config = useProjectConfig(projectId);
    const schemas = useConfigSchemas();
    const encoders = useEncoders();
    const videos = useProjectVideos(projectId);
    const states = useVideoStates(
        projectId,
        (videos.data ?? []).map((video) => video.id),
    );
    const save = useSaveProjectConfig(projectId);
    const chunkImpact = useProjectChunkImpact(projectId);
    const chunkGuard = useChunkGuard();
    const plugins = useProjectScriptPlugins(projectId);

    const document = useMemo(
        () => (config.data === undefined ? null : documentFromValues(config.data.values)),
        [config.data],
    );
    const locked = states.some((query) => query.data?.active === true);
    const activeIndex = states.findIndex((query) => query.data?.active === true);
    const activeVideo = activeIndex < 0 ? undefined : videos.data?.[activeIndex];

    const resolved = useMemo(
        () =>
            definition === null || schemas.data === undefined
                ? null
                : schemaFor(schemas.data, definition),
        [definition, schemas.data],
    );

    const session = useDraftSession<Record<string, unknown>, Record<string, unknown>>({
        identity: `${projectId}/${section}`,
        label: definition?.title ?? "Configuration",
        snapshot: definition === null || document === null ? undefined : document,
        toDraft: (server) => (definition === null ? {} : buildDraft(definition, server)),
        save: async (draft, server) => {
            if (definition === null) {
                return false;
            }
            const document = mergeDraft(server, definition, draft);
            let clearChunks: boolean | undefined;
            if (definition.id === "encoding") {
                // The project has no scene table, so the service names the chunks this write
                // reaches. The save resolves the same impact again before it writes.
                const impact = await chunkImpact.mutateAsync(document);
                if (impact.scenes.length > 0) {
                    const keep = await chunkGuard.ask(impact.scenes, {
                        eyebrow: "Project encoding",
                        reason: impact.reason ?? "encoder",
                        videos: impact.videos,
                    });
                    if (keep === null) {
                        return false;
                    }
                    clearChunks = !keep;
                }
            }
            try {
                await save.mutateAsync({
                    document,
                    ...(clearChunks === undefined ? {} : { clearChunks }),
                });
                toast.success(`${definition.title} saved`);
                return true;
            } catch {
                return false;
            }
        },
        pending: save.isPending || chunkImpact.isPending,
        active: definition !== null,
    });
    const draft = session.value;
    const setDraft = session.setValue;

    /**
     * Open a section's script page, saving the draft that page needs first.
     *
     * The page edits the saved input, so navigating with an unsaved kind change used to
     * prompt the guard, and choosing Discard landed on a script page whose input is not a
     * script. Saving here makes the destination true; a draft the service rejects keeps the
     * user on the section with the error still visible.
     */
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
            to: "/projects/$projectId/config/script",
            params: { projectId },
            search: { section, part },
        });
    };

    if (!known || definition === null) {
        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-line bg-surface p-6">
                    <h1 className="m-0 text-xl font-semibold text-ink">
                        No such configuration section
                    </h1>
                    <p className="mt-2 mb-4 text-[13px] leading-relaxed text-ink-secondary">
                        The address does not name one of the seven sections. Use the back link.
                    </p>
                    <Button variant="secondary" onClick={() => window.history.back()}>
                        Go back
                    </Button>
                </div>
            </main>
        );
    }

    const pending = project.isPending || config.isPending || schemas.isPending;
    const failed = project.isError || config.isError || schemas.isError;

    return (
        <main id="main" className="page py-6">
            <div>
                <header className="border-b border-line pb-3">
                    <h1 className="sr-only">{definition.title}</h1>
                    <p className="m-0 max-w-[76ch] text-[12px] leading-relaxed text-ink-secondary">
                        {definition.description}
                    </p>
                </header>

                <div className="mt-4">
                    <ScriptPluginNotice
                        problems={plugins.data?.problems ?? []}
                        error={plugins.data?.error}
                        contexts={SECTION_PLUGIN_CONTEXTS[definition.id]}
                    />
                </div>

                {save.isError ? (
                    <InlineError className="mt-4 mb-0">
                        {save.error instanceof Error
                            ? `The configuration could not be saved: ${save.error.message}`
                            : "The configuration could not be saved."}
                    </InlineError>
                ) : null}

                {chunkImpact.isError ? (
                    <InlineError className="mt-4 mb-0">
                        {chunkImpact.error instanceof Error
                            ? `The chunks this save would invalidate could not be checked: ${chunkImpact.error.message}`
                            : "The chunks this save would invalidate could not be checked."}
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
                        message="The configuration or the engine schema did not arrive."
                        retryLabel="Retry"
                        onRetry={() => {
                            void config.refetch();
                            void schemas.refetch();
                        }}
                    />
                ) : null}

                {resolved === null || draft === null ? null : (
                    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="min-w-0 space-y-4">
                            {definition.id === "concatenation" ? (
                                <ConcatenationEditor
                                    draft={draft}
                                    setDraft={setDraft}
                                    locked={locked}
                                    scope="project"
                                />
                            ) : (
                                <SectionParts
                                    definition={definition}
                                    resolved={resolved}
                                    draft={draft}
                                    setDraft={setDraft}
                                    locked={locked}
                                    scope="project"
                                    encoderDocument={document}
                                    encoders={encoders.data}
                                    onEditScript={(part) => void openScript(part)}
                                    encodingFilter={encoderAppliesFilter(document)}
                                />
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
                                    <p className="mt-3 mb-0 text-[10px] leading-relaxed text-ink-muted">
                                        Turning off an earlier stage turns off the ones that consume
                                        it.
                                    </p>
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
            </div>

            <DraftActions
                {...session.actions}
                locked={locked}
                lockedLabel={
                    activeVideo === undefined
                        ? "Configuration locked"
                        : `${activeVideo.name} is encoding`
                }
            />

            <SceneEncoderChunkGuard {...chunkGuard.props} />
        </main>
    );
}
