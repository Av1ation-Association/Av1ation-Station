// @vitest-environment jsdom
import { useState } from "react";

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { ScenePlayer, type PreviewSource } from "./ScenePlayer";

/** A transport that can hand a media element a URL, which the demo transport cannot. */
class MediaTransport extends MockTransport {
    readonly mediaUrl = (path: string) => `http://media.test${path}`;
}

/** Lists two tracks, so the player's selector is rendered. */
class AudioMediaTransport extends MediaTransport {
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
    // jsdom has no media pipeline; the transport only needs the element's events.
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    // Radix menus portal and measure their content; jsdom has neither by default.
    Element.prototype.scrollIntoView = () => undefined;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {
                return undefined;
            }
            unobserve() {
                return undefined;
            }
            disconnect() {
                return undefined;
            }
        },
    );
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function openSourceMenu() {
    const trigger = screen.getByRole("button", { name: /Preview source:/u });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);
}

function renderPlayer(
    transport: MockTransport,
    overrides: Partial<Parameters<typeof ScenePlayer>[0]> = {},
) {
    return renderWithApi(
        <ScenePlayer
            projectId="project-1"
            videoId="video-1"
            source="original"
            onSourceChange={vi.fn()}
            frameRate={24}
            playhead={0}
            onSeek={vi.fn()}
            {...overrides}
        />,
        { transport },
    );
}

/** A player whose source control actually changes the source, as the screen does. */
function SwitchingPlayer({
    initialSource = "original",
    initialPlayhead = 0,
}: {
    initialSource?: PreviewSource;
    initialPlayhead?: number;
}) {
    const [source, setSource] = useState<PreviewSource>(initialSource);
    const [playhead, setPlayhead] = useState(initialPlayhead);
    return (
        <ScenePlayer
            projectId="project-1"
            videoId="video-1"
            source={source}
            onSourceChange={setSource}
            frameRate={24}
            playhead={playhead}
            onSeek={setPlayhead}
            sceneIndex={0}
            sceneStarts={[0, 240]}
            sceneEnds={[240, 480]}
            totalFrames={960}
        />
    );
}

/** Choose a source through the transport's own menu. */
function chooseSource(name: RegExp) {
    openSourceMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name }));
}

/** Describe the media state a browser would have after loading or seeking. */
function mediaState(
    element: HTMLVideoElement,
    {
        readyState,
        duration,
        buffered = [],
        paused = true,
        currentTime,
    }: {
        readyState: number;
        duration: number;
        buffered?: readonly [number, number] | readonly [];
        paused?: boolean;
        currentTime?: number;
    },
) {
    Object.defineProperty(element, "readyState", { configurable: true, value: readyState });
    Object.defineProperty(element, "duration", { configurable: true, value: duration });
    Object.defineProperty(element, "buffered", {
        configurable: true,
        value:
            buffered.length === 0
                ? { length: 0 }
                : { length: 1, start: () => buffered[0], end: () => buffered[1] },
    });
    Object.defineProperty(element, "paused", { configurable: true, value: paused });
    if (currentTime !== undefined) {
        element.currentTime = currentTime;
    }
}

function previewReady(): string | null {
    return screen.getByLabelText("Video preview").getAttribute("data-preview-ready");
}

describe("ScenePlayer", () => {
    it("reveals the fullscreen transport on activity and hides it when idle", () => {
        vi.useFakeTimers();
        try {
            renderPlayer(new MockTransport());
            const section = screen.getByLabelText("Video preview");
            Object.defineProperty(document, "fullscreenElement", {
                configurable: true,
                value: section,
            });
            act(() => document.dispatchEvent(new Event("fullscreenchange")));

            const chrome = document.querySelector("[data-fullscreen-chrome='true']");
            expect(chrome).not.toBeNull();
            expect(chrome?.getAttribute("data-visible")).toBe("true");

            act(() => vi.advanceTimersByTime(2999));
            expect(chrome?.getAttribute("data-visible")).toBe("true");
            act(() => vi.advanceTimersByTime(1));
            expect(chrome?.getAttribute("data-visible")).toBe("false");

            fireEvent.pointerMove(section);
            expect(chrome?.getAttribute("data-visible")).toBe("true");
            act(() => vi.advanceTimersByTime(3000));
            expect(chrome?.getAttribute("data-visible")).toBe("false");

            fireEvent.focus(section);
            expect(chrome?.getAttribute("data-visible")).toBe("true");
        } finally {
            Object.defineProperty(document, "fullscreenElement", {
                configurable: true,
                value: null,
            });
            vi.useRealTimers();
        }
    });

    it("explains that a host without media streaming cannot show a preview", () => {
        renderPlayer(new MockTransport());

        expect(screen.getByText("Preview needs the desktop window")).toBeDefined();
        expect(document.querySelector("video")).toBeNull();
    });

    it("attaches only the selected source and offers every preview source", () => {
        const onSourceChange = vi.fn();
        renderPlayer(new MediaTransport(), { onSourceChange, sceneIndex: 0 });

        const video = document.querySelector("video");
        expect(video?.getAttribute("src")).toContain("source=original");

        openSourceMenu();
        fireEvent.click(screen.getByRole("menuitemradio", { name: /^Encoded/u }));
        expect(onSourceChange).toHaveBeenCalledWith("encode");
    });

    it("offers decoded and encoded previews without a finished encode", () => {
        const onSourceChange = vi.fn();
        renderPlayer(new MediaTransport(), { onSourceChange, sceneIndex: 0 });

        openSourceMenu();
        const decoded = screen.getByRole("menuitemradio", { name: /Decoded/u });
        const encode = screen.getByRole("menuitemradio", { name: /Encoded/u });
        expect(decoded.getAttribute("aria-disabled")).toBeNull();
        expect(encode.getAttribute("aria-disabled")).toBeNull();

        fireEvent.click(decoded);
        expect(onSourceChange).toHaveBeenCalledWith("decoded");
    });

    it("disables Encoded when the playhead is not inside a scene", () => {
        renderPlayer(new MediaTransport());

        openSourceMenu();
        const encode = screen.getByRole("menuitemradio", { name: /Encoded/u });
        expect(encode.getAttribute("aria-disabled")).toBe("true");
        expect(screen.getByText(/No scene contains the playhead/u)).toBeDefined();
    });

    it("pinch-zooms the picture around the fingers", () => {
        renderPlayer(new MediaTransport());
        const video = document.querySelector("video")!;
        const stage = video.parentElement!;
        stage.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 600,
                bottom: 400,
                width: 600,
                height: 400,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        fireEvent.pointerDown(stage, {
            button: 0,
            pointerType: "touch",
            pointerId: 1,
            clientX: 200,
            clientY: 200,
        });
        fireEvent.pointerDown(stage, {
            button: 0,
            pointerType: "touch",
            pointerId: 2,
            clientX: 300,
            clientY: 200,
        });
        fireEvent.pointerMove(stage, {
            pointerType: "touch",
            pointerId: 2,
            clientX: 400,
            clientY: 200,
        });

        expect(video.style.transform).toContain("scale(2)");
    });

    it("toggles playback on a click but not on a drag across the picture", () => {
        renderPlayer(new MediaTransport());
        const video = document.querySelector("video")!;
        const stage = video.parentElement!;

        fireEvent.click(video);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

        fireEvent.pointerDown(stage, {
            button: 0,
            pointerId: 1,
            clientX: 100,
            clientY: 100,
        });
        fireEvent.pointerMove(stage, {
            pointerId: 1,
            clientX: 140,
            clientY: 100,
        });
        fireEvent.pointerUp(stage, { pointerId: 1, clientX: 140, clientY: 100 });
        fireEvent.click(video);

        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    });

    it("steps the frame with the arrow keys", () => {
        const onSeek = vi.fn();
        renderPlayer(new MediaTransport(), { playhead: 24, onSeek });

        fireEvent.keyDown(screen.getByRole("region", { name: "Video preview" }), {
            key: "ArrowRight",
        });
        expect(onSeek).toHaveBeenCalledWith(25);
    });

    it("steps frames from the letter keys, and ten with Shift", () => {
        const onSeek = vi.fn();
        renderPlayer(new MediaTransport(), { playhead: 24, onSeek });
        const player = screen.getByRole("region", { name: "Video preview" });

        fireEvent.keyDown(player, { key: "d" });
        expect(onSeek).toHaveBeenLastCalledWith(25);

        fireEvent.keyDown(player, { key: "a" });
        expect(onSeek).toHaveBeenLastCalledWith(23);

        fireEvent.keyDown(player, { key: "ArrowRight", shiftKey: true });
        expect(onSeek).toHaveBeenLastCalledWith(34);
    });

    it("jumps to the first frame of the previous or next scene", () => {
        const onSeek = vi.fn();
        renderPlayer(new MediaTransport(), {
            playhead: 300,
            onSeek,
            sceneStarts: [0, 240, 480],
            totalFrames: 960,
        });
        const player = screen.getByRole("region", { name: "Video preview" });

        fireEvent.keyDown(player, { key: "ArrowDown" });
        expect(onSeek).toHaveBeenLastCalledWith(480);

        // The playhead is in the second scene, so back one scene is the first scene's cut.
        fireEvent.keyDown(player, { key: "w" });
        expect(onSeek).toHaveBeenLastCalledWith(0);
    });

    it("keeps the scene keys inside the video at either end", () => {
        const onSeek = vi.fn();
        renderPlayer(new MediaTransport(), {
            playhead: 500,
            onSeek,
            sceneStarts: [0, 240, 480],
            totalFrames: 960,
        });
        const player = screen.getByRole("region", { name: "Video preview" });
        const calls = onSeek.mock.calls.length;

        // The playhead is in the last scene, so nothing follows it.
        fireEvent.keyDown(player, { key: "s" });
        expect(onSeek.mock.calls).toHaveLength(calls);
    });

    it("toggles playback from the transport", () => {
        renderPlayer(new MediaTransport());

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    });

    it("does not call a superseded play request a broken file", async () => {
        const play = vi
            .spyOn(HTMLMediaElement.prototype, "play")
            .mockRejectedValue(
                new DOMException("The play() request was interrupted.", "AbortError"),
            );
        renderPlayer(new MediaTransport());

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        await act(async () => undefined);

        expect(play).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/cannot be played/u)).toBeNull();
        play.mockRestore();
    });

    it("reports a play failure that is not a superseded request", async () => {
        const play = vi
            .spyOn(HTMLMediaElement.prototype, "play")
            .mockRejectedValue(new DOMException("No decoder.", "NotSupportedError"));
        renderPlayer(new MediaTransport());

        fireEvent.click(screen.getByRole("button", { name: "Play" }));

        expect(await screen.findByText(/cannot be played/u)).toBeDefined();
        play.mockRestore();
    });

    it("carries playback across a seek that rebuilds the decoded window", () => {
        const transport = new MediaTransport();
        const props = {
            projectId: "project-1",
            videoId: "video-1",
            source: "decoded" as const,
            onSourceChange: vi.fn(),
            frameRate: 24,
            sceneIndex: 0,
            sceneStarts: [0, 240],
            totalFrames: 960,
        };
        const view = renderWithApi(<ScenePlayer {...props} playhead={0} onSeek={vi.fn()} />, {
            transport,
        });

        fireEvent.play(document.querySelector("video")!);
        expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();

        // Another two-second window starts at a frame grid boundary, so this seek changes
        // the URL and mounts a new element instead of seeking the old one.
        view.rerenderWithApi(<ScenePlayer {...props} playhead={200} onSeek={vi.fn()} />);

        // The new element has not started yet, so the transport must not claim Pause.
        expect(screen.getByRole("button", { name: "Play" })).toBeDefined();
        expect(document.querySelector("video")?.getAttribute("src")).toContain("frame=192");
        // The transport shows the frame that was asked for, not the window's first frame.
        const bar = () =>
            screen.getByRole("slider", { name: "Seek the preview" }) as HTMLInputElement;
        expect(Number(bar().value)).toBeCloseTo(200 / 24, 4);

        const next = document.querySelector("video")!;
        fireEvent.loadedMetadata(next);

        // Metadata alone must not resume: the element is still on the window's first frame,
        // and starting there is what made a mid-window seek play behind the request.
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(0);

        // The seek lands on the requested frame; the run continues there without a second
        // click. The mock does not dispatch the browser's `play` event, so the label is
        // checked after the event that element would emit.
        Object.defineProperty(next, "readyState", { value: 2, configurable: true });
        next.currentTime = (200 - 192) / 24;
        fireEvent.canPlay(next);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
        fireEvent.play(next);
        expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();

        // The seek that lands on the same frame must not start a second interval.
        fireEvent.seeked(next);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    });

    it("clears the loading stage after a paused switch to Decoded", () => {
        renderWithApi(<SwitchingPlayer initialPlayhead={100} />, {
            transport: new MediaTransport(),
        });
        const original = document.querySelector("video")!;
        mediaState(original, { readyState: 4, duration: 40 });
        fireEvent.loadedMetadata(original);
        expect(previewReady()).toBe("true");

        chooseSource(/^Decoded/u);
        const decoded = document.querySelector("video")!;
        expect(decoded).not.toBe(original);
        // The stream opens at the window that contains the paused frame.
        expect(decoded.getAttribute("src")).toContain("frame=96");

        // Metadata arrives before the window has the requested frame. Once the window is
        // buffered the loading stage has to clear on the frame the user asked for, without
        // requiring a second Play or source selection.
        mediaState(decoded, { readyState: 1, duration: 2, buffered: [0, 2] });
        fireEvent.loadedMetadata(decoded);
        // The rest of the window lands and the element becomes seekable. The append has to
        // retry the pending request itself; waiting for a `seeked` that was already sent for
        // the window's first frame is what left the spinner up forever.
        mediaState(decoded, { readyState: 2, duration: 2, buffered: [0, 2] });
        fireEvent.progress(decoded);

        expect(previewReady()).toBe("true");
        expect(screen.getByRole("button", { name: "Play" })).toBeDefined();
        // A paused switch stays paused. The frame is shown; playback is the user's choice.
        expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
        fireEvent.play(decoded);
        expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
    });

    it("keeps playing and keeps the frame across a switch to Decoded", () => {
        renderWithApi(<SwitchingPlayer initialPlayhead={100} />, {
            transport: new MediaTransport(),
        });
        const original = document.querySelector("video")!;
        mediaState(original, { readyState: 4, duration: 40, paused: false });
        fireEvent.loadedMetadata(original);
        fireEvent.play(original);
        expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();

        vi.mocked(HTMLMediaElement.prototype.play).mockClear();
        chooseSource(/^Decoded/u);
        const decoded = document.querySelector("video")!;
        mediaState(decoded, {
            readyState: 2,
            duration: 2,
            buffered: [0, 2],
            currentTime: (100 - 96) / 24,
        });
        fireEvent.loadedMetadata(decoded);
        fireEvent.seeked(decoded);

        expect(previewReady()).toBe("true");
        expect(decoded.currentTime).toBeCloseTo((100 - 96) / 24, 4);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
        fireEvent.play(decoded);
        expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
    });

    it("keeps playing and keeps the frame across a switch back to Original", () => {
        renderWithApi(<SwitchingPlayer initialSource="decoded" initialPlayhead={100} />, {
            transport: new MediaTransport(),
        });
        const decoded = document.querySelector("video")!;
        mediaState(decoded, {
            readyState: 2,
            duration: 2,
            buffered: [0, 2],
            paused: false,
            currentTime: (100 - 96) / 24,
        });
        fireEvent.loadedMetadata(decoded);
        fireEvent.seeked(decoded);
        fireEvent.play(decoded);
        expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();

        vi.mocked(HTMLMediaElement.prototype.play).mockClear();
        chooseSource(/^Original/u);
        const original = document.querySelector("video")!;
        mediaState(original, { readyState: 4, duration: 40 });
        fireEvent.loadedMetadata(original);

        expect(previewReady()).toBe("true");
        expect(original.currentTime).toBeCloseTo(100 / 24, 4);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
        fireEvent.play(original);
        expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
    });

    it("reopens a decoded window whose bytes the session has already dropped", () => {
        const transport = new MediaTransport();
        const props = {
            projectId: "project-1",
            videoId: "video-1",
            source: "decoded" as const,
            onSourceChange: vi.fn(),
            frameRate: 24,
            sceneIndex: 0,
            sceneStarts: [0, 240],
            totalFrames: 960,
        };
        const view = renderWithApi(<ScenePlayer {...props} playhead={144} onSeek={vi.fn()} />, {
            transport,
        });
        const video = document.querySelector("video")!;
        expect(video.getAttribute("src")).toContain("frame=144");
        expect(video.getAttribute("src")).not.toContain("epoch=1");

        // The session has appended later windows and dropped everything before 17 s. A
        // seek to frame 180 is 1.5 s into the window, and those bytes are gone: the same
        // URL cannot answer it, so the element has to be rebuilt from the cached window.
        Object.defineProperty(video, "buffered", {
            configurable: true,
            value: { length: 1, start: () => 17, end: () => 25 },
        });
        view.rerenderWithApi(<ScenePlayer {...props} playhead={180} onSeek={vi.fn()} />);

        expect(document.querySelector("video")?.getAttribute("src")).toContain("frame=144");
        expect(document.querySelector("video")?.getAttribute("src")).toContain("epoch=1");
    });

    it("reopens the encoded element when the scene's encoder document changes", () => {
        const transport = new MediaTransport();
        const props = {
            projectId: "project-1",
            videoId: "video-1",
            source: "encode" as const,
            onSourceChange: vi.fn(),
            frameRate: 24,
            sceneIndex: 1,
            playhead: 181,
            onSeek: vi.fn(),
            sceneStarts: [0, 181, 276],
            sceneEnds: [181, 271, 431],
            totalFrames: 431,
        };
        const view = renderWithApi(
            <ScenePlayer {...props} encoderFingerprints={["a", "b", "c"]} />,
            { transport },
        );
        expect(document.querySelector("video")?.getAttribute("src")).toContain("scene=1");
        expect(document.querySelector("video")?.getAttribute("src")).toContain("encoder=b");

        // A saved encoder setting is a different chunk, so the URL has to say so: the
        // element is reopened and the service encodes with the document the row describes.
        view.rerenderWithApi(<ScenePlayer {...props} encoderFingerprints={["a", "c9", "c"]} />);
        const video = document.querySelector("video");
        expect(video?.getAttribute("src")).toContain("encoder=c9");
        expect(video?.getAttribute("src")).not.toContain("encoder=b");
    });

    it("steps over frames no scene covers and says how many", () => {
        const onSeek = vi.fn();
        const transport = new MediaTransport();
        const props = {
            projectId: "project-1",
            videoId: "video-1",
            source: "encode" as const,
            onSourceChange: vi.fn(),
            frameRate: 24,
            sceneIndex: 1,
            sceneStarts: [0, 181, 276, 431, 656],
            sceneEnds: [181, 271, 431, 656, 756],
            totalFrames: 756,
            onSeek,
        };
        const view = renderWithApi(<ScenePlayer {...props} playhead={181} />, { transport });

        const video = document.querySelector("video")!;
        expect(video.getAttribute("src")).toContain("scene=1");
        fireEvent.ended(video);

        // Frames 271–275 belong to no scene, so the next chunk starts at 276.
        expect(onSeek).toHaveBeenCalledWith(276);
        expect(screen.getByText("Skipped 5 uncovered frames")).toBeDefined();

        // The screen answers the seek, which opens the next scene's element. That reset
        // clears nearly every piece of playback state; the notice has to survive it or the
        // user never learns why the picture moved.
        view.rerenderWithApi(<ScenePlayer {...props} sceneIndex={2} playhead={276} />);
        expect(document.querySelector("video")?.getAttribute("src")).toContain("scene=2");
        expect(screen.getByText("Skipped 5 uncovered frames")).toBeDefined();
    });

    it("measures every source on the video's own timeline", () => {
        const transport = new MediaTransport();
        const props = {
            projectId: "project-1",
            videoId: "video-1",
            onSourceChange: vi.fn(),
            frameRate: 24,
            playhead: 240,
            onSeek: vi.fn(),
            sceneStarts: [0, 240, 480],
            totalFrames: 960,
        };
        const view = renderWithApi(<ScenePlayer {...props} source="original" sceneIndex={1} />, {
            transport,
        });
        const bar = () =>
            screen.getByRole("slider", { name: "Seek the preview" }) as HTMLInputElement;
        expect(bar().max).toBe("40");

        // An encoded chunk is one scene long, but the bar still spans the video, so the
        // three sources cannot read as three different lengths.
        view.rerenderWithApi(<ScenePlayer {...props} source="encode" sceneIndex={1} />);
        expect(bar().max).toBe("40");
        // And the thumb is at the scene's own place, not at zero of its chunk.
        expect(bar().value).toBe("10");

        view.rerenderWithApi(<ScenePlayer {...props} source="decoded" sceneIndex={1} />);
        expect(bar().max).toBe("40");
    });

    /** Open the sound popover and pick the second track, the way the transport offers it. */
    async function chooseSecondTrack() {
        fireEvent.click(screen.getByRole("button", { name: /Sound and audio track/u }));
        const tracks = await screen.findAllByRole("radio");
        const second = tracks[2];
        if (second === undefined) {
            throw new Error("the source's second audio track is not offered");
        }
        fireEvent.click(second);
    }

    it("offers the source's audio tracks while Decoded is selected", async () => {
        renderPlayer(new AudioMediaTransport(), { source: "decoded", sceneIndex: 0 });

        await chooseSecondTrack();

        expect(document.querySelector("audio")?.getAttribute("src")).toContain("audio=1");
    });

    it("lets the user dismiss an audio-track failure", async () => {
        renderPlayer(new AudioMediaTransport());

        await chooseSecondTrack();
        const audio = document.querySelector("audio");
        expect(audio).not.toBeNull();

        fireEvent.error(audio!);
        expect(screen.getByText(/could not be prepared/u)).toBeDefined();

        fireEvent.click(screen.getByRole("button", { name: "Dismiss the audio notice" }));
        expect(screen.queryByText(/could not be prepared/u)).toBeNull();
    });

    it("plays a chosen audio track beside the picture instead of through the video", async () => {
        renderPlayer(new AudioMediaTransport());

        expect(document.querySelector("video")?.getAttribute("src")).not.toContain("audio=");

        await chooseSecondTrack();

        expect(document.querySelector("video")?.getAttribute("src")).not.toContain("audio=");
        expect(document.querySelector("audio")?.getAttribute("src")).toContain("audio=1");
    });
});
