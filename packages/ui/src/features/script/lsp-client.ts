import type { LanguageServerChannel } from "@av1ation/api";

/**
 * A small LSP client for one script document.
 *
 * The alternative was a full language-client package, but the editor only needs three
 * features — completion, hover, and moving the document — and everything else those
 * packages bring (notebooks, semantic tokens, file watching) would be inert here. The
 * protocol surface this speaks is deliberately the part every Python server implements.
 *
 * The service converts whole JSON messages to LSP's `Content-Length` framing, so nothing
 * here counts bytes.
 */

/** One completion, already in the coordinates Monaco uses (1-based lines and columns). */
export interface LspCompletion {
    label: string;
    /** LSP's `CompletionItemKind`; Monaco's enum uses the same numbers. */
    kind: number;
    insertText: string;
    /** Whether `insertText` carries `${1:…}` placeholders. */
    snippet: boolean;
    detail?: string;
    documentation?: string;
    range?: LspRange;
    sortText?: string;
    filterText?: string;
}

/** A 1-based range, ready for a Monaco `IRange`. */
export interface LspRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

export interface LspHover {
    markdown: string;
    range?: LspRange;
}

/** How long one completion or hover may take before the bundled tables answer instead. */
const REQUEST_TIMEOUT = 4000;
/** A server may need longer than a request to read its environment on the first call. */
const INITIALIZE_TIMEOUT = 15_000;

interface Pending {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A file URI the server can resolve, including on Windows. */
export function fileUri(path: string): string {
    const normalized = path.replace(/\\/gu, "/");
    return normalized.startsWith("/")
        ? `file://${encodeURI(normalized)}`
        : `file:///${encodeURI(normalized)}`;
}

/** A Windows drive path or a POSIX absolute path. */
function isAbsolutePath(path: string): boolean {
    return /^(?:[A-Za-z]:[\\/]|\/)/u.test(path);
}

/**
 * The directories a script puts on `sys.path` with a literal argument.
 *
 * VSScript evaluates a script without adding anything to the interpreter's path, so a
 * script that imports its own helper module does it itself. The language server cannot see
 * that call; forwarding the same directories as extra search paths is what makes
 * `import toolkit` complete in the editor as well as run in the encoder.
 *
 * Only a literal absolute path is read. A path computed at run time is not guessed at, and
 * a relative path is ignored because the analysis workspace is not the script's directory.
 * Both `sys.path.insert(index, path)` and `sys.path.append(path)` are read.
 */
export function declaredModulePaths(text: string): string[] {
    const paths: string[] = [];
    for (const match of text.matchAll(
        /^[ \t]*sys\.path\.(?:insert\(\s*\d+\s*,\s*|append\(\s*)(?:[rRuU])?(["'])(.+?)\1\s*\)/gmu,
    )) {
        const path = match[2] ?? "";
        if (!isAbsolutePath(path) || paths.includes(path)) {
            continue;
        }
        paths.push(path);
    }
    return paths;
}

export class LanguageServerClient {
    readonly #channel: LanguageServerChannel;
    readonly #documentUri: string;
    readonly #rootUri: string;
    readonly #workspace: string;
    readonly #kind: string;
    readonly #interpreter: string | null;
    readonly #modulePaths: readonly string[];
    readonly #stubUri: string | null;
    readonly #stub: string;
    readonly #pending = new Map<number, Pending>();
    #nextId = 1;
    #opened = false;
    #version = 0;
    #initialized = false;
    #closed = false;

    constructor(options: {
        channel: LanguageServerChannel;
        /** Absolute directory the server treats as the project. */
        workspace: string;
        /** The generated module stub, opened so `import condor_data` resolves. */
        stub?: string;
        /** The virtual script name; `.py` so servers recognise it as Python. */
        documentName?: string;
        /** Server family, so each gets its own spelling of the extra search path. */
        kind?: string;
        /**
         * The Python interpreter the server should analyse. Packages belong to an
         * interpreter, so a venv is invisible until each server family is told where its
         * `python` is; the spellings differ per server, and the helpers below own them.
         */
        interpreter?: string;
        /**
         * Directories the script adds to `sys.path`, so undefined imports resolve to the
         * same helper modules the encoder will import.
         */
        modulePaths?: readonly string[];
    }) {
        this.#channel = options.channel;
        this.#workspace = options.workspace;
        this.#kind = options.kind ?? "";
        this.#interpreter =
            options.interpreter === undefined || options.interpreter.trim() === ""
                ? null
                : options.interpreter.trim();
        this.#modulePaths = (options.modulePaths ?? [])
            .map((path) => path.trim())
            .filter((path) => path !== "" && path !== options.workspace);
        this.#rootUri = fileUri(options.workspace);
        this.#documentUri = fileUri(
            `${options.workspace.replace(/[\\/]$/u, "")}/${options.documentName ?? "script.py"}`,
        );
        this.#stub = options.stub ?? "";
        this.#stubUri =
            this.#stub === ""
                ? null
                : fileUri(`${options.workspace.replace(/[\\/]$/u, "")}/condor_data.pyi`);
    }

    /** Handshake and open the stub. `false` means the caller should keep the bundled tables. */
    async initialize(): Promise<boolean> {
        if (this.#closed) {
            return false;
        }
        this.#channel.onMessage((raw) => this.#receive(raw));
        this.#channel.onClose(() => {
            this.#failAll(new Error("The language server closed."));
        });
        try {
            await this.#request(
                "initialize",
                {
                    processId: null,
                    clientInfo: { name: "Av1ation Station" },
                    rootUri: this.#rootUri,
                    workspaceFolders: [{ uri: this.#rootUri, name: "Av1ation Station" }],
                    capabilities: {
                        textDocument: {
                            synchronization: { dynamicRegistration: false },
                            completion: {
                                completionItem: {
                                    snippetSupport: true,
                                    documentationFormat: ["markdown", "plaintext"],
                                },
                            },
                            hover: { contentFormat: ["markdown", "plaintext"] },
                        },
                        workspace: { configuration: true, workspaceFolders: true },
                    },
                    ...this.#initializationOptions(),
                },
                INITIALIZE_TIMEOUT,
            );
        } catch {
            return false;
        }
        if (this.#closed) {
            return false;
        }
        this.#notify("initialized", {});
        // pylsp reads its settings from `didChangeConfiguration`, not from
        // `workspace/configuration`, so the interpreter and search paths have to be sent
        // both ways.
        if (
            this.#kind === "pylsp" &&
            (this.#interpreter !== null || this.#modulePaths.length > 0)
        ) {
            this.#notify("workspace/didChangeConfiguration", {
                settings: { pylsp: this.#pylspSettings() },
            });
        }
        if (this.#stubUri !== null) {
            this.#notify("textDocument/didOpen", {
                textDocument: {
                    uri: this.#stubUri,
                    languageId: "python",
                    version: 1,
                    text: this.#stub,
                },
            });
        }
        this.#initialized = true;
        return true;
    }

    /** Completion at a Monaco position, or `null` when the server offered nothing. */
    async completion(text: string, line: number, column: number): Promise<LspCompletion[]> {
        this.#sync(text);
        const result = await this.#request(
            "textDocument/completion",
            {
                textDocument: { uri: this.#documentUri },
                position: { line: line - 1, character: column - 1 },
            },
            REQUEST_TIMEOUT,
        );
        return completionFromLsp(result);
    }

    /** Hover at a Monaco position, or `null` when the server has nothing to say. */
    async hover(text: string, line: number, column: number): Promise<LspHover | null> {
        this.#sync(text);
        const result = await this.#request(
            "textDocument/hover",
            {
                textDocument: { uri: this.#documentUri },
                position: { line: line - 1, character: column - 1 },
            },
            REQUEST_TIMEOUT,
        );
        return hoverFromLsp(result);
    }

    dispose(): void {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#failAll(new Error("The language server is closed."));
        this.#channel.close();
    }

    /** Open the document on first use and send full text on every later edit. */
    #sync(text: string): void {
        if (!this.#initialized || this.#closed) {
            return;
        }
        if (!this.#opened) {
            this.#version = 1;
            this.#opened = true;
            this.#notify("textDocument/didOpen", {
                textDocument: {
                    uri: this.#documentUri,
                    languageId: "python",
                    version: 1,
                    text,
                },
            });
            return;
        }
        this.#version += 1;
        this.#notify("textDocument/didChange", {
            textDocument: { uri: this.#documentUri, version: this.#version },
            contentChanges: [{ text }],
        });
    }

    #notify(method: string, params: unknown): void {
        this.#send({ jsonrpc: "2.0", method, params });
    }

    #send(message: unknown): void {
        if (!this.#closed) {
            this.#channel.send(JSON.stringify(message));
        }
    }

    #receive(raw: string): void {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return;
        }
        if (!isRecord(parsed)) {
            return;
        }
        if (typeof parsed.method === "string") {
            // A server-initiated request is answered; a notification (diagnostics) is not
            // something this editor renders yet, so it is ignored rather than dropped in a
            // queue that grows for the life of the page.
            if (typeof parsed.id === "number" || typeof parsed.id === "string") {
                this.#answer(parsed.id, parsed.method, parsed.params);
            }
            return;
        }
        if (typeof parsed.id !== "number") {
            return;
        }
        const pending = this.#pending.get(parsed.id);
        if (pending === undefined) {
            return;
        }
        this.#pending.delete(parsed.id);
        clearTimeout(pending.timer);
        if (isRecord(parsed.error)) {
            pending.reject(
                new Error(
                    typeof parsed.error.message === "string"
                        ? parsed.error.message
                        : "The language server rejected the request.",
                ),
            );
            return;
        }
        pending.resolve(parsed.result ?? null);
    }

    #answer(id: number | string, method: string, params: unknown): void {
        let result: unknown = null;
        if (method === "workspace/configuration") {
            const items = isRecord(params) && Array.isArray(params.items) ? params.items : [];
            result = items.map((item) => this.#configFor(item));
        } else if (method === "workspace/workspaceFolders") {
            result = [{ uri: this.#rootUri, name: "Av1ation Station" }];
        }
        this.#send({ jsonrpc: "2.0", id, result });
    }

    /**
     * The options a family reads only at initialize time.
     *
     * Jedi takes both its search path and its interpreter here, and pylsp accepts its whole
     * settings tree as `pylsp`; Pyright asks over `workspace/configuration` instead.
     */
    #initializationOptions(): Record<string, unknown> {
        if (this.#kind === "jedi") {
            return {
                initializationOptions: {
                    workspace: {
                        // Jedi's option parser camel-cases its own keys, so this spelling is
                        // the one it reads; `extra_paths` would be dropped silently.
                        extraPaths: this.#extraPaths(),
                        ...(this.#interpreter === null
                            ? {}
                            : { environmentPath: this.#interpreter }),
                    },
                },
            };
        }
        if (
            this.#kind === "pylsp" &&
            (this.#interpreter !== null || this.#modulePaths.length > 0)
        ) {
            return { initializationOptions: { pylsp: this.#pylspSettings() } };
        }
        return {};
    }

    /** The workspace first, then the directories the script puts on `sys.path`. */
    #extraPaths(): string[] {
        return [this.#workspace, ...this.#modulePaths];
    }

    /** The settings pylsp's Jedi plugin reads. */
    #pylspJediSettings(): Record<string, unknown> {
        return {
            ...(this.#interpreter === null ? {} : { environment: this.#interpreter }),
            ...(this.#modulePaths.length === 0 ? {} : { extra_paths: this.#extraPaths() }),
        };
    }

    /** pylsp's Jedi plugin reads its interpreter and search path from this tree. */
    #pylspSettings(): Record<string, unknown> {
        return { plugins: { jedi: this.#pylspJediSettings() } };
    }

    /** The stub lives in the workspace, so every server must search it for imports. */
    #configFor(item: unknown): Record<string, unknown> {
        const section = isRecord(item) && typeof item.section === "string" ? item.section : "";
        if (section === "python") {
            return {
                // Pyright's documented LSP spelling for the interpreter.
                ...(this.#interpreter === null ? {} : { pythonPath: this.#interpreter }),
                analysis: {
                    extraPaths: this.#extraPaths(),
                    diagnosticMode: "openFilesOnly",
                },
            };
        }
        if (section === "python.analysis") {
            return { extraPaths: this.#extraPaths(), diagnosticMode: "openFilesOnly" };
        }
        if (section === "pylsp") {
            return this.#interpreter === null && this.#modulePaths.length === 0
                ? {}
                : this.#pylspSettings();
        }
        if (section === "pylsp.plugins.jedi") {
            return this.#interpreter === null && this.#modulePaths.length === 0
                ? {}
                : this.#pylspJediSettings();
        }
        return {};
    }

    #request(method: string, params: unknown, timeout: number): Promise<unknown> {
        if (this.#closed) {
            return Promise.reject(new Error("The language server is closed."));
        }
        const id = this.#nextId;
        this.#nextId += 1;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pending.delete(id);
                reject(new Error(`The language server did not answer ${method} in time.`));
            }, timeout);
            this.#pending.set(id, { resolve, reject, timer });
            this.#send({ jsonrpc: "2.0", id, method, params });
        });
    }

    #failAll(error: Error): void {
        for (const pending of this.#pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.#pending.clear();
    }
}

function rangeOf(value: Record<string, unknown>): LspRange | null {
    const start = isRecord(value.start) ? value.start : null;
    const end = isRecord(value.end) ? value.end : null;
    if (start === null || end === null) {
        return null;
    }
    if (
        typeof start.line !== "number" ||
        typeof start.character !== "number" ||
        typeof end.line !== "number" ||
        typeof end.character !== "number"
    ) {
        return null;
    }
    return {
        startLine: start.line + 1,
        startColumn: start.character + 1,
        endLine: end.line + 1,
        endColumn: end.character + 1,
    };
}

function documentMarkdown(value: unknown): string | null {
    if (typeof value === "string") {
        return value.trim() === "" ? null : value;
    }
    if (Array.isArray(value)) {
        const parts = value
            .map((entry) => documentMarkdown(entry))
            .filter((entry): entry is string => entry !== null);
        return parts.length === 0 ? null : parts.join("\n\n");
    }
    if (isRecord(value) && typeof value.value === "string") {
        if (value.value.trim() === "") {
            return null;
        }
        // `{ language, value }` is a fenced code block; `{ kind, value }` is markup.
        return typeof value.language === "string"
            ? `\`\`\`${value.language}\n${value.value}\n\`\`\``
            : value.value;
    }
    return null;
}

/** Map the server's completion result, either an array or a `CompletionList`. */
export function completionFromLsp(result: unknown): LspCompletion[] {
    const items = Array.isArray(result)
        ? result
        : isRecord(result) && Array.isArray(result.items)
          ? result.items
          : [];
    const completions: LspCompletion[] = [];
    for (const raw of items) {
        if (!isRecord(raw) || typeof raw.label !== "string") {
            continue;
        }
        const edit = isRecord(raw.textEdit) ? raw.textEdit : null;
        const range =
            edit !== null && isRecord(edit.range)
                ? rangeOf(edit.range)
                : edit !== null && isRecord(edit.replace)
                  ? rangeOf(edit.replace)
                  : edit !== null && isRecord(edit.insert)
                    ? rangeOf(edit.insert)
                    : null;
        const insertText =
            edit !== null && typeof edit.newText === "string"
                ? edit.newText
                : typeof raw.insertText === "string"
                  ? raw.insertText
                  : raw.label;
        const completion: LspCompletion = {
            label: raw.label,
            kind: typeof raw.kind === "number" ? raw.kind : 1,
            insertText,
            snippet: raw.insertTextFormat === 2,
        };
        if (typeof raw.detail === "string" && raw.detail !== "") {
            completion.detail = raw.detail;
        }
        const documentation = documentMarkdown(raw.documentation);
        if (documentation !== null) {
            completion.documentation = documentation;
        }
        if (range !== null) {
            completion.range = range;
        }
        if (typeof raw.sortText === "string") {
            completion.sortText = raw.sortText;
        }
        if (typeof raw.filterText === "string") {
            completion.filterText = raw.filterText;
        }
        completions.push(completion);
    }
    return completions;
}

/** Map the server's hover result; `null` when there is nothing to show. */
export function hoverFromLsp(result: unknown): LspHover | null {
    if (!isRecord(result)) {
        return null;
    }
    const markdown = documentMarkdown(result.contents);
    if (markdown === null) {
        return null;
    }
    const range = isRecord(result.range) ? rangeOf(result.range) : null;
    return range === null ? { markdown } : { markdown, range };
}
