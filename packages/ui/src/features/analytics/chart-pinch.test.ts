import { describe, expect, it } from "vitest";

import { pinchRange } from "./chart-pinch";

describe("pinchRange", () => {
    it("zooms in around the pinch centre", () => {
        expect(pinchRange([0, 100], 50, 2)).toEqual([25, 75]);
    });

    it("keeps an off-centre anchor fixed", () => {
        expect(pinchRange([0, 100], 25, 2)).toEqual([12.5, 62.5]);
    });

    it("zooms out to the full extent and stops", () => {
        expect(pinchRange([25, 75], 50, 0.5)).toEqual([0, 100]);
        expect(pinchRange([25, 75], 50, 0.1)).toEqual([0, 100]);
    });

    it("enforces a minimum width", () => {
        expect(pinchRange([0, 100], 50, 1000)).toEqual([49.5, 50.5]);
    });

    it("ignores an invalid scale or range", () => {
        expect(pinchRange([0, 100], 50, 0)).toEqual([0, 100]);
        expect(pinchRange([60, 40], 50, 2)).toEqual([60, 40]);
        expect(pinchRange([0, Number.NaN], 50, 2)).toEqual([0, Number.NaN]);
    });

    it("clamps a zoom-out at either edge of the extent", () => {
        expect(pinchRange([25, 75], 70, 0.5)).toEqual([0, 100]);
        expect(pinchRange([25, 75], 30, 0.5)).toEqual([0, 100]);
    });
});
