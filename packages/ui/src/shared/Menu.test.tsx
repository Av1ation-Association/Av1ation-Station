// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { Menu, MenuContent, MenuItem, MenuTrigger } from "./Menu";

beforeAll(() => {
    // Radix menus portal and measure their content; jsdom has neither by default.
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
    vi.stubGlobal(
        "PointerEvent",
        class extends MouseEvent {
            constructor(type: string, init?: MouseEventInit) {
                super(type, init);
            }
        },
    );
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

it("opens without locking the document scroll", async () => {
    render(
        <main id="page">
            <p>Page content</p>
            <Menu>
                <MenuTrigger asChild>
                    <button type="button">Open actions</button>
                </MenuTrigger>
                <MenuContent aria-label="Actions">
                    <MenuItem>Split here</MenuItem>
                </MenuContent>
            </Menu>
        </main>,
    );

    const trigger = screen.getByRole("button", { name: "Open actions" });
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.pointerUp(trigger, { button: 0 });
    fireEvent.click(trigger);

    const menu = await screen.findByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe("Actions");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.getByText("Page content").closest("main")?.hasAttribute("aria-hidden")).toBe(
        false,
    );
});
