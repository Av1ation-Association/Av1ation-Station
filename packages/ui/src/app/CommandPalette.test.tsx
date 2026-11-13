// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { ApiProvider, MockTransport } from "@av1ation/api";

import { App } from "./App";
import { createAppRouter } from "./router";
import { SHORTCUT_IDS, SHORTCUTS, shortcutChords } from "../shared/shortcuts";

beforeAll(() => {
    // jsdom has no ResizeObserver and no scrolling; cmdk measures and scrolls its list.
    Element.prototype.scrollIntoView = () => undefined;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {
                return undefined;
            }
            unobserve() {
                return undefined;
            }
            disconnect() {
                return undefined;
            }
        },
    );
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
});

it("opens the keyboard reference from the palette's Keyboard Shortcuts entry", async () => {
    window.history.replaceState(null, "", "/");
    const router = createAppRouter();
    render(
        <ApiProvider transport={new MockTransport()}>
            <App router={router} />
        </ApiProvider>,
    );

    // The shell mounts after the lazy route resolves; the chord only answers once it has.
    const trigger = await screen.findByRole(
        "button",
        { name: "Command palette" },
        { timeout: 5_000 },
    );

    const chord = new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        cancelable: true,
    });
    window.dispatchEvent(chord);
    expect(chord.defaultPrevented).toBe(true);

    await screen.findByRole("dialog", { name: "Command palette" }, { timeout: 2_000 });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("option", { name: "Keyboard Shortcuts" }));

    // The palette closes first: its Radix modal hides everything outside it, so a dialog
    // opened underneath would be aria-hidden.
    await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull(),
    );

    const dialog = await screen.findByRole(
        "dialog",
        { name: "Keyboard Shortcuts" },
        { timeout: 2_000 },
    );
    expect((dialog as HTMLDialogElement).open).toBe(true);

    // Every command the scheme can run is listed, from the same table the listeners match,
    // including the scene player's bare keys.
    expect(within(dialog).getByText("Application")).toBeDefined();
    expect(within(dialog).getByText("Scene player")).toBeDefined();
    for (const id of SHORTCUT_IDS) {
        expect(within(dialog).getByText(SHORTCUTS[id].label)).toBeDefined();
        expect(within(dialog).getByText(shortcutChords(id).join(" / "))).toBeDefined();
    }
});
