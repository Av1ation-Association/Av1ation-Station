import type { ReactNode } from "react";

import { Film, Loader2, TriangleAlert, X } from "lucide-react";

import { type PreviewSource } from "./preview-player";
import { PlayerTransport } from "./PlayerTransport";
import { useFullscreenChrome } from "./use-fullscreen-chrome";
import { usePreviewSession } from "./use-preview-session";

export type { PreviewSource } from "./preview-player";

/**
 * The one player the Scenes tab owns.
 *
 * The source control switches the element's `src` instead of mounting a second video, so a
 * switch cannot leave a hidden decode running or double the audio. The playhead is a frame
 * number owned by the screen, which the rail and timeline also write; the player seeks when
 * it changes and reports its own position back while it plays. A LAN browser cannot put its
 * bearer token on a `<video>` request, so it gets an explanatory stage rather than a
 * request that silently 401s.
 */
export function ScenePlayer({
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
    overlay,
    className = "",
}: {
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
    /**
     * Each scene's encoder fingerprint, in scene order.
     *
     * An encoded chunk is a picture of one encoder document, so the value belongs in the
     * source URL: when the document changes the URL changes, the element is reopened, and
     * the service builds the chunk the new settings describe instead of replaying the
     * bytes it already holds.
     */
    encoderFingerprints?: readonly (string | null | undefined)[];
    /**
     * The scene table's fingerprint.
     *
     * A script can change the picture from a scene's `sequence_data`, including the user's
     * own pairs, so an edit to that table changes what the derived sources decode. The
     * value belongs in their URLs: a changed table is a different request, the element is
     * reopened, and the service decodes the window again instead of replaying bytes built
     * under the old table.
     */
    sceneFingerprint?: string;
    /** Source length, so a live decoded stream has a seek range without an MP4 duration. */
    totalFrames?: number;
    /** The optional scene overlay; it never receives pointer events. */
    overlay?: ReactNode;
    className?: string | undefined;
}) {
    const session = usePreviewSession({
        projectId,
        videoId,
        source,
        onSourceChange,
        frameRate,
        playhead,
        onSeek,
        baseFrame,
        sceneIndex,
        sceneStarts,
        sceneEnds,
        encoderFingerprints,
        sceneFingerprint,
        totalFrames,
    });
    const {
        audioTrack,
        audioFailed,
        setAudioFailed,
        audioNoticeDismissed,
        setAudioNoticeDismissed,
        playing,
        setPlaying,
        starved,
        setStarved,
        held,
        needsScene,
        pendingFrameRef,
        askForFrame,
        skipped,
        setStreamStart,
        url,
        stillFrame,
        stillFailed,
        setStillFailed,
        stillUrl,
        anchor,
        mediaStart,
        frameAtElementTime,
        elementTimeForFrame,
        audioOffset,
        audioUrl,
        videoRef,
        audioRef,
        streamRef,
        resumeAfterSource,
        pendingTarget,
        reportedFrame,
        recorder,
        ready,
        markReady,
        setComplete,
        walking,
        setWalking,
        startAudio,
        failed,
        setFailed,
        failure,
        setCurrentTime,
        setDuration,
        muted,
        stage,
        sectionRef,
        stageRef,
        zoom,
        pan,
        fullscreen,
        seekQueue,
        audioHeld,
        syncAudio,
        measureBuffered,
        chunkReady,
        canPlay,
        etaLabel,
        finishPlayback,
        advanceScene,
        prefetchNextWindow,
        applyPending,
        settleTarget,
        onKeyDown,
        status,
    } = session;
    const chrome = useFullscreenChrome(fullscreen);

    return (
        <section
            ref={sectionRef}
            aria-label="Video preview"
            data-preview-source={source}
            data-preview-ready={ready ? "true" : "false"}
            data-preview-playable={canPlay ? "true" : "false"}
            data-preview-seeking={walking ? "true" : "false"}
            tabIndex={0}
            onKeyDown={(event) => {
                chrome.reveal();
                onKeyDown(event);
            }}
            onPointerMove={chrome.reveal}
            onFocus={chrome.reveal}
            className={`relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                fullscreen ? "h-screen w-screen rounded-none border-0" : ""
            } ${className}`}
        >
            <div
                ref={stageRef}
                {...stage.handlers}
                className={`relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden bg-sunken ${
                    zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                }`}
            >
                {needsScene ? (
                    <div className="flex max-w-[44ch] flex-col items-center gap-2 px-6 text-center">
                        <Film
                            aria-hidden="true"
                            className="h-8 w-8 text-ink-muted"
                            strokeWidth={1.4}
                        />
                        <p className="m-0 text-[13px] font-medium text-ink">
                            No scene at the playhead
                        </p>
                        <p className="m-0 text-[11px] leading-relaxed text-ink-secondary">
                            The Encoded source reproduces one scene's chunk. Detect scenes or move
                            the playhead inside one, then choose Encoded again.
                        </p>
                    </div>
                ) : url === null ? (
                    <div className="flex max-w-[44ch] flex-col items-center gap-2 px-6 text-center">
                        <Film
                            aria-hidden="true"
                            className="h-8 w-8 text-ink-muted"
                            strokeWidth={1.4}
                        />
                        <p className="m-0 text-[13px] font-medium text-ink">
                            Preview needs the desktop window
                        </p>
                        <p className="m-0 text-[11px] leading-relaxed text-ink-secondary">
                            A paired browser cannot attach its session token to a media request. The
                            file is still readable through the rest of this page.
                        </p>
                    </div>
                ) : (
                    <>
                        <video
                            key={url}
                            ref={videoRef}
                            preload="metadata"
                            playsInline
                            muted={
                                muted ||
                                source !== "original" ||
                                (audioTrack !== null && !audioFailed)
                            }
                            aria-label={`${status.label} video`}
                            style={{
                                transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(zoom)})`,
                            }}
                            className="h-full w-full object-contain select-none"
                            onLoadedMetadata={(event) => {
                                const element = event.currentTarget;
                                // A cut file's own timeline may start after zero. The
                                // element opens on its first presentable sample, so its
                                // initial `currentTime` is that start; `seekable.start(0)`
                                // reports 0 for the same file and cannot be trusted for
                                // this. Record it before the first target is computed, or a
                                // seek to frame 0 parks on a target the element can never
                                // reach and playback reports nothing.
                                const start = element.currentTime;
                                mediaStart.current =
                                    source === "original" &&
                                    Number.isFinite(start) &&
                                    start > 0 &&
                                    start < 10
                                        ? start
                                        : 0;
                                setDuration(
                                    Number.isFinite(element.duration) ? element.duration : 0,
                                );
                                // The parent's playhead is the request. The pending frame is
                                // normally already set by the seek effect; this covers the
                                // first load, before that effect has run.
                                if (pendingFrameRef.current === null && playhead !== null) {
                                    askForFrame(playhead);
                                }
                                const frame = pendingFrameRef.current;
                                const target =
                                    frame !== null && frameRate !== null
                                        ? elementTimeForFrame(frame)
                                        : null;
                                pendingTarget.current = target;
                                if (target !== null) {
                                    const bounded = Number.isFinite(element.duration)
                                        ? Math.min(target, element.duration)
                                        : target;
                                    seekQueue.current?.jump(bounded);
                                }
                                if (source === "original") {
                                    pendingTarget.current = null;
                                    askForFrame(null);
                                    markReady();
                                } else {
                                    // Decoded and Encoded clear the stage only once the
                                    // requested frame is actually reachable. Marking them
                                    // ready here showed the stream's first frame as if it
                                    // were the playhead's, and playback started early.
                                    applyPending(element);
                                }
                                syncAudio(element);
                                // The ready effect decides when to resume: a target that is
                                // already current fires no `seeked`, so waiting for that
                                // event alone left Pause over a stopped picture.
                            }}
                            onSeeked={(event) => {
                                const element = event.currentTarget;
                                // A paused seek moves the element while no frame callback is
                                // running, so the transport's position has to be read here.
                                setCurrentTime(element.currentTime);
                                // Let the queue release the newest target now that this walk
                                // is done, and only then put the sound on the new frame.
                                seekQueue.current?.settle(
                                    element.currentTime,
                                    frameRate === null ? 0.25 : 0.5 / frameRate,
                                );
                                setWalking(false);
                                syncAudio(element);
                                // A stream still being built can land short of the frame it
                                // was asked for. That is not the frame the loading stage is
                                // waiting on, so ask again once more has been appended.
                                const frame = pendingFrameRef.current;
                                if (frame !== null && frameRate !== null) {
                                    const shown = frameAtElementTime(element.currentTime);
                                    // The seek has landed. Clearing here is what lets the frame
                                    // callback report again; a browser may land a couple of
                                    // frames from an arbitrary target.
                                    if (Math.abs(shown - frame) <= 2) {
                                        askForFrame(null);
                                    }
                                }
                                const target = pendingTarget.current;
                                const tolerance =
                                    frameRate === null ? 0.25 : Math.max(0.05, 0.75 / frameRate);
                                if (
                                    target !== null &&
                                    Math.abs(element.currentTime - target) <= tolerance
                                ) {
                                    pendingTarget.current = null;
                                }
                                // The requested frame is on screen; the ready effect applies
                                // the resume a deliberate seek interrupted.
                                if (!ready) {
                                    settleTarget(element);
                                } else {
                                    applyPending(element);
                                }
                            }}
                            onCanPlay={(event) => applyPending(event.currentTarget)}
                            onWaiting={() => {
                                // No decoded picture is on its way — a cut whose chunk is
                                // still being built. Stop the sound with the picture and let
                                // the prefetch start now that the buffer has actually run dry.
                                setStarved(true);
                                prefetchNextWindow();
                                audioHeld.current = false;
                                audioRef.current?.pause();
                            }}
                            onPlaying={(event) => {
                                setStarved(false);
                                syncAudio(event.currentTarget);
                            }}
                            onProgress={(event) => {
                                const element = event.currentTarget;
                                measureBuffered(element);
                                applyPending(element);
                                const end =
                                    element.buffered.length > 0
                                        ? element.buffered.end(element.buffered.length - 1)
                                        : 0;
                                if (
                                    Number.isFinite(element.duration) &&
                                    element.duration > 0 &&
                                    end >= element.duration - 0.05
                                ) {
                                    setComplete(true);
                                }
                            }}
                            onDurationChange={(event) => {
                                // A fragmented proxy still being written reports an
                                // unknown length; a finite value arrives as fragments
                                // are parsed. Keep the newest real length so the seek
                                // bar becomes usable without waiting for the end.
                                const length = event.currentTarget.duration;
                                if (Number.isFinite(length) && length > 0) {
                                    setDuration(length);
                                }
                            }}
                            onTimeUpdate={(event) => {
                                const element = event.currentTarget;
                                measureBuffered(element);
                                const ranges = element.buffered;
                                const ahead =
                                    ranges.length > 0
                                        ? ranges.end(ranges.length - 1) - element.currentTime
                                        : 0;
                                if (ahead > 0.5) {
                                    setStarved(false);
                                }
                                prefetchNextWindow();
                                if (audioRef.current !== null && audioRef.current.readyState >= 1) {
                                    if (
                                        Math.abs(
                                            audioRef.current.currentTime -
                                                (audioOffset +
                                                    Math.max(
                                                        0,
                                                        element.currentTime - mediaStart.current,
                                                    )),
                                        ) > 0.5
                                    ) {
                                        audioRef.current.currentTime =
                                            audioOffset +
                                            Math.max(0, element.currentTime - mediaStart.current);
                                    }
                                }
                                // The playhead is written from presented frames, not from this
                                // event: the clock moves whether or not a frame was shown. A
                                // host without frame callbacks has only this event, so it
                                // keeps the old behaviour rather than a frozen clock.
                                if (typeof element.requestVideoFrameCallback !== "function") {
                                    setCurrentTime(element.currentTime);
                                    if (source === "encode" && !ready) {
                                        return;
                                    }
                                    // A pending request is not overwritten by the frames the
                                    // element presents on its way to the requested one.
                                    if (pendingFrameRef.current !== null) {
                                        return;
                                    }
                                    if (frameRate !== null) {
                                        const frame = frameAtElementTime(element.currentTime);
                                        reportedFrame.current = frame;
                                        if (playhead === null || Math.abs(frame - playhead) >= 1) {
                                            onSeek(frame);
                                        }
                                    }
                                }
                            }}
                            onPlay={() => {
                                setPlaying(true);
                                setStarved(false);
                                recorder.current?.playStarted(performance.now());
                                if (audioRef.current !== null) {
                                    // The first presented frame starts the sound; until then
                                    // the picture has nothing to synchronize it to.
                                    audioHeld.current = true;
                                    audioRef.current.pause();
                                }
                            }}
                            onSeeking={() => {
                                recorder.current?.seekStarted(performance.now());
                                seekQueue.current?.busy();
                                // An Encoded walk is long enough to see; Decoded and Original
                                // seeks answer inside a frame and must not flash a notice.
                                if (source === "encode" && ready) {
                                    setWalking(true);
                                }
                                audioRef.current?.pause();
                            }}
                            onPause={(event) => {
                                setPlaying(false);
                                // A source switch removes this element; its farewell pause is
                                // not an interval the user watched. A hold is: it is a pause
                                // of the picture, so the interval that ran into it is
                                // published, and the resume starts a fresh one.
                                if (event.currentTarget.isConnected) {
                                    finishPlayback(event.currentTarget);
                                }
                                audioRef.current?.pause();
                            }}
                            onEnded={(event) => {
                                const element = event.currentTarget;
                                setPlaying(false);
                                if (element.isConnected) {
                                    finishPlayback(element);
                                }
                                audioRef.current?.pause();
                                // A window is not the video: continue with the next one from
                                // the frame this one stopped at, and keep playing.
                                // With a MediaSource session the next window is already
                                // appended, so the element does not end at a window edge.
                                if (
                                    source === "decoded" &&
                                    frameRate !== null &&
                                    (streamRef.current === null ||
                                        !streamRef.current.supportsAppend)
                                ) {
                                    const advanced =
                                        anchor + Math.round(element.duration * frameRate);
                                    if (advanced > anchor && advanced < totalFrames) {
                                        setStreamStart(advanced);
                                        resumeAfterSource.current = true;
                                        setCurrentTime(0);
                                        onSeek(advanced);
                                    }
                                }
                                // An encoded chunk ends at its scene's last frame. Continue
                                // with the next scene's chunk, which was built while this one
                                // played, instead of stopping at every cut.
                                advanceScene();
                            }}
                            onError={() => setFailed(true)}
                            onClick={stage.onVideoClick}
                        />
                        {source === "decoded" &&
                        stillUrl !== null &&
                        stillFrame !== null &&
                        !playing &&
                        !stillFailed ? (
                            <img
                                key={stillUrl}
                                src={stillUrl}
                                alt=""
                                aria-hidden="true"
                                onError={() => setStillFailed(true)}
                                style={{
                                    transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(zoom)})`,
                                }}
                                className="pointer-events-none absolute inset-0 h-full w-full object-contain select-none"
                            />
                        ) : null}
                        {audioUrl !== null ? (
                            <audio
                                ref={audioRef}
                                src={audioUrl ?? undefined}
                                preload="auto"
                                aria-label="Selected audio track"
                                className="hidden"
                                onLoadedMetadata={(event) => {
                                    const video = videoRef.current;
                                    event.currentTarget.currentTime =
                                        audioOffset +
                                        Math.max(0, (video?.currentTime ?? 0) - mediaStart.current);
                                    if (video !== null && !video.paused) {
                                        startAudio(event.currentTarget);
                                    }
                                }}
                                onError={(event) => {
                                    // A load aborted by a new `src` is not a broken track.
                                    if (event.currentTarget.error?.code !== 1) {
                                        setAudioFailed(true);
                                        setAudioNoticeDismissed(false);
                                    }
                                }}
                            />
                        ) : null}
                    </>
                )}

                {url !== null && !ready && !failed ? (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 px-6 text-center">
                        <Loader2
                            aria-hidden="true"
                            className="h-5 w-5 animate-spin text-ink-secondary motion-reduce:animate-none"
                        />
                        {source === "original" ? null : (
                            <p className="m-0 max-w-[46ch] text-[10.5px] leading-relaxed text-ink-secondary">
                                {source === "decoded"
                                    ? "Decoding the Parallel Encoder input from the playhead. The stream is lossless and starts on its first frames."
                                    : "Encoding this scene from its first frame with the run's own encoder. Playback starts when the requested frame is ready."}
                                {etaLabel === null ? null : ` ${etaLabel}.`}
                            </p>
                        )}
                    </div>
                ) : null}
                {walking && !starved && !failed ? (
                    <div
                        role="status"
                        className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto flex w-fit items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-[10.5px] text-ink-secondary"
                    >
                        <Loader2
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin motion-reduce:animate-none"
                        />
                        Decoding this chunk from the scene's first frame
                    </div>
                ) : null}
                {source === "encode" && ready && !chunkReady && !failed ? (
                    <div
                        role="status"
                        className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto flex w-fit items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-[10.5px] text-ink-secondary"
                    >
                        <Loader2
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin motion-reduce:animate-none"
                        />
                        Encoding this scene — playback starts when it is ready
                    </div>
                ) : null}
                {held && !failed ? (
                    <div
                        role="status"
                        className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto flex w-fit items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-[10.5px] text-ink-secondary"
                    >
                        <Loader2
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin motion-reduce:animate-none"
                        />
                        Buffering the preview
                    </div>
                ) : starved && ready && chunkReady && !failed ? (
                    <div
                        role="status"
                        className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto flex w-fit items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-[10.5px] text-ink-secondary"
                    >
                        <Loader2
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin motion-reduce:animate-none"
                        />
                        {source === "encode"
                            ? "Building the next scene's chunk"
                            : "Waiting for the next window's frames"}
                    </div>
                ) : null}
                {skipped !== null && !failed ? (
                    <div
                        role="status"
                        className="pointer-events-none absolute inset-x-0 top-2 mx-auto flex w-fit items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1.5 text-[10.5px] text-ink-secondary"
                    >
                        Skipped {(skipped.to - skipped.from).toLocaleString()} uncovered
                        {skipped.to - skipped.from === 1 ? " frame" : " frames"}
                    </div>
                ) : null}
                {audioFailed && !audioNoticeDismissed && audioUrl !== null ? (
                    <div
                        role="status"
                        data-tips="up"
                        className="absolute inset-x-0 bottom-2 mx-auto flex w-fit max-w-[46ch] items-center gap-2 rounded-md bg-black/70 py-1.5 pr-1.5 pl-3 text-[10.5px] text-ink"
                    >
                        <span className="text-center">
                            {source === "original"
                                ? "That audio track could not be prepared, so the file's own audio is playing instead."
                                : "That audio track could not be prepared, so this preview has no sound."}
                        </span>
                        <button
                            type="button"
                            aria-label="Dismiss the audio notice"
                            data-tip="Dismiss"
                            onClick={() => setAudioNoticeDismissed(true)}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink"
                        >
                            <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                    </div>
                ) : null}
                {failed ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6">
                        <div className="max-w-[46ch] text-center">
                            <TriangleAlert
                                aria-hidden="true"
                                className="mx-auto h-6 w-6 text-warning"
                                strokeWidth={1.6}
                            />
                            <p className="mt-2 mb-0 text-[12px] font-medium text-ink">
                                {failure === null
                                    ? "This file cannot be played in the window"
                                    : "The preview could not be prepared"}
                            </p>
                            {failure === null ? (
                                <p className="mt-1 mb-0 text-[10.5px] leading-relaxed text-ink-secondary">
                                    {source === "original"
                                        ? "The container or codec is not supported here."
                                        : "The source or encoder could not prepare a preview."}{" "}
                                    The scene table, selection, and timeline still work.
                                </p>
                            ) : (
                                <p className="mt-1 mb-0 text-[10.5px] leading-relaxed break-words text-ink-secondary">
                                    {failure}
                                </p>
                            )}
                        </div>
                    </div>
                ) : null}
                {url === null ? null : overlay}
            </div>

            <PlayerTransport
                session={session}
                source={source}
                sceneIndex={sceneIndex}
                frameRate={frameRate}
                playhead={playhead}
                onSeek={onSeek}
                chromeVisible={chrome.visible}
            />
        </section>
    );
}
