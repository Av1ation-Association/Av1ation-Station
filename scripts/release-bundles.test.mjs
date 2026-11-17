import { describe, expect, it } from "vitest";

import { selectBundleTargets } from "./release-bundles.mjs";

describe("release bundle selection", () => {
    it("uses NSIS for a Windows prerelease without an environment override", () => {
        expect(selectBundleTargets({ platform: "win32", version: "0.1.0-rc.2" })).toEqual(["nsis"]);
    });

    it("keeps MSI and NSIS for a stable Windows release", () => {
        expect(selectBundleTargets({ platform: "win32", version: "0.1.0" })).toEqual([
            "msi",
            "nsis",
        ]);
    });

    it("replaces a Windows all target with NSIS for a prerelease", () => {
        expect(
            selectBundleTargets({
                platform: "win32",
                version: "0.1.0-rc.2",
                requested: "all",
            }),
        ).toEqual(["nsis"]);
    });

    it("honors an explicit target list and leaves non-Windows defaults unchanged", () => {
        expect(
            selectBundleTargets({
                platform: "win32",
                version: "0.1.0-rc.2",
                requested: "nsis",
            }),
        ).toEqual(["nsis"]);
        expect(selectBundleTargets({ platform: "darwin", version: "0.1.0-rc.2" })).toEqual([
            "dmg",
            "app",
        ]);
        expect(selectBundleTargets({ platform: "linux", version: "0.1.0-rc.2" })).toEqual([
            "deb",
            "rpm",
            "appimage",
        ]);
    });
});
