// Fail-closed verifier for the reviewed toolchain manifest and generated lock.
//
// The release policy requires every target to be represented by immutable source pins and
// hashed artifacts before a workflow may build. This check deliberately has no fallback to
// `dist/tools`, a package manager, or the network: a missing lock is a blocked release, not a
// warning.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TARGETS, TARGET_SET, validateManifest } from "./toolchain-manifest.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
for (const argument of args) {
    if (argument.startsWith("--") && !["--root", "--manifest-only"].includes(argument)) {
        console.error(`toolchain:verify: unknown option ${argument}`);
        process.exit(1);
    }
}
const rootIndex = args.indexOf("--root");
if (rootIndex !== -1 && args[rootIndex + 1] === undefined) {
    console.error("toolchain:verify: --root must be followed by a directory");
    process.exit(1);
}
const root = rootIndex === -1 ? repoRoot : resolve(args[rootIndex + 1]);
const manifestOnly = args.includes("--manifest-only");
const manifestPath = join(root, "packaging", "toolchain.json");
const lockPath = join(root, "packaging", "toolchain.lock.json");

const SHA256 = /^[a-f0-9]{64}$/u;
const PLACEHOLDER = /(?:^|[<>{}\s])(?:latest|tbd|todo|changeme|placeholder)(?:$|[<>{}\s])/iu;

const errors = [];

function problem(message) {
    errors.push(message);
}

function readJson(path, label) {
    if (!existsSync(path)) {
        problem(`${label} is missing: ${path}`);
        return null;
    }
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        problem(`${label} is not valid JSON: ${error.message}`);
        return null;
    }
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(object, key, where) {
    const value = object[key];
    if (typeof value !== "string" || value.trim() === "") {
        problem(`${where}.${key} must be a non-empty string`);
        return null;
    }
    if (PLACEHOLDER.test(value)) {
        problem(`${where}.${key} contains a placeholder or mutable ref: ${value}`);
        return null;
    }
    return value;
}

function httpsUrl(value, where) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        problem(`${where} must be an absolute URL: ${value}`);
        return false;
    }
    if (parsed.protocol !== "https:") {
        problem(`${where} must use HTTPS: ${value}`);
        return false;
    }
    if (/\/latest(?:\/|$)/iu.test(parsed.pathname)) {
        problem(`${where} must not point at a mutable latest asset: ${value}`);
        return false;
    }
    return true;
}

function installPath(value, where) {
    if (typeof value !== "string" || !value.startsWith("tools/")) {
        problem(`${where} must be a relative install path under tools/`);
        return false;
    }
    if (/[<>{}]/u.test(value) || value.split("/").includes("..") || value.startsWith("/")) {
        problem(`${where} must not escape tools/: ${value}`);
        return false;
    }
    if (/\.pdb$/iu.test(value)) {
        problem(`${where} must not ship a debug symbol: ${value}`);
        return false;
    }
    return true;
}

function canonical(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonical).join(",")}]`;
    }
    if (isObject(value)) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function sameValue(left, right) {
    return canonical(left) === canonical(right);
}

function validateLock(lock, manifest, manifestBytes, components) {
    if (!isObject(lock)) {
        problem("toolchain lock must be an object");
        return;
    }
    if (lock.schema_version !== 1) {
        problem("toolchain lock.schema_version must be 1");
    }
    if (lock.revision !== manifest.revision) {
        problem("toolchain lock.revision must match the manifest revision");
    }
    const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
    if (lock.manifest_sha256 !== manifestHash) {
        problem("toolchain lock.manifest_sha256 does not match the manifest bytes");
    }
    if (!isObject(lock.targets)) {
        problem("toolchain lock.targets must be an object");
        return;
    }

    const targetKeys = Object.keys(lock.targets);
    for (const target of TARGETS) {
        if (!Object.hasOwn(lock.targets, target)) {
            problem(`toolchain lock is missing target ${target}`);
        }
    }
    for (const target of targetKeys) {
        if (!TARGET_SET.has(target)) {
            problem(`toolchain lock has an unknown target ${target}`);
        }
    }
    if (errors.some((message) => message.includes("missing target"))) {
        return;
    }

    for (const target of TARGETS) {
        const targetEntry = lock.targets[target];
        if (!isObject(targetEntry) || !isObject(targetEntry.components)) {
            problem(`toolchain lock.targets.${target}.components must be an object`);
            continue;
        }
        if (Object.keys(targetEntry.components).length === 0) {
            problem(`toolchain lock.targets.${target}.components must not be empty`);
        }

        const targetWhere = `toolchain lock.targets.${target}`;
        const treeFiles = new Set();
        if (!isObject(targetEntry.tree)) {
            problem(`${targetWhere}.tree must be an object`);
        } else {
            const tree = targetEntry.tree;
            const treeSha = requiredString(tree, "sha256", `${targetWhere}.tree`);
            if (treeSha !== null && !SHA256.test(treeSha)) {
                problem(`${targetWhere}.tree.sha256 must be a lowercase SHA-256`);
            }
            if (!Number.isInteger(tree.size) || tree.size < 1) {
                problem(`${targetWhere}.tree.size must be a positive integer`);
            }
            if (!Array.isArray(tree.files) || tree.files.length === 0) {
                problem(`${targetWhere}.tree.files must be a non-empty array`);
            } else {
                for (const file of tree.files) {
                    if (typeof file !== "string" || file.trim() === "") {
                        problem(`${targetWhere}.tree.files entries must be non-empty strings`);
                        continue;
                    }
                    if (!file.startsWith("tools/") || file.split("/").includes("..")) {
                        problem(`${targetWhere}.tree.files entry is outside tools/: ${file}`);
                        continue;
                    }
                    if (/\.pdb$/iu.test(file)) {
                        problem(`${targetWhere}.tree.files must not ship a debug symbol: ${file}`);
                    }
                    if (treeFiles.has(file)) {
                        problem(`${targetWhere}.tree.files has a duplicate entry: ${file}`);
                    }
                    treeFiles.add(file);
                }
            }
        }

        const installs = new Set();
        for (const [id, locked] of Object.entries(targetEntry.components)) {
            const where = `toolchain lock.targets.${target}.components.${id}`;
            const component = components.get(id);
            if (component === undefined) {
                problem(`${where} does not exist in the manifest`);
                continue;
            }
            if (!isObject(locked)) {
                problem(`${where} must be an object`);
                continue;
            }
            if (locked.version !== component.version) {
                problem(`${where}.version does not match the manifest`);
            }
            if (locked.license !== component.license) {
                problem(`${where}.license does not match the manifest`);
            }
            if (!sameValue(locked.source, component.source)) {
                problem(`${where}.source does not match the manifest`);
            }
            if (!isObject(locked.artifact)) {
                problem(`${where}.artifact must be an object`);
                continue;
            }
            const artifact = locked.artifact;
            const url = requiredString(artifact, "url", `${where}.artifact`);
            if (url !== null) {
                httpsUrl(url, `${where}.artifact.url`);
            }
            const sha = requiredString(artifact, "sha256", `${where}.artifact`);
            if (sha !== null && !SHA256.test(sha)) {
                problem(`${where}.artifact.sha256 must be a lowercase SHA-256`);
            }
            if (!Number.isInteger(artifact.size) || artifact.size < 1) {
                problem(`${where}.artifact.size must be a positive integer`);
            }
            if (installPath(artifact.install, `${where}.artifact.install`) === false) {
                continue;
            }
            if (
                component.artifacts?.[target]?.install !== undefined &&
                artifact.install !== component.artifacts[target].install
            ) {
                problem(`${where}.artifact.install does not match the manifest`);
            }
            if (installs.has(artifact.install)) {
                problem(
                    `toolchain lock.targets.${target} has a duplicate install path: ${artifact.install}`,
                );
            }
            installs.add(artifact.install);
        }

        if (treeFiles.size > 0) {
            for (const [id, locked] of Object.entries(targetEntry.components)) {
                if (
                    !isObject(locked) ||
                    !isObject(locked.artifact) ||
                    typeof locked.artifact.install !== "string"
                ) {
                    continue;
                }
                const install = locked.artifact.install;
                if (
                    ![...treeFiles].some(
                        (file) => file === install || file.startsWith(`${install}/`),
                    )
                ) {
                    problem(`${targetWhere}.tree.files does not cover ${id} artifact ${install}`);
                }
            }
        }

        for (const [id, component] of components) {
            if (
                component.artifacts?.[target] !== undefined &&
                !Object.hasOwn(targetEntry.components, id)
            ) {
                problem(`toolchain lock.targets.${target} is missing claimed component ${id}`);
            }
        }
    }
}

const manifest = readJson(manifestPath, "toolchain manifest");
const lock = manifestOnly ? null : readJson(lockPath, "toolchain lock");
const manifestBytes = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";

if (manifest !== null) {
    const validation = validateManifest(manifest);
    for (const message of validation.errors) {
        problem(message);
    }
    for (const [id, component] of validation.components) {
        const recipe = component.build?.recipe;
        if (recipe !== undefined && !existsSync(resolve(root, recipe))) {
            problem(`toolchain manifest.components.${id}.build.recipe is missing: ${recipe}`);
        }
    }
    if (!manifestOnly && lock !== null) {
        validateLock(lock, manifest, manifestBytes, validation.components);
    }
}

if (errors.length > 0) {
    console.error(`toolchain:verify failed with ${String(errors.length)} problem(s):`);
    for (const message of errors) {
        console.error(`  - ${message}`);
    }
    console.error("");
    console.error(
        manifestOnly
            ? "The manifest is not deployable. Fix the reviewed inputs before a build."
            : "The release gate is closed. Populate packaging/toolchain.json and the generated " +
                  "packaging/toolchain.lock.json for every release target; do not hand-write the lock.",
    );
    process.exit(1);
}

console.log(
    `${manifestOnly ? "toolchain:check" : "toolchain:verify"} passed: ` +
        `${String(manifest.components.length)} component(s), ` +
        `${String(TARGETS.length)} targets, manifest ${createHash("sha256").update(manifestBytes).digest("hex").slice(0, 12)}.`,
);
