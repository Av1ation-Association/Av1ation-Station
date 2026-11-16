import { describe, expect, it } from "vitest";

import { versionForTag } from "./stamp-release-version.mjs";

describe("release version stamping", () => {
    it("stamps a weekly tag with the first seven commit characters", () => {
        expect(versionForTag("v0.1.0-weekly.20261116", "abcdef1234567890", "0.1.0")).toBe(
            "0.1.0-weekly.20261116.abcdef1",
        );
    });

    it("requires the exact stable or RC package version", () => {
        expect(versionForTag("v0.1.0", "abcdef1", "0.1.0")).toBe("0.1.0");
        expect(() => versionForTag("v0.1.0", "abcdef1", "0.1.1")).toThrow(
            /does not match stable tag/iu,
        );
        expect(versionForTag("v0.1.0-rc.1", "abcdef1", "0.1.0-rc.1")).toBe("0.1.0-rc.1");
    });

    it("rejects a weekly tag without a usable source commit", () => {
        expect(() => versionForTag("v0.1.0-weekly.20261116", "", "0.1.0")).toThrow(/commit SHA/iu);
    });
});
