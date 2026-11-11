import { expect, it } from "vitest";

import type { StaticDataRouteOption } from "@tanstack/react-router";

import {
    ROUTE_META,
    parseScriptSearch,
    routeFor,
    type BackTarget,
    type ScriptSearch,
    type TrailParams,
} from "./route-meta";

/** TanStack requires static data exactly when this interface is non-empty. */
type StaticDataIsRequired = object extends StaticDataRouteOption ? false : true;
const staticDataIsRequired: StaticDataIsRequired = true;

function project(projectId: string): BackTarget {
    return {
        to: "/projects/$projectId",
        params: { projectId },
        parent: "Project",
        parentSource: "project",
        label: "Back to the project",
    };
}

function video(projectId: string, videoId: string): BackTarget {
    return {
        to: "/projects/$projectId/videos/$videoId",
        params: { projectId, videoId },
        parent: "Video",
        parentSource: "video",
        label: "Back to the video",
    };
}

/** Every registered route, its trail metadata, and the parent the shell must draw. */
const CASES: Array<
    [
        path: keyof typeof ROUTE_META,
        params: TrailParams,
        search: ScriptSearch,
        expected: BackTarget | null,
    ]
> = [
    ["/", {}, {}, null],
    [
        "/projects/$projectId",
        { projectId: "p1" },
        {},
        { to: "/", parent: "Projects", label: "Back to Projects" },
    ],
    ["/projects/$projectId/config/general", { projectId: "p1" }, {}, project("p1")],
    [
        "/projects/$projectId/config/$section",
        { projectId: "p1", section: "encoding" },
        {},
        project("p1"),
    ],
    [
        "/projects/$projectId/config/script",
        { projectId: "p1" },
        {},
        {
            to: "/projects/$projectId/config/$section",
            params: { projectId: "p1", section: "general" },
            parent: "General",
            label: "Back to General",
        },
    ],
    [
        "/projects/$projectId/config/script",
        { projectId: "p1" },
        { section: "encoding", part: "quantizer.metric_input" },
        {
            to: "/projects/$projectId/config/$section",
            params: { projectId: "p1", section: "encoding" },
            parent: "Encoding",
            label: "Back to Encoding",
        },
    ],
    ["/projects/$projectId/videos/$videoId", { projectId: "p1", videoId: "v1" }, {}, project("p1")],
    [
        "/projects/$projectId/videos/$videoId/config/general",
        { projectId: "p1", videoId: "v1" },
        {},
        video("p1", "v1"),
    ],
    [
        "/projects/$projectId/videos/$videoId/config/$section",
        { projectId: "p1", videoId: "v1", section: "noise-generation" },
        {},
        video("p1", "v1"),
    ],
    [
        "/projects/$projectId/videos/$videoId/scenes",
        { projectId: "p1", videoId: "v1" },
        {},
        video("p1", "v1"),
    ],
    [
        "/projects/$projectId/videos/$videoId/history",
        { projectId: "p1", videoId: "v1" },
        {},
        video("p1", "v1"),
    ],
    [
        "/projects/$projectId/videos/$videoId/logs",
        { projectId: "p1", videoId: "v1" },
        {},
        video("p1", "v1"),
    ],
    [
        "/projects/$projectId/videos/$videoId/script",
        { projectId: "p1", videoId: "v1" },
        {},
        {
            to: "/projects/$projectId/videos/$videoId/config/$section",
            params: { projectId: "p1", videoId: "v1", section: "general" },
            parent: "General",
            label: "Back to General",
        },
    ],
    [
        "/projects/$projectId/videos/$videoId/script",
        { projectId: "p1", videoId: "v1" },
        { section: "noise-generation" },
        {
            to: "/projects/$projectId/videos/$videoId/config/$section",
            params: { projectId: "p1", videoId: "v1", section: "noise-generation" },
            parent: "Noise generation",
            label: "Back to Noise generation",
        },
    ],
    ["/settings", {}, {}, { to: "/", parent: "Projects", label: "Back to Projects" }],
    [
        "/settings/encoders/$encoderId/json",
        { encoderId: "svt" },
        {},
        {
            to: "/settings",
            hash: "encoders",
            parent: "Encoders",
            label: "Back to Encoders",
        },
    ],
    [
        "/settings/templates/$templateId",
        { templateId: "t1" },
        {},
        {
            to: "/settings",
            hash: "project-templates",
            parent: "Project Templates",
            label: "Back to Project Templates",
        },
    ],
    [
        "/settings/templates/$templateId/$section",
        { templateId: "t1", section: "general" },
        {},
        {
            to: "/settings/templates/$templateId",
            params: { templateId: "t1" },
            parent: "Template",
            parentSource: "template",
            label: "Back to the template",
        },
    ],
    [
        "/settings/templates/$templateId/script",
        { templateId: "t1" },
        {},
        {
            to: "/settings/templates/$templateId/$section",
            params: { templateId: "t1", section: "general" },
            parent: "General",
            label: "Back to General",
        },
    ],
    [
        "/settings/templates/$templateId/script",
        { templateId: "t1" },
        { section: "encoding" },
        {
            to: "/settings/templates/$templateId/$section",
            params: { templateId: "t1", section: "encoding" },
            parent: "Encoding",
            label: "Back to Encoding",
        },
    ],
];

it("declares trail metadata for every registered route", () => {
    expect(Object.keys(ROUTE_META)).toHaveLength(17);
    expect(new Set(Object.keys(ROUTE_META)).size).toBe(17);
});

it("makes static data mandatory at the router boundary", () => {
    expect(staticDataIsRequired).toBe(true);
});

it("declares exactly the params each registered path carries", () => {
    for (const [path, meta] of Object.entries(ROUTE_META)) {
        const params = [...path.matchAll(/\$([A-Za-z]+)/gu)]
            .map((match) => match[1])
            .filter((name): name is string => name !== undefined);
        expect(meta.params, path).toEqual(params);
    }
});

it("returns the route one level up on every screen", () => {
    for (const [path, params, search, expected] of CASES) {
        expect(ROUTE_META[path].back(params, search), path).toEqual(expected);
    }
});

it("registers one script-search parser on every script route", () => {
    const scriptPaths = [
        "/projects/$projectId/config/script",
        "/projects/$projectId/videos/$videoId/script",
        "/settings/templates/$templateId/script",
    ] as const;

    for (const path of scriptPaths) {
        expect(ROUTE_META[path].search, path).toBe(parseScriptSearch);
        expect(routeFor(path)).toMatchObject({ validateSearch: parseScriptSearch });
        expect(
            ROUTE_META[path].search?.({ section: "encoding", part: "quantizer.metric_input" }),
        ).toEqual({ section: "encoding", part: "quantizer.metric_input" });
        expect(ROUTE_META[path].search?.({ section: 1, part: false })).toEqual({
            section: undefined,
            part: undefined,
        });
    }
});
