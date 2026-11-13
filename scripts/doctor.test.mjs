import { describe, expect, it } from "vitest";

import { DEFAULT_MIN_FREE_GIB } from "./check-disk-space.mjs";
import { PROFILE_DISK_MIN_GIB, PROFILES, parseArgs } from "./doctor.mjs";

describe("doctor profiles", () => {
    it("keeps the base report as the default", () => {
        expect(parseArgs([])).toEqual({ profile: "base", help: false });
        expect(PROFILES).toEqual(["web", "e2e", "real-encode"]);
    });

    it("accepts each focused profile in both argument forms", () => {
        expect(parseArgs(["--profile", "web"])).toEqual({ profile: "web", help: false });
        expect(parseArgs(["--profile=e2e"])).toEqual({ profile: "e2e", help: false });
        expect(parseArgs(["--profile", "real-encode"])).toEqual({
            profile: "real-encode",
            help: false,
        });
    });

    it("accepts help without requiring a profile", () => {
        expect(parseArgs(["--help"])).toEqual({ profile: "base", help: true });
        expect(parseArgs(["--profile", "e2e", "-h"])).toEqual({
            profile: "e2e",
            help: true,
        });
    });

    it("rejects an unknown profile or a missing profile value", () => {
        expect(() => parseArgs(["--profile", "desktop"])).toThrow(/Unknown profile/u);
        expect(() => parseArgs(["--profile"])).toThrow(/needs one of/u);
        expect(() => parseArgs(["--profile", "--help"])).toThrow(/needs one of/u);
    });

    it("uses the same Rust-scale disk floor for E2E and real encodes", () => {
        expect(PROFILE_DISK_MIN_GIB.web).toBe(1);
        expect(PROFILE_DISK_MIN_GIB.e2e).toBe(DEFAULT_MIN_FREE_GIB);
        expect(PROFILE_DISK_MIN_GIB["real-encode"]).toBe(DEFAULT_MIN_FREE_GIB);
    });
});
