// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    Link,
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";
import { useState } from "react";

import {
    UnsavedChangesProvider,
    useDraftDirty,
    useLeaveGuard,
    useUnsavedChanges,
} from "./UnsavedChanges";

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

interface HarnessProps {
    dirty: boolean;
    save?: (() => Promise<boolean>) | undefined;
}

function Harness({ dirty, save }: HarnessProps) {
    const [tab, setTab] = useState("home");
    const leave = useLeaveGuard();
    const registeredDirty = useDraftDirty();
    useUnsavedChanges({
        dirty,
        label: "Test draft",
        changes: dirty ? [{ label: "Output", from: "saved.mkv", to: "draft.mkv" }] : [],
        save,
    });

    return (
        <div>
            <p>Home</p>
            <p>Draft dirty: {String(registeredDirty)}</p>
            <p>Tab: {tab}</p>
            <Link to="/other">Go elsewhere</Link>
            <button type="button" onClick={() => leave(() => setTab("other"))}>
                Switch tab
            </button>
        </div>
    );
}

function renderGuard(props: Partial<HarnessProps> = {}) {
    const rootRoute = createRootRoute({
        component: () => (
            <UnsavedChangesProvider>
                <Outlet />
            </UnsavedChangesProvider>
        ),
    });
    const homeRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => <Harness dirty={props.dirty ?? true} save={props.save} />,
    });
    const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/other",
        component: () => <p>Other destination</p>,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([homeRoute, otherRoute]),
        history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    return router;
}

async function waitForBlocker(router: ReturnType<typeof renderGuard>): Promise<void> {
    // useBlocker registers its history callback in an effect after the guard turns dirty.
    // Wait for that registration instead of racing the first link click with a sleep.
    await waitFor(() => expect(router.history._getBlockers()).toHaveLength(1));
}

function dialog(): HTMLDialogElement {
    const element = document.querySelector("dialog");
    if (element === null) {
        throw new Error("The unsaved-changes dialog was not rendered.");
    }
    return element;
}

describe("UnsavedChangesProvider", () => {
    it("lets a clean draft navigate without a dialog", async () => {
        renderGuard({ dirty: false });
        await screen.findByText("Draft dirty: false");

        fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));

        await screen.findByText("Other destination");
        expect(dialog().open).toBe(false);
    });

    it("blocks a dirty navigation until Stay, then reopens and Discard proceeds", async () => {
        const router = renderGuard();
        await screen.findByText("Draft dirty: true");
        await waitForBlocker(router);

        fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
        const guard = dialog();
        await waitFor(() => expect(guard.open).toBe(true));
        expect(screen.getByText("1 unsaved change")).toBeDefined();
        expect(guard.textContent).toContain("Output");
        expect(guard.textContent).toContain("saved.mkv → draft.mkv");
        expect(
            screen.getByRole("button", { name: "Save and leave" }).hasAttribute("disabled"),
        ).toBe(true);
        expect(screen.getByText("Home")).toBeDefined();

        fireEvent.click(screen.getByRole("button", { name: "Stay and keep editing" }));
        await waitFor(() => expect(guard.open).toBe(false));
        expect(screen.getByText("Home")).toBeDefined();

        fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
        await waitFor(() => expect(guard.open).toBe(true));
        fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

        await screen.findByText("Other destination");
    });

    it("runs a non-router leave request through the same guard", async () => {
        const router = renderGuard();
        await screen.findByText("Draft dirty: true");
        await waitForBlocker(router);

        fireEvent.click(screen.getByRole("button", { name: "Switch tab" }));
        const guard = dialog();
        await waitFor(() => expect(guard.open).toBe(true));
        expect(screen.getByText("Tab: home")).toBeDefined();

        fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

        await screen.findByText("Tab: other");
    });

    it("saves and only then leaves", async () => {
        const save = vi.fn(async () => true);
        const router = renderGuard({ save });
        await screen.findByText("Draft dirty: true");
        await waitForBlocker(router);

        fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
        const guard = dialog();
        await waitFor(() => expect(guard.open).toBe(true));
        fireEvent.click(screen.getByRole("button", { name: "Save and leave" }));

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        await screen.findByText("Other destination");
    });

    it("keeps the draft and reports a save the server rejected", async () => {
        const save = vi.fn(async () => false);
        const router = renderGuard({ save });
        await screen.findByText("Draft dirty: true");
        await waitForBlocker(router);

        fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
        const guard = dialog();
        await waitFor(() => expect(guard.open).toBe(true));
        fireEvent.click(screen.getByRole("button", { name: "Save and leave" }));

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("The draft could not be saved.");
        expect(guard.open).toBe(true);
        expect(screen.getByText("Home")).toBeDefined();
    });
});
