import type { InputKind, ScriptInputMode, VapourSynthImporter } from "@av1ation/contracts";

type EngineRecord = Record<string, unknown>;

/**
 * What an input editor shows, independent of where the document stores it: the project
 * template and a concrete custom input are the same choice with the same fields.
 */
export interface InputValue {
    kind: InputKind;
    /** The decoded source. A template has none; a custom input requires one. */
    path: string;
    indexFile: string;
    importMethod: VapourSynthImporter;
    scriptMode: ScriptInputMode;
    script: string;
    scriptText: string;
    ffms2Filters: unknown[];
    vapourSynthFilters: unknown[];
    /**
     * The script's own `variables` map, as an ordered list.
     *
     * The engine stores a map, but the editor needs a draft order and a stable row identity
     * while a key is being typed into an empty row. Duplicates are resolved on write, last
     * occurrence winning, so a half-typed key never silently drops the row beneath it.
     */
    variables: ScriptVariableDraft[];
}

/** One editable key/value pair for a script's variables map. */
export interface ScriptVariableDraft {
    key: string;
    value: string;
}

/** The engine's externally tagged import-method names, keyed by the app's importer ids. */
export const IMPORTER_TAGS: Record<VapourSynthImporter, string> = {
    best_source: "BestSource",
    ffms2: "FFMS2",
    lsmash: "LSMASHWorks",
    dgdecnv: "DGDecNV",
};

export const TAG_IMPORTERS: Record<string, VapourSynthImporter> = {
    BestSource: "best_source",
    FFMS2: "ffms2",
    LSMASHWorks: "lsmash",
    DGDecNV: "dgdecnv",
};

function record(value: unknown): EngineRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as EngineRecord)
        : {};
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

/** The value a new editor starts from, for the kind the context can accept. */
export function emptyInputValue(kind: InputKind = "ffms2"): InputValue {
    return {
        kind,
        path: "",
        indexFile: "",
        importMethod: "best_source",
        scriptMode: "file",
        script: "",
        scriptText: "",
        ffms2Filters: [],
        vapourSynthFilters: [],
        variables: [],
    };
}

/** The editor's ordered rows for a stored `variables` map. */
function variableRows(value: unknown): ScriptVariableDraft[] {
    return Object.entries(record(value)).map(([key, entry]) => ({
        key,
        value: typeof entry === "string" ? entry : String(entry ?? ""),
    }));
}

/**
 * The map a stored `variables` list becomes.
 *
 * A blank key is not a variable: it is a row the user has not finished naming. A repeated
 * key keeps its last value, which is the row the user just typed into.
 */
export function variablesObject(rows: ScriptVariableDraft[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const row of rows) {
        const key = row.key.trim();
        if (key !== "") {
            map[key] = row.value;
        }
    }
    return map;
}

/** Reads the engine's tagged `Input` into the shared editor's flat value. */
export function inputValueOf(input: unknown): InputValue {
    const base = emptyInputValue();
    if (input === null || input === undefined) {
        return base;
    }
    const value = record(input);
    if (value.Video !== undefined) {
        const video = record(value.Video);
        const method = record(record(video.import_method).FFMS2);
        return {
            ...base,
            kind: "ffms2",
            path: text(video.path),
            indexFile: text(method.cache_path),
            ffms2Filters: list(video.filters),
        };
    }
    if (value.VapourSynth !== undefined) {
        const vapourSynth = record(value.VapourSynth);
        const method = record(vapourSynth.import_method);
        const tag = Object.keys(method)[0] ?? "BestSource";
        return {
            ...base,
            kind: "vapour_synth",
            path: text(vapourSynth.path),
            importMethod: TAG_IMPORTERS[tag] ?? "best_source",
            vapourSynthFilters: list(vapourSynth.filters),
        };
    }
    if (value.VapourSynthScript !== undefined) {
        const script = record(value.VapourSynthScript);
        const source = record(script.source);
        return {
            ...base,
            kind: "vapour_synth_script",
            scriptMode: source.Text === undefined ? "file" : "text",
            script: text(source.Path),
            scriptText: text(source.Text),
            vapourSynthFilters: list(script.filters),
            variables: variableRows(script.variables),
        };
    }
    return base;
}

/**
 * Writes the shared editor's flat value back as the engine's tagged `Input`.
 *
 * Fields the shared editor does not expose — a script's variables and concurrency, a
 * VapourSynth cache path, the FFMS2 track index — are carried over from the value that was
 * already there. Editing an override must not erase settings it never showed.
 */
export function inputFromValue(next: InputValue, previous: unknown): EngineRecord {
    const prev = record(previous);
    if (next.kind === "ffms2") {
        const previousVideo = record(prev.Video);
        const previousMethod = record(record(previousVideo.import_method).FFMS2);
        return {
            Video: {
                path: next.path.trim(),
                filters: next.ffms2Filters,
                import_method: {
                    FFMS2: {
                        cache_path: next.indexFile.trim() === "" ? null : next.indexFile.trim(),
                        index:
                            typeof previousMethod.index === "number" ? previousMethod.index : null,
                    },
                },
            },
        };
    }
    if (next.kind === "vapour_synth") {
        const previousVapourSynth = record(prev.VapourSynth);
        const tag = IMPORTER_TAGS[next.importMethod] ?? "BestSource";
        const previousMethod = record(previousVapourSynth.import_method);
        return {
            VapourSynth: {
                path: next.path.trim(),
                cache_path: text(previousVapourSynth.cache_path) || null,
                filters: next.vapourSynthFilters,
                import_method: { [tag]: record(previousMethod[tag]) },
            },
        };
    }
    const previousScript = record(prev.VapourSynthScript);
    return {
        VapourSynthScript: {
            source:
                next.scriptMode === "file"
                    ? { Path: next.script.trim() }
                    : { Text: next.scriptText },
            filters: next.vapourSynthFilters,
            variables: variablesObject(next.variables),
            index: typeof previousScript.index === "number" ? previousScript.index : 0,
            stream_concurrently:
                typeof previousScript.stream_concurrently === "boolean"
                    ? previousScript.stream_concurrently
                    : true,
        },
    };
}

/** The kind a stored engine `Input` names, or `null` when it is not one. */
export function inputKindOf(input: unknown): InputKind | null {
    if (typeof input !== "object" || input === null) {
        return null;
    }
    const value = record(input);
    if (value.Video !== undefined) {
        return "ffms2";
    }
    if (value.VapourSynth !== undefined) {
        return "vapour_synth";
    }
    return value.VapourSynthScript !== undefined ? "vapour_synth_script" : null;
}

/** One line for a collapsed override row. */
export function inputSummary(input: unknown): string {
    const value = inputValueOf(input);
    if (value.kind === "vapour_synth_script") {
        const source =
            value.scriptMode === "file"
                ? value.script.trim() === ""
                    ? "script file missing"
                    : value.script
                : "inline script";
        return `VapourSynth script · ${source} · ${filterCount(value.vapourSynthFilters.length)}`;
    }
    const filters =
        value.kind === "ffms2" ? value.ffms2Filters.length : value.vapourSynthFilters.length;
    return `${value.kind === "ffms2" ? "FFMS2" : "VapourSynth"} · ${filterCount(filters)}`;
}

/** `1 filter` reads as a count; `1 filters` reads as a bug. */
function filterCount(count: number): string {
    return `${String(count)} ${count === 1 ? "filter" : "filters"}`;
}
