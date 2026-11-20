// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialPreviewPlan, type PreviewBufferPlan } from "./preview-buffer-plan";
import type { PreviewStream } from "./preview-stream";
import { usePreviewPrefetch } from "./use-preview-prefetch";

type Options = Parameters<typeof usePreviewPrefetch>[0];

function fakeStream(append = vi.fn(), loadingUrl: string | null = null) {
    return {
        supportsAppend: true,
        append,
        loadingUrl,
    } as unknown as PreviewStream;
}

/** An element whose retained range and playhead can be described without media APIs. */
function fakeVideo(bufferedEnd = 0, currentTime = 0, paused = true) {
    const element = document.createElement("video");
    Object.defineProperty(element, "buffered", {
        configurable: true,
        value: {
            length: bufferedEnd > 0 ? 1 : 0,
            start: () => 0,
            end: () => bufferedEnd,
        },
    });
    Object.defineProperty(element, "currentTime", {
        configurable: true,
        writable: true,
        value: currentTime,
    });
    Object.defineProperty(element, "paused", {
        configurable: true,
        value: paused,
    });
    // A playable element: the start-up fill path keys off `readyState < 3`.
    Object.defineProperty(element, "readyState", {
        configurable: true,
        value: 4,
    });
    return element;
}

/**
 * Let the paused player fill its planned lead, reporting each window as it lands. A warm
 * may start as soon as the appended horizon is in the buffer, even while another window is
 * queued: the builder then has the next window ready while the current one downloads.
 */
function fillLead(harness: { result: { current: ReturnType<typeof useHarness> } }) {
    for (const end of [4, 6, 8, 10]) {
        harness.result.current.videoRef.current = fakeVideo(end);
        act(() => harness.result.current.prefetch.prefetchNextWindow());
    }
}

function useHarness(
    overrides: Partial<Options> = {},
    bufferedEnd = 0,
    currentTime = 0,
    paused = true,
) {
    const videoRef = useRef<HTMLVideoElement | null>(fakeVideo(bufferedEnd, currentTime, paused));
    const streamRef = useRef<PreviewStream | null>(null);
    const coverage = useRef<{ from: number | null; to: number | null }>({
        from: null,
        to: null,
    });
    const plan = useRef<PreviewBufferPlan>(initialPreviewPlan(2));
    const noteWindow = vi.fn();
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
        windowFrames: 48,
        totalFrames: 1000,
        playhead: 0,
        currentTime,
        bufferedEnd: 0,
        coverage,
        videoRef,
        streamRef,
        plan,
        noteWindow,
        ...overrides,
    });
    return { prefetch, videoRef, streamRef, coverage, plan, noteWindow };
}

beforeEach(() => {
    // A warm is a real request whose body is drained; an empty successful response is all
    // the hook needs to treat it as a finished build.
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(new Uint8Array(0))),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("usePreviewPrefetch", () => {
    it("starts the next window with the one the element is opening", () => {
        const append = vi.fn();
        const streamRef = { current: fakeStream(append) };

        renderHook(() => useHarness({ streamRef }));

        expect(append).toHaveBeenCalledTimes(1);
        const [target, offset] = append.mock.calls[0] as [string, number];
        expect(target).toContain("frame=48");
        expect(target).toContain("frames=48");
        expect(offset).toBe(2);
    });

    it("warms while the last appended window is still loading", async () => {
        const append = vi.fn();
        const base = "http://media.test/api/projects/p/videos/v/media?source=decoded";
        const streamRef = { current: fakeStream(append, `${base}&frame=48&frames=48`) };
        const plan = { current: { ...initialPreviewPlan(2), pausedPrebuildWindows: 4 } };

        renderHook(() => useHarness({ plan, streamRef }));

        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
        const fetched = vi
            .mocked(fetch)
            .mock.calls.map(([input]) => new URL(String(input)).searchParams.get("frame"));
        // A warm queues behind the appended horizon while it is still loading.
        expect(fetched).toEqual(["96", "144", "192", "240", "288"]);
    });

    it("does not warm while playing, so the append is not queued behind a build", () => {
        const append = vi.fn();
        const base = "http://media.test/api/projects/p/videos/v/media?source=decoded";
        const streamRef = { current: fakeStream(append, `${base}&frame=48&frames=48`) };

        renderHook(() => useHarness({ streamRef }, 2, 0, false));

        expect(fetch).not.toHaveBeenCalled();
    });

    it("appends the next two-second window at the right timeline offset", () => {
        const append = vi.fn();
        const harness = renderHook(() => useHarness());
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        act(() => harness.result.current.prefetch.prefetchNextWindow());

        expect(append).toHaveBeenCalledTimes(1);
        const [target, offset] = append.mock.calls[0] as [string, number];
        expect(target).toContain("frame=48");
        expect(target).toContain("frames=48");
        expect(offset).toBe(2);
    });

    it("queues the following window without repeating one", () => {
        const append = vi.fn();
        const harness = renderHook(() => useHarness());
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        act(() => harness.result.current.prefetch.prefetchNextWindow());
        act(() => harness.result.current.prefetch.prefetchNextWindow());

        const frames = (append.mock.calls as [string, number][]).map(([target]) =>
            new URL(target).searchParams.get("frame"),
        );
        expect(frames).toEqual(["48", "96"]);
    });

    it("fills the planned lead while the element is paused", () => {
        const append = vi.fn();
        const streamRef = { current: fakeStream(append) };
        const harness = renderHook(() => useHarness({ streamRef }));

        // The paused lead reserves one window for the append that playback will need.
        act(() => harness.result.current.prefetch.prefetchNextWindow());
        act(() => harness.result.current.prefetch.prefetchNextWindow());
        act(() => harness.result.current.prefetch.prefetchNextWindow());

        const frames = (append.mock.calls as [string, number][]).map(([target]) =>
            new URL(target).searchParams.get("frame"),
        );
        expect(frames).toEqual(["48", "96"]);
    });

    it("caps the paused fill so the next append still fits", () => {
        const append = vi.fn();
        const plan = { current: { ...initialPreviewPlan(2), pausedLeadSeconds: 22 } };
        const harness = renderHook(() =>
            useHarness({ plan, streamRef: { current: fakeStream(append) } }),
        );

        for (let call = 0; call < 5; call += 1) {
            act(() => harness.result.current.prefetch.prefetchNextWindow());
        }

        const frames = (append.mock.calls as [string, number][]).map(([target]) =>
            new URL(target).searchParams.get("frame"),
        );
        expect(frames).toEqual(["48", "96"]);
    });

    it("warms the whole paused runway", async () => {
        const append = vi.fn();
        const plan = { current: { ...initialPreviewPlan(2), pausedPrebuildWindows: 8 } };
        const harness = renderHook(() =>
            useHarness({ plan, streamRef: { current: fakeStream(append) } }),
        );

        fillLead(harness);

        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
        const fetched = vi
            .mocked(fetch)
            .mock.calls.map(([input]) => new URL(String(input)).searchParams.get("frame"));
        expect(fetched).toEqual(["144", "192", "240", "288", "336", "384", "432", "480"]);
    });

    it("does not spend the paused runway while playing", () => {
        const append = vi.fn();
        const base = "http://media.test/api/projects/p/videos/v/media?source=decoded";
        const plan = { current: { ...initialPreviewPlan(2), pausedPrebuildWindows: 8 } };
        const harness = renderHook(() =>
            useHarness(
                { plan, streamRef: { current: fakeStream(append, `${base}&frame=48&frames=48`) } },
                0,
                0,
                false,
            ),
        );

        expect(fetch).not.toHaveBeenCalled();
        expect(harness.result.current.prefetch).toBeDefined();
    });

    it("aborts the paused runway when playback starts", async () => {
        const append = vi.fn();
        const base = "http://media.test/api/projects/p/videos/v/media?source=decoded";
        const streamRef = {
            current: fakeStream(append, `${base}&frame=48&frames=48`),
        };
        let signal: AbortSignal | undefined;
        vi.stubGlobal(
            "fetch",
            vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
                signal = init?.signal ?? undefined;
                return new Promise<Response>(() => undefined);
            }),
        );
        const plan = { current: { ...initialPreviewPlan(2), pausedPrebuildWindows: 3 } };
        const harness = renderHook(() => useHarness({ plan, streamRef }, 4, 0, true));

        await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
        expect(signal?.aborted).toBe(false);

        const element = harness.result.current.videoRef.current;
        if (element === null) {
            throw new Error("the harness has no video element");
        }
        harness.result.current.videoRef.current = fakeVideo(4, element.currentTime, false);
        act(() => harness.result.current.prefetch.prefetchNextWindow());

        expect(signal?.aborted).toBe(true);
    });

    it("appends the following window once the retained lead comes down", () => {
        const append = vi.fn();
        const harness = renderHook(() => useHarness({}, 4, 0.5));
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        act(() => harness.result.current.prefetch.prefetchNextWindow());
        act(() => harness.result.current.prefetch.prefetchNextWindow());

        const frames = (append.mock.calls as [string, number][]).map(([target]) =>
            new URL(target).searchParams.get("frame"),
        );
        expect(frames).toEqual(["48", "96"]);
    });

    it("queues the next window a window before the playing lead drains", () => {
        const append = vi.fn();
        const streamRef = { current: fakeStream(append) };
        const plan = {
            current: {
                ...initialPreviewPlan(2),
                leadSeconds: 2,
                pausedLeadSeconds: 6,
                prebuildWindows: 2,
                pausedPrebuildWindows: 2,
            },
        };

        renderHook(() => useHarness({ plan, streamRef }, 3, 0.5, false));

        expect(append).toHaveBeenCalledTimes(1);
        const [target] = append.mock.calls[0] as [string, number];
        expect(target).toContain("frame=48");
    });

    it("runs the scheduler as the playhead advances", () => {
        const append = vi.fn();
        const streamRef = { current: fakeStream(append) };
        const plan = {
            current: {
                ...initialPreviewPlan(2),
                leadSeconds: 2,
                pausedLeadSeconds: 6,
                prebuildWindows: 2,
                pausedPrebuildWindows: 2,
            },
        };
        const { rerender, result } = renderHook(
            ({ at }) => useHarness({ plan, streamRef }, 6, at, false),
            { initialProps: { at: 0 } },
        );
        append.mockClear();

        const video = result.current.videoRef.current;
        if (video === null) {
            throw new Error("the harness has no video element");
        }
        video.currentTime = 5.5;
        rerender({ at: 5.5 });

        expect(append).toHaveBeenCalledTimes(1);
        const [target] = append.mock.calls[0] as [string, number];
        expect(target).toContain("frame=48");
    });

    it("warms once the appended horizon is in the buffer", async () => {
        const append = vi.fn();
        const plan = { current: { ...initialPreviewPlan(2), pausedPrebuildWindows: 3 } };
        const harness = renderHook(() => useHarness({ plan }));
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        // No warm before there is an append: a request now could reach the service before
        // the opening window and delay the seam.
        expect(fetch).not.toHaveBeenCalled();

        fillLead(harness);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
        const fetched = vi
            .mocked(fetch)
            .mock.calls.map(([input]) => new URL(String(input)).searchParams.get("frame"));
        expect(fetched).toEqual(["96", "144", "192", "240"]);
    });

    it("builds the runway the plan asks for beyond the append horizon", async () => {
        const append = vi.fn();
        const plan = {
            current: {
                ...initialPreviewPlan(2),
                prebuildWindows: 5,
                pausedPrebuildWindows: 5,
            },
        };
        const harness = renderHook(() => useHarness({ plan }));
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        fillLead(harness);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
        const fetched = vi
            .mocked(fetch)
            .mock.calls.map(([input]) => new URL(String(input)).searchParams.get("frame"));
        expect(fetched).toEqual(["96", "144", "192", "240", "288", "336"]);
    });

    it("reports a completed warm's build time and bytes to the plan", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(new Uint8Array(4096))),
        );
        const harness = renderHook(() => useHarness());
        act(() => {
            harness.result.current.streamRef.current = fakeStream();
        });

        fillLead(harness);
        await vi.waitFor(() => expect(harness.result.current.noteWindow).toHaveBeenCalled());

        expect(harness.result.current.noteWindow).toHaveBeenCalledWith({
            buildSeconds: expect.any(Number),
            bytes: 4096,
            windowSeconds: 2,
        });
    });

    it("builds three windows beyond the append horizon without appending them", async () => {
        const append = vi.fn();
        const plan = { current: { ...initialPreviewPlan(2), pausedPrebuildWindows: 3 } };
        const harness = renderHook(() => useHarness({ plan }));
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        fillLead(harness);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));

        expect(append).toHaveBeenCalledTimes(2);
        const fetched = vi
            .mocked(fetch)
            .mock.calls.map(([input]) => new URL(String(input)).searchParams.get("frame"));
        expect(fetched).toEqual(["96", "144", "192", "240"]);
    });

    it("does nothing for a source that is not decoded", () => {
        const append = vi.fn();
        const harness = renderHook(() => useHarness({ source: "original" }));
        act(() => {
            harness.result.current.streamRef.current = fakeStream(append);
        });

        act(() => harness.result.current.prefetch.prefetchNextWindow());

        expect(append).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
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
