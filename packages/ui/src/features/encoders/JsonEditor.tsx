import Editor, { type Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useRef } from "react";

import type { editor as MonacoEditor } from "monaco-editor";

import { DESCRIPTOR_DOCUMENT_SCHEMA } from "./encoder-json-schema";
import { useResolvedTheme } from "../../shared/theme";
import { MONACO_THEMES } from "../../shared/monaco-env";

/** A problem the editor can shade, in document coordinates. */
export type JsonMarker = {
    offset: number;
    length: number;
    message: string;
};

/**
 * The bundled JSON editor.
 *
 * It shares Monaco's one runtime with the script page, so a host that has no network still
 * gets an editor. Diagnostics are not Monaco's: the caller validates the document against
 * the generated contract and hands back the ranges it found, which are painted as markers
 * here so the shaded text and the issue list describe the same characters. The language
 * service is given the generated descriptor schema for everything else it is good at —
 * folding a descriptor's fields, hovering a field for its meaning, and completing a field
 * name or a closed set's value — with its own validation off, so two validators never
 * disagree in the same gutter.
 */
export function JsonEditor({
    value,
    onChange,
    ariaLabel,
    path,
    height,
    markers,
    focus,
}: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    path: string;
    height: string;
    /** Problems to shade; an empty list clears whatever the last document reported. */
    markers?: readonly JsonMarker[];
    /** Where the user asked to look; `nonce` makes a repeated request a new one. */
    focus?: { offset: number; nonce: number } | null;
}) {
    const theme = useResolvedTheme();
    const held = useRef<{
        editor: MonacoEditor.IStandaloneCodeEditor;
        monaco: Monaco;
    } | null>(null);

    const paint = useCallback(() => {
        const mounted = held.current;
        if (mounted === null) {
            return;
        }
        const model = mounted.editor.getModel();
        if (model === null) {
            return;
        }
        mounted.monaco.editor.setModelMarkers(
            model,
            "encoder-schema",
            (markers ?? []).map((marker) => {
                const start = model.getPositionAt(marker.offset);
                const end = model.getPositionAt(marker.offset + marker.length);
                return {
                    severity: mounted.monaco.MarkerSeverity.Error,
                    message: marker.message,
                    startLineNumber: start.lineNumber,
                    startColumn: start.column,
                    endLineNumber: end.lineNumber,
                    endColumn: end.column,
                };
            }),
        );
    }, [markers]);

    // A new `path` means a new model, which carries no markers of its own.
    useEffect(() => {
        paint();
    }, [paint, path]);

    useEffect(() => {
        const mounted = held.current;
        if (focus === null || focus === undefined || mounted === null) {
            return;
        }
        const model = mounted.editor.getModel();
        if (model === null) {
            return;
        }
        const position = model.getPositionAt(focus.offset);
        mounted.editor.setPosition(position);
        mounted.editor.revealPositionInCenter(position);
        mounted.editor.focus();
    }, [focus]);

    return (
        <Editor
            height={height}
            theme={MONACO_THEMES[theme]}
            path={path}
            language="json"
            value={value}
            loading={<p className="m-0 p-4 text-[11.5px] text-ink-muted">Loading the editor…</p>}
            beforeMount={(monaco) => {
                // This build exports the language's settings as `monaco.json`; the
                // `languages.json` alias exists only in the typings.
                monaco.json.jsonDefaults.setDiagnosticsOptions({
                    validate: false,
                    enableSchemaRequest: false,
                    schemas: [
                        {
                            uri: "av1ation://encoder-parameters",
                            fileMatch: ["*.json"],
                            schema: DESCRIPTOR_DOCUMENT_SCHEMA,
                        },
                    ],
                });
            }}
            onMount={(editor, monaco) => {
                held.current = { editor, monaco };
                paint();
            }}
            onChange={(next) => onChange(next ?? "")}
            options={{
                ariaLabel,
                fontFamily: "JetBrains Mono, ui-monospace, Consolas, monospace",
                fontSize: 12,
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                renderLineHighlight: "line",
                padding: { top: 14, bottom: 14 },
                tabSize: 2,
                insertSpaces: true,
                automaticLayout: true,
                // Words from neighbouring descriptions are not suggestions; the list is the
                // contract's own fields and values.
                wordBasedSuggestions: "off",
                wordWrap: "off",
                smoothScrolling: true,
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                renderWhitespace: "selection",
                bracketPairColorization: { enabled: true },
                guides: { indentation: true },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                // Completion is the point of the language service here: a field name the
                // user half-remembers is one keystroke away instead of a trip to the docs.
                quickSuggestions: { other: true, comments: false, strings: true },
                folding: true,
            }}
        />
    );
}
