/** Starting and cancelling a video's encode or one sequence. */
import { useTransport } from "./client";
import { invalidateVideoStatePrefix } from "./invalidate";
import { queryKeys } from "./keys";
import { videoEncodePath, videoRunPath } from "./paths";
import { RunStartedSchema, type VideoState } from "@av1ation/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Starts the full sequence chain for one video; a second run is refused with `409`. */
export function useStartVideoEncode(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (videoId: string) =>
            transport.post(videoEncodePath(projectId, videoId), {}, RunStartedSchema),
        onSuccess: (started, videoId) => {
            // The event arrives milliseconds later; seeding the run id closes the window in
            // which the page still looks idle and a second Run click reaches the server.
            queryClient.setQueryData<VideoState>(
                queryKeys.videoState(projectId, videoId),
                (state) =>
                    state === undefined
                        ? state
                        : { ...state, active: true, run_id: started.run_id },
            );
            invalidateVideoStatePrefix(queryClient, projectId);
            void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

/**
 * Runs exactly one sequence, for the empty Scenes tab's "Run Scene detection" action.
 *
 * The server still checks prerequisites and the singleton lock; this mutation only seeds
 * the cached state so the button cannot be clicked twice before the start event arrives.
 */
export function useStartVideoSequence(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ videoId, sequence }: { videoId: string; sequence: string }) =>
            transport.post(videoRunPath(projectId, videoId), { sequence }, RunStartedSchema),
        onSuccess: (started, variables) => {
            queryClient.setQueryData<VideoState>(
                queryKeys.videoState(projectId, variables.videoId),
                (state) =>
                    state === undefined
                        ? state
                        : { ...state, active: true, run_id: started.run_id },
            );
            invalidateVideoStatePrefix(queryClient, projectId);
        },
    });
}

/** Cancels the active encode of one video; the lock is released by its terminal event. */
export function useCancelVideoEncode(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (videoId: string) => transport.delete(videoEncodePath(projectId, videoId)),
        onSuccess: () => {
            invalidateVideoStatePrefix(queryClient, projectId);
        },
    });
}
