// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocsSample } from "./DocsWidgets";

describe("scene details documentation sample", () => {
    it("edits, splits, resets, undoes, and deletes the sample scenes", () => {
        render(<DocsSample kind="scene-details" />);

        fireEvent.click(screen.getByRole("button", { name: "Change" }));
        expect(
            screen.getByText("Encoder editing opens the configuration editor in the app."),
        ).toBeTruthy();

        const end = screen.getByRole("textbox", { name: "End frame" });
        fireEvent.change(end, { target: { value: "32" } });
        end.focus();
        fireEvent.keyDown(end, { key: "Enter" });
        expect(screen.getByText("Changed the selected scene's boundaries.")).toBeTruthy();

        const customValue = screen.getByRole("textbox", { name: "Custom value 1" });
        fireEvent.change(customValue, { target: { value: "close" } });
        fireEvent.blur(customValue);
        expect(screen.getByDisplayValue("close")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Split at the playhead" }));
        expect(screen.getByText("Split at the playhead.")).toBeTruthy();

        fireEvent.click(
            screen.getByRole("button", { name: "Reset chunks so the encoder writes them again" }),
        );
        expect(
            screen.getByText("Reset the selected chunks; the ranges stay."),
        ).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Undo last scene edit" }));
        expect(screen.getByText("Undid the last structural edit.")).toBeTruthy();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Delete this scene; its frames become uncovered",
            }),
        );
        expect(screen.getByText(/Deleted the selected scenes/)).toBeTruthy();
    });

    it("filters the sample log by message and level", () => {
        render(<DocsSample kind="log-filter" />);

        const search = screen.getByLabelText("Search the log");
        fireEvent.change(search, { target: { value: "SVT" } });
        expect(screen.getByText("1 matching line")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Error" }));
        expect(
            screen.getByText("No lines match. Clear the search or enable another level."),
        ).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "All" }));
        expect(screen.getByText("1 matching line")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Error" }));
        fireEvent.click(screen.getByRole("button", { name: "Error" }));
        fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
        expect(screen.getByText("6 lines")).toBeTruthy();
    });

    it("searching the sample projects narrows by name and path, then clears", async () => {
        render(<DocsSample kind="project-search" />);
        await screen.findByRole("link", { name: "Aurora Documentary" });
        const search = screen.getByLabelText("Search projects by name or path");

        fireEvent.change(search, { target: { value: "boreal" } });
        expect(screen.getByRole("link", { name: "Boreal Short" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Aurora Documentary" })).toBeNull();

        fireEvent.change(search, { target: { value: "D:\\Work" } });
        expect(screen.getByRole("link", { name: "Boreal Short" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Aurora Documentary" })).toBeNull();

        fireEvent.change(search, { target: { value: "nothing" } });
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(await screen.findByRole("link", { name: "Aurora Documentary" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Delete Coastal Tests" }));
        await waitFor(() =>
            expect(screen.queryByRole("link", { name: "Coastal Tests" })).toBeNull(),
        );
    });

    it("opens and cancels the sample project form", () => {
        render(<DocsSample kind="new-project" />);

        fireEvent.click(screen.getByRole("button", { name: "New project" }));
        expect(screen.getByLabelText("Project name")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByLabelText("Project name")).toBeNull();
    });

    it("starts and stops the sample run control", () => {
        render(<DocsSample kind="run-control" />);

        fireEvent.click(screen.getByRole("button", { name: "Start" }));
        fireEvent.click(screen.getByRole("button", { name: "Stop" }));
        expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    });

    it("confirms the sample retained-work removal", () => {
        render(<DocsSample kind="retained-removal" />);

        fireEvent.click(screen.getByRole("button", { name: "Delete retained" }));
        expect(screen.getByRole("heading", { name: "Delete retained work?" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Delete chunks" }));
        expect(screen.getByText(/Removed the sample's retained chunks/)).toBeTruthy();
        expect(screen.getByText("No retained work")).toBeTruthy();
    });
});
