import type { ZodType } from "zod";

import { ErrorBodySchema, EventTicketSchema } from "@av1ation/contracts";

import { editorLspPath, eventsTicketPath } from "../api/paths";
import { subscribeToEvents } from "./event-stream";
import {
    ApiError,
    type DesktopNotification,
    type FilePickerRequest,
    type LanguageServerChannel,
    type SaveTextOptions,
    type Transport,
} from "./types";

export interface HttpTransportOptions {
    fetchImpl?: typeof fetch;
    eventSourceFactory?: (url: string) => EventSource;
    /** Host-supplied native file picker. Omitted in a plain browser. */
    pickFile?: (request?: FilePickerRequest) => Promise<string | null>;
    /** Host-supplied native save dialog for an output file. Omitted in a plain browser. */
    pickSaveFile?: (
        request?: FilePickerRequest & { defaultPath?: string },
    ) => Promise<string | null>;
    /** Host-supplied native executable picker. Omitted in a plain browser. */
    pickExecutable?: (defaultPath?: string) => Promise<string | null>;
    /** Host-supplied video picker. Omitted in a plain browser. */
    pickVideoFile?: (defaultPath?: string) => Promise<string | null>;
    /** Host-supplied multi-video picker for a queue batch. Omitted in a plain browser. */
    pickVideoFiles?: () => Promise<readonly string[]>;
    /** Host-supplied directory picker. Omitted in a plain browser. */
    pickDirectory?: (defaultPath?: string) => Promise<string | null>;
    /** Host-supplied save-and-write, with the dialog and the write on the host side. */
    saveTextFile?: (
        suggestedName: string,
        text: string,
        options?: SaveTextOptions,
    ) => Promise<string | null>;
    /** Host-supplied VapourSynth script picker. Omitted in a plain browser. */
    pickScript?: () => Promise<string | null>;
    /** Host-supplied FFMS2 index picker. Omitted in a plain browser. */
    pickIndex?: () => Promise<string | null>;
    /** Host-supplied TransNetV2 ONNX model picker. Omitted in a plain browser. */
    pickModel?: (defaultPath?: string) => Promise<string | null>;
    /** Host-supplied file-manager reveal. Omitted in a plain browser. */
    revealPath?: (path: string) => Promise<void>;
    /** Host-supplied default-handler open. Omitted in a plain browser. */
    openPath?: (path: string) => Promise<void>;
    /** Host-supplied process restart. Omitted in a plain browser and on LAN sessions. */
    restartApp?: () => Promise<void>;
    /** Host-supplied quit-request subscription. Omitted in a plain browser. */
    onQuitRequest?: (handler: () => void) => () => void;
    /** Host-supplied active-run state for the window close decision. */
    setQuitGuard?: (active: boolean) => Promise<void>;
    /** Host-supplied process quit after confirmation. Omitted in a plain browser. */
    quit?: () => Promise<void>;
    /** Host-supplied webview zoom. Omitted in a plain browser. */
    setZoom?: (factor: number) => Promise<void>;
    /** Host-supplied desktop notification. Omitted in a plain browser. */
    notify?: (notification: DesktopNotification) => Promise<void>;
    /** LAN bearer token. The desktop loopback host leaves it absent. */
    token?: string;
    /**
     * Repeatable credential for media URLs, minted for a paired LAN session.
     *
     * A `<video>` cannot attach the bearer header, and one picture makes many range
     * requests, so the service issues a ticket scoped to its media and frame routes. The
     * desktop loopback host needs none and leaves it absent.
     */
    mediaTicket?: string;
}

/** Talks to the embedded service or a LAN server over its HTTP contract. */
export class HttpTransport implements Transport {
    readonly #baseUrl: string;
    readonly #fetch: typeof fetch;
    readonly #eventSource: (url: string) => EventSource;
    readonly #token: string | undefined;
    readonly pickFile: ((request?: FilePickerRequest) => Promise<string | null>) | undefined;
    readonly pickSaveFile: Transport["pickSaveFile"];
    readonly pickExecutable: ((defaultPath?: string) => Promise<string | null>) | undefined;
    readonly pickVideoFile: ((defaultPath?: string) => Promise<string | null>) | undefined;
    readonly pickVideoFiles: (() => Promise<readonly string[]>) | undefined;
    readonly pickDirectory: ((defaultPath?: string) => Promise<string | null>) | undefined;
    readonly saveTextFile: Transport["saveTextFile"];
    readonly pickScript: (() => Promise<string | null>) | undefined;
    readonly pickIndex: (() => Promise<string | null>) | undefined;
    readonly pickModel: ((defaultPath?: string) => Promise<string | null>) | undefined;
    readonly revealPath: ((path: string) => Promise<void>) | undefined;
    readonly openPath: ((path: string) => Promise<void>) | undefined;
    readonly restartApp: (() => Promise<void>) | undefined;
    readonly onQuitRequest: ((handler: () => void) => () => void) | undefined;
    readonly setQuitGuard: ((active: boolean) => Promise<void>) | undefined;
    readonly quit: (() => Promise<void>) | undefined;
    readonly setZoom: ((factor: number) => Promise<void>) | undefined;
    readonly notify: ((notification: DesktopNotification) => Promise<void>) | undefined;
    readonly mediaUrl: ((path: string) => string) | undefined;
    readonly openLanguageServer: (() => Promise<LanguageServerChannel | null>) | undefined;

    constructor(baseUrl: string, options: HttpTransportOptions = {}) {
        this.#baseUrl = baseUrl.replace(/\/$/u, "");
        this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
        this.#eventSource = options.eventSourceFactory ?? ((url) => new EventSource(url));
        this.#token = options.token;
        this.pickFile = options.pickFile;
        this.pickSaveFile = options.pickSaveFile;
        this.pickExecutable = options.pickExecutable;
        this.pickVideoFile = options.pickVideoFile;
        this.pickVideoFiles = options.pickVideoFiles;
        this.pickDirectory = options.pickDirectory;
        this.saveTextFile = options.saveTextFile;
        this.pickScript = options.pickScript;
        this.pickIndex = options.pickIndex;
        this.pickModel = options.pickModel;
        this.revealPath = options.revealPath;
        this.openPath = options.openPath;
        this.restartApp = options.restartApp;
        this.onQuitRequest = options.onQuitRequest;
        this.setQuitGuard = options.setQuitGuard;
        this.quit = options.quit;
        this.setZoom = options.setZoom;
        this.notify = options.notify;
        // The embedded loopback listener needs no credential, so a media element can address
        // it directly. A paired LAN browser appends the media ticket it minted at startup:
        // that credential reads a source or a frame and nothing else, which is why the URL
        // can carry it where the bearer token must not.
        const mediaTicket = options.mediaTicket;
        this.mediaUrl =
            options.token === undefined
                ? (path) => `${this.#baseUrl}${path}`
                : mediaTicket === undefined
                  ? undefined
                  : (path) =>
                        `${this.#baseUrl}${path}${path.includes("?") ? "&" : "?"}media=${encodeURIComponent(mediaTicket)}`;
        this.openLanguageServer = async () => {
            let url = `${this.#baseUrl.replace(/^http/u, "ws")}${editorLspPath()}`;
            if (this.#token !== undefined) {
                // A browser cannot attach the bearer header to a WebSocket, so the LAN
                // listener accepts the same one-use ticket the event stream uses.
                const ticket = await this.post(eventsTicketPath(), {}, EventTicketSchema);
                url += `?ticket=${encodeURIComponent(ticket.ticket)}`;
            }
            return await openSocket(url);
        };
    }

    async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        const response = await this.#send(path, { method: "GET" });
        return this.#read(response, schema);
    }

    async post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        const response = await this.#send(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        return this.#read(response, schema);
    }

    async put(path: string, body: unknown): Promise<void> {
        await this.#send(path, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    async putJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        const response = await this.#send(path, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        return this.#read(response, schema);
    }

    async patchJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        const response = await this.#send(path, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        return this.#read(response, schema);
    }

    async delete(path: string): Promise<void> {
        await this.#send(path, { method: "DELETE" });
    }

    subscribe<T>(path: string, schema: ZodType<T>, onEvent: (event: T) => void): () => void {
        return subscribeToEvents(
            {
                baseUrl: this.#baseUrl,
                path,
                eventSourceFactory: this.#eventSource,
                // The ticket endpoint is the only LAN credential an EventSource can carry.
                mintTicket:
                    this.#token === undefined
                        ? undefined
                        : async () =>
                              (await this.post(eventsTicketPath(), {}, EventTicketSchema)).ticket,
            },
            schema,
            onEvent,
        );
    }

    async #send(path: string, init: RequestInit): Promise<Response> {
        let response: Response;
        const headers = new Headers(init.headers);
        if (this.#token !== undefined) {
            headers.set("Authorization", `Bearer ${this.#token}`);
        }
        try {
            response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
        } catch (error) {
            throw new ApiError(0, null, `The service could not be reached: ${String(error)}`);
        }

        if (!response.ok) {
            const body = ErrorBodySchema.safeParse(await response.json().catch(() => null));
            // A throttled request carries `Retry-After`; keep it structured so a caller can
            // count the wait down instead of subtracting from a sentence.
            const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
            throw new ApiError(
                response.status,
                body.success ? body.data : null,
                body.success ? body.data.message : `The service returned HTTP ${response.status}.`,
                Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
            );
        }
        return response;
    }

    async #read<T>(response: Response, schema: ZodType<T>): Promise<T> {
        if (response.status === 204) {
            return undefined as T;
        }
        const payload: unknown = await response.json();
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
            throw new ApiError(response.status, null, "The service returned an unexpected shape.");
        }
        return parsed.data;
    }
}

/**
 * One open bridge. The channel is plain JSON text: the service converts it to LSP framing,
 * so the editor never deals with `Content-Length` on this side of the wire.
 */
class SocketChannel implements LanguageServerChannel {
    readonly #socket: WebSocket;

    constructor(socket: WebSocket) {
        this.#socket = socket;
    }

    send(message: string): void {
        if (this.#socket.readyState === WebSocket.OPEN) {
            this.#socket.send(message);
        }
    }

    close(): void {
        this.#socket.close();
    }

    onMessage(handler: (message: string) => void): void {
        this.#socket.addEventListener("message", (event) => {
            if (typeof event.data === "string") {
                handler(event.data);
            }
        });
    }

    onClose(handler: () => void): void {
        this.#socket.addEventListener("close", () => handler());
    }
}

/** Resolve once the bridge is open, so a send is never silently dropped. */
async function openSocket(url: string): Promise<LanguageServerChannel> {
    return await new Promise((resolve, reject) => {
        let socket: WebSocket;
        try {
            socket = new WebSocket(url);
        } catch (error) {
            reject(
                new ApiError(
                    0,
                    null,
                    `The language-server channel could not open: ${String(error)}`,
                ),
            );
            return;
        }
        socket.addEventListener("open", () => resolve(new SocketChannel(socket)), { once: true });
        socket.addEventListener(
            "error",
            () =>
                reject(
                    new ApiError(
                        0,
                        null,
                        "The language-server channel was refused; the editor keeps its bundled completion.",
                    ),
                ),
            { once: true },
        );
    });
}
