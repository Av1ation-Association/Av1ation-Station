import { useEffect, useState } from "react";

import { Link } from "@tanstack/react-router";
import {
    usePickDirectory,
    useRevealPath,
    useSettings,
    useStorageOverview,
    useUpdateSettings,
} from "@av1ation/api";
import { ChevronRight, FolderOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { DraftActions } from "../../shared/TopBarActions";
import { draftChanges, useUnsavedChanges } from "../../shared/UnsavedChanges";
import { formatBytes } from "../../shared/format";

const FIELD =
    "h-9 w-full min-w-0 rounded-md border border-line-strong bg-app px-2.5 text-[12px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:opacity-50";

/** A Settings tab names itself in the strip; the body carries only the sentence. */
function PanelHeader({ description }: { description: string }) {
    return (
        <header>
            <p className="m-0 max-w-[72ch] text-[13px] leading-relaxed text-ink-secondary">
                {description}
            </p>
        </header>
    );
}

/**
 * The scratch-directory card shared by Settings and the documentation sample.
 *
 * It owns the field, the host picker affordance, the default reset, and the free-space
 * report. The draft and its Save action stay with the screen because they also cover
 * retention; the card only edits the path it is handed.
 */
export function StorageScratchCard({
    value,
    placeholder,
    freeBytes,
    totalBytes,
    retainedBytes,
    canPick,
    onChange,
    onPick,
    onUseDefault,
    disabled = false,
}: {
    value: string;
    placeholder: string;
    freeBytes: number | null;
    totalBytes: number | null;
    retainedBytes: number;
    canPick: boolean;
    onChange: (value: string) => void;
    onPick: (() => void) | undefined;
    onUseDefault: () => void;
    disabled?: boolean;
}) {
    const free = freeBytes;
    const total = totalBytes;
    const freePercent =
        free !== null && total !== null && total > 0
            ? Math.min(100, Math.max(0, (free / total) * 100))
            : 0;
    const retainedPercent =
        total !== null && total > 0 ? Math.min(100, (retainedBytes / total) * 100) : 0;

    return (
        <section className="rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
                <h2 className="m-0 text-sm font-semibold text-ink">Temporary directory</h2>
                <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                    Per-video scene chunks, probe files, and the preview cache. Empty means the
                    app-data default.
                </p>
            </div>
            <div className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                    <span className="relative min-w-[220px] flex-1">
                        <FolderOpen
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                        />
                        <input
                            aria-label="Temporary directory"
                            value={value}
                            disabled={disabled}
                            onChange={(event) => onChange(event.target.value)}
                            placeholder={placeholder}
                            spellCheck={false}
                            className={`${FIELD} pl-9 font-mono text-[11px]`}
                        />
                    </span>
                    {!canPick || onPick === undefined ? null : (
                        <Button
                            variant="secondary"
                            className="h-9 shrink-0 px-2.5 text-[12px]"
                            disabled={disabled}
                            onClick={onPick}
                        >
                            Change…
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        className="h-9 shrink-0 px-2.5 text-[12px]"
                        disabled={disabled || value.trim() === ""}
                        onClick={onUseDefault}
                    >
                        Use default
                    </Button>
                </div>

                <div className="mt-4">
                    <div className="flex items-baseline justify-between gap-3 text-[10.5px] text-ink-muted">
                        <span className="font-mono tracking-[0.12em] uppercase">Free space</span>
                        <span>{free === null ? "Unavailable" : formatBytes(free)}</span>
                    </div>
                    <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-raised">
                        <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${String(freePercent)}%` }}
                        />
                        <div
                            className="h-full bg-brand/35"
                            style={{ width: `${String(retainedPercent)}%` }}
                        />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[10.5px] text-ink-muted">
                        <span>
                            {free === null || total === null
                                ? "This volume could not be read."
                                : `${formatBytes(free)} free of ${formatBytes(total)}`}
                            {" · "}
                            retained work {formatBytes(retainedBytes)}
                        </span>
                        <span>Encodes need 512 MB free</span>
                    </div>
                    <p className="mt-2 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                        The service checks writability on selection and never starts a run on a
                        read-only mount. Clearing the field restores the app-data default.
                    </p>
                </div>
            </div>
        </section>
    );
}

function ErrorCard({
    title,
    message,
    retry,
}: {
    title: string;
    message: string;
    retry: () => void;
}) {
    return (
        <div className="mt-6 rounded-lg border border-danger/30 bg-surface p-5" role="alert">
            <p className="m-0 text-sm font-medium text-ink">{title}</p>
            <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-secondary">{message}</p>
            <Button variant="secondary" onClick={retry}>
                Try again
            </Button>
        </div>
    );
}

/**
 * The scratch directory, app-data footprint, and retained work per project. Every number is
 * measured by the service on read; this screen never derives a size from a row count.
 */
export function StoragePanel() {
    const settings = useSettings();
    const overview = useStorageOverview();
    const update = useUpdateSettings();
    const pickDirectory = usePickDirectory();
    const reveal = useRevealPath();
    const [tempDir, setTempDir] = useState("");
    const [deleteChunks, setDeleteChunks] = useState(false);

    useEffect(() => {
        if (settings.data === undefined) {
            return;
        }
        setTempDir(settings.data.temp_dir ?? "");
        setDeleteChunks(settings.data.delete_chunks_on_success);
    }, [settings.data]);

    const savedSettings = settings.data;
    const dirty =
        savedSettings !== undefined &&
        (tempDir.trim() !== (savedSettings.temp_dir ?? "") ||
            deleteChunks !== savedSettings.delete_chunks_on_success);

    const save = async (): Promise<boolean> => {
        try {
            await update.mutateAsync({
                temp_dir: tempDir.trim() === "" ? null : tempDir.trim(),
                delete_chunks_on_success: deleteChunks,
            });
            toast.success("Storage settings saved");
            return true;
        } catch {
            return false;
        }
    };

    // Storage edits live in this panel, so a Settings tab switch must ask before dropping
    // them just like a route change does.
    useUnsavedChanges({
        dirty,
        pending: update.isPending,
        label: "Storage",
        changes:
            savedSettings === undefined
                ? []
                : draftChanges(
                      {
                          temp_dir: tempDir.trim(),
                          delete_chunks_on_success: deleteChunks,
                      },
                      {
                          temp_dir: savedSettings.temp_dir ?? "",
                          delete_chunks_on_success: savedSettings.delete_chunks_on_success,
                      },
                  ),
        save,
    });

    if (settings.isPending || overview.isPending) {
        return (
            <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true">
                <div className="space-y-4">
                    {[0, 1, 2].map((row) => (
                        <div
                            key={row}
                            className="h-40 animate-pulse rounded-lg border border-line bg-surface"
                        />
                    ))}
                </div>
                <div className="h-96 animate-pulse rounded-lg border border-line bg-surface" />
            </div>
        );
    }

    if (settings.isError || overview.isError) {
        return (
            <ErrorCard
                title="Storage could not be measured"
                message={
                    overview.error instanceof Error
                        ? overview.error.message
                        : settings.error instanceof Error
                          ? settings.error.message
                          : "The local service did not respond."
                }
                retry={() => {
                    void settings.refetch();
                    void overview.refetch();
                }}
            />
        );
    }

    const data = overview.data;
    const current = settings.data;
    if (data === undefined || current === undefined) {
        return null;
    }

    const total = data.total_bytes ?? null;
    const retainedPercent =
        total !== null && total > 0 ? Math.min(100, (data.retained_bytes / total) * 100) : 0;

    return (
        <section className="mt-8" aria-labelledby="storage-heading">
            <DraftActions
                dirty={dirty}
                pending={update.isPending}
                onSave={() => void save()}
                onDiscard={() => {
                    setTempDir(current.temp_dir ?? "");
                    setDeleteChunks(current.delete_chunks_on_success);
                }}
            />
            <PanelHeader description="Working space, retention, and the app-data directories." />

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4">
                    <section className="rounded-lg border border-line bg-surface">
                        <div className="border-b border-line px-5 py-4">
                            <h2 className="m-0 text-sm font-semibold text-ink">Application data</h2>
                            <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                                Manifests, logs, and the encoder catalogue. A temporary-directory
                                override never moves this directory.
                            </p>
                        </div>
                        <div className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                                <span className="relative min-w-[220px] flex-1">
                                    <FolderOpen
                                        aria-hidden="true"
                                        className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                                    />
                                    <input
                                        aria-label="Application data directory"
                                        value={data.app_data_directory}
                                        readOnly
                                        spellCheck={false}
                                        className={`${FIELD} pl-9 font-mono text-[11px] text-ink-secondary`}
                                    />
                                </span>
                                {reveal === null ? null : (
                                    <Button
                                        variant="secondary"
                                        className="h-9 shrink-0 px-2.5 text-[12px]"
                                        onClick={() => {
                                            if (data.app_data_directory === "") {
                                                return;
                                            }
                                            void reveal(data.app_data_directory).catch(() =>
                                                toast.error("The folder could not be revealed."),
                                            );
                                        }}
                                    >
                                        Reveal
                                    </Button>
                                )}
                            </div>
                            <p className="mt-3 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                                Logs {formatBytes(data.log_bytes)} · manifests{" "}
                                {formatBytes(data.manifest_bytes)} · catalogue{" "}
                                {formatBytes(data.catalogue_bytes)} ·{" "}
                                {formatBytes(data.app_data_bytes)} total
                            </p>
                        </div>
                    </section>

                    <StorageScratchCard
                        value={tempDir}
                        placeholder={data.default_directory}
                        freeBytes={data.free_bytes ?? null}
                        totalBytes={data.total_bytes ?? null}
                        retainedBytes={data.retained_bytes}
                        canPick={pickDirectory !== null}
                        onChange={setTempDir}
                        onPick={
                            pickDirectory === null
                                ? undefined
                                : () => {
                                      void pickDirectory()
                                          .then((picked) => {
                                              if (picked !== null) {
                                                  setTempDir(picked);
                                              }
                                          })
                                          .catch(() =>
                                              toast.error(
                                                  "The folder picker was refused by the host.",
                                              ),
                                          );
                                  }
                        }
                        onUseDefault={() => setTempDir("")}
                    />

                    <section className="rounded-lg border border-line bg-surface">
                        <div className="border-b border-line px-5 py-4">
                            <h2 className="m-0 text-sm font-semibold text-ink">Retention</h2>
                            <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                                Encoded scene chunks are the default, and deleting them is opt-in.
                            </p>
                        </div>
                        <div className="flex items-start justify-between gap-4 px-5 py-4">
                            <div className="min-w-0">
                                <p className="m-0 text-[12px] font-medium text-ink">
                                    Keep encoded scene chunks after a successful run
                                </p>
                                <p className="mt-1 mb-0 max-w-[62ch] text-[10.5px] leading-relaxed text-ink-muted">
                                    On · Quality Check and scene re-encodes stay possible. Turning
                                    this off removes both workflows without deleting anything that
                                    already exists.
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={!deleteChunks}
                                aria-label="Keep encoded scene chunks after a successful run"
                                onClick={() => setDeleteChunks((value) => !value)}
                                className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
                                    deleteChunks ? "bg-raised" : "bg-brand"
                                }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-app transition-transform duration-150 ${
                                        deleteChunks ? "left-0.5" : "left-[18px]"
                                    }`}
                                />
                            </button>
                        </div>
                    </section>

                    {update.isError ? (
                        <p role="alert" className="m-0 text-[12px] leading-relaxed text-danger">
                            {update.error instanceof Error
                                ? `Storage settings could not be saved: ${update.error.message}`
                                : "Storage settings could not be saved."}
                        </p>
                    ) : null}
                </div>

                <aside className="min-w-0 self-start rounded-lg border border-line bg-surface">
                    <div className="border-b border-line px-5 py-4">
                        <p className="m-0 font-mono text-[9px] tracking-[0.16em] text-ink-muted uppercase">
                            Retained work by project
                        </p>
                        <h2 className="mt-1 mb-0 text-sm font-semibold text-ink">
                            Per-video breakdown
                        </h2>
                        <p className="mt-1 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                            Open a project to remove one video's chunks. Deletion is never a bulk
                            action here.
                        </p>
                    </div>
                    {data.projects.length === 0 ? (
                        <p className="m-0 px-5 py-6 text-[11.5px] leading-relaxed text-ink-secondary">
                            No project has retained work. Encoded chunks appear here after a run.
                        </p>
                    ) : (
                        <ul className="m-0 list-none divide-y divide-line-subtle">
                            {data.projects.map((project) => (
                                <li key={project.id}>
                                    <Link
                                        to="/projects/$projectId"
                                        params={{ projectId: project.id }}
                                        className="flex items-center gap-3 px-5 py-3 no-underline hover:bg-hover"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[12px] text-ink">
                                                {project.name}
                                            </span>
                                            <span className="block truncate font-mono text-[10px] text-ink-muted">
                                                {project.video_count} videos ·{" "}
                                                {formatBytes(project.retained_bytes)}
                                            </span>
                                        </span>
                                        <ChevronRight
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="border-t border-line px-5 py-4">
                        <p className="m-0 font-mono text-[9px] tracking-[0.16em] text-ink-muted uppercase">
                            Total retained
                        </p>
                        <p className="mt-1 mb-0 text-2xl font-semibold tracking-tight text-ink">
                            {formatBytes(data.retained_bytes)}
                        </p>
                        <p className="mt-0.5 mb-0 text-[10.5px] text-ink-muted">
                            across {data.projects.length} projects · {data.video_count} videos
                        </p>
                        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-raised">
                            <div
                                className="h-full rounded-full bg-brand"
                                style={{ width: `${String(retainedPercent)}%` }}
                            />
                        </div>
                        <div className="mt-1.5 flex gap-3 text-[9.5px] text-ink-muted">
                            <span className="inline-flex items-center gap-1">
                                <span
                                    aria-hidden="true"
                                    className="h-1.5 w-1.5 rounded-full bg-brand"
                                />
                                chunks
                            </span>
                            <span>
                                Probe files and the preview cache are counted by the service when
                                present.
                            </span>
                        </div>
                        <p className="mt-3 mb-0 text-[10px] leading-relaxed text-ink-muted">
                            Chunk sizes are re-measured after a run. A project with no retained work
                            is omitted rather than shown as zero.
                        </p>
                    </div>
                </aside>
            </div>

            <p className="mt-4 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                Deleting a project removes its manifests and temporary directory; it never removes
                source videos. Deleting retained chunks is always per video.
            </p>
        </section>
    );
}
export { NetworkPanel } from "./NetworkPanel";
