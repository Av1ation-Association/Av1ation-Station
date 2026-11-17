import { describe, expect, it } from "vitest";

import { formatSeconds, framesToSeconds, secondsToFrames } from "./scene-bounds";

describe("scene bounds in seconds", () => {
    it.each([
        [23.976, 2.5, 60],
        [24, 1.5, 36],
        [25, 2, 50],
        [30, 1.001, 30],
        [60, 0.5, 30],
    ])("rounds an edit at %s fps to the nearest frame", (frameRate, seconds, frames) => {
        expect(secondsToFrames(seconds, frameRate)).toBe(frames);
    });

    it("reads the stored frames back at the same rate", () => {
        expect(framesToSeconds(60, 23.976)).toBeCloseTo(2.5025, 4);
        expect(formatSeconds(framesToSeconds(60, 23.976) ?? 0)).toBe("2.503");
        expect(formatSeconds(framesToSeconds(36, 24) ?? 0)).toBe("1.5");
    });

    it("refuses a missing, zero, or negative rate", () => {
        expect(secondsToFrames(1, null)).toBeNull();
        expect(secondsToFrames(1, 0)).toBeNull();
        expect(secondsToFrames(1, -24)).toBeNull();
        expect(framesToSeconds(24, Number.NaN)).toBeNull();
    });

    it("refuses a negative or non-finite seconds edit", () => {
        expect(secondsToFrames(-1, 24)).toBeNull();
        expect(secondsToFrames(Number.NaN, 24)).toBeNull();
    });
});
