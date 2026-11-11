import { sectionLabel } from "../shared/model/project-sections";

/** The one trail shape a registered route renders. */
export type TrailKind =
    | "home"
    | "project"
    | "project-section"
    | "project-script"
    | "video"
    | "video-section"
    | "video-script"
    | "video-logs"
    | "video-scenes"
    | "video-history"
    | "settings"
    | "encoder-json"
    | "template"
    | "template-section"
    | "template-script";

/** A route the shell's back control and breadcrumb can link to. */
export type CrumbPath =
    | "/"
    | "/settings"
    | "/settings/templates/$templateId"
    | "/settings/templates/$templateId/$section"
    | "/projects/$projectId"
    | "/projects/$projectId/config/$section"
    | "/projects/$projectId/videos/$videoId"
    | "/projects/$projectId/videos/$videoId/config/$section";

export type CrumbParams = {
    projectId?: string;
    videoId?: string;
    templateId?: string;
    section?: string;
};

/** The search fields a script page uses to name the document that owns it. */
export interface ScriptSearch {
    section?: string | undefined;
    part?: string | undefined;
}

export type ScriptOwner = ScriptSearch;

/** Params a route match carries; every field is absent on routes that do not use it. */
export type TrailParams = {
    projectId?: string;
    videoId?: string;
    templateId?: string;
    section?: string;
    encoderId?: string;
};

/** A match field a trail can read; the metadata lists the ones its route provides. */
export type TrailParam = keyof TrailParams;

/** The screen one level up, drawn at the head of the bar. */
export interface BackTarget {
    to: CrumbPath;
    params?: CrumbParams;
    hash?: string;
    /** The page the control returns to, used when that page's name is fixed. */
    parent: string;
    /** Set when the parent is a document whose name lives in the query cache. */
    parentSource?: "project" | "template" | "video";
    label: string;
}

export type BackResolver = (params: TrailParams, search: ScriptSearch) => BackTarget | null;

export type SearchParser = (raw: Record<string, unknown>) => ScriptSearch;

/** The static data every route must declare. */
export interface RouteMeta {
    /** The breadcrumb trail and up target the shell draws. */
    trail: TrailKind;
    /** Match params the trail reads; the registry test keeps this equal to the path. */
    params: readonly TrailParam[];
    /** The screen one level up, so the shell does not derive it from the trail. */
    back: BackResolver;
    /** Validates a script page's owning section and sequence part, when it has one. */
    search?: SearchParser;
}

/** The parent screens shared by several routes. */
function projectsBack(): BackTarget {
    return { to: "/", parent: "Projects", label: "Back to Projects" };
}

function projectBack(projectId: string): BackTarget {
    return {
        to: "/projects/$projectId",
        params: { projectId },
        parent: "Project",
        parentSource: "project",
        label: "Back to the project",
    };
}

function videoBack(projectId: string, videoId: string): BackTarget {
    return {
        to: "/projects/$projectId/videos/$videoId",
        params: { projectId, videoId },
        parent: "Video",
        parentSource: "video",
        label: "Back to the video",
    };
}

function templateBack(templateId: string): BackTarget {
    return {
        to: "/settings/templates/$templateId",
        params: { templateId },
        parent: "Template",
        parentSource: "template",
        label: "Back to the template",
    };
}

function sectionBack(
    to:
        | "/projects/$projectId/config/$section"
        | "/projects/$projectId/videos/$videoId/config/$section"
        | "/settings/templates/$templateId/$section",
    params: CrumbParams,
    owner: string,
): BackTarget {
    return {
        to,
        params,
        parent: sectionLabel(owner),
        label: `Back to ${sectionLabel(owner)}`,
    };
}

/**
 * One route's full metadata.
 *
 * Returning `RouteMeta` keeps every entry's optional `search` visible to `routeFor`;
 * the object is otherwise composed directly into the registry below.
 */
function defineRoute(meta: RouteMeta): RouteMeta {
    return meta;
}

/** The script route's search is the same document selector on all three hosts. */
export function parseScriptSearch(raw: Record<string, unknown>): ScriptSearch {
    return {
        section: typeof raw.section === "string" ? raw.section : undefined,
        part: typeof raw.part === "string" ? raw.part : undefined,
    };
}

/**
 * The one route registry.
 *
 * Keys are the router's path templates. `routeFor` returns the path, this metadata, and
 * the optional script-search validator, so a route definition cannot name one path and
 * declare another's trail, back target, or search contract. The static-data augmentation
 * below makes the metadata mandatory on every `createRoute` call.
 */
export const ROUTE_META = {
    "/": defineRoute({
        trail: "home",
        params: [],
        back: () => null,
    }),
    "/projects/$projectId": defineRoute({
        trail: "project",
        params: ["projectId"],
        back: projectsBack,
    }),
    "/projects/$projectId/config/general": defineRoute({
        trail: "project-section",
        params: ["projectId"],
        back: ({ projectId }) => projectBack(projectId ?? ""),
    }),
    "/projects/$projectId/config/$section": defineRoute({
        trail: "project-section",
        params: ["projectId", "section"],
        back: ({ projectId }) => projectBack(projectId ?? ""),
    }),
    "/projects/$projectId/videos/$videoId": defineRoute({
        trail: "video",
        params: ["projectId", "videoId"],
        back: ({ projectId }) => projectBack(projectId ?? ""),
    }),
    "/projects/$projectId/videos/$videoId/scenes": defineRoute({
        trail: "video-scenes",
        params: ["projectId", "videoId"],
        back: ({ projectId, videoId }) => videoBack(projectId ?? "", videoId ?? ""),
    }),
    "/projects/$projectId/videos/$videoId/config/general": defineRoute({
        trail: "video-section",
        params: ["projectId", "videoId"],
        back: ({ projectId, videoId }) => videoBack(projectId ?? "", videoId ?? ""),
    }),
    "/projects/$projectId/videos/$videoId/history": defineRoute({
        trail: "video-history",
        params: ["projectId", "videoId"],
        back: ({ projectId, videoId }) => videoBack(projectId ?? "", videoId ?? ""),
    }),
    "/projects/$projectId/videos/$videoId/config/$section": defineRoute({
        trail: "video-section",
        params: ["projectId", "videoId", "section"],
        back: ({ projectId, videoId }) => videoBack(projectId ?? "", videoId ?? ""),
    }),
    "/projects/$projectId/videos/$videoId/logs": defineRoute({
        trail: "video-logs",
        params: ["projectId", "videoId"],
        back: ({ projectId, videoId }) => videoBack(projectId ?? "", videoId ?? ""),
    }),
    "/projects/$projectId/videos/$videoId/script": defineRoute({
        trail: "video-script",
        params: ["projectId", "videoId"],
        back: ({ projectId, videoId }, { section }) => {
            const owner = section ?? "general";
            return sectionBack(
                "/projects/$projectId/videos/$videoId/config/$section",
                { projectId: projectId ?? "", videoId: videoId ?? "", section: owner },
                owner,
            );
        },
        search: parseScriptSearch,
    }),
    "/projects/$projectId/config/script": defineRoute({
        trail: "project-script",
        params: ["projectId"],
        back: ({ projectId }, { section }) => {
            const owner = section ?? "general";
            return sectionBack(
                "/projects/$projectId/config/$section",
                { projectId: projectId ?? "", section: owner },
                owner,
            );
        },
        search: parseScriptSearch,
    }),
    "/settings/templates/$templateId/script": defineRoute({
        trail: "template-script",
        params: ["templateId"],
        back: ({ templateId }, { section }) => {
            const owner = section ?? "general";
            return sectionBack(
                "/settings/templates/$templateId/$section",
                { templateId: templateId ?? "", section: owner },
                owner,
            );
        },
        search: parseScriptSearch,
    }),
    "/settings/templates/$templateId/$section": defineRoute({
        trail: "template-section",
        params: ["templateId", "section"],
        back: ({ templateId }) => templateBack(templateId ?? ""),
    }),
    "/settings/templates/$templateId": defineRoute({
        trail: "template",
        params: ["templateId"],
        back: () => ({
            to: "/settings",
            hash: "project-templates",
            parent: "Project Templates",
            label: "Back to Project Templates",
        }),
    }),
    "/settings": defineRoute({
        trail: "settings",
        params: [],
        back: projectsBack,
    }),
    "/settings/encoders/$encoderId/json": defineRoute({
        trail: "encoder-json",
        params: ["encoderId"],
        back: () => ({
            to: "/settings",
            hash: "encoders",
            parent: "Encoders",
            label: "Back to Encoders",
        }),
    }),
} as const satisfies Record<string, RouteMeta>;

/** A path registered in `ROUTE_META`; the only path a route may declare. */
export type RoutePath = keyof typeof ROUTE_META;

/**
 * The router fields for a registered route.
 *
 * Spread this into `createRoute` so the path, static trail data, back target, and script
 * search contract come from one entry. A new route must be registered in `ROUTE_META`
 * before it can be mounted.
 */
export function routeFor<TPath extends RoutePath>(path: TPath) {
    const meta = ROUTE_META[path];
    return meta.search === undefined
        ? { path, staticData: meta }
        : { path, staticData: meta, validateSearch: meta.search };
}

declare module "@tanstack/react-router" {
    interface StaticDataRouteOption {
        trail: TrailKind;
        params: readonly TrailParam[];
        back: BackResolver;
        search?: SearchParser;
    }
}

/** Settings tabs and the template/encoder children that keep Settings in the shell. */
export function isSettingsTrail(trail: TrailKind): boolean {
    return (
        trail === "settings" ||
        trail === "encoder-json" ||
        trail === "template" ||
        trail === "template-section" ||
        trail === "template-script"
    );
}
