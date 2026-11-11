// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type { PreviewStream } from "./preview-stream";
import { usePreviewPrefetch } from "./use-preview-prefetch";

type Options = Parameters<typeof usePreviewPrefetch>[0];

function fakeStream(append = vi.fn()) {
    return {
        supportsAppend: true,
        append,
    } as unknown as PreviewStream;
}

function useHarness(overrides: Partial<Options> = {}) {
    const videoRef = useRef<HTMLVideoElement | null>(document.createElement("video"));
    const streamRef = useRef<PreviewStream | null>(null);
    const coverage = useRef<{ from: number | null; to: number | null }>({
        from: null,
        to: null,
    });
    const prefetch = usePreviewPrefetch({
        source: "decoded",
        url: "http://media.test/api/projects/p/videos/v/media?source=decoded&frame=0",
        ready: true,
        chunkReady: true,
        chunkScene: null,
        sceneIndex: null,
        sceneStarts: [],
        sceneEnds: [],
        encoderFingerprints: [],
        scenesQuery: "",
        encodeFrom: "decoded",
        anchor: 0,
        frameRate: 24,
        streamStart: 0,
        windowFrames: 144,
        totalFrames: 1000,
        playhead: 0,
        currentTime: 0,
        bufferedEnd: 0,
        coverage,
        videoRef,
        streamRef,
        ...overrides,
    });
    return { prefetch, videoRef, streamRef, coverage };
}

describe("usePreviewPrefetch", () => {
    it("appends the next decoded window at the right timeline offset", () => {
        const append = vi.fn();
        const harness = renderHook(() => useHarness());
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        act(() => harness.result.current.prefetch.prefetchNextWindow());

        expect(append).toHaveBeenCalledTimes(1);
        const [target, offset] = append.mock.calls[0] as [string, number];
        expect(target).toContain("frame=144");
        expect(target).toContain("frames=144");
        expect(offset).toBe(6);
    });

    it("does not request the same window twice", () => {
        const append = vi.fn();
        const harness = renderHook(() => useHarness());
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        act(() => harness.result.current.prefetch.prefetchNextWindow());
        act(() => harness.result.current.prefetch.prefetchNextWindow());

        expect(append).toHaveBeenCalledTimes(1);
    });

    it("does nothing for a source that is not decoded", () => {
        const append = vi.fn();
        const harness = renderHook(() => useHarness({ source: "original" }));
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        act(() => harness.result.current.prefetch.prefetchNextWindow());

        expect(append).not.toHaveBeenCalled();
    });

    it("resets coverage to the scene the new URL opened at", () => {
        const harness = renderHook(() =>
            useHarness({ source: "encode", chunkScene: 2, sceneIndex: 2 }),
        );

        expect(harness.result.current.coverage.current).toEqual({
            from: 2,
            to: 2,
        });
    });
});
