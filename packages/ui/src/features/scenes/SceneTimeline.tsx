import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type WheelEvent as ReactWheelEvent,
} from "react";

import type { SceneView } from "@av1ation/contracts";
import { CircleHelp, Maximize2, Minus, Plus } from "lucide-react";

import { sceneLength } from "../../shared/duration";
import { formatTimecode } from "../../shared/format";
import { SceneStill } from "./SceneStill";
import {
    sceneAtFrame,
    sceneCoveringFrame,
    sceneSpan,
    sceneWarnings,
    timelineBlocks,
    timelineGridLines,
    type TimelineBlock,
} from "../../shared/model/scene-layout";
import { NO_SELECTION, selectScene, selectionForKey, type SceneSelection } from "./scene-selection";

function blockTone(block: TimelineBlock): string {
    // Solid tones, not translucent ones: a scene block has to be readable against the
    // track's own dark background, and the alternating shade is what separates two
    // neighbouring scenes when neither is selected.
    if (block.selected) {
        return "bg-brand/30 ring-1 ring-brand ring-inset";
    }
    if (block.warn) {
        return "bg-warning/20 ring-1 ring-warning/70 ring-inset";
    }
    if (block.kind === "density" || block.encoded) {
        return "bg-info/25 ring-1 ring-info/40 ring-inset";
    }
    return block.from % 2 === 0 ? "bg-line-strong/90" : "bg-line-strong/60";
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 64;

/**
 * Half the widest hover readout: a long timecode, a thousands-separated frame number and
 * the scene name. It is how far the bubble's centre must stay from the track's ends, since
 * the track clips and the bubble is centred on the pointer.
 */
const HOVER_LABEL_HALF = 104;

/**
 * The proportional scene track, under a time ruler.
 *
 * The timeline shares the rail's selection object rather than its own: a block click, a
 * sweep, and an arrow key all produce the same indices the rail highlights. The wheel
 * zooms the visible window around the pointer; a drag pans it, and touch pinch uses the
 * same zoom path. The page itself never scrolls, so the gesture has nowhere else to go. A
 * click seeks to the frame under the pointer, and the playhead handle is the one thing that
 * scrubs: separating the two motions means a press that turns into a pan never moves the
 * picture first.
 *
 * A block too narrow for its number is named by the hover readout instead: the track clips
 * its own overflow, so a bubble attached to a block would be cut off by the very row it
 * describes.
 */
export function SceneTimeline({
    scenes,
    selection,
    onSelectionChange,
    onSeek,
    playhead,
    frameRate,
    thumbnailFor,
    totalFrames = 0,
    trackHeight = 64,
    aspectRatio,
    onContextMenu,
    className = "",
}: {
    scenes: readonly SceneView[];
    selection: SceneSelection;
    onSelectionChange: (next: SceneSelection) => void;
    onSeek: (frame: number) => void;
    playhead: number | null;
    frameRate: number | null;
    /**
     * The cached keyframe for a scene's first frame, from the same lookup the rail uses. A
     * narrow block omits it: the picture would be a few indistinguishable pixels.
     */
    thumbnailFor?: ((startFrame: number) => string | null) | undefined;
    /** Source length, so the ruler and the scrubber reach beyond the last scene. */
    totalFrames?: number | undefined;
    /** Height of the block track, changed by the Scenes layout divider. */
    trackHeight?: number | undefined;
    /**
     * The source's display aspect, so a block's still keeps its shape instead of being
     * stretched across the block's arbitrary width. A missing or invalid value falls back
     * to the old full-block crop.
     */
    aspectRatio?: number | null | undefined;
    /** A right-click at this frame; the screen owns the menu and its actions. */
    onContextMenu?: ((frame: number) => void) | undefined;
    className?: string | undefined;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(800);
    const [view, setView] = useState({ zoom: 1, pan: 0 });
    const [hoverFrame, setHoverFrame] = useState<number | null>(null);
    const warnings = useMemo(() => sceneWarnings(scenes), [scenes]);
    const bars = useMemo(
        () =>
            scenes.map((scene, index) => ({
                start_frame: scene.start_frame,
                end_frame: scene.end_frame,
                encoded: scene.encoded,
                warn: warnings[index] === true,
            })),
        [scenes, warnings],
    );
    const sceneSpanInfo = useMemo(() => sceneSpan(scenes), [scenes]);
    const sourceEnd = Math.max(totalFrames, sceneSpanInfo.end);
    const blocks = useMemo(
        () =>
            timelineBlocks(bars, selection.selected, Math.max(1, width * view.zoom), 3, {
                origin: 0,
                length: Math.max(1, sourceEnd),
            }),
        [bars, selection.selected, width, view.zoom, sourceEnd],
    );

    const scrubbing = useRef<{ pointerId: number } | null>(null);
    const gesture = useRef<{
        pointerId: number;
        /** `press` becomes `pan` only once the pointer has actually moved. */
        mode: "press" | "pan";
        startX: number;
        startPan: number;
        moved: boolean;
    } | null>(null);
    // A second touch turns one-finger panning into a pinch. The map holds every touch still
    // down, so lifting the first finger does not end the gesture under the second.
    const touches = useRef(new Map<number, { x: number; y: number }>());
    /** The two-finger gesture, with the source frame under its start midpoint kept fixed. */
    const pinch = useRef<{
        startDistance: number;
        startZoom: number;
        /** Whole-source ratio under the fingers when the gesture began. */
        anchor: number;
    } | null>(null);

    useEffect(() => {
        const element = trackRef.current;
        if (element === null) {
            return;
        }
        const measure = () => setWidth(element.clientWidth || 800);
        measure();
        if (typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const stillAspect =
        aspectRatio !== null &&
        aspectRatio !== undefined &&
        Number.isFinite(aspectRatio) &&
        aspectRatio > 0
            ? aspectRatio
            : null;
    const span = Math.max(1, sourceEnd);
    const origin = 0;
    const maxPan = Math.max(0, 1 - 1 / view.zoom);
    const visible = useMemo(
        () => ({
            origin: view.pan * span,
            length: span / view.zoom,
        }),
        [view.pan, view.zoom, span],
    );

    const ratioAt = (clientX: number): number => {
        const element = trackRef.current;
        if (element === null) {
            return 0;
        }
        const rect = element.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    };
    /** The whole-source ratio, accounting for the zoom window's left edge. */
    const fullRatioAt = (clientX: number): number =>
        clamp(view.pan + ratioAt(clientX) / view.zoom, 0, 1);
    const frameFor = (clientX: number): number => {
        const ratio = fullRatioAt(clientX);
        const frame = origin + ratio * span;
        return Math.max(origin, Math.min(origin + span - 1, Math.round(frame)));
    };

    const resetView = () => setView({ zoom: 1, pan: 0 });

    /** Zoom around the middle of the visible window, which is where the eye already is. */
    const zoomAroundCentre = (factor: number) => {
        const nextZoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        if (nextZoom === view.zoom) {
            return;
        }
        const anchor = view.pan + 0.5 / view.zoom;
        const nextMax = Math.max(0, 1 - 1 / nextZoom);
        setView({
            zoom: nextZoom,
            pan: clamp(anchor - 0.5 / nextZoom, 0, nextMax),
        });
    };

    const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        if (scenes.length === 0) {
            return;
        }
        event.preventDefault();
        const element = trackRef.current;
        if (element === null) {
            return;
        }
        const rect = element.getBoundingClientRect();
        const at = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
        const nextZoom = clamp(view.zoom * Math.exp(-event.deltaY * 0.0022), MIN_ZOOM, MAX_ZOOM);
        if (nextZoom === view.zoom) {
            return;
        }
        // Keep the frame under the pointer still: that is what makes a zoom feel like
        // looking closer rather than jumping to a new part of the source.
        const anchor = view.pan + at / view.zoom;
        const nextMax = Math.max(0, 1 - 1 / nextZoom);
        setView({
            zoom: nextZoom,
            pan: clamp(anchor - at / nextZoom, 0, nextMax),
        });
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        // Capture is best-effort: a synthetic pointer, or one released between the event
        // and this call, has no active pointer id to capture and must not break the drag.
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // The drag still works while the pointer stays over the track.
        }
        if (event.pointerType === "touch") {
            touches.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
            });
            if (touches.current.size >= 2) {
                const points = [...touches.current.values()];
                const first = points[0];
                const second = points[1];
                const rect = event.currentTarget.getBoundingClientRect();
                if (first !== undefined && second !== undefined) {
                    const distance = Math.hypot(second.x - first.x, second.y - first.y);
                    const midpoint = (first.x + second.x) / 2 - rect.left;
                    if (distance > 0) {
                        pinch.current = {
                            startDistance: distance,
                            startZoom: view.zoom,
                            anchor: clamp(
                                view.pan + midpoint / Math.max(1, rect.width) / view.zoom,
                                0,
                                1,
                            ),
                        };
                    }
                }
                // A pinch is not a scrub: taking a second finger cancels any playhead
                // drag the first one started, so the two gestures cannot fight.
                scrubbing.current = null;
                gesture.current = {
                    pointerId: event.pointerId,
                    mode: "pan",
                    startX: event.clientX,
                    startPan: view.pan,
                    moved: true,
                };
                return;
            }
        }

        gesture.current = {
            pointerId: event.pointerId,
            mode: "press",
            startX: event.clientX,
            startPan: view.pan,
            moved: false,
        };
        // The frame is written on release, not here: a press that becomes a pan must not
        // seek first and pan second, which is what made a drag move the picture.
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "touch" && touches.current.has(event.pointerId)) {
            touches.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
            });
        }
        const frame = frameFor(event.clientX);
        setHoverFrame(frame);
        const zooming = pinch.current;
        if (zooming !== null && touches.current.size >= 2) {
            const points = [...touches.current.values()];
            const first = points[0];
            const second = points[1];
            if (first !== undefined && second !== undefined) {
                const distance = Math.hypot(second.x - first.x, second.y - first.y);
                const nextZoom = clamp(
                    zooming.startZoom * (distance / zooming.startDistance),
                    MIN_ZOOM,
                    MAX_ZOOM,
                );
                const rect = trackRef.current?.getBoundingClientRect();
                const midpoint = (first.x + second.x) / 2 - (rect?.left ?? 0);
                const ratio = midpoint / Math.max(1, rect?.width ?? width);
                const nextMax = Math.max(0, 1 - 1 / nextZoom);
                // Keep the frame that was between the fingers between them while they
                // spread: the anchor stays fixed and the visible window follows.
                setView({
                    zoom: nextZoom,
                    pan: clamp(zooming.anchor - ratio / nextZoom, 0, nextMax),
                });
            }
            return;
        }
        if (scrubbing.current?.pointerId === event.pointerId) {
            onSeek(frame);
            return;
        }
        const current = gesture.current;
        if (current === null || current.pointerId !== event.pointerId) {
            return;
        }
        if (Math.abs(event.clientX - current.startX) > 3) {
            current.moved = true;
            // A moving press is a pan. Four pixels is below the shake of a click and above
            // the first movement the browser reports for a deliberate drag.
            current.mode = "pan";
        }
        if (
            current.mode === "pan" ||
            (event.pointerType === "touch" && touches.current.size >= 2)
        ) {
            current.mode = "pan";
            const nextPan = clamp(
                current.startPan -
                    (event.clientX - current.startX) / Math.max(1, width * view.zoom),
                0,
                maxPan,
            );
            setView((existing) => ({ ...existing, pan: nextPan }));
        }
    };

    const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
        touches.current.delete(event.pointerId);
        const wasPinching = pinch.current !== null;
        if (touches.current.size < 2) {
            pinch.current = null;
        }
        // One finger left a pinch: rebase the gesture under it, or the next move would
        // jump by the distance the lifted finger had travelled.
        if (wasPinching) {
            const remaining = [...touches.current.entries()][0];
            gesture.current =
                remaining === undefined
                    ? null
                    : {
                          pointerId: remaining[0],
                          mode: "pan",
                          startX: remaining[1].x,
                          startPan: view.pan,
                          moved: true,
                      };
        }
        const current = gesture.current;
        if (current?.pointerId === event.pointerId) {
            // A press that never moved is a click: seek to the frame under it and select
            // the scene there. A pan must not seek, so a drag can be undone by releasing
            // wherever the user let go without having moved the picture.
            if (!current.moved && current.mode === "press") {
                const frame = frameFor(event.clientX);
                onSeek(frame);
                if (scenes.length > 0) {
                    const index = sceneAtFrame(scenes, frame);
                    if (index !== null) {
                        onSelectionChange(
                            selectScene(
                                selection,
                                index,
                                event.shiftKey ? "extend" : "replace",
                                scenes.length,
                            ),
                        );
                    }
                }
            }
            gesture.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
        if (scrubbing.current?.pointerId === event.pointerId) {
            scrubbing.current = null;
        }
        setHoverFrame(null);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            onSelectionChange(NO_SELECTION);
            return;
        }
        // The screen owns transport keys: arrows and WASD must mean the same thing whether
        // the timeline, the rail, or the player has focus.
        if (
            [" ", "Spacebar", "ArrowLeft", "ArrowRight"].includes(event.key) ||
            ["w", "a", "s", "d"].includes(event.key.toLowerCase())
        ) {
            return;
        }
        const next = selectionForKey(selection, event.key, event.shiftKey, 10, scenes.length);
        if (next === null) {
            return;
        }
        event.preventDefault();
        onSelectionChange(next);
        if (next.cursor !== null && event.key !== " " && event.key !== "Spacebar") {
            const scene = scenes[next.cursor];
            if (scene !== undefined) {
                onSeek(scene.start_frame);
            }
        }
    };

    const playheadRatio =
        playhead === null ? null : Math.max(0, Math.min(1, (playhead - origin) / span));
    const hoverRatio =
        hoverFrame === null ? null : Math.max(0, Math.min(1, (hoverFrame - origin) / span));
    // A narrow block loses its number, so the readout names the scene it belongs to. A
    // frame in a gap belongs to none and is only a timecode.
    const hoveredScene = hoverFrame === null ? null : sceneCoveringFrame(scenes, hoverFrame);
    const hoverSceneNumber =
        hoveredScene === null ? null : String(hoveredScene + 1).padStart(2, "0");
    /** The readout lives in the track's coordinates, not the zoom window's. */
    const hoverLeft = hoverRatio === null ? null : clamp((hoverRatio - view.pan) * view.zoom, 0, 1);

    const selectedCount = selection.selected.size;
    const sceneCount = scenes.length === 1 ? "1 scene" : `${scenes.length.toLocaleString()} scenes`;
    const [helpOpen, setHelpOpen] = useState(false);
    const helpRoot = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!helpOpen) {
            return;
        }
        const close = (event: PointerEvent) => {
            if (helpRoot.current !== null && !helpRoot.current.contains(event.target as Node)) {
                setHelpOpen(false);
            }
        };
        const escape = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") {
                setHelpOpen(false);
            }
        };
        document.addEventListener("pointerdown", close);
        window.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", escape);
        };
    }, [helpOpen]);
    // Rules come from the visible window, not the whole source: a zoomed view has to keep
    // showing round intervals instead of one lonely rule every ten screens.
    const grid = useMemo(
        () => timelineGridLines(visible.origin, visible.length, frameRate),
        [visible.origin, visible.length, frameRate],
    );
    const ruler = useMemo(() => {
        const labels: { frame: number; fraction: number }[] = [];
        let lastPx = Number.NEGATIVE_INFINITY;
        const px = Math.max(1, width);
        for (const line of grid) {
            const fraction = (line.frame - visible.origin) / Math.max(1, visible.length);
            const at = fraction * px;
            // Labels are wide; the next one is placed only when it cannot overlap. The
            // minute and frame numbers below each label are what makes the ruler useful.
            if (at - lastPx < 92) {
                continue;
            }
            labels.push({ frame: line.frame, fraction });
            lastPx = at;
        }
        return labels;
    }, [grid, visible.origin, visible.length, width]);

    const emptyLabel =
        sourceEnd <= 0
            ? "No source length yet"
            : scenes.length === 0
              ? "No scenes detected yet"
              : null;

    return (
        <div className={`rounded-lg border border-line bg-surface px-3 py-2.5 ${className}`}>
            <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                    <p className="m-0 text-[10px] tracking-[0.08em] text-ink-muted uppercase">
                        Timeline
                    </p>
                    <p className="m-0 truncate font-mono text-[10px] tabular-nums text-ink-muted">
                        {` · ${sceneCount} · ${selectedCount.toLocaleString()} selected`}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => zoomAroundCentre(1 / 1.5)}
                        disabled={view.zoom <= MIN_ZOOM}
                        aria-label="Zoom out"
                        data-tip="Zoom out"
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-40"
                    >
                        <Minus aria-hidden="true" className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center font-mono text-[9.5px] text-ink-muted tabular-nums">
                        ×{view.zoom.toFixed(1)}
                    </span>
                    <button
                        type="button"
                        onClick={() => zoomAroundCentre(1.5)}
                        disabled={view.zoom >= MAX_ZOOM}
                        aria-label="Zoom in"
                        data-tip="Zoom in"
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-40"
                    >
                        <Plus aria-hidden="true" className="h-3 w-3" />
                    </button>
                    <button
                        type="button"
                        onClick={resetView}
                        aria-label="Fit the whole source"
                        data-tip="Fit (double-click)"
                        disabled={view.zoom <= 1 && view.pan <= 0}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-40"
                    >
                        <Maximize2 aria-hidden="true" className="h-3 w-3" />
                    </button>
                    <div className="relative" ref={helpRoot}>
                        <button
                            type="button"
                            aria-label="Timeline controls"
                            aria-haspopup="dialog"
                            aria-expanded={helpOpen}
                            data-tip="Timeline controls"
                            onClick={() => setHelpOpen((open) => !open)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                        >
                            <CircleHelp aria-hidden="true" className="h-3 w-3" />
                        </button>
                        {helpOpen ? (
                            <div
                                role="dialog"
                                aria-label="Timeline controls"
                                className="absolute right-0 bottom-full z-30 mb-1.5 w-64 rounded-md border border-line-strong bg-overlay p-2.5 text-[10px] leading-relaxed text-ink-secondary shadow-elevation-2"
                            >
                                Click seeks. Drag pans. Scroll or pinch zooms around the pointer.
                                The playhead handle scrubs, and a double-click fits the whole
                                source.
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* One instrument, two bands: the time ruler and the scene blocks. They share a
                border because they share a time axis; separate boxes read as unrelated
                rows. */}
            <div className="mt-1.5 overflow-hidden rounded-md border border-line-strong bg-sunken">
                {/* The ruler is the visible window: position and label come from the same
                window, so panning moves a label with every other ruler mark. */}
                <div
                    className="relative h-7 overflow-hidden border-b border-line/60 bg-surface/60"
                    aria-hidden="true"
                >
                    {ruler.map((label) => (
                        <span
                            key={label.frame}
                            style={{
                                left: `${String(label.fraction * 100)}%`,
                                transform:
                                    label.fraction < 0.08
                                        ? undefined
                                        : label.fraction > 0.92
                                          ? "translateX(-100%)"
                                          : "translateX(-50%)",
                            }}
                            className="absolute top-0 font-mono whitespace-nowrap tabular-nums"
                        >
                            <span className="block text-[9px] text-ink-secondary">
                                {formatTimecode(label.frame, frameRate)}
                            </span>
                            <span className="block text-[8px] text-ink-muted">
                                f {label.frame.toLocaleString()}
                            </span>
                        </span>
                    ))}
                    <span className="absolute inset-x-0 bottom-0 h-px bg-line" />
                </div>

                <div
                    ref={trackRef}
                    role="group"
                    aria-label={`Scene timeline: ${sceneCount}, ${String(
                        selectedCount,
                    )} selected. Scroll to zoom.`}
                    tabIndex={0}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endPointer}
                    onPointerCancel={endPointer}
                    onPointerLeave={() => {
                        if (gesture.current === null && scrubbing.current === null) {
                            setHoverFrame(null);
                        }
                    }}
                    onKeyDown={onKeyDown}
                    onWheel={onWheel}
                    onDoubleClick={resetView}
                    onContextMenu={(event) => {
                        if (onContextMenu === undefined) {
                            return;
                        }
                        // The surrounding context-menu trigger prevents the browser menu
                        // and anchors the popup. Preventing it here would leave Radix with
                        // an open menu and no pointer position.
                        setHoverFrame(frameFor(event.clientX));
                        onContextMenu(frameFor(event.clientX));
                    }}
                    style={{ height: trackHeight }}
                    className="relative cursor-pointer touch-none overflow-hidden bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                >
                    <div
                        className="absolute inset-y-0"
                        style={{
                            width: `${String(view.zoom * 100)}%`,
                            transform: `translateX(-${String(view.pan * 100)}%)`,
                        }}
                    >
                        {blocks.map((block) => {
                            const scene = block.kind === "scene" ? scenes[block.from] : undefined;
                            const still =
                                scene !== undefined && block.width >= 12
                                    ? (thumbnailFor?.(scene.start_frame) ?? null)
                                    : null;
                            return (
                                <div
                                    key={`${block.kind}-${String(block.from)}-${String(block.to)}`}
                                    aria-hidden="true"
                                    data-block={block.kind}
                                    style={{
                                        left: `${String(block.left)}px`,
                                        width: `${String(block.width)}px`,
                                    }}
                                    className={`absolute top-0 bottom-0 overflow-hidden border-r border-app ${blockTone(block)}`}
                                >
                                    {still === null ? null : (
                                        <div
                                            data-still="true"
                                            style={
                                                stillAspect === null
                                                    ? undefined
                                                    : { aspectRatio: String(stillAspect) }
                                            }
                                            className={`pointer-events-none absolute inset-y-0 left-0 overflow-hidden ${
                                                stillAspect === null ? "w-full" : ""
                                            }`}
                                        >
                                            <SceneStill src={still} className="h-full w-full" />
                                            <span className="absolute inset-0 bg-app/20" />
                                        </div>
                                    )}
                                    {block.selected ? (
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 border-2 border-brand"
                                        />
                                    ) : null}
                                    {block.kind === "scene" && block.width > 26 ? (
                                        // A label bar, not text floating over the picture: it keeps
                                        // its contrast whatever frame sits behind it and lines the
                                        // number up with the clip it names.
                                        <span className="absolute inset-x-0 bottom-[3px] flex items-center gap-1 overflow-hidden bg-app/85 px-1 py-0.5 font-mono tabular-nums">
                                            <span className="shrink-0 text-[10.5px] leading-none font-semibold text-ink">
                                                {String(block.from + 1).padStart(2, "0")}
                                            </span>
                                            {block.width > 72 ? (
                                                <span className="min-w-0 truncate text-[9.5px] leading-none text-ink-secondary">
                                                    {(() => {
                                                        const scene = scenes[block.from];
                                                        if (scene === undefined) {
                                                            return "";
                                                        }
                                                        const frames = `${scene.frame_count.toLocaleString()}f`;
                                                        return frameRate === null
                                                            ? frames
                                                            : `${sceneLength(scene.frame_count / frameRate)} · ${frames}`;
                                                    })()}
                                                </span>
                                            ) : null}
                                        </span>
                                    ) : null}
                                    {block.encoded ? (
                                        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-info" />
                                    ) : null}
                                    {block.warn ? (
                                        <span className="absolute inset-x-0 top-0 h-[3px] bg-warning" />
                                    ) : null}
                                </div>
                            );
                        })}

                        {grid.map((line) => (
                            <span
                                key={`grid-${String(line.frame)}`}
                                aria-hidden="true"
                                style={{
                                    left: `${String(((line.frame - origin) / span) * 100)}%`,
                                }}
                                className={`pointer-events-none absolute inset-y-0 w-px ${
                                    line.major ? "bg-ink-muted/50" : "bg-ink-muted/25"
                                }`}
                            />
                        ))}

                        {playheadRatio === null ? null : (
                            <div
                                data-playhead="true"
                                role="presentation"
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    try {
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                    } catch {
                                        // Best-effort, as above.
                                    }
                                    scrubbing.current = {
                                        pointerId: event.pointerId,
                                    };
                                    onSeek(frameFor(event.clientX));
                                }}
                                style={{
                                    left: `${String(playheadRatio * 100)}%`,
                                }}
                                className="absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-col-resize touch-none"
                            >
                                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-brand" />
                                <span className="absolute top-0 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-brand" />
                            </div>
                        )}
                    </div>

                    {hoverLeft === null || hoverFrame === null ? null : (
                        <div
                            role="status"
                            style={{
                                // The bubble is centred on the pointer, so a label near either
                                // end of the track would be half cut. Its centre is held far
                                // enough in that the track's clip never reaches the text.
                                left: `clamp(${String(HOVER_LABEL_HALF)}px, ${String(hoverLeft * 100)}%, calc(100% - ${String(HOVER_LABEL_HALF)}px))`,
                            }}
                            className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 rounded border border-line-strong bg-overlay px-1.5 py-0.5 font-mono text-[8.5px] whitespace-nowrap text-ink shadow-elevation-2 tabular-nums"
                        >
                            {hoverSceneNumber === null ? null : `${hoverSceneNumber}: `}
                            {formatTimecode(hoverFrame, frameRate)} · f{" "}
                            {hoverFrame.toLocaleString()}
                        </div>
                    )}

                    {emptyLabel === null ? null : (
                        <p className="pointer-events-none absolute inset-0 m-0 flex items-center justify-center text-[10px] text-ink-muted">
                            {emptyLabel}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
