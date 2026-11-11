#!/usr/bin/env node
/**
 * Measures how to give the Scenes tab thumbnails without decoding a frame per request.
 *
 * The current still route opens the media, decodes one frame and writes a PNG for every
 * image the rail shows. That is why a scroll costs seconds per thumbnail and why memory
 * climbed with the number of rows: every request took its own decoder, and the browser's
 * six connections queued behind them.
 *
 * This script compares the work the app does today with one-pass extraction strategies on
 * the same real media, then serves the result through a mock cache to measure what a
 * request costs once the decoder is gone. It is deliberately not a pass/fail test: the
 * numbers are recorded by hand in docs/benchmarks/thumbnails.md.
 *
 *   npm run bench:thumbnails -- --video "C:/media/episode.mkv"
 *   npm run bench:thumbnails -- --video a.mkv --video b.mkv --interval 5 --width 320
 *
 * The mock server is part of the measurement, not the product: it stands in for the route
 * that would serve a pre-extracted file, including the single-flight build that collapses
 * concurrent first requests into one FFmpeg process.
 */
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
    createReadStream,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { countProcesses } from "./process-metrics.mjs";

const MIB = 1024 * 1024;
const DEFAULT_PAGE_SIZE = 30;

function defaultHwaccel() {
    if (process.platform === "win32") {
        return "d3d11va";
    }
    if (process.platform === "darwin") {
        return "videotoolbox";
    }
    return "vaapi";
}

function parseArgs(argv) {
    const options = {
        videos: [],
        interval: 5,
        width: 320,
        quality: 5,
        sample: 12,
        requests: 120,
        concurrency: 6,
        coalesceRequests: 30,
        out: "docs/benchmarks/thumbnails.json",
        ffmpeg: null,
        ffprobe: null,
        /** The platform's hardware decoder; CPU is the fallback when it is unavailable. */
        hwaccel: defaultHwaccel(),
        keep: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        const next = () => {
            index += 1;
            if (index >= argv.length) {
                throw new Error(`${flag} needs a value`);
            }
            return argv[index];
        };
        if (flag === "--video") {
            options.videos.push(path.resolve(next()));
        } else if (flag === "--interval") {
            options.interval = Number(next());
        } else if (flag === "--width") {
            options.width = Number(next());
        } else if (flag === "--quality") {
            options.quality = Number(next());
        } else if (flag === "--sample") {
            options.sample = Number(next());
        } else if (flag === "--requests") {
            options.requests = Number(next());
        } else if (flag === "--concurrency") {
            options.concurrency = Number(next());
        } else if (flag === "--coalesce-requests") {
            options.coalesceRequests = Number(next());
        } else if (flag === "--out") {
            options.out = next();
        } else if (flag === "--ffmpeg") {
            options.ffmpeg = next();
        } else if (flag === "--ffprobe") {
            options.ffprobe = next();
        } else if (flag === "--hwaccel") {
            options.hwaccel = next();
        } else if (flag === "--no-hw") {
            options.hwaccel = null;
        } else if (flag === "--keep") {
            options.keep = true;
        } else if (flag === "--help" || flag === "-h") {
            console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
            process.exit(0);
        } else {
            throw new Error(`unknown argument: ${flag}`);
        }
    }
    if (options.videos.length === 0) {
        throw new Error("pass at least one --video <path>");
    }
    for (const video of options.videos) {
        if (!existsSync(video)) {
            throw new Error(`no such video: ${video}`);
        }
    }
    if (!(options.interval > 0)) {
        throw new Error("--interval must be positive");
    }
    return options;
}

function findTool(explicit, name) {
    const command = explicit ?? name;
    try {
        execFileSync(command, ["-hide_banner", "-version"], { stdio: "ignore" });
    } catch {
        throw new Error(`No ${name} at ${command}. Pass --${name} <path>.`);
    }
    return command;
}

function probeVideo(ffprobe, file) {
    const json = execFileSync(
        ffprobe,
        [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate,nb_frames:format=duration,size",
            "-of",
            "json",
            file,
        ],
        { encoding: "utf8", maxBuffer: 8 * MIB },
    );
    const body = JSON.parse(json);
    const stream = body.streams?.[0];
    if (stream === undefined) {
        throw new Error(`${file} has no video stream`);
    }
    const [numerator, denominator] = String(stream.r_frame_rate).split("/").map(Number);
    const fps = denominator > 0 ? numerator / denominator : numerator;
    const duration = Number(body.format?.duration);
    if (!(duration > 0) || !(fps > 0)) {
        throw new Error(`${file} has no usable duration or frame rate`);
    }
    const frames =
        typeof stream.nb_frames === "number" && stream.nb_frames > 0
            ? stream.nb_frames
            : Math.round(duration * fps);
    return {
        width: stream.width,
        height: stream.height,
        fps,
        duration,
        frames,
        bytes: Number(body.format?.size ?? statSync(file).size),
    };
}

/**
 * Count keyframes from packet flags. Decoding them would measure the same thing more slowly;
 * `-skip_frame nokey` in the extraction pass already limits the decoder to these packets.
 */
function countKeyframes(ffprobe, file) {
    const listing = execFileSync(
        ffprobe,
        [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=flags",
            "-of",
            "csv=p=0",
            file,
        ],
        { encoding: "utf8", maxBuffer: 256 * MIB },
    );
    return listing.split(/\r?\n/u).filter((line) => line.split(",")[0]?.includes("K")).length;
}

function runProcess(command, args, logPath) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
        let tail = "";
        child.stderr.on("data", (chunk) => {
            tail = (tail + chunk.toString()).slice(-4000);
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                if (logPath !== null) {
                    writeFileSync(logPath, tail);
                }
                reject(
                    new Error(`${path.basename(command)} exited ${String(code)}: ${tail.trim()}`),
                );
            }
        });
    });
}

async function waitFor(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return true;
}

/**
 * Run one or more FFmpeg commands while sampling the summed working set of every FFmpeg
 * process, so a strategy that runs six decoders at once reports six decoders' memory.
 */
async function withPeak(workDir, fn) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const marker = path.join(workDir, `peak-${stamp}.flag`);
    const out = path.join(workDir, `peak-${stamp}.json`);
    writeFileSync(marker, "");
    const watcher = spawn(
        process.execPath,
        [
            path.join("scripts", "process-sampler.mjs"),
            "--out",
            out,
            "--marker",
            marker,
            "--interval",
            "50",
        ],
        { stdio: "ignore" },
    );
    if (!(await waitFor(() => existsSync(`${out}.ready`), 10_000))) {
        rmSync(marker, { force: true });
        throw new Error("the FFmpeg memory sampler did not start");
    }
    let result;
    try {
        result = await fn();
    } finally {
        rmSync(marker, { force: true });
        await once(watcher, "exit").catch(() => {});
    }
    return { ...result, peak: readPeak(out) };
}

function readPeak(file) {
    if (!existsSync(file)) {
        return { peakBytes: 0, peakProcesses: 0, samples: 0 };
    }
    return JSON.parse(readFileSync(file, "utf8"));
}

function resetDirectory(directory) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
}

function directoryStats(directory) {
    let bytes = 0;
    let count = 0;
    for (const name of readdirSync(directory)) {
        const file = path.join(directory, name);
        if (statSync(file).isFile() && /\.(?:jpe?g|png)$/iu.test(name)) {
            bytes += statSync(file).size;
            count += 1;
        }
    }
    return { count, bytes };
}

function countImages(directory) {
    return readdirSync(directory).filter((name) => /\.jpe?g$/iu.test(name)).length;
}

function scaleFilter(width) {
    return `scale=${String(width)}:-2`;
}

function seekArgs(video, time, width, format, output, quality) {
    const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-ss",
        time.toFixed(3),
        "-i",
        video,
        "-frames:v",
        "1",
        "-an",
        "-sn",
        "-vf",
        scaleFilter(width),
        "-y",
    ];
    if (format === "jpg") {
        args.push("-c:v", "mjpeg", "-q:v", String(quality));
    }
    args.push(output);
    return args;
}

function intervalArgs(video, interval, width, directory, quality) {
    return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-i",
        video,
        "-an",
        "-sn",
        "-vf",
        `fps=1/${String(interval)},${scaleFilter(width)}`,
        "-c:v",
        "mjpeg",
        "-q:v",
        String(quality),
        "-f",
        "image2",
        "-y",
        path.join(directory, "thumb-%05d.jpg"),
    ];
}

function keyframeArgs(video, interval, width, directory, quality, hwaccel = null) {
    return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        ...(hwaccel === null ? [] : ["-hwaccel", hwaccel]),
        "-skip_frame",
        "nokey",
        "-i",
        video,
        "-an",
        "-sn",
        "-vf",
        `fps=1/${String(interval)},${scaleFilter(width)}`,
        "-c:v",
        "mjpeg",
        "-q:v",
        String(quality),
        "-f",
        "image2",
        "-y",
        path.join(directory, "thumb-%05d.jpg"),
    ];
}

function spriteArgs(video, interval, width, directory, quality, tile) {
    return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-i",
        video,
        "-an",
        "-sn",
        "-vf",
        `fps=1/${String(interval)},${scaleFilter(width)},tile=${String(tile)}x${String(tile)}`,
        "-c:v",
        "mjpeg",
        "-q:v",
        String(quality),
        "-f",
        "image2",
        "-y",
        path.join(directory, "sprite-%03d.jpg"),
    ];
}

function sampleTimes(duration, count) {
    const times = [];
    for (let index = 0; index < count; index += 1) {
        times.push(((index + 0.5) * duration) / count);
    }
    return times;
}

async function measureSeeks(ffmpeg, video, times, options, workDir, format, concurrency) {
    const directory = path.join(workDir, `seeks-${format}-${String(concurrency)}`);
    resetDirectory(directory);
    const results = await withPeak(workDir, async () => {
        const latencies = [];
        const queue = [...times];
        const started = performance.now();
        const workers = Array.from({ length: concurrency }, async () => {
            for (;;) {
                const time = queue.shift();
                if (time === undefined) {
                    return;
                }
                const at = performance.now();
                const output = path.join(
                    directory,
                    `still-${time.toFixed(3).replace(".", "_")}.${format}`,
                );
                await runProcess(
                    ffmpeg,
                    seekArgs(video, time, options.width, format, output, options.quality),
                    null,
                );
                latencies.push(performance.now() - at);
            }
        });
        await Promise.all(workers);
        return { wallMs: performance.now() - started, latencies };
    });
    const stats = directoryStats(directory);
    return {
        wallMs: results.wallMs,
        latencies: results.latencies,
        peak: results.peak,
        bytes: stats.bytes,
        count: stats.count,
    };
}

async function measureExtraction(ffmpeg, args, workDir, directory) {
    resetDirectory(directory);
    const result = await withPeak(workDir, async () => {
        const started = performance.now();
        await runProcess(ffmpeg, args, null);
        return { wallMs: performance.now() - started };
    });
    return { ...result, ...directoryStats(directory) };
}

/**
 * Runs one extraction and samples how many files exist while it works. A build that writes
 * thumb-00001.jpg within a second can be shown progressively; a build that writes only at
 * the end cannot, and a request for the whole set would wait for the last frame.
 */
async function measureProgressive(ffmpeg, args, workDir, directory) {
    resetDirectory(directory);
    const result = await withPeak(workDir, async () => {
        const started = performance.now();
        const samples = [];
        const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
        let tail = "";
        child.stderr.on("data", (chunk) => {
            tail = (tail + chunk.toString()).slice(-4000);
        });
        const timer = setInterval(() => {
            samples.push({ atMs: performance.now() - started, count: countImages(directory) });
        }, 100);
        await new Promise((resolve, reject) => {
            child.on("error", reject);
            child.on("exit", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ffmpeg exited ${String(code)}: ${tail.trim()}`));
                }
            });
        });
        clearInterval(timer);
        const wallMs = performance.now() - started;
        samples.push({ atMs: wallMs, count: countImages(directory) });
        return { wallMs, samples };
    });
    const stats = directoryStats(directory);
    const first = result.samples.find((sample) => sample.count > 0);
    const half = result.samples.find((sample) => sample.count >= Math.ceil(stats.count / 2));
    return {
        ...result,
        ...stats,
        firstFileMs: first?.atMs ?? null,
        halfFileMs: half?.atMs ?? null,
    };
}

function summarize(latencies) {
    if (latencies.length === 0) {
        return { meanMs: 0, p50Ms: 0, p95Ms: 0 };
    }
    const sorted = [...latencies].sort((left, right) => left - right);
    const at = (fraction) =>
        sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
    return {
        meanMs: latencies.reduce((total, value) => total + value, 0) / latencies.length,
        p50Ms: at(0.5),
        p95Ms: at(0.95),
    };
}

async function fetchMany(urls, concurrency) {
    const latencies = [];
    const queue = [...urls];
    const started = performance.now();
    const workers = Array.from({ length: concurrency }, async () => {
        for (;;) {
            const url = queue.shift();
            if (url === undefined) {
                return;
            }
            const at = performance.now();
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`mock server answered ${String(response.status)} for ${url}`);
            }
            const body = await response.arrayBuffer();
            if (body.byteLength === 0) {
                throw new Error(`mock server returned an empty image for ${url}`);
            }
            latencies.push(performance.now() - at);
        }
    });
    await Promise.all(workers);
    return { wallMs: performance.now() - started, latencies };
}

function startServer(directory, interval, frameRate, handler) {
    const server = createServer((request, response) => {
        void handler(request, response, directory, interval, frameRate);
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            resolve({ server, origin: `http://127.0.0.1:${String(address.port)}` });
        });
    });
}

function nearestFile(directory, frame, intervalFrames) {
    const files = readdirSync(directory)
        .filter((name) => name.endsWith(".jpg"))
        .sort();
    if (files.length === 0) {
        throw new Error(`no thumbnails in ${directory}`);
    }
    const index = Math.min(
        files.length - 1,
        Math.max(0, Math.floor(frame / Math.max(1, intervalFrames))),
    );
    return path.join(directory, files[index]);
}

function sendFile(file, response) {
    response.writeHead(200, {
        "content-type": "image/jpeg",
        "content-length": statSync(file).size,
        "cache-control": "public, max-age=31536000, immutable",
    });
    createReadStream(file).pipe(response);
}

function thumbRequests(origin, duration, frameRate, count) {
    return sampleTimes(duration, count).map(
        (seconds) => `${origin}/thumb?frame=${String(Math.round(seconds * frameRate))}`,
    );
}

async function measureCachedServing(origin, directory, interval, frameRate, options) {
    const intervalFrames = interval * frameRate;
    const urls = thumbRequests(origin, options.duration, frameRate, options.requests);
    const warmup = await fetchMany(urls.slice(0, options.concurrency), options.concurrency);
    void warmup;
    const before = process.memoryUsage().rss;
    const result = await fetchMany(urls, options.concurrency);
    const after = process.memoryUsage().rss;
    const stats = directoryStats(directory);
    return {
        requests: urls.length,
        concurrency: options.concurrency,
        wallMs: result.wallMs,
        ...summarize(result.latencies),
        serverRssDeltaBytes: after - before,
        files: stats.count,
        bytes: stats.bytes,
        intervalFrames,
    };
}

/**
 * The single-flight case: N concurrent requests arrive with an empty cache. The first starts
 * one FFmpeg job; every request waits for its own file to appear, so index 0 answers at the
 * first written frame while later indices keep waiting on the same build. Without this, a
 * cold Scenes tab starts one decoder per visible row and holds every connection until it
 * finishes.
 */
async function measureColdCoalescing(workDir, options, video, frameRate, hwaccel) {
    const directory = path.join(workDir, "coalesced");
    resetDirectory(directory);
    let build = null;
    let builds = 0;
    const state = { done: false, error: null };
    // The chosen strategy: a keyframe-only decode, which is what makes a cold build cheap
    // enough to sit behind a progressive cache instead of a per-request still.
    const args = keyframeArgs(
        video,
        options.interval,
        options.width,
        directory,
        options.quality,
        hwaccel,
    );
    const startBuild = () => {
        if (build !== null) {
            return build;
        }
        builds += 1;
        build = runProcess(options.ffmpeg, args, null).then(
            () => {
                state.done = true;
            },
            (error) => {
                state.done = true;
                state.error = error;
                build = null;
            },
        );
        return build;
    };
    const { server, origin } = await startServer(
        directory,
        options.interval,
        frameRate,
        async (request, response, served, interval, rate) => {
            try {
                startBuild();
                const requestUrl = new URL(request.url ?? "/", "http://localhost");
                const frame = Number(requestUrl.searchParams.get("frame") ?? 0);
                const index = Math.floor(frame / Math.max(1, interval * rate));
                const target = path.join(served, `thumb-${String(index + 1).padStart(5, "0")}.jpg`);
                const deadline = Date.now() + 120_000;
                while (!existsSync(target) && !state.done && Date.now() < deadline) {
                    await new Promise((resolve) => setTimeout(resolve, 25));
                }
                if (state.error !== null) {
                    throw state.error;
                }
                sendFile(
                    existsSync(target) ? target : nearestFile(served, frame, interval * rate),
                    response,
                );
            } catch (error) {
                response.writeHead(500, { "content-type": "text/plain" });
                response.end(error instanceof Error ? error.message : String(error));
            }
        },
    );
    try {
        const urls = thumbRequests(origin, options.duration, frameRate, options.coalesceRequests);
        const before = process.memoryUsage().rss;
        const result = await withPeak(workDir, async () => {
            const started = performance.now();
            const fetched = await fetchMany(urls, options.coalesceRequests);
            await build;
            return { ...fetched, wallMs: performance.now() - started };
        });
        const after = process.memoryUsage().rss;
        return {
            requests: urls.length,
            builds,
            wallMs: result.wallMs,
            ...summarize(result.latencies),
            peak: result.peak,
            serverRssDeltaBytes: after - before,
            ...directoryStats(directory),
        };
    } finally {
        server.close();
        server.closeAllConnections();
    }
}

function formatMs(value) {
    if (value >= 1000) {
        return `${(value / 1000).toFixed(2)} s`;
    }
    return `${value.toFixed(1)} ms`;
}

function formatMiB(bytes) {
    return (bytes / MIB).toFixed(0);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    options.ffmpeg = findTool(options.ffmpeg, "ffmpeg");
    options.ffprobe = findTool(options.ffprobe, "ffprobe");
    const running = countProcesses(/ffmpeg/iu);
    if (running > 0) {
        throw new Error(
            `found ${String(running)} ffmpeg process(es) already running; close the app and retry so peak memory is attributable`,
        );
    }

    const workDir = mkdtempSync(path.join(tmpdir(), "av1ation-bench-thumbs-"));
    const records = [];
    const serving = [];
    try {
        for (const video of options.videos) {
            const info = probeVideo(options.ffprobe, video);
            const keyframes = countKeyframes(options.ffprobe, video);
            const expected = Math.ceil(info.duration / options.interval);
            console.log(`\n${path.basename(video)}`);
            console.log(
                `  ${String(info.width)}×${String(info.height)} · ${info.fps.toFixed(3)} fps · ` +
                    `${info.duration.toFixed(1)} s · ${(info.bytes / MIB / 1024).toFixed(2)} GiB · ` +
                    `${String(info.frames)} frames · ${String(keyframes)} keyframes`,
            );
            console.log(
                `  ${String(expected)} thumbs at ${String(options.interval)} s and ` +
                    `${String(options.width)} px wide`,
            );

            const times = sampleTimes(info.duration, options.sample);
            const strategies = [];
            const add = (name, detail) => strategies.push({ name, ...detail });

            const seekPng = await measureSeeks(
                options.ffmpeg,
                video,
                times,
                options,
                workDir,
                "png",
                1,
            );
            const seekPngSummary = summarize(seekPng.latencies);
            add("seek-png", { ...seekPng, ...seekPngSummary });

            const seekConcurrent = await measureSeeks(
                options.ffmpeg,
                video,
                times,
                options,
                workDir,
                "png",
                options.concurrency,
            );
            add("seek-png-concurrent", {
                ...seekConcurrent,
                ...summarize(seekConcurrent.latencies),
            });

            const keyframeDir = path.join(workDir, "keyframe");
            const keyframe = await measureExtraction(
                options.ffmpeg,
                keyframeArgs(video, options.interval, options.width, keyframeDir, options.quality),
                workDir,
                keyframeDir,
            );
            add("keyframe-cpu", keyframe);

            const intervalDir = path.join(workDir, "interval");
            const interval = await measureExtraction(
                options.ffmpeg,
                intervalArgs(video, options.interval, options.width, intervalDir, options.quality),
                workDir,
                intervalDir,
            );
            add("interval-jpg", interval);

            let progressive = null;
            let servingDir = keyframeDir;
            let progressiveDriver = "cpu";
            if (options.hwaccel !== null) {
                const hardwareDir = path.join(workDir, "progressive-hw");
                try {
                    progressive = await measureProgressive(
                        options.ffmpeg,
                        keyframeArgs(
                            video,
                            options.interval,
                            options.width,
                            hardwareDir,
                            options.quality,
                            options.hwaccel,
                        ),
                        workDir,
                        hardwareDir,
                    );
                    add("keyframe-hw-progressive", progressive);
                    servingDir = hardwareDir;
                    progressiveDriver = options.hwaccel;
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? (error.message.split(/\r?\n/u)[0] ?? error.message)
                            : String(error);
                    console.log(`  hardware decode ${options.hwaccel} unavailable: ${message}`);
                }
            }
            if (progressive === null) {
                const progressiveDir = path.join(workDir, "progressive");
                progressive = await measureProgressive(
                    options.ffmpeg,
                    keyframeArgs(
                        video,
                        options.interval,
                        options.width,
                        progressiveDir,
                        options.quality,
                    ),
                    workDir,
                    progressiveDir,
                );
                add("keyframe-progressive", progressive);
            }

            const spriteDir = path.join(workDir, "sprite");
            const sprite = await measureExtraction(
                options.ffmpeg,
                spriteArgs(video, options.interval, options.width, spriteDir, options.quality, 10),
                workDir,
                spriteDir,
            );
            add("interval-sprite-10x10", sprite);

            for (const strategy of strategies) {
                console.log(
                    `  ${strategy.name.padEnd(24)} ${formatMs(strategy.wallMs).padStart(9)} · ` +
                        `${String(strategy.count).padStart(4)} files · ` +
                        `${(strategy.bytes / MIB).toFixed(2).padStart(6)} MiB · ` +
                        `peak ${formatMiB(strategy.peak.peakBytes).padStart(5)} MiB` +
                        (strategy.meanMs === undefined
                            ? ""
                            : ` · ${strategy.meanMs.toFixed(0)} ms/thumb`),
                );
            }

            const { server, origin } = await startServer(
                servingDir,
                options.interval,
                info.fps,
                (request, response, directory, interval, rate) => {
                    try {
                        const requestUrl = new URL(request.url ?? "/", "http://localhost");
                        const frame = Number(requestUrl.searchParams.get("frame") ?? 0);
                        sendFile(nearestFile(directory, frame, interval * rate), response);
                    } catch (error) {
                        response.writeHead(500, { "content-type": "text/plain" });
                        response.end(error instanceof Error ? error.message : String(error));
                    }
                },
            );
            let cached;
            try {
                cached = await measureCachedServing(
                    origin,
                    servingDir,
                    options.interval,
                    info.fps,
                    {
                        duration: info.duration,
                        requests: options.requests,
                        concurrency: options.concurrency,
                    },
                );
            } finally {
                server.close();
                server.closeAllConnections();
            }
            const cold = await measureColdCoalescing(
                workDir,
                { ...options, duration: info.duration, video },
                video,
                info.fps,
                progressiveDriver === "cpu" ? null : options.hwaccel,
            );
            console.log(
                `  serving cached ${String(cached.requests)} requests: ` +
                    `${formatMs(cached.wallMs)} total · p50 ${formatMs(cached.p50Ms)} · ` +
                    `p95 ${formatMs(cached.p95Ms)} · RSS +${formatMiB(cached.serverRssDeltaBytes)} MiB`,
            );
            console.log(
                `  cold ${String(cold.requests)} concurrent requests: ${String(cold.builds)} build` +
                    `${cold.builds === 1 ? "" : "s"} · ${formatMs(cold.wallMs)} · ` +
                    `peak ${formatMiB(cold.peak.peakBytes)} MiB · ` +
                    `p50 ${formatMs(cold.p50Ms)}`,
            );
            console.log(
                `  progressive keyframe build (${progressiveDriver}): ` +
                    `first file at ${formatMs(progressive.firstFileMs ?? 0)} · ` +
                    `half at ${formatMs(progressive.halfFileMs ?? 0)} · ` +
                    `all ${String(progressive.count)} at ${formatMs(progressive.wallMs)}`,
            );
            console.log(
                `  page of ${String(DEFAULT_PAGE_SIZE)} stills today: ` +
                    `${formatMs(seekPngSummary.meanMs * DEFAULT_PAGE_SIZE)} of sequential decode work`,
            );

            records.push({
                name: `video-${String(records.length + 1)}`,
                ...info,
                keyframes,
                thumbs: expected,
                strategies: strategies.map((strategy) => ({
                    ...strategy,
                    ...(strategy.latencies === undefined ? {} : summarize(strategy.latencies)),
                    latencies: undefined,
                    samples: undefined,
                })),
            });
            serving.push({
                video: `video-${String(records.length)}`,
                hwaccel: progressiveDriver,
                cached,
                cold,
                pageOfStillsMs: seekPngSummary.meanMs * DEFAULT_PAGE_SIZE,
                progressive: {
                    firstFileMs: progressive.firstFileMs,
                    halfFileMs: progressive.halfFileMs,
                    completeMs: progressive.wallMs,
                    files: progressive.count,
                },
            });
        }

        const output = {
            measured_at: new Date().toISOString(),
            environment: {
                platform: process.platform,
                node: process.version,
                ffmpeg: execFileSync(options.ffmpeg, ["-hide_banner", "-version"], {
                    encoding: "utf8",
                })
                    .split(/\r?\n/u)[0]
                    .trim(),
            },
            parameters: {
                intervalSeconds: options.interval,
                width: options.width,
                quality: options.quality,
                sample: options.sample,
                requests: options.requests,
                concurrency: options.concurrency,
                coalesceRequests: options.coalesceRequests,
                hwaccel: options.hwaccel,
            },
            videos: records,
            serving,
        };
        writeFileSync(options.out, JSON.stringify(output, null, 2) + "\n");
        console.log(`\nwrote ${options.out}`);
    } finally {
        if (options.keep) {
            console.log(`kept ${workDir}`);
        } else {
            rmSync(workDir, { recursive: true, force: true });
        }
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
