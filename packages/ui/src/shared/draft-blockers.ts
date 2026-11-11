/**
 * The reasons a screen's draft must not be written, reported by the controls that own them.
 *
 * A save button lives in the shell's top bar while the rule that rejects the save lives in a
 * nested editor: the script variable list is the first such rule, and it cannot be checked
 * from the document because the editor holds rows the document's map has already collapsed.
 * The editor registers its reason here and the save button reads it, so a screen does not
 * have to thread a validation callback through every component between the two.
 *
 * This is UI state only. Nothing here is derived from the server, and a blocked draft is
 * still persisted when it is valid again.
 */

import { useSyncExternalStore } from "react";

const blockers = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: string[] = [];

function publish(): void {
    snapshot = [...blockers.values()];
    for (const listener of listeners) {
        listener();
    }
}

/** Report (or clear, with `null`) the reason one editor cannot be saved. */
export function setDraftBlocker(id: string, reason: string | null): void {
    const existing = blockers.get(id) ?? null;
    if (existing === reason) {
        return;
    }
    if (reason === null) {
        blockers.delete(id);
    } else {
        blockers.set(id, reason);
    }
    publish();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function current(): string[] {
    return snapshot;
}

/** Every reason Save is currently refused, in the order the editors reported them. */
export function useDraftBlockers(): string[] {
    return useSyncExternalStore(subscribe, current, current);
}
