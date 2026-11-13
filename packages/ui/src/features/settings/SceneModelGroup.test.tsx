// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { SceneModelGroup } from "./SceneModelGroup";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

it("locates the model once and can return to the engine's own search", async () => {
    const path = "C:/models/transnetv2.onnx";
    renderWithApi(<SceneModelGroup />, {
        transport: new MockTransport({}, { pickModel: async () => path }),
    });

    // Locating is the whole action: the picked path is saved and shown immediately.
    const locate = await screen.findByRole("button", { name: /Locate/ });
    await waitFor(() => expect((locate as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(locate);

    expect(await screen.findByDisplayValue(path)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Use the engine's search/ }));

    await waitFor(() => expect(screen.queryByDisplayValue(path)).toBeNull());
});
