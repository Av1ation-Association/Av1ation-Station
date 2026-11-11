// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePreviewBuffering } from "./use-preview-buffering";

afterEach(() => {
    vi.restoreAllMocks();
});

function mediaWithBuffer(start: number, end: number) {
    const element = document.createElement("video");
    Object.defineProperty(element, "buffered", {
        configurable: true,
        value: {
            length: 1,
            start: () => start,
            end: () => end,
        },
    });
    return element;
}

describe("usePreviewBuffering", () => {
    it("publishes an appended range and smooths its throughput", () => {
        const now = vi.spyOn(performance, "now").mockReturnValue(1000);
        const videoRef = { current: mediaWithBuffer(0, 0) };
        const { result } = renderHook(() => usePreviewBuffering({ url: "stream", videoRef }));

        act(() => result.current.reportBuffer({ start: 0, end: 1 }));
        expect(result.current.bufferedEnd).toBe(1);
        expect(result.current.bufferRange).toEqual({ start: 0, end: 1 });
        expect(result.current.throughput).toBeNull();

        now.mockReturnValue(3000);
        act(() => result.current.reportBuffer({ start: 0, end: 3 }));
        expect(result.current.bufferedEnd).toBe(3);
        expect(result.current.throughput).toBeCloseTo(1);
    });

    it("measures the retained range and the seconds ahead of the playhead", () => {
        const video = mediaWithBuffer(2, 7);
        const videoRef = { current: video };
        const { result } = renderHook(() => usePreviewBuffering({ url: "stream", videoRef }));

        act(() => result.current.measureBuffered(video));
        expect(result.current.bufferRange).toEqual({ start: 2, end: 7 });

        video.currentTime = 5;
        expect(result.current.leadAhead(video)).toBe(2);
    });

    it("resets the previous element's range", () => {
        const videoRef = { current: mediaWithBuffer(0, 0) };
        const { result } = renderHook(() => usePreviewBuffering({ url: "stream", videoRef }));

        act(() => result.current.reportBuffer({ start: 1, end: 4 }));
        act(() => result.current.resetBuffer());
        expect(result.current.bufferedEnd).toBe(0);
        expect(result.current.bufferRange).toEqual({ start: 0, end: 0 });
        expect(result.current.throughput).toBeNull();
    });

    it("creates one seek queue per element and writes a discrete jump at once", () => {
        const video = mediaWithBuffer(0, 10);
        const videoRef = { current: video };
        const { result } = renderHook(() => usePreviewBuffering({ url: "stream", videoRef }));

        expect(result.current.seekQueue.current).not.toBeNull();
        act(() => result.current.seekQueue.current?.jump(12));
        expect(video.currentTime).toBe(12);
    });
});
