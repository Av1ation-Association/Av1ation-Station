import type { ReactNode } from "react";

import { Play, Square } from "lucide-react";

/**
 * The one Start/Stop control.
 *
 * A video page, the queue header, and a queue row all begin and end the same run, so they
 * draw the same control: green for start, red for stop, the same two icons, and the same
 * words. Only its shape changes with the space available — a labelled button where there is
 * room, an expanding icon button inside a row — and never its meaning.
 */
export function RunControl({
    running,
    pending,
    disabled = false,
    disabledReason,
    onStart,
    onStop,
    compact = false,
    size = "md",
    className = "",
}: {
    running: boolean;
    pending: boolean;
    disabled?: boolean;
    disabledReason?: string | undefined;
    onStart: () => void;
    onStop: () => void;
    /** An icon that expands to its label, for a row that owns one column. */
    compact?: boolean;
    size?: "sm" | "md";
    className?: string;
}) {
    const label = running ? (pending ? "Stopping…" : "Stop") : pending ? "Starting…" : "Start";
    const icon: ReactNode = running ? (
        <Square aria-hidden="true" className="h-3 w-3 fill-current" />
    ) : (
        <Play aria-hidden="true" className="h-3 w-3 fill-current" />
    );
    // Neutral until asked: the colour is the confirmation of what the click will do, not a
    // claim that the row is already running.
    const tone = running
        ? "border-line-strong bg-raised text-ink-secondary hover:border-danger/50 hover:text-danger"
        : "border-line-strong bg-raised text-ink-secondary hover:border-success/50 hover:text-success";
    const metrics = size === "sm" ? "h-6 px-1.5 text-[11px]" : "h-7 px-2.5 text-[12px]";

    return (
        <button
            type="button"
            aria-label={running ? "Stop" : "Start"}
            onClick={running ? onStop : onStart}
            disabled={disabled || pending}
            {...(disabledReason === undefined ? {} : { "data-tip": disabledReason })}
            className={`group/run inline-flex shrink-0 items-center justify-center rounded-md border font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:border-line-strong disabled:bg-raised disabled:text-ink-muted disabled:opacity-60 ${disabledReason === undefined ? "disabled:pointer-events-none" : "disabled:pointer-events-auto disabled:cursor-not-allowed"} ${metrics} ${tone} ${className}`}
        >
            <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center">
                {icon}
            </span>
            <span
                aria-hidden="true"
                className={
                    compact
                        ? `max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-150 ease-out group-hover/run:ml-1 group-hover/run:max-w-20 group-hover/run:opacity-100 group-focus-visible/run:ml-1 group-focus-visible/run:max-w-20 group-focus-visible/run:opacity-100 motion-reduce:transition-none`
                        : "ml-1 whitespace-nowrap"
                }
            >
                {label}
            </span>
        </button>
    );
}
