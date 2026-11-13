import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";

import { ApiProvider } from "@av1ation/api";

import { App } from "../app/App";
import type { RoutePath } from "../app/route-meta";
import { createAppRouter } from "../app/router";
import { ROUTE_CASES, type RouteCase } from "./route-cases";
import { populatedTransport } from "./route-fixtures";

/** Select the registered cases for one route-family file without duplicating paths. */
export function casesFor(routes: readonly RoutePath[]): readonly RouteCase[] {
    return routes.map((route) => {
        const routeCase = ROUTE_CASES.find((candidate) => candidate.route === route);
        if (routeCase === undefined) {
            throw new Error(`No accessibility route case registered for ${route}`);
        }
        return routeCase;
    });
}

/** Reset the DOM and URL between route scans when files share one worker. */
export function resetA11y(): void {
    cleanup();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
}

/**
 * Render the real application tree at one destination and return its axe violations.
 *
 * The shell, route component, and queries are audited together. This is the shared part of
 * the split files; the route groups only own their path lists.
 */
export async function violationsAt(path: string): Promise<string[]> {
    window.history.replaceState(null, "", path);
    const router = createAppRouter();
    const view = render(
        <ApiProvider transport={populatedTransport()}>
            <App router={router} />
        </ApiProvider>,
    );

    // Await the lazy route and its queries before auditing. Loading or error is a legitimate
    // settled state for a screen; an actual loader failure should surface here, not as a
    // generic "router still loading" timeout.
    await router.load();

    const result = await axe.run(view.container, {
        rules: {
            // jsdom performs no layout, so contrast and target size cannot be measured.
            "color-contrast": { enabled: false },
            "target-size": { enabled: false },
        },
    });
    return result.violations.map(
        (violation) => `${violation.id} (${violation.impact}): ${violation.help}`,
    );
}
