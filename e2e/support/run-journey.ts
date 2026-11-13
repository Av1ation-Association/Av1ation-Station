import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import {
    EffectiveConfigSchema,
    EncodeEventSchema,
    ErrorBodySchema,
    ProjectSchema,
    RunStartedSchema,
    SceneListSchema,
    VideoDetailSchema,
    VideoGeneralSchema,
    VideoHistorySchema,
    VideoStateSchema,
    VideoValidationSchema,
    type ConfigOverrides,
    type EffectiveConfig,
    type EncodeEvent,
    type EncodeEventKind,
    type ErrorBody,
    type SceneList,
    type VideoGeneral,
    type VideoGeneralRequest,
    type VideoHistory,
    type VideoState,
    type VideoValidation,
} from "@av1ation/contracts";
import {
    projectPath,
    projectsPath,
    runEventsPath,
    videoEncodePath,
    videoGeneralPath,
    videoHistoryPath,
    videoOverridesPath,
    videoScenesAddPath,
    videoScenesPath,
    videoScenesUndoPath,
    videoStatePath,
    videoValidatePath,
    videosPath,
} from "@av1ation/api/paths";
import type { ZodType } from "zod";

/** One failure from the E2E host, carrying enough context to diagnose the request. */
export class E2eRequestError extends Error {
    constructor(
        readonly method: string,
        readonly path: string,
        readonly status: number,
        readonly body: ErrorBody | null,
        message: string,
        readonly detail: string | null = null,
    ) {
        super(message);
        this.name = "E2eRequestError";
    }
}

/** A run-level terminal event and the outcome event that preceded it. */
export interface RunTerminal {
    outcome: EncodeEventKind;
    event: EncodeEvent;
    events: EncodeEvent[];
}

/** Per-wait overrides; the default is deliberately longer than the screen's poll window. */
export interface WaitOptions {
    timeout?: number;
    message?: string;
}

/** The two absolute paths a queued video needs. The spec owns the files themselves. */
export interface VideoInput {
    name: string;
    inputPath: string;
    outputPath: string;
}

/** A run-scoped handle, so the test does not pass Project/Video/Run ids to every wait. */
export interface RunHandle {
    readonly id: string;
    readonly projectId: string;
    readonly videoId: string;
    waitForEvents: (
        kinds: readonly EncodeEventKind[],
        options?: WaitOptions,
    ) => Promise<EncodeEvent[]>;
    waitForTerminal: (options?: WaitOptions) => Promise<RunTerminal>;
    waitForIdle: (options?: WaitOptions) => Promise<VideoState>;
    history: () => Promise<VideoHistory>;
    cancel: () => Promise<void>;
}

/** A video handle that can start a run or attach to one the browser already started. */
export interface VideoHandle {
    readonly id: string;
    readonly projectId: string;
    startRun: () => Promise<RunHandle>;
    /** The typed 409 refusal a second start receives while another run owns the lock. */
    attemptStart: () => Promise<ErrorBody>;
    run: (runId: string) => RunHandle;
    state: () => Promise<VideoState>;
    history: () => Promise<VideoHistory>;
    general: () => Promise<VideoGeneral>;
    /** The per-video preflight projection, including blockers that disable Start. */
    validate: () => Promise<VideoValidation>;
    /** The typed 423 refusal an active video's General write receives. */
    attemptSaveGeneral: (document: VideoGeneralRequest) => Promise<ErrorBody>;
    /** The typed 423 refusal an active video's override write receives. */
    attemptSaveOverrides: (overrides: ConfigOverrides) => Promise<ErrorBody>;
    saveOverrides: (overrides: ConfigOverrides) => Promise<EffectiveConfig>;
    /** Seed a range before a scene-detector checkpoint exists. */
    addScene: (range: { start_frame: number; end_frame: number }) => Promise<SceneList>;
    scenes: () => Promise<SceneList>;
    /** Restore the table the last structural edit or bulk encoder write replaced. */
    undoSceneEdit: () => Promise<void>;
}

/** A project handle; addVideo uses the HTTP surface, video attaches to a queue row. */
export interface ProjectHandle {
    readonly id: string;
    addVideo: (input: VideoInput) => Promise<VideoHandle>;
    video: (videoId: string) => VideoHandle;
    /** Deletes the project and its retained chunks; source media is untouched. */
    delete: () => Promise<void>;
}

/** The scenario seam: create or attach, then drive and observe runs. */
export interface RunJourney {
    createProject: (name: string) => Promise<ProjectHandle>;
    project: (projectId: string) => ProjectHandle;
}

type JsonBody = Record<string, unknown>;

const DEFAULT_WAIT_MS = 15_000;

/**
 * Build the E2E run-journey module for one headless host.
 *
 * The module intentionally owns the wire and the waits, not the browser. A spec can create
 * a Project and its Videos through the HTTP surface, or attach to rows it created through
 * the UI, then assert the visible behaviour without retyping endpoint and polling logic.
 */
export function createRunJourney(request: APIRequestContext, origin: string): RunJourney {
    const baseUrl = origin.replace(/\/$/u, "");

    return {
        async createProject(name) {
            const path = projectsPath();
            const response = await send(request, baseUrl, "POST", path, { name }, 201);
            const project = await readJson(response, ProjectSchema, "POST", path);
            return projectHandle(request, baseUrl, project.id);
        },
        project(projectId) {
            return projectHandle(request, baseUrl, projectId);
        },
    };
}

function projectHandle(
    request: APIRequestContext,
    baseUrl: string,
    projectId: string,
): ProjectHandle {
    return {
        id: projectId,
        async addVideo(input) {
            const path = videosPath(projectId);
            const response = await send(
                request,
                baseUrl,
                "POST",
                path,
                {
                    input_path: input.inputPath,
                    name: input.name,
                    output_path: input.outputPath,
                },
                201,
            );
            const video = await readJson(response, VideoDetailSchema, "POST", path);
            return videoHandle(request, baseUrl, projectId, video.id);
        },
        video(videoId) {
            return videoHandle(request, baseUrl, projectId, videoId);
        },
        async delete() {
            const path = projectPath(projectId);
            await send(request, baseUrl, "DELETE", path, undefined, 204);
        },
    };
}

function videoHandle(
    request: APIRequestContext,
    baseUrl: string,
    projectId: string,
    videoId: string,
): VideoHandle {
    const state = async () => {
        const path = videoStatePath(projectId, videoId);
        const response = await send(request, baseUrl, "GET", path, undefined, 200);
        return await readJson(response, VideoStateSchema, "GET", path);
    };
    const history = async () => {
        const path = videoHistoryPath(projectId, videoId);
        const response = await send(request, baseUrl, "GET", path, undefined, 200);
        return await readJson(response, VideoHistorySchema, "GET", path);
    };
    const general = async () => {
        const path = videoGeneralPath(projectId, videoId);
        const response = await send(request, baseUrl, "GET", path, undefined, 200);
        return await readJson(response, VideoGeneralSchema, "GET", path);
    };
    const validate = async () => {
        const path = videoValidatePath(projectId, videoId);
        const response = await send(request, baseUrl, "POST", path, {}, 200);
        return await readJson(response, VideoValidationSchema, "POST", path);
    };
    const scenes = async () => {
        const path = videoScenesPath(projectId, videoId);
        const response = await send(request, baseUrl, "GET", path, undefined, 200);
        return await readJson(response, SceneListSchema, "GET", path);
    };

    return {
        id: videoId,
        projectId,
        async startRun() {
            const path = videoEncodePath(projectId, videoId);
            const response = await send(request, baseUrl, "POST", path, {}, 202);
            const started = await readJson(response, RunStartedSchema, "POST", path);
            return runHandle(request, baseUrl, projectId, videoId, started.run_id);
        },
        async attemptStart() {
            return await sendError(
                request,
                baseUrl,
                "POST",
                videoEncodePath(projectId, videoId),
                {},
                409,
            );
        },
        run(runId) {
            return runHandle(request, baseUrl, projectId, videoId, runId);
        },
        state,
        history,
        general,
        validate,
        async attemptSaveGeneral(document) {
            return await sendError(
                request,
                baseUrl,
                "PUT",
                videoGeneralPath(projectId, videoId),
                document,
                423,
            );
        },
        async attemptSaveOverrides(overrides) {
            return await sendError(
                request,
                baseUrl,
                "PUT",
                videoOverridesPath(projectId, videoId),
                overrides,
                423,
            );
        },
        async saveOverrides(overrides) {
            const path = videoOverridesPath(projectId, videoId);
            const response = await send(request, baseUrl, "PUT", path, overrides, 200);
            return await readJson(response, EffectiveConfigSchema, "PUT", path);
        },
        async addScene(range) {
            const path = videoScenesAddPath(projectId, videoId);
            await send(request, baseUrl, "POST", path, range, 204);
            return await scenes();
        },
        scenes,
        async undoSceneEdit() {
            const path = videoScenesUndoPath(projectId, videoId);
            await send(request, baseUrl, "POST", path, undefined, 204);
        },
    };
}

function runHandle(
    request: APIRequestContext,
    baseUrl: string,
    projectId: string,
    videoId: string,
    runId: string,
): RunHandle {
    const readEvents = async () => {
        const path = `${runEventsPath(runId)}?since=0`;
        const response = await send(request, baseUrl, "GET", path, undefined, 200);
        return await readJson(response, EncodeEventSchema.array(), "GET", path);
    };
    const readState = async () => {
        const path = videoStatePath(projectId, videoId);
        const response = await send(request, baseUrl, "GET", path, undefined, 200);
        return await readJson(response, VideoStateSchema, "GET", path);
    };
    const readHistory = async () => {
        const path = videoHistoryPath(projectId, videoId);
        const response = await send(request, baseUrl, "GET", path, undefined, 200);
        return await readJson(response, VideoHistorySchema, "GET", path);
    };

    return {
        id: runId,
        projectId,
        videoId,
        async waitForEvents(kinds, options = {}) {
            let events: EncodeEvent[] = [];
            await expect
                .poll(
                    async () => {
                        events = await readEvents();
                        return events.map((event) => event.kind);
                    },
                    pollOptions(options, `Run ${runId} did not report ${kinds.join(", ")}.`),
                )
                .toEqual(expect.arrayContaining([...kinds]));
            return events;
        },
        async waitForTerminal(options = {}) {
            let terminal: RunTerminal | null = null;
            await expect
                .poll(
                    async () => {
                        const events = await readEvents();
                        terminal = terminalFrom(events);
                        return terminal?.outcome ?? null;
                    },
                    pollOptions(options, `Run ${runId} did not reach a terminal outcome.`),
                )
                .not.toBeNull();
            if (terminal === null) {
                throw new Error(`Run ${runId} reached no terminal outcome.`);
            }
            return terminal;
        },
        async waitForIdle(options = {}) {
            let state = await readState();
            await expect
                .poll(
                    async () => {
                        state = await readState();
                        return state.active;
                    },
                    pollOptions(options, `Run ${runId} did not release the encode lock.`),
                )
                .toBe(false);
            return state;
        },
        history: readHistory,
        async cancel() {
            const path = videoEncodePath(projectId, videoId);
            await send(request, baseUrl, "DELETE", path, undefined, 202);
        },
    };
}

function terminalFrom(events: EncodeEvent[]): RunTerminal | null {
    const finished = events.find((event) => event.kind === "finished");
    if (finished === undefined) {
        return null;
    }
    const outcome = [...events].reverse().find((event) => isTerminalOutcome(event.kind));
    if (outcome === undefined) {
        return null;
    }
    return { outcome: outcome.kind, event: finished, events };
}

function isTerminalOutcome(kind: EncodeEventKind): boolean {
    return kind === "completed" || kind === "cancelled" || kind === "failed";
}

function pollOptions(options: WaitOptions, message: string) {
    return {
        timeout: options.timeout ?? DEFAULT_WAIT_MS,
        message: options.message ?? message,
    };
}

async function send(
    request: APIRequestContext,
    baseUrl: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    data: JsonBody | undefined,
    expectedStatus: number,
): Promise<APIResponse> {
    let response: APIResponse;
    try {
        response = await request.fetch(`${baseUrl}${path}`, {
            method,
            failOnStatusCode: false,
            ...(data === undefined ? {} : { data }),
        });
    } catch (error) {
        throw new E2eRequestError(
            method,
            path,
            0,
            null,
            `The E2E host could not be reached for ${method} ${path}.`,
            String(error),
        );
    }

    if (response.status() !== expectedStatus) {
        const { body, detail } = await readError(response);
        const suffix = body === null ? "" : ` ${body.code}: ${body.message}`;
        throw new E2eRequestError(
            method,
            path,
            response.status(),
            body,
            `${method} ${path} returned HTTP ${String(response.status())}.${suffix}`,
            detail,
        );
    }
    return response;
}

/** Request a status the journey expects to be refused, and return its typed envelope. */
async function sendError(
    request: APIRequestContext,
    baseUrl: string,
    method: "POST" | "PUT",
    path: string,
    data: JsonBody,
    expectedStatus: number,
): Promise<ErrorBody> {
    let response: APIResponse;
    try {
        response = await request.fetch(`${baseUrl}${path}`, {
            method,
            failOnStatusCode: false,
            data,
        });
    } catch (error) {
        throw new E2eRequestError(
            method,
            path,
            0,
            null,
            `The E2E host could not be reached for ${method} ${path}.`,
            String(error),
        );
    }

    const { body, detail } = await readError(response);
    if (response.status() !== expectedStatus) {
        const suffix = body === null ? "" : ` ${body.code}: ${body.message}`;
        throw new E2eRequestError(
            method,
            path,
            response.status(),
            body,
            `${method} ${path} returned HTTP ${String(response.status())}; expected ${String(expectedStatus)}.${suffix}`,
            detail,
        );
    }
    if (body === null) {
        throw new E2eRequestError(
            method,
            path,
            response.status(),
            null,
            `${method} ${path} returned no error envelope.`,
            detail,
        );
    }
    return body;
}

async function readJson<T>(
    response: APIResponse,
    schema: ZodType<T>,
    method: string,
    path: string,
): Promise<T> {
    let payload: unknown;
    try {
        payload = await response.json();
    } catch (error) {
        throw new E2eRequestError(
            method,
            path,
            response.status(),
            null,
            `${method} ${path} did not return JSON.`,
            String(error),
        );
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        throw new E2eRequestError(
            method,
            path,
            response.status(),
            null,
            `${method} ${path} returned a response that does not match its contract.`,
            parsed.error.message,
        );
    }
    return parsed.data;
}

async function readError(
    response: APIResponse,
): Promise<{ body: ErrorBody | null; detail: string | null }> {
    let text: string;
    try {
        text = await response.text();
    } catch {
        return { body: null, detail: null };
    }
    if (text.trim() === "") {
        return { body: null, detail: null };
    }
    try {
        const parsed = ErrorBodySchema.safeParse(JSON.parse(text) as unknown);
        return parsed.success ? { body: parsed.data, detail: null } : { body: null, detail: text };
    } catch {
        return { body: null, detail: text };
    }
}
