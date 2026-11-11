import { describe, expect, it } from "vitest";

import type { SceneView } from "@av1ation/contracts";

import { numericSummary, sceneSelectionSummary, shared } from "./scene-aggregate";

function scene(index: number, overrides: Partial<SceneView> = {}): SceneView {
    return {
        index,
        start_frame: index * 24,
        end_frame: (index + 1) * 24,
        frame_count: 24,
        encoded: false,
        quantizer: null,
        score: null,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
        ...overrides,
    };
}

describe("scene selection aggregation", () => {
    it("shares a value only when every selected scene agrees", () => {
        expect(shared(["a", "a"])).toEqual({ mixed: false, value: "a" });
        expect(shared(["a", "b"])).toEqual({ mixed: true, value: "a" });
        expect(shared([])).toEqual({ mixed: false, value: null });
    });

    it("ignores scenes that have no number instead of treating them as zero", () => {
        expect(numericSummary([null, undefined])).toBeNull();
        expect(numericSummary([20, null, 30, 24])).toEqual({
            min: 20,
            max: 30,
            median: 24,
            count: 3,
        });
        expect(numericSummary([20, 30])?.median).toBe(25);
    });

    it("sums a multi-selection and reports an exact single selection", () => {
        const list = sceneSelectionSummary(
            [
                scene(0, {
                    encoded: true,
                    chunk_bytes: 1_024,
                    quantizer: 24,
                    score: 92,
                }),
                scene(1, {
                    encoded: true,
                    chunk_bytes: 2_048,
                    quantizer: 28,
                    score: 88,
                }),
                scene(2, { quantizer: null, score: null }),
            ],
            24,
        );

        expect(list.count).toBe(3);
        expect(list.frames).toBe(72);
        expect(list.durationSeconds).toBe(3);
        expect(list.encodedCount).toBe(2);
        expect(list.retainedBytes).toBe(3_072);
        expect(list.quantizer).toEqual({ min: 24, max: 28, median: 26, count: 2 });
        expect(list.score).toEqual({ min: 88, max: 92, median: 90, count: 2 });
        expect(list.encoder).toEqual({ label: "SVT-AV1", mixed: false, customCount: 0 });

        const one = sceneSelectionSummary(
            [scene(4, { encoder_label: "x265", encoder_custom: true })],
            24,
        );
        expect(one.count).toBe(1);
        expect(one.encoder).toEqual({ label: "x265", mixed: false, customCount: 1 });
    });

    it("marks an encoder mixed and counts the scenes that carry an override", () => {
        const list = sceneSelectionSummary(
            [
                scene(0),
                scene(1, { encoder_label: "x265", encoder_custom: true }),
                scene(2, { encoder_label: "FFmpeg", encoder_custom: true }),
            ],
            24,
        );

        expect(list.encoder).toEqual({ label: "Mixed", mixed: true, customCount: 2 });
    });

    it("reports no rate when the source probe has not returned one", () => {
        expect(sceneSelectionSummary([scene(0)], null).durationSeconds).toBeNull();
        expect(sceneSelectionSummary([], 24)).toMatchObject({
            count: 0,
            frames: 0,
            durationSeconds: null,
            retainedBytes: 0,
        });
    });
});
