import generated from "./release.generated.json";
import { PLATFORM_LABELS, type Platform } from "./platform";

export interface ReleaseAsset {
    readonly label: string;
    readonly name: string;
    readonly format: string;
    readonly sizeMiB: number;
}

export interface ReleaseVariant {
    readonly id: "bundled" | "system";
    readonly label: string;
    readonly recommended: boolean;
    readonly description: string;
    readonly assets: readonly ReleaseAsset[];
}

interface GeneratedAsset {
    readonly name: string;
    readonly platform: Platform;
    readonly variant: ReleaseVariant["id"];
    readonly format: string;
    readonly kind: "installer" | "portable";
    readonly size: number;
}

interface GeneratedRelease {
    readonly repository: string;
    readonly tag: string;
    readonly version: string;
    readonly published: string;
    readonly prerelease: boolean;
    readonly checksums: { readonly name: string; readonly size: number };
    readonly platforms: readonly {
        readonly os: Platform;
        readonly label: string;
    }[];
    readonly assets: readonly GeneratedAsset[];
}

interface GeneratedCatalogue {
    readonly repository: string;
    readonly releases: readonly GeneratedRelease[];
}

export interface PublishedRelease {
    readonly repository: string;
    readonly version: string;
    readonly tag: string;
    readonly published: string;
    readonly prerelease: boolean;
    readonly downloadUrl: string;
    readonly notesUrl: string;
    readonly checksumsUrl: string;
    readonly platformLabels: Record<Platform, string>;
    readonly availablePlatforms: readonly Platform[];
    readonly platformSummary: string;
    readonly variants: Record<Platform, readonly ReleaseVariant[]>;
    readonly assetCount: number;
}

const DATA = generated as GeneratedCatalogue;

const PLATFORMS: readonly Platform[] = ["windows", "macos", "linux"];
const VARIANT_ORDER: readonly ReleaseVariant["id"][] = ["bundled", "system"];

const VARIANT_COPY: Record<
    ReleaseVariant["id"],
    Pick<ReleaseVariant, "label" | "recommended" | "description">
> = {
    bundled: {
        label: "Bundled toolchain",
        recommended: true,
        description:
            "Includes FFmpeg, VapourSynth, MKVToolNix, the encoders, the scene model, and the native quality metrics.",
    },
    system: {
        label: "System toolchain",
        recommended: false,
        description:
            "Uses the tools already installed on your machine. No bundled Python, VapourSynth, encoders, or metrics.",
    },
};

const FORMAT_LABELS: Record<string, string> = {
    msi: "MSI installer",
    exe: "Installer (.exe)",
    zip: "Portable ZIP",
    deb: "Debian package",
    appimage: "AppImage",
    dmg: "Disk image",
    "app.zip": "App bundle ZIP",
    pkg: "Installer package",
    msix: "MSIX package",
    rpm: "RPM package",
    "tar.gz": "Portable archive",
};

function assetLabel(format: string): string {
    return FORMAT_LABELS[format] ?? format.toUpperCase();
}

function assetsFor(data: GeneratedRelease, platform: Platform): readonly GeneratedAsset[] {
    return data.assets.filter((asset) => asset.platform === platform);
}

function variantsFor(data: GeneratedRelease, platform: Platform): readonly ReleaseVariant[] {
    const assets = assetsFor(data, platform);
    return VARIANT_ORDER.flatMap((id) => {
        const variantAssets = assets
            .filter((asset) => asset.variant === id)
            .map((asset) => ({
                label: assetLabel(asset.format),
                name: asset.name,
                format: asset.format,
                sizeMiB: asset.size / (1024 * 1024),
            }));
        if (variantAssets.length === 0) {
            return [];
        }
        return [
            {
                id,
                ...VARIANT_COPY[id],
                assets: variantAssets,
            } satisfies ReleaseVariant,
        ];
    });
}

function joinLabels(labels: readonly string[]): string {
    if (labels.length === 0) {
        return "";
    }
    if (labels.length === 1) {
        return labels[0] ?? "";
    }
    return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
}

function buildRelease(data: GeneratedRelease): PublishedRelease {
    const platformLabels = Object.fromEntries(
        PLATFORMS.map((platform) => {
            const published = data.platforms.find((entry) => entry.os === platform);
            return [platform, published?.label ?? PLATFORM_LABELS[platform]];
        }),
    ) as Record<Platform, string>;
    const variants = {
        windows: variantsFor(data, "windows"),
        macos: variantsFor(data, "macos"),
        linux: variantsFor(data, "linux"),
    };
    const availablePlatforms = PLATFORMS.filter((platform) => variants[platform].length > 0);
    const repositoryUrl = `https://github.com/${data.repository}`;
    const releasesUrl = `${repositoryUrl}/releases`;
    const downloadUrl = `${releasesUrl}/download/${encodeURIComponent(data.tag)}`;

    return {
        repository: data.repository,
        version: data.version,
        tag: data.tag,
        published: data.published,
        prerelease: data.prerelease,
        downloadUrl,
        notesUrl: `${releasesUrl}/tag/${encodeURIComponent(data.tag)}`,
        checksumsUrl: `${downloadUrl}/${encodeURIComponent(data.checksums.name)}`,
        platformLabels,
        availablePlatforms,
        platformSummary: joinLabels(availablePlatforms.map((platform) => platformLabels[platform])),
        variants,
        assetCount: data.assets.length,
    };
}

/** The published releases in the checked-in catalogue, oldest first. */
export const RELEASES: readonly PublishedRelease[] = DATA.releases.map(buildRelease);

const latest = RELEASES.at(-1);
if (latest === undefined) {
    throw new Error("The website release catalogue has no published release.");
}

/** The release the site leads with: the newest stable or pre-release snapshot. */
export const RELEASE = latest;
export const STABLE = RELEASES.find((release) => !release.prerelease) ?? null;
export const PRERELEASE = RELEASES.find((release) => release.prerelease) ?? null;
export const REPOSITORY_URL = `https://github.com/${DATA.repository}`;
export const ALL_RELEASES_URL = `${REPOSITORY_URL}/releases`;

export function assetUrl(release: PublishedRelease, name: string): string {
    return `${release.downloadUrl}/${encodeURIComponent(name)}`;
}

export function releaseChannelLabel(release: PublishedRelease): string {
    return release.prerelease ? "Pre-release" : "Stable";
}

export function formatMiB(size: number): string {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(size)} MiB`;
}
