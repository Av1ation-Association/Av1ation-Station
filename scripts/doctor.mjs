// Reports the tools the app can use. Missing optional tools are warnings, not failures.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cacheRoot } from "./dev-tools.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const locator = process.platform === "win32" ? "where.exe" : "which";

let failed = false;

function firstLine(result) {
    return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/u)[0] ?? "";
}

function report(status, label, detail) {
    console.log(`${status.padEnd(4)}  ${String(label).padEnd(14)} ${detail}`);
}

function requiredMajor(range) {
    const match = /(\d+)/u.exec(range ?? "");
    return match === null ? null : Number(match[1]);
}

function actualMajor(version) {
    const match = /(\d+)/u.exec(version ?? "");
    return match === null ? null : Number(match[1]);
}

function probe(label, command, args, required = true) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    const ok = result.status === 0;
    const detail = firstLine(result) || "not found";
    if (!ok && required) {
        failed = true;
    }
    report(ok ? "ok" : required ? "FAIL" : "miss", label, detail);
    return { ok, detail };
}

function hasCommand(name) {
    return spawnSync(locator, [name], { encoding: "utf8" }).status === 0;
}

const nodeVersion = process.versions.node;
const requiredNode = requiredMajor(packageJson.engines?.node);
const nodeOk = requiredNode === null || (actualMajor(nodeVersion) ?? 0) >= requiredNode;
if (!nodeOk) {
    failed = true;
}
report(
    nodeOk ? "ok" : "FAIL",
    "Node",
    `${nodeVersion} (requires ${packageJson.engines?.node ?? "any"})`,
);

const nvmrcPath = join(root, ".nvmrc");
if (existsSync(nvmrcPath)) {
    const expected = readFileSync(nvmrcPath, "utf8").trim().replace(/^v/u, "");
    if (expected !== "" && !nodeVersion.startsWith(expected)) {
        report("warn", "Node pin", `.nvmrc asks for ${expected}, this shell is ${nodeVersion}`);
    }
}

const npm = probe(
    "npm",
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    process.platform === "win32" ? ["/d", "/s", "/c", "npm --version"] : ["--version"],
    true,
);
const requiredNpm = requiredMajor(packageJson.engines?.npm);
if (npm.ok && requiredNpm !== null && (actualMajor(npm.detail) ?? 0) < requiredNpm) {
    failed = true;
    report("FAIL", "npm version", `${npm.detail} (requires ${packageJson.engines?.npm})`);
}

probe("Cargo", "cargo", ["--version"], true);
const rustc = probe("Rust", "rustc", ["--version"], true);
const rustToolchain = join(root, "rust-toolchain.toml");
if (existsSync(rustToolchain)) {
    const pinned = /^channel\s*=\s*"(\d+)\.(\d+)/mu.exec(readFileSync(rustToolchain, "utf8"));
    const actual = /rustc (\d+)\.(\d+)/u.exec(rustc.detail);
    if (pinned !== null && rustc.ok && actual !== null) {
        const required = [Number(pinned[1]), Number(pinned[2])];
        const current = [Number(actual[1]), Number(actual[2])];
        if (current[0] < required[0] || (current[0] === required[0] && current[1] < required[1])) {
            failed = true;
            report(
                "FAIL",
                "Rust version",
                `${rustc.detail} (requires ${pinned[1]}.${pinned[2]}.x)`,
            );
        }
    }
}
probe("rustfmt", "cargo", ["fmt", "--version"], true);
probe("Clippy", "cargo", ["clippy", "--version"], true);

probe("VapourSynth", "vapoursynth", ["get-vsscript"], false);
probe("FFmpeg", "ffmpeg", ["-version"], false);
probe("MKVToolNix", "mkvmerge", ["--version"], false);

const encoders = [
    "aomenc",
    "SvtAv1EncApp",
    "rav1e",
    "vpxenc",
    "avmenc",
    "x264",
    "x265",
    "vvencapp",
];
const available = encoders.filter(hasCommand);
if (available.length === 0) {
    report(
        "warn",
        "Encoders",
        `none found on PATH (${encoders.join(", ")}); encoding needs at least one`,
    );
} else {
    report("ok", "Encoders", available.join(", "));
}

if (existsSync(cacheRoot)) {
    report("ok", "Staged tools", cacheRoot);
} else {
    report("miss", "Staged tools", "no dist/dev-tools cache; only system providers are available");
}

if (process.platform === "win32") {
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const vswhere = join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
    if (!existsSync(vswhere)) {
        report("warn", "MSVC", "vswhere.exe not found; ensure the C++ build tools are installed");
    } else {
        const result = spawnSync(
            vswhere,
            [
                "-latest",
                "-products",
                "*",
                "-requires",
                "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
                "-property",
                "installationPath",
            ],
            { encoding: "utf8" },
        );
        const installation = (result.stdout ?? "").trim();
        if (result.status === 0 && installation !== "") {
            report("ok", "MSVC", installation);
        } else {
            report(
                "warn",
                "MSVC",
                "the C++ build tools were not found; run Cargo from a Developer Command Prompt",
            );
        }
    }
}

console.log(
    "\nVapourSynth is loaded through VSScript, not vspipe. Set VSSCRIPT_PATH when the runtime is outside PATH.",
);
console.log("VapourSynth is required only for VapourSynth inputs; FFmpeg only for FFmpeg muxing.");
console.log("Staged tools are optional; a system provider can satisfy each capability.");
process.exit(failed ? 1 : 0);
