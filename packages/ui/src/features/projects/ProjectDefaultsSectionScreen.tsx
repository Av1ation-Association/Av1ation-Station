import {
    useConfigSchemas,
    useEncoders,
    useResetProjectTemplateSection,
    useSaveTemplateDefaults,
    useSaveTemplateGeneral,
    useTemplateDefaults,
    useTemplateGeneral,
    useTemplateScriptPlugins,
} from "@av1ation/api";
import type { GeneralDefaults } from "@av1ation/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { ScriptPluginNotice } from "../../shared/ScriptPluginNotice";
import { DraftActions } from "../../shared/TopBarActions";
import { useAllowNavigation } from "../../shared/UnsavedChanges";
import { DEFINITIONS } from "../../shared/model/section-definitions";
import {
    GENERAL_PLUGIN_CONTEXTS,
    SECTION_PLUGIN_CONTEXTS,
} from "../../shared/model/video-sections";
import { documentFromValues } from "../../shared/schema/config-schema";
import { useDraftSession } from "../../shared/useDraftSession";
import {
    GeneralDefaultsEditor,
    generalDefaultsChanges,
    generalDefaultsIncomplete,
    generalDefaultsPayload,
} from "../configuration/GeneralDefaultsEditor";
import {
    ConcatenationEditor,
    SectionParts,
    buildDraft,
    encoderAppliesFilter,
    mergeDraft,
    schemaFor,
} from "../configuration/SectionEditor";
import { SettingsHeader, isSection, sectionTitle, type SectionId } from "./project-defaults-parts";

/**
 * One template section on its own route.
 *
 * It is the same editor a project section uses, scoped to the template. The back link is
 * the only sibling navigation: a draft cannot be left by opening another section, so Save
 * and Cancel remain the two explicit outcomes.
 */
export function ProjectDefaultsSectionScreen() {
    const { templateId, section } = useParams({
        from: "/settings/templates/$templateId/$section",
    });
    const navigate = useNavigate();
    const allowNavigation = useAllowNavigation();
    const defaults = useTemplateDefaults(templateId);
    const generalDefaults = useTemplateGeneral(templateId);
    const schemas = useConfigSchemas();
    const encoders = useEncoders();
    const save = useSaveTemplateDefaults(templateId);
    const saveGeneral = useSaveTemplateGeneral(templateId);
    const plugins = useTemplateScriptPlugins(templateId);
    const resetSection = useResetProjectTemplateSection(templateId);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const resetDialog = useRef<HTMLDialogElement>(null);
    const known = isSection(section);
    const id: SectionId = known ? section : "general";
    const definition = id === "general" ? null : DEFINITIONS[id];

    const document = useMemo(
        () => (defaults.data === undefined ? null : documentFromValues(defaults.data.values)),
        [defaults.data],
    );
    const resolved = useMemo(
        () =>
            definition === null || schemas.data === undefined
                ? null
                : schemaFor(schemas.data, definition),
        [definition, schemas.data],
    );

    const configSession = useDraftSession<Record<string, unknown>, Record<string, unknown>>({
        identity: `${templateId}/${id}`,
        label: `${sectionTitle(id)} defaults`,
        snapshot: definition === null || document === null ? undefined : document,
        toDraft: (server) => (definition === null ? {} : buildDraft(definition, server)),
        save: async (draft, server) => {
            if (definition === null) {
                return false;
            }
            try {
                await save.mutateAsync(mergeDraft(server, definition, draft));
                toast.success(`${definition.title} defaults saved`);
                return true;
            } catch {
                return false;
            }
        },
        pending: save.isPending,
        active: id !== "general",
    });
    const generalSession = useDraftSession<GeneralDefaults, GeneralDefaults>({
        identity: `${templateId}/general`,
        label: "General defaults",
        snapshot: generalDefaults.data,
        toDraft: (general) => general,
        save: async (draft) => {
            const incomplete = generalDefaultsIncomplete(draft);
            if (incomplete !== null) {
                toast.error(incomplete);
                return false;
            }
            try {
                await saveGeneral.mutateAsync(generalDefaultsPayload(draft));
                toast.success("General defaults saved for new projects");
                return true;
            } catch {
                return false;
            }
        },
        changes: (draft, baseline) => generalDefaultsChanges(baseline, draft),
        comparable: generalDefaultsPayload,
        pending: saveGeneral.isPending,
        active: id === "general",
    });
    const draft = configSession.value;
    const general = generalSession.value;
    const dirty = id === "general" ? generalSession.dirty : configSession.dirty;
    const pending = save.isPending || saveGeneral.isPending;
    const session = id === "general" ? generalSession : configSession;

    const openScript = async (part?: string) => {
        if (dirty) {
            const saved = await session.save();
            if (!saved) {
                return;
            }
        }
        allowNavigation();
        void navigate({
            to: "/settings/templates/$templateId/script",
            params: { templateId },
            search: part === undefined ? {} : { section: id, part },
        });
    };

    useEffect(() => {
        const element = resetDialog.current;
        if (element === null) {
            return;
        }
        if (confirmingReset && !element.open) {
            element.showModal();
        } else if (!confirmingReset && element.open) {
            element.close();
        }
    }, [confirmingReset]);

    if (!known) {
        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <h1 className="m-0 text-xl font-semibold text-ink">No such defaults section</h1>
                <p className="mt-2 mb-0 text-[13px] text-ink-secondary">
                    The address does not name a section of the project template. Use the breadcrumb
                    to go back.
                </p>
            </main>
        );
    }

    const failed =
        defaults.isError || generalDefaults.isError || (definition !== null && schemas.isError);
    const loading =
        defaults.isPending ||
        generalDefaults.isPending ||
        (definition !== null && schemas.isPending);

    return (
        <main id="main" className="page py-6">
            <h1 className="sr-only">{sectionTitle(id)}</h1>
            <SettingsHeader
                description={
                    definition === null
                        ? "The input and output every new project starts with. The exact source and index path belong to a video; a sequence may override this input for its own stage."
                        : definition.description
                }
            />

            {failed ? (
                <LoadErrorPanel
                    className="mt-5"
                    heading="h2"
                    title="This section could not be loaded"
                    message="The template, the engine schema, or the General defaults did not arrive."
                    onRetry={() => {
                        void defaults.refetch();
                        void generalDefaults.refetch();
                        void schemas.refetch();
                    }}
                />
            ) : null}

            {loading ? (
                <div className="mt-5 space-y-4" aria-busy="true">
                    <div className="h-64 animate-pulse rounded-lg border border-line bg-surface" />
                    <div className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
                </div>
            ) : null}

            {id === "general" ? (
                general === null ? null : (
                    <div className="mt-5">
                        <ScriptPluginNotice
                            problems={plugins.data?.problems ?? []}
                            error={plugins.data?.error}
                            contexts={GENERAL_PLUGIN_CONTEXTS}
                        />
                        <GeneralDefaultsEditor
                            value={general}
                            onChange={(next) => generalSession.setValue(next)}
                            idPrefix="defaults"
                            scope="template"
                            disabled={saveGeneral.isPending}
                            onEditScript={() => void openScript()}
                        />
                    </div>
                )
            ) : resolved === null || draft === null || definition === null ? null : (
                <div className="mt-5 space-y-4">
                    <ScriptPluginNotice
                        problems={plugins.data?.problems ?? []}
                        error={plugins.data?.error}
                        contexts={SECTION_PLUGIN_CONTEXTS[definition.id]}
                    />
                    {definition.id === "concatenation" ? (
                        <ConcatenationEditor
                            draft={draft}
                            setDraft={configSession.setValue}
                            locked={false}
                            scope="template"
                        />
                    ) : (
                        <SectionParts
                            definition={definition}
                            resolved={resolved}
                            draft={draft}
                            setDraft={configSession.setValue}
                            locked={false}
                            scope="template"
                            encodingFilter={encoderAppliesFilter(document)}
                            encoderDocument={document}
                            encoders={encoders.data}
                            onEditScript={(part) => void openScript(part)}
                        />
                    )}
                    <p className="m-0 text-[11px] leading-relaxed text-ink-muted">
                        {definition.note}
                    </p>
                </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                    variant="ghost"
                    className="h-8 px-2.5 text-[11.5px] hover:bg-danger-soft hover:text-danger"
                    onClick={() => setConfirmingReset(true)}
                    disabled={resetSection.isPending || pending}
                >
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    {resetSection.isPending ? "Resetting…" : `Reset ${sectionTitle(id)}`}
                </Button>
            </div>

            <DraftActions {...session.actions} />

            <dialog
                ref={resetDialog}
                aria-labelledby="reset-defaults-section-title"
                onCancel={(event) => {
                    event.preventDefault();
                    setConfirmingReset(false);
                }}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !resetSection.isPending) {
                        setConfirmingReset(false);
                    }
                }}
                className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="px-5 py-5">
                    <h2 id="reset-defaults-section-title" className="m-0 text-[16px] font-semibold">
                        Reset {sectionTitle(id)}?
                    </h2>
                    <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-ink-secondary">
                        This section returns to the engine defaults. Every other section keeps its
                        overrides, and existing projects are not changed.
                    </p>
                    {dirty ? (
                        <p className="mt-2 mb-0 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-2 text-[11px] leading-relaxed text-warning">
                            The draft on this screen has not been saved, so the reset discards it.
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
                    <Button variant="secondary" onClick={() => setConfirmingReset(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        disabled={resetSection.isPending}
                        onClick={() => {
                            setConfirmingReset(false);
                            resetSection.mutate(id, {
                                onSuccess: (config) => {
                                    // Rebuild the draft from what the service just stored.
                                    // Clearing it to `null` left the section blank when the
                                    // response was deep-equal to the cached one, because the
                                    // document effect never ran and the page rendered nothing.
                                    if (id === "general") {
                                        void generalDefaults.refetch().then((result) => {
                                            if (result.data !== undefined) {
                                                generalSession.resetTo(result.data);
                                            }
                                        });
                                    } else if (definition !== null) {
                                        configSession.resetTo(
                                            buildDraft(
                                                definition,
                                                documentFromValues(config.values),
                                            ),
                                        );
                                    }
                                    toast.success(`${sectionTitle(id)} reset to engine defaults`);
                                },
                            });
                        }}
                    >
                        Reset section
                    </Button>
                </div>
            </dialog>
        </main>
    );
}
