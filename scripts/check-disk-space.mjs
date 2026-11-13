// Stop a coverage build before it fills the volume it writes into.
//
// llvm-cov instruments every crate it tests, and a clean instrumented build can consume
// several GiB beside the normal debug artifacts. The compiler and the test binaries both
// write under the Cargo target directory, so checking one volume is enough. The threshold is
// deliberately a floor for the build, not a warning: a build that starts with too little
// space fails later with an opaque linker or write error.
import { existsSync, statfsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { cargoTarget } from "./build-paths.mjs";

/** Leave room for the crate graph plus the lcov report. */
export const DEFAULT_MIN_FREE_GIB = 6;

const GIB = 1024 ** 3;

/** The nearest existing directory, so a first run can check before Cargo creates its target. */
function existingAncestor(path) {
    let current = resolve(path);
    while (!existsSync(current)) {
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return current;
}

/** Read the free space on the volume that holds `path`. */
export function freeGiB(path = cargoTarget) {
    const stats = statfsSync(existingAncestor(path), { bigint: true });
    return (Number(stats.bavail) * Number(stats.bsize)) / GIB;
}

function argumentValue(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
}

function parseMinimum() {
    const raw = argumentValue("--min-gib") ?? process.env.AV1ATION_MIN_FREE_GIB;
    if (raw === undefined || raw === "") {
        return DEFAULT_MIN_FREE_GIB;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Disk-space minimum must be a positive number of GiB, received "${raw}".`);
    }
    return value;
}

function main() {
    let minimum;
    try {
        minimum = parseMinimum();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
    }

    const path = argumentValue("--path") ?? cargoTarget;
    let available;
    try {
        available = freeGiB(resolve(path));
    } catch (error) {
        console.error(
            `Disk-space preflight could not inspect ${resolve(path)}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        process.exitCode = 1;
        return;
    }

    const rounded = available.toFixed(1);
    if (available < minimum) {
        console.error(
            `Disk-space preflight failed: ${rounded} GiB free at ${resolve(path)}, ` +
                `but the Rust coverage build needs at least ${minimum.toFixed(1)} GiB. ` +
                "Free space or set AV1ATION_MIN_FREE_GIB deliberately lower.",
        );
        process.exitCode = 1;
        return;
    }

    console.log(
        `Disk-space preflight: ${rounded} GiB free at ${resolve(path)} ` +
            `(minimum ${minimum.toFixed(1)} GiB).`,
    );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
