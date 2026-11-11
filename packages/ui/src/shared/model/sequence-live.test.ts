import type { SequenceLive, WorkerLive } from "@av1ation/api";
import { describe, expect, it } from "vitest";

import { liveSummary, liveWorkerLine } from "./sequence-live";

function worker(overrides: Partial<WorkerLive> = {}): WorkerLive {
    return {
        sceneIndex: 31,
        pass: null,
        progress: 31.73,
        framesProcessed: 32,
        framesTotal: 102,
        fps: 3.39,
        fpsUnit: "frames",
        etaSeconds: 266,
        elapsedSeconds: 48.9,
        measuredAt: 0,
        ...overrides,
    };
}

function sequence(overrides: Partial<SequenceLive> = {}): SequenceLive {
    return {
        sequence: "TargetQuality",
        progress: 84.63,
        phase: "Encode",
        pass: 3,
        maxPasses: 8,
        framesProcessed: 13_438,
        framesTotal: 16_500,
        scenesProcessed: 53,
        scenesTotal: 81,
        sceneIndex: null,
        sceneProgress: null,
        fps: 6.54,
        fpsUnit: "frames",
        etaSeconds: 468,
        measuredAt: 0,
        ...overrides,
    };
}

describe("liveSummary", () => {
    it("names the current pass without pretending the ceiling is a total", () => {
        // Target Quality can finish in one pass; the configured maximum is not a total, so
        // `Pass 3/8` would claim a run length the engine has not promised.
        expect(liveSummary(sequence())).toBe(
            "Pass 3 · Encode · 53/81 scenes (13438/16500 frames) · 84.63% · 6.54 FPS · ETA 7:48",
        );
    });

    it("reports the step's own percentage, not a share of every pass", () => {
        // A pass fills the bar twice: encoding, then comparing. Both report 0-100.
        const comparing = sequence({ phase: "Compare", progress: 20 });
        expect(liveSummary(comparing)).toContain("20.00%");
        expect(liveSummary(comparing)).not.toContain("Pass 3/8");
    });

    it("leaves the pass to the worker lines under a parallel encode", () => {
        // Every worker holds a scene from the same pass, so the aggregate row would repeat
        // one number for the whole run while the scenes are what the reader is watching.
        const parallel = sequence({
            sequence: "ParallelEncoder",
            phase: null,
            pass: 1,
            sceneIndex: null,
            sceneProgress: null,
        });
        expect(liveSummary(parallel)).not.toContain("Pass");
    });

    it("names Quality Check's scored frames and scenes as sampled", () => {
        const quality = sequence({
            sequence: "QualityCheck",
            phase: "Quality",
            pass: null,
            progress: 24,
            framesProcessed: 120,
            framesTotal: 500,
            scenesProcessed: 2,
            scenesTotal: 10,
            fps: 8,
            etaSeconds: 47.5,
        });
        expect(liveSummary(quality)).toBe(
            "Quality · 2/10 scenes (120/500 sampled frames) · 24.00% · 8.00 sampled FPS · ETA 0:48",
        );
    });
});

describe("liveWorkerLine", () => {
    it("names the scene with its own progress, rate and finish estimate", () => {
        expect(liveWorkerLine(worker())).toBe(
            "Scene 32: 31.73% (32/102 frames) in 48.9s · 3.39 FPS · ETA 4:26",
        );
    });

    it("names the worker's own pass, not another worker's", () => {
        expect(liveWorkerLine(worker({ pass: 1 }))).toBe(
            "Pass 1 · Scene 32: 31.73% (32/102 frames) in 48.9s · 3.39 FPS · ETA 4:26",
        );
        expect(liveWorkerLine(worker({ pass: 2 }))).toBe(
            "Pass 2 · Scene 32: 31.73% (32/102 frames) in 48.9s · 3.39 FPS · ETA 4:26",
        );
    });

    it("omits the rate until the worker has measured one", () => {
        expect(liveWorkerLine(worker({ fps: null, fpsUnit: null, etaSeconds: null }))).toBe(
            "Scene 32: 31.73% (32/102 frames) in 48.9s",
        );
    });

    it("keeps the percentage when the scene's length is unknown", () => {
        expect(
            liveWorkerLine(
                worker({
                    progress: 12.5,
                    framesProcessed: 15,
                    framesTotal: null,
                    elapsedSeconds: 120,
                }),
            ),
        ).toBe("Scene 32: 12.50% in 2m 00s · 3.39 FPS · ETA 4:26");
    });

    it("does not invent a percentage the worker has not reported", () => {
        expect(liveWorkerLine(worker({ progress: null, elapsedSeconds: null }))).toBe(
            "Scene 32: (32/102 frames) · 3.39 FPS · ETA 4:26",
        );
    });
});
