// Start the headless service and, unless --static is used, the desktop Vite host.
//
// The browser review URL carries the service origin because a browser session has no Tauri
// injection. Static mode serves the built SPA from the service itself, which is what the
// Playwright smoke uses; dev mode keeps Vite's hot reload.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { cargoTarget, desktopBuild, testDataRoot } from "./build-paths.mjs";
import { cacheRoot, prepareDevTools } from "./dev-tools.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);

function usage() {
    console.log(`Usage: node scripts/dev-headless.mjs [options]

  --port <port>       service port (default 8731)
  --data-dir <path>   app-data directory (default dist/test-data/dev)
  --static            serve the built SPA from the service; do not start Vite
  --no-build          use the existing service binary; do not run cargo build
  --fresh             delete the data directory before starting
  --fake-engine       debug builds only: use the holding synthetic encode runner
  --fake-engine-complete
                      debug builds only: use the synthetic runner that finishes on its own
  --no-open           do not open the review URL in a browser
  --help              show this message`);
}

let port = 8731;
let dataDir = join(testDataRoot, "dev");
let staticMode = false;
let noBuild = false;
let fresh = false;
let fakeEngine = false;
let fakeEngineComplete = false;
let open = process.env.CI !== "true";

for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
        usage();
        process.exit(0);
    }
    if (argument === "--port") {
        port = Number(args[++index]);
        continue;
    }
    if (argument === "--data-dir") {
        dataDir = resolve(root, args[++index] ?? "");
        continue;
    }
    if (argument === "--static") {
        staticMode = true;
        continue;
    }
    if (argument === "--no-build") {
        noBuild = true;
        continue;
    }
    if (argument === "--fresh") {
        fresh = true;
        continue;
    }
    if (argument === "--fake-engine") {
        fakeEngine = true;
        continue;
    }
    if (argument === "--fake-engine-complete") {
        fakeEngineComplete = true;
        continue;
    }
    if (argument === "--no-open") {
        open = false;
        continue;
    }
    console.error(`Unknown option: ${argument}`);
    usage();
    process.exit(2);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("--port must be an integer between 1 and 65535");
    process.exit(2);
}

const serviceOrigin = `http://127.0.0.1:${String(port)}`;
const viteOrigin = "http://127.0.0.1:1420";

async function portAvailable(candidate) {
    return await new Promise((resolveAvailability) => {
        const server = createServer();
        server.once("error", () => resolveAvailability(false));
        server.once("listening", () => {
            server.close(() => resolveAvailability(true));
        });
        server.listen(candidate, "127.0.0.1");
    });
}

async function isUp(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        return response.ok;
    } catch {
        return false;
    }
}

async function waitFor(url, child, label, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`${label} exited with code ${String(child.exitCode)}`);
        }
        if (await isUp(url)) {
            return;
        }
        await delay(250);
    }
    throw new Error(`${label} did not answer at ${url} within ${String(timeoutMs)} ms`);
}

function openReviewUrl(url) {
    if (!open) {
        return;
    }
    const command =
        process.platform === "win32"
            ? "cmd.exe"
            : process.platform === "darwin"
              ? "open"
              : "xdg-open";
    const commandArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const opener = spawn(command, commandArgs, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
    });
    opener.on("error", () => {
        console.warn(`Could not open the browser; visit ${url}`);
    });
    opener.unref();
}

if (!(await portAvailable(port))) {
    console.error(
        `Port ${String(port)} is already in use. Stop the old service or pass a different --port.`,
    );
    process.exit(1);
}

const serviceBinary = join(
    cargoTarget,
    "debug",
    process.platform === "win32" ? "av1ation-service.exe" : "av1ation-service",
);
const desktopDist = desktopBuild;
if (staticMode && !existsSync(join(desktopDist, "index.html"))) {
    console.error("Static mode needs a built UI. Run npm run build:desktop first.");
    process.exit(1);
}

if (fresh) {
    rmSync(dataDir, { recursive: true, force: true });
}
mkdirSync(dataDir, { recursive: true });

if (noBuild) {
    if (!existsSync(serviceBinary)) {
        console.error(`No service binary at ${serviceBinary}. Run npm run build:service first.`);
        process.exit(1);
    }
} else {
    const build = spawnSync(
        process.execPath,
        [
            join(root, "scripts", "run-cargo.mjs"),
            "build",
            "--locked",
            "-p",
            "av1ation-service",
            "--bin",
            "av1ation-service",
        ],
        { cwd: root, env: process.env, stdio: "inherit" },
    );
    if (build.status !== 0) {
        process.exit(build.status ?? 1);
    }
}

const env = { ...process.env, AV1ATION_LOG: process.env.AV1ATION_LOG ?? "info" };
if (env.AV1ATION_TOOLS_DIR === undefined) {
    const staged = prepareDevTools();
    if (staged !== null) {
        env.AV1ATION_TOOLS_DIR = staged;
        console.log(`Bundled toolchain: ${staged}`);
    } else {
        console.warn(
            `No staged toolchain in ${cacheRoot}; system providers only.\n` +
                "Stage one with: npm run dev:tools -- --from <staged-tools-directory>",
        );
    }
}

const serviceArgs = ["--port", String(port), "--data-dir", dataDir];
if (staticMode) {
    serviceArgs.push("--web-dir", desktopDist);
}
if (fakeEngine) {
    serviceArgs.push("--fake-engine");
}
if (fakeEngineComplete) {
    serviceArgs.push("--fake-engine-complete");
}

const children = [];
let shuttingDown = false;

function stop(code = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill();
        }
    }
    process.exit(code);
}

function supervise(label, child) {
    children.push(child);
    child.on("exit", (code, signal) => {
        if (shuttingDown) {
            return;
        }
        console.error(`${label} exited (${signal ?? `code ${String(code)}`}).`);
        stop(code ?? 1);
    });
}

process.once("SIGINT", () => stop(130));
process.once("SIGTERM", () => stop(143));

console.log(`Service: ${serviceOrigin}`);
console.log(`Data:    ${dataDir}`);
const service = spawn(serviceBinary, serviceArgs, {
    cwd: root,
    env,
    stdio: ["ignore", "inherit", "inherit"],
});
supervise("service", service);

try {
    await waitFor(`${serviceOrigin}/api/health`, service, "service");
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    stop(1);
}

let reviewUrl = serviceOrigin;
if (!staticMode) {
    if (await isUp(viteOrigin)) {
        console.log(`Vite:    ${viteOrigin} (reusing the running dev server)`);
    } else {
        const vite = join(root, "node_modules", "vite", "bin", "vite.js");
        const viteChild = spawn(process.execPath, [vite, "--host", "127.0.0.1"], {
            cwd: join(root, "apps", "desktop"),
            env: process.env,
            stdio: ["ignore", "inherit", "inherit"],
        });
        supervise("Vite", viteChild);
        try {
            await waitFor(viteOrigin, viteChild, "Vite");
        } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            stop(1);
        }
    }
    reviewUrl = `${viteOrigin}/?service=${encodeURIComponent(serviceOrigin)}`;
}

console.log(`\nReview:  ${reviewUrl}`);
console.log("Press Ctrl+C to stop the processes this command started.");
openReviewUrl(reviewUrl);
