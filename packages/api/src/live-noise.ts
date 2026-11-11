import type { EncodeEvent, SceneList } from "@av1ation/contracts";

/**
 * The measurements a live Noise Detector run has reported, per video and scene.
 *
 * The scene table is the only source the measured-data charts read, and a page opened
 * mid-run has already missed the events that carried the earlier values. The service keeps
 * its own tally and overlays it on the table it serves, but a read can still land ahead of
 * that tally, and the events that would have filled the gap are gone. Keeping the values
 * here means whichever table read comes next still shows everything the run has measured.
 *
 * This is live execution state, not persistence: a new Noise Detector run replaces it and a
 * terminal event discards it, because the checkpoint then holds the same measurements.
 */
const measurements = new Map<string, Map<number, number>>();

/** One video's tally is keyed by both ids, so two videos can never share scenes. */
export function liveNoiseKey(projectId: string, videoId: string): string {
    return `${projectId}\u0000${videoId}`;
}

/**
 * Apply one run event to the tally.
 *
 * A measurement is kept, a new Noise Detector run replaces the previous run's values, and a
 * terminal event discards them because the checkpoint then holds the same measurements. One
 * function owns those boundaries so the shell cannot clear on one path and forget another.
 */
export function trackLiveNoise(event: EncodeEvent): void {
    const key = liveNoiseKey(event.project_id, event.video_id);
    if (event.kind === "cancelled" || event.kind === "finished" || event.kind === "failed") {
        clearLiveNoise(key);
        return;
    }
    if (event.kind === "started" && event.sequence === "NoiseDetector") {
        clearLiveNoise(key);
        return;
    }
    if (
        event.scene_index !== undefined &&
        event.scene_index !== null &&
        event.scene_noise !== undefined &&
        event.scene_noise !== null
    ) {
        recordLiveNoise(key, event.scene_index, event.scene_noise);
    }
}

export function recordLiveNoise(key: string, index: number, noise: number): void {
    const values = measurements.get(key) ?? new Map<number, number>();
    values.set(index, noise);
    measurements.set(key, values);
}

export function clearLiveNoise(key: string): void {
    measurements.delete(key);
}

/**
 * Fill a table read with the live values it does not already carry.
 *
 * A row that already holds a different value is updated: a live measurement is the newer
 * of the two. A row the table does not have is left alone, because the tally names scenes
 * of the checkpoint this read was derived from.
 */
export function withLiveNoise(list: SceneList, key: string): SceneList {
    const values = measurements.get(key);
    if (values === undefined || values.size === 0) {
        return list;
    }
    let scenes = list.scenes;
    for (const [index, noise] of values) {
        const scene = scenes[index];
        if (scene === undefined || scene.noise === noise) {
            continue;
        }
        if (scenes === list.scenes) {
            scenes = [...list.scenes];
        }
        scenes[index] = { ...scene, noise };
    }
    return scenes === list.scenes ? list : { ...list, scenes };
}
