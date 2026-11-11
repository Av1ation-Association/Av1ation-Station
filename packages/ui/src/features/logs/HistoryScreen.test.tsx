// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { ApiProvider, MockTransport } from "@av1ation/api";
import type { TimelineRecord } from "@av1ation/contracts";
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";

import { HistoryScreen } from "./HistoryScreen";

/** Direct-route tests mount no shell; the router still requires static data. */
const TEST_ROUTE_STATIC_DATA = { trail: "home", params: [], back: () => null } as const;

const HISTORY = "/api/projects/demo/videos/demo-video/history";

const ENTRIES: TimelineRecord[] = [
    {
        run_id: "unrecognized-run",
        sequence: "SceneDetector",
        started_at: "2026-10-30T14:22:31Z",
        ended_at: "2026-10-30T14:23:00Z",
        outcome: "completed",
        frames_processed: 1_000,
        frames_total: 1_000,
        fps: 3.33,
        message: null,
    },
    {
        run_id: "unrecognized-run",
        sequence: null,
        started_at: "2026-10-30T14:22:31Z",
        ended_at: "2026-10-30T14:24:02Z",
        outcome: "unknown",
        frames_processed: null,
        frames_total: null,
        fps: null,
        message: "The runner stopped for a reason this build does not name.",
    },
];

/** The demo has no timeline; this run's terminal record names an outcome History cannot. */
class HistoryTransport extends MockTransport {
    override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        if (path === HISTORY) {
            return schema.parse({ entries: ENTRIES });
        }
        return super.get(path, schema);
    }
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

function renderHistory() {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const rootRoute = createRootRoute({ staticData: TEST_ROUTE_STATIC_DATA });
    const historyRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/projects/$projectId/videos/$videoId/history",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => <HistoryScreen />,
    });
    const videoRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/projects/$projectId/videos/$videoId",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => null,
    });
    const scenesRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/projects/$projectId/videos/$videoId/scenes",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => null,
    });
    const logsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/projects/$projectId/videos/$videoId/logs",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => null,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([historyRoute, videoRoute, scenesRoute, logsRoute]),
        history: createMemoryHistory({
            initialEntries: ["/projects/demo/videos/demo-video/history"],
        }),
    });
    render(
        <ApiProvider transport={new HistoryTransport()}>
            <RouterProvider router={router} />
        </ApiProvider>,
    );
}

it("shows Unknown for a terminal outcome the UI does not recognize", async () => {
    renderHistory();

    const chip = await screen.findByText("Unknown");
    expect(chip.className).toContain("text-ink-secondary");
    expect(screen.getByText("unrecognized-run")).toBeTruthy();
});
