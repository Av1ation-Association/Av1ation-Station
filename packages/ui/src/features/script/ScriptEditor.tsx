import { useEffect, useMemo, useRef } from "react";

import type { LanguageServerChannel } from "@av1ation/api";
import Editor, { type Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

import { useResolvedTheme } from "../../shared/theme";
import { MONACO_THEMES } from "../../shared/monaco-env";

import {
    CORE_PLUGINS,
    PLUGIN_FUNCTIONS,
    PYTHON_BUILTINS,
    PYTHON_KEYWORDS,
    PYTHON_MODULES,
    VAPOURSYNTH_MODULE,
    type ApiSymbol,
} from "./python-completions";
import { declaredModulePaths, LanguageServerClient, type LspCompletion } from "./lsp-client";
import { parseStub, resolveExpression, sceneVariables, type StubModule } from "./python-stub";

/** The completion table the provider reads; updated whenever the screen's guide arrives. */
interface CompletionState {
    module: StubModule;
    variables: ReadonlyArray<{ key: string; description: string; format: string }>;
}

let completionState: CompletionState = {
    module: { members: [], classes: {}, byName: {} },
    variables: [],
};
let providerRegistered = false;

/**
 * The client the registered providers ask first.
 *
 * Monaco keeps one provider for the whole page, while each visit to a script page opens its
 * own server process. The module holds whichever editor is on screen; a second editor is
 * never mounted beside the first, because the script and stub tabs are exclusive.
 */
let activeClient: LanguageServerClient | null = null;

/**
 * Swipe scrolling for a touchscreen.
 *
 * Monaco binds a one-finger drag on the editor surface to text selection and never pans the
 * viewport, so a touch screen cannot move through a long script. The container takes the
 * touch axis for itself and a drag past a few pixels is translated into the editor's own
 * scroll position. A tap is left alone, so the caret still lands where the finger pressed.
 */
function enableTouchScroll(editor: monaco.editor.IStandaloneCodeEditor): () => void {
    const node = editor.getContainerDomNode();
    node.style.touchAction = "none";
    let active: number | null = null;
    let startX = 0;
    let startY = 0;
    let scrollTop = 0;
    let scrollLeft = 0;
    let dragging = false;

    const onStart = (event: TouchEvent): void => {
        const touch = event.touches.length === 1 ? event.touches[0] : undefined;
        active = touch?.identifier ?? null;
        if (touch === undefined) {
            return;
        }
        startX = touch.clientX;
        startY = touch.clientY;
        scrollTop = editor.getScrollTop();
        scrollLeft = editor.getScrollLeft();
        dragging = false;
    };

    const onMove = (event: TouchEvent): void => {
        if (active === null) {
            return;
        }
        const touch = Array.from(event.touches).find(
            (candidate) => candidate.identifier === active,
        );
        if (touch === undefined) {
            return;
        }
        const dx = startX - touch.clientX;
        const dy = startY - touch.clientY;
        if (!dragging && Math.abs(dx) < 6 && Math.abs(dy) < 6) {
            return;
        }
        dragging = true;
        // A drag is a pan, not a selection: the default would both scroll the page and move
        // the caret under the finger.
        event.preventDefault();
        editor.setScrollTop(scrollTop + dy);
        editor.setScrollLeft(scrollLeft + dx);
    };

    const onEnd = (): void => {
        active = null;
        dragging = false;
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
        node.removeEventListener("touchstart", onStart);
        node.removeEventListener("touchmove", onMove);
        node.removeEventListener("touchend", onEnd);
        node.removeEventListener("touchcancel", onEnd);
        node.style.touchAction = "";
    };
}

/** `cd.` and `condor_data.` on the same line, before the cursor. */
const MODULE_ACCESS = /(?:^|\W)(?:cd|condor_data)\.$/u;
const VS_ACCESS = /(?:^|\W)vs\.$/u;
const VS_CORE_ACCESS = /(?:^|\W)vs\.core\.$/u;
const CORE_ACCESS = /(?:^|\W)core\.$/u;
const CORE_PLUGIN_ACCESS = /(?:^|\W)core\.([A-Za-z_][A-Za-z0-9_]*)\.$/u;
const VS_CORE_PLUGIN_ACCESS = /(?:^|\W)vs\.core\.([A-Za-z_][A-Za-z0-9_]*)\.$/u;
// A chain of attributes and subscripts before the cursor, such as `scene.sequence_data.` or
// `cd.scenes[0].`; the captured run starts at the first name so it can be resolved as a whole.
const CHAIN_ACCESS = /((?:[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])\.)+$/u;

function completeApi(
    instance: Monaco,
    symbols: readonly ApiSymbol[],
    range: monaco.IRange,
): monaco.languages.CompletionItem[] {
    return symbols.map((symbol) => ({
        label: symbol.label,
        kind:
            symbol.kind === "function"
                ? instance.languages.CompletionItemKind.Function
                : symbol.kind === "class"
                  ? instance.languages.CompletionItemKind.Class
                  : symbol.kind === "module"
                    ? instance.languages.CompletionItemKind.Module
                    : instance.languages.CompletionItemKind.Value,
        detail: symbol.detail,
        ...(symbol.documentation === undefined ? {} : { documentation: symbol.documentation }),
        insertText: symbol.label,
        range,
    }));
}

/**
 * Map a language server's completion to Monaco.
 *
 * LSP and Monaco number their completion kinds identically, so the kind passes through. The
 * server's own edit range wins when it sent one, because a server may complete a token
 * that starts before the word Monaco found.
 */
function lspSuggestions(
    instance: Monaco,
    items: readonly LspCompletion[],
    fallback: monaco.IRange,
): monaco.languages.CompletionItem[] {
    return items.map((item) => ({
        label: item.label,
        kind: item.kind as monaco.languages.CompletionItemKind,
        insertText: item.insertText,
        range:
            item.range === undefined
                ? fallback
                : new instance.Range(
                      item.range.startLine,
                      item.range.startColumn,
                      item.range.endLine,
                      item.range.endColumn,
                  ),
        ...(item.detail === undefined ? {} : { detail: item.detail }),
        ...(item.documentation === undefined ? {} : { documentation: item.documentation }),
        ...(item.sortText === undefined ? {} : { sortText: item.sortText }),
        ...(item.filterText === undefined ? {} : { filterText: item.filterText }),
        ...(item.snippet
            ? {
                  insertTextRules: instance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              }
            : {}),
    }));
}

/**
 * One provider for the whole editor.
 *
 * Registering per mount would stack providers on every visit, so each typed character would
 * offer the same completion three times after three visits. The state is replaced instead.
 */
function registerCompletions(instance: Monaco): void {
    if (providerRegistered) {
        return;
    }
    providerRegistered = true;

    instance.languages.registerCompletionItemProvider("python", {
        triggerCharacters: [".", "@"],
        async provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position) {
            const line = model.getLineContent(position.lineNumber);
            const before = line.slice(0, position.column - 1);
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            // A language server, when the machine has one, knows the user's Python
            // environment and VapourSynth stubs. The bundled tables answer when it is
            // missing, refuses, times out, or has nothing for this position.
            const client = activeClient;
            if (client !== null) {
                try {
                    const items = await client.completion(
                        model.getValue(),
                        position.lineNumber,
                        position.column,
                    );
                    if (items.length > 0) {
                        return { suggestions: lspSuggestions(instance, items, range) };
                    }
                } catch {
                    // The bundled tables below are the fallback, not an error state.
                }
            }

            const { module, variables } = completionState;

            // `cd.` was the gap: the old check looked for a line ending in `cd`, not one
            // ending in `cd.`, so the module members never appeared.
            if (MODULE_ACCESS.test(before)) {
                // Only the data this run provides, plus the one namespace its types live
                // under. Offering `cd.SequenceConfig` beside `cd.sequence_config` invited
                // picking the class where the value belongs; the classes are reachable as
                // `cd.types.data.SequenceData` in an annotation instead.
                return {
                    suggestions: module.members
                        .filter((symbol) => symbol.kind !== "class" || symbol.name === "types")
                        .map((symbol) => ({
                            label: symbol.name,
                            kind:
                                symbol.kind === "function"
                                    ? instance.languages.CompletionItemKind.Function
                                    : symbol.kind === "method"
                                      ? instance.languages.CompletionItemKind.Method
                                      : symbol.kind === "class"
                                        ? instance.languages.CompletionItemKind.Module
                                        : instance.languages.CompletionItemKind.Property,
                            detail:
                                symbol.kind === "class"
                                    ? "condor_data type namespaces"
                                    : symbol.detail,
                            ...(symbol.doc === "" ? {} : { documentation: symbol.doc }),
                            insertText: symbol.name,
                            range,
                        })),
                };
            }

            if (VS_ACCESS.test(before)) {
                return { suggestions: completeApi(instance, VAPOURSYNTH_MODULE, range) };
            }

            const plugin = CORE_PLUGIN_ACCESS.exec(before) ?? VS_CORE_PLUGIN_ACCESS.exec(before);
            if (plugin !== null) {
                const name = plugin[1] ?? "";
                return {
                    suggestions: completeApi(instance, PLUGIN_FUNCTIONS[name] ?? [], range),
                };
            }

            if (CORE_ACCESS.test(before) || VS_CORE_ACCESS.test(before)) {
                return { suggestions: completeApi(instance, CORE_PLUGINS, range) };
            }

            const chain = CHAIN_ACCESS.exec(before);
            if (chain !== null) {
                // The stub annotates every field it declares, so the chain resolves through
                // the generated classes instead of a second table of engine documents.
                const expression = chain[0].slice(0, -1);
                const names = sceneVariables(
                    model.getValueInRange({
                        startLineNumber: 1,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    }),
                );
                const stubClass = resolveExpression(module, expression, names);
                if (stubClass !== null) {
                    return {
                        suggestions: stubClass.members.map((member) => ({
                            label: member.name,
                            kind:
                                member.kind === "method"
                                    ? instance.languages.CompletionItemKind.Method
                                    : instance.languages.CompletionItemKind.Property,
                            detail: member.detail,
                            insertText: member.kind === "method" ? `${member.name}()` : member.name,
                            range,
                        })),
                    };
                }
                return { suggestions: [] };
            }

            // A bare name is most often a reserved global, so those come first and say how
            // the value arrives in Python. `condor_data` is the typed alternative.
            const suggestions: monaco.languages.CompletionItem[] = variables.map((variable) => ({
                label: variable.key,
                kind: instance.languages.CompletionItemKind.Variable,
                detail: `bytes · ${variable.format} · injected global`,
                documentation: `${variable.description}\n\nSet by the runner before the script opens; it needs no import.`,
                insertText: variable.key,
                range,
            }));
            suggestions.push({
                label: "condor_data",
                kind: instance.languages.CompletionItemKind.Module,
                detail: "import condor_data as cd",
                documentation:
                    "The typed module the runner writes into the scenes directory. It decodes the raw globals (video_path, temp_dir, scenes) for you.",
                insertText: "condor_data",
                range,
            });
            suggestions.push({
                label: "vapoursynth",
                kind: instance.languages.CompletionItemKind.Module,
                detail: "import vapoursynth as vs",
                insertText: "vapoursynth",
                range,
            });

            for (const keyword of PYTHON_KEYWORDS) {
                suggestions.push({
                    label: keyword,
                    kind: instance.languages.CompletionItemKind.Keyword,
                    insertText: keyword,
                    range,
                });
            }
            for (const builtin of PYTHON_BUILTINS) {
                suggestions.push({
                    label: builtin.label,
                    kind:
                        builtin.kind === "class"
                            ? instance.languages.CompletionItemKind.Class
                            : instance.languages.CompletionItemKind.Function,
                    detail: builtin.detail,
                    insertText: builtin.label,
                    range,
                });
            }
            for (const imported of PYTHON_MODULES) {
                suggestions.push({
                    label: imported.label,
                    kind: instance.languages.CompletionItemKind.Module,
                    detail: imported.detail,
                    insertText: imported.label,
                    range,
                });
            }
            return { suggestions };
        },
    });

    instance.languages.registerHoverProvider("python", {
        async provideHover(model: monaco.editor.ITextModel, position: monaco.Position) {
            const client = activeClient;
            if (client !== null) {
                try {
                    const hover = await client.hover(
                        model.getValue(),
                        position.lineNumber,
                        position.column,
                    );
                    if (hover !== null) {
                        return {
                            contents: [{ value: hover.markdown }],
                            ...(hover.range === undefined
                                ? {}
                                : {
                                      range: new instance.Range(
                                          hover.range.startLine,
                                          hover.range.startColumn,
                                          hover.range.endLine,
                                          hover.range.endColumn,
                                      ),
                                  }),
                        };
                    }
                } catch {
                    // Fall through to the bundled documentation.
                }
            }

            const word = model.getWordAtPosition(position);
            if (word === null) {
                return null;
            }
            const line = model.getLineContent(position.lineNumber);
            const before = line.slice(0, word.startColumn - 1);
            const at = new instance.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn,
            );

            const variable = completionState.variables.find((entry) => entry.key === word.word);
            if (MODULE_ACCESS.test(before)) {
                const symbol = completionState.module.members.find(
                    (entry) => entry.name === word.word,
                );
                if (symbol === undefined) {
                    return null;
                }
                return {
                    range: at,
                    contents: [
                        { value: `**cd.${symbol.name}** \`${symbol.detail}\`` },
                        ...(symbol.doc === "" ? [] : [{ value: symbol.doc }]),
                    ],
                };
            }

            if (word.word === "cd" || word.word === "condor_data") {
                return {
                    range: at,
                    contents: [
                        { value: "**condor_data** · the typed data module" },
                        {
                            value: "Generated into the scenes directory before every sequence. It exists only after `import condor_data as cd`.",
                        },
                    ],
                };
            }

            if (word.word === "vs") {
                return {
                    range: at,
                    contents: [
                        { value: "**vapoursynth** · `import vapoursynth as vs`" },
                        { value: "`vs.core` is the loaded core that carries every plugin." },
                    ],
                };
            }

            if (VS_ACCESS.test(before)) {
                const symbol = VAPOURSYNTH_MODULE.find((entry) => entry.label === word.word);
                if (symbol !== undefined) {
                    return {
                        range: at,
                        contents: [
                            { value: `**vs.${symbol.label}** \`${symbol.detail}\`` },
                            ...(symbol.documentation === undefined
                                ? []
                                : [{ value: symbol.documentation }]),
                        ],
                    };
                }
            }

            const plugin = CORE_PLUGIN_ACCESS.exec(before) ?? VS_CORE_PLUGIN_ACCESS.exec(before);
            if (plugin !== null) {
                const symbol = (PLUGIN_FUNCTIONS[plugin[1] ?? ""] ?? []).find(
                    (entry) => entry.label === word.word,
                );
                if (symbol !== undefined) {
                    return {
                        range: at,
                        contents: [
                            {
                                value: `**core.${plugin[1] ?? ""}.${symbol.label}** \`${symbol.detail}\``,
                            },
                            ...(symbol.documentation === undefined
                                ? []
                                : [{ value: symbol.documentation }]),
                        ],
                    };
                }
            }

            if (CORE_ACCESS.test(before) || VS_CORE_ACCESS.test(before)) {
                const symbol = CORE_PLUGINS.find((entry) => entry.label === word.word);
                if (symbol !== undefined) {
                    return {
                        range: at,
                        contents: [{ value: `**${word.word}** · ${symbol.detail}` }],
                    };
                }
            }

            if (word.word === "core") {
                return {
                    range: at,
                    contents: [
                        { value: "**core** · the loaded VapourSynth core" },
                        { value: "Plugins are namespaces on it, for example `core.std.Splice`." },
                    ],
                };
            }

            if (variable !== undefined) {
                return {
                    range: at,
                    contents: [
                        { value: `**${variable.key}** · \`bytes\` (${variable.format})` },
                        { value: variable.description },
                        {
                            value: "This global needs no import; `condor_data` decodes it into a typed value.",
                        },
                    ],
                };
            }

            const chain = CHAIN_ACCESS.exec(before);
            if (chain !== null) {
                const names = sceneVariables(
                    model.getValueInRange({
                        startLineNumber: 1,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    }),
                );
                const stubClass = resolveExpression(
                    completionState.module,
                    chain[0].slice(0, -1),
                    names,
                );
                const member = (stubClass?.members ?? []).find((entry) => entry.name === word.word);
                if (member !== undefined) {
                    return {
                        range: at,
                        contents: [{ value: `**${member.name}** \`${member.detail}\`` }],
                    };
                }
            }
            return null;
        },
    });
}

/**
 * The Python editor for a custom VapourSynth script.
 *
 * Completion, hover, and the generated module come from the stub the service ships, so the
 * editor offers exactly the names a run will provide. Python and VapourSynth names are
 * bundled because the desktop window has no network and cannot download a language server.
 * The editor is never the only check: the service evaluates the script before it is saved.
 */
export function ScriptEditor({
    value,
    onChange,
    stub,
    variables,
    readOnly = false,
    height = "100%",
    ariaLabel = "VapourSynth script",
    path = "script.vpy",
    openLanguageServer,
    languageServerWorkspace,
    languageServerKind,
    languageServerInterpreter,
}: {
    value: string;
    onChange?: (next: string) => void;
    /** The generated `.pyi` the completion table is parsed from. */
    stub: string;
    variables: ReadonlyArray<{ key: string; description: string; format: string }>;
    readOnly?: boolean;
    height?: string;
    ariaLabel?: string;
    path?: string;
    /** Open the host's language-server bridge; absent when the host cannot own one. */
    openLanguageServer?: (() => Promise<LanguageServerChannel | null>) | undefined;
    /** The server's project directory, from the language-server inventory. */
    languageServerWorkspace?: string | undefined;
    /** Server family, so each provider gets its own spelling of the search path. */
    languageServerKind?: string | undefined;
    /** The interpreter the server should analyse, from the language-server inventory. */
    languageServerInterpreter?: string | undefined;
}) {
    const theme = useResolvedTheme();
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const touchCleanup = useRef<(() => void) | null>(null);

    // A script imports its own helper modules by putting their directory on `sys.path`.
    // The server reads its search path once, at initialize, so a new directory means a new
    // process; keying on the joined paths restarts once per added directory rather than on
    // every keystroke while the path is still being typed.
    const declaredPaths = useMemo(() => declaredModulePaths(value), [value]);
    const modulePathsKey = declaredPaths.join("\u0000");
    const modulePaths = useMemo(
        () => (modulePathsKey === "" ? [] : modulePathsKey.split("\u0000")),
        [modulePathsKey],
    );

    useEffect(
        () => () => {
            touchCleanup.current?.();
            touchCleanup.current = null;
        },
        [],
    );

    useEffect(() => {
        completionState = { module: parseStub(stub), variables };
    }, [stub, variables]);

    // The server process belongs to this editor. Leaving the page closes the channel, and
    // the service kills the process it started; nothing is left running in the background.
    useEffect(() => {
        if (openLanguageServer === undefined || languageServerWorkspace === undefined) {
            return;
        }
        let disposed = false;
        let client: LanguageServerClient | null = null;
        void (async () => {
            try {
                const channel = await openLanguageServer();
                if (channel === null) {
                    return;
                }
                if (disposed) {
                    channel.close();
                    return;
                }
                const next = new LanguageServerClient({
                    channel,
                    workspace: languageServerWorkspace,
                    stub,
                    ...(languageServerKind === undefined ? {} : { kind: languageServerKind }),
                    ...(languageServerInterpreter === undefined
                        ? {}
                        : { interpreter: languageServerInterpreter }),
                    ...(modulePaths.length === 0 ? {} : { modulePaths }),
                });
                client = next;
                if (!(await next.initialize()) || disposed) {
                    next.dispose();
                    if (client === next) {
                        client = null;
                    }
                    return;
                }
                activeClient = next;
            } catch {
                // A refused or failed bridge leaves the bundled completion in charge.
            }
        })();
        return () => {
            disposed = true;
            if (client !== null && activeClient === client) {
                activeClient = null;
            }
            client?.dispose();
        };
    }, [
        openLanguageServer,
        languageServerWorkspace,
        languageServerKind,
        languageServerInterpreter,
        stub,
        modulePaths,
    ]);

    return (
        <Editor
            height={height}
            theme={MONACO_THEMES[theme]}
            path={path}
            language="python"
            value={value}
            loading={<p className="m-0 p-4 text-[11.5px] text-ink-muted">Loading the editor…</p>}
            beforeMount={(instance) => registerCompletions(instance)}
            onMount={(instance) => {
                touchCleanup.current?.();
                touchCleanup.current = enableTouchScroll(instance);
            }}
            onChange={(next) => onChangeRef.current?.(next ?? "")}
            options={{
                readOnly,
                domReadOnly: readOnly,
                ariaLabel,
                fontFamily: "JetBrains Mono, ui-monospace, Consolas, monospace",
                fontSize: 12,
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                renderLineHighlight: "line",
                padding: { top: 14, bottom: 14 },
                tabSize: 4,
                insertSpaces: true,
                automaticLayout: true,
                wordWrap: "off",
                smoothScrolling: true,
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                renderWhitespace: "selection",
                bracketPairColorization: { enabled: true },
                guides: { indentation: true },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                quickSuggestions: { other: true, comments: false, strings: false },
                suggest: { showKeywords: true, showFunctions: true, showClasses: true },
            }}
        />
    );
}
