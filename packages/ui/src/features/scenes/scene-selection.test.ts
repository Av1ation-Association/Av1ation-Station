import { describe, expect, it } from "vitest";

import {
    NO_SELECTION,
    moveCursor,
    moveCursorTo,
    reconcile,
    selectScene,
    selectSpan,
    selectionForKey,
    toggleCursor,
} from "./scene-selection";

function selected(...indices: number[]): Set<number> {
    return new Set(indices);
}

describe("selectScene", () => {
    it("replaces the selection on a plain click", () => {
        const next = selectScene(
            { selected: selected(0, 1), anchor: 0, cursor: 1 },
            4,
            "replace",
            10,
        );

        expect([...next.selected]).toEqual([4]);
        expect(next.anchor).toBe(4);
        expect(next.cursor).toBe(4);
    });

    it("extends from the anchor in either direction", () => {
        const anchor = selectScene(NO_SELECTION, 6, "replace", 10);
        const forward = selectScene(anchor, 8, "extend", 10);
        const backward = selectScene(anchor, 4, "extend", 10);

        expect([...forward.selected]).toEqual([6, 7, 8]);
        expect([...backward.selected]).toEqual([4, 5, 6]);
        expect(forward.anchor).toBe(6);
        expect(backward.anchor).toBe(6);
        expect(backward.cursor).toBe(4);
    });

    it("toggles membership and moves the anchor to the clicked row", () => {
        const first = selectScene(NO_SELECTION, 2, "replace", 5);
        const added = selectScene(first, 4, "toggle", 5);
        const removed = selectScene(added, 2, "toggle", 5);

        expect([...added.selected].sort()).toEqual([2, 4]);
        expect(added.anchor).toBe(4);
        expect([...removed.selected]).toEqual([4]);
    });

    it("clamps a click past either edge", () => {
        const past = selectScene(NO_SELECTION, 99, "replace", 4);
        const before = selectScene(NO_SELECTION, -3, "replace", 4);

        expect([...past.selected]).toEqual([3]);
        expect([...before.selected]).toEqual([0]);
    });
});

describe("selectSpan", () => {
    it("replaces the selection with the swept range", () => {
        const base = { selected: selected(0), anchor: 0, cursor: 0 };
        const next = selectSpan(base, 3, 1, false, 8);

        expect([...next.selected]).toEqual([1, 2, 3]);
        expect(next.anchor).toBe(3);
        expect(next.cursor).toBe(1);
    });

    it("adds the swept range to an existing selection when additive", () => {
        const base = { selected: selected(0), anchor: 0, cursor: 0 };
        const next = selectSpan(base, 3, 1, true, 8);

        expect([...next.selected].sort()).toEqual([0, 1, 2, 3]);
    });

    it("sweeps a long list without dropping the last row", () => {
        const next = selectSpan(NO_SELECTION, 0, 4_999, false, 5_000);

        expect(next.selected.size).toBe(5_000);
        expect(next.selected.has(4_999)).toBe(true);
    });
});

describe("moveCursor", () => {
    it("lands on the first row when nothing is selected", () => {
        const next = moveCursor(NO_SELECTION, 1, false, 10);

        expect(next.cursor).toBe(0);
        expect([...next.selected]).toEqual([0]);
    });

    it("moves and selects one row without extending", () => {
        const start = selectScene(NO_SELECTION, 2, "replace", 10);
        const next = moveCursor(start, 1, false, 10);

        expect([...next.selected]).toEqual([3]);
        expect(next.anchor).toBe(3);
    });

    it("extends from the anchor with shift", () => {
        const start = selectScene(NO_SELECTION, 2, "replace", 10);
        const grown = moveCursor(start, 2, true, 10);
        const shrunk = moveCursor(grown, -2, true, 10);

        expect([...grown.selected]).toEqual([2, 3, 4]);
        expect([...shrunk.selected]).toEqual([2]);
        expect(shrunk.anchor).toBe(2);
    });

    it("clamps at the ends", () => {
        const start = selectScene(NO_SELECTION, 0, "replace", 4);
        const before = moveCursor(start, -5, false, 4);
        const after = moveCursor(start, 99, false, 4);

        expect(before.cursor).toBe(0);
        expect(after.cursor).toBe(3);
    });

    it("keeps the last row selected when page-stepping", () => {
        const start = selectScene(NO_SELECTION, 0, "replace", 100);
        const next = moveCursor(start, 24, true, 100);

        expect(next.selected.size).toBe(25);
        expect(next.selected.has(24)).toBe(true);
    });
});

describe("moveCursorTo and toggleCursor", () => {
    it("jumps to the first and last scene", () => {
        const start = selectScene(NO_SELECTION, 3, "replace", 10);
        const end = moveCursorTo(start, 9, false, 10);
        const home = moveCursorTo(end, 0, false, 10);

        expect(end.cursor).toBe(9);
        expect([...home.selected]).toEqual([0]);
    });

    it("adds and removes the cursor row without moving", () => {
        const start = selectScene(NO_SELECTION, 2, "replace", 5);
        const cleared = toggleCursor(start, 5);
        const restored = toggleCursor(cleared, 5);

        expect([...cleared.selected]).toEqual([]);
        expect(cleared.cursor).toBe(2);
        expect([...restored.selected]).toEqual([2]);
        expect(restored.cursor).toBe(2);
    });
});

describe("selectionForKey", () => {
    it("steps rows and pages in both directions", () => {
        const start = selectScene(NO_SELECTION, 5, "replace", 50);
        const down = selectionForKey(start, "ArrowDown", false, 10, 50);
        const page = selectionForKey(down ?? start, "PageDown", false, 10, 50);
        const back = selectionForKey(page ?? start, "PageUp", true, 10, 50);

        expect(down?.cursor).toBe(6);
        expect(page?.cursor).toBe(16);
        expect(back?.cursor).toBe(6);
        expect(back?.anchor).toBe(16);
        expect(back?.selected.size).toBe(11);
    });

    it("handles Home, End, and Space, and ignores other keys", () => {
        const start = selectScene(NO_SELECTION, 5, "replace", 20);
        const end = selectionForKey(start, "End", false, 10, 20);
        const home = selectionForKey(end ?? start, "Home", false, 10, 20);
        const toggled = selectionForKey(home ?? start, " ", false, 10, 20);

        expect(end?.cursor).toBe(19);
        expect(home?.cursor).toBe(0);
        expect(toggled?.selected.size).toBe(0);
        expect(selectionForKey(start, "a", false, 10, 20)).toBeNull();
    });
});

describe("reconcile", () => {
    it("drops rows a shorter scene list no longer has", () => {
        const start = {
            selected: selected(1, 4, 9),
            anchor: 9,
            cursor: 9,
        };
        const next = reconcile(start, 5);

        expect([...next.selected]).toEqual([1, 4]);
        expect(next.cursor).toBe(1);
        expect(next.anchor).toBe(1);
    });

    it("clears the selection when the list is empty", () => {
        expect(reconcile({ selected: selected(1), anchor: 1, cursor: 1 }, 0)).toBe(NO_SELECTION);
    });
});
