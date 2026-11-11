// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiProvider, MockTransport } from "@av1ation/api";
import type { VideoState } from "@av1ation/contracts";
import { toast } from "sonner";

import { TopBarTargetContext } from "../../shared/TopBarActions";
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
    const target = document.createElement("div");
    document.body.append(target);

    render(
        <ApiProvider transport={transport}>
            <TopBarTargetContext.Provider value={target}>
                <VideoRunActions projectId="project-1" videoId="video-1" state={STATE} />
            </TopBarTargetContext.Provider>
        </ApiProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Another video is encoding.");
    expect(errorToast).not.toHaveBeenCalled();
});
