// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";

import { renderRoute } from "../../test/render";
import { ProjectDefaultsSectionScreen } from "./ProjectDefaultsSectionScreen";

afterEach(() => {
    vi.restoreAllMocks();
});

it("saves a template section and restores it on discard", async () => {
    const transport = new MockTransport();
    const { topBar } = renderRoute(<ProjectDefaultsSectionScreen />, {
        route: "/settings/templates/$templateId/$section",
        initialEntry: "/settings/templates/default/scene-detection",
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
    const sequences = transport.templateDefaults.get("default")?.sequences as
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

it("reports a rejected defaults save and keeps the draft", async () => {
    const transport = new MockTransport();
    vi.spyOn(transport, "putJson").mockRejectedValue(new Error("The service refused the write."));
    const error = vi.spyOn(toast, "error");
    const { topBar } = renderRoute(<ProjectDefaultsSectionScreen />, {
        route: "/settings/templates/$templateId/$section",
        initialEntry: "/settings/templates/default/scene-detection",
        transport,
        topBar: true,
    });

    fireEvent.click(await screen.findByRole("radio", { name: "TransNetV2" }));
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("The service refused the write."));
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
});

it("reports a rejected section reset", async () => {
    const transport = new MockTransport();
    vi.spyOn(transport, "post").mockRejectedValue(new Error("The service refused the reset."));
    const error = vi.spyOn(toast, "error");
    renderRoute(<ProjectDefaultsSectionScreen />, {
        route: "/settings/templates/$templateId/$section",
        initialEntry: "/settings/templates/default/scene-detection",
        transport,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Reset Scene detection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset section" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("The service refused the reset."));
});
