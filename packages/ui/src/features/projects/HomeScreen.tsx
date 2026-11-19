import { useEffect, useRef, useState } from "react";

import {
    useDeleteProject,
    useHealth,
    useProjects,
    useRenameProject,
    useRevealPath,
} from "@av1ation/api";
import type { ProjectSummary } from "@av1ation/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { ExpandableActionButton } from "../../shared/ExpandableActionButton";
import { NewProjectButton, NewProjectForm } from "./NewProject";
import { ListRow, ROW_NAME_CLASS } from "../../shared/ListRow";
import { RemoveButton } from "../../shared/RemoveButton";
import { ScreenMain } from "../../shared/ScreenMain";
import { SearchField } from "../../shared/SearchField";
import { Skeleton } from "../../shared/Skeleton";
import { formatBytes } from "../../shared/format";
import { DOCUMENTATION, REPOSITORY, WEBSITE } from "../../shared/links";

const MAX_NAME = 120;
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3";
function videosLabel(project: ProjectSummary): string {
    if (project.video_count === 0) {
        return "0 videos";
    }
    return `${String(project.completed_videos)} / ${String(project.video_count)} videos`;
}

/** One Home row, exported so the documentation can mount the real row against sample data. */
export function ProjectRow({
    project,
    onDelete,
}: {
    project: ProjectSummary;
    onDelete: () => void;
}) {
    const rename = useRenameProject();
    const revealPath = useRevealPath();
    const navigate = useNavigate();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(project.name);
    const [flowError, setFlowError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing]);

    const startRename = () => {
        setValue(project.name);
        setFlowError(null);
        setEditing(true);
    };

    const commitRename = () => {
        const name = value.trim();
        if (name === project.name) {
            setEditing(false);
            setFlowError(null);
            return;
        }
        if (name === "" || name.length > MAX_NAME) {
            setFlowError("A project name needs between 1 and 120 characters.");
            return;
        }
        rename.mutate(
            { id: project.id, name },
            {
                onSuccess: () => {
                    setEditing(false);
                    setFlowError(null);
                    toast.success("Project renamed");
                },
                onError: (error) => setFlowError(error.message),
            },
        );
    };

    const reveal = () => {
        if (revealPath === null) {
            return;
        }
        setFlowError(null);
        void revealPath(project.path).catch((error: unknown) => {
            setFlowError(
                error instanceof Error ? error.message : "The project folder could not be opened.",
            );
        });
    };

    return (
        <ListRow
            className={`${ROW_GRID} group hover:bg-hover/60`}
            onOpen={() =>
                void navigate({
                    to: "/projects/$projectId",
                    params: { projectId: project.id },
                })
            }
            name={
                editing ? (
                    <input
                        ref={inputRef}
                        aria-label="Project name"
                        value={value}
                        maxLength={MAX_NAME}
                        disabled={rename.isPending}
                        onChange={(event) => setValue(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                commitRename();
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                setValue(project.name);
                                setEditing(false);
                                setFlowError(null);
                            }
                        }}
                        className="h-7 w-full rounded-sm border border-line-strong bg-app px-2 text-sm font-medium text-ink"
                    />
                ) : (
                    <>
                        <Link
                            to="/projects/$projectId"
                            params={{ projectId: project.id }}
                            className={ROW_NAME_CLASS}
                        >
                            {project.name}
                        </Link>
                        <ExpandableActionButton
                            label="Rename"
                            ariaLabel={`Rename ${project.name}`}
                            icon={
                                <Pencil aria-hidden="true" className="h-3 w-3" strokeWidth={1.6} />
                            }
                            onClick={startRename}
                            size="xs"
                            className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                        />
                    </>
                )
            }
            detail={
                <div className="mt-1 flex min-w-0 items-center gap-1.5">
                    {revealPath === null ? (
                        <span data-tip="The folder opens from the desktop app">
                            <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" />
                        </span>
                    ) : (
                        <ExpandableActionButton
                            label="Open folder"
                            ariaLabel={`Open the folder for ${project.name}`}
                            icon={
                                <FolderOpen
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.6}
                                />
                            }
                            onClick={reveal}
                            size="xs"
                        />
                    )}
                    <code
                        data-tip={project.path}
                        className="min-w-0 cursor-text truncate font-mono text-[11px] text-ink-muted"
                    >
                        {project.path}
                    </code>
                </div>
            }
            trailing={
                <>
                    <div className="min-w-[112px] cursor-text text-right tabular-nums">
                        <div
                            className="text-[12px] text-ink-secondary"
                            data-tip={
                                project.size_bytes === 0
                                    ? "No retained work"
                                    : "Retained scene chunks and probes"
                            }
                        >
                            {" "}
                            {project.size_bytes === 0
                                ? "—"
                                : `${formatBytes(project.size_bytes)} on disk`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-muted">
                            {videosLabel(project)}
                        </div>
                    </div>

                    <RemoveButton target={project.name} label="Delete" onClick={onDelete} />
                </>
            }
            below={
                flowError === null ? undefined : (
                    <p
                        role="alert"
                        className="mt-0 mb-2 px-4 text-[11px] leading-relaxed text-danger"
                    >
                        {flowError}
                    </p>
                )
            }
        />
    );
}

function LoadingRows() {
    return (
        <ul
            aria-busy="true"
            aria-label="Loading projects"
            className="divide-y divide-line rounded-lg border border-line bg-surface"
        >
            {[0, 1, 2, 3].map((row) => (
                <li key={row} className={ROW_GRID}>
                    <div>
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="mt-2 h-2.5 w-3/5" />
                    </div>
                    <div className="min-w-[112px]">
                        <Skeleton className="ml-auto h-3 w-24" />
                        <Skeleton className="mt-2 ml-auto h-2.5 w-16" />
                    </div>
                    <Skeleton className="h-7 w-7 rounded-md" />
                </li>
            ))}
        </ul>
    );
}

/** The landing surface, and the only place a project is created or removed. */
export function HomeScreen() {
    const { data, error, isPending, isError, isFetching, refetch } = useProjects();
    const remove = useDeleteProject();
    const health = useHealth();
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
    const [query, setQuery] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog === null) {
            return;
        }
        if (deleting !== null && !dialog.open) {
            dialog.showModal();
        }
        if (deleting === null && dialog.open) {
            dialog.close();
        }
    }, [deleting]);

    const projects =
        data === undefined
            ? []
            : [...data].sort((left, right) => right.accessed_at.localeCompare(left.accessed_at));
    // The list is last-accessed ordered, and search narrows it in place. A project matches
    // on either line the row shows, because the name is what a user remembers and the path
    // is what they recognise.
    const needle = query.trim().toLocaleLowerCase();
    const visible =
        needle === ""
            ? projects
            : projects.filter(
                  (project) =>
                      project.name.toLocaleLowerCase().includes(needle) ||
                      project.path.toLocaleLowerCase().includes(needle),
              );

    const confirmDelete = () => {
        if (deleting === null) {
            return;
        }
        const name = deleting.name;
        remove.mutate(deleting.id, {
            onSuccess: () => {
                setDeleting(null);
                toast.success(`Deleted “${name}”`);
            },
        });
    };

    return (
        <ScreenMain className="page flex min-h-[calc(100dvh-3.5rem)] flex-col py-8">
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <h1 className="m-0 min-w-0 text-2xl font-semibold tracking-tight text-ink">
                    Projects
                </h1>
                {/* The search narrows this list, so it belongs on the list's own header
                    line, immediately left of the action that adds to it. */}
                <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                    <SearchField
                        value={query}
                        onChange={setQuery}
                        placeholder="Search projects"
                        label="Search projects by name or path"
                        className="h-9 w-full sm:w-64"
                    />
                    <NewProjectButton
                        onClick={() => setCreating((open) => !open)}
                        expanded={creating}
                        disabled={isError}
                    />
                </div>
            </header>

            <div className="mt-6 flex-1">
                {creating ? (
                    <NewProjectForm
                        onClose={() => {
                            setCreating(false);
                        }}
                    />
                ) : null}

                {isPending ? <LoadingRows /> : null}

                {isError ? (
                    <div
                        className="rounded-lg border border-danger/30 bg-surface px-5 py-5"
                        role="alert"
                    >
                        <p className="m-0 text-sm font-medium text-ink">
                            The project list could not be loaded
                        </p>
                        <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-secondary">
                            {error instanceof Error
                                ? error.message
                                : "The local service did not respond."}
                        </p>
                        <Button
                            variant="secondary"
                            onClick={() => void refetch()}
                            disabled={isFetching}
                        >
                            {isFetching ? "Retrying…" : "Retry connection"}
                        </Button>
                    </div>
                ) : null}

                {data !== undefined && projects.length === 0 && !creating ? (
                    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
                        <h2 className="m-0 text-lg font-semibold text-ink">No projects yet</h2>
                        <p className="mx-auto mt-1.5 mb-5 max-w-[52ch] text-[13px] leading-relaxed text-ink-secondary">
                            A project holds one configuration and one video queue, plus the scene
                            chunks every run retains.
                        </p>
                        <NewProjectButton onClick={() => setCreating(true)} />
                    </div>
                ) : null}

                {projects.length > 0 && visible.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
                        <p className="m-0 text-sm font-medium text-ink">
                            No projects match “{query.trim()}”
                        </p>
                        <p className="mx-auto mt-1 mb-4 max-w-[48ch] text-[12px] leading-relaxed text-ink-secondary">
                            Search looks at the project name and its folder path.
                        </p>
                        <Button variant="secondary" onClick={() => setQuery("")}>
                            Clear search
                        </Button>
                    </div>
                ) : null}

                {visible.length > 0 ? (
                    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                        {visible.map((project) => (
                            <ProjectRow
                                key={project.id}
                                project={project}
                                onDelete={() => {
                                    remove.reset();
                                    setDeleting(project);
                                }}
                            />
                        ))}
                    </ul>
                ) : null}
            </div>

            <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 pb-1 text-[11px] text-ink-muted">
                <span>
                    Av1ation Station
                    {health.data === undefined ? "" : ` v${health.data.version}`}
                </span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <a
                        href={REPOSITORY}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-secondary hover:text-ink"
                    >
                        GitHub
                    </a>
                    <a
                        href={WEBSITE}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-secondary hover:text-ink"
                    >
                        Website
                    </a>
                    <a
                        href={DOCUMENTATION}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-secondary hover:text-ink"
                    >
                        Documentation
                    </a>
                    <Link to="/settings" hash="about" className="text-ink-secondary hover:text-ink">
                        About
                    </Link>
                </div>
            </footer>

            <dialog
                ref={dialogRef}
                aria-labelledby="delete-project-title"
                aria-describedby="delete-project-detail"
                onClose={() => setDeleting(null)}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !remove.isPending) {
                        setDeleting(null);
                    }
                }}
                className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                {deleting === null ? null : (
                    <div>
                        <div className="border-b border-line px-5 py-4">
                            <h2 id="delete-project-title" className="m-0 text-base font-semibold">
                                Delete “{deleting.name}”?
                            </h2>
                        </div>
                        <div className="px-5 py-4">
                            {" "}
                            <p
                                id="delete-project-detail"
                                className="m-0 text-[13px] leading-relaxed text-ink-secondary"
                            >
                                {deleting.size_bytes === 0
                                    ? "This removes the project manifest and its run logs. There are no retained chunks, and source video files stay where they are."
                                    : `This removes the project manifest, its run logs, and ${formatBytes(deleting.size_bytes)} of retained chunks. Source video files stay where they are.`}
                            </p>
                            <p className="mt-3 mb-0 font-mono text-[11px] break-all text-ink-muted">
                                {deleting.path}
                            </p>
                            {remove.isError ? (
                                <p
                                    role="alert"
                                    className="mt-3 mb-0 text-[12px] leading-relaxed text-danger"
                                >
                                    {remove.error instanceof Error
                                        ? remove.error.message
                                        : "The project could not be deleted. Try again."}
                                </p>
                            ) : null}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                            <Button
                                variant="secondary"
                                onClick={() => setDeleting(null)}
                                disabled={remove.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="danger"
                                onClick={confirmDelete}
                                disabled={remove.isPending}
                            >
                                {remove.isPending ? "Deleting…" : "Delete project"}
                            </Button>
                        </div>
                    </div>
                )}
            </dialog>
        </ScreenMain>
    );
}
