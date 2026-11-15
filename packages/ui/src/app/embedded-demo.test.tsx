// @vitest-environment jsdom
import { useState, type ReactNode } from "react";

import axe from "axe-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { Menu, MenuContent, MenuItem, MenuTrigger } from "../shared/Menu";
import { DialogFrame } from "../shared/DialogFrame";
import { DemoModeProvider } from "../shared/demo-mode";
import { ScreenMain } from "../shared/ScreenMain";
import { Sheet } from "../shared/Sheet";

beforeAll(() => {
    Element.prototype.scrollIntoView = () => undefined;
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

/** The marketing document the real site supplies around the embedded application. */
function MarketingPage({ children }: { children: ReactNode }) {
    const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
    return (
        <main id="site-main">
            <h1>Marketing page</h1>
            <section aria-label="Live application demo">
                <div className="video-demo" data-video-demo="">
                    <DemoModeProvider embedded portalContainer={portalContainer}>
                        {children}
                    </DemoModeProvider>
                    <div
                        ref={setPortalContainer}
                        className="video-demo__overlay"
                        data-video-demo-overlay=""
                    />
                </div>
            </section>
        </main>
    );
}

function violations(violations: axe.Result[]): string[] {
    return violations.map(
        (violation) => `${violation.id} (${violation.impact}): ${violation.help}`,
    );
}

it("renders the demo screen without a second main landmark", () => {
    const { container } = render(
        <MarketingPage>
            <ScreenMain className="demo-screen">
                <p>Embedded configuration</p>
            </ScreenMain>
        </MarketingPage>,
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    const screenRoot = container.querySelector("[data-screen-main]");
    expect(screenRoot?.tagName).toBe("DIV");
    expect(screenRoot?.getAttribute("id")).toBeNull();
    expect(screenRoot?.textContent).toBe("Embedded configuration");
});

it("keeps a menu inside the demo host without hiding the marketing landmark", async () => {
    const { container } = render(
        <MarketingPage>
            <Menu open>
                <MenuTrigger asChild>
                    <button type="button">Scene actions</button>
                </MenuTrigger>
                <MenuContent aria-label="Demo scene actions">
                    <MenuItem>Split here</MenuItem>
                </MenuContent>
            </Menu>
        </MarketingPage>,
    );

    const menu = await screen.findByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe("Demo scene actions");
    const overlay = container.querySelector("[data-video-demo-overlay]");
    expect(overlay?.contains(menu)).toBe(true);

    const marketing = container.querySelector("#site-main");
    expect(marketing?.hasAttribute("aria-hidden")).toBe(false);
    expect(marketing?.hasAttribute("inert")).toBe(false);
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(document.body.style.overflow).not.toBe("hidden");
});

it("opens a sheet non-modally inside the demo host and passes the accessibility scan", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const { container } = render(
        <MarketingPage>
            <Sheet
                open
                title="Demo sheet"
                description="A sheet inside the frame"
                onClose={vi.fn()}
                footer={null}
            >
                <p>Sheet body</p>
            </Sheet>
        </MarketingPage>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Demo sheet" });
    const overlay = container.querySelector("[data-video-demo-overlay]");
    expect(overlay?.contains(dialog)).toBe(true);
    expect((dialog as HTMLDialogElement).open).toBe(true);

    // The native modal path is what puts the surface in the top layer and inerts the page.
    expect(showModal).not.toHaveBeenCalled();
    const marketing = container.querySelector("#site-main");
    expect(marketing?.hasAttribute("aria-hidden")).toBe(false);
    expect(marketing?.hasAttribute("inert")).toBe(false);
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(document.body.style.overflow).not.toBe("hidden");

    const result = await axe.run(container, {
        rules: {
            "color-contrast": { enabled: false },
            "target-size": { enabled: false },
        },
    });
    expect(violations(result.violations)).toEqual([]);
});

it("dismisses an embedded dialog from its scrim", async () => {
    const onDismiss = vi.fn();
    const { container } = render(
        <MarketingPage>
            <DialogFrame open onDismiss={onDismiss} labelledBy="demo-dialog-title">
                <h2 id="demo-dialog-title">Embedded dialog</h2>
            </DialogFrame>
        </MarketingPage>,
    );

    await screen.findByRole("dialog", { name: "Embedded dialog" });
    const scrim = container.querySelector("[data-embedded-dialog]");
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim as Element);
    expect(onDismiss).toHaveBeenCalledTimes(1);
});
