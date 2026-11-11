import type { ReactNode } from "react";

/**
 * One configuration section in an overview grid.
 *
 * The card is the whole section at a glance: a title, the values that describe the
 * current document, and an optional footer. The caller wraps it in the destination link,
 * so the entire card is the control; there is no second Edit affordance to align or
 * explain. The copy keeps the text cursor so a drag selects it instead of reading as one
 * more link. It is shared by a project and the project template so the two contexts cannot
 * drift into different navigation models.
 */
export function SectionCard({
    title,
    lines,
    badge,
    footer,
    alert,
    failed = false,
}: {
    title: string;
    lines: string[];
    badge?: ReactNode;
    footer?: ReactNode;
    /** A card-level failure band, rendered full width directly below the title. */
    alert?: ReactNode;
    /** Whether the card border and left rule take the danger tone. */
    failed?: boolean;
}) {
    return (
        <section
            className={`relative flex h-full min-h-[132px] min-w-0 flex-col rounded-lg border ${
                failed
                    ? "border-danger/40 group-hover:border-danger/60"
                    : "border-line group-hover:border-line-strong"
            } bg-surface transition-colors duration-150 group-hover:bg-raised group-focus-visible:border-brand`}
        >
            {failed ? (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-l-[7px] bg-danger"
                />
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 pb-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <h2 className="m-0 cursor-text text-[15px] font-semibold text-ink">{title}</h2>
                    {badge}
                </div>
                {alert === undefined || alert === null ? null : (
                    <div className="-mx-5 mt-2">{alert}</div>
                )}
                <div className="mt-2 min-w-0 flex-1 space-y-1">
                    {lines.map((line) => (
                        /* The tooltip sits on the row, not on the line: `truncate` clips its own
                           overflow, which would cut a bubble growing out of the text it is
                           revealing. */
                        <div key={line} className="min-w-0" data-tip={line}>
                            <p className="m-0 cursor-text truncate text-[11.5px] leading-relaxed text-ink-secondary">
                                {line}
                            </p>
                        </div>
                    ))}
                </div>
                {footer === undefined ? null : (
                    <div className="mt-3 min-w-0 border-t border-line-subtle pt-2.5">{footer}</div>
                )}
            </div>
        </section>
    );
}

/** The small status pill a section card carries for an optional or overridden value. */
export function SectionBadge({
    children,
    tone = "neutral",
}: {
    children: ReactNode;
    tone?: "neutral" | "custom";
}) {
    return (
        <span
            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[8.5px] tracking-[0.12em] uppercase ${
                tone === "custom"
                    ? "border-success/40 text-success"
                    : "border-line-strong text-ink-muted"
            }`}
        >
            {children}
        </span>
    );
}
