// Generate the per-target toolchain lock from built trees.
//
// A lock is only written when every release target has a built directory and every component
// claimed for that target is present. Missing inputs are an error, never a placeholder hash.
// The source URL in the lock is the provenance URL from the manifest; the SHA-256 and size are
// computed from the bytes actually present in the built tree.
import { createHash } from "node:crypto";
import {
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { TARGETS, validateManifest } from "./toolchain-manifest.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);

function fail(message) {
    console.error(`toolchain:lock: ${message}`);
    process.exit(1);
}

function option(name, fallback) {
    const index = args.indexOf(name);
    if (index === -1) {
        return fallback;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
        fail(`${name} must be followed by a value`);
    }
    return value;
}

for (const argument of args) {
    if (
        argument.startsWith("--") &&
        !["--root", "--from", "--check", "--target"].includes(argument)
    ) {
        fail(`unknown option ${argument}`);
    }
}

const root = resolve(repoRoot, option("--root", "."));
const from = resolve(root, option("--from", join("dist", "cargo", "toolchain")));
const check = args.includes("--check");
const selectedTarget = option("--target", undefined);
if (selectedTarget !== undefined && !check) {
    fail("--target is only valid with --check");
}
if (selectedTarget !== undefined && !TARGETS.includes(selectedTarget)) {
    fail(`unknown target: ${selectedTarget}`);
}
const manifestPath = join(root, "packaging", "toolchain.json");
const lockPath = join(root, "packaging", "toolchain.lock.json");

function readJson(path, label) {
    if (!existsSync(path)) {
        fail(`${label} is missing: ${path}`);
    }
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        fail(`${label} is not valid JSON: ${error.message}`);
    }
}

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function collectFiles(directory, base, files) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
        const path = join(directory, entry.name);
        const info = lstatSync(path);
        if (info.isSymbolicLink()) {
            fail(`refusing to hash a symbolic link in the built tree: ${path}`);
        }
        if (info.isDirectory()) {
            collectFiles(path, base, files);
        } else if (info.isFile()) {
            files.push({
                path: relative(base, path).split(sep).join("/"),
                size: info.size,
                hash: sha256(readFileSync(path)),
            });
        } else {
            fail(`unsupported file type in the built tree: ${path}`);
        }
    }
}

function hashPath(path) {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) {
        fail(`refusing to hash a symbolic link in the built tree: ${path}`);
    }
    if (info.isFile()) {
        if (info.size === 0) {
            fail(`claimed artifact is zero bytes: ${path}`);
        }
        return {
            sha256: sha256(readFileSync(path)),
            size: info.size,
            files: undefined,
        };
    }
    if (!info.isDirectory()) {
        fail(`claimed artifact is neither a file nor a directory: ${path}`);
    }
    const files = [];
    collectFiles(path, path, files);
    if (files.length === 0) {
        fail(`claimed artifact directory is empty: ${path}`);
    }
    const tree = createHash("sha256");
    let size = 0;
    for (const file of files) {
        tree.update(`${file.path}\0${file.hash}\0${String(file.size)}\n`);
        size += file.size;
    }
    if (size === 0) {
        fail(`claimed artifact is zero bytes: ${path}`);
    }
    return {
        sha256: tree.digest("hex"),
        size,
        files: files.map((file) => file.path),
    };
}

function sourceUrl(source) {
    if (source.kind === "pypi") {
        if (source.index !== undefined) {
            return `${source.index.replace(/\/$/u, "")}/${encodeURIComponent(source.project)}/`;
        }
        return `https://pypi.org/project/${encodeURIComponent(source.project)}/${encodeURIComponent(source.version)}/`;
    }
    return source.url;
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

function targetPath(target, install) {
    const targetRoot = resolve(from, target);
    const artifactPath = resolve(targetRoot, install);
    if (artifactPath !== targetRoot && !artifactPath.startsWith(`${targetRoot}${sep}`)) {
        fail(`artifact path escapes its target root: ${target}/${install}`);
    }
    if (!existsSync(artifactPath)) {
        fail(`claimed artifact is missing from the built tree: ${target}/${install}`);
    }
    return artifactPath;
}

function buildLock(manifest, manifestBytes, targetsToBuild = TARGETS) {
    const validation = validateManifest(manifest);
    if (validation.errors.length > 0) {
        fail(`toolchain manifest is invalid:\n  - ${validation.errors.join("\n  - ")}`);
    }
    const { components, revision } = validation;
    const targets = {};
    for (const target of targetsToBuild) {
        const targetRoot = resolve(from, target);
        if (!existsSync(targetRoot) || !statSync(targetRoot).isDirectory()) {
            fail(`the built target directory is missing: ${targetRoot}`);
        }
        const lockedComponents = {};
        const installs = new Map();
        for (const [id, component] of components) {
            const claim = component.artifacts?.[target];
            if (claim === undefined) {
                continue;
            }
            const install = claim.install.replaceAll("\\", "/").replace(/\/{2,}/gu, "/");
            const previous = installs.get(install);
            if (previous !== undefined) {
                fail(
                    `duplicate install path for ${target}: ${claim.install} is claimed by ${previous} and ${id}`,
                );
            }
            installs.set(install, id);
            const artifactPath = targetPath(target, claim.install);
            const digest = hashPath(artifactPath);
            lockedComponents[id] = {
                version: component.version,
                license: component.license,
                source: component.source,
                artifact: {
                    url: sourceUrl(component.source),
                    sha256: digest.sha256,
                    size: digest.size,
                    install: claim.install,
                    ...(digest.files === undefined ? {} : { files: digest.files }),
                },
            };
        }
        if (Object.keys(lockedComponents).length === 0) {
            fail(`the built target has no components claimed in the manifest: ${target}`);
        }
        // The component hashes cover the files each recipe claims. The target tree hash
        // also covers runtime files staged beside an executable, such as the MinGW/Qt DLL
        // closure beside mkvmerge.exe, so a release input cannot change outside the lock.
        const targetTree = hashPath(targetRoot);
        targets[target] = {
            components: lockedComponents,
            tree: {
                sha256: targetTree.sha256,
                size: targetTree.size,
                files: targetTree.files,
            },
        };
    }
    return {
        schema_version: 1,
        revision,
        manifest_sha256: sha256(manifestBytes),
        targets,
    };
}

const manifest = readJson(manifestPath, "toolchain manifest");
const manifestText = readFileSync(manifestPath, "utf8");
const targetsToBuild = selectedTarget === undefined ? TARGETS : [selectedTarget];
const lock = buildLock(manifest, manifestText, targetsToBuild);
const generated = `${JSON.stringify(lock, null, 4)}\n`;

if (check) {
    if (!existsSync(lockPath)) {
        fail(`lock is missing; run npm run toolchain:lock: ${lockPath}`);
    }
    const checkedIn = readJson(lockPath, "toolchain lock");
    if (selectedTarget !== undefined) {
        if (
            checkedIn.revision !== lock.revision ||
            checkedIn.manifest_sha256 !== lock.manifest_sha256
        ) {
            fail(`lock metadata is stale; run npm run toolchain:lock: ${lockPath}`);
        }
        const expected = lock.targets[selectedTarget];
        const actual = checkedIn.targets?.[selectedTarget];
        if (actual === undefined) {
            fail(`lock is missing target ${selectedTarget}: ${lockPath}`);
        }
        if (canonical(actual) !== canonical(expected)) {
            fail(`lock target ${selectedTarget} is stale; run npm run toolchain:lock: ${lockPath}`);
        }
        console.log(`toolchain:lock check passed for ${selectedTarget}: ${lockPath}`);
    } else {
        if (readFileSync(lockPath, "utf8") !== generated) {
            fail(`lock is stale; run npm run toolchain:lock: ${lockPath}`);
        }
        console.log(`toolchain:lock check passed: ${lockPath}`);
    }
} else {
    mkdirSync(dirname(lockPath), { recursive: true });
    const temporaryPath = `${lockPath}.tmp`;
    writeFileSync(temporaryPath, generated, "utf8");
    rmSync(lockPath, { force: true });
    renameSync(temporaryPath, lockPath);
    console.log(
        `toolchain:lock wrote ${lockPath} (${String(Object.keys(lock.targets).length)} targets)`,
    );
}
