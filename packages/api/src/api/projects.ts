/** Project records, template application, script plugins, and deletion. */
import { useTransport } from "./client";
import { invalidateProjectInputs } from "./invalidate";
import { queryKeys } from "./keys";
import {
    projectDefaultsPath,
    projectGeneralPath,
    projectPath,
    projectsPath,
    projectScriptsPath,
    projectTemplatePath,
} from "./paths";
import {
    ProjectSchema,
    ProjectSummarySchema,
    ProjectTemplateAppliedSchema,
    ScriptPluginReportSchema,
    type GeneralDefaults,
    type ProjectDefaultsState,
} from "@av1ation/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useApplyProjectTemplate(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (templateId: string) =>
            transport.post(
                projectTemplatePath(projectId),
                { template_id: templateId },
                ProjectTemplateAppliedSchema,
            ),
        onSuccess: (result) => {
            queryClient.setQueryData(queryKeys.project(projectId), result.project);
            invalidateProjectInputs(queryClient, projectId);
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

/** Restores a project configuration and General snapshot, used by template undo/redo. */
export function useRestoreProjectDefaults(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (state: ProjectDefaultsState) =>
            transport.putJson(projectDefaultsPath(projectId), state, ProjectSchema),
        onSuccess: (project) => {
            queryClient.setQueryData(queryKeys.project(projectId), project);
            invalidateProjectInputs(queryClient, projectId);
        },
    });
}

/** Reads the Home project list; Home sorts it by last access. */
export function useProjects() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.projects,
        queryFn: () => transport.get(projectsPath(), ProjectSummarySchema.array()),
        staleTime: 10_000,
    });
}

/** Creates a project with the engine's default configuration copied in. */
export function useCreateProject() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => transport.post(projectsPath(), { name }, ProjectSchema),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

/** Renames one project; the service validates the name like the create request. */
export function useRenameProject() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) =>
            transport.patchJson(projectPath(id), { name }, ProjectSchema),
        onSuccess: (project) => {
            queryClient.setQueryData(queryKeys.project(project.id), project);
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

/** Replaces the General defaults for videos added from now on. */
export function useUpdateGeneral(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (general: GeneralDefaults) =>
            transport.putJson(projectGeneralPath(projectId), general, ProjectSchema),
        onSuccess: (project) => {
            queryClient.setQueryData(queryKeys.project(projectId), project);
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.projectScriptPlugins(projectId),
            });
        },
    });
}

/** Reads one project for the project screen and its breadcrumb. */
export function useProject(projectId: string, enabled = true) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.project(projectId),
        queryFn: () => transport.get(projectPath(projectId), ProjectSchema),
        staleTime: 10_000,
        enabled: enabled && projectId !== "",
    });
}

/**
 * The plugin problems a project's own inputs would hit right now.
 *
 * The per-video preflight answers the same question for a queue entry; this endpoint is
 * what lets Configuration warn before any video exists. The query key is invalidated by
 * both the project General save and every sequence save, so an edited script cannot keep an
 * old warning on screen.
 */
export function useProjectScriptPlugins(projectId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.projectScriptPlugins(projectId),
        queryFn: () => transport.get(projectScriptsPath(projectId), ScriptPluginReportSchema),
        staleTime: 5_000,
    });
}

/** Deletes a project's manifest, logs, and retained chunks; source media is untouched. */
export function useDeleteProject() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => transport.delete(projectPath(id)),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}
