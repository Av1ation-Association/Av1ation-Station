import type { MutableRefObject } from "react";

import { PlaybackRecorder, publishPlayback } from "./playback-metrics";
import type { PreviewSource } from "./preview-player";

/** Chrome's cumulative counters last charged to the current playback interval. */
export type CountedFrames = {
    element: HTMLVideoElement | null;
    produced: number;
    dropped: number;
};

/**
 * Close one playback interval: let the element report its own drop counters, publish the
 * summary, and start a fresh interval so a pause is not counted as a stall.
 *
 * The counters live with the caller because they belong to the element, not to the
 * arithmetic, and a second playback hook must not share them.
 */
export function finishPlaybackInterval(
    recorder: MutableRefObject<PlaybackRecorder | null>,
    countedFrames: MutableRefObject<CountedFrames>,
    source: PreviewSource,
    element: HTMLVideoElement,
): void {
    const current = recorder.current;
    if (current === null) {
        return;
    }
    const quality = element.getVideoPlaybackQuality?.();
    if (quality !== undefined) {
        const previous = countedFrames.current;
        const same = previous.element === element;
        current.quality(
            Math.max(0, quality.totalVideoFrames - (same ? previous.produced : 0)),
            Math.max(0, quality.droppedVideoFrames - (same ? previous.dropped : 0)),
        );
        countedFrames.current = {
            element,
            produced: quality.totalVideoFrames,
            dropped: quality.droppedVideoFrames,
        };
    }
    if (current.hasFrames) {
        publishPlayback(current.summary());
    }
    recorder.current = new PlaybackRecorder(source);
}

/**
 * Start the picture without treating a superseded or gesture-blocked request as a broken
 * file. Repeated play/pause during a buffering hold could reject one of those requests,
 * and the failure stage would then replace a working preview.
 */
export function playPicture(element: HTMLVideoElement, onFailure: () => void): void {
    void Promise.resolve(element.play()).catch((error: unknown) => {
        if (
            error instanceof DOMException &&
            (error.name === "AbortError" || error.name === "NotAllowedError")
        ) {
            return;
        }
        onFailure();
    });
}

/**
 * Whether the decoded session has buffered through the end of the video.
 *
 * A live decoded stream has no MP4 duration, so the element's own buffered range is the
 * only honest answer to "is there more coming".
 */
export function decodedSourceBufferedThroughEnd(
    element: HTMLVideoElement,
    frameRate: number | null,
    streamStart: number,
    totalFrames: number,
): boolean {
    if (frameRate === null || frameRate <= 0 || totalFrames <= 0) {
        return false;
    }
    const ranges = element.buffered;
    if (ranges.length === 0) {
        return false;
    }
    const end = Math.max(0, totalFrames - streamStart) / frameRate;
    return ranges.end(ranges.length - 1) >= end - 0.5;
}

export type SourceExhaustion = {
    source: PreviewSource;
    frameRate: number | null;
    streamStart: number;
    totalFrames: number;
    chunkScene: number | null;
    sceneStarts: readonly number[];
    coverageTo: number | null;
    stream: { started: boolean; idle: boolean } | null;
};

/**
 * Whether the session holds the last picture its source can give.
 *
 * An encoded preview ends with the scene that has no successor; anything else ends when
 * its stream has stopped producing and delivered what it promised.
 */
export function sourceIsExhausted(element: HTMLVideoElement, state: SourceExhaustion): boolean {
    const stream = state.stream;
    if (stream === null || !stream.started || !stream.idle) {
        return false;
    }
    if (state.source === "decoded") {
        return decodedSourceBufferedThroughEnd(
            element,
            state.frameRate,
            state.streamStart,
            state.totalFrames,
        );
    }
    if (state.source === "encode") {
        const to = state.coverageTo ?? state.chunkScene;
        return to === null || state.sceneStarts[to + 1] === undefined;
    }
    return false;
}
