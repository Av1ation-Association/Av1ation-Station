// Build the reviewed toolchain one component at a time.
//
// Each component has its own cache directory and cache key, derived from its manifest
// entry, the target triple, its recipe bytes, the shared recipe helper and the builder
// bytes. CI restores that
// directory per component, so adding a new x264 snapshot does not rebuild FFmpeg, and a
// cache hit costs a directory copy rather than a compiler invocation.
//
// The command is deliberately only an orchestrator: a recipe owns its upstream checkout,
// build system and file layout. The orchestrator verifies the artifact claimed by the
// manifest exists before it records a cache hit, so a failed or half-written recipe cannot
// silently become a release input.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    cpSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { TARGETS, TARGET_SET, validateManifest } from "./toolchain-manifest.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = join(repoRoot, "packaging", "toolchain.json");
const recipeRoot = join(repoRoot, "packaging", "recipes");
const sharedRecipe = join(recipeRoot, "lib.mjs");
const defaultCacheRoot = join(repoRoot, "dist", "toolchain-cache");
const defaultBuildRoot = join(repoRoot, "dist", "toolchain-build");
const defaultOutputRoot = join(repoRoot, "dist", "cargo", "toolchain");
const markerName = "component.json";
const markerVersion = 1;

const runners = {
    "x86_64-pc-windows-msvc": "windows-2025",
    "aarch64-apple-darwin": "macos-15",
    "x86_64-apple-darwin": "macos-15-intel",
    "x86_64-unknown-linux-gnu": "ubuntu-24.04",
};

const hostTarget = (() => {
    if (process.platform === "win32" && process.arch === "x64") {
        return "x86_64-pc-windows-msvc";
    }
    if (process.platform === "darwin" && process.arch === "arm64") {
        return "aarch64-apple-darwin";
    }
    if (process.platform === "darwin" && process.arch === "x64") {
        return "x86_64-apple-darwin";
    }
    if (process.platform === "linux" && process.arch === "x64") {
        return "x86_64-unknown-linux-gnu";
    }
    return null;
})();

function fail(message) {
    console.error(`toolchain:build: ${message}`);
    process.exit(1);
}

function option(name, fallback) {
    const index = process.argv.indexOf(name);
    if (index === -1) {
        return fallback;
    }
    const value = process.argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
        fail(`${name} must be followed by a value`);
    }
    return value;
}

function flag(name) {
    return process.argv.includes(name);
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonical).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function readManifest() {
    if (!existsSync(manifestPath)) {
        fail(`manifest is missing: ${manifestPath}`);
    }
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
        fail(`manifest is not valid JSON: ${error.message}`);
    }
    const validation = validateManifest(manifest);
    if (validation.errors.length > 0) {
        fail(`manifest is invalid:\n  - ${validation.errors.join("\n  - ")}`);
    }
    return { manifest, components: validation.components };
}

function recipePath(component) {
    const recipe = component.build?.recipe;
    if (recipe === undefined) {
        fail(`${component.id} has no build recipe; it cannot be built by this command`);
    }
    const path = resolve(repoRoot, recipe);
    if (!path.startsWith(`${recipeRoot}${sep}`)) {
        fail(`${component.id} recipe escapes packaging/recipes: ${recipe}`);
    }
    if (!existsSync(path)) {
        fail(`${component.id} recipe is missing: ${path}`);
    }
    return path;
}

/** The key a CI cache entry is stored under for one component and target. */
export function cacheKeyFor(component, target, recipeBytes, helperBytes, engineBytes) {
    return sha256(
        canonical({
            schema: markerVersion,
            target,
            component,
            recipe: sha256(recipeBytes),
            helper: sha256(helperBytes),
            engine: sha256(engineBytes),
        }),
    );
}

function cacheKey(component, target) {
    const recipe = recipePath(component);
    const helper = existsSync(sharedRecipe) ? readFileSync(sharedRecipe) : Buffer.alloc(0);
    return cacheKeyFor(
        component,
        target,
        readFileSync(recipe),
        helper,
        readFileSync(fileURLToPath(import.meta.url)),
    );
}

function componentPlan(component, target) {
    const claim = component.artifacts?.[target];
    if (claim === undefined) {
        return null;
    }
    const install = claim.install.replaceAll("\\", "/").replace(/\/{2,}/gu, "/");
    return {
        id: component.id,
        target,
        runner: runners[target],
        cache_dir: component.id.replaceAll(":", "-"),
        install,
        cache_key: cacheKey(component, target),
        recipe: component.build?.recipe ?? null,
    };
}

function selectComponents(components, target) {
    const requested = option("--component", null);
    const names = requested === null ? null : requested.split(",").map((value) => value.trim());
    const selected = [];
    for (const component of components.values()) {
        if (component.artifacts?.[target] === undefined) {
            if (names?.includes(component.id) === true) {
                fail(`${component.id} has no artifact for ${target}`);
            }
            continue;
        }
        if (names === null || names.includes(component.id)) {
            selected.push(component);
        }
    }
    if (names !== null) {
        const unknown = names.filter(
            (name) => !selected.some((component) => component.id === name),
        );
        if (unknown.length > 0) {
            fail(`unknown component(s) for ${target}: ${unknown.join(", ")}`);
        }
    }
    if (selected.length === 0) {
        fail(`no components selected for ${target}`);
    }
    return selected;
}

function ensureInside(root, candidate, label) {
    const normalized = resolve(candidate);
    if (normalized !== root && !normalized.startsWith(`${root}${sep}`)) {
        fail(`${label} escapes its root: ${candidate}`);
    }
    return normalized;
}

function claimPath(targetRoot, install) {
    const root = resolve(targetRoot);
    const path = ensureInside(root, resolve(root, install), `artifact ${install}`);
    if (!existsSync(path)) {
        throw new Error(`claimed artifact is missing: ${path}`);
    }
    if (lstatSync(path).isSymbolicLink()) {
        throw new Error(`claimed artifact is a symbolic link: ${path}`);
    }
    return path;
}

function mergeTree(from, to) {
    if (!existsSync(from)) {
        fail(`component cache has no tools directory: ${from}`);
    }
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
        const source = join(from, entry.name);
        const destination = join(to, entry.name);
        if (entry.isSymbolicLink()) {
            fail(`refusing to merge a symbolic link: ${source}`);
        }
        if (entry.isDirectory()) {
            mergeTree(source, destination);
        } else if (entry.isFile()) {
            mkdirSync(dirname(destination), { recursive: true });
            cpSync(source, destination);
        } else {
            fail(`unsupported file type in component cache: ${source}`);
        }
    }
}

function mergeComponent(cacheRoot, targetRoot) {
    mergeTree(join(cacheRoot, "tools"), join(targetRoot, "tools"));
}

function markerPath(cacheRoot) {
    return join(cacheRoot, markerName);
}

function markerMatches(cacheRoot, key) {
    const path = markerPath(cacheRoot);
    if (!existsSync(path)) {
        return false;
    }
    try {
        const marker = JSON.parse(readFileSync(path, "utf8"));
        return marker.schema_version === markerVersion && marker.cache_key === key;
    } catch {
        return false;
    }
}

async function runRecipe(component, target, workRoot, cacheKeyValue) {
    const recipe = recipePath(component);
    const workDir = join(workRoot, target, component.id.replaceAll(":", "-"));
    const outputDir = join(workDir, "tools");
    rmSync(workDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });

    console.log(`[${target}] ${component.id} (${component.version})`);
    console.log(`  recipe: ${relative(repoRoot, recipe)}`);
    console.log(`  cache:  ${cacheKeyValue.slice(0, 16)}`);

    const module = await import(pathToFileURL(recipe).href);
    if (typeof module.default !== "function") {
        fail(`${component.build.recipe} must export a default async build(context) function`);
    }
    await module.default({
        component,
        target,
        repoRoot,
        workDir,
        outputDir,
        env: process.env,
        run,
        log: (message) => console.log(`  ${message}`),
    });
    return workDir;
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        ...options,
        env: { ...process.env, ...options.env },
    });
    if (result.error) {
        fail(`${command} could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
        fail(`${command} exited with ${result.status ?? "an unknown status"}`);
    }
}

async function buildComponent(component, target, options) {
    const key = cacheKey(component, target);
    const cacheRoot = join(options.cacheDir, target, component.id.replaceAll(":", "-"));
    const targetRoot = join(options.out, target);
    const claim = component.artifacts[target].install;
    if (markerMatches(cacheRoot, key) && !options.force) {
        try {
            claimPath(cacheRoot, claim);
            console.log(`[${target}] ${component.id}: cache hit ${key.slice(0, 16)}`);
            mergeComponent(cacheRoot, targetRoot);
            return { id: component.id, cached: true };
        } catch {
            console.warn(`[${target}] ${component.id}: stale cache entry; rebuilding`);
        }
    }

    const workDir = await runRecipe(component, target, options.buildRoot, key);
    claimPath(workDir, claim);
    const marker = {
        schema_version: markerVersion,
        target,
        id: component.id,
        version: component.version,
        cache_key: key,
    };
    mkdirSync(workDir, { recursive: true });
    rmSync(cacheRoot, { recursive: true, force: true });
    mkdirSync(dirname(cacheRoot), { recursive: true });
    // The marker is written after the artifact is complete. A reader that sees it can trust
    // the tree because the whole component directory is moved into place in one rename.
    const temporary = `${cacheRoot}.tmp-${process.pid}`;
    rmSync(temporary, { recursive: true, force: true });
    mkdirSync(temporary, { recursive: true });
    cpSync(join(workDir, "tools"), join(temporary, "tools"), {
        recursive: true,
        filter: (path) => !lstatSync(path).isSymbolicLink(),
    });
    writeFileSync(join(temporary, markerName), `${JSON.stringify(marker, null, 4)}\n`, "utf8");
    rmSync(cacheRoot, { recursive: true, force: true });
    renameSync(temporary, cacheRoot);
    mergeComponent(cacheRoot, targetRoot);
    rmSync(workDir, { recursive: true, force: true });
    return { id: component.id, cached: false };
}

function assemble(components, target, options) {
    const targetRoot = join(options.out, target);
    const caches = [];
    for (const component of components) {
        const cacheRoot = join(options.cacheDir, target, component.id.replaceAll(":", "-"));
        if (!existsSync(cacheRoot)) {
            fail(`component cache is missing for ${component.id} (${target}): ${cacheRoot}`);
        }
        if (markerMatches(cacheRoot, cacheKey(component, target)) === false) {
            fail(`component cache is stale for ${component.id} (${target})`);
        }
        claimPath(cacheRoot, component.artifacts[target].install);
        caches.push(cacheRoot);
    }
    // A target tree is a release input, not an accumulating cache. Rebuild it from the
    // selected component caches so a file removed from a newer component cannot survive.
    // Validate every cache first so a missing component cannot erase a good tree.
    rmSync(targetRoot, { recursive: true, force: true });
    for (const cacheRoot of caches) {
        mergeComponent(cacheRoot, targetRoot);
    }
    console.log(`[${target}] assembled ${String(components.length)} component(s) in ${targetRoot}`);
}

async function main() {
    const { components } = readManifest();
    const requestedTarget = option("--target", null);
    const target = requestedTarget ?? hostTarget;
    if (flag("--print-matrix") || flag("--github-matrix")) {
        if (target !== null && !TARGET_SET.has(target)) {
            fail(`unknown target: ${target}`);
        }
        const matrixTargets = flag("--all-targets")
            ? TARGETS
            : target === null
              ? TARGETS
              : [target];
        const matrix = [];
        for (const current of matrixTargets) {
            for (const component of components.values()) {
                const plan = componentPlan(component, current);
                if (plan !== null) {
                    matrix.push(plan);
                }
            }
        }
        process.stdout.write(`${JSON.stringify({ include: matrix })}\n`);
        return;
    }
    if (flag("--print-cache-key")) {
        const id = option("--component", null);
        if (id === null) {
            fail("--print-cache-key requires --component");
        }
        if (target === null || !TARGET_SET.has(target)) {
            fail("--print-cache-key requires a supported --target");
        }
        const component = components.get(id);
        if (component === undefined) {
            fail(`unknown component: ${id}`);
        }
        process.stdout.write(`${cacheKey(component, target)}\n`);
        return;
    }
    if (target === null) {
        fail("this host is not one of the four release targets; pass --target");
    }
    if (!TARGET_SET.has(target)) {
        fail(`unknown target: ${target}`);
    }
    const selected = selectComponents(components, target);
    if (flag("--list")) {
        for (const component of selected) {
            console.log(`${target} ${component.id} ${component.version}`);
        }
        return;
    }
    const options = {
        cacheDir: resolve(repoRoot, option("--cache-dir", defaultCacheRoot)),
        buildRoot: resolve(repoRoot, option("--build-root", defaultBuildRoot)),
        out: resolve(repoRoot, option("--out", defaultOutputRoot)),
        force: flag("--force"),
    };
    if (flag("--assemble-only")) {
        assemble(selected, target, options);
        return;
    }
    const results = [];
    for (const component of selected) {
        results.push(await buildComponent(component, target, options));
    }
    assemble(selected, target, options);
    const cached = results.filter((result) => result.cached).length;
    console.log(
        `${target}: ${String(results.length - cached)} built, ${String(cached)} restored from cache`,
    );
}

if (process.argv[1] !== undefined) {
    const invoked = resolve(process.argv[1]);
    if (invoked === resolve(fileURLToPath(import.meta.url))) {
        main().catch((error) => {
            console.error(`toolchain:build: ${error.stack ?? error.message}`);
            process.exit(1);
        });
    }
}
