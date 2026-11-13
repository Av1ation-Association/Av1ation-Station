// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { MockTransport } from "@av1ation/api";

import { renderRoute } from "../../test/render";
import { ProjectDefaultsSectionScreen } from "./ProjectDefaultsSectionScreen";

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
