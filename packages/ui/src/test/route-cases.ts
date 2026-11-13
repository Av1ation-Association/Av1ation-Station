import { ROUTE_PATHS, type RoutePath } from "../app/route-meta";

/** The transport variant that produces a route's empty state. */
export type EmptyRouteTransport =
    "empty" | "emptyQueue" | "emptyScenes" | "emptyHistory" | "emptyRuns";

/**
 * The route-specific data every route-wide harness needs.
 *
 * The route list itself comes from `ROUTE_META`; this catalog only supplies the fixture
 * URL and the four-state assertions for each registered family. A route added to the
 * registry without an entry here fails typechecking. The screenshot catalog is separate,
 * because it also covers Settings tabs, states, and overlays that are not routes.
 */
export interface RouteCase {
    /** The registry path template this case certifies. */
    readonly route: RoutePath;
    /** The screen name used by the matrix and axe pass. */
    readonly name: string;
    /** The concrete demo URL the matrix and axe pass open. */
    readonly path: string;
    /** Stable content from the populated branch, never just the shell heading. */
    readonly populated: string;
    /** Text that only the error branch renders. */
    readonly error: string;
    /** The empty transport and marker, when the route has a collection empty state. */
    readonly empty?: {
        readonly transport: EmptyRouteTransport;
        readonly marker: string;
    };
    /** Why the route has no empty variant. Required when `empty` is absent. */
    readonly emptyReason?: string;
}

type RouteCaseDetail = Omit<RouteCase, "route">;

const PROJECT_PATH = "/projects/demo-project";
const VIDEO_PATH = `${PROJECT_PATH}/videos/demo-video`;
const TEMPLATE_PATH = "/settings/templates/default";

const DETAILS = {
    "/": {
        name: "Home",
        path: "/",
        populated: "Aurora Documentary",
        error: "The project list could not be loaded",
        empty: { transport: "empty", marker: "No projects yet" },
    },
    "/projects/$projectId": {
        name: "Project",
        path: PROJECT_PATH,
        populated: "Configuration and Defaults",
        error: "This project could not be opened",
        empty: { transport: "emptyQueue", marker: "Add videos to the queue" },
    },
    "/projects/$projectId/config/general": {
        name: "Project General",
        path: `${PROJECT_PATH}/config/general`,
        populated: "Applies to every video added to the queue",
        error: "This project could not be loaded",
        emptyReason:
            "General is a stored engine document; it has values or an error, not a collection empty state.",
    },
    "/projects/$projectId/config/$section": {
        name: "Project section",
        path: `${PROJECT_PATH}/config/scene-detection`,
        populated: "The detector and its bounds",
        error: "This section could not be loaded",
        emptyReason:
            "A section is addressed by a known document id; an absent section is a routing error, not empty data.",
    },
    "/projects/$projectId/videos/$videoId": {
        name: "Video",
        path: VIDEO_PATH,
        populated: "Pipeline",
        error: "This video could not be opened",
        emptyReason:
            "A video route addresses one stored video; missing data is an error, and an existing video always has a General document.",
    },
    "/projects/$projectId/videos/$videoId/scenes": {
        name: "Scenes",
        path: `${VIDEO_PATH}/scenes`,
        populated: "Virtualized · 12 total",
        error: "The video could not be opened",
        empty: { transport: "emptyScenes", marker: "No scenes yet" },
    },
    "/projects/$projectId/videos/$videoId/config/general": {
        name: "Video General",
        path: `${VIDEO_PATH}/config/general`,
        populated: "The source this video decodes",
        error: "This video's General document could not be loaded",
        emptyReason:
            "A video's General is a stored engine document; a missing source is a validation blocker, not an empty screen.",
    },
    "/projects/$projectId/videos/$videoId/history": {
        name: "History",
        path: `${VIDEO_PATH}/history`,
        populated: "1 run · newest first",
        error: "The history could not be read",
        empty: { transport: "emptyHistory", marker: "No runs recorded" },
    },
    "/projects/$projectId/videos/$videoId/config/$section": {
        name: "Video section",
        path: `${VIDEO_PATH}/config/scene-detection`,
        populated: "A part with no override is read from the project",
        error: "This section could not be loaded",
        emptyReason:
            "An inherited section is the empty override variant and renders the project values, which the populated assertion covers.",
    },
    "/projects/$projectId/videos/$videoId/logs": {
        name: "Logs",
        path: `${VIDEO_PATH}/logs`,
        populated: "48 matching lines",
        error: "Run history unavailable",
        empty: { transport: "emptyRuns", marker: "No runs yet" },
    },
    "/projects/$projectId/videos/$videoId/script": {
        name: "Video script",
        path: `${VIDEO_PATH}/script?section=scene-detection`,
        populated: "This video",
        error: "The script could not be loaded",
        emptyReason:
            "The script page edits an input document that always exists; an input that is not a script renders its own conversion state, not an empty collection.",
    },
    "/projects/$projectId/config/script": {
        name: "Project script",
        path: `${PROJECT_PATH}/config/script?section=scene-detection`,
        populated: "This project",
        error: "The script could not be loaded",
        emptyReason:
            "The project script edits an input document that always exists; a non-script input is a conversion state, not empty data.",
    },
    "/settings/templates/$templateId/script": {
        name: "Template script",
        path: `${TEMPLATE_PATH}/script?section=general`,
        populated: "New projects",
        error: "The default script could not be loaded",
        emptyReason:
            "The template script edits a defaults input that always exists; a non-script input is a conversion state, not empty data.",
    },
    "/settings/templates/$templateId/$section": {
        name: "Template section",
        path: `${TEMPLATE_PATH}/scene-detection`,
        populated: "The detector and its bounds",
        error: "This section could not be loaded",
        emptyReason:
            "A template section is a stored defaults document; an absent section is a routing error, not empty data.",
    },
    "/settings/templates/$templateId": {
        name: "Template",
        path: TEMPLATE_PATH,
        populated: "New projects copy this template",
        error: "The template could not be loaded",
        emptyReason:
            "A template route addresses one stored template; a missing template is an error, and every template has default documents.",
    },
    "/settings": {
        name: "Settings",
        path: "/settings",
        populated: "Every executable the pipeline can use",
        error: "The dependency inventory could not be loaded",
        emptyReason:
            "Settings is a capability inventory with fixed rows; a missing provider is a row state, not an empty page.",
    },
    "/settings/encoders/$encoderId/json": {
        name: "Encoder JSON",
        path: "/settings/encoders/x265/json",
        populated: "The whole descriptor set as one JSON document",
        error: "The encoder catalogue could not be loaded",
        emptyReason:
            "An encoder document is one descriptor set; an empty set is still the editor's populated document, and a missing encoder is a routing state.",
    },
} satisfies Record<RoutePath, RouteCaseDetail>;

/** One case per registered route family, in registry order. */
export const ROUTE_CASES: readonly RouteCase[] = ROUTE_PATHS.map((route) => ({
    route,
    ...DETAILS[route],
}));
