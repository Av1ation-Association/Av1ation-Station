import type { EncodeEvent, SceneList } from "@av1ation/contracts";

/**
 * The scores a live Quality Check run has reported, per video and scene.
 *
 * The scene table is the only source the measured-data chart reads. Quality Check writes its
 * scores to the checkpoint only at the end of the sequence, so a page opened mid-run has
 * missed both the events and the durable rows. Keeping the reported values here lets the next
 * table read fill them in; the service's own read catches up when the checkpoint lands.
 */
const measurements = new Map<string, Map<number, number>>();

/** One video's tally is keyed by both ids, so two videos can never share scenes. */
export function liveQualityKey(projectId: string, videoId: string): string {
    return `${projectId}\u0000${videoId}`;
}

/**
 * Apply one run event to the tally.
 *
 * A new Quality Check run replaces the previous run's values, and a terminal event discards
 * them because the checkpoint then holds the same scores. Other sequences' events leave the
 * tally alone.
 */
export function trackLiveQuality(event: EncodeEvent): void {
    const key = liveQualityKey(event.project_id, event.video_id);
    if (event.kind === "cancelled" || event.kind === "finished" || event.kind === "failed") {
        clearLiveQuality(key);
        return;
    }
    if (event.kind === "started" && event.sequence === "QualityCheck") {
        clearLiveQuality(key);
        return;
    }
    if (
        event.scene_index !== undefined &&
        event.scene_index !== null &&
        event.scene_quality !== undefined &&
        event.scene_quality !== null
    ) {
        recordLiveQuality(key, event.scene_index, event.scene_quality);
    }
}

export function recordLiveQuality(key: string, index: number, score: number): void {
    const values = measurements.get(key) ?? new Map<number, number>();
    values.set(index, score);
    measurements.set(key, values);
}

export function clearLiveQuality(key: string): void {
    measurements.delete(key);
}

/**
 * Fill a table read with the scores it does not already carry.
 *
 * A row that already holds a different value is updated: a live score is the newer of the
 * two. A row the table does not have is left alone, because the tally names scenes of the
 * checkpoint this read was derived from.
 */
export function withLiveQuality(list: SceneList, key: string): SceneList {
    const values = measurements.get(key);
    if (values === undefined || values.size === 0) {
        return list;
    }
    let scenes = list.scenes;
    for (const [index, quality] of values) {
        const scene = scenes[index];
        if (scene === undefined || scene.quality_score === quality) {
            continue;
        }
        if (scenes === list.scenes) {
            scenes = [...list.scenes];
        }
        scenes[index] = { ...scene, quality_score: quality };
    }
    return scenes === list.scenes ? list : { ...list, scenes };
}
