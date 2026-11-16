/** Health, updates, settings, host capabilities, LAN, preflight, and storage. */
import { useTransport } from "./client";
import { invalidateTooling } from "./invalidate";
import { queryKeys } from "./keys";
import {
    diagnosticsBundlePath,
    healthPath,
    lanDisablePath,
    lanEnablePath,
    lanPath,
    lanRotatePath,
    lanSessionRevokePath,
    preflightCustomItemPath,
    preflightCustomPath,
    preflightRefreshPath,
    settingsPath,
    settingsPythonInterpreterPath,
    settingsSceneModelPath,
    settingsToolSourcePath,
    storagePath,
    toolchainPath,
    updatePath,
} from "./paths";
import {
    AppInfoSchema,
    AppSettingsSchema,
    DiagnosticsBundleSchema,
    LanStatusSchema,
    PreflightCheckSchema,
    PreflightReportSchema,
    StorageOverviewSchema,
    ToolchainInfoSchema,
    UpdateStatusSchema,
    type AppInfo,
    type AppSettingsUpdate,
    type CustomToolRequest,
    type LanStatus,
} from "@av1ation/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Reads application and engine metadata for the About screen. */
export function useHealth() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.health,
        queryFn: () => transport.get(healthPath(), AppInfoSchema),
        staleTime: 30_000,
        retry: 1,
    });
}

/** The bundled components the binary was built from; the lock changes only with a build. */
export function useToolchain() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.toolchain,
        queryFn: () => transport.get(toolchainPath(), ToolchainInfoSchema),
        staleTime: Number.POSITIVE_INFINITY,
        retry: 1,
    });
}

/**
 * The newest published release.
 *
 * It is disabled until About asks: a check is a user action, not a page load, and a machine
 * that is offline should not spend the first paint on a request that will fail.
 */
export function useUpdateCheck() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.updateCheck,
        queryFn: () => transport.get(updatePath(), UpdateStatusSchema),
        enabled: false,
        retry: false,
        staleTime: 0,
        gcTime: 0,
    });
}

/** Build the redacted support bundle; nothing leaves the machine until the user saves it. */
export function useDiagnosticsBundle() {
    const transport = useTransport();
    return useMutation({
        mutationFn: (input: { projectIds: readonly string[]; logs: boolean }) => {
            const query = new URLSearchParams();
            if (input.projectIds.length > 0) {
                query.set("projects", input.projectIds.join(","));
            }
            query.set("logs", String(input.logs));
            return transport.get(
                `${diagnosticsBundlePath()}?${query.toString()}`,
                DiagnosticsBundleSchema,
            );
        },
    });
}

/** Interrogates a user-provided executable and refreshes the cached inventory. */
export function useAddCustomTool() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: CustomToolRequest) =>
            transport.post(preflightCustomPath(), input, PreflightCheckSchema),
        onSuccess: () => invalidateTooling(queryClient),
    });
}

/** Removes a user-provided executable and restores the detected row beneath it. */
export function useRemoveCustomTool() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => transport.delete(preflightCustomItemPath(id)),
        onSuccess: () => invalidateTooling(queryClient),
    });
}

/** Reads the shared settings document; a caller may wait until its screen needs it. */
export function useSettings(enabled = true) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.settings,
        queryFn: () => transport.get(settingsPath(), AppSettingsSchema),
        staleTime: 30_000,
        enabled,
    });
}

/** Writes only the changed settings fields; custom tools keep their probe endpoint. */
export function useUpdateSettings() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: Partial<AppSettingsUpdate>) =>
            transport.patchJson(settingsPath(), input, AppSettingsSchema),
        onSuccess: (settings) => {
            queryClient.setQueryData(queryKeys.settings, settings);
            void queryClient.invalidateQueries({ queryKey: queryKeys.storage });
        },
    });
}

/**
 * Writes the machine-level TransNetV2 model path. `null` clears the override and restores
 * the engine's own search order. The path is validated by the service before it is stored.
 */
export function useSaveSceneModel() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (path: string | null) =>
            transport.putJson(settingsSceneModelPath(), { path }, AppSettingsSchema),
        onSuccess: (settings) => {
            queryClient.setQueryData(queryKeys.settings, settings);
            // The scene-model row in the dependency inventory describes the file the
            // engine would load, so the new path must be reflected there immediately.
            void queryClient.invalidateQueries({ queryKey: queryKeys.health });
        },
    });
}

/**
 * Writes the Python interpreter the script editor's language server analyses. `null`
 * clears it and returns the editor to the interpreter the machine resolves. The service
 * validates the path before it is stored, and both the inventory and the picker are
 * refetched because each names the interpreter and the version it reported.
 */
export function useSavePythonInterpreter() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (path: string | null) =>
            transport.putJson(settingsPythonInterpreterPath(), { path }, AppSettingsSchema),
        onSuccess: (settings) => {
            queryClient.setQueryData(queryKeys.settings, settings);
            void queryClient.invalidateQueries({
                queryKey: queryKeys.languageServer,
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.pythonInterpreters,
            });
        },
    });
}

/**
 * Chooses the release bundle or the machine's installation for one capability.
 *
 * The setting is written immediately. Encoder, FFmpeg and mkvmerge choices apply on the next
 * use; VapourSynth and metrics apply on the next start, because their native libraries
 * initialise once per process. The Settings row compares the saved choice with the provider
 * the preflight inventory reports to show that restart.
 */
export function useSaveToolSource() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; source: "bundled" | "system" | null }) =>
            transport.putJson(
                settingsToolSourcePath(),
                { id: input.id, source: input.source },
                AppSettingsSchema,
            ),
        onSuccess: (settings) => {
            queryClient.setQueryData(queryKeys.settings, settings);
            // The selected provider is part of the preflight inventory. Executable rows
            // change immediately; VapourSynth and metric rows keep the startup source until
            // the restart the row asks for.
            void queryClient.invalidateQueries({ queryKey: queryKeys.health });
        },
    });
}

/** The opt-in network listener, available from the desktop loopback host. */
export function useLanStatus() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.lan,
        queryFn: () => transport.get(lanPath(), LanStatusSchema),
        staleTime: 5_000,
    });
}

function useLanMutation(path: () => string, onSuccess?: (status: LanStatus) => void) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => transport.post(path(), {}, LanStatusSchema),
        onSuccess: (status) => {
            queryClient.setQueryData(queryKeys.lan, status);
            onSuccess?.(status);
        },
    });
}

/** Bind the LAN listener and issue its first token. */
export function useEnableLan() {
    return useLanMutation(lanEnablePath);
}

/** Stop the LAN listener; the loopback host is unaffected. */
export function useDisableLan() {
    return useLanMutation(lanDisablePath);
}

/** Issue another pairing token without invalidating any existing browser. */
export function useRotateLanToken() {
    return useLanMutation(lanRotatePath);
}

/** Revoke one paired browser; every other token stays valid. */
export function useRevokeLanSession() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (sessionId: string) =>
            transport.post(lanSessionRevokePath(sessionId), {}, LanStatusSchema),
        onSuccess: (status) => {
            queryClient.setQueryData(queryKeys.lan, status);
        },
    });
}

/** Re-runs the engine preflight and updates the cached health response. */
export function useRefreshPreflight() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => transport.post(preflightRefreshPath(), {}, PreflightReportSchema),
        onSuccess: (preflight) => {
            queryClient.setQueryData<AppInfo>(queryKeys.health, (health) =>
                health === undefined ? health : { ...health, preflight },
            );
        },
    });
}

/** Where scratch work lives and what is retained, measured on every read. */
export function useStorageOverview() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.storage,
        queryFn: () => transport.get(storagePath(), StorageOverviewSchema),
        staleTime: 5_000,
    });
}
