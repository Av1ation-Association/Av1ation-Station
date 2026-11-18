import { useEffect, useState } from "react";

import {
    useAddCustomTool,
    usePickExecutable,
    useRemoveCustomTool,
    useUpdateEncoderFork,
} from "@av1ation/api";
import type { EncoderDescriptor } from "@av1ation/contracts";
import { FolderOpen, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { RemoveButton } from "../../shared/RemoveButton";
import { friendlyName, isShipped } from "./encoder-names";
import { FIELD } from "./encoder-fields";

/** The provider a row actually runs, and the two ways to change it. */
export function ExecutableCard({
    encoder,
    onRemove,
}: {
    encoder: EncoderDescriptor;
    /** Opens the panel's confirmation; a saved build is not deleted from a stray click. */
    onRemove: () => void;
}) {
    const add = useAddCustomTool();
    const remove = useRemoveCustomTool();
    const updateFork = useUpdateEncoderFork();
    const pick = usePickExecutable();
    // A built-in starts empty: the provider line already says what is in use, and carrying
    // the previous encoder's path here made two different rows look the same.
    const [path, setPath] = useState("");
    const [renaming, setRenaming] = useState(false);
    const [label, setLabel] = useState(encoder.label);
    const shipped = isShipped(encoder);
    const custom = !encoder.fork && encoder.executable !== undefined;

    useEffect(() => {
        setLabel(encoder.label);
    }, [encoder.label]);

    const commitRename = () => {
        const next = label.trim();
        if (next === "" || next === encoder.label) {
            setRenaming(false);
            setLabel(encoder.label);
            return;
        }
        updateFork.mutate(
            { id: encoder.id.replace(/^fork:/u, ""), update: { label: next } },
            {
                onSuccess: () => {
                    setRenaming(false);
                    toast.success("Build renamed");
                },
            },
        );
    };

    const submit = (candidate: string = path) => {
        const trimmed = candidate.trim();
        if (trimmed === "") {
            return;
        }
        if (encoder.fork) {
            updateFork.mutate(
                { id: encoder.id.replace(/^fork:/u, ""), update: { path: trimmed } },
                { onSuccess: () => toast.success("Fork executable replaced") },
            );
            return;
        }
        add.mutate(
            { kind: encoder.base, path: trimmed },
            {
                // A rejected executable is not a build: the service keeps the previous
                // provider and reports why, so the toast must not claim a switch happened.
                onSuccess: (result) =>
                    result.available
                        ? toast.success(`${encoder.label} now uses this build`)
                        : toast.error(`${result.label} was rejected: ${result.detail}`),
            },
        );
    };

    const locate = () => {
        if (pick === null) {
            return;
        }
        void pick(encoder.executable ?? undefined)
            .then((picked) => {
                if (picked === null) {
                    return;
                }
                // Locating is the action: the picked build is probed and adopted, so it is
                // never left sitting in a text field waiting for a second click. The field
                // stays empty because the adopted path becomes the placeholder.
                submit(picked);
            })
            .catch((error: unknown) =>
                toast.error(
                    error instanceof Error
                        ? `The file picker could not open: ${error.message}`
                        : "The file picker could not open.",
                ),
            );
    };

    const pending = add.isPending || updateFork.isPending;
    const error = add.error ?? updateFork.error ?? remove.error;
    // The provider in use is the field's placeholder; the field itself only points at a
    // different build. The Version line reuses the same status when nothing was probed.
    const pathStatus = encoder.available ? "Resolved on PATH" : "Not found on PATH";
    const providerPlaceholder = encoder.executable || pathStatus;

    return (
        <section className="min-w-0 rounded-lg border border-line bg-surface p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {renaming ? (
                            <input
                                autoFocus
                                aria-label="Build name"
                                value={label}
                                maxLength={120}
                                disabled={updateFork.isPending}
                                onChange={(event) => setLabel(event.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        commitRename();
                                    }
                                    if (event.key === "Escape") {
                                        event.preventDefault();
                                        setLabel(encoder.label);
                                        setRenaming(false);
                                    }
                                }}
                                className="h-7 min-w-0 flex-1 rounded-sm border border-line-strong bg-app px-2 text-sm font-semibold text-ink"
                            />
                        ) : (
                            <>
                                <h2 className="m-0 truncate text-sm font-semibold text-ink">
                                    {friendlyName(encoder)}
                                </h2>
                                {encoder.fork && !shipped ? (
                                    <button
                                        type="button"
                                        aria-label={`Rename ${encoder.label}`}
                                        data-tip="Rename this build"
                                        onClick={() => setRenaming(true)}
                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
                                    >
                                        <Pencil aria-hidden="true" className="h-3 w-3" />
                                    </button>
                                ) : null}
                            </>
                        )}
                    </div>
                    <p className="mt-0.5 mb-0 font-mono text-[10.5px] text-ink-muted">
                        {encoder.base}
                        {shipped
                            ? " · shipped build"
                            : encoder.fork
                              ? " · saved build"
                              : " · built-in"}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {pick === null ? null : (
                        <Button
                            variant="secondary"
                            className="h-7 px-2 text-[11.5px]"
                            disabled={pending}
                            onClick={locate}
                            data-tip="Locate the encoder executable"
                        >
                            <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
                            Locate…
                        </Button>
                    )}
                    {shipped ? (
                        <>
                            {encoder.executable ? (
                                <Button
                                    variant="secondary"
                                    className="h-7 px-2 text-[11.5px]"
                                    disabled={pending}
                                    data-tip="Forget the saved executable and use the build on PATH"
                                    onClick={() =>
                                        updateFork.mutate(
                                            {
                                                id: encoder.id.replace(/^fork:/u, ""),
                                                update: { clear_executable: true },
                                            },
                                            {
                                                onSuccess: () =>
                                                    toast.success(
                                                        `${encoder.label} now resolves on PATH again`,
                                                    ),
                                            },
                                        )
                                    }
                                >
                                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                                    Clear executable
                                </Button>
                            ) : null}
                        </>
                    ) : encoder.fork ? (
                        <RemoveButton target={`${encoder.label} build`} onClick={onRemove} />
                    ) : null}
                </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                    <label
                        htmlFor={`encoder-executable-${encoder.id}`}
                        className="m-0 font-mono text-[10px] tracking-[0.16em] text-ink-secondary uppercase"
                    >
                        Executable
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            id={`encoder-executable-${encoder.id}`}
                            aria-label={`${encoder.label} executable`}
                            value={path}
                            onChange={(event) => setPath(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    submit();
                                }
                            }}
                            placeholder={providerPlaceholder}
                            spellCheck={false}
                            className={`${FIELD} min-w-0 font-mono text-[11px]`}
                        />
                        {custom ? (
                            <button
                                type="button"
                                aria-label="Use the build on PATH"
                                data-tip="Use the build on PATH"
                                data-tip-align="end"
                                disabled={pending}
                                onClick={() =>
                                    remove.mutate(`custom:${encoder.base}`, {
                                        onSuccess: () =>
                                            toast.success("The build on PATH is in use again"),
                                    })
                                }
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                            >
                                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="m-0 font-mono text-[10px] tracking-[0.16em] text-ink-secondary uppercase">
                        Version
                    </p>
                    <p className="mt-2 mb-0 text-[11.5px] leading-relaxed break-all text-ink-secondary">
                        {encoder.version ?? pathStatus}
                    </p>
                </div>
            </div>
            {encoder.warning ? (
                <p
                    role="status"
                    className="mt-3 mb-0 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-2 text-[11.5px] leading-relaxed text-warning"
                >
                    {encoder.warning}
                </p>
            ) : null}
            {error === null ? null : (
                <p role="alert" className="mt-3 mb-0 text-[11.5px] leading-relaxed text-danger">
                    {error instanceof Error
                        ? `The executable was not changed: ${error.message}`
                        : "The executable was not changed. Try again."}
                </p>
            )}
        </section>
    );
}
