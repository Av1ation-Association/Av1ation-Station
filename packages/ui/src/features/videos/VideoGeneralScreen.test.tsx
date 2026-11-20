// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { renderRoute } from "../../test/render";
import { populatedTransport } from "../../test/route-fixtures";
import { VideoGeneralScreen } from "./VideoGeneralScreen";

afterEach(() => {
    vi.restoreAllMocks();
});

it("marks an edited output path unsaved and restores it on discard", async () => {
    const { topBar } = renderRoute(<VideoGeneralScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/general",
        initialEntry: "/projects/demo-project/videos/demo-video/config/general",
        transport: populatedTransport(),
        topBar: true,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeTruthy();
    const output = (await screen.findByLabelText("Output file")) as HTMLInputElement;
    const saved = output.value;
    expect(saved).not.toBe("");
    if (topBar === null) throw new Error("the screen must mount its draft actions");

    fireEvent.change(output, { target: { value: "D:/Media/AV1/revised.mkv" } });
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
    const save = within(topBar).getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(false);

    fireEvent.click(within(topBar).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(output.value).toBe(saved));
    expect(within(topBar).queryByText("Unsaved changes")).toBeNull();
});

it("refuses a save without an output and keeps the draft editable", async () => {
    const { topBar } = renderRoute(<VideoGeneralScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/general",
        initialEntry: "/projects/demo-project/videos/demo-video/config/general",
        transport: populatedTransport(),
        topBar: true,
    });

    const output = (await screen.findByLabelText("Output file")) as HTMLInputElement;
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.change(output, { target: { value: "  " } });
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Choose the exact file this video writes.");
    expect(screen.getByRole("heading", { level: 1, name: "General" })).toBeTruthy();
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
});

it("guards the retained chunks when the source changes", async () => {
    const transport = populatedTransport();
    transport.scenes.set("demo-project/demo-video", {
        video_id: "demo-video",
        total_frames: 48,
        scene_fingerprint: "general-guard",
        scenes: [
            {
                index: 0,
                start_frame: 0,
                end_frame: 24,
                frame_count: 24,
                encoded: true,
                chunk_bytes: 1_024,
                encoder_label: "SVT-AV1",
                encoder_custom: false,
                custom_data: {},
            },
            {
                index: 1,
                start_frame: 24,
                end_frame: 48,
                frame_count: 24,
                encoded: true,
                chunk_bytes: 2_048,
                encoder_label: "x265",
                encoder_custom: true,
                custom_data: {},
            },
        ],
    });
    const write = vi.spyOn(transport, "putJson");
    const { topBar } = renderRoute(<VideoGeneralScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/general",
        initialEntry: "/projects/demo-project/videos/demo-video/config/general",
        transport,
        topBar: true,
    });

    const input = (await screen.findByLabelText("Input path")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "D:/Media/AV1/other.mkv" } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    const guard = await screen.findByRole("dialog", {
        name: "2 encoded scenes were built from the old input",
    });
    fireEvent.click(within(guard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/general"));
        expect(call?.[1]).toMatchObject({ clear_chunks: true });
        expect((call?.[1] as { input: { Video: { path: string } } }).input.Video.path).toBe(
            "D:/Media/AV1/other.mkv",
        );
    });
});

it("guards a pathless encoder input when the source path changes", async () => {
    const transport = populatedTransport();
    transport.projectConfigs.set("demo-project", {
        sequences: {
            parallel_encoder: {
                workers: null,
                scenes_directory: "scenes",
                input: {
                    Video: {
                        path: "",
                        filters: [],
                        import_method: { FFMS2: { cache_path: null, index: null } },
                    },
                },
            },
        },
    });
    transport.scenes.set("demo-project/demo-video", {
        video_id: "demo-video",
        total_frames: 24,
        scene_fingerprint: "general-pathless",
        scenes: [
            {
                index: 0,
                start_frame: 0,
                end_frame: 24,
                frame_count: 24,
                encoded: true,
                chunk_bytes: 1_024,
                encoder_label: "SVT-AV1",
                encoder_custom: false,
                custom_data: {},
            },
        ],
    });
    const write = vi.spyOn(transport, "putJson");
    const { topBar } = renderRoute(<VideoGeneralScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/general",
        initialEntry: "/projects/demo-project/videos/demo-video/config/general",
        transport,
        topBar: true,
    });

    const input = (await screen.findByLabelText("Input path")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "D:/Media/AV1/other.mkv" } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    const guard = await screen.findByRole("dialog", {
        name: "Scene 1 was built from the old input",
    });
    fireEvent.click(within(guard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/general"));
        expect(call?.[1]).toMatchObject({ clear_chunks: true });
    });
});

it("keeps a pathless encoder input's chunks when only the General index changes", async () => {
    const transport = populatedTransport();
    transport.projectConfigs.set("demo-project", {
        sequences: {
            parallel_encoder: {
                workers: null,
                scenes_directory: "scenes",
                input: {
                    Video: {
                        path: "",
                        filters: [],
                        import_method: { FFMS2: { cache_path: null, index: null } },
                    },
                },
            },
        },
    });
    transport.scenes.set("demo-project/demo-video", {
        video_id: "demo-video",
        total_frames: 24,
        scene_fingerprint: "general-index",
        scenes: [
            {
                index: 0,
                start_frame: 0,
                end_frame: 24,
                frame_count: 24,
                encoded: true,
                chunk_bytes: 1_024,
                encoder_label: "SVT-AV1",
                encoder_custom: false,
                custom_data: {},
            },
        ],
    });
    const write = vi.spyOn(transport, "putJson");
    const { topBar } = renderRoute(<VideoGeneralScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/general",
        initialEntry: "/projects/demo-project/videos/demo-video/config/general",
        transport,
        topBar: true,
    });

    const index = (await screen.findByLabelText("FFMS2 index file")) as HTMLInputElement;
    fireEvent.change(index, { target: { value: "D:/Media/AV1/source.ffindex" } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/general"));
        expect(call?.[1]).toMatchObject({ clear_chunks: false });
    });
    expect(screen.queryByRole("dialog", { name: /built from the old input/ })).toBeNull();
});

it("shows a rejected General save and keeps the draft", async () => {
    const transport = populatedTransport();
    vi.spyOn(transport, "putJson").mockRejectedValue(new Error("The service refused the write."));
    const { topBar } = renderRoute(<VideoGeneralScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/general",
        initialEntry: "/projects/demo-project/videos/demo-video/config/general",
        transport,
        topBar: true,
    });

    const output = (await screen.findByLabelText("Output file")) as HTMLInputElement;
    fireEvent.change(output, { target: { value: "D:/Media/AV1/revised.mkv" } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The service refused the write.");
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
});
