import { describe, expect, it } from "vitest";

import { MAX_PREVIEW_LEAD_SECONDS, mayPrepareScene, withinPreviewLead } from "./preview-buffer";

describe("preview lead", () => {
    it("prepares a scene inside the lead", () => {
        expect(withinPreviewLead(24 * 30, 0, 24)).toBe(true);
    });

    it("prepares a scene exactly at the lead", () => {
        expect(withinPreviewLead(24 * MAX_PREVIEW_LEAD_SECONDS, 0, 24)).toBe(true);
    });

    it("does not prepare a scene past the lead", () => {
        expect(withinPreviewLead(24 * (MAX_PREVIEW_LEAD_SECONDS + 1), 0, 24)).toBe(false);
    });

    it("measures the lead from the playhead, not from the start of the video", () => {
        const sceneStart = 24 * 200;
        expect(withinPreviewLead(sceneStart, sceneStart - 24 * 59, 24)).toBe(true);
        expect(withinPreviewLead(sceneStart, sceneStart - 24 * 61, 24)).toBe(false);
    });

    it("allows the scene when the frame rate is unknown", () => {
        expect(withinPreviewLead(1_000, 0, null)).toBe(true);
        expect(withinPreviewLead(1_000, 0, 0)).toBe(true);
    });

    it("prepares only the scene after the playhead's own", () => {
        const base = { through: 24 * 5, playhead: 0, frameRate: 24 } as const;
        expect(mayPrepareScene({ ...base, next: 1, played: 0 })).toBe(true);
        expect(mayPrepareScene({ ...base, next: 2, played: 0 })).toBe(false);
        expect(mayPrepareScene({ ...base, next: 3, played: 2 })).toBe(true);
    });

    it("measures the appended picture, not only its first frame", () => {
        // A two-minute scene starting ten seconds ahead would buffer two minutes, so it
        // waits for its own cut even though its first frame is inside the lead.
        const nextStart = 24 * 10;
        expect(
            mayPrepareScene({
                next: 1,
                played: 0,
                through: nextStart + 24 * 120,
                playhead: 0,
                frameRate: 24,
            }),
        ).toBe(false);
    });
});
