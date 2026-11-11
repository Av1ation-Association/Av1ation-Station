import { useEffect, useId, useRef } from "react";

import { X } from "lucide-react";

import { SHORTCUT_IDS, SHORTCUTS, shortcutChords, type ShortcutId } from "../shared/shortcuts";
import { Button } from "../shared/Button";

const APPLICATION = SHORTCUT_IDS.filter((id) => SHORTCUTS[id].scope === "global");
const PLAYER = SHORTCUT_IDS.filter((id) => SHORTCUTS[id].scope === "player");

const HEADING = "m-0 font-mono text-[9.5px] tracking-[0.16em] text-ink-muted uppercase";

/** One section of the reference: the command's words and every chord that runs it. */
function Rows({ ids }: { ids: readonly ShortcutId[] }) {
    return (
        <dl className="m-0 mt-2 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {ids.map((id) => (
                <div key={id} className="flex min-w-0 items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-[12.5px] text-ink">{SHORTCUTS[id].label}</dt>
                    <dd className="m-0 shrink-0">
                        <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10.5px] text-ink-secondary">
                            {shortcutChords(id).join(" / ")}
                        </kbd>
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * The whole keyboard scheme, opened from the command palette.
 *
 * The palette's list is for reaching a destination; the scheme is reference material, so
 * it gets a dialog the user can read without the palette's search field claiming every
 * keystroke. Every row comes from `shortcuts.ts`, so this cannot teach a chord the
 * application does not answer, and a command keeps one row even when it answers two chords.
 *
 * It is a native modal, like every other confirmation and sheet in the shell: the scrim,
 * Escape, and focus containment are the platform's rather than a second implementation.
 */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();

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
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                // The dialog itself is the backdrop; a click on a row bubbles from a child
                // and must not dismiss the reference.
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/60"
        >
            <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0 flex-1">
                    <p className={HEADING}>Reference</p>
                    <h2 id={titleId} className="mt-1 mb-0 text-base font-semibold text-ink">
                        Keyboard Shortcuts
                    </h2>
                    <p
                        id={descriptionId}
                        className="mt-1 mb-0 text-[11.5px] leading-relaxed text-ink-muted"
                    >
                        Undo and Redo defer to a focused field&apos;s own history; Run defers while
                        a field has focus or a dialog is open. Save works from anywhere; the palette
                        is paused while this reference is open.
                    </p>
                </div>
                <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="shrink-0 rounded p-1 text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink"
                >
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            </div>
            <div className="px-5 py-4">
                <h3 className={HEADING}>Application</h3>
                <Rows ids={APPLICATION} />
                <h3 className={`${HEADING} mt-5`}>Scene player</h3>
                <p className="mt-1 mb-0 text-[11px] leading-relaxed text-ink-muted">
                    The player answers these while it has focus. Space and K also work anywhere on
                    the Scenes screen outside a focused control; the arrows and letter keys need the
                    player itself focused.
                </p>
                <Rows ids={PLAYER} />
            </div>
            <footer className="flex justify-end border-t border-line px-5 py-3">
                <Button variant="secondary" onClick={onClose}>
                    Done
                </Button>
            </footer>
        </dialog>
    );
}
