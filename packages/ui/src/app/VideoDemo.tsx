import { useEffect, useRef, useState } from "react";

import { ApiProvider, useEncodeEvents, type Transport } from "@av1ation/api";
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
    Outlet,
    RouterProvider,
} from "@tanstack/react-router";

import { DemoModeProvider } from "../shared/demo-mode";
import { ROUTE_META, routeFor } from "./route-meta";

/**
 * The application's video screens without the shell.
 *
 * The public site must show the real Video → Configuration screen, not a second copy of it,
 * but it also must not mount the desktop shell's top bar. This route tree keeps the four
 * video tabs and their navigation while leaving the root as an outlet. It is intentionally
 * not a second application: the route components are the ones the desktop app uses,
 * lazy-loaded on demand.
 *
 * The configuration section editors are deliberately absent. The demo is a screen tour, so
 * only Configuration, Scenes, History, and Logs are routes at all; a stale link cannot take
 * a reader into a fifth screen.
 */
function DemoOutlet() {
    return <Outlet />;
}

const rootRoute = createRootRoute({
    component: DemoOutlet,
    staticData: ROUTE_META["/"],
    notFoundComponent: () => (
        <div className="px-5 py-10 text-[12px] text-ink-secondary" role="alert">
            This route is not part of the demo. Use the video tabs to move between Configuration,
            Scenes, History, and Logs.
        </div>
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

const videoHistoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/history"),
    component: lazyRouteComponent(() => import("../features/logs/HistoryScreen"), "HistoryScreen"),
});

const videoLogsRoute = createRoute({
    getParentRoute: () => rootRoute,
    ...routeFor("/projects/$projectId/videos/$videoId/logs"),
    validateSearch: (raw: Record<string, unknown>) => ({
        run: typeof raw.run === "string" ? raw.run : undefined,
    }),
    component: lazyRouteComponent(() => import("../features/logs/LogsScreen"), "LogsScreen"),
});

const routeTree = rootRoute.addChildren([
    videoRoute,
    videoScenesRoute,
    videoHistoryRoute,
    videoLogsRoute,
]);

/** The one writer for the demo's simulated encode stream. */
function DemoEvents() {
    useEncodeEvents();
    return null;
}

/**
 * Mounts the real video screens against a host transport, without the application shell.
 *
 * The site provides a seeded transport; the router uses memory history so the embedded demo
 * owns its navigation without changing the marketing page's address.
 */
export function VideoDemo({
    transport,
    initialEntry = "/projects/demo-project/videos/demo-video",
    onNavigate,
    paused = false,
}: {
    transport: Transport;
    initialEntry?: string;
    onNavigate?: () => void;
    /** The host has moved this surface off screen or its tab is hidden. */
    paused?: boolean;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
    const resumeMedia = useRef(new Set<HTMLMediaElement>());
    const [router] = useState(() =>
        createRouter({
            routeTree,
            history: createMemoryHistory({ initialEntries: [initialEntry] }),
            defaultPreload: "intent",
            defaultPreloadStaleTime: 0,
        }),
    );
    const pageScroll = useRef(0);
    const navigating = useRef(false);

    // Media keeps its own clock, so stopping the host timer is not enough. Pause every
    // element while the demo is out of view, and remember only what was actually playing so
    // returning to the section does not start a preview the visitor had left paused.
    useEffect(() => {
        const root = rootRef.current;
        if (root === null) {
            return;
        }
        if (!paused) {
            const pending = resumeMedia.current;
            resumeMedia.current = new Set();
            for (const media of pending) {
                if (media.isConnected && media.paused) {
                    void media.play().catch(() => {
                        // The browser may refuse to resume without a new gesture.
                    });
                }
            }
            return;
        }
        for (const media of root.querySelectorAll<HTMLMediaElement>("video, audio")) {
            if (!media.paused && !media.ended) {
                resumeMedia.current.add(media);
            }
            media.pause();
        }
        const suspend = (event: Event) => {
            const media = event.target;
            if (!(media instanceof HTMLMediaElement)) {
                return;
            }
            if (!media.paused && !media.ended) {
                resumeMedia.current.add(media);
            }
            media.pause();
        };
        // A scene can mount while the section is already off screen. Capture play attempts so
        // that no later element starts its own loop behind the page.
        root.addEventListener("play", suspend, true);
        return () => {
            root.removeEventListener("play", suspend, true);
        };
    }, [paused]);

    // A memory router still resets the host window when its links navigate. In a marketing
    // embed the screen scrolls inside its own frame, so preserve the page position and let
    // the host decide where the embedded viewport goes. An initial render is not navigation;
    // restoring it would defeat a deep link to the surrounding page.
    useEffect(() => {
        let frame = 0;
        const before = router.subscribe("onBeforeLoad", (event) => {
            if (event.fromLocation === undefined) {
                return;
            }
            pageScroll.current = window.scrollY;
            navigating.current = true;
        });
        const rendered = router.subscribe("onRendered", () => {
            if (!navigating.current) {
                return;
            }
            navigating.current = false;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                window.scrollTo({ top: pageScroll.current, left: 0 });
                onNavigate?.();
            });
        });
        return () => {
            before();
            rendered();
            cancelAnimationFrame(frame);
        };
    }, [router, onNavigate]);

    return (
        <div ref={rootRef} className="video-demo" data-video-demo>
            <ApiProvider transport={transport}>
                <DemoModeProvider embedded portalContainer={portalContainer}>
                    <DemoEvents />
                    <RouterProvider router={router} />
                </DemoModeProvider>
            </ApiProvider>
            <div
                ref={setPortalContainer}
                className="video-demo__overlay"
                data-video-demo-overlay=""
            />
        </div>
    );
}
