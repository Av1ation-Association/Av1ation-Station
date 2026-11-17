import { expect, it } from "vitest";

import { clampZoom, steppedZoom, ZOOM_MAX, ZOOM_MIN } from "./webview-zoom";

it("clamps a zoom to the range the host accepts", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(4)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
});

it("steps in tenths without drifting", () => {
    expect(steppedZoom(1, "in")).toBe(1.1);
    expect(steppedZoom(1.1, "out")).toBe(1);
    expect(steppedZoom(ZOOM_MIN, "out")).toBe(ZOOM_MIN);
    expect(steppedZoom(ZOOM_MAX, "in")).toBe(ZOOM_MAX);
    expect(steppedZoom(0.7, "in")).toBe(0.8);
});
