import { describe, expect, it } from "vitest";

import {
    RETAIN_BEHIND_SECONDS,
    SOURCE_BUFFER_BUDGET_BYTES,
    MAX_PAUSED_PREBUILD_WINDOWS,
    initialPreviewPlan,
    observePreviewWindow,
    type PreviewBufferPlan,
    type WindowObservation,
} from "./preview-buffer-plan";

const MIB = 1024 * 1024;

function observation(bytes: number, buildSeconds: number, windowSeconds = 2): WindowObservation {
    return { buildSeconds, bytes, windowSeconds };
}

function repeatedly(
    plan: PreviewBufferPlan,
    sample: WindowObservation,
    times: number,
): PreviewBufferPlan {
    let next = plan;
    for (let index = 0; index < times; index += 1) {
        next = observePreviewWindow(next, sample, sample.windowSeconds);
    }
    return next;
}

describe("preview buffer plan", () => {
    it("starts from the measured 1080p build and keeps three windows of lead", () => {
        const plan = initialPreviewPlan(2);

        // 140 MB at the measured 15 MB/s leaves room for three 2 s windows after the
        // playhead, plus the one in flight and the retained second behind it.
        expect(plan.leadSeconds).toBe(6);
        expect(plan.prebuildWindows).toBe(3);
        expect(plan.retainedBytes).toBeLessThanOrEqual(SOURCE_BUFFER_BUDGET_BYTES);
        expect(plan.retainedBytes).toBeGreaterThan(SOURCE_BUFFER_BUDGET_BYTES * 0.9);
    });

    it("fills the SourceBuffer while paused even when the playing lead is shorter", () => {
        // 44 MB per two-second window: the playing plan keeps two seconds of lead plus
        // the in-flight window and the retained second, but a paused player is not
        // consuming that headroom and can hold three full windows.
        const plan = repeatedly(initialPreviewPlan(2), observation(44 * MIB, 6), 12);

        expect(plan.bytesPerSecond).toBeGreaterThan(21 * MIB);
        expect(plan.leadSeconds).toBe(2);
        expect(plan.pausedLeadSeconds).toBe(6);
        expect(plan.pausedPrebuildWindows).toBeGreaterThan(plan.prebuildWindows);
    });

    it("caps the paused runway at the preview cache budget", () => {
        // 12 MB per two-second window: 1.5 GiB would allow more than the fan-out cap.
        const plan = repeatedly(initialPreviewPlan(2), observation(12 * MIB, 1.4), 12);

        expect(plan.pausedLeadSeconds).toBe(22);
        expect(plan.pausedPrebuildWindows).toBe(MAX_PAUSED_PREBUILD_WINDOWS);
    });

    it("buffers further ahead when the source costs fewer bytes per second", () => {
        // A 720p-class lossless rate: 12 MB per two-second window.
        const plan = repeatedly(initialPreviewPlan(2), observation(12 * MIB, 1.4), 12);

        // 140 MB at 6 MB/s is about 23 s; the plan can afford four 2 s windows of lead.
        expect(plan.bytesPerSecond).toBeLessThan(7 * MIB);
        expect(plan.leadSeconds).toBe(8);
        expect(plan.leadSeconds).toBeGreaterThan(initialPreviewPlan(2).leadSeconds);
        expect(plan.retainedBytes).toBeLessThanOrEqual(SOURCE_BUFFER_BUDGET_BYTES);
    });

    it("deepens the cache runway when a window takes longer to build", () => {
        // Builds that take more than two windows of playback need more than the fixed
        // three-window cache: five windows is fifteen seconds of runway.
        const plan = repeatedly(initialPreviewPlan(2), observation(30 * MIB, 5), 12);

        expect(plan.buildSeconds).toBeGreaterThan(4.5);
        expect(plan.prebuildWindows).toBe(6);
        // The lead itself is memory-bound, not build-bound, so it stays at the budget.
        expect(plan.leadSeconds).toBe(6);
    });

    it("does not spend more lead than the SourceBuffer budget can hold", () => {
        // A 4:4:4-class rate: 50 MB for a two-second window. The budget fits one window
        // after the playhead; two would exceed it before the in-flight append is counted.
        const plan = repeatedly(initialPreviewPlan(2), observation(100 * MIB, 1.4), 12);

        expect(plan.leadSeconds).toBe(2);
        expect(plan.retainedBytes).toBeGreaterThan(SOURCE_BUFFER_BUDGET_BYTES);
        // The quota path may still have to trim; the plan must not pretend otherwise.
        expect(plan.leadSeconds + RETAIN_BEHIND_SECONDS).toBeLessThan(5);
    });

    it("smooths a single slow observation instead of doubling the lead", () => {
        const first = initialPreviewPlan(2);
        const spike = observePreviewWindow(first, observation(30 * MIB, 8), 2);

        expect(spike.buildSeconds).toBeGreaterThan(first.buildSeconds);
        expect(spike.buildSeconds).toBeLessThan(4);
        expect(spike.leadSeconds).toBe(first.leadSeconds);
    });

    it("ignores an observation with no usable bytes or time", () => {
        const plan = initialPreviewPlan(2);

        expect(observePreviewWindow(plan, observation(0, 2), 2)).toBe(plan);
        expect(observePreviewWindow(plan, observation(30 * MIB, 0), 2)).toBe(plan);
    });
});
