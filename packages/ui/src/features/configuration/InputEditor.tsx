import { useEffect, useId, useRef, useState } from "react";

import {
    useFilterSchemas,
    usePickIndex,
    usePickScript,
    usePickVideoFile,
    useScriptGuide,
} from "@av1ation/api";
import type { InputKind, VapourSynthImporter } from "@av1ation/contracts";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { type JsonSchema } from "../../shared/schema/config-schema";
import { setDraftBlocker } from "../../shared/draft-blockers";
import { Button } from "../../shared/Button";
import { FilterList } from "./FilterList";
import {
    variablesObject,
    type InputValue,
    type ScriptVariableDraft,
} from "../../shared/model/input-model";

export const FIELD =
    "h-8 min-w-0 rounded-md border border-line-strong bg-raised px-2 font-mono text-[10.5px] text-ink placeholder:text-ink-muted disabled:opacity-50";

export const INPUT_KINDS: ReadonlyArray<{ id: InputKind; label: string; note: string }> = [
    { id: "ffms2", label: "FFMS2", note: "Native decode" },
    { id: "vapour_synth", label: "VapourSynth", note: "Plugin importer" },
    { id: "vapour_synth_script", label: "VapourSynth script", note: ".vpy, one per video" },
];

export const IMPORTERS: ReadonlyArray<{
    id: VapourSynthImporter;
    label: string;
    note: string;
}> = [
    { id: "best_source", label: "BestSource", note: "Engine default" },
    { id: "ffms2", label: "FFmpegSource", note: "No index file" },
    { id: "lsmash", label: "L-SMASH-Works", note: "L-SMASH index" },
    { id: "dgdecnv", label: "DGDecNV", note: "Needs dgindexnv" },
];

/** One circular radio mark, shared by every choice card in the editor. */
export function RadioDot({ on }: { on: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                on ? "border-brand bg-brand" : "border-line-strong"
            }`}
        >
            {on ? <span className="h-1 w-1 rounded-full bg-on-brand" /> : null}
        </span>
    );
}

/**
 * One choice card. Input kinds, output modes and script modes use the same shape so a
 * selection never looks like a different control depending on which group it belongs to.
 */
export function ChoiceCard({
    selected,
    onSelect,
    label,
    note,
    disabled = false,
    role = "radio",
    className = "",
}: {
    selected: boolean;
    onSelect: () => void;
    label: string;
    note: string;
    disabled?: boolean;
    role?: "radio" | "button";
    className?: string;
}) {
    return (
        <button
            type="button"
            role={role}
            aria-checked={role === "radio" ? selected : undefined}
            disabled={disabled}
            onClick={onSelect}
            className={`flex min-h-[66px] min-w-0 flex-1 basis-36 items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${
                selected
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-sunken hover:border-line-strong"
            } ${className}`}
        >
            {role === "radio" ? <RadioDot on={selected} /> : null}
            <span className="min-w-0">
                <span className="block text-[11.5px] font-medium break-words text-ink">
                    {label}
                </span>
                <span className="mt-0.5 block text-[9.5px] leading-relaxed text-ink-muted">
                    {note}
                </span>
            </span>
        </button>
    );
}

/**
 * The variables a custom script reads with `condor_<name>`.
 *
 * The engine hands a script one string map, so every value is a string and the keys are
 * unique. A duplicate is described rather than written, because the map would keep one of
 * the two silently. The `condor_` prefix belongs to the runner, which replaces those keys on
 * every open, so a key in that namespace is reported here instead of disappearing at run
 * time.
 */
function ScriptVariablesEditor({
    rows,
    disabled,
    idPrefix,
    onChange,
}: {
    rows: ScriptVariableDraft[];
    disabled: boolean;
    idPrefix: string;
    onChange: (next: ScriptVariableDraft[]) => void;
}) {
    // The rows are kept as a list here, not read straight from the stored map: a row has no
    // name while it is being typed, and a repeated name is a mistake to show rather than one
    // to collapse. The map written to the document drops the blank key and keeps the last of
    // a repeated one, so the editor would erase the row the moment it appeared. A change that
    // did not come from this editor (a discard, another document) resets the list.
    const [drafts, setDrafts] = useState<ScriptVariableDraft[]>(rows);
    const emitted = useRef(JSON.stringify(variablesObject(rows)));
    const stored = JSON.stringify(variablesObject(rows));

    useEffect(() => {
        if (stored !== emitted.current) {
            emitted.current = stored;
            setDrafts(rows);
        }
    }, [rows, stored]);

    const commit = (next: ScriptVariableDraft[]) => {
        setDrafts(next);
        emitted.current = JSON.stringify(variablesObject(next));
        onChange(next);
    };

    const problems = drafts.map((row, index) => {
        const key = row.key.trim();
        if (key === "") {
            return null;
        }
        if (key.startsWith("condor_")) {
            return {
                message: "The runner owns every condor_ name and replaces this one on each open.",
                duplicate: false,
            };
        }
        return drafts.findIndex((other, cursor) => cursor < index && other.key.trim() === key) ===
            -1
            ? null
            : { message: "Another row already uses this key.", duplicate: true };
    });

    // A repeated key cannot be written: the engine stores one string map, so the second row
    // would silently replace the first. Save stays refused until the rows are distinct, and
    // the row above carries the reason for the reader looking at it.
    const blockerId = useId();
    const duplicateAt = problems.findIndex((problem) => problem?.duplicate === true);
    const blocker =
        duplicateAt === -1
            ? null
            : `Variable row ${String(duplicateAt + 1)} repeats a key. Give every row its own name.`;
    useEffect(() => {
        setDraftBlocker(blockerId, blocker);
        return () => setDraftBlocker(blockerId, null);
    }, [blockerId, blocker]);

    return (
        <div className="mt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-[10.5px] font-medium text-ink-secondary">Variables</p>
                <p className="m-0 text-[9.5px] text-ink-muted">
                    Read in the script as <code>condor_&lt;name&gt;</code>
                </p>
            </div>
            {drafts.length === 0 ? (
                <p className="m-0 mt-1.5 rounded-md border border-dashed border-line px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-muted">
                    No variable. The runner still injects its own scene table, paths, and sequence
                    configuration.
                </p>
            ) : (
                <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
                    {drafts.map((row, index) => {
                        const problem = problems[index] ?? null;
                        return (
                            // Index-keyed: a key that changes with the typed name would
                            // remount the input and drop focus after every character.
                            <li key={String(index)} className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <input
                                        aria-label={`Variable name ${String(index + 1)}`}
                                        aria-invalid={problem !== null}
                                        value={row.key}
                                        disabled={disabled}
                                        spellCheck={false}
                                        placeholder="name"
                                        onChange={(event) =>
                                            commit(
                                                drafts.map((entry, cursor) =>
                                                    cursor === index
                                                        ? {
                                                              ...entry,
                                                              key: event.target.value,
                                                          }
                                                        : entry,
                                                ),
                                            )
                                        }
                                        className={`${FIELD} w-40 flex-none font-mono ${problem === null ? "" : "border-danger"}`}
                                    />
                                    <span aria-hidden="true" className="text-[11px] text-ink-muted">
                                        =
                                    </span>
                                    <input
                                        aria-label={`Variable value ${String(index + 1)}`}
                                        value={row.value}
                                        disabled={disabled}
                                        spellCheck={false}
                                        placeholder="value"
                                        onChange={(event) =>
                                            commit(
                                                drafts.map((entry, cursor) =>
                                                    cursor === index
                                                        ? {
                                                              ...entry,
                                                              value: event.target.value,
                                                          }
                                                        : entry,
                                                ),
                                            )
                                        }
                                        className={`${FIELD} min-w-0 flex-1 font-mono`}
                                    />
                                    <button
                                        type="button"
                                        aria-label={`Remove variable ${row.key.trim() === "" ? String(index + 1) : row.key}`}
                                        title="Remove variable"
                                        disabled={disabled}
                                        onClick={() =>
                                            commit(drafts.filter((_, cursor) => cursor !== index))
                                        }
                                        className="rounded p-1 text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-danger disabled:pointer-events-none disabled:opacity-40"
                                    >
                                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                {problem === null ? null : (
                                    <p
                                        role="alert"
                                        className="m-0 mt-1 text-[10px] leading-relaxed text-danger"
                                    >
                                        {problem.message}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            <Button
                variant="secondary"
                className="mt-2 h-8 px-2.5 text-[10.5px]"
                id={`${idPrefix}-add-variable`}
                disabled={disabled}
                onClick={() => commit([...drafts, { key: "", value: "" }])}
            >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                Add variable
            </Button>
        </div>
    );
}

export function inputValueFilters(value: InputValue): unknown[] {
    return value.kind === "ffms2" ? value.ffms2Filters : value.vapourSynthFilters;
}

export function withInputValueFilters(value: InputValue, filters: unknown[]): InputValue {
    return value.kind === "ffms2"
        ? { ...value, ffms2Filters: filters }
        : { ...value, vapourSynthFilters: filters };
}

/** The engine schema for one input's filter list, when the service has answered. */
function filterSchema(
    schemas: { ffms2: unknown; vapour_synth: unknown } | undefined,
    kind: InputKind,
): JsonSchema | undefined {
    if (schemas === undefined) {
        return undefined;
    }
    const raw = kind === "ffms2" ? schemas.ffms2 : schemas.vapour_synth;
    return typeof raw === "object" && raw !== null ? (raw as JsonSchema) : undefined;
}

/**
 * The one input editor. It is used for the project template and for a concrete custom
 * input override, because those are the same decision: how the frames are decoded and
 * which filters run before anything else. A second, schema-shaped form for the override
 * would teach a different model and drift from the template.
 *
 * `mode` only decides what the input itself can state: a sequence or project document
 * describes a decode for every video, so it names neither a source nor an index file, while
 * a video's own input needs both because they name that one file.
 *
 * `allowedKinds` narrows the choice for a context that cannot accept every kind, and hides
 * the kind row when one kind is all that context allows.
 */
export function InputEditor({
    value,
    onChange,
    disabled = false,
    idPrefix,
    mode,
    showHeading = true,
    allowedKinds,
    onEditScript,
    scriptStorageLabel = "Stored in the project document",
}: {
    value: InputValue;
    onChange: (next: InputValue) => void;
    disabled?: boolean;
    idPrefix: string;
    mode: "defaults" | "input";
    showHeading?: boolean;
    /**
     * Opens the dedicated script page. A script is a program, so a context that can offer
     * the page never falls back to a textarea; one that cannot keeps the inline editor.
     */
    onEditScript?: (() => void) | undefined;
    allowedKinds?: readonly InputKind[];
    /** Where stored text lives, named by the context that owns the document. */
    scriptStorageLabel?: string;
}) {
    const kinds =
        allowedKinds === undefined
            ? INPUT_KINDS
            : INPUT_KINDS.filter((option) => allowedKinds.includes(option.id));
    const pickScript = usePickScript();
    // Choosing stored text starts from the generated template, not an empty buffer: the
    // service refuses an empty custom script, so a document would be unsavable until the
    // user found the script page. The page seeds the same template when it opens.
    const scriptGuide = useScriptGuide();
    const pickIndex = usePickIndex();
    const pickVideo = usePickVideoFile();
    const schemas = useFilterSchemas();

    const update = (patch: Partial<InputValue>) => onChange({ ...value, ...patch });
    const scriptMode = value.scriptMode;
    // The template may still be loading when the kind is chosen, so the seed cannot live in
    // the click handler alone: an empty stored script is refused by the service, which would
    // make the draft unsavable and unreachable from the script page.
    const seeded = useRef(false);
    // A document that already had text is never reseeded: clearing the editor is a deliberate
    // draft, not a request for the template.
    const hadText = useRef(false);
    if (value.scriptText.trim() !== "") {
        hadText.current = true;
    }
    useEffect(() => {
        if (
            disabled ||
            seeded.current ||
            hadText.current ||
            scriptMode !== "text" ||
            value.scriptText.trim() !== "" ||
            scriptGuide.data === undefined
        ) {
            return;
        }
        seeded.current = true;
        onChange({ ...value, scriptText: scriptGuide.data.template });
    }, [disabled, onChange, scriptGuide.data, scriptMode, value]);
    const schema = filterSchema(schemas.data, value.kind);
    const filters = inputValueFilters(value);
    const needsPath = mode === "input" && value.kind !== "vapour_synth_script";
    const pathMissing = needsPath && value.path.trim() === "";
    const scriptMissing =
        value.kind === "vapour_synth_script" && scriptMode === "file" && value.script.trim() === "";
    const scriptTextMissing =
        value.kind === "vapour_synth_script" &&
        scriptMode === "text" &&
        value.scriptText.trim() === "";

    return (
        <>
            <div className="min-w-0">
                {showHeading ? (
                    <p className="m-0 font-mono text-[10px] tracking-[0.16em] text-ink-secondary uppercase">
                        Input
                    </p>
                ) : null}
                {kinds.length > 1 ? (
                    <div
                        role="radiogroup"
                        aria-label="Input kind"
                        className={`flex flex-wrap gap-2 ${showHeading ? "mt-2" : ""}`}
                    >
                        {kinds.map((option) => (
                            <ChoiceCard
                                key={option.id}
                                selected={value.kind === option.id}
                                disabled={disabled}
                                onSelect={() => update({ kind: option.id })}
                                label={option.label}
                                note={option.note}
                            />
                        ))}
                    </div>
                ) : null}

                {needsPath ? (
                    <div className="mt-3">
                        <label
                            htmlFor={`${idPrefix}-path`}
                            className="text-[10.5px] font-medium text-ink-secondary"
                        >
                            Input path
                        </label>
                        <div className="mt-1 flex flex-wrap gap-2">
                            <input
                                id={`${idPrefix}-path`}
                                aria-label="Input path"
                                value={value.path}
                                disabled={disabled}
                                onChange={(event) => update({ path: event.target.value })}
                                placeholder="Path to the source file"
                                spellCheck={false}
                                className={`${FIELD} flex-1 basis-48`}
                            />
                            {pickVideo === null ? null : (
                                <Button
                                    variant="secondary"
                                    className="h-8 px-2.5 text-[10.5px]"
                                    disabled={disabled}
                                    onClick={() => {
                                        void pickVideo()
                                            .then((picked) => {
                                                if (picked !== null) {
                                                    update({ path: picked });
                                                }
                                            })
                                            .catch((error: unknown) => {
                                                toast.error(
                                                    error instanceof Error
                                                        ? `The video picker could not open: ${error.message}`
                                                        : "The video picker could not open.",
                                                );
                                            });
                                    }}
                                >
                                    <FolderOpen
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                        strokeWidth={1.6}
                                    />
                                    Locate…
                                </Button>
                            )}
                        </div>
                        {pathMissing ? (
                            <p className="m-0 mt-1 text-[10.5px] text-ink-muted">
                                Choose the source this override decodes.
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {value.kind === "ffms2" && mode === "input" ? (
                    <div className="mt-3">
                        <label
                            htmlFor={`${idPrefix}-index`}
                            className="text-[10.5px] font-medium text-ink-secondary"
                        >
                            Index file · optional
                        </label>
                        <div className="mt-1 flex flex-wrap gap-2">
                            <input
                                id={`${idPrefix}-index`}
                                aria-label="FFMS2 index file"
                                value={value.indexFile}
                                disabled={disabled}
                                onChange={(event) => update({ indexFile: event.target.value })}
                                placeholder="Auto · beside the source"
                                spellCheck={false}
                                className={`${FIELD} flex-1 basis-48`}
                            />
                            {pickIndex === null ? null : (
                                <Button
                                    variant="secondary"
                                    className="h-8 px-2.5 text-[10.5px]"
                                    disabled={disabled}
                                    onClick={() => {
                                        void pickIndex()
                                            .then((picked) => {
                                                if (picked !== null) {
                                                    update({ indexFile: picked });
                                                }
                                            })
                                            .catch(() => {
                                                toast.error(
                                                    "The index file picker could not open.",
                                                );
                                            });
                                    }}
                                >
                                    <FolderOpen
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                        strokeWidth={1.6}
                                    />
                                    Locate…
                                </Button>
                            )}
                        </div>
                        <p className="mt-1 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            Built once per source and reused across runs. Empty uses the engine
                            default beside the video.
                        </p>
                    </div>
                ) : null}

                {value.kind === "vapour_synth" ? (
                    <div className="mt-3">
                        <p className="m-0 text-[10.5px] font-medium text-ink-secondary">
                            Source plugin
                        </p>
                        <div
                            role="radiogroup"
                            aria-label="Source plugin"
                            className="mt-1.5 grid gap-1.5 sm:grid-cols-2"
                        >
                            {IMPORTERS.map((importer) => {
                                const selected = value.importMethod === importer.id;
                                return (
                                    <button
                                        key={importer.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        disabled={disabled}
                                        onClick={() => update({ importMethod: importer.id })}
                                        className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${
                                            selected
                                                ? "border-brand bg-brand-soft"
                                                : "border-line bg-sunken hover:border-line-strong"
                                        }`}
                                    >
                                        <RadioDot on={selected} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-[11px] text-ink">
                                                {importer.label}
                                            </span>
                                            <span className="block text-[9.5px] text-ink-muted">
                                                {importer.note}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {value.kind === "vapour_synth_script" ? (
                    <div className="mt-3">
                        <p className="m-0 text-[10.5px] font-medium text-ink-secondary">
                            Script source
                        </p>
                        {/* One row per source, with its own control inside it: a located file
                            is chosen from the same row, and stored text opens its page from
                            the same row. A separate control row per mode cost more height
                            than the choice itself. */}
                        <div
                            role="radiogroup"
                            aria-label="Script source"
                            className="mt-1.5 flex flex-col gap-1.5"
                        >
                            <div
                                className={`rounded-lg border px-3 py-2 transition-colors duration-150 ${
                                    scriptMode === "file"
                                        ? "border-brand bg-brand-soft"
                                        : "border-line bg-sunken hover:border-line-strong"
                                }`}
                            >
                                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={scriptMode === "file"}
                                        disabled={disabled}
                                        onClick={() => update({ scriptMode: "file" })}
                                        className="flex min-w-0 flex-1 basis-56 items-center gap-2.5 text-left disabled:pointer-events-none disabled:opacity-50"
                                    >
                                        <RadioDot on={scriptMode === "file"} />
                                        <span className="min-w-0">
                                            <span className="block text-[11.5px] font-medium text-ink">
                                                Locate a .vpy script file
                                            </span>
                                            <span className="mt-0.5 block text-[9.5px] leading-relaxed text-ink-muted">
                                                Used as written, never rewritten
                                            </span>
                                        </span>
                                    </button>
                                    {scriptMode === "file" ? (
                                        <div className="flex h-8 min-w-0 flex-1 basis-56 items-stretch overflow-hidden rounded-md border border-line-strong bg-raised focus-within:border-brand">
                                            <input
                                                aria-label="Script path"
                                                value={value.script}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    update({ script: event.target.value })
                                                }
                                                placeholder="C:/scripts/clip.vpy"
                                                spellCheck={false}
                                                className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[11px] text-ink placeholder:text-ink-muted focus:outline-none disabled:opacity-50"
                                            />
                                            {pickScript === null ? null : (
                                                <button
                                                    type="button"
                                                    disabled={disabled}
                                                    onClick={() => {
                                                        void pickScript()
                                                            .then((picked) => {
                                                                if (picked !== null) {
                                                                    update({ script: picked });
                                                                }
                                                            })
                                                            .catch((error: unknown) =>
                                                                toast.error(
                                                                    error instanceof Error
                                                                        ? `The script picker could not open: ${error.message}`
                                                                        : "The script picker could not open.",
                                                                ),
                                                            );
                                                    }}
                                                    className="inline-flex shrink-0 items-center gap-1 border-l border-line px-2.5 text-[10.5px] text-ink-secondary hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                                                >
                                                    <FolderOpen
                                                        aria-hidden="true"
                                                        className="h-3 w-3"
                                                        strokeWidth={1.6}
                                                    />
                                                    Locate
                                                </button>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                                {scriptMissing ? (
                                    <p
                                        role="alert"
                                        className="m-0 mt-1.5 text-[10.5px] text-danger"
                                    >
                                        Choose a .vpy file, or switch to a custom script.
                                    </p>
                                ) : null}
                            </div>

                            <div
                                className={`rounded-lg border px-3 py-2 transition-colors duration-150 ${
                                    scriptMode === "text"
                                        ? "border-brand bg-brand-soft"
                                        : "border-line bg-sunken hover:border-line-strong"
                                }`}
                            >
                                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={scriptMode === "text"}
                                        disabled={disabled}
                                        onClick={() =>
                                            update({
                                                scriptMode: "text",
                                                ...(value.scriptText.trim() === "" &&
                                                scriptGuide.data !== undefined
                                                    ? { scriptText: scriptGuide.data.template }
                                                    : {}),
                                            })
                                        }
                                        className="flex min-w-0 flex-1 basis-56 items-center gap-2.5 text-left disabled:pointer-events-none disabled:opacity-50"
                                    >
                                        <RadioDot on={scriptMode === "text"} />
                                        <span className="min-w-0">
                                            <span className="block text-[11.5px] font-medium text-ink">
                                                Edit a custom VapourSynth script
                                            </span>
                                            <span className="mt-0.5 block truncate text-[9.5px] leading-relaxed text-ink-muted">
                                                {scriptStorageLabel}
                                            </span>
                                        </span>
                                    </button>
                                    {scriptMode === "text" ? (
                                        <div className="flex min-w-0 flex-1 basis-56 flex-wrap items-center justify-end gap-2">
                                            <span className="text-[10px] text-ink-muted">
                                                {value.scriptText.trim() === ""
                                                    ? "No script yet"
                                                    : `${String(value.scriptText.split("\n").length)} lines`}
                                            </span>
                                            {onEditScript === undefined ? null : (
                                                <Button
                                                    variant="secondary"
                                                    className="h-7 shrink-0 px-2.5 text-[10.5px]"
                                                    disabled={disabled}
                                                    onClick={onEditScript}
                                                >
                                                    Open editor
                                                </Button>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                                {scriptMode === "text" && onEditScript === undefined ? (
                                    <textarea
                                        aria-label="Custom VapourSynth script"
                                        value={value.scriptText}
                                        disabled={disabled}
                                        onChange={(event) =>
                                            update({ scriptText: event.target.value })
                                        }
                                        placeholder={
                                            "import vapoursynth as vs\ncore = vs.core\nclip = core.bs.VideoSource(source)\nclip.set_output()"
                                        }
                                        rows={9}
                                        spellCheck={false}
                                        className="mt-2 w-full min-w-0 rounded-md border border-line-strong bg-raised px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50"
                                    />
                                ) : null}
                                {scriptTextMissing ? (
                                    <p
                                        role="alert"
                                        className="m-0 mt-1.5 text-[10.5px] text-danger"
                                    >
                                        The custom script is empty.
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <ScriptVariablesEditor
                            rows={value.variables}
                            disabled={disabled}
                            idPrefix={idPrefix}
                            onChange={(variables) => update({ variables })}
                        />
                    </div>
                ) : null}

                {value.kind === "ffms2" ||
                value.kind === "vapour_synth" ||
                value.kind === "vapour_synth_script" ? (
                    <div className="mt-4">
                        {schemas.isError ? (
                            <p className="m-0 rounded-md border border-line bg-sunken px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-muted">
                                The engine filter schema could not be loaded, so the forms are
                                unavailable.
                            </p>
                        ) : (
                            <FilterList
                                label="Filters"
                                help="Drag to reorder"
                                filters={filters}
                                schema={schema}
                                target={value.kind === "ffms2" ? "ffms2" : "vapour_synth"}
                                disabled={disabled}
                                emptyText={
                                    value.kind === "vapour_synth_script"
                                        ? "No filter chained. The script's output is used as it is."
                                        : "No filter configured. The engine's 10-bit conversion applies when the list is empty."
                                }
                                onChange={(next) => onChange(withInputValueFilters(value, next))}
                            />
                        )}
                    </div>
                ) : null}
            </div>
        </>
    );
}
