// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { DraftActions, TopBarTargetContext } from "./TopBarActions";

afterEach(cleanup);

function Harness({
    dirty,
    pending = false,
    locked = false,
    onSave,
    onDiscard = () => undefined,
}: {
    dirty: boolean;
    pending?: boolean;
    locked?: boolean;
    onSave: () => void;
    onDiscard?: () => void;
}) {
    const [target, setTarget] = useState<HTMLDivElement | null>(null);
    return (
        <>
            <div ref={setTarget} />
            <TopBarTargetContext.Provider value={target}>
                <DraftActions
                    dirty={dirty}
                    pending={pending}
                    locked={locked}
                    onSave={onSave}
                    onDiscard={onDiscard}
                />
            </TopBarTargetContext.Provider>
        </>
    );
}

function press(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
        key,
        cancelable: true,
        ...modifiers,
    });
    window.dispatchEvent(event);
    return event;
}

it("saves a dirty draft from Ctrl+S while keeping the browser dialog away", () => {
    const onSave = vi.fn();
    render(<Harness dirty onSave={onSave} />);

    const event = press("s", { ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
});

it("does not write a clean, pending, or locked draft but still owns the shortcut", () => {
    const clean = vi.fn();
    render(<Harness dirty={false} onSave={clean} />);
    expect(press("s", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(clean).not.toHaveBeenCalled();
    cleanup();

    const pending = vi.fn();
    render(<Harness dirty pending onSave={pending} />);
    press("s", { ctrlKey: true });
    expect(pending).not.toHaveBeenCalled();
    cleanup();

    const locked = vi.fn();
    render(<Harness dirty locked onSave={locked} />);
    press("s", { ctrlKey: true });
    expect(locked).not.toHaveBeenCalled();
    cleanup();

    const dirty = vi.fn();
    render(<Harness dirty onSave={dirty} />);
    expect(press("s").defaultPrevented).toBe(false);
    expect(press("s", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(dirty).not.toHaveBeenCalled();
});

it("discards a dirty draft from the shared chord", () => {
    const onDiscard = vi.fn();
    render(<Harness dirty onSave={() => undefined} onDiscard={onDiscard} />);

    const event = press("d", { ctrlKey: true, shiftKey: true });

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
});

it("discards nothing when clean or pending, and still works while locked", () => {
    const clean = vi.fn();
    render(<Harness dirty={false} onSave={() => undefined} onDiscard={clean} />);
    expect(press("d", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(clean).not.toHaveBeenCalled();
    cleanup();

    const pending = vi.fn();
    render(<Harness dirty pending onSave={() => undefined} onDiscard={pending} />);
    press("d", { ctrlKey: true, shiftKey: true });
    expect(pending).not.toHaveBeenCalled();
    cleanup();

    // Discard is a local reset, so an encode's lock does not hide it.
    const locked = vi.fn();
    render(<Harness dirty locked onSave={() => undefined} onDiscard={locked} />);
    press("d", { ctrlKey: true, shiftKey: true });
    expect(locked).toHaveBeenCalledTimes(1);
});
