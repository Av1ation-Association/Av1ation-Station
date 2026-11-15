import { useState, type FormEvent } from "react";

import { useCreateProject } from "@av1ation/api";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../shared/Button";

const MAX_NAME = 120;

/**
 * The name field Home uses for an inline project. It is separate so the documentation can
 * mount the same form the application uses instead of a second, approximate widget.
 */
export function NewProjectForm({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated?: (name: string) => void;
}) {
    const create = useCreateProject();
    const [name, setName] = useState("");
    const trimmed = name.trim();

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (trimmed === "" || create.isPending) {
            return;
        }
        create.mutate(trimmed, {
            onSuccess: () => {
                setName("");
                onCreated?.(trimmed);
                onClose();
                toast.success("Project created");
            },
        });
    };

    return (
        <form onSubmit={submit} className="mb-4 rounded-lg border border-line bg-surface p-4">
            <label
                htmlFor="new-project-name"
                className="text-[11px] font-medium tracking-wide text-ink-secondary uppercase"
            >
                Project name
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                    id="new-project-name"
                    autoFocus
                    value={name}
                    maxLength={MAX_NAME}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Untitled project"
                    className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-app px-3 text-sm text-ink placeholder:text-ink-muted"
                />
                <div className="flex gap-2">
                    <Button type="submit" disabled={trimmed === "" || create.isPending}>
                        {create.isPending ? "Creating…" : "Create project"}
                    </Button>
                    <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
                        Cancel
                    </Button>
                </div>
            </div>
            {create.isError ? (
                <p role="alert" className="mt-3 mb-0 text-[12px] leading-relaxed text-danger">
                    {create.error instanceof Error
                        ? create.error.message
                        : "The project could not be created. Try again."}
                </p>
            ) : null}
        </form>
    );
}

/** The one New project action, shared by Home and the focused documentation sample. */
export function NewProjectButton({
    onClick,
    expanded = false,
    disabled = false,
}: {
    onClick: () => void;
    expanded?: boolean;
    disabled?: boolean;
}) {
    return (
        <Button onClick={onClick} aria-expanded={expanded} disabled={disabled}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            New project
        </Button>
    );
}
