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
