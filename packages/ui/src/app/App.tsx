import { useEncodeEvents, useRunNotifications } from "@av1ation/api";
import { RouterProvider } from "@tanstack/react-router";

import { ErrorBoundary } from "./ErrorBoundary";
import { Toaster } from "./Toaster";
import { WebviewZoom } from "./WebviewZoom";
import type { AppRouter } from "./router";
import { ThemeSync } from "../shared/theme";

/** One application tree for every host: a boundary, the theme writer, and the router. */
export function App({ router }: { router: AppRouter }) {
    // Subscribe the notification writer before the stream writer, so the first started
    // event of a run is not missed by the lifecycle bus.
    useRunNotifications();
    // One stream for every host and every screen: the writer routes each event to the exact
    // video's cache entry, so the queue and the video page cannot disagree about progress.
    useEncodeEvents();
    return (
        <ErrorBoundary>
            <ThemeSync />
            <WebviewZoom />
            <RouterProvider router={router} />
            <Toaster />
        </ErrorBoundary>
    );
}
