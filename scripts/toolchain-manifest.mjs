// Shared review rules for packaging/toolchain.json.
//
// Both the lock generator and the verifier import this module so a manifest rule cannot be
// enforced in one command and forgotten in the other. Validation returns every problem
// instead of exiting: the verifier reports the full set, while the generator refuses to
// write anything when the set is non-empty.
export const TARGETS = Object.freeze([
    "x86_64-pc-windows-msvc",
    "aarch64-apple-darwin",
    "x86_64-unknown-linux-gnu",
]);

export const TARGET_SET = new Set(TARGETS);
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9:+.-]*$/u;
const SAFE_VARIABLE = /^[a-z0-9][a-z0-9_:+.-]*$/u;
const PLACEHOLDER = /(?:^|[<>{}\s])(?:latest|tbd|todo|changeme|placeholder)(?:$|[<>{}\s])/iu;
const REVISION = /^[0-9]{4}\.[0-9]{2}\.[0-9]+$/u;
const RECIPE_PREFIX = "packaging/recipes/";

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function makeRequiredString(problem) {
    return (object, key, where) => {
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
    };
}

function makeHttpsUrl(problem) {
    return (value, where) => {
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
    };
}

function makeInstallPath(problem) {
    return (value, where) => {
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
    };
}

function makeSourceValidator(problem, requiredString, httpsUrl) {
    return (source, where) => {
        if (!isObject(source)) {
            problem(`${where} must be an object`);
            return;
        }
        switch (source.kind) {
            case "git": {
                const url = requiredString(source, "url", where);
                if (url !== null) {
                    httpsUrl(url, `${where}.url`);
                }
                const commit = requiredString(source, "commit", where);
                if (commit !== null && !COMMIT.test(commit)) {
                    problem(`${where}.commit must be a full 40-hex commit`);
                }
                if (source.tag !== undefined && typeof source.tag !== "string") {
                    problem(`${where}.tag must be a string when present`);
                }
                break;
            }
            case "pypi": {
                requiredString(source, "project", where);
                requiredString(source, "version", where);
                if (source.index !== undefined) {
                    const index = requiredString(source, "index", where);
                    if (index !== null) {
                        httpsUrl(index, `${where}.index`);
                    }
                }
                break;
            }
            case "url": {
                const url = requiredString(source, "url", where);
                if (url !== null) {
                    httpsUrl(url, `${where}.url`);
                }
                const sha = requiredString(source, "sha256", where);
                if (sha !== null && !SHA256.test(sha)) {
                    problem(`${where}.sha256 must be a lowercase SHA-256`);
                }
                break;
            }
            default:
                problem(`${where}.kind must be git, pypi, or url`);
        }
    };
}

/**
 * Validate the reviewed manifest without touching the filesystem.
 *
 * `components` contains the valid id-keyed entries so the verifier can compare the lock
 * against the same document the generator used. An invalid manifest still returns a Map
 * (possibly empty) and every error, never a partial success.
 */
export function validateManifest(manifest) {
    const errors = [];
    const problem = (message) => errors.push(message);
    const requiredString = makeRequiredString(problem);
    const httpsUrl = makeHttpsUrl(problem);
    const installPath = makeInstallPath(problem);
    const validateSource = makeSourceValidator(problem, requiredString, httpsUrl);

    if (!isObject(manifest)) {
        problem("toolchain manifest must be an object");
        return { components: new Map(), revision: null, errors };
    }
    if (manifest.schema_version !== 1) {
        problem("toolchain manifest.schema_version must be 1");
    }
    const revision = requiredString(manifest, "revision", "toolchain manifest");
    if (revision !== null && !REVISION.test(revision)) {
        problem("toolchain manifest.revision must use YYYY.MM.N");
    }
    if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
        problem("toolchain manifest.components must be a non-empty array");
        return { components: new Map(), revision, errors };
    }

    const components = new Map();
    for (const [index, component] of manifest.components.entries()) {
        const where = `toolchain manifest.components[${index}]`;
        if (!isObject(component)) {
            problem(`${where} must be an object`);
            continue;
        }
        const id = requiredString(component, "id", where);
        if (id !== null && !SAFE_TOKEN.test(id)) {
            problem(`${where}.id is not a safe component id: ${id}`);
        }
        if (id !== null && components.has(id)) {
            problem(`toolchain manifest has a duplicate component id: ${id}`);
        }
        requiredString(component, "version", where);
        requiredString(component, "license", where);
        if (!Array.isArray(component.provides) || component.provides.length === 0) {
            problem(`${where}.provides must be a non-empty array`);
        } else {
            for (const [provideIndex, provide] of component.provides.entries()) {
                if (typeof provide !== "string" || provide.trim() === "") {
                    problem(`${where}.provides[${provideIndex}] must be a non-empty string`);
                }
            }
        }
        validateSource(component.source, `${where}.source`);
        if (component.build !== undefined) {
            if (!isObject(component.build)) {
                problem(`${where}.build must be an object when present`);
            } else {
                const recipe = requiredString(component.build, "recipe", `${where}.build`);
                if (recipe !== null && !recipe.startsWith(RECIPE_PREFIX)) {
                    problem(`${where}.build.recipe must live under ${RECIPE_PREFIX}`);
                }
                if (component.build.toolchain !== undefined) {
                    requiredString(component.build, "toolchain", `${where}.build`);
                }
                if (component.build.indexes !== undefined) {
                    if (!Array.isArray(component.build.indexes)) {
                        problem(`${where}.build.indexes must be an array when present`);
                    } else {
                        for (const [index, url] of component.build.indexes.entries()) {
                            const location = `${where}.build.indexes[${index}]`;
                            if (typeof url !== "string" || url.trim() === "") {
                                problem(`${location} must be a non-empty HTTPS URL`);
                            } else {
                                httpsUrl(url, location);
                            }
                        }
                    }
                }
                if (component.build.variables !== undefined) {
                    if (!isObject(component.build.variables)) {
                        problem(`${where}.build.variables must be an object when present`);
                    } else {
                        for (const [key, value] of Object.entries(component.build.variables)) {
                            if (!SAFE_VARIABLE.test(key)) {
                                problem(`${where}.build.variables has an unsafe key: ${key}`);
                            }
                            if (typeof value !== "string" || value.trim() === "") {
                                problem(
                                    `${where}.build.variables.${key} must be a non-empty string`,
                                );
                            } else if (PLACEHOLDER.test(value)) {
                                problem(
                                    `${where}.build.variables.${key} contains a placeholder: ${value}`,
                                );
                            }
                        }
                    }
                }
            }
        }
        if (!isObject(component.artifacts) || Object.keys(component.artifacts).length === 0) {
            problem(`${where}.artifacts must be a non-empty object`);
        } else {
            for (const [target, artifact] of Object.entries(component.artifacts)) {
                if (!TARGET_SET.has(target)) {
                    problem(`${where}.artifacts has an unknown target: ${target}`);
                }
                if (!isObject(artifact)) {
                    problem(`${where}.artifacts.${target} must be an object`);
                } else {
                    installPath(artifact.install, `${where}.artifacts.${target}.install`);
                }
            }
        }
        if (id !== null) {
            components.set(id, component);
        }
    }
    return { components, revision, errors };
}
