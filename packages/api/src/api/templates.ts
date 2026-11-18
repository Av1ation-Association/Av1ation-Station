/** Project-template reads and writes, including section resets. */
import { useTransport } from "./client";
import { invalidateTemplates } from "./invalidate";
import { queryKeys } from "./keys";
import {
    templatesDefaultPath,
    templatesImportPath,
    templatesPath,
    templateDefaultsPath,
    templateDefaultsResetPath,
    templateDefaultsResetSectionPath,
    templateExportPath,
    templateGeneralPath,
    templatePath,
    templateScriptsPath,
} from "./paths";
import {
    EffectiveConfigSchema,
    GeneralDefaultsSchema,
    ProjectTemplateExportSchema,
    ProjectTemplateImportResultSchema,
    ProjectTemplateSchema,
    ScriptPluginReportSchema,
    type GeneralDefaults,
    type ProjectTemplate,
} from "@av1ation/contracts";
import { ApiError } from "../transport/types";
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

/** The most template files one picker session accepts. */
export const MAX_TEMPLATE_IMPORT_FILES = 10;

/** One file chosen for import; the reader runs only after the batch limit is checked. */
export interface TemplateImportSource {
    readonly name: string;
    readonly text: () => Promise<string>;
}

/** One file that could not be imported, with the message shown beside its name. */
export interface TemplateImportFailure {
    readonly filename: string;
    readonly message: string;
}

/** The per-file result of one import batch. */
export interface TemplateImportBatch {
    readonly imported: ProjectTemplate[];
    readonly failures: TemplateImportFailure[];
}

/** The files and progress callback one batch import takes. */
export interface TemplateImportRequest {
    readonly files: readonly TemplateImportSource[];
    readonly onProgress?: ((current: number, total: number) => void) | undefined;
}

/**
 * Import one or more exported template files, continuing after a per-file failure.
 *
 * The files are read sequentially so the progress line is truthful and one malformed file
 * cannot reject the whole batch. Invalid JSON and a service refusal are both captured per
 * file; only an unexpected failure of the mutation itself escapes.
 */
export function useImportProjectTemplates() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            files,
            onProgress,
        }: TemplateImportRequest): Promise<TemplateImportBatch> => {
            if (files.length > MAX_TEMPLATE_IMPORT_FILES) {
                throw new Error(
                    `Choose at most ${MAX_TEMPLATE_IMPORT_FILES} template files at a time.`,
                );
            }
            const imported: ProjectTemplate[] = [];
            const failures: TemplateImportFailure[] = [];
            for (const [index, file] of files.entries()) {
                onProgress?.(index + 1, files.length);
                if (!file.name.toLowerCase().endsWith(".json")) {
                    failures.push({
                        filename: file.name,
                        message: "Only .json template files can be imported.",
                    });
                    continue;
                }
                try {
                    let body: unknown;
                    try {
                        body = JSON.parse(await file.text());
                    } catch {
                        throw new Error("This file is not valid JSON.");
                    }
                    const result = await transport.post(
                        templatesImportPath(),
                        body,
                        ProjectTemplateImportResultSchema,
                    );
                    imported.push(result.template);
                } catch (error) {
                    failures.push({ filename: file.name, message: templateImportMessage(error) });
                }
            }
            return { imported, failures };
        },
        onSuccess: () => invalidateTemplates(queryClient),
    });
}

/** Export one template as the portable file the manager downloads. */
export function useExportProjectTemplate() {
    const transport = useTransport();
    return useMutation({
        mutationFn: (id: string) =>
            transport.get(templateExportPath(id), ProjectTemplateExportSchema),
    });
}

function templateImportMessage(error: unknown): string {
    if (error instanceof ApiError) {
        return error.body?.message ?? error.message;
    }
    return error instanceof Error ? error.message : "The file could not be imported.";
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
