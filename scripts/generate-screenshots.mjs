// One command for the deterministic screenshot gallery.
//
// The website host is built first because the Playwright config serves its static output.
// The media is generated before the build so Vite copies it into the published directory.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

import { parseFeatureArguments } from "./screenshot-selection.mjs";

const root = process.cwd();
const { featureNotes, selector } = parseFeatureArguments(process.argv.slice(2));

// A shell is needed for npm/npx shims on Windows, and the shell needs the
// executable path quoted when it contains spaces (the default Node install does).
const nodeCommand = process.platform === "win32" ? `"${process.execPath}"` : process.execPath;

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited with status ${String(result.status)}`);
    }
}

rmSync(join(root, "dist", "screenshots"), { recursive: true, force: true });
run(nodeCommand, [join("scripts", "build-gallery-media.mjs")]);
run("npm", ["run", "build:website:gallery"]);
run("npx", ["playwright", "test", "--config", "playwright.screenshots.config.ts"]);
run(nodeCommand, [
    join("scripts", "publish-screenshots.mjs"),
    ...(featureNotes ? ["--feature-notes", selector] : []),
]);
run(nodeCommand, [join("scripts", "check-gallery.mjs")]);
