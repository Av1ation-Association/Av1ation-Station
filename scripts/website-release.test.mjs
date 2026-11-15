import { describe, expect, it, vi } from "vitest";

import {
    projectReleaseManifest,
    releaseAssetEntries,
    validateAssetUrls,
} from "./website-release.mjs";

const VERSION = "0.1.0";

function releaseManifest() {
    return {
        schema_version: 1,
        generated_at: "2026-11-11T05:29:52Z",
        repository: "Av1ation-Association/Av1ation-Station",
        release: {
            tag: "v0.1.0-1",
            published_at: "2026-11-11T05:29:52Z",
            prerelease: true,
            checksums_file: "SHA256SUMS-github.txt",
        },
        platforms: [
            { os: "windows", arch: "x64", label: "Windows x64" },
            { os: "linux", arch: "x64", label: "Linux x64" },
        ],
        assets: [
            {
                name: "App_0.1.0_x64-setup-bundled.exe",
                platform: "windows",
                arch: "x64",
                variant: "bundled",
                format: "exe",
                kind: "installer",
                size: 1_234,
            },
            {
                name: "App_0.1.0_amd64-bundled.AppImage",
                platform: "linux",
                arch: "x64",
                variant: "bundled",
                format: "appimage",
                kind: "portable",
                size: 5_678,
            },
            {
                name: "SHA256SUMS-github.txt",
                platform: "release",
                arch: "x64",
                variant: "release",
                format: "txt",
                kind: "checksums",
                size: 42,
            },
        ],
    };
}

function projection() {
    return projectReleaseManifest(releaseManifest(), VERSION);
}

describe("website release projection", () => {
    it("takes names, sizes, tag and date from the manifest and version from the package", () => {
        const result = projection();

        expect(result).toMatchObject({
            repository: "Av1ation-Association/Av1ation-Station",
            tag: "v0.1.0-1",
            version: VERSION,
            published: "2026-11-11",
            prerelease: true,
            checksums: { name: "SHA256SUMS-github.txt", size: 42 },
            asset_count: 2,
        });
        expect(result.assets).toEqual([
            expect.objectContaining({
                name: "App_0.1.0_x64-setup-bundled.exe",
                size: 1_234,
                variant: "bundled",
            }),
            expect.objectContaining({
                name: "App_0.1.0_amd64-bundled.AppImage",
                size: 5_678,
                variant: "bundled",
            }),
        ]);
    });

    it("rejects a manifest that describes a different package version", () => {
        const manifest = releaseManifest();
        manifest.release.version = "0.2.0";

        expect(() => projectReleaseManifest(manifest, VERSION)).toThrow(
            /does not match package version/u,
        );
    });

    it("rejects a tag that does not belong to the package version", () => {
        const manifest = releaseManifest();
        manifest.release.tag = "v0.2.0-1";

        expect(() => projectReleaseManifest(manifest, VERSION)).toThrow(
            /does not describe package version/u,
        );
    });

    it("requires the checksum asset named by the release", () => {
        const manifest = releaseManifest();
        manifest.release.checksums_file = "OTHER-SUMS.txt";

        expect(() => projectReleaseManifest(manifest, VERSION)).toThrow(/checksum asset/u);
    });

    it("links assets through the tag from the manifest", () => {
        const entries = releaseAssetEntries(projection());

        expect(entries.map((entry) => entry.name)).toEqual([
            "App_0.1.0_x64-setup-bundled.exe",
            "App_0.1.0_amd64-bundled.AppImage",
            "SHA256SUMS-github.txt",
        ]);
        expect(entries[0]?.url).toBe(
            "https://github.com/Av1ation-Association/Av1ation-Station/releases/download/v0.1.0-1/App_0.1.0_x64-setup-bundled.exe",
        );
    });

    it("checks every URL with HEAD and compares the reported size", async () => {
        const sizes = new Map([
            ["App_0.1.0_x64-setup-bundled.exe", 1_234],
            ["App_0.1.0_amd64-bundled.AppImage", 5_678],
            ["SHA256SUMS-github.txt", 42],
        ]);
        const fetchImpl = vi.fn(async (url) => {
            const name = decodeURIComponent(url.split("/").at(-1));
            return {
                status: 200,
                ok: true,
                headers: {
                    get: (header) => (header === "content-length" ? String(sizes.get(name)) : null),
                },
            };
        });

        const results = await validateAssetUrls(projection(), { fetchImpl });

        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining("App_0.1.0_x64-setup-bundled.exe"),
            expect.objectContaining({ method: "HEAD", redirect: "follow" }),
        );
        expect(results.map((entry) => entry.bytes)).toEqual([1_234, 5_678, 42]);
    });

    it("fails when GitHub reports a different size", async () => {
        const fetchImpl = vi.fn(async () => ({
            status: 200,
            ok: true,
            headers: {
                get: (header) => (header === "content-length" ? "999" : null),
            },
        }));

        await expect(validateAssetUrls(projection(), { fetchImpl })).rejects.toThrow(
            /bytes on GitHub/u,
        );
    });

    it("does not retry a missing asset", async () => {
        const fetchImpl = vi.fn(async () => ({
            status: 404,
            ok: false,
            headers: { get: () => null },
        }));

        await expect(validateAssetUrls(projection(), { fetchImpl })).rejects.toThrow(
            /missing release asset/u,
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
