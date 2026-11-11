// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiProvider, MockTransport, useSettings, useUpdateSettings } from "@av1ation/api";

import { ThemeSync, useResolvedTheme } from "./theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** The OS preference the stub reports, and the listeners React subscribed. */
const system = {
    light: false,
    listeners: new Set<() => void>(),
};

/**
 * jsdom has no `matchMedia`. The stub is mutable so the test can deliver the same `change`
 * event a real OS sends when the desktop switches appearance.
 */
function installSystemPreference(light: boolean): void {
    system.light = light;
    system.listeners.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
        // A real `MediaQueryList` reads its state live; a snapshot would leave the
        // listener reporting the value from before the OS changed.
        get matches() {
            return query === LIGHT_QUERY ? system.light : false;
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => {
            system.listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
            system.listeners.delete(listener);
        },
    }));
}

function changeSystemPreference(light: boolean): void {
    system.light = light;
    act(() => {
        for (const listener of [...system.listeners]) {
            listener();
        }
    });
}

/** The two surfaces a self-painted widget reads, plus the two writes that change them. */
function ThemeProbe() {
    const theme = useResolvedTheme();
    const settings = useSettings();
    const update = useUpdateSettings();

    const write = (next: string) => {
        const data = settings.data;
        if (data === undefined) {
            return;
        }
        update.mutate({
            theme: next,
            row_density: data.row_density,
            reduce_motion: data.reduce_motion,
            delete_chunks_on_success: data.delete_chunks_on_success,
        });
    };

    return (
        <>
            <output data-testid="resolved">{theme}</output>
            <output data-testid="preference">{settings.data?.theme ?? "loading"}</output>
            <button type="button" onClick={() => write("dark")}>
                Use dark
            </button>
            <button type="button" onClick={() => write("light")}>
                Use light
            </button>
        </>
    );
}

beforeEach(() => {
    installSystemPreference(false);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("follows the OS while the preference is system, then the saved choice", async () => {
    render(
        <ApiProvider transport={new MockTransport()}>
            <ThemeSync />
            <ThemeProbe />
        </ApiProvider>,
    );

    // The demo's saved preference is `system`; the stub says the OS is dark.
    await waitFor(() => {
        expect(screen.getByTestId("preference").textContent).toBe("system");
    });
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    // A `system` preference must follow the OS without a reload.
    changeSystemPreference(true);
    await waitFor(() => {
        expect(screen.getByTestId("resolved").textContent).toBe("light");
    });
    expect(document.documentElement.dataset.theme).toBe("light");

    // An explicit choice wins over the OS, and the write reaches the editor's theme source.
    fireEvent.click(screen.getByRole("button", { name: "Use dark" }));
    await waitFor(() => {
        expect(screen.getByTestId("preference").textContent).toBe("dark");
        expect(screen.getByTestId("resolved").textContent).toBe("dark");
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
});
