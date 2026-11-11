import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";

import type { SceneView } from "@av1ation/contracts";
import { PanelLeftClose, Search, TriangleAlert } from "lucide-react";

import { sceneLength } from "../../shared/duration";
import { formatTimecode, parseFrameQuery } from "../../shared/format";
import { SceneStill } from "./SceneStill";
import {
    rowAtOffset,
    sceneAtFrame,
    sceneWarnings,
    visibleWindow,
} from "../../shared/model/scene-layout";
import {
    NO_SELECTION,
    selectScene,
    selectSpan,
    selectionForKey,
    type SceneSelection,
} from "./scene-selection";

const ROW_HEIGHT = 44;
const OVERSCAN = 8;
const EDGE = 24;

/**
 * The virtualized scene rail.
 *
 * It mounts only the rows inside the scroll viewport, and drag selection is a pointer
 * handler on the container rather than one per row: a 5,000-row sweep therefore costs one
 * handler and one range, which is what S4 measured. Keyboard parity is required because
 * dragging across thousands of rows is miserable without it.
 */
export function SceneRail({
    scenes,
    selection,
    onSelectionChange,
    onSeek,
    frameRate,
    thumbnailFor,
    sourceFrames,
    height,
    emptyState,
    onCollapse,
    className = "",
}: {
    scenes: readonly SceneView[];
    selection: SceneSelection;
    onSelectionChange: (next: SceneSelection) => void;
    onSeek: (frame: number) => void;
    frameRate: number | null;
    /**
     * The cached keyframe for a scene's first frame, from the same lookup the timeline uses.
     * Absent or `null` draws the layout-stable placeholder instead.
     */
    thumbnailFor?: ((startFrame: number) => string | null) | undefined;
    /**
     * The source's frame count. The scene table can end before the file does — a clipped
     * detection or an inserted range leaves a tail — and the footer says so rather than
     * showing a total that disagrees with the header.
     */
    sourceFrames?: number | null;
    /** Test and fixed-pane override; otherwise the scroll viewport's height is measured. */
    height?: number | undefined;
    /** What to show in place of the list when no scenes exist yet. */
    emptyState?: ReactNode;
    /** Hide the rail so the player can take the full width. */
    onCollapse?: (() => void) | undefined;
    className?: string | undefined;
}) {
    const id = useId();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [measured, setMeasured] = useState(520);
    const [query, setQuery] = useState("");
    const [queryInvalid, setQueryInvalid] = useState(false);
    const viewportHeight = height ?? measured;
    const warnings = useMemo(() => sceneWarnings(scenes), [scenes]);

    const drag = useRef<{
        pointerId: number;
        anchor: number;
        base: SceneSelection;
        additive: boolean;
        focus: number;
    } | null>(null);

    useEffect(() => {
        const element = scrollRef.current;
        if (element === null) {
            return;
        }
        const measure = () => setMeasured(element.clientHeight || 520);
        measure();
        if (typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const viewport = visibleWindow(scenes.length, ROW_HEIGHT, scrollTop, viewportHeight, OVERSCAN);

    const indexAt = (clientY: number): number | null => {
        const element = scrollRef.current;
        if (element === null) {
            return null;
        }
        const rect = element.getBoundingClientRect();
        return rowAtOffset(clientY - rect.top + element.scrollTop, ROW_HEIGHT, scenes.length);
    };

    const seekTo = (index: number) => {
        const scene = scenes[index];
        if (scene !== undefined) {
            onSeek(scene.start_frame);
        }
    };

    const scrollCursorIntoView = (index: number) => {
        const element = scrollRef.current;
        if (element === null) {
            return;
        }
        const top = index * ROW_HEIGHT;
        const bottom = top + ROW_HEIGHT;
        if (top < element.scrollTop) {
            element.scrollTop = top;
        } else if (bottom > element.scrollTop + element.clientHeight) {
            element.scrollTop = bottom - element.clientHeight;
        }
        setScrollTop(element.scrollTop);
    };

    // A selection can change from the timeline, a refetch, or a keyboard step; keep the
    // active row mounted so `aria-activedescendant` always names an element that exists.
    useEffect(() => {
        if (selection.cursor !== null) {
            scrollCursorIntoView(selection.cursor);
        }
    }, [selection.cursor]);

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }
        const index = indexAt(event.clientY);
        if (index === null) {
            // A click below the last row is the explicit way out of a selection. Modifier
            // clicks are additive, so they leave it alone.
            if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
                onSelectionChange(NO_SELECTION);
            }
            return;
        }
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        // Best-effort capture: a synthetic pointer has no active id to capture.
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // The sweep still follows while the pointer stays over the rail.
        }

        const extend = event.shiftKey;
        const toggle = event.ctrlKey || event.metaKey;
        const mode = extend ? "extend" : toggle ? "toggle" : "replace";
        const next = selectScene(selection, index, mode, scenes.length);
        onSelectionChange(next);
        seekTo(index);

        drag.current = {
            pointerId: event.pointerId,
            anchor: extend ? (selection.anchor ?? index) : index,
            base: toggle ? selection : NO_SELECTION,
            additive: toggle,
            focus: index,
        };
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (current === null || current.pointerId !== event.pointerId) {
            return;
        }
        const element = event.currentTarget;
        const rect = element.getBoundingClientRect();
        const localY = event.clientY - rect.top;
        if (localY < EDGE) {
            element.scrollTop = Math.max(0, element.scrollTop - 18);
            setScrollTop(element.scrollTop);
        } else if (localY > element.clientHeight - EDGE) {
            element.scrollTop += 18;
            setScrollTop(element.scrollTop);
        }
        const index = indexAt(event.clientY);
        if (index === null || index === current.focus) {
            return;
        }
        current.focus = index;
        onSelectionChange(
            selectSpan(current.base, current.anchor, index, current.additive, scenes.length),
        );
    };

    const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId === event.pointerId) {
            drag.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            onSelectionChange(NO_SELECTION);
            return;
        }
        // Arrow, WASD, and space navigation belong to the Scenes screen: the same gesture
        // must start the player or step the playhead even while this rail has focus.
        if (
            [" ", "Spacebar", "ArrowLeft", "ArrowRight"].includes(event.key) ||
            ["w", "a", "s", "d"].includes(event.key.toLowerCase())
        ) {
            return;
        }
        const page = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1);
        const next = selectionForKey(selection, event.key, event.shiftKey, page, scenes.length);
        if (next === null) {
            return;
        }
        event.preventDefault();
        onSelectionChange(next);
        if (next.cursor !== null) {
            scrollCursorIntoView(next.cursor);
            if (event.key !== " " && event.key !== "Spacebar") {
                seekTo(next.cursor);
            }
        }
    };

    const cursor = selection.cursor;
    const totalFrames = useMemo(
        () => scenes.reduce((total, scene) => total + scene.frame_count, 0),
        [scenes],
    );

    // The board's find field jumps to a frame or a clock position; it does not filter the
    // list, so the selection indices and the virtualized row arithmetic stay one-to-one with
    // the engine's table.
    const goToQuery = () => {
        const raw = query.trim();
        if (raw === "") {
            setQueryInvalid(false);
            return;
        }
        const lastFrame =
            sourceFrames !== null && sourceFrames !== undefined && sourceFrames > 0
                ? sourceFrames - 1
                : null;
        const frame = parseFrameQuery(raw, frameRate, lastFrame);
        if (frame === null) {
            setQueryInvalid(true);
            return;
        }
        setQueryInvalid(false);
        const index = sceneAtFrame(scenes, frame) ?? 0;
        onSelectionChange(selectScene(selection, index, "replace", scenes.length));
        onSeek(frame);
        scrollCursorIntoView(index);
    };

    return (
        <div
            className={`flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface ${className}`}
        >
            <header className="flex shrink-0 items-start justify-between gap-2 px-3 pb-2 pt-3">
                <div className="min-w-0">
                    <p className="m-0 text-[9px] tracking-[0.1em] text-ink-muted uppercase">
                        Scenes
                    </p>
                    <p
                        id={`${id}-find-note`}
                        role={queryInvalid ? "alert" : undefined}
                        className={`m-0 mt-0.5 text-[9.5px] ${
                            queryInvalid ? "text-danger" : "text-ink-muted"
                        }`}
                    >
                        {queryInvalid
                            ? frameRate === null
                                ? "Enter a frame within the source."
                                : "Enter a frame or time within the source."
                            : `Virtualized · ${scenes.length.toLocaleString()} total`}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded-full border border-line-strong bg-raised px-2 py-0.5 font-mono text-[9px] text-ink-secondary tabular-nums">
                        {scenes.length.toLocaleString()}
                    </span>
                    {onCollapse === undefined ? null : (
                        <button
                            type="button"
                            aria-label="Hide the scene rail"
                            data-tip="Hide the scene rail"
                            onClick={onCollapse}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                        >
                            <PanelLeftClose aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </header>
            <div className="shrink-0 px-3 pb-2">
                <label className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-sunken px-2 focus-within:border-brand">
                    <Search aria-hidden="true" className="h-3 w-3 shrink-0 text-ink-muted" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setQueryInvalid(false);
                        }}
                        aria-invalid={queryInvalid || undefined}
                        aria-describedby={queryInvalid ? `${id}-find-note` : undefined}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                goToQuery();
                            }
                        }}
                        placeholder="Find frame or time"
                        aria-label="Find frame or time"
                        className="min-w-0 flex-1 bg-transparent text-[10px] text-ink placeholder:text-ink-muted focus:outline-none"
                    />
                </label>
            </div>
            {scenes.length === 0 && emptyState !== undefined ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{emptyState}</div>
            ) : (
                <div
                    ref={scrollRef}
                    role="listbox"
                    aria-label="Scenes"
                    aria-multiselectable="true"
                    aria-activedescendant={
                        cursor === null ? undefined : `${id}-scene-${String(cursor)}`
                    }
                    tabIndex={0}
                    onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={onKeyDown}
                    className="relative min-h-0 flex-1 touch-none overflow-x-clip overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                >
                    <div
                        style={{
                            height: viewport.height,
                            position: "relative",
                        }}
                    >
                        {scenes.slice(viewport.start, viewport.end).map((scene, offset) => {
                            const index = viewport.start + offset;
                            const selected = selection.selected.has(index);
                            const warn = warnings[index] === true;
                            const seconds =
                                frameRate === null ? null : scene.frame_count / frameRate;
                            return (
                                <div
                                    key={scene.index}
                                    id={`${id}-scene-${String(index)}`}
                                    role="option"
                                    aria-selected={selected}
                                    data-tip={`Scene ${String(index + 1)} · frames ${String(scene.start_frame)}–${String(
                                        scene.end_frame - 1,
                                    )}`}
                                    style={{
                                        position: "absolute",
                                        top: index * ROW_HEIGHT,
                                        left: 0,
                                        right: 0,
                                        height: ROW_HEIGHT,
                                    }}
                                    className={`flex items-center gap-2 border-l-2 px-2.5 ${
                                        selected
                                            ? "border-brand bg-brand/10 text-ink"
                                            : "border-transparent text-ink-secondary hover:bg-hover"
                                    }`}
                                >
                                    <SceneStill
                                        src={thumbnailFor?.(scene.start_frame) ?? null}
                                        className="h-[23px] w-10 shrink-0 rounded-sm border border-line/60"
                                    />
                                    <span className="w-5 shrink-0 font-mono text-[10px] tabular-nums text-ink-muted">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-mono text-[11px] tabular-nums">
                                            {scene.start_frame.toLocaleString()}–
                                            {Math.max(
                                                scene.start_frame,
                                                scene.end_frame - 1,
                                            ).toLocaleString()}
                                            {warn ? (
                                                <TriangleAlert
                                                    aria-label="Invalid scene boundaries"
                                                    className="ml-1 inline h-3 w-3 align-[-2px] text-warning"
                                                    strokeWidth={1.8}
                                                />
                                            ) : null}
                                        </span>
                                        <span className="block truncate text-[10px] text-ink-muted">
                                            {seconds === null ? (
                                                `${scene.frame_count.toLocaleString()} frames`
                                            ) : (
                                                <>
                                                    {sceneLength(seconds)}
                                                    <span className="mx-1 text-line-strong">·</span>
                                                    {formatTimecode(scene.start_frame, frameRate)}
                                                </>
                                            )}
                                        </span>
                                    </span>
                                    <span className="w-3 shrink-0">
                                        {scene.encoded ? (
                                            <span
                                                aria-label="Encoded"
                                                data-tip="Retained chunk exists"
                                                className="block h-1.5 w-1.5 rounded-full bg-info"
                                            />
                                        ) : null}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line-subtle px-3 py-2">
                <span className="truncate font-mono text-[9px] text-ink-muted tabular-nums">
                    {scenes.length.toLocaleString()} scenes ·{" "}
                    {sourceFrames !== null &&
                    sourceFrames !== undefined &&
                    sourceFrames > totalFrames
                        ? `${totalFrames.toLocaleString()} of ${sourceFrames.toLocaleString()} frames`
                        : `${totalFrames.toLocaleString()} frames`}
                </span>
                <span className="shrink-0 text-[8.5px] text-ink-muted">Shift-click extends</span>
            </footer>
        </div>
    );
}
