import {
    useAddProjectTemplate,
    useDeleteProjectTemplate,
    useSetDefaultProjectTemplate,
    useSettings,
} from "@av1ation/api";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { ListRow, ROW_NAME_CLASS } from "../../shared/ListRow";
import { LoadErrorPanel } from "../../shared/LoadErrorPanel";
import { SearchField } from "../../shared/SearchField";
import { SettingsHeader } from "./project-defaults-parts";

/**
 * The Project Templates manager.
 *
 * The list is searchable and each row names its edit destination, mirroring the project
 * list. The marked default is the template a new project copies; it is a property of the
 * template rather than a second, global document so the list cannot disagree with itself.
 */
export function ProjectTemplatesManager() {
    const navigate = useNavigate();
    const settings = useSettings();
    const add = useAddProjectTemplate();
    const remove = useDeleteProjectTemplate();
    const mark = useSetDefaultProjectTemplate();
    const [query, setQuery] = useState("");
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState("");
    const [removing, setRemoving] = useState<string | null>(null);
    const addDialog = useRef<HTMLDialogElement>(null);
    const removeDialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const element = addDialog.current;
        if (element === null) {
            return;
        }
        if (adding && !element.open) {
            element.showModal();
        } else if (!adding && element.open) {
            element.close();
        }
    }, [adding]);

    useEffect(() => {
        const element = removeDialog.current;
        if (element === null) {
            return;
        }
        if (removing !== null && !element.open) {
            element.showModal();
        } else if (removing === null && element.open) {
            element.close();
        }
    }, [removing]);

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

    return (
        <section className="mt-8" aria-labelledby="project-templates-heading">
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
                        <Button className="h-8 px-3 text-[12px]" onClick={() => setAdding(true)}>
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            Add template
                        </Button>
                    </div>
                }
            />

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
                                        <button
                                            type="button"
                                            aria-label={`Delete ${template.name}`}
                                            data-tip={`Delete ${template.name}`}
                                            data-tip-align="end"
                                            onClick={() => setRemoving(template.id)}
                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised text-ink-muted hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
                                        >
                                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                }
                            />
                        );
                    })}
                </ul>
            ) : null}

            <dialog
                ref={addDialog}
                aria-labelledby="add-template-title"
                onCancel={(event) => {
                    event.preventDefault();
                    setAdding(false);
                }}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !add.isPending) {
                        setAdding(false);
                    }
                }}
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
            </dialog>

            <dialog
                ref={removeDialog}
                aria-labelledby="remove-template-title"
                onCancel={(event) => {
                    event.preventDefault();
                    setRemoving(null);
                }}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !remove.isPending) {
                        setRemoving(null);
                    }
                }}
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
            </dialog>
        </section>
    );
}
