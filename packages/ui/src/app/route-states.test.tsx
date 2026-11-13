// @vitest-environment jsdom
import { waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { HomeScreen } from "../features/projects/HomeScreen";
import { ProjectScreen } from "../features/projects/ProjectScreen";
import { ProjectGeneralScreen } from "../features/projects/ProjectGeneralScreen";
import { ProjectSectionScreen } from "../features/projects/ProjectSectionScreen";
import { ProjectTemplateOverview } from "../features/projects/ProjectTemplateOverview";
import { ProjectDefaultsSectionScreen } from "../features/projects/ProjectDefaultsSectionScreen";
import { VideoScreen } from "../features/videos/VideoScreen";
import { VideoGeneralScreen } from "../features/videos/VideoGeneralScreen";
import { VideoSectionScreen } from "../features/videos/VideoSectionScreen";
import { ScenesScreen } from "../features/scenes/ScenesScreen";
import { HistoryScreen } from "../features/logs/HistoryScreen";
import { LogsScreen } from "../features/logs/LogsScreen";
import { VideoScriptEditorScreen } from "../features/script/VideoScriptEditorScreen";
import { ScriptEditorScreen } from "../features/script/ScriptEditorScreen";
import { DefaultsScriptScreen } from "../features/script/DefaultsScriptScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { EncoderJsonScreen } from "../features/encoders/EncoderJsonScreen";
import { ROUTE_CASES, type EmptyRouteTransport } from "../test/route-cases";
import {
    emptyHistoryTransport,
    emptyQueueTransport,
    emptyRunsTransport,
    emptyScenesTransport,
    emptyTransport,
    failingTransport,
    pendingTransport,
    populatedTransport,
} from "../test/route-fixtures";
import { renderRoute } from "../test/render";
import type { RoutePath } from "./route-meta";

// The route matrix certifies data states, not the editor runtime. Monaco needs layout,
// workers, and a canvas that jsdom does not provide, so the JSON and script screens use a
// textarea stand-in while their route state is exercised.
vi.mock("@monaco-editor/react", async () => {
    const React = await import("react");
    return {
        default: ({
            value,
            onChange,
        }: {
            value?: string;
            onChange?: (value: string | undefined) => void;
        }) =>
            React.createElement("textarea", {
                value: value ?? "",
                onChange: (event: { target: { value: string } }) => onChange?.(event.target.value),
            }),
        loader: { config: () => undefined },
    };
});

// The theme module also starts the real Monaco runtime, whose clipboard listener outlives a
// file in the shared worker. The route matrix needs the theme names only.
vi.mock("../shared/monaco-env", () => ({
    MONACO_THEMES: { dark: "av1ation-dark", light: "av1ation-light" },
}));

/** The screen mounted for each registered route family. */
const COMPONENTS = {
    "/": HomeScreen,
    "/projects/$projectId": ProjectScreen,
    "/projects/$projectId/config/general": ProjectGeneralScreen,
    "/projects/$projectId/config/$section": ProjectSectionScreen,
    "/projects/$projectId/videos/$videoId": VideoScreen,
    "/projects/$projectId/videos/$videoId/scenes": ScenesScreen,
    "/projects/$projectId/videos/$videoId/config/general": VideoGeneralScreen,
    "/projects/$projectId/videos/$videoId/history": HistoryScreen,
    "/projects/$projectId/videos/$videoId/config/$section": VideoSectionScreen,
    "/projects/$projectId/videos/$videoId/logs": LogsScreen,
    "/projects/$projectId/videos/$videoId/script": VideoScriptEditorScreen,
    "/projects/$projectId/config/script": ScriptEditorScreen,
    "/settings/templates/$templateId/script": DefaultsScriptScreen,
    "/settings/templates/$templateId/$section": ProjectDefaultsSectionScreen,
    "/settings/templates/$templateId": ProjectTemplateOverview,
    "/settings": SettingsScreen,
    "/settings/encoders/$encoderId/json": EncoderJsonScreen,
} satisfies Record<RoutePath, ComponentType>;

/** The fixture transport that makes each declared empty state observable. */
const EMPTY_TRANSPORTS = {
    empty: emptyTransport,
    emptyQueue: emptyQueueTransport,
    emptyScenes: emptyScenesTransport,
    emptyHistory: emptyHistoryTransport,
    emptyRuns: emptyRunsTransport,
} satisfies Record<EmptyRouteTransport, () => ReturnType<typeof emptyTransport>>;

const CASES = ROUTE_CASES.map((routeCase) => ({
    ...routeCase,
    Component: COMPONENTS[routeCase.route],
}));

/** Wait for text anywhere in the rendered screen, including a portal outside the router. */
async function waitForText(marker: string): Promise<void> {
    await waitFor(
        () => {
            expect(document.body.textContent ?? "").toContain(marker);
        },
        { timeout: 3_000 },
    );
}

describe.each(CASES)("$name", (routeCase) => {
    it("renders its loading state", async () => {
        renderRoute(<routeCase.Component />, {
            transport: pendingTransport(),
            route: routeCase.route,
            initialEntry: routeCase.path,
            topBar: true,
        });
        await waitFor(
            () => {
                expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
            },
            { timeout: 3_000 },
        );
    });

    it("renders its error state", async () => {
        renderRoute(<routeCase.Component />, {
            transport: failingTransport(),
            route: routeCase.route,
            initialEntry: routeCase.path,
            topBar: true,
        });
        await waitForText(routeCase.error);
    });

    it("renders its populated state", async () => {
        renderRoute(<routeCase.Component />, {
            transport: populatedTransport(),
            route: routeCase.route,
            initialEntry: routeCase.path,
            topBar: true,
        });
        await waitForText(routeCase.populated);
    });

    if (routeCase.empty === undefined) {
        it("records why the empty state is not applicable", () => {
            expect(routeCase.emptyReason?.trim().length ?? 0).toBeGreaterThan(30);
        });
    } else {
        const empty = routeCase.empty;
        it("renders its empty state", async () => {
            renderRoute(<routeCase.Component />, {
                transport: EMPTY_TRANSPORTS[empty.transport](),
                route: routeCase.route,
                initialEntry: routeCase.path,
                topBar: true,
            });
            await waitForText(empty.marker);
        });
    }
});
