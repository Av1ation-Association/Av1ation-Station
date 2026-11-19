import {
    MAX_TEMPLATE_IMPORT_FILES,
    useAddProjectTemplate,
    useDeleteProjectTemplate,
    useExportProjectTemplate,
    useImportProjectTemplates,
    useSetDefaultProjectTemplate,
    useSettings,
    type TemplateImportFailure,
} from "@av1ation/api";
import type { ProjectTemplateExport } from "@av1ation/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import {
    Check,
    ChevronDown,
    Download,
    Plus,
    Star,
    Trash2,
    TriangleAlert,
    Upload,
} from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { DialogFrame } from "../../shared/DialogFrame";
import { ExpandableActionButton } from "../../shared/ExpandableActionButton";
import { ListRow, ROW_NAME_CLASS } from "../../shared/ListRow";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../../shared/Menu";
import { SearchField } from "../../shared/SearchField";
import { downloadText } from "../../shared/download";
import { SettingsHeader } from "./project-defaults-parts";

type Notice = {
    tone: "error" | "warning";
    message: string;
    hint?: string | undefined;
    details?: TemplateImportFailure[] | undefined;
    /** Offer the picker again only when the notice is about an import. */
    chooseFile?: boolean | undefined;
};

function isFileDrag(event: DragEvent<HTMLElement>): boolean {
    return event.dataTransfer.types.includes("Files");
}

/**
 * The Project Templates manager.
 *
 * The list is searchable and each row names its edit destination, mirroring the project
 * list. The marked default is the template a new project copies; it is a property of the
 * template rather than a second, global document so the list cannot disagree with itself.
 * Import and export are the same portable file: the header's menu imports a batch, and each
 * row downloads one with a report of what portability removed.
 */
export function ProjectTemplatesManager() {
    const navigate = useNavigate();
    const settings = useSettings();
    const add = useAddProjectTemplate();
    const remove = useDeleteProjectTemplate();
    const mark = useSetDefaultProjectTemplate();
    const exportTemplate = useExportProjectTemplate();
    const importTemplates = useImportProjectTemplates();
    const [query, setQuery] = useState("");
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState("");
    const [removing, setRemoving] = useState<string | null>(null);
    const [exporting, setExporting] = useState<ProjectTemplateExport | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const dragDepth = useRef(0);

    const templates = settings.data?.project_templates ?? [];
    const defaultId = settings.data?.default_project_template_id;
    const needle = query.trim().toLowerCase();
    const filtered =
        needle === ""
            ? templates
            : templates.filter((template) => template.name.toLowerCase().includes(needle));
    const removingTemplate = templates.find((template) => template.id === removing);

    const submitAdd = () => {
        if (name.trim() === "" || add.isPending) {
            return;
        }
        add.mutate(name, {
            onSuccess: (template) => {
                setAdding(false);
                setName("");
                toast.success(`“${template.name}” was created`);
            },
        });
    };

    const submitRemove = () => {
        if (removing === null || remove.isPending) {
            return;
        }
        const id = removing;
        remove.mutate(id, {
            onSuccess: () => {
                setRemoving(null);
                toast.success("The template was removed");
            },
        });
    };

    const openPicker = () => {
        if (!importTemplates.isPending) {
            fileInput.current?.click();
        }
    };

    const saveExport = (result: ProjectTemplateExport) => {
        try {
            downloadText(
                `${JSON.stringify(result.archive, null, 2)}\n`,
                result.filename,
                "application/json",
            );
            toast.success(`Saved ${result.filename} to your downloads`);
        } catch {
            setNotice({
                tone: "error",
                message: "The download could not start.",
                hint: "Try the export again from this row.",
            });
        }
    };

    const requestExport = (id: string) => {
        if (exportTemplate.isPending) {
            return;
        }
        setNotice(null);
        exportTemplate.mutate(id, {
            onSuccess: (result) => {
                if (result.report.removed.length === 0) {
                    saveExport(result);
                } else {
                    setExporting(result);
                }
            },
            onError: (error) => {
                setNotice({
                    tone: "error",
                    message:
                        error instanceof Error
                            ? error.message
                            : "The template could not be exported.",
                    hint: "The row was left unchanged; try again.",
                });
            },
        });
    };

    const importFiles = (files: readonly File[]) => {
        if (importTemplates.isPending || files.length === 0) {
            return;
        }
        setNotice(null);
        importTemplates.mutate(
            {
                files: files.map((file) => ({
                    name: file.name,
                    text: () => file.text(),
                })),
                onProgress: (current, total) => setProgress({ current, total }),
            },
            {
                onSuccess: ({ imported, failures }) => {
                    setProgress(null);
                    if (failures.length === 0) {
                        if (imported.length === 1) {
                            toast.success(`“${imported[0]?.name ?? "Template"}” was imported`);
                        } else {
                            toast.success(`${imported.length} templates were imported`);
                        }
                        return;
                    }
                    setNotice({
                        tone: "warning",
                        message:
                            imported.length === 0
                                ? "No templates were imported."
                                : `Imported ${imported.length} of ${files.length} templates.`,
                        hint:
                            failures.length === 1
                                ? "One file could not be imported."
                                : "The files below could not be imported.",
                        details: failures,
                        chooseFile: true,
                    });
                },
                onError: (error) => {
                    setProgress(null);
                    setNotice({
                        tone: "error",
                        message:
                            error instanceof Error
                                ? error.message
                                : "The templates could not be imported.",
                        hint: "Choose the files again.",
                        chooseFile: true,
                    });
                },
            },
        );
    };

    const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        importFiles(files);
    };

    const onDragEnter = (event: DragEvent<HTMLElement>) => {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
    };

    const onDragOver = (event: DragEvent<HTMLElement>) => {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
    };

    const onDragLeave = (event: DragEvent<HTMLElement>) => {
        if (!isFileDrag(event)) {
            return;
        }
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) {
            setDragging(false);
        }
    };

    const onDrop = (event: DragEvent<HTMLElement>) => {
        if (!isFileDrag(event)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = 0;
        setDragging(false);
        importFiles(Array.from(event.dataTransfer.files));
    };

    return (
        <section
            className="relative mt-8"
            aria-label="Project templates"
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <SettingsHeader
                description="A project template is a saved configuration and General section. New projects copy the template marked as default; existing projects are never changed."
                actions={
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                        <p className="m-0 font-mono text-[10.5px] text-ink-muted tabular-nums">
                            {templates.length} {templates.length === 1 ? "template" : "templates"}
                        </p>
                        <SearchField
                            value={query}
                            onChange={setQuery}
                            placeholder="Search templates"
                            className="h-8 w-full sm:w-56"
                        />
                        <div className="inline-flex h-8 items-stretch">
                            <Button
                                className="h-8 rounded-r-none px-3 text-[12px]"
                                onClick={() => setAdding(true)}
                            >
                                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                                Add template
                            </Button>
                            <Menu>
                                <MenuTrigger asChild>
                                    <button
                                        type="button"
                                        aria-label="More template actions"
                                        data-tip="More template actions"
                                        data-tip-align="end"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-r-md border-l border-white/20 bg-brand text-on-brand hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                    >
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                            strokeWidth={2}
                                        />
                                    </button>
                                </MenuTrigger>
                                <MenuContent align="end" className="min-w-[190px]">
                                    <MenuItem
                                        disabled={importTemplates.isPending}
                                        onSelect={openPicker}
                                    >
                                        <Upload
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                            strokeWidth={1.8}
                                        />
                                        Import template…
                                    </MenuItem>
                                </MenuContent>
                            </Menu>
                        </div>
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".json,application/json"
                            multiple
                            tabIndex={-1}
                            aria-label="Choose template files to import"
                            className="sr-only"
                            onChange={chooseFiles}
                        />
                    </div>
                }
            />

            {progress !== null ? (
                <p
                    role="status"
                    className="mt-4 mb-0 font-mono text-[10.5px] text-ink-muted tabular-nums"
                >
                    Importing {progress.current} of {progress.total} templates…
                </p>
            ) : null}

            {notice !== null ? (
                <div
                    role="alert"
                    className={`mt-4 rounded-lg border p-3.5 ${
                        notice.tone === "error"
                            ? "border-danger/30 bg-danger-soft"
                            : "border-warning/30 bg-warning-soft"
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <TriangleAlert
                            aria-hidden="true"
                            className={`mt-px h-4 w-4 shrink-0 ${
                                notice.tone === "error" ? "text-danger" : "text-warning"
                            }`}
                            strokeWidth={1.8}
                        />
                        <div className="min-w-0 flex-1">
                            <p
                                className={`m-0 text-[12px] font-medium ${
                                    notice.tone === "error" ? "text-danger" : "text-warning"
                                }`}
                            >
                                {notice.message}
                            </p>
                            {notice.hint === undefined ? null : (
                                <p className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-secondary">
                                    {notice.hint}
                                </p>
                            )}
                            {notice.details === undefined ? null : (
                                <ul className="mt-2 mb-0 max-h-32 list-none space-y-1 overflow-y-auto p-0">
                                    {notice.details.map((failure, index) => (
                                        <li
                                            key={`${failure.filename}-${index}`}
                                            className="text-[11px] leading-relaxed text-ink-secondary"
                                        >
                                            <span className="font-medium text-ink">
                                                {failure.filename}
                                            </span>
                                            {" — "}
                                            {failure.message}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {notice.chooseFile === true ? (
                            <Button
                                variant="secondary"
                                className="h-7 shrink-0 px-2.5 text-[11px]"
                                onClick={openPicker}
                            >
                                Choose another file
                            </Button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {settings.isError ? (
                <LoadErrorPanel
                    className="mt-5"
                    title="The templates could not be loaded"
                    message={
                        settings.error instanceof Error
                            ? settings.error.message
                            : "The local service did not respond."
                    }
                    onRetry={() => void settings.refetch()}
                />
            ) : null}

            {settings.isPending ? (
                <div className="mt-4 space-y-2" aria-busy="true">
                    {[0, 1, 2].map((row) => (
                        <div
                            key={row}
                            className="h-14 animate-pulse rounded-lg border border-line bg-surface"
                        />
                    ))}
                </div>
            ) : null}

            {settings.data !== undefined && filtered.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-sunken px-5 py-10 text-center">
                    <p className="m-0 text-[13px] font-medium text-ink">
                        {templates.length === 0
                            ? "No templates yet"
                            : "No template matches that search"}
                    </p>
                    <p className="mx-auto mt-1 mb-0 max-w-[52ch] text-[11.5px] leading-relaxed text-ink-secondary">
                        {templates.length === 0
                            ? "Add one to save a configuration and use it when creating projects or applying it to an existing one."
                            : "Clear the search to see every template."}
                    </p>
                </div>
            ) : null}

            {filtered.length > 0 ? (
                <ul className="m-0 mt-4 list-none divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface p-0">
                    {filtered.map((template) => {
                        const isDefault = template.id === defaultId;
                        const exportingThis =
                            exportTemplate.isPending && exportTemplate.variables === template.id;
                        return (
                            <ListRow
                                key={template.id}
                                className="group flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-hover/60"
                                onOpen={() =>
                                    void navigate({
                                        to: "/settings/templates/$templateId",
                                        params: { templateId: template.id },
                                    })
                                }
                                leading={
                                    <button
                                        type="button"
                                        aria-label={
                                            isDefault
                                                ? `${template.name} is the default template`
                                                : `Make ${template.name} the default template`
                                        }
                                        data-tip={
                                            isDefault
                                                ? `${template.name} is the default template`
                                                : `Make ${template.name} the default template`
                                        }
                                        data-tip-align="start"
                                        aria-pressed={isDefault}
                                        disabled={mark.isPending}
                                        onClick={() =>
                                            mark.mutate(template.id, {
                                                onSuccess: () =>
                                                    toast.success(
                                                        `“${template.name}” is now the default template`,
                                                    ),
                                            })
                                        }
                                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                                            isDefault
                                                ? "border-brand/40 bg-brand-soft text-brand"
                                                : "border-line-strong bg-raised text-ink-muted hover:text-ink"
                                        }`}
                                    >
                                        <Star
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                            fill={isDefault ? "currentColor" : "none"}
                                        />
                                    </button>
                                }
                                name={
                                    <Link
                                        to="/settings/templates/$templateId"
                                        params={{ templateId: template.id }}
                                        className={ROW_NAME_CLASS}
                                    >
                                        {template.name}
                                    </Link>
                                }
                                detail={
                                    <p className="m-0 mt-0.5 cursor-text text-[10.5px] text-ink-muted">
                                        {isDefault
                                            ? "New projects copy this template"
                                            : "Open to edit its sections"}
                                    </p>
                                }
                                trailing={
                                    <>
                                        {isDefault ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
                                                <Check aria-hidden="true" className="h-3 w-3" />
                                                Default
                                            </span>
                                        ) : null}
                                        <ExpandableActionButton
                                            label="Export"
                                            ariaLabel={`Export ${template.name}`}
                                            icon={
                                                <Download
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5"
                                                    strokeWidth={1.8}
                                                />
                                            }
                                            disabled={exportingThis}
                                            onClick={() => requestExport(template.id)}
                                            className="border border-line-strong bg-raised hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
                                        />
                                        <ExpandableActionButton
                                            label="Delete"
                                            ariaLabel={`Delete ${template.name}`}
                                            icon={
                                                <Trash2
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5"
                                                />
                                            }
                                            tone="danger"
                                            onClick={() => setRemoving(template.id)}
                                            className="border border-line-strong bg-raised hover:border-danger/40"
                                        />
                                    </>
                                }
                            />
                        );
                    })}
                </ul>
            ) : null}

            {dragging ? (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-brand bg-app/80 backdrop-blur-sm"
                >
                    <div className="text-center">
                        <Upload
                            aria-hidden="true"
                            className="mx-auto h-7 w-7 text-brand"
                            strokeWidth={1.6}
                        />
                        <p className="mt-2 mb-0 text-[14px] font-semibold text-ink">
                            Drop to import templates
                        </p>
                        <p className="mt-1 mb-0 text-[11.5px] text-ink-secondary">
                            Up to {MAX_TEMPLATE_IMPORT_FILES} .json files
                        </p>
                    </div>
                </div>
            ) : null}

            <DialogFrame
                open={adding}
                onDismiss={() => setAdding(false)}
                labelledBy="add-template-title"
                className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        submitAdd();
                    }}
                >
                    <div className="px-5 py-5">
                        <h2 id="add-template-title" className="m-0 text-[16px] font-semibold">
                            Add a project template
                        </h2>
                        <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-ink-secondary">
                            It starts from the engine defaults. Open it afterwards to configure its
                            sections.
                        </p>
                        <label className="mt-4 block">
                            <span className="text-[11px] font-medium text-ink-secondary">Name</span>
                            <input
                                autoFocus
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                maxLength={120}
                                className="mt-1 h-8 w-full rounded-md border border-line-strong bg-sunken px-2.5 text-[12px] text-ink outline-none focus:border-brand"
                            />
                        </label>
                        {add.isError ? (
                            <p role="alert" className="mt-2 mb-0 text-[11.5px] text-danger">
                                {add.error instanceof Error
                                    ? add.error.message
                                    : "The template could not be created."}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
                        <Button variant="secondary" type="button" onClick={() => setAdding(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={add.isPending || name.trim() === ""}>
                            {add.isPending ? "Creating…" : "Create"}
                        </Button>
                    </div>
                </form>
            </DialogFrame>

            <DialogFrame
                open={removing !== null}
                onDismiss={() => setRemoving(null)}
                labelledBy="remove-template-title"
                className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="px-5 py-5">
                    <h2 id="remove-template-title" className="m-0 text-[16px] font-semibold">
                        Delete “{removingTemplate?.name ?? "template"}”?
                    </h2>
                    <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-ink-secondary">
                        Projects already created from it keep their own copy. This cannot be undone.
                    </p>
                    {remove.isError ? (
                        <p role="alert" className="mt-2 mb-0 text-[11.5px] text-danger">
                            {remove.error instanceof Error
                                ? remove.error.message
                                : "The template could not be removed."}
                        </p>
                    ) : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
                    <Button variant="secondary" onClick={() => setRemoving(null)}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={submitRemove} disabled={remove.isPending}>
                        {remove.isPending ? "Removing…" : "Delete"}
                    </Button>
                </div>
            </DialogFrame>

            <DialogFrame
                open={exporting !== null}
                onDismiss={() => setExporting(null)}
                labelledBy="export-template-title"
                className="m-auto w-[min(620px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="px-5 py-5">
                    <h2 id="export-template-title" className="m-0 text-[16px] font-semibold">
                        Export “{exporting?.archive.template.name ?? "template"}”?
                    </h2>
                    <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-ink-secondary">
                        The file keeps the configuration and General defaults. These
                        machine-specific values are removed so it opens on another computer.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <section className="rounded-md border border-line bg-sunken p-3">
                            <h3 className="m-0 font-mono text-[9.5px] tracking-wide text-ink-muted uppercase">
                                Included in the file
                            </h3>
                            <ul className="mt-2 mb-0 list-none space-y-1 p-0 text-[11.5px] text-ink-secondary">
                                <li>Configuration</li>
                                <li>General defaults</li>
                                {exporting?.report.includes_scripts === true ? (
                                    <li>Inline VapourSynth script</li>
                                ) : null}
                                {exporting?.report.includes_variables === true ? (
                                    <li>Script variables</li>
                                ) : null}
                            </ul>
                        </section>
                        <section className="rounded-md border border-warning/30 bg-warning-soft p-3">
                            <h3 className="m-0 font-mono text-[9.5px] tracking-wide text-warning uppercase">
                                Removed for portability
                            </h3>
                            <ul className="mt-2 mb-0 list-none space-y-1 p-0 text-[11.5px] text-ink-secondary">
                                {exporting?.report.removed.map((label) => (
                                    <li key={label}>{label}</li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
                    <Button variant="secondary" onClick={() => setExporting(null)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            if (exporting !== null) {
                                saveExport(exporting);
                                setExporting(null);
                            }
                        }}
                    >
                        <Download aria-hidden="true" className="h-3.5 w-3.5" />
                        Download
                    </Button>
                </div>
            </DialogFrame>
        </section>
    );
}
