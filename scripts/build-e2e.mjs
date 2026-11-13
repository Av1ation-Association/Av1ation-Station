// Prepare the two artifacts the browser suite serves: the desktop SPA and the headless
// service. The service script already caches its binary; this wrapper adds the same
// reuse boundary for the SPA so a warm E2E run does not rebuild either artifact.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { desktopBuild, outputRoot } from "./build-paths.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheRoot = resolve(outputRoot, "cache", "e2e");
const cachedDesktop = resolve(cacheRoot, "desktop");
const desktopKeyFile = resolve(cacheRoot, "desktop.key");
const desktopTmp = `${cachedDesktop}.tmp`;
const desktopKeyTmp = `${desktopKeyFile}.tmp`;
const buildService = resolve(root, "scripts", "build-service.mjs");
const vite = resolve(root, "node_modules", "vite", "bin", "vite.js");

// Everything the Vite build can read. Tests are included because a stale key is worse than
// rebuilding for a test-only edit; generated contracts are under packages/contracts/src.
const INPUT_ROOTS = [
    "apps/desktop",
    "packages/api",
    "packages/contracts",
    "packages/config",
    "packages/ui",
];
const INPUT_FILES = ["package.json", "package-lock.json", "scripts/build-e2e.mjs"];
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", ".git"]);

function filesUnder(path) {
    const files = [];
    for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
            continue;
        }
        const entryPath = join(path, entry.name);
        if (entry.isDirectory()) {
            files.push(...filesUnder(entryPath));
        } else if (entry.isFile()) {
            files.push(entryPath);
        }
    }
    return files;
}

function sourceKey() {
    const inputs = [
        ...INPUT_FILES.map((file) => resolve(root, file)).filter(existsSync),
        ...INPUT_ROOTS.flatMap((directory) => filesUnder(resolve(root, directory))),
    ].sort();
    const hash = createHash("sha256");
    hash.update(`${process.platform}\0${process.arch}\0e2e-desktop\0`);
    for (const file of inputs) {
        hash.update(`${relative(root, file)}\0`);
        hash.update(readFileSync(file));
    }
    return hash.digest("hex").slice(0, 32);
}

function readKey() {
    try {
        return readFileSync(desktopKeyFile, "utf8").trim();
    } catch {
        return null;
    }
}

function restoreDesktop() {
    rmSync(desktopBuild, { recursive: true, force: true });
    mkdirSync(dirname(desktopBuild), { recursive: true });
    cpSync(cachedDesktop, desktopBuild, { recursive: true });
}

function storeDesktop(key) {
    rmSync(desktopTmp, { recursive: true, force: true });
    cpSync(desktopBuild, desktopTmp, { recursive: true });
    rmSync(cachedDesktop, { recursive: true, force: true });
    renameSync(desktopTmp, cachedDesktop);
    writeFileSync(desktopKeyTmp, `${key}\n`, "utf8");
    rmSync(desktopKeyFile, { force: true });
    renameSync(desktopKeyTmp, desktopKeyFile);
}

function buildDesktop() {
    const result = spawnSync(process.execPath, [vite, "build"], {
        cwd: resolve(root, "apps", "desktop"),
        stdio: "inherit",
        env: process.env,
    });
    if (result.error) {
        throw new Error(`The desktop build could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`The desktop build exited with ${String(result.status)}.`);
    }
    if (!existsSync(join(desktopBuild, "index.html"))) {
        throw new Error(`The desktop build did not produce ${join(desktopBuild, "index.html")}.`);
    }
}

function ensureDesktop(key) {
    const keyMatches = readKey() === key;
    if (keyMatches && existsSync(join(desktopBuild, "index.html"))) {
        return "reused";
    }
    if (keyMatches && existsSync(join(cachedDesktop, "index.html"))) {
        restoreDesktop();
        return "restored";
    }

    buildDesktop();
    try {
        storeDesktop(key);
    } catch (error) {
        console.warn(`the desktop build could not be cached: ${error.message}`);
    }
    return "built";
}

function runBuildService() {
    const result = spawnSync(process.execPath, [buildService], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    });
    if (result.error) {
        throw new Error(`The service build could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`The service build exited with ${String(result.status)}.`);
    }
}

const totalStart = performance.now();
try {
    const desktopStart = Date.now();
    const status = ensureDesktop(sourceKey());
    console.log(`E2E desktop ${status} in ${((Date.now() - desktopStart) / 1000).toFixed(1)}s.`);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}

const serviceStart = Date.now();
try {
    runBuildService();
    console.log(`E2E service ready in ${((Date.now() - serviceStart) / 1000).toFixed(1)}s.`);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}

console.log(`E2E build ready in ${((performance.now() - totalStart) / 1000).toFixed(1)}s.`);
