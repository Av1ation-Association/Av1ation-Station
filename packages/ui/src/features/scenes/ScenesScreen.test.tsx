// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { renderRoute } from "../../test/render";
import { populatedTransport } from "../../test/route-fixtures";
import { ScenesScreen } from "./ScenesScreen";

it("selects the first scene from the rail with the keyboard", async () => {
    renderRoute(<ScenesScreen />, {
        route: "/projects/$projectId/videos/$videoId/scenes",
        initialEntry: "/projects/demo-project/videos/demo-video/scenes",
        transport: populatedTransport(),
    });

    const rail = await screen.findByRole("listbox", { name: "Scenes" });
    expect(rail.getAttribute("aria-activedescendant")).toBeNull();

    fireEvent.keyDown(rail, { key: "ArrowDown" });

    await waitFor(() => expect(rail.getAttribute("aria-activedescendant")).toMatch(/-scene-0$/u));
});

it("writes the encoder to both selected scenes from the sheet", async () => {
    const transport = populatedTransport();
    transport.projectConfigs.set("demo-project", {
        encoder: { SVTAV1: { executable: null, options: {} } },
    });
    const write = vi.spyOn(transport, "putJson");
    renderRoute(<ScenesScreen />, {
        route: "/projects/$projectId/videos/$videoId/scenes",
        initialEntry: "/projects/demo-project/videos/demo-video/scenes",
        transport,
    });

    const rail = await screen.findByRole("listbox", { name: "Scenes" });
    fireEvent.keyDown(rail, { key: "ArrowDown" });
    fireEvent.keyDown(rail, { key: "ArrowDown", shiftKey: true });

    expect(await screen.findByRole("heading", { name: "2 scenes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    const sheet = await screen.findByRole("dialog", { name: "Scene encoder" });
    fireEvent.click(await within(sheet).findByRole("radio", { name: /These 2 scenes/ }));
    const save = within(sheet).getByRole("button", { name: "Save for scenes" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/scenes/encoder"));
        expect(call?.[1]).toMatchObject({ scenes: [0, 1] });
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Scene encoder" })).toBeNull());
});
