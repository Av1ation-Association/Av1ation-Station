import { describe, expect, it } from "vitest";

import { clockParts } from "./clock";

describe("clockParts", () => {
    it("rounds to the requested precision before splitting", () => {
        expect(clockParts(59.96, 1)).toEqual({
            hours: 0,
            minutes: 1,
            seconds: 0,
            fraction: "0",
        });
        expect(clockParts(59.9996, 3)).toEqual({
            hours: 0,
            minutes: 1,
            seconds: 0,
            fraction: "000",
        });
        expect(clockParts(3_599.96, 1)).toEqual({
            hours: 1,
            minutes: 0,
            seconds: 0,
            fraction: "0",
        });
    });

    it("keeps whole seconds and empty fractions at precision zero", () => {
        expect(clockParts(0, 0)).toEqual({
            hours: 0,
            minutes: 0,
            seconds: 0,
            fraction: "",
        });
        expect(clockParts(468, 0)).toEqual({
            hours: 0,
            minutes: 7,
            seconds: 48,
            fraction: "",
        });
    });

    it("refuses a negative or non-finite value", () => {
        expect(clockParts(-1, 1)).toBeNull();
        expect(clockParts(Number.NaN, 1)).toBeNull();
        expect(clockParts(Number.POSITIVE_INFINITY, 1)).toBeNull();
    });
});
