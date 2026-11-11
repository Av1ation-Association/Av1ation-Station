import { useEffect, useRef, useState } from "react";

import { useTransport } from "@av1ation/api";

import { Button } from "../shared/Button";

/**
 * The one quit confirmation.
 *
 * The native window's close button is intercepted by the host and turned into a request;
 * this dialog is the only place that confirms it. Keeping it in shared UI means the desktop
 * and any future host use the same copy and the same cancel semantics.
 *
 * The board for this modal is pending live-Penpot review (AGENTS §2.12); the layout uses the
 * existing dialog tokens but must be compared against the live board when it is reachable.
 */
export function QuitGuard() {
    const transport = useTransport();
    const [open, setOpen] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        return transport.onQuitRequest?.(() => setOpen(true)) ?? undefined;
    }, [transport]);

    useEffect(() => {
        const element = dialog.current;
        if (element === null) {
            return;
        }
        if (open && !element.open) {
            element.showModal();
        }
        if (!open && element.open) {
            element.close();
        }
    }, [open]);

    const quit = () => {
        setOpen(false);
        void transport.quit?.().catch(() => {
            // The host is going away; a failed quit leaves the window open and the run intact.
        });
    };

    return (
        <dialog
            ref={dialog}
            aria-labelledby="quit-title"
            onClose={() => setOpen(false)}
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    setOpen(false);
                }
            }}
            className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
        >
            <div className="border-b border-line px-5 py-4">
                <h2 id="quit-title" className="m-0 text-base font-semibold">
                    Quit Av1ation Station?
                </h2>
            </div>
            <div className="px-5 py-4">
                <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
                    Any running encode will be cancelled. Completed scenes and retained chunks stay
                    on disk.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setOpen(false)}>
                        Keep working
                    </Button>
                    <Button variant="secondary" className="text-danger" onClick={quit}>
                        Quit and cancel
                    </Button>
                </div>
            </div>
        </dialog>
    );
}
