import { useEffect, useRef } from "react";

import { Button } from "../../shared/Button";

export function SceneEditDialogs({
    confirmReset,
    confirmDelete,
    selectedCount,
    busy,
    resetPending,
    deletePending,
    resetError,
    deleteError,
    onCancelReset,
    onConfirmReset,
    onCancelDelete,
    onConfirmDelete,
}: {
    confirmReset: boolean;
    confirmDelete: boolean;
    selectedCount: number;
    /** True while any scene edit is being written; both dialogs share one guard. */
    busy: boolean;
    resetPending: boolean;
    deletePending: boolean;
    resetError: unknown;
    deleteError: unknown;
    onCancelReset: () => void;
    onConfirmReset: () => void;
    onCancelDelete: () => void;
    onConfirmDelete: () => void;
}) {
    const resetDialog = useRef<HTMLDialogElement>(null);
    const deleteDialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = resetDialog.current;
        if (dialog === null) {
            return;
        }
        if (confirmReset && !dialog.open) {
            dialog.showModal();
        }
        if (!confirmReset && dialog.open) {
            dialog.close();
        }
    }, [confirmReset]);

    useEffect(() => {
        const dialog = deleteDialog.current;
        if (dialog === null) {
            return;
        }
        if (confirmDelete && !dialog.open) {
            dialog.showModal();
        }
        if (!confirmDelete && dialog.open) {
            dialog.close();
        }
    }, [confirmDelete]);

    return (
        <>
            <dialog
                ref={resetDialog}
                aria-labelledby="reset-scene-chunks-title"
                onClose={onCancelReset}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !busy) {
                        onCancelReset();
                    }
                }}
                className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="border-b border-line px-5 py-4">
                    <h2 id="reset-scene-chunks-title" className="m-0 text-base font-semibold">
                        Delete{" "}
                        {selectedCount === 1
                            ? "this scene's chunk"
                            : `${String(selectedCount)} scene chunks`}
                        ?
                    </h2>
                </div>
                <div className="px-5 py-4">
                    <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
                        The selected scenes&apos; retained chunks are deleted from disk so the
                        Parallel Encoder writes them again. The scene ranges, sequence data, and
                        finished output stay.
                    </p>
                    <p className="m-0 mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11.5px] leading-relaxed text-warning">
                        This is permanent. There is no undo, and the chunks must be encoded again to
                        get them back.
                    </p>
                    {resetError === null || resetError === undefined ? null : (
                        <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                            {resetError instanceof Error
                                ? resetError.message
                                : "The chunks could not be deleted. Try again."}
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                    <Button variant="secondary" onClick={onCancelReset} disabled={busy}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={onConfirmReset} disabled={busy}>
                        {resetPending ? "Deleting…" : "Delete chunks"}
                    </Button>
                </div>
            </dialog>

            <dialog
                ref={deleteDialog}
                aria-labelledby="delete-scene-title"
                onClose={onCancelDelete}
                onClick={(event) => {
                    if (event.target === event.currentTarget && !busy) {
                        onCancelDelete();
                    }
                }}
                className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="border-b border-line px-5 py-4">
                    <h2 id="delete-scene-title" className="m-0 text-base font-semibold">
                        Delete this scene?
                    </h2>
                </div>
                <div className="px-5 py-4">
                    <p className="m-0 text-[13px] leading-relaxed text-ink-secondary">
                        The scene is removed from the table and its frames become uncovered. Its
                        retained chunk and the scratch work for the later scenes are deleted,
                        because their indices move.
                    </p>
                    <p className="m-0 mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11.5px] leading-relaxed text-warning">
                        One undo step is available. Chunks deleted with the scene are not restored;
                        encoding writes them again.
                    </p>
                    {deleteError === null || deleteError === undefined ? null : (
                        <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                            {deleteError instanceof Error
                                ? deleteError.message
                                : "The scene could not be deleted. Try again."}
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                    <Button variant="secondary" onClick={onCancelDelete} disabled={busy}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={onConfirmDelete} disabled={busy}>
                        {deletePending ? "Deleting…" : "Delete scene"}
                    </Button>
                </div>
            </dialog>
        </>
    );
}
