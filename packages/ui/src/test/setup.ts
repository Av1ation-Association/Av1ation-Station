import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

if (typeof globalThis.ResizeObserver !== "function") {
    // ECharts and Monaco observe their container. jsdom has no layout engine, so an
    // observer that never fires is the correct no-layout behaviour for a component test.
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
    // Monaco asks the window for its colour scheme when its theme service starts. jsdom
    // has no media query engine, so the editor would throw before a script screen mounts.
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    });
}

beforeAll(() => {
    if (typeof HTMLDialogElement !== "undefined") {
        // jsdom has no top layer; the shared Sheet and dialog components use this API.
        HTMLDialogElement.prototype.showModal = function showModal() {
            this.open = true;
        };
        HTMLDialogElement.prototype.close = function close() {
            this.open = false;
        };
    }
    if (typeof window !== "undefined") {
        // TanStack Router restores scroll on navigation; jsdom has no implementation.
        window.scrollTo = () => {};
    }
});

afterEach(() => {
    if (typeof document === "undefined") {
        return;
    }
    cleanup();
    document.body.innerHTML = "";
});
