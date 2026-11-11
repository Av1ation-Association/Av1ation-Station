import type {
    EncodeEvent,
    SceneList,
    SceneView,
    SequenceState,
    VideoState,
} from "@av1ation/contracts";

const ACTIVE = "active" as const;
const COMPLETE = "complete" as const;
const NEVER_RUN = "never_run" as const;
const FAILED = "failed" as const;

/**
 * Splice one detection checkpoint into the cached scene table.
 *
 * A checkpoint appends exactly one row, and the engine emits it after the save succeeded.
 * The row is the same shape the table read serves, so it is inserted rather than merged into
 * a second model. `null` means the cached table has a gap — the read is still in flight, or
 * a checkpoint was missed — and only a fresh table read can repair it.
 */
export function appendSceneCheckpoint(list: SceneList, scene: SceneView): SceneList | null {
    if (scene.index > list.scenes.length) {
        return null;
    }
    const scenes = [...list.scenes];
    if (scene.index === scenes.length) {
        scenes.push(scene);
    } else {
        scenes[scene.index] = scene;
    }
    return {
        ...list,
        total_frames: Math.max(list.total_frames, scene.end_frame),
        scenes,
    };
}

/**
 * Apply one live measurement to the scene it belongs to.
 *
 * Noise Detector measures a scene at a time and the engine reports each value as it is
 * produced; the measured-data charts and their statistics read this same table, so patching
 * the row is what makes them fill while the run is still going. A row that is not cached yet
 * is left alone — the table read that is already in flight will carry the value.
 */
export function applySceneNoise(list: SceneList, index: number, noise: number): SceneList {
    const scene = list.scenes[index];
    if (scene === undefined || scene.noise === noise) {
        return list;
    }
    const scenes = [...list.scenes];
    scenes[index] = { ...scene, noise };
    return { ...list, scenes };
}

/**
 * Apply one finished chunk to the scene it belongs to.
 *
 * Parallel Encoder checkpoints a scene as soon as its chunk is written, and the event
 * carries the size and wall clock that checkpoint recorded. The rail's encoded marker and
 * the Encoding chart's per-scene figures are derived from this same row, so patching it is
 * what makes them move while the other workers still run. A row that is not cached yet is
 * left alone: the chunk is on disk before the event is emitted, so the table read already
 * in flight carries the same values.
 */
/**
 * Apply one live Quality Check score to the scene it belongs to.
 *
 * Quality Check scores a scene at a time and the engine reports each score as it is
 * produced. The score chart and its statistics read the scene table's `quality_score`, so
 * patching the row is what makes them fill while the run is still going. A row that is not
 * cached yet is left alone — the table read already in flight carries the value.
 */
export function applySceneQuality(list: SceneList, index: number, score: number): SceneList {
    const scene = list.scenes[index];
    if (scene === undefined || scene.quality_score === score) {
        return list;
    }
    const scenes = [...list.scenes];
    scenes[index] = { ...scene, quality_score: score };
    return { ...list, scenes };
}

export function applySceneChunk(
    list: SceneList,
    index: number,
    bytes: number,
    encodeMs: number | null,
): SceneList {
    const scene = list.scenes[index];
    if (scene === undefined) {
        return list;
    }
    // A reported duration of zero is a missing measurement, not an instant encode; keep the
    // duration the row already knows rather than replacing it with a meaningless one.
    const duration = encodeMs !== null && encodeMs > 0 ? encodeMs : (scene.encode_ms ?? null);
    if (scene.encoded && scene.chunk_bytes === bytes && (scene.encode_ms ?? null) === duration) {
        return list;
    }
    const scenes = [...list.scenes];
    scenes[index] = {
        ...scene,
        encoded: true,
        chunk_bytes: bytes,
        encode_ms: duration,
    };
    return { ...list, scenes };
}

/**
 * Whether an event begins a Target Quality pass the client has not seen yet.
 *
 * Target Quality checkpoints once per pass, so a finished pass is on disk while the next one
 * encodes. The scene table is the only source the pass charts read, and no other event
 * refreshes it during a run; without this the chart would keep the previous run's passes
 * until the sequence ended. The map keeps the last pass seen per video, so a tick inside a
 * pass does nothing and one refresh per pass is requested.
 */
export function takesNewPass(
    seen: Map<string, number>,
    key: string,
    pass: number | null | undefined,
): boolean {
    if (pass === undefined || pass === null) {
        return false;
    }
    if (seen.get(key) === pass) {
        return false;
    }
    seen.set(key, pass);
    return true;
}

/**
 * A sequence's runnability is derived on the server, so the event reducer must not invent
 * prerequisites. It only recomputes the server's own rule: runnable and not complete.
 */
function nextSequences(sequences: SequenceState[]): string[] {
    return sequences
        .filter((sequence) => sequence.runnable && sequence.status !== COMPLETE)
        .map((sequence) => sequence.id);
}

/**
 * Apply one encode event to a video's derived state.
 *
 * This is a reducer, not a second state machine. Status and progress come straight from the
 * event; the server still owns scene counts, chunk counts, output existence, and runnability,
 * which the writer refreshes on each transition. Events for another video leave the state
 * untouched.
 */
export function applyEncodeEvent(state: VideoState, event: EncodeEvent): VideoState {
    if (event.video_id !== state.video_id) {
        return state;
    }

    const sceneCount = event.scene_count ?? state.scene_count;

    if (event.kind === "cancelled" || event.kind === "finished" || event.kind === "failed") {
        const sequences = state.sequences.map((sequence) => {
            if (sequence.status !== ACTIVE) {
                return sequence;
            }
            return {
                ...sequence,
                status: event.kind === "failed" ? FAILED : NEVER_RUN,
                progress: null,
            };
        });
        return {
            ...state,
            scene_count: sceneCount,
            active: false,
            run_id: null,
            // A failure can happen before any sequence starts, so the reason cannot live
            // on a sequence row. The terminal event carries it; the server records it in
            // the timeline for the next reload.
            failure:
                event.kind === "failed"
                    ? {
                          message: event.message,
                          at: event.at,
                          run_id: event.run_id,
                      }
                    : null,
            sequences,
            next: nextSequences(sequences),
        };
    }

    const sequenceId = event.sequence ?? null;
    let sequences = state.sequences;
    if (sequenceId !== null) {
        if (event.kind === "completed") {
            sequences = state.sequences.map((sequence) =>
                sequence.id === sequenceId
                    ? {
                          ...sequence,
                          status: COMPLETE,
                          progress: 100,
                          runnable: true,
                      }
                    : sequence,
            );
        } else {
            // A started or progress event for a sequence means any previous Active sequence
            // already finished; leaving two Active rows would make the status chip lie.
            sequences = state.sequences.map((sequence) => {
                if (sequence.id === sequenceId) {
                    return {
                        ...sequence,
                        status: ACTIVE,
                        // A sequence emits progress from several stages. Preparation can
                        // report its own percentage before processing starts, so never let a
                        // later tick move the bar backwards; `started` is the one reset.
                        progress:
                            event.kind === "started"
                                ? 0
                                : event.progress === undefined || event.progress === null
                                  ? (sequence.progress ?? null)
                                  : Math.max(event.progress, sequence.progress ?? 0),
                        runnable: true,
                    };
                }
                if (sequence.status === ACTIVE) {
                    return { ...sequence, status: COMPLETE, progress: 100 };
                }
                return sequence;
            });
        }
    }

    return {
        ...state,
        scene_count: sceneCount,
        active: true,
        run_id: event.run_id,
        // A live run supersedes the previous run's failure, even if that failure had no
        // sequence to attach to.
        failure: null,
        sequences,
        next: nextSequences(sequences),
    };
}
