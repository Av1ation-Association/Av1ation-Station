import type { KeyboardEvent } from "react";

import { matchesShortcut } from "../../shared/shortcuts";
import type { PreviewSource } from "./preview-player";

type PlayerKeyActions = {
    playhead: number | null;
    currentFrame: number | null;
    source: PreviewSource;
    seekToFrame: (frame: number) => void;
    stepFrame: (direction: -1 | 1) => void;
    stepScene: (direction: -1 | 1) => void;
    chooseSource: (next: PreviewSource) => void;
    toggleFullscreen: () => void;
    resetView: () => void;
};

/**
 * The shortcuts that belong to the focused player rather than the whole screen.
 *
 * Shift widens a frame step to ten before the exact table chord is read. Before metadata
 * arrives the element still sits at zero, while the screen's playhead may already be on a
 * selected scene, so a step starts from that.
 */
export function playerKeyDown(
    event: KeyboardEvent<HTMLElement>,
    {
        playhead,
        currentFrame,
        source,
        seekToFrame,
        stepFrame,
        stepScene,
        chooseSource,
        toggleFullscreen,
        resetView,
    }: PlayerKeyActions,
): void {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea") !== null) {
        return;
    }
    if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const base = playhead ?? currentFrame;
        if (base === null) {
            return;
        }
        event.preventDefault();
        seekToFrame(base + (event.key === "ArrowLeft" ? -10 : 10));
        return;
    }
    if (matchesShortcut(event, "playerPreviousScene")) {
        event.preventDefault();
        stepScene(-1);
        return;
    }
    if (matchesShortcut(event, "playerNextScene")) {
        event.preventDefault();
        stepScene(1);
        return;
    }
    if (matchesShortcut(event, "playerPreviousFrame")) {
        event.preventDefault();
        stepFrame(-1);
        return;
    }
    if (matchesShortcut(event, "playerNextFrame")) {
        event.preventDefault();
        stepFrame(1);
        return;
    }
    if (matchesShortcut(event, "playerPicture")) {
        event.preventDefault();
        chooseSource(source === "original" ? "encode" : "original");
        return;
    }
    if (matchesShortcut(event, "playerFullscreen")) {
        event.preventDefault();
        toggleFullscreen();
        return;
    }
    if (matchesShortcut(event, "playerReset")) {
        event.preventDefault();
        resetView();
    }
}
