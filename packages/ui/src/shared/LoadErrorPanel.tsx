import type { ReactNode } from "react";

import { Button } from "./Button";

type LoadErrorPanelProps = {
    title: ReactNode;
    message?: ReactNode;
    onRetry: () => void;
    retryLabel?: string;
    heading?: "h1" | "h2" | "p";
    className?: string;
};

/**
 * A request that failed before the screen had data, with the one action that can recover it.
 *
 * Inline errors belong beside a control that can be retried in place; this panel replaces
 * the body that never arrived.
 */
export function LoadErrorPanel({
    title,
    message,
    onRetry,
    retryLabel = "Try again",
    heading: Heading = "p",
    className = "",
}: LoadErrorPanelProps) {
    return (
        <div
            role="alert"
            className={`rounded-lg border border-danger/30 bg-surface p-5 ${className}`}
        >
            <Heading className="m-0 text-sm font-semibold text-ink">{title}</Heading>
            {message === undefined ? null : (
                <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-secondary">
                    {message}
                </p>
            )}
            <Button
                variant="secondary"
                className={message === undefined ? "mt-3" : undefined}
                onClick={onRetry}
            >
                {retryLabel}
            </Button>
        </div>
    );
}
