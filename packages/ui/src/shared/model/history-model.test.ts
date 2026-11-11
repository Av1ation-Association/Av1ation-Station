import { describe, expect, it } from "vitest";

import type { TimelineRecord } from "@av1ation/contracts";

import { historyRuns } from "./history-model";

function record(overrides: Partial<TimelineRecord> & { run_id: string }): TimelineRecord {
    return {
        sequence: null,
        started_at: "2026-11-02T10:00:00.000Z",
        ended_at: "2026-11-02T10:00:10.000Z",
        outcome: "completed",
        frames_processed: null,
        frames_total: null,
        fps: null,
        message: null,
        ...overrides,
    };
}

describe("historyRuns", () => {
    it("groups attempts under their terminal record and keeps execution order", () => {
        const runs = historyRuns([
            record({
                run_id: "older",
                started_at: "2026-11-02T09:00:00.000Z",
                ended_at: "2026-11-02T09:30:00.000Z",
            }),
            record({
                run_id: "older",
                sequence: "SceneDetector",
                started_at: "2026-11-02T09:00:00.000Z",
                ended_at: "2026-11-02T09:05:00.000Z",
                frames_processed: 1_000,
                frames_total: 1_000,
                fps: 3.33,
            }),
            record({
                run_id: "older",
                sequence: "ParallelEncoder",
                started_at: "2026-11-02T09:05:00.000Z",
                ended_at: "2026-11-02T09:25:00.000Z",
                frames_processed: 9_000,
                frames_total: 9_000,
                fps: 7.5,
            }),
            record({
                run_id: "newer",
                sequence: "SceneDetector",
                started_at: "2026-11-02T10:00:00.000Z",
                ended_at: "2026-11-02T10:00:02.000Z",
                outcome: "failed",
                message: "FFMS2 could not index the source.",
            }),
        ]);

        expect(runs.map((run) => run.runId)).toEqual(["newer", "older"]);
        const older = runs[1];
        expect(older?.steps.map((step) => step.sequence)).toEqual([
            "SceneDetector",
            "ParallelEncoder",
        ]);
        expect(older?.durationSeconds).toBe(1_800);
        expect(older?.frames).toBe(10_000);
        expect(older?.outcome).toBe("completed");
        expect(older?.steps[1]?.fps).toBe(7.5);
        expect(older?.steps[1]?.durationSeconds).toBe(1_200);

        // A run that failed before its terminal record is still a run: attempts without a
        // terminal entry are shown as running, and the attempt's own message survives.
        const newer = runs[0];
        expect(newer?.outcome).toBe("running");
        expect(newer?.steps[0]?.outcome).toBe("failed");
        expect(newer?.steps[0]?.message).toBe("FFMS2 could not index the source.");
        expect(newer?.message).toBeNull();
    });

    it("keeps a terminal record with no attempts as its own run", () => {
        const runs = historyRuns([
            record({
                run_id: "input-failure",
                started_at: "2026-11-02T10:00:00.000Z",
                ended_at: "2026-11-02T10:00:00.200Z",
                outcome: "failed",
                message: "the input could not be opened",
            }),
        ]);
        expect(runs).toHaveLength(1);
        expect(runs[0]?.steps).toEqual([]);
        expect(runs[0]?.message).toBe("the input could not be opened");
        expect(runs[0]?.outcome).toBe("failed");
    });

    it("orders runs newest first even when the file is not written in that order", () => {
        const runs = historyRuns([
            record({ run_id: "b", started_at: "2026-11-02T12:00:00.000Z" }),
            record({ run_id: "a", started_at: "2026-11-02T08:00:00.000Z" }),
        ]);
        expect(runs.map((run) => run.runId)).toEqual(["b", "a"]);
    });

    it("marks a terminal record with an unknown outcome as unrecognized", () => {
        const runs = historyRuns([
            record({
                run_id: "unknown-terminal",
                outcome: "unknown",
                message: "The runner stopped for a reason this build does not name.",
            }),
        ]);
        expect(runs[0]?.outcome).toBe("unrecognized");
        expect(runs[0]?.message).toBe("The runner stopped for a reason this build does not name.");
    });

    it("marks an attempt with an unknown outcome as unrecognized", () => {
        const runs = historyRuns([
            record({
                run_id: "unknown-attempt",
                sequence: "SceneDetector",
                outcome: "unknown",
            }),
        ]);
        expect(runs[0]?.steps[0]?.outcome).toBe("unrecognized");
    });
});
