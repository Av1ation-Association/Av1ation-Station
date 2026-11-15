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

const DATA = generated as GeneratedRelease;

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

function assetsFor(platform: Platform): readonly GeneratedAsset[] {
    return DATA.assets.filter((asset) => asset.platform === platform);
}

function variantsFor(platform: Platform): readonly ReleaseVariant[] {
    const assets = assetsFor(platform);
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

const platformLabels = Object.fromEntries(
    PLATFORMS.map((platform) => {
        const published = DATA.platforms.find((entry) => entry.os === platform);
        return [platform, published?.label ?? PLATFORM_LABELS[platform]];
    }),
) as Record<Platform, string>;

const variants: Record<Platform, readonly ReleaseVariant[]> = {
    windows: variantsFor("windows"),
    macos: variantsFor("macos"),
    linux: variantsFor("linux"),
};

const availablePlatforms = PLATFORMS.filter((platform) => variants[platform].length > 0);

const repositoryUrl = `https://github.com/${DATA.repository}`;
const releasesUrl = `${repositoryUrl}/releases`;
const downloadUrl = `${releasesUrl}/download/${encodeURIComponent(DATA.tag)}`;

/**
 * The published release, projected from the checked-in release manifest by
 * `scripts/website-release.mjs`.
 *
 * Asset names, sizes, tag, and publication date come from that manifest. The visible
 * version comes from `package.json`, the repository's one version source. Presentation copy
 * stays here because it is website language, not release metadata.
 */
export const RELEASE = {
    version: DATA.version,
    tag: DATA.tag,
    published: DATA.published,
    prerelease: DATA.prerelease,
    notesUrl: `${releasesUrl}/tag/${encodeURIComponent(DATA.tag)}`,
    allReleasesUrl: releasesUrl,
    checksumsUrl: `${downloadUrl}/${encodeURIComponent(DATA.checksums.name)}`,
    repositoryUrl,
    platformLabels,
    availablePlatforms,
    platformSummary: joinLabels(availablePlatforms.map((platform) => platformLabels[platform])),
    variants,
};

export function assetUrl(name: string): string {
    return `${downloadUrl}/${encodeURIComponent(name)}`;
}

export function formatMiB(size: number): string {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(size)} MiB`;
}
