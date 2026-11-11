/** The invalidation stacks shared by more than one mutation. */
import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "./keys";

function invalidate(queryClient: QueryClient, queryKey: readonly unknown[]) {
    void queryClient.invalidateQueries({ queryKey });
}

/** A tool probe changes the inventory, its settings, and the catalogue it feeds. */
export function invalidateTooling(queryClient: QueryClient) {
    invalidate(queryClient, queryKeys.health);
    invalidate(queryClient, queryKeys.settings);
    invalidate(queryClient, queryKeys.encoders);
}

/** Every encoder write changes the catalogue and the settings document that records it. */
export function invalidateEncoders(queryClient: QueryClient) {
    invalidate(queryClient, queryKeys.encoders);
    invalidate(queryClient, queryKeys.settings);
}

/** Template writes change the settings list and every template-derived read. */
export function invalidateTemplates(queryClient: QueryClient) {
    invalidate(queryClient, queryKeys.settings);
    invalidate(queryClient, queryKeys.templateDefaultsAll);
    invalidate(queryClient, queryKeys.templateGeneralAll);
    invalidate(queryClient, queryKeys.templateScriptPluginsAll);
}

/** A project input change moves the effective config and every derived check. */
export function invalidateProjectInputs(queryClient: QueryClient, projectId: string) {
    invalidate(queryClient, queryKeys.projectConfig(projectId));
    invalidateProjectChecks(queryClient, projectId);
}

/** The two project-wide checks that read the inputs, without the configuration itself. */
export function invalidateProjectChecks(queryClient: QueryClient, projectId: string) {
    invalidate(queryClient, queryKeys.videoValidations(projectId));
    invalidate(queryClient, queryKeys.projectScriptPlugins(projectId));
}

/** Adding or removing queue rows moves the list, every state, and the project counts. */
export function invalidateVideoQueue(queryClient: QueryClient, projectId: string) {
    invalidate(queryClient, queryKeys.videos(projectId));
    invalidate(queryClient, queryKeys.videoStatePrefix(projectId));
    invalidate(queryClient, queryKeys.projects);
}

/** Structural scene edits move the table, state, retained bytes, and decode probe. */
export function invalidateVideoEdits(queryClient: QueryClient, projectId: string, videoId: string) {
    invalidate(queryClient, queryKeys.videoScenes(projectId, videoId));
    invalidate(queryClient, queryKeys.videoState(projectId, videoId));
    invalidate(queryClient, queryKeys.videoStorage(projectId, videoId));
    invalidate(queryClient, queryKeys.videoProbe(projectId, videoId));
}

/** Override writes change the sparse document, its effective config, and every derivation. */
export function invalidateVideoOverrides(
    queryClient: QueryClient,
    projectId: string,
    videoId: string,
) {
    invalidate(queryClient, queryKeys.videoOverrides(projectId, videoId));
    invalidate(queryClient, queryKeys.videoState(projectId, videoId));
    invalidate(queryClient, queryKeys.videoScenes(projectId, videoId));
    invalidate(queryClient, queryKeys.videoValidation(projectId, videoId));
}

/** General edits move the queue row, its derived state, probe, and validation. */
export function invalidateVideoGeneral(
    queryClient: QueryClient,
    projectId: string,
    videoId: string,
) {
    invalidate(queryClient, queryKeys.video(projectId, videoId));
    invalidate(queryClient, queryKeys.videos(projectId));
    invalidate(queryClient, queryKeys.videoState(projectId, videoId));
    invalidate(queryClient, queryKeys.videoProbe(projectId, videoId));
    invalidate(queryClient, queryKeys.videoValidation(projectId, videoId));
}

/** Deleting retained chunks moves storage, the state, the scene markers, and the queue row. */
export function invalidateDeletedChunks(
    queryClient: QueryClient,
    projectId: string,
    videoId: string,
) {
    invalidate(queryClient, queryKeys.videoStorage(projectId, videoId));
    invalidate(queryClient, queryKeys.videoState(projectId, videoId));
    invalidate(queryClient, queryKeys.videoScenes(projectId, videoId));
    invalidate(queryClient, queryKeys.videos(projectId));
    invalidate(queryClient, queryKeys.storage);
}

/** A run start or cancel changes every visible video state in the project. */
export function invalidateVideoStatePrefix(queryClient: QueryClient, projectId: string) {
    invalidate(queryClient, queryKeys.videoStatePrefix(projectId));
}
