import type { RefObject } from "react";

import type { VideoSummary } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { formatBytes } from "../../shared/format";

type RemoveVideosDialogProps = {
    dialogRef: RefObject<HTMLDialogElement | null>;
    removing: readonly VideoSummary[] | null;
    retainedBytes: number;
    pending: boolean;
    error: Error | null;
    onClose: () => void;
    onConfirm: () => void;
};

export function RemoveVideosDialog({
    dialogRef,
    removing,
    retainedBytes,
    pending,
    error,
    onClose,
    onConfirm,
}: RemoveVideosDialogProps) {
    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="remove-videos-title"
            aria-describedby="remove-videos-detail"
            onClose={onClose}
            onClick={(event) => {
                if (event.target === event.currentTarget && !pending) {
                    onClose();
                }
            }}
            className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
        >
            {removing === null ? null : (
                <div>
                    <div className="border-b border-line px-5 py-4">
                        <h2 id="remove-videos-title" className="m-0 text-base font-semibold">
                            Remove{" "}
                            {removing.length === 1
                                ? `“${removing[0]?.name ?? "video"}”`
                                : `${removing.length} videos`}
                            ?
                        </h2>
                    </div>
                    <div className="px-5 py-4">
                        <p
                            id="remove-videos-detail"
                            className="m-0 text-[13px] leading-relaxed text-ink-secondary"
                        >
                            {retainedBytes === 0
                                ? "These entries are removed from the queue; source files stay where they are."
                                : `This removes the entries and ${formatBytes(retainedBytes)} of retained scene chunks. Source files stay where they are.`}
                        </p>
                        {error !== null ? (
                            <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                                {error.message}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                        <Button variant="secondary" onClick={onClose} disabled={pending}>
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={onConfirm} disabled={pending}>
                            {pending ? "Removing…" : "Remove"}
                        </Button>
                    </div>
                </div>
            )}
        </dialog>
    );
}
