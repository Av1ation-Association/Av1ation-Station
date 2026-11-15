import { useState } from "react";

import {
    useCancelVideoEncode,
    useEncodeBlockedElsewhere,
    useStartVideoEncode,
    useVideoValidation,
} from "@av1ation/api";
import type { PreflightCheck, VideoState } from "@av1ation/contracts";
import { Link } from "@tanstack/react-router";

import { useDemoMode } from "../../shared/demo-mode";
import { InlineError } from "../../shared/InlineError";
import { isModalOpen, isTextEntryTarget, useShortcut } from "../../shared/shortcuts";
import { RunControl } from "../../shared/RunControl";
import { TopBarActions } from "../../shared/TopBarActions";

/**
 * The video's one primary action, in the shell's bar where Save sits elsewhere.
 *
 * The label is "Start", not "Run encode": the button begins the next derived sequence,
 * which may be detection or measurement rather than encoding. It never decides what is
 * runnable; the server's `next` list does, and a disabled title says why.
 *
 * A refused start or stop is stated below the bar rather than toasted: the user has to
 * decide what to fix, and a message that disappears cannot carry that.
 */
export function VideoRunActions({
    projectId,
    videoId,
    state,
    locked = false,
    lockedLabel = "Locked while an encode runs",
    blockedReason = null,
}: {
    projectId: string;
    videoId: string;
    state: VideoState | undefined;
    /** Another video in the queue holds the lock. */
    locked?: boolean;
    lockedLabel?: string;
    /** A structural error that makes the chain unrunnable, such as overlapping scenes. */
    blockedReason?: string | null;
}) {
    const demo = useDemoMode();
    const start = useStartVideoEncode(projectId);
    const cancel = useCancelVideoEncode(projectId);
    const validation = useVideoValidation(projectId, videoId);
    const [refusal, setRefusal] = useState<string | null>(null);

    const blockers = validation.data?.blockers ?? [];
    const capabilityBlocked = blockers.some((blocker) =>
        blockerNamesUnavailableCheck(blocker, validation.data?.checks ?? []),
    );
    const active = state?.active === true;
    // One encode runs for the whole service, so a video in another project can hold the
    // lock while this project stays fully editable. The stream says which video it is, and
    // reading it here turns a refused request into a disabled button with a reason.
    const elsewhere = useEncodeBlockedElsewhere(projectId, videoId);
    const canRun =
        state !== undefined &&
        state.next.length > 0 &&
        validation.data?.can_encode !== false &&
        !locked &&
        blockedReason === null &&
        !elsewhere;

    const run = () => {
        if (!canRun) {
            return;
        }
        setRefusal(null);
        start.mutate(videoId, {
            onError: (failure) => setRefusal(failure.message),
        });
    };

    // The video page's primary action answers the same chord as the queue's Run selected:
    // the selection here is the video the route names. A running encode keeps Stop on the
    // button, because the chord never means "stop".
    useShortcut("run", run, {
        enabled: !demo,
        when: () => !active && !isTextEntryTarget(document.activeElement) && !isModalOpen(),
    });

    const stop = () => {
        setRefusal(null);
        cancel.mutate(videoId, {
            onError: (failure) => setRefusal(failure.message),
        });
    };

    if (demo) {
        return null;
    }

    return (
        <>
            <TopBarActions>
                <RunControl
                    running={active}
                    pending={active ? cancel.isPending : start.isPending}
                    disabled={active ? false : !canRun}
                    disabledReason={
                        locked
                            ? lockedLabel
                            : blockedReason !== null
                              ? blockedReason
                              : validation.data?.can_encode === false
                                ? (blockers[0] ?? "This video cannot start yet.")
                                : elsewhere
                                  ? "Another video is encoding; only one encode runs at a time."
                                  : state !== undefined && state.next.length === 0
                                    ? "This video has no next sequence to run."
                                    : undefined
                    }
                    onStart={run}
                    onStop={stop}
                />
            </TopBarActions>
            {blockers.length === 0 ? null : (
                <div className="px-4 pt-3 sm:px-6">
                    <div className="m-0 max-w-[92ch] rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-ink">
                        <p className="m-0 font-medium">This video cannot start yet.</p>
                        <ul className="mt-1 mb-0 list-disc space-y-0.5 pl-5 text-ink-secondary">
                            {blockers.map((blocker) => (
                                <li key={blocker}>{blocker}</li>
                            ))}
                        </ul>
                        {capabilityBlocked ? (
                            <Link
                                to="/settings"
                                hash="dependencies"
                                className="mt-1.5 inline-block font-medium text-brand underline underline-offset-2"
                            >
                                Open Dependencies
                            </Link>
                        ) : null}
                    </div>
                </div>
            )}
            {refusal === null ? null : (
                <div className="px-4 pt-3 sm:px-6">
                    <InlineError className="m-0 max-w-[92ch]">{refusal}</InlineError>
                </div>
            )}
        </>
    );
}

/** A blocker that names a missing dependency can be acted on from Dependencies. */
function blockerNamesUnavailableCheck(blocker: string, checks: PreflightCheck[]): boolean {
    const text = blocker.toLowerCase();
    return checks.some((check) => {
        if (check.available) {
            return false;
        }
        const tool = (check.id.split(":").at(-1) ?? check.id).toLowerCase();
        return text.includes(check.label.toLowerCase()) || text.includes(tool);
    });
}
