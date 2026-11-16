import { useEffect, useRef, useState } from "react";

import {
    useDiagnosticsBundle,
    useHealth,
    useProjects,
    useRevealPath,
    useSaveTextFile,
    useUpdateCheck,
} from "@av1ation/api";
import { ChevronDown, Copy, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { downloadText } from "../../shared/download";
import { DOCUMENTATION, ENGINE_REPOSITORY, REPOSITORY, WEBSITE } from "../../shared/links";
import { relativeTime, verdictFor, type UpdateVerdict } from "../../shared/update-status";
import { BundledToolchain } from "./BundledToolchain";
import { Kicker } from "./Kicker";

/** The one line the check makes true, or nothing at all before it has run. */
function UpdateChip({ verdict }: { verdict: UpdateVerdict | null }) {
    if (verdict === null) {
        return null;
    }
    const tone =
        verdict.kind === "newer"
            ? "border-brand/40 bg-brand-soft text-brand-text"
            : "border-line-strong bg-raised text-ink-secondary";
    const label =
        verdict.kind === "newer"
            ? `Update available · v${verdict.latest}`
            : verdict.kind === "current"
              ? "Up to date"
              : verdict.kind === "ahead"
                ? "Newer than the latest release"
                : "No release published yet";
    if (verdict.kind === "newer" && verdict.url !== null) {
        return (
            <a
                href={verdict.url}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium no-underline ${tone}`}
            >
                {label}
            </a>
        );
    }
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium ${tone}`}
        >
            {label}
        </span>
    );
}

type ProjectChoice = { id: string; name: string };

/**
 * The projects one bundle can carry.
 *
 * A dropdown rather than a list of checkboxes because a user with twenty projects still
 * needs to see the three they picked, and the picker should not push the buttons off the
 * card. It closes on a click outside and on Escape, like every other menu here.
 */
function ProjectPicker({
    projects,
    chosen,
    onChange,
    disabled,
}: {
    projects: readonly ProjectChoice[];
    chosen: readonly string[];
    onChange: (next: string[]) => void;
    disabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        const close = (event: PointerEvent) => {
            if (root.current !== null && !root.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };
        document.addEventListener("pointerdown", close);
        window.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", escape);
        };
    }, [open]);

    const selected = projects.filter((project) => chosen.includes(project.id));
    const summary =
        selected.length === 0
            ? "No project manifest"
            : selected.length === 1
              ? (selected[0]?.name ?? "")
              : `${String(selected.length)} projects`;

    return (
        <div className="relative mt-3" ref={root}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled || projects.length === 0}
                onClick={() => setOpen((current) => !current)}
                className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-line-strong bg-app px-2.5 text-[11.5px] text-ink-secondary hover:border-ink-muted hover:text-ink disabled:opacity-50"
            >
                <span className="shrink-0 text-ink-muted">Manifests</span>
                <span className="min-w-0 flex-1 truncate text-left font-medium text-ink">
                    {projects.length === 0 ? "No projects yet" : summary}
                </span>
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </button>
            {open ? (
                <div
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label="Projects to include"
                    className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-line-strong bg-overlay p-1 shadow-elevation-3"
                >
                    {projects.map((project) => {
                        const checked = chosen.includes(project.id);
                        return (
                            <label
                                key={project.id}
                                className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2.5 text-[11.5px] text-ink-secondary hover:bg-hover hover:text-ink"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                        onChange(
                                            checked
                                                ? chosen.filter((id) => id !== project.id)
                                                : [...chosen, project.id],
                                        )
                                    }
                                    className="h-3.5 w-3.5 shrink-0 accent-[var(--brand-default)]"
                                />
                                <span className="min-w-0 truncate">{project.name}</span>
                            </label>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Version, provenance, and the two actions that leave the machine: a release lookup and a
 * support bundle. Neither runs on its own; a bundle is assembled only when the button is
 * pressed, and saving it asks the host where it should go.
 */
export function AboutPanel() {
    const health = useHealth();
    const projects = useProjects();
    const update = useUpdateCheck();
    const bundle = useDiagnosticsBundle();
    const saveText = useSaveTextFile();
    const reveal = useRevealPath();
    const [includeLogs, setIncludeLogs] = useState(true);
    const [chosen, setChosen] = useState<string[] | null>(null);
    const [savedPath, setSavedPath] = useState<string | null>(null);

    const version = health.data?.version ?? "";
    const releaseUrl = `${REPOSITORY}/releases/tag/v${version}`;
    const verdict = update.data === undefined ? null : verdictFor(update.data);
    const checked = update.data === undefined ? null : relativeTime(update.data.checked_at);
    const projectList = projects.data ?? [];
    const latestProject = [...projectList].sort((left, right) =>
        right.accessed_at.localeCompare(left.accessed_at),
    )[0];
    // Until the user touches the picker, the bundle carries the project they used last.
    const selected = chosen ?? (latestProject === undefined ? [] : [latestProject.id]);

    const build = async () => {
        try {
            return await bundle.mutateAsync({ projectIds: selected, logs: includeLogs });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The bundle could not be built.");
            return null;
        }
    };

    const copy = async () => {
        const made = await build();
        if (made === null) {
            return;
        }
        try {
            await navigator.clipboard.writeText(made.text);
            toast.success(
                made.log_lines === 0
                    ? "The bundle was copied"
                    : `The bundle was copied, with ${String(made.log_lines)} log lines`,
            );
        } catch {
            toast.error("The clipboard is not available. Export the bundle instead.");
        }
    };

    const exportBundle = async () => {
        const made = await build();
        if (made === null) {
            return;
        }
        if (saveText === null) {
            // A browser host owns its downloads; naming the file is all it can do.
            downloadText(made.text, made.filename, "text/markdown");
            setSavedPath(null);
            toast.success(`Saved ${made.filename} to your downloads`);
            return;
        }
        try {
            const path = await saveText(made.filename, made.text, {
                title: "Export diagnostics",
                extensions: ["md"],
            });
            if (path === null) {
                return;
            }
            setSavedPath(path);
            toast.success("The bundle was exported");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? `The bundle could not be written: ${error.message}`
                    : "The bundle could not be written.",
            );
        }
    };

    return (
        <section className="mt-6" aria-labelledby="about-settings-heading">
            <header>
                <p className="m-0 max-w-[72ch] text-[13px] leading-relaxed text-ink-secondary">
                    The application, the engine it embeds, and how to reach the project.
                </p>
            </header>

            {health.isError ? (
                <div
                    role="alert"
                    className="mt-6 rounded-lg border border-danger/30 bg-surface px-5 py-5"
                >
                    <p className="m-0 text-sm font-medium text-ink">
                        Version information could not be loaded
                    </p>
                    <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-secondary">
                        {health.error instanceof Error
                            ? health.error.message
                            : "The service did not return its health document."}
                    </p>
                    <Button variant="secondary" onClick={() => void health.refetch()}>
                        Try again
                    </Button>
                </div>
            ) : null}

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 3xl:grid-cols-[minmax(0,1fr)_400px]">
                <div className="min-w-0 space-y-4">
                    <section className="rounded-lg border border-line bg-surface px-5 py-5">
                        {health.isPending ? (
                            <div className="h-40 animate-pulse rounded-md bg-raised" />
                        ) : null}

                        {health.data === undefined ? null : (
                            <>
                                <Kicker>{health.data.name}</Kicker>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <h2
                                        id="about-settings-heading"
                                        className="m-0 text-xl font-semibold tracking-tight text-ink"
                                    >
                                        {health.data.name}
                                    </h2>
                                    <a
                                        href={releaseUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-full border border-line-strong bg-raised px-2.5 py-1 font-mono text-[10px] text-ink-secondary no-underline hover:border-ink-muted hover:text-ink"
                                    >
                                        Version {health.data.version}
                                    </a>
                                    <UpdateChip verdict={verdict} />
                                    {update.isFetching ? (
                                        <span className="text-[10.5px] text-ink-muted">
                                            Checking…
                                        </span>
                                    ) : null}
                                </div>

                                <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-line-subtle pt-4 sm:grid-cols-2">
                                    <div className="min-w-0">
                                        <dt className="text-[10.5px] text-ink-muted">
                                            Andean Condor
                                        </dt>
                                        <dd className="m-0 mt-0.5 truncate font-mono text-[11.5px] text-ink-secondary">
                                            <a
                                                href={`${ENGINE_REPOSITORY}/commit/${health.data.engine_revision}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-link hover:underline"
                                            >
                                                {health.data.engine_revision}
                                            </a>
                                        </dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-[10.5px] text-ink-muted">
                                            Engine package
                                        </dt>
                                        <dd className="m-0 mt-0.5 truncate font-mono text-[11.5px] text-ink-secondary">
                                            {health.data.engine_version}
                                        </dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-[10.5px] text-ink-muted">
                                            API contract
                                        </dt>
                                        <dd className="m-0 mt-0.5 font-mono text-[11.5px] text-ink-secondary">
                                            v{health.data.api_version}
                                        </dd>
                                    </div>
                                </dl>

                                <p className="mt-4 mb-0 border-t border-line-subtle pt-3 text-[11px] leading-relaxed text-ink-secondary">
                                    GPL-3.0-only. The source for the exact binary you are running is
                                    published in the repository.
                                </p>

                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]">
                                    <a
                                        href={REPOSITORY}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-link hover:underline"
                                    >
                                        Repository
                                    </a>
                                    <a
                                        href={WEBSITE}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-link hover:underline"
                                    >
                                        Website
                                    </a>
                                    <a
                                        href={DOCUMENTATION}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-link hover:underline"
                                    >
                                        Documentation
                                    </a>
                                </div>
                            </>
                        )}
                    </section>

                    <section className="rounded-lg border border-line bg-surface px-5 py-4">
                        <h3 className="m-0 text-[13px] font-semibold text-ink">License</h3>
                        <p className="mt-1.5 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                            Av1ation Station is free software under the GNU General Public License,
                            version 3, because it embeds andean-condor. The engine keeps its own
                            GPL-3.0 licence, and its notices are part of the application bundle.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]">
                            <a
                                href={`${REPOSITORY}/blob/main/LICENSE`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-link hover:underline"
                            >
                                Read the license
                            </a>
                            <a
                                href={`${REPOSITORY}/tree/main/rust/crates/engine`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-ink-secondary hover:text-ink"
                            >
                                Engine source
                            </a>
                        </div>
                    </section>
                </div>

                <aside className="min-w-0 space-y-4 self-start">
                    <section className="rounded-lg border border-line bg-surface">
                        <div className="border-b border-line px-5 py-4">
                            <Kicker>Diagnostics</Kicker>
                            <h3 className="mt-1 mb-0 text-[13px] font-semibold text-ink">
                                Export a bundle for a bug report
                            </h3>
                            <p className="mt-1 mb-0 text-[11px] leading-relaxed text-ink-secondary">
                                Version, dependencies, recent errors, and the projects you pick.
                                Paths are redacted and the LAN token is excluded.
                            </p>
                        </div>
                        <div className="px-5 py-4">
                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={includeLogs}
                                    disabled={bundle.isPending}
                                    onChange={(event) => setIncludeLogs(event.target.checked)}
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand-default)]"
                                />
                                <span className="min-w-0 text-[11.5px] leading-relaxed text-ink-secondary">
                                    Include the tail of the application log
                                </span>
                            </label>

                            <ProjectPicker
                                projects={projectList.map((project) => ({
                                    id: project.id,
                                    name: project.name,
                                }))}
                                chosen={selected}
                                onChange={setChosen}
                                disabled={bundle.isPending}
                            />

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    className="h-8 px-2.5 text-[11.5px]"
                                    onClick={() => void copy()}
                                    disabled={bundle.isPending}
                                >
                                    <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                                    {bundle.isPending ? "Building…" : "Copy bundle"}
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="h-8 px-2.5 text-[11.5px]"
                                    onClick={() => void exportBundle()}
                                    disabled={bundle.isPending}
                                >
                                    <Download aria-hidden="true" className="h-3.5 w-3.5" />
                                    Export…
                                </Button>
                            </div>

                            {savedPath === null ? null : (
                                <p className="mt-3 mb-0 flex min-w-0 items-center gap-1.5 text-[10.5px] leading-relaxed text-ink-secondary">
                                    <span className="min-w-0 truncate font-mono" title={savedPath}>
                                        {savedPath}
                                    </span>
                                    {reveal === null ? null : (
                                        <button
                                            type="button"
                                            onClick={() => void reveal(savedPath)}
                                            className="shrink-0 text-link hover:underline"
                                        >
                                            Reveal
                                        </button>
                                    )}
                                </p>
                            )}

                            {bundle.isError ? (
                                <p
                                    role="alert"
                                    className="mt-3 mb-0 text-[11px] leading-relaxed text-danger"
                                >
                                    {bundle.error instanceof Error
                                        ? bundle.error.message
                                        : "The bundle could not be built."}
                                </p>
                            ) : null}

                            <p className="mt-4 mb-0 border-t border-line-subtle pt-3 text-[10.5px] leading-relaxed text-ink-muted">
                                No telemetry is sent. A bundle is created only when you ask for one,
                                and it contains no source paths, no encoder argv, and no pairing
                                token.
                            </p>
                        </div>
                    </section>

                    <section className="rounded-lg border border-line bg-surface px-5 py-4">
                        <Kicker>Updates</Kicker>
                        <h3 className="mt-1 mb-0 text-[13px] font-semibold text-ink">This build</h3>
                        <p className="mt-1 mb-3 text-[11px] leading-relaxed text-ink-secondary">
                            Reads the repository's newest published release. Nothing is downloaded;
                            an available release opens its page in your browser.
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <Button
                                variant="secondary"
                                className="h-8 px-2.5 text-[11.5px]"
                                disabled={update.isFetching}
                                onClick={() => void update.refetch()}
                            >
                                <RefreshCw
                                    aria-hidden="true"
                                    className={`h-3.5 w-3.5 ${update.isFetching ? "animate-spin" : ""}`}
                                />
                                {update.isFetching ? "Checking…" : "Check now"}
                            </Button>
                            {checked === null ? null : (
                                <span className="text-[10.5px] text-ink-muted">
                                    Last checked {checked}
                                </span>
                            )}
                        </div>
                        {update.isError ? (
                            <p
                                role="alert"
                                className="mt-3 mb-0 text-[11px] leading-relaxed text-danger"
                            >
                                {update.error instanceof Error
                                    ? update.error.message
                                    : "The release check failed."}
                            </p>
                        ) : null}
                    </section>
                </aside>
            </div>

            <BundledToolchain />
        </section>
    );
}
