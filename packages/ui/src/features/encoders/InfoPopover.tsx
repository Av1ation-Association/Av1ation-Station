import { useState } from "react";

import { ExternalLink, Info } from "lucide-react";

/**
 * One parameter's documentation, on hover or click.
 *
 * A separate external-link icon made the label row carry two targets, and the description
 * below every row made a hundred parameters unreadable. The icon is the whole affordance:
 * hovering explains, clicking pins the explanation for a touch screen, and the link lives
 * inside it.
 */
export function InfoPopover({
    label,
    description,
    href,
}: {
    label: string;
    description: string | null | undefined;
    href: string | null | undefined;
}) {
    const [open, setOpen] = useState(false);
    if (
        (description === null || description === undefined) &&
        (href === null || href === undefined)
    ) {
        return null;
    }
    return (
        <span
            className="relative inline-flex shrink-0"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                type="button"
                aria-label={`About ${label}`}
                aria-expanded={open}
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen((value) => !value);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
                <Info aria-hidden="true" className="h-3 w-3" />
            </button>
            {open ? (
                <span
                    role="dialog"
                    aria-label={`${label} documentation`}
                    className="absolute top-6 left-0 z-30 block w-72 rounded-md border border-line-strong bg-overlay p-3 text-[11px] leading-relaxed text-ink-secondary shadow-elevation-2"
                >
                    <span className="block text-[11.5px] font-medium text-ink">{label}</span>
                    <span className="mt-1 block">{description ?? "No description recorded."}</span>
                    {href === null || href === undefined ? null : (
                        <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-link hover:underline"
                        >
                            Open the documentation
                            <ExternalLink aria-hidden="true" className="h-3 w-3" />
                        </a>
                    )}
                </span>
            ) : null}
        </span>
    );
}
