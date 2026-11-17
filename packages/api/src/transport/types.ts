import type { ZodType } from "zod";

import type { ErrorBody } from "@av1ation/contracts";

/**
 * One duplex JSON-RPC channel to a host-provided language server.
 *
 * The transport owns how the channel is opened (a WebSocket on the service, nothing in the
 * demo); the editor owns the protocol. Messages are whole JSON-RPC objects, so a host never
 * has to know LSP's `Content-Length` framing.
 */
export interface LanguageServerChannel {
    /** Send one JSON-RPC message. */
    send: (message: string) => void;
    /** Close the channel; the service ends the server process it owns. */
    close: () => void;
    /** Subscribe to whole JSON-RPC messages from the server. */
    onMessage: (handler: (message: string) => void) => void;
    /** Subscribe to the channel closing, whether by this end or the service. */
    onClose: (handler: () => void) => void;
}

/** What a host file picker should offer. Extensions omit the leading dot. */
export interface FilePickerRequest {
    /** Suggested file extensions, without the leading dot. */
    extensions?: readonly string[] | undefined;
    /** Dialog title; the host supplies a sensible default. */
    title?: string | undefined;
}

/** The only interface a host implements to connect the façade to a backend. */
export interface Transport {
    /** Validate and return one JSON resource. */
    get<T>(path: string, schema: ZodType<T>): Promise<T>;
    /** Validate and return the response to a mutating request. */
    post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T>;
    /** Send a request with no response body. */
    put(path: string, body: unknown): Promise<void>;
    /** Send a request with a JSON body and return the response resource. */
    putJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T>;
    /** Send a PATCH request with a JSON body and return the response resource. */
    patchJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T>;
    /** Send a request with no response body. */
    delete(path: string): Promise<void>;
    /** Subscribe to server-sent events, returning the unsubscribe function. */
    subscribe<T>(path: string, schema: ZodType<T>, onEvent: (event: T) => void): () => void;
    /**
     * A URL a media element can load byte ranges from, `undefined` on hosts that cannot
     * serve one.
     *
     * The path is a service path. The host decides how it is authorised: the desktop
     * loopback needs nothing, and a paired LAN session appends the media ticket it minted
     * at startup, because a `<video>` cannot send the bearer header and one picture makes
     * many range requests.
     */
    readonly mediaUrl: ((path: string) => string) | undefined;
    /** Present a host-native file picker, `undefined` on hosts that cannot show one. */
    readonly pickFile: ((request?: FilePickerRequest) => Promise<string | null>) | undefined;
    /** Present a host-native save dialog for a file that does not exist yet. */
    readonly pickSaveFile:
        | ((request?: FilePickerRequest & { defaultPath?: string }) => Promise<string | null>)
        | undefined;
    /**
     * Present a host-native executable picker, `undefined` where the host cannot show one.
     *
     * `defaultPath` seeds the dialog at the build already in use, so locating a second
     * executable starts beside the first instead of in the last directory the user opened.
     */
    readonly pickExecutable: ((defaultPath?: string) => Promise<string | null>) | undefined;
    /** Pick one video file and return its host path, where the host can expose one. */
    readonly pickVideoFile: ((defaultPath?: string) => Promise<string | null>) | undefined;
    /** Pick several video files at once; absent on a host that cannot expose host paths. */
    readonly pickVideoFiles: (() => Promise<readonly string[]>) | undefined;
    /** Pick one directory and return its host path, where the host can expose one. */
    readonly pickDirectory: ((defaultPath?: string) => Promise<string | null>) | undefined;
    /**
     * Ask where to write a text file and write it there.
     *
     * The host owns both halves, because a page that only learns a path has no portable way
     * to write it back. `null` means the dialog was cancelled, not that the write failed.
     */
    readonly saveTextFile:
        | ((
              suggestedName: string,
              text: string,
              options?: SaveTextOptions,
          ) => Promise<string | null>)
        | undefined;
    /** Pick one VapourSynth script and return its host path. */
    readonly pickScript: (() => Promise<string | null>) | undefined;
    /** Pick one FFMS2 index file and return its host path. */
    readonly pickIndex: (() => Promise<string | null>) | undefined;
    /** Pick one TransNetV2 ONNX model and return its host path. */
    readonly pickModel: ((defaultPath?: string) => Promise<string | null>) | undefined;
    /**
     * Reveal a path in the host's file manager, `undefined` on hosts without one.
     *
     * The item is revealed inside its containing folder. A directory reveals its own
     * parent, so opening a folder uses `openPath` instead.
     */
    readonly revealPath: ((path: string) => Promise<void>) | undefined;
    /** Open a file or folder with the host's default handler, `undefined` without one. */
    readonly openPath: ((path: string) => Promise<void>) | undefined;
    /**
     * Restart the desktop process so a provider that initialises once takes effect. Absent
     * in a LAN browser, which must not restart the host it is paired with.
     */
    readonly restartApp: (() => Promise<void>) | undefined;
    /**
     * Ask the host to show its quit confirmation, returning an unsubscribe function. Absent
     * in a browser, where the tab closes without the service's consent.
     */
    readonly onQuitRequest?: ((handler: () => void) => () => void) | undefined;
    /** Quit the desktop host after the user confirms; absent in a browser. */
    readonly quit?: (() => Promise<void>) | undefined;
    /**
     * Set the desktop webview's own zoom factor, `undefined` in a browser where the host
     * cannot change the page scale.
     */
    readonly setZoom?: ((factor: number) => Promise<void>) | undefined;
    /**
     * Open the language-server bridge, `undefined` on hosts that cannot own a process. The
     * editor keeps its bundled completion when this is absent or the service refuses.
     */
    readonly openLanguageServer: (() => Promise<LanguageServerChannel | null>) | undefined;
}

/**
 * What a save dialog needs to know besides the bytes.
 *
 * A host names the file type in its own dialog, so the caller states it rather than every
 * export being labelled with whichever one was written first.
 */
export interface SaveTextOptions {
    /** Dialog title naming the export; the default is a plain save title. */
    title?: string;
    /** Extensions the dialog offers, without the leading dot; the first is the filter. */
    extensions?: readonly string[];
}

/** A service failure carrying the backend's uniform error envelope when available. */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly body: ErrorBody | null,
        message: string,
        /** Whole seconds from `Retry-After`, when the service asked the caller to wait. */
        readonly retryAfter: number | null = null,
    ) {
        super(message);
        this.name = "ApiError";
    }
}
