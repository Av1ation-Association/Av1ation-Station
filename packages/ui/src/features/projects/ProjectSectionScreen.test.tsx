// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";

import { renderRoute } from "../../test/render";
import { ROUTE_PROJECT, populatedTransport } from "../../test/route-fixtures";
import { ProjectSectionScreen } from "./ProjectSectionScreen";

afterEach(() => {
    vi.restoreAllMocks();
});

it("shows the load error and retries the failed project reads", async () => {
    const transport = new MockTransport();
    const read = transport.get.bind(transport);
    const get = vi.spyOn(transport, "get").mockImplementation((path, schema) => {
        if (path === "/api/projects/project-1" || path === "/api/projects/project-1/config") {
            return Promise.reject(new Error("The review service refused this read."));
        }
        return read(path, schema);
    });
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false },
        },
    });
    renderRoute(<ProjectSectionScreen />, {
        route: "/projects/$projectId/config/$section",
        initialEntry: "/projects/project-1/config/scene-detection",
        transport,
        queryClient,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Scene detection" })).toBeTruthy();
    const panel = await screen.findByRole("alert");
    expect(
        within(panel).getByRole("heading", {
            name: "This section could not be loaded",
        }),
    ).toBeTruthy();
    expect(within(panel).getByText(/configuration or the engine schema/u)).toBeTruthy();

    const configCalls = () =>
        get.mock.calls.filter(([path]) => path === "/api/projects/project-1/config").length;
    const before = configCalls();
    fireEvent.click(within(panel).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(configCalls()).toBeGreaterThan(before));
});

it("saves a changed detector and restores the saved value on discard", async () => {
    const transport = populatedTransport();
    const { topBar } = renderRoute(<ProjectSectionScreen />, {
        route: "/projects/$projectId/config/$section",
        initialEntry: "/projects/demo-project/config/scene-detection",
        transport,
        topBar: true,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Scene detection" })).toBeTruthy();
    if (topBar === null) throw new Error("the screen must mount its draft actions");

    fireEvent.click(await screen.findByRole("radio", { name: "TransNetV2" }));
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
    const save = within(topBar).getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(true));
    const sequences = transport.projectConfigs.get(ROUTE_PROJECT.id)?.sequences as
        Record<string, unknown> | undefined;
    const detector = sequences?.scene_detector as { method?: Record<string, unknown> } | undefined;
    expect(Object.keys(detector?.method ?? {})).toEqual(["TransNetV2"]);

    const minimum = (await screen.findByLabelText(
        "Minimum scene length in frames",
    )) as HTMLInputElement;
    expect(minimum.value).toBe("24");
    fireEvent.change(minimum, { target: { value: "12" } });
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(within(topBar).getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(minimum.value).toBe("24"));
    expect(within(topBar).queryByText("Unsaved changes")).toBeNull();
});

it("guards every inheriting video's chunks when the project encoder changes", async () => {
    const transport = populatedTransport();
    transport.projectConfigs.set("demo-project", {
        encoder: {
            SVTAV1: {
                executable: null,
                pass: { All: 1 },
                options: {},
                photon_noise: null,
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        sequences: {
            parallel_encoder: { workers: null, scenes_directory: "scenes", input: null },
        },
    });
    const post = transport.post.bind(transport);
    vi.spyOn(transport, "post").mockImplementation((path, body, schema) => {
        if (String(path) === "/api/projects/demo-project/config/impact") {
            return Promise.resolve(
                schema.parse({
                    reason: "encoder",
                    videos: 2,
                    scenes: [
                        { index: 0, chunk_bytes: 1_024 },
                        { index: 1, chunk_bytes: 2_048 },
                    ],
                }),
            );
        }
        return post(path, body, schema);
    });
    const write = vi.spyOn(transport, "putJson");
    const { topBar } = renderRoute(<ProjectSectionScreen />, {
        route: "/projects/$projectId/config/$section",
        initialEntry: "/projects/demo-project/config/encoding",
        transport,
        topBar: true,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Encoding" })).toBeTruthy();
    if (topBar === null) throw new Error("the screen must mount its draft actions");

    fireEvent.change(await screen.findByRole("combobox", { name: "Encoder" }), {
        target: { value: "base:FFmpeg" },
    });
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    const guard = await screen.findByRole("dialog", {
        name: "2 encoded scenes across 2 videos use the old encoder",
    });
    expect(within(guard).getByText("Keep the 2 existing chunks")).toBeTruthy();
    fireEvent.click(within(guard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) =>
            String(path).startsWith("/api/projects/demo-project/config"),
        );
        expect(String(call?.[0])).toBe("/api/projects/demo-project/config?clear_chunks=true");
        expect((call?.[1] as { encoder: Record<string, unknown> }).encoder).toHaveProperty(
            "FFmpeg",
        );
    });
});
