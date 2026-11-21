import { describe, expect, it } from "vitest";

import { matchesProduct, portableReadme } from "./collect-release.mjs";

describe("portable archive note", () => {
    it("puts the Windows marker and instructions in one file", () => {
        const note = portableReadme({
            platform: "windows",
            productName: "Av1ation Station",
            version: "0.1.0",
            variant: "bundled",
        });
        expect(note).toContain("This file is the portable-mode marker");
        expect(note).toContain("av1ation-desktop.exe");
        expect(note).toContain("bundled toolchain");
        expect(note).not.toContain("PORTABLE.txt");
    });

    it("describes the app bundle and Gatekeeper on macOS", () => {
        const note = portableReadme({
            platform: "macos",
            productName: "Av1ation Station",
            version: "0.1.0",
        });
        expect(note).toContain("Av1ation Station.app");
        expect(note).toContain("Gatekeeper");
        expect(note).not.toContain("PORTABLE.txt");
    });
});

describe("release artifact selection", () => {
    it("separates a stable version from a prerelease that shares its prefix", () => {
        expect(
            matchesProduct(
                "Av1ation Station_0.1.0_x64_en-US.msi",
                "Av1ation Station",
                "0.1.0",
                false,
            ),
        ).toBe(true);
        expect(
            matchesProduct(
                "Av1ation Station_0.1.0-rc.2_x64-setup.exe",
                "Av1ation Station",
                "0.1.0",
                false,
            ),
        ).toBe(false);
        expect(
            matchesProduct(
                "Av1ation Station System_0.1.0-rc.2_x64-setup.exe",
                "Av1ation Station System",
                "0.1.0",
                false,
            ),
        ).toBe(false);
    });

    it("matches a prerelease by its exact version", () => {
        expect(
            matchesProduct(
                "Av1ation Station_0.1.0-rc.2_x64-setup.exe",
                "Av1ation Station",
                "0.1.0-rc.2",
                false,
            ),
        ).toBe(true);
    });

    it("accepts package-name slugs and release suffixes", () => {
        expect(
            matchesProduct("av1ation-station_0.1.0_amd64.deb", "Av1ation Station", "0.1.0", false),
        ).toBe(true);
        expect(
            matchesProduct(
                "av1ation-station-0.1.0-1.x86_64.rpm",
                "Av1ation Station",
                "0.1.0",
                false,
            ),
        ).toBe(true);
        expect(
            matchesProduct(
                "av1ation-station_0.1.0_amd64.AppImage",
                "Av1ation Station",
                "0.1.0",
                false,
            ),
        ).toBe(true);
    });

    it("keeps macOS app bundles exact", () => {
        expect(matchesProduct("Av1ation Station.app", "Av1ation Station", "0.1.0", true)).toBe(
            true,
        );
        expect(
            matchesProduct("Av1ation Station Helper.app", "Av1ation Station", "0.1.0", true),
        ).toBe(false);
    });
});
