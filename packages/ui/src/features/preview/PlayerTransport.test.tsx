// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { PreviewSession } from "./use-preview-session";
import { PlayerTransport } from "./PlayerTransport";

function session(overrides: Partial<Record<string, unknown>> = {}): PreviewSession {
    return {
        anchorSeconds: 0,
        audioLabel: "Source audio",
        audioTrack: null,
        audioTracks: { data: undefined },
        bufferedFrom: 0,
        bufferedTo: 0.5,
        canPlay: true,
        changeZoom: vi.fn(),
        chooseAudio: vi.fn(),
        chooseSource: vi.fn(),
        chunkReady: true,
        commitFrame: vi.fn(),
        commitTimecode: vi.fn(),
        currentFrame: 48,
        currentTime: 2,
        encodeFrom: "decoded",
        encodedChunkEnd: 0,
        etaLabel: "00:05",
        frameDraft: null,
        frameInvalid: false,
        fullscreen: false,
        held: false,
        lastFrame: 239,
        muted: false,
        playbackRate: 0.75,
        playing: false,
        positionSeconds: 2,
        progress: 0.2,
        resumeAfterSource: { current: false },
        seekDuration: 20,
        seekQueue: { current: null },
        setCurrentTime: vi.fn(),
        setEncodeFrom: vi.fn(),
        setFrameDraft: vi.fn(),
        setFrameInvalid: vi.fn(),
        setMuted: vi.fn(),
        setSoundOpen: vi.fn(),
        setStreamStart: vi.fn(),
        setTimecodeDraft: vi.fn(),
        setTimecodeInvalid: vi.fn(),
        setVolume: vi.fn(),
        soundOpen: false,
        soundRoot: { current: null },
        stepFrame: vi.fn(),
        streamStart: 0,
        throughput: 1.2,
        timecodeDraft: null,
        timecodeInvalid: false,
        toggleFullscreen: vi.fn(),
        togglePlay: vi.fn(),
        typedFrame: (_text: string, parse: (value: string) => number | null) => parse(_text),
        url: "http://service/media",
        videoRef: { current: null },
        volume: 0.5,
        volumePercent: 50,
        windowFrames: 240,
        zoom: 1,
        ...overrides,
    } as unknown as PreviewSession;
}

it("edits timecode, frame, seek, zoom, playback, and full screen from the transport", () => {
    const state = session();
    render(
        <PlayerTransport
            session={state}
            source="decoded"
            sceneIndex={0}
            frameRate={24}
            playhead={48}
            onSeek={vi.fn()}
        />,
    );

    fireEvent.click(screen.getByLabelText("Previous frame"));
    fireEvent.click(screen.getByLabelText("Next frame"));
    fireEvent.click(screen.getByLabelText("Play"));
    fireEvent.click(screen.getByLabelText("Full screen"));
    expect(state.stepFrame).toHaveBeenNthCalledWith(1, -1);
    expect(state.stepFrame).toHaveBeenNthCalledWith(2, 1);
    expect(state.togglePlay).toHaveBeenCalledTimes(1);
    expect(state.toggleFullscreen).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Seek the preview"), { target: { value: "20" } });
    expect(state.setStreamStart).toHaveBeenCalledWith(480);
    expect(state.resumeAfterSource.current).toBe(false);

    fireEvent.change(screen.getByLabelText("Preview zoom"), { target: { value: "200" } });
    expect(state.changeZoom).toHaveBeenCalledWith(2);

    const timecode = screen.getByLabelText("Timecode") as HTMLInputElement;
    fireEvent.change(timecode, { target: { value: "00:00:03.0" } });
    expect(state.setTimecodeDraft).toHaveBeenCalledWith("00:00:03.0");
    expect(state.setTimecodeInvalid).toHaveBeenLastCalledWith(false);
    fireEvent.change(timecode, { target: { value: "not a timecode" } });
    expect(state.setTimecodeInvalid).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(timecode, { key: "Escape" });
    expect(state.setTimecodeDraft).toHaveBeenLastCalledWith(null);
    expect(state.setTimecodeInvalid).toHaveBeenLastCalledWith(false);

    const frame = screen.getByLabelText("Frame") as HTMLInputElement;
    fireEvent.change(frame, { target: { value: "120" } });
    expect(state.setFrameDraft).toHaveBeenCalledWith("120");
    expect(state.setFrameInvalid).toHaveBeenLastCalledWith(false);
    fireEvent.change(frame, { target: { value: "wrong" } });
    expect(state.setFrameInvalid).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(frame, { key: "Escape" });
    expect(state.setFrameDraft).toHaveBeenLastCalledWith(null);
    expect(state.setFrameInvalid).toHaveBeenLastCalledWith(false);
});

it("opens the sound menu and chooses an audio track", () => {
    const state = session({
        soundOpen: true,
        audioTracks: {
            data: {
                tracks: [
                    { index: 0, label: "Main" },
                    { index: 1, label: "Commentary" },
                ],
                detail: "The source has two audio tracks.",
            },
        },
    });
    render(
        <PlayerTransport
            session={state}
            source="decoded"
            sceneIndex={0}
            frameRate={24}
            playhead={48}
            onSeek={vi.fn()}
        />,
    );

    expect(screen.getByRole("dialog", { name: "Sound" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Mute"));
    expect(state.setMuted).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Volume"), { target: { value: "0.25" } });
    expect(state.setVolume).toHaveBeenCalledWith(0.25);
    expect(state.setMuted).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("radio", { name: "Main" }));
    expect(state.chooseAudio).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("radio", { name: "Source audio" }));
    expect(state.chooseAudio).toHaveBeenLastCalledWith(null);
});

it("disables transport actions when there is no playable source", () => {
    const state = session({ canPlay: false, url: null, currentFrame: null, lastFrame: null });
    render(
        <PlayerTransport
            session={state}
            source="decoded"
            sceneIndex={null}
            frameRate={null}
            playhead={null}
            onSeek={vi.fn()}
        />,
    );

    expect((screen.getByLabelText("Play") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Previous frame") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Frame") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Timecode") as HTMLInputElement).disabled).toBe(true);
});
