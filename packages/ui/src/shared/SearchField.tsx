import { Search, X } from "lucide-react";

/**
 * The one search field for a list header.
 *
 * Projects, project templates and the queue all place it beside their primary action, so
 * the caller sets the height and width and this component owns the icon, the clear action
 * and the accessible name. The clear button exists only while there is something to clear;
 * a permanently drawn one reads as a disabled control.
 */
export function SearchField({
    value,
    onChange,
    placeholder,
    label = placeholder,
    className = "h-8",
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** What the field searches; defaults to the placeholder. */
    label?: string;
    /** Height and width, which differ with the action beside it. */
    className?: string;
}) {
    return (
        <div className={`relative min-w-0 ${className}`}>
            <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
            />
            <input
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                aria-label={label}
                className="h-full w-full rounded-md border border-line-strong bg-sunken pr-8 pl-8 text-[12px] text-ink outline-none placeholder:text-ink-muted focus:border-brand"
            />
            {value === "" ? null : (
                <button
                    type="button"
                    aria-label="Clear the search"
                    data-tip="Clear the search"
                    data-tip-align="end"
                    onClick={() => onChange("")}
                    className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-muted hover:text-ink"
                >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}
