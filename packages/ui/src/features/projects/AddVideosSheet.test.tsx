// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import type { GeneralDefaults } from "@av1ation/contracts";

import { renderWithApi } from "../../test/render";
import { AddVideosSheet } from "./AddVideosSheet";

afterEach(cleanup);

const GENERAL = {
    output_mode: "source",
} as unknown as GeneralDefaults;

function sheet(transport: MockTransport, initialPaths: string[]) {
    const onAdded = vi.fn();
    const onClose = vi.fn();
    renderWithApi(
        <AddVideosSheet
            projectId="demo-project"
            general={GENERAL}
            open
            initialPaths={initialPaths}
            onClose={onClose}
            onAdded={onAdded}
        />,
        { transport },
    );
    return { onAdded, onClose };
}

it("shows one row per picked file, derives outputs, and adds the batch", async () => {
    const transport = new MockTransport();
    const { onAdded, onClose } = sheet(transport, [
        "C:\\Media\\aurora.mkv",
        "D:\\Media\\boreal.mkv",
    ]);

    expect(await screen.findByRole("region", { name: "Video 1" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Video 2" })).toBeTruthy();
    expect(screen.getAllByText("C:\\Media\\aurora.av1.mkv").length).toBeGreaterThan(0);
    expect(screen.getAllByText("D:\\Media\\boreal.av1.mkv").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Add 2 videos" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(2));
    expect(onClose).toHaveBeenCalledOnce();
});

it("removes a row and never submits while every row is empty", async () => {
    const transport = new MockTransport();
    sheet(transport, ["C:\\Media\\aurora.mkv", "D:\\Media\\boreal.mkv"]);

    await screen.findByRole("region", { name: "Video 2" });
    fireEvent.click(screen.getByRole("button", { name: "Remove boreal.mkv" }));
    expect(screen.queryByRole("region", { name: "Video 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add 1 video" })).toBeTruthy();

    fireEvent.change(
        within(screen.getByRole("region", { name: "Video 1" })).getByLabelText("Input file"),
        {
            target: { value: "" },
        },
    );
    expect(
        (screen.getByRole("button", { name: "Add 0 videos" }) as HTMLButtonElement).disabled,
    ).toBe(true);
});

it("keeps failed rows on screen with the service reason after a partial batch", async () => {
    const transport = new MockTransport();
    const post = vi.spyOn(transport, "post");
    post.mockRejectedValueOnce(new Error("The source file is missing."));
    const { onAdded, onClose } = sheet(transport, [
        "C:\\Media\\missing.mkv",
        "D:\\Media\\boreal.mkv",
    ]);

    await screen.findByRole("region", { name: "Video 2" });
    fireEvent.click(screen.getByRole("button", { name: "Add 2 videos" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("missing.mkv");
    expect(alert.textContent).toContain("The source file is missing.");
    expect(onAdded).toHaveBeenCalledWith(1);
    expect(onClose).not.toHaveBeenCalled();
});
