// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePreviewTransport } from "./use-preview-transport";

function renderTransport(overrides: Partial<Parameters<typeof usePreviewTransport>[0]> = {}) {
    const seekToFrame = vi.fn();
    const hook = renderHook(() =>
        usePreviewTransport({
            source: "decoded",
            totalFrames: 240,
            frameRate: 24,
            muted: false,
            volume: 0.5,
            seekToFrame,
            ...overrides,
        }),
    );
    return { ...hook, seekToFrame };
}

describe("usePreviewTransport", () => {
    it("reports the source, its last frame, and the audible volume", () => {
        const { result } = renderTransport();

        expect(result.current.status.label).toBe("Decoded");
        expect(result.current.lastFrame).toBe(239);
        expect(result.current.volumePercent).toBe(50);
    });

    it("reports silence while muted and no last frame for an empty video", () => {
        const muted = renderTransport({ muted: true });
        const empty = renderTransport({ totalFrames: 0 });

        expect(muted.result.current.volumePercent).toBe(0);
        expect(empty.result.current.lastFrame).toBeNull();
    });

    it("commits a frame inside the video and rejects one past its end", () => {
        const frame = renderTransport();
        act(() => frame.result.current.setFrameDraft("100"));
        act(() => frame.result.current.commitFrame());

        expect(frame.seekToFrame).toHaveBeenCalledWith(100);
        expect(frame.result.current.frameDraft).toBeNull();

        act(() => frame.result.current.setFrameDraft("240"));
        act(() => frame.result.current.commitFrame());

        expect(frame.seekToFrame).toHaveBeenCalledTimes(1);
        expect(frame.result.current.frameDraft).toBeNull();
    });

    it("rejects text that is not a frame number", () => {
        const frame = renderTransport();
        act(() => frame.result.current.setFrameDraft("1.5"));
        act(() => frame.result.current.commitFrame());

        expect(frame.seekToFrame).not.toHaveBeenCalled();
    });

    it("parses a typed timecode into a frame", () => {
        const timecode = renderTransport();
        act(() => timecode.result.current.setTimecodeDraft("00:00:02.0"));
        act(() => timecode.result.current.commitTimecode());

        expect(timecode.seekToFrame).toHaveBeenCalledWith(48);
        expect(timecode.result.current.timecodeDraft).toBeNull();
    });

    it("tracks which transport menu is open", () => {
        const { result } = renderTransport();

        act(() => result.current.setSourceOpen(true));
        expect(result.current.sourceOpen).toBe(true);
        expect(result.current.soundOpen).toBe(false);

        act(() => result.current.setSoundOpen(true));
        expect(result.current.soundOpen).toBe(true);
        expect(result.current.sourceRoot.current).toBeNull();
    });
});
