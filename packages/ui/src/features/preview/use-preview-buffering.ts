import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { SeekQueue } from "./preview-seek";

type PreviewBufferingOptions = {
    url: string | null;
    videoRef: RefObject<HTMLVideoElement | null>;
};

type BufferedRange = { start: number; end: number };

/**
 * The element's retained media and its one in-flight seek.
 *
 * Buffer telemetry is read from the element rather than inferred from encoder progress: it
 * is the only signal that says whether a seek will answer now or wait for bytes. The seek
 * queue is per element because a new URL replaces the element.
 */
export function usePreviewBuffering({ url, videoRef }: PreviewBufferingOptions) {
    /** How much of the element's own timeline the session retains, in seconds. */
    const [bufferedEnd, setBufferedEnd] = useState(0);
    /**
     * Seconds of video buffered per wall-clock second, smoothed.
     *
     * There is no encoder progress channel on this element: the honest signal is how fast
     * the session is actually receiving picture. A rolling estimate turns that into the ETA
     * a user wants while a scene builds, without inventing backend counters.
     */
    const [throughput, setThroughput] = useState<number | null>(null);
    const bufferProgress = useRef({ at: 0, end: 0, rate: 0 });
    /**
     * The part of the element's own timeline that holds media, in seconds.
     *
     * A window or a scene chunk starts at zero on its own clock, so this is offset by the
     * stream's anchor before it is drawn on the transport, which always shows the video.
     */
    const [bufferRange, setBufferRange] = useState<BufferedRange>({
        start: 0,
        end: 0,
    });
    /** The element's one in-flight seek; see `SeekQueue` for why there is only one. */
    const seekQueue = useRef<SeekQueue | null>(null);

    /** Forget the previous element's retained range before a new URL is attached. */
    const resetBuffer = useCallback(() => {
        setBufferedEnd(0);
        setBufferRange({ start: 0, end: 0 });
        setThroughput(null);
        bufferProgress.current = { at: 0, end: 0, rate: 0 };
    }, []);

    /** Record one append and turn its growth into the transport's throughput estimate. */
    const reportBuffer = useCallback((range: BufferedRange) => {
        setBufferedEnd(range.end);
        setBufferRange(range);
        const now = performance.now();
        const last = bufferProgress.current;
        const gained = range.end - last.end;
        const elapsed = (now - last.at) / 1000;
        if (gained > 0.02 && elapsed > 0.15 && last.at > 0) {
            const instant = gained / elapsed;
            const smoothed = last.rate === 0 ? instant : last.rate * 0.7 + instant * 0.3;
            bufferProgress.current = {
                at: now,
                end: range.end,
                rate: smoothed,
            };
            setThroughput(smoothed);
        } else {
            bufferProgress.current = {
                at: last.at === 0 ? now : last.at,
                end: Math.max(last.end, range.end),
                rate: last.rate,
            };
        }
    }, []);

    // One seek queue per element. The element is keyed by `url`, so a new source is a new
    // element and a new queue.
    useEffect(() => {
        const element = videoRef.current;
        if (element === null) {
            return;
        }
        const queue = new SeekQueue((seconds) => {
            try {
                element.currentTime = seconds;
            } catch {
                // Metadata can precede seekability on a growing fragmented file.
            }
        });
        seekQueue.current = queue;
        return () => {
            queue.cancel();
            if (seekQueue.current === queue) {
                seekQueue.current = null;
            }
        };
    }, [url, videoRef]);

    /**
     * Mirror the element's retained range for the transport.
     *
     * `Original` has no preview session to report it, and a session's range also moves when
     * it trims behind the playhead, so both are read from the element itself. Equal ranges
     * keep the previous object: this runs on every `timeupdate`.
     */
    const measureBuffered = useCallback((element: HTMLVideoElement) => {
        const ranges = element.buffered;
        const start = ranges.length === 0 ? 0 : ranges.start(0);
        const end = ranges.length === 0 ? 0 : ranges.end(ranges.length - 1);
        // A direct source has no MediaSource session to report its appends, so the element's
        // own range is also what makes a pending Decoded request retry as it grows.
        setBufferedEnd(end);
        setBufferRange((current) =>
            current.start === start && current.end === end ? current : { start, end },
        );
    }, []);

    /** Seconds of picture already appended ahead of the playhead. */
    const leadAhead = useCallback((element: HTMLVideoElement): number => {
        const ranges = element.buffered;
        if (ranges.length === 0) {
            return 0;
        }
        return Math.max(0, ranges.end(ranges.length - 1) - element.currentTime);
    }, []);

    return {
        bufferedEnd,
        throughput,
        bufferRange,
        seekQueue,
        resetBuffer,
        reportBuffer,
        measureBuffered,
        leadAhead,
    };
}
