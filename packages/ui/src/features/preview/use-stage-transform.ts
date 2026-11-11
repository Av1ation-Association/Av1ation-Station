import {
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type WheelEvent as ReactWheelEvent,
} from "react";

type PanGesture = {
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
    /** A touch is captured only once it is a pan, so a tap still reaches the video. */
    captured: boolean;
};

type PinchGesture = {
    startDistance: number;
    startZoom: number;
    /** Midpoint at the start, relative to the stage's centre. */
    startMid: { x: number; y: number };
    startPan: { x: number; y: number };
};

/**
 * Zoom, pan, pinch and fullscreen for the preview stage.
 *
 * The video keeps its own playback state. This hook owns only the picture transform and
 * the click arbitration that decides whether a pointer gesture was a drag rather than a
 * play toggle.
 */
export function useStageTransform(onTap: () => void) {
    const sectionRef = useRef<HTMLElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [fullscreen, setFullscreen] = useState(false);
    const panGesture = useRef<PanGesture | null>(null);
    const panMoved = useRef(false);
    const panMovedAt = useRef(0);
    /** Every touch still on the stage, for a two-finger zoom. */
    const stageTouches = useRef(new Map<number, { x: number; y: number }>());
    const pinchGesture = useRef<PinchGesture | null>(null);
    const onTapRef = useRef(onTap);
    onTapRef.current = onTap;

    /** Keep the scaled frame covering the stage rather than drifting into empty space. */
    const constrainPan = (
        next: { x: number; y: number },
        scale: number,
    ): { x: number; y: number } => {
        const stage = stageRef.current;
        if (stage === null || scale <= 1) {
            return { x: 0, y: 0 };
        }
        const maxX = (stage.clientWidth * (scale - 1)) / 2;
        const maxY = (stage.clientHeight * (scale - 1)) / 2;
        return {
            x: Math.max(-maxX, Math.min(maxX, next.x)),
            y: Math.max(-maxY, Math.min(maxY, next.y)),
        };
    };

    const changeZoom = (next: number) => {
        const bounded = Math.max(1, Math.min(8, next));
        setZoom(bounded);
        setPan((current) => constrainPan(current, bounded));
    };

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const toggleFullscreen = () => {
        const section = sectionRef.current;
        if (section === null) {
            return;
        }
        if (document.fullscreenElement === null) {
            void section.requestFullscreen?.().catch(() => undefined);
        } else {
            void document.exitFullscreen?.().catch(() => undefined);
        }
    };

    useEffect(() => {
        const onChange = () => setFullscreen(document.fullscreenElement === sectionRef.current);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        const next = Math.max(1, Math.min(8, zoom * Math.exp(-event.deltaY * 0.0015)));
        setZoom(next);
        setPan((current) => constrainPan(current, next));
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== "touch" && event.button !== 0) {
            return;
        }
        if (event.pointerType === "touch") {
            stageTouches.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
            });
            if (stageTouches.current.size >= 2) {
                const points = [...stageTouches.current.values()];
                const first = points[0];
                const second = points[1];
                const rect = stageRef.current?.getBoundingClientRect();
                if (first !== undefined && second !== undefined) {
                    const distance = Math.hypot(second.x - first.x, second.y - first.y);
                    if (distance > 0 && rect !== undefined) {
                        pinchGesture.current = {
                            startDistance: distance,
                            startZoom: zoom,
                            startMid: {
                                x: (first.x + second.x) / 2 - (rect.left + rect.width / 2),
                                y: (first.y + second.y) / 2 - (rect.top + rect.height / 2),
                            },
                            startPan: pan,
                        };
                    }
                }
                // A pinch must not turn into a play toggle when it ends.
                panGesture.current = null;
                panMoved.current = true;
                panMovedAt.current = Date.now();
                for (const pointerId of stageTouches.current.keys()) {
                    try {
                        event.currentTarget.setPointerCapture(pointerId);
                    } catch {
                        // A synthetic pointer has no active id to capture.
                    }
                }
                return;
            }
        }
        if (event.pointerType !== "touch" && zoom > 1) {
            try {
                event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
                // A synthetic pointer has no active id to capture.
            }
        }
        panGesture.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
            moved: false,
            captured: event.pointerType !== "touch" && zoom > 1,
        };
        panMoved.current = false;
        panMovedAt.current = 0;
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "touch") {
            const point = stageTouches.current.get(event.pointerId);
            if (point !== undefined) {
                stageTouches.current.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                });
            }
        }
        const pinch = pinchGesture.current;
        if (pinch !== null && stageTouches.current.size >= 2) {
            const points = [...stageTouches.current.values()];
            const first = points[0];
            const second = points[1];
            const rect = stageRef.current?.getBoundingClientRect();
            if (first !== undefined && second !== undefined && rect !== undefined) {
                const distance = Math.hypot(second.x - first.x, second.y - first.y);
                const nextZoom = Math.max(
                    1,
                    Math.min(8, pinch.startZoom * (distance / pinch.startDistance)),
                );
                const mid = {
                    x: (first.x + second.x) / 2 - (rect.left + rect.width / 2),
                    y: (first.y + second.y) / 2 - (rect.top + rect.height / 2),
                };
                const scale = nextZoom / pinch.startZoom;
                // Keep the post-gesture click suppressed for the whole pinch,
                // not only for the first 300 ms of it.
                panMoved.current = true;
                panMovedAt.current = Date.now();
                setZoom(nextZoom);
                setPan(
                    constrainPan(
                        {
                            x: mid.x - (pinch.startMid.x - pinch.startPan.x) * scale,
                            y: mid.y - (pinch.startMid.y - pinch.startPan.y) * scale,
                        },
                        nextZoom,
                    ),
                );
            }
            return;
        }
        const gesture = panGesture.current;
        if (gesture === null || gesture.pointerId !== event.pointerId) {
            return;
        }
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
            gesture.moved = true;
            panMoved.current = true;
            panMovedAt.current = Date.now();
            if (!gesture.captured) {
                gesture.captured = true;
                try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                    // A synthetic pointer has no active id to capture.
                }
            }
        }
        // A one-finger drag at fit has nothing to pan, but it is still a drag:
        // suppressing the click keeps a swipe from toggling playback.
        if (gesture.moved && zoom > 1) {
            setPan(constrainPan({ x: gesture.panX + dx, y: gesture.panY + dy }, zoom));
        }
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        stageTouches.current.delete(event.pointerId);
        const wasPinching = pinchGesture.current !== null;
        if (stageTouches.current.size < 2) {
            pinchGesture.current = null;
        }
        if (panGesture.current?.pointerId === event.pointerId) {
            panGesture.current = null;
        }
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        // One finger left a pinch: continue as a pan from where it is, rather
        // than jumping by the distance the lifted finger covered.
        if (wasPinching) {
            const remaining = [...stageTouches.current.entries()][0];
            if (remaining !== undefined) {
                panGesture.current = {
                    pointerId: remaining[0],
                    x: remaining[1].x,
                    y: remaining[1].y,
                    panX: pan.x,
                    panY: pan.y,
                    moved: true,
                    captured: true,
                };
            }
        }
    };

    const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
        stageTouches.current.delete(event.pointerId);
        if (stageTouches.current.size < 2) {
            pinchGesture.current = null;
        }
        panGesture.current = null;
    };

    const onClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        // A click retargeted here by pointer capture (a zoomed pan, a pinch) is
        // the stage's own click; the video's own handler never saw it. Honour it
        // as a play toggle unless the gesture moved.
        const moved = panMoved.current && Date.now() - panMovedAt.current < 300;
        panMoved.current = false;
        if (event.target !== event.currentTarget || moved) {
            return;
        }
        onTapRef.current();
    };

    const onVideoClick = () => {
        // A drag that panned the frame ends with a click event too; it must not
        // also toggle playback. The short window keeps a drag that ended outside
        // the stage from swallowing the next click.
        if (panMoved.current && Date.now() - panMovedAt.current < 300) {
            panMoved.current = false;
            return;
        }
        panMoved.current = false;
        onTapRef.current();
    };

    return {
        sectionRef,
        stageRef,
        zoom,
        pan,
        fullscreen,
        changeZoom,
        resetView,
        toggleFullscreen,
        handlers: {
            onWheel,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onClick,
        },
        onVideoClick,
    };
}
