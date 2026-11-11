import { describe, expect, it } from "vitest";

import type { SequenceState, VideoState } from "@av1ation/contracts";

import { videoTimeline } from "./video-timeline";

function sequence(overrides: Partial<SequenceState> & { id: string }): SequenceState {
    return {
        name: overrides.id,
        status: "never_run",
        runnable: false,
        ...overrides,
    };
}

function state(overrides: Partial<VideoState> = {}): VideoState {
    return {
        video_id: "video-1",
        scene_count: 4,
        sequences: [],
        next: [],
        active: false,
        run_id: null,
        failure: null,
        output_exists: false,
        retained_bytes: 0,
        script_data: [],
        ...overrides,
    };
}

describe("videoTimeline", () => {
    it("groups the server's sequences into pipeline phases in run order", () => {
        const timeline = videoTimeline(
            state({
                sequences: [
                    sequence({
                        id: "SceneDetector",
                        name: "Scene Detector",
                        status: "complete",
                    }),
                    sequence({
                        id: "NoiseDetector",
                        name: "Noise Detector",
                        status: "complete",
                    }),
                    sequence({
                        id: "NoiseScaler",
                        name: "Noise Scaler",
                        status: "never_run",
                    }),
                    sequence({
                        id: "TargetQuality",
                        name: "Target Quality",
                        status: "never_run",
                    }),
                    sequence({
                        id: "ParallelEncoder",
                        name: "Parallel Encoder",
                        status: "never_run",
                    }),
                    sequence({
                        id: "SceneConcatenator",
                        name: "Scene Concatenator",
                        status: "never_run",
                    }),
                    sequence({
                        id: "QualityCheck",
                        name: "Quality Check",
                        status: "never_run",
                    }),
                ],
            }),
        );

        expect(timeline.phases.map((phase) => phase.label)).toEqual([
            "Detect",
            "Measure",
            "Score",
            "Encode",
            "Finalise",
            "Verify",
        ]);
        expect(timeline.phases[1]?.steps.map((step) => step.name)).toEqual([
            "Noise Detector",
            "Noise Scaler",
        ]);
    });

    it("labels a resumable scene prefix as resume, not done", () => {
        const timeline = videoTimeline(
            state({
                scene_count: 12,
                sequences: [
                    sequence({
                        id: "SceneDetector",
                        name: "Scene Detector",
                        status: "incomplete",
                        runnable: true,
                        detail: "32.4%, 12 found",
                    }),
                ],
                next: ["SceneDetector"],
            }),
        );

        const detector = timeline.phases[0]?.steps[0];
        expect(detector?.label).toBe("Incomplete");
        expect(detector?.detail).toBe("32.4%, 12 found");
    });

    it("keeps an unknown sequence visible instead of dropping it", () => {
        const timeline = videoTimeline(
            state({
                sequences: [sequence({ id: "Benchmarker", name: "Benchmarker" })],
            }),
        );

        expect(timeline.phases.map((phase) => phase.label)).toEqual(["Other"]);
        expect(timeline.phases[0]?.steps[0]?.label).toBe("Not run");
    });

    it("reports the active sequence and its live percentage", () => {
        const timeline = videoTimeline(
            state({
                active: true,
                run_id: "run-1",
                sequences: [
                    sequence({
                        id: "SceneDetector",
                        name: "Scene Detector",
                        status: "complete",
                    }),
                    sequence({
                        id: "ParallelEncoder",
                        name: "Parallel Encoder",
                        status: "active",
                        runnable: true,
                        progress: 37.5,
                        detail: "18/48 scenes encoded",
                    }),
                ],
                next: ["ParallelEncoder"],
            }),
        );

        const encoder = timeline.phases[1]?.steps[0];
        expect(encoder?.label).toBe("Running 38%");
        expect(encoder?.detail).toBe("18/48 scenes encoded");
        expect(timeline.summary).toEqual({
            tone: "running",
            label: "Running now",
            detail: "Parallel Encoder · 38%",
        });
    });

    it("marks the runnable sequences as ready and names them as the next action", () => {
        const timeline = videoTimeline(
            state({
                sequences: [
                    sequence({
                        id: "SceneDetector",
                        name: "Scene Detector",
                        status: "complete",
                    }),
                    sequence({
                        id: "NoiseDetector",
                        name: "Noise Detector",
                        status: "never_run",
                        runnable: true,
                    }),
                    sequence({
                        id: "TargetQuality",
                        name: "Target Quality",
                        status: "never_run",
                        runnable: true,
                    }),
                ],
                next: ["NoiseDetector", "TargetQuality"],
            }),
        );

        expect(timeline.phases.flatMap((phase) => phase.steps.map((step) => step.label))).toEqual([
            "Done",
            "Ready",
            "Ready",
        ]);
        expect(timeline.summary).toEqual({
            tone: "next",
            label: "Next",
            detail: "Noise Detector · Target Quality",
        });
    });

    it("reports a finished chain from the derived statuses, not from a stored phase", () => {
        const timeline = videoTimeline(
            state({
                output_exists: true,
                sequences: [
                    sequence({
                        id: "SceneDetector",
                        name: "Scene Detector",
                        status: "complete",
                    }),
                    sequence({
                        id: "ParallelEncoder",
                        name: "Parallel Encoder",
                        status: "complete",
                    }),
                    sequence({
                        id: "SceneConcatenator",
                        name: "Scene Concatenator",
                        status: "complete",
                    }),
                ],
            }),
        );

        expect(timeline.summary).toEqual({
            tone: "done",
            label: "Finished",
            detail: "Every sequence has completed and the output is written.",
        });
    });

    it("names the sequence that is waiting for earlier evidence", () => {
        // A noise scaler enabled without a noise detector can never become runnable, and
        // scene detection is already complete, so the server offers no next sequence.
        const timeline = videoTimeline(
            state({
                sequences: [
                    sequence({
                        id: "SceneDetector",
                        name: "Scene Detector",
                        status: "complete",
                    }),
                    sequence({ id: "NoiseScaler", name: "Noise Scaler" }),
                ],
            }),
        );

        expect(timeline.summary).toEqual({
            tone: "blocked",
            label: "Waiting",
            detail: "Noise Scaler needs an earlier sequence first.",
        });
    });
});
