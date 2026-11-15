import { useEffect, useRef } from "react";

import { useHostShortcuts } from "./demo-mode";

/**
 * One chord: the key, whether Shift is held, and whether it needs the primary modifier.
 *
 * Alt is never part of a chord, because it belongs to the window manager on two of the
 * three hosts. A chord without Shift is exact: Ctrl+Shift+S is Save As in a browser and
 * must not save over the draft. `primary: false` marks a bare key that belongs to a focused
 * surface, such as the scene player, and must never be bound to the window.
 */
interface Chord {
    readonly key: string;
    readonly shift: boolean;
    /** Defaults to true; false means the chord is the bare key, with no Ctrl or ⌘. */
    readonly primary?: boolean;
}

/** Where a command answers: the whole window, or one focused surface. */
export type ShortcutScope = "global" | "player";

/** One command, its chords, and the words its control uses. */
export interface Shortcut {
    /** The chords that run the command; the first is the one a tooltip prints. */
    readonly chords: readonly [Chord, ...Chord[]];
    readonly label: string;
    readonly scope: ShortcutScope;
}

const DEFINITIONS = {
    save: {
        chords: [{ key: "s", shift: false }],
        label: "Save",
        scope: "global",
    },
    discard: {
        chords: [{ key: "d", shift: true }],
        label: "Discard draft",
        scope: "global",
    },
    undo: {
        chords: [{ key: "z", shift: false }],
        label: "Undo",
        scope: "global",
    },
    // Ctrl+Y is the Windows convention for the same step; a tooltip prints the first chord.
    redo: {
        chords: [
            { key: "z", shift: true },
            { key: "y", shift: false },
        ],
        label: "Redo",
        scope: "global",
    },
    palette: {
        chords: [{ key: "k", shift: false }],
        label: "Command palette",
        scope: "global",
    },
    run: {
        chords: [{ key: "enter", shift: false }],
        label: "Run selected video",
        scope: "global",
    },
    // The scene player answers bare keys. They are listed beside the global commands but
    // are never bound to the window: Space scrolls a page, and V pastes in a browser. Each
    // pair is one command with two chords, so the reference prints both.
    playerPlay: {
        chords: [
            { key: " ", shift: false, primary: false },
            { key: "k", shift: false, primary: false },
        ],
        label: "Play or pause",
        scope: "player",
    },
    playerPreviousScene: {
        chords: [
            { key: "arrowup", shift: false, primary: false },
            { key: "w", shift: false, primary: false },
        ],
        label: "Previous scene",
        scope: "player",
    },
    playerNextScene: {
        chords: [
            { key: "arrowdown", shift: false, primary: false },
            { key: "s", shift: false, primary: false },
        ],
        label: "Next scene",
        scope: "player",
    },
    playerPreviousFrame: {
        chords: [
            { key: "arrowleft", shift: false, primary: false },
            { key: "a", shift: false, primary: false },
        ],
        label: "Previous frame",
        scope: "player",
    },
    playerNextFrame: {
        chords: [
            { key: "arrowright", shift: false, primary: false },
            { key: "d", shift: false, primary: false },
        ],
        label: "Next frame",
        scope: "player",
    },
    playerPicture: {
        chords: [{ key: "v", shift: false, primary: false }],
        label: "Toggle picture",
        scope: "player",
    },
    playerFullscreen: {
        chords: [{ key: "f", shift: false, primary: false }],
        label: "Full screen",
        scope: "player",
    },
    playerReset: {
        chords: [{ key: "r", shift: false, primary: false }],
        label: "Reset zoom",
        scope: "player",
    },
} as const;

export type ShortcutId = keyof typeof DEFINITIONS;

/**
 * The ids whose scope is one focused surface, derived from the table itself.
 *
 * A hand-kept union here would be a footgun: a new player command that answers a letter
 * would compile in `useShortcut` and then hijack typing on every screen.
 */
type PlayerShortcutId = {
    [Id in ShortcutId]: (typeof DEFINITIONS)[Id]["scope"] extends "player" ? Id : never;
}[ShortcutId];

/**
 * The chords a screen may bind to the window. A bare-key command would hijack typing and
 * page scrolling everywhere, so `useShortcut` refuses it at the type level.
 */
export type GlobalShortcutId = Exclude<ShortcutId, PlayerShortcutId>;

export const SHORTCUTS: Record<ShortcutId, Shortcut> = DEFINITIONS;

/**
 * The scheme in the order the reference reads: the document, its history, navigation, the
 * primary action, then the keys that belong to the scene player, transport first.
 */
export const SHORTCUT_IDS: readonly ShortcutId[] = [
    "save",
    "discard",
    "undo",
    "redo",
    "palette",
    "run",
    "playerPlay",
    "playerPreviousScene",
    "playerNextScene",
    "playerPreviousFrame",
    "playerNextFrame",
    "playerPicture",
    "playerFullscreen",
    "playerReset",
];

const KEY_LABELS: Record<string, string> = {
    enter: "Enter",
    " ": "Space",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
};

/**
 * The modifier as this platform prints it.
 *
 * The desktop window runs on all three operating systems, and a hint that says Ctrl on a
 * Mac is a hint for a key the user does not have.
 */
export function modifierLabel(): string {
    if (typeof navigator === "undefined") {
        return "Ctrl";
    }
    const platform = `${navigator.platform} ${navigator.userAgent}`;
    return /mac|iphone|ipad/iu.test(platform) ? "⌘" : "Ctrl";
}

/** The bytes a chord reads; a DOM event and a React synthetic event both qualify. */
export type ChordEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

function chordLabel(chord: Chord): string {
    const key = KEY_LABELS[chord.key] ?? chord.key.toUpperCase();
    return [chord.primary === false ? null : modifierLabel(), chord.shift ? "Shift" : null, key]
        .filter((part) => part !== null)
        .join(" ");
}

/** The chord a tooltip prints, such as `Ctrl Shift D` or `Space`. */
export function shortcutHint(id: ShortcutId): string {
    return chordLabel(SHORTCUTS[id].chords[0]);
}

/** Every chord a command answers, for the reference sheet. */
export function shortcutChords(id: ShortcutId): string[] {
    return SHORTCUTS[id].chords.map(chordLabel);
}

/** True when the event is exactly one of the command's chords. */
export function matchesShortcut(event: ChordEvent, id: ShortcutId): boolean {
    if (event.altKey) {
        return false;
    }
    const primary = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    return SHORTCUTS[id].chords.some(
        (chord) =>
            chord.key === key &&
            chord.shift === event.shiftKey &&
            (chord.primary === false ? !primary : primary),
    );
}

/** Whether focus sits in a control that owns printable keys and native undo. */
export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** The input types that do not consume typed characters. */
const NON_TEXT_INPUTS = new Set([
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "file",
    "range",
    "color",
    "image",
]);

/**
 * Whether focus sits in a control that takes typed characters.
 *
 * A command such as Run must not steal Ctrl+Enter from a path field, but a queue row is
 * selected with a checkbox: that focus is not typing, and the same chord has to run the
 * video the row just selected.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    if (target.isContentEditable) {
        return true;
    }
    if (target instanceof HTMLTextAreaElement) {
        return true;
    }
    if (target instanceof HTMLSelectElement) {
        return true;
    }
    if (target instanceof HTMLInputElement) {
        return !NON_TEXT_INPUTS.has(target.type);
    }
    return false;
}

/**
 * True while a modal surface owns the interaction.
 *
 * A page-level chord must not run behind a dialog the user is answering: Enter belongs to
 * the focused button there, and Ctrl+Enter must not start an encode the dialog is asking
 * about.
 */
export function isModalOpen(): boolean {
    return document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]') !== null;
}

export interface ShortcutOptions {
    /**
     * Evaluated when the chord is pressed. False leaves the event to the focused control,
     * including its browser default, so a field can keep Ctrl+Enter for itself.
     */
    when?: (event: KeyboardEvent) => boolean;
    /** False removes the listener entirely, for a command the screen cannot run. */
    enabled?: boolean;
}

/**
 * Runs `handler` when the user presses one of the command's chords.
 *
 * The listener is on the capture phase so a focused Monaco or text field cannot swallow a
 * page command, and the chord is matched exactly so Save and Save As never collide. The
 * first handler to claim an event prevents it; a second mounted draft, or a nested screen,
 * cannot run the same command twice.
 */
export function useShortcut(
    id: GlobalShortcutId,
    handler: () => void,
    options: ShortcutOptions = {},
): void {
    const { enabled = true, when } = options;
    // A bounded docs frame owns no window chords; the page keeps its search and browser keys.
    const hostShortcuts = useHostShortcuts();
    // Screens re-render on every progress tick, so the listener stays subscribed by
    // identity and reads the current callbacks instead of re-registering each frame.
    const latest = useRef({ handler, when });
    useEffect(() => {
        latest.current = { handler, when };
    });

    useEffect(() => {
        if (!enabled || !hostShortcuts) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !matchesShortcut(event, id)) {
                return;
            }
            if (latest.current.when !== undefined && !latest.current.when(event)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) {
                latest.current.handler();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [enabled, hostShortcuts, id]);
}
