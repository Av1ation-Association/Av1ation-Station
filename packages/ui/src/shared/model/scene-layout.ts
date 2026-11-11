/**
 * Geometry for the virtualized scene rail and the proportional timeline.
 *
 * The rail mounts only the rows the viewport can show; the timeline collapses runs of
 * scenes narrower than a few pixels into one density band, so 5,000 scenes never become
 * 5,000 nodes. Both are pure functions so the S4 harness's numbers stay reproducible in a
 * unit test without a browser.
 */
export interface SceneRange {
    start_frame: number;
    end_frame: number;
}

export interface WindowRange {
    /** First mounted scene index. */
    start: number;
    /** One past the last mounted index. */
    end: number;
    /** Pixel offset of the first mounted row inside the scroll spacer. */
    top: number;
    /** Height of the scroll spacer, so the scrollbar reflects every row. */
    height: number;
}

export interface TimelineScene extends SceneRange {
    encoded: boolean;
    /** A boundary that cannot be encoded: empty, reversed, overlapping, or out of order. */
    warn: boolean;
}

export interface TimelineBlock {
    kind: "scene" | "density";
    /** First scene index in the block, inclusive. */
    from: number;
    /** Last scene index in the block, inclusive. */
    to: number;
    left: number;
    width: number;
    selected: boolean;
    encoded: boolean;
    warn: boolean;
}

/** The row slice a scroll viewport mounts, with overscan above and below. */
export function visibleWindow(
    count: number,
    rowHeight: number,
    scrollTop: number,
    viewportHeight: number,
    overscan = 8,
): WindowRange {
    if (count <= 0 || rowHeight <= 0) {
        return { start: 0, end: 0, top: 0, height: 0 };
    }
    const first = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan);
    const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight);
    const end = Math.min(count, first + visible + overscan * 2);
    return {
        start: Math.min(first, Math.max(0, count - 1)),
        end,
        top: first * rowHeight,
        height: count * rowHeight,
    };
}

/** The covered frame span: the earliest start and the latest end. */
export function sceneSpan(scenes: readonly SceneRange[]): {
    origin: number;
    end: number;
    length: number;
} {
    if (scenes.length === 0) {
        return { origin: 0, end: 0, length: 0 };
    }
    let origin = scenes[0]?.start_frame ?? 0;
    let end = scenes[0]?.end_frame ?? 0;
    for (const scene of scenes) {
        origin = Math.min(origin, scene.start_frame);
        end = Math.max(end, scene.end_frame);
    }
    return { origin, end, length: Math.max(0, end - origin) };
}

/** The scene index under a content-space y offset, or null outside the list. */
export function rowAtOffset(offset: number, rowHeight: number, count: number): number | null {
    if (rowHeight <= 0 || count <= 0 || offset < 0) {
        return null;
    }
    const index = Math.floor(offset / rowHeight);
    return index >= 0 && index < count ? index : null;
}

/**
 * Mark scenes whose boundaries cannot produce a valid concatenation.
 *
 * A gap is not marked here: deliberately trimming frames is allowed, and the validation
 * strip names gaps separately. Overlap, out-of-order starts, and empty or reversed ranges
 * are errors, so the block carries a warning marker.
 */
export function sceneWarnings(scenes: readonly SceneRange[]): boolean[] {
    return scenes.map((scene, index) => {
        if (!(scene.end_frame > scene.start_frame)) {
            return true;
        }
        const previous = scenes[index - 1];
        if (previous === undefined) {
            return false;
        }
        return scene.start_frame < previous.start_frame || scene.start_frame < previous.end_frame;
    });
}

export type SceneIssueKind = "invalid" | "overlap" | "out-of-order" | "gap";

export interface SceneIssue {
    kind: SceneIssueKind;
    /** The scene the issue is attributed to; a gap belongs to the scene after it. */
    scene: number;
    severity: "error" | "warning";
    message: string;
}

/**
 * Name every boundary problem in one pass, in scene order.
 *
 * A gap is a warning because deliberately trimming frames is allowed; overlap, out-of-order
 * starts, and empty or reversed ranges are errors because the concatenator cannot stitch
 * them. The strip renders this list and only errors disable Start.
 */
export function sceneValidation(scenes: readonly SceneRange[]): SceneIssue[] {
    const issues: SceneIssue[] = [];
    scenes.forEach((scene, index) => {
        const number = index + 1;
        if (!(scene.end_frame > scene.start_frame)) {
            issues.push({
                kind: "invalid",
                scene: index,
                severity: "error",
                message:
                    scene.end_frame === scene.start_frame
                        ? `Scene ${String(number)} is empty (frames ${String(scene.start_frame)}–${String(scene.end_frame)}).`
                        : `Scene ${String(number)} ends before it starts (frames ${String(scene.start_frame)}–${String(scene.end_frame)}).`,
            });
            return;
        }
        const previous = scenes[index - 1];
        if (previous === undefined) {
            return;
        }
        if (scene.start_frame < previous.start_frame) {
            issues.push({
                kind: "out-of-order",
                scene: index,
                severity: "error",
                message: `Scene ${String(number)} starts before scene ${String(number - 1)} (frame ${String(scene.start_frame)} after ${String(previous.start_frame)}).`,
            });
            return;
        }
        if (scene.start_frame < previous.end_frame) {
            issues.push({
                kind: "overlap",
                scene: index,
                severity: "error",
                message: `Scene ${String(number)} overlaps scene ${String(number - 1)} by ${String(previous.end_frame - scene.start_frame)} frames.`,
            });
            return;
        }
        if (scene.start_frame > previous.end_frame) {
            issues.push({
                kind: "gap",
                scene: index,
                severity: "warning",
                message: `Frames ${String(previous.end_frame)}–${String(scene.start_frame - 1)} are not in any scene.`,
            });
        }
    });
    return issues;
}

/**
 * Lay out one block per scene, or one band per run of sub-pixel scenes.
 *
 * Width is proportional to frame count over the span the scene list covers. Blocks narrower
 * than `minWidth` are coalesced only across contiguous scene boundaries; a selected,
 * encoded, or warned scene inside a band marks the band, so zooming in is not the only way
 * to find it.
 */
export function timelineBlocks(
    scenes: readonly TimelineScene[],
    selected: ReadonlySet<number>,
    width: number,
    minWidth = 3,
    range?: { origin: number; length: number },
): TimelineBlock[] {
    if (scenes.length === 0 || width <= 0) {
        return [];
    }
    const { origin, length: span } = range ?? sceneSpan(scenes);
    if (span <= 0) {
        return [];
    }

    const blocks: TimelineBlock[] = [];
    let band: TimelineBlock | null = null;

    const flush = () => {
        if (band !== null) {
            band.width = Math.max(1, band.width);
            blocks.push(band);
            band = null;
        }
    };

    scenes.forEach((scene, index) => {
        const left = ((scene.start_frame - origin) / span) * width;
        const sceneWidth = ((scene.end_frame - scene.start_frame) / span) * width;
        const flags = {
            selected: selected.has(index),
            encoded: scene.encoded,
            warn: scene.warn,
        };

        if (sceneWidth >= minWidth) {
            flush();
            blocks.push({
                kind: "scene",
                from: index,
                to: index,
                left,
                width: Math.max(1, sceneWidth),
                ...flags,
            });
            return;
        }

        const contiguous =
            band !== null &&
            scenes[band.to as number] !== undefined &&
            scenes[band.to]?.end_frame === scene.start_frame;
        if (band === null || !contiguous) {
            flush();
            band = {
                kind: "density",
                from: index,
                to: index,
                left,
                width: Math.max(1, sceneWidth),
                ...flags,
            };
            return;
        }
        band = {
            ...band,
            to: index,
            width: left + Math.max(1, sceneWidth) - band.left,
            selected: band.selected || flags.selected,
            encoded: band.encoded || flags.encoded,
            warn: band.warn || flags.warn,
        };
    });
    flush();
    return blocks;
}

/** One vertical rule behind the scene blocks, at a round wall-clock or frame interval. */
export interface TimelineGridLine {
    frame: number;
    /** Every fifth rule is stronger, so counting time does not need a label on each one. */
    major: boolean;
}

/**
 * Rules at a round interval, chosen from the source's own duration.
 *
 * A fixed pixel grid would drift against the timecode ruler as the source gets longer. This
 * picks 1 s, 5 s, 30 s, a minute, and so on, capped at sixteen intervals, so the visible
 * window is divided into segments a person can read without counting a hundred ticks. When
 * the frame rate is unknown, ten equal frame divisions are the honest fallback.
 */
export function timelineGridLines(
    origin: number,
    span: number,
    frameRate: number | null,
): TimelineGridLine[] {
    if (span <= 0) {
        return [];
    }
    if (frameRate === null || !Number.isFinite(frameRate) || frameRate <= 0) {
        // A span shorter than ten frames rounds several equal divisions onto the same
        // frame. Keep one rule per frame: duplicate keys are rejected by React, and two
        // rules at the same position are one rule drawn twice.
        const seen = new Set<number>();
        return Array.from({ length: 9 }, (_, index) => ({
            frame: Math.round(origin + (span * (index + 1)) / 10),
            major: (index + 1) % 5 === 0,
        })).filter((line) => {
            if (seen.has(line.frame)) {
                return false;
            }
            seen.add(line.frame);
            return true;
        });
    }
    const seconds = span / frameRate;
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
    const step = steps.find((candidate) => seconds / candidate <= 16) ?? 7200;
    const stepFrames = Math.max(1, Math.round(step * frameRate));
    let first = Math.ceil(origin / stepFrames) * stepFrames;
    // The left edge is already a boundary; the first rule inside the span is one step in.
    if (first <= origin) {
        first += stepFrames;
    }
    const lines: TimelineGridLine[] = [];
    for (let frame = first; frame < origin + span && lines.length < 200; frame += stepFrames) {
        lines.push({ frame, major: frame % (stepFrames * 5) === 0 });
    }
    return lines;
}

/** The scene containing a frame, or the last scene that starts at or before it. */
export function sceneAtFrame(scenes: readonly SceneRange[], frame: number): number | null {
    if (scenes.length === 0) {
        return null;
    }
    let low = 0;
    let high = scenes.length - 1;
    let found = 0;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const scene = scenes[middle];
        if (scene === undefined) {
            break;
        }
        if (scene.start_frame <= frame) {
            found = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return found;
}

/**
 * The scene that actually covers a frame, or null when the frame falls in a gap.
 *
 * `sceneAtFrame` answers which scene a press belongs to, so it trails the scene before an
 * uncovered range. Naming a scene on hover must not claim frames no scene holds.
 */
export function sceneCoveringFrame(scenes: readonly SceneRange[], frame: number): number | null {
    const index = sceneAtFrame(scenes, frame);
    const scene = index === null ? undefined : scenes[index];
    return scene === undefined || frame >= scene.end_frame ? null : index;
}

/** The frame under a ratio across the scene span. */
export function frameAtRatio(scenes: readonly SceneRange[], ratio: number): number {
    if (scenes.length === 0) {
        return 0;
    }
    const { origin, length: span } = sceneSpan(scenes);
    const clamped = Math.max(0, Math.min(1, ratio));
    return Math.round(origin + clamped * span);
}
