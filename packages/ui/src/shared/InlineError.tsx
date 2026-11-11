import type { ReactNode } from "react";

type InlineErrorProps = {
    children: ReactNode;
    className?: string;
};

/**
 * A rejected save or load, stated in place of the control that caused it.
 *
 * The role is part of the primitive so a screen cannot ship an error that assistive
 * technology never announces.
 */
export function InlineError({ children, className = "" }: InlineErrorProps) {
    return (
        <p
            role="alert"
            className={`rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] leading-relaxed text-danger ${className}`}
        >
            {children}
        </p>
    );
}
