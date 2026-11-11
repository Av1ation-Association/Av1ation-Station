import { Trash2 } from "lucide-react";

/**
 * The one destructive row action in the application.
 *
 * The icon is all that shows at rest, so a row's name column stays aligned with its
 * neighbours; hovering or focusing expands the label into the space the icon already
 * reserved. Parameters, saved builds, and projects all remove from this control, which is
 * why it is shared rather than copied into each list.
 */
export function RemoveButton({
    /** What is being removed, read by assistive technology and the tooltip. */
    target,
    /** The verb, when the row calls it something other than "Remove". */
    label = "Remove",
    onClick,
    disabled = false,
}: {
    target: string;
    label?: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={`${label} ${target}`}
            // No `data-tip` here: the button already expands its own label on hover and
            // focus, and the button clips to animate that reveal, so a bubble drawn by it
            // would be cut off — while saying exactly what the label beside it says.
            disabled={disabled}
            onClick={onClick}
            className="group/remove flex h-7 max-w-7 shrink-0 items-center overflow-hidden rounded-md text-ink-muted transition-[max-width,background-color,color] duration-150 ease-out hover:max-w-24 hover:bg-danger-soft hover:text-danger focus-visible:max-w-24 focus-visible:bg-danger-soft focus-visible:text-danger disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none"
        >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
            <span
                aria-hidden="true"
                className="pr-2 text-[11px] whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover/remove:opacity-100 group-focus-visible/remove:opacity-100 motion-reduce:transition-none"
            >
                {label}
            </span>
        </button>
    );
}
