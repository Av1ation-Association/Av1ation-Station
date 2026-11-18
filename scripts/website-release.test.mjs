import { describe, expect, it, vi } from "vitest";

import {
    buildReleaseCatalogue,
    compareReleaseVersions,
    projectReleaseManifest,
    releaseAssetEntries,
    releaseCatalogueEntries,
    validateAssetUrls,
} from "./website-release.mjs";

function releaseManifest({ tag = "v0.1.0-rc.3", version = "0.1.0-rc.3", prerelease = true } = {}) {
    return {
        schema_version: 1,
        generated_at: "2026-11-11T05:29:52Z",
        repository: "Av1ation-Association/Av1ation-Station",
        release: {
            tag,
            version,
            published_at: "2026-11-11T05:29:52Z",
            prerelease,
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

function stableManifest(version = "0.1.0") {
    return releaseManifest({
        tag: `v${version}`,
        version,
        prerelease: false,
    });
}

function catalogue() {
    return buildReleaseCatalogue({ latest: releaseManifest() });
}

describe("website release projection", () => {
    it("takes names, sizes, tag, version and date from the manifest", () => {
        const result = projectReleaseManifest(releaseManifest());

        expect(result).toMatchObject({
            repository: "Av1ation-Association/Av1ation-Station",
            tag: "v0.1.0-rc.3",
            version: "0.1.0-rc.3",
            published: "2026-11-11",
            prerelease: true,
            checksums: { name: "SHA256SUMS-github.txt", size: 42 },
            asset_count: 2,
        });
        expect(result.platforms.map((platform) => platform.label)).toEqual([
            "Windows x64",
            "Linux x64",
        ]);
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

    it("requires the release's own version", () => {
        const manifest = releaseManifest();
        delete manifest.release.version;

        expect(() => projectReleaseManifest(manifest)).toThrow(/release\.version/u);
    });

    it("rejects a draft release", () => {
        const manifest = releaseManifest();
        manifest.release.draft = true;

        expect(() => projectReleaseManifest(manifest)).toThrow(/draft release/u);
    });

    it("requires a publication date rather than a draft timestamp", () => {
        const manifest = releaseManifest();
        delete manifest.release.published_at;

        expect(() => projectReleaseManifest(manifest)).toThrow(/release\.published_at/u);
    });

    it("rejects a tag that does not belong to the release version", () => {
        const manifest = releaseManifest();
        manifest.release.tag = "v0.2.0-1";

        expect(() => projectReleaseManifest(manifest)).toThrow(
            /does not describe release\.version/u,
        );
    });

    it("rejects a tag whose release-candidate number differs from the version", () => {
        const manifest = releaseManifest({ tag: "v0.1.0-rc.2", version: "0.1.0-rc.3" });

        expect(() => projectReleaseManifest(manifest)).toThrow(
            /does not describe release\.version/u,
        );
    });

    it("accepts the documented weekly tag with its build hash in the version", () => {
        const result = projectReleaseManifest(
            releaseManifest({
                tag: "v0.1.0-weekly.20261116",
                version: "0.1.0-weekly.20261116.abcdef0",
            }),
        );

        expect(result.tag).toBe("v0.1.0-weekly.20261116");
        expect(result.version).toBe("0.1.0-weekly.20261116.abcdef0");
    });

    it("requires the checksum asset named by the release", () => {
        const manifest = releaseManifest();
        manifest.release.checksums_file = "OTHER-SUMS.txt";

        expect(() => projectReleaseManifest(manifest)).toThrow(/checksum asset/u);
    });

    it("projects macOS assets with the same labels and ordering", () => {
        const manifest = releaseManifest();
        manifest.platforms.splice(1, 0, { os: "macos", arch: "aarch64", label: "macOS arm64" });
        manifest.assets.unshift(
            {
                name: "App_0.1.0_aarch64-bundled.dmg",
                platform: "macos",
                arch: "aarch64",
                variant: "bundled",
                format: "dmg",
                kind: "installer",
                size: 3_456,
            },
            {
                name: "App_0.1.0_aarch64-bundled.app.zip",
                platform: "macos",
                arch: "aarch64",
                variant: "bundled",
                format: "app.zip",
                kind: "portable",
                size: 4_567,
            },
        );

        const result = projectReleaseManifest(manifest);

        expect(result.platforms.map((platform) => platform.os)).toEqual([
            "windows",
            "macos",
            "linux",
        ]);
        expect(result.assets.filter((asset) => asset.platform === "macos")).toEqual([
            expect.objectContaining({ format: "dmg", kind: "installer" }),
            expect.objectContaining({ format: "app.zip", kind: "portable" }),
        ]);
    });

    it("links assets through the release tag", () => {
        const entries = releaseAssetEntries(projectReleaseManifest(releaseManifest()));

        expect(entries.map((entry) => entry.name)).toEqual([
            "App_0.1.0_x64-setup-bundled.exe",
            "App_0.1.0_amd64-bundled.AppImage",
            "SHA256SUMS-github.txt",
        ]);
        expect(entries[0]?.url).toBe(
            "https://github.com/Av1ation-Association/Av1ation-Station/releases/download/v0.1.0-rc.3/App_0.1.0_x64-setup-bundled.exe",
        );
    });
});

describe("website release catalogue", () => {
    it("keeps a pre-release as the only release when no stable snapshot exists", () => {
        expect(catalogue()).toMatchObject({
            schema_version: 2,
            releases: [expect.objectContaining({ tag: "v0.1.0-rc.3", prerelease: true })],
        });
    });

    it("keeps a stable release as the only release", () => {
        const result = buildReleaseCatalogue({ latest: stableManifest() });

        expect(result.releases).toEqual([
            expect.objectContaining({ tag: "v0.1.0", version: "0.1.0", prerelease: false }),
        ]);
    });

    it("offers stable and a newer pre-release together", () => {
        const result = buildReleaseCatalogue({
            latest: releaseManifest({ tag: "v0.2.0-rc.1", version: "0.2.0-rc.1" }),
            stable: stableManifest("0.1.0"),
        });

        expect(result.releases.map((release) => release.tag)).toEqual(["v0.1.0", "v0.2.0-rc.1"]);
    });

    it("rejects a pre-release that is not newer than stable", () => {
        expect(() =>
            buildReleaseCatalogue({
                latest: releaseManifest({ tag: "v0.1.0-rc.2", version: "0.1.0-rc.2" }),
                stable: stableManifest("0.1.0"),
            }),
        ).toThrow(/not newer than stable/u);
    });

    it("rejects a duplicate stable snapshot", () => {
        expect(() =>
            buildReleaseCatalogue({
                latest: stableManifest(),
                stable: stableManifest(),
            }),
        ).toThrow(/duplicates/u);
    });

    it("orders SemVer release candidates below the matching stable release", () => {
        expect(compareReleaseVersions("0.2.0-rc.1", "0.1.0")).toBe(1);
        expect(compareReleaseVersions("0.1.0-rc.1", "0.1.0")).toBe(-1);
        expect(compareReleaseVersions("0.1.0", "0.1.0")).toBe(0);
    });

    it("checks every URL in both releases", async () => {
        const twoReleases = buildReleaseCatalogue({
            latest: releaseManifest({ tag: "v0.2.0-rc.1", version: "0.2.0-rc.1" }),
            stable: stableManifest("0.1.0"),
        });
        const fetchImpl = vi.fn(async () => ({
            status: 200,
            ok: true,
            headers: { get: () => null },
        }));

        await validateAssetUrls(twoReleases, { fetchImpl });

        expect(releaseCatalogueEntries(twoReleases)).toHaveLength(6);
        expect(fetchImpl).toHaveBeenCalledTimes(6);
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

        const results = await validateAssetUrls(catalogue(), { fetchImpl });

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

        await expect(validateAssetUrls(catalogue(), { fetchImpl })).rejects.toThrow(
            /bytes on GitHub/u,
        );
    });

    it("does not retry a missing asset", async () => {
        const fetchImpl = vi.fn(async () => ({
            status: 404,
            ok: false,
            headers: { get: () => null },
        }));

        await expect(validateAssetUrls(catalogue(), { fetchImpl })).rejects.toThrow(
            /missing release asset/u,
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
