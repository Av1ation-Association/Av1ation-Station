import { useId, type ReactNode } from "react";

import { X } from "lucide-react";

import { cn } from "./cn";
import { useEmbeddedDemoHost } from "./demo-mode";
import { DialogFrame } from "./DialogFrame";

/**
 * The one right-side sheet.
 *
 * It is a native dialog, so the scrim, Escape, and focus containment are the platform's
 * rather than a second implementation in the desktop application. In the marketing embed
 * the shared frame opens it non-modally inside the application overlay host, so it cannot
 * scroll-lock or hide the surrounding page. It slides with `transform` only, and stops
 * moving when the session asks for reduced motion.
 */
export function Sheet({
    open,
    title,
    eyebrow,
    description,
    onClose,
    footer,
    children,
    width = "default",
    placement = "side",
}: {
    open: boolean;
    title: string;
    eyebrow?: string;
    description?: string;
    onClose: () => void;
    footer: ReactNode;
    children: ReactNode;
    /** A two-pane surface needs room; a single form does not. */
    width?: "default" | "wide";
    /** A bottom sheet suits long, wide content such as a command preview. */
    placement?: "side" | "bottom";
}) {
    // More than one sheet is mounted at once (a parameter sheet and an add-build sheet on the
    // Encoders tab), so a fixed id labelled the closed one and named the open dialog after it.
    const titleId = useId();
    const descriptionId = useId();
    const embedded = useEmbeddedDemoHost() !== null;
    const sideWidth =
        width === "wide"
            ? embedded
                ? "w-[min(940px,100%)]"
                : "w-[min(940px,100vw)]"
            : embedded
              ? "w-[min(480px,100%)]"
              : "w-[min(480px,100vw)]";

    return (
        <DialogFrame
            open={open}
            onDismiss={onClose}
            labelledBy={titleId}
            describedBy={description === undefined ? undefined : descriptionId}
            placement={placement === "bottom" ? "bottom" : "right"}
            className={cn(
                "m-0 max-w-none border-0 bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/60 transition-transform duration-200 motion-reduce:transition-none",
                placement === "bottom"
                    ? "mt-auto h-auto max-h-[70dvh] w-full translate-y-full border-t border-line-strong open:translate-y-0"
                    : "ml-auto h-dvh max-h-none translate-x-full border-l border-line-strong open:translate-x-0",
                placement === "bottom" ? undefined : sideWidth,
                embedded && placement === "bottom" && "max-h-[70%]",
                embedded && placement === "side" && "h-full max-h-full",
            )}
        >
            <div className="flex h-full flex-col">
                <header className="flex items-start gap-3 border-b border-line px-5 py-4">
                    <div className="min-w-0 flex-1">
                        {eyebrow === undefined ? null : (
                            <p className="m-0 font-mono text-[9.5px] tracking-[0.16em] text-ink-muted uppercase">
                                {eyebrow}
                            </p>
                        )}
                        <h2 id={titleId} className="m-0 mt-1 text-lg font-semibold text-ink">
                            {title}
                        </h2>
                        {description === undefined ? null : (
                            <p
                                id={descriptionId}
                                className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-muted"
                            >
                                {description}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Close"
                        data-tip="Close"
                        data-tip-align="end"
                        onClick={onClose}
                        className="shrink-0 rounded p-1 text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink"
                    >
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
                    {footer}
                </footer>
            </div>
        </DialogFrame>
    );
}
