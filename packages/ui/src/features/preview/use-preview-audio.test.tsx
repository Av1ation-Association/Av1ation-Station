// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { ApiProvider, MockTransport } from "@av1ation/api";

import { usePreviewAudio } from "./use-preview-audio";

class AudioTransport extends MockTransport {
    readonly mediaUrl = (path: string) => `http://media.test${path}`;

    override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        if (path.includes("/audio-tracks")) {
            return schema.parse({
                tracks: [
                    {
                        index: 0,
                        label: "Audio 1 · ENG · AAC · stereo · default",
                        language: "eng",
                        codec: "aac",
                        channels: 2,
                        default: true,
                    },
                    {
                        index: 1,
                        label: "Audio 2 · JPN · OPUS · stereo",
                        language: "jpn",
                        codec: "opus",
                        channels: 2,
                        default: false,
                    },
                ],
                detail: "Choose a track to play it alongside the preview.",
            }) as T;
        }
        return super.get(path, schema);
    }
}

beforeAll(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
    vi.clearAllMocks();
});

const transport = new AudioTransport();

function useHarness(props: { source: "original" | "decoded" | "encode"; anchor?: number }) {
    const mediaStart = useRef(0);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const audio = usePreviewAudio({
        projectId: "project-1",
        videoId: "video-1",
        source: props.source,
        encodeFrom: "decoded",
        frameRate: 24,
        anchor: props.anchor ?? 0,
        url: "http://media.test/video",
        volume: 0.5,
        muted: false,
        playbackRate: 1,
        mediaStart,
        videoRef,
    });
    return { ...audio, mediaStart, videoRef };
}

function wrapper({ children }: { children: React.ReactNode }) {
    return <ApiProvider transport={transport}>{children}</ApiProvider>;
}

describe("usePreviewAudio", () => {
    it("keeps the source audio on Original until another track is chosen", async () => {
        const { result } = renderHook(() => useHarness({ source: "original" }), { wrapper });

        await waitFor(() => expect(result.current.audioTracks.data?.tracks).toHaveLength(2));
        expect(result.current.audioUrl).toBeNull();

        act(() => result.current.chooseAudio(1));
        expect(result.current.audioUrl).toContain("audio=1");
        expect(result.current.audioLabel).toContain("JPN");
    });

    it("uses the original track for a derived picture and reads its offset", async () => {
        const { result } = renderHook(() => useHarness({ source: "decoded", anchor: 48 }), {
            wrapper,
        });

        await waitFor(() => expect(result.current.audioUrl).toContain("audio=0"));
        expect(result.current.audioOffset).toBe(2);
    });

    it("moves the sound to the presented frame and starts it while playing", async () => {
        const { result } = renderHook(() => useHarness({ source: "decoded", anchor: 48 }), {
            wrapper,
        });
        const video = document.createElement("video");
        const audio = document.createElement("audio");
        Object.defineProperty(video, "paused", {
            configurable: true,
            value: false,
        });
        video.currentTime = 12;
        result.current.videoRef.current = video;
        result.current.audioRef.current = audio;
        result.current.mediaStart.current = 2;

        act(() => result.current.syncAudio(video));

        expect(audio.currentTime).toBe(12);
        expect(audio.play).toHaveBeenCalled();
    });
});
