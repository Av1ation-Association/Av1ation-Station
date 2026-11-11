import { describe, expect, it } from "vitest";

import { draftChanges } from "./UnsavedChanges";

describe("draftChanges", () => {
    it("names an optional section that the draft enables", () => {
        const saved = { sequences: { quality_check: null } };
        const draft = {
            sequences: { quality_check: { enabled: true, metric: "SSIMULACRA2" } },
        };

        expect(draftChanges(draft, saved)).toEqual([
            { label: "Quality Check", from: "Not set", to: "Set" },
        ]);
    });

    it("names an optional section that the draft disables", () => {
        const saved = { sequences: { quality_check: { enabled: true } } };
        const draft = { sequences: { quality_check: null } };

        expect(draftChanges(draft, saved)).toEqual([
            { label: "Quality Check", from: "Set", to: "Not set" },
        ]);
    });

    it("still reports a changed leaf as its old and new value", () => {
        const saved = { sequences: { scene_detector: { threshold: 1 } } };
        const draft = { sequences: { scene_detector: { threshold: 2 } } };

        expect(draftChanges(draft, saved)).toEqual([{ label: "Threshold", from: "1", to: "2" }]);
    });
});
