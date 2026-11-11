import { useState } from "react";

import {
    useCancelVideoEncode,
    useEncodeBlockedElsewhere,
    useStartVideoEncode,
} from "@av1ation/api";
import type { VideoState } from "@av1ation/contracts";

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
    const start = useStartVideoEncode(projectId);
    const cancel = useCancelVideoEncode(projectId);
    const [refusal, setRefusal] = useState<string | null>(null);

    const active = state?.active === true;
    // One encode runs for the whole service, so a video in another project can hold the
    // lock while this project stays fully editable. The stream says which video it is, and
    // reading it here turns a refused request into a disabled button with a reason.
    const elsewhere = useEncodeBlockedElsewhere(projectId, videoId);
    const canRun =
        state !== undefined &&
        state.next.length > 0 &&
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
        when: () => !active && !isTextEntryTarget(document.activeElement) && !isModalOpen(),
    });

    const stop = () => {
        setRefusal(null);
        cancel.mutate(videoId, {
            onError: (failure) => setRefusal(failure.message),
        });
    };

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
            {refusal === null ? null : (
                <div className="px-4 pt-3 sm:px-6">
                    <InlineError className="m-0 max-w-[92ch]">{refusal}</InlineError>
                </div>
            )}
        </>
    );
}
