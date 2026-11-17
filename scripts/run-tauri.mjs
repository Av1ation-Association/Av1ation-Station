// Tauri invokes Cargo itself, so sanitize PATH before starting the CLI.
//
// `tauri dev` has no `<resource>/tools`: it serves Vite and runs the embedded service from
// the build tree. Point that run at the same staged `tools/` layout a release installs, so a
// bundled provider can be exercised without installing it system-wide. The app still reads
// only `AV1ATION_TOOLS_DIR`; this wrapper is the development launcher, not a path resolver.
//
// The staged tree lives in `dist/dev-tools/` because `cargo clean` owns `dist/cargo/`.
// Keeping the cache beside the target, rather than inside it, means a clean costs no tools.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cargoTarget, stagedTools } from "./build-paths.mjs";
import { collectReleaseArtifacts } from "./collect-release.mjs";
import { cacheRoot, prepareDevTools } from "./dev-tools.mjs";
import { sanitizedPath } from "./sanitize-path.mjs";

const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
const tauriDir = fileURLToPath(new URL("../rust/desktop-shell/", import.meta.url));
const baseConfig = resolve(tauriDir, "tauri.conf.json");
const productName = JSON.parse(readFileSync(baseConfig, "utf8")).productName;
const generatedReleaseConfig = resolve(tauriDir, "tauri.release.generated.json");
const args = process.argv.slice(2);
const helpOrVersion =
    args.includes("--help") ||
    args.includes("-h") ||
    args.includes("--version") ||
    args.includes("-V");

if (args[0] === "dev") {
    // An explicitly empty value disables the bundle, matching the service's own filter.
    if (process.env.AV1ATION_TOOLS_DIR !== undefined) {
        const configured = process.env.AV1ATION_TOOLS_DIR || "no bundled toolchain";
        console.log(`AV1ATION_TOOLS_DIR: ${configured}`);
    } else {
        const staged = prepareDevTools();
        if (staged !== null) {
            process.env.AV1ATION_TOOLS_DIR = staged;
            console.log(`Bundled toolchain: ${staged}`);
        } else {
            console.warn(
                `No staged toolchain in ${cacheRoot}; bundled providers will be unavailable.\n` +
                    "Stage one with: npm run dev:tools -- --from <staged-tools-directory>",
            );
        }
    }
}

// The base configuration is for dev and maps only the frontend. A release build gets a
// generated copy that adds the staged tools tree, so a dev run never copies tools into
// the Cargo target. Generate it from the base config rather than checking in a duplicate
// that would need its own version synchronization.
let releaseConfig = null;
if (args[0] === "build" && !helpOrVersion && !args.includes("--config") && !args.includes("-c")) {
    const config = JSON.parse(readFileSync(baseConfig, "utf8"));
    config.bundle = {
        ...config.bundle,
        targets: process.env.AV1ATION_BUNDLES
            ? process.env.AV1ATION_BUNDLES.split(",")
                  .map((value) => value.trim())
                  .filter(Boolean)
            : config.bundle.targets,
        resources: {
            "../../dist/apps/desktop/": "web/",
            "../../dist/tools/": "tools/",
            // The Windows loader resolves the linked FFMS2 import before the app can
            // choose a tools directory, so this copy has to sit beside the executable.
            // The staged tree keeps the library under tools/lib for the Linux rpath and
            // macOS loader path; Windows needs the root copy as well.
            ...(process.platform === "win32"
                ? { "../../dist/tools/lib/ffms2.dll": "ffms2.dll" }
                : {}),
        },
    };
    writeFileSync(generatedReleaseConfig, `${JSON.stringify(config, null, 2)}\n`);
    releaseConfig = generatedReleaseConfig;
    args.push("--config", generatedReleaseConfig);
}

// linuxdeploy resolves the dependencies of every ELF in the AppDir before it packages it.
// Some vendored Python wheels ship sibling libraries without an rpath, so those dependencies
// are only visible when their directories are on the loader path. Adding the same directories
// here also mirrors how the bundled interpreter finds them at runtime.
function linuxToolsLibraryPath() {
    const pythonRoot = join(stagedTools, "python");
    const directories = new Set([join(stagedTools, "lib")]);
    if (existsSync(pythonRoot)) {
        for (const entry of readdirSync(pythonRoot, { recursive: true })) {
            if (typeof entry === "string" && entry.includes(".so")) {
                directories.add(dirname(join(pythonRoot, entry)));
            }
        }
    }
    return [...directories].filter((directory) => existsSync(directory)).join(":");
}

const buildEnv = {
    ...process.env,
    PATH: sanitizedPath(),
    CARGO_TARGET_DIR: cargoTarget,
};
if (process.platform === "linux" && args[0] === "build") {
    const toolsLibraryPath = linuxToolsLibraryPath();
    if (toolsLibraryPath !== "") {
        buildEnv.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, toolsLibraryPath]
            .filter(Boolean)
            .join(":");
    }
}

let result;
try {
    result = spawnSync(process.execPath, [cli, ...args], {
        stdio: "inherit",
        env: buildEnv,
    });
} finally {
    if (releaseConfig !== null) {
        rmSync(releaseConfig, { force: true });
    }
}

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}
const status = result.status ?? 1;
if (
    status === 0 &&
    !helpOrVersion &&
    args[0] === "build" &&
    !args.includes("--no-bundle") &&
    !args.includes("--debug") &&
    !args.includes("-d")
) {
    try {
        collectReleaseArtifacts({ variant: "bundled", productName });
    } catch (error) {
        console.error(`release artifacts could not be collected: ${error.message}`);
        process.exit(1);
    }
}
process.exit(status);
