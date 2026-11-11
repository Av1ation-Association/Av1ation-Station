import { useCallback, useEffect, useRef, type RefObject } from "react";

import { drainPreview } from "./preview-fetch";
import { mayPrepareScene } from "./preview-buffer";
import type { PreviewStream } from "./preview-stream";

type Coverage = { from: number | null; to: number | null };

type PreviewPrefetchOptions = {
    source: "original" | "decoded" | "encode";
    url: string | null;
    ready: boolean;
    chunkReady: boolean;
    chunkScene: number | null;
    sceneIndex: number | null;
    sceneStarts: readonly number[];
    sceneEnds: readonly number[];
    encoderFingerprints: readonly (string | null | undefined)[];
    scenesQuery: string;
    encodeFrom: "decoded" | "original";
    anchor: number;
    frameRate: number | null;
    streamStart: number;
    windowFrames: number;
    totalFrames: number;
    playhead: number | null;
    currentTime: number;
    bufferedEnd: number;
    coverage: RefObject<Coverage>;
    videoRef: RefObject<HTMLVideoElement | null>;
    streamRef: RefObject<PreviewStream | null>;
};

/**
 * Builds the next picture before the current one runs out.
 *
 * Decoded preview is a sliding window appended to a MediaSource timeline; encoded preview is
 * a scene chunk whose next scene is warmed while the current one plays. Both requests are
 * deliberately held open so the service keeps the build alive, and both are tied to the
 * element that will consume them.
 */
export function usePreviewPrefetch({
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
}: PreviewPrefetchOptions) {
    /** The frame start of the window already being built ahead of playback. */
    const prefetchedWindow = useRef<number | null>(null);
    /** The next encoded scene whose build is being warmed ahead of the cut. */
    const warmedScene = useRef<number | null>(null);
    /** Cancels a decoded prefetch when the source or the window changes. */
    const prefetchAbort = useRef<AbortController | null>(null);
    /** Cancels an encoded warm-up when the player unmounts. */
    const warmAbort = useRef<AbortController | null>(null);

    /** Drop the remembered warm-up when the source identifies a new scene. */
    const resetWarm = useCallback(() => {
        warmedScene.current = null;
    }, []);

    // A new element covers exactly the scene it opened at until another chunk is appended.
    // Resetting here (rather than in the open-scene effect) keeps the range in step with
    // the URL that is actually attached.
    useEffect(() => {
        coverage.current = { from: chunkScene, to: chunkScene };
        warmedScene.current = null;
    }, [url, chunkScene, coverage]);

    // A prefetch belongs to the window that requested it. The next element starts clean.
    useEffect(() => {
        prefetchedWindow.current = null;
    }, [url]);

    /**
     * Build the next window while this one is still playing.
     *
     * The request is kept open on purpose: the service stops a build when its last viewer
     * leaves, so this viewer is what turns the window boundary into a seek inside cached
     * bytes instead of a wait for a new encode.
     */
    const prefetchNextWindow = () => {
        if (source !== "decoded" || frameRate === null || frameRate <= 0 || url === null) {
            return;
        }
        const element = videoRef.current;
        if (element === null || windowFrames <= 0) {
            return;
        }
        // The boundary is derived from the playhead, not from the element's duration: a
        // MediaSource session has none, and after a second window is appended the element's
        // clock runs past the window that is still being asked for. Half a window of lead
        // time is enough for the next one to be ready before playback reaches it.
        const position = streamStart + element.currentTime * frameRate;
        const next = (Math.floor(position / windowFrames) + 1) * windowFrames;
        if (next >= totalFrames || prefetchedWindow.current === next) {
            return;
        }
        // Ask for the next window as soon as playback is inside this one. Its build is
        // shorter than the window it replaces, so the append lands well before the seam
        // instead of arriving just as the picture runs out.
        if (next - position > windowFrames) {
            return;
        }
        prefetchedWindow.current = next;
        const base = url.split("?")[0];
        if (base === undefined) {
            return;
        }
        const target = `${base}?source=decoded&frame=${String(next)}&frames=${String(windowFrames)}${scenesQuery}`;
        // In a MediaSource session the next window is appended to the timeline that is
        // already playing, so reaching its first frame is a buffer read, not a new file.
        const stream = streamRef.current;
        if (stream !== null && stream.supportsAppend && frameRate > 0) {
            stream.append(target, (next - streamStart) / frameRate);
            return;
        }
        const controller = new AbortController();
        prefetchAbort.current = controller;
        void fetch(target, { signal: controller.signal })
            .then(drainPreview)
            .catch(() => undefined);
    };

    /**
     * Start building the chunk after the one this element holds, so the cut is a buffer
     * read instead of an encode.
     *
     * The build used to wait for the whole current chunk to arrive, which is also when the
     * user can finally press Play: the next chunk then had only one scene's playback time
     * to encode, and an encoder that runs at twice realtime missed every cut. It starts once
     * the current chunk is partly buffered or playable, whichever comes first, so the
     * encoder overlaps the review it is preparing for. The response is drained rather than left
     * open: the service publishes the cache when the build finishes, and the element's own
     * append then reads a finished file.
     */
    useEffect(() => {
        if (
            source !== "encode" ||
            url === null ||
            chunkScene === null ||
            frameRate === null ||
            frameRate <= 0
        ) {
            return;
        }
        const chunkEnd = sceneEnds[chunkScene] ?? sceneStarts[chunkScene + 1];
        if (chunkEnd === undefined) {
            return;
        }
        const chunkSeconds = (chunkEnd - anchor) / frameRate;
        if (!chunkReady && bufferedEnd < chunkSeconds * 0.4) {
            return;
        }
        const next = (coverage.current.to ?? chunkScene) + 1;
        const nextStart = sceneStarts[next];
        if (nextStart === undefined || warmedScene.current === next) {
            return;
        }
        // One scene beyond the playhead is as much as the player can show next, and
        // building a scene that starts minutes away spends an encoder on a chunk nobody
        // will reach soon. The lead is measured from the playhead, not the element.
        const played = sceneIndex ?? chunkScene;
        const cursor = playhead ?? anchor + Math.round(currentTime * frameRate);
        if (
            !mayPrepareScene({
                next,
                played,
                through: nextStart,
                playhead: cursor,
                frameRate,
            })
        ) {
            return;
        }
        const base = url.split("?")[0];
        if (base === undefined) {
            return;
        }
        warmedScene.current = next;
        const target = `${base}?source=encode&scene=${String(next)}&encode_from=${encodeFrom}&encoder=${encoderFingerprints[next] ?? ""}${scenesQuery}`;
        const controller = new AbortController();
        warmAbort.current?.abort();
        warmAbort.current = controller;
        void fetch(target, { signal: controller.signal })
            .then(drainPreview)
            .catch(() => {
                // A failed warm is retried the next time the buffer or chunk state
                // changes; it must not take the picture down with it.
                if (warmedScene.current === next) {
                    warmedScene.current = null;
                }
            });
    }, [
        source,
        url,
        chunkScene,
        sceneStarts,
        sceneEnds,
        anchor,
        frameRate,
        chunkReady,
        bufferedEnd,
        encodeFrom,
        encoderFingerprints,
        scenesQuery,
        sceneIndex,
        playhead,
        currentTime,
        coverage,
    ]);

    /**
     * Append the next scene's chunk once the one before it is fully in the session.
     *
     * The cursor is the last scene the session holds, not the scene under the playhead:
     * those differ for a whole run after a cut, and using the playhead's scene made the
     * player request the scene *after* next and leave a hole that never filled.
     */
    useEffect(() => {
        if (
            source !== "encode" ||
            !ready ||
            !chunkReady ||
            url === null ||
            chunkScene === null ||
            frameRate === null ||
            frameRate <= 0
        ) {
            return;
        }
        const stream = streamRef.current;
        if (stream === null || !stream.supportsAppend) {
            return;
        }
        const to = coverage.current.to;
        if (to === null) {
            return;
        }
        const through = sceneEnds[to] ?? sceneStarts[to + 1];
        if (through === undefined || bufferedEnd < (through - anchor) / frameRate - 0.1) {
            return;
        }
        const next = to + 1;
        const nextStart = sceneStarts[next];
        if (nextStart === undefined) {
            return;
        }
        // Append only a chunk that starts exactly where the buffered one ends. A scene that
        // starts later leaves a hole an appended chunk could not fill, and the element would
        // wait on it forever; a scene that starts earlier would overlap what is already
        // appended. Both are skipped at the end of the current chunk instead.
        if (nextStart !== through) {
            return;
        }
        // The append effect re-runs as soon as a chunk lands, so without these two rules it
        // chained through every following scene while paused: that was the unbounded lead.
        // Keep one chunk beyond the playhead's scene, and measure the lead to the frame
        // that would become buffered — the scene's end, not its start.
        const played = sceneIndex ?? chunkScene;
        const cursor = playhead ?? anchor + Math.round(currentTime * frameRate);
        if (
            !mayPrepareScene({
                next,
                played,
                through: sceneStarts[next + 1] ?? nextStart,
                playhead: cursor,
                frameRate,
            })
        ) {
            return;
        }
        const base = url.split("?")[0];
        if (base === undefined) {
            return;
        }
        const target = `${base}?source=encode&scene=${String(next)}&encode_from=${encodeFrom}&encoder=${encoderFingerprints[next] ?? ""}${scenesQuery}`;
        coverage.current.to = next;
        stream.append(target, (nextStart - anchor) / frameRate);
    }, [
        source,
        ready,
        chunkReady,
        bufferedEnd,
        chunkScene,
        url,
        encodeFrom,
        encoderFingerprints,
        scenesQuery,
        sceneStarts,
        sceneEnds,
        anchor,
        frameRate,
        sceneIndex,
        playhead,
        currentTime,
        coverage,
        streamRef,
    ]);

    // A warm is not aborted on a seek: the scene the user is moving to may be exactly the
    // one being built, and cancelling it would restart that whole encode.
    useEffect(() => {
        warmedScene.current = null;
    }, [url]);
    useEffect(() => {
        return () => {
            warmAbort.current?.abort();
            warmAbort.current = null;
        };
    }, []);

    // A decoded prefetch belongs to its window. Cancelling one when the element simply
    // advances to the window it was preparing would stop that build and start it again when
    // the element asks for it.
    useEffect(() => {
        return () => {
            prefetchAbort.current?.abort();
            prefetchAbort.current = null;
        };
    }, [source]);

    return { prefetchNextWindow, resetWarm };
}
