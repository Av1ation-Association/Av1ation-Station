import type { ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";
import { render, type RenderResult } from "@testing-library/react";

import { ApiProvider, type Transport } from "@av1ation/api";

import { ROUTE_META, routeFor, type RoutePath } from "../app/route-meta";
import { TopBarTargetContext } from "../shared/TopBarActions";

/** A test client disables retries so an error state settles without waiting out the app default. */
function testQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false },
        },
    });
}

export interface ApiRenderOptions {
    /** The transport the screen under test would receive from its host. */
    transport: Transport;
    /** Override the client when the test needs to observe retries or a seeded cache. */
    queryClient?: QueryClient | undefined;
}

export type ApiRenderResult = RenderResult & {
    /** Rerender a component under the same provider stack and query client. */
    rerenderWithApi: (ui: ReactNode) => void;
};

/**
 * Mounts a component with the application's data providers but no router.
 *
 * Component tests use this when they need `useTransport` or a query; screen tests should use
 * `renderRoute` so the route's params, search, trail, and link targets are real.
 */
export function renderWithApi(ui: ReactNode, options: ApiRenderOptions): ApiRenderResult {
    const queryClient = options.queryClient ?? testQueryClient();
    const view = render(
        <ApiProvider transport={options.transport} queryClient={queryClient}>
            {ui}
        </ApiProvider>,
    );
    return {
        ...view,
        rerenderWithApi: (next) => {
            view.rerender(
                <ApiProvider transport={options.transport} queryClient={queryClient}>
                    {next}
                </ApiProvider>,
            );
        },
    };
}

export interface RouteRenderOptions extends ApiRenderOptions {
    /** A registered route path, not a URL; the renderer supplies its real static data. */
    route: RoutePath;
    /** The URL the memory history starts at. It must match `route`. */
    initialEntry: string;
    /** Only the sibling paths the screen links to, mounted as empty destinations. */
    stubs?: readonly RoutePath[] | undefined;
    /** Create a detached portal target for screens that render `TopBarActions`. */
    topBar?: boolean | undefined;
}

/**
 * Mounts one screen at a memory-history route without the application shell.
 *
 * The root and target route use the real route metadata, so params, search validation, and
 * link targets behave as they do in the app while the test stays focused on one screen.
 */
export function renderRoute(ui: ReactNode, options: RouteRenderOptions) {
    const rootRoute = createRootRoute({ staticData: ROUTE_META["/"] });
    const targetRoute = createRoute({
        getParentRoute: () => rootRoute,
        ...routeFor(options.route),
        component: () => ui,
    });
    const stubRoutes = (options.stubs ?? []).map((route) =>
        createRoute({
            getParentRoute: () => rootRoute,
            ...routeFor(route),
            component: () => null,
        }),
    );
    const router = createRouter({
        routeTree: rootRoute.addChildren([targetRoute, ...stubRoutes]),
        history: createMemoryHistory({ initialEntries: [options.initialEntry] }),
    });
    const topBar = options.topBar === true ? document.createElement("div") : null;
    if (topBar !== null) {
        document.body.append(topBar);
    }
    const content =
        topBar === null ? (
            <RouterProvider router={router} />
        ) : (
            <TopBarTargetContext.Provider value={topBar}>
                <RouterProvider router={router} />
            </TopBarTargetContext.Provider>
        );

    return {
        ...renderWithApi(content, options),
        router,
        topBar,
    };
}
