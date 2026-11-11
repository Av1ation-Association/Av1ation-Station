// Reuse the debug service binary between E2E runs. The binary is keyed by the Rust inputs
// that affect it, so a source change rebuilds while an unchanged checkout restores the
// binary after `clean:target`. The cache lives outside the Cargo target on purpose.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cargoTarget, serviceCache } from "./build-paths.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const rustRoot = resolve(root, "rust");
const runCargo = resolve(root, "scripts", "run-cargo.mjs");
const binaryName = process.platform === "win32" ? "av1ation-service.exe" : "av1ation-service";
const targetBinary = resolve(cargoTarget, "debug", binaryName);
const cacheDir = serviceCache;
const cachedBinary = resolve(cacheDir, binaryName);
const cacheKeyFile = resolve(cacheDir, "key");

function sourceFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...sourceFiles(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
    return files;
}

function sourceKey() {
    const inputs = [
        resolve(rustRoot, "Cargo.toml"),
        resolve(rustRoot, "Cargo.lock"),
        resolve(root, "rust-toolchain.toml"),
        resolve(root, "scripts", "vendor-python-lsp.mjs"),
        ...sourceFiles(resolve(rustRoot, "crates")),
    ].sort();
    const hash = createHash("sha256");
    hash.update(`${process.platform}\0${process.arch}\0debug\0`);
    for (const file of inputs) {
        hash.update(`${relative(root, file)}\0`);
        hash.update(readFileSync(file));
    }
    return hash.digest("hex").slice(0, 32);
}

function restoreFromCache(key) {
    if (!existsSync(cachedBinary) || statSync(cachedBinary).size === 0) {
        return false;
    }
    let cachedKey;
    try {
        cachedKey = readFileSync(cacheKeyFile, "utf8").trim();
    } catch {
        return false;
    }
    if (cachedKey !== key) {
        return false;
    }
    mkdirSync(dirname(targetBinary), { recursive: true });
    copyFileSync(cachedBinary, targetBinary);
    console.log(`Reusing cached service build ${key.slice(0, 12)}.`);
    return true;
}

function storeInCache(key) {
    if (!existsSync(targetBinary) || statSync(targetBinary).size === 0) {
        throw new Error(`Cargo did not produce ${targetBinary}.`);
    }
    mkdirSync(cacheDir, { recursive: true });
    const temporaryBinary = `${cachedBinary}.tmp`;
    const temporaryKey = `${cacheKeyFile}.tmp`;
    copyFileSync(targetBinary, temporaryBinary);
    // Windows rename does not replace an existing destination. The key is written last,
    // so an interrupted replacement leaves a mismatch and forces a rebuild next time.
    rmSync(cachedBinary, { force: true });
    renameSync(temporaryBinary, cachedBinary);
    writeFileSync(temporaryKey, `${key}\n`);
    rmSync(cacheKeyFile, { force: true });
    renameSync(temporaryKey, cacheKeyFile);
}

const key = sourceKey();
if (!restoreFromCache(key)) {
    console.log(`Service source changed; building ${binaryName}...`);
    const result = spawnSync(
        process.execPath,
        [runCargo, "build", "--locked", "-p", "av1ation-service", "--bin", "av1ation-service"],
        { cwd: root, stdio: "inherit" },
    );
    if (result.error) {
        console.error(result.error.message);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
    try {
        storeInCache(key);
    } catch (error) {
        console.warn(`the service build could not be cached: ${error.message}`);
    }
}
console.log(`Service binary: ${targetBinary}`);
