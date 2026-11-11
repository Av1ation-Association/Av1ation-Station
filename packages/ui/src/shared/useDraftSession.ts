import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sameValue } from "./structural-equality";
import { draftChanges, useUnsavedChanges, type GuardChange } from "./UnsavedChanges";
import { useDraftHistory } from "./useDraftHistory";

export interface DraftSessionOptions<TDraft, TSnapshot> {
    /** The route/document key. A change resets the session to the new snapshot. */
    identity: string;
    label: string;
    snapshot: TSnapshot | undefined;
    toDraft: (snapshot: TSnapshot) => TDraft;
    save: (draft: TDraft, snapshot: TSnapshot) => Promise<boolean>;
    /** Defaults to `draftChanges`; General documents supply their payload comparison. */
    changes?: (draft: TDraft, baseline: TDraft) => GuardChange[];
    /** The shape dirty and the guard compare; defaults to the draft itself. */
    comparable?: (draft: TDraft) => unknown;
    active?: boolean;
    pending?: boolean;
}

export interface DraftSessionActions {
    dirty: boolean;
    pending: boolean;
    onSave: () => void;
    onDiscard: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
}

export interface DraftSession<TDraft> {
    value: TDraft | null;
    setValue: (next: TDraft | null | ((previous: TDraft | null) => TDraft | null)) => void;
    dirty: boolean;
    changes: GuardChange[];
    save: () => Promise<boolean>;
    discard: () => void;
    /** Rebase after an explicit server mutation that is not this session's own save. */
    resetTo: (value: TDraft) => void;
    actions: DraftSessionActions;
}

function defaultChanges<T>(draft: T, baseline: T): GuardChange[] {
    return draftChanges(draft, baseline);
}

function identity<T>(value: T): T {
    return value;
}

/**
 * The one client lifecycle for one editable configuration document.
 *
 * History belongs to the draft, while the saved baseline is the last value the server
 * accepted in draft space. A route or document identity change resets both; a refetch of
 * the same identity only replaces a clean draft, so an unsaved edit is never discarded
 * because the query cache produced a new object. The adapter decides how a snapshot becomes
 * a draft and what a save payload is; the session never learns project or video semantics.
 */
export function useDraftSession<TDraft, TSnapshot>(
    options: DraftSessionOptions<TDraft, TSnapshot>,
): DraftSession<TDraft> {
    const active = options.active !== false;
    const history = useDraftHistory<TDraft>(null, active);
    const resetHistory = history.reset;
    const [baseline, setBaseline] = useState<TDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const optionsRef = useRef(options);
    const snapshotRef = useRef(options.snapshot);
    const baselineRef = useRef<TDraft | null>(null);
    const draftRef = useRef<TDraft | null>(history.value);
    const identityRef = useRef<string | null>(null);
    const savingRef = useRef(false);

    optionsRef.current = options;
    snapshotRef.current = options.snapshot;
    draftRef.current = history.value;

    useEffect(() => {
        if (options.snapshot === undefined) {
            return;
        }
        const adapter = optionsRef.current;
        const next = adapter.toDraft(options.snapshot);
        const current = draftRef.current;
        const saved = baselineRef.current;
        const comparable = adapter.comparable ?? identity;
        const clean =
            current === null || saved === null || sameValue(comparable(current), comparable(saved));
        const changedIdentity = identityRef.current !== options.identity;

        // A route or document change always wins. A newer snapshot replaces only a clean
        // draft; a dirty one keeps its work and saves against the newer snapshot.
        if (!changedIdentity && !clean) {
            return;
        }
        identityRef.current = options.identity;
        resetHistory(next);
        baselineRef.current = next;
        setBaseline(next);
    }, [options.identity, options.snapshot, resetHistory]);

    const comparable = options.comparable ?? identity;
    const dirty =
        history.value !== null &&
        baseline !== null &&
        !sameValue(comparable(history.value), comparable(baseline));

    const changes = useMemo(() => {
        if (history.value === null || baseline === null) {
            return [];
        }
        return (optionsRef.current.changes ?? defaultChanges)(history.value, baseline);
    }, [history.value, baseline]);

    const save = useCallback(async (): Promise<boolean> => {
        const draft = draftRef.current;
        const snapshot = snapshotRef.current;
        if (
            draft === null ||
            snapshot === undefined ||
            savingRef.current ||
            optionsRef.current.pending === true
        ) {
            return false;
        }
        savingRef.current = true;
        setSaving(true);
        try {
            const accepted = await optionsRef.current.save(draft, snapshot);
            if (accepted) {
                resetHistory(draft);
                baselineRef.current = draft;
                setBaseline(draft);
            }
            return accepted;
        } catch {
            return false;
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [resetHistory]);

    const resetTo = useCallback(
        (next: TDraft) => {
            resetHistory(next);
            baselineRef.current = next;
            setBaseline(next);
        },
        [resetHistory],
    );

    const discard = useCallback(() => {
        const snapshot = snapshotRef.current;
        if (snapshot === undefined) {
            return;
        }
        resetTo(optionsRef.current.toDraft(snapshot));
    }, [resetTo]);

    useUnsavedChanges(
        {
            dirty,
            pending: options.pending === true || saving,
            label: options.label,
            changes,
            save,
        },
        active,
    );

    const actions: DraftSessionActions = {
        dirty,
        pending: options.pending === true || saving,
        onSave: () => {
            void save();
        },
        onDiscard: discard,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        onUndo: history.undo,
        onRedo: history.redo,
    };

    return {
        value: history.value,
        setValue: history.setValue,
        dirty,
        changes,
        save,
        discard,
        resetTo,
        actions,
    };
}
