/** Project-template reads and writes, including section resets. */
import { useTransport } from "./client";
import { invalidateTemplates } from "./invalidate";
import { queryKeys } from "./keys";
import {
    templatesDefaultPath,
    templatesPath,
    templateDefaultsPath,
    templateDefaultsResetPath,
    templateDefaultsResetSectionPath,
    templateGeneralPath,
    templatePath,
    templateScriptsPath,
} from "./paths";
import {
    EffectiveConfigSchema,
    GeneralDefaultsSchema,
    ProjectTemplateSchema,
    ScriptPluginReportSchema,
    type GeneralDefaults,
} from "@av1ation/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** One template's configuration, resolved against the engine's own defaults. */
export function useTemplateDefaults(templateId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.templateDefaults(templateId),
        queryFn: () => transport.get(templateDefaultsPath(templateId), EffectiveConfigSchema),
        enabled: templateId !== "",
        staleTime: 30_000,
    });
}

/** One template's General defaults (input kind and output mode). */
export function useTemplateGeneral(templateId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.templateGeneral(templateId),
        queryFn: () => transport.get(templateGeneralPath(templateId), GeneralDefaultsSchema),
        enabled: templateId !== "",
        staleTime: 30_000,
    });
}

/** Creates a template seeded from the engine defaults. */
export function useAddProjectTemplate() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (name: string) =>
            transport.post(templatesPath(), { name }, ProjectTemplateSchema),
        onSuccess: () => invalidateTemplates(queryClient),
    });
}

/** Replaces one template's name, configuration, and General section. */
export function useUpdateProjectTemplate() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            id: string;
            name: string;
            config: Record<string, unknown>;
            general: GeneralDefaults;
        }) =>
            transport.putJson(
                templatePath(input.id),
                {
                    name: input.name,
                    config: input.config,
                    general: input.general,
                },
                ProjectTemplateSchema,
            ),
        onSuccess: () => invalidateTemplates(queryClient),
    });
}

/** Removes a template. Existing projects keep the copy they already hold. */
export function useDeleteProjectTemplate() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => transport.delete(templatePath(id)),
        onSuccess: () => invalidateTemplates(queryClient),
    });
}

/** Marks the template a new project copies, or clears the mark with `null`. */
export function useSetDefaultProjectTemplate() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string | null) =>
            transport.putJson(templatesDefaultPath(), { id }, ProjectTemplateSchema.array()),
        onSuccess: () => invalidateTemplates(queryClient),
    });
}

/** Writes one template's General defaults. */
export function useSaveTemplateGeneral(templateId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (general: GeneralDefaults) =>
            transport.putJson(templateGeneralPath(templateId), general, GeneralDefaultsSchema),
        onSuccess: (general) => {
            queryClient.setQueryData(queryKeys.templateGeneral(templateId), general);
            invalidateTemplates(queryClient);
        },
    });
}

/** Writes one template's configuration. Existing projects keep their own copy. */
export function useSaveTemplateDefaults(templateId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (document: unknown) =>
            transport.putJson(templateDefaultsPath(templateId), document, EffectiveConfigSchema),
        onSuccess: (config) => {
            queryClient.setQueryData(queryKeys.templateDefaults(templateId), config);
            invalidateTemplates(queryClient);
        },
    });
}

/** Restores one template's engine configuration to the engine defaults. */
export function useResetProjectTemplate(templateId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () =>
            transport.post(templateDefaultsResetPath(templateId), {}, EffectiveConfigSchema),
        onSuccess: (config) => {
            queryClient.setQueryData(queryKeys.templateDefaults(templateId), config);
            invalidateTemplates(queryClient);
        },
    });
}

/** Restores one template section, leaving every other override in place. */
export function useResetProjectTemplateSection(templateId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (section: string) =>
            transport.post(
                templateDefaultsResetSectionPath(templateId, section),
                {},
                EffectiveConfigSchema,
            ),
        onSuccess: (config) => {
            queryClient.setQueryData(queryKeys.templateDefaults(templateId), config);
            invalidateTemplates(queryClient);
        },
    });
}

/** The VapourSynth plugin problems one template would hit once a project exists. */
export function useTemplateScriptPlugins(templateId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.templateScriptPlugins(templateId),
        queryFn: () => transport.get(templateScriptsPath(templateId), ScriptPluginReportSchema),
        enabled: templateId !== "",
        staleTime: 30_000,
    });
}

/** Applies a saved template's configuration and General section to a project. */
