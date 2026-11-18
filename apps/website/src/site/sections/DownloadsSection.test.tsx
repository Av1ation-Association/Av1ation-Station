// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Platform } from "../platform";
import type { PublishedRelease, ReleaseVariant } from "../releases";
import { DownloadsSection } from "./DownloadsSection";

const PLATFORMS: readonly Platform[] = ["windows", "macos", "linux"];
const PLATFORM_LABELS: Record<Platform, string> = {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
};

function fixtureRelease({
    tag,
    version,
    prerelease,
    published,
}: {
    tag: string;
    version: string;
    prerelease: boolean;
    published: string;
}): PublishedRelease {
    const repository = "Av1ation-Association/Av1ation-Station";
    const downloadUrl = `https://github.com/${repository}/releases/download/${tag}`;
    const variantsFor = (platform: Platform): readonly ReleaseVariant[] =>
        (["bundled", "system"] as const).map((id) => ({
            id,
            label: `${id} ${platform}`,
            recommended: id === "bundled",
            description: `${platform} ${id} build for the test fixture.`,
            assets: [
                {
                    label: `${platform} ${id}`,
                    name: `Av1ation.Station_${version}_${platform}-${id}.zip`,
                    format: "zip",
                    sizeMiB: 1,
                },
            ],
        }));
    const variants: Record<Platform, readonly ReleaseVariant[]> = {
        windows: variantsFor("windows"),
        macos: variantsFor("macos"),
        linux: variantsFor("linux"),
    };
    const platformLabels: Record<Platform, string> = {
        windows: "Windows x64",
        macos: "macOS arm64",
        linux: "Linux x64",
    };

    return {
        repository,
        version,
        tag,
        published,
        prerelease,
        downloadUrl,
        notesUrl: `https://github.com/${repository}/releases/tag/${tag}`,
        checksumsUrl: `${downloadUrl}/SHA256SUMS-github.txt`,
        platformLabels,
        availablePlatforms: PLATFORMS,
        platformSummary: "Windows x64, macOS arm64 and Linux x64",
        variants,
        assetCount: PLATFORMS.length * 2,
    };
}

function expectedHrefs(release: PublishedRelease, platform: Platform): readonly string[] {
    return [
        ...release.variants[platform].flatMap((variant) =>
            variant.assets.map(
                (asset) => `${release.downloadUrl}/${encodeURIComponent(asset.name)}`,
            ),
        ),
        release.checksumsUrl,
    ];
}

describe("DownloadsSection release chooser", () => {
    it("switches every download link between an older stable and a newer pre-release", () => {
        const stable = fixtureRelease({
            tag: "v0.1.0",
            version: "0.1.0",
            prerelease: false,
            published: "2026-11-01",
        });
        const prerelease = fixtureRelease({
            tag: "v0.2.0-rc.1",
            version: "0.2.0-rc.1",
            prerelease: true,
            published: "2026-11-18",
        });

        render(<DownloadsSection releases={[stable, prerelease]} initialTag={prerelease.tag} />);

        const chooser = screen.getByRole("group", { name: "Release channel" });
        const platformGroup = screen.getByRole("group", { name: "Download platform" });
        const section = screen.getByRole("region", { name: /Download/ });

        expect(within(chooser).getAllByRole("button")).toHaveLength(2);
        expect(
            within(chooser)
                .getByRole("button", { name: /0\.2\.0-rc\.1/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");

        const expectEveryLinkTo = (release: PublishedRelease): void => {
            for (const platform of PLATFORMS) {
                fireEvent.click(
                    within(platformGroup).getByRole("button", { name: PLATFORM_LABELS[platform] }),
                );
                const hrefs = [
                    ...section.querySelectorAll<HTMLAnchorElement>(
                        ".download-assets a, .downloads__note a",
                    ),
                ].map((link) => link.getAttribute("href"));

                expect(new Set(hrefs)).toEqual(new Set(expectedHrefs(release, platform)));
                expect(hrefs.every((href) => href?.includes(`/${release.tag}/`) === true)).toBe(
                    true,
                );
            }
        };

        expectEveryLinkTo(prerelease);

        fireEvent.click(within(chooser).getByRole("button", { name: /0\.1\.0$/ }));
        expect(
            within(chooser)
                .getByRole("button", { name: /0\.1\.0$/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        expectEveryLinkTo(stable);

        fireEvent.click(within(chooser).getByRole("button", { name: /0\.2\.0-rc\.1/ }));
        expectEveryLinkTo(prerelease);
    });
});
