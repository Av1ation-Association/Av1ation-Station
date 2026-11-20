#!/usr/bin/env node
/**
 * Measures the Scenes player on real media: how long each source takes to become playable,
 * how many frames reach the screen on time, and how much memory the app and the browser
 * hold while it plays.
 *
 * The player reports its own frame timings (`requestVideoFrameCallback`) and drop counters
 * (`getVideoPlaybackQuality`); this script drives the real UI in Chrome, pauses at the right
 * moment, and reads that dev-only summary. Memory comes from process working sets sampled in
 * parallel: the app tree (service + the FFmpeg and encoder children it spawns) and the
 * browser tree (renderer, GPU process).
 *
 *   npm run bench:playback
 *   npm run bench:playback -- --seconds 12 --sources original,decoded
 *
 * It needs a running desktop build (the dev shell on port 1420) and a Chrome or Edge
 * executable. The media is not the user's own: the run creates a throwaway project and queue
 * item, and lazily renders a 90 s source from FFmpeg's own test patterns into the OS temp
 * directory, so a benchmark never depends on what happens to be queued and never leaves a
 * project behind. The run is not a pass/fail test: playback smoothness depends on the
 * machine, so the numbers are recorded by hand in docs/benchmarks/playback.md.
 */
import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { findPid, listProcesses, listeningPortsFor, which } from "./process-metrics.mjs";

const SOURCE_LABELS = { original: "Original", decoded: "Decoded", encode: "Encoded" };
const DEFAULT_PAGE_URL = "http://localhost:1420";
const CHROME_CANDIDATES = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const CHROME_COMMANDS = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "chrome",
];

function parseArgs(argv) {
    const options = {
        seconds: 10,
        sources: Object.keys(SOURCE_LABELS),
        service: null,
        pageUrl: DEFAULT_PAGE_URL,
        chrome: null,
        out: "docs/benchmarks/playback.json",
        headless: false,
        app: "av1ation-desktop",
        /** Release builds carry no CORS allowance, so a cross-origin page needs this. */
        noCors: false,
        /** Skip the backward seek, to separate steady playback from seek cost. */
        seek: true,
        /** Sweep the transport like a drag, to measure how long the picture takes to catch up. */
        drag: true,
        /** FFmpeg used to render the synthetic source; PATH when omitted. */
        ffmpeg: null,
        /** Keep the throwaway project and rendered source after the run. */
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
        if (flag === "--seconds") {
            options.seconds = Number(next());
        } else if (flag === "--sources") {
            options.sources = next()
                .split(",")
                .map((value) => value.trim());
        } else if (flag === "--service") {
            options.service = next();
        } else if (flag === "--page-url") {
            options.pageUrl = next();
        } else if (flag === "--chrome") {
            options.chrome = next();
        } else if (flag === "--out") {
            options.out = next();
        } else if (flag === "--no-cors") {
            options.noCors = true;
        } else if (flag === "--no-seek") {
            options.seek = false;
        } else if (flag === "--no-drag") {
            options.drag = false;
        } else if (flag === "--ffmpeg") {
            options.ffmpeg = next();
        } else if (flag === "--keep") {
            options.keep = true;
        } else if (flag === "--app") {
            options.app = next();
        } else if (flag === "--headless") {
            options.headless = true;
        } else if (flag === "--help" || flag === "-h") {
            console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
            process.exit(0);
        } else {
            throw new Error(`unknown argument: ${flag}`);
        }
    }
    for (const source of options.sources) {
        if (!(source in SOURCE_LABELS)) {
            throw new Error(`unknown source: ${source}`);
        }
    }
    return options;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Find the running app's service by probing the ports its own process listens on. */
async function discoverService() {
    const pids = new Set(
        listProcesses()
            .filter((process) => /av1ation-(?:desktop|service)/iu.test(process.name))
            .map((process) => process.pid),
    );
    if (pids.size === 0) {
        throw new Error("No av1ation process is running. Start the desktop build first.");
    }
    for (const port of listeningPortsFor(pids)) {
        const origin = `http://127.0.0.1:${port}`;
        try {
            const health = await fetch(`${origin}/api/health`, {
                signal: AbortSignal.timeout(1500),
            });
            if (!health.ok) {
                continue;
            }
            const body = await health.json();
            if (typeof body.name === "string" && body.name.includes("Av1ation")) {
                return origin;
            }
        } catch {
            // Not the service, or not up yet.
        }
    }
    throw new Error("Could not find the app's service port. Pass --service http://host:port.");
}

function findChrome(explicit) {
    if (explicit) {
        if (!existsSync(explicit)) {
            throw new Error(`No browser at ${explicit}`);
        }
        return explicit;
    }
    const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
    if (found !== undefined) {
        return found;
    }
    for (const command of CHROME_COMMANDS) {
        const resolved = which(command);
        if (resolved !== null) {
            return resolved;
        }
    }
    throw new Error("No Chrome or Edge found. Pass --chrome <path>.");
}

async function api(service, method, pathName, body) {
    const response = await fetch(`${service}${pathName}`, {
        method,
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${method} ${pathName} answered ${String(response.status)}: ${text}`);
    }
    return text.length === 0 ? null : JSON.parse(text);
}

function findFfmpeg(explicit) {
    const command = explicit ?? "ffmpeg";
    try {
        execFileSync(command, ["-hide_banner", "-version"], { stdio: "ignore" });
    } catch {
        throw new Error(`No FFmpeg at ${command}. Pass --ffmpeg <path>.`);
    }
    return command;
}

/**
 * Render one 30 s clip from a lavfi source. Every clip is encoded the same way so the
 * concat demuxer can join them without a second generation.
 */
function renderClip(ffmpeg, output, source) {
    execFileSync(
        ffmpeg,
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            source,
            "-t",
            "30",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "18",
            "-profile:v",
            "high10",
            "-pix_fmt",
            "yuv420p10le",
            "-g",
            "48",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-shortest",
            output,
        ],
        { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
    );
}

/**
 * A 90 s, 1080p, 24 fps, 10-bit source made from three moving test patterns.
 *
 * Ten-bit because that is what the app is for: it changes the lossless proxy's profile and
 * rules out the GPU encoder, so an 8-bit fixture would benchmark a path nobody encodes.
 *
 * It is rendered once into the OS temp directory and reused: the point is that the media is
 * disposable and identical between runs, not that the user's project has to contain it. The
 * patterns differ enough in detail that a decoder and a lossless encoder do real work.
 */
function syntheticSource(ffmpeg) {
    const directory = path.join(tmpdir(), "av1ation-bench");
    const output = path.join(directory, "synthetic-90s-1080p10-24fps.mp4");
    if (existsSync(output) && statSync(output).size > 1024 * 1024) {
        return output;
    }
    mkdirSync(directory, { recursive: true });
    const clips = [
        [
            path.join(directory, "clip-gradient.mp4"),
            "gradients=s=1920x1080:r=24:c0=0x0b1220:c1=0xd98c3a:speed=0.01",
        ],
        [path.join(directory, "clip-mandelbrot.mp4"), "mandelbrot=s=1920x1080:r=24:maxiter=250"],
        [
            path.join(directory, "clip-life.mp4"),
            "life=s=1920x1080:r=24:mold=10:ratio=0.15:death_color=0x0b1220:life_color=0xd98c3a",
        ],
    ];
    console.log(`rendering ${output}`);
    for (const [clip, source] of clips) {
        renderClip(ffmpeg, clip, source);
    }
    const list = path.join(directory, "clips.txt");
    writeFileSync(
        list,
        clips.map(([clip]) => `file '${clip.replaceAll("'", "'\\''")}'`).join("\n") + "\n",
    );
    execFileSync(
        ffmpeg,
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            output,
        ],
        { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
    );
    for (const [clip] of clips) {
        rmSync(clip, { force: true });
    }
    rmSync(list, { force: true });
    return output;
}

/**
 * Create a project, queue the synthetic source, probe it, and cover it with ten-second
 * scenes. Scene detection is not run: the benchmark needs a scene table, not the detector,
 * and adding ranges is deterministic and takes milliseconds.
 */
async function benchVideo(service, ffmpeg) {
    const source = syntheticSource(ffmpeg);
    const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    const project = await api(service, "POST", "/api/projects", {
        name: `Playback benchmark ${stamp}`,
        description: "Created by npm run bench:playback; deleted when the run ends.",
    });
    const output = path.join(path.dirname(source), `${project.id}.av1.mkv`);
    const video = await api(service, "POST", `/api/projects/${project.id}/videos`, {
        input_path: source,
        output_path: output,
        name: "Synthetic 90 s",
    });
    const probe = await api(
        service,
        "POST",
        `/api/projects/${project.id}/videos/${video.id}/probe`,
        {},
    );
    const frames = probe?.clip?.frame_count;
    if (typeof frames !== "number" || frames <= 0) {
        throw new Error(
            `The service could not probe the synthetic source: ${probe?.detail ?? "no detail"}`,
        );
    }
    const sceneFrames = 240;
    let start = 0;
    for (; start + sceneFrames <= frames; start += sceneFrames) {
        await api(service, "POST", `/api/projects/${project.id}/videos/${video.id}/scenes/add`, {
            start_frame: start,
            end_frame: start + sceneFrames,
        });
    }
    // A bench source is rarely an exact multiple of the scene length. Leaving the tail
    // unassigned would measure a player whose encoded output silently drops those frames.
    if (start < frames) {
        await api(service, "POST", `/api/projects/${project.id}/videos/${video.id}/scenes/add`, {
            start_frame: start,
            end_frame: frames,
        });
    }
    return { project, video, source, output, frames };
}

async function removeBenchVideo(service, projectId, output) {
    await api(service, "DELETE", `/api/projects/${projectId}`);
    rmSync(output, { force: true });
}

/** The browser root process, found by the private profile directory it was given. */
function browserPid(profile) {
    return findPid(profile);
}

function startSampler(playerRoot, app, out) {
    return spawn(
        process.execPath,
        [
            path.join("scripts", "process-sampler.mjs"),
            "--out",
            out,
            "--player",
            String(playerRoot),
            "--app",
            app,
            "--interval",
            "250",
        ],
        { stdio: "ignore" },
    );
}

function readSamples(file) {
    if (!existsSync(file)) {
        return [];
    }
    return readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim().startsWith("{"))
        .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            } catch {
                return [];
            }
        });
}

const MIB = 1024 * 1024;

function peak(samples, from, to) {
    let app = 0;
    let player = 0;
    for (const sample of samples) {
        if (sample.at < from || sample.at > to) {
            continue;
        }
        app = Math.max(app, sample.app);
        player = Math.max(player, sample.player);
    }
    return {
        appMiB: app / MIB,
        browserMiB: player / MIB,
        totalMiB: (app + player) / MIB,
    };
}

async function playerArea(page) {
    return page.locator('section[aria-label="Video preview"]');
}

async function isPlaying(page) {
    return page.evaluate(() => {
        const video = document.querySelector('section[aria-label="Video preview"] video');
        return video !== null && !video.paused;
    });
}

async function pauseVideo(page) {
    if (!(await isPlaying(page))) {
        return;
    }
    await page.evaluate(() => {
        const video = document.querySelector('section[aria-label="Video preview"] video');
        video?.pause();
    });
    await sleep(350);
}

async function chooseSource(page, source) {
    const area = await playerArea(page);
    await area.locator('button[aria-haspopup="menu"]').click();
    // The shared menu portals to the body, so the items are not inside the player's
    // section. Scoping the lookup to the section waits out the timeout on every run.
    await page
        .getByRole("menuitemradio", { name: new RegExp(`^${SOURCE_LABELS[source]}`) })
        .click();
}

/**
 * Wait for a source to become playable, or for the player to say it failed.
 *
 * The failure branch is the point: a broken source used to park the run on the timeout while
 * the player had already shown its error, so the benchmark looked hung rather than reporting
 * what the app told the user.
 */
async function waitReady(page, timeout) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const state = await page.evaluate(() => {
            const area = document.querySelector('section[aria-label="Video preview"]');
            if (area === null) {
                return { ready: false, failed: false, message: "" };
            }
            const text = area.textContent ?? "";
            return {
                ready: area.getAttribute("data-preview-ready") === "true",
                failed: text.includes("This file cannot be played in the window"),
                message: text,
            };
        });
        if (state.ready) {
            return { ready: true, failed: false, message: "" };
        }
        if (state.failed) {
            return { ready: false, failed: true, message: state.message };
        }
        if (Date.now() >= deadline) {
            return { ready: false, failed: false, message: "timed out waiting for the player" };
        }
        await sleep(250);
    }
}

/** How long the picture takes to stop moving once a gesture ends. */
async function waitSettled(page, since) {
    const deadline = Date.now() + 30_000;
    let quiet = null;
    for (;;) {
        const seeking = await page.evaluate(() => {
            const video = document.querySelector('section[aria-label="Video preview"] video');
            return video !== null && video.seeking;
        });
        if (seeking) {
            quiet = null;
        } else if (quiet === null) {
            quiet = Date.now();
        } else if (Date.now() - quiet >= 200) {
            return quiet - since;
        }
        if (Date.now() >= deadline) {
            return null;
        }
        await sleep(50);
    }
}

/**
 * Sweep the player's transport with the mouse, the way a user drags it.
 *
 * The sweep is what the queue exists for: every `input` event is a target, and writing each
 * one to the element abandoned the decode walk already running. The number reported is how
 * long the picture takes to reach the released target, not how many events arrived.
 */
async function dragTransport(page) {
    const bar = (await playerArea(page)).locator('input[aria-label="Seek the preview"]');
    const box = await bar.boundingBox();
    if (box === null) {
        return null;
    }
    // A one-second sweep from wherever the playhead is. Dragging a fixed fraction of the
    // bar can cross a scene boundary on a short chunk, which is a new build rather than a
    // seek: the measurement has to stay inside the chunk that is already open.
    const span = await bar.evaluate((element) => ({
        value: Number(element.value),
        max: Number(element.max),
    }));
    if (!(span.max > 2) || !(span.value >= 2)) {
        console.log(`  drag: the transport is not draggable yet (${span.value} of ${span.max})`);
        return null;
    }
    const y = box.y + box.height / 2;
    const at = (seconds) => box.x + box.width * (seconds / span.max);
    await page.mouse.move(at(span.value), y);
    await page.mouse.down();
    for (let step = 1; step <= 6; step += 1) {
        await page.mouse.move(at(span.value - step / 6), y);
        await sleep(60);
    }
    const releasedAt = Date.now();
    await page.mouse.up();
    return waitSettled(page, releasedAt);
}

/**
 * Wait until the transport can actually play.
 *
 * An encoded chunk becomes inspectable long before it is playable: the player shows a frame
 * as soon as it decodes, and holds playback until the whole chunk has been written, because
 * an encoder producing at half real time cannot feed continuous playback.
 */
async function waitPlayable(page, timeout) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const playable = await page.evaluate(
            () =>
                document
                    .querySelector('section[aria-label="Video preview"]')
                    ?.getAttribute("data-preview-playable") === "true",
        );
        if (playable) {
            return true;
        }
        if (Date.now() >= deadline) {
            return false;
        }
        await sleep(250);
    }
}

async function readSummary(page, after) {
    // `pause()` dispatches its event, but the player publishes the interval from React's
    // handler. Reading the hook on the next round trip usually wins the race and sometimes
    // does not, which reported a playing source as "no summary". A bounded wait removes the
    // coin flip without hiding a genuinely empty interval.
    let hook = false;
    const deadline = Date.now() + 2000;
    while (!hook && Date.now() < deadline) {
        hook = await page.evaluate(
            (previous) => (window.__av1ationPlayback?.entries.length ?? 0) > previous,
            after,
        );
        if (!hook) {
            await sleep(50);
        }
    }
    if (!hook) {
        return null;
    }
    return page.evaluate(() => {
        const entries = window.__av1ationPlayback?.entries ?? [];
        return entries[entries.length - 1] ?? null;
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const service = options.service ?? (await discoverService());
    const chromePath = findChrome(options.chrome);
    const ffmpeg = findFfmpeg(options.ffmpeg);
    const { project, video, source, output } = await benchVideo(service, ffmpeg);

    const profile = mkdtempSync(path.join(tmpdir(), "av1ation-bench-profile-"));
    const samplesFile = path.join(profile, "memory.ndjson");
    // A persistent context keeps our own profile directory, which is also how the sampler
    // finds this browser's root process: the path appears in its command line.
    const context = await chromium.launchPersistentContext(profile, {
        executablePath: chromePath,
        headless: options.headless,
        viewport: { width: 1440, height: 900 },
        args: [
            "--autoplay-policy=no-user-gesture-required",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
            ...(options.noCors ? ["--disable-web-security"] : []),
        ],
    });
    let sampler = null;
    try {
        const rootPid = browserPid(profile);
        if (rootPid === 0) {
            console.warn("warning: could not find the browser process; memory will read 0");
        }
        sampler = startSampler(rootPid, options.app, samplesFile);

        const page = context.pages()[0] ?? (await context.newPage());
        // A window behind the terminal stops presenting frames, and the player's own frame
        // callback then reports a stall the app did not cause. Foregrounding the page is
        // what makes the interval summary describe playback rather than occlusion.
        await page.bringToFront();
        page.on("console", (message) => {
            const text = message.text();
            if (text.startsWith("[playback]")) {
                console.log(`  ${text}`);
            } else if (message.type() === "error" || text.startsWith("[preview]")) {
                console.log(`  console: ${text}`);
            }
        });
        page.on("pageerror", (error) => console.log(`  page error: ${error.message}`));
        page.on("response", (response) => {
            if (response.status() >= 400) {
                console.log(`  http ${String(response.status())} ${response.url()}`);
            }
        });
        // A Decoded window is one fetch, so the browser's own request events are where the
        // player's pipeline is visible: the interval summary says whether frames were
        // presented, not whether the next window was requested before the current one had
        // been parsed. These are recorded only while a source is playing, because a paused
        // fill deliberately builds a cache runway whose requests are not the seam's cost.
        let windows = new Map();
        page.on("request", (request) => {
            const url = new URL(request.url());
            if (
                !windows ||
                url.searchParams.get("source") !== "decoded" ||
                !url.searchParams.has("frame")
            ) {
                return;
            }
            windows.set(request, {
                frame: Number(url.searchParams.get("frame")),
                start: Date.now(),
                firstByte: null,
                end: null,
            });
        });
        page.on("response", (response) => {
            const entry = windows?.get(response.request());
            if (entry !== undefined) {
                entry.firstByte = Date.now();
            }
        });
        page.on("requestfinished", (request) => {
            const entry = windows?.get(request);
            if (entry !== undefined) {
                entry.end = Date.now();
            }
        });

        console.log(`service   ${service}`);
        console.log(`project   ${project.name} (temporary)`);
        console.log(`video     ${video.name} (${source})`);
        console.log(`browser   ${chromePath}`);

        await page.goto(`${options.pageUrl}/?service=${encodeURIComponent(service)}`, {
            waitUntil: "domcontentloaded",
        });
        await page.goto(`${options.pageUrl}/projects/${project.id}/videos/${video.id}/scenes`, {
            waitUntil: "domcontentloaded",
        });
        await page.waitForSelector('section[aria-label="Video preview"]', { timeout: 60_000 });
        await sleep(1500);

        // Baseline: the page is loaded and the player is paused, so nothing is streaming.
        const phases = [];
        const baselineStart = Date.now();
        await sleep(2500);
        phases.push({ name: "baseline", start: baselineStart, end: Date.now() });

        const records = [];
        for (const source of options.sources) {
            await pauseVideo(page);
            console.log(`\n${SOURCE_LABELS[source]}: choosing`);
            const before = await page.evaluate(
                () => window.__av1ationPlayback?.entries.length ?? 0,
            );
            const chosenAt = Date.now();
            await chooseSource(page, source);
            const outcome = await waitReady(page, source === "encode" ? 120_000 : 45_000);
            const readyMs = Date.now() - chosenAt;
            if (!outcome.ready) {
                const detail = outcome.message
                    .split(/\r?\n/u)
                    .map((line) => line.trim())
                    .find(Boolean);
                console.log(
                    `  ${outcome.failed ? "failed" : "not ready"} after ${(readyMs / 1000).toFixed(1)} s` +
                        (detail === undefined ? "" : `: ${detail}`),
                );
                records.push({
                    source,
                    ready: false,
                    readyMs,
                    failed: outcome.failed,
                    message: outcome.message,
                });
                continue;
            }
            console.log(`  ready in ${(readyMs / 1000).toFixed(1)} s`);
            const playableAt = Date.now();
            let playableMs = null;
            if (!(await waitPlayable(page, 180_000))) {
                console.log("  the transport never became playable");
            } else {
                playableMs = Date.now() - playableAt;
                console.log(`  playable after a further ${(playableMs / 1000).toFixed(1)} s`);
            }

            const phaseStart = Date.now();
            // Only the windows requested while the picture is moving are the seams: the
            // paused fill before this point is the runway the player is meant to consume.
            windows = new Map();
            await (await playerArea(page)).locator("video").click({ position: { x: 24, y: 24 } });
            await sleep(options.seconds * 1000);
            if (options.seek) {
                // One backward seek, inside what is already buffered, then let it settle.
                await page.evaluate(() => {
                    const video = document.querySelector(
                        'section[aria-label="Video preview"] video',
                    );
                    if (video !== null) {
                        video.currentTime = Math.max(0, video.currentTime - 1);
                    }
                });
                await sleep(1200);
            }
            let dragMs = null;
            // A Decoded transport moves between six-second windows instead of seeking in
            // place, so a sweep there measures a window swap, not a seek.
            if (options.drag && source !== "decoded") {
                dragMs = await dragTransport(page);
            }
            const playedWindows = [...windows.values()]
                .filter((entry) => entry.end !== null)
                .sort((left, right) => left.start - right.start)
                .map((entry, index, all) => ({
                    frame: entry.frame,
                    startSeconds: (entry.start - all[0].start) / 1000,
                    firstByteMs: entry.firstByte === null ? null : entry.firstByte - entry.start,
                    doneMs: entry.end - entry.start,
                    gapMs: index === 0 ? null : entry.start - all[index - 1].end,
                }));
            await pauseVideo(page);
            const summary = await readSummary(page, before);
            const phaseEnd = Date.now();
            phases.push({ name: source, start: phaseStart, end: phaseEnd });
            records.push({
                source,
                ready: true,
                readyMs,
                playableMs,
                summary,
                dragMs,
                windows: playedWindows,
            });
            if (playedWindows.length > 0) {
                const cell = (value, digits = 0) =>
                    value === null || Number.isNaN(value) ? "—" : value.toFixed(digits);
                console.log("  window  start (s)  first byte (ms)  done (ms)  gap (ms)");
                for (const window of playedWindows) {
                    console.log(
                        `  ${String(window.frame).padStart(6)}  ${cell(window.startSeconds, 2).padStart(9)}  ` +
                            `${cell(window.firstByteMs).padStart(15)}  ${cell(window.doneMs).padStart(9)}  ` +
                            `${cell(window.gapMs).padStart(8)}`,
                    );
                }
            }
            if (summary !== null) {
                console.log(
                    `  ${summary.fps.toFixed(1)} fps, ${(summary.dropRate * 100).toFixed(1)}% dropped, ` +
                        `${summary.stalls} stall(s), first frame ` +
                        `${summary.firstFrameMs === null ? "n/a" : `${summary.firstFrameMs.toFixed(0)} ms`}`,
                );
            } else {
                console.log("  no playback summary was published");
            }
        }

        await sleep(1000);
        const samples = readSamples(samplesFile);
        const rows = records.map((record) => {
            const phase = phases.find((entry) => entry.name === record.source);
            const memory =
                phase === undefined
                    ? { appMiB: 0, browserMiB: 0, totalMiB: 0 }
                    : peak(samples, phase.start, phase.end);
            return {
                source: record.source,
                ready: record.ready,
                readySeconds: record.readyMs / 1000,
                playableSeconds: record.playableMs === null ? null : record.playableMs / 1000,
                firstFrameMs: record.summary?.firstFrameMs ?? null,
                seekMs: record.summary?.seekMs ?? null,
                dragMs: record.dragMs ?? null,
                fps: record.summary?.fps ?? 0,
                dropped: record.summary?.dropped ?? 0,
                produced: record.summary?.produced ?? 0,
                dropRate: record.summary?.dropRate ?? 0,
                stalls: record.summary?.stalls ?? 0,
                longestStallMs: record.summary?.longestStallMs ?? 0,
                p50Ms: record.summary?.intervalP50Ms ?? null,
                p95Ms: record.summary?.intervalP95Ms ?? null,
                windows: record.windows ?? [],
                ...memory,
            };
        });
        const baseline = phases.find((entry) => entry.name === "baseline");
        const baselineMemory =
            baseline === undefined
                ? { appMiB: 0, browserMiB: 0, totalMiB: 0 }
                : peak(samples, baseline.start, baseline.end);

        console.log(
            "\n| Source | Ready (s) | First frame (ms) | Seek (ms) | Drag (ms) | fps | Dropped | Stalls | p95 gap (ms) | App (MiB) | Browser (MiB) | Total (MiB) |",
        );
        console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
        for (const row of rows) {
            const number = (value, digits = 0) =>
                value === null || Number.isNaN(value) ? "—" : value.toFixed(digits);
            console.log(
                `| ${SOURCE_LABELS[row.source]} | ${row.ready ? number(row.readySeconds, 1) : "failed"} | ` +
                    `${number(row.firstFrameMs)} | ${number(row.seekMs)} | ${number(row.dragMs)} | ` +
                    `${number(row.fps, 1)} | ${row.dropped}/${row.produced} | ${row.stalls} | ` +
                    `${number(row.p95Ms)} | ${number(row.appMiB)} | ${number(row.browserMiB)} | ` +
                    `${number(row.totalMiB)} |`,
            );
        }
        console.log(
            `\nbaseline: app ${baselineMemory.appMiB.toFixed(0)} MiB, ` +
                `browser ${baselineMemory.browserMiB.toFixed(0)} MiB`,
        );

        if (options.out) {
            writeFileSync(
                options.out,
                JSON.stringify(
                    {
                        measured_at: new Date().toISOString(),
                        service,
                        project: project.name,
                        video: video.name,
                        source_file: source,
                        seconds: options.seconds,
                        baseline: baselineMemory,
                        sources: rows,
                    },
                    null,
                    2,
                ) + "\n",
            );
            console.log(`wrote ${options.out}`);
        }
    } finally {
        if (sampler !== null) {
            sampler.kill();
        }
        await context.close().catch(() => {});
        rmSync(profile, { recursive: true, force: true });
        if (options.keep) {
            console.log(`kept ${project.name} and ${output}`);
        } else {
            await removeBenchVideo(service, project.id, output).catch((error) => {
                console.warn(
                    `warning: could not remove the benchmark project: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            });
        }
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
