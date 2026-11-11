import { describe, expect, it } from "vitest";

import { failureOwnerForSequence } from "./video-sections";

describe("failureOwnerForSequence", () => {
    it("maps a failed sequence to the card that configures it", () => {
        expect(failureOwnerForSequence("NoiseDetector")).toBe("noise-generation");
        expect(failureOwnerForSequence("ParallelEncoder")).toBe("encoding");
    });

    it("gives a failure before the first sequence to General", () => {
        expect(failureOwnerForSequence(null)).toBe("general");
    });

    it("gives Benchmarker to Encoding even though it has no row of its own", () => {
        expect(failureOwnerForSequence("Benchmarker")).toBe("encoding");
    });

    it("leaves a sequence no current card names to the defensive page fallback", () => {
        expect(failureOwnerForSequence("AnUnexpectedSequence")).toBeNull();
    });
});
