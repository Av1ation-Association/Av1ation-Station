/**
 * The one selection model shared by the scene rail and the timeline.
 *
 * It is deliberately a value object rather than component state: the rail handles pointer
 * drags and the timeline handles block clicks, and both must produce the same result for
 * the same gesture. Keeping the rules here also makes shift, ctrl, and page movement
 * testable without a DOM.
 */
export type SelectionMode = "replace" | "extend" | "toggle";

export interface SceneSelection {
    /** Scene indices in the current edit context. */
    readonly selected: ReadonlySet<number>;
    /** The index a shift or drag range grows from. */
    readonly anchor: number | null;
    /** The keyboard cursor, which can differ from the anchor while extending. */
    readonly cursor: number | null;
}

/** An empty selection; shared so an empty list does not allocate on every render. */
export const NO_SELECTION: SceneSelection = {
    selected: new Set<number>(),
    anchor: null,
    cursor: null,
};

/** Every index from `left` to `right`, in either direction, inclusive. */
export function rangeBetween(left: number, right: number): number[] {
    const start = Math.min(left, right);
    const end = Math.max(left, right);
    const indices: number[] = [];
    for (let index = start; index <= end; index += 1) {
        indices.push(index);
    }
    return indices;
}

function clamp(index: number, count: number): number {
    return Math.max(0, Math.min(count - 1, index));
}

/**
 * Drop indices that a shorter scene list no longer has.
 *
 * A run that rewrites the scene table can leave the selection pointing past its end. The
 * selection is repaired rather than kept, so a selected row cannot refer to a scene that is
 * not on screen.
 */
export function reconcile(selection: SceneSelection, count: number): SceneSelection {
    if (count <= 0) {
        return NO_SELECTION;
    }
    const usable = (index: number | null): index is number =>
        index !== null && index >= 0 && index < count;
    const selected = new Set([...selection.selected].filter(usable));
    if (selected.size === selection.selected.size) {
        const cursor =
            selection.cursor !== null && selection.cursor >= 0 && selection.cursor < count
                ? selection.cursor
                : selected.size > 0
                  ? Math.min(...selected)
                  : null;
        const anchor =
            selection.anchor !== null && selection.anchor >= 0 && selection.anchor < count
                ? selection.anchor
                : cursor;
        return { selected, anchor, cursor };
    }
    const cursor = selected.size > 0 ? Math.min(...selected) : null;
    return { selected, anchor: cursor, cursor };
}

/**
 * Apply a click to the selection.
 *
 * `replace` is the ordinary click, `extend` is shift-click from the existing anchor, and
 * `toggle` is ctrl/cmd-click. A toggle moves the anchor to the clicked row so a following
 * shift-click grows from where the user last acted.
 */
export function selectScene(
    selection: SceneSelection,
    index: number,
    mode: SelectionMode,
    count: number,
): SceneSelection {
    if (count <= 0) {
        return NO_SELECTION;
    }
    const target = clamp(index, count);
    if (mode === "replace") {
        return { selected: new Set([target]), anchor: target, cursor: target };
    }
    if (mode === "toggle") {
        const selected = new Set(selection.selected);
        if (selected.has(target)) {
            selected.delete(target);
        } else {
            selected.add(target);
        }
        return { selected, anchor: target, cursor: target };
    }
    const anchor = selection.anchor ?? selection.cursor ?? target;
    return {
        selected: new Set(rangeBetween(anchor, target)),
        anchor,
        cursor: target,
    };
}

/**
 * Replace or extend the selection with a dragged span.
 *
 * `base` is the selection captured at pointer-down. A plain or shift drag replaces it; a
 * ctrl/cmd drag adds the swept range to what was already selected.
 */
export function selectSpan(
    base: SceneSelection,
    anchor: number,
    focus: number,
    additive: boolean,
    count: number,
): SceneSelection {
    if (count <= 0) {
        return NO_SELECTION;
    }
    const start = clamp(anchor, count);
    const target = clamp(focus, count);
    const selected = additive ? new Set(base.selected) : new Set<number>();
    for (const index of rangeBetween(start, target)) {
        selected.add(index);
    }
    return { selected, anchor: start, cursor: target };
}

/**
 * Move the cursor by a row delta. Without `extend` this is ordinary arrow navigation and
 * replaces the selection; with it, the range grows from the existing anchor.
 */
export function moveCursor(
    selection: SceneSelection,
    delta: number,
    extend: boolean,
    count: number,
): SceneSelection {
    if (count <= 0) {
        return NO_SELECTION;
    }
    const current = selection.cursor ?? selection.anchor;
    // With nothing selected, the first navigation lands on the first row rather than
    // skipping it; PageDown from an empty list therefore selects row one too.
    const target = current === null ? 0 : clamp(current + delta, count);
    if (!extend) {
        return { selected: new Set([target]), anchor: target, cursor: target };
    }
    const anchor = selection.anchor ?? selection.cursor ?? target;
    return {
        selected: new Set(rangeBetween(anchor, target)),
        anchor,
        cursor: target,
    };
}

/** `Home`/`End`: move the cursor to a specific row, extending when asked. */
export function moveCursorTo(
    selection: SceneSelection,
    target: number,
    extend: boolean,
    count: number,
): SceneSelection {
    if (count <= 0) {
        return NO_SELECTION;
    }
    const cursor = clamp(target, count);
    if (!extend) {
        return { selected: new Set([cursor]), anchor: cursor, cursor };
    }
    const anchor = selection.anchor ?? selection.cursor ?? cursor;
    return {
        selected: new Set(rangeBetween(anchor, cursor)),
        anchor,
        cursor,
    };
}

/**
 * Translate one keyboard event into a selection change, or null when the key is not a
 * selection key. The rail and the timeline share this so both surfaces step identically.
 */
export function selectionForKey(
    selection: SceneSelection,
    key: string,
    extend: boolean,
    pageSize: number,
    count: number,
): SceneSelection | null {
    switch (key) {
        case "ArrowDown":
        case "ArrowRight":
            return moveCursor(selection, 1, extend, count);
        case "ArrowUp":
        case "ArrowLeft":
            return moveCursor(selection, -1, extend, count);
        case "PageDown":
            return moveCursor(selection, Math.max(1, pageSize), extend, count);
        case "PageUp":
            return moveCursor(selection, -Math.max(1, pageSize), extend, count);
        case "Home":
            return moveCursorTo(selection, 0, extend, count);
        case "End":
            return moveCursorTo(selection, Math.max(0, count - 1), extend, count);
        case " ":
        case "Spacebar":
            return toggleCursor(selection, count);
        default:
            return null;
    }
}

/** `Space`: add or remove the row under the cursor without moving it. */
export function toggleCursor(selection: SceneSelection, count: number): SceneSelection {
    if (count <= 0) {
        return NO_SELECTION;
    }
    const target = selection.cursor ?? selection.anchor ?? 0;
    const selected = new Set(selection.selected);
    if (selected.has(target)) {
        selected.delete(target);
    } else {
        selected.add(target);
    }
    return { ...selection, selected };
}
