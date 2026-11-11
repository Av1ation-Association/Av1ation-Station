import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pairingCountdown } from "./pairing-countdown";

describe("pairingCountdown", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows the wait one second at a time and finishes once", () => {
        const seen: number[] = [];
        const done = vi.fn();
        pairingCountdown(3, (remaining) => seen.push(remaining), done);
        expect(seen).toEqual([3]);
        vi.advanceTimersByTime(1000);
        expect(seen).toEqual([3, 2]);
        vi.advanceTimersByTime(1000);
        expect(seen).toEqual([3, 2, 1]);
        expect(done).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(done).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(5000);
        expect(done).toHaveBeenCalledTimes(1);
    });

    it("stops ticking when the returned function is called", () => {
        const onTick = vi.fn();
        const onDone = vi.fn();
        const stop = pairingCountdown(5, onTick, onDone);
        stop();
        vi.advanceTimersByTime(5000);
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onDone).not.toHaveBeenCalled();
    });

    it("never shows less than one second", () => {
        const seen: number[] = [];
        const done = vi.fn();
        pairingCountdown(0, (remaining) => seen.push(remaining), done);
        expect(seen).toEqual([1]);
        vi.advanceTimersByTime(1000);
        expect(done).toHaveBeenCalledTimes(1);
    });
});
