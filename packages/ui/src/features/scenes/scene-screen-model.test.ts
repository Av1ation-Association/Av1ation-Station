import { expect, it } from "vitest";

import type { SceneView } from "@av1ation/contracts";

import { sceneGapAt, selectedScenes } from "./scene-screen-model";

function scene(index: number, start: number, end: number): SceneView {
    return {
        index,
        start_frame: start,
        end_frame: end,
        frame_count: end - start,
        encoded: false,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
        custom_data: {},
    };
}

it("returns the selected scenes in list order and drops indices the list no longer has", () => {
    const scenes = [scene(0, 0, 100), scene(1, 100, 200), scene(2, 200, 300)];

    expect(
        selectedScenes(scenes, {
            selected: new Set([2, 0, 9]),
            anchor: null,
            cursor: null,
        }).map((entry) => entry.index),
    ).toEqual([0, 2]);
});

it("finds the uncovered range between scenes", () => {
    const scenes = [scene(0, 0, 100), scene(1, 150, 250)];

    expect(sceneGapAt(scenes, 300, 125)).toEqual({ start: 100, end: 150 });
    expect(sceneGapAt(scenes, 300, 50)).toBeNull();
    expect(sceneGapAt(scenes, 300, 275)).toEqual({ start: 250, end: 300 });
});

it("returns the whole source as a gap before the first scene, and no gap without a source", () => {
    expect(sceneGapAt([], 240, 20)).toEqual({ start: 0, end: 240 });
    expect(sceneGapAt([], 0, 20)).toBeNull();
});
