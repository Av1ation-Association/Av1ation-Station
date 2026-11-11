import { useCallback, useState } from "react";

import { parseTimecode } from "../../shared/format";
import { SOURCES, usePopover, type PreviewSource } from "./preview-player";

type PreviewTransportOptions = {
    source: PreviewSource;
    totalFrames: number;
    frameRate: number | null;
    muted: boolean;
    volume: number;
    seekToFrame: (frame: number) => void;
};

/**
 * The transport's own state: which menu is open, what the user is typing, and the source
 * label. Playback owns the clock; these fields render and edit that clock without storing a
 * second copy of it.
 */
export function usePreviewTransport({
    source,
    totalFrames,
    frameRate,
    muted,
    volume,
    seekToFrame,
}: PreviewTransportOptions) {
    const [sourceOpen, setSourceOpen] = useState(false);
    const [soundOpen, setSoundOpen] = useState(false);
    const closeSource = useCallback(() => setSourceOpen(false), []);
    const closeSound = useCallback(() => setSoundOpen(false), []);
    const sourceRoot = usePopover(sourceOpen, closeSource);
    const soundRoot = usePopover(soundOpen, closeSound);
    // The transport's timecode and frame are editable. A draft is text the user is still
    // typing; until it commits, the field must not be rewritten by playback under the caret.
    const [timecodeDraft, setTimecodeDraft] = useState<string | null>(null);
    const [frameDraft, setFrameDraft] = useState<string | null>(null);
    const [timecodeInvalid, setTimecodeInvalid] = useState(false);
    const [frameInvalid, setFrameInvalid] = useState(false);

    const status = SOURCES[source];
    const lastFrame = totalFrames > 0 ? totalFrames - 1 : null;
    const volumePercent = Math.round((muted ? 0 : volume) * 100);

    /** A frame a typed value names, or null when it is not a position in this video. */
    const typedFrame = (text: string, parse: (value: string) => number | null): number | null => {
        const frame = parse(text);
        if (frame === null || frame < 0) {
            return null;
        }
        return lastFrame === null || frame <= lastFrame ? frame : null;
    };

    const commitTimecode = () => {
        if (timecodeDraft === null) {
            return;
        }
        const frame = typedFrame(timecodeDraft, (text) => parseTimecode(text, frameRate));
        setTimecodeDraft(null);
        setTimecodeInvalid(false);
        if (frame !== null) {
            seekToFrame(frame);
        }
    };

    const commitFrame = () => {
        if (frameDraft === null) {
            return;
        }
        const frame = typedFrame(frameDraft.trim(), (text) =>
            /^\d+$/u.test(text) ? Number(text) : null,
        );
        setFrameDraft(null);
        setFrameInvalid(false);
        if (frame !== null) {
            seekToFrame(frame);
        }
    };

    return {
        sourceOpen,
        setSourceOpen,
        soundOpen,
        setSoundOpen,
        sourceRoot,
        soundRoot,
        timecodeDraft,
        setTimecodeDraft,
        frameDraft,
        setFrameDraft,
        timecodeInvalid,
        setTimecodeInvalid,
        frameInvalid,
        setFrameInvalid,
        status,
        lastFrame,
        volumePercent,
        typedFrame,
        commitTimecode,
        commitFrame,
    };
}
