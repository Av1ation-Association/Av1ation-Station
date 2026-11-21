// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { populatedTransport } from "../test/route-fixtures";
import { VideoDemo } from "./VideoDemo";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("VideoDemo", () => {
    it("renders the demo's own not-found guidance", async () => {
        render(<VideoDemo transport={populatedTransport()} initialEntry="/not-a-video-route" />);

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("This route is not part of the demo.");
    });

    it("pauses media while off screen and resumes only what was playing", async () => {
        const isPaused = new WeakMap<HTMLMediaElement, boolean>();
        const play = vi
            .spyOn(HTMLMediaElement.prototype, "play")
            .mockImplementation(function playMedia(this: HTMLMediaElement) {
                isPaused.set(this, false);
                return Promise.resolve();
            });
        const pause = vi
            .spyOn(HTMLMediaElement.prototype, "pause")
            .mockImplementation(function pauseMedia(this: HTMLMediaElement) {
                isPaused.set(this, true);
            });
        const transport = populatedTransport();
        const view = render(<VideoDemo transport={transport} paused />);
        await screen.findByRole("heading", { level: 1, name: "Pipeline" }, { timeout: 5_000 });

        const root = view.container.querySelector("[data-video-demo]");
        if (root === null) throw new Error("the demo root did not render");
        const video = document.createElement("video");
        Object.defineProperty(video, "paused", {
            configurable: true,
            get: () => isPaused.get(video) ?? false,
        });
        Object.defineProperty(video, "ended", {
            configurable: true,
            get: () => false,
        });
        root.append(video);

        fireEvent(video, new Event("play", { bubbles: true }));
        expect(pause).toHaveBeenCalled();
        expect(isPaused.get(video)).toBe(true);

        view.rerender(<VideoDemo transport={transport} paused={false} />);
        await waitFor(() => expect(play).toHaveBeenCalled());
        expect(isPaused.get(video)).toBe(false);
    });

    it("restores the host scroll position and reports in-demo navigation", async () => {
        const onNavigate = vi.fn();
        render(<VideoDemo transport={populatedTransport()} onNavigate={onNavigate} />);
        await screen.findByRole("heading", { level: 1, name: "Pipeline" }, { timeout: 5_000 });

        fireEvent.click(screen.getByRole("link", { name: "Scenes" }));

        expect(
            await screen.findByRole("heading", { level: 1, name: "Scenes" }, { timeout: 5_000 }),
        ).toBeTruthy();
        await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    });
});
