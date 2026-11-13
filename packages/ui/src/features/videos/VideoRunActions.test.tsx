// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import type { VideoState } from "@av1ation/contracts";
import { toast } from "sonner";

import { renderRoute } from "../../test/render";
import { VideoRunActions } from "./VideoRunActions";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

const STATE: VideoState = {
    video_id: "video-1",
    scene_count: 4,
    sequences: [],
    next: ["SceneDetector"],
    active: false,
    run_id: null,
    failure: null,
    output_exists: false,
    retained_bytes: 0,
    script_data: [],
};

it("states a refused start below the bar and never toasts it", async () => {
    const transport = new MockTransport();
    vi.spyOn(transport, "post").mockRejectedValue(new Error("Another video is encoding."));
    const errorToast = vi.spyOn(toast, "error");

    renderRoute(<VideoRunActions projectId="project-1" videoId="video-1" state={STATE} />, {
        transport,
        route: "/projects/$projectId/videos/$videoId",
        initialEntry: "/projects/project-1/videos/video-1",
        topBar: true,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Start" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Another video is encoding.");
    expect(errorToast).not.toHaveBeenCalled();
});

it("names validation blockers and links to Dependencies when a provider is missing", async () => {
    const transport = new MockTransport({
        validation: {
            can_encode: false,
            blockers: ["This video uses a VapourSynth input, but VapourSynth is unavailable."],
            checks: [
                {
                    id: "vapoursynth",
                    label: "VapourSynth",
                    capability: "decode",
                    available: false,
                    detail: "VSScript could not be loaded.",
                },
            ],
        },
    });

    renderRoute(<VideoRunActions projectId="project-1" videoId="video-1" state={STATE} />, {
        transport,
        route: "/projects/$projectId/videos/$videoId",
        initialEntry: "/projects/project-1/videos/video-1",
        topBar: true,
    });

    await screen.findByText("This video cannot start yet.");
    expect(
        screen.getByText("This video uses a VapourSynth input, but VapourSynth is unavailable."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "Open Dependencies" }).getAttribute("href")).toBe(
        "/settings#dependencies",
    );
});
