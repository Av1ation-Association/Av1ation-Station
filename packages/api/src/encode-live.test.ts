import type { EncodeEvent } from "@av1ation/contracts";
import { describe, expect, it } from "vitest";

import { applyLive, liveKey, type LiveSnapshot } from "./encode-live";

function event(overrides: Partial<EncodeEvent> = {}): EncodeEvent {
    return {
        project_id: "p",
        video_id: "v",
        run_id: "run",
        seq: 1,
        at: "2026-01-01T00:00:00Z",
        kind: "progress",
        sequence: "SceneDetector",
        progress: 10,
        message: "line",
        ...overrides,
    };
}

function at(snapshot: LiveSnapshot, project = "p", video = "v") {
    return snapshot[liveKey(project, video)];
}

describe("applyLive", () => {
    it("measures frames per second and the ETA between two ticks", () => {
        let live = applyLive({}, event({ frames_processed: 100, frames_total: 600 }), 0);
        live = applyLive(live, event({ frames_processed: 200, frames_total: 600 }), 1_000);

        expect(at(live)?.fps).toBe(100);
        expect(at(live)?.fpsUnit).toBe("frames");
        expect(at(live)?.etaSeconds).toBe(4);
    });

    it("measures scenes per second when the sequence counts scenes", () => {
        let live = applyLive(
            {},
            event({
                sequence: "NoiseDetector",
                scenes_processed: 10,
                scenes_total: 50,
            }),
            0,
        );
        live = applyLive(
            live,
            event({
                sequence: "NoiseDetector",
                scenes_processed: 20,
                scenes_total: 50,
            }),
            2_000,
        );

        expect(at(live)?.fps).toBe(5);
        expect(at(live)?.fpsUnit).toBe("scenes");
        expect(at(live)?.etaSeconds).toBe(6);
    });

    it("measures sampled frames per second for Quality Check", () => {
        const quality = (frames: number, scenes: number) =>
            event({
                sequence: "QualityCheck",
                phase: "Quality",
                frames_processed: frames,
                frames_total: 500,
                scenes_processed: scenes,
                scenes_total: 10,
            });
        let live = applyLive({}, quality(100, 2), 0);
        live = applyLive(live, quality(200, 4), 1_000);

        expect(at(live)?.fps).toBe(100);
        expect(at(live)?.fpsUnit).toBe("frames");
        expect(at(live)?.etaSeconds).toBe(3);
        expect(at(live)?.scenesProcessed).toBe(4);
        expect(at(live)?.scenesTotal).toBe(10);
    });

    it("starts a new measurement when the pass or phase changes", () => {
        let live = applyLive(
            {},
            event({
                sequence: "TargetQuality",
                pass: 1,
                max_passes: 4,
                phase: "Encode",
                frames_processed: 100,
                frames_total: 400,
            }),
            0,
        );
        live = applyLive(
            live,
            event({
                sequence: "TargetQuality",
                pass: 1,
                max_passes: 4,
                phase: "Encode",
                frames_processed: 200,
                frames_total: 400,
            }),
            1_000,
        );
        expect(at(live)?.fps).toBe(100);

        // Comparing is a different stream: the previous pass's rate would be a lie.
        live = applyLive(
            live,
            event({
                sequence: "TargetQuality",
                pass: 1,
                max_passes: 4,
                phase: "Compare",
                frames_processed: 10,
                frames_total: 400,
            }),
            1_500,
        );
        expect(at(live)?.fps).toBeNull();
        expect(at(live)?.pass).toBe(1);
        expect(at(live)?.maxPasses).toBe(4);
    });

    it("keeps the last rate when a burst arrives inside the sample window", () => {
        let live = applyLive({}, event({ frames_processed: 100 }), 0);
        live = applyLive(live, event({ frames_processed: 200 }), 1_000);
        const measured = at(live)?.fps;
        live = applyLive(live, event({ frames_processed: 201 }), 1_050);
        expect(at(live)?.fps).toBe(measured);
    });

    it("keeps sampling when ticks arrive faster than the rate window", () => {
        // Scene Detector emits far more often than once a second. A sampler anchored to
        // "the last event" would keep moving its own clock and never measure anything; this
        // one measures between the window's ends, however many ticks fall inside it.
        let live = applyLive(
            {},
            event({
                kind: "started",
                progress: 0,
                frames_processed: 0,
                frames_total: 600,
            }),
            0,
        );
        for (let tick = 1; tick <= 12; tick += 1) {
            live = applyLive(
                live,
                event({
                    frames_processed: tick * 10,
                    frames_total: 600,
                    progress: tick * 2,
                }),
                tick * 100,
            );
        }

        expect(at(live)?.fps).toBeCloseTo(100);
        // The published reading landed at 110/600 frames, leaving 490 at 100 fps. The ETA
        // belongs to the reading, not to the tick that has not been measured yet.
        expect(at(live)?.etaSeconds).toBeCloseTo(4.9);
    });

    it("smooths a burst instead of reporting its delivery interval", () => {
        // A burst of two hundred frames can arrive in one SSE batch hundreds of
        // milliseconds after the previous one. Dividing that burst by the short delivery
        // interval is what made Scene Detector swing between 100 and 1,200 fps.
        let live = applyLive({}, event({ frames_processed: 0, frames_total: 2_000 }), 0);
        live = applyLive(live, event({ frames_processed: 100, frames_total: 2_000 }), 1_000);
        expect(at(live)?.fps).toBe(100);

        // The next window is 1.1 s and carries 200 frames, a 182 fps burst.
        live = applyLive(live, event({ frames_processed: 300, frames_total: 2_000 }), 2_100);
        const smoothed = at(live)?.fps ?? 0;
        expect(smoothed).toBeGreaterThan(100);
        expect(smoothed).toBeLessThan(182);

        // A following fast window must not jump back to the raw burst value.
        live = applyLive(live, event({ frames_processed: 500, frames_total: 2_000 }), 3_200);
        expect(at(live)?.fps ?? 0).toBeLessThan(190);
    });

    it("uses a scene checkpoint as the live scene tally", () => {
        let live = applyLive({}, event({ kind: "started" }), 0);
        live = applyLive(live, event({ scene_count: 4 }), 1_000);
        expect(at(live)?.scenesProcessed).toBe(4);
        expect(at(live)?.scenesTotal).toBeNull();

        // A later frame tick does not repeat the checkpoint's count; it must survive.
        live = applyLive(live, event({ frames_processed: 100 }), 2_000);
        expect(at(live)?.scenesProcessed).toBe(4);
    });

    it("a scene checkpoint does not replace the frame rate with a scene rate", () => {
        let live = applyLive({}, event({ frames_processed: 0, frames_total: 600 }), 0);
        live = applyLive(live, event({ frames_processed: 60, frames_total: 600 }), 1_000);
        const fps = at(live)?.fps;
        const eta = at(live)?.etaSeconds;

        live = applyLive(live, event({ scene_count: 4 }), 1_250);

        expect(at(live)?.fps).toBe(fps);
        expect(at(live)?.fpsUnit).toBe("frames");
        expect(at(live)?.etaSeconds).toBe(eta);
        expect(at(live)?.scenesProcessed).toBe(4);
    });

    it("clears a video when its run ends", () => {
        const live = applyLive({}, event({ frames_processed: 1 }), 0);
        expect(at(live)).toBeDefined();
        expect(applyLive(live, event({ kind: "finished" }), 100)).toEqual({});
    });

    it("ignores an event for another video's sequence", () => {
        const live = applyLive({}, event({ sequence: null }), 0);
        expect(at(live)).toBeUndefined();
    });

    it("publishes a steady rate from a bursty engine stream", () => {
        // The decoder hands the detector a batch of frames, then writes a checkpoint after
        // each scene. Ticks therefore arrive in clumps, and the instantaneous rate between
        // two of them says nothing about the machine. A real 60 s detection run at 30 fps
        // read 3.9-81.8 fps tick to tick; it must not read that to the user.
        let live = applyLive(
            {},
            event({ kind: "started", frames_processed: 0, frames_total: 1_200 }),
            0,
        );
        const published: number[] = [];
        for (let now = 0; now <= 30_000; now += 120) {
            // One burst per 1.2 s of work, plus a checkpoint write that stalls a queue.
            const stalled = now % 3_000 < 240;
            const frames = stalled ? null : Math.round((now / 1_000) * 30);
            if (frames === null) {
                live = applyLive(live, event({ scene_count: Math.floor(now / 3_000) }), now);
            } else {
                live = applyLive(
                    live,
                    event({
                        frames_processed: frames,
                        frames_total: 1_200,
                        progress: (frames / 1_200) * 100,
                    }),
                    now,
                );
            }
            const fps = at(live)?.fps;
            if (fps !== null && fps !== undefined) {
                published.push(fps);
            }
        }
        expect(published.length).toBeGreaterThan(20);
        // The first reading is still one window wide; everything after covers four seconds.
        const settled = published.slice(1);
        expect(Math.min(...settled)).toBeGreaterThan(24);
        expect(Math.max(...settled)).toBeLessThan(36);
    });

    it("keeps the rate window when a worker moves to its next scene", () => {
        const worker = (frames: number, scene: number, progress: number) =>
            event({
                sequence: "ParallelEncoder",
                frames_processed: frames,
                phase: String(scene + 1),
                scene_index: scene,
                scene_progress: progress,
            });
        let live = applyLive({}, worker(100, 2, 20), 0);
        live = applyLive(live, worker(200, 2, 80), 1_000);
        const fps = at(live)?.fps;
        expect(fps).toBe(100);

        // Worker 3 finished and worker 4 took its own scene; the aggregate counter and the
        // rate it implies are continuous, so the phase change is not a new measurement.
        live = applyLive(live, worker(260, 3, 10), 1_200);
        expect(at(live)?.fps).toBe(fps);
        expect(at(live)?.sceneIndex).toBe(3);
    });

    it("keeps the rate window across an aggregate-only tick", () => {
        // Parallel Encoder alternates a worker tick with the sequence-wide one, which names
        // no scene, no phase and no pass. Treating that tick as a new step threw away the
        // window every time a worker reported, so the page mostly showed no FPS or ETA.
        const worker = (frames: number, scene: number) =>
            event({
                sequence: "ParallelEncoder",
                frames_processed: frames,
                frames_total: 4_000,
                phase: String(scene),
                pass: 1,
                max_passes: 1,
                scene_index: scene,
                scene_progress: 30,
            });
        const aggregate = (frames: number) =>
            event({
                sequence: "ParallelEncoder",
                frames_processed: frames,
                frames_total: 4_000,
            });

        let live = applyLive({}, worker(100, 2), 0);
        live = applyLive(live, aggregate(110), 200);
        live = applyLive(live, worker(200, 2), 1_000);
        const fps = at(live)?.fps;
        expect(fps).toBe(100);
        expect(at(live)?.sceneIndex).toBe(2);

        live = applyLive(live, aggregate(210), 1_200);
        expect(at(live)?.fps).toBe(fps);
        expect(at(live)?.samples?.length).toBeGreaterThan(0);
    });

    it("measures each worker's own scene, not the aggregate", () => {
        const worker = (
            at: number,
            scene: number,
            frames: number,
            total: number,
            aggregateFrames: number,
        ) =>
            event({
                sequence: "ParallelEncoder",
                frames_processed: aggregateFrames,
                frames_total: 40_000,
                phase: String(scene),
                pass: 1,
                max_passes: 1,
                scene_index: scene,
                scene_progress: (frames / total) * 100,
                scene_frames_processed: frames,
                scene_frames_total: total,
            });

        // Two workers on two scenes; the aggregate counter runs ahead of both.
        let live = applyLive({}, worker(40, 96, 0, 120, 4_000), 0);
        live = applyLive(live, worker(40, 97, 30, 90, 4_030), 0);
        live = applyLive(live, worker(1_000, 96, 40, 120, 5_040), 1_000);
        live = applyLive(live, worker(1_000, 97, 70, 90, 5_070), 1_000);

        const workers = at(live)?.workers ?? [];
        expect(workers.map((entry) => entry.sceneIndex)).toEqual([96, 97]);
        // Scene 96: 40 frames of 120 in the first second, so 40 fps and 2 s left.
        expect(workers[0]?.fps).toBe(40);
        expect(workers[0]?.etaSeconds).toBe(2);
        expect(workers[0]?.framesProcessed).toBe(40);
        expect(workers[0]?.elapsedSeconds).toBe(1);
        // Scene 97: 40 frames of 90 in the same second.
        expect(workers[1]?.fps).toBe(40);
        expect(workers[1]?.etaSeconds).toBe(0.5);
    });

    it("keeps each worker's pass on that worker and leaves the aggregate rate alone", () => {
        const worker = (scene: number, pass: number, frames: number) =>
            event({
                sequence: "ParallelEncoder",
                frames_processed: 1_000 + frames,
                frames_total: 40_000,
                phase: String(scene),
                pass,
                max_passes: 2,
                scene_index: scene,
                scene_progress: (frames / 200) * 100,
                scene_frames_processed: frames,
                scene_frames_total: 200,
            });

        let live = applyLive({}, worker(10, 1, 0), 0);
        live = applyLive(live, worker(11, 1, 0), 0);
        live = applyLive(live, worker(10, 1, 100), 1_000);
        live = applyLive(live, worker(11, 1, 100), 1_000);
        const fps = at(live)?.fps;
        expect(fps).toBe(100);

        // One worker entering pass 2 is that scene's own restart. The whole encode keeps
        // its rate, because the other workers are still finishing pass 1.
        live = applyLive(live, worker(10, 2, 5), 1_200);
        expect(at(live)?.fps).toBe(fps);
        const workers = at(live)?.workers ?? [];
        expect(workers.find((entry) => entry.sceneIndex === 10)?.pass).toBe(2);
        expect(workers.find((entry) => entry.sceneIndex === 11)?.pass).toBe(1);
    });

    it("drops a worker when its scene finishes", () => {
        const worker = (scene: number, frames: number) =>
            event({
                sequence: "ParallelEncoder",
                frames_processed: 500 + frames,
                frames_total: 40_000,
                phase: String(scene),
                scene_index: scene,
                scene_progress: (frames / 60) * 100,
                scene_frames_processed: frames,
                scene_frames_total: 60,
            });
        let live = applyLive({}, worker(12, 10), 0);
        live = applyLive(live, worker(15, 5), 0);
        expect(at(live)?.workers?.length).toBe(2);

        // The engine reports a finished scene with no percentage and no frames.
        live = applyLive(
            live,
            event({
                sequence: "ParallelEncoder",
                frames_processed: 560,
                frames_total: 40_000,
                scene_index: 12,
            }),
            1_000,
        );

        expect(at(live)?.workers?.map((entry) => entry.sceneIndex)).toEqual([15]);
    });

    it("starts a fresh window when a worker takes the next scene", () => {
        const worker = (scene: number, frames: number) =>
            event({
                sequence: "ParallelEncoder",
                frames_processed: 1_000 + frames,
                frames_total: 40_000,
                phase: String(scene),
                scene_index: scene,
                scene_progress: (frames / 200) * 100,
                scene_frames_processed: frames,
                scene_frames_total: 200,
            });
        let live = applyLive({}, worker(4, 0), 0);
        live = applyLive(live, worker(4, 100), 1_000);
        expect(at(live)?.workers?.[0]?.fps).toBe(100);

        // Worker moves on: the final status clears scene 4, and scene 5's frames start
        // over, so its own rate cannot inherit the previous scene's.
        live = applyLive(
            live,
            event({
                sequence: "ParallelEncoder",
                frames_processed: 1_100,
                frames_total: 40_000,
                scene_index: 4,
            }),
            1_100,
        );
        live = applyLive(live, worker(5, 5), 1_200);
        const workers = at(live)?.workers ?? [];
        expect(workers.map((entry) => entry.sceneIndex)).toEqual([5]);
        expect(workers[0]?.fps).toBeNull();
        expect(workers[0]?.elapsedSeconds).toBe(0);
    });
});
