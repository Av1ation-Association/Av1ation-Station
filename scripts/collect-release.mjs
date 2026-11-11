// Tauri writes platform bundles under the Cargo target, while local packaging keeps only
// installers and archives in `dist/release`. Collecting after a successful bundle keeps that
// documented location true for both the desktop and system-toolchain wrappers.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { cargoTarget, releaseDir } from "./build-paths.mjs";

const artifactPattern = /\.(?:msi|exe|dmg|pkg|deb|rpm|appimage|msix|zip|tar\.gz|sig)$/i;

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

function findArtifacts(directory, found = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (/\.app$/i.test(entry.name)) {
                found.push({ name: entry.name, path });
            } else {
                findArtifacts(path, found);
            }
        } else if (entry.isFile() && artifactPattern.test(entry.name)) {
            found.push({ name: entry.name, path });
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

/**
 * Copy Tauri's installers and archives into `dist/release`, replacing the previous set.
 * Returns the destination and file names so a caller can report exactly what was packaged.
 */
export function collectReleaseArtifacts() {
    const roots = bundleRoots();
    if (roots.length === 0) {
        throw new Error(`Tauri produced no bundle directory under ${cargoTarget}`);
    }
    const artifacts = roots.flatMap((root) => findArtifacts(root));
    if (artifacts.length === 0) {
        throw new Error(`Tauri produced no installer or archive in ${roots.join(", ")}`);
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

    rmSync(releaseDir, { recursive: true, force: true });
    mkdirSync(releaseDir, { recursive: true });

    let total = 0;
    for (const artifact of unique.values()) {
        const destination = join(releaseDir, artifact.name);
        cpSync(artifact.path, destination, { recursive: true });
        const size = sizeOf(artifact.path);
        total += size;
        console.log(`release: ${artifact.name} (${mib(size)})`);
    }
    console.log(`Collected ${unique.size} release artifact(s) in ${releaseDir} (${mib(total)}).`);
    return { artifacts: [...unique.keys()], directory: releaseDir };
}
