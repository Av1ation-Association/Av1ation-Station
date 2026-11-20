import { useCallback, useEffect, useRef, type RefObject } from "react";

import { mayPrepareScene } from "./preview-buffer";
import {
    PAUSED_MSE_MAX_SECONDS,
    type PreviewBufferPlan,
    type WindowObservation,
} from "./preview-buffer-plan";
import { drainPreview } from "./preview-fetch";
import { previewRefusal, type PreviewStream } from "./preview-stream";

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
    /** The live buffer policy: how much lead to keep and how deep to build ahead. */
    plan: RefObject<PreviewBufferPlan>;
    /** Fold one completed window's build time and size into the policy. */
    noteWindow: (observation: WindowObservation) => void;
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
    plan,
    noteWindow,
}: PreviewPrefetchOptions) {
    /** The frame start of the last window handed to the element's stream. */
    const appendedThrough = useRef<number | null>(null);
    /** Every window start whose build this element has requested. */
    const requestedWindows = useRef<Set<number>>(new Set());
    /** Builds ahead of the append horizon, aborted when the element is replaced. */
    const windowWarms = useRef<Map<number, AbortController>>(new Map());
    /** The next encoded scene whose build is being warmed ahead of the cut. */
    const warmedScene = useRef<number | null>(null);
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

    // A prefetch belongs to the element that requested it. A new element starts clean and
    // an in-flight build that nobody will append must not keep an encoder busy.
    useEffect(() => {
        appendedThrough.current = streamStart;
        requestedWindows.current.clear();
        const warms = windowWarms.current;
        for (const controller of warms.values()) {
            controller.abort();
        }
        warms.clear();
        return () => {
            for (const controller of warms.values()) {
                controller.abort();
            }
            warms.clear();
        };
    }, [url, streamStart]);

    /**
     * Keep the next pictures building ahead of the playhead.
     *
     * The plan supplies two numbers from the session's own measurements: how many seconds
     * of lead the `SourceBuffer` can afford at this source's lossless rate, and how many
     * windows beyond the append horizon are worth building on disk. Windows are appended
     * until the planned lead is reached, and the warm requests are kept open on purpose:
     * the service stops a build when its last viewer leaves, so draining one is what makes
     * the later append a cache read. A warm also reports its wall time and byte count,
     * which is how a slower machine deepens the runway instead of outrunning a constant.
     */
    const prefetchNextWindow = () => {
        if (source !== "decoded" || frameRate === null || frameRate <= 0 || url === null) {
            return;
        }
        const element = videoRef.current;
        const stream = streamRef.current;
        if (element === null || stream === null || windowFrames <= 0) {
            return;
        }
        // A direct fallback plays one URL at a time and has no timeline to append to; a
        // warm would build windows that nothing can consume.
        if (!stream.supportsAppend) {
            return;
        }
        const base = url.split("?")[0];
        if (base === undefined) {
            return;
        }
        const windowSeconds = windowFrames / frameRate;
        const target = (start: number) =>
            `${base}?source=decoded&frame=${String(start)}&frames=${String(windowFrames)}${scenesQuery}`;
        const ranges = element.buffered;
        const bufferedEnd = ranges.length === 0 ? 0 : ranges.end(ranges.length - 1);
        const reached = appendedThrough.current ?? streamStart;
        const next = reached + windowFrames;
        // The end of the last appended window on the element's clock, so a burst of updates
        // before its bytes arrive cannot queue window after window against the same lead.
        const appendedEnd = (reached + windowFrames - streamStart) / frameRate;
        const queued = appendedEnd - bufferedEnd;
        const current = plan.current;
        // A paused element never consumes its lead, so waiting for the playhead to release
        // an append would leave the pipeline at one window. Paused means fill the plan now:
        // the picture starts already buffered, and a pause for inspection does not starve
        // the resume. In motion, only one window may sit beyond the buffer at a time.
        const paused = element.paused;
        // Playback owns the decoder. A script source keeps one graph, so a warm that is
        // still building when the next append arrives makes the playhead wait for it; the
        // paused runway is the cache to consume instead. Abort every parked warm (and any
        // build behind it) the moment the element starts moving.
        if (!paused && windowWarms.current.size > 0) {
            for (const controller of windowWarms.current.values()) {
                controller.abort();
            }
            windowWarms.current.clear();
            requestedWindows.current.clear();
        }
        const filling = paused || element.readyState < 3;
        // Leave one window of the paused budget unused: it is the headroom the next append
        // needs. Filling to the absolute budget makes that append hit the SourceBuffer quota
        // and parks it until playback has freed a window, which is exactly the seam wait.
        const pausedFill = Math.min(
            PAUSED_MSE_MAX_SECONDS,
            Math.max(windowSeconds, current.pausedLeadSeconds - windowSeconds),
        );
        const appendHorizon = Math.max(current.leadSeconds, pausedFill);
        // Paused, the appended horizon is the only clock. In motion, the buffered lead is
        // the clock and at most one window may wait beyond it, so the next request is
        // already in the stream before the playhead reaches the previous buffer's end.
        const withinLead = filling
            ? appendedEnd - element.currentTime < (paused ? pausedFill : appendHorizon)
            : bufferedEnd - element.currentTime < appendHorizon;
        const queueAllowed = filling || queued < windowSeconds;
        const appended = next < totalFrames && withinLead && queueAllowed;
        if (appended) {
            appendedThrough.current = next;
            // The append only becomes visible to `loadingUrl` after its SourceBuffer offset is
            // written. Run the prefetch again as soon as the request exists: that is the first
            // moment a warm can queue behind it, and waiting for a later buffer event would
            // leave the second decode graph idle through the append's whole build.
            void Promise.resolve(
                stream.append(target(next), (next - streamStart) / frameRate),
            ).then(() => prefetchRef.current());
        }
        // A warm must never reach the service before a window the element is waiting for.
        // `appendedThrough` records queued windows, not fetched ones: the stream loads them
        // one at a time, so a warm for a later window can arrive while the append the
        // element needs is still waiting behind the current download. It is safe once the
        // stream is loading the last appended window: its request already exists, so the
        // warm only queues behind it (and the service orders a burst by start anyway).
        // Waiting for the whole horizon to land, as this used to, left the serialized
        // builder idle for the length of every download. It is also safe when the horizon
        // itself is already in the buffer, even between segments.
        const horizon = appended ? appendedEnd + windowSeconds : appendedEnd;
        const loading = stream.loadingUrl ?? null;
        const loadingFrame =
            loading === null ? null : Number(new URL(loading).searchParams.get("frame"));
        const lastAppendInFlight =
            loadingFrame !== null && Number.isFinite(loadingFrame) && loadingFrame >= reached;
        if (!lastAppendInFlight && horizon - bufferedEnd > 0.25) {
            return;
        }
        // Build beyond the append horizon. These requests are deliberately not attached to
        // the timeline: the service writes and caches each file, and the append that reaches
        // one later reads it instead of waiting for a new encode. Only a paused element
        // warms: playback must leave the single decode graph free for the next append, and
        // the deep paused runway is what it consumes. Scanning the whole runway is what lets
        // a completed warm find the next unrequested window instead of stopping on the one
        // it just finished.
        const streamed = appendedThrough.current ?? streamStart;
        const runway = paused ? current.pausedPrebuildWindows : 0;
        for (let index = 1; index <= runway; index += 1) {
            const start = streamed + index * windowFrames;
            if (start >= totalFrames || requestedWindows.current.has(start)) {
                continue;
            }
            requestedWindows.current.add(start);
            const controller = new AbortController();
            windowWarms.current.set(start, controller);
            const startedAt = performance.now();
            void fetch(target(start), { signal: controller.signal })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(await previewRefusal(response));
                    }
                    const bytes = await drainPreview(response);
                    noteWindow({
                        buildSeconds: (performance.now() - startedAt) / 1000,
                        bytes,
                        windowSeconds,
                    });
                })
                .catch(() => {
                    // A build that failed is retried by a later call; a warm that was
                    // aborted because its element closed belongs to the old session.
                    if (windowWarms.current.get(start) === controller) {
                        requestedWindows.current.delete(start);
                    }
                })
                .finally(() => {
                    if (windowWarms.current.get(start) === controller) {
                        windowWarms.current.delete(start);
                    }
                    // A finished paused warm starts the next one so the deep runway fills
                    // without a buffer event. An aborted warm belongs to playback now and
                    // must not issue a successor into the append's way.
                    if (!controller.signal.aborted) {
                        prefetchRef.current();
                    }
                });
        }
    };

    const prefetchRef = useRef(prefetchNextWindow);
    prefetchRef.current = prefetchNextWindow;

    // Start the pipeline with the window that is opening, not with the first `timeupdate`.
    // The opener's build can consume the whole two seconds it plays, and waiting for the
    // playhead to move leaves its neighbour no time to arrive before the seam. It also
    // runs whenever the retained range grows: that is what fills the planned lead while
    // paused, where no `timeupdate` will ask for the next window.
    useEffect(() => {
        if (source !== "decoded" || url === null) {
            return;
        }
        prefetchRef.current();
    }, [source, url, bufferedEnd, ready, currentTime]);

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

    return { prefetchNextWindow, resetWarm };
}
