import type { ReactNode } from "react";

/** The small uppercase label that names a settings block without competing with its value. */
export function Kicker({ children }: { children: ReactNode }) {
    return (
        <p className="m-0 font-mono text-[9.5px] tracking-[0.16em] text-ink-muted uppercase">
            {children}
        </p>
    );
}
