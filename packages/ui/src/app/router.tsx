import {
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
} from "@tanstack/react-router";

import { AppShell } from "./AppShell";
import { NotFoundScreen } from "./NotFoundScreen";
// Include the TanStack static-data augmentation for every host that mounts this tree.
import type {} from "./route-static-data";
import { ROUTE_META, routeFor } from "./route-meta";
import { RouteErrorScreen } from "./RouteErrorScreen";

const rootRoute = createRootRoute({
    component: AppShell,
    notFoundComponent: NotFoundScreen,
    staticData: ROUTE_META["/"],
});

const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/"),
    component: lazyRouteComponent(() => import("../features/projects/HomeScreen"), "HomeScreen"),
});

const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId"),
    component: lazyRouteComponent(
        () => import("../features/projects/ProjectScreen"),
        "ProjectScreen",
    ),
});

const projectGeneralRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/config/general"),
    component: lazyRouteComponent(
        () => import("../features/projects/ProjectGeneralScreen"),
        "ProjectGeneralScreen",
    ),
});

const projectSectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/config/$section"),
    component: lazyRouteComponent(
        () => import("../features/projects/ProjectSectionScreen"),
        "ProjectSectionScreen",
    ),
});

const videoRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId"),
    component: lazyRouteComponent(() => import("../features/videos/VideoScreen"), "VideoScreen"),
});

const videoScenesRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/scenes"),
    component: lazyRouteComponent(() => import("../features/scenes/ScenesScreen"), "ScenesScreen"),
});

const videoGeneralRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/config/general"),
    component: lazyRouteComponent(
        () => import("../features/videos/VideoGeneralScreen"),
        "VideoGeneralScreen",
    ),
});

const videoHistoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/history"),
    component: lazyRouteComponent(() => import("../features/logs/HistoryScreen"), "HistoryScreen"),
});

const videoSectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/config/$section"),
    component: lazyRouteComponent(
        () => import("../features/videos/VideoSectionScreen"),
        "VideoSectionScreen",
    ),
});

/** The run a History card links to, so the viewer opens on that run's log. */
export interface LogsSearch {
    run?: string | undefined;
}

const videoLogsRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/logs"),
    validateSearch: (raw: Record<string, unknown>): LogsSearch => ({
        run: typeof raw.run === "string" ? raw.run : undefined,
    }),
    component: lazyRouteComponent(() => import("../features/logs/LogsScreen"), "LogsScreen"),
});

const videoScriptEditorRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/script"),
    component: lazyRouteComponent(
        () => import("../features/script/VideoScriptEditorScreen"),
        "VideoScriptEditorScreen",
    ),
});

const scriptEditorRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/config/script"),
    component: lazyRouteComponent(
        () => import("../features/script/ScriptEditorScreen"),
        "ScriptEditorScreen",
    ),
});

const templateScriptRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/settings/templates/$templateId/script"),
    component: lazyRouteComponent(
        () => import("../features/script/DefaultsScriptScreen"),
        "DefaultsScriptScreen",
    ),
});

const templateSectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/settings/templates/$templateId/$section"),
    component: lazyRouteComponent(
        () => import("../features/projects/ProjectDefaultsSectionScreen"),
        "ProjectDefaultsSectionScreen",
    ),
});

const templateOverviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/settings/templates/$templateId"),
    component: lazyRouteComponent(
        () => import("../features/projects/ProjectTemplateOverview"),
        "ProjectTemplateOverview",
    ),
});

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/settings"),
    component: lazyRouteComponent(
        () => import("../features/settings/SettingsScreen"),
        "SettingsScreen",
    ),
});

const encoderJsonRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/settings/encoders/$encoderId/json"),
    component: lazyRouteComponent(
        () => import("../features/encoders/EncoderJsonScreen"),
        "EncoderJsonScreen",
    ),
});

const routeTree = rootRoute.addChildren([
    homeRoute,
    projectRoute,
    projectGeneralRoute,
    projectSectionRoute,
    videoRoute,
    videoScenesRoute,
    videoGeneralRoute,
    videoHistoryRoute,
    videoSectionRoute,
    videoLogsRoute,
    videoScriptEditorRoute,
    scriptEditorRoute,
    templateScriptRoute,
    templateOverviewRoute,
    templateSectionRoute,
    settingsRoute,
    encoderJsonRoute,
]);

/**
 * One tree for all three hosts. It is code-based because the same SPA is built by the
 * desktop and web hosts from different roots; a file-based generator would emit three
 * trees for one application and race on a shared output.
 */
export function createAppRouter() {
    return createRouter({
        routeTree,
        defaultPreload: "intent",
        defaultPreloadStaleTime: 0,
        defaultErrorComponent: RouteErrorScreen,
    });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
    interface Register {
        router: AppRouter;
    }
}
