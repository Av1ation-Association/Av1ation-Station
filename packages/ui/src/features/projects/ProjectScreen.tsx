import { useRenameProject, useProject } from "@av1ation/api";
import { useParams } from "@tanstack/react-router";
import { Redo2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { ProjectConfigurationSection } from "./ProjectConfigurationSection";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectQueueSection } from "./ProjectQueueSection";
import { ProjectScreenError, ProjectScreenSkeleton } from "./ProjectScreenStates";
import { ProjectTemplatePicker } from "./ProjectTemplatePicker";
import { TopBarActions, TopBarButton } from "../../shared/TopBarActions";
import { useProjectQueue } from "./useProjectQueue";
import { useProjectTemplates } from "./useProjectTemplates";

/** The landing surface for one project: the section grid, then the queue. */
export function ProjectScreen() {
    const { projectId } = useParams({ from: "/projects/$projectId" });
    const project = useProject(projectId);
    const rename = useRenameProject();
    const queue = useProjectQueue(projectId);
    const templates = useProjectTemplates(projectId, queue.projectLocked);

    const renameProject = async (name: string): Promise<boolean> => {
        try {
            await rename.mutateAsync({ id: projectId, name });
            toast.success("Project renamed");
            return true;
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "The project could not be renamed.",
            );
            return false;
        }
    };

    if (project.isPending) {
        return <ProjectScreenSkeleton />;
    }

    if (project.isError) {
        return (
            <ProjectScreenError
                message={
                    project.error instanceof Error
                        ? project.error.message
                        : "The service did not respond."
                }
                onRetry={() => void project.refetch()}
            />
        );
    }

    return (
        <main id="main" className="page py-6 sm:py-8">
            {/* The page's history belongs in the shell's action bar, where every other
                screen keeps its undo and redo, not in a second row above the cards. */}
            <TopBarActions>
                <TopBarButton
                    label="Undo"
                    hint="Undo the last template application"
                    icon={<Undo2 className="h-3.5 w-3.5" />}
                    disabled={
                        templates.templateUndo === null || templates.restoreDefaults.isPending
                    }
                    onClick={templates.undoTemplate}
                />
                <TopBarButton
                    label="Redo"
                    hint="Redo the last template application"
                    icon={<Redo2 className="h-3.5 w-3.5" />}
                    disabled={
                        templates.templateRedo === null || templates.restoreDefaults.isPending
                    }
                    onClick={templates.redoTemplate}
                />
            </TopBarActions>

            <ProjectHeader
                name={project.data?.name ?? "Project"}
                onRename={renameProject}
                projectLocked={queue.projectLocked}
            >
                <ProjectTemplatePicker
                    templates={templates.templates}
                    filteredTemplates={templates.filteredTemplates}
                    query={templates.templateQuery}
                    onQueryChange={templates.setTemplateQuery}
                    open={templates.templateOpen}
                    onOpenChange={templates.setTemplateOpen}
                    disabled={
                        queue.projectLocked ||
                        templates.templates.length === 0 ||
                        templates.applyTemplate.isPending
                    }
                    pending={templates.applyTemplate.isPending}
                    defaultTemplateId={templates.defaultTemplateId}
                    onApply={(template) =>
                        templates.applySelectedTemplate(template.id, template.name)
                    }
                />
            </ProjectHeader>

            <div className="grid gap-6 3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] 3xl:items-start">
                <ProjectConfigurationSection projectId={projectId} locked={queue.projectLocked} />
                <ProjectQueueSection queue={queue} general={project.data?.general} />
            </div>
        </main>
    );
}
