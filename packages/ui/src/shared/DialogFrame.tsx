import { useEffect, useRef, type ReactNode } from "react";

import { createPortal } from "react-dom";

import { cn } from "./cn";
import { useEmbeddedDemoHost } from "./demo-mode";

type DialogPlacement = "center" | "right" | "bottom";

const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The one native dialog frame.
 *
 * The desktop application opens a real modal: the platform supplies the top layer, focus
 * containment, Escape, and the backdrop. The marketing embed cannot use that mode, because
 * the top layer would inert the article around the frame and a page-level scroll lock would
 * stop the reader. There it renders the same dialog non-modally inside the demo's overlay
 * host, with a frame-sized scrim and focus moved into the surface by hand.
 */
export function DialogFrame({
    open,
    onDismiss,
    labelledBy,
    describedBy,
    placement = "center",
    dismissible = true,
    className,
    children,
}: {
    open: boolean;
    onDismiss: () => void;
    labelledBy?: string | undefined;
    describedBy?: string | undefined;
    placement?: DialogPlacement;
    /** False while a request is pending, so Escape and the scrim cannot dismiss it. */
    dismissible?: boolean;
    className?: string | undefined;
    children: ReactNode;
}) {
    const host = useEmbeddedDemoHost();
    const embedded = host !== null;
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        if (embedded) {
            return;
        }
        const dialog = dialogRef.current;
        if (dialog === null) {
            return;
        }
        if (open && !dialog.open) {
            dialog.showModal();
        }
        if (!open && dialog.open) {
            dialog.close();
        }
    }, [embedded, open]);

    useEffect(() => {
        if (!embedded || !open) {
            return;
        }
        const dialog = dialogRef.current;
        if (dialog === null) {
            return;
        }
        const previous = document.activeElement;
        const target = dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog;
        target.focus();
        return () => {
            if (previous instanceof HTMLElement && previous.isConnected) {
                previous.focus();
            }
        };
    }, [embedded, open, host?.portalContainer]);

    const dismiss = () => {
        if (dismissible) {
            onDismiss();
        }
    };

    const surface = (
        <dialog
            ref={dialogRef}
            open={embedded ? open : undefined}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            tabIndex={-1}
            onCancel={(event) => {
                event.preventDefault();
                dismiss();
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    dismiss();
                }
            }}
            onClick={(event) => {
                // In a modal dialog the element itself is the backdrop. In the embedded
                // frame the wrapper below owns that role.
                if (!embedded && event.target === event.currentTarget) {
                    dismiss();
                }
            }}
            className={cn(className, embedded && "relative m-0 max-w-[calc(100%-2rem)]")}
        >
            {children}
        </dialog>
    );

    if (!embedded) {
        return surface;
    }
    if (!open || host.portalContainer === null) {
        return null;
    }

    return createPortal(
        <div
            data-embedded-dialog=""
            className={cn(
                "absolute inset-0 z-50 flex overflow-y-auto bg-black/60",
                placement === "right"
                    ? "justify-end"
                    : placement === "bottom"
                      ? "items-end"
                      : "items-center justify-center p-4 sm:p-6",
            )}
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    dismiss();
                }
            }}
        >
            {surface}
        </div>,
        host.portalContainer,
    );
}
