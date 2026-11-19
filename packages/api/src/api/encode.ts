/** The one shell-level encode event writer. */
import {
    appendSceneCheckpoint,
    applyEncodeEvent,
    applySceneChunk,
    applySceneNoise,
    applySceneQuality,
    takesNewPass,
} from "../encode-events";
import { recordLive } from "../encode-live";
import { publishRunLifecycle } from "../run-notifications";
import { trackLiveNoise } from "../live-noise";
import { trackLiveQuality } from "../live-quality";
import { useTransport } from "./client";
import { queryKeys } from "./keys";
import { eventsPath } from "./paths";
import {
    EncodeEventSchema,
    type EncodeEvent,
    type SceneList,
    type VideoState,
} from "@av1ation/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Writes the encode stream into the Query cache once for the whole shell.
 *
 * Progress is patched synchronously under the same key `useVideoState` and the queue read,
 * so every view of that video sees one number. A detection checkpoint carries the scene it
 * appended; that row is spliced into the scene table and the scene count immediately, so the
 * rail grows live without a refetch or a poll. Transitions invalidate the derived data, because
 * only the server knows the final chunk counts and the next runnable set.
 */
export function useEncodeEvents(): void {
    const transport = useTransport();
    const queryClient = useQueryClient();
    useEffect(() => {
        // One encode can emit an event per encoder progress line, which is far more often
        // than a frame. Only the newest progress for a video matters; a transition is
        // applied immediately and discards any older progress still waiting for the frame.
        let frame: number | null = null;
        let sceneFrame: number | null = null;
        // One reconciliation per video at a time. A checkpoint that arrives while the
        // scene table read is still in flight would otherwise invalidate it on every
        // scene, turning a detection into a burst of full-table reads.
        const scenesResyncing = new Set<string>();
        // The last Target Quality pass each video has shown. A pass change means the pass
        // that just finished is checkpointed, which the pass charts read.
        const passesSeen = new Map<string, number>();
        // Live ticks are folded once per painted frame. A per-frame Scene Detector event
        // used to republish the store on every arrival, re-rendering every live reader
        // hundreds of times a second and locking the window.
        let liveEvents: EncodeEvent[] = [];
        // Checkpoints are batched to one scene-table write per painted frame. A run that
        // saves several scenes in one frame must not re-render the rail once per scene.
        let sceneEvents: EncodeEvent[] = [];
        const keyOf = (event: EncodeEvent) => `${event.project_id}\u0000${event.video_id}`;

        const flushLive = () => {
            if (liveEvents.length === 0) {
                return;
            }
            const batch = liveEvents;
            liveEvents = [];
            recordLive(batch);
        };

        const patch = (event: EncodeEvent) => {
            const key = queryKeys.videoState(event.project_id, event.video_id);
            const state = queryClient.getQueryData<VideoState>(key);
            if (state !== undefined) {
                queryClient.setQueryData<VideoState>(key, applyEncodeEvent(state, event));
            }
        };

        const applySceneBatch = () => {
            sceneFrame = null;
            if (sceneEvents.length === 0) {
                return;
            }
            const batch = sceneEvents;
            sceneEvents = [];
            const byVideo = new Map<string, EncodeEvent[]>();
            for (const event of batch) {
                // A detection checkpoint appends a row; a measurement or a finished chunk
                // patches one the table already holds.
                const carriesScene =
                    (event.scene ?? null) !== null ||
                    (event.scene_noise ?? null) !== null ||
                    (event.scene_quality ?? null) !== null ||
                    (event.scene_bytes ?? null) !== null;
                if (!carriesScene) {
                    continue;
                }
                const events = byVideo.get(keyOf(event)) ?? [];
                events.push(event);
                byVideo.set(keyOf(event), events);
            }
            for (const [key, events] of byVideo) {
                const first = events[0];
                if (first === undefined) {
                    continue;
                }
                const scenesKey = queryKeys.videoScenes(first.project_id, first.video_id);
                const list = queryClient.getQueryData<SceneList>(scenesKey);
                let next = list === undefined ? null : list;
                for (const event of events) {
                    if (next === null) {
                        break;
                    }
                    if (event.scene !== undefined && event.scene !== null) {
                        next = appendSceneCheckpoint(next, event.scene);
                    } else if (
                        event.scene_index !== undefined &&
                        event.scene_index !== null &&
                        event.scene_noise !== undefined &&
                        event.scene_noise !== null
                    ) {
                        next = applySceneNoise(next, event.scene_index, event.scene_noise);
                    } else if (
                        event.scene_index !== undefined &&
                        event.scene_index !== null &&
                        event.scene_quality !== undefined &&
                        event.scene_quality !== null
                    ) {
                        next = applySceneQuality(next, event.scene_index, event.scene_quality);
                    } else if (
                        event.scene_index !== undefined &&
                        event.scene_index !== null &&
                        event.scene_bytes !== undefined &&
                        event.scene_bytes !== null
                    ) {
                        next = applySceneChunk(
                            next,
                            event.scene_index,
                            event.scene_bytes,
                            event.scene_encode_ms ?? null,
                        );
                    }
                }
                if (next === null) {
                    // The table read is in flight, or an earlier event was missed. One
                    // refetch reconciles it; this is event-driven, not a poll. Coalesce it
                    // until that read settles, or every later checkpoint during the read
                    // triggers another.
                    if (!scenesResyncing.has(key)) {
                        scenesResyncing.add(key);
                        void queryClient
                            .invalidateQueries({ queryKey: scenesKey })
                            .finally(() => scenesResyncing.delete(key));
                    }
                } else if (next !== list) {
                    queryClient.setQueryData<SceneList>(scenesKey, next);
                }
            }
        };

        const applyScene = (event: EncodeEvent) => {
            sceneEvents.push(event);
            sceneFrame ??= requestAnimationFrame(applySceneBatch);
        };

        const flushScenes = () => {
            if (sceneFrame !== null) {
                cancelAnimationFrame(sceneFrame);
                sceneFrame = null;
            }
            applySceneBatch();
        };

        const unsubscribe = transport.subscribe(eventsPath(), EncodeEventSchema, (event) => {
            // The notification writer is the one other consumer of lifecycle transitions.
            // It leaves cancellation and ordinary progress alone.
            publishRunLifecycle(event);
            // The live snapshot is what a running bar shows: frames, speed, ETA, and the
            // pass or worker a tick belongs to. It is client-only and cleared by the
            // run's terminal event, so a reload never shows a stale clock. Progress is
            // batched to the next frame; a transition is applied at once.
            liveEvents.push(event);
            const key = queryKeys.videoState(event.project_id, event.video_id);
            // A measurement has to outlive the page that reads it: a page opened
            // later never saw this event, and its own table read can land ahead of
            // the service's tally. Keeping the value here lets that read fill the
            // row, and the cached-table patch below covers the other order.
            trackLiveNoise(event);
            trackLiveQuality(event);
            // A pass boundary is when the finished pass's checkpoint appears. Nothing
            // else refreshes the table during a run, so without this the chart would
            // keep the previous run's passes until the sequence completed.
            if (
                event.sequence === "TargetQuality" &&
                takesNewPass(passesSeen, keyOf(event), event.pass)
            ) {
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.videoScenes(event.project_id, event.video_id),
                });
            }
            // A scene-bearing checkpoint is coalesced into the next painted frame.
            applyScene(event);
            if (event.kind === "progress") {
                frame ??= requestAnimationFrame(() => {
                    frame = null;
                    flushLive();
                });
                // Progress deliberately does not touch the durable state cache. That
                // cache feeds whole screens (charts, editors, the rail); writing every
                // tick into it re-rendered them several times a second. The live store
                // is the one source for a running label, and transitions still patch
                // the cache because they change what is allowed to run next.
                return;
            }

            // A transition supersedes any progress queued before it.
            flushLive();
            flushScenes();
            patch(event);
            void queryClient.invalidateQueries({ queryKey: key });
            // A completed Scene Detector rewrites the scene table; the rail must not keep
            // rendering the previous run's list until a manual reload.
            void queryClient.invalidateQueries({
                queryKey: ["video-scenes", event.project_id, event.video_id],
            });
            // A run's log appears with `started` and gains its outcome with a terminal
            // event; the viewer's selector must not wait for a reload to show either.
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoRuns(event.project_id, event.video_id),
            });
            // The execution timeline appends one record per completed sequence and one
            // for the run's terminal outcome, so History must follow the same transitions.
            void queryClient.invalidateQueries({
                queryKey: queryKeys.videoHistory(event.project_id, event.video_id),
            });
            if (event.kind === "completed") {
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.videoStorage(event.project_id, event.video_id),
                });
                return;
            }
            if (
                event.kind === "cancelled" ||
                event.kind === "finished" ||
                event.kind === "failed"
            ) {
                // The final lines may have arrived between the log viewer's tail polls.
                void queryClient.invalidateQueries({ queryKey: queryKeys.runLogs(event.run_id) });
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.videoStorage(event.project_id, event.video_id),
                });
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.video(event.project_id, event.video_id),
                });
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.videos(event.project_id),
                });
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.project(event.project_id),
                });
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.projects,
                });
            }
        });

        return () => {
            unsubscribe();
            if (frame !== null) {
                cancelAnimationFrame(frame);
            }
            if (sceneFrame !== null) {
                cancelAnimationFrame(sceneFrame);
            }
            sceneEvents = [];
            liveEvents = [];
        };
    }, [transport, queryClient]);
}
