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

/**
 * Selects scenes 0 and 1, opens the sheet, and clicks Save so the chunk guard appears.
 *
 * Both demo scenes are encoded, which is the state the guard exists for.
 */
async function openChunkGuard() {
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
    // The guard only guards a change: saving the current encoder invalidates nothing.
    fireEvent.change(await within(sheet).findByRole("combobox", { name: "Encoder" }), {
        target: { value: "base:FFmpeg" },
    });
    const save = within(sheet).getByRole("button", { name: "Save for scenes" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    const guard = await screen.findByRole("dialog", {
        name: "2 encoded scenes use the old encoder",
    });
    return { guard, sheet, write };
}

it("deletes the selected scenes' chunks when the guard is saved with its default", async () => {
    const { guard, write } = await openChunkGuard();

    const keep = within(guard).getByRole("checkbox", { name: "Keep the 2 existing chunks" });
    expect((keep as HTMLInputElement).checked).toBe(false);

    fireEvent.click(within(guard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/scenes/encoder"));
        expect(call?.[1]).toMatchObject({ scenes: [0, 1], clear_chunks: true });
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Scene encoder" })).toBeNull());
});

it("keeps the chunks when the guard checkbox is checked", async () => {
    const { guard, write } = await openChunkGuard();

    fireEvent.click(within(guard).getByRole("checkbox", { name: "Keep the 2 existing chunks" }));
    fireEvent.click(within(guard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/scenes/encoder"));
        expect(call?.[1]).toMatchObject({ scenes: [0, 1], clear_chunks: false });
    });
});

it("guards only the selected scenes whose encoder the draft changes", async () => {
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
    for (let index = 0; index < 4; index += 1) {
        fireEvent.keyDown(rail, { key: "ArrowDown" });
    }
    // Scene 4 carries its own encoder; scene 3 inherits the video's.
    fireEvent.keyDown(rail, { key: "ArrowDown", shiftKey: true });

    expect(await screen.findByRole("heading", { name: "2 scenes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    const sheet = await screen.findByRole("dialog", { name: "Scene encoder" });
    fireEvent.click(await within(sheet).findByRole("radio", { name: /These 2 scenes/ }));
    expect(await within(sheet).findByText(/saving replaces/)).toBeTruthy();

    const save = within(sheet).getByRole("button", { name: "Save for scenes" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    // Scene 3 already carries the draft (the video's encoder), so only scene 4's chunk is
    // invalidated.
    const guard = await screen.findByRole("dialog", {
        name: "Scene 5 is encoded with the old encoder",
    });
    fireEvent.click(within(guard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
        const call = write.mock.calls.find(([path]) => String(path).endsWith("/scenes/encoder"));
        expect(call?.[1]).toMatchObject({ scenes: [4], clear_chunks: true });
    });
});

it("cancels the chunk guard without writing and leaves the sheet open", async () => {
    const { guard, sheet, write } = await openChunkGuard();

    const info = within(guard).getByRole("button", {
        name: "Why keeping the chunks is not recommended",
    });
    expect(info.getAttribute("data-tip")).toContain("Recommended off");

    fireEvent.click(within(guard).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
        expect(
            screen.queryByRole("dialog", { name: "2 encoded scenes use the old encoder" }),
        ).toBeNull(),
    );
    expect(write.mock.calls.some(([path]) => String(path).endsWith("/scenes/encoder"))).toBe(false);
    expect(screen.getByRole("dialog", { name: "Scene encoder" })).toBe(sheet);
});
