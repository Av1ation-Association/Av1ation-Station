// Reports the tools the app can use. Missing optional tools are warnings, not failures.
//
// Profiles are deliberately narrower than the base report: a browser test does not need an
// encoder, and a web-only change does not need Cargo. Each profile checks only the pieces
// its command will actually invoke, plus the disk volume that command writes into.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { outputRoot } from "./build-paths.mjs";
import { DEFAULT_MIN_FREE_GIB, freeGiB } from "./check-disk-space.mjs";
import { cacheRoot } from "./dev-tools.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const locator = process.platform === "win32" ? "where.exe" : "which";

/** Named checks a developer can run before the matching command. */
export const PROFILES = ["web", "e2e", "real-encode"];

/** The coverage run is small; Rust builds and real encodes share the larger floor. */
export const PROFILE_DISK_MIN_GIB = {
    web: 1,
    e2e: DEFAULT_MIN_FREE_GIB,
    "real-encode": DEFAULT_MIN_FREE_GIB,
};

let failed = false;

function firstLine(result) {
    return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/u)[0] ?? "";
}

function lastLine(result) {
    return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/u).at(-1) ?? "";
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

function checkNodeAndNpm() {
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
}

function checkRust(includeFormatting) {
    probe("Cargo", "cargo", ["--version"], true);
    const rustc = probe("Rust", "rustc", ["--version"], true);
    const rustToolchain = join(root, "rust-toolchain.toml");
    if (existsSync(rustToolchain)) {
        const pinned = /^channel\s*=\s*"(\d+)\.(\d+)/mu.exec(readFileSync(rustToolchain, "utf8"));
        const actual = /rustc (\d+)\.(\d+)/u.exec(rustc.detail);
        if (pinned !== null && rustc.ok && actual !== null) {
            const required = [Number(pinned[1]), Number(pinned[2])];
            const current = [Number(actual[1]), Number(actual[2])];
            if (
                current[0] < required[0] ||
                (current[0] === required[0] && current[1] < required[1])
            ) {
                failed = true;
                report(
                    "FAIL",
                    "Rust version",
                    `${rustc.detail} (requires ${pinned[1]}.${pinned[2]}.x)`,
                );
            }
        }
    }
    if (includeFormatting) {
        probe("rustfmt", "cargo", ["fmt", "--version"], true);
        probe("Clippy", "cargo", ["clippy", "--version"], true);
    }
}

function checkMsvc(required) {
    if (process.platform !== "win32") {
        return;
    }
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const vswhere = join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
    if (!existsSync(vswhere)) {
        if (required) failed = true;
        report(
            required ? "FAIL" : "warn",
            "MSVC",
            "vswhere.exe not found; install the C++ build tools",
        );
        return;
    }
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
        return;
    }
    if (required) failed = true;
    report(
        required ? "FAIL" : "warn",
        "MSVC",
        "the C++ build tools were not found; run Cargo from a Developer Command Prompt",
    );
}

function checkDependency(name) {
    const packagePath = join(root, "node_modules", name, "package.json");
    if (existsSync(packagePath)) {
        report("ok", "Dependencies", `${name} installed`);
        return;
    }
    failed = true;
    report("FAIL", "Dependencies", `${name} missing; run npm ci`);
}

async function checkChromium() {
    let executable;
    try {
        const { chromium } = await import("@playwright/test");
        executable = chromium.executablePath();
    } catch (error) {
        failed = true;
        report(
            "FAIL",
            "Chromium",
            `Playwright is unavailable (${error instanceof Error ? error.message : String(error)}); run npm ci`,
        );
        return;
    }
    if (executable === undefined || !existsSync(executable)) {
        failed = true;
        report(
            "FAIL",
            "Chromium",
            `missing at ${executable ?? "an unknown path"}; run npx playwright install chromium`,
        );
        return;
    }
    report("ok", "Chromium", executable);
}

function checkDisk(profile, path, label = "Disk space") {
    const minimum = PROFILE_DISK_MIN_GIB[profile];
    try {
        const available = freeGiB(path);
        const ok = available >= minimum;
        if (!ok) failed = true;
        report(
            ok ? "ok" : "FAIL",
            label,
            `${available.toFixed(1)} GiB free at ${resolve(path)} (needs ${minimum.toFixed(1)} GiB)`,
        );
    } catch (error) {
        failed = true;
        report(
            "FAIL",
            label,
            `could not inspect ${resolve(path)}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function checkVapourSynth(required) {
    const result = spawnSync("vapoursynth", ["get-vsscript"], { encoding: "utf8" });
    if (result.status === 0) {
        report("ok", "VapourSynth", firstLine(result) || "vsscript available");
        return;
    }
    const configured = process.env.VSSCRIPT_PATH?.trim();
    if (configured !== undefined && configured !== "" && existsSync(configured)) {
        report("ok", "VapourSynth", `VSSCRIPT_PATH=${configured}`);
        return;
    }
    if (required) failed = true;
    report(
        required ? "FAIL" : "miss",
        "VapourSynth",
        configured !== undefined && configured !== ""
            ? `VSSCRIPT_PATH does not exist: ${configured}`
            : "not found; set VSSCRIPT_PATH or install VapourSynth",
    );
}

function checkFfmpeg(required) {
    const command = process.env.AV1ATION_FFMPEG?.trim() || "ffmpeg";
    const result = probe("FFmpeg", command, ["-version"], required);
    if (!result.ok || !required) {
        return;
    }
    const encoders = spawnSync(command, ["-hide_banner", "-encoders"], { encoding: "utf8" });
    const output = `${encoders.stdout ?? ""}${encoders.stderr ?? ""}`;
    const hasLibx264 = output.includes("libx264");
    if (!hasLibx264) failed = true;
    report(
        hasLibx264 ? "ok" : "FAIL",
        "FFmpeg libx264",
        hasLibx264
            ? "available (needed for the preview proxy)"
            : "missing; the real-encode preview proxy needs an FFmpeg build with libx264",
    );
}

function checkMkv(required) {
    probe("MKVToolNix", "mkvmerge", ["--version"], required);
}

function checkRequiredEncoder(name) {
    const ok = hasCommand(name);
    if (!ok) failed = true;
    report(
        ok ? "ok" : "FAIL",
        name,
        ok ? "found on PATH" : `not found; the real-encode suite needs ${name}`,
    );
}

function checkBestSource() {
    const python = ["python", "python3"].find(hasCommand);
    if (python === undefined) {
        failed = true;
        report("FAIL", "BestSource", "python/python3 not found; cannot verify core.bs");
        return;
    }
    const result = spawnSync(
        python,
        ["-c", "import vapoursynth as vs; core = vs.core; assert hasattr(core, 'bs')"],
        { encoding: "utf8" },
    );
    if (result.status === 0) {
        report("ok", "BestSource", "core.bs is available");
        return;
    }
    failed = true;
    report(
        "FAIL",
        "BestSource",
        `${lastLine(result) || "core.bs is missing"}; install vapoursynth-bestsource for the active runtime`,
    );
}

function checkEncoders() {
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
}

function checkStagedTools() {
    if (existsSync(cacheRoot)) {
        report("ok", "Staged tools", cacheRoot);
    } else {
        report(
            "miss",
            "Staged tools",
            "no dist/dev-tools cache; only system providers are available",
        );
    }
}

function checkBaseProfile() {
    checkRust(true);
    checkVapourSynth(false);
    checkFfmpeg(false);
    checkMkv(false);
    checkEncoders();
    checkStagedTools();
    checkMsvc(false);
}

async function checkWebProfile() {
    checkDependency("vitest");
    checkDependency("@vitest/coverage-v8");
    checkDisk("web", outputRoot);
}

async function checkE2eProfile() {
    checkDependency("vite");
    checkDependency("@playwright/test");
    checkRust(false);
    await checkChromium();
    checkDisk("e2e", outputRoot);
    checkMsvc(true);
}

async function checkRealEncodeProfile() {
    checkRust(false);
    checkFfmpeg(true);
    checkMkv(true);
    checkVapourSynth(true);
    checkBestSource();
    checkRequiredEncoder("x264");
    checkRequiredEncoder("SvtAv1EncApp");
    checkDisk("real-encode", outputRoot);
    checkDisk("real-encode", tmpdir(), "Temp space");
    checkMsvc(true);
}

export function parseArgs(argv) {
    let profile = "base";
    let help = false;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--help" || argument === "-h") {
            help = true;
            continue;
        }
        if (argument === "--profile") {
            const value = argv[++index];
            if (value === undefined || value.startsWith("--")) {
                throw new Error("--profile needs one of: web, e2e, real-encode.");
            }
            profile = value;
            continue;
        }
        if (argument.startsWith("--profile=")) {
            profile = argument.slice("--profile=".length);
            continue;
        }
        throw new Error(`Unknown argument: ${argument}`);
    }
    if (profile !== "base" && !PROFILES.includes(profile)) {
        throw new Error(`Unknown profile: ${profile}. Choose web, e2e, or real-encode.`);
    }
    return { profile, help };
}

function printHelp() {
    console.log(
        [
            "Usage: npm run doctor -- [--profile <web|e2e|real-encode>]",
            "",
            "Without a profile, reports the base application and encoding tools.",
            "",
            "Profiles:",
            "  web          Node/npm, Vitest and coverage dependencies, and test-output space.",
            "  e2e          Web prerequisites plus Cargo/Rust, Chromium, MSVC, and build space.",
            "  real-encode  Cargo/Rust, FFmpeg with libx264, MKVToolNix, VapourSynth,",
            "               BestSource, x264, SVT-AV1, and project/temp space.",
        ].join("\n"),
    );
}

async function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error("Run npm run doctor -- --help for the available profiles.");
        process.exitCode = 1;
        return;
    }
    if (options.help) {
        printHelp();
        return;
    }

    if (options.profile !== "base") {
        console.log(`Profile: ${options.profile}\n`);
    }
    checkNodeAndNpm();
    if (options.profile === "web") {
        await checkWebProfile();
    } else if (options.profile === "e2e") {
        await checkE2eProfile();
    } else if (options.profile === "real-encode") {
        await checkRealEncodeProfile();
    } else {
        checkBaseProfile();
        console.log(
            "\nVapourSynth is loaded through VSScript, not vspipe. Set VSSCRIPT_PATH when the runtime is outside PATH.",
        );
        console.log(
            "VapourSynth is required only for VapourSynth inputs; FFmpeg only for FFmpeg muxing.",
        );
        console.log("Staged tools are optional; a system provider can satisfy each capability.");
    }

    if (options.profile !== "base") {
        console.log(
            failed
                ? `\nProfile ${options.profile} has readiness failures.`
                : `\nProfile ${options.profile} is ready.`,
        );
    }
    process.exitCode = failed ? 1 : 0;
}

const invoked =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
    await main();
}
