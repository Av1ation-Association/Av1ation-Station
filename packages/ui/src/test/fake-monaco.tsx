import type { LanguageServerChannel } from "@av1ation/api";
import type { Monaco } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

/**
 * A textarea-shaped Monaco stand-in for the script cluster.
 *
 * jsdom has no canvas, worker, or layout engine, so the real editor cannot mount. The fake
 * still calls the two callbacks the production component owns: `beforeMount` registers the
 * completion and hover providers, and `onMount` installs touch scrolling. Tests can then
 * invoke those providers directly, which is the behaviour under test rather than Monaco's
 * own rendering.
 */
export interface FakeEditorProps {
    value?: string | undefined;
    onChange?: ((value: string | undefined) => void) | undefined;
    beforeMount?: ((monaco: Monaco) => void) | undefined;
    onMount?: ((editor: FakeEditorInstance) => void) | undefined;
    options?: { ariaLabel?: string | undefined; readOnly?: boolean | undefined } | undefined;
    theme?: string | undefined;
    path?: string | undefined;
}

export interface FakeEditorInstance {
    getContainerDomNode: () => HTMLElement;
    getScrollTop: () => number;
    getScrollLeft: () => number;
    setScrollTop: (value: number) => void;
    setScrollLeft: (value: number) => void;
}

interface CompletionProvider {
    provideCompletionItems: (
        model: FakeModel,
        position: { lineNumber: number; column: number },
    ) => Promise<{ suggestions: FakeSuggestion[] }>;
}

interface HoverProvider {
    provideHover: (
        model: FakeModel,
        position: { lineNumber: number; column: number },
    ) => Promise<{ contents: Array<{ value: string }>; range?: FakeRange } | null>;
}

export interface FakeSuggestion {
    label: string;
    kind: number;
    insertText: string;
    detail?: string;
    documentation?: string;
    range?: FakeRange;
    insertTextRules?: number;
    sortText?: string;
    filterText?: string;
}

export interface FakeRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export interface FakeModel {
    getLineContent: (lineNumber: number) => string;
    getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
        word: string;
        startColumn: number;
        endColumn: number;
    };
    getValue: () => string;
    getValueInRange: (range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    }) => string;
    getWordAtPosition: (position: {
        lineNumber: number;
        column: number;
    }) => { word: string; startColumn: number; endColumn: number } | null;
}

export const fakeMonacoState: {
    props: FakeEditorProps | null;
    editor: FakeEditorInstance | null;
    completionProvider: CompletionProvider | null;
    hoverProvider: HoverProvider | null;
    scrollTop: number;
    scrollLeft: number;
} = {
    props: null,
    editor: null,
    completionProvider: null,
    hoverProvider: null,
    scrollTop: 0,
    scrollLeft: 0,
};

export const fakeMonaco = {
    Range: class Range implements FakeRange {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;

        constructor(
            startLineNumber: number,
            startColumn: number,
            endLineNumber: number,
            endColumn: number,
        ) {
            this.startLineNumber = startLineNumber;
            this.startColumn = startColumn;
            this.endLineNumber = endLineNumber;
            this.endColumn = endColumn;
        }
    },
    editor: {
        defineTheme: () => undefined,
    },
    languages: {
        CompletionItemKind: {
            Method: 0,
            Function: 3,
            Variable: 4,
            Class: 5,
            Module: 9,
            Property: 15,
            Value: 12,
            Keyword: 13,
        },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
        registerCompletionItemProvider: (_language: string, provider: CompletionProvider): void => {
            fakeMonacoState.completionProvider = provider;
        },
        registerHoverProvider: (_language: string, provider: HoverProvider): void => {
            fakeMonacoState.hoverProvider = provider;
        },
    },
};

/** The loader is imported by monaco-env; the fake module satisfies its one call. */
export const fakeMonacoLoader = {
    config: (): void => undefined,
};

export function FakeScriptEditor(props: FakeEditorProps) {
    const container = useRef<HTMLDivElement>(null);
    const propsRef = useRef(props);
    propsRef.current = props;
    fakeMonacoState.props = props;

    useEffect(() => {
        const mountedProps = propsRef.current;
        mountedProps.beforeMount?.(fakeMonaco as unknown as Monaco);
        const node = container.current;
        if (node === null) {
            return;
        }
        const editor: FakeEditorInstance = {
            getContainerDomNode: () => node,
            getScrollTop: () => fakeMonacoState.scrollTop,
            getScrollLeft: () => fakeMonacoState.scrollLeft,
            setScrollTop: (value) => {
                fakeMonacoState.scrollTop = value;
            },
            setScrollLeft: (value) => {
                fakeMonacoState.scrollLeft = value;
            },
        };
        fakeMonacoState.editor = editor;
        mountedProps.onMount?.(editor);
        return () => {
            if (fakeMonacoState.editor === editor) {
                fakeMonacoState.editor = null;
            }
        };
    }, []);

    return (
        <div
            ref={container}
            data-testid="fake-monaco"
            data-path={props.path ?? ""}
            data-theme={props.theme ?? ""}
        >
            <textarea
                aria-label={props.options?.ariaLabel ?? "script"}
                aria-readonly={props.options?.readOnly === true}
                readOnly={props.options?.readOnly === true}
                value={props.value ?? ""}
                onChange={(event) => props.onChange?.(event.currentTarget.value)}
            />
        </div>
    );
}

/** Reset the per-mount pieces. Providers stay registered for the module's lifetime. */
export function resetFakeMonaco(): void {
    fakeMonacoState.props = null;
    fakeMonacoState.editor = null;
    fakeMonacoState.scrollTop = 0;
    fakeMonacoState.scrollLeft = 0;
}

/** A model with the handful of methods the bundled providers read. */
export function fakeModel(
    text: string,
    lineNumber = 1,
    column = (text.split("\n")[lineNumber - 1]?.length ?? 0) + 1,
): FakeModel {
    const lines = text.split("\n");
    const line = lines[lineNumber - 1] ?? "";
    const safeColumn = Math.max(1, Math.min(column, line.length + 1));
    const before = line.slice(0, safeColumn - 1);
    const word = /([A-Za-z_][A-Za-z0-9_]*)$/u.exec(before)?.[1] ?? "";

    return {
        getLineContent: (lineToRead) => lines[lineToRead - 1] ?? "",
        getWordUntilPosition: () => ({
            word,
            startColumn: safeColumn - word.length,
            endColumn: safeColumn,
        }),
        getValue: () => text,
        getValueInRange: (range) => {
            const prior = lines.slice(0, range.endLineNumber - 1).join("\n");
            const current = (lines[range.endLineNumber - 1] ?? "").slice(
                0,
                Math.max(0, range.endColumn - 1),
            );
            return prior === "" ? current : `${prior}\n${current}`;
        },
        getWordAtPosition: () =>
            word === ""
                ? null
                : {
                      word,
                      startColumn: safeColumn - word.length,
                      endColumn: safeColumn,
                  },
    };
}

export async function provideCompletion(
    text: string,
    lineNumber = 1,
    column = (text.split("\n")[lineNumber - 1]?.length ?? 0) + 1,
): Promise<FakeSuggestion[]> {
    const provider = fakeMonacoState.completionProvider;
    if (provider === null) {
        throw new Error("The completion provider has not been registered.");
    }
    const result = await provider.provideCompletionItems(fakeModel(text, lineNumber, column), {
        lineNumber,
        column,
    });
    return result.suggestions;
}

export async function provideHover(
    text: string,
    lineNumber = 1,
    column = (text.split("\n")[lineNumber - 1]?.length ?? 0) + 1,
): Promise<{ contents: Array<{ value: string }>; range?: FakeRange } | null> {
    const provider = fakeMonacoState.hoverProvider;
    if (provider === null) {
        throw new Error("The hover provider has not been registered.");
    }
    return provider.provideHover(fakeModel(text, lineNumber, column), { lineNumber, column });
}

export type FakeLspMode = "ok" | "empty" | "error" | "never";

export interface FakeLanguageServerOptions {
    initialize?: FakeLspMode | undefined;
    completion?: FakeLspMode | undefined;
    hover?: FakeLspMode | undefined;
}

/**
 * A channel that speaks enough JSON-RPC for the editor's client.
 *
 * Responses are delivered in a microtask so the client's request bookkeeping is exercised
 * without a timer or sleep. "never" deliberately leaves a request pending; tests that use
 * it unmount the editor, whose cleanup closes the channel.
 */
export class FakeLanguageServerChannel implements LanguageServerChannel {
    readonly sent: Array<Record<string, unknown>> = [];
    readonly options: FakeLanguageServerOptions;
    closed = false;
    #message: ((message: string) => void) | null = null;
    #close: (() => void) | null = null;

    constructor(options: FakeLanguageServerOptions = {}) {
        this.options = options;
    }

    send(message: string): void {
        const parsed = JSON.parse(message) as Record<string, unknown>;
        this.sent.push(parsed);
        const id = typeof parsed.id === "number" ? parsed.id : null;
        if (id === null) {
            return;
        }
        const method = parsed.method;
        if (method === "initialize") {
            this.#replyAfter(id, this.options.initialize ?? "ok", {
                capabilities: {},
            });
            return;
        }
        if (method === "textDocument/completion") {
            this.#replyAfter(id, this.options.completion ?? "ok", {
                isIncomplete: false,
                items: [
                    {
                        label: "from_server",
                        kind: 3,
                        detail: "server completion",
                        insertText: "from_server(${1:frame})",
                        insertTextFormat: 2,
                        textEdit: {
                            range: {
                                start: { line: 0, character: 0 },
                                end: { line: 0, character: 0 },
                            },
                            newText: "from_server(${1:frame})",
                        },
                    },
                ],
            });
            return;
        }
        if (method === "textDocument/hover") {
            this.#replyAfter(id, this.options.hover ?? "ok", {
                contents: { kind: "markdown", value: "**server hover**" },
            });
        }
    }

    close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.#close?.();
    }

    onMessage(handler: (message: string) => void): void {
        this.#message = handler;
    }

    onClose(handler: () => void): void {
        this.#close = handler;
    }

    #replyAfter(id: number, mode: FakeLspMode, result: unknown): void {
        if (mode === "never") {
            return;
        }
        void Promise.resolve().then(() => {
            if (this.closed) {
                return;
            }
            if (mode === "error") {
                this.#message?.(
                    JSON.stringify({
                        jsonrpc: "2.0",
                        id,
                        error: { code: -32000, message: "server refused" },
                    }),
                );
                return;
            }
            this.#message?.(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    result: mode === "empty" ? [] : result,
                }),
            );
        });
    }
}
