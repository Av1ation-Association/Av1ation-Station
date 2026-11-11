import { afterEach, describe, expect, it, vi } from "vitest";

import { SeekQueue } from "./preview-seek";

afterEach(() => {
    vi.useRealTimers();
});

function recorder() {
    const written: number[] = [];
    const queue = new SeekQueue((seconds) => written.push(seconds), 90);
    return { written, queue };
}

describe("SeekQueue", () => {
    it("writes one target for a whole scrub", () => {
        vi.useFakeTimers();
        const { written, queue } = recorder();
        for (const target of [8, 7.5, 6.9, 6.4, 6]) {
            queue.request(target);
        }
        expect(written).toEqual([]);
        vi.advanceTimersByTime(90);
        expect(written).toEqual([6]);
    });

    it("writes a discrete step without waiting", () => {
        const { written, queue } = recorder();
        queue.jump(3.25);
        expect(written).toEqual([3.25]);
    });

    it("holds a scrub until the running walk ends", () => {
        vi.useFakeTimers();
        const { written, queue } = recorder();
        queue.jump(9);
        queue.busy();
        queue.request(4);
        vi.advanceTimersByTime(500);
        expect(written).toEqual([9]);
        queue.settle(9, 0.04);
        expect(written).toEqual([9, 4]);
    });

    it("drops a target the walk already landed on", () => {
        vi.useFakeTimers();
        const { written, queue } = recorder();
        queue.jump(9);
        queue.busy();
        queue.request(9.01);
        vi.advanceTimersByTime(500);
        queue.settle(9, 0.04);
        expect(written).toEqual([9]);
    });

    it("forgets a pending target when the source goes away", () => {
        vi.useFakeTimers();
        const { written, queue } = recorder();
        queue.request(2);
        queue.cancel();
        vi.advanceTimersByTime(500);
        expect(written).toEqual([]);
    });
});
