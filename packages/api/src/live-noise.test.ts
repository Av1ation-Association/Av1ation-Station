import { describe, expect, it } from "vitest";

import type { EncodeEvent, SceneList, SceneView } from "@av1ation/contracts";

import {
    clearLiveNoise,
    liveNoiseKey,
    recordLiveNoise,
    trackLiveNoise,
    withLiveNoise,
} from "./live-noise";

function scene(index: number): SceneView {
    return {
        index,
        start_frame: index * 24,
        end_frame: (index + 1) * 24,
        frame_count: 24,
        encoded: false,
        encoder_custom: false,
        encoder_label: "SVT-AV1",
    };
}

function table(count: number): SceneList {
    return {
        video_id: "video-1",
        scenes: Array.from({ length: count }, (_, index) => scene(index)),
        total_frames: count * 24,
        scene_fingerprint: "table",
    };
}

function runEvent(overrides: Partial<EncodeEvent> = {}): EncodeEvent {
    return {
        project_id: "project-track",
        video_id: "video-1",
        run_id: "run-1",
        seq: 0,
        at: "2026-11-07T00:00:00Z",
        kind: "progress",
        message: "measured",
        ...overrides,
    };
}

describe("trackLiveNoise", () => {
    it("records a measurement for the table read that follows", () => {
        const key = liveNoiseKey("project-track", "video-1");
        trackLiveNoise(runEvent({ sequence: "NoiseDetector", scene_index: 3, scene_noise: 0.002 }));

        expect(withLiveNoise(table(4), key).scenes[3]?.noise).toBe(0.002);
    });

    it("discards the previous run's values when the next one starts", () => {
        const key = liveNoiseKey("project-track", "video-1");
        trackLiveNoise(runEvent({ sequence: "NoiseDetector", scene_index: 0, scene_noise: 0.004 }));
        trackLiveNoise(runEvent({ kind: "started", sequence: "NoiseDetector", seq: 4 }));

        const list = table(1);
        expect(withLiveNoise(list, key)).toBe(list);
    });

    it("discards the tally once the run's checkpoint has it", () => {
        const key = liveNoiseKey("project-track", "video-1");
        trackLiveNoise(runEvent({ sequence: "NoiseDetector", scene_index: 0, scene_noise: 0.004 }));
        trackLiveNoise(runEvent({ kind: "finished", seq: 9 }));

        const list = table(1);
        expect(withLiveNoise(list, key)).toBe(list);
    });

    it("leaves a probe score alone: only a noise measurement is a property of the video", () => {
        // Target Quality and Quality Check report a scene score in the same child shape,
        // and treating one as measured noise would put a probe's number on this chart.
        const key = liveNoiseKey("project-track", "video-1");
        trackLiveNoise(runEvent({ sequence: "TargetQuality", scene_index: 2 }));

        const list = table(3);
        expect(withLiveNoise(list, key)).toBe(list);
    });

    it("keeps another video's scenes out of this tally", () => {
        const key = liveNoiseKey("project-track", "video-1");
        trackLiveNoise(
            runEvent({
                video_id: "video-2",
                sequence: "NoiseDetector",
                scene_index: 0,
                scene_noise: 0.004,
            }),
        );

        const list = table(1);
        expect(withLiveNoise(list, key)).toBe(list);
    });
});

describe("withLiveNoise", () => {
    it("fills a table read with the measurements it predates", () => {
        // The page had not loaded when these arrived, and the read overtook the service's
        // own tally: only the client's copy can still show them.
        const key = liveNoiseKey("project-fills", "video-1");
        recordLiveNoise(key, 0, 0.004);
        recordLiveNoise(key, 1, 0.0025);

        const list = withLiveNoise(table(3), key);

        expect(list.scenes[0]?.noise).toBe(0.004);
        expect(list.scenes[1]?.noise).toBe(0.0025);
        expect(list.scenes[2]?.noise).toBeUndefined();
        // The charts read this table, so the fill must be a new value, not a mutation.
        expect(table(3).scenes[0]?.noise).toBeUndefined();
    });

    it("lets a live value replace one an earlier read stored", () => {
        const key = liveNoiseKey("project-replaces", "video-1");
        const stored = table(1);
        stored.scenes[0] = { ...scene(0), noise: 0.009 };
        recordLiveNoise(key, 0, 0.0032);

        expect(withLiveNoise(stored, key).scenes[0]?.noise).toBe(0.0032);
    });

    it("leaves another video's rows and the table itself alone", () => {
        const key = liveNoiseKey("project-other", "video-1");
        recordLiveNoise(liveNoiseKey("project-other", "video-2"), 0, 0.004);

        const list = table(2);
        expect(withLiveNoise(list, key)).toBe(list);
    });

    it("returns the same table when every value already matches", () => {
        const key = liveNoiseKey("project-same", "video-1");
        const list = table(1);
        list.scenes[0] = { ...scene(0), noise: 0.004 };
        recordLiveNoise(key, 0, 0.004);

        expect(withLiveNoise(list, key)).toBe(list);
    });

    it("stops filling once the run's checkpoint carries the values", () => {
        const key = liveNoiseKey("project-cleared", "video-1");
        recordLiveNoise(key, 0, 0.004);
        clearLiveNoise(key);

        const list = table(1);
        expect(withLiveNoise(list, key)).toBe(list);
    });

    it("keeps a scene the table does not have out of the rows", () => {
        // The tally names scenes of the checkpoint the table was derived from; a table
        // that has not reached that scene yet must not gain an invented row.
        const key = liveNoiseKey("project-short", "video-1");
        recordLiveNoise(key, 4, 0.003);

        const list = withLiveNoise(table(2), key);
        expect(list.scenes).toHaveLength(2);
    });
});
