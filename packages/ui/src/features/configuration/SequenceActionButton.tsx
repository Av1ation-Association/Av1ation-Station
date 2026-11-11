import type { ReactNode } from "react";

/**
 * One sequence action in a dense row.
 *
 * The icon stays compact at rest, so a card can show start, stop, and reset without
 * stealing width from the sequence detail. The label expands to the right on hover and
 * keyboard focus; only its opacity animates, so the row never transitions its layout.
 */
export function SequenceActionButton({
    icon,
    label,
    ariaLabel,
    title,
    disabled = false,
    tone = "neutral",
    onClick,
}: {
    icon: ReactNode;
    label: string;
    /** The accessible name, when the visible label alone lacks the sequence's context. */
    ariaLabel?: string;
    title: string;
    disabled?: boolean;
    tone?: "neutral" | "danger" | "warning";
    onClick: () => void;
}) {
    const toneClass =
        tone === "danger"
            ? "text-danger hover:bg-danger-soft"
            : tone === "warning"
              ? "text-ink-muted hover:bg-hover hover:text-warning"
              : "text-ink-muted hover:bg-hover hover:text-ink";

    return (
        <button
            type="button"
            aria-label={ariaLabel ?? label}
            data-tip={title}
            // The button sits at the right end of its row, so centring a wide sentence on
            // it would push half of the bubble past the card's edge.
            data-tip-align="end"
            disabled={disabled}
            onClick={onClick}
            className={`group/action inline-flex h-6 max-w-full shrink-0 items-center justify-center rounded px-1.5 text-[9.5px] transition-colors duration-150 disabled:opacity-35 ${toneClass}`}
        >
            {icon}
            <span
                aria-hidden="true"
                className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/action:ml-1 group-hover/action:max-w-24 group-hover/action:opacity-100 group-focus-visible/action:ml-1 group-focus-visible/action:max-w-24 group-focus-visible/action:opacity-100"
            >
                {label}
            </span>
        </button>
    );
}
