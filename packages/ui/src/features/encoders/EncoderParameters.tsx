import { useEffect, useMemo, useState } from "react";

import {
    useResetEncoderParameters,
    useSetEncoderParameters,
    useUpdateEncoderFork,
} from "@av1ation/api";
import type { EncoderDescriptor, ParameterDescriptor } from "@av1ation/contracts";
import { Link } from "@tanstack/react-router";
import { Braces, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonClass } from "../../shared/Button";
import { RemoveButton } from "../../shared/RemoveButton";
import { DraftActions } from "../../shared/TopBarActions";
import { useDraftHistory } from "../../shared/useDraftHistory";
import { useUnsavedChanges } from "../../shared/UnsavedChanges";
import { InfoPopover } from "./InfoPopover";
import { isShipped } from "./encoder-names";
import { ParameterSheet } from "./ParameterSheet";
import {
    defaultLabel,
    formatDefault,
    groupParameters,
    hasDefault,
    kindOf,
} from "./parameter-summary";
import { widgetOf } from "./parameter-drafts";

/** Stable empty draft, so a memo never sees a fresh object while the encoder loads. */
const NO_PARAMETERS: Record<string, ParameterDescriptor> = {};

/**
 * One encoder's descriptor table and its draft.
 *
 * The draft is committed from the top bar, the same place every other screen commits one.
 * A built-in's edits are stored beside the engine definition; a fork's are its own map.
 */
export function EncoderParameters({ encoder }: { encoder: EncoderDescriptor }) {
    const setParameters = useSetEncoderParameters();
    const resetParameters = useResetEncoderParameters();
    const updateFork = useUpdateEncoderFork();
    const history = useDraftHistory<Record<string, ParameterDescriptor>>(encoder.parameters);
    const draft = history.value ?? NO_PARAMETERS;
    const setDraft = history.setValue;
    const resetHistory = history.reset;
    const [baseline, setBaseline] = useState(JSON.stringify(encoder.parameters));
    const [sheet, setSheet] = useState<{ mode: "add" } | { mode: "edit"; key: string } | null>(
        null,
    );
    const [search, setSearch] = useState("");

    useEffect(() => {
        resetHistory(encoder.parameters);
        setBaseline(JSON.stringify(encoder.parameters));
        setSheet(null);
    }, [encoder.id, encoder.parameters, resetHistory]);

    const dirty = JSON.stringify(draft) !== baseline;
    const pending = setParameters.isPending || updateFork.isPending || resetParameters.isPending;

    const changes = useMemo(() => {
        let saved: Record<string, ParameterDescriptor>;
        try {
            saved = JSON.parse(baseline) as Record<string, ParameterDescriptor>;
        } catch {
            return [];
        }
        const describe = (descriptor: ParameterDescriptor | undefined) =>
            descriptor === undefined
                ? "Not set"
                : `${kindOf(descriptor)} · ${formatDefault(descriptor)}`;
        return [...new Set([...Object.keys(saved), ...Object.keys(draft)])]
            .filter(
                (parameterKey) =>
                    JSON.stringify(saved[parameterKey]) !== JSON.stringify(draft[parameterKey]),
            )
            .map((parameterKey) => ({
                label: parameterKey,
                from: describe(saved[parameterKey]),
                to: describe(draft[parameterKey]),
            }));
    }, [draft, baseline]);

    useUnsavedChanges({
        dirty,
        pending,
        label: `${encoder.label} parameters`,
        changes,
        save: commit,
    });

    async function commit(): Promise<boolean> {
        try {
            if (encoder.fork) {
                const fork = await updateFork.mutateAsync({
                    id: encoder.id.replace(/^fork:/u, ""),
                    update: { parameters: draft },
                });
                history.reset(draft);
                setBaseline(JSON.stringify(draft));
                toast.success(`${fork.label} parameters saved`);
                return true;
            }
            await setParameters.mutateAsync({ id: encoder.id, update: { parameters: draft } });
            history.reset(draft);
            setBaseline(JSON.stringify(draft));
            toast.success(`${encoder.label} parameters saved`);
            return true;
        } catch {
            return false;
        }
    }

    const entries = Object.entries(draft);
    const query = search.trim().toLowerCase();
    // The label is what the user reads, the key is what the encoder reads, and the
    // description is where a half-remembered word usually lives. Searching all three is
    // what lets `--crf`, `crf`, and `constant rate factor` find the same row.
    const visible =
        query === ""
            ? entries
            : entries.filter(([key, descriptor]) =>
                  [key, descriptor.label, descriptor.description ?? ""].some((value) =>
                      value.toLowerCase().includes(query),
                  ),
              );
    const error = setParameters.error ?? updateFork.error;
    const groups = groupParameters(visible);

    return (
        <section className="min-w-0 rounded-lg border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
                <div className="min-w-0">
                    <h2 className="m-0 flex items-center gap-1.5 text-base font-semibold text-ink">
                        Parameters
                        {dirty ? (
                            <span
                                data-tip="Changes unsaved"
                                className="inline-block h-1.5 w-1.5 rounded-full bg-warning"
                            />
                        ) : null}
                    </h2>
                    <p className="m-0 font-mono text-[10px] text-ink-muted">
                        {query === ""
                            ? `${String(entries.length)} ${entries.length === 1 ? "descriptor" : "descriptors"}`
                            : `${String(visible.length)} of ${String(entries.length)}`}
                    </p>
                </div>
                {encoder.overridden ? (
                    <span className="rounded-full border border-brand/40 bg-brand-soft px-2 py-0.5 text-[9px] font-medium text-brand-text">
                        Edited
                    </span>
                ) : null}
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <label className="relative">
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                        />
                        <input
                            type="search"
                            aria-label="Search parameters"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search parameters"
                            className="h-7 w-44 rounded-md border border-line-strong bg-app pr-2 pl-7 text-[11.5px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none 3xl:w-60"
                        />
                    </label>
                    {encoder.overridden && !encoder.fork ? (
                        <Button
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            disabled={pending}
                            onClick={() =>
                                resetParameters.mutate(encoder.id, {
                                    onSuccess: () =>
                                        toast.success(`${encoder.label} descriptors restored`),
                                })
                            }
                        >
                            Restore engine descriptors
                        </Button>
                    ) : null}
                    {isShipped(encoder) && encoder.overridden ? (
                        <Button
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            disabled={pending}
                            onClick={() =>
                                updateFork.mutate(
                                    {
                                        id: encoder.id.replace(/^fork:/u, ""),
                                        update: { reset_parameters: true },
                                    },
                                    {
                                        onSuccess: () =>
                                            toast.success(`${encoder.label} parameters restored`),
                                    },
                                )
                            }
                        >
                            Reset parameters
                        </Button>
                    ) : null}
                    {/* Both header actions are the same compact treatment as every other
                        card header, so the search field and the two actions share one
                        baseline instead of the primary one towering over the others. */}
                    <Button
                        variant="secondary"
                        className="h-7 px-2 text-[11.5px]"
                        onClick={() => setSheet({ mode: "add" })}
                    >
                        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        Add parameter
                    </Button>
                    <Link
                        to="/settings/encoders/$encoderId/json"
                        params={{ encoderId: encoder.id }}
                        data-tip="Edit these descriptors as JSON"
                        className={buttonClass("secondary", "h-7 px-2 text-[11.5px]")}
                    >
                        <Braces aria-hidden="true" className="h-3.5 w-3.5" />
                        Open JSON
                    </Link>
                </div>
            </div>

            <div className="px-4 py-2 sm:px-5">
                {entries.length === 0 ? (
                    <div className="px-2 py-6 text-center">
                        <p className="m-0 text-[12.5px] text-ink-secondary">
                            This encoder has no descriptors yet.
                        </p>
                        <p className="mx-auto mt-1 mb-0 max-w-[46ch] text-[11px] leading-relaxed text-ink-muted">
                            Add the flags this build accepts. They become available in the encoder
                            editor.
                        </p>
                    </div>
                ) : visible.length === 0 ? (
                    <p className="m-0 px-2 py-6 text-center text-[11.5px] text-ink-secondary">
                        No parameter matches “{search}”.
                    </p>
                ) : (
                    groups.map(([group, parameters]) => (
                        <section key={group}>
                            <h3 className="m-0 px-2 pt-3 pb-1.5 font-mono text-[9px] tracking-[0.14em] text-ink-muted uppercase">
                                {group}
                                <span className="ml-1.5 tabular-nums">{parameters.length}</span>
                            </h3>
                            <div className="grid gap-x-8 lg:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4">
                                {parameters.map(([parameterKey, descriptor]) => (
                                    <div
                                        key={parameterKey}
                                        className="relative flex items-start gap-x-3 border-b border-line-subtle py-2.5"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        // A click that finished a text
                                                        // selection is selecting text, not
                                                        // opening the editor.
                                                        if (!window.getSelection()?.isCollapsed) {
                                                            return;
                                                        }
                                                        setSheet({
                                                            mode: "edit",
                                                            key: parameterKey,
                                                        });
                                                    }}
                                                    className="group/edit inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 rounded-sm text-left after:absolute after:inset-0 after:content-['']"
                                                >
                                                    <span className="text-[12px] font-medium text-ink group-hover/edit:text-brand-hover">
                                                        {descriptor.label}
                                                    </span>
                                                    <span className="font-mono text-[10.5px] text-ink-muted group-hover/edit:text-ink-secondary">
                                                        ({parameterKey})
                                                    </span>
                                                    <span className="sr-only"> Edit</span>
                                                </button>
                                                <InfoPopover
                                                    label={descriptor.label}
                                                    description={descriptor.description}
                                                    href={descriptor.doc_link}
                                                />
                                            </div>
                                            <p className="m-0 mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10.5px] leading-relaxed text-ink-muted">
                                                <span>{kindOf(descriptor)}</span>
                                                <span aria-hidden="true">·</span>
                                                <span>{widgetOf(descriptor)}</span>
                                                {hasDefault(descriptor) ? (
                                                    <>
                                                        <span aria-hidden="true">·</span>
                                                        <span>
                                                            Default{" "}
                                                            <span className="font-mono text-ink-secondary">
                                                                {defaultLabel(descriptor)}
                                                            </span>
                                                        </span>
                                                    </>
                                                ) : null}
                                            </p>
                                        </div>
                                        <span className="relative z-10">
                                            <RemoveButton
                                                target={parameterKey}
                                                onClick={() =>
                                                    setDraft((previous) => {
                                                        const next = { ...previous };
                                                        delete next[parameterKey];
                                                        return next;
                                                    })
                                                }
                                            />
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>

            <ParameterSheet
                open={sheet !== null}
                encoderLabel={encoder.label}
                initial={(() => {
                    if (sheet === null || sheet.mode === "add") {
                        return null;
                    }
                    const descriptor: ParameterDescriptor | undefined = draft[sheet.key];
                    return descriptor === undefined ? null : { key: sheet.key, descriptor };
                })()}
                taken={new Set(Object.keys(draft))}
                onClose={() => setSheet(null)}
                onApply={(parameterKey, descriptor) => {
                    setDraft((previous) => ({ ...previous, [parameterKey]: descriptor }));
                    setSheet(null);
                }}
            />

            {error === null ? null : (
                <p
                    role="alert"
                    className="mx-4 mb-4 mt-0 text-[11.5px] leading-relaxed text-danger sm:mx-5"
                >
                    {error instanceof Error
                        ? `The parameters could not be saved: ${error.message}`
                        : "The parameters could not be saved."}
                </p>
            )}

            <DraftActions
                dirty={dirty}
                pending={pending}
                onSave={commit}
                onDiscard={() => {
                    history.reset(encoder.parameters);
                    setBaseline(JSON.stringify(encoder.parameters));
                }}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.undo}
                onRedo={history.redo}
            />
        </section>
    );
}
