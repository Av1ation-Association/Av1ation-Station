import type { ReactNode } from "react";

/**
 * One compact row/list action that reveals its name in place.
 *
 * The icon is all that shows at rest, so adjacent rows keep their columns aligned. Hover or
 * keyboard focus grows the same control instead of opening a second tooltip that repeats the
 * label. The native disabled attribute refuses the click.
 */
export function ExpandableActionButton({
    label,
    ariaLabel,
    icon,
    onClick,
    disabled = false,
    tone = "neutral",
    size = "md",
    className = "",
}: {
    /** The action's name, shown in the expanded label. */
    label: string;
    /** A fuller accessible name, when the row nests the action under an item. */
    ariaLabel: string;
    icon: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    tone?: "neutral" | "danger";
    /** The at-rest square size; the label still grows in place. */
    size?: "xs" | "sm" | "md";
    className?: string;
}) {
    const color =
        tone === "danger"
            ? "hover:bg-danger-soft hover:text-danger focus-visible:bg-danger-soft focus-visible:text-danger"
            : "hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:text-ink";
    const square = size === "xs" ? "h-5 w-5" : size === "sm" ? "h-6 w-6" : "h-7 w-7";
    const height = size === "xs" ? "h-5" : size === "sm" ? "h-6" : "h-7";
    const maxWidth = size === "xs" ? "max-w-5" : size === "sm" ? "max-w-6" : "max-w-7";
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={onClick}
            className={`group/action flex ${height} ${maxWidth} shrink-0 items-center overflow-hidden rounded-md text-ink-muted transition-[max-width,background-color,color] duration-150 ease-out hover:max-w-32 focus-visible:max-w-32 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none ${color} ${className}`}
        >
            <span className={`flex ${square} shrink-0 items-center justify-center`}>{icon}</span>
            <span
                aria-hidden="true"
                className="pr-2 text-[11px] whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover/action:opacity-100 group-focus-visible/action:opacity-100 motion-reduce:transition-none"
            >
                {label}
            </span>
        </button>
    );
}
