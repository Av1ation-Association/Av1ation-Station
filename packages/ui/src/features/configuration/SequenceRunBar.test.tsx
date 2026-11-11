// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SequenceLive } from "@av1ation/api";
import type { TimelineRecord, VideoFailure } from "@av1ation/contracts";

import { historyRuns } from "../../shared/model/history-model";
import type { TimelineStep } from "../../shared/model/video-timeline";

import { SequenceRunBar } from "./SequenceRunBar";

afterEach(cleanup);

function step(overrides: Partial<TimelineStep> & { id: string; name: string }): TimelineStep {
    return {
        status: "never_run",
        label: "Not run",
        detail: null,
        next: false,
        runnable: false,
        progress: null,
        ...overrides,
    };
}

function renderBar(
    steps: TimelineStep[],
    pending = false,
    options: {
        live?: SequenceLive | null;
        locked?: boolean;
        runningVideo?: boolean;
        blockedElsewhere?: boolean;
        history?: TimelineRecord[];
        sceneCount?: number;
        refusal?: { sequence: string; message: string } | null;
        runFailure?: VideoFailure | null;
        dirty?: boolean;
        onSave?: () => Promise<boolean>;
    } = {},
) {
    const onResetData = vi.fn();
    const onRun = vi.fn();
    const onStop = vi.fn();
    render(
        <SequenceRunBar
            steps={steps}
            live={options.live ?? null}
            locked={options.locked ?? false}
            lockedLabel="Locked while an encode runs"
            runningVideo={options.runningVideo ?? false}
            blockedElsewhere={options.blockedElsewhere ?? false}
            history={options.history === undefined ? undefined : historyRuns(options.history)}
            sceneCount={options.sceneCount}
            pending={pending}
            refusal={options.refusal ?? null}
            runFailure={options.runFailure ?? null}
            dirty={options.dirty ?? false}
            onSave={options.onSave}
            onRun={onRun}
            onStop={onStop}
            onResetData={onResetData}
        />,
    );
    return { onResetData, onRun, onStop };
}

describe("SequenceRunBar", () => {
    it("shows the live line and stops the sequence that is running", () => {
        const { onStop } = renderBar(
            [
                step({
                    id: "NoiseDetector",
                    name: "Noise Detector",
                    status: "active",
                    label: "Running 37%",
                    runnable: true,
                    progress: 37.5,
                }),
            ],
            false,
            {
                runningVideo: true,
                live: {
                    sequence: "NoiseDetector",
                    progress: 37.5,
                    phase: null,
                    pass: null,
                    maxPasses: null,
                    framesProcessed: null,
                    framesTotal: null,
                    scenesProcessed: 15,
                    scenesTotal: 40,
                    sceneIndex: null,
                    sceneProgress: null,
                    fps: 2.5,
                    fpsUnit: "scenes",
                    etaSeconds: 10,
                    measuredAt: 0,
                },
            },
        );

        expect(screen.getByText("15/40 scenes · 37.50% · 2.50 scenes/s · ETA 0:10")).toBeDefined();
        fireEvent.click(screen.getByRole("button", { name: "Stop Noise Detector" }));
        expect(onStop).toHaveBeenCalledWith("NoiseDetector");
        expect(screen.queryByRole("button", { name: "Start Noise Detector" })).toBeNull();
    });

    it("shows the failed run above the sequences this section owns", () => {
        renderBar(
            [
                step({ id: "NoiseDetector", name: "Noise Detector", runnable: true }),
                step({ id: "NoiseScaler", name: "Noise Scaler", runnable: true }),
            ],
            false,
            {
                runFailure: {
                    at: "2026-11-09T00:00:00Z",
                    message: "script error\nTraceback line",
                    run_id: "run-1",
                    sequence: "NoiseScaler",
                },
            },
        );

        const alert = screen.getByRole("alert");
        expect(alert.closest("section")?.getAttribute("aria-label")).toBe("Sequence status");
        expect(alert.textContent).toContain("Noise Scaler failed.");
        expect(alert.textContent).toContain("script error");
        expect(alert.textContent).not.toContain("Traceback line");
    });

    it("states a refused start on the row that issued it", () => {
        renderBar(
            [
                step({ id: "SceneDetector", name: "Scene Detector", runnable: true }),
                step({ id: "NoiseDetector", name: "Noise Detector", runnable: true }),
            ],
            false,
            {
                refusal: {
                    sequence: "NoiseDetector",
                    message: "Another video is encoding.",
                },
            },
        );

        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Another video is encoding.");
        expect(alert.closest("li")?.textContent).toContain("Noise Detector");
    });

    it("shows detected scenes without inventing a total", () => {
        renderBar(
            [
                step({
                    id: "SceneDetector",
                    name: "Scene Detector",
                    status: "active",
                    label: "Running 40%",
                    runnable: true,
                    progress: 40,
                }),
            ],
            false,
            {
                runningVideo: true,
                live: {
                    sequence: "SceneDetector",
                    progress: 40,
                    phase: null,
                    pass: null,
                    maxPasses: null,
                    framesProcessed: null,
                    framesTotal: null,
                    scenesProcessed: 4,
                    scenesTotal: null,
                    sceneIndex: null,
                    sceneProgress: null,
                    fps: 10,
                    fpsUnit: "frames",
                    etaSeconds: 2,
                    measuredAt: 0,
                },
            },
        );

        expect(screen.getByText("4 scenes · 40.00% · 10.0 FPS · ETA 0:02")).toBeDefined();
    });

    it("gives every active worker its own scene line", () => {
        renderBar(
            [
                step({
                    id: "ParallelEncoder",
                    name: "Parallel Encoder",
                    status: "active",
                    label: "Running 60%",
                    runnable: true,
                    progress: 60,
                }),
            ],
            false,
            {
                runningVideo: true,
                live: {
                    sequence: "ParallelEncoder",
                    progress: 60,
                    phase: null,
                    pass: null,
                    maxPasses: null,
                    framesProcessed: 13_438,
                    framesTotal: 16_500,
                    scenesProcessed: 53,
                    scenesTotal: 81,
                    sceneIndex: 96,
                    sceneProgress: 31.73,
                    workers: [
                        {
                            sceneIndex: 31,
                            pass: 1,
                            progress: 31.73,
                            framesProcessed: 32,
                            framesTotal: 102,
                            fps: 3.39,
                            fpsUnit: "frames",
                            etaSeconds: 266,
                            elapsedSeconds: 48.9,
                            measuredAt: 0,
                        },
                        {
                            sceneIndex: 47,
                            pass: 2,
                            progress: 84.63,
                            framesProcessed: 134,
                            framesTotal: 165,
                            fps: 2.54,
                            fpsUnit: "frames",
                            etaSeconds: 82,
                            elapsedSeconds: 42.2,
                            measuredAt: 0,
                        },
                    ],
                    fps: 6.54,
                    fpsUnit: "frames",
                    etaSeconds: 7_642,
                    measuredAt: 0,
                },
            },
        );

        expect(
            screen.getByText("53/81 scenes (13438/16500 frames) · 60.00% · 6.54 FPS · ETA 2:07:22"),
        ).toBeDefined();
        expect(
            screen.getByText(
                "Pass 1 · Scene 32: 31.73% (32/102 frames) in 48.9s · 3.39 FPS · ETA 4:26",
            ),
        ).toBeDefined();
        expect(
            screen.getByText(
                "Pass 2 · Scene 48: 84.63% (134/165 frames) in 42.2s · 2.54 FPS · ETA 1:22",
            ),
        ).toBeDefined();
    });

    it("starts a runnable sequence and locks the others while a video encodes", () => {
        const { onRun } = renderBar(
            [
                step({
                    id: "SceneDetector",
                    name: "Scene Detector",
                    status: "complete",
                    label: "Done",
                    runnable: true,
                }),
                step({
                    id: "NoiseDetector",
                    name: "Noise Detector",
                    status: "complete",
                    label: "Done",
                    runnable: true,
                }),
            ],
            false,
            { runningVideo: false },
        );

        fireEvent.click(screen.getByRole("button", { name: "Start Noise Detector" }));
        expect(onRun).toHaveBeenCalledWith("NoiseDetector");
    });

    it("disables every start while another video holds the encode lock", () => {
        const { onRun } = renderBar(
            [
                step({ id: "SceneDetector", name: "Scene Detector", runnable: true }),
                step({ id: "NoiseDetector", name: "Noise Detector", runnable: true }),
            ],
            false,
            { blockedElsewhere: true },
        );

        for (const button of screen.getAllByRole("button", { name: /Start /u })) {
            expect(button.hasAttribute("disabled")).toBe(true);
            expect(button.getAttribute("data-tip")).toContain("Another video is encoding");
        }
        fireEvent.click(screen.getByRole("button", { name: "Start Scene Detector" }));
        expect(onRun).not.toHaveBeenCalled();
    });

    it("saves a dirty draft before starting the sequence", async () => {
        const onSave = vi.fn(async () => true);
        const { onRun } = renderBar(
            [step({ id: "NoiseDetector", name: "Noise Detector", runnable: true })],
            false,
            { dirty: true, onSave },
        );

        fireEvent.click(screen.getByRole("button", { name: "Start Noise Detector" }));

        await waitFor(() => expect(onRun).toHaveBeenCalledWith("NoiseDetector"));
        expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("does not start when saving the dirty draft fails", async () => {
        const onSave = vi.fn(async () => false);
        const { onRun } = renderBar(
            [step({ id: "NoiseDetector", name: "Noise Detector", runnable: true })],
            false,
            { dirty: true, onSave },
        );

        fireEvent.click(screen.getByRole("button", { name: "Start Noise Detector" }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onRun).not.toHaveBeenCalled();
    });

    it("starts a clean draft without saving it", () => {
        const onSave = vi.fn(async () => true);
        const { onRun } = renderBar(
            [step({ id: "NoiseDetector", name: "Noise Detector", runnable: true })],
            false,
            { dirty: false, onSave },
        );

        fireEvent.click(screen.getByRole("button", { name: "Start Noise Detector" }));

        expect(onRun).toHaveBeenCalledWith("NoiseDetector");
        expect(onSave).not.toHaveBeenCalled();
    });

    it("quotes the recorded performance of a finished sequence", () => {
        renderBar(
            [
                step({
                    id: "NoiseDetector",
                    name: "Noise Detector",
                    status: "complete",
                    label: "Done",
                    runnable: true,
                }),
            ],
            false,
            {
                sceneCount: 275,
                history: [
                    {
                        run_id: "run-1",
                        sequence: "NoiseDetector",
                        started_at: "2026-01-01T00:00:00Z",
                        ended_at: "2026-01-01T00:00:42Z",
                        outcome: "completed",
                        frames_processed: 1_400,
                        frames_total: 1_400,
                        fps: 32.85,
                        message: null,
                    },
                ],
            },
        );

        expect(
            screen.getByText("Done · 275 scenes (1,400 frames) in 42s, 32.85 fps"),
        ).toBeDefined();
    });

    it("does not repeat the scene count the evidence line already names", () => {
        renderBar(
            [
                step({
                    id: "SceneDetector",
                    name: "Scene Detector",
                    status: "complete",
                    label: "Done",
                    detail: "275 scenes detected",
                    runnable: true,
                }),
            ],
            false,
            {
                sceneCount: 275,
                history: [
                    {
                        run_id: "run-1",
                        sequence: "SceneDetector",
                        started_at: "2026-01-01T00:00:00Z",
                        ended_at: "2026-01-01T00:06:24Z",
                        outcome: "completed",
                        frames_processed: 36_840,
                        frames_total: 36_840,
                        fps: 95.94,
                        message: null,
                    },
                ],
            },
        );

        expect(
            screen.getByText("Done · 275 scenes detected · 36,840 frames in 6m 24s, 95.94 fps"),
        ).toBeDefined();
    });

    it("does not quote an unfinished attempt", () => {
        renderBar(
            [
                step({
                    id: "ParallelEncoder",
                    name: "Parallel Encoder",
                    status: "incomplete",
                    label: "Incomplete",
                    runnable: true,
                }),
            ],
            false,
            {
                sceneCount: 275,
                history: [
                    {
                        run_id: "run-1",
                        sequence: "ParallelEncoder",
                        started_at: "2026-01-01T00:00:00Z",
                        ended_at: "2026-01-01T00:00:42Z",
                        outcome: "cancelled",
                        frames_processed: 1_400,
                        frames_total: 36_840,
                        fps: 33.33,
                        message: null,
                    },
                ],
            },
        );

        expect(screen.queryByText(/1,400 frames/)).toBeNull();
        expect(screen.getByText("Incomplete")).toBeDefined();
    });

    it("offers the guarded data reset for a sequence that wrote data", () => {
        const { onResetData } = renderBar([
            step({
                id: "SceneDetector",
                name: "Scene Detector",
                status: "complete",
                label: "Done",
                runnable: true,
            }),
        ]);

        fireEvent.click(screen.getByRole("button", { name: "Reset Scene Detector data" }));
        expect(onResetData).toHaveBeenCalledTimes(1);
    });

    it("disables the reset while a mutation is pending", () => {
        renderBar(
            [
                step({
                    id: "SceneDetector",
                    name: "Scene Detector",
                    status: "complete",
                    label: "Done",
                    runnable: true,
                }),
            ],
            true,
        );

        expect(
            screen
                .getByRole("button", { name: "Reset Scene Detector data" })
                .hasAttribute("disabled"),
        ).toBe(true);
    });

    it("does not offer a second start while this video already encodes", () => {
        renderBar(
            [
                step({
                    id: "SceneDetector",
                    name: "Scene Detector",
                    status: "complete",
                    label: "Done",
                    runnable: true,
                }),
                step({
                    id: "NoiseDetector",
                    name: "Noise Detector",
                    status: "active",
                    label: "Running",
                    runnable: true,
                }),
            ],
            false,
            { runningVideo: true },
        );

        expect(
            screen.getByRole("button", { name: "Start Scene Detector" }).hasAttribute("disabled"),
        ).toBe(true);
    });
});
