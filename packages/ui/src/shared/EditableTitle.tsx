import { useEffect, useRef, useState, type ElementType } from "react";
import { Check, Pencil, X } from "lucide-react";

/**
 * A heading that becomes a text field from its edit button.
 *
 * Enter saves, Escape restores the current name, and the page owns the request so it can
 * report its own error. The heading tag is supplied because an embedded title is not the
 * page's `h1`; a project or template page keeps the default.
 */
export function EditableTitle({
    value,
    label,
    onSave,
    as: Heading = "h1",
    headingClassName = "",
    className = "",
}: {
    value: string;
    label: string;
    /** Resolve true only after the service stored the name. */
    onSave: (name: string) => Promise<boolean>;
    as?: ElementType;
    headingClassName?: string;
    className?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [saving, setSaving] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!editing) {
            setDraft(value);
        }
    }, [value, editing]);

    useEffect(() => {
        if (editing) {
            input.current?.focus();
            input.current?.select();
        }
    }, [editing]);

    const commit = async () => {
        const next = draft.trim();
        if (next === "" || next === value) {
            setEditing(false);
            setDraft(value);
            return;
        }
        setSaving(true);
        try {
            if (await onSave(next)) {
                setEditing(false);
            }
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        return (
            <form
                className={`flex min-w-0 items-center gap-1.5 ${className}`}
                onSubmit={(event) => {
                    event.preventDefault();
                    void commit();
                }}
            >
                <input
                    ref={input}
                    aria-label={`${label} name`}
                    value={draft}
                    maxLength={120}
                    disabled={saving}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault();
                            setEditing(false);
                            setDraft(value);
                        }
                    }}
                    className={`${headingClassName} h-9 min-w-0 rounded-md border border-brand bg-sunken px-2 outline-none disabled:opacity-60`}
                />
                <button
                    type="submit"
                    aria-label={`Save ${label} name`}
                    disabled={saving || draft.trim() === ""}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised text-ink-secondary hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                >
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    aria-label={`Cancel renaming ${label}`}
                    disabled={saving}
                    onClick={() => {
                        setEditing(false);
                        setDraft(value);
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised text-ink-secondary hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
            </form>
        );
    }

    return (
        <div className={`flex min-w-0 items-center gap-2 ${className}`}>
            <Heading className={`min-w-0 truncate ${headingClassName}`}>{value}</Heading>
            <button
                type="button"
                aria-label={`Rename ${label}`}
                onClick={() => setEditing(true)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-hover hover:text-ink"
            >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
