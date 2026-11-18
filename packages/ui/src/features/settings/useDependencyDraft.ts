import { useAddCustomTool, useRemoveCustomTool, useSaveToolSource } from "@av1ation/api";
import type { PreflightCheck, PreflightReport } from "@av1ation/contracts";
import { useState } from "react";

import { useDraftSession } from "../../shared/useDraftSession";

/** The two providers a dependency row can select. */
export type DependencySource = "bundled" | "system";

/** One probed executable that has not been accepted into the inventory yet. */
export interface DependencyCandidate {
    path: string;
    check: PreflightCheck;
}

/**
 * The editable part of the dependencies page.
 *
 * A source choice and a located executable both stay here until the page-level Save. The
 * saved inventory and settings are the baseline; a candidate path is deliberately not a
 * custom tool, because probing a file must not change which provider a run uses.
 */
export interface DependencyDraft {
    sources: Record<string, DependencySource>;
    candidates: Record<string, DependencyCandidate>;
    removals: Record<string, true>;
}

function emptyDraft(): DependencyDraft {
    return { sources: {}, candidates: {}, removals: {} };
}

/** The effective provider the inventory currently reports for a row. */
export function sourceOf(check: PreflightCheck): DependencySource {
    return check.configured_source === "bundled" || check.selected_source === "bundled"
        ? "bundled"
        : "system";
}

/** The engine family a dependency row can be pointed at, if it names one. */
export function familyOf(check: PreflightCheck): string | null {
    const custom = /^custom:(.+?)(?::failed)?$/u.exec(check.id);
    if (custom !== null) {
        return custom[1] ?? null;
    }
    const encoder = /^encoder:(.+)$/u.exec(check.id);
    if (encoder !== null) {
        return encoder[1] ?? null;
    }
    // mkvmerge is a muxing executable, not an encoder, but it is locatable exactly like
    // FFmpeg and the encoder families are.
    return check.id === "ffmpeg" || check.id === "mkvmerge" ? check.id : null;
}

function draftFrom(report: PreflightReport): DependencyDraft {
    const sources: Record<string, DependencySource> = {};
    for (const check of report.checks) {
        if ((check.providers?.length ?? 0) > 0) {
            sources[check.id] = sourceOf(check);
        }
    }
    return { sources, candidates: {}, removals: {} };
}

/**
 * Ownership for the dependencies draft.
 *
 * The page saves as one action, but the service exposes one write per setting. The draft
 * keeps the user's intent coherent even though those writes are sent together when Save is
 * pressed; a failed write leaves the draft in place so the user can retry instead of
 * believing a path was accepted.
 */
export function useDependencyDraft(report: PreflightReport, active: boolean) {
    const add = useAddCustomTool();
    const remove = useRemoveCustomTool();
    const source = useSaveToolSource();
    const [error, setError] = useState<string | null>(null);
    const session = useDraftSession<DependencyDraft, PreflightReport>({
        identity: "dependencies",
        label: "Dependency settings",
        snapshot: report,
        toDraft: draftFrom,
        active,
        save: async (draft, snapshot) => {
            setError(null);
            try {
                const writes: Promise<unknown>[] = [];
                for (const check of snapshot.checks) {
                    if (draft.removals[check.id] === true) {
                        writes.push(remove.mutateAsync(check.id));
                    }
                    const candidate = draft.candidates[check.id];
                    if (candidate !== undefined && candidate.check.available) {
                        const family = familyOf(check);
                        if (family !== null) {
                            writes.push(add.mutateAsync({ kind: family, path: candidate.path }));
                        }
                    }
                    const next = draft.sources[check.id];
                    if (
                        next !== undefined &&
                        (check.providers?.length ?? 0) > 0 &&
                        next !== sourceOf(check)
                    ) {
                        writes.push(source.mutateAsync({ id: check.id, source: next }));
                    }
                }
                await Promise.all(writes);
                return true;
            } catch (failure) {
                setError(
                    failure instanceof Error
                        ? `The dependency changes were not saved: ${failure.message}`
                        : "The dependency changes were not saved. Try again.",
                );
                return false;
            }
        },
    });

    const value = session.value ?? emptyDraft();
    const canSave =
        Object.values(value.candidates).every((candidate) => candidate.check.available) &&
        !session.actions.pending;

    const setSource = (id: string, next: DependencySource) => {
        session.setValue((previous) =>
            previous === null
                ? previous
                : { ...previous, sources: { ...previous.sources, [id]: next } },
        );
    };

    const setCandidate = (id: string, path: string, check: PreflightCheck) => {
        session.setValue((previous) => {
            if (previous === null) {
                return previous;
            }
            const removals = { ...previous.removals };
            delete removals[id];
            return {
                ...previous,
                candidates: { ...previous.candidates, [id]: { path, check } },
                removals,
            };
        });
    };

    const requestRemoval = (id: string) => {
        session.setValue((previous) => {
            if (previous === null) {
                return previous;
            }
            const candidates = { ...previous.candidates };
            delete candidates[id];
            return { ...previous, candidates, removals: { ...previous.removals, [id]: true } };
        });
    };

    return {
        value,
        setSource,
        setCandidate,
        requestRemoval,
        actions: {
            ...session.actions,
            onDiscard: () => {
                setError(null);
                session.actions.onDiscard();
            },
        },
        canSave,
        error,
    };
}
