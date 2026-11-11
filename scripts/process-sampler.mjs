#!/usr/bin/env node
// One process sampler for both benchmarks.
//
// `--marker` samples the summed resident set of every FFmpeg process while the marker file
// exists, and writes one peak object when it disappears. `--player` samples the browser tree
// and the application tree once per interval and appends one JSON line per sample. Flushing
// every sample means a benchmark that crashes still leaves its measurements behind.

import { appendFileSync, existsSync, writeFileSync } from "node:fs";

import { ffmpegBytes, listProcesses, treeBytes } from "./process-metrics.mjs";

const args = process.argv.slice(2);
function value(flag, fallback) {
    const index = args.indexOf(flag);
    return index === -1 ? fallback : args[index + 1];
}

const out = value("--out");
const interval = Number(value("--interval", "250"));
const marker = value("--marker");
const player = Number(value("--player", "0"));
const app = value("--app", "av1ation-desktop");

if (out === undefined) {
    console.error("process-sampler needs --out <file>");
    process.exit(1);
}

writeFileSync(out, "");
if (marker !== undefined) {
    writeFileSync(`${out}.ready`, "ready");
}

let peakBytes = 0;
let peakProcesses = 0;
let samples = 0;
let finished = false;

function finish() {
    if (finished) {
        return;
    }
    finished = true;
    clearInterval(timer);
    if (marker !== undefined) {
        writeFileSync(out, JSON.stringify({ peakBytes, peakProcesses, samples }));
    }
    process.exit(0);
}

const timer = setInterval(() => {
    if (marker !== undefined) {
        const ffmpeg = ffmpegBytes();
        if (ffmpeg.bytes > peakBytes) {
            peakBytes = ffmpeg.bytes;
            peakProcesses = ffmpeg.count;
        }
        samples += 1;
        if (!existsSync(marker)) {
            finish();
        }
        return;
    }

    const processes = listProcesses();
    const root = processes.find((process) =>
        process.name.toLowerCase().includes(app.toLowerCase()),
    );
    appendFileSync(
        out,
        `${JSON.stringify({
            at: Date.now(),
            app: root === undefined ? 0 : treeBytes(root.pid, processes),
            player: treeBytes(player, processes),
            appRoot: root?.pid ?? 0,
        })}\n`,
    );
    samples += 1;
    // The benchmark may die without killing this child; its player root disappearing is the
    // signal that there is nothing left to sample.
    if (player > 0 && !processes.some((process) => process.pid === player)) {
        finish();
    }
}, interval);

process.on("SIGTERM", finish);
process.on("SIGINT", finish);
