import { useEffect, useRef, useState } from "react";

import { useDeleteEncoderFork, useEncoders } from "@av1ation/api";
import type { EncoderDescriptor } from "@av1ation/contracts";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { useLeaveGuard } from "../../shared/UnsavedChanges";
import { AddForkSheet } from "./AddForkSheet";
import { EncoderParameters } from "./EncoderParameters";
import { ExecutableCard } from "./ExecutableCard";
import { friendlyName } from "./encoder-names";

/** The codec family an encoder id belongs to, used as the catalogue's group heading. */
function encoderGroup(id: string): string {
    if (id === "x264") {
        return "H.264";
    }
    if (id === "x265") {
        return "H.265";
    }
    if (id === "vpx") {
        return "VP9";
    }
    if (id === "vvenc") {
        return "VVC";
    }
    if (id === "ffmpeg") {
        return "FFmpeg";
    }
    return "AV1";
}

/**
 * The engine catalogue and the builds beside it.
 *
 * A built-in owns editable descriptors and one provider; a fork owns its own executable and
 * parameters. Both commit from the top bar, and leaving a dirty draft asks first.
 */
export function EncodersPanel() {
    const encoders = useEncoders();
    const deleteFork = useDeleteEncoderFork();
    const leave = useLeaveGuard();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<EncoderDescriptor | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const list = encoders.data ?? [];
    const builtIn = list.filter((encoder) => !encoder.fork);
    const forks = list.filter((encoder) => encoder.fork);
    const selected = list.find((encoder) => encoder.id === selectedId) ?? builtIn[0] ?? forks[0];

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog === null) {
            return;
        }
        if (removing !== null && !dialog.open) {
            dialog.showModal();
        }
        if (removing === null && dialog.open) {
            dialog.close();
        }
    }, [removing]);

    const confirmRemove = () => {
        if (removing === null) {
            return;
        }
        const removed = removing;
        deleteFork.mutate(removed.id.replace(/^fork:/u, ""), {
            onSuccess: () => {
                setRemoving(null);
                setSelectedId(null);
                toast.success(`Removed ${removed.label}`);
            },
        });
    };

    const select = (id: string) => {
        if (selected?.id === id) {
            return;
        }
        leave(() => setSelectedId(id));
    };

    if (encoders.isPending) {
        return (
            <div className="mt-8 space-y-2" aria-busy="true">
                {[0, 1, 2, 3, 4].map((row) => (
                    <div
                        key={row}
                        className="h-14 animate-pulse rounded-lg border border-line bg-surface"
                    />
                ))}
            </div>
        );
    }

    if (encoders.isError) {
        return (
            <LoadErrorPanel
                className="mt-6"
                title="The encoder catalogue could not be loaded"
                message={
                    encoders.error instanceof Error
                        ? encoders.error.message
                        : "The local service did not respond."
                }
                onRetry={() => void encoders.refetch()}
            />
        );
    }

    return (
        <section className="mt-6" aria-labelledby="encoders-heading">
            <h2 id="encoders-heading" className="sr-only">
                Encoders
            </h2>

            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 3xl:grid-cols-[320px_minmax(0,1fr)]">
                {/* The column caps itself against the space between the shell and the bottom
                    of the window, so its own list scrolls rather than the bottom being cut
                    off before it sticks. 9rem is the top bar plus this tab's header and tab
                    strip, which is what the catalogue would sit below on the first screen. */}
                <div className="min-w-0 self-start rounded-lg border border-line bg-surface lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-9rem)] lg:flex-col">
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                        <p className="m-0 pl-1 font-mono text-[9.5px] tracking-[0.16em] text-ink-muted uppercase">
                            Catalogue · {list.length}
                        </p>
                        <Button
                            variant="secondary"
                            className="h-7 shrink-0 px-2 text-[11.5px]"
                            onClick={() => setAdding(true)}
                        >
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            Add build
                        </Button>
                    </div>
                    {/* A pip's tooltip is centred on it, so its bubble would otherwise hang
                        past the column's right edge and become a horizontal scrollbar. The
                        bottom padding gives the last row's bubble room to paint. */}
                    <div className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-1.5 pt-1.5 pb-7">
                        {[...new Set(builtIn.map((encoder) => encoderGroup(encoder.id)))].map(
                            (group) => (
                                <div key={group}>
                                    <p className="m-0 px-2.5 pt-2 pb-1 font-mono text-[9.5px] tracking-[0.14em] text-ink-muted uppercase">
                                        {group}
                                    </p>
                                    <ul className="m-0 list-none">
                                        {builtIn
                                            .filter((encoder) => encoderGroup(encoder.id) === group)
                                            .map((encoder) => (
                                                <li key={encoder.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => select(encoder.id)}
                                                        aria-current={
                                                            encoder.id === selected?.id
                                                                ? "true"
                                                                : undefined
                                                        }
                                                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${
                                                            encoder.id === selected?.id
                                                                ? "bg-raised text-ink"
                                                                : "text-ink-secondary hover:bg-hover hover:text-ink"
                                                        }`}
                                                    >
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[11.5px] font-medium">
                                                                {friendlyName(encoder)}
                                                            </span>
                                                            <span className="block truncate font-mono text-[9.5px] text-ink-muted">
                                                                {encoder.id}
                                                                {encoder.overridden
                                                                    ? " · edited"
                                                                    : ""}
                                                            </span>
                                                        </span>
                                                        <span
                                                            aria-hidden="true"
                                                            data-tip={
                                                                encoder.available
                                                                    ? "Available on this machine"
                                                                    : "No executable found"
                                                            }
                                                            data-tip-align="end"
                                                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                                                encoder.available
                                                                    ? "bg-success"
                                                                    : "bg-ink-muted"
                                                            }`}
                                                        />
                                                    </button>
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            ),
                        )}
                        <p className="m-0 px-2.5 pt-3 pb-1 font-mono text-[9px] tracking-[0.14em] text-ink-muted uppercase">
                            Your builds
                        </p>
                        {forks.length === 0 ? (
                            <p className="m-0 px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-muted">
                                No saved builds yet. Add one to try a fork without replacing the
                                encoder on PATH.
                            </p>
                        ) : (
                            <ul className="m-0 list-none">
                                {forks.map((encoder) => (
                                    <li key={encoder.id}>
                                        <button
                                            type="button"
                                            onClick={() => select(encoder.id)}
                                            aria-current={
                                                encoder.id === selected?.id ? "true" : undefined
                                            }
                                            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left ${
                                                encoder.id === selected?.id
                                                    ? "bg-raised text-ink"
                                                    : "text-ink-secondary hover:bg-hover hover:text-ink"
                                            }`}
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[12px] font-medium">
                                                    {encoder.label}
                                                </span>
                                                <span className="block truncate font-mono text-[10px] text-ink-muted">
                                                    {encoder.base} ·{" "}
                                                    {Object.keys(encoder.parameters).length} params
                                                </span>
                                            </span>
                                            <span
                                                aria-hidden="true"
                                                data-tip={
                                                    encoder.available
                                                        ? "Available on this machine"
                                                        : "No executable found"
                                                }
                                                data-tip-align="end"
                                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                                    encoder.available ? "bg-brand" : "bg-ink-muted"
                                                }`}
                                            />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {selected === undefined ? (
                    <div className="rounded-lg border border-line bg-surface p-6 text-[12px] text-ink-secondary">
                        No encoder is available in this build.
                    </div>
                ) : (
                    <div className="min-w-0 space-y-4">
                        {/* Distinct keys: two siblings sharing `selected.id` made React
                            append the new encoder instead of replacing the old one. */}
                        <ExecutableCard
                            key={`executable-${selected.id}`}
                            encoder={selected}
                            onRemove={() => setRemoving(selected)}
                        />
                        <EncoderParameters key={`parameters-${selected.id}`} encoder={selected} />
                    </div>
                )}
            </div>

            <AddForkSheet
                key={adding ? "open" : "closed"}
                open={adding}
                families={builtIn}
                onClose={() => setAdding(false)}
                onSaved={(id) => {
                    setSelectedId(`fork:${id}`);
                    setAdding(false);
                }}
            />

            <dialog
                ref={dialogRef}
                aria-labelledby="remove-build-title"
                aria-describedby="remove-build-detail"
                onClose={() => setRemoving(null)}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !deleteFork.isPending) {
                        setRemoving(null);
                    }
                }}
                className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                {removing === null ? null : (
                    <div>
                        <div className="border-b border-line px-5 py-4">
                            <h2 id="remove-build-title" className="m-0 text-base font-semibold">
                                Remove “{removing.label}”?
                            </h2>
                        </div>
                        <div className="px-5 py-4">
                            <p
                                id="remove-build-detail"
                                className="m-0 text-[13px] leading-relaxed text-ink-secondary"
                            >
                                This deletes the saved build, its executable path, and its parameter
                                edits. The built-in {removing.base} encoder and the provider it
                                resolves stay where they are.
                            </p>
                            {deleteFork.isError ? (
                                <p
                                    role="alert"
                                    className="mt-3 mb-0 text-[12px] leading-relaxed text-danger"
                                >
                                    {deleteFork.error instanceof Error
                                        ? deleteFork.error.message
                                        : "The build could not be removed. Try again."}
                                </p>
                            ) : null}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                            <Button
                                variant="secondary"
                                onClick={() => setRemoving(null)}
                                disabled={deleteFork.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="danger"
                                onClick={confirmRemove}
                                disabled={deleteFork.isPending}
                            >
                                {deleteFork.isPending ? "Removing…" : "Remove build"}
                            </Button>
                        </div>
                    </div>
                )}
            </dialog>
        </section>
    );
}
