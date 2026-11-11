import { useSequenceLive } from "@av1ation/api";

import { liveSummary } from "../../shared/model/sequence-live";

/**
 * The one live sentence the Scenes page needs, mounted as its own leaf.
 *
 * Reading the shell's live snapshot here instead of in `ScenesScreen` keeps a per-frame
 * progress tick from re-rendering the scene rail, the timeline, and the player. The page
 * still re-renders when a checkpoint adds a row, but not sixty times a second.
 */
export function DetectionLiveDetail({
    projectId,
    videoId,
    fallback,
    prefix = "",
}: {
    projectId: string;
    videoId: string;
    fallback: string | null;
    prefix?: string | undefined;
}) {
    const live = useSequenceLive(projectId, videoId);
    const detectionLive = live !== null && live.sequence === "SceneDetector" ? live : null;
    const detail = liveSummary(detectionLive) ?? fallback;
    return detail === null ? null : (
        <>
            {prefix}
            {detail}
        </>
    );
}
