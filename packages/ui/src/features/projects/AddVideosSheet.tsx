import { useEffect, useState } from "react";

import { useAddVideo, usePickSaveFile, usePickVideoFile } from "@av1ation/api";
import type { GeneralDefaults } from "@av1ation/contracts";
import { FolderOpen, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

import { deriveOutputPath } from "../../shared/format";
import { randomId } from "../../shared/random-id";
import { Button } from "../../shared/Button";
import { Sheet } from "../../shared/Sheet";

const FIELD =
    "h-9 w-full min-w-0 rounded-md border border-line-strong bg-app px-2.5 text-[12px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none";

interface Draft {
    /** Stable identity for a row that can be removed while another is edited. */
    key: string;
    input: string;
    output: string;
    label: string;
}

function blank(input = ""): Draft {
    return { key: randomId(), input, output: "", label: "" };
}

function fileName(path: string): string {
    const parts = path.split(/[\\/]/u);
    return parts[parts.length - 1] ?? path;
}

/**
 * The one place several videos enter a queue.
 *
 * A native picker returns every selected path at once, then this sheet gives each one its
 * own input, output, and label before anything is written. The single-video dialog made a
 * ten-video batch ten round trips through the same form.
 */
export function AddVideosSheet({
    projectId,
    general,
    open,
    initialPaths,
    onClose,
    onAdded,
}: {
    projectId: string;
    general: GeneralDefaults | undefined;
    open: boolean;
    /** Paths returned by the multi-file picker; empty opens one blank row. */
    initialPaths: readonly string[];
    onClose: () => void;
    onAdded: (count: number) => void;
}) {
    const add = useAddVideo(projectId);
    const pickVideo = usePickVideoFile();
    const pickSave = usePickSaveFile();
    const [rows, setRows] = useState<Draft[]>([blank()]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        setRows(initialPaths.length === 0 ? [blank()] : initialPaths.map((path) => blank(path)));
        setError(null);
        setSaving(false);
    }, [open, initialPaths]);

    const update = (key: string, change: Partial<Draft>) => {
        setRows((previous) =>
            previous.map((row) => (row.key === key ? { ...row, ...change } : row)),
        );
        setError(null);
    };

    const remove = (key: string) => {
        setRows((previous) => {
            const next = previous.filter((row) => row.key !== key);
            return next.length === 0 ? [blank()] : next;
        });
    };

    const ready = rows.filter((row) => row.input.trim() !== "");
    const canSubmit = ready.length > 0 && !saving && !add.isPending;

    const submit = async () => {
        if (!canSubmit) {
            return;
        }
        setSaving(true);
        setError(null);
        let added = 0;
        const failures: string[] = [];
        for (const row of ready) {
            try {
                await add.mutateAsync({
                    input_path: row.input.trim(),
                    ...(row.output.trim() === "" ? {} : { output_path: row.output.trim() }),
                    ...(row.label.trim() === "" ? {} : { name: row.label.trim() }),
                });
                added += 1;
            } catch (failure) {
                failures.push(
                    `${fileName(row.input)}: ${
                        failure instanceof Error ? failure.message : "the service refused it"
                    }`,
                );
            }
        }
        setSaving(false);
        if (added > 0) {
            onAdded(added);
            toast.success(`${String(added)} ${added === 1 ? "video" : "videos"} added`);
        }
        if (failures.length > 0) {
            // A partial batch is not a reason to hide the rows that failed; the sheet stays
            // open with the names and the service's reasons.
            setError(failures.join("\n"));
            return;
        }
        onClose();
    };

    return (
        <Sheet
            open={open}
            eyebrow="QUEUE"
            title="Add videos"
            description="Each file keeps its own output and label. Source files are never copied."
            onClose={onClose}
            width="wide"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={!canSubmit}>
                        {saving
                            ? "Adding…"
                            : `Add ${String(ready.length)} ${ready.length === 1 ? "video" : "videos"}`}
                    </Button>
                </>
            }
        >
            <div className="grid gap-3">
                {rows.map((row, index) => {
                    const derived =
                        general === undefined || row.input.trim() === ""
                            ? ""
                            : deriveOutputPath(general, row.input.trim());
                    return (
                        <section
                            key={row.key}
                            aria-label={`Video ${String(index + 1)}`}
                            className="rounded-lg border border-line bg-sunken p-3"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <p className="m-0 min-w-0 truncate text-[11.5px] font-medium text-ink">
                                    {row.input.trim() === ""
                                        ? `Video ${String(index + 1)}`
                                        : fileName(row.input)}
                                </p>
                                <button
                                    type="button"
                                    aria-label={`Remove ${fileName(row.input) || "this video"}`}
                                    data-tip="Remove from this batch"
                                    onClick={() => remove(row.key)}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
                                >
                                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            <div className="mt-2 grid gap-2">
                                <label className="grid gap-1 text-[10.5px] text-ink-secondary">
                                    Input file
                                    <span className="flex gap-2">
                                        <input
                                            value={row.input}
                                            onChange={(event) =>
                                                update(row.key, { input: event.target.value })
                                            }
                                            placeholder="D:\Media\source.mkv"
                                            spellCheck={false}
                                            className={`${FIELD} font-mono text-[11px]`}
                                        />
                                        {pickVideo === null ? null : (
                                            <Button
                                                variant="secondary"
                                                className="h-9 shrink-0 px-2.5 text-[11.5px]"
                                                onClick={() => {
                                                    void pickVideo(row.input.trim() || undefined)
                                                        .then((picked) => {
                                                            if (picked !== null) {
                                                                update(row.key, { input: picked });
                                                            }
                                                        })
                                                        .catch(() =>
                                                            setError(
                                                                "The file picker was refused by the host.",
                                                            ),
                                                        );
                                                }}
                                            >
                                                <FolderOpen
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5"
                                                />
                                                Browse
                                            </Button>
                                        )}
                                    </span>
                                </label>

                                <label className="grid gap-1 text-[10.5px] text-ink-secondary">
                                    Output file
                                    <span className="flex gap-2">
                                        <input
                                            value={row.output}
                                            onChange={(event) =>
                                                update(row.key, { output: event.target.value })
                                            }
                                            placeholder={
                                                derived === ""
                                                    ? "Derived from the input path"
                                                    : derived
                                            }
                                            spellCheck={false}
                                            className={`${FIELD} font-mono text-[11px]`}
                                        />
                                        {pickSave === null ? null : (
                                            <Button
                                                variant="secondary"
                                                className="h-9 shrink-0 px-2.5 text-[11.5px]"
                                                onClick={() => {
                                                    void pickSave({
                                                        title: "Choose the output file",
                                                        extensions: ["mkv"],
                                                        ...(row.output.trim() === "" &&
                                                        derived !== ""
                                                            ? { defaultPath: derived }
                                                            : row.output.trim() === ""
                                                              ? {}
                                                              : { defaultPath: row.output.trim() }),
                                                    })
                                                        .then((picked) => {
                                                            if (picked !== null) {
                                                                update(row.key, {
                                                                    output: picked,
                                                                });
                                                            }
                                                        })
                                                        .catch(() =>
                                                            setError(
                                                                "The save dialog was refused by the host.",
                                                            ),
                                                        );
                                                }}
                                            >
                                                <Save aria-hidden="true" className="h-3.5 w-3.5" />
                                                Save as…
                                            </Button>
                                        )}
                                    </span>
                                    {row.output.trim() === "" && derived !== "" ? (
                                        <span className="font-mono text-[10px] break-all text-ink-muted">
                                            {derived}
                                        </span>
                                    ) : null}
                                </label>

                                <label className="grid gap-1 text-[10.5px] text-ink-secondary">
                                    Label
                                    <input
                                        value={row.label}
                                        maxLength={120}
                                        onChange={(event) =>
                                            update(row.key, { label: event.target.value })
                                        }
                                        placeholder="Defaults to the input file name"
                                        className={FIELD}
                                    />
                                </label>
                            </div>
                        </section>
                    );
                })}

                {pickVideo === null ? (
                    <Button
                        variant="ghost"
                        className="h-8 w-fit px-2.5 text-[11.5px]"
                        onClick={() => setRows((previous) => [...previous, blank()])}
                    >
                        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        Add another file
                    </Button>
                ) : null}

                {error === null ? null : (
                    <p
                        role="alert"
                        className="m-0 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[11.5px] leading-relaxed whitespace-pre-line text-danger"
                    >
                        {error}
                    </p>
                )}
            </div>
        </Sheet>
    );
}
