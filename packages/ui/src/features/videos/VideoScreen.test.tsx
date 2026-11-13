// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { VideoState } from "@av1ation/contracts";

import { renderRoute } from "../../test/render";
import { populatedTransport } from "../../test/route-fixtures";
import { VideoScreen } from "./VideoScreen";

afterEach(() => {
    vi.restoreAllMocks();
});

const VIDEO_PATH = "/api/projects/demo-project/videos/demo-video";

const READY_STATE: VideoState = {
    video_id: "demo-video",
    scene_count: 4,
    sequences: [
        {
            id: "SceneDetector",
            name: "Scene Detector",
            status: "never_run",
            runnable: true,
            detail: "No scenes yet",
            progress: null,
        },
        {
            id: "ParallelEncoder",
            name: "Parallel Encoder",
            status: "never_run",
            runnable: false,
            detail: null,
            progress: null,
        },
    ],
    next: ["SceneDetector"],
    active: false,
    run_id: null,
    failure: null,
    output_exists: false,
    retained_bytes: 0,
    script_data: [],
};

function withState(overrides: Partial<VideoState> = {}): VideoState {
    return { ...READY_STATE, ...overrides };
}

function renderVideo(
    transport: ReturnType<typeof populatedTransport>,
    state: VideoState = READY_STATE,
) {
    transport.routes.set(`${VIDEO_PATH}/state`, state);
    return renderRoute(<VideoScreen />, {
        route: "/projects/$projectId/videos/$videoId",
        initialEntry: "/projects/demo-project/videos/demo-video",
        transport,
        topBar: true,
        stubs: [
            "/projects/$projectId",
            "/projects/$projectId/config/$section",
            "/projects/$projectId/videos/$videoId/config/general",
            "/projects/$projectId/videos/$videoId/config/$section",
            "/projects/$projectId/videos/$videoId/scenes",
            "/projects/$projectId/videos/$videoId/history",
            "/projects/$projectId/videos/$videoId/logs",
        ],
    });
}

function dialogFor(title: string): HTMLDialogElement {
    const heading = screen.getByRole("heading", { name: title });
    const dialog = heading.closest("dialog");
    if (dialog === null) {
        throw new Error(`No dialog owns the heading "${title}".`);
    }
    return dialog;
}

it("starts one sequence through the run mutation", async () => {
    const transport = populatedTransport();
    const post = vi.spyOn(transport, "post");
    renderVideo(transport);

    await screen.findByRole("heading", { level: 1, name: "Pipeline" });
    fireEvent.click(await screen.findByRole("button", { name: "Start Scene Detector" }));

    await waitFor(() =>
        expect(post.mock.calls.some(([path]) => path === `${VIDEO_PATH}/run`)).toBe(true),
    );
    const call = post.mock.calls.find(([path]) => path === `${VIDEO_PATH}/run`);
    expect(call?.[1]).toEqual({ sequence: "SceneDetector" });
});

it("states a refused sequence start in that section instead of a toast", async () => {
    const transport = populatedTransport();
    vi.spyOn(transport, "post").mockRejectedValue(new Error("Another sequence is running."));
    renderVideo(transport);

    fireEvent.click(await screen.findByRole("button", { name: "Start Scene Detector" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Another sequence is running.");
});

it("resets one sequence's data through its dialog", async () => {
    const transport = populatedTransport();
    renderVideo(
        transport,
        withState({
            sequences: [
                {
                    id: "SceneDetector",
                    name: "Scene Detector",
                    status: "complete",
                    runnable: true,
                    detail: "4 scenes",
                    progress: null,
                },
            ],
        }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Reset Scene Detector data" }));
    const dialog = dialogFor("Reset Scene Detector data?");
    expect(dialog.open).toBe(true);

    const post = vi.spyOn(transport, "post").mockResolvedValueOnce(undefined as never);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete data" }));

    await waitFor(() =>
        expect(post).toHaveBeenCalledWith(
            `${VIDEO_PATH}/sequences/SceneDetector/reset`,
            {},
            expect.anything(),
        ),
    );
    await waitFor(() => expect(dialog.open).toBe(false));
});

it("keeps the sequence-data dialog open and names the failure", async () => {
    const transport = populatedTransport();
    renderVideo(
        transport,
        withState({
            sequences: [
                {
                    id: "SceneDetector",
                    name: "Scene Detector",
                    status: "complete",
                    runnable: true,
                    detail: "4 scenes",
                    progress: null,
                },
            ],
        }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Reset Scene Detector data" }));
    const dialog = dialogFor("Reset Scene Detector data?");
    vi.spyOn(transport, "post").mockRejectedValue(
        new Error("The sequence data is locked by a running encode."),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete data" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("The sequence data is locked by a running encode.");
    expect(dialog.open).toBe(true);
});

it("removes every override through the confirmation dialog", async () => {
    const transport = populatedTransport();
    transport.videoOverrideFields.set("demo-project/demo-video", {
        "sequences.scene_detector.model": "TransNetV2",
    });
    renderVideo(transport);

    fireEvent.click(await screen.findByRole("button", { name: "Reset all overrides" }));
    const dialog = dialogFor("Reset all overrides?");
    const remove = vi.spyOn(transport, "delete");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset overrides" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(`${VIDEO_PATH}/overrides`));
    await waitFor(() => expect(dialog.open).toBe(false));
});

it("reports a failed override reset inside the confirmation dialog", async () => {
    const transport = populatedTransport();
    transport.videoOverrideFields.set("demo-project/demo-video", {
        "sequences.scene_detector.model": "TransNetV2",
    });
    renderVideo(transport);

    fireEvent.click(await screen.findByRole("button", { name: "Reset all overrides" }));
    const dialog = dialogFor("Reset all overrides?");
    vi.spyOn(transport, "delete").mockRejectedValue(new Error("The project is read-only."));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset overrides" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("The project is read-only.");
    expect(dialog.open).toBe(true);
});

it("resets one section's overrides with a single sparse write", async () => {
    const transport = populatedTransport();
    transport.videoOverrideFields.set("demo-project/demo-video", {
        "sequences.scene_detector": { model: "TransNetV2" },
    });
    renderVideo(transport);

    const write = vi.spyOn(transport, "putJson");
    fireEvent.click(await screen.findByRole("button", { name: "Reset config" }));

    await waitFor(() =>
        expect(write).toHaveBeenCalledWith(
            `${VIDEO_PATH}/overrides`,
            { fields: {} },
            expect.anything(),
        ),
    );
    expect(transport.videoOverrideFields.get("demo-project/demo-video")).toEqual({});
});

it("shows a missing video's error and retries that read", async () => {
    const transport = populatedTransport();
    const read = transport.get.bind(transport);
    const get = vi
        .spyOn(transport, "get")
        .mockImplementation((path, schema) =>
            path === VIDEO_PATH
                ? Promise.reject(new Error("The video was removed from the queue."))
                : read(path, schema),
        );
    renderVideo(transport);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The video was removed from the queue.");
    const calls = () => get.mock.calls.filter(([path]) => path === VIDEO_PATH).length;
    const before = calls();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(calls()).toBeGreaterThan(before));
});
