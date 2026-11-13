// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { AppSettings } from "@av1ation/contracts";
import { toast } from "sonner";

import { renderRoute } from "../../test/render";
import { populatedTransport } from "../../test/route-fixtures";
import { ProjectTemplateOverview } from "./ProjectTemplateOverview";

afterEach(() => {
    vi.restoreAllMocks();
});

const TEMPLATE_PATH = "/api/settings/templates/default";

/** Add a non-default template so rename does not collide with the set-default route. */
function addTemplate(transport: ReturnType<typeof populatedTransport>): string {
    const settings = transport.routes.get("/api/settings") as AppSettings;
    const id = "cinema-template";
    transport.routes.set("/api/settings", {
        ...settings,
        project_templates: [
            ...settings.project_templates,
            {
                id,
                name: "Starter",
                config: {},
                general: settings.project_templates[0]?.general ?? {
                    input_kind: "ffms2",
                    output_mode: "next_to_input",
                },
            },
        ],
    });
    return id;
}

function renderTemplate(transport: ReturnType<typeof populatedTransport>, templateId = "default") {
    return renderRoute(<ProjectTemplateOverview />, {
        route: "/settings/templates/$templateId",
        initialEntry: `/settings/templates/${templateId}`,
        transport,
        stubs: [
            "/settings",
            "/settings/templates/$templateId/$section",
            "/settings/templates/$templateId/script",
        ],
    });
}

async function renderLoadedTemplate(
    transport: ReturnType<typeof populatedTransport>,
    templateId = "default",
    name = "Default",
) {
    renderTemplate(transport, templateId);
    await screen.findByRole("heading", { level: 1, name });
    await screen.findByRole("heading", { name: "General" });
}

it("resets the whole template through the confirmation dialog", async () => {
    const transport = populatedTransport();
    const post = vi.spyOn(transport, "post");
    const success = vi.spyOn(toast, "success");
    await renderLoadedTemplate(transport);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const dialog = screen
        .getByRole("heading", { name: "Reset the whole template?" })
        .closest("dialog");
    if (dialog === null) throw new Error("the reset confirmation must be a dialog");
    expect(dialog.open).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset everything" }));

    await waitFor(() =>
        expect(post.mock.calls.map(([path]) => path)).toEqual([
            `${TEMPLATE_PATH}/defaults/reset`,
            `${TEMPLATE_PATH}/defaults/reset/general`,
        ]),
    );
    await waitFor(() => expect(dialog.open).toBe(false));
    expect(success).toHaveBeenCalledWith("The template was reset to the engine defaults");
});

it("closes the reset dialog and reports a failed reset", async () => {
    const transport = populatedTransport();
    vi.spyOn(transport, "post").mockRejectedValue(new Error("The reset was refused."));
    const error = vi.spyOn(toast, "error");
    await renderLoadedTemplate(transport);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const dialog = screen
        .getByRole("heading", { name: "Reset the whole template?" })
        .closest("dialog");
    if (dialog === null) throw new Error("the reset confirmation must be a dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset everything" }));

    await waitFor(() =>
        expect(error).toHaveBeenCalledWith(
            "The template could not be reset: The reset was refused.",
        ),
    );
    expect(dialog.open).toBe(false);
});

it("renames the template through its editable heading", async () => {
    const transport = populatedTransport();
    const templateId = addTemplate(transport);
    const putJson = vi.spyOn(transport, "putJson");
    const success = vi.spyOn(toast, "success");
    await renderLoadedTemplate(transport, templateId, "Starter");

    fireEvent.click(screen.getByRole("button", { name: "Rename template" }));
    const input = screen.getByLabelText("template name") as HTMLInputElement;
    expect(input.value).toBe("Starter");
    fireEvent.change(input, { target: { value: "Cinema" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template name" }));

    await waitFor(() => expect(putJson).toHaveBeenCalled());
    const call = putJson.mock.calls.find(
        ([path]) => path === `/api/settings/templates/${templateId}`,
    );
    expect(call?.[1]).toMatchObject({ name: "Cinema" });
    await waitFor(() =>
        expect(screen.getByRole("heading", { level: 1, name: "Cinema" })).toBeTruthy(),
    );
    expect(success).toHaveBeenCalledWith("The template was renamed");
});

it("keeps the rename field open and names a rejected rename", async () => {
    const transport = populatedTransport();
    const templateId = addTemplate(transport);
    vi.spyOn(transport, "putJson").mockRejectedValue(new Error("The name is already taken."));
    const error = vi.spyOn(toast, "error");
    await renderLoadedTemplate(transport, templateId, "Starter");

    fireEvent.click(screen.getByRole("button", { name: "Rename template" }));
    const input = screen.getByLabelText("template name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Cinema" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template name" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("The name is already taken."));
    expect(screen.getByLabelText("template name")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "Cinema" })).toBeNull();
});

it("does not submit a blank template name", async () => {
    const transport = populatedTransport();
    const putJson = vi.spyOn(transport, "putJson");
    await renderLoadedTemplate(transport);

    fireEvent.click(screen.getByRole("button", { name: "Rename template" }));
    const input = screen.getByLabelText("template name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    const save = screen.getByRole("button", { name: "Save template name" });
    expect(save.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel renaming template" }));
    expect(screen.getByRole("heading", { level: 1, name: "Default" })).toBeTruthy();
    expect(putJson).not.toHaveBeenCalled();
});

it("reports a template id that no longer exists", async () => {
    renderTemplate(populatedTransport(), "missing");

    expect(await screen.findByRole("heading", { level: 1, name: "No such template" })).toBeTruthy();
});

it("shows the template load error and retries both reads", async () => {
    const transport = populatedTransport();
    const read = transport.get.bind(transport);
    const get = vi
        .spyOn(transport, "get")
        .mockImplementation((path, schema) =>
            path === `${TEMPLATE_PATH}/defaults`
                ? Promise.reject(new Error("The template defaults could not be read."))
                : read(path, schema),
        );
    renderTemplate(transport);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("The project template did not arrive")).toBeTruthy();
    expect(alert.textContent).toContain("The template defaults could not be read.");
    const calls = () =>
        get.mock.calls.filter(([path]) => path === `${TEMPLATE_PATH}/defaults`).length;
    const before = calls();

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(calls()).toBeGreaterThan(before));
});
