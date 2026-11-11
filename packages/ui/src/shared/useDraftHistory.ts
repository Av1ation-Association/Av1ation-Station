import { useCallback, useState } from "react";

import { isEditableTarget, useShortcut } from "./shortcuts";

interface History<T> {
    past: (T | null)[];
    present: T | null;
    future: (T | null)[];
}

const LIMIT = 100;

/**
 * Undo and redo for one configuration draft.
 *
 * History belongs to the unsaved document, not to the server: `reset` is for a reload or
 * a successful save, while `setValue` records one undo step. A text field keeps its own
 * native undo; the shortcut only drives this history when focus is not in an editable
 * control, so a path being retyped is never replaced by a whole-document jump.
 */
export function useDraftHistory<T>(initial: T | null = null, active = true) {
    const [history, setHistory] = useState<History<T>>({
        past: [],
        present: initial,
        future: [],
    });

    const setValue = useCallback((next: T | null | ((previous: T | null) => T | null)) => {
        setHistory((current) => {
            const value =
                typeof next === "function"
                    ? (next as (previous: T | null) => T | null)(current.present)
                    : next;
            if (Object.is(value, current.present)) {
                return current;
            }
            return {
                past: [...current.past, current.present].slice(-LIMIT),
                present: value,
                future: [],
            };
        });
    }, []);

    const reset = useCallback((next: T | null) => {
        setHistory({ past: [], present: next, future: [] });
    }, []);

    const undo = useCallback(() => {
        setHistory((current) => {
            const previous = current.past.at(-1);
            if (previous === undefined) {
                return current;
            }
            return {
                past: current.past.slice(0, -1),
                present: previous,
                future: [current.present, ...current.future].slice(0, LIMIT),
            };
        });
    }, []);

    const redo = useCallback(() => {
        setHistory((current) => {
            const next = current.future[0];
            if (next === undefined) {
                return current;
            }
            return {
                past: [...current.past, current.present].slice(-LIMIT),
                present: next,
                future: current.future.slice(1),
            };
        });
    }, []);

    const canUndo = history.past.length > 0;
    const canRedo = history.future.length > 0;

    // A focused field keeps its own native undo, so the chord is left to it; everywhere
    // else the draft's own history answers, through the same chords the top bar prints.
    useShortcut("undo", undo, {
        enabled: active,
        when: (event) => !isEditableTarget(event.target),
    });
    useShortcut("redo", redo, {
        enabled: active,
        when: (event) => !isEditableTarget(event.target),
    });

    return {
        value: history.present,
        setValue,
        reset,
        undo,
        redo,
        canUndo,
        canRedo,
    };
}
