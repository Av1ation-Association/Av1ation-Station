// Remove reusable local caches when disk space matters more than the next build.
// Cargo and generated output have their own commands; this one covers caches that are
// safe to rebuild and are all kept under the ignored dist/ root. The optional Kache store
// may be shared with another checkout and is deliberately left alone.
import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const caches = ["dist/cache", "dist/dev-tools", "dist/tsbuildinfo"];

function sizeOf(path) {
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
for (const relative of caches) {
    const path = resolve(root, relative);
    if (!existsSync(path)) {
        continue;
    }
    const bytes = sizeOf(path);
    rmSync(path, { recursive: true, force: true });
    removed += bytes;
    console.log(`removed ${relative} (${mib(bytes)})`);
}
console.log(
    `Reclaimed ${mib(removed)}. Rebuildable caches were removed; release output and the external Kache store were kept.`,
);
