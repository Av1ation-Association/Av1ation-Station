/** Video records, General documents, storage, probes, and retained chunks. */
import { useTransport } from "./client";
import { invalidateDeletedChunks, invalidateVideoGeneral } from "./invalidate";
import { queryKeys } from "./keys";
import {
    videoAudioTracksPath,
    videoChunksPath,
    videoConcatInventoryPath,
    videoConcatSourceInfoPath,
    videoGeneralPath,
    videoHistoryPath,
    videoPath,
    videoProbePath,
    videoStatePath,
    videoStoragePath,
    videoValidatePath,
} from "./paths";
import {
    AudioTrackListSchema,
    ConcatInventorySchema,
    ConcatSourceInfoSchema,
    VideoDetailSchema,
    VideoGeneralSchema,
    VideoHistorySchema,
    VideoProbeSchema,
    VideoStateSchema,
    VideoStorageSchema,
    VideoValidationSchema,
    type ConcatMethodName,
    type VideoGeneralRequest,
} from "@av1ation/contracts";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Reads the derived state of every visible queue row. The server derives it per video from
 * the engine checkpoint, the retained chunks, and the live run; the queue never infers it.
 */
export function useVideoStates(projectId: string, videoIds: string[]) {
    const transport = useTransport();
    return useQueries({
        queries: videoIds.map((videoId) => ({
            queryKey: queryKeys.videoState(projectId, videoId),
            queryFn: () => transport.get(videoStatePath(projectId, videoId), VideoStateSchema),
            staleTime: 2_000,
        })),
    });
}

/** One queue entry as its own page reads it. */
export function useVideo(projectId: string, videoId: string, enabled = true) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.video(projectId, videoId),
        queryFn: () => transport.get(videoPath(projectId, videoId), VideoDetailSchema),
        staleTime: 5_000,
        enabled: enabled && projectId !== "" && videoId !== "",
    });
}

/** One video's derived pipeline state; the page never infers a phase from its own data. */
export function useVideoState(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoState(projectId, videoId),
        queryFn: () => transport.get(videoStatePath(projectId, videoId), VideoStateSchema),
        staleTime: 2_000,
    });
}

/**
 * The per-video preflight, including the VapourSynth plugins the scripts reference.
 *
 * It is a `POST` because the scan is a request for the server's judgement rather than a
 * stored resource. The query key lets a General or section save invalidate the scan, so a
 * script edit cannot leave an old plugin warning on screen.
 */
export function useVideoValidation(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoValidation(projectId, videoId),
        queryFn: () =>
            transport.post(videoValidatePath(projectId, videoId), {}, VideoValidationSchema),
        staleTime: 5_000,
    });
}

/** The two engine documents a video's General section owns. */
export function useVideoGeneral(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoGeneral(projectId, videoId),
        queryFn: () => transport.get(videoGeneralPath(projectId, videoId), VideoGeneralSchema),
        staleTime: 5_000,
    });
}

/** Replaces a video's input and output documents after the service validates both. */
export function useSaveVideoGeneral(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (document: VideoGeneralRequest) =>
            transport.putJson(videoGeneralPath(projectId, videoId), document, VideoGeneralSchema),
        onSuccess: (general) => {
            queryClient.setQueryData(queryKeys.videoGeneral(projectId, videoId), general);
            invalidateVideoGeneral(queryClient, projectId, videoId);
        },
    });
}

/** The video's scratch directory, retained work, and volume free space, measured on read. */
export function useVideoStorage(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoStorage(projectId, videoId),
        queryFn: () => transport.get(videoStoragePath(projectId, videoId), VideoStorageSchema),
        staleTime: 5_000,
    });
}

/**
 * Points one video's scratch work at its own directory, or back at the inherited root.
 *
 * The service refuses the move while the video retains chunks, because the encoder's
 * sidecars record absolute paths into them. That refusal is the only safe way to change
 * the directory; the UI deletes the retained work first.
 */
export function useSaveVideoStorage(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (directory: string | null) =>
            transport.putJson(
                videoStoragePath(projectId, videoId),
                { directory },
                VideoStorageSchema,
            ),
        onSuccess: (storage) => {
            queryClient.setQueryData(queryKeys.videoStorage(projectId, videoId), storage);
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoState(projectId, videoId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videos(projectId),
            });
        },
    });
}

/**
 * Probes the video's decode graph. The probe opens the source, so it is a POST with its own
 * cache entry; a failed probe is data, not an error, because the file may have moved.
 */
export function useProbeVideo(projectId: string, videoId: string, enabled = true) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoProbe(projectId, videoId),
        queryFn: () => transport.post(videoProbePath(projectId, videoId), {}, VideoProbeSchema),
        enabled,
        retry: false,
        staleTime: 60_000,
    });
}

/**
 * The source file's audio streams, for the player's track selector.
 *
 * Every preview source takes its sound from the source file — the proxies carry no audio —
 * so the list is the same for `Original`, `Decoded`, and `Encode`, and does not depend on the
 * selected source. It used to be skipped for `Decoded`, which left that source with no
 * selector and no way to choose a track.
 */
export function useVideoAudioTracks(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoAudioTracks(projectId, videoId),
        queryFn: () =>
            transport.get(videoAudioTracksPath(projectId, videoId), AudioTrackListSchema),
        retry: false,
        staleTime: 60_000,
    });
}

/**
 * One concatenation input's streams, keyed by the selected muxer's own identifiers.
 *
 * The result is read-only; the draft stays the only editable state. An extra input passes
 * its own path. The query is disabled for IVF and for an empty extra path, so adding ten
 * files does not start ten probes at once.
 */
export function useConcatInventory(
    projectId: string,
    videoId: string,
    method: ConcatMethodName | null,
    path?: string | null,
    enabled = true,
) {
    const transport = useTransport();
    const explicit = path === undefined || path === null ? null : path.trim();
    return useQuery({
        queryKey: queryKeys.videoConcatInventory(
            projectId,
            videoId,
            method ?? "",
            explicit === "" ? null : explicit,
        ),
        queryFn: () =>
            transport.post(
                videoConcatInventoryPath(projectId, videoId),
                { method, path: explicit === "" ? null : explicit },
                ConcatInventorySchema,
            ),
        enabled:
            enabled &&
            method !== null &&
            (path === undefined || (explicit !== null && explicit !== "")),
        retry: false,
        staleTime: 60_000,
    });
}

/**
 * Chapters and global metadata from the source's single on-demand probe.
 *
 * Both read-only tabs read this one document, so switching tabs does not start a second
 * FFmpeg process. The snapshot is fresh for sixty seconds; reopening the sheet after that
 * reads the source again. Window focus does not refetch while the sheet is open.
 */
export function useConcatSourceInfo(projectId: string, videoId: string, enabled: boolean) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoConcatSourceInfo(projectId, videoId),
        queryFn: () =>
            transport.post(
                videoConcatSourceInfoPath(projectId, videoId),
                {},
                ConcatSourceInfoSchema,
            ),
        enabled,
        retry: false,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
}

/**
 * The video's append-only execution history, oldest first.
 *
 * This is the only server read that answers "what happened, when, and how fast"; the
 * derived state deliberately carries no durations.
 */
export function useVideoHistory(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoHistory(projectId, videoId),
        queryFn: () => transport.get(videoHistoryPath(projectId, videoId), VideoHistorySchema),
        staleTime: 5_000,
    });
}

/** Deletes retained scene chunks without touching the video's checkpoint. */
export function useDeleteVideoChunks(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => transport.delete(videoChunksPath(projectId, videoId)),
        onSuccess: () => invalidateDeletedChunks(queryClient, projectId, videoId),
    });
}
