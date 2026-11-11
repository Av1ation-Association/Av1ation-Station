// The staged toolchain lives in `dist/dev-tools/`, outside `dist/cargo/`, because
// `cargo clean` deletes the build tree and taking the bundle with it makes every bundled
// provider vanish. The cache is a real copy, not a link to the tree it was staged from: a
// hand-staged Python junction would otherwise keep the bundled interpreter dependent on a
// machine-wide install.
import { cpSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { devTools as cacheRoot } from "./build-paths.mjs";

export { cacheRoot };

function isLink(path) {
    return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

// A just-copied tree can still be held by antivirus or an open handle for a moment; a
// failed rename must not leave the cache without an interpreter.
function renameWithRetry(source, destination) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            renameSync(source, destination);
            return;
        } catch (error) {
            if (attempt >= 10 || (error.code !== "EPERM" && error.code !== "EBUSY")) {
                throw error;
            }
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
    }
}

/** Copy a tree into the cache, resolving links so the copy has no external dependency. */
function copyTree(source, destination) {
    cpSync(source, destination, {
        recursive: true,
        dereference: true,
        preserveTimestamps: true,
    });
}

/**
 * Replace a linked `python/` with a real copy. A release bundle ships a real interpreter
 * tree; a hand-staged development tree may have linked the machine's Python, and that link
 * would keep the cache dependent after the cache moved.
 */
export function materialisePython() {
    const python = resolve(cacheRoot, "python");
    if (isLink(cacheRoot) || !isLink(python)) {
        return false;
    }
    const staging = `${python}.new`;
    const linked = `${python}.linked`;
    rmSync(staging, { recursive: true, force: true });
    rmSync(linked, { recursive: true, force: true });
    console.log(`Materialising the bundled Python into ${cacheRoot}; this copy happens once.`);
    try {
        copyTree(python, staging);
    } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw error;
    }
    try {
        renameWithRetry(python, linked);
    } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw error;
    }
    try {
        renameWithRetry(staging, python);
    } catch (error) {
        renameWithRetry(linked, python);
        rmSync(staging, { recursive: true, force: true });
        throw error;
    }
    try {
        rmSync(linked, { recursive: true, force: true });
    } catch (error) {
        console.warn(`the old Python link could not be removed (${error.message}).`);
    }
    return true;
}

/**
 * Return the persistent dev toolchain, materialising a linked Python once. The cache is
 * outside the Cargo target, so it survives `clean:target` without a link in the build tree.
 */
export function prepareDevTools() {
    if (!existsSync(cacheRoot)) {
        return null;
    }
    try {
        materialisePython();
    } catch (error) {
        console.warn(
            `the bundled Python could not be copied into the cache (${error.message}); ` +
                "the cache still depends on the linked interpreter.",
        );
    }
    return cacheRoot;
}

/** Copy a staged release tree into the cache. */
export function stageCache(root) {
    const source = resolve(root);
    if (source === resolve(cacheRoot)) {
        return;
    }
    mkdirSync(dirname(cacheRoot), { recursive: true });
    const staging = `${cacheRoot}.new`;
    const previous = `${cacheRoot}.old`;
    rmSync(staging, { recursive: true, force: true });
    rmSync(previous, { recursive: true, force: true });
    console.log(`Copying the toolchain into ${cacheRoot}; this may take a minute.`);
    try {
        copyTree(source, staging);
    } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw error;
    }
    const hadCache = existsSync(cacheRoot) || isLink(cacheRoot);
    if (hadCache) {
        try {
            renameWithRetry(cacheRoot, previous);
        } catch (error) {
            rmSync(staging, { recursive: true, force: true });
            throw error;
        }
    }
    try {
        renameWithRetry(staging, cacheRoot);
    } catch (error) {
        if (hadCache) {
            renameWithRetry(previous, cacheRoot);
        }
        rmSync(staging, { recursive: true, force: true });
        throw error;
    }
    if (hadCache) {
        try {
            rmSync(previous, { recursive: true, force: true });
        } catch (error) {
            console.warn(`the previous toolchain cache could not be removed (${error.message}).`);
        }
    }
}
