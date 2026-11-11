import {
    useResetProjectTemplate,
    useResetProjectTemplateSection,
    useSettings,
    useTemplateDefaults,
    useTemplateGeneral,
    useUpdateProjectTemplate,
} from "@av1ation/api";
import { useParams } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { EditableTitle } from "../../shared/EditableTitle";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { PROJECT_SECTIONS } from "../../shared/model/project-sections";
import { documentFromValues } from "../../shared/schema/config-schema";
import { GridCard, SettingsHeader } from "./project-defaults-parts";

/**
 * One template's section grid. It is deliberately a grid with one destination per section:
 * editing a section cannot happen beside another section's unsaved draft, and the only way
 * to change context is to come back here.
 */
export function ProjectTemplateOverview() {
    const { templateId } = useParams({
        from: "/settings/templates/$templateId",
    });
    const settings = useSettings();
    const defaults = useTemplateDefaults(templateId);
    const general = useTemplateGeneral(templateId);
    const resetConfig = useResetProjectTemplate(templateId);
    const resetGeneral = useResetProjectTemplateSection(templateId);
    const rename = useUpdateProjectTemplate();
    const [confirming, setConfirming] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const template = settings.data?.project_templates.find((entry) => entry.id === templateId);

    useEffect(() => {
        const element = dialog.current;
        if (element === null) {
            return;
        }
        if (confirming && !element.open) {
            element.showModal();
        } else if (!confirming && element.open) {
            element.close();
        }
    }, [confirming]);

    const document = useMemo(
        () => (defaults.data === undefined ? {} : documentFromValues(defaults.data.values)),
        [defaults.data],
    );

    const runReset = () => {
        setConfirming(false);
        void (async () => {
            try {
                await resetConfig.mutateAsync();
                await resetGeneral.mutateAsync("general");
                toast.success("The template was reset to the engine defaults");
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? `The template could not be reset: ${error.message}`
                        : "The template could not be reset.",
                );
            }
        })();
    };

    const runRename = async (next: string): Promise<boolean> => {
        if (template === undefined || defaults.data === undefined || general.data === undefined) {
            return false;
        }
        try {
            await rename.mutateAsync({
                id: template.id,
                name: next,
                config: document,
                general: general.data,
            });
            toast.success("The template was renamed");
            return true;
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "The template could not be renamed.",
            );
            return false;
        }
    };

    if (settings.data !== undefined && template === undefined) {
        return (
            <main id="main" className="page py-6">
                <p className="m-0 text-sm font-medium text-ink">No such template</p>
                <p className="mt-1 mb-0 text-[12px] text-ink-secondary">
                    It may have been deleted. Return to the template list.
                </p>
            </main>
        );
    }

    if (defaults.isError || general.isError) {
        return (
            <main id="main" className="page py-6">
                <SettingsHeader description="The template could not be loaded." />
                <LoadErrorPanel
                    className="mt-5"
                    title="The project template did not arrive"
                    message={
                        defaults.error instanceof Error
                            ? defaults.error.message
                            : general.error instanceof Error
                              ? general.error.message
                              : "The local service did not respond."
                    }
                    onRetry={() => {
                        void defaults.refetch();
                        void general.refetch();
                    }}
                />
            </main>
        );
    }

    const resetting = resetConfig.isPending || resetGeneral.isPending;

    return (
        <main id="main" className="page py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <EditableTitle
                        as="h1"
                        value={template?.name ?? "Template"}
                        label="template"
                        headingClassName="m-0 text-lg font-semibold text-ink"
                        onSave={runRename}
                    />
                    <p className="m-0 mt-1 max-w-[72ch] text-[12px] leading-relaxed text-ink-secondary">
                        New projects copy this template only when it is marked default. Applying it
                        to an existing project replaces its configuration and General section, not
                        each video's overrides.
                    </p>
                </div>
            </div>

            {defaults.isPending || general.isPending ? (
                <div className="mt-6 grid gap-3 md:grid-cols-2" aria-busy="true">
                    {[0, 1, 2, 3, 4, 5, 6].map((card) => (
                        <div
                            key={card}
                            className="h-[132px] animate-pulse rounded-lg border border-line bg-surface"
                        />
                    ))}
                </div>
            ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {PROJECT_SECTIONS.map((entry) => (
                        <GridCard
                            key={entry.id}
                            id={entry.id}
                            templateId={templateId}
                            general={general.data}
                            document={document}
                        />
                    ))}
                </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <RotateCcw aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
                    <div className="min-w-0">
                        <p className="m-0 text-[11.5px] font-medium text-ink">
                            Reset all to engine defaults
                        </p>
                        <p className="mt-0.5 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                            Existing projects keep the values they were created with.
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    className="h-8 shrink-0 px-2.5 text-[11.5px] hover:bg-danger-soft hover:text-danger"
                    disabled={resetting}
                    onClick={() => setConfirming(true)}
                >
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    {resetting ? "Resetting…" : "Reset"}
                </Button>
            </div>

            <dialog
                ref={dialog}
                aria-labelledby="reset-template-title"
                onCancel={(event) => {
                    event.preventDefault();
                    setConfirming(false);
                }}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !resetting) {
                        setConfirming(false);
                    }
                }}
                className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="px-5 py-5">
                    <h2 id="reset-template-title" className="m-0 text-[16px] font-semibold">
                        Reset the whole template?
                    </h2>
                    <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-ink-secondary">
                        Every sequence, the encoder, and the General defaults return to the engine
                        defaults. Existing projects keep their own configuration and are not
                        changed.
                    </p>
                </div>
                <div className="flex justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
                    <Button variant="secondary" onClick={() => setConfirming(false)}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={runReset} disabled={resetting}>
                        Reset everything
                    </Button>
                </div>
            </dialog>
        </main>
    );
}
