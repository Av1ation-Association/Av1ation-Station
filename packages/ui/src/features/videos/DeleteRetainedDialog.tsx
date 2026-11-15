import { useEffect, useRef } from "react";

import { Button } from "../../shared/Button";
import { formatBytes } from "../../shared/format";

/**
 * Confirms deleting one video's encoded chunks and sidecars.
 *
 * The dialog is a real modal because the action is permanent; the copy names what survives
 * (scene list, checkpoint, finished output) and what has to run again. It is extracted from
 * the General screen so the documentation can mount the same confirmation against sample
 * bytes without duplicating its wording or its backdrop behaviour.
 */
export function DeleteRetainedDialog({
    open,
    retainedBytes,
    pending,
    error,
    onClose,
    onConfirm,
}: {
    open: boolean;
    retainedBytes: number;
    pending: boolean;
    error: unknown;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);

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

    return (
        <dialog
            ref={dialog}
            aria-labelledby="delete-chunks-title"
            aria-describedby="delete-chunks-detail"
            onClose={onClose}
            onClick={(event) => {
                if (event.target === event.currentTarget && !pending) {
                    onClose();
                }
            }}
            className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
        >
            <div className="border-b border-line px-5 py-4">
                <h2 id="delete-chunks-title" className="m-0 text-base font-semibold">
                    Delete retained work?
                </h2>
            </div>
            <div className="px-5 py-4">
                <p
                    id="delete-chunks-detail"
                    className="m-0 text-[13px] leading-relaxed text-ink-secondary"
                >
                    This deletes {formatBytes(retainedBytes)} of encoded chunks and sidecars. The
                    scene list, the checkpoint, and the finished output stay; a later Quality Check
                    or a re-encode of edited scenes has to run again.
                </p>
                {error === null || error === undefined ? null : (
                    <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                        {error instanceof Error
                            ? error.message
                            : "The chunks could not be deleted."}
                    </p>
                )}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                <Button variant="secondary" onClick={onClose} disabled={pending}>
                    Cancel
                </Button>
                <Button variant="danger" disabled={pending} onClick={onConfirm}>
                    {pending ? "Deleting…" : "Delete chunks"}
                </Button>
            </div>
        </dialog>
    );
}
