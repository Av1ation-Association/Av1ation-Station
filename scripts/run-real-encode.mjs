// Run the environment-gated real-encode suite the same way locally and in weekly CI.
//
// The tests generate their own clips through `av1ation-test-support`; nothing here reads a
// committed media file. VSScript keeps one Python runtime per process, so the suite is run
// with one test thread. A test that returns early because VapourSynth is absent prints
// `skipped:` and would otherwise let an incomplete run pass, so that is a failure here.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sanitizedPath } from "./sanitize-path.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rustRoot = resolve(root, "rust");
const logDirectory = resolve(root, "dist/real-encode");
const logPath = resolve(logDirectory, "real-encode.log");
const args = [
    "test",
    "--workspace",
    "--locked",
    "--no-fail-fast",
    "--",
    "--ignored",
    "--test-threads=1",
    "--nocapture",
];

mkdirSync(logDirectory, { recursive: true });
const log = createWriteStream(logPath, { encoding: "utf8" });
log.write(`$ cargo ${args.join(" ")}\n`);

const child = spawn("cargo", args, {
    cwd: rustRoot,
    env: { ...process.env, PATH: sanitizedPath() },
    stdio: ["ignore", "pipe", "pipe"],
});

let spawnError;
let finished = false;
const finish = (code) => {
    if (finished) {
        return;
    }
    finished = true;
    log.end(() => {
        const text = readFileSync(logPath, "utf8");
        const skipped = text.includes("skipped:");
        // `--nocapture` lets a test's own output interleave before the harness prints `ok`,
        // so count the per-binary `test result` totals instead of matching test-name lines.
        const passed = [...text.matchAll(/^test result: ok\. (\d+) passed;/gmu)].reduce(
            (total, match) => total + Number(match[1]),
            0,
        );

        if (spawnError !== undefined) {
            console.error(`[real-encode] cargo could not start: ${spawnError.message}`);
            process.exitCode = 1;
            return;
        }
        if (code !== 0) {
            console.error(`[real-encode] failed with exit ${String(code)}; see ${logPath}`);
            process.exitCode = code;
            return;
        }
        if (skipped) {
            console.error(
                "[real-encode] at least one test skipped; install VapourSynth, " +
                    `BestSource, FFmpeg, x264, SVT-AV1, and MKVToolNix. See ${logPath}`,
            );
            process.exitCode = 1;
            return;
        }
        if (passed === 0) {
            console.error(`[real-encode] no environment-gated tests ran; see ${logPath}`);
            process.exitCode = 1;
            return;
        }
        console.log(`[real-encode] ${passed} environment-gated tests passed; log: ${logPath}`);
    });
};

child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
});
child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    log.write(chunk);
});
child.once("error", (error) => {
    spawnError = error;
    finish(1);
});
child.once("close", (code, signal) => {
    finish(code ?? (signal === null ? 0 : 1));
});
