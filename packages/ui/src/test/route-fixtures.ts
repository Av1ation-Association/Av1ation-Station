import { MockTransport } from "@av1ation/api";
import type { ProjectSummary, VideoSummary } from "@av1ation/contracts";

/** The demo project every route fixture addresses. */
export const ROUTE_PROJECT: ProjectSummary = {
    id: "demo-project",
    name: "Aurora Documentary",
    path: "C:\\Users\\demo\\Videos\\Aurora Documentary",
    size_bytes: 1_048_576,
    video_count: 1,
    completed_videos: 0,
    created_at: "2026-10-01T09:00:00Z",
    accessed_at: "2026-10-30T14:30:00Z",
};

/** The demo video every route fixture addresses. */
export const ROUTE_VIDEO: VideoSummary = {
    id: "demo-video",
    name: "Aurora — Opening",
    input_path: "C:\\Users\\demo\\media\\aurora-opening.mkv",
    output_path: "C:\\Users\\demo\\media\\aurora-opening.av1.mkv",
    order: 0,
    created_at: "2026-10-01T09:05:00Z",
};

/** A transport with one project and one video, enough for every populated route. */
export function populatedTransport(): MockTransport {
    const transport = new MockTransport({ projects: [ROUTE_PROJECT] });
    transport.videos.set(ROUTE_PROJECT.id, [ROUTE_VIDEO]);
    transport.history.set(ROUTE_VIDEO.id, [
        {
            run_id: "demo-run-1",
            sequence: "SceneDetector",
            started_at: "2026-10-30T13:58:07Z",
            ended_at: "2026-10-30T13:58:42Z",
            outcome: "completed",
            frames_processed: 1248,
            frames_total: 1248,
            fps: 35.7,
            message: null,
        },
        {
            run_id: "demo-run-1",
            sequence: "ParallelEncoder",
            started_at: "2026-10-30T14:02:07Z",
            ended_at: "2026-10-30T14:19:44Z",
            outcome: "completed",
            frames_processed: 1248,
            frames_total: 1248,
            fps: 1.2,
            message: null,
        },
    ]);
    return transport;
}

/** A transport with no projects; Home and the queue's empty states can render. */
export function emptyTransport(): MockTransport {
    return new MockTransport({ projects: [] });
}

/** A project that exists but has no queue entries. */
export function emptyQueueTransport(): MockTransport {
    return new MockTransport({ projects: [ROUTE_PROJECT] });
}

/** One existing video with no History entries. */
export function emptyHistoryTransport(): MockTransport {
    const transport = new MockTransport({ projects: [ROUTE_PROJECT] });
    transport.videos.set(ROUTE_PROJECT.id, [ROUTE_VIDEO]);
    return transport;
}

/** One existing video with no run logs. */
export function emptyRunsTransport(): MockTransport {
    const transport = emptyHistoryTransport();
    transport.runs.set(ROUTE_VIDEO.id, []);
    return transport;
}

/** One existing video with a valid, empty scene table. */
export function emptyScenesTransport(): MockTransport {
    const transport = emptyHistoryTransport();
    transport.scenes.set(`${ROUTE_PROJECT.id}/${ROUTE_VIDEO.id}`, {
        video_id: ROUTE_VIDEO.id,
        total_frames: 0,
        scene_fingerprint: "empty",
        scenes: [],
    });
    return transport;
}

/** A running process whose every request fails, so each screen must show its error branch. */
export function failingTransport(): MockTransport {
    const transport = populatedTransport();
    const failure = () => Promise.reject(new Error("The service is unavailable."));
    transport.get = failure;
    transport.post = failure;
    transport.put = failure;
    transport.patchJson = failure;
    transport.delete = failure;
    return transport;
}

/** A transport whose reads never settle, so the loading branch stays observable. */
export function pendingTransport(): MockTransport {
    const transport = populatedTransport();
    const pending = () => new Promise<never>(() => undefined);
    transport.get = pending;
    transport.post = pending;
    return transport;
}
