import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
// monaco-editor's exports map resolves `monaco-editor/<path>` to `esm/vs/<path>`, so this
// is the package's own worker entry rather than a hard-coded ESM path.
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";

import type { ResolvedTheme } from "./theme";

/**
 * The one bundled Monaco runtime.
 *
 * The desktop window has no network and the LAN browser may be on an isolated subnet, so an
 * editor that fetched its runtime would be empty exactly where it is needed. The runtime is
 * configured once for every editor in the application: the script page and the descriptor
 * JSON page share the loader and the theme, so neither can mount an editor that looks or
 * behaves differently.
 *
 * The language service runs in the worker it belongs to, and Monaco asks for the worker by
 * label. A JSON editor answered with the plain editor worker loses folding, hover and
 * completion: every request to the service fails with "Missing requestHandler" and the
 * editor keeps working only because it never needed those answers to render text.
 */
(
    self as unknown as { MonacoEnvironment: { getWorker: (id: string, label: string) => Worker } }
).MonacoEnvironment = {
    getWorker: (_id, label) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
loader.config({ monaco });

/** Monaco's theme name per application theme; both are defined below. */
export const MONACO_THEMES: Record<ResolvedTheme, string> = {
    dark: "av1ation-dark",
    light: "av1ation-light",
};

/**
 * One colour set per theme, matching the tokens in `styles.css`.
 *
 * Monaco cannot read CSS custom properties, so the values are repeated here. They must
 * move with the token set: an editor painted in the dark palette inside a light window is
 * exactly the drift the shared theme is meant to prevent.
 */
monaco.editor.defineTheme(MONACO_THEMES.dark, {
    base: "vs-dark",
    inherit: true,
    rules: [
        { token: "", foreground: "e8edf5", background: "12161e" },
        { token: "comment", foreground: "566178" },
        { token: "keyword", foreground: "38bdf8" },
        { token: "string", foreground: "34d399" },
        { token: "number", foreground: "fbbf24" },
        { token: "type.identifier", foreground: "a78bfa" },
        { token: "identifier", foreground: "e8edf5" },
    ],
    colors: {
        "editor.background": "#12161e",
        "editor.foreground": "#e8edf5",
        "editorLineNumber.foreground": "#3c4757",
        "editorLineNumber.activeForeground": "#a3afc2",
        "editor.selectionBackground": "#2e3846",
        "editor.lineHighlightBackground": "#151a23",
        "editorCursor.foreground": "#38bdf8",
        "editorIndentGuide.background1": "#1a202b",
        "editorWidget.background": "#1a202b",
        "editorWidget.border": "#2e3846",
        "editorSuggestWidget.background": "#1a202b",
        "editorSuggestWidget.border": "#2e3846",
        "editorSuggestWidget.selectedBackground": "#2e3846",
        "editorHoverWidget.background": "#1a202b",
        "editorHoverWidget.border": "#2e3846",
        "scrollbarSlider.background": "#2e384688",
    },
});

monaco.editor.defineTheme(MONACO_THEMES.light, {
    base: "vs",
    inherit: true,
    rules: [
        { token: "", foreground: "12161e", background: "ffffff" },
        { token: "comment", foreground: "5d6a7e" },
        { token: "keyword", foreground: "0284c7" },
        { token: "string", foreground: "047857" },
        { token: "number", foreground: "92400e" },
        { token: "type.identifier", foreground: "8b5cf6" },
        { token: "identifier", foreground: "12161e" },
    ],
    colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#12161e",
        "editorLineNumber.foreground": "#9aa6b8",
        "editorLineNumber.activeForeground": "#566178",
        "editor.selectionBackground": "#c7d0de",
        "editor.lineHighlightBackground": "#f4f7fb",
        "editorCursor.foreground": "#0284c7",
        "editorIndentGuide.background1": "#e8edf5",
        "editorWidget.background": "#ffffff",
        "editorWidget.border": "#c7d0de",
        "editorSuggestWidget.background": "#ffffff",
        "editorSuggestWidget.border": "#c7d0de",
        "editorSuggestWidget.selectedBackground": "#e8edf5",
        "editorHoverWidget.background": "#ffffff",
        "editorHoverWidget.border": "#c7d0de",
        "scrollbarSlider.background": "#c7d0de88",
    },
});
