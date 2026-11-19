// Remove heavy, regenerable release output while preserving the debug target. The release
// dependency tree keeps the next relink cheap; `dist/validation` and `dist/release/validation`
// carry the recorded A4/D5 and package evidence; release metadata stays at `dist/release/`.
import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const artifacts = [
    "dist/release/assets",
    "dist/release/windows",
    "dist/validation/msi",
    "dist/toolchain-targets",
    "dist/toolchain-zips",
    "dist/cargo/release/bundle",
    "dist/cargo/release/tools",
];
const preserved = [
    "dist/cargo/debug",
    "dist/cargo/release/deps",
    "dist/validation",
    "dist/release/validation",
    "dist/release/release-manifest.json",
    "dist/release/package-validation.json",
    "dist/release/SHA256SUMS.txt",
    "dist/release/SHA256SUMS-github.txt",
    "dist/release/RELEASE-NOTES.md",
    "dist/tools",
];

for (const relative of artifacts) {
    for (const keep of preserved) {
        if (keep === relative || keep.startsWith(`${relative}/`)) {
            throw new Error(`clean:release would remove preserved path ${keep}`);
        }
    }
}

function sizeOf(path) {
    const stats = lstatSync(path);
    if (stats.isFile()) {
        return stats.size;
    }
    let total = 0;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = resolve(path, entry.name);
        if (entry.isDirectory()) {
            total += sizeOf(child);
        } else if (entry.isFile()) {
            total += lstatSync(child).size;
        }
    }
    return total;
}

function mib(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

let removed = 0;
for (const relative of artifacts) {
    const path = resolve(root, relative);
    if (!existsSync(path)) {
        continue;
    }
    const bytes = sizeOf(path);
    removed += bytes;
    if (dryRun) {
        console.log(`would remove ${relative} (${mib(bytes)})`);
    } else {
        rmSync(path, { recursive: true, force: true });
        console.log(`removed ${relative} (${mib(bytes)})`);
    }
}
console.log(
    `${dryRun ? "Would reclaim" : "Reclaimed"} ${mib(removed)}. ` +
        "Debug target, release dependencies, and validation evidence were kept.",
);
