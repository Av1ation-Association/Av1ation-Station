import { describe, expect, it } from "vitest";

import { thumbnailIndexForFrame, thumbnailPath } from "./thumbnails";

const building = {
    state: "building" as const,
    interval_ms: 5_000,
    available: 3,
};
const ready = { ...building, state: "ready" as const };

describe("thumbnailIndexForFrame", () => {
    it("maps a scene start into its five-second bin", () => {
        expect(thumbnailIndexForFrame(0, 24, ready)).toBe(0);
        expect(thumbnailIndexForFrame(24 * 4, 24, ready)).toBe(0);
        expect(thumbnailIndexForFrame(24 * 5, 24, ready)).toBe(1);
        expect(thumbnailIndexForFrame(24 * 12.5, 24, ready)).toBe(2);
    });

    it("hides an index the build has not written yet", () => {
        expect(thumbnailIndexForFrame(24 * 15, 24, building)).toBeNull();
        expect(thumbnailIndexForFrame(24 * 9, 24, building)).toBe(1);
    });

    it("clamps the final scene to the last ready thumbnail", () => {
        expect(thumbnailIndexForFrame(24 * 1_000, 24, ready)).toBe(2);
    });

    it("has no thumbnail without a usable frame rate", () => {
        expect(thumbnailIndexForFrame(0, null, ready)).toBeNull();
        expect(thumbnailIndexForFrame(0, 0, ready)).toBeNull();
        expect(thumbnailIndexForFrame(0, Number.NaN, ready)).toBeNull();
    });

    it("stays empty when the grid is failed or unavailable", () => {
        expect(thumbnailIndexForFrame(0, 24, { ...ready, state: "failed" })).toBeNull();
        expect(thumbnailIndexForFrame(0, 24, { ...ready, state: "unavailable" })).toBeNull();
    });

    it("builds one revisioned URL for a source", () => {
        expect(thumbnailPath("a b", "v/1", 7, "0123abcd")).toBe(
            "/api/projects/a%20b/videos/v%2F1/thumbnails/7?v=0123abcd",
        );
    });
});
