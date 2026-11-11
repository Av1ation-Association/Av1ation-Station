import type { ZodType } from "zod";
import type { AppSettings } from "@av1ation/contracts";
import { ApiError } from "../../types";
import { DEMO_RUNS, DEMO_SCENE_ENCODER, DEMO_SCENE_FRAMES, demoRecords, demoScenes } from "../demo";
import type { MockTransport } from "../../mock";

export async function get<T>(state: MockTransport, path: string, schema: ZodType<T>): Promise<T> {
    // Both About actions belong to the machine that runs the encode: the demo has no
    // service to read a log from and no release of its own to look up, so it says so
    // rather than inventing an answer.
    if (path === "/api/update") {
        throw new ApiError(
            503,
            null,
            "The demo runs in a browser and cannot ask GitHub for a release. The desktop app checks from the service on your machine.",
        );
    }
    if (path.startsWith("/api/diagnostics/bundle")) {
        throw new ApiError(
            503,
            null,
            "The demo has no application log or project files to bundle. The desktop app builds one from local state.",
        );
    }
    // The demo cannot start a server, but it still shows which interpreter the desktop
    // build would point one at, so the settings row is exercised rather than blank.
    // The demo cannot scan the machine, so the picker lists only the saved interpreter:
    // a fabricated path would be offered as a real choice.
    if (path === "/api/editor/interpreters") {
        const settings = state.routes.get("/api/settings") as AppSettings;
        const interpreter = settings.python_interpreter;
        return schema.parse({
            interpreters:
                interpreter === undefined ? [] : [{ path: interpreter, source: "setting" }],
        });
    }
    if (path === "/api/editor/language-server") {
        const settings = state.routes.get("/api/settings") as AppSettings;
        const interpreter = settings.python_interpreter;
        return schema.parse({
            available: false,
            kind: "",
            label: "Bundled completion",
            ...(interpreter === undefined ? {} : { interpreter, interpreter_source: "setting" }),
            detail: "The demo runs in a browser and cannot start a language server. The desktop app uses an installed Pyright or its bundled Jedi.",
        });
    }

    const templateDefaults = /^\/api\/settings\/templates\/([^/]+)\/defaults$/u.exec(path);
    if (templateDefaults !== null) {
        return schema.parse({ values: {} });
    }
    const templateGeneral = /^\/api\/settings\/templates\/([^/]+)\/general$/u.exec(path);
    if (templateGeneral !== null) {
        const id = decodeURIComponent(templateGeneral[1] ?? "");
        const settings = state.routes.get("/api/settings") as AppSettings;
        const template = settings.project_templates.find((entry) => entry.id === id);
        return schema.parse(
            template?.general ?? {
                input_kind: "ffms2",
                output_mode: "next_to_input",
                ffms2_filters: [{ OutputFormat: { bit_depth: 10 } }],
                vapour_synth_filters: [{ Resize: { format: "YUV420P10LE" } }],
            },
        );
    }
    const templateScripts = /^\/api\/settings\/templates\/([^/]+)\/scripts$/u.exec(path);
    if (templateScripts !== null) {
        return schema.parse({ problems: [] });
    }
    if (path === "/api/settings/templates") {
        const settings = state.routes.get("/api/settings") as AppSettings;
        return schema.parse(settings.project_templates);
    }

    const runs = /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/runs$/u.exec(path);
    if (runs !== null) {
        return schema.parse(DEMO_RUNS.filter((run) => !state.deletedRuns.has(run.run_id)));
    }

    const log = /^\/api\/runs\/([^/]+)\/logs(?:\?.*)?$/u.exec(path);
    if (log !== null) {
        const runId = decodeURIComponent(log[1] ?? "");
        const query = new URL(path, "http://demo").searchParams;
        const records = state.deletedRuns.has(runId)
            ? null
            : demoRecords(runId, "demo-project", "demo-video");
        if (records === null) {
            throw new ApiError(404, null, "No log exists for that run.");
        }
        // The endpoint takes a comma-separated set, because the viewer's toggles can keep
        // any combination of levels rather than exactly one.
        const levels = (query.get("level") ?? "").split(",").filter((entry) => entry !== "");
        const needle = (query.get("q") ?? "").toLowerCase();
        const filtered = records.filter(
            (record) =>
                (levels.length === 0 || levels.includes(record.level)) &&
                (needle === "" || record.message.toLowerCase().includes(needle)),
        );
        const column = query.get("sort") ?? "seq";
        const descending = query.get("dir") === "desc";
        filtered.sort((left, right) => {
            const compared =
                column === "time"
                    ? Date.parse(left.at) - Date.parse(right.at)
                    : column === "level"
                      ? left.level.localeCompare(right.level)
                      : column === "sequence"
                        ? (left.sequence ?? "").localeCompare(right.sequence ?? "")
                        : column === "message"
                          ? left.message.localeCompare(right.message)
                          : left.seq - right.seq;
            return descending ? -compared : compared;
        });
        const limit = Math.min(1_000, Math.max(1, Number(query.get("limit") ?? "200")));
        const tail = query.get("tail") === "true";
        const start = tail
            ? Math.max(0, filtered.length - limit)
            : Math.min(filtered.length, Math.max(0, Number(query.get("offset") ?? "0")));
        const end = Math.min(filtered.length, start + limit);
        return schema.parse({
            records: filtered.slice(start, end),
            total: filtered.length,
            ...(tail || end >= filtered.length ? {} : { next_offset: end }),
        });
    }

    const found = state.project(path);
    const project = found === null ? undefined : found.projects[found.index];
    if (project !== undefined) {
        return schema.parse({
            id: project.id,
            name: project.name,
            description: null,
            created_at: project.created_at,
            accessed_at: project.accessed_at,
            general: state.generalFor(project.id),
        });
    }

    const config = /^\/api\/projects\/([^/]+)\/config$/u.exec(path);
    if (config !== null) {
        return schema.parse({ values: {} });
    }

    const queue = /^\/api\/projects\/([^/]+)\/videos$/u.exec(path);
    if (queue !== null) {
        return schema.parse(state.videosFor(decodeURIComponent(queue[1] ?? "")));
    }

    const audioTracks = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/audio-tracks(?:\?.*)?$/u.exec(
        path,
    );
    if (audioTracks !== null) {
        return schema.parse({
            tracks: [],
            detail: "The demo has no media file to inspect, so it cannot list audio tracks.",
        });
    }

    const thumbnails = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/thumbnails$/u.exec(path);
    if (thumbnails !== null) {
        return schema.parse({
            state: "unavailable",
            revision: "",
            interval_ms: 5_000,
            width: 320,
            available: 0,
            detail: "The demo has no media file to extract keyframes from, so the rail uses placeholders.",
        });
    }

    const scenes = /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/scenes$/u.exec(path);
    if (scenes !== null) {
        return schema.parse(demoScenes(decodeURIComponent(scenes[2] ?? "")));
    }

    const sceneEncoder = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/scenes\/\d+\/encoder$/u.exec(
        path,
    );
    if (sceneEncoder !== null) {
        return schema.parse({ encoder: DEMO_SCENE_ENCODER });
    }

    const storage = /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/storage$/u.exec(path);
    if (storage !== null) {
        const id = decodeURIComponent(storage[2] ?? "");
        const inherited = `C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\temp\\${id}`;
        return schema.parse({
            directory: inherited,
            inherited_directory: inherited,
            custom: false,
            retained_bytes: 0,
            free_bytes: 780_000_000_000,
            total_bytes: 2_000_000_000_000,
        });
    }

    const history = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/history$/u.exec(path);
    if (history !== null) {
        return schema.parse({ entries: [] });
    }

    const videoState = /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/state$/u.exec(path);
    if (videoState !== null) {
        return schema.parse({
            video_id: decodeURIComponent(videoState[2] ?? ""),
            scene_count: DEMO_SCENE_FRAMES.length,
            sequences: [],
            next: ["ParallelEncoder"],
            active: false,
            run_id: null,
            failure: null,
            output_exists: false,
            retained_bytes: 0,
            script_data: [],
        });
    }

    if (!state.routes.has(path)) {
        throw new ApiError(404, null, `No mock route for ${path}.`);
    }
    // The demo's inputs are native, so a project or template has no plugin namespace to
    // compare and the report is clean.
    if (/^\/api\/projects\/[^/]+\/scripts$/u.test(path)) {
        return schema.parse({ problems: [] });
    }
    const route = state.routes.get(path);
    return schema.parse(typeof route === "function" ? (route as () => unknown)() : route);
}
