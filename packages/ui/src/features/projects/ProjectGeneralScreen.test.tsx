// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { renderRoute } from "../../test/render";
import { populatedTransport } from "../../test/route-fixtures";
import { ProjectGeneralScreen } from "./ProjectGeneralScreen";

afterEach(() => {
    vi.restoreAllMocks();
});

const PROJECT_PATH = "/api/projects/demo-project";

function renderGeneral(transport: ReturnType<typeof populatedTransport>) {
    return renderRoute(<ProjectGeneralScreen />, {
        route: "/projects/$projectId/config/general",
        initialEntry: "/projects/demo-project/config/general",
        transport,
        topBar: true,
        stubs: [
            "/projects/$projectId",
            "/projects/$projectId/config/$section",
            "/projects/$projectId/config/script",
        ],
    });
}

it("saves edited output defaults through the project General mutation", async () => {
    const transport = populatedTransport();
    const putJson = vi.spyOn(transport, "putJson");
    const { topBar } = renderGeneral(transport);

    await screen.findByRole("heading", { level: 1, name: "General" });
    fireEvent.click(await screen.findByRole("radio", { name: /Specific folder/u }));
    const folder = (await screen.findByLabelText("Output folder")) as HTMLInputElement;
    fireEvent.change(folder, { target: { value: "D:/Media/AV1" } });

    if (topBar === null) throw new Error("the screen must mount its draft actions");
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(putJson).toHaveBeenCalled());
    const call = putJson.mock.calls.find(([path]) => path === `${PROJECT_PATH}/general`);
    expect(call?.[1]).toMatchObject({
        input_kind: "ffms2",
        output_mode: "folder",
        output_folder: "D:/Media/AV1",
    });
    await waitFor(() => expect(within(topBar).queryByText("Unsaved changes")).toBeNull());
    expect(transport.general.get("demo-project")?.output_folder).toBe("D:/Media/AV1");
});

it("refuses a folder-mode save with no folder and keeps the draft dirty", async () => {
    const transport = populatedTransport();
    const putJson = vi.spyOn(transport, "putJson");
    const error = vi.spyOn(toast, "error");
    const { topBar } = renderGeneral(transport);

    fireEvent.click(await screen.findByRole("radio", { name: /Specific folder/u }));
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() =>
        expect(error).toHaveBeenCalledWith("Specific-folder output needs a folder path."),
    );
    expect(putJson).not.toHaveBeenCalled();
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
});

it("shows a rejected General save beside the editor and leaves the draft in place", async () => {
    const transport = populatedTransport();
    vi.spyOn(transport, "putJson").mockRejectedValue(new Error("The service refused the write."));
    const { topBar } = renderGeneral(transport);

    fireEvent.click(await screen.findByRole("radio", { name: /Specific folder/u }));
    const folder = (await screen.findByLabelText("Output folder")) as HTMLInputElement;
    fireEvent.change(folder, { target: { value: "D:/Media/AV1" } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
        "The General document could not be saved: The service refused the write.",
    );
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
});

it("shows the project load error and retries that read", async () => {
    const transport = populatedTransport();
    const read = transport.get.bind(transport);
    const get = vi
        .spyOn(transport, "get")
        .mockImplementation((path, schema) =>
            path === PROJECT_PATH
                ? Promise.reject(new Error("The project could not be read."))
                : read(path, schema),
        );
    renderGeneral(transport);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("This project could not be loaded")).toBeTruthy();
    const calls = () => get.mock.calls.filter(([path]) => path === PROJECT_PATH).length;
    const before = calls();

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(calls()).toBeGreaterThan(before));
});
