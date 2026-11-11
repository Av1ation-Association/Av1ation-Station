import { describe, expect, it } from "vitest";

import { compareVersions, relativeTime, verdictFor } from "./update-status";

describe("compareVersions", () => {
    it("orders release numbers without string comparison", () => {
        expect(compareVersions("0.1.0", "0.10.0")).toBeLessThan(0);
        expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
        expect(compareVersions("2.0", "1.9.9")).toBeGreaterThan(0);
    });

    it("sorts a pre-release before its release", () => {
        expect(compareVersions("1.0.0-rc1", "1.0.0")).toBeLessThan(0);
    });
});

describe("verdictFor", () => {
    const checked = "2026-11-03T12:00:00Z";

    it("reports a newer release, with the page to open", () => {
        expect(
            verdictFor({
                current: "0.1.0",
                latest: "0.2.0",
                url: "https://example.test/releases/tag/v0.2.0",
                checked_at: checked,
            }),
        ).toEqual({
            kind: "newer",
            latest: "0.2.0",
            url: "https://example.test/releases/tag/v0.2.0",
        });
    });

    it("reports the installed build when the tag matches", () => {
        expect(verdictFor({ current: "0.2.0", latest: "0.2.0", checked_at: checked })).toEqual({
            kind: "current",
            latest: "0.2.0",
        });
    });

    it("reports a build from development as newer than the release", () => {
        expect(verdictFor({ current: "0.3.0", latest: "0.2.0", checked_at: checked })).toEqual({
            kind: "ahead",
            latest: "0.2.0",
        });
    });

    it("treats a repository without a release as a normal answer", () => {
        expect(verdictFor({ current: "0.1.0", latest: null, checked_at: checked })).toEqual({
            kind: "unreleased",
        });
    });
});

describe("relativeTime", () => {
    const now = new Date("2026-11-03T12:00:00Z");

    it("reads a fresh check as just now", () => {
        expect(relativeTime("2026-11-03T11:59:40Z", now)).toBe("just now");
    });

    it("counts minutes, hours, and days", () => {
        expect(relativeTime("2026-11-03T11:57:00Z", now)).toBe("3 minutes ago");
        expect(relativeTime("2026-11-03T11:00:00Z", now)).toBe("1 hour ago");
        expect(relativeTime("2026-11-01T12:00:00Z", now)).toBe("2 days ago");
    });

    it("refuses a value it cannot parse rather than guessing", () => {
        expect(relativeTime("not a date", now)).toBeNull();
    });
});
