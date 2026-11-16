// Stamp the CI-only weekly version, or validate a stable/RC release version.
//
// A weekly tag names its calendar date, but its package version also carries the source
// commit suffix. That version is never committed: the release checkout is immutable, and
// every package leg stamps the same value before building. Stable and RC tags require the
// committed package version to match the tag exactly; this script refuses a mismatch.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseReleaseTag, releaseShape } from "./release-manifest.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);

function fail(message) {
    console.error(`release:version: ${message}`);
    process.exit(1);
}

function requiredValue(name) {
    const index = args.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    const value = args[index + 1];
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
        fail(`${name} must be followed by a value`);
    }
    return value.trim();
}

/** Return the version a release checkout must build for this tag and source commit. */
export function versionForTag(tag, sha, currentVersion) {
    const shape = parseReleaseTag(tag);
    if (shape.channel !== "weekly") {
        releaseShape({ tag, version: currentVersion });
        return currentVersion;
    }
    if (typeof sha !== "string" || !/^[0-9a-f]{7,40}$/u.test(sha)) {
        throw new Error("a 7-40 character lowercase commit SHA is required for a weekly release");
    }
    return `${shape.base}-weekly.${shape.date}.${sha.slice(0, 7)}`;
}

function main() {
    if (args.includes("--help")) {
        console.log(`Usage: node scripts/stamp-release-version.mjs [--check|--write] --tag <tag> [--sha <commit>] [--no-sync]

Validate a stable or release-candidate tag's package version, or stamp a weekly version.
The write mode changes the checkout only; it never commits the stamped version. --no-sync
writes package.json without propagating the version to Tauri, Cargo or generated files; use
it only where no build follows and the package version is the sole input.`);
        return;
    }
    const check = args.includes("--check");
    const write = args.includes("--write");
    const noSync = args.includes("--no-sync");
    if (check === write) {
        fail("pass exactly one of --check or --write");
    }
    const tag = requiredValue("--tag");
    if (tag === undefined) {
        fail("--tag is required");
    }
    const packagePath = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const currentVersion = pkg.version;
    if (typeof currentVersion !== "string" || currentVersion.trim() === "") {
        fail("package.json has no version");
    }
    const sha = requiredValue("--sha") ?? process.env.GITHUB_SHA;

    let expected;
    try {
        expected = versionForTag(tag, sha, currentVersion);
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }

    if (check) {
        const shape = parseReleaseTag(tag);
        if (shape.channel === "weekly") {
            if (currentVersion !== shape.base && currentVersion !== expected) {
                fail(
                    `weekly package version must be ${shape.base} or ${expected}; found ${currentVersion}`,
                );
            }
            console.log(`release:version checked: weekly will stamp ${expected}`);
            return;
        }
        console.log(`release:version checked: ${currentVersion}`);
        return;
    }

    if (expected === currentVersion) {
        console.log(`release:version already stamped: ${currentVersion}`);
        return;
    }
    if (parseReleaseTag(tag).channel !== "weekly") {
        fail(`stable/RC package version must be ${expected}; found ${currentVersion}`);
    }
    pkg.version = expected;
    writeFileSync(packagePath, `${JSON.stringify(pkg, null, 4)}\n`, "utf8");
    if (noSync) {
        console.log(`release:version stamped ${expected} in package.json only`);
        return;
    }
    const sync = spawnSync(process.execPath, [join(root, "scripts", "version.mjs")], {
        cwd: root,
        stdio: "inherit",
    });
    if (sync.error) {
        fail(sync.error.message);
    }
    if (sync.status !== 0) {
        fail(`version:sync failed with status ${String(sync.status)}`);
    }
    console.log(`release:version stamped ${expected}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
}
