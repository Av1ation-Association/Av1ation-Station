import type { SceneView } from "@av1ation/contracts";
import { describe, expect, it } from "vitest";

import { encodingInvalidation } from "./encoding-invalidation";

function scene(index: number, custom: boolean, encoded = true): SceneView {
    return {
        index,
        start_frame: index * 24,
        end_frame: (index + 1) * 24,
        frame_count: 24,
        encoded,
        ...(encoded ? { chunk_bytes: 1_024 } : {}),
        encoder_label: custom ? "FFmpeg" : "SVT-AV1",
        encoder_custom: custom,
        custom_data: {},
    };
}

const ENCODER = { SVTAV1: { executable: null, options: {} } };
const OTHER = { FFmpeg: { executable: null, options: {}, append_color_data: true } };
const INPUT = { Video: { path: "C:/media/source.mkv" } };
const SCENES = [scene(0, false), scene(1, true), scene(2, false)];

function document(encoder: unknown, input: unknown) {
    return { encoder, sequences: { parallel_encoder: { input } } };
}

describe("encodingInvalidation", () => {
    it("invalidates every scene when the frames the encoder reads change", () => {
        const result = encodingInvalidation(
            document(ENCODER, INPUT),
            document(ENCODER, { Video: { path: "C:/media/other.mkv" } }),
            SCENES,
        );

        expect(result.reason).toBe("input");
        expect(result.scenes.map((entry) => entry.index)).toEqual([0, 1, 2]);
    });

    it("invalidates only the scenes that still inherit a changed encoder", () => {
        const result = encodingInvalidation(
            document(ENCODER, INPUT),
            document(OTHER, INPUT),
            SCENES,
        );

        expect(result.reason).toBe("encoder");
        expect(result.scenes.map((entry) => entry.index)).toEqual([0, 2]);
    });

    it("prefers the input when both the encoder and its input change", () => {
        const result = encodingInvalidation(
            document(ENCODER, INPUT),
            document(OTHER, { Video: { path: "C:/media/other.mkv" } }),
            SCENES,
        );

        expect(result.reason).toBe("input");
        expect(result.scenes).toHaveLength(3);
    });

    it("invalidates nothing when only the worker count changes", () => {
        const before = document(ENCODER, INPUT);
        const after = {
            encoder: ENCODER,
            sequences: { parallel_encoder: { input: INPUT, workers: 8 } },
        };

        expect(encodingInvalidation(before, after, SCENES)).toEqual({
            reason: null,
            scenes: [],
        });
    });

    it("invalidates nothing when the draft matches the saved document", () => {
        expect(
            encodingInvalidation(document(ENCODER, INPUT), document(ENCODER, INPUT), SCENES),
        ).toEqual({ reason: null, scenes: [] });
    });
});
