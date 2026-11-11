import { useCallback, useEffect, useRef, useState } from "react";

import { useMediaUrl } from "@av1ation/api";

import { isModalOpen, matchesShortcut } from "../../shared/shortcuts";
import { playerKeyDown } from "./player-keyboard";
import { DECODED_WINDOW_SECONDS, type PreviewSource } from "./preview-player";
import { PreviewStream } from "./preview-stream";
import { usePreviewAudio } from "./use-preview-audio";
import { usePreviewBuffering } from "./use-preview-buffering";
import { usePreviewPlayback } from "./use-preview-playback";
import { usePreviewPrefetch } from "./use-preview-prefetch";
import { usePreviewTransport } from "./use-preview-transport";
import { useStageTransform } from "./use-stage-transform";

export type PreviewSessionProps = {
    projectId: string;
    videoId: string;
    source: PreviewSource;
    onSourceChange: (next: PreviewSource) => void;
    frameRate: number | null;
    playhead: number | null;
    onSeek: (frame: number) => void;
    /** Absolute frame the attached stream starts at (window start, scene start, or 0). */
    baseFrame?: number;
    /** The scene an encoded preview covers, or null when no scene contains the playhead. */
    sceneIndex?: number | null;
    /** Every scene's first frame, so a chunk keeps its own timeline while it plays. */
    sceneStarts?: readonly number[];
    /** Every scene's last frame plus one, which is what makes a gap between scenes visible. */
    sceneEnds?: readonly number[];
    /** Each scene's encoder fingerprint, in scene order. */
    encoderFingerprints?: readonly (string | null | undefined)[];
    /** The scene table's fingerprint, so a changed table reopens derived sources. */
    sceneFingerprint?: string;
    /** Source length, so a live decoded stream has a seek range without an MP4 duration. */
    totalFrames?: number;
};

/**
 * The player's media session. It resolves the source URL, composes the focused audio,
 * buffering, playback, prefetch and transport hooks, and keeps the actions that span more
 * than one of them: choosing a source and the screen-level keyboard map. The component shell
 * renders the returned state and actions.
 */
export function usePreviewSession({
    projectId,
    videoId,
    source,
    onSourceChange,
    frameRate,
    playhead,
    onSeek,
    baseFrame = 0,
    sceneIndex = null,
    sceneStarts = [],
    sceneEnds = [],
    encoderFingerprints = [],
    sceneFingerprint = "",
    totalFrames = 0,
}: PreviewSessionProps) {
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    /** Slower than 1 only while the decoder cannot keep the source rate (see RateGovernor). */
    const [playbackRate, setPlaybackRate] = useState(1);
    const [encodeFrom, setEncodeFrom] = useState<"decoded" | "original">("decoded");
    const mediaPath = `/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/media`;
    const framePath = `/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/frame`;
    // The hook's value, carried on every derived-source URL. Empty on a video with no scene
    // table yet, where nothing about the decode can have changed.
    const scenesQuery = sceneFingerprint === "" ? "" : `&scenes=${sceneFingerprint}`;
    // Encoded needs one scene: without it there is no chunk to reproduce, so the stage
    // explains that instead of requesting scene zero from an unrelated list.
    const needsScene = source === "encode" && sceneIndex === null;
    // The scene the element's URL opened at. While playback crosses a cut it stays put: a
    // new URL would swap the element mid-shot and wait for an encode, which is the stall at
    // every new scene. The session appends each following chunk to the same timeline, and
    // the element is only reopened when the playhead leaves the range it already covers.
    const [openScene, setOpenScene] = useState<number | null>(sceneIndex);
    const chunkScene = source === "encode" ? (openScene ?? sceneIndex) : sceneIndex;
    /** The encoder document the open chunk was built from, empty when there is none. */
    const chunkEncoder = chunkScene === null ? "" : (encoderFingerprints[chunkScene] ?? "");
    /**
     * Scene indices this element's session holds, from the chunk it opened at to the last
     * one appended. A seek inside it is a buffer lookup; leaving it needs a new element.
     */
    const coverage = useRef<{ from: number | null; to: number | null }>({
        from: null,
        to: null,
    });
    // Decoded is one stream from the frame the user was on when they chose it. It must not
    // be rebuilt when playback reaches the next window: a new URL remounts the element and
    // stops the picture, which is the boundary stall this removes.
    const [streamStart, setStreamStart] = useState(baseFrame);
    // A decoded session drops the bytes it has already played. Seeking back into a dropped
    // part of the *same* window used to keep the same URL, so nothing reattached the source
    // and the player waited on a buffer that could never fill. Bumping this rebuilds the
    // element from the cached window while leaving the window itself (and its URL) alone.
    const [streamEpoch, setStreamEpoch] = useState(0);
    // One decoded stream carries this much video. An open-ended stream encoded the rest of
    // a two-hour source losslessly: 1.5 GB written per view, minutes of CPU before the
    // picture was ready, and enough contention to starve every other preview. A window
    // keeps that bounded, and the next one is built while this one plays.
    const windowFrames =
        frameRate !== null && frameRate > 0 ? Math.round(frameRate * DECODED_WINDOW_SECONDS) : 240;
    const mediaUrl = useMediaUrl(
        source === "original"
            ? `${mediaPath}?source=original`
            : source === "decoded"
              ? `${mediaPath}?source=decoded&frame=${String(streamStart)}&frames=${String(windowFrames)}&epoch=${String(streamEpoch)}${scenesQuery}`
              : needsScene
                ? ""
                : `${mediaPath}?source=encode&scene=${String(chunkScene)}&encode_from=${encodeFrom}&encoder=${chunkEncoder}${scenesQuery}`,
    );
    const url = needsScene ? null : mediaUrl;
    // A scrub still is one decoded frame; it is shown while paused so dragging the playhead
    // does not wait for a window to decode. The short delay coalesces a drag's ticks.
    const [stillFrame, setStillFrame] = useState<number | null>(null);
    const [stillFailed, setStillFailed] = useState(false);
    // The element's timeline starts at the stream's own first frame. Original starts at
    // zero; Decoded starts where the user asked; Encoded starts at the scene's first frame.
    const anchor =
        source === "encode"
            ? (sceneStarts[chunkScene ?? -1] ?? baseFrame)
            : source === "decoded"
              ? streamStart
              : 0;
    // A cut file's first presentable sample need not sit at zero: LosslessCut leaves a
    // start time (about 0.17 s on this source), so `currentTime` 0 is before the first
    // frame and a seek to frame 0 lands on frame 4. The element exposes its own start
    // through `seekable`, and every time-to-frame conversion has to subtract it or the
    // first frame can never be reached — the pending request never settles, playback
    // reports nothing, and the picture looks stuck at the head of the file.
    const mediaStart = useRef(0);
    const frameAtElementTime = useCallback(
        (time: number) => {
            const frame =
                anchor + Math.round(Math.max(0, time - mediaStart.current) * (frameRate ?? 0));
            // A cut container's duration can run past the last frame the engine counted.
            // Reporting one of those frames would ask the still route for an image that
            // does not exist; the frame list is the authority on where the video ends.
            const last = totalFrames > 0 ? totalFrames - 1 : frame;
            return Math.min(frame, last);
        },
        [anchor, frameRate, totalFrames],
    );
    const elementTimeForFrame = useCallback(
        (frame: number) =>
            frameRate === null || frameRate <= 0
                ? 0
                : Math.max(0, (frame - anchor) / frameRate + mediaStart.current),
        [anchor, frameRate],
    );
    const videoRef = useRef<HTMLVideoElement>(null);
    const toggleTap = useRef<() => void>(() => undefined);
    const stage = useStageTransform(() => toggleTap.current());
    const { sectionRef, stageRef, zoom, pan, fullscreen, changeZoom, resetView, toggleFullscreen } =
        stage;
    const {
        audioTracks,
        audioTrack,
        audioFailed,
        setAudioFailed,
        audioNoticeDismissed,
        setAudioNoticeDismissed,
        audioOffset,
        audioUrl,
        audioRef,
        audioHeld,
        startAudio,
        syncAudio,
        chooseAudio,
        audioLabel,
    } = usePreviewAudio({
        projectId,
        videoId,
        source,
        encodeFrom,
        frameRate,
        anchor,
        url,
        volume,
        muted,
        playbackRate,
        mediaStart,
        videoRef,
    });
    /** The MediaSource session attached to the element, when one is in use. */
    const streamRef = useRef<PreviewStream | null>(null);
    const {
        bufferedEnd,
        bufferRange,
        throughput,
        seekQueue,
        resetBuffer,
        reportBuffer,
        measureBuffered,
        leadAhead,
    } = usePreviewBuffering({ url, videoRef });
    const playback = usePreviewPlayback({
        source,
        url,
        playhead,
        onSeek,
        frameRate,
        totalFrames,
        playbackRate,
        setPlaybackRate,
        anchor,
        chunkScene,
        sceneIndex,
        sceneStarts,
        sceneEnds,
        streamStart,
        setStreamStart,
        setStreamEpoch,
        setOpenScene,
        coverage,
        windowFrames,
        bufferedEnd,
        bufferRange,
        throughput,
        leadAhead,
        resetBuffer,
        reportBuffer,
        seekQueue,
        streamRef,
        videoRef,
        audioRef,
        audioHeld,
        syncAudio,
        audioOffset,
        mediaStart,
        frameAtElementTime,
        elementTimeForFrame,
        resetView,
    });
    const {
        playing,
        held,
        currentTime,
        ready,
        chunkReady,
        currentFrame,
        finishPlayback,
        togglePlay,
        seekToFrame,
        stepFrame,
        stepScene,
        askForFrame,
        pendingTarget,
        resumeAfterSource,
    } = playback;
    toggleTap.current = togglePlay;
    const { prefetchNextWindow, resetWarm } = usePreviewPrefetch({
        source,
        url,
        ready,
        chunkReady,
        chunkScene,
        sceneIndex,
        sceneStarts,
        sceneEnds,
        encoderFingerprints,
        scenesQuery,
        encodeFrom,
        anchor,
        frameRate,
        streamStart,
        windowFrames,
        totalFrames,
        playhead,
        currentTime,
        bufferedEnd,
        coverage,
        videoRef,
        streamRef,
    });
    const transport = usePreviewTransport({
        source,
        totalFrames,
        frameRate,
        muted,
        volume,
        seekToFrame,
    });
    const { setSourceOpen } = transport;

    useEffect(() => {
        if (source !== "decoded" || playhead === null || playing) {
            setStillFrame(null);
            return;
        }
        const timer = window.setTimeout(() => {
            // The frame route refuses a frame past the last one, and a failed still is
            // reported as the preview being broken. The list already knows where the
            // video ends, so ask for a frame that exists.
            setStillFrame(totalFrames > 0 ? Math.min(playhead, totalFrames - 1) : playhead);
            setStillFailed(false);
        }, 120);
        return () => window.clearTimeout(timer);
    }, [source, playhead, playing, totalFrames]);
    const stillUrl = useMediaUrl(
        source === "decoded" && stillFrame !== null
            ? `${framePath}?source=decoded&frame=${String(stillFrame)}${scenesQuery}`
            : "",
    );

    // Space and K are the transport keys everywhere on the screen, not selection toggles.
    // The listener is on the window so the player does not have to hold focus after a rail
    // or timeline click; controls and text fields are exempt so they keep their own
    // behaviour, and an open dialog owns the keys until it closes. Both chords come from
    // the one table the reference dialog prints.
    useEffect(() => {
        const onTransport = (event: globalThis.KeyboardEvent) => {
            if (event.defaultPrevented || isModalOpen() || !matchesShortcut(event, "playerPlay")) {
                return;
            }
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, button, a, summary") !== null) {
                return;
            }
            event.preventDefault();
            togglePlay();
        };
        window.addEventListener("keydown", onTransport);
        return () => window.removeEventListener("keydown", onTransport);
    });

    const chooseSource = (next: PreviewSource) => {
        setSourceOpen(false);
        if (next === source) {
            return;
        }
        // Close the interval under the source that actually played it. Left to the element's
        // own `pause` on unmount, the summary would be attributed to the incoming source and
        // would cover the minutes spent waiting for it.
        if (videoRef.current !== null) {
            finishPlayback(videoRef.current);
        }
        // Decoded starts at the frame the user was on; the screen's window anchor is not a
        // stream boundary any more. Keeping one continuous stream is what removes the
        // scene-boundary stall.
        if (next === "decoded") {
            const target = playhead ?? baseFrame;
            setStreamStart(
                windowFrames > 0 ? Math.floor(target / windowFrames) * windowFrames : target,
            );
        }
        if (next === "encode") {
            // Open the scene the playhead is in, not a chunk left over from an earlier
            // encoded session; the element's URL must name the scene it is about to show.
            const scene = sceneIndex;
            setOpenScene(scene);
            coverage.current = { from: scene, to: scene };
        }
        askForFrame(null);
        pendingTarget.current = null;
        resumeAfterSource.current = playing || held;
        resetWarm();
        onSourceChange(next);
    };

    const onKeyDown = (event: Parameters<typeof playerKeyDown>[0]) =>
        playerKeyDown(event, {
            playhead,
            currentFrame,
            source,
            seekToFrame,
            stepFrame,
            stepScene,
            chooseSource,
            toggleFullscreen,
            resetView,
        });

    return {
        audioTracks,
        audioTrack,
        audioFailed,
        setAudioFailed,
        audioNoticeDismissed,
        setAudioNoticeDismissed,
        audioOffset,
        audioUrl,
        audioRef,
        audioHeld,
        startAudio,
        syncAudio,
        chooseAudio,
        audioLabel,
        ...playback,
        encodeFrom,
        setEncodeFrom,
        needsScene,
        streamStart,
        setStreamStart,
        windowFrames,
        url,
        stillFrame,
        stillFailed,
        setStillFailed,
        stillUrl,
        anchor,
        mediaStart,
        frameAtElementTime,
        elementTimeForFrame,
        videoRef,
        streamRef,
        throughput,
        seekQueue,
        measureBuffered,
        muted,
        setMuted,
        volume,
        setVolume,
        playbackRate,
        ...transport,
        stage,
        sectionRef,
        stageRef,
        zoom,
        pan,
        fullscreen,
        changeZoom,
        resetView,
        toggleFullscreen,
        prefetchNextWindow,
        chooseSource,
        onKeyDown,
    };
}

/** Everything one player instance exposes, for a transport that renders against it. */
export type PreviewSession = ReturnType<typeof usePreviewSession>;
