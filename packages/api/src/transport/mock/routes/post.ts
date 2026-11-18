import type { ZodType } from "zod";
import type {
    AppSettings,
    PreflightCheck,
    ProjectDefaultsState,
    ProjectTemplate,
    VideoSummary,
} from "@av1ation/contracts";
import { ApiError } from "../../types";
import { deriveMockOutput, demoId, demoRecords, ENCODER_VARIANTS } from "../demo";
import { FAMILIES } from "../fixtures";
import type { MockTransport } from "../../mock";

export async function post<T>(
    state: MockTransport,
    path: string,
    body: unknown,
    schema: ZodType<T>,
): Promise<T> {
    const exportLog = /^\/api\/runs\/([^/]+)\/logs\/export$/u.exec(path);
    if (exportLog !== null) {
        const runId = decodeURIComponent(exportLog[1] ?? "");
        const records = state.deletedRuns.has(runId)
            ? null
            : demoRecords(runId, "demo-project", "demo-video");
        if (records === null) {
            throw new ApiError(404, null, "No log exists for that run.");
        }
        return schema.parse({
            text: records.map((record) => JSON.stringify(record)).join("\n"),
            replacements: {
                "<path:input>": "C:\\Users\\demo\\media\\clip.mkv",
                "<path:output>": "C:\\Users\\demo\\media\\clip.av1.mkv",
            },
        });
    }
    const concatSourceInfo = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/concat-source-info$/u.exec(
        path,
    );
    if (concatSourceInfo !== null) {
        return schema.parse({
            chapters: [],
            metadata: [],
            chapters_detail: "The demo has no media file to inspect, so it cannot list chapters.",
            metadata_detail: "The demo has no media file to inspect, so it cannot list metadata.",
        });
    }
    const concatInventory = /^\/api\/projects\/[^/]+\/videos\/[^/]+\/concat-inventory$/u.exec(path);
    if (concatInventory !== null) {
        const input = body as { method?: unknown };
        return schema.parse({
            method: input.method === "ffmpeg" ? "ffmpeg" : "mkvmerge",
            tracks: [],
            attachments: [],
            data_stream_count: 0,
            chapter_count: null,
            detail: "The demo has no media file to inspect, so it cannot list concatenation tracks.",
        });
    }
    const validateVideo = /^\/api\/projects\/[^/]+\/videos\/([^/]+)\/validate$/u.exec(path);
    if (validateVideo !== null) {
        // The demo's scripts are native inputs, so there is no plugin namespace to
        // compare and the preflight is clean unless a test supplies a blocker.
        return schema.parse({
            video_id: decodeURIComponent(validateVideo[1] ?? ""),
            can_encode: true,
            source_exists: true,
            output_writable: true,
            scratch_writable: true,
            warnings: [],
            checks: [],
            plugin_problems: [],
            blockers: [],
            ...state.validation,
        });
    }
    if (path === "/api/config/scripts/validate") {
        // The demo has no VapourSynth, so it reports exactly what a machine without it
        // reports rather than claiming a script was checked.
        return schema.parse({
            status: "unavailable",
            clip: null,
            detail: "The demo runs without VapourSynth, so it cannot evaluate a script. The desktop app checks it on the machine that will run the encode.",
        });
    }
    if (path === "/api/settings/templates") {
        const input = body as { name?: unknown };
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (name === "" || name.length > 120) {
            throw new ApiError(400, null, "A template needs a name of 1–120 characters.");
        }
        const settings = state.routes.get("/api/settings") as AppSettings;
        if (
            settings.project_templates.some(
                (template) => template.name.toLowerCase() === name.toLowerCase(),
            )
        ) {
            throw new ApiError(400, null, `A template named “${name}” already exists.`);
        }
        const template: ProjectTemplate = {
            id: demoId("template"),
            name,
            config: {},
            general: state.generalFor("template"),
            updated_at: new Date().toISOString(),
        };
        state.routes.set("/api/settings", {
            ...settings,
            project_templates: [...settings.project_templates, template],
            default_project_template_id: settings.default_project_template_id ?? template.id,
        });
        return schema.parse(template);
    }
    const applyTemplate = /^\/api\/projects\/([^/]+)\/template$/u.exec(path);
    if (applyTemplate !== null) {
        const projectId = decodeURIComponent(applyTemplate[1] ?? "");
        const input = body as { template_id?: unknown };
        const templateId = typeof input.template_id === "string" ? input.template_id : "";
        const template = state.template(templateId);
        if (template === undefined) {
            throw new ApiError(404, null, "No project template matches that id.");
        }
        const found = state.project(`/api/projects/${projectId}`);
        const project = found?.projects[found.index];
        if (project === undefined) {
            throw new ApiError(404, null, "No project matches that id.");
        }
        const previous: ProjectDefaultsState = {
            config: {},
            general: state.generalFor(projectId),
        };
        state.general.set(projectId, template.general);
        return schema.parse({
            project: {
                id: project.id,
                name: project.name,
                description: null,
                created_at: project.created_at,
                accessed_at: project.accessed_at,
                general: template.general,
            },
            previous,
            applied: {
                config: template.config,
                general: template.general,
            },
        });
    }
    if (/^\/api\/settings\/templates\/[^/]+\/defaults\/reset(?:\/[^/]+)?$/u.test(path)) {
        return schema.parse({ values: {} });
    }
    if (path === "/api/projects") {
        const input = body as { name?: unknown };
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (name === "" || name.length > 120) {
            throw new ApiError(400, null, "A project needs a name of 1–120 characters.");
        }
        const now = new Date().toISOString();
        const id = demoId("demo");
        state.projects().unshift({
            id,
            name,
            path: `C:\\Users\\demo\\Av1ation\\${id}`,
            accessed_at: now,
            created_at: now,
            size_bytes: 0,
            video_count: 0,
            completed_videos: 0,
        });
        return schema.parse({
            id,
            name,
            description: null,
            created_at: now,
            accessed_at: now,
            general: state.generalFor(id),
        });
    }
    const addVideo = /^\/api\/projects\/([^/]+)\/videos$/u.exec(path);
    if (addVideo !== null) {
        const projectId = decodeURIComponent(addVideo[1] ?? "");
        const input = body as {
            input_path?: unknown;
            output_path?: unknown;
            name?: unknown;
        };
        const inputPath = typeof input.input_path === "string" ? input.input_path.trim() : "";
        if (inputPath === "") {
            throw new ApiError(422, null, "A video needs an input path.");
        }
        const explicitOutput =
            typeof input.output_path === "string" ? input.output_path.trim() : "";
        const outputPath =
            explicitOutput === ""
                ? deriveMockOutput(state.generalFor(projectId), inputPath)
                : explicitOutput;
        const queue = state.videosFor(projectId);
        const id = demoId("demo-video");
        const given = typeof input.name === "string" ? input.name.trim() : "";
        const name = given === "" ? (inputPath.split(/[\\/]/u).pop() ?? "Video") : given;
        const now = new Date().toISOString();
        const summary: VideoSummary = {
            id,
            name,
            input_path: inputPath,
            output_path: outputPath,
            order: queue.length,
            created_at: now,
        };
        queue.push(summary);
        state.syncProjectCounts(projectId);
        return schema.parse({
            ...summary,
            output_exists: false,
            retained_bytes: 0,
        });
    }

    const removeVideos = /^\/api\/projects\/([^/]+)\/videos\/remove$/u.exec(path);
    if (removeVideos !== null) {
        const projectId = decodeURIComponent(removeVideos[1] ?? "");
        const input = body as { video_ids?: unknown };
        const ids = Array.isArray(input.video_ids)
            ? input.video_ids.filter((id): id is string => typeof id === "string")
            : [];
        const remaining = state.videosFor(projectId).filter((video) => !ids.includes(video.id));
        state.videos.set(projectId, remaining);
        state.syncProjectCounts(projectId);
        return schema.parse(ids);
    }

    if (path.startsWith("/api/lan/")) {
        throw new ApiError(503, null, "LAN access is only available in the desktop application.");
    }
    if (path === "/api/encoders/probe") {
        const input = body as { base?: unknown; path?: unknown };
        const executable = typeof input.path === "string" ? input.path.trim() : "";
        if (executable === "") {
            throw new ApiError(400, null, "A fork needs an executable path.");
        }
        return schema.parse({
            available: true,
            version: "demo build",
            detail: `${executable} --help · demo build`,
            parameters: {},
        });
    }
    if (path === "/api/encoders/forks") {
        const input = body as {
            label?: unknown;
            base?: unknown;
            path?: unknown;
        };
        const label = typeof input.label === "string" ? input.label.trim() : "";
        const base = typeof input.base === "string" ? input.base : "";
        const executable = typeof input.path === "string" ? input.path.trim() : "";
        if (label === "" || executable === "") {
            throw new ApiError(400, null, "A fork needs a name and an executable path.");
        }
        const id = `fork-${state.forks.length + 1}`;
        const record = {
            id,
            label,
            base,
            executable,
            version: "demo build",
            parameters: {},
            parameters_edited: false,
        };
        state.forks.push({
            record,
            descriptor: {
                id: `fork:${id}`,
                base,
                label,
                default: {
                    [ENCODER_VARIANTS[base] ?? base]: {
                        executable,
                        options: {},
                    },
                },
                parameters: {},
                source: "Probed",
                executable,
                version: "demo build",
                available: true,
                fork: true,
                overridden: false,
            },
        });
        return schema.parse(record);
    }
    if (path === "/api/preflight/probe") {
        const input = body as { kind?: unknown; path?: unknown };
        const kind = typeof input.kind === "string" ? input.kind : "";
        const executable = typeof input.path === "string" ? input.path.trim() : "";
        const family = FAMILIES[kind];
        if (family === undefined) {
            throw new ApiError(400, null, `Unknown executable family ${kind}.`);
        }
        if (executable === "") {
            throw new ApiError(400, null, "A custom executable needs a path.");
        }
        return schema.parse({
            id: `custom:${kind}`,
            label: `${family.label} (custom)`,
            capability: family.capability,
            available: true,
            detail: `${executable} · demo build`,
            origin: "custom",
            path: executable,
        } satisfies PreflightCheck);
    }
    if (path === "/api/preflight/custom") {
        const input = body as { kind?: unknown; path?: unknown };
        const kind = typeof input.kind === "string" ? input.kind : "";
        const executable = typeof input.path === "string" ? input.path.trim() : "";
        const family = FAMILIES[kind];
        if (family === undefined) {
            throw new ApiError(400, null, `Unknown executable family ${kind}.`);
        }
        if (executable === "") {
            throw new ApiError(400, null, "A custom executable needs a path.");
        }
        const check: PreflightCheck = {
            id: `custom:${kind}`,
            label: `${family.label} (custom)`,
            capability: family.capability,
            available: true,
            detail: `${executable} · demo build`,
            origin: "custom",
            path: executable,
        };
        state.customChecks = state.customChecks.filter((entry) => entry.check.id !== check.id);
        state.customChecks.push({ target: family.target, check });
        state.syncPreflight();
        return schema.parse(check);
    }
    if (state.routes.has(path)) {
        const route = state.routes.get(path);
        return schema.parse(typeof route === "function" ? (route as () => unknown)() : route);
    }
    return schema.parse({ run_id: "demo-run" });
}
