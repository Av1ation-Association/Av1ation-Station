// Validate the packaged Windows/Linux installers on the hosted runner.
//
// The release workflow used to depend on the owner's local machine for compressed sizes,
// installed-tree sizes and a one-run uninstall. This script makes that evidence a package-job
// artifact instead: install the NSIS/deb payload, measure the tree, uninstall once, and fail
// when the tree, a helper process or the package registration survives.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { projectRoot, releaseDir } from "./build-paths.mjs";

const platform =
    process.platform === "win32"
        ? "windows"
        : process.platform === "linux"
          ? "linux"
          : process.platform === "darwin"
            ? "macos"
            : null;
const reportPath = join(releaseDir, "package-validation.json");

function walkFiles(directory) {
    if (!existsSync(directory)) {
        return [];
    }
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }
    return files;
}

function sizeOf(path) {
    const info = statSync(path);
    if (info.isFile()) {
        return info.size;
    }
    return walkFiles(path).reduce((total, file) => total + statSync(file).size, 0);
}

function fileCount(path) {
    return walkFiles(path).length;
}

function run(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 300_000,
        ...options,
    });
}

function output(result) {
    return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

async function waitUntil(predicate, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) {
            return true;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    return predicate();
}

function requireSuccess(result, label) {
    if (result.error !== undefined) {
        throw new Error(`${label}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${label} exited ${String(result.status)}: ${output(result)}`);
    }
}

function processPaths(image) {
    const name = image.replace(/\.exe$/iu, "");
    const result = run("powershell", [
        "-NoProfile",
        "-Command",
        `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path`,
    ]);
    return (result.stdout ?? "")
        .split(/\r?\n/u)
        .map((path) => path.trim())
        .filter((path) => path !== "");
}

function processUnder(directory) {
    const root = `${resolve(directory).toLowerCase()}${sep}`;
    return ["av1ation-desktop.exe", "av1ation-service.exe"].some((image) =>
        processPaths(image).some((path) => resolve(path).toLowerCase().startsWith(root)),
    );
}

function variantPaths(variant) {
    return join(releaseDir, platform, variant);
}

function compressedSizes(variant) {
    const directory = variantPaths(variant);
    const files = walkFiles(directory);
    const installer = files.find((path) => /-setup\.exe$/iu.test(path));
    const portable = files.find((path) => /portable\.zip$/iu.test(path));
    const msi = files.find((path) => /\.msi$/iu.test(path));
    const deb = files.find((path) => /\.deb$/iu.test(path));
    const appimage = files.find((path) => /\.AppImage$/iu.test(path));
    const dmg = files.find((path) => /\.dmg$/iu.test(path));
    const appZip = files.find((path) => /\.app\.zip$/iu.test(path));
    return {
        installer_bytes: installer === undefined ? null : sizeOf(installer),
        portable_bytes: portable === undefined ? null : sizeOf(portable),
        msi_bytes: msi === undefined ? null : sizeOf(msi),
        deb_bytes: deb === undefined ? null : sizeOf(deb),
        appimage_bytes: appimage === undefined ? null : sizeOf(appimage),
        dmg_bytes: dmg === undefined ? null : sizeOf(dmg),
        app_zip_bytes: appZip === undefined ? null : sizeOf(appZip),
    };
}

async function validateWindowsVariant(variant) {
    const directory = variantPaths(variant);
    const setup = walkFiles(directory).find((path) => /-setup\.exe$/iu.test(path));
    if (setup === undefined) {
        throw new Error(`no NSIS installer under ${directory}`);
    }
    const installDir = mkdtempSync(join(tmpdir(), `av1ation-${variant}-`));
    try {
        requireSuccess(
            run(setup, ["/S", `/D=${installDir}`], { cwd: directory }),
            `install ${variant}`,
        );
        const installed = await waitUntil(
            () => existsSync(join(installDir, "uninstall.exe")),
            120_000,
        );
        if (!installed) {
            throw new Error(`install ${variant} did not create uninstall.exe`);
        }
        const installedBytes = sizeOf(installDir);
        const installedFiles = fileCount(installDir);
        requireSuccess(
            run(join(installDir, "uninstall.exe"), ["/S"], { cwd: tmpdir() }),
            `uninstall ${variant}`,
        );
        const treeGone = await waitUntil(() => !existsSync(installDir), 120_000);
        if (!treeGone) {
            throw new Error(`uninstall ${variant} left the install tree in ${installDir}`);
        }
        if (processUnder(installDir)) {
            throw new Error(`uninstall ${variant} left a helper process in ${installDir}`);
        }
        return {
            installed_bytes: installedBytes,
            installed_files: installedFiles,
            uninstall: "pass",
        };
    } finally {
        rmSync(installDir, { recursive: true, force: true });
    }
}

async function validateLinuxVariant(variant) {
    const directory = variantPaths(variant);
    const deb = walkFiles(directory).find((path) => /\.deb$/iu.test(path));
    if (deb === undefined) {
        throw new Error(`no deb package under ${directory}`);
    }
    const packageName = run("dpkg-deb", ["-f", deb, "Package"]).stdout.trim();
    if (packageName === "") {
        throw new Error(`could not read the package name from ${deb}`);
    }
    requireSuccess(
        run("sudo", ["apt-get", "install", "-y", deb], {
            env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
        }),
        `install ${variant}`,
    );
    try {
        const installed = run("dpkg-query", ["-L", packageName]);
        requireSuccess(installed, `list installed files for ${variant}`);
        const files = installed.stdout
            .split("\n")
            .filter((path) => path !== "" && path !== "/." && existsSync(path))
            .filter((path) => statSync(path).isFile());
        const installedBytes = files.reduce((total, path) => total + statSync(path).size, 0);
        const installedFiles = files.length;
        requireSuccess(run("sudo", ["dpkg", "-r", packageName]), `uninstall ${variant}`);
        const removed = run("dpkg-query", ["-s", packageName]);
        if (removed.status === 0) {
            throw new Error(`uninstall ${variant} left package ${packageName} registered`);
        }
        return {
            installed_bytes: installedBytes,
            installed_files: installedFiles,
            uninstall: "pass",
        };
    } finally {
        run("sudo", ["dpkg", "-r", packageName]);
    }
}

const report = {
    schema_version: 1,
    platform,
    generated_at: new Date().toISOString(),
    verification: platform === "macos" ? "sizes-only" : "install-uninstall",
    variants: {},
    ok: true,
    errors: [],
};

if (platform === null) {
    report.ok = false;
    report.errors.push(`unsupported package-validation host: ${process.platform}`);
} else {
    for (const variant of ["bundled", "system"]) {
        try {
            const compressed = compressedSizes(variant);
            if (platform === "macos") {
                if (compressed.dmg_bytes === null && compressed.app_zip_bytes === null) {
                    throw new Error(`no DMG or app ZIP under ${variantPaths(variant)}`);
                }
                report.variants[variant] = {
                    compressed,
                    install: "not validated",
                    uninstall: "not validated",
                };
                console.log(
                    `${variant}: DMG ${String(compressed.dmg_bytes)} bytes, app ZIP ${String(compressed.app_zip_bytes)} bytes; install/uninstall unverified`,
                );
                continue;
            }
            const installed =
                platform === "windows"
                    ? await validateWindowsVariant(variant)
                    : await validateLinuxVariant(variant);
            report.variants[variant] = { compressed, ...installed };
            console.log(
                `${variant}: installer ${String(compressed.installer_bytes ?? compressed.deb_bytes)} bytes, installed ${String(installed.installed_bytes)} bytes over ${String(installed.installed_files)} files, uninstall ${installed.uninstall}`,
            );
        } catch (error) {
            report.ok = false;
            report.errors.push(error instanceof Error ? error.message : String(error));
        }
    }
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
    console.error(`Package validation failed; see ${reportPath}`);
    for (const error of report.errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
} else if (platform === "macos") {
    console.log(
        `macOS package sizes recorded; install/uninstall remain unverified: ${resolve(reportPath)}`,
    );
} else {
    console.log(`Package validation passed: ${resolve(reportPath)}`);
}
