import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";

import {
    finishPlaybackInterval,
    playPicture,
    sourceIsExhausted as checkSourceExhausted,
} from "./playback-interval";
import { PlaybackRecorder } from "./playback-metrics";
import {
    RETAIN_BEHIND_SECONDS,
    prefetchFitsBudget,
    type PreviewBufferPlan,
} from "./preview-buffer-plan";
import type { PreviewSource } from "./preview-player";
import { nextCoveredFrameIn, playbackView, sceneStepFrame } from "./preview-playback-view";
import type { SeekQueue } from "./preview-seek";
import { PreviewStream } from "./preview-stream";

type Coverage = { from: number | null; to: number | null };

type PreviewPlaybackOptions = {
    source: PreviewSource;
    url: string | null;
    playhead: number | null;
    onSeek: (frame: number) => void;
    frameRate: number | null;
    totalFrames: number;
    playbackRate: number;
    setPlaybackRate: Dispatch<SetStateAction<number>>;
    anchor: number;
    chunkScene: number | null;
    sceneIndex: number | null;
    sceneStarts: readonly number[];
    sceneEnds: readonly number[];
    streamStart: number;
    setStreamStart: Dispatch<SetStateAction<number>>;
    setStreamEpoch: Dispatch<SetStateAction<number>>;
    setOpenScene: Dispatch<SetStateAction<number | null>>;
    coverage: RefObject<Coverage>;
    windowFrames: number;
    bufferedEnd: number;
    bufferRange: { start: number; end: number };
    throughput: number | null;
    leadAhead: (element: HTMLVideoElement) => number;
    resetBuffer: () => void;
    reportBuffer: (range: { start: number; end: number }) => void;
    seekQueue: RefObject<SeekQueue | null>;
    streamRef: RefObject<PreviewStream | null>;
    videoRef: RefObject<HTMLVideoElement | null>;
    /** The live buffer policy, read by the MediaSource session's appetite and trim. */
    plan: RefObject<PreviewBufferPlan>;
    audioRef: RefObject<HTMLAudioElement | null>;
    audioHeld: RefObject<boolean>;
    syncAudio: (element: HTMLVideoElement) => void;
    audioOffset: number;
    mediaStart: RefObject<number>;
    frameAtElementTime: (time: number) => number;
    elementTimeForFrame: (frame: number) => number;
    resetView: () => void;
};

/**
 * The picture's lifecycle: attachment, presented-frame clock, seeks, holds, and transport
 * controls.
 *
 * The element is the only source of playback truth. Its presented frames advance the
 * playhead, its buffer decides when playback must wait, and its own terminal state decides
 * where a run stops. Everything here derives from those signals rather than a stored phase.
 */
export function usePreviewPlayback({
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
    plan,
    audioRef,
    audioHeld,
    syncAudio,
    audioOffset,
    mediaStart,
    frameAtElementTime,
    elementTimeForFrame,
    resetView,
}: PreviewPlaybackOptions) {
    const [playing, setPlaying] = useState(false);
    // These callbacks are deliberately read at event time. Capturing the latest function in
    // a ref keeps an effect's scheduling tied to the URL or play state that owns it, rather
    // than to a fresh callback identity on every render.
    const resetViewRef = useRef(resetView);
    resetViewRef.current = resetView;
    /** The element has run out of decoded picture: a cut whose chunk is still being built. */
    const [starved, setStarved] = useState(false);
    /**
     * Playback is paused on purpose because the proxy has not built a lead yet.
     *
     * Letting the element play into a buffer that is still arriving is what produced the
     * few-frames loop: it uncovered a fragment, ran dry, and uncovered the next one. Holding
     * the picture until a real lead exists means every presented frame is shown once, in
     * order, and the transport and sound stop with it instead of running on.
     */
    const [held, setHeld] = useState(false);
    const holding = useRef(false);
    /**
     * The frame the user asked for, which the element has not shown yet.
     *
     * Playback keeps presenting old frames for a moment after a seek, and those reports
     * used to overwrite the requested playhead. Holding the request here lets the transport
     * show where the picture is going, and stops the frame callback from reporting frames
     * the user has already left.
     */
    const [pendingFrame, setPendingFrame] = useState<number | null>(null);
    const pendingFrameRef = useRef<number | null>(null);
    const askForFrame = useCallback((frame: number | null) => {
        pendingFrameRef.current = frame;
        setPendingFrame(frame);
    }, []);
    /** Uncovered frames the player jumped over, for one short, self-clearing notice. */
    const [skipped, setSkipped] = useState<{ from: number; to: number } | null>(null);
    const skippedTimer = useRef<number | null>(null);
    const noteSkipped = useCallback((from: number, to: number) => {
        if (to <= from) {
            return;
        }
        setSkipped({ from, to });
        if (skippedTimer.current !== null) {
            window.clearTimeout(skippedTimer.current);
        }
        skippedTimer.current = window.setTimeout(() => {
            skippedTimer.current = null;
            setSkipped(null);
        }, 5000);
    }, []);
    const nextCoveredFrame = useCallback(
        (frame: number): number | null =>
            nextCoveredFrameIn(frame, sceneStarts, sceneEnds, totalFrames),
        [sceneStarts, sceneEnds, totalFrames],
    );
    const resumeAfterSource = useRef(false);
    const pendingTarget = useRef<number | null>(null);
    // The last frame the element itself reported. A playhead that matches it came from
    // playback, not from a rail or timeline seek, and must never be written back to the
    // element: doing so seeks backwards by a frame on every `timeupdate` and is what made
    // the picture stutter and repeat.
    const reportedFrame = useRef<number | null>(null);
    /** The playhead this render was given, for the frame callback's own reporting. */
    const playheadRef = useRef(playhead);
    playheadRef.current = playhead;
    /** When the playhead was last written to the screen, so it updates at most 10×/s. */
    const reportedAt = useRef(0);
    /** Wall time of the last presented frame: the only proof the picture is moving. */
    const presentedAt = useRef(0);
    /** Smoothness and latency for the interval now playing; replaced on every source and pause. */
    const recorder = useRef<PlaybackRecorder | null>(null);
    /** Chrome's counters are cumulative per element, so each interval reports its own delta. */
    const countedFrames = useRef({
        element: null as HTMLVideoElement | null,
        produced: 0,
        dropped: 0,
    });
    const [ready, setReady] = useState(false);
    /**
     * The URL whose element is actually ready.
     *
     * `ready` outlives a source swap by one render: the effect that resets it on a new URL
     * runs after the effects of that render, so the resume effect could see `ready` from the
     * old stream and start an element with no data at all. Readiness is recorded by the
     * element that reported it, and a resume only applies to that same URL.
     */
    const readyUrl = useRef<string | null>(null);
    /**
     * The latest pending-request applier.
     *
     * A buffered append can make the requested frame reachable between two media events.
     * The buffer effect below calls through this ref so a growing window retries the seek
     * without waiting for a `canplay` or `seeked` that the element may already have sent.
     */
    const applyPendingRef = useRef<(element: HTMLVideoElement) => void>(() => undefined);
    /**
     * The requested frame is on screen. Decoded deliberately clears the stage here, with
     * whatever lead exists: this is an editor, so frames are shown as they land rather than
     * waiting for a buffer. Encoded also waits for its chunk separately before it can play.
     */
    const markReady = () => {
        readyUrl.current = url;
        setReady(true);
    };
    /** The proxy's response ended: its file is complete, so building the next one is not a
     * second concurrent decode. */
    const [complete, setComplete] = useState(false);
    // An Encoded chunk has one keyframe, so a backward seek into it is a decode walk from
    // the scene's first frame. This is only for saying so while it happens.
    const [walking, setWalking] = useState(false);
    const [failed, setFailed] = useState(false);
    /** The service's own reason, when it gave one; the notice stays generic otherwise. */
    const [failure, setFailure] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    /** Start the picture, and treat only a real failure as one. */
    const startPicture = (element: HTMLVideoElement) => {
        playPicture(element, () => setFailed(true));
    };

    useEffect(() => {
        // The old element is removed without a `pause` event, so its `playing` would leave
        // the transport showing Pause over a stopped picture. The intent to continue is
        // captured wherever the URL is about to change (a window's grid, another encoded
        // scene, or a source switch), then the new element reports its own play state.
        setPlaying(false);
        setReady(false);
        readyUrl.current = null;
        setComplete(false);
        setWalking(false);
        setStarved(false);
        setFailed(false);
        setFailure(null);
        // The skipped notice is left alone: stepping over an uncovered range is exactly
        // what changes the URL, and clearing it here would hide the one message that
        // explains why the picture moved. Its own timer retires it.
        mediaStart.current = 0;
        setCurrentTime(0);
        setDuration(0);
        resetViewRef.current();
        holding.current = false;
        setHeld(false);
        presentedAt.current = 0;
        reportedAt.current = 0;
        pendingTarget.current = null;
        reportedFrame.current = null;
        recorder.current = new PlaybackRecorder(source);
        // Only `url` and `source` mean the element changed; the play state is read at that
        // moment rather than followed, or a play/pause would rerun this reset. `resetView`
        // is a render-local action, not a reason to reset playback.
    }, [url, source, mediaStart]);

    // A proxy that is still growing is attached through MediaSource, not `src`. The element
    // then keeps the bytes it has received, so a seek inside them is a buffer lookup instead
    // of a byte range the service cannot satisfy until the build finishes. `Original` is a
    // complete file that the network layer already seeks, so it keeps the direct source; a
    // host without MediaSource falls back to it too rather than refusing to play.
    useEffect(() => {
        const element = videoRef.current;
        if (element === null || url === null) {
            return;
        }
        resetBuffer();
        if (source === "original" || !PreviewStream.available()) {
            element.src = url;
            return () => {
                element.removeAttribute("src");
                element.load();
            };
        }
        const stream = new PreviewStream(
            element,
            {
                // The stage clears only when the requested frame is on screen. A window that
                // opens at its own first frame is not the frame the user asked for, and
                // clearing the overlay there started playback a whole window early.
                onBuffered: reportBuffer,
                onError: (message) => {
                    console.warn("[preview]", message);
                    setFailure(message);
                    setFailed(true);
                },
            },
            {
                // Decoded's lead is what its measured bitrate can hold, and it is the cap
                // in motion too, so queued windows cannot grow the element past what the
                // plan measured. A paused read returns before this is consulted. Encoded
                // keeps the appetite that lets one scene chunk load before its cut.
                maxAheadSeconds: () => (source === "decoded" ? plan.current.leadSeconds : 5),
                retainBehindSeconds: () => (source === "decoded" ? RETAIN_BEHIND_SECONDS : 2),
                // The look-ahead response is not appended yet, so it is not in the lead the
                // plan measured. Count its estimated size before holding a second copy of a
                // window; an expensive source then requests it only when the append is done.
                canPrefetchAhead: () => source !== "decoded" || prefetchFitsBudget(plan.current),
            },
        );
        streamRef.current = stream;
        stream.open(url);
        return () => {
            streamRef.current = null;
            stream.close();
        };
    }, [
        url,
        source,
        resetBuffer,
        reportBuffer,
        streamRef,
        videoRef,
        plan,
        frameRate,
        windowFrames,
    ]);

    // A new element carries no rate of its own. The picture always runs at its own speed:
    // slowing it to present every frame made playback run at half speed whenever the host
    // compositor dropped a few frames, which is worse than the drops themselves.
    useEffect(() => {
        if (videoRef.current !== null) {
            videoRef.current.playbackRate = 1;
        }
        if (audioRef.current !== null) {
            audioRef.current.playbackRate = 1;
        }
        setPlaybackRate(1);
    }, [url, frameRate, audioRef, videoRef, setPlaybackRate]);

    // A new element starts paused. When a run was already playing, it resumes as soon as
    // its requested frame is on screen, however that happened: a `seeked` event, or a
    // target that was already current. Waiting for `seeked` alone left the transport saying
    // Pause over a stopped picture when the new window already started on that frame and no
    // seek was needed.
    useEffect(() => {
        const element = videoRef.current;
        if (!ready || readyUrl.current !== url || element === null || !resumeAfterSource.current) {
            return;
        }
        resumeAfterSource.current = false;
        startPicture(element);
    }, [ready, url, videoRef]);

    // A screen-driven seek (a rail click, a timeline sweep, an arrow key) moves the element.
    // The element reports its own frames through `reportedFrame`, so anything else is a
    // deliberate jump — including backwards, which used to be discarded as if it were
    // playback latency and left a backward click playing on in the old position.
    useEffect(() => {
        const element = videoRef.current;
        if (element === null || frameRate === null || playhead === null) {
            return;
        }
        if (reportedFrame.current !== null && Math.abs(playhead - reportedFrame.current) < 1) {
            return;
        }
        askForFrame(playhead);
        const target = elementTimeForFrame(playhead);
        if (!ready) {
            pendingTarget.current = Math.max(0, target);
            return;
        }
        const known =
            Number.isFinite(element.duration) && element.duration > 0 ? element.duration : null;
        const next = known === null ? Math.max(0, target) : Math.max(0, Math.min(target, known));
        const tolerance = (element.paused ? 0.75 : 2) / frameRate;
        if (Math.abs(element.currentTime - next) > tolerance) {
            seekQueue.current?.request(next);
        }
    }, [
        playhead,
        frameRate,
        source,
        anchor,
        ready,
        askForFrame,
        elementTimeForFrame,
        seekQueue,
        videoRef,
    ]);

    // Decoded windows start on a fixed grid, not on the frame that happened to be clicked.
    useEffect(() => {
        if (source !== "decoded" || playhead === null || frameRate === null || windowFrames <= 0) {
            return;
        }
        const element = videoRef.current;
        if (element === null) {
            return;
        }
        const target = Math.max(0, (playhead - streamStart) / frameRate);
        if (Math.abs(element.currentTime - target) < 0.5) {
            return;
        }
        const ranges = element.buffered;
        if (
            ranges.length > 0 &&
            target >= ranges.start(0) - 0.5 &&
            target <= ranges.end(ranges.length - 1)
        ) {
            return;
        }
        const aligned = Math.max(0, Math.floor(playhead / windowFrames) * windowFrames);
        if (aligned !== streamStart) {
            resumeAfterSource.current = playing || held;
            setStreamStart(aligned);
            return;
        }
        if (ranges.length > 0 && target < ranges.start(0) - 0.5) {
            resumeAfterSource.current = playing || held;
            setStreamEpoch((epoch) => epoch + 1);
        }
    }, [
        playhead,
        source,
        streamStart,
        frameRate,
        windowFrames,
        playing,
        held,
        setStreamStart,
        setStreamEpoch,
        videoRef,
    ]);

    // Reopen the encoded element only when the playhead leaves the range its session
    // already holds. A cut crossed during playback, or a paused frame inside an appended
    // chunk, is a seek in the buffer rather than a new scene build.
    useEffect(() => {
        if (source !== "encode" || sceneIndex === null) {
            return;
        }
        const from = coverage.current.from;
        const to = coverage.current.to;
        if (from !== null && to !== null && sceneIndex >= from && sceneIndex <= to) {
            return;
        }
        if (chunkScene !== sceneIndex) {
            resumeAfterSource.current = playing || held;
        }
        setOpenScene(sceneIndex);
    }, [source, sceneIndex, chunkScene, playing, held, coverage, setOpenScene]);

    const {
        currentFrame,
        seekDuration,
        anchorSeconds,
        positionSeconds,
        progress,
        bufferedFrom,
        bufferedTo,
        encodedChunkEnd,
        chunkReady,
        canPlay,
        etaLabel,
    } = playbackView({
        source,
        pendingFrame,
        currentTime,
        frameRate,
        totalFrames,
        duration,
        anchor,
        mediaStartTime: mediaStart.current,
        bufferedEnd,
        bufferRange,
        chunkScene,
        sceneStarts,
        sceneEnds,
        complete,
        throughput,
        hasUrl: url !== null,
        frameAtElementTime,
    });

    /** Close the interval that just ended and open the one that replaces it. */
    const finishPlayback = (element: HTMLVideoElement) => {
        finishPlaybackInterval(recorder, countedFrames, source, element);
    };

    const advanceScene = useCallback((): boolean => {
        if (source !== "encode" || chunkScene === null) {
            return false;
        }
        const to = coverage.current.to ?? chunkScene;
        const next = to + 1;
        const nextStart = sceneStarts[next];
        if (nextStart === undefined) {
            return false;
        }
        const through = sceneEnds[to] ?? nextStart;
        noteSkipped(through, nextStart);
        coverage.current = { from: next, to: next };
        setOpenScene(next);
        setReady(false);
        resumeAfterSource.current = true;
        onSeek(nextStart);
        return true;
    }, [source, chunkScene, sceneStarts, sceneEnds, noteSkipped, setOpenScene, coverage, onSeek]);

    // A presented frame is the only proof that playback is actually smooth, and it is the
    // only honest source for the playhead: `timeupdate` fires four times a second whether or
    // not the compositor showed the frames in between. Reading the frame's own `mediaTime`
    // means the timeline can only advance over a picture that was actually presented, so it
    // cannot run on beside frozen video.
    useEffect(() => {
        const element = videoRef.current;
        if (
            element === null ||
            (!playing && !held) ||
            typeof element.requestVideoFrameCallback !== "function"
        ) {
            return;
        }
        let handle = 0;
        const onFrame = (now: number, metadata: { mediaTime: number }) => {
            presentedAt.current = now;
            recorder.current?.frame(now);
            if (audioHeld.current) {
                audioHeld.current = false;
                syncAudio(element);
            }
            if (frameRate !== null && frameRate > 0) {
                const frame = frameAtElementTime(metadata.mediaTime);
                const target = pendingFrameRef.current;
                if (target !== null) {
                    if (Math.abs(frame - target) <= 2) {
                        askForFrame(null);
                    }
                } else {
                    const shown = playheadRef.current;
                    if (now - reportedAt.current >= 100 && (shown === null || shown !== frame)) {
                        reportedAt.current = now;
                        reportedFrame.current = frame;
                        setCurrentTime(metadata.mediaTime);
                        onSeek(frame);
                    }
                }
            }
            handle = element.requestVideoFrameCallback(onFrame);
        };
        handle = element.requestVideoFrameCallback(onFrame);
        return () => {
            element.cancelVideoFrameCallback(handle);
        };
    }, [
        playing,
        held,
        url,
        frameRate,
        anchor,
        onSeek,
        syncAudio,
        askForFrame,
        videoRef,
        audioHeld,
        frameAtElementTime,
    ]);

    /**
     * Whether the session holds the last picture its source can give.
     */
    const sourceIsExhausted = useCallback(
        (element: HTMLVideoElement): boolean =>
            checkSourceExhausted(element, {
                source,
                frameRate,
                streamStart,
                totalFrames,
                chunkScene,
                sceneStarts,
                coverageTo: coverage.current.to,
                stream: streamRef.current,
            }),
        [source, frameRate, streamStart, totalFrames, chunkScene, sceneStarts, coverage, streamRef],
    );

    /**
     * Stop on the last frame the picture actually holds.
     */
    const endPicture = useCallback(
        (element: HTMLVideoElement) => {
            holding.current = false;
            setHeld(false);
            setStarved(false);
            setPlaying(false);
            element.pause();
            audioRef.current?.pause();
            const frame = frameAtElementTime(element.currentTime);
            reportedFrame.current = frame;
            onSeek(frame);
        },
        [frameAtElementTime, onSeek, audioRef],
    );

    /**
     * Stop the picture and its sound before the buffer runs dry.
     */
    const holdPicture = () => {
        const element = videoRef.current;
        if (element === null || holding.current || element.paused) {
            return;
        }
        holding.current = true;
        setHeld(true);
        setStarved(true);
        audioHeld.current = true;
        audioRef.current?.pause();
        element.pause();
    };

    /** Continue once the proxy has built a lead again, with the sound put back on the frame. */
    const releasePicture = () => {
        if (!holding.current) {
            return;
        }
        const element = videoRef.current;
        if (element === null) {
            return;
        }
        holding.current = false;
        setHeld(false);
        setStarved(false);
        audioHeld.current = false;
        startPicture(element);
        syncAudio(element);
    };

    const holdPictureRef = useRef(holdPicture);
    holdPictureRef.current = holdPicture;
    const releasePictureRef = useRef(releasePicture);
    releasePictureRef.current = releasePicture;

    // The backward guard and the Encoded hold. Decoded never holds: when its decoder is
    // slower than realtime the element presents each appended frame as it lands, and the
    // audio pause below keeps the sound from running through the gaps. Encoded still holds
    // until its scene chunk has a lead, because a chunk ends at a cut rather than continuing
    // the same stream.
    useEffect(() => {
        if (!playing && !held) {
            return;
        }
        const timer = window.setInterval(() => {
            const element = videoRef.current;
            if (element === null) {
                return;
            }
            const audio = audioRef.current;
            if (
                playing &&
                audio !== null &&
                !audio.paused &&
                presentedAt.current > 0 &&
                performance.now() - presentedAt.current > 500
            ) {
                audio.pause();
                audioHeld.current = true;
            }
            if (playing && sourceIsExhausted(element)) {
                const ranges = element.buffered;
                const lastEnd = ranges.length === 0 ? 0 : ranges.end(ranges.length - 1);
                const stuck =
                    lastEnd > 0 &&
                    element.currentTime >= lastEnd - 0.25 &&
                    presentedAt.current > 0 &&
                    performance.now() - presentedAt.current > 400;
                if (lastEnd > 0 && (stuck || element.currentTime >= lastEnd - 0.03)) {
                    endPicture(element);
                    return;
                }
                if (holding.current) {
                    releasePictureRef.current();
                }
                return;
            }
            if (holding.current) {
                if (leadAhead(element) >= 0.75) {
                    releasePictureRef.current();
                }
                return;
            }
            if (element.ended) {
                return;
            }
            if (playing && source === "encode" && leadAhead(element) < 0.12) {
                const to = coverage.current.to ?? chunkScene;
                const through = to === null ? undefined : (sceneEnds[to] ?? sceneStarts[to + 1]);
                const nextStart = to === null ? undefined : sceneStarts[to + 1];
                if (
                    through !== undefined &&
                    frameAtElementTime(element.currentTime) >= through - 1
                ) {
                    if (nextStart === undefined) {
                        return;
                    }
                    if (nextStart > through) {
                        advanceScene();
                        return;
                    }
                }
                holdPictureRef.current();
            }
        }, 200);
        return () => window.clearInterval(timer);
    }, [
        playing,
        held,
        source,
        syncAudio,
        chunkScene,
        sceneStarts,
        sceneEnds,
        anchor,
        frameRate,
        streamStart,
        windowFrames,
        totalFrames,
        advanceScene,
        frameAtElementTime,
        sourceIsExhausted,
        endPicture,
        coverage,
        leadAhead,
        videoRef,
        audioRef,
        audioHeld,
        holdPictureRef,
        releasePictureRef,
    ]);

    // A hold can be the end of a chunk whose next scene starts after frames no scene
    // covers. Holding there waits for data that will never arrive — the guard pauses one
    // frame before the end, so `ended` never fires and the player sits on "building the
    // next scene's chunk" forever. Continue with the next scene instead.
    useEffect(() => {
        if (!held || source !== "encode" || chunkScene === null) {
            return;
        }
        const element = videoRef.current;
        if (element === null) {
            return;
        }
        const to = coverage.current.to ?? chunkScene;
        const through = sceneEnds[to] ?? sceneStarts[to + 1];
        const nextStart = sceneStarts[to + 1];
        if (
            through === undefined ||
            nextStart === undefined ||
            nextStart <= through ||
            frameAtElementTime(element.currentTime) < through - 1
        ) {
            return;
        }
        advanceScene();
    }, [
        held,
        source,
        chunkScene,
        sceneEnds,
        sceneStarts,
        frameAtElementTime,
        advanceScene,
        coverage,
        videoRef,
    ]);

    const togglePlay = () => {
        const element = videoRef.current;
        if (element === null || !canPlay) {
            return;
        }
        if (element.paused && source !== "original" && sourceIsExhausted(element)) {
            const ranges = element.buffered;
            const lastEnd = ranges.length === 0 ? 0 : ranges.end(ranges.length - 1);
            if (ranges.length > 0 && element.currentTime >= lastEnd - 0.25) {
                seekQueue.current?.request(0);
                onSeek(anchor);
                startPicture(element);
                return;
            }
        }
        if (holding.current) {
            holding.current = false;
            setHeld(false);
            element.pause();
            audioRef.current?.pause();
            return;
        }
        if (element.paused) {
            startPicture(element);
            if (audioRef.current !== null) {
                audioRef.current.currentTime =
                    audioOffset + Math.max(0, element.currentTime - mediaStart.current);
            }
        } else {
            element.pause();
            audioRef.current?.pause();
        }
    };

    /**
     * Re-apply a requested frame once the element can actually honour it.
     */
    const applyPending = (element: HTMLVideoElement) => {
        if (element.readyState < 2 || element.seeking) {
            return;
        }
        const frame = pendingFrameRef.current;
        const seconds = pendingTarget.current;
        if (frame === null && seconds === null) {
            settleTarget(element);
            return;
        }
        const target =
            frame !== null && frameRate !== null && frameRate > 0
                ? Math.max(0, (frame - anchor) / frameRate)
                : seconds;
        if (target === null) {
            return;
        }
        const tolerance = frameRate === null ? 0.25 : Math.max(0.05, 0.75 / frameRate);
        if (source !== "original" && element.buffered.length > 0) {
            const end = element.buffered.end(element.buffered.length - 1);
            if (target > end + tolerance) {
                return;
            }
        }
        const duration = Number.isFinite(element.duration) ? element.duration : target;
        const bounded = Math.max(0, Math.min(target, duration));
        if (Math.abs(element.currentTime - bounded) <= tolerance) {
            pendingTarget.current = null;
            if (frame !== null && frameRate !== null) {
                const shown = frameAtElementTime(element.currentTime);
                if (Math.abs(shown - frame) <= 2) {
                    askForFrame(null);
                }
            }
            settleTarget(element);
            return;
        }
        seekQueue.current?.jump(bounded);
    };

    /**
     * Mark the requested frame ready without waiting for a `seeked` event.
     */
    const settleTarget = (element: HTMLVideoElement) => {
        // `ready` outlives a source swap for one render; the URL that reported it is the
        // authority. Otherwise a fast new element arrives while the old source's `ready` is
        // still true, skips this settle, and then the reset clears it with no second event
        // to ask again — the paused switch sits on its loading stage indefinitely.
        if (readyUrl.current === url) {
            return;
        }
        const tolerance = frameRate === null ? 0.25 : Math.max(0.05, 0.75 / frameRate);
        if (element.readyState < 2) {
            return;
        }
        const frame = pendingFrameRef.current;
        if (frame !== null) {
            if (frameRate === null) {
                return;
            }
            const shown = frameAtElementTime(element.currentTime);
            if (Math.abs(shown - frame) > 1) {
                return;
            }
            askForFrame(null);
        } else {
            const target = pendingTarget.current;
            if (target !== null && Math.abs(element.currentTime - target) > tolerance) {
                return;
            }
        }
        markReady();
        pendingTarget.current = null;
        if (resumeAfterSource.current) {
            resumeAfterSource.current = false;
            startPicture(element);
        }
    };
    applyPendingRef.current = applyPending;

    // The element's buffer grows independently of its events. A paused switch to Decoded
    // can have its metadata and its first `canplay` before the requested frame is appended;
    // when the rest of the window lands there is no new `seeked` to settle. Retry here so
    // the loading stage clears on the frame that arrived, rather than waiting for a source
    // change or a second Play. A readiness rise that follows the bytes is the element's own
    // `progress` event, which applies the same pending target.
    useEffect(() => {
        if (ready || url === null) {
            return;
        }
        const element = videoRef.current;
        if (element === null) {
            return;
        }
        if (pendingFrameRef.current === null && pendingTarget.current === null) {
            return;
        }
        applyPendingRef.current(element);
    }, [bufferedEnd, ready, url, frameRate, source, videoRef]);

    const seekToFrame = (frame: number) => {
        if (frameRate === null) {
            return;
        }
        const element = videoRef.current;
        const bounded = Math.max(0, frame);
        askForFrame(bounded);
        if (element !== null && Number.isFinite(element.duration) && element.duration > 0) {
            const relative = Math.max(0, Math.min(elementTimeForFrame(bounded), element.duration));
            seekQueue.current?.jump(relative);
        }
        onSeek(bounded);
    };
    const seekToFrameRef = useRef(seekToFrame);
    seekToFrameRef.current = seekToFrame;

    // Decoded and Encoded are both derived from the scene list, so a frame that no scene
    // covers belongs to neither. During playback the element would otherwise run through
    // it (Decoded) or wait on a hole it can never fill (Encoded): the first presented frame
    // inside an uncovered range jumps to the next scene and says so.
    useEffect(() => {
        if (!playing || playhead === null) {
            return;
        }
        const next = nextCoveredFrame(playhead);
        if (next === null) {
            return;
        }
        const from = sceneEnds.reduce(
            (best, end) => (end <= playhead ? Math.max(best, end) : best),
            0,
        );
        noteSkipped(from, next);
        seekToFrameRef.current(next);
    }, [playhead, playing, nextCoveredFrame, noteSkipped, seekToFrameRef, sceneEnds]);

    const stepFrame = (direction: -1 | 1) => {
        const base = playhead ?? currentFrame;
        if (base === null) {
            return;
        }
        seekToFrame(base + direction);
    };

    const stepScene = (direction: -1 | 1) => {
        const base = playhead ?? currentFrame;
        const frame = base === null ? null : sceneStepFrame(base, direction, sceneStarts);
        if (frame !== null) {
            seekToFrame(frame);
        }
    };

    return {
        playing,
        setPlaying,
        playbackRate,
        starved,
        setStarved,
        held,
        pendingFrameRef,
        askForFrame,
        skipped,
        resumeAfterSource,
        pendingTarget,
        reportedFrame,
        recorder,
        ready,
        markReady,
        complete,
        setComplete,
        walking,
        setWalking,
        failed,
        setFailed,
        failure,
        currentTime,
        setCurrentTime,
        duration,
        setDuration,
        currentFrame,
        seekDuration,
        anchorSeconds,
        positionSeconds,
        progress,
        bufferedFrom,
        bufferedTo,
        encodedChunkEnd,
        chunkReady,
        canPlay,
        etaLabel,
        finishPlayback,
        advanceScene,
        togglePlay,
        applyPending,
        settleTarget,
        seekToFrame,
        stepFrame,
        stepScene,
    };
}
