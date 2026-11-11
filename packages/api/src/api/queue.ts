/** Queue reads, ordering, removal, and the batch runner. */
import { useTransport } from "./client";
import { invalidateVideoQueue } from "./invalidate";
import { queryKeys } from "./keys";
import { queuePath, videosOrderPath, videosPath, videosRemovePath } from "./paths";
import {
    QueueBatchStatusSchema,
    VideoDetailSchema,
    VideoSummarySchema,
    type QueueBatchStatus,
    type VideoCreateRequest,
} from "@av1ation/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

/**
 * The project's live queue batch.
 *
 * Polling is deliberate here and nowhere else: a batch advances inside the service, and
 * its only observable transitions are between videos, not frames. While a batch is
 * inactive the query stops asking, so an idle screen costs nothing.
 */
export function useQueueBatch(projectId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.queueBatch(projectId),
        queryFn: () => transport.get(queuePath(projectId), QueueBatchStatusSchema),
        refetchInterval: (query) =>
            (query.state.data as QueueBatchStatus | undefined)?.active === true ? 1200 : false,
    });
}

/** Start every listed video in order. The service walks the batch, not the screen. */
export function useStartQueueBatch(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (videoIds: readonly string[]) =>
            transport.post(
                queuePath(projectId),
                { video_ids: [...videoIds] },
                QueueBatchStatusSchema,
            ),
        onSuccess: (status) => {
            queryClient.setQueryData(queryKeys.queueBatch(projectId), status);
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoStates(projectId),
            });
        },
    });
}

/** Stop the batch and the run it is waiting on. */
export function useStopQueueBatch(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => transport.delete(queuePath(projectId)),
        onSuccess: () =>
            void queryClient.invalidateQueries({
                queryKey: queryKeys.queueBatch(projectId),
            }),
    });
}

/**
 * Reads the project's queue in server order.
 *
 * The screen-level callers always have an id; the palette asks with an empty one when it is
 * open outside a project. Skipping that request keeps `/api/projects//videos` out of the
 * network log on every page that is not a project.
 */
export function useProjectVideos(projectId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videos(projectId),
        queryFn: () => transport.get(videosPath(projectId), VideoSummarySchema.array()),
        enabled: projectId.length > 0,
        staleTime: 5_000,
    });
}

/** Adds one video to the queue; the server rejects relative paths and missing files. */
export function useAddVideo(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: VideoCreateRequest) =>
            transport.post(videosPath(projectId), input, VideoDetailSchema),
        onSuccess: () => {
            invalidateVideoQueue(queryClient, projectId);
        },
    });
}

/** Replaces the whole queue order; the body must be a permutation of the current queue. */
export function useReorderVideos(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (videoIds: string[]) =>
            transport.patchJson(
                videosOrderPath(projectId),
                { video_ids: videoIds },
                VideoSummarySchema.array(),
            ),
        onSuccess: (videos) => {
            queryClient.setQueryData(queryKeys.videos(projectId), videos);
        },
    });
}

/** Removes several queue entries in one server transaction. Source files are untouched. */
export function useRemoveVideos(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (videoIds: string[]) =>
            transport.post(
                videosRemovePath(projectId),
                { video_ids: videoIds },
                z.array(z.string()),
            ),
        onSuccess: () => {
            invalidateVideoQueue(queryClient, projectId);
        },
    });
}
