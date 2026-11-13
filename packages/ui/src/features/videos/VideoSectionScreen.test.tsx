// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";

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
