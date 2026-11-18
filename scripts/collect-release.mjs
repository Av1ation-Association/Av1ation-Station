// Tauri writes platform bundles under the Cargo target, while local packaging keeps only
// installers and archives in `dist/release`. Collecting after a successful bundle keeps that
// documented location true for both the desktop and system-toolchain wrappers.
//
// Bundled and system builds share one Tauri output tree, so each variant owns a subdirectory
// and is filtered by its product name and version. A Windows portable is the release binary
// plus the resources Tauri resolves from the executable's directory; a macOS portable is a
// zip of the `.app` plus the `portable` marker beside it; a Linux AppImage is already the
// portable form, with an opt-in marker beside it for install-local data.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

import {
    cargoTarget,
    desktopBuild,
    projectRoot,
    releaseDir,
    releasePlatform,
    stagedTools,
} from "./build-paths.mjs";

const artifactPattern = /\.(?:msi|exe|dmg|pkg|deb|rpm|appimage|msix|zip|tar\.gz|sig)$/i;
const checksumName = "SHA256SUMS.txt";
const githubChecksumName = "SHA256SUMS-github.txt";
const flatAssetDirectory = "assets";
const metadataNames = new Set([
    checksumName,
    githubChecksumName,
    "RELEASE-NOTES.md",
    "release-manifest.json",
]);

function packageVersion() {
    return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).version;
}

function targetArch() {
    if (process.arch === "x64") {
        return "x64";
    }
    if (process.arch === "arm64") {
        return "aarch64";
    }
    return process.arch;
}

function sizeOf(path) {
    const info = statSync(path);
    if (info.isFile()) {
        return info.size;
    }
    let total = 0;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
        total += sizeOf(join(path, entry.name));
    }
    return total;
}

function mib(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function normalizedProduct(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "");
}

export function matchesProduct(name, productName, version, directory) {
    if (directory) {
        return name === `${productName}.app`;
    }
    // Tauri keeps product names on Windows and AppImage, but Debian and RPM package names
    // are lower-cased and hyphenated. Accept both spellings and either version separator.
    // The character after the version must end the stem or introduce a platform or release
    // suffix: `0.1.0-rc.2` is a different version, not a suffix of `0.1.0`.
    const lower = name.toLowerCase();
    const direct = productName.toLowerCase();
    const slug = normalizedProduct(productName);
    const versionLower = version.toLowerCase();
    return [`${direct}_${versionLower}`, `${slug}_${versionLower}`, `${slug}-${versionLower}`].some(
        (prefix) => {
            if (!lower.startsWith(prefix)) {
                return false;
            }
            const rest = lower.slice(prefix.length);
            return rest === "" || rest.startsWith("_") || rest.startsWith(".") || /^-\d/u.test(rest);
        },
    );
}

function findArtifacts(directory, productName, version, found = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name.endsWith(".app")) {
                if (matchesProduct(entry.name, productName, version, true)) {
                    found.push({ name: entry.name, path, directory: true });
                }
            } else {
                findArtifacts(path, productName, version, found);
            }
        } else if (
            entry.isFile() &&
            artifactPattern.test(entry.name) &&
            matchesProduct(entry.name, productName, version, false)
        ) {
            found.push({ name: entry.name, path, directory: false });
        }
    }
    return found;
}

function bundleRoots() {
    if (!existsSync(cargoTarget)) {
        throw new Error(`Cargo output directory does not exist: ${cargoTarget}`);
    }
    const roots = [];
    const direct = resolve(cargoTarget, "release", "bundle");
    if (existsSync(direct)) {
        roots.push(direct);
    }
    for (const entry of readdirSync(cargoTarget, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "release") {
            continue;
        }
        const candidate = resolve(cargoTarget, entry.name, "release", "bundle");
        if (existsSync(candidate)) {
            roots.push(candidate);
        }
    }
    return roots;
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: "inherit", ...options });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
    }
}

function zipDirectory(source, destination) {
    if (process.platform === "win32") {
        const parent = resolve(source, "..");
        const name = basename(source);
        // Windows' bundled bsdtar handles the 1.2 GB tool tree and its long Python paths.
        // PowerShell 5.1's Compress-Archive is a ZipArchive wrapper that fails on that
        // tree, and an App Execution Alias named `7z` may not be a usable CLI here. Keep
        // both as fallbacks for hosts where tar is absent or has no ZIP writer.
        const systemTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
        if (existsSync(systemTar)) {
            const tar = spawnSync(systemTar, ["-a", "-c", "-f", destination, "-C", parent, name], {
                stdio: "inherit",
            });
            if (tar.error === undefined && tar.status === 0) {
                return;
            }
            rmSync(destination, { force: true });
        }
        const sevenZip = spawnSync("7z", ["a", "-tzip", "-mx=5", "-y", destination, name], {
            cwd: parent,
            stdio: "inherit",
        });
        if (sevenZip.error === undefined && sevenZip.status === 0) {
            return;
        }
        rmSync(destination, { force: true });
        const powershell = spawnSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `Compress-Archive -LiteralPath '${source}' -DestinationPath '${destination}' -CompressionLevel Optimal`,
            ],
            { stdio: "inherit" },
        );
        if (powershell.error) {
            throw powershell.error;
        }
        if (powershell.status !== 0) {
            throw new Error(
                `System tar, 7z, and Compress-Archive all failed to create ${destination}`,
            );
        }
        return;
    }
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", source, destination]);
}

function windowsPortableReadme(productName, version, variant) {
    const toolchain =
        variant === "bundled"
            ? "The bundled toolchain lives in the tools folder beside the executable."
            : "This build uses the tools installed on this PC; it does not include a tools folder.";
    return [
        `${productName} ${version} - portable`,
        "",
        "Unzip this folder anywhere and run av1ation-desktop.exe.",
        "The web folder must stay beside the executable.",
        "The portable marker keeps projects, settings, thumbnails, logs, scratch and VapourSynth data in the data folder beside the executable. Delete this folder to remove them.",
        toolchain,
        "WebView2 Runtime is required; Windows 10 and 11 normally include it.",
        "",
    ].join("\n");
}

function createWindowsPortable({ destination, productName, version, variant }) {
    const executable = join(cargoTarget, "release", "av1ation-desktop.exe");
    if (!existsSync(executable)) {
        throw new Error(`the release executable is missing: ${executable}`);
    }
    if (!existsSync(desktopBuild)) {
        throw new Error(`the desktop frontend is missing: ${desktopBuild}`);
    }
    if (variant === "bundled" && !existsSync(stagedTools)) {
        throw new Error(`the staged toolchain is missing: ${stagedTools}`);
    }

    const stagingRoot = join(releaseDir, releasePlatform(), "portable", variant);
    const appRoot = join(stagingRoot, productName);
    rmSync(stagingRoot, { recursive: true, force: true });
    mkdirSync(appRoot, { recursive: true });

    cpSync(executable, join(appRoot, "av1ation-desktop.exe"));
    for (const entry of readdirSync(join(cargoTarget, "release"), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".dll")) {
            cpSync(join(cargoTarget, "release", entry.name), join(appRoot, entry.name));
        }
    }
    cpSync(desktopBuild, join(appRoot, "web"), { recursive: true });
    if (variant === "bundled") {
        cpSync(stagedTools, join(appRoot, "tools"), { recursive: true });
        if (process.platform === "win32") {
            const nativeFfms2 = join(stagedTools, "lib", "ffms2.dll");
            if (!existsSync(nativeFfms2)) {
                throw new Error(`the staged FFMS2 runtime is missing: ${nativeFfms2}`);
            }
            // The desktop import is loaded before the service selects its tools tree.
            cpSync(nativeFfms2, join(appRoot, "ffms2.dll"));
        }
    }
    // The host looks for this marker beside the executable and roots every service write in
    // a sibling `data` directory. A README alone is documentation, not a launch mode.
    writeFileSync(join(appRoot, "portable"), "");
    writeFileSync(
        join(appRoot, "PORTABLE.txt"),
        windowsPortableReadme(productName, version, variant),
    );

    const zipName = `${productName}_${version}_${targetArch()}_portable.zip`;
    zipDirectory(appRoot, join(destination, zipName));
    rmSync(stagingRoot, { recursive: true, force: true });
    const portableRoot = join(releaseDir, releasePlatform(), "portable");
    if (existsSync(portableRoot) && readdirSync(portableRoot).length === 0) {
        rmSync(portableRoot, { recursive: true, force: true });
    }
    return zipName;
}

function macPortableReadme(productName, version) {
    return [
        `${productName} ${version} - portable (macOS)`,
        "",
        `Unzip this folder anywhere and open ${productName}.app.`,
        "The portable marker keeps projects, settings, thumbnails, logs, scratch and VapourSynth data in the data folder beside the app. Delete this folder to remove them.",
        "This build is ad-hoc signed and not notarised; use the documented Gatekeeper override after verifying the SHA-256.",
        "",
    ].join("\n");
}

function createMacPortable({ artifact, destination, productName, version, variant }) {
    const stagingParent = join(releaseDir, releasePlatform(), "portable", variant);
    const stagingRoot = join(stagingParent, productName);
    rmSync(stagingParent, { recursive: true, force: true });
    mkdirSync(stagingRoot, { recursive: true });
    cpSync(artifact.path, join(stagingRoot, artifact.name), { recursive: true });
    // The host resolves the directory holding the `.app`, so the marker has to be a sibling
    // of the bundle. Inside `Contents` it would put generated state in the signed tree and
    // be lost on the next application update.
    writeFileSync(join(stagingRoot, "portable"), "");
    writeFileSync(join(stagingRoot, "PORTABLE.txt"), macPortableReadme(productName, version));

    const zipName = `${productName}_${version}_${targetArch()}.app.zip`;
    zipDirectory(stagingRoot, join(destination, zipName));
    rmSync(stagingParent, { recursive: true, force: true });
    const portableRoot = join(releaseDir, releasePlatform(), "portable");
    if (existsSync(portableRoot) && readdirSync(portableRoot).length === 0) {
        rmSync(portableRoot, { recursive: true, force: true });
    }
    return zipName;
}

function walkFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
    return files;
}

function checksum(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Write a sorted SHA-256 list for release artifacts, excluding local-only release inputs. */
export function writeChecksums(directory, { recursive = false } = {}) {
    const files = (
        recursive
            ? walkFiles(directory)
            : readdirSync(directory, { withFileTypes: true })
                  .filter((entry) => entry.isFile())
                  .map((entry) => join(directory, entry.name))
    )
        .filter((path) => {
            const name = relative(directory, path).split(sep).join("/");
            return !metadataNames.has(basename(path)) && !name.startsWith(`${flatAssetDirectory}/`);
        })
        .sort((left, right) => relative(directory, left).localeCompare(relative(directory, right)));
    const lines = files.map((path) => {
        const name = relative(directory, path).split(sep).join("/");
        return `${checksum(path)}  ${name}`;
    });
    writeFileSync(join(directory, checksumName), `${lines.join("\n")}\n`);
    return files;
}

/**
 * Copy one variant's installers and archives into `dist/release/<variant>`.
 * Returns the destination and file names so a caller can report exactly what was packaged.
 */
export function collectReleaseArtifacts({
    variant = "bundled",
    productName = "Av1ation Station",
} = {}) {
    const version = packageVersion();
    const roots = bundleRoots();
    if (roots.length === 0) {
        throw new Error(`Tauri produced no bundle directory under ${cargoTarget}`);
    }
    const artifacts = roots.flatMap((root) => findArtifacts(root, productName, version));
    if (artifacts.length === 0) {
        throw new Error(
            `Tauri produced no installer or archive for ${productName} in ${roots.join(", ")}`,
        );
    }

    const unique = new Map();
    for (const artifact of artifacts) {
        const previous = unique.get(artifact.name);
        if (previous !== undefined && previous.path !== artifact.path) {
            throw new Error(
                `Two release artifacts share the name ${artifact.name}: ${previous.path}, ${artifact.path}`,
            );
        }
        unique.set(artifact.name, artifact);
    }

    const platform = releasePlatform();
    const destination = join(releaseDir, platform, variant);
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });

    let total = 0;
    for (const artifact of unique.values()) {
        if (artifact.directory) {
            if (process.platform === "darwin") {
                const zipName = createMacPortable({
                    artifact,
                    destination,
                    productName,
                    version,
                    variant,
                });
                const size = sizeOf(join(destination, zipName));
                total += size;
                console.log(`release: ${zipName} (${mib(size)})`);
            } else {
                cpSync(artifact.path, join(destination, artifact.name), { recursive: true });
                const size = sizeOf(artifact.path);
                total += size;
                console.log(`release: ${artifact.name} (${mib(size)})`);
            }
            continue;
        }
        const target = join(destination, artifact.name);
        cpSync(artifact.path, target, { recursive: true });
        const size = sizeOf(artifact.path);
        total += size;
        console.log(`release: ${artifact.name} (${mib(size)})`);
    }

    if (process.platform === "win32") {
        const zipName = createWindowsPortable({ destination, productName, version, variant });
        const size = sizeOf(join(destination, zipName));
        total += size;
        console.log(`release: ${zipName} (${mib(size)})`);
    }

    writeChecksums(destination);
    console.log(
        `Collected ${platform} ${variant} release artifacts in ${destination} (${mib(total)}).`,
    );
    return { artifacts: [...unique.keys()], directory: destination };
}
