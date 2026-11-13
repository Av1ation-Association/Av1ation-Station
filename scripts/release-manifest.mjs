// Produce the two files a manual GitHub pre-release needs: a Markdown body and a manifest
// that names every upload asset with its platform, variant, kind, size and SHA-256.
//
// Everything is derived from `dist/release/SHA256SUMS.txt` and the files it names. A missing
// or changed artifact is an error, not a stale release note.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    linkSync,
    mkdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot, releaseDir, releasePlatform } from "./build-paths.mjs";

const checksumName = "SHA256SUMS.txt";
const githubChecksumName = "SHA256SUMS-github.txt";
const notesName = "RELEASE-NOTES.md";
const manifestName = "release-manifest.json";
const featureScreenshotMetadata = join(
    projectRoot,
    "dist",
    "screenshots",
    "feature-screenshots.json",
);
const flatAssetDirectory = "assets";
const platformOrder = ["windows", "macos", "linux"];
const variantOrder = ["bundled", "system"];

function git(args) {
    try {
        return execFileSync("git", args, {
            cwd: projectRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

function repository() {
    const remote = git(["remote", "get-url", "origin"]);
    const match = remote?.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/u);
    return match?.[1] ?? "Av1ation-Association/Av1ation-Station";
}

function normalizeArch(arch) {
    if (arch === "aarch64" || arch === "arm64") {
        return "arm64";
    }
    if (arch === "amd64" || arch === "x86_64" || arch === "x64") {
        return "x64";
    }
    return arch;
}

function archFromName(name) {
    const lower = name.toLowerCase();
    if (/(?:aarch64|arm64)/u.test(lower)) {
        return "arm64";
    }
    if (/(?:amd64|x86_64|x64)/u.test(lower)) {
        return "x64";
    }
    return normalizeArch(process.arch);
}

function platformInfo(os, arch) {
    const normalizedArch = normalizeArch(arch);
    const target =
        os === "windows"
            ? normalizedArch === "arm64"
                ? "aarch64-pc-windows-msvc"
                : "x86_64-pc-windows-msvc"
            : os === "macos"
              ? normalizedArch === "arm64"
                  ? "aarch64-apple-darwin"
                  : "x86_64-apple-darwin"
              : normalizedArch === "arm64"
                ? "aarch64-unknown-linux-gnu"
                : "x86_64-unknown-linux-gnu";
    const label = `${os === "macos" ? "macOS" : os === "windows" ? "Windows" : "Linux"} ${normalizedArch}`;
    return { os, arch: normalizedArch, target, label };
}

function sha256(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function mib(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function formatOf(name) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".appimage")) {
        return "appimage";
    }
    if (lower.endsWith(".tar.gz")) {
        return "tar.gz";
    }
    if (lower.endsWith(".app.zip")) {
        return "app.zip";
    }
    return lower.split(".").pop() ?? "file";
}

function kindOf(format) {
    if (["msi", "exe", "dmg", "deb", "rpm", "msix"].includes(format)) {
        return "installer";
    }
    if (["zip", "app.zip", "appimage", "tar.gz"].includes(format)) {
        return "portable";
    }
    return "asset";
}

function splitPath(path) {
    const segments = path.split("/");
    if (platformOrder.includes(segments[0]) && segments.length >= 3) {
        return { platform: segments[0], variant: segments[1] };
    }
    // Older release trees had `bundled/…` and `system/…` directly below `dist/release`.
    return { platform: releasePlatform(), variant: segments[0] ?? "release" };
}

function variantLabel(variant) {
    if (variant === "bundled") {
        return "Bundled toolchain";
    }
    if (variant === "system") {
        return "System toolchain";
    }
    return "Release";
}

function platformRank(os) {
    const index = platformOrder.indexOf(os);
    return index === -1 ? platformOrder.length : index;
}

function variantRank(variant) {
    const index = variantOrder.indexOf(variant);
    return index === -1 ? variantOrder.length : index;
}

function platformGroups(artifacts) {
    const groups = new Map();
    for (const artifact of artifacts) {
        let group = groups.get(artifact.platform);
        if (group === undefined) {
            group = { ...platformInfo(artifact.platform, artifact.arch), variants: new Map() };
            groups.set(artifact.platform, group);
        }
        const list = group.variants.get(artifact.variant) ?? [];
        list.push(artifact);
        group.variants.set(artifact.variant, list);
    }
    return [...groups.values()]
        .sort((left, right) => platformRank(left.os) - platformRank(right.os))
        .map((group) => ({
            ...group,
            variants: new Map(
                [...group.variants.entries()].sort(
                    ([left], [right]) => variantRank(left) - variantRank(right),
                ),
            ),
        }));
}

const releaseExtensions = [
    ".app.zip",
    ".tar.gz",
    ".appimage",
    ".msi",
    ".exe",
    ".zip",
    ".deb",
    ".rpm",
    ".dmg",
    ".pkg",
    ".msix",
];

function withVariantSuffix(name, variant) {
    const lower = name.toLowerCase();
    const extension = releaseExtensions.find((candidate) => lower.endsWith(candidate));
    if (extension === undefined) {
        throw new Error(`release asset has an unsupported extension: ${name}`);
    }
    const stem = name.slice(0, name.length - extension.length);
    return `${stem}-${variant}${name.slice(name.length - extension.length)}`;
}

function joinLabels(labels) {
    if (labels.length === 0) {
        return "this host";
    }
    if (labels.length === 1) {
        return labels[0];
    }
    return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function readArtifacts() {
    const checksumPath = join(releaseDir, checksumName);
    if (!existsSync(checksumPath)) {
        throw new Error(`missing ${checksumPath}; run the release build first`);
    }
    const artifacts = [];
    for (const line of readFileSync(checksumPath, "utf8").split(/\r?\n/u)) {
        if (line.trim() === "") {
            continue;
        }
        const match = /^([a-f0-9]{64}) {2}(.+)$/iu.exec(line);
        if (match === null) {
            throw new Error(`unrecognised checksum line: ${line}`);
        }
        const path = match[2].replaceAll("\\", "/");
        if (path.startsWith(`${flatAssetDirectory}/`)) {
            continue;
        }
        if (
            [
                "SHA256SUMS.txt",
                githubChecksumName,
                "RELEASE-NOTES.md",
                "release-manifest.json",
            ].includes(path)
        ) {
            continue;
        }
        const absolute = join(releaseDir, ...path.split("/"));
        if (!existsSync(absolute)) {
            throw new Error(`checksum names a missing file: ${path}`);
        }
        const size = statSync(absolute).size;
        const digest = sha256(absolute);
        if (digest !== match[1].toLowerCase()) {
            throw new Error(`checksum does not match ${path}`);
        }
        const sourceName = basename(path);
        const { platform, variant } = splitPath(path);
        const name =
            variant === "bundled" || variant === "system"
                ? withVariantSuffix(sourceName, variant)
                : sourceName;
        artifacts.push({
            name,
            path: `${flatAssetDirectory}/${name}`,
            sourcePath: absolute,
            platform,
            arch: archFromName(name),
            variant,
            format: formatOf(sourceName),
            kind: kindOf(formatOf(sourceName)),
            size,
            sha256: digest,
        });
    }
    return artifacts;
}

/**
 * The optional feature-screenshot manifest produced by
 * `npm run screenshots:features -- <group-or-id>`.
 *
 * It is the only screenshot input release notes accept: a general build has no gallery
 * section at all, and a feature note is explicitly requested when the feature has something
 * visible to show. The AVIFs stay local; the notes name placeholder URLs for an inline
 * GitHub upload.
 */
function readFeatureScreenshots() {
    if (!existsSync(featureScreenshotMetadata)) {
        return [];
    }
    let document;
    try {
        document = JSON.parse(readFileSync(featureScreenshotMetadata, "utf8"));
    } catch (error) {
        throw new Error(`could not read ${featureScreenshotMetadata}: ${error.message}`);
    }
    if (!Array.isArray(document?.screens)) {
        throw new Error(`${featureScreenshotMetadata} must carry a screens array`);
    }
    const ids = new Set();
    return document.screens.map((entry, index) => {
        const id = typeof entry?.id === "string" ? entry.id.trim() : "";
        const title = typeof entry?.title === "string" ? entry.title.trim() : "";
        const caption = typeof entry?.caption === "string" ? entry.caption.trim() : "";
        const alt = typeof entry?.alt === "string" ? entry.alt.trim() : "";
        const route = typeof entry?.route === "string" ? entry.route.trim() : "";
        const feature = typeof entry?.feature === "string" ? entry.feature.trim() : "";
        const dark = typeof entry?.images?.dark === "string" ? entry.images.dark.trim() : "";
        const light = typeof entry?.images?.light === "string" ? entry.images.light.trim() : "";
        if (id === "" || title === "" || caption === "" || alt === "" || route === "") {
            throw new Error(`feature screenshot ${index} needs an id, title, caption, alt, route`);
        }
        if (feature === "" || dark === "" || light === "") {
            throw new Error(`feature screenshot ${id} needs a feature and both theme images`);
        }
        if (ids.has(id)) {
            throw new Error(`duplicate feature screenshot id: ${id}`);
        }
        ids.add(id);
        return { id, title, caption, alt, route, feature, images: { dark, light } };
    });
}

function featurePlaceholder(title, theme) {
    const token = title
        .toUpperCase()
        .replace(/[^A-Z0-9]+/gu, "_")
        .replace(/^_+|_+$/gu, "");
    return `PASTE_${token}_${theme.toUpperCase()}_IMAGE_URL`;
}

function writeGithubChecksums(artifacts) {
    const names = new Set();
    for (const artifact of artifacts) {
        if (names.has(artifact.name)) {
            throw new Error(`duplicate upload asset name: ${artifact.name}`);
        }
        names.add(artifact.name);
    }
    const lines = artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`);
    writeFileSync(join(releaseDir, githubChecksumName), `${lines.join("\n")}\n`);
}

function stageFlatAssets(artifacts) {
    const directory = join(releaseDir, flatAssetDirectory);
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    const names = new Set();
    for (const artifact of artifacts) {
        if (names.has(artifact.name)) {
            throw new Error(`duplicate flat release asset name: ${artifact.name}`);
        }
        names.add(artifact.name);
        const destination = join(directory, artifact.name);
        try {
            linkSync(artifact.sourcePath, destination);
        } catch {
            // Hard links avoid duplicating multi-gigabyte installers. A filesystem without
            // link support still gets a usable flat upload tree, at the cost of a copy.
            copyFileSync(artifact.sourcePath, destination);
        }
    }
    return directory;
}

function checksumsAsset() {
    const path = join(releaseDir, flatAssetDirectory, githubChecksumName);
    const size = statSync(path).size;
    return {
        name: githubChecksumName,
        path: `${flatAssetDirectory}/${githubChecksumName}`,
        variant: "release",
        format: "txt",
        kind: "checksums",
        size,
        sha256: sha256(path),
    };
}

function notesFor({
    artifacts,
    platforms,
    featureScreenshots,
    version,
    tag,
    sourceCommit,
    branch,
}) {
    const platformSummary = joinLabels(platforms.map((platform) => platform.label));
    const rows = platforms.flatMap((platform) =>
        [...platform.variants.entries()].map(([variant, list]) => {
            const installers = list
                .filter((artifact) => artifact.kind === "installer")
                .map((artifact) => `\`${artifact.name}\` (${mib(artifact.size)})`)
                .join("<br>");
            const portable = list
                .filter((artifact) => artifact.kind === "portable")
                .map((artifact) => `\`${artifact.name}\` (${mib(artifact.size)})`)
                .join("<br>");
            return `| ${platform.label} | ${variantLabel(variant)} | ${installers || "—"} | ${portable || "—"} |`;
        }),
    );
    const hasBundled = artifacts.some((artifact) => artifact.variant === "bundled");
    const hasSystem = artifacts.some((artifact) => artifact.variant === "system");
    const hasWindows = platforms.some((platform) => platform.os === "windows");
    const hasMacos = platforms.some((platform) => platform.os === "macos");
    const hasLinux = platforms.some((platform) => platform.os === "linux");
    const hasWindowsBundled = artifacts.some(
        (artifact) => artifact.platform === "windows" && artifact.variant === "bundled",
    );
    const hasLinuxBundled = artifacts.some(
        (artifact) => artifact.platform === "linux" && artifact.variant === "bundled",
    );
    const hasLinuxSystem = artifacts.some(
        (artifact) => artifact.platform === "linux" && artifact.variant === "system",
    );
    const guidance = [
        hasBundled
            ? "- **Bundled variants** carry the providers staged for that platform. Capabilities that are not staged fall back to System."
            : null,
        hasWindowsBundled
            ? "- **Windows bundled** includes the pinned VapourSynth/Python runtime, encoders, FFmpeg, MKVToolNix, the scene model, and native metrics."
            : null,
        hasLinuxBundled
            ? "- **Linux bundled** adds the available encoders, FFmpeg, MKVToolNix, the scene model, and their staged runtime libraries. VapourSynth/Python and the native metrics (libvmaf, fmetrics, vship) remain System providers in this pre-release."
            : null,
        hasSystem
            ? "- **System toolchain** carries the application and web assets only, with no `tools/` tree. It uses the Python, VapourSynth, FFmpeg, MKVToolNix, and encoders already installed on the machine, so select providers in Settings → Dependencies."
            : null,
        hasLinuxSystem
            ? "- **Linux system** uses the distribution's providers and the portable AppImage. It does not include a bundled VapourSynth or Python runtime."
            : null,
    ].filter(Boolean);
    const installSections = [];
    if (hasWindows) {
        installSections.push(`### Windows

Run the \`.msi\` or \`-setup.exe\` for the variant you want. The installers are unsigned, so Windows SmartScreen may show a warning; verify the SHA-256 below before choosing **More info → Run anyway**.

To use a portable ZIP, unzip it and run \`av1ation-desktop.exe\`. Keep \`web/\` beside the executable. The bundled portable also needs its \`tools/\` directory beside the executable. The system portable has no \`tools/\` directory and expects system providers.

Windows 10 or 11 x64 and the WebView2 Runtime are required. WebView2 is normally present on current Windows installations.`);
    }
    if (hasMacos) {
        installSections.push(`### macOS

Open the \`.dmg\` and drag the application to Applications, or unzip the \`.app.zip\` portable. The application is unsigned and not notarised; use the documented Gatekeeper override after verifying the SHA-256.`);
    }
    if (hasLinux) {
        installSections.push(`### Linux

Install the \`.deb\` with \`sudo apt install ./<file>.deb\`. It declares WebKitGTK 4.1 as a runtime dependency.

The AppImage is the portable form. Make it executable with \`chmod +x <file>.AppImage\` and run it. If FUSE 2 is unavailable, run it with \`--appimage-extract-and-run\`.

${hasLinuxBundled ? "The bundled Linux variant carries the available encoders, FFmpeg, MKVToolNix, the scene model, and their staged runtime libraries; VapourSynth/Python and the native metrics (libvmaf, fmetrics, vship) remain System providers.\n\n" : ""}${hasLinuxSystem ? "The system Linux variant uses the distribution's Python, VapourSynth, FFmpeg, MKVToolNix, and encoders.\n\n" : ""}The build was produced on Debian 13 and requires glibc 2.39 or newer; Debian 12 and Ubuntu 22.04 are not supported by this pre-release. The \`.deb\` is the native installer and the AppImage is the portable fallback.`);
    }
    const missingPlatforms = [
        ["windows", "Windows"],
        ["macos", "macOS"],
        ["linux", "Linux"],
    ]
        .filter(([os]) => !platforms.some((platform) => platform.os === os))
        .map(([, label]) => label);
    const limitations = [
        "- This is a **pre-release**, not a stable release. Project files and settings may change.",
        `- **${platformSummary} artifacts only.**${
            missingPlatforms.length === 0
                ? ""
                : ` ${joinLabels(missingPlatforms)} artifacts are not included.`
        }`,
        hasLinux && hasLinuxBundled
            ? "- The Linux bundled variant is **partial**: VapourSynth/Python and the native metrics (libvmaf, fmetrics, vship) are not bundled. Select System for those capabilities."
            : hasLinux
              ? "- The Linux artifacts use the **system toolchain only**. A bundled Linux toolchain is not included in this drop."
              : null,
        "- The installers and portable executables are **unsigned**. There is no Authenticode signature, updater, or auto-update path.",
        "- The generated third-party notices, SPDX SBOM, and source-offer bundle are not attached yet. Do not treat this as the final public distribution.",
        "- The full manual release test plan has not been completed. The Linux artifacts were built in a Debian 13 container and require glibc 2.39 or newer; install and run them on a clean target before relying on them for production work.",
    ].filter(Boolean);
    const checksums = artifacts
        .map((artifact) => `${artifact.sha256}  ${artifact.name}`)
        .join("\n");
    const featureSection =
        featureScreenshots.length === 0
            ? ""
            : `## Feature screenshots\n\n${featureScreenshots
                  .map(
                      (screenshot) =>
                          `### ${screenshot.title}\n\n| Dark | Light |\n| --- | --- |\n| ![${screenshot.alt}](${featurePlaceholder(screenshot.title, "dark")}) | ![${screenshot.alt}](${featurePlaceholder(screenshot.title, "light")}) |\n\n${screenshot.caption}`,
                  )
                  .join("\n\n")}\n\n`;

    return `# Av1ation Station ${version} — ${platformSummary} pre-release

> **Pre-release.** This is an unsigned test candidate. It is not the final public release, and it has not completed the full clean-VM release matrix. Only ${platformSummary} artifacts are included.

Av1ation Station is a desktop workspace for scene-aware, quality-targeted video encoding with Av1an. Queue videos, configure the encoder, edit scenes, inspect charts and logs, and follow every run from one window.

${featureSection}## Downloads

| Platform | Variant | Installer | Portable |
| --- | --- | --- | --- |
${rows.join("\n")}

${guidance.join("\n")}

## Install and run

${installSections.join("\n\n")}

## SHA-256

The attached \`SHA256SUMS-github.txt\` uses the uploaded asset names, so it can be checked from a folder of downloads. The build tree's \`SHA256SUMS.txt\` keeps the platform and variant paths for local verification. These are the same hashes:

\`\`\`text
${checksums}
\`\`\`

## Known limitations

${limitations.join("\n")}

## Source and licence

Built from \`${sourceCommit}\` on \`${branch}\` (tag target: \`${tag}\`).

Source: https://github.com/${repository()}/tree/${sourceCommit}

Av1ation Station is distributed under the GPL-3.0. The bundled tools retain their own licences; see the repository and the eventual third-party notices for details.
`;
}

function writeReleaseManifest() {
    const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
    const version = pkg.version;
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "condor";
    const sourceCommit = git(["rev-parse", "HEAD"]) ?? "unknown";
    const explicitTag = process.argv.indexOf("--tag");
    const tag = explicitTag === -1 ? `v${version}` : process.argv[explicitTag + 1];
    if (typeof tag !== "string" || tag.trim() === "") {
        throw new Error("--tag must be followed by a tag name");
    }

    const artifacts = readArtifacts();
    if (artifacts.length === 0) {
        throw new Error(`no artifacts found under ${releaseDir}`);
    }
    const platforms = platformGroups(artifacts);
    const featureScreenshots = readFeatureScreenshots();
    const platformSummary = joinLabels(platforms.map((platform) => platform.label));
    writeGithubChecksums(artifacts);
    const flatDirectory = stageFlatAssets(artifacts);
    copyFileSync(join(releaseDir, githubChecksumName), join(flatDirectory, githubChecksumName));
    const assets = [
        ...artifacts.map((artifact) => ({
            name: artifact.name,
            path: artifact.path,
            platform: artifact.platform,
            arch: artifact.arch,
            variant: artifact.variant,
            format: artifact.format,
            kind: artifact.kind,
            size: artifact.size,
            sha256: artifact.sha256,
        })),
        checksumsAsset(),
    ];
    const notes = notesFor({
        artifacts,
        platforms,
        featureScreenshots,
        version,
        tag,
        sourceCommit,
        branch,
    });
    const manifest = {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        repository: repository(),
        release: {
            tag,
            name: `Av1ation Station ${version} (${platformSummary} pre-release)`,
            version,
            prerelease: true,
            draft: false,
            target_commitish: branch,
            source_commit: sourceCommit,
            body_file: notesName,
            checksums_file: githubChecksumName,
            local_checksums_file: checksumName,
        },
        platforms: platforms.map((platform) => ({
            os: platform.os,
            arch: platform.arch,
            target: platform.target,
            label: platform.label,
            variants: [...platform.variants.keys()],
        })),
        ...(featureScreenshots.length === 0 ? {} : { feature_screenshots: featureScreenshots }),
        assets,
        asset_count: assets.length,
        upload: {
            directory: flatAssetDirectory,
            notes_file: notesName,
            checksums_file: `${flatAssetDirectory}/${githubChecksumName}`,
            asset_paths: assets.map((asset) => asset.path),
        },
    };

    writeFileSync(join(releaseDir, notesName), notes);
    writeFileSync(join(releaseDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Release notes: ${join(releaseDir, notesName)}`);
    console.log(`Release manifest: ${join(releaseDir, manifestName)}`);
    console.log(`Tag: ${tag}; platforms: ${platformSummary}; assets: ${assets.length}`);
}

export { writeReleaseManifest };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        writeReleaseManifest();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
