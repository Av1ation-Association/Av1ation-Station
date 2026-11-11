// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
    isEditableTarget,
    isModalOpen,
    isTextEntryTarget,
    matchesShortcut,
    modifierLabel,
    shortcutHint,
    useShortcut,
} from "./shortcuts";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

function chord(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent("keydown", { key, cancelable: true, ...modifiers });
}

function press(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
    const event = chord(key, modifiers);
    window.dispatchEvent(event);
    return event;
}

it("matches one exact chord, so Save never becomes Save As", () => {
    expect(matchesShortcut(chord("s", { ctrlKey: true }), "save")).toBe(true);
    expect(matchesShortcut(chord("S", { metaKey: true }), "save")).toBe(true);
    expect(matchesShortcut(chord("s", { ctrlKey: true, shiftKey: true }), "save")).toBe(false);
    expect(matchesShortcut(chord("s", { ctrlKey: true, altKey: true }), "save")).toBe(false);
    expect(matchesShortcut(chord("s"), "save")).toBe(false);
});

it("answers both redo conventions", () => {
    expect(matchesShortcut(chord("z", { ctrlKey: true, shiftKey: true }), "redo")).toBe(true);
    expect(matchesShortcut(chord("y", { ctrlKey: true }), "redo")).toBe(true);
    expect(matchesShortcut(chord("y", { ctrlKey: true, shiftKey: true }), "redo")).toBe(false);
    expect(matchesShortcut(chord("z", { ctrlKey: true }), "undo")).toBe(true);
});

it("prints the platform's own modifier and a readable key", () => {
    const modifier = modifierLabel();
    expect(shortcutHint("save")).toBe(`${modifier} S`);
    expect(shortcutHint("discard")).toBe(`${modifier} Shift D`);
    expect(shortcutHint("run")).toBe(`${modifier} Enter`);
});

it("tells typing apart from a checkbox the user selected a row with", () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const text = document.createElement("input");
    text.type = "text";
    const area = document.createElement("textarea");
    const plain = document.createElement("div");

    expect(isEditableTarget(checkbox)).toBe(true);
    expect(isTextEntryTarget(checkbox)).toBe(false);
    expect(isTextEntryTarget(text)).toBe(true);
    expect(isTextEntryTarget(area)).toBe(true);
    expect(isTextEntryTarget(plain)).toBe(false);
});

it("sees a modal while it owns the interaction", () => {
    expect(isModalOpen()).toBe(false);

    const native = document.createElement("dialog");
    native.open = true;
    document.body.append(native);
    expect(isModalOpen()).toBe(true);
    native.remove();

    const portal = document.createElement("div");
    portal.setAttribute("role", "alertdialog");
    document.body.append(portal);
    expect(isModalOpen()).toBe(true);
});

it("runs once per press and claims the event", () => {
    const handler = vi.fn();
    renderHook(() => useShortcut("save", handler));

    const event = press("s", { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    press("s", { ctrlKey: true, repeat: true });
    expect(handler).toHaveBeenCalledTimes(1);
});

it("leaves the event to the focused control when its condition refuses", () => {
    const handler = vi.fn();
    renderHook(() => useShortcut("run", handler, { when: () => false }));

    const event = press("Enter", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
});

it("does not let a second mounted draft run the same command", () => {
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() => useShortcut("discard", first));
    renderHook(() => useShortcut("discard", second));

    press("d", { ctrlKey: true, shiftKey: true });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
});
