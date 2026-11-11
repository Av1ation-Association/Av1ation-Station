// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeAll, expect, it } from "vitest";

import { ApiProvider, MockTransport } from "@av1ation/api";

import { TopBarTargetContext } from "../../shared/TopBarActions";
import { EncodersPanel } from "./EncodersPanel";

/** Direct-route tests mount no shell; the router still requires static data. */
const TEST_ROUTE_STATIC_DATA = { trail: "home", params: [], back: () => null } as const;

beforeAll(() => {
    // jsdom has no top layer; the sheet's native dialog API is the only gap this test needs.
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
        this.open = false;
    };
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

/** Mount the panel with a real portal target, so the top-bar group is observable. */
function mount(transport: MockTransport = new MockTransport()): HTMLElement {
    const target = document.createElement("div");
    document.body.append(target);
    // The parameter header links to the JSON editor, so the panel needs a router the way
    // the application shell gives it one.
    const rootRoute = createRootRoute({ staticData: TEST_ROUTE_STATIC_DATA });
    const settings = createRoute({
        getParentRoute: () => rootRoute,
        path: "/settings",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => (
            <TopBarTargetContext.Provider value={target}>
                <ApiProvider transport={transport}>
                    <EncodersPanel />
                </ApiProvider>
            </TopBarTargetContext.Provider>
        ),
    });
    const json = createRoute({
        getParentRoute: () => rootRoute,
        path: "/settings/encoders/$encoderId/json",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => <div>JSON editor</div>,
    });
    render(
        <RouterProvider
            router={createRouter({
                routeTree: rootRoute.addChildren([settings, json]),
                history: createMemoryHistory({ initialEntries: ["/settings"] }),
            })}
        />,
    );
    return target;
}

it("replaces one encoder's pane instead of appending a second one", async () => {
    const topBar = mount();

    await screen.findByRole("heading", { name: "Parameters" });
    expect(screen.getByText("Constant Rate Factor")).toBeTruthy();
    expect(within(topBar).getAllByText("Save")).toHaveLength(1);

    screen.getByRole("button", { name: /Scalable Video Technology/ }).click();

    await screen.findByRole("heading", { name: "Scalable Video Technology for AV1" });
    // The old parameter table and its portalled draft group must be gone, not stacked.
    expect(screen.getAllByRole("heading", { name: "Parameters" })).toHaveLength(1);
    expect(screen.queryByText("Constant Rate Factor")).toBeNull();
    expect(screen.getByText("This encoder has no descriptors yet.")).toBeTruthy();
    expect(within(topBar).getAllByText("Save")).toHaveLength(1);
});

it("edits from the parameter label and removes from the icon action", async () => {
    mount();

    await screen.findByRole("heading", { name: "Parameters" });
    // The label is the edit affordance; there is no separate Edit button.
    screen.getByRole("button", { name: /Constant Rate Factor.*Edit/u }).click();

    const sheet = await screen.findByRole("dialog", { name: "Edit parameter" });
    expect(within(sheet).getByDisplayValue("Constant Rate Factor")).toBeTruthy();
    within(sheet).getByRole("button", { name: "Cancel" }).click();
    await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Edit parameter" })).toBeNull(),
    );

    screen.getByRole("button", { name: "Remove --crf" }).click();
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: /Constant Rate Factor.*Edit/u })).toBeNull(),
    );
});

it("shows the provider in use as the field's placeholder and reverts from there", async () => {
    const picked = "C:/Tools/Encoders/x265.exe";
    mount(new MockTransport({}, { pickExecutable: async () => picked }));

    await screen.findByRole("heading", { name: "Parameters" });
    const field = screen.getByRole("textbox", {
        name: "x265 executable",
    }) as HTMLInputElement;
    // The field is only for pointing at another build; what is in use is the placeholder.
    expect(field.value).toBe("");
    expect(field.placeholder).toBe("Resolved on PATH");
    expect(screen.queryByRole("button", { name: "Probe and use" })).toBeNull();

    screen.getByRole("button", { name: /Locate/ }).click();
    await waitFor(() => expect(field.placeholder).toBe(picked));
    expect(field.value).toBe("");

    // The revert sits beside the field it undoes, so a saved override is discoverable.
    (await screen.findByRole("button", { name: "Use the build on PATH" })).click();
    await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Use the build on PATH" })).toBeNull(),
    );
    expect(field.placeholder).toBe("Resolved on PATH");
});

it("groups the parameter table by the encoder's own group names", async () => {
    mount();

    await screen.findByRole("heading", { name: "Parameters" });
    // The mock's CRF descriptor names no group, so it lands under the one fallback heading
    // instead of the group being repeated in every row's metadata.
    expect(screen.getByRole("heading", { name: /Ungrouped/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Constant Rate Factor.*Edit/u })).toBeTruthy();
});

it("fills the build executable and probes it when Locate returns", async () => {
    const picked = "C:/Tools/Encoders/SvtAv1EncApp.exe";
    mount(new MockTransport({}, { pickExecutable: async () => picked }));

    await screen.findByRole("heading", { name: "Parameters" });
    screen.getByRole("button", { name: "Add build" }).click();
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), {
        target: { value: "Studio build" },
    });

    const sheet = screen.getByRole("dialog", { name: "Add a build" });
    within(sheet)
        .getByRole("button", { name: /Locate/ })
        .click();

    const executable = within(sheet).getByRole("textbox", {
        name: "Executable",
    }) as HTMLInputElement;
    await waitFor(() => expect(executable.value).toBe(picked));
    // Locating probes immediately; there is no second click to identify the build.
    await within(sheet).findByText(/parameters parsed/u);
});
