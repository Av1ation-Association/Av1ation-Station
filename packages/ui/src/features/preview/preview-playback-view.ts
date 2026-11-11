import type { PreviewSource } from "./preview-player";

export type PlaybackViewInput = {
    source: PreviewSource;
    pendingFrame: number | null;
    currentTime: number;
    frameRate: number | null;
    totalFrames: number;
    duration: number;
    anchor: number;
    mediaStartTime: number;
    bufferedEnd: number;
    bufferRange: { start: number; end: number };
    chunkScene: number | null;
    sceneStarts: readonly number[];
    sceneEnds: readonly number[];
    complete: boolean;
    throughput: number | null;
    hasUrl: boolean;
    frameAtElementTime: (time: number) => number;
};

export function playbackView({
    source,
    pendingFrame,
    currentTime,
    frameRate,
    totalFrames,
    duration,
    anchor,
    mediaStartTime,
    bufferedEnd,
    bufferRange,
    chunkScene,
    sceneStarts,
    sceneEnds,
    complete,
    throughput,
    hasUrl,
    frameAtElementTime,
}: PlaybackViewInput) {
    const currentFrame = pendingFrame ?? frameAtElementTime(currentTime);
    const knownFrames = frameRate !== null && frameRate > 0 && totalFrames > 0 ? totalFrames : null;
    const knownDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const seekDuration =
        knownFrames !== null
            ? knownFrames / (frameRate ?? 1)
            : knownDuration > 0
              ? knownDuration
              : bufferedEnd;
    const anchorSeconds = frameRate !== null && frameRate > 0 ? anchor / frameRate : 0;
    const positionSeconds =
        pendingFrame !== null && frameRate !== null && frameRate > 0
            ? pendingFrame / frameRate
            : anchorSeconds + Math.max(0, currentTime - mediaStartTime);
    const progress = seekDuration > 0 ? Math.min(1, positionSeconds / seekDuration) : 0;
    const asFraction = (seconds: number) =>
        seekDuration > 0 ? Math.max(0, Math.min(1, (anchorSeconds + seconds) / seekDuration)) : 0;
    const bufferedFrom = asFraction(bufferRange.start);
    const bufferedTo = asFraction(bufferRange.end);

    const encodedChunkEnd = (() => {
        const end =
            chunkScene === null
                ? undefined
                : (sceneEnds[chunkScene] ?? sceneStarts[chunkScene + 1]);
        if (end === undefined || frameRate === null || frameRate <= 0) {
            return 0;
        }
        return (end - anchor) / frameRate;
    })();
    const chunkReady =
        source !== "encode" ||
        complete ||
        (encodedChunkEnd > 0 && bufferedEnd >= encodedChunkEnd - 0.1);
    const canPlay = hasUrl && chunkReady;

    const requestedSeconds =
        pendingFrame !== null && frameRate !== null && frameRate > 0
            ? pendingFrame / frameRate - anchorSeconds
            : null;
    const etaSeconds =
        requestedSeconds !== null && throughput !== null && throughput > 0.02
            ? Math.max(0, (requestedSeconds - bufferedEnd) / throughput)
            : null;
    const etaLabel =
        etaSeconds === null || etaSeconds < 1
            ? null
            : `~${String(Math.ceil(etaSeconds))} s to the requested frame`;

    return {
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
    };
}

/** The first scene start after `frame`, or null when a scene already covers it. */
export function nextCoveredFrameIn(
    frame: number,
    sceneStarts: readonly number[],
    sceneEnds: readonly number[],
    totalFrames: number,
): number | null {
    if (sceneStarts.length === 0) {
        return null;
    }
    for (let index = 0; index < sceneStarts.length; index += 1) {
        const start = sceneStarts[index] ?? 0;
        const end = sceneEnds[index] ?? sceneStarts[index + 1] ?? totalFrames;
        if (frame >= start && frame < end) {
            return null;
        }
    }
    return sceneStarts.find((start) => start > frame) ?? null;
}

/** The first frame of the previous or next scene, bounded at the first scene. */
export function sceneStepFrame(
    base: number,
    direction: -1 | 1,
    sceneStarts: readonly number[],
): number | null {
    if (sceneStarts.length === 0) {
        return null;
    }
    let current = -1;
    for (let index = 0; index < sceneStarts.length; index += 1) {
        if ((sceneStarts[index] ?? 0) <= base) {
            current = index;
        }
    }
    return sceneStarts[Math.max(0, current + direction)] ?? null;
}
