import type { ZodType } from "zod";

import type {
    AppInfo,
    AppSettings,
    EncoderDescriptor,
    EncoderFork,
    GeneralDefaults,
    LogRecord,
    ParameterDescriptor,
    PreflightCheck,
    ProjectSummary,
    ProjectTemplate,
    TimelineRecord,
    VideoSummary,
    VideoValidation,
} from "@av1ation/contracts";
import type { Transport } from "./types";
import type { MockFixtures } from "./mock/fixtures";
import { get as getRoute } from "./mock/routes/get";
import { post as postRoute } from "./mock/routes/post";
import { put as putRoute } from "./mock/routes/put";
import { putJson as putJsonRoute } from "./mock/routes/putJson";
import { patchJson as patchJsonRoute } from "./mock/routes/patchJson";
import { deleteRoute } from "./mock/routes/delete";
import {
    fixtures,
    MOCK_ENCODERS,
    MOCK_FILTER_SCHEMAS,
    MOCK_SCRIPT_GUIDE,
    MOCK_TOOLCHAIN,
} from "./mock/fixtures";
import { pickBrowserFile, pickBrowserFiles } from "./mock/pickers";

export interface EffectiveConfigValues {
    values: Record<string, { source: string; value: unknown }>;
}

/** Flattens a configuration document into the service's dotted effective leaves. */
function effectiveConfigValues(document: Record<string, unknown>): EffectiveConfigValues {
    const values: EffectiveConfigValues["values"] = {};
    const walk = (value: unknown, prefix: string): void => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            if (prefix !== "") {
                values[prefix] = { source: "default", value };
            }
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            walk(child, prefix === "" ? key : `${prefix}.${key}`);
        }
    };
    walk(document, "");
    return { values };
}

export class MockTransport implements Transport {
    readonly routes: Map<string, unknown>;
    readonly health: AppInfo;
    readonly baseChecks: PreflightCheck[];
    customChecks: Array<{ target: string; check: PreflightCheck }> = [];
    /** Queue rows per project, so the demo's project screen behaves like the service. */
    readonly videos = new Map<string, VideoSummary[]>();
    /** General defaults per project, so the editor round-trips in the demo. */
    readonly general = new Map<string, GeneralDefaults>();
    /** Project configuration documents, keyed by project id, so a section save round-trips. */
    readonly projectConfigs = new Map<string, Record<string, unknown>>();
    /** Sparse video overrides, keyed by `project/video`, so a section save round-trips. */
    readonly videoOverrideFields = new Map<string, Record<string, unknown>>();
    /** Template configuration documents, keyed by template id, so a section save round-trips. */
    readonly templateDefaults = new Map<string, Record<string, unknown>>();
    /** The demo's clean preflight unless a route test or fixture supplies another. */
    validation: Partial<VideoValidation> | undefined;
    /** Saved encoder forks, so the Encoders tab round-trips without a backend. */
    forks: Array<{ record: EncoderFork; descriptor: EncoderDescriptor }> = [];
    /** User edits to the demo's built-in descriptors, keyed by encoder id. */
    readonly parameterOverrides = new Map<string, Record<string, ParameterDescriptor>>();
    /** Runs whose demo log was deleted, so the viewer and its list agree. */
    readonly deletedRuns = new Set<string>();
    /** Per-video History entries, keyed by video id; empty unless a fixture seeds them. */
    readonly history = new Map<string, TimelineRecord[]>();
    /** Per-video run summaries, keyed by video id; absent uses the demo runs. */
    readonly runs = new Map<string, unknown[]>();
    /** Per-video scene tables, keyed by `project/video`; absent uses the demo table. */
    readonly scenes = new Map<string, unknown>();
    /** Captured run logs, keyed by run id; absent synthesises the demo's own records. */
    readonly logs = new Map<string, LogRecord[]>();
    /** The demo offers a browser file picker and synthesises a demo path. */
    readonly pickFile: Transport["pickFile"] =
        typeof document === "undefined"
            ? undefined
            : (request) =>
                  pickBrowserFile(
                      request?.extensions === undefined || request.extensions.length === 0
                          ? "*/*"
                          : request.extensions.map((extension) => `.${extension}`).join(","),
                  );
    /** The demo has no executable picker; the shared text field remains. */
    readonly pickExecutable: (() => Promise<string | null>) | undefined;
    /** The demo has no host filesystem, so a text export falls back to a download. */
    readonly saveTextFile: Transport["saveTextFile"];
    /** The demo suggests an output name rather than opening the host's save dialog. */
    readonly pickSaveFile =
        typeof document === "undefined"
            ? undefined
            : async () => "C:\\Users\\demo\\Videos\\output.mkv";
    /** The demo offers a browser file picker and synthesises a demo path. */
    readonly pickVideoFile =
        typeof document === "undefined" ? undefined : () => pickBrowserFile("video/*");
    /** The demo picks several videos at once for the queue's add sheet. */
    readonly pickVideoFiles =
        typeof document === "undefined" ? undefined : () => pickBrowserFiles("video/*");
    /** The demo picks a script file and synthesises a demo path. */
    readonly pickScript =
        typeof document === "undefined" ? undefined : () => pickBrowserFile(".vpy,.py,text/plain");
    /** The demo picks an FFMS2 index file and synthesises a demo path. */
    readonly pickIndex =
        typeof document === "undefined" ? undefined : () => pickBrowserFile(".ffindex");
    /** The demo picks an ONNX model and synthesises a demo path. */
    readonly pickModel =
        typeof document === "undefined" ? undefined : () => pickBrowserFile(".onnx");
    /** A browser directory handle cannot expose its host path, so the demo uses a folder name. */
    readonly pickDirectory =
        typeof document === "undefined"
            ? undefined
            : async () => {
                  const picker = (
                      window as {
                          showDirectoryPicker?: () => Promise<{ name: string }>;
                      }
                  ).showDirectoryPicker;
                  if (picker === undefined) {
                      return null;
                  }
                  const handle = await picker();
                  return `C:\\Users\\demo\\${handle.name}`;
              };
    /** A browser tab cannot reveal a path in a file manager. */
    readonly revealPath = undefined;
    /** A browser tab cannot open a host path either. */
    readonly openPath = undefined;
    /** Only a test seam here; the demo must not restart the browser tab. */
    readonly restartApp: Transport["restartApp"] = undefined;
    /** The demo has no media bytes to range over unless its fixture supplies a mapping. */
    readonly mediaUrl: Transport["mediaUrl"];
    /** A test seam for the desktop notification surface; the browser demo has none. */
    readonly notify: Transport["notify"];
    /** The demo cannot own a language-server process, so completion stays bundled. */
    readonly openLanguageServer = undefined;

    /**
     * `pickers` is a test seam only: the demo and website hosts deliberately expose no
     * native file picker, while a component test needs one to exercise Locate.
     */
    constructor(
        overrides: Partial<MockFixtures> = {},
        pickers: {
            pickFile?: Transport["pickFile"];
            pickExecutable?: () => Promise<string | null>;
            pickIndex?: () => Promise<string | null>;
            pickModel?: () => Promise<string | null>;
            saveTextFile?: Transport["saveTextFile"];
            restartApp?: Transport["restartApp"];
            notify?: Transport["notify"];
        } = {},
    ) {
        this.restartApp = pickers.restartApp;
        this.notify = pickers.notify;
        this.pickFile = pickers.pickFile ?? this.pickFile;
        this.saveTextFile = pickers.saveTextFile;
        this.pickExecutable = pickers.pickExecutable;
        this.pickIndex = pickers.pickIndex ?? this.pickIndex;
        this.pickModel = pickers.pickModel ?? this.pickModel;
        this.validation = overrides.validation;
        this.mediaUrl = overrides.mediaUrl;
        const source = overrides.health ?? fixtures.health;
        this.health = {
            ...source,
            preflight: {
                ...source.preflight,
                checks: source.preflight.checks.map((check) => ({ ...check })),
            },
        };
        this.baseChecks = this.health.preflight.checks.map((check) => ({
            ...check,
        }));
        this.routes = new Map<string, unknown>([
            ["/api/health", this.health],
            ["/api/toolchain", overrides.toolchain ?? MOCK_TOOLCHAIN],
            ["/api/preflight/refresh", () => this.health.preflight],
            ["/api/projects", [...(overrides.projects ?? fixtures.projects)]],
            ["/api/settings", overrides.settings ?? fixtures.settings],
            [
                "/api/encoders",
                () => [
                    ...MOCK_ENCODERS.map((encoder) => ({
                        id: encoder.id,
                        base: encoder.id,
                        label: encoder.label,
                        default: encoder.default,
                        parameters: this.parametersFor(encoder.id),
                        source: "Builtin",
                        version: encoder.version,
                        available: true,
                        fork: false,
                        overridden: this.parameterOverrides.has(encoder.id),
                        ...this.customProvider(
                            encoder.id === "ffmpeg" ? "ffmpeg" : `encoder:${encoder.id}`,
                        ),
                    })),
                    ...this.forks.map((entry) => entry.descriptor),
                ],
            ],
            [
                "/api/storage",
                {
                    temporary_directory:
                        "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\temp",
                    default_directory:
                        "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\temp",
                    free_bytes: 780_000_000_000,
                    total_bytes: 2_000_000_000_000,
                    retained_bytes: 0,
                    video_count: 0,
                    app_data_bytes: 0,
                    app_data_directory: "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station",
                    log_bytes: 0,
                    manifest_bytes: 0,
                    catalogue_bytes: 0,
                    projects: [],
                },
            ],
            // The demo carries no engine schema, so the global template is an empty document
            // and the defaults editor renders the same empty section it would for a project.
            ["/api/settings/defaults", { values: {}, provenance: {} }],
            ["/api/settings/defaults/reset", { values: {}, provenance: {} }],
            ["/api/settings/defaults/scripts", { problems: [] }],
            [
                "/api/settings/defaults/general",
                {
                    input_kind: "ffms2",
                    output_mode: "next_to_input",
                    ffms2_filters: [{ OutputFormat: { bit_depth: 10 } }],
                    vapour_synth_filters: [{ Resize: { format: "YUV420P10LE" } }],
                },
            ],
            // The demo has no engine schema. Empty objects keep the section editors in
            // their empty state instead of failing the whole page.
            ["/api/config/schema", { encoder: {}, sequences: {} }],
            ["/api/config/filters", MOCK_FILTER_SCHEMAS],
            // The demo mirrors the generated module's shape, so the script page renders its
            // tabs and its injected-data table without a service behind it.
            ["/api/config/script-guide", MOCK_SCRIPT_GUIDE],
            [
                "/api/lan",
                {
                    enabled: false,
                    url: null,
                    token: null,
                    port: null,
                    bind: "127.0.0.1",
                    sessions: [],
                },
            ],
        ]);
    }

    parametersFor(id: string): Record<string, ParameterDescriptor> {
        const override = this.parameterOverrides.get(id);
        if (override !== undefined) {
            return override;
        }
        return MOCK_ENCODERS.find((encoder) => encoder.id === id)?.parameters ?? {};
    }

    /** A saved custom provider, projected onto its catalogue row the way the service does. */
    customProvider(target: string) {
        const check = this.customChecks.find((entry) => entry.target === target)?.check;
        return check === undefined || check.path === undefined
            ? {}
            : {
                  executable: check.path,
                  version: check.detail,
                  available: true,
              };
    }

    /** The settings key a dependency row saves its provider choice under. */
    toolSetting(row: string): string | null {
        if (row === "metric:xpsnr") {
            return null;
        }
        if (row.startsWith("metric:")) {
            return "metrics";
        }
        if (row === "vapoursynth" || row === "mkvmerge") {
            return row;
        }
        if (!row.startsWith("encoder:")) {
            return null;
        }
        return row === "encoder:ffmpeg" ? "ffmpeg" : row;
    }

    syncPreflight() {
        const replaced = new Set(
            this.customChecks.filter((entry) => entry.check.available).map((entry) => entry.target),
        );
        const settings = this.routes.get("/api/settings") as AppSettings | undefined;
        const sources = settings?.tool_sources ?? {};
        const checks = [
            ...this.baseChecks.filter((check) => !replaced.has(check.id)),
            ...this.customChecks.map((entry) => entry.check),
        ].map((check) => {
            const setting = this.toolSetting(check.id);
            const configured = setting === null ? undefined : sources[setting];
            return configured === undefined ? check : { ...check, configured_source: configured };
        });
        this.health.preflight = {
            checks,
            available_count: checks.filter((check) => check.available).length,
            total_count: checks.length,
        };
        if (settings !== undefined) {
            this.routes.set("/api/settings", {
                ...settings,
                encoder_forks: this.forks.map((entry) => entry.record),
                custom_tools: this.customChecks
                    .filter((entry) => entry.check.available && entry.check.path !== undefined)
                    .map((entry) => ({
                        kind: entry.check.id.replace(/^custom:/u, ""),
                        path: entry.check.path ?? "",
                    })),
            });
        }
    }
    generalFor(projectId: string): GeneralDefaults {
        const existing = this.general.get(projectId);
        if (existing !== undefined) {
            return existing;
        }
        const created: GeneralDefaults = {
            input_kind: "ffms2",
            output_mode: "next_to_input",
            ffms2_filters: [{ OutputFormat: { bit_depth: 10 } }],
            vapour_synth_filters: [{ Resize: { format: "YUV420P10LE" } }],
        };
        this.general.set(projectId, created);
        return created;
    }

    /** The effective values shape the section editors read from the service. */
    projectConfigFor(projectId: string): EffectiveConfigValues {
        return effectiveConfigValues(this.projectConfigs.get(projectId) ?? {});
    }

    /** One template's effective defaults, or an empty document before the first save. */
    templateDefaultsFor(templateId: string): EffectiveConfigValues {
        return effectiveConfigValues(this.templateDefaults.get(templateId) ?? {});
    }

    /** The video's effective values: its project's leaves with its own roots overlaid. */
    videoConfigFor(projectId: string, videoId: string): EffectiveConfigValues {
        const values = effectiveConfigValues(this.projectConfigs.get(projectId) ?? {}).values;
        for (const [path, value] of Object.entries(this.overridesFor(projectId, videoId))) {
            values[path] = { source: "overridden", value };
        }
        return { values };
    }

    /** The raw sparse override map, so a section save keeps fields it does not show. */
    overridesFor(projectId: string, videoId: string): Record<string, unknown> {
        return this.videoOverrideFields.get(`${projectId}/${videoId}`) ?? {};
    }

    videosFor(projectId: string): VideoSummary[] {
        const existing = this.videos.get(projectId);
        if (existing !== undefined) {
            return existing;
        }
        const created: VideoSummary[] = [];
        this.videos.set(projectId, created);
        return created;
    }

    syncProjectCounts(projectId: string): void {
        const project = this.projects().find((entry) => entry.id === projectId);
        if (project === undefined) {
            return;
        }
        project.video_count = this.videosFor(projectId).length;
        project.completed_videos = 0;
    }

    projects(): ProjectSummary[] {
        return this.routes.get("/api/projects") as ProjectSummary[];
    }

    templates(): ProjectTemplate[] {
        return (this.routes.get("/api/settings") as AppSettings).project_templates;
    }

    template(id: string): ProjectTemplate | undefined {
        return this.templates().find((template) => template.id === id);
    }

    /** Locates one project row, so the demo's create/rename/delete behave like the service. */
    project(path: string): { index: number; projects: ProjectSummary[] } | null {
        const prefix = "/api/projects/";
        if (!path.startsWith(prefix)) {
            return null;
        }
        const id = decodeURIComponent(path.slice(prefix.length));
        const projects = this.projects();
        const index = projects.findIndex((project) => project.id === id);
        return index === -1 ? null : { index, projects };
    }

    async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        return await getRoute(this, path, schema);
    }
    async post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        return await postRoute(this, path, body, schema);
    }
    async put(path: string, body: unknown): Promise<void> {
        return await putRoute(this, path, body);
    }
    async putJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        return await putJsonRoute(this, path, body, schema);
    }
    async patchJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        return await patchJsonRoute(this, path, body, schema);
    }
    async delete(path: string): Promise<void> {
        return await deleteRoute(this, path);
    }
    subscribe<T>(_path: string, _schema: ZodType<T>, _onEvent: (event: T) => void): () => void {
        return () => {};
    }
}
