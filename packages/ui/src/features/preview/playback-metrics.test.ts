import { describe, expect, it } from "vitest";
import { PlaybackRecorder, STALL_MS } from "./playback-metrics";

/** Feed frames at a steady interval, starting at `start`. */
function play(recorder: PlaybackRecorder, start: number, count: number, step = 1000 / 24) {
    for (let index = 0; index < count; index += 1) {
        recorder.frame(start + index * step);
    }
}

describe("PlaybackRecorder", () => {
    it("reports the play latency to the first presented frame", () => {
        const recorder = new PlaybackRecorder("decoded");
        recorder.playStarted(1000);
        play(recorder, 1320, 3);

        const summary = recorder.summary();
        expect(summary.firstFrameMs).toBe(320);
        expect(summary.presented).toBe(3);
    });

    it("reports a stall and the longest gap instead of an average", () => {
        const recorder = new PlaybackRecorder("original");
        recorder.playStarted(0);
        recorder.frame(0);
        recorder.frame(1000 / 24);
        recorder.frame((2 * 1000) / 24);
        // A 600 ms hole, then playback resumes.
        recorder.frame((2 * 1000) / 24 + 600);
        recorder.frame((3 * 1000) / 24 + 600);
        recorder.frame((4 * 1000) / 24 + 600);

        const summary = recorder.summary();
        expect(summary.stalls).toBe(1);
        expect(summary.longestStallMs).toBeCloseTo(600);
        expect(summary.stalls).toBeLessThan(summary.presented);
    });

    it("counts a stall that is still running when the interval ends", () => {
        const recorder = new PlaybackRecorder("decoded");
        recorder.playStarted(0);
        play(recorder, 0, 48);
        // The last frame arrived at about 2 s; the picture then stayed frozen for 4 s.
        const summary = recorder.summary((47 * 1000) / 24 + 4000);

        expect(summary.stalls).toBe(1);
        expect(summary.longestStallMs).toBeCloseTo(4000);
        expect(summary.fps).toBeCloseTo(24, 0);
    });

    it("does not turn a normal pause into a stall", () => {
        const recorder = new PlaybackRecorder("decoded");
        play(recorder, 0, 24);
        const summary = recorder.summary((23 * 1000) / 24 + 50);

        expect(summary.stalls).toBe(0);
        expect(summary.longestStallMs).toBe(0);
    });

    it("keeps a gap under the threshold out of the stall count", () => {
        const recorder = new PlaybackRecorder("original");
        recorder.frame(0);
        recorder.frame(STALL_MS - 1);
        expect(recorder.summary().stalls).toBe(0);
        expect(recorder.summary().longestStallMs).toBe(0);
    });

    it("computes fps from presented frames rather than from the source rate", () => {
        const recorder = new PlaybackRecorder("encoded");
        play(recorder, 0, 25, 40);

        const summary = recorder.summary();
        // 24 intervals over 960 ms: the rate is what was presented, not a frame count.
        expect(summary.fps).toBeCloseTo(25, 1);
        expect(summary.intervalP50Ms).toBeCloseTo(40);
        expect(summary.intervalP95Ms).toBeCloseTo(40);
    });

    it("reports the drop rate Chrome counted, not an estimate", () => {
        const recorder = new PlaybackRecorder("decoded");
        play(recorder, 0, 10);
        recorder.quality(100, 4);

        const summary = recorder.summary();
        expect(summary.produced).toBe(100);
        expect(summary.dropped).toBe(4);
        expect(summary.dropRate).toBeCloseTo(0.04);
    });

    it("measures each seek separately from the play latency", () => {
        const recorder = new PlaybackRecorder("decoded");
        recorder.playStarted(0);
        recorder.frame(50);
        recorder.seekStarted(2000);
        recorder.frame(2180);

        const summary = recorder.summary();
        expect(summary.firstFrameMs).toBe(50);
        expect(summary.seekMs).toBe(180);
    });

    it("has no numbers before a frame is presented", () => {
        const recorder = new PlaybackRecorder("encode");
        const summary = recorder.summary();

        expect(recorder.hasFrames).toBe(false);
        expect(summary.fps).toBe(0);
        expect(summary.intervalP50Ms).toBeNull();
        expect(summary.firstFrameMs).toBeNull();
    });

    it("does not divide by zero when the decoder produced nothing", () => {
        const recorder = new PlaybackRecorder("original");
        recorder.quality(0, 0);
        expect(recorder.summary().dropRate).toBe(0);
    });
});
