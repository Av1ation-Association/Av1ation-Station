// Type-check every workspace project with one process per available CPU. TypeScript's
// incremental state is per tsconfig, so parallel projects do not share build info.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { tsBuildInfoDir } from "./build-paths.mjs";
import { discoverTypecheckProjects } from "./typecheck-projects.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tsc = resolve(root, "node_modules", "typescript", "bin", "tsc");
let projects;
try {
    projects = discoverTypecheckProjects(root);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
const concurrency = Math.max(1, Math.min(projects.length, availableParallelism()));
mkdirSync(tsBuildInfoDir, { recursive: true });
let nextProject = 0;
let failed = false;

function run(project) {
    return new Promise((resolveRun) => {
        const child = spawn(
            process.execPath,
            [tsc, "--noEmit", "--pretty", "false", "-p", project],
            { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
        );
        let output = "";
        child.stdout.on("data", (chunk) => {
            output += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            output += chunk.toString();
        });
        child.on("error", (error) => {
            failed = true;
            console.error(`${project}: ${error.message}`);
            resolveRun();
        });
        child.on("close", (code) => {
            if (code !== 0) {
                failed = true;
                process.stderr.write(`\n[${project}]\n${output}`);
            }
            resolveRun();
        });
    });
}

async function worker() {
    while (true) {
        const project = projects[nextProject];
        nextProject += 1;
        if (project === undefined) {
            return;
        }
        await run(project);
    }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
if (failed) {
    process.exit(1);
}
console.log(`Typecheck passed: ${projects.length} projects (${concurrency} parallel).`);
