import { describe, expect, it } from "vitest";

import type { EncodeEvent, SceneList, SceneView } from "@av1ation/contracts";

import {
    clearLiveQuality,
    liveQualityKey,
    recordLiveQuality,
    trackLiveQuality,
    withLiveQuality,
} from "./live-quality";

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
        project_id: "project-quality",
        video_id: "video-1",
        run_id: "run-1",
        seq: 0,
        at: "2026-11-07T00:00:00Z",
        kind: "progress",
        message: "scored",
        ...overrides,
    };
}

describe("trackLiveQuality", () => {
    it("records a score for the table read that follows", () => {
        const key = liveQualityKey("project-quality", "video-1");
        trackLiveQuality(
            runEvent({ sequence: "QualityCheck", scene_index: 3, scene_quality: 94.5 }),
        );

        expect(withLiveQuality(table(4), key).scenes[3]?.quality_score).toBe(94.5);
    });

    it("discards the previous run's values when the next one starts", () => {
        const key = liveQualityKey("project-quality", "video-1");
        trackLiveQuality(
            runEvent({ sequence: "QualityCheck", scene_index: 0, scene_quality: 94.5 }),
        );
        trackLiveQuality(runEvent({ kind: "started", sequence: "QualityCheck", seq: 4 }));

        const list = table(1);
        expect(withLiveQuality(list, key)).toBe(list);
    });

    it("discards the tally once the run's checkpoint has it", () => {
        const key = liveQualityKey("project-quality", "video-1");
        trackLiveQuality(
            runEvent({ sequence: "QualityCheck", scene_index: 0, scene_quality: 94.5 }),
        );
        trackLiveQuality(runEvent({ kind: "finished", seq: 9 }));

        const list = table(1);
        expect(withLiveQuality(list, key)).toBe(list);
    });

    it("leaves a noise measurement alone", () => {
        const key = liveQualityKey("project-quality", "video-1");
        trackLiveQuality(
            runEvent({ sequence: "NoiseDetector", scene_index: 0, scene_noise: 0.004 }),
        );

        const list = table(1);
        expect(withLiveQuality(list, key)).toBe(list);
    });

    it("keeps another video's scenes out of this tally", () => {
        const key = liveQualityKey("project-quality", "video-1");
        trackLiveQuality(
            runEvent({
                video_id: "video-2",
                sequence: "QualityCheck",
                scene_index: 0,
                scene_quality: 94.5,
            }),
        );

        const list = table(1);
        expect(withLiveQuality(list, key)).toBe(list);
    });
});

describe("withLiveQuality", () => {
    it("fills a table read with the scores it predates", () => {
        const key = liveQualityKey("project-quality", "video-1");
        recordLiveQuality(key, 0, 94.5);
        recordLiveQuality(key, 1, 91.25);

        const list = withLiveQuality(table(3), key);

        expect(list.scenes[0]?.quality_score).toBe(94.5);
        expect(list.scenes[1]?.quality_score).toBe(91.25);
        expect(list.scenes[2]?.quality_score).toBeUndefined();
        // The chart reads this table, so the fill must be a new value, not a mutation.
        expect(table(3).scenes[0]?.quality_score).toBeUndefined();
    });

    it("lets a live score replace one an earlier read stored", () => {
        const key = liveQualityKey("project-quality", "video-1");
        const stored = table(1);
        stored.scenes[0] = { ...scene(0), quality_score: 88 };
        recordLiveQuality(key, 0, 94.5);

        expect(withLiveQuality(stored, key).scenes[0]?.quality_score).toBe(94.5);
    });

    it("leaves another video's rows and the table itself alone", () => {
        const key = liveQualityKey("project-other", "video-1");
        recordLiveQuality(liveQualityKey("project-other", "video-2"), 0, 94.5);

        const list = table(2);
        expect(withLiveQuality(list, key)).toBe(list);
    });

    it("returns the same table when every score already matches", () => {
        const key = liveQualityKey("project-quality", "video-1");
        const list = table(1);
        list.scenes[0] = { ...scene(0), quality_score: 94.5 };
        recordLiveQuality(key, 0, 94.5);

        expect(withLiveQuality(list, key)).toBe(list);
    });

    it("stops filling once the run's checkpoint carries the scores", () => {
        const key = liveQualityKey("project-quality", "video-1");
        recordLiveQuality(key, 0, 94.5);
        clearLiveQuality(key);

        const list = table(1);
        expect(withLiveQuality(list, key)).toBe(list);
    });

    it("keeps a scene the table does not have out of the rows", () => {
        const key = liveQualityKey("project-quality", "video-1");
        recordLiveQuality(key, 4, 94.5);

        const list = withLiveQuality(table(2), key);
        expect(list.scenes).toHaveLength(2);
    });
});
