// The version lives in package.json. Everything else receives it from here.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export const WORKSPACE_PACKAGES = [
    "av1ation-contracts",
    "av1ation-engine",
    "av1ation-service",
    "av1ation-test-support",
    "av1ation-desktop",
];

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const TAURI_VERSION = /("version"\s*:\s*")[^"]*(")/u;
const CARGO_WORKSPACE_VERSION = /(\[workspace\.package\][\s\S]*?\n\s*version\s*=\s*")[^"]*(")/u;
const GENERATOR = join(root, "packages", "contracts", "scripts", "generate.mjs");

function crateVersionPattern(name) {
    return new RegExp(
        `(\\[\\[package\\]\\]\\r?\\nname = "${name}"\\r?\\nversion = ")[^"]+(")`,
        "u",
    );
}

/** Reads the `[[package]]` name/version pairs from a Cargo.lock document. */
export function lockVersions(contents) {
    const versions = new Map();
    const pattern = /\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = "([^"]+)"/gu;
    for (const match of contents.matchAll(pattern)) {
        versions.set(match[1], match[2]);
    }
    return versions;
}

/** Rewrites only the workspace crate entries, leaving every other locked version alone. */
export function rewriteLock(contents, version) {
    let next = contents;
    for (const name of WORKSPACE_PACKAGES) {
        next = next.replace(crateVersionPattern(name), `$1${version}$2`);
    }
    return next;
}

async function main() {
    const check = process.argv.includes("--check");
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const version = pkg.version;
    if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
        throw new Error(`package.json has an invalid version: ${String(version)}`);
    }

    const manifestEdits = [
        {
            path: join(root, "rust/desktop-shell/tauri.conf.json"),
            pattern: TAURI_VERSION,
        },
        {
            path: join(root, "rust/Cargo.toml"),
            pattern: CARGO_WORKSPACE_VERSION,
        },
    ];

    let stale = false;
    for (const edit of manifestEdits) {
        const current = await readFile(edit.path, "utf8");
        if (!edit.pattern.test(current)) {
            throw new Error(`could not find a version field in ${edit.path}`);
        }
        const next = current.replace(edit.pattern, `$1${version}$2`);
        if (next === current) {
            continue;
        }
        if (check) {
            stale = true;
            console.error(`${edit.path} is not at ${version}`);
        } else {
            await writeFile(edit.path, next, "utf8");
        }
    }

    const lockPath = join(root, "rust/Cargo.lock");
    const before = lockVersions(await readFile(lockPath, "utf8"));
    const mismatch = WORKSPACE_PACKAGES.filter((name) => before.get(name) !== version);

    if (check) {
        if (mismatch.length > 0) {
            stale = true;
            console.error(`Cargo.lock is not at ${version} for: ${mismatch.join(", ")}`);
        }
        if (stale) {
            process.exit(1);
        }
        const generated = spawnSync(process.execPath, [GENERATOR, "--check"], {
            cwd: root,
            stdio: "inherit",
        });
        if (generated.status !== 0) {
            process.exit(1);
        }
        console.log(`versions agree at ${version}`);
        return;
    }

    if (mismatch.length > 0) {
        const result = spawnSync(
            process.execPath,
            [
                join(root, "scripts", "run-cargo.mjs"),
                "update",
                ...WORKSPACE_PACKAGES.flatMap((name) => ["-p", name]),
            ],
            { cwd: root, stdio: "inherit" },
        );
        if (result.status !== 0) {
            throw new Error("cargo update failed; Cargo.lock was not refreshed");
        }
    }

    const after = lockVersions(await readFile(lockPath, "utf8"));
    const stillWrong = WORKSPACE_PACKAGES.filter((name) => after.get(name) !== version);
    if (stillWrong.length > 0) {
        throw new Error(`Cargo.lock still disagrees for: ${stillWrong.join(", ")}`);
    }

    const generated = spawnSync(process.execPath, [GENERATOR], {
        cwd: root,
        stdio: "inherit",
    });
    if (generated.status !== 0) {
        throw new Error("contract generation failed; version metadata was not refreshed");
    }

    console.log(`version propagated: ${version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
