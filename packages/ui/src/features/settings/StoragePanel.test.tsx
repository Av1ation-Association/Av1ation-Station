// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";

import { TopBarTargetContext } from "../../shared/TopBarActions";
import { renderWithApi } from "../../test/render";
import { StoragePanel } from "./settings-panels";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

class RecordingStorageTransport extends MockTransport {
    readonly saved: Array<Record<string, unknown>> = [];

    override async patchJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path === "/api/settings") {
            this.saved.push(body as Record<string, unknown>);
        }
        return super.patchJson(path, body, schema);
    }
}

it("saves only the storage fields that changed", async () => {
    const transport = new RecordingStorageTransport();
    const target = document.createElement("div");
    document.body.append(target);
    renderWithApi(
        <TopBarTargetContext.Provider value={target}>
            <StoragePanel />
        </TopBarTargetContext.Provider>,
        { transport },
    );

    await screen.findByRole("heading", { name: "Application data" });
    fireEvent.change(screen.getByLabelText("Temporary directory"), {
        target: { value: "D:\\scratch" },
    });

    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save.getAttribute("disabled")).toBeNull());
    fireEvent.click(save);

    await waitFor(() => {
        expect(transport.saved).toEqual([
            {
                temp_dir: "D:\\scratch",
                delete_chunks_on_success: false,
            },
        ]);
    });
});
