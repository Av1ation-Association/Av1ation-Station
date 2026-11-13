// Run the two focused halves of the verify gate at once.
//
// The halves write different reports (web coverage and Rust lcov) and use different tool
// chains, so the only shared step is the static gate, which package.json runs before this
// script. Keeping this orchestration here avoids shell-specific `&`/`wait` syntax.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
const fallbackNpm = process.platform === "win32" ? "npm.cmd" : "npm";
const scripts = ["verify:web", "verify:rust"];

function run(script) {
    const command = npmCli === undefined ? fallbackNpm : process.execPath;
    const args = npmCli === undefined ? ["run", script] : [npmCli, "run", script];
    const child = spawn(command, args, {
        cwd: root,
        stdio: "inherit",
        // npm.cmd needs a shell only on the fallback path; the normal npm_execpath path is
        // already an executable plus a JavaScript entry point.
        shell: npmCli === undefined && process.platform === "win32",
        env: process.env,
    });

    return new Promise((resolveResult) => {
        let settled = false;
        const settle = (code) => {
            if (settled) {
                return;
            }
            settled = true;
            resolveResult({ script, code });
        };

        child.once("error", (error) => {
            console.error(`[verify] ${script} could not start: ${error.message}`);
            settle(1);
        });
        child.once("exit", (code, signal) => {
            settle(code ?? (signal === null ? 0 : 1));
        });
    });
}

console.log(`[verify] running ${scripts.join(" and ")} in parallel`);
const results = await Promise.all(scripts.map(run));
let failed = false;
for (const { script, code } of results) {
    if (code === 0) {
        console.log(`[verify] ${script} passed`);
    } else {
        failed = true;
        console.error(`[verify] ${script} failed with exit ${String(code)}`);
    }
}

if (failed) {
    process.exitCode = 1;
}
