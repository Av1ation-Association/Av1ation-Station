import type { SceneView } from "@av1ation/contracts";

import { sceneAtFrame } from "../../shared/model/scene-layout";
import type { SceneSelection } from "./scene-selection";

export function selectedScenes(
    scenes: readonly SceneView[],
    selection: SceneSelection,
): SceneView[] {
    return [...selection.selected]
        .sort((left, right) => left - right)
        .map((index) => scenes[index])
        .filter((scene): scene is SceneView => scene !== undefined);
}

/** The uncovered range under a right-click, or null when a scene already owns it. */
export function sceneGapAt(
    scenes: readonly SceneView[],
    sourceFrames: number,
    frame: number,
): { start: number; end: number } | null {
    if (sourceFrames <= 0) {
        return null;
    }
    const index = sceneAtFrame(scenes, frame);
    const containing = index === null ? undefined : scenes[index];
    if (
        containing !== undefined &&
        frame >= containing.start_frame &&
        frame < containing.end_frame
    ) {
        return null;
    }
    const previous = [...scenes].reverse().find((scene) => scene.end_frame <= frame);
    const next = scenes.find((scene) => scene.start_frame > frame);
    const start = previous?.end_frame ?? 0;
    const end = next?.start_frame ?? sourceFrames;
    return end > start ? { start, end } : null;
}
