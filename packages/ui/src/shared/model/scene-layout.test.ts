import { describe, expect, it } from "vitest";

import {
    frameAtRatio,
    rowAtOffset,
    sceneAtFrame,
    sceneCoveringFrame,
    sceneValidation,
    sceneWarnings,
    timelineBlocks,
    timelineGridLines,
    visibleWindow,
    type TimelineScene,
} from "./scene-layout";

function scenes(count: number, frames = 24): TimelineScene[] {
    return Array.from({ length: count }, (_, index) => ({
        start_frame: index * frames,
        end_frame: (index + 1) * frames,
        encoded: false,
        warn: false,
    }));
}

describe("visibleWindow", () => {
    it("mounts only the viewport plus overscan", () => {
        const window = visibleWindow(5_000, 44, 0, 440);

        expect(window.start).toBe(0);
        expect(window.end).toBeLessThanOrEqual(10 + 16);
        expect(window.height).toBe(5_000 * 44);
    });

    it("follows the scroll position and clamps at the end", () => {
        const window = visibleWindow(5_000, 44, 5_000 * 44, 440);

        expect(window.start).toBeLessThan(5_000);
        expect(window.end).toBe(5_000);
        expect(window.top).toBe(window.start * 44);
    });

    it("has no rows for an empty list", () => {
        expect(visibleWindow(0, 44, 0, 440)).toEqual({
            start: 0,
            end: 0,
            top: 0,
            height: 0,
        });
    });
});

describe("rowAtOffset", () => {
    it("maps a y offset to a row and rejects the outside", () => {
        expect(rowAtOffset(0, 44, 10)).toBe(0);
        expect(rowAtOffset(45, 44, 10)).toBe(1);
        expect(rowAtOffset(-1, 44, 10)).toBeNull();
        expect(rowAtOffset(440, 44, 10)).toBeNull();
    });
});

describe("sceneWarnings", () => {
    it("marks empty, reversed, overlapping, and out-of-order ranges", () => {
        const warnings = sceneWarnings([
            { start_frame: 0, end_frame: 24 },
            { start_frame: 24, end_frame: 24 },
            { start_frame: 24, end_frame: 48 },
            { start_frame: 40, end_frame: 60 },
            { start_frame: 30, end_frame: 50 },
        ]);

        expect(warnings[0]).toBe(false);
        expect(warnings[1]).toBe(true);
        expect(warnings[2]).toBe(false);
        expect(warnings[3]).toBe(true);
        expect(warnings[4]).toBe(true);
    });

    it("does not mark a gap as an error", () => {
        const warnings = sceneWarnings([
            { start_frame: 0, end_frame: 24 },
            { start_frame: 30, end_frame: 48 },
        ]);

        expect(warnings).toEqual([false, false]);
    });
});

describe("sceneValidation", () => {
    it("names a gap as a warning on the scene after it", () => {
        const issues = sceneValidation([
            { start_frame: 0, end_frame: 24 },
            { start_frame: 30, end_frame: 48 },
        ]);

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ kind: "gap", scene: 1, severity: "warning" });
        expect(issues[0]?.message).toContain("24–29");
    });

    it("treats overlap, out-of-order, and empty ranges as errors", () => {
        const issues = sceneValidation([
            { start_frame: 0, end_frame: 24 },
            { start_frame: 20, end_frame: 40 },
            { start_frame: 10, end_frame: 20 },
            { start_frame: 50, end_frame: 50 },
        ]);

        expect(issues.map((issue) => issue.kind)).toEqual(["overlap", "out-of-order", "invalid"]);
        expect(issues.every((issue) => issue.severity === "error")).toBe(true);
        expect(issues[0]?.message).toContain("4 frames");
    });

    it("returns nothing for a contiguous list", () => {
        expect(sceneValidation(scenes(10))).toEqual([]);
    });
});

describe("timelineBlocks", () => {
    it("sizes blocks proportionally to frame count", () => {
        const blocks = timelineBlocks(
            [
                { start_frame: 0, end_frame: 100, encoded: false, warn: false },
                { start_frame: 100, end_frame: 300, encoded: false, warn: false },
            ],
            new Set(),
            1_000,
        );

        expect(blocks).toHaveLength(2);
        expect(blocks[0]?.left).toBe(0);
        expect(blocks[0]?.width).toBeCloseTo(333.333, 2);
        expect(blocks[1]?.left).toBeCloseTo(333.333, 2);
        expect(blocks[1]?.width).toBeCloseTo(666.667, 2);
    });

    it("coalesces 5,000 sub-pixel scenes into a handful of bands", () => {
        const blocks = timelineBlocks(scenes(5_000), new Set(), 1_000);

        expect(blocks.length).toBeLessThanOrEqual(340);
        expect(blocks[0]?.from).toBe(0);
        expect(blocks[blocks.length - 1]?.to).toBe(4_999);
    });

    it("carries a selection or chunk marker on the band it falls into", () => {
        const list = scenes(5_000);
        list[2_500] = { ...list[2_500]!, encoded: true };
        const blocks = timelineBlocks(list, new Set([4_000]), 1_000);

        const marked = blocks.find((block) => block.selected || block.encoded);
        expect(marked?.selected).toBe(true);
        expect(marked?.encoded).toBe(true);
    });

    it("does not coalesce across a gap", () => {
        const blocks = timelineBlocks(
            [
                { start_frame: 0, end_frame: 1, encoded: false, warn: false },
                { start_frame: 100, end_frame: 101, encoded: false, warn: false },
            ],
            new Set(),
            100,
        );

        expect(blocks).toHaveLength(2);
    });

    it("keeps a wide scene as its own block", () => {
        const blocks = timelineBlocks(
            [
                { start_frame: 0, end_frame: 1, encoded: false, warn: false },
                { start_frame: 1, end_frame: 1_000, encoded: true, warn: false },
            ],
            new Set([0]),
            500,
        );

        expect(blocks.some((block) => block.kind === "scene" && block.encoded)).toBe(true);
    });

    it("returns nothing for an empty list or no width", () => {
        expect(timelineBlocks([], new Set(), 500)).toEqual([]);
        expect(timelineBlocks(scenes(2), new Set(), 0)).toEqual([]);
    });
});

describe("timelineGridLines", () => {
    it("uses a round wall-clock interval that keeps the grid readable", () => {
        // 240 frames at 24 fps is ten seconds, so the grid is one-second rules.
        const lines = timelineGridLines(0, 240, 24);
        expect(lines).toHaveLength(9);
        expect(lines[0]?.frame).toBe(24);
        expect(lines[4]?.major).toBe(true);
        expect(lines[8]?.frame).toBe(216);
    });

    it("falls back to frame divisions when the rate is unknown", () => {
        const lines = timelineGridLines(0, 100, null);
        expect(lines).toHaveLength(9);
        expect(lines[8]?.frame).toBe(90);
    });

    it("never returns two rules at the same frame", () => {
        // Before the probe resolves, an empty table renders a one-frame fallback span. Ten
        // equal divisions of it round onto the same two frames.
        const lines = timelineGridLines(0, 1, null);
        expect(new Set(lines.map((line) => line.frame)).size).toBe(lines.length);
        expect(lines.map((line) => line.frame)).toEqual([0, 1]);
    });

    it("starts at the first round frame after a trimmed origin", () => {
        const lines = timelineGridLines(10, 240, 24);
        expect(lines[0]?.frame).toBe(24);
    });

    it("returns nothing for an empty span", () => {
        expect(timelineGridLines(0, 0, 24)).toEqual([]);
    });
});

describe("scene frame mapping", () => {
    it("finds the scene containing a frame", () => {
        const list = scenes(10);

        expect(sceneAtFrame(list, 0)).toBe(0);
        expect(sceneAtFrame(list, 23)).toBe(0);
        expect(sceneAtFrame(list, 24)).toBe(1);
        expect(sceneAtFrame(list, 999)).toBe(9);
    });

    it("leaves a frame in a gap unnamed", () => {
        const gapped: TimelineScene[] = [
            { start_frame: 0, end_frame: 24, encoded: false, warn: false },
            { start_frame: 30, end_frame: 54, encoded: false, warn: false },
        ];

        expect(sceneCoveringFrame(gapped, 23)).toBe(0);
        expect(sceneCoveringFrame(gapped, 24)).toBeNull();
        expect(sceneCoveringFrame(gapped, 29)).toBeNull();
        expect(sceneCoveringFrame(gapped, 30)).toBe(1);
        expect(sceneCoveringFrame(gapped, 54)).toBeNull();
    });

    it("maps a ratio across the whole span", () => {
        const list = scenes(10);

        expect(frameAtRatio(list, 0)).toBe(0);
        expect(frameAtRatio(list, 0.5)).toBe(120);
        expect(frameAtRatio(list, 1)).toBe(240);
        expect(frameAtRatio(list, 2)).toBe(240);
    });
});
