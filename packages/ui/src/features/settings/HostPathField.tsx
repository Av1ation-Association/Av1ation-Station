import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../../shared/Button";
import type { HostPathFieldState } from "./useHostPathField";

export interface HostPathFieldProps {
    field: HostPathFieldState<unknown>;
    label: string;
    placeholder: string;
    /** A caller that has not loaded its settings yet. */
    disabled?: boolean;
    /** Whether the typed draft has a Save button; locate-and-apply rows hide it. */
    showSave?: boolean;
    pickLabel?: string;
    pickPendingLabel?: string;
    saveLabel?: string;
    savingLabel?: string;
    tip?: string;
    formClassName?: string;
    buttonClassName?: string;
    /** Helper copy and the row's own actions, below the field. */
    footer?: ReactNode;
    /** The probe verdict, after the two failure alerts. */
    result?: ReactNode;
}

const FIELD_BUTTON = "h-8 px-2.5 text-[11.5px]";

/**
 * The text-field shell of a host-path row: one form, the Locate and optional Save
 * actions, pending disable, and the field and save alerts. The lifecycle lives in
 * `useHostPathField`; a row supplies its labels, layout escape hatches, footer, and
 * result. The interpreter's `<select>` is not a text field and uses the hook alone.
 */
export function HostPathField({
    field,
    label,
    placeholder,
    disabled = false,
    showSave = true,
    pickLabel = "Locate…",
    pickPendingLabel,
    saveLabel = "Save",
    savingLabel = "Saving…",
    tip,
    formClassName = "grid gap-2",
    buttonClassName = FIELD_BUTTON,
    footer,
    result,
}: HostPathFieldProps) {
    const busy = disabled || field.pending;
    const pickText = field.pending && pickPendingLabel !== undefined ? pickPendingLabel : pickLabel;

    return (
        <>
            <form
                className={formClassName}
                onSubmit={(event) => {
                    event.preventDefault();
                    field.submit();
                }}
            >
                <input
                    aria-label={label}
                    value={field.path}
                    disabled={busy}
                    onChange={(event) => field.edit(event.target.value)}
                    placeholder={placeholder}
                    spellCheck={false}
                    className="h-9 w-full min-w-0 rounded-md border border-line-strong bg-raised px-2 font-mono text-[11px] text-ink placeholder:text-ink-muted"
                />
                <div className="flex flex-wrap items-center gap-2">
                    {field.canPick ? (
                        <Button
                            type="button"
                            variant="secondary"
                            className={buttonClassName}
                            disabled={busy}
                            onClick={() => field.locate(field.path)}
                            data-tip={tip}
                        >
                            <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
                            {pickText}
                        </Button>
                    ) : null}
                    {showSave ? (
                        <Button
                            type="submit"
                            variant="secondary"
                            className={buttonClassName}
                            disabled={busy}
                        >
                            {field.pending ? savingLabel : saveLabel}
                        </Button>
                    ) : null}
                </div>
            </form>
            {footer === undefined ? null : <div className="mt-1.5">{footer}</div>}
            <HostPathAlerts fieldError={field.fieldError} saveError={field.saveError} />
            {result === undefined ? null : <div className="mt-2">{result}</div>}
        </>
    );
}

/** The two failure channels a host-path row renders below its field. */
export function HostPathAlerts({
    fieldError,
    saveError,
}: {
    fieldError: string | null;
    saveError: string | null;
}) {
    return (
        <>
            {fieldError === null ? null : (
                <p role="alert" className="mt-2 mb-0 text-[11.5px] leading-relaxed text-danger">
                    {fieldError}
                </p>
            )}
            {saveError === null ? null : (
                <p role="alert" className="mt-2 mb-0 text-[11.5px] leading-relaxed text-danger">
                    {saveError}
                </p>
            )}
        </>
    );
}
