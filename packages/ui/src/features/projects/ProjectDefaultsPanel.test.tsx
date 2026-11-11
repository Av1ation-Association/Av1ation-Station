// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ApiProvider, MockTransport } from "@av1ation/api";
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";

import { ProjectDefaultsSectionScreen } from "./ProjectDefaultsSectionScreen";

/** Direct-route tests mount no shell; the router still requires static data. */
const TEST_ROUTE_STATIC_DATA = { trail: "home", params: [], back: () => null } as const;

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

/**
 * The template's General section is a route, and it is the same editor a project uses. The
 * test mounts the real screen rather than a panel so the section's own draft and reset paths
 * are exercised, not a second copy that could drift.
 */
function renderSection() {
    const rootRoute = createRootRoute({ staticData: TEST_ROUTE_STATIC_DATA });
    const sectionRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/settings/templates/$templateId/$section",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => <ProjectDefaultsSectionScreen />,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([sectionRoute]),
        history: createMemoryHistory({
            initialEntries: ["/settings/templates/default/general"],
        }),
    });
    render(
        <ApiProvider transport={new MockTransport()}>
            <RouterProvider router={router} />
        </ApiProvider>,
    );
}

it("gives the General template draft the active undo history", async () => {
    renderSection();

    const ffms2 = await screen.findByRole("radio", { name: /^FFMS2/u });
    expect(ffms2.getAttribute("aria-checked")).toBe("true");
    const kinds = screen.getAllByRole("radio", { name: /VapourSynth/u });
    fireEvent.click(kinds[0]!);
    await waitFor(() => expect(ffms2.getAttribute("aria-checked")).toBe("false"));

    // The template mounts a configuration draft too, but General is the active document.
    // Undo must move General back rather than being consumed by the inactive section history.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(ffms2.getAttribute("aria-checked")).toBe("true"));
});

it("offers the same decoders and script input a project General page does", async () => {
    renderSection();

    expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeTruthy();
    // The template edits the one General document, so its input kinds are the same three
    // radios a project shows rather than a two-item list of its own.
    await screen.findByRole("radio", { name: /^FFMS2/u });
    // The engine-seeded conversion is a real, editable filter row. The pixel format is only
    // ever set there; Output itself has no second, format-shaped control to disagree with it.
    expect(screen.getByText("Output format · 10-bit")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change…" })).toBeNull();
    const kinds = screen.getAllByRole("radio", { name: /VapourSynth/u });
    expect(kinds).toHaveLength(2);

    fireEvent.click(kinds[0]!);
    const decoders = screen.getByRole("radiogroup", { name: "Source plugin" });
    expect(decoders).toBeTruthy();
    expect(screen.getByRole("radio", { name: /BestSource/u })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /DGDecNV/u })).toBeTruthy();

    // The script kind is a first-class choice in the template too; it offers the file picker
    // and the shared page, not a second, smaller editor embedded in the form.
    fireEvent.click(kinds[1]!);
    expect(screen.getByRole("radiogroup", { name: "Script source" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Locate a .vpy script file/u })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Edit a custom VapourSynth script/u }));
    // The template is seeded as soon as text is chosen; the service refuses an empty custom
    // script, and the page that writes it cannot be reached until the kind is saved.
    expect(await screen.findByText(/\d+ lines/u)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Open editor" })).toBeTruthy();
    expect(screen.queryByLabelText("Custom VapourSynth script")).toBeNull();
});
