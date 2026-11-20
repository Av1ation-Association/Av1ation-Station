import type { ZodType } from "zod";
import type {
    AppSettings,
    GeneralDefaults,
    ParameterDescriptor,
    ProjectDefaultsState,
    ProjectTemplate,
} from "@av1ation/contracts";
import { ApiError } from "../../types";
import { demoScenes } from "../demo";
import type { MockTransport } from "../../mock";

export async function putJson<T>(
    state: MockTransport,
    path: string,
    body: unknown,
    schema: ZodType<T>,
): Promise<T> {
    if (path === "/api/settings/templates/default") {
        const input = body as { id?: unknown };
        const settings = state.routes.get("/api/settings") as AppSettings;
        const id = typeof input.id === "string" ? input.id : null;
        if (id !== null && state.template(id) === undefined) {
            throw new ApiError(400, null, "No project template matches that id.");
        }
        state.routes.set("/api/settings", {
            ...settings,
            default_project_template_id: id ?? undefined,
        });
        return schema.parse(state.templates());
    }
    const templateGeneral = /^\/api\/settings\/templates\/([^/]+)\/general$/u.exec(path);
    if (templateGeneral !== null) {
        const id = decodeURIComponent(templateGeneral[1] ?? "");
        const settings = state.routes.get("/api/settings") as AppSettings;
        const general = body as GeneralDefaults;
        const template = state.template(id);
        if (template === undefined) {
            throw new ApiError(404, null, "No project template matches that id.");
        }
        state.routes.set("/api/settings", {
            ...settings,
            project_templates: settings.project_templates.map((entry) =>
                entry.id === id ? { ...entry, general } : entry,
            ),
        });
        return schema.parse(general);
    }
    const templateDefaults = /^\/api\/settings\/templates\/([^/]+)\/defaults$/u.exec(path);
    if (templateDefaults !== null) {
        const id = decodeURIComponent(templateDefaults[1] ?? "");
        if (state.template(id) === undefined) {
            throw new ApiError(404, null, "No project template matches that id.");
        }
        state.templateDefaults.set(id, body as Record<string, unknown>);
        return schema.parse(state.templateDefaultsFor(id));
    }
    const templateUpdate = /^\/api\/settings\/templates\/([^/]+)$/u.exec(path);
    if (templateUpdate !== null) {
        const id = decodeURIComponent(templateUpdate[1] ?? "");
        const input = body as {
            name?: unknown;
            config?: unknown;
            general?: GeneralDefaults;
        };
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (name === "") {
            throw new ApiError(400, null, "A template needs a name.");
        }
        const settings = state.routes.get("/api/settings") as AppSettings;
        const current = state.template(id);
        if (current === undefined) {
            throw new ApiError(404, null, "No project template matches that id.");
        }
        const next: ProjectTemplate = {
            ...current,
            name,
            config: input.config ?? current.config,
            general: input.general ?? current.general,
            updated_at: new Date().toISOString(),
        };
        state.routes.set("/api/settings", {
            ...settings,
            project_templates: settings.project_templates.map((entry) =>
                entry.id === id ? next : entry,
            ),
        });
        return schema.parse(next);
    }
    const projectConfig =
        /^\/api\/projects\/([^/]+)\/config(?:\?clear_chunks=(?:true|false))?$/u.exec(path);
    if (projectConfig !== null) {
        const projectId = decodeURIComponent(projectConfig[1] ?? "");
        if (state.projects().find((entry) => entry.id === projectId) === undefined) {
            throw new ApiError(404, null, "No such project.");
        }
        state.projectConfigs.set(projectId, body as Record<string, unknown>);
        return schema.parse(state.projectConfigFor(projectId));
    }
    const restoreDefaults = /^\/api\/projects\/([^/]+)\/defaults$/u.exec(path);
    if (restoreDefaults !== null) {
        const projectId = decodeURIComponent(restoreDefaults[1] ?? "");
        const found = state.project(`/api/projects/${projectId}`);
        const project = found?.projects[found.index];
        if (project === undefined) {
            throw new ApiError(404, null, "No project matches that id.");
        }
        const defaults = body as ProjectDefaultsState;
        state.general.set(projectId, defaults.general);
        return schema.parse({
            id: project.id,
            name: project.name,
            description: null,
            created_at: project.created_at,
            accessed_at: project.accessed_at,
            general: defaults.general,
        });
    }
    const videoOverrides = /^\/api\/projects\/([^/]+)\/videos\/([^/]+)\/overrides$/u.exec(path);
    if (videoOverrides !== null) {
        const projectId = decodeURIComponent(videoOverrides[1] ?? "");
        const videoId = decodeURIComponent(videoOverrides[2] ?? "");
        const fields = (body as { fields?: unknown }).fields;
        state.videoOverrideFields.set(
            `${projectId}/${videoId}`,
            typeof fields === "object" && fields !== null
                ? (fields as Record<string, unknown>)
                : {},
        );
        return schema.parse(state.videoConfigFor(projectId, videoId));
    }
    const videoStorage = /^\/api\/projects\/[^/]+\/videos\/([^/]+)\/storage$/u.exec(path);
    if (videoStorage !== null) {
        const id = decodeURIComponent(videoStorage[1] ?? "");
        const inherited = `C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\temp\\${id}`;
        const requested = (body as { directory?: unknown }).directory;
        const directory =
            typeof requested === "string" && requested.trim() !== "" ? requested : inherited;
        return schema.parse({
            directory,
            inherited_directory: inherited,
            custom: directory !== inherited,
            retained_bytes: 0,
            free_bytes: 780_000_000_000,
            total_bytes: 2_000_000_000_000,
        });
    }
    // The demo has no engine checkpoint to rewrite, so scene edits are acknowledged
    // without changing the fixture table.
    const sceneEdit =
        /^\/api\/projects\/[^/]+\/videos\/[^/]+\/scenes\/(?:add|split|merge|reset)$/u.exec(path);
    if (sceneEdit !== null) {
        return schema.parse(undefined);
    }
    const sceneEncoder = /^\/api\/projects\/[^/]+\/videos\/([^/]+)\/scenes\/encoder$/u.exec(path);
    if (sceneEncoder !== null) {
        return schema.parse(demoScenes(decodeURIComponent(sceneEncoder[1] ?? "")));
    }
    const generalRoute = /^\/api\/projects\/([^/]+)\/general$/u.exec(path);
    if (generalRoute !== null) {
        const projectId = decodeURIComponent(generalRoute[1] ?? "");
        const project = state.projects().find((entry) => entry.id === projectId);
        if (project === undefined) {
            throw new ApiError(404, null, "No such project.");
        }
        const input = body as GeneralDefaults;
        if (input.output_mode === "folder" && (input.output_folder ?? "").trim() === "") {
            throw new ApiError(422, null, "Specific-folder output needs a folder path.");
        }
        const next: GeneralDefaults = {
            input_kind: input.input_kind,
            output_mode: input.output_mode,
            ...(input.output_mode === "folder"
                ? { output_folder: (input.output_folder ?? "").trim() }
                : {}),
            ...(input.input_kind === "ffms2" && (input.index_file ?? "") !== ""
                ? { index_file: input.index_file }
                : {}),
            ...(input.input_kind === "vapour_synth"
                ? { import_method: input.import_method ?? "best_source" }
                : {}),
            ...(input.input_kind === "vapour_synth_script"
                ? input.script_mode === "text"
                    ? {
                          script_mode: "text",
                          script_text: input.script_text ?? "",
                      }
                    : { script_mode: "file", script: input.script ?? "" }
                : {}),
            ...(input.input_kind === "ffms2" ? { ffms2_filters: input.ffms2_filters ?? [] } : {}),
            ...(input.input_kind === "vapour_synth"
                ? { vapour_synth_filters: input.vapour_synth_filters ?? [] }
                : {}),
        };
        state.general.set(projectId, next);
        return schema.parse({
            id: project.id,
            name: project.name,
            description: null,
            created_at: project.created_at,
            accessed_at: new Date().toISOString(),
            general: next,
        });
    }
    const fork = /^\/api\/encoders\/forks\/([^/]+)$/u.exec(path);
    if (fork !== null) {
        const id = decodeURIComponent(fork[1] ?? "");
        const entry = state.forks.find((candidate) => candidate.record.id === id);
        if (entry === undefined) {
            throw new ApiError(404, null, "No encoder fork matches that id.");
        }
        const input = body as {
            label?: string;
            path?: string;
            parameters?: Record<string, ParameterDescriptor>;
        };
        entry.record = {
            ...entry.record,
            label: input.label ?? entry.record.label,
            executable: input.path ?? entry.record.executable,
            parameters: input.parameters ?? entry.record.parameters,
        };
        entry.descriptor = {
            ...entry.descriptor,
            label: entry.record.label,
            executable: entry.record.executable,
            parameters: input.parameters ?? entry.descriptor.parameters,
        };
        return schema.parse(entry.record);
    }
    if (path === "/api/settings/tool-source") {
        const input = body as { id?: unknown; source?: unknown };
        if (typeof input.id !== "string" || input.id.trim() === "") {
            throw new ApiError(400, null, "Choose a dependency row.");
        }
        if (
            input.source !== undefined &&
            input.source !== null &&
            input.source !== "bundled" &&
            input.source !== "system"
        ) {
            throw new ApiError(400, null, "Choose bundled, system, or null.");
        }
        // The request names the inventory row; the settings document stores the
        // capability, matching the service's shared `metrics` and `ffmpeg` keys.
        const setting = state.toolSetting(input.id.trim());
        if (setting === null) {
            throw new ApiError(400, null, "This row has no provider choice.");
        }
        const source =
            input.source === "bundled" || input.source === "system" ? input.source : null;
        const current = state.routes.get("/api/settings") as AppSettings;
        const toolSources = { ...(current.tool_sources ?? {}) };
        if (source === null) {
            delete toolSources[setting];
        } else {
            toolSources[setting] = source;
        }
        const next: AppSettings = { ...current, tool_sources: toolSources };
        state.routes.set("/api/settings", next);
        // The inventory reports the saved choice next to the source this process loaded,
        // so a demo row shows the same pending restart the service reports.
        state.syncPreflight();
        return schema.parse(next);
    }
    if (path === "/api/settings/python-interpreter") {
        const input = body as { path?: unknown };
        const candidate = typeof input.path === "string" ? input.path.trim() : "";
        const current = state.routes.get("/api/settings") as AppSettings;
        const next: AppSettings = { ...current };
        if (candidate === "") {
            delete next.python_interpreter;
        } else {
            next.python_interpreter = candidate;
        }
        state.routes.set("/api/settings", next);
        return schema.parse(next);
    }
    if (path === "/api/settings/scene-model") {
        const input = body as { path?: unknown };
        const candidate = typeof input.path === "string" ? input.path.trim() : "";
        const current = state.routes.get("/api/settings") as AppSettings;
        const next: AppSettings = { ...current };
        if (candidate === "") {
            delete next.scene_model;
        } else {
            next.scene_model = candidate;
        }
        state.routes.set("/api/settings", next);
        return schema.parse(next);
    }
    if (path !== "/api/settings") {
        throw new ApiError(404, null, `No mock route for ${path}.`);
    }
    const current = state.routes.get(path) as AppSettings;
    const update = body as Partial<AppSettings>;
    const next: AppSettings = {
        ...current,
        ...update,
        custom_tools: current.custom_tools,
        encoder_forks: current.encoder_forks,
    };
    state.routes.set(path, next);
    return schema.parse(next);
}
