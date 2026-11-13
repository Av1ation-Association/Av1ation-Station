// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { MockTransport } from "@av1ation/api";

import { renderRoute } from "../../test/render";
import { HomeScreen } from "./HomeScreen";

afterEach(cleanup);

function project(
    id: string,
    name: string,
    path: string,
    accessed: string,
): Record<string, unknown> {
    return {
        id,
        name,
        path,
        accessed_at: accessed,
        created_at: "2026-01-01T00:00:00Z",
        size_bytes: 1_048_576,
        video_count: 2,
        completed_videos: 1,
    };
}

function renderHome(transport: MockTransport) {
    renderRoute(<HomeScreen />, {
        route: "/",
        initialEntry: "/",
        stubs: ["/projects/$projectId", "/settings"],
        transport,
    });
}

function seededTransport() {
    const transport = new MockTransport();
    transport.routes.set("/api/projects", [
        project("alpha", "Aurora Documentary", "C:\\Media\\aurora", "2026-11-10T10:00:00Z"),
        project("beta", "Boreal Short", "D:\\Work\\boreal", "2026-11-12T10:00:00Z"),
    ]);
    return transport;
}

it("orders by last access, narrows by name or path, and clears the empty search", async () => {
    renderHome(seededTransport());

    const boreal = await screen.findByRole("link", { name: "Boreal Short" });
    const aurora = screen.getByRole("link", { name: "Aurora Documentary" });
    expect(boreal.compareDocumentPosition(aurora) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const search = screen.getByLabelText("Search projects by name or path");
    fireEvent.change(search, { target: { value: "aurora" } });
    expect(screen.getByRole("link", { name: "Aurora Documentary" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Boreal Short" })).toBeNull();

    fireEvent.change(search, { target: { value: "D:\\Work" } });
    expect(screen.getByRole("link", { name: "Boreal Short" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Aurora Documentary" })).toBeNull();

    fireEvent.change(search, { target: { value: "nothing" } });
    expect(screen.getByText("No projects match “nothing”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("link", { name: "Aurora Documentary" })).toBeTruthy();
});

it("creates a project and closes the form after the transport accepts it", async () => {
    renderHome(seededTransport());
    await screen.findByRole("link", { name: "Aurora Documentary" });

    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("Project name"), {
        target: { value: "  Night Sky  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("link", { name: "Night Sky" })).toBeTruthy();
    expect(screen.queryByLabelText("Project name")).toBeNull();
});

it("renames a project from its own row and keeps Escape as a cancel", async () => {
    renderHome(seededTransport());
    await screen.findByRole("link", { name: "Aurora Documentary" });

    fireEvent.click(screen.getByRole("button", { name: "Rename Aurora Documentary" }));
    const field = screen.getByLabelText("Project name");
    fireEvent.change(field, { target: { value: "Northern Lights" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByRole("link", { name: "Aurora Documentary" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rename Aurora Documentary" }));
    const next = screen.getByLabelText("Project name");
    fireEvent.change(next, { target: { value: "Northern Lights" } });
    fireEvent.keyDown(next, { key: "Enter" });
    expect(await screen.findByRole("link", { name: "Northern Lights" })).toBeTruthy();
});

it("deletes only after the confirmation dialog and explains retained chunks", async () => {
    renderHome(seededTransport());
    await screen.findByRole("link", { name: "Aurora Documentary" });

    fireEvent.click(screen.getByRole("button", { name: "Delete Aurora Documentary" }));
    expect(
        await screen.findByRole("heading", { name: "Delete “Aurora Documentary”?" }),
    ).toBeTruthy();
    expect(screen.getByText(/1 MB of retained chunks/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() =>
        expect(screen.queryByRole("link", { name: "Aurora Documentary" })).toBeNull(),
    );
    expect(screen.getByRole("link", { name: "Boreal Short" })).toBeTruthy();
});
