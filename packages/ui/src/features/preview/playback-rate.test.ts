import { describe, expect, it } from "vitest";

import { RateGovernor } from "./playback-rate";

const FRAME = 1 / 24;

/** Present `count` frames one interval apart, starting at `mediaTime`. */
function present(governor: RateGovernor, count: number, at = 0, from = 0): number[] {
    const changes: number[] = [];
    for (let index = 0; index < count; index += 1) {
        const mediaTime = from + index * FRAME;
        const next = governor.frame(mediaTime, at + index * (FRAME * 1000));
        if (next !== null) {
            changes.push(next);
        }
    }
    return changes;
}

describe("RateGovernor", () => {
    it("leaves a clean stream at full speed", () => {
        const governor = new RateGovernor(FRAME);
        expect(present(governor, 120)).toEqual([]);
        expect(governor.rate).toBe(1);
    });

    it("slows when a frame is skipped", () => {
        const governor = new RateGovernor(FRAME);
        present(governor, 10);
        // One frame interval doubled: the compositor presented every other frame.
        const next = governor.frame(9 * FRAME + 2 * FRAME, 400);
        expect(next).toBe(0.95);
        expect(governor.rate).toBe(0.95);
    });

    it("steps down once per quarter second and stops at the floor", () => {
        const governor = new RateGovernor(FRAME, { floor: 0.9 });
        present(governor, 4);
        // A burst of skipped frames during one decoding hiccup.
        const changes: number[] = [];
        for (let index = 0; index < 40; index += 1) {
            const next = governor.frame(4 * FRAME + index * 2 * FRAME, 200 + index * 10);
            if (next !== null) {
                changes.push(next);
            }
        }
        expect(changes).toEqual([0.95, 0.9]);
    });

    it("recovers to full speed after a quiet period", () => {
        const governor = new RateGovernor(FRAME);
        present(governor, 4);
        governor.frame(4 * FRAME + 2 * FRAME, 300);
        expect(governor.rate).toBe(0.95);
        const changes = present(governor, 100, 2400, 6 * FRAME);
        expect(changes.at(-1)).toBe(1);
        expect(governor.rate).toBe(1);
    });

    it("steps down at once when the compositor reports a dropped frame", () => {
        const governor = new RateGovernor(FRAME);
        present(governor, 10);
        // A reported drop is not an interval gap: it must slow even inside the gap window.
        expect(governor.skip(300)).toBe(0.95);
        expect(governor.skip(310)).toBeNull();
        expect(governor.skip(500)).toBe(0.9);
        expect(governor.rate).toBe(0.9);
    });

    it("does not mistake a seek for a skip", () => {
        const governor = new RateGovernor(FRAME);
        present(governor, 10);
        expect(governor.frame(4.5, 500)).toBeNull();
        expect(governor.rate).toBe(1);
        // A backwards seek is not a skip either.
        present(governor, 5, 600, 0);
        expect(governor.rate).toBe(1);
    });
});
