import { describe, expect, it } from "vitest";

import type { VideoState } from "@av1ation/contracts";

import { videoStatus } from "./video-status";

function state(overrides: Partial<VideoState> = {}): VideoState {
    return {
        video_id: "video-1",
        scene_count: 4,
        sequences: [
            {
                id: "ParallelEncoder",
                name: "Parallel Encoder",
                status: "active",
                runnable: true,
                progress: 37.5,
            },
        ],
        next: ["ParallelEncoder"],
        active: true,
        run_id: "run-1",
        failure: null,
        output_exists: false,
        retained_bytes: 0,
        script_data: [],
        ...overrides,
    };
}

describe("videoStatus", () => {
    it("shows the active sequence's percentage from the generated snake_case status", () => {
        expect(videoStatus(state())).toMatchObject({
            label: "Encoding 38%",
            tone: "info",
            progress: 37.5,
            progressLabel: "Encoding progress",
        });
    });

    it("reports a run that failed before any sequence started", () => {
        expect(
            videoStatus(
                state({
                    active: false,
                    run_id: null,
                    failure: {
                        message: "the input could not be opened",
                        at: "2026-11-02T00:00:00Z",
                        run_id: "run-1",
                        sequence: null,
                    },
                }),
            ),
        ).toMatchObject({ label: "Failed", tone: "danger", progress: null });
    });

    it("names the stage a partial scene list stopped in, with the fraction it reached", () => {
        expect(
            videoStatus(
                state({
                    active: false,
                    run_id: null,
                    sequences: [
                        {
                            id: "SceneDetector",
                            name: "Scene Detector",
                            status: "incomplete",
                            runnable: true,
                            progress: 37,
                        },
                    ],
                    next: ["SceneDetector", "ParallelEncoder"],
                }),
            ),
        ).toMatchObject({
            label: "Scene Detection incomplete",
            tone: "warning",
            progress: 37,
            progressLabel: "Scene Detection progress",
        });
    });

    it("keeps an incomplete detection out of the not-started branch", () => {
        expect(
            videoStatus(
                state({
                    active: false,
                    run_id: null,
                    scene_count: 0,
                    sequences: [
                        {
                            id: "SceneDetector",
                            name: "Scene Detector",
                            status: "incomplete",
                            runnable: true,
                            progress: 12,
                        },
                    ],
                    next: ["SceneDetector"],
                }),
            ),
        ).toMatchObject({ label: "Scene Detection incomplete", progress: 12 });
    });

    it("reports an encode that has not measured a sequence yet", () => {
        expect(
            videoStatus(
                state({
                    sequences: [
                        {
                            id: "ParallelEncoder",
                            name: "Parallel Encoder",
                            status: "active",
                            runnable: true,
                        },
                    ],
                }),
            ),
        ).toMatchObject({ label: "Encoding", progress: null });
    });
});
