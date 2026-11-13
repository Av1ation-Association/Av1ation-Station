// Build both local release variants for the host platform, then write the checksums,
// release notes, and upload manifest.
//
// The wrappers own the Tauri invocation and variant-specific resource mapping. This script
// only sequences them and makes the release directory fresh so an old bundle cannot leak
// into the new pre-release.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { projectRoot, releaseDir, releasePlatform, stagedTools } from "./build-paths.mjs";
import { writeChecksums } from "./collect-release.mjs";
import { writeReleaseManifest } from "./release-manifest.mjs";

const args = process.argv.slice(2);
const skipBundled = args.includes("--skip-bundled");
const skipSystem = args.includes("--skip-system");

if (skipBundled && skipSystem) {
    console.error("Nothing to build: both --skip-bundled and --skip-system were supplied.");
    process.exit(1);
}
if (!skipBundled && !existsSync(stagedTools)) {
    console.error(`The bundled toolchain is missing: ${stagedTools}`);
    console.error("Stage it with: npm run stage:tools");
    process.exit(1);
}

const hostReleaseDir = join(releaseDir, releasePlatform());
rmSync(hostReleaseDir, { recursive: true, force: true });
mkdirSync(hostReleaseDir, { recursive: true });

function run(script, scriptArgs = []) {
    const result = spawnSync(
        process.execPath,
        [join(projectRoot, "scripts", script), ...scriptArgs],
        {
            cwd: projectRoot,
            stdio: "inherit",
        },
    );
    if (result.error) {
        console.error(result.error.message);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

if (!skipBundled) {
    console.log("Building bundled variant...");
    run("run-tauri.mjs", ["build"]);
}
if (!skipSystem) {
    console.log("Building system variant...");
    run("build-system.mjs");
}

if (!existsSync(releaseDir)) {
    console.error(`No release directory was produced: ${releaseDir}`);
    process.exit(1);
}
writeChecksums(releaseDir, { recursive: true });
writeReleaseManifest();
console.log("");
console.log(`Host artifacts: ${hostReleaseDir}`);
console.log(`All release artifacts: ${releaseDir}`);
console.log(`Checksums: ${join(releaseDir, "SHA256SUMS.txt")}`);
console.log(`Notes: ${join(releaseDir, "RELEASE-NOTES.md")}`);
