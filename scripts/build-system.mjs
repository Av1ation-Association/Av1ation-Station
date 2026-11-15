// Builds the installers that carry no bundled toolchain.
//
// The base configuration maps only the frontend into resources. This variant keeps that
// shape, so every capability resolves through the machine's own installation. A separate
// product name keeps the installers and install directory distinct from the bundled build,
// while the identifier stays the same so both share settings and app data.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cargoTarget } from "./build-paths.mjs";
import { collectReleaseArtifacts } from "./collect-release.mjs";
import { sanitizedPath } from "./sanitize-path.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tauriDir = path.join(root, "rust", "desktop-shell");
const basePath = path.join(tauriDir, "tauri.conf.json");
const config = JSON.parse(fs.readFileSync(basePath, "utf8"));

config.productName = "Av1ation Station System";

// Tauri rejects a bundle type the host cannot produce, so the default follows the platform
// instead of assuming the Windows installers.
function defaultBundles() {
    if (process.platform === "win32") {
        return ["msi", "nsis"];
    }
    if (process.platform === "darwin") {
        return ["dmg", "app"];
    }
    return ["deb", "rpm", "appimage"];
}

config.bundle = {
    ...config.bundle,
    targets: process.env.AV1ATION_BUNDLES
        ? process.env.AV1ATION_BUNDLES.split(",").map((value) => value.trim())
        : defaultBundles(),
    resources: { "../../dist/apps/desktop/": "web/" },
};

// The system variant links the distribution's FFMS2 at runtime. The bundled variant carries
// its own copy under tools/, so this dependency belongs only to this generated config.
config.bundle.linux = {
    ...config.bundle.linux,
    deb: {
        ...config.bundle.linux?.deb,
        depends: ["libffms2-5"],
    },
};

const generatedPath = path.join(tauriDir, "tauri.system.conf.json");
fs.writeFileSync(generatedPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`System-toolchain build: ${config.productName}`);
console.log("Bundled resources: web/ only (no tools/)");

const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
let result;
try {
    result = spawnSync(process.execPath, [cli, "build", "--config", generatedPath], {
        stdio: "inherit",
        env: { ...process.env, PATH: sanitizedPath(), CARGO_TARGET_DIR: cargoTarget },
    });
} finally {
    fs.rmSync(generatedPath, { force: true });
}

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}
const status = result.status ?? 1;
if (status === 0) {
    try {
        collectReleaseArtifacts({ variant: "system", productName: config.productName });
    } catch (error) {
        console.error(`release artifacts could not be collected: ${error.message}`);
        process.exit(1);
    }
}
process.exit(status);
