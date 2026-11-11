import { describe, expect, it } from "vitest";

import { formatPlaybackClock, formatTimecode, parseFrameQuery, parseTimecode } from "./format";

describe("formatTimecode", () => {
    it("writes a full clock even under a minute", () => {
        expect(formatTimecode(0, 24)).toBe("00:00:00.0");
        expect(formatTimecode(36, 24)).toBe("00:00:01.5");
        expect(formatTimecode(2_304, 24)).toBe("00:01:36.0");
    });

    it("keeps a position identifiable when the rate is unknown", () => {
        expect(formatTimecode(2_417, null)).toBe("frame 2,417");
    });

    it("carries a rounded minute instead of writing :60", () => {
        expect(formatTimecode(1_439, 24)).toBe("00:01:00.0");
    });
});

describe("formatPlaybackClock", () => {
    it("writes a short position and carries at the minute", () => {
        expect(formatPlaybackClock(6.54)).toBe("0:06.5");
        expect(formatPlaybackClock(59.96)).toBe("1:00.0");
        expect(formatPlaybackClock(3_665.4)).toBe("1:01:05.4");
    });

    it("returns an em dash for an invalid position", () => {
        expect(formatPlaybackClock(-1)).toBe("—");
    });
});

describe("parseTimecode", () => {
    it("reads the clock it writes, and the shorter forms a user types", () => {
        expect(parseTimecode("00:00:01.5", 24)).toBe(36);
        expect(parseTimecode("0:01.5", 24)).toBe(36);
        expect(parseTimecode("1.5", 24)).toBe(36);
        expect(parseTimecode("01:00:00.0", 24)).toBe(86_400);
    });

    it("rounds to the frame the text names", () => {
        expect(parseTimecode("0.01", 24)).toBe(0);
        expect(parseTimecode("0.03", 24)).toBe(1);
    });

    it("refuses text that is not a timecode", () => {
        expect(parseTimecode("", 24)).toBeNull();
        expect(parseTimecode("abc", 24)).toBeNull();
        expect(parseTimecode("1:2:3:4", 24)).toBeNull();
        expect(parseTimecode("-1", 24)).toBeNull();
        expect(parseTimecode("1:2", null)).toBeNull();
    });
});

describe("parseFrameQuery", () => {
    it("reads a bare integer as a frame and a decimal or clock as time", () => {
        expect(parseFrameQuery("48", 24, 1_000)).toBe(48);
        expect(parseFrameQuery("48", null, 1_000)).toBe(48);
        expect(parseFrameQuery("1.5", 24, 1_000)).toBe(36);
        expect(parseFrameQuery("0:01.5", 24, 1_000)).toBe(36);
        expect(parseFrameQuery("00:00:01.5", 24, 1_000)).toBe(36);
    });

    it("refuses a frame outside the known source", () => {
        expect(parseFrameQuery("0", 24, 0)).toBe(0);
        expect(parseFrameQuery("1", 24, 0)).toBeNull();
        expect(parseFrameQuery("1000", 24, 999)).toBeNull();
        expect(parseFrameQuery("00:00:42.0", 24, 1_007)).toBeNull();
    });

    it("applies no upper bound when the source length is unknown", () => {
        expect(parseFrameQuery("999999", 24, null)).toBe(999_999);
    });

    it("refuses invalid and unsafe input", () => {
        expect(parseFrameQuery("", 24, 100)).toBeNull();
        expect(parseFrameQuery("abc", 24, 100)).toBeNull();
        expect(parseFrameQuery("-1", 24, 100)).toBeNull();
        expect(parseFrameQuery("1:2:3:4", 24, 100)).toBeNull();
        expect(parseFrameQuery("1.5", null, 100)).toBeNull();
        expect(parseFrameQuery("9007199254740992", null, null)).toBeNull();
    });
});
