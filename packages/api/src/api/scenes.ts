/** Scene tables, thumbnails, encoders, structural edits, and checkpoints. */
import { liveNoiseKey, withLiveNoise } from "../live-noise";
import { liveQualityKey, withLiveQuality } from "../live-quality";
import { thumbnailIndexForFrame, thumbnailPath } from "../thumbnails";
import { useTransport } from "./client";
import { invalidateVideoEdits } from "./invalidate";
import { queryKeys } from "./keys";
import {
    videoSceneEncoderPath,
    videoScenePath,
    videoSceneSequenceDataPath,
    videoScenesAddPath,
    videoScenesEncodersPath,
    videoScenesMergePath,
    videoScenesPath,
    videoScenesResetPath,
    videoScenesSplitPath,
    videoScenesUndoPath,
    videoSequenceResetPath,
    videoThumbnailsPath,
} from "./paths";
import {
    SceneEncoderDetailSchema,
    SceneListSchema,
    ThumbnailManifestSchema,
    type SceneDataRequest,
    type SceneEncoderRequest,
    type SceneRangeRequest,
    type ThumbnailManifest,
} from "@av1ation/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";

/**
 * The scene table the rail and timeline render.
 *
 * Derived server-side from the engine checkpoint and the retained chunks. A checkpoint
 * event carries the scene it appended, so the encode writer splices that row into this
 * cache; a transition refreshes the full table for chunk counts and the final state.
 */
export function useVideoScenes(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoScenes(projectId, videoId),
        queryFn: async () =>
            withLiveNoise(
                withLiveQuality(
                    await transport.get(videoScenesPath(projectId, videoId), SceneListSchema),
                    liveQualityKey(projectId, videoId),
                ),
                liveNoiseKey(projectId, videoId),
            ),
        staleTime: 2_000,
    });
}

/**
 * The keyframe grid for one video.
 *
 * The first read starts the service's single extraction; while it says `building` the
 * query polls the manifest so indices appear as their files are written. Once it is ready
 * or impossible the poll stops, because neither state changes without another build.
 */
export function useVideoThumbnails(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoThumbnails(projectId, videoId),
        queryFn: () =>
            transport.get(videoThumbnailsPath(projectId, videoId), ThumbnailManifestSchema),
        staleTime: 500,
        refetchInterval: (query) =>
            (query.state.data as ThumbnailManifest | undefined)?.state === "building" ? 750 : false,
        retry: false,
    });
}

/** A stable placeholder while a video has no thumbnail grid to ask for. */
const NO_SCENE_THUMBNAIL = () => null;

/**
 * The one thumbnail lookup the rail and the timeline both call.
 *
 * Passing a function rather than a manifest to each surface keeps the arithmetic, the
 * image URL, and therefore the actual file identical on both. The transport decides whether
 * a media URL exists at all, so a host that cannot carry a credential gets placeholders
 * instead of a broken image.
 */
export function useSceneThumbnail(projectId: string, videoId: string, frameRate: number | null) {
    const transport = useTransport();
    const thumbnails = useVideoThumbnails(projectId, videoId);
    return useMemo(() => {
        const manifest = thumbnails.data;
        const mediaUrl = transport.mediaUrl;
        if (manifest === undefined || mediaUrl === undefined) {
            return NO_SCENE_THUMBNAIL;
        }
        return (startFrame: number) => {
            const index = thumbnailIndexForFrame(startFrame, frameRate, manifest);
            return index === null
                ? null
                : mediaUrl(thumbnailPath(projectId, videoId, index, manifest.revision));
        };
    }, [thumbnails.data, transport, frameRate, projectId, videoId]);
}

/**
 * One scene's complete encoder document.
 *
 * The scene table carries only a label and provenance flag, so this is fetched for the one
 * scene the encoder sheet is about to edit rather than for every row.
 */
export function useSceneEncoder(
    projectId: string,
    videoId: string,
    index: number | null,
    enabled = true,
) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.sceneEncoder(projectId, videoId, index),
        queryFn: () => {
            if (index === null) {
                throw new Error("A scene encoder read requires a scene index.");
            }
            return transport.get(
                videoSceneEncoderPath(projectId, videoId, index),
                SceneEncoderDetailSchema,
            );
        },
        enabled: enabled && index !== null,
        staleTime: 0,
    });
}

/**
 * Write one encoder document into the selected scenes.
 *
 * This is the per-scene half of the scope choice. The video-level half is the existing
 * overrides save, so the two write different resources rather than one route guessing from
 * an empty selection.
 */
export function useSetSceneEncoders(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (request: SceneEncoderRequest) =>
            transport.putJson(
                videoScenesEncodersPath(projectId, videoId),
                request,
                SceneListSchema,
            ),
        onSuccess: (list) => {
            queryClient.setQueryData(queryKeys.videoScenes(projectId, videoId), list);
            void queryClient.invalidateQueries({
                queryKey: queryKeys.sceneEncoders(projectId, videoId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoConfig(projectId, videoId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoState(projectId, videoId),
            });
        },
    });
}

/**
 * Clear one sequence's checkpoint data and the files that depended on it.
 *
 * This is not a configuration reset: the sequence keeps its settings and its place in the
 * chain. The server refuses while a run is active, because the encoder owns both the lock
 * and the checkpoint it is writing.
 */
export function useResetSequenceData(projectId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ videoId, sequence }: { videoId: string; sequence: string }) =>
            transport.post(videoSequenceResetPath(projectId, videoId, sequence), {}, z.void()),
        onSuccess: (_unused, variables) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoState(projectId, variables.videoId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoScenes(projectId, variables.videoId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoStorage(projectId, variables.videoId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videos(projectId),
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.storage });
        },
    });
}

/** Stack after a scene edit: the table, the derived state, and the retained bytes all move. */
function useSceneEdit(
    projectId: string,
    videoId: string,
    end: "add" | "split" | "merge" | "reset",
) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    const editPath = {
        add: videoScenesAddPath,
        split: videoScenesSplitPath,
        merge: videoScenesMergePath,
        reset: videoScenesResetPath,
    }[end];
    return useMutation({
        mutationFn: (
            body:
                | { frame: number }
                | { scenes: number[] }
                | { start_frame: number; end_frame: number },
        ) => transport.post(editPath(projectId, videoId), body, z.void()),
        onSuccess: () => invalidateVideoEdits(queryClient, projectId, videoId),
    });
}

/** Add a scene in a gap, keeping the table in frame order. */
export function useAddVideoScene(projectId: string, videoId: string) {
    return useSceneEdit(projectId, videoId, "add");
}

/** Split the scene containing one playhead frame; later chunks are removed server-side. */
export function useSplitVideoScene(projectId: string, videoId: string) {
    return useSceneEdit(projectId, videoId, "split");
}

/** Merge an adjacent multi-selection into one scene. */
export function useMergeVideoScenes(projectId: string, videoId: string) {
    return useSceneEdit(projectId, videoId, "merge");
}

/** Delete the selected scenes' retained chunks so the encoder writes them again. */
export function useResetVideoSceneOutputs(projectId: string, videoId: string) {
    return useSceneEdit(projectId, videoId, "reset");
}

/**
 * Change one scene's boundaries.
 *
 * The service never moves a neighbour; a gap or overlap this creates is the validation
 * strip's to report. That is why the route is a patch on one row rather than a table edit.
 */
export function useSetVideoSceneRange(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ index, ...range }: SceneRangeRequest & { index: number }) =>
            transport.patchJson(videoScenePath(projectId, videoId, index), range, z.void()),
        onSuccess: () => invalidateVideoEdits(queryClient, projectId, videoId),
    });
}

/**
 * Replace one scene's custom sequence data.
 *
 * The engine's sequence data is typed, so these pairs are kept in the video record and
 * merged into the table a script receives. The whole map travels, which is what lets the
 * editor remove one pair and keep the rest in a single request.
 */
export function useSetVideoSceneData(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ index, values }: SceneDataRequest & { index: number }) =>
            transport.put(videoSceneSequenceDataPath(projectId, videoId, index), { values }),
        onSuccess: () => invalidateVideoEdits(queryClient, projectId, videoId),
    });
}

/** Remove one scene, leaving its frames uncovered. */
export function useDeleteVideoScene(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (index: number) => transport.delete(videoScenePath(projectId, videoId, index)),
        onSuccess: () => invalidateVideoEdits(queryClient, projectId, videoId),
    });
}

/** Put back the table the last structural scene edit replaced. */
export function useUndoVideoSceneEdit(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => transport.post(videoScenesUndoPath(projectId, videoId), {}, z.void()),
        onSuccess: () => invalidateVideoEdits(queryClient, projectId, videoId),
    });
}
