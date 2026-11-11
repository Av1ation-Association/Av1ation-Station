import { useEffect, useId, useRef } from "react";

import { useDeleteRun, useDeleteRunLog } from "@av1ation/api";
import { toast } from "sonner";

import { Button } from "../../shared/Button";
import { runWhen } from "../../shared/model/run-presentation";

/**
 * The confirmation every place that deletes a run, or the log beside it, uses.
 *
 * Mounting the control is what opens it: the caller renders it only for the run it means to
 * remove and unmounts it from `onClose`, so a second target never inherits the first
 * request's error. The caller decides which runs are live; this dialog only confirms and
 * reports, because the service is what refuses a live run.
 *
 * `kind` is the reach of the action, not a second confirmation: History lists runs, so its
 * delete removes the history entries and the log together, while the log viewer is about the
 * file and keeps the run in History.
 *
 * It is a native modal dialog rather than the side sheet: a two-line confirmation has no
 * second pane to read, and a sheet that slides a whole panel in for ten words reads as a
 * larger action than it is.
 */
export function DeleteRunDialog({
    projectId,
    videoId,
    runId,
    startedAt,
    kind = "log",
    onClose,
}: {
    projectId: string;
    videoId: string;
    runId: string;
    /** The run's start; the dialog formats it so every entry point agrees. */
    startedAt: string;
    kind?: "log" | "run";
    onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    const deleteLog = useDeleteRunLog(projectId, videoId);
    const deleteRun = useDeleteRun(projectId, videoId);
    const mutation = kind === "run" ? deleteRun : deleteLog;
    const noun = kind === "run" ? "run" : "log";
    const label = kind === "run" ? "Delete run" : "Delete log";
    const when = runWhen(startedAt);

    useEffect(() => {
        const element = dialog.current;
        if (element === null) {
            return;
        }
        if (!element.open) {
            element.showModal();
        }
    }, []);

    const confirm = () => {
        mutation.mutate(runId, {
            onSuccess: () => {
                toast.success(kind === "run" ? "The run was deleted" : "The run log was deleted");
                onClose();
            },
        });
    };

    return (
        <dialog
            ref={dialog}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onCancel={(event) => {
                event.preventDefault();
                if (!mutation.isPending) {
                    onClose();
                }
            }}
            onClick={(event) => {
                // The dialog itself is the backdrop; a click on a field or button bubbles
                // from a child and must not dismiss the question.
                if (event.target === event.currentTarget && !mutation.isPending) {
                    onClose();
                }
            }}
            className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/60"
        >
            <div className="px-5 py-4">
                <p className="m-0 font-mono text-[9.5px] tracking-[0.16em] text-ink-muted uppercase">
                    {kind === "run" ? "History" : "Run log"}
                </p>
                <h2 id={titleId} className="mt-1 mb-0 text-base font-semibold text-ink">
                    {`Delete this ${noun}?`}
                </h2>
                <p
                    id={descriptionId}
                    className="mt-2 mb-0 text-[12px] leading-relaxed text-ink-secondary"
                >
                    {kind === "run"
                        ? `This removes the history entries and the log recorded for the run that started ${when}. The data the run wrote stays with the video.`
                        : `This removes the log recorded for the run that started ${when}. History keeps the run, along with how it ended.`}
                </p>
                {mutation.isError ? (
                    <p role="alert" className="mt-3 mb-0 text-[12px] text-danger">
                        {mutation.error instanceof Error
                            ? mutation.error.message
                            : `The ${noun} could not be deleted. Try again.`}
                    </p>
                ) : null}
            </div>
            <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
                <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
                    Cancel
                </Button>
                <Button variant="danger" onClick={confirm} disabled={mutation.isPending}>
                    {mutation.isPending ? "Deleting…" : label}
                </Button>
            </footer>
        </dialog>
    );
}
