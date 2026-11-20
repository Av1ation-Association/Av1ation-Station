// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { renderRoute } from "../../test/render";
import { populatedTransport } from "../../test/route-fixtures";
import { VideoSectionScreen } from "./VideoSectionScreen";

it("saves a section override and restores it on discard", async () => {
    const transport = populatedTransport();
    const { topBar } = renderRoute(<VideoSectionScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/$section",
        initialEntry: "/projects/demo-project/videos/demo-video/config/scene-detection",
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
    const fields = transport.videoOverrideFields.get("demo-project/demo-video");
    expect(Object.keys(fields ?? {})).toEqual(["sequences.scene_detector"]);
    expect(await screen.findByRole("button", { name: "Reset configuration" })).toBeTruthy();
    expect(screen.getByText("1 override")).toBeTruthy();

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

it("guards the chunks an encoding save invalidates", async () => {
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
    transport.scenes.set("demo-project/demo-video", {
        video_id: "demo-video",
        total_frames: 48,
        scene_fingerprint: "encoding-guard",
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
    const { topBar } = renderRoute(<VideoSectionScreen />, {
        route: "/projects/$projectId/videos/$videoId/config/$section",
        initialEntry: "/projects/demo-project/videos/demo-video/config/encoding",
        transport,
        topBar: true,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Encoding" })).toBeTruthy();
    if (topBar === null) throw new Error("the screen must mount its draft actions");

    fireEvent.change(await screen.findByRole("combobox", { name: "Encoder" }), {
        target: { value: "base:FFmpeg" },
    });
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    // Scene 2 carries its own encoder, so only scene 1's chunk is invalidated.
    const guard = await screen.findByRole("dialog", {
        name: "Scene 1 is encoded with the old encoder",
    });
    fireEvent.click(within(guard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/overrides"));
        expect(call?.[1]).toMatchObject({ clear_chunks: true });
        expect((call?.[1] as { fields: Record<string, unknown> }).fields.encoder).toHaveProperty(
            "FFmpeg",
        );
    });
});
