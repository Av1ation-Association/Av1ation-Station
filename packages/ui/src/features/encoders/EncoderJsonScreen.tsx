import { useEffect, useMemo, useRef, useState } from "react";

import {
    useEncoders,
    useSaveTextFile,
    useSetEncoderParameters,
    useUpdateEncoderFork,
} from "@av1ation/api";
import type { EncoderDescriptor, ParameterDescriptor } from "@av1ation/contracts";
import { useParams } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { friendlyName } from "./encoder-names";
import {
    descriptorCount,
    encoderDocumentText,
    type EncoderIssue,
    MAX_LISTED_ISSUES,
    parseEncoderDocument,
} from "./encoder-json";
import { Button } from "../../shared/Button";
import {
    buildOption,
    isDefaultOption,
    optionName,
    startingValue,
    withOptionValue,
} from "./encoder-options";
import { JsonEditor } from "./JsonEditor";
import { ParameterValueGrid, type ParameterValueEntry } from "./ParameterValueGrid";
import { groupParameters, hasDefault } from "./parameter-summary";
import { DraftActions } from "../../shared/TopBarActions";
import { useLeaveGuard, useUnsavedChanges } from "../../shared/UnsavedChanges";
import { downloadText } from "../../shared/download";

/** A file name that tells this encoder's export apart from the next one's. */
function exportFileName(encoder: EncoderDescriptor): string {
    const stem = encoder.fork ? `${encoder.base}-${encoder.label}` : encoder.base;
    const safe = stem.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
    return `${safe === "" ? "encoder" : safe}-parameters.json`;
}

/** One list with no problems: a stable identity, so the editor repaints only when it changes. */
const NO_ISSUES: readonly EncoderIssue[] = [];

/**
 * The widgets' own values, seeded from the document's descriptors.
 *
 * The document says what a parameter is, not what it is set to, so the preview starts each
 * control at the descriptor's default. Anything typed here is scratch: the JSON above is
 * the only thing this page saves, which is why the values live in state rather than in the
 * draft.
 */
function seedValues(parameters: Record<string, ParameterDescriptor>): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const [canonical, descriptor] of Object.entries(parameters)) {
        values[optionName(canonical)] = buildOption(
            canonical,
            descriptor,
            startingValue(descriptor),
        );
    }
    return values;
}

/**
 * The descriptor set as a JSON document.
 *
 * A hundred parameters are easier to move between builds as one file than as a hundred
 * sheets, but a hand-written document can disagree with the encoder's contract. The page
 * therefore edits the file and validates it against the generated schema on every keystroke;
 * the table below only appears once the set is one the encoder editor can actually render.
 * Every problem carries the line and column it was found at, is shaded in the editor, and
 * moves the cursor there when selected.
 *
 * The same file is how a set travels between users, so **Export** writes the validated
 * document where the host asks, and **Import** takes one, asking before it replaces a draft.
 * An imported document that does not validate is still opened: its problems are located in
 * the editor, which is more use than a file the page refuses to show.
 */
export function EncoderJsonScreen() {
    const { encoderId } = useParams({ from: "/settings/encoders/$encoderId/json" });
    const encoders = useEncoders();
    const setParameters = useSetEncoderParameters();
    const updateFork = useUpdateEncoderFork();
    const saveText = useSaveTextFile();
    const leave = useLeaveGuard();
    const encoder = encoders.data?.find((entry) => entry.id === encoderId);
    const fileInput = useRef<HTMLInputElement | null>(null);

    const [text, setText] = useState<string | null>(null);
    const [baseline, setBaseline] = useState("");
    const [focus, setFocus] = useState<{ offset: number; nonce: number } | null>(null);
    const seeded = useRef<string | null>(null);

    useEffect(() => {
        if (encoder === undefined || seeded.current === encoder.id) {
            return;
        }
        seeded.current = encoder.id;
        const document = encoderDocumentText(encoder.parameters);
        setText(document);
        setBaseline(document);
    }, [encoder]);

    const parsed = useMemo(() => (text === null ? null : parseEncoderDocument(text)), [text]);
    // A changed descriptor set is a different set of controls, so the scratch values that
    // described the previous one start again from the new defaults.
    const signature = parsed?.status === "valid" ? JSON.stringify(parsed.parameters) : "";
    const [scratch, setScratch] = useState<{
        signature: string;
        values: Record<string, unknown>;
    }>({ signature: "", values: {} });
    const saved = useMemo(() => parseEncoderDocument(baseline), [baseline]);
    const issues = parsed?.status === "invalid" ? parsed.issues : NO_ISSUES;
    // A squiggle's tooltip leaves the issue list's context behind, so it carries the path.
    const markers = useMemo(
        () =>
            issues.map((issue) => ({
                offset: issue.offset,
                length: issue.length,
                message: `${issue.path} — ${issue.message}`,
            })),
        [issues],
    );
    const normalizedDraft = parsed?.status === "valid" ? JSON.stringify(parsed.parameters) : null;
    const normalizedSaved = saved.status === "valid" ? JSON.stringify(saved.parameters) : baseline;
    const dirty =
        text !== null &&
        (normalizedDraft === null ? text !== baseline : normalizedDraft !== normalizedSaved);
    const pending = setParameters.isPending || updateFork.isPending;
    const error = setParameters.error ?? updateFork.error;

    /** Write the validated set as a file, in the place the host lets the user choose. */
    async function exportDocument(): Promise<void> {
        if (encoder === undefined || parsed?.status !== "valid") {
            return;
        }
        const body = encoderDocumentText(parsed.parameters);
        const filename = exportFileName(encoder);
        if (saveText === null) {
            // A browser host owns its downloads; naming the file is all it can do.
            downloadText(body, filename, "application/json");
            toast.success(`Saved ${filename} to your downloads`);
            return;
        }
        try {
            const path = await saveText(filename, body, {
                title: "Export encoder parameters",
                extensions: ["json"],
            });
            if (path === null) {
                return;
            }
            toast.success("The parameters were exported", { description: path });
        } catch (cause) {
            toast.error(
                cause instanceof Error
                    ? `The parameters could not be written: ${cause.message}`
                    : "The parameters could not be written.",
            );
        }
    }

    /**
     * Open a file in place of the draft.
     *
     * The file is read and checked before it replaces anything, so a dirty draft is only
     * questioned once there is something real to replace it with. A document the contract
     * rejects is still opened — its problems are located under the editor, which is more
     * use than a file the page refuses to show.
     */
    async function importDocument(file: File): Promise<void> {
        let body: string;
        try {
            body = await file.text();
        } catch {
            toast.error(`${file.name} could not be read.`);
            return;
        }
        const opened = parseEncoderDocument(body);
        leave(() => {
            setText(body);
            if (opened.status === "valid") {
                toast.success(`Imported ${descriptorCount(opened.parameters)} from ${file.name}`);
                return;
            }
            toast.error(`${file.name} does not match the contract`, {
                description: `${String(opened.issues.length)} ${
                    opened.issues.length === 1 ? "problem is" : "problems are"
                } listed under the editor.`,
            });
        });
    }

    async function commit(): Promise<boolean> {
        if (encoder === undefined || parsed?.status !== "valid") {
            return false;
        }
        try {
            if (encoder.fork) {
                await updateFork.mutateAsync({
                    id: encoder.id.replace(/^fork:/u, ""),
                    update: { parameters: parsed.parameters },
                });
            } else {
                await setParameters.mutateAsync({
                    id: encoder.id,
                    update: { parameters: parsed.parameters },
                });
            }
            const document = encoderDocumentText(parsed.parameters);
            setText(document);
            setBaseline(document);
            toast.success(`${friendlyName(encoder)} parameters saved`);
            return true;
        } catch {
            return false;
        }
    }

    useUnsavedChanges({
        dirty,
        pending,
        label: "Encoder parameters",
        changes: dirty
            ? [
                  {
                      label: "JSON document",
                      from:
                          saved.status === "valid"
                              ? descriptorCount(saved.parameters)
                              : "the saved set",
                      to:
                          parsed?.status === "valid"
                              ? descriptorCount(parsed.parameters)
                              : "an invalid document",
                  },
              ]
            : [],
        save: commit,
    });

    if (!encoders.isError && (encoders.isPending || text === null)) {
        return (
            <main id="main" aria-busy="true" className="page py-6">
                <div className="h-[420px] animate-pulse rounded-lg border border-line bg-surface" />
            </main>
        );
    }

    if (encoders.isError) {
        return (
            <main id="main" className="page py-6">
                <div className="rounded-lg border border-danger/30 bg-surface p-5" role="alert">
                    <h1 className="m-0 text-lg font-semibold text-ink">
                        The encoder catalogue could not be loaded
                    </h1>
                    <p className="mt-2 mb-4 text-[12.5px] leading-relaxed text-ink-secondary">
                        {encoders.error instanceof Error
                            ? encoders.error.message
                            : "The local service did not respond."}
                    </p>
                    <Button variant="secondary" onClick={() => void encoders.refetch()}>
                        Try again
                    </Button>
                </div>
            </main>
        );
    }

    if (encoder === undefined) {
        return (
            <main id="main" className="page py-6">
                <div className="rounded-lg border border-line bg-surface p-5">
                    <h1 className="m-0 text-lg font-semibold text-ink">
                        This encoder is not in the catalogue
                    </h1>
                    <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-ink-secondary">
                        The build named in this link is no longer available. It may have been
                        removed since the link was made.
                    </p>
                </div>
            </main>
        );
    }

    if (text === null) {
        return null;
    }

    const valid = parsed?.status === "valid";
    const groups = valid ? groupParameters(Object.entries(parsed.parameters)) : [];
    const values =
        parsed?.status !== "valid"
            ? {}
            : scratch.signature === signature
              ? scratch.values
              : seedValues(parsed.parameters);
    const previewGroups: Array<[string, ParameterValueEntry[]]> = groups.map(
        ([group, parameters]) => [
            group,
            parameters.map(([canonical, descriptor]) => {
                const name = optionName(canonical);
                return {
                    name,
                    canonical,
                    descriptor,
                    parameter:
                        values[name] ??
                        buildOption(canonical, descriptor, startingValue(descriptor)),
                };
            }),
        ],
    );

    return (
        <main id="main" className="page py-6">
            <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <h1 className="m-0 text-lg font-semibold tracking-tight text-ink">
                        {friendlyName(encoder)} parameters
                    </h1>
                    <p className="mt-1 mb-0 max-w-[78ch] text-[12.5px] leading-relaxed text-ink-secondary">
                        The whole descriptor set as one JSON document. It is checked against the
                        contract on every edit; Save stays disabled until the document is one the
                        encoder editor can render.
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => fileInput.current?.click()}
                            title="Replace this document with a JSON file"
                        >
                            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                            Import
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={!valid}
                            onClick={() => void exportDocument()}
                            title={
                                valid
                                    ? "Save this document as a JSON file"
                                    : "Fix the document before exporting it"
                            }
                        >
                            <Download aria-hidden="true" className="h-3.5 w-3.5" />
                            Export
                        </Button>
                    </div>
                    <p className="m-0 font-mono text-[10.5px] text-ink-muted">
                        {encoder.base}
                        {encoder.fork ? " · saved build" : " · built-in"}
                    </p>
                </div>
            </header>

            {/* One input for the whole page: the button and the keyboard both reach it. */}
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                aria-label="Import a parameters file"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Clearing the value makes the same file selectable twice in a row.
                    event.target.value = "";
                    if (file !== undefined) {
                        void importDocument(file);
                    }
                }}
            />

            <section className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-2.5">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-ink-secondary uppercase">
                        parameters.json
                    </span>
                    <span
                        role="status"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            valid
                                ? "border-success/30 bg-success-soft text-success"
                                : "border-danger/30 bg-danger-soft text-danger"
                        }`}
                    >
                        {valid ? (
                            <CircleCheck aria-hidden="true" className="h-3 w-3" />
                        ) : (
                            <CircleAlert aria-hidden="true" className="h-3 w-3" />
                        )}
                        {valid ? "Schema valid" : "Schema invalid"}
                    </span>
                    <span className="text-[10.5px] text-ink-muted">
                        {valid
                            ? descriptorCount(parsed.parameters)
                            : `${String(issues.length)} schema ${
                                  issues.length === 1 ? "problem" : "problems"
                              }`}
                    </span>
                    <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-muted">
                        {String(text.split("\n").length)} lines
                    </span>
                </div>

                <div className="h-[420px] sm:h-[520px]">
                    <JsonEditor
                        value={text}
                        onChange={setText}
                        ariaLabel={`${friendlyName(encoder)} parameters JSON`}
                        path={`${encoder.id.replace(/[^A-Za-z0-9._-]+/gu, "-")}.json`}
                        height="100%"
                        markers={markers}
                        focus={focus}
                    />
                </div>

                {parsed?.status === "invalid" ? (
                    <div role="alert" className="border-t border-line px-4 py-3">
                        <p className="m-0 text-[11.5px] leading-relaxed text-danger">
                            {parsed.summary}
                        </p>
                        {issues.length === 0 ? null : (
                            <ul className="mt-2 mb-0 grid list-none gap-0.5 p-0">
                                {issues.slice(0, MAX_LISTED_ISSUES).map((issue, index) => (
                                    <li key={`${issue.path}-${String(index)}`}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFocus((current) => ({
                                                    offset: issue.offset,
                                                    nonce: (current?.nonce ?? 0) + 1,
                                                }))
                                            }
                                            className="flex w-full items-baseline gap-2 rounded-sm px-1.5 py-0.5 text-left hover:bg-hover"
                                        >
                                            <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-muted">
                                                line {issue.line}, col {issue.column}
                                            </span>
                                            <span className="min-w-0 font-mono text-[10.5px] leading-relaxed break-words text-ink-secondary">
                                                <span className="text-ink">{issue.path}</span>
                                                {" — "}
                                                {issue.message}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {issues.length > MAX_LISTED_ISSUES ? (
                            <p className="mt-1.5 mb-0 text-[10.5px] text-ink-muted">
                                {String(issues.length - MAX_LISTED_ISSUES)} more are not listed; fix
                                the first ones and the rest will re-check.
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </section>

            {error === null ? null : (
                <p role="alert" className="mt-3 mb-0 text-[11.5px] leading-relaxed text-danger">
                    {error instanceof Error
                        ? `The parameters could not be saved: ${error.message}`
                        : "The parameters could not be saved."}
                </p>
            )}

            <section
                aria-labelledby="parameter-preview-heading"
                className="mt-5 overflow-hidden rounded-lg border border-line bg-surface"
            >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3">
                    <h2
                        id="parameter-preview-heading"
                        className="m-0 text-sm font-semibold text-ink"
                    >
                        Parameters
                    </h2>
                    <p className="m-0 text-[10.5px] text-ink-muted">
                        {valid
                            ? "The controls Configuration → Encoding renders from these descriptors. Values typed here are not saved."
                            : "The preview appears when the document validates."}
                    </p>
                </div>

                {!valid ? (
                    <p className="m-0 px-4 py-6 text-[12px] text-ink-secondary">
                        Correct the document above to preview its parameters.
                    </p>
                ) : groups.length === 0 ? (
                    <p className="m-0 px-4 py-6 text-[12px] leading-relaxed text-ink-secondary">
                        This document describes no parameters, so the encoder editor will show an
                        empty table.
                    </p>
                ) : (
                    <div className="px-4 py-4 sm:px-5">
                        <ParameterValueGrid
                            groups={previewGroups}
                            locked={false}
                            // A descriptor with no documented default has nothing to differ
                            // from, so most rows would otherwise be marked on arrival.
                            isChanged={(entry) =>
                                entry.descriptor !== undefined &&
                                hasDefault(entry.descriptor) &&
                                !isDefaultOption(entry.descriptor, entry.parameter)
                            }
                            onChange={(entry, next) =>
                                setScratch({
                                    signature,
                                    values: {
                                        ...values,
                                        [entry.name]: withOptionValue(entry.parameter, next),
                                    },
                                })
                            }
                        />
                    </div>
                )}
            </section>

            <DraftActions
                dirty={dirty}
                pending={pending}
                canSave={valid}
                onSave={() => void commit()}
                onDiscard={() => {
                    setText(baseline);
                }}
            />
        </main>
    );
}
