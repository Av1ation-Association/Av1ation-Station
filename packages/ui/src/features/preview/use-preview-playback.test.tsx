// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initialPreviewPlan } from "./preview-buffer-plan";
import type { SeekQueue } from "./preview-seek";
import type { PreviewStream } from "./preview-stream";
import { usePreviewPlayback } from "./use-preview-playback";

type Options = Parameters<typeof usePreviewPlayback>[0];

const noop = () => {};
const elementTimeForFrame = (frame: number) => frame / 24;
const frameAtElementTime = (time: number) => Math.round(time * 24);

function useHarness(overrides: Partial<Options> = {}) {
    const [playbackRate, setPlaybackRate] = useState(1);
    const [, setStreamStart] = useState(0);
    const [, setStreamEpoch] = useState(0);
    const [, setOpenScene] = useState<number | null>(null);
    const coverage = useRef<{ from: number | null; to: number | null }>({
        from: 0,
        to: 0,
    });
    const seekQueue = useRef<SeekQueue | null>(null);
    const streamRef = useRef<PreviewStream | null>(null);
    const plan = useRef(initialPreviewPlan(2));
    const videoRef = useRef<HTMLVideoElement | null>(document.createElement("video"));
    const audioRef = useRef<HTMLAudioElement | null>(document.createElement("audio"));
    const audioHeld = useRef(false);
    const mediaStart = useRef(0);

    const playback = usePreviewPlayback({
        source: "original",
        url: "http://media.test/video",
        playhead: 0,
        onSeek: noop,
        frameRate: 24,
        totalFrames: 240,
        playbackRate,
        setPlaybackRate,
        anchor: 0,
        chunkScene: null,
        sceneIndex: null,
        sceneStarts: [],
        sceneEnds: [],
        streamStart: 0,
        setStreamStart,
        setStreamEpoch,
        setOpenScene,
        coverage,
        windowFrames: 48,
        bufferedEnd: 0,
        bufferRange: { start: 0, end: 0 },
        throughput: null,
        leadAhead: () => 0,
        resetBuffer: noop,
        reportBuffer: noop,
        seekQueue,
        streamRef,
        videoRef,
        plan,
        audioRef,
        audioHeld,
        syncAudio: noop,
        audioOffset: 0,
        mediaStart,
        frameAtElementTime,
        elementTimeForFrame,
        resetView: noop,
        ...overrides,
    });

    return { playback, videoRef, audioRef };
}

beforeAll(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("usePreviewPlayback", () => {
    it("derives the seek span, position, and buffered fraction", () => {
        const { result } = renderHook(() =>
            useHarness({
                playhead: 48,
                bufferedEnd: 5,
                bufferRange: { start: 1, end: 5 },
            }),
        );

        expect(result.current.playback.seekDuration).toBe(10);
        expect(result.current.playback.currentFrame).toBe(48);
        expect(result.current.playback.bufferedFrom).toBe(0.1);
        expect(result.current.playback.bufferedTo).toBe(0.5);
        expect(result.current.playback.canPlay).toBe(true);
    });

    it("seeks by frame and by scene from the playhead", () => {
        const onSeek = vi.fn();
        const { result } = renderHook(() =>
            useHarness({
                playhead: 120,
                onSeek,
                sceneStarts: [0, 120, 200],
                sceneEnds: [120, 200, 240],
            }),
        );

        act(() => result.current.playback.stepFrame(1));
        act(() => result.current.playback.seekToFrame(24));
        act(() => result.current.playback.stepScene(-1));

        expect(onSeek.mock.calls).toEqual([[121], [24], [0]]);
    });

    it("clamps a direct seek at the first frame", () => {
        const onSeek = vi.fn();
        const { result } = renderHook(() => useHarness({ onSeek }));

        act(() => result.current.playback.seekToFrame(-4));

        expect(onSeek).toHaveBeenCalledWith(0);
    });

    it("toggles the element instead of storing a second play state", () => {
        const { result } = renderHook(() => useHarness());
        const video = result.current.videoRef.current;

        expect(video).not.toBeNull();
        act(() => result.current.playback.togglePlay());

        expect(video?.play).toHaveBeenCalledTimes(1);
        expect(result.current.playback.playing).toBe(false);
    });

    it("cannot play without a URL", () => {
        const { result } = renderHook(() => useHarness({ url: null }));

        expect(result.current.playback.canPlay).toBe(false);
    });

    it("holds an encoded source until its chunk is buffered", () => {
        const { result } = renderHook(() =>
            useHarness({
                source: "encode",
                chunkScene: 0,
                sceneStarts: [0, 120],
                sceneEnds: [120, 240],
                bufferedEnd: 1,
            }),
        );

        expect(result.current.playback.encodedChunkEnd).toBe(5);
        expect(result.current.playback.chunkReady).toBe(false);
        expect(result.current.playback.canPlay).toBe(false);
    });

    it("clears a decoded stage without waiting for a buffer lead", () => {
        const { result } = renderHook(() =>
            useHarness({
                source: "decoded",
                playhead: 0,
                totalFrames: 240,
                frameRate: 24,
            }),
        );

        expect(result.current.playback.ready).toBe(false);
        act(() => result.current.playback.markReady());
        expect(result.current.playback.ready).toBe(true);
    });

    it("presents decoded frames instead of holding when the buffer runs dry", () => {
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() =>
                useHarness({
                    source: "decoded",
                    playhead: 0,
                    totalFrames: 240,
                    frameRate: 24,
                    leadAhead: () => 0.05,
                }),
            );
            const element = result.current.videoRef.current;
            Object.defineProperty(element, "paused", { configurable: true, value: false });

            act(() => result.current.playback.setPlaying(true));
            act(() => vi.advanceTimersByTime(200));

            expect(result.current.playback.held).toBe(false);
            expect(element?.pause).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("holds an encoded chunk until its lead is refilled", () => {
        vi.useFakeTimers();
        try {
            let lead = 0.05;
            const { result } = renderHook(() =>
                useHarness({
                    source: "encode",
                    playhead: 0,
                    totalFrames: 240,
                    frameRate: 24,
                    leadAhead: () => lead,
                }),
            );
            const element = result.current.videoRef.current;
            Object.defineProperty(element, "paused", { configurable: true, value: false });

            act(() => result.current.playback.setPlaying(true));
            act(() => vi.advanceTimersByTime(200));
            expect(result.current.playback.held).toBe(true);

            lead = 1;
            act(() => vi.advanceTimersByTime(200));
            expect(result.current.playback.held).toBe(false);
            expect(element?.play).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("becomes ready again only for the URL that reported it", () => {
        const { result, rerender } = renderHook(({ url }: { url: string }) => useHarness({ url }), {
            initialProps: { url: "http://media.test/one" },
        });

        act(() => result.current.playback.markReady());
        expect(result.current.playback.ready).toBe(true);

        rerender({ url: "http://media.test/two" });
        expect(result.current.playback.ready).toBe(false);
    });
});
