import { describe, expect, it } from "vitest";

import type { EncodeEvent, SceneList, SceneView, VideoState } from "@av1ation/contracts";

import {
    appendSceneCheckpoint,
    applyEncodeEvent,
    applySceneChunk,
    applySceneNoise,
    applySceneQuality,
    takesNewPass,
} from "./encode-events";

function state(): VideoState {
    return {
        video_id: "video-1",
        scene_count: 4,
        sequences: [
            {
                id: "SceneDetector",
                name: "Scene Detector",
                status: "complete",
                runnable: true,
                progress: 100,
                detail: "4 scenes detected",
            },
            {
                id: "ParallelEncoder",
                name: "Parallel Encoder",
                status: "never_run",
                runnable: true,
                progress: null,
                detail: "0/4 scenes encoded",
            },
            {
                id: "SceneConcatenator",
                name: "Scene Concatenator",
                status: "never_run",
                runnable: false,
                progress: null,
            },
        ],
        next: ["ParallelEncoder"],
        active: false,
        run_id: null,
        failure: null,
        output_exists: false,
        retained_bytes: 0,
        script_data: [],
    };
}

function scene(index: number, start: number, end: number): SceneView {
    return {
        index,
        start_frame: start,
        end_frame: end,
        frame_count: end - start,
        encoded: false,
        encoder_custom: false,
        encoder_label: "SVT-AV1",
    };
}

function table(scenes: SceneView[], totalFrames: number): SceneList {
    return {
        video_id: "video-1",
        scenes,
        total_frames: totalFrames,
        scene_fingerprint: "table",
    };
}

function event(overrides: Partial<EncodeEvent> = {}): EncodeEvent {
    return {
        project_id: "project-1",
        video_id: "video-1",
        run_id: "run-1",
        seq: 0,
        at: "2026-11-02T00:00:00Z",
        kind: "started",
        message: "started",
        ...overrides,
    };
}

describe("applyEncodeEvent", () => {
    it("marks the started sequence active and leaves one active row", () => {
        const next = applyEncodeEvent(
            state(),
            event({ kind: "started", sequence: "ParallelEncoder" }),
        );

        expect(next.active).toBe(true);
        expect(next.run_id).toBe("run-1");
        expect(next.sequences.find((entry) => entry.id === "ParallelEncoder")).toMatchObject({
            status: "active",
            progress: 0,
        });
        expect(next.sequences.filter((entry) => entry.status === "active")).toHaveLength(1);
    });

    it("updates progress without a server refetch", () => {
        const running = applyEncodeEvent(
            state(),
            event({ kind: "started", sequence: "ParallelEncoder" }),
        );
        const next = applyEncodeEvent(
            running,
            event({
                kind: "progress",
                sequence: "ParallelEncoder",
                progress: 37.5,
                seq: 1,
            }),
        );

        expect(next.sequences.find((entry) => entry.id === "ParallelEncoder")?.progress).toBe(37.5);
        expect(next.active).toBe(true);
    });

    it("does not let a later stage move the progress bar backwards", () => {
        const running = applyEncodeEvent(
            state(),
            event({ kind: "started", sequence: "ParallelEncoder" }),
        );
        const high = applyEncodeEvent(
            running,
            event({
                kind: "progress",
                sequence: "ParallelEncoder",
                progress: 100,
                seq: 1,
            }),
        );
        const next = applyEncodeEvent(
            high,
            event({
                kind: "progress",
                sequence: "ParallelEncoder",
                progress: 4,
                seq: 2,
            }),
        );

        expect(next.sequences.find((entry) => entry.id === "ParallelEncoder")?.progress).toBe(100);
    });

    it("marks a completed sequence complete and removes it from next", () => {
        const running = applyEncodeEvent(
            state(),
            event({ kind: "started", sequence: "ParallelEncoder" }),
        );
        const next = applyEncodeEvent(
            running,
            event({
                kind: "completed",
                sequence: "ParallelEncoder",
                progress: 100,
                seq: 2,
            }),
        );

        expect(next.sequences.find((entry) => entry.id === "ParallelEncoder")).toMatchObject({
            status: "complete",
            progress: 100,
        });
        expect(next.next).toEqual([]);
        expect(next.active).toBe(true);
    });

    it("clears the lock on a terminal event and keeps a failed sequence retryable", () => {
        const running = applyEncodeEvent(
            state(),
            event({ kind: "started", sequence: "ParallelEncoder" }),
        );
        const next = applyEncodeEvent(running, event({ kind: "failed", seq: 2 }));

        expect(next.active).toBe(false);
        expect(next.run_id).toBeNull();
        expect(next.sequences.find((entry) => entry.id === "ParallelEncoder")?.status).toBe(
            "failed",
        );
        expect(next.next).toContain("ParallelEncoder");
    });

    it("carries a run failure that happened before any sequence started", () => {
        const next = applyEncodeEvent(
            state(),
            event({
                kind: "failed",
                seq: 1,
                message: "the input could not be opened: no such file",
            }),
        );

        expect(next.active).toBe(false);
        expect(next.failure).toEqual({
            message: "the input could not be opened: no such file",
            at: "2026-11-02T00:00:00Z",
            run_id: "run-1",
        });
    });

    it("clears the previous failure when the next run starts", () => {
        const failed = applyEncodeEvent(
            state(),
            event({
                kind: "failed",
                seq: 1,
                message: "the input could not be opened",
            }),
        );
        const next = applyEncodeEvent(failed, event({ kind: "started", seq: 2 }));

        expect(next.failure).toBeNull();
    });

    it("carries a live scene count from a detection progress event", () => {
        const next = applyEncodeEvent(
            state(),
            event({
                kind: "progress",
                sequence: "SceneDetector",
                scene_count: 7,
                seq: 1,
            }),
        );

        expect(next.scene_count).toBe(7);
        expect(next.active).toBe(true);
    });

    it("ignores an event belonging to another video", () => {
        const original = state();
        const next = applyEncodeEvent(original, event({ video_id: "video-2" }));

        expect(next).toBe(original);
    });
});

describe("appendSceneCheckpoint", () => {
    it("appends the first detected scene to an empty table", () => {
        const next = appendSceneCheckpoint(table([], 0), scene(0, 0, 48));

        expect(next?.scenes).toHaveLength(1);
        expect(next?.total_frames).toBe(48);
    });

    it("appends each checkpoint in detection order", () => {
        const first = appendSceneCheckpoint(table([], 0), scene(0, 0, 48));
        const second = first === null ? null : appendSceneCheckpoint(first, scene(1, 48, 120));

        expect(second?.scenes.map((entry) => entry.index)).toEqual([0, 1]);
        expect(second?.total_frames).toBe(120);
    });

    it("replaces a row replayed by a retried checkpoint instead of duplicating it", () => {
        const list = table([scene(0, 0, 48)], 48);
        const next = appendSceneCheckpoint(list, scene(0, 0, 48));

        expect(next?.scenes).toHaveLength(1);
    });

    it("asks for a refetch when the checkpoint leaves a gap in the cached table", () => {
        // The table read is still in flight, or one checkpoint was dropped. Splicing index 1
        // into an empty cache would hide the row forever, so the caller must refetch.
        expect(appendSceneCheckpoint(table([], 0), scene(1, 48, 120))).toBeNull();
    });
});

describe("takesNewPass", () => {
    it("asks for one refresh per pass, not one per tick", () => {
        const seen = new Map<string, number>();

        expect(takesNewPass(seen, "p\u0000v", 1)).toBe(true);
        expect(takesNewPass(seen, "p\u0000v", 1)).toBe(false);
        expect(takesNewPass(seen, "p\u0000v", 2)).toBe(true);
        expect(takesNewPass(seen, "p\u0000v", 2)).toBe(false);
    });

    it("keeps each video's passes apart", () => {
        const seen = new Map<string, number>();

        expect(takesNewPass(seen, "p\u0000one", 2)).toBe(true);
        expect(takesNewPass(seen, "p\u0000two", 2)).toBe(true);
    });

    it("ignores an event that names no pass", () => {
        const seen = new Map<string, number>();

        expect(takesNewPass(seen, "p\u0000v", null)).toBe(false);
        expect(takesNewPass(seen, "p\u0000v", undefined)).toBe(false);
    });
});

describe("applySceneChunk", () => {
    it("marks the row encoded and carries the chunk's size and duration", () => {
        const list = table([scene(0, 0, 24), scene(1, 24, 48)], 48);
        const next = applySceneChunk(list, 1, 2_048, 1_500);

        expect(next.scenes[1]).toMatchObject({
            encoded: true,
            chunk_bytes: 2_048,
            encode_ms: 1_500,
        });
        expect(next.scenes[0]?.encoded).toBe(false);
        // The rail and the Encoding chart read this table, so the patch must be a new value.
        expect(list.scenes[1]?.encoded).toBe(false);
    });

    it("leaves the table alone when the row is not cached or already current", () => {
        const list = table([scene(0, 0, 24)], 24);

        expect(applySceneChunk(list, 3, 2_048, 1_500)).toBe(list);
        const patched = applySceneChunk(list, 0, 2_048, 1_500);
        expect(applySceneChunk(patched, 0, 2_048, 1_500)).toBe(patched);
    });

    it("updates a row when a later run writes a different chunk", () => {
        const patched = applySceneChunk(table([scene(0, 0, 24)], 24), 0, 2_048, 1_500);
        const next = applySceneChunk(patched, 0, 4_096, 2_400);

        expect(next.scenes[0]).toMatchObject({
            chunk_bytes: 4_096,
            encode_ms: 2_400,
        });
    });
});

describe("applySceneQuality", () => {
    it("writes the measured score onto the scene it belongs to", () => {
        const list = table([scene(0, 0, 24), scene(1, 24, 48)], 48);
        const next = applySceneQuality(list, 1, 94.5);

        expect(next.scenes[1]?.quality_score).toBe(94.5);
        expect(next.scenes[0]?.quality_score).toBeUndefined();
        // The chart reads this table, so the patch must be a new value, not a mutation.
        expect(list.scenes[1]?.quality_score).toBeUndefined();
    });

    it("leaves the table alone when the row is not cached or already carries the score", () => {
        const list = table([scene(0, 0, 24)], 24);

        expect(applySceneQuality(list, 3, 95)).toBe(list);
        const scored = applySceneQuality(list, 0, 95);
        expect(applySceneQuality(scored, 0, 95)).toBe(scored);
    });
});

describe("applySceneNoise", () => {
    it("writes the measured value onto the scene it belongs to", () => {
        const list = table([scene(0, 0, 24), scene(1, 24, 48)], 48);
        const next = applySceneNoise(list, 1, 0.0032);

        expect(next.scenes[1]?.noise).toBe(0.0032);
        expect(next.scenes[0]?.noise).toBeUndefined();
        // The charts read this table, so the patch must be a new value, not a mutation.
        expect(list.scenes[1]?.noise).toBeUndefined();
    });

    it("leaves the table alone when the row is not cached or already carries the value", () => {
        const list = table([scene(0, 0, 24)], 24);

        expect(applySceneNoise(list, 3, 0.002)).toBe(list);
        const measured = applySceneNoise(list, 0, 0.002);
        expect(applySceneNoise(measured, 0, 0.002)).toBe(measured);
    });
});
