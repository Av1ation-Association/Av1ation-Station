import { usePickDirectory } from "@av1ation/api";
import type {
    GeneralDefaults,
    InputKind,
    OutputMode,
    VapourSynthImporter,
} from "@av1ation/contracts";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";

import { ChoiceCard, IMPORTERS, INPUT_KINDS, InputEditor } from "./InputEditor";
import {
    variablesObject,
    type InputValue,
    type ScriptVariableDraft,
} from "../../shared/model/input-model";

function importerLabel(importer: VapourSynthImporter): string {
    return IMPORTERS.find((entry) => entry.id === importer)?.label ?? importer;
}

function outputModeLabel(mode: OutputMode): string {
    return mode === "next_to_input" ? "Next to input" : "One folder";
}

export function generalInputKindLabel(kind: InputKind): string {
    return INPUT_KINDS.find((entry) => entry.id === kind)?.label ?? kind;
}

/** The shared editor's value, read from the project template document. */
function inputValueOf(value: GeneralDefaults): InputValue {
    return {
        kind: value.input_kind,
        path: "",
        indexFile: value.index_file ?? "",
        importMethod: value.import_method ?? "best_source",
        scriptMode: value.script_mode ?? "file",
        script: value.script ?? "",
        scriptText: value.script_text ?? "",
        ffms2Filters: value.ffms2_filters ?? [],
        vapourSynthFilters: value.vapour_synth_filters ?? [],
        variables: variableRows(value.variables),
    };
}

/** The template stores the script variables as one string map; the editor needs rows. */
function variableRows(value: Record<string, string> | undefined): ScriptVariableDraft[] {
    return Object.entries(value ?? {}).map(([key, entry]) => ({ key, value: entry }));
}

/** Writes the shared editor's value back, leaving the output policy untouched. */
function withInputValue(value: GeneralDefaults, next: InputValue): GeneralDefaults {
    return {
        ...value,
        input_kind: next.kind,
        index_file: next.indexFile,
        import_method: next.importMethod,
        script_mode: next.scriptMode,
        script: next.script,
        script_text: next.scriptText,
        ffms2_filters: next.ffms2Filters,
        vapour_synth_filters: next.vapourSynthFilters,
        variables: variablesObject(next.variables),
    };
}

/**
 * The one General defaults document both a project and the global template edit.
 *
 * The input half is `InputEditor`, the same component a concrete custom input override
 * uses, so the three input kinds, the decoder radio group, the script source, and the
 * engine-schema filter list are one control family in every context. Only the output
 * policy is particular to defaults.
 */
export function GeneralDefaultsEditor({
    value,
    onChange,
    disabled = false,
    idPrefix,
    onEditScript,
    scope = "project",
}: {
    value: GeneralDefaults;
    onChange: (next: GeneralDefaults) => void;
    disabled?: boolean;
    idPrefix: string;
    /** Opens the dedicated script page; a template with no project cannot offer one. */
    onEditScript?: (() => void) | undefined;
    /** A project document or the template every new project copies. */
    scope?: "project" | "template";
}) {
    const pickDirectory = usePickDirectory();
    const update = (patch: Partial<GeneralDefaults>) => onChange({ ...value, ...patch });
    const folderMissing =
        value.output_mode === "folder" && (value.output_folder ?? "").trim() === "";

    return (
        <div className="grid gap-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_392px]">
                <InputEditor
                    value={inputValueOf(value)}
                    onChange={(next) => onChange(withInputValue(value, next))}
                    disabled={disabled}
                    idPrefix={idPrefix}
                    mode="defaults"
                    onEditScript={onEditScript}
                    scriptStorageLabel={
                        scope === "template"
                            ? "Stored in the project template"
                            : "Stored in the project document"
                    }
                />

                <div>
                    <p className="m-0 font-mono text-[10px] tracking-[0.16em] text-ink-secondary uppercase">
                        Output
                    </p>
                    <div
                        role="radiogroup"
                        aria-label="Output location"
                        className="mt-2 grid gap-2 sm:grid-cols-2"
                    >
                        <ChoiceCard
                            selected={value.output_mode === "next_to_input"}
                            disabled={disabled}
                            onSelect={() => update({ output_mode: "next_to_input" })}
                            label="Next to input"
                            note="Same folder as the source"
                            className="min-h-0"
                        />
                        <ChoiceCard
                            selected={value.output_mode === "folder"}
                            disabled={disabled}
                            onSelect={() => update({ output_mode: "folder" })}
                            label="Specific folder"
                            note="A folder path, never a file name"
                            className="min-h-0"
                        />
                    </div>
                    {value.output_mode === "folder" ? (
                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-sunken py-1 pr-1 pl-2.5">
                            <FolderOpen
                                aria-hidden="true"
                                className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                                strokeWidth={1.6}
                            />
                            <input
                                aria-label="Output folder"
                                value={value.output_folder ?? ""}
                                disabled={disabled}
                                onChange={(event) =>
                                    update({
                                        output_mode: "folder",
                                        output_folder: event.target.value,
                                    })
                                }
                                placeholder="/Volumes/Media/Aviation Station"
                                spellCheck={false}
                                className="h-7 min-w-0 flex-1 basis-32 border-0 bg-transparent font-mono text-[10px] text-ink-secondary outline-none placeholder:text-ink-muted disabled:opacity-60"
                            />
                            {pickDirectory === null ? null : (
                                <button
                                    type="button"
                                    aria-label="Locate an output folder"
                                    title="Locate an output folder"
                                    disabled={disabled}
                                    onClick={() => {
                                        void pickDirectory()
                                            .then((picked) => {
                                                if (picked !== null) {
                                                    update({
                                                        output_mode: "folder",
                                                        output_folder: picked,
                                                    });
                                                }
                                            })
                                            .catch((error: unknown) =>
                                                toast.error(
                                                    error instanceof Error
                                                        ? `The folder picker could not open: ${error.message}`
                                                        : "The folder picker could not open.",
                                                ),
                                            );
                                    }}
                                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-line bg-raised px-2 text-[10px] text-ink-secondary hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                                >
                                    <FolderOpen
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                        strokeWidth={1.6}
                                    />
                                    Locate…
                                </button>
                            )}
                        </div>
                    ) : null}
                    {folderMissing ? (
                        <p role="alert" className="m-0 mt-1 text-[10.5px] text-danger">
                            Specific-folder output needs a folder path.
                        </p>
                    ) : null}

                    <p className="mt-4 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                        Existing videos keep their own output. This applies to videos added from now
                        on.
                    </p>
                </div>
            </div>
            {/* The page-level note sits under both columns, as the board draws it: inside the
                input column it read as a property of Input and separated it from Output. */}
            <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                Input and output are defaults. A sequence can override its own input; the exact
                output file is chosen per video.
            </p>
        </div>
    );
}

/** Only the fields the selected input and output kinds actually use. */
export function generalDefaultsPayload(value: GeneralDefaults): GeneralDefaults {
    const mode = value.script_mode ?? "file";
    return {
        input_kind: value.input_kind,
        output_mode: value.output_mode,
        ...(value.output_mode === "folder"
            ? { output_folder: (value.output_folder ?? "").trim() }
            : {}),
        ...(value.input_kind === "ffms2" ? { index_file: (value.index_file ?? "").trim() } : {}),
        ...(value.input_kind === "vapour_synth"
            ? { import_method: value.import_method ?? "best_source" }
            : {}),
        ...(value.input_kind === "vapour_synth_script"
            ? {
                  script_mode: mode,
                  ...(mode === "file"
                      ? { script: (value.script ?? "").trim() }
                      : { script_text: value.script_text ?? "" }),
                  variables: value.variables ?? {},
              }
            : {}),
        // Both lists travel even for the inactive kind: switching input kinds must not
        // discard filter work the user already did.
        ffms2_filters: value.ffms2_filters ?? [],
        vapour_synth_filters: value.vapour_synth_filters ?? [],
    };
}

/** The one reason a General draft cannot be saved, or `null` when it can. */
export function generalDefaultsIncomplete(value: GeneralDefaults): string | null {
    if (value.output_mode === "folder" && (value.output_folder ?? "").trim() === "") {
        return "Specific-folder output needs a folder path.";
    }
    if (value.input_kind === "vapour_synth_script") {
        const mode = value.script_mode ?? "file";
        if (mode === "file" && (value.script ?? "").trim() === "") {
            return "Choose a .vpy file, or switch to a custom script.";
        }
        // The service refuses an empty stored script, so this draft cannot be saved. The
        // input editor and the script page seed the generated template when text is chosen;
        // this only catches a script the user deliberately cleared.
        if (mode === "text" && (value.script_text ?? "").trim() === "") {
            return "The custom script is empty.";
        }
    }
    return null;
}

/** Human-readable differences for the unsaved-changes guard, built from the payloads. */
export function generalDefaultsChanges(
    saved: GeneralDefaults,
    draft: GeneralDefaults,
): Array<{ label: string; from: string; to: string }> {
    const before = generalDefaultsPayload(saved);
    const after = generalDefaultsPayload(draft);
    const changes: Array<{ label: string; from: string; to: string }> = [];
    const scriptLength = (text: string | null | undefined): string =>
        text === undefined || text === null ? "—" : `${String(text.length)} chars`;
    if (before.input_kind !== after.input_kind) {
        changes.push({
            label: "Input",
            from: generalInputKindLabel(before.input_kind),
            to: generalInputKindLabel(after.input_kind),
        });
    }
    if (before.output_mode !== after.output_mode) {
        changes.push({
            label: "Output",
            from: outputModeLabel(before.output_mode),
            to: outputModeLabel(after.output_mode),
        });
    }
    if (
        before.output_mode === "folder" &&
        (before.output_folder ?? "") !== (after.output_folder ?? "")
    ) {
        changes.push({
            label: "Output folder",
            from: before.output_folder ?? "—",
            to: after.output_folder ?? "—",
        });
    }
    if (before.input_kind === "ffms2" && (before.index_file ?? "") !== (after.index_file ?? "")) {
        changes.push({
            label: "FFMS2 index",
            from: before.index_file ?? "Auto",
            to: after.index_file ?? "Auto",
        });
    }
    if (
        before.input_kind === "vapour_synth" &&
        (before.import_method ?? "best_source") !== (after.import_method ?? "best_source")
    ) {
        changes.push({
            label: "Source plugin",
            from: importerLabel(before.import_method ?? "best_source"),
            to: importerLabel(after.import_method ?? "best_source"),
        });
    }
    if (before.input_kind === "vapour_synth_script") {
        if ((before.script_mode ?? "file") !== (after.script_mode ?? "file")) {
            changes.push({
                label: "Script source",
                from: (before.script_mode ?? "file") === "file" ? "Script file" : "Custom script",
                to: (after.script_mode ?? "file") === "file" ? "Script file" : "Custom script",
            });
        }
        if ((before.script ?? "") !== (after.script ?? "")) {
            changes.push({
                label: "Script",
                from: before.script ?? "—",
                to: after.script ?? "—",
            });
        }
    }
    if ((before.script_text ?? "") !== (after.script_text ?? "")) {
        changes.push({
            label: "Custom script",
            from: scriptLength(before.script_text),
            to: scriptLength(after.script_text),
        });
    }
    if ((before.ffms2_filters ?? []).length !== (after.ffms2_filters ?? []).length) {
        changes.push({
            label: "FFMS2 filters",
            from: String((before.ffms2_filters ?? []).length),
            to: String((after.ffms2_filters ?? []).length),
        });
    }
    if ((before.vapour_synth_filters ?? []).length !== (after.vapour_synth_filters ?? []).length) {
        changes.push({
            label: "VapourSynth filters",
            from: String((before.vapour_synth_filters ?? []).length),
            to: String((after.vapour_synth_filters ?? []).length),
        });
    }
    const variableCount = (value: GeneralDefaults): number =>
        Object.keys(value.variables ?? {}).length;
    if (variableCount(before) !== variableCount(after)) {
        changes.push({
            label: "Script variables",
            from: String(variableCount(before)),
            to: String(variableCount(after)),
        });
    }
    return changes;
}
