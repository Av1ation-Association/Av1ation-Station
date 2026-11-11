// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";

import { ApiProvider, MockTransport } from "@av1ation/api";

import { ProjectSectionScreen } from "./ProjectSectionScreen";

/** Direct-route tests mount no shell; the router still requires static data. */
const TEST_ROUTE_STATIC_DATA = { trail: "home", params: [], back: () => null } as const;

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

it("shows the load error and retries the failed project reads", async () => {
    const transport = new MockTransport();
    const read = transport.get.bind(transport);
    const get = vi.spyOn(transport, "get").mockImplementation((path, schema) => {
        if (path === "/api/projects/project-1" || path === "/api/projects/project-1/config") {
            return Promise.reject(new Error("The review service refused this read."));
        }
        return read(path, schema);
    });
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false },
        },
    });
    const rootRoute = createRootRoute({ staticData: TEST_ROUTE_STATIC_DATA });
    const sectionRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/projects/$projectId/config/$section",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => <ProjectSectionScreen />,
    });
    render(
        <ApiProvider transport={transport} queryClient={queryClient}>
            <RouterProvider
                router={createRouter({
                    routeTree: rootRoute.addChildren([sectionRoute]),
                    history: createMemoryHistory({
                        initialEntries: ["/projects/project-1/config/scene-detection"],
                    }),
                })}
            />
        </ApiProvider>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Scene detection" })).toBeTruthy();
    const panel = await screen.findByRole("alert");
    expect(
        within(panel).getByRole("heading", {
            name: "This section could not be loaded",
        }),
    ).toBeTruthy();
    expect(within(panel).getByText(/configuration or the engine schema/u)).toBeTruthy();

    const configCalls = () =>
        get.mock.calls.filter(([path]) => path === "/api/projects/project-1/config").length;
    const before = configCalls();
    fireEvent.click(within(panel).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(configCalls()).toBeGreaterThan(before));
});
