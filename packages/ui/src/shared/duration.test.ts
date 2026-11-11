import { describe, expect, it } from "vitest";

import { chartSeconds, clipDuration, eta, runLength, sceneLength, workerHold } from "./duration";

describe("sceneLength", () => {
    it("writes a short duration and carries at the minute", () => {
        expect(sceneLength(0)).toBe("0:00.0");
        expect(sceneLength(6.54)).toBe("0:06.5");
        expect(sceneLength(59.96)).toBe("1:00.0");
        expect(sceneLength(3_665.4)).toBe("1:01:05.4");
    });

    it("returns an em dash for a missing or invalid value", () => {
        expect(sceneLength(-1)).toBe("—");
        expect(sceneLength(Number.NaN)).toBe("—");
    });
});

describe("chartSeconds", () => {
    it("keeps locale-aware decimals and the chart's unit thresholds", () => {
        expect(chartSeconds(6.54)).toMatch(/^6[.,]54 s$/);
        expect(chartSeconds(119.96)).toMatch(/^120[.,]0 s$/);
        expect(chartSeconds(120)).toMatch(/^2[.,]0 min$/);
    });

    it("returns an em dash when the chart has no value", () => {
        expect(chartSeconds(null)).toBe("—");
        expect(chartSeconds(-1)).toBe("—");
        expect(chartSeconds(Number.NaN)).toBe("—");
    });
});

describe("runLength", () => {
    it("reads seconds, minutes, and hours without a stray unit", () => {
        expect(runLength(38)).toBe("38s");
        expect(runLength(252)).toBe("4m 12s");
        expect(runLength(3_840)).toBe("1h 04m");
        expect(runLength(5_400)).toBe("1h 30m");
        expect(runLength(null)).toBe("—");
    });
});

describe("eta", () => {
    it("writes a whole-second clock and carries at the minute", () => {
        expect(eta(0)).toBe("0:00");
        expect(eta(468)).toBe("7:48");
        expect(eta(59.6)).toBe("1:00");
        expect(eta(3_600)).toBe("1:00:00");
    });

    it("returns null when there is no estimate to show", () => {
        expect(eta(null)).toBeNull();
        expect(eta(-1)).toBeNull();
        expect(eta(Number.NaN)).toBeNull();
    });
});

describe("workerHold", () => {
    it("keeps tenths under a minute and carries into the minute form", () => {
        expect(workerHold(0)).toBe("0.0s");
        expect(workerHold(48.9)).toBe("48.9s");
        expect(workerHold(59.94)).toBe("59.9s");
        expect(workerHold(59.96)).toBe("1m 00s");
        expect(workerHold(120)).toBe("2m 00s");
    });

    it("returns null when the worker has no hold value", () => {
        expect(workerHold(null)).toBeNull();
        expect(workerHold(-1)).toBeNull();
        expect(workerHold(Number.NaN)).toBeNull();
    });
});

describe("clipDuration", () => {
    it("writes milliseconds and carries into the next minute", () => {
        expect(clipDuration(96.123)).toBe("00:01:36.123");
        expect(clipDuration(59.9996)).toBe("00:01:00.000");
    });

    it("treats zero as an unknown rate rather than a zero-length clip", () => {
        expect(clipDuration(0)).toBe("—");
        expect(clipDuration(-1)).toBe("—");
        expect(clipDuration(Number.NaN)).toBe("—");
    });
});
