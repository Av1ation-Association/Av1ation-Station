import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Lock, Redo2, Save, Trash2, Undo2 } from "lucide-react";

import { useDraftBlockers } from "./draft-blockers";
import { shortcutHint, useShortcut } from "./shortcuts";

/**
 * The one slot a screen may fill with page actions. A screen renders into the shell's
 * existing 56 px bar instead of adding a second action row inside its content.
 */
export const TopBarTargetContext = createContext<HTMLElement | null>(null);

export function TopBarActions({ children }: { children: ReactNode }) {
    const target = useContext(TopBarTargetContext);
    return target === null ? null : createPortal(children, target);
}

/**
 * One top-bar action: an icon at rest that reveals its name on hover or keyboard focus.
 *
 * A labelled row does not fit beside a breadcrumb, and an icon alone asks the user to
 * guess. Expanding in place answers both: the shape stays compact, and the name appears
 * under the pointer that asked for it. Nothing is clipped, because the label grows before
 * it fades in.
 */
export function TopBarButton({
    label,
    icon,
    onClick,
    disabled,
    tone = "neutral",
    hint,
    showLabel = false,
}: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    disabled: boolean;
    tone?: "neutral" | "danger" | "brand";
    hint?: string | undefined;
    /** Keep the name visible beside the icon; the docs sample uses this to label the controls. */
    showLabel?: boolean;
}) {
    const color =
        tone === "danger"
            ? "hover:bg-danger-soft hover:text-danger"
            : tone === "brand"
              ? "hover:bg-brand-soft hover:text-brand-text"
              : "hover:bg-hover hover:text-ink";
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            {...(hint === undefined ? {} : { "data-tip": hint })}
            className={`group/action inline-flex h-7 items-center justify-center rounded-md px-1.5 text-ink-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-35 ${
                tone === "brand" ? "text-brand-text" : ""
            } ${color}`}
        >
            <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center">
                {icon}
            </span>
            <span
                aria-hidden="true"
                className={
                    showLabel
                        ? "ml-1 text-[11.5px] font-medium whitespace-nowrap"
                        : "max-w-0 overflow-hidden text-[11.5px] font-medium whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-150 ease-out group-hover/action:ml-1 group-hover/action:max-w-24 group-hover/action:opacity-100 group-focus-visible/action:ml-1 group-focus-visible/action:max-w-24 group-focus-visible/action:opacity-100 motion-reduce:transition-none"
                }
            >
                {label}
            </span>
        </button>
    );
}

/**
 * The one draft footer for a screen that edits server state.
 *
 * It lives in the shell's 56 px bar so a panel never opens a second action row, and every
 * screen shows the same four things: undo, redo, discard, and save. The labels are fixed
 * words, never a sentence about the document, so the bar reads the same on every scope.
 */
export function DraftActions({
    dirty,
    pending,
    onSave,
    onDiscard,
    locked = false,
    lockedLabel = "Locked while an encode runs",
    canSave = true,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    showLabels = false,
}: {
    dirty: boolean;
    pending: boolean;
    onSave: () => void;
    onDiscard: () => void;
    locked?: boolean;
    lockedLabel?: string;
    /**
     * Whether the draft is in a state the service can accept. A screen that validates its
     * document locally uses this to keep Save disabled until the document passes, so the
     * button never promises a write the service would reject.
     */
    canSave?: boolean;
    /** Omit to hide the history controls on a screen that keeps no draft history. */
    canUndo?: boolean | undefined;
    canRedo?: boolean | undefined;
    onUndo?: (() => void) | undefined;
    onRedo?: (() => void) | undefined;
    /** Show every action's name at rest; the documentation sample uses this. */
    showLabels?: boolean;
}) {
    // A control that owns a rule the document cannot express — the script variable list is
    // one — reports it while it is mounted. The button refuses the write for every screen,
    // so a rule cannot be forgotten at a call site that does not know about it.
    const blockers = useDraftBlockers();
    const blocker = blockers[0];
    const saveable = canSave && blocker === undefined;

    // Save is the one action a configuration page expects from the keyboard, and a page
    // that does not handle the shortcut hands it to the browser's own Save dialog. The
    // shared chord works from anywhere on the page — including a focused field or Monaco —
    // and the same guards as the button decide whether anything is actually written.
    useShortcut("save", () => {
        if (dirty && !pending && !locked && saveable) {
            onSave();
        }
    });

    // Discard is a local reset, so it stays available while an encode locks the document;
    // it only needs a draft to throw away and no save already in flight.
    useShortcut("discard", () => {
        if (dirty && !pending) {
            onDiscard();
        }
    });

    return (
        <TopBarActions>
            {locked || dirty ? (
                <span className="hidden items-center gap-1.5 text-[11px] text-ink-secondary sm:flex">
                    {locked ? (
                        <>
                            <Lock aria-hidden="true" className="h-3.5 w-3.5" />
                            {lockedLabel}
                        </>
                    ) : (
                        <>
                            <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full bg-warning"
                            />
                            Unsaved changes
                        </>
                    )}
                </span>
            ) : null}
            <div className={`items-center gap-0.5 ${dirty ? "flex" : "hidden sm:flex"}`}>
                {onUndo === undefined ? null : (
                    <TopBarButton
                        label="Undo"
                        hint={`Undo draft change (${shortcutHint("undo")})`}
                        icon={<Undo2 className="h-3.5 w-3.5" />}
                        disabled={canUndo !== true || pending || locked}
                        onClick={onUndo}
                        showLabel={showLabels}
                    />
                )}
                {onRedo === undefined ? null : (
                    <TopBarButton
                        label="Redo"
                        hint={`Redo draft change (${shortcutHint("redo")})`}
                        icon={<Redo2 className="h-3.5 w-3.5" />}
                        disabled={canRedo !== true || pending || locked}
                        onClick={onRedo}
                        showLabel={showLabels}
                    />
                )}
                <TopBarButton
                    label="Discard"
                    hint={`Discard this draft (${shortcutHint("discard")})`}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    disabled={!dirty || pending}
                    onClick={onDiscard}
                    tone="danger"
                    showLabel={showLabels}
                />
                <TopBarButton
                    label={pending ? "Saving…" : "Save"}
                    hint={
                        locked
                            ? lockedLabel
                            : blocker !== undefined
                              ? blocker
                              : canSave
                                ? `Save to the service (${shortcutHint("save")})`
                                : "Fix the document before saving"
                    }
                    icon={<Save className="h-3.5 w-3.5" />}
                    disabled={!dirty || pending || locked || !saveable}
                    onClick={onSave}
                    tone="brand"
                    showLabel={showLabels}
                />
            </div>
        </TopBarActions>
    );
}
