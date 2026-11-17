import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play } from "lucide-react";

import { formatPlaybackClock, formatTimecode, parseTimecode } from "../../shared/format";
import { shortcutChords } from "../../shared/shortcuts";
import { type PreviewSource } from "./preview-player";
import { PreviewSoundMenu } from "./PreviewSoundMenu";
import { PreviewSourceMenu } from "./PreviewSourceMenu";
import type { PreviewSession } from "./use-preview-session";

type PlayerTransportProps = {
    session: PreviewSession;
    source: PreviewSource;
    sceneIndex: number | null;
    frameRate: number | null;
    playhead: number | null;
    onSeek: (frame: number) => void;
    /** Whether the fullscreen overlay is currently revealed. */
    chromeVisible: boolean;
};

export function PlayerTransport({
    session,
    source,
    sceneIndex,
    frameRate,
    playhead,
    onSeek,
    chromeVisible,
}: PlayerTransportProps) {
    const {
        anchorSeconds,
        audioLabel,
        audioTrack,
        audioTracks,
        bufferedFrom,
        bufferedTo,
        canPlay,
        changeZoom,
        chooseAudio,
        chooseSource,
        chunkReady,
        commitFrame,
        commitTimecode,
        currentFrame,
        currentTime,
        encodeFrom,
        encodedChunkEnd,
        etaLabel,
        frameDraft,
        frameInvalid,
        fullscreen,
        held,
        lastFrame,
        muted,
        playbackRate,
        playing,
        positionSeconds,
        progress,
        resumeAfterSource,
        seekDuration,
        seekQueue,
        setCurrentTime,
        setEncodeFrom,
        setFrameDraft,
        setFrameInvalid,
        setMuted,
        setSoundOpen,
        setStreamStart,
        setTimecodeDraft,
        setTimecodeInvalid,
        setVolume,
        soundOpen,
        soundRoot,
        stepFrame,
        streamStart,
        throughput,
        timecodeDraft,
        timecodeInvalid,
        toggleFullscreen,
        togglePlay,
        typedFrame,
        url,
        videoRef,
        volume,
        volumePercent,
        windowFrames,
        zoom,
    } = session;

    return (
        <div
            data-fullscreen-chrome={fullscreen ? "true" : "false"}
            data-visible={chromeVisible ? "true" : "false"}
            className={
                fullscreen
                    ? `absolute inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${
                          chromeVisible ? "translate-y-0" : "pointer-events-none translate-y-full"
                      }`
                    : "shrink-0 border-t border-line bg-surface"
            }
        >
            <div className="relative h-1.5 bg-line">
                {/* What the element has received, at half the played part's weight:
                    a seek inside it answers from memory, and a seek outside it waits
                    for a build. */}
                <div
                    aria-hidden="true"
                    className="absolute inset-y-0 bg-brand opacity-50"
                    style={{
                        left: `${String(bufferedFrom * 100)}%`,
                        width: `${String(Math.max(0, bufferedTo - bufferedFrom) * 100)}%`,
                    }}
                />
                <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-brand"
                    style={{ width: `${String(progress * 100)}%` }}
                />
                <input
                    type="range"
                    aria-label="Seek the preview"
                    min={0}
                    max={seekDuration > 0 ? seekDuration : 0}
                    step="any"
                    value={seekDuration > 0 ? Math.min(positionSeconds, seekDuration) : 0}
                    disabled={seekDuration <= 0}
                    onChange={(event) => {
                        const element = videoRef.current;
                        const next = Number(event.target.value);
                        if (frameRate !== null && source === "decoded") {
                            // A window has no index to seek through, so the transport
                            // opens the grid window that contains the target; that
                            // window may already be built, in which case it answers at
                            // once. Crossing a window replaces the element, so a run in
                            // progress has to be carried into the new one.
                            const frame = Math.max(0, Math.round(next * frameRate));
                            const aligned = Math.floor(frame / windowFrames) * windowFrames;
                            if (aligned !== streamStart) {
                                resumeAfterSource.current = playing || held;
                            }
                            setStreamStart(aligned);
                            onSeek(frame);
                            return;
                        }
                        // The bar is the video, so an encoded chunk's element wants
                        // the offset inside its own scene. A target outside it is not
                        // seekable here; the playhead moves and the chunk follows.
                        const relative = Math.max(0, next - anchorSeconds);
                        const insideChunk =
                            source !== "encode" ||
                            encodedChunkEnd <= 0 ||
                            relative <= encodedChunkEnd + 0.001;
                        if (element !== null && insideChunk) {
                            seekQueue.current?.request(relative);
                            setCurrentTime(relative);
                        }
                        if (frameRate !== null) {
                            onSeek(Math.round(next * frameRate));
                        }
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
                />
            </div>

            {/* The bar sits on the panel's bottom edge, which clips: every bubble here
                opens over the picture instead of below the panel. */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-2.5 py-2" data-tips="up">
                <button
                    type="button"
                    aria-label="Previous frame"
                    data-tip={`Previous frame (${shortcutChords("playerPreviousFrame").join(" / ")})`}
                    data-tip-align="start"
                    disabled={url === null || (playhead ?? currentFrame) === null}
                    onClick={() => stepFrame(-1)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-35"
                >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    aria-label={playing || held ? "Pause" : "Play"}
                    onClick={togglePlay}
                    disabled={!canPlay}
                    data-tip={
                        source === "encode" && !chunkReady
                            ? "Playback starts when this scene's chunk has finished encoding"
                            : held
                              ? `Waiting for the preview to buffer (${shortcutChords("playerPlay").join(" / ")})`
                              : playing
                                ? `Pause (${shortcutChords("playerPlay").join(" / ")})`
                                : `Play (${shortcutChords("playerPlay").join(" / ")})`
                    }
                    data-tip-align="start"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-ink transition-colors duration-150 hover:bg-hover disabled:opacity-40"
                >
                    {playing || held ? (
                        <Pause aria-hidden="true" className="h-3.5 w-3.5" />
                    ) : (
                        <Play aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                </button>
                <button
                    type="button"
                    aria-label="Next frame"
                    data-tip={`Next frame (${shortcutChords("playerNextFrame").join(" / ")})`}
                    disabled={url === null || (playhead ?? currentFrame) === null}
                    onClick={() => stepFrame(1)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-35"
                >
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>

                <div className="ml-1 flex shrink-0 items-center gap-1">
                    {/* A field is a replaced element, so it cannot draw a bubble itself:
                        the tip hangs off the frame around it. */}
                    <span
                        className="flex shrink-0"
                        data-tip={
                            lastFrame === null
                                ? "Timecode"
                                : `Type a timecode up to ${formatTimecode(lastFrame, frameRate)}`
                        }
                    >
                        <input
                            aria-label="Timecode"
                            aria-invalid={timecodeInvalid}
                            value={
                                timecodeDraft ??
                                (frameRate === null
                                    ? formatPlaybackClock(currentTime)
                                    : formatTimecode(currentFrame ?? 0, frameRate))
                            }
                            placeholder="00:00:00.0"
                            disabled={currentFrame === null}
                            onChange={(event) => {
                                const text = event.target.value;
                                setTimecodeDraft(text);
                                setTimecodeInvalid(
                                    typedFrame(text, (value) => parseTimecode(value, frameRate)) ===
                                        null,
                                );
                            }}
                            onFocus={(event) => {
                                const element = event.currentTarget;
                                setTimecodeDraft(element.value);
                                element.select();
                            }}
                            onBlur={commitTimecode}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                }
                                if (event.key === "Escape") {
                                    setTimecodeDraft(null);
                                    setTimecodeInvalid(false);
                                    event.currentTarget.blur();
                                }
                            }}
                            className={`h-7 w-[86px] shrink-0 rounded-md border bg-raised px-1.5 text-center font-mono text-[10.5px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50 ${
                                timecodeInvalid
                                    ? "border-danger text-danger"
                                    : "border-line-strong text-ink"
                            }`}
                        />
                    </span>
                    <div
                        className={`flex h-7 shrink-0 items-center rounded-md border bg-raised transition-colors ${
                            frameInvalid ? "border-danger" : "border-line-strong"
                        }`}
                        data-tip={
                            lastFrame === null
                                ? "Frame number"
                                : `Frame number, 0–${lastFrame.toLocaleString()}`
                        }
                    >
                        <span className="pl-1.5 pr-0.5 font-mono text-[9px] text-ink-muted">f</span>
                        <input
                            aria-label="Frame"
                            aria-invalid={frameInvalid}
                            value={
                                frameDraft ?? (currentFrame === null ? "" : String(currentFrame))
                            }
                            placeholder="0"
                            disabled={currentFrame === null}
                            onChange={(event) => {
                                const text = event.target.value;
                                setFrameDraft(text);
                                setFrameInvalid(
                                    typedFrame(text.trim(), (value) =>
                                        /^\d+$/u.test(value) ? Number(value) : null,
                                    ) === null,
                                );
                            }}
                            onFocus={(event) => {
                                const element = event.currentTarget;
                                setFrameDraft(element.value);
                                element.select();
                            }}
                            onBlur={commitFrame}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                }
                                if (event.key === "Escape") {
                                    setFrameDraft(null);
                                    setFrameInvalid(false);
                                    event.currentTarget.blur();
                                }
                            }}
                            className={`h-full w-[52px] bg-transparent pr-1.5 text-center font-mono text-[10.5px] tabular-nums focus-visible:outline-none disabled:opacity-50 ${
                                frameInvalid ? "text-danger" : "text-ink"
                            }`}
                        />
                    </div>
                </div>
                {etaLabel === null ? null : (
                    <span
                        data-tip="Estimated from how fast this preview is buffering"
                        className="hidden shrink-0 rounded bg-raised px-1 py-0.5 font-mono text-[9.5px] text-ink-secondary tabular-nums md:inline"
                    >
                        {throughput === null ? etaLabel : `${throughput.toFixed(1)}× · ${etaLabel}`}
                    </span>
                )}
                {playbackRate < 0.999 ? (
                    <span
                        data-tip="Playing slower so every frame is shown, not skipped"
                        className="shrink-0 rounded bg-raised px-1 py-0.5 font-mono text-[9.5px] text-ink-secondary tabular-nums"
                    >
                        {playbackRate.toFixed(2)}×
                    </span>
                ) : null}

                <div className="ml-auto flex shrink-0 items-center gap-1">
                    <PreviewSoundMenu
                        soundRoot={soundRoot}
                        soundOpen={soundOpen}
                        setSoundOpen={setSoundOpen}
                        audioLabel={audioLabel}
                        volumePercent={volumePercent}
                        muted={muted}
                        volume={volume}
                        setMuted={setMuted}
                        setVolume={setVolume}
                        audioTracks={audioTracks.data}
                        audioTrack={audioTrack}
                        chooseAudio={chooseAudio}
                    />

                    <PreviewSourceMenu
                        source={source}
                        sceneIndex={sceneIndex}
                        chooseSource={chooseSource}
                        encodeFrom={encodeFrom}
                        setEncodeFrom={setEncodeFrom}
                    />

                    <label className="sr-only" htmlFor="preview-zoom">
                        Preview zoom
                    </label>
                    <span
                        className="flex shrink-0"
                        data-tip="Preview zoom; R resets to Fit"
                        data-tip-align="end"
                    >
                        <select
                            id="preview-zoom"
                            value={zoom === 1 ? "fit" : String(Math.round(zoom * 100))}
                            onChange={(event) => {
                                const value = event.target.value;
                                changeZoom(value === "fit" ? 1 : Number(value) / 100);
                            }}
                            className="h-8 rounded-md border border-line-strong bg-raised px-1.5 text-[10px] text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                        >
                            <option value="fit">Fit</option>
                            {[50, 100, 200, 400].map((percent) => (
                                <option key={percent} value={String(percent)}>
                                    {percent}%
                                </option>
                            ))}
                        </select>
                    </span>
                    <button
                        type="button"
                        aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                        aria-pressed={fullscreen}
                        onClick={toggleFullscreen}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                        {fullscreen ? (
                            <Minimize aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                            <Maximize aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
