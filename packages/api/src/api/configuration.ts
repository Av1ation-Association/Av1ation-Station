/** Generated schemas, scripts, sequence overrides, and effective config. */
import { useTransport } from "./client";
import { invalidateProjectChecks, invalidateVideoOverrides } from "./invalidate";
import { queryKeys } from "./keys";
import {
    configFiltersPath,
    configSchemaPath,
    configScriptGuidePath,
    configScriptsValidatePath,
    editorInterpretersPath,
    editorLanguageServerPath,
    projectConfigPath,
    scriptMaterialisePath,
    videoConfigPath,
    videoOverridesPath,
    videoProbePath,
} from "./paths";
import {
    ConfigOverridesSchema,
    EffectiveConfigSchema,
    FilterSchemasSchema,
    LanguageServerInfoSchema,
    PythonInterpretersSchema,
    ScriptCheckSchema,
    ScriptGuideSchema,
    ScriptMaterialisedSchema,
    VideoProbeSchema,
    type ConfigOverrides,
    type ScriptMaterialiseRequest,
} from "@av1ation/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

/** The engine-generated JSON Schemas the configuration editors render. */
export interface ConfigSchemas {
    encoder: Record<string, unknown>;
    sequences: Record<string, unknown>;
}

const ConfigSchemasSchema = z.object({
    encoder: z.record(z.string(), z.unknown()),
    sequences: z.record(z.string(), z.unknown()),
});

/** Reads the engine-generated schemas for the encoder and sequence documents. */
export function useConfigSchemas() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.configSchemas,
        queryFn: () => transport.get(configSchemaPath(), ConfigSchemasSchema),
        staleTime: Infinity,
    });
}

/**
 * Reads the engine's typed input-filter schemas. The filter forms are generated from these,
 * so a filter the pinned engine adds appears without a hand-written field list.
 */
export function useFilterSchemas() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.filterSchemas,
        queryFn: () => transport.get(configFiltersPath(), FilterSchemasSchema),
        staleTime: Infinity,
    });
}

/**
 * The generated `condor_data` module's stub, template, and reserved variables.
 *
 * The editor completes against this stub, and the service evaluates the same module when it
 * checks a script, so a name offered here is a name that exists at run time.
 */
export function useScriptGuide() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.scriptGuide,
        queryFn: () => transport.get(configScriptGuidePath(), ScriptGuideSchema),
        staleTime: Infinity,
    });
}

/**
 * The Python language server this machine can run, for the script editor.
 *
 * The answer is stable for the life of a session: installing a server is picked up on the
 * next launch, not by a poll. A host without a bridge (the demo) reports unavailable, and
 * the editor keeps its bundled completion.
 */
export function useLanguageServer() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.languageServer,
        queryFn: () => transport.get(editorLanguageServerPath(), LanguageServerInfoSchema),
        staleTime: Infinity,
        retry: false,
    });
}

/**
 * The Python interpreters the Settings picker can offer, the saved setting first.
 *
 * Discovery starts each candidate to read its version, so the answer is refetched whenever
 * the setting changes; a Python installed after the app started shows up on the next launch.
 */
export function usePythonInterpreters() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.pythonInterpreters,
        queryFn: () => transport.get(editorInterpretersPath(), PythonInterpretersSchema),
        staleTime: Infinity,
        retry: false,
    });
}

/**
 * Evaluates one script before it is saved.
 *
 * A script only exists as Python the engine runs, so this asks the service to run it and
 * describe the clip rather than guessing from the text. The source path is the video the
 * page is editing: a script that opens `cd.video_path` needs that file to evaluate at all.
 */
export function useValidateScript() {
    const transport = useTransport();
    return useMutation({
        mutationFn: ({ script, videoPath }: { script: string; videoPath?: string }) =>
            transport.post(
                configScriptsValidatePath(),
                {
                    script,
                    ...(videoPath === undefined ? {} : { video_path: videoPath }),
                },
                ScriptCheckSchema,
            ),
    });
}

/**
 * Builds a standalone `.vpy` from the draft script.
 *
 * A script is not the whole program a run evaluates: the generated `condor_data` module and
 * the `condor_*` values are part of its context. Asking the service for the text keeps that
 * module and the scene table in one place, so an export opened in `vspipe` sees exactly
 * what the editor sees.
 */
export function useMaterialiseScript() {
    const transport = useTransport();
    return useMutation({
        mutationFn: (request: ScriptMaterialiseRequest) =>
            transport.post(scriptMaterialisePath(), request, ScriptMaterialisedSchema),
    });
}

/** Replaces the whole project configuration with a validated document. */
export function useSaveProjectConfig(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (document: Record<string, unknown>) =>
            transport.putJson(projectConfigPath(projectId), document, EffectiveConfigSchema),
        onSuccess: (config) => {
            queryClient.setQueryData(queryKeys.projectConfig(projectId), config);
            // Every video inheriting the changed sequence input needs a fresh script scan.
            invalidateProjectChecks(queryClient, projectId);
        },
    });
}

/** Reads the project's effective configuration with per-leaf provenance. */
export function useProjectConfig(projectId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.projectConfig(projectId),
        queryFn: () => transport.get(projectConfigPath(projectId), EffectiveConfigSchema),
        staleTime: 10_000,
    });
}

/**
 * Probes one input document, for a sequence override that decodes something else.
 *
 * The result is cached by the exact document, so switching between two overrides does not
 * reopen a decoder whose answer is already known. `enabled` is false for a project document:
 * it names no source, and only a queued video can answer what it decodes.
 */
export function useProbeInput(projectId: string, videoId: string, input: unknown, enabled = true) {
    const transport = useTransport();
    const key = JSON.stringify(input ?? null);
    return useQuery({
        queryKey: queryKeys.videoInputProbe(projectId, videoId, key),
        queryFn: () =>
            transport.post(
                videoProbePath(projectId, videoId),
                { input: input ?? null },
                VideoProbeSchema,
            ),
        enabled,
        retry: false,
        staleTime: 60_000,
    });
}

/** The raw sparse overrides, so a section save keeps fields it did not show. */
export function useVideoOverrides(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoOverrides(projectId, videoId),
        queryFn: () => transport.get(videoOverridesPath(projectId, videoId), ConfigOverridesSchema),
        staleTime: 5_000,
    });
}

/** Replaces every override in one write; a missing path means "inherit the project". */
export function useSaveVideoOverrides(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (overrides: ConfigOverrides) =>
            transport.putJson(
                videoOverridesPath(projectId, videoId),
                overrides,
                EffectiveConfigSchema,
            ),
        onSuccess: (config) => {
            queryClient.setQueryData(queryKeys.videoConfig(projectId, videoId), config);
            // A video-level encoder changes every scene that inherits it, and a sequence
            // input can introduce or remove a script, so every derivation moves.
            invalidateVideoOverrides(queryClient, projectId, videoId);
        },
    });
}

/** Drops every override, so each section inherits the project again. */
export function useResetVideoOverrides(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => transport.delete(videoOverridesPath(projectId, videoId)),
        onSuccess: () => {
            invalidateVideoOverrides(queryClient, projectId, videoId);
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoConfig(projectId, videoId),
            });
        },
    });
}

/** The effective configuration for one video, with per-leaf provenance. */
export function useVideoConfig(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoConfig(projectId, videoId),
        queryFn: () => transport.get(videoConfigPath(projectId, videoId), EffectiveConfigSchema),
        staleTime: 10_000,
    });
}
