// Generate the small release-download projection the website bundles.
//
// `apps/website/release-manifest.json` is the newest published release, and the optional
// `stable-release-manifest.json` keeps an older stable release beside a newer pre-release.
// The release's own version, tag, publication date, asset names, and byte sizes supply the
// projection. A draft is rejected because its assets are not publicly downloadable. The
// generated projection is committed because the website builds without a GitHub request.
//
// `--check` rejects a stale projection. `--urls` additionally performs a HEAD request for
// every download and compares GitHub's Content-Length with the manifest size.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot } from "./build-paths.mjs";

export const SOURCE_PATH = join(projectRoot, "apps", "website", "release-manifest.json");
export const STABLE_SOURCE_PATH = join(
    projectRoot,
    "apps",
    "website",
    "stable-release-manifest.json",
);
export const OUTPUT_PATH = join(
    projectRoot,
    "apps",
    "website",
    "src",
    "site",
    "release.generated.json",
);
const PLATFORM_ORDER = ["windows", "macos", "linux"];
const PLATFORM_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux" };
const VARIANT_ORDER = ["bundled", "system"];
const FORMAT_ORDER = [
    "msi",
    "exe",
    "zip",
    "deb",
    "appimage",
    "dmg",
    "app.zip",
    "pkg",
    "msix",
    "rpm",
    "tar.gz",
];
const ASSET_KINDS = new Set(["installer", "portable"]);
const TAG_PATTERN = /^v[A-Za-z0-9._-]+$/u;
const WEEKLY_TAG_PATTERN = /^v(\d+\.\d+\.\d+)-weekly\.(\d{8})$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function fail(message) {
    throw new Error(message);
}

function object(value, label) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail(`${label} must be an object`);
    }
    return value;
}

function text(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(`${label} must be a non-empty string`);
    }
    return value.trim();
}

function bool(value, label) {
    if (typeof value !== "boolean") {
        fail(`${label} must be a boolean`);
    }
    return value;
}

function count(value, label) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
        fail(`${label} must be a positive integer`);
    }
    return value;
}

function isoDate(value, label) {
    const raw = text(value, label);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        fail(`${label} must be an ISO date`);
    }
    return parsed.toISOString().slice(0, 10);
}

function rank(list, value) {
    const index = list.indexOf(value);
    return index === -1 ? list.length : index;
}

function parseSemver(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(value);
    if (match === null) {
        fail(`version is not SemVer: ${value}`);
    }
    return {
        core: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4]?.split(".") ?? [],
    };
}

/** SemVer precedence, used to decide whether a pre-release may join a stable release. */
export function compareReleaseVersions(left, right) {
    const first = parseSemver(text(left, "left version"));
    const second = parseSemver(text(right, "right version"));
    for (let index = 0; index < first.core.length; index += 1) {
        const difference = first.core[index] - second.core[index];
        if (difference !== 0) {
            return difference < 0 ? -1 : 1;
        }
    }
    if (first.prerelease.length === 0 || second.prerelease.length === 0) {
        return first.prerelease.length === second.prerelease.length
            ? 0
            : first.prerelease.length === 0
              ? 1
              : -1;
    }
    for (
        let index = 0;
        index < Math.max(first.prerelease.length, second.prerelease.length);
        index += 1
    ) {
        const firstPart = first.prerelease[index];
        const secondPart = second.prerelease[index];
        if (firstPart === undefined || secondPart === undefined) {
            return firstPart === secondPart ? 0 : firstPart === undefined ? -1 : 1;
        }
        if (firstPart === secondPart) {
            continue;
        }
        const firstNumeric = /^\d+$/u.test(firstPart);
        const secondNumeric = /^\d+$/u.test(secondPart);
        if (firstNumeric && secondNumeric) {
            return Number(firstPart) < Number(secondPart) ? -1 : 1;
        }
        if (firstNumeric !== secondNumeric) {
            return firstNumeric ? -1 : 1;
        }
        return firstPart < secondPart ? -1 : 1;
    }
    return 0;
}

function readPlatformLabels(manifest, downloadAssets) {
    const entries = Array.isArray(manifest.platforms) ? manifest.platforms : [];
    const labels = new Map();
    for (const [index, raw] of entries.entries()) {
        const platform = object(raw, `platforms[${index}]`);
        const os = text(platform.os, `platforms[${index}].os`);
        if (!PLATFORM_ORDER.includes(os)) {
            continue;
        }
        const arch = text(platform.arch, `platforms[${index}].arch`);
        const label =
            typeof platform.label === "string" && platform.label.trim() !== ""
                ? platform.label.trim()
                : `${PLATFORM_NAMES[os]} ${arch}`;
        labels.set(os, { os, arch, label });
    }
    for (const asset of downloadAssets) {
        if (!labels.has(asset.platform)) {
            labels.set(asset.platform, {
                os: asset.platform,
                arch: asset.arch,
                label: `${PLATFORM_NAMES[asset.platform]} ${asset.arch}`,
            });
        }
    }
    return [...labels.values()].sort(
        (left, right) => rank(PLATFORM_ORDER, left.os) - rank(PLATFORM_ORDER, right.os),
    );
}

/**
 * Reduce a release manifest to the website's download projection.
 *
 * A full `release-manifest.json` has extra release-channel and audit fields; they are ignored.
 * Only installers, portables, and the checksum file cross into the published site.
 */
export function projectReleaseManifest(manifest) {
    const root = object(manifest, "release manifest");
    if (root.schema_version !== 1) {
        fail("release manifest schema_version must be 1");
    }
    const repository = text(root.repository, "repository");
    if (!REPOSITORY_PATTERN.test(repository)) {
        fail(`repository must be owner/name, got ${repository}`);
    }
    const release = object(root.release, "release");
    if (release.draft === true) {
        fail("a draft release cannot be projected to the website");
    }
    const tag = text(release.tag, "release.tag");
    if (!TAG_PATTERN.test(tag)) {
        fail(`release.tag is not a safe release tag: ${tag}`);
    }
    const version = text(release.version, "release.version");
    if (!VERSION_PATTERN.test(version)) {
        fail(`release.version is not SemVer: ${version}`);
    }
    const weeklyTag = WEEKLY_TAG_PATTERN.exec(tag);
    const weeklyPrefix = weeklyTag === null ? null : `${weeklyTag[1]}-weekly.${weeklyTag[2]}.`;
    const tagMatchesVersion =
        tag === `v${version}` ||
        (weeklyPrefix !== null &&
            version.startsWith(weeklyPrefix) &&
            /^[0-9a-f]{7}$/u.test(version.slice(weeklyPrefix.length)));
    if (!tagMatchesVersion) {
        fail(`release.tag ${tag} does not describe release.version ${version}`);
    }
    const prerelease = bool(release.prerelease, "release.prerelease");
    const published = isoDate(release.published_at, "release.published_at");
    const checksumsName = text(release.checksums_file, "release.checksums_file");

    if (!Array.isArray(root.assets) || root.assets.length === 0) {
        fail("release manifest must contain assets");
    }
    const names = new Set();
    const downloadAssets = [];
    let checksums = null;
    for (const [index, raw] of root.assets.entries()) {
        const asset = object(raw, `assets[${index}]`);
        const name = text(asset.name, `assets[${index}].name`);
        if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
            fail(`asset name must be a file name: ${name}`);
        }
        if (names.has(name)) {
            fail(`duplicate release asset name: ${name}`);
        }
        names.add(name);
        const size = count(asset.size, `assets[${index}].size`);
        const kind = text(asset.kind, `assets[${index}].kind`);
        if (kind === "checksums") {
            checksums = { name, size };
            continue;
        }
        if (!ASSET_KINDS.has(kind)) {
            continue;
        }
        const platform = text(asset.platform, `assets[${index}].platform`);
        if (!PLATFORM_ORDER.includes(platform)) {
            fail(`asset ${name} has an unsupported platform: ${platform}`);
        }
        const variant = text(asset.variant, `assets[${index}].variant`);
        if (!VARIANT_ORDER.includes(variant)) {
            fail(`asset ${name} has an unsupported variant: ${variant}`);
        }
        downloadAssets.push({
            name,
            platform,
            arch: text(asset.arch, `assets[${index}].arch`),
            variant,
            format: text(asset.format, `assets[${index}].format`).toLowerCase(),
            kind,
            size,
        });
    }
    if (downloadAssets.length === 0) {
        fail("release manifest has no installer or portable assets");
    }
    if (checksums === null || checksums.name !== checksumsName) {
        fail(`release manifest is missing checksum asset ${checksumsName}`);
    }
    downloadAssets.sort(
        (left, right) =>
            rank(PLATFORM_ORDER, left.platform) - rank(PLATFORM_ORDER, right.platform) ||
            rank(VARIANT_ORDER, left.variant) - rank(VARIANT_ORDER, right.variant) ||
            rank(FORMAT_ORDER, left.format) - rank(FORMAT_ORDER, right.format) ||
            left.name.localeCompare(right.name),
    );
    return {
        repository,
        tag,
        version,
        published,
        prerelease,
        checksums,
        platforms: readPlatformLabels(root, downloadAssets),
        assets: downloadAssets,
        asset_count: downloadAssets.length,
    };
}

/**
 * Build the site's release catalogue from the newest published release and an optional
 * older stable release. A pre-release is only offered when its SemVer is newer than stable.
 */
export function buildReleaseCatalogue({ latest, stable = null }) {
    const latestRelease = projectReleaseManifest(latest);
    if (!latestRelease.prerelease) {
        if (stable !== null) {
            fail("stable-release-manifest.json duplicates a stable release-manifest.json");
        }
        return {
            schema_version: 2,
            generated_by: "scripts/website-release.mjs",
            repository: latestRelease.repository,
            releases: [latestRelease],
        };
    }
    if (stable === null) {
        return {
            schema_version: 2,
            generated_by: "scripts/website-release.mjs",
            repository: latestRelease.repository,
            releases: [latestRelease],
        };
    }

    const stableRelease = projectReleaseManifest(stable);
    if (stableRelease.prerelease) {
        fail("stable-release-manifest.json must describe a stable release");
    }
    if (stableRelease.repository !== latestRelease.repository) {
        fail("the two website release snapshots name different repositories");
    }
    if (compareReleaseVersions(latestRelease.version, stableRelease.version) <= 0) {
        fail(
            `pre-release ${latestRelease.version} is not newer than stable ${stableRelease.version}; ` +
                "remove stable-release-manifest.json or update release-manifest.json",
        );
    }
    return {
        schema_version: 2,
        generated_by: "scripts/website-release.mjs",
        repository: latestRelease.repository,
        releases: [stableRelease, latestRelease],
    };
}

/** Stable serialisation, so `--check` is a byte comparison rather than a semantic guess. */
export function renderReleaseProjection(projection) {
    return `${JSON.stringify(projection, null, 4)}\n`;
}

function encodePathSegment(value) {
    return encodeURIComponent(value);
}

/** Every URL the site links to, plus the expected byte size for the HEAD check. */
export function releaseAssetEntries(release) {
    const base = `https://github.com/${release.repository}/releases/download/${encodePathSegment(release.tag)}`;
    return [
        ...release.assets.map((asset) => ({
            name: asset.name,
            size: asset.size,
            url: `${base}/${encodePathSegment(asset.name)}`,
        })),
        {
            name: release.checksums.name,
            size: release.checksums.size,
            url: `${base}/${encodePathSegment(release.checksums.name)}`,
        },
    ];
}

/** Every URL across the stable and pre-release snapshots. */
export function releaseCatalogueEntries(catalogue) {
    return catalogue.releases.flatMap((release) => releaseAssetEntries(release));
}

async function headEntry(entry, { fetchImpl, timeoutMs, attempts }) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
        }, timeoutMs);
        try {
            const response = await fetchImpl(entry.url, {
                method: "HEAD",
                redirect: "follow",
                signal: controller.signal,
                headers: { "user-agent": "av1ation-website-release-check" },
            });
            if (response.status === 404) {
                fail(`missing release asset: ${entry.name} (${entry.url})`);
            }
            if (response.status === 429 || response.status >= 500) {
                lastError = new Error(
                    `${entry.name} returned HTTP ${String(response.status)} from ${entry.url}`,
                );
                continue;
            }
            if (!response.ok) {
                fail(`${entry.name} returned HTTP ${String(response.status)} from ${entry.url}`);
            }
            const header = response.headers.get("content-length");
            if (header !== null && Number(header) !== entry.size) {
                fail(
                    `${entry.name} is ${header} bytes on GitHub but the manifest says ${String(entry.size)}`,
                );
            }
            return { name: entry.name, bytes: entry.size, url: entry.url };
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("missing release asset:")) {
                throw error;
            }
            if (error instanceof Error && error.message.includes("bytes on GitHub")) {
                throw error;
            }
            lastError = error;
            if (error instanceof Error && error.name === "AbortError") {
                lastError = new Error(`${entry.name} timed out after ${String(timeoutMs)} ms`);
            }
        } finally {
            clearTimeout(timer);
        }
    }
    throw new Error(
        `${entry.name} could not be verified: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
}

/**
 * Confirm every linked asset exists and still has the manifest's size.
 *
 * GitHub redirects a browser download URL to its asset host; redirects are followed and only
 * the final 2xx response is accepted. Injectable for the unit test, which never uses the network.
 */
export async function validateAssetUrls(
    catalogue,
    { fetchImpl = globalThis.fetch, timeoutMs = 20_000, attempts = 2, log = () => {} } = {},
) {
    if (typeof fetchImpl !== "function") {
        fail("this Node build has no fetch implementation");
    }
    const results = [];
    for (const entry of releaseCatalogueEntries(catalogue)) {
        const result = await headEntry(entry, { fetchImpl, timeoutMs, attempts });
        log(`ok ${String(result.bytes).padStart(10)} bytes  ${result.name}`);
        results.push(result);
    }
    return results;
}

/** Parse `--check` and `--urls`; unknown options are rejected rather than ignored. */
export function parseArguments(argv) {
    const flags = { check: false, urls: false };
    for (const argument of argv) {
        if (argument === "--check") {
            flags.check = true;
        } else if (argument === "--urls") {
            flags.urls = true;
        } else if (argument === "--help") {
            flags.help = true;
        } else {
            fail(`unknown argument: ${argument}`);
        }
    }
    return flags;
}

function usage() {
    return [
        "Usage: node scripts/website-release.mjs [--check] [--urls]",
        "",
        "  (no flags)  Regenerate apps/website/src/site/release.generated.json",
        "  --check     Fail when the generated projection is stale",
        "  --urls      HEAD every linked asset and compare its size with the manifest",
    ].join("\n");
}

async function main() {
    const flags = parseArguments(process.argv.slice(2));
    if (flags.help === true) {
        console.log(usage());
        return;
    }
    const latest = JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
    const stable = existsSync(STABLE_SOURCE_PATH)
        ? JSON.parse(readFileSync(STABLE_SOURCE_PATH, "utf8"))
        : null;
    const catalogue = buildReleaseCatalogue({ latest, stable });
    const rendered = renderReleaseProjection(catalogue);
    if (flags.check) {
        if (!existsSync(OUTPUT_PATH)) {
            fail("release.generated.json is missing; run npm run release:website");
        }
        if (readFileSync(OUTPUT_PATH, "utf8") !== rendered) {
            fail("release.generated.json is stale; run npm run release:website and review it");
        }
        console.log(
            `Website release metadata is current for ${catalogue.releases.map((release) => release.tag).join(", ")}.`,
        );
    } else {
        writeFileSync(OUTPUT_PATH, rendered);
        console.log(`Website release metadata: ${OUTPUT_PATH}`);
        console.log(
            `Releases: ${catalogue.releases.map((release) => `${release.tag} (${release.version})`).join(", ")}`,
        );
    }
    if (flags.urls) {
        const results = await validateAssetUrls(catalogue, { log: (line) => console.log(line) });
        console.log(`Validated ${String(results.length)} release download URLs.`);
    }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
