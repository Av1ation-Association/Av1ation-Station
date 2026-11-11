import { describe, expect, it } from "vitest";

import type { SceneView } from "@av1ation/contracts";

import { encoderWrite } from "./scene-encoder";

function scene(index: number): SceneView {
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
    };
}

const ENCODER = { SVTAV1: { options: {} } };
const SELECTION = [scene(2), scene(5), scene(9)];

describe("scene encoder scope", () => {
    it("video scope replaces only the encoder section of the existing overrides", () => {
        const write = encoderWrite("video", SELECTION, ENCODER, {
            "sequences.parallel_encoder.workers": 8,
            encoder: { X265: { options: {} } },
        });

        expect(write.kind).toBe("video");
        expect(write.body).toEqual({
            fields: {
                "sequences.parallel_encoder.workers": 8,
                encoder: ENCODER,
            },
        });
    });

    it("scene scope writes exactly the selected indices and never the video overrides", () => {
        const write = encoderWrite("scenes", SELECTION, ENCODER, {
            "sequences.parallel_encoder.workers": 8,
        });

        expect(write.kind).toBe("scenes");
        expect(write.body).toEqual({
            scenes: [2, 5, 9],
            encoder: ENCODER,
        });
    });
});
