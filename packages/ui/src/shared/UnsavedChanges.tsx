import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

import { useBlocker } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { shortcutHint } from "./shortcuts";
import { Button } from "./Button";

/** One field that differs from the saved document, as the guard dialog lists it. */
export interface GuardChange {
    /** What the user reads, for example `Crf` or `Input`. */
    label: string;
    /** The saved value, already formatted for display. */
    from: string;
    /** The draft value, already formatted for display. */
    to: string;
}

/** What a screen tells the shell about its draft. */
export interface UnsavedGuard {
    /** Whether the screen currently holds edits that are not on the server. */
    dirty: boolean;
    /** Whether a save is in flight; the dialog stays out of the way while it is. */
    pending?: boolean | undefined;
    /** Shown on the dialog so the user knows what is at stake. */
    label?: string | undefined;
    /** The fields the draft changed, so the dialog never asks about a nameless draft. */
    changes?: GuardChange[] | undefined;
    /**
     * Save the draft and report whether it reached the server. The dialog's primary action
     * uses it; a screen without one cannot offer Save and leave.
     */
    save?: (() => Promise<boolean>) | undefined;
}

interface UnsavedChangesContextValue {
    /** Whether the registered draft differs from the server right now. */
    dirty: boolean;
    /** Replace the registered guard. Passing `null` clears it. */
    setGuard: (guard: UnsavedGuard | null) => void;
    /** Run `proceed` now, or after the user confirms discarding the draft. */
    requestLeave: (proceed: () => void) => void;
    /**
     * Let the next router navigation through even while the guard is registered. Used only
     * after the screen saved its own draft for that destination, so the guard cannot ask
     * about changes that are already on the server.
     */
    allowNextNavigation: () => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const MAX_LISTED_CHANGES = 6;

/**
 * One draft guard for the whole application.
 *
 * The guard lives in the shell, not in each screen, because a draft can be left through the
 * router, a Settings tab, or an encoder selection inside one tab. Three separate
 * confirmations would drift; one registry sees every exit.
 */
export function useUnsavedChanges(guard: UnsavedGuard, enabled = true) {
    const context = useContext(UnsavedChangesContext);
    const { dirty, pending, label, changes, save } = guard;
    // The dialog only reads these when it opens, so they are held in refs rather than in the
    // registration key; a new array identity on every render must not re-register the guard.
    const detailRef = useRef({ changes, save });
    detailRef.current = { changes, save };
    const changesKey = JSON.stringify(changes ?? []);

    useEffect(() => {
        if (context === null || !enabled) {
            return;
        }
        context.setGuard({
            dirty,
            pending,
            label,
            changes: detailRef.current.changes,
            save: detailRef.current.save,
        });
        return () => context.setGuard(null);
        // The list itself is held in a ref; this key re-registers the guard when the fields
        // change so the next dialog shows the current draft, not the one that first made it
        // dirty.
    }, [context, dirty, pending, label, changesKey, enabled]);
}

/*
 * Whether any draft is unsaved.
 *
 * A tab strip and a section label need the same answer the leave guard already holds. A
 * second per-screen dirty flag would let the pip and the confirmation disagree.
 */
export function useDraftDirty(): boolean {
    return useContext(UnsavedChangesContext)?.dirty === true;
}

/** Ask the shell whether leaving is allowed; runs the action immediately when it is. */
export function useLeaveGuard() {
    const context = useContext(UnsavedChangesContext);
    return useCallback(
        (proceed: () => void) => {
            if (context === null) {
                proceed();
                return;
            }
            context.requestLeave(proceed);
        },
        [context],
    );
}

/**
 * Let one navigation through after this screen has saved its own draft.
 *
 * Opening a child editor is not leaving the work: the screen first saves the change the
 * child addresses, then calls this so the guard does not ask about the same change a second
 * time. A failed save returns before navigation, which keeps the invalid draft on screen.
 */
export function useAllowNavigation() {
    const context = useContext(UnsavedChangesContext);
    return useCallback(() => context?.allowNextNavigation(), [context]);
}

/** A leaf value formatted for the guard list, never a raw object dump. */
function display(value: unknown): string {
    if (value === undefined || value === null) {
        return "—";
    }
    if (typeof value === "string") {
        return value.trim() === "" ? "—" : value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    const text = JSON.stringify(value);
    return text.length > 32 ? `${text.slice(0, 31)}…` : text;
}

function humanize(key: string): string {
    const words = key
        .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
        .replace(/[_.-]+/gu, " ")
        .trim()
        .split(/\s+/u);
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function flatten(value: unknown, prefix: string, into: Map<string, unknown>) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const entries = Object.entries(value as Record<string, unknown>);
        // An empty object is a document that exists with no fields; recording it keeps an
        // optional section toggled on distinguishable from one that is absent (null).
        if (entries.length === 0) {
            into.set(prefix, value);
            return;
        }
        for (const [key, child] of entries) {
            flatten(child, prefix === "" ? key : `${prefix}.${key}`, into);
        }
        return;
    }
    into.set(prefix, value);
}

/** A section document; `null` is the engine's "absent", not an empty object. */
function isDocument(value: unknown): boolean {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Whether `path` has any recorded child path, so an absent parent is still an object. */
function hasChildren(map: Map<string, unknown>, path: string): boolean {
    const prefix = `${path}.`;
    for (const key of map.keys()) {
        if (key.startsWith(prefix)) {
            return true;
        }
    }
    return false;
}

/**
 * Compare two configuration documents and describe the leaves that differ.
 *
 * The dialog lists a bounded sample: a changed encoder option map can differ in a hundred
 * places, and the point of the list is what changed, not an audit trail.
 */
export function draftChanges(
    draft: unknown,
    saved: unknown,
    limit = MAX_LISTED_CHANGES,
): GuardChange[] {
    const before = new Map<string, unknown>();
    const after = new Map<string, unknown>();
    flatten(saved, "", before);
    flatten(draft, "", after);

    const changes: GuardChange[] = [];
    // Union rather than draft-only: turning an optional section off removes every leaf, and
    // a draft-only walk would show nothing but `— → —` for the section itself.
    const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
    const presence: string[] = [];
    for (const path of paths) {
        if (presence.some((root) => path.startsWith(`${root}.`))) {
            continue;
        }
        const hasBefore = before.has(path);
        const hasAfter = after.has(path);
        const previous = before.get(path);
        const next = after.get(path);
        if (hasBefore && hasAfter && JSON.stringify(previous) === JSON.stringify(next)) {
            continue;
        }
        const label = humanize(path.split(".").pop() ?? path);
        const beforeObject = hasBefore ? isDocument(previous) : hasChildren(before, path);
        const afterObject = hasAfter ? isDocument(next) : hasChildren(after, path);
        if ((!hasBefore && beforeObject) || (!hasAfter && afterObject)) {
            presence.push(path);
            changes.push({
                label,
                from: beforeObject ? "Set" : "Not set",
                to: afterObject ? "Set" : "Not set",
            });
        } else {
            changes.push({ label, from: display(previous), to: display(next) });
        }
        if (changes.length >= limit) {
            break;
        }
    }
    return changes;
}

/**
 * The guard registry and the one confirmation dialog.
 *
 * Router navigation is intercepted with the router's own blocker, so a link, a browser back
 * gesture, and a command-palette jump all pass through the same question. A tab switch is
 * not a navigation, so screens call `requestLeave` for it instead.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
    const guardRef = useRef<UnsavedGuard | null>(null);
    const [dirty, setDirty] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);
    /** Set only for the navigation the user just confirmed discarding. */
    const allowRef = useRef(false);
    /** Set by a screen that saved its own draft for the navigation it is about to start. */
    const savedForNextRef = useRef(false);

    const setGuard = useCallback((guard: UnsavedGuard | null) => {
        guardRef.current = guard;
        setDirty(guard?.dirty === true);
    }, []);

    const requestLeave = useCallback((proceed: () => void) => {
        if (guardRef.current?.dirty !== true) {
            proceed();
            return;
        }
        setSaveError(null);
        setPendingAction(() => proceed);
    }, []);

    const shouldBlockFn = useCallback(() => {
        if (savedForNextRef.current) {
            savedForNextRef.current = false;
            return false;
        }
        return guardRef.current?.dirty === true && !allowRef.current;
    }, []);
    const enableBeforeUnload = useCallback(() => guardRef.current?.dirty === true, []);
    const blocker = useBlocker({
        shouldBlockFn,
        withResolver: true,
        enableBeforeUnload,
        disabled: !dirty,
    });

    /**
     * A screen that has already saved its draft may open its own child route without being
     * asked again. The flag lives for one task: the navigation reads it synchronously and
     * the timeout clears it before any later click can ride along.
     */
    const allowNextNavigation = useCallback(() => {
        savedForNextRef.current = true;
        // A navigation that never reaches the blocker must not leave the next one unguarded.
        window.setTimeout(() => {
            savedForNextRef.current = false;
        }, 2000);
    }, []);

    const blocked = blocker.status === "blocked";
    const open = blocked || pendingAction !== null;
    const guard = guardRef.current;
    const changes = guard?.changes ?? [];
    const count = changes.length;
    const title =
        count === 0 ? "Unsaved changes" : `${count} unsaved ${count === 1 ? "change" : "changes"}`;

    useEffect(() => {
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
    }, [open]);

    const stay = () => {
        if (blocked) {
            blocker.reset();
        }
        setPendingAction(null);
        setSaveError(null);
    };

    const proceed = () => {
        if (blocked) {
            allowRef.current = true;
            blocker.proceed();
            // The blocker reads this only while the navigation is in flight; clearing it on
            // the next task keeps a later dirty draft guarded again.
            window.setTimeout(() => {
                allowRef.current = false;
            }, 0);
            return;
        }
        const action = pendingAction;
        setPendingAction(null);
        action?.();
    };

    const discard = () => {
        setSaveError(null);
        proceed();
    };

    const saveAndLeave = () => {
        const save = guardRef.current?.save;
        if (save === undefined || saving) {
            return;
        }
        setSaving(true);
        setSaveError(null);
        void save()
            .then((saved) => {
                if (saved) {
                    setSaving(false);
                    proceed();
                    return;
                }
                setSaving(false);
                setSaveError(
                    "The draft could not be saved. Stay here, fix the error, and try again.",
                );
            })
            .catch((error: unknown) => {
                setSaving(false);
                setSaveError(
                    error instanceof Error
                        ? `The draft could not be saved: ${error.message}`
                        : "The draft could not be saved. Try again.",
                );
            });
    };

    return (
        <UnsavedChangesContext.Provider
            value={{ dirty, setGuard, requestLeave, allowNextNavigation }}
        >
            {children}
            <dialog
                ref={dialogRef}
                aria-labelledby="unsaved-title"
                aria-describedby="unsaved-detail"
                onCancel={(event) => {
                    event.preventDefault();
                    stay();
                }}
                onClick={(event) => {
                    // Clicking the backdrop is the same as Stay: the draft is untouched and
                    // the pending navigation never runs. A save already in flight is left to
                    // finish, or it would navigate after the dialog was dismissed.
                    if (!saving && event.target === event.currentTarget) {
                        stay();
                    }
                }}
                className="m-auto max-h-[calc(100dvh-2rem)] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-elevation-3 backdrop:bg-black/70"
            >
                <div className="min-w-0 px-5 pt-5">
                    <div className="flex items-start gap-3">
                        <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                        />
                        <div className="min-w-0">
                            <h2 id="unsaved-title" className="m-0 text-[17px] font-semibold">
                                {title}
                            </h2>
                            <p
                                id="unsaved-detail"
                                className="mt-2 mb-0 text-[13px] leading-relaxed text-ink-secondary"
                            >
                                These fields differ from what is saved. Choose what happens to the
                                draft — leaving never discards it silently.
                            </p>
                        </div>
                    </div>
                </div>

                {count === 0 ? null : (
                    <div className="mx-5 mt-4 max-h-[min(45dvh,320px)] overflow-y-auto rounded-lg border border-line-subtle bg-sunken px-4 py-1">
                        <ul className="m-0 list-none p-0">
                            {changes.map((change) => (
                                <li
                                    key={`${change.label}-${change.from}-${change.to}`}
                                    className="grid gap-x-3 gap-y-0.5 border-b border-line-subtle py-2.5 text-[12px] last:border-b-0 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]"
                                >
                                    <span className="min-w-0 truncate text-ink-secondary">
                                        {change.label}
                                    </span>
                                    {/* A path can be longer than the modal; three wrapped
                                        lines keep it readable, then the clamp stops it. */}
                                    <span className="line-clamp-3 min-w-0 font-mono text-[11.5px] leading-relaxed break-words text-warning">
                                        {change.from} → {change.to}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <p className="mx-5 mt-3 mb-0 text-[11px] leading-relaxed text-ink-muted">
                    Undo / redo applies to this draft only — never to server state.
                </p>

                {saveError === null ? null : (
                    <p
                        role="alert"
                        className="mx-5 mt-2 mb-0 text-[11.5px] leading-relaxed text-danger"
                    >
                        {saveError}
                    </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                    <Button variant="secondary" onClick={stay}>
                        Stay and keep editing
                    </Button>
                    <Button variant="ghost" onClick={discard} disabled={saving}>
                        Discard changes
                    </Button>
                    <span aria-hidden="true" className="min-w-0 flex-1" />
                    <Button
                        onClick={saveAndLeave}
                        disabled={saving || guard?.save === undefined}
                        title={
                            guard?.save === undefined ? "This draft has no save action." : undefined
                        }
                    >
                        {saving ? "Saving…" : "Save and leave"}
                    </Button>
                </div>

                <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-muted">
                    Focus starts on the safe choice. Esc returns to where you came from;{" "}
                    {shortcutHint("save")} saves in place.
                </p>
            </dialog>
        </UnsavedChangesContext.Provider>
    );
}
