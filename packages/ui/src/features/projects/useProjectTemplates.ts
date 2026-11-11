import { useMemo, useState } from "react";

import { useApplyProjectTemplate, useRestoreProjectDefaults, useSettings } from "@av1ation/api";
import type { ProjectDefaultsState, ProjectTemplate } from "@av1ation/contracts";
import { toast } from "sonner";

import { isEditableTarget, useShortcut } from "../../shared/shortcuts";

// Stable fallback keeps the filtered memo from recomputing while settings are loading.
const NO_TEMPLATES: ProjectTemplate[] = [];

/**
 * The project's template application history.
 *
 * Applying a template replaces the project's defaults, so it is a server write with a
 * local undo/redo pair. This controller owns that pair and the searchable picker state;
 * the header only renders the trigger and the choices.
 */
export function useProjectTemplates(projectId: string, projectLocked: boolean) {
    const settings = useSettings();
    const applyTemplate = useApplyProjectTemplate(projectId);
    const restoreDefaults = useRestoreProjectDefaults(projectId);
    const [templateOpen, setTemplateOpen] = useState(false);
    const [templateQuery, setTemplateQuery] = useState("");
    const [templateUndo, setTemplateUndo] = useState<{
        before: ProjectDefaultsState;
        after: ProjectDefaultsState;
    } | null>(null);
    const [templateRedo, setTemplateRedo] = useState<{
        before: ProjectDefaultsState;
        after: ProjectDefaultsState;
    } | null>(null);

    const templates = settings.data?.project_templates ?? NO_TEMPLATES;
    const filteredTemplates = useMemo(() => {
        const needle = templateQuery.trim().toLowerCase();
        return needle === ""
            ? templates
            : templates.filter((template) => template.name.toLowerCase().includes(needle));
    }, [templates, templateQuery]);

    // Applying a template is a server write the queue can undo; the same chords as a draft
    // drive it, and a focused field keeps its own native undo.
    useShortcut("undo", undoTemplate, {
        when: (event) => !isEditableTarget(event.target),
    });
    useShortcut("redo", redoTemplate, {
        when: (event) => !isEditableTarget(event.target),
    });

    function applySelectedTemplate(templateId: string, name: string) {
        if (projectLocked || applyTemplate.isPending) {
            return;
        }
        setTemplateOpen(false);
        setTemplateQuery("");
        applyTemplate.mutate(templateId, {
            onSuccess: (result) => {
                setTemplateUndo({
                    before: result.previous,
                    after: result.applied,
                });
                setTemplateRedo(null);
                toast.success(`Applied “${name}” to this project`, {
                    action: {
                        label: "Undo",
                        onClick: () => undoTemplate(),
                    },
                });
            },
            onError: (error) =>
                toast.error(
                    error instanceof Error
                        ? `The template could not be applied: ${error.message}`
                        : "The template could not be applied.",
                ),
        });
    }

    function undoTemplate() {
        if (templateUndo === null || restoreDefaults.isPending) {
            return;
        }
        const entry = templateUndo;
        restoreDefaults.mutate(entry.before, {
            onSuccess: () => {
                setTemplateUndo(null);
                setTemplateRedo(entry);
                toast.success("Template application undone");
            },
            onError: (error) =>
                toast.error(
                    error instanceof Error
                        ? `Undo failed: ${error.message}`
                        : "The template application could not be undone.",
                ),
        });
    }

    function redoTemplate() {
        if (templateRedo === null || restoreDefaults.isPending) {
            return;
        }
        const entry = templateRedo;
        restoreDefaults.mutate(entry.after, {
            onSuccess: () => {
                setTemplateRedo(null);
                setTemplateUndo(entry);
                toast.success("Template application redone");
            },
            onError: (error) =>
                toast.error(
                    error instanceof Error
                        ? `Redo failed: ${error.message}`
                        : "The template application could not be redone.",
                ),
        });
    }

    return {
        settings,
        applyTemplate,
        restoreDefaults,
        templates,
        filteredTemplates,
        templateOpen,
        setTemplateOpen,
        templateQuery,
        setTemplateQuery,
        defaultTemplateId: settings.data?.default_project_template_id ?? undefined,
        templateUndo,
        templateRedo,
        applySelectedTemplate,
        undoTemplate,
        redoTemplate,
    };
}

export type ProjectTemplatesController = ReturnType<typeof useProjectTemplates>;
