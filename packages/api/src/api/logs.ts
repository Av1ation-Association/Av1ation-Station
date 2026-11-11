/** Run history, log pages, export, and deletion. */
import { useTransport } from "./client";
import { queryKeys } from "./keys";
import { runLogsExportPath, runLogsPath, videoRunsPath, videoRunsRunPath } from "./paths";
import {
    LogExportSchema,
    LogPageSchema,
    RunSummarySchema,
    type LogPage,
    type RunSummary,
    type VideoHistory,
} from "@av1ation/contracts";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

/** Every run of one video that has a log, newest first. */
export function useVideoRuns(projectId: string, videoId: string) {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.videoRuns(projectId, videoId),
        queryFn: () => transport.get(videoRunsPath(projectId, videoId), RunSummarySchema.array()),
        staleTime: 2_000,
    });
}

/** One page of a run log, narrowed by the viewer's level and search filters. */
export interface RunLogRequest {
    /** Start record; omitted when reading the tail. */
    offset?: number | undefined;
    /** Read the last `limit` records instead of the ones at `offset`. */
    tail?: boolean | undefined;
    limit: number;
    /** A comma-separated set of `info`, `warn`, `error`; absent for every level. */
    level?: string | undefined;
    /** Case-insensitive substring of the message or sequence name. */
    search?: string | undefined;
    /** The column the service sorts before slicing. */
    sort?: "seq" | "time" | "level" | "sequence" | "message" | undefined;
    direction?: "asc" | "desc" | undefined;
}

function runLogPath(runId: string, request: RunLogRequest): string {
    const params = new URLSearchParams({
        limit: String(request.limit),
        ...(request.tail === true ? { tail: "true" } : { offset: String(request.offset ?? 0) }),
        ...(request.level === undefined || request.level === "" ? {} : { level: request.level }),
        ...(request.search === undefined || request.search === "" ? {} : { q: request.search }),
        ...(request.sort === undefined ? {} : { sort: request.sort }),
        ...(request.direction === undefined ? {} : { dir: request.direction }),
    });
    return `${runLogsPath(runId)}?${params.toString()}`;
}

function runLogKey(runId: string, request: RunLogRequest) {
    return queryKeys.runLog(
        runId,
        request.tail === true ? "tail" : String(request.offset ?? 0),
        request.limit,
        request.level ?? "all",
        request.search ?? "",
        request.sort ?? "seq",
        request.direction ?? "asc",
    );
}

/** One log page. The caller keeps the offset, so a tail page can be placed by `total`. */
export function useRunLogPage(
    runId: string,
    request: RunLogRequest,
    enabled = true,
    refetchInterval: number | false = false,
) {
    const transport = useTransport();
    return useQuery<LogPage>({
        queryKey: runLogKey(runId, request),
        queryFn: () => transport.get(runLogPath(runId, request), LogPageSchema),
        enabled: enabled && runId !== "",
        staleTime: request.tail === true ? 500 : 30_000,
        refetchInterval: request.tail === true ? refetchInterval : false,
        retry: false,
    });
}

/** The pages a virtualized viewer has on screen, fetched by their aligned offsets. */
export function useRunLogPages(runId: string, requests: RunLogRequest[], enabled = true) {
    const transport = useTransport();
    return useQueries({
        queries: requests.map((request) => ({
            queryKey: runLogKey(runId, request),
            queryFn: () => transport.get(runLogPath(runId, request), LogPageSchema),
            enabled: enabled && runId !== "",
            staleTime: 30_000,
            retry: false,
        })),
    });
}

/** Builds the anonymised export; the dialog previews exactly what a download would save. */
export function useExportRunLog(runId: string) {
    const transport = useTransport();
    return useMutation({
        mutationFn: () => transport.post(runLogsExportPath(runId), {}, LogExportSchema),
    });
}

/** Delete one run's log. History keeps the run; only the viewer's records go away. */
export function useDeleteRunLog(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (runId: string) => transport.delete(runLogsPath(runId)),
        onSuccess: (_deleted, runId) => {
            // The key's prefix covers every offset, filter and sort of this run.
            void queryClient.removeQueries({ queryKey: queryKeys.runLogs(runId) });
            // Drop the run from the selector's cached list before refetching: leaving it
            // there would make the still-mounted viewer ask for the page just deleted.
            queryClient.setQueryData<RunSummary[]>(
                queryKeys.videoRuns(projectId, videoId),
                (runs) => runs?.filter((run) => run.run_id !== runId),
            );
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoRuns(projectId, videoId),
            });
        },
    });
}

/**
 * Delete one run: its history entries and its log, as one action.
 *
 * History lists runs, not logs, so the action it offers has to remove the record the card
 * shows. The log viewer keeps a log-only delete instead, because there the run is still
 * evidence worth keeping.
 */
export function useDeleteRun(projectId: string, videoId: string) {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (runId: string) =>
            transport.delete(videoRunsRunPath(projectId, videoId, runId)),
        onSuccess: (_deleted, runId) => {
            void queryClient.removeQueries({ queryKey: queryKeys.runLogs(runId) });
            queryClient.setQueryData<RunSummary[]>(
                queryKeys.videoRuns(projectId, videoId),
                (runs) => runs?.filter((run) => run.run_id !== runId),
            );
            queryClient.setQueryData<VideoHistory>(
                queryKeys.videoHistory(projectId, videoId),
                (history) =>
                    history === undefined
                        ? history
                        : {
                              ...history,
                              entries: history.entries.filter((entry) => entry.run_id !== runId),
                          },
            );
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoRuns(projectId, videoId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoHistory(projectId, videoId),
            });
        },
    });
}
