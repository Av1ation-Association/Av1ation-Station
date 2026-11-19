// Validate the packaged Windows/Linux installers on the hosted runner.
//
// The release workflow used to depend on the owner's local machine for compressed sizes,
// installed-tree sizes and a one-run uninstall. This script makes that evidence a package-job
// artifact instead: install the NSIS/deb payload, measure the tree, uninstall once, and fail
// when the tree, a helper process or the package registration survives.
//
// Stable Windows installers also ship an MSI. The bundled MSI is installed into a temporary
// directory, launched, asked for its health response, driven through a real encode through
// its own loopback API, and uninstalled. The system MSI is installed and uninstalled because
// its external toolchain is not part of the package and may be absent on the runner.
import { spawn, spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
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
const appIdentifier = "com.av1ation.station";
const terminalKinds = new Set(["finished", "failed", "cancelled"]);

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
        // A bundled Linux tree lists far more paths than Node's 1 MiB child-process
        // default; dpkg-query then fails with ENOBUFS before validation can measure it.
        maxBuffer: 128 * 1024 * 1024,
        timeout: 300_000,
        ...options,
    });
}

function output(result) {
    return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function delay(milliseconds) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitUntil(predicate, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) {
            return true;
        }
        await delay(250);
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

function packageVersion() {
    return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).version;
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

/// A portable archive carries the empty `portable` marker beside the launch artifact.
/// Windows ships a ZIP rooted at the executable's folder; macOS ships one rooted at the
/// folder holding the `.app`. Check the marker here as well as in `collect-release`, so a
/// staging copy that loses the empty file fails the package gate instead of silently
/// writing to app-data at run time.
function assertPortableMarker(directory, pattern = /portable\.zip$/iu, label = "portable ZIP") {
    const portable = walkFiles(directory).find((path) => pattern.test(path));
    if (portable === undefined) {
        throw new Error(`no ${label} under ${directory}`);
    }
    const listing = run("tar", ["-tf", portable]);
    requireSuccess(listing, `list ${label} ${portable}`);
    const names = (listing.stdout ?? "").split(/\r?\n/u).map((name) => name.replaceAll("\\", "/"));
    if (!names.some((name) => /(^|\/)portable$/u.test(name))) {
        throw new Error(`${label} ${portable} does not carry the data-root marker`);
    }
}

function logText(path) {
    const data = readFileSync(path);
    // msiexec writes UTF-16LE with a BOM; application logs are UTF-8.
    if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
        return data.subarray(2).toString("utf16le");
    }
    return data.toString("utf8");
}

function logTail(path, lines = 30) {
    if (!existsSync(path)) {
        return "";
    }
    const content = logText(path).trimEnd().split(/\r?\n/u);
    return content.slice(-lines).join("\n");
}

function isAdministrator() {
    const result = run("powershell", [
        "-NoProfile",
        "-Command",
        "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
    ]);
    return result.status === 0 && (result.stdout ?? "").trim().toLowerCase() === "true";
}

function runMsi(args, label, logPath) {
    const result = run("msiexec.exe", args, { timeout: 600_000 });
    if (result.status !== 0) {
        const tail = logTail(logPath);
        throw new Error(
            `${label} exited ${String(result.status)}${tail === "" ? "" : `\n${tail}`}`,
        );
    }
}

async function terminateInstalledApp(app, installDir) {
    if (app !== undefined && app.pid !== undefined && app.exitCode === null) {
        run("taskkill", ["/PID", String(app.pid), "/T", "/F"], { timeout: 30_000 });
    }
    return waitUntil(() => !processUnder(installDir), 30_000);
}

function msiInstallHintKey(variant) {
    const productName = variant === "bundled" ? "Av1ation Station" : "Av1ation Station System";
    return `HKCU\\Software\\av1ation\\${productName}`;
}

/// Tauri's WiX template has AppSearch actions that overwrite INSTALLDIR from the previous
/// install path under HKCU. NSIS leaves that value behind after its own uninstall, so the
/// MSI would install into a deleted temporary directory even when INSTALLDIR is on the
/// command line. Remove the hint for the test and restore it afterwards.
function clearPreviousInstallHint(key, backupPath) {
    const exported = run("reg", ["export", key, backupPath, "/y"]);
    const existed = exported.status === 0;
    if (existed) {
        const removed = run("reg", ["delete", key, "/f"]);
        if (removed.status !== 0) {
            throw new Error(`could not clear ${key}: ${output(removed)}`);
        }
    }
    return { key, backupPath, existed };
}

function restorePreviousInstallHint(hint) {
    if (!hint.existed) {
        return;
    }
    // The MSI may have recreated the key while it ran. Delete it first so the saved values
    // are restored exactly, not merged with the test installation's values.
    run("reg", ["delete", hint.key, "/f"]);
    run("reg", ["import", hint.backupPath]);
}

/// The effective directory is the one Windows Installer logged, not necessarily the one on
/// the command line: AppSearch can override a public property before costing runs.
function loggedInstallDir(logPath) {
    if (!existsSync(logPath)) {
        return null;
    }
    const lines = logText(logPath).split(/\r?\n/u);
    const line = lines.find((entry) => /Property\(S\): INSTALLDIR = /u.test(entry));
    if (line === undefined) {
        return null;
    }
    const path = line.replace(/^.*Property\(S\): INSTALLDIR = /u, "").trim();
    return path === "" ? null : path;
}

function findPayloadDir(installDir, logPath) {
    const candidates = [loggedInstallDir(logPath), installDir];
    for (const candidate of candidates) {
        if (candidate !== null && existsSync(join(candidate, "av1ation-desktop.exe"))) {
            return candidate;
        }
    }
    return null;
}

function preserveMsiEvidence(evidenceDir, values) {
    mkdirSync(evidenceDir, { recursive: true });
    for (const [name, value] of Object.entries(values)) {
        if (value === undefined || value === null) {
            continue;
        }
        writeFileSync(
            join(evidenceDir, name),
            typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
            "utf8",
        );
    }
}

async function waitForOrigin(logPath, offset, app, spawnError, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = "the application did not write its listening origin";
    while (Date.now() < deadline) {
        const launchError = spawnError();
        if (launchError !== undefined) {
            throw new Error(`launch installed application: ${launchError.message}`);
        }
        if (app.exitCode !== null) {
            throw new Error(
                `installed application exited ${String(app.exitCode)} before opening its service\n${logTail(logPath)}`,
            );
        }
        if (existsSync(logPath)) {
            const data = readFileSync(logPath);
            const appended =
                offset > data.length
                    ? data.toString("utf8")
                    : data.subarray(offset).toString("utf8");
            const matches = [
                ...appended.matchAll(
                    /embedded service is listening origin=(http:\/\/127\.0\.0\.1:\d+)/gu,
                ),
            ];
            const match = matches.at(-1);
            if (match !== undefined) {
                return match[1];
            }
            lastError = `no listening origin in the new log output\n${logTail(logPath)}`;
        }
        await delay(250);
    }
    throw new Error(`installed application did not become ready: ${lastError}`);
}

async function waitForHealth(origin, expectedVersion, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = "no response";
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${origin}/api/health`, {
                signal: AbortSignal.timeout(5_000),
            });
            const text = await response.text();
            if (!response.ok) {
                throw new Error(
                    `health returned ${String(response.status)}: ${text.slice(0, 300)}`,
                );
            }
            const info = JSON.parse(text);
            if (info.version !== expectedVersion) {
                throw new Error(
                    `health reports version ${String(info.version)}, expected ${expectedVersion}`,
                );
            }
            return info;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await delay(500);
    }
    throw new Error(`installed application health check failed: ${lastError}`);
}

async function apiJson(origin, path, options = {}) {
    const method = options.method ?? "GET";
    const headers = { accept: "application/json", ...options.headers };
    if (options.body !== undefined) {
        headers["content-type"] = "application/json";
    }
    const response = await fetch(`${origin}${path}`, {
        ...options,
        method,
        headers,
        signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(
            `${method} ${path} returned ${String(response.status)}: ${text.slice(0, 500)}`,
        );
    }
    return text === "" ? null : JSON.parse(text);
}

function eventSummary(events) {
    return events
        .slice(-5)
        .map((event) => `${String(event.kind)}: ${String(event.message)}`)
        .join("; ");
}

async function waitForRunTerminal(origin, runId, timeoutMs = 240_000) {
    const deadline = Date.now() + timeoutMs;
    let events = [];
    let lastError = "no events";
    while (Date.now() < deadline) {
        try {
            events = await apiJson(origin, `/api/runs/${encodeURIComponent(runId)}/events?since=0`);
            const terminal = events.find((event) => terminalKinds.has(event.kind));
            if (terminal !== undefined) {
                return terminal;
            }
            lastError = events.length === 0 ? "no events yet" : eventSummary(events);
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await delay(500);
    }
    throw new Error(`run ${runId} did not reach a terminal event: ${lastError}`);
}

async function deleteValidationProject(origin, projectId, runId) {
    try {
        await apiJson(origin, `/api/projects/${encodeURIComponent(projectId)}`, {
            method: "DELETE",
        });
        return;
    } catch {
        // A timed-out run still owns the project. Cancel it and retry the delete below.
    }
    if (runId !== undefined) {
        try {
            await apiJson(origin, `/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
        } catch {
            // The run may already have ended, in which case the delete can proceed now.
        }
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            await apiJson(origin, `/api/projects/${encodeURIComponent(projectId)}`, {
                method: "DELETE",
            });
            return;
        } catch {
            await delay(500);
        }
    }
    console.warn(`package validation could not delete temporary project ${projectId}`);
}

async function encodeThroughInstalledApp(installDir, origin, scratch) {
    const ffmpeg = join(installDir, "tools", "bin", "ffmpeg.exe");
    if (!existsSync(ffmpeg)) {
        throw new Error(`bundled install has no ${ffmpeg}`);
    }
    const source = join(scratch, "package-check-source.mkv");
    const output = join(scratch, "package-check-output.mkv");
    requireSuccess(
        run(
            ffmpeg,
            [
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x240:rate=24:duration=2",
                "-frames:v",
                "48",
                "-pix_fmt",
                "yuv420p",
                "-c:v",
                "ffv1",
                "-y",
                source,
            ],
            { cwd: scratch, timeout: 120_000 },
        ),
        "generate package-check source",
    );

    let projectId;
    let runId;
    try {
        const project = await apiJson(origin, "/api/projects", {
            method: "POST",
            body: JSON.stringify({ name: `package validation ${Date.now()}` }),
        });
        projectId = project.id;
        const video = await apiJson(
            origin,
            `/api/projects/${encodeURIComponent(projectId)}/videos`,
            {
                method: "POST",
                body: JSON.stringify({
                    input_path: source,
                    output_path: output,
                    name: "package-check",
                }),
            },
        );
        const started = await apiJson(
            origin,
            `/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(video.id)}/encode`,
            { method: "POST" },
        );
        runId = started.run_id;
        const terminal = await waitForRunTerminal(origin, runId);
        if (terminal.kind === "failed" || terminal.kind === "cancelled") {
            throw new Error(
                `installed encode ${String(terminal.kind)}: ${String(terminal.message)}`,
            );
        }
        const events =
            (await apiJson(origin, `/api/runs/${encodeURIComponent(runId)}/events?since=0`)) ?? [];
        const completed = events.filter((event) => event.kind === "completed").length;
        if (completed === 0) {
            throw new Error("installed encode finished without completing a sequence");
        }
        if (!existsSync(output) || statSync(output).size === 0) {
            throw new Error(`installed encode did not write ${output}`);
        }
        return {
            output_bytes: statSync(output).size,
            completed_sequences: completed,
        };
    } finally {
        if (projectId !== undefined) {
            await deleteValidationProject(origin, projectId, runId);
        }
    }
}

async function launchAndValidateBundledApp(installDir, scratch) {
    const exe = join(installDir, "av1ation-desktop.exe");
    if (!existsSync(exe)) {
        throw new Error(`MSI install did not place av1ation-desktop.exe in ${installDir}`);
    }
    const expectedVersion = packageVersion();
    if (process.env.APPDATA === undefined) {
        throw new Error("APPDATA is not set; cannot locate the installed application log");
    }
    const logPath = join(process.env.APPDATA, appIdentifier, "logs", "application.log");
    const offset = existsSync(logPath) ? statSync(logPath).size : 0;
    let spawnError;
    const app = spawn(exe, [], {
        cwd: installDir,
        stdio: "ignore",
        windowsHide: true,
    });
    app.once("error", (error) => {
        spawnError = error;
    });
    try {
        const origin = await waitForOrigin(logPath, offset, app, () => spawnError);
        const health = await waitForHealth(origin, expectedVersion);
        if (app.exitCode !== null) {
            throw new Error(`installed application exited ${String(app.exitCode)} after health`);
        }
        const encode = await encodeThroughInstalledApp(installDir, origin, scratch);
        return {
            launch: "pass",
            health: {
                version: health.version,
                engine_version: health.engine_version,
            },
            encode: {
                state: "pass",
                ...encode,
            },
        };
    } finally {
        await terminateInstalledApp(app, installDir);
    }
}

async function validateWindowsMsi(variant, directory) {
    const msi = walkFiles(directory).find((path) => /\.msi$/iu.test(path));
    if (msi === undefined) {
        if (packageVersion().includes("-")) {
            return { state: "not built for a prerelease" };
        }
        throw new Error(`stable Windows variant ${variant} has no MSI under ${directory}`);
    }
    if (!isAdministrator()) {
        throw new Error(
            "MSI validation requires an elevated shell; run node scripts/release-package-check.mjs from an Administrator terminal",
        );
    }

    const parent = mkdtempSync(join(tmpdir(), `av1ation-msi-${variant}-`));
    const installDir = join(parent, "install");
    const installLog = join(parent, "install.log");
    const uninstallLog = join(parent, "uninstall.log");
    const scratch = join(parent, "scratch");
    const evidenceDir = join(releaseDir, "validation", "msi", variant);
    const hintKey = msiInstallHintKey(variant);
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    let hint;
    let resolvedDir = installDir;
    let failure;
    let result;
    try {
        mkdirSync(scratch, { recursive: true });
        hint = clearPreviousInstallHint(hintKey, join(parent, "install-hint.reg"));
        runMsi(
            ["/i", msi, "/qn", "/norestart", "/l*v", installLog, `INSTALLDIR=${installDir}`],
            `install ${variant} MSI`,
            installLog,
        );
        let payloadDir = findPayloadDir(installDir, installLog);
        const installed = await waitUntil(() => {
            payloadDir = findPayloadDir(installDir, installLog);
            return payloadDir !== null;
        }, 180_000);
        if (!installed) {
            throw new Error(
                `install ${variant} MSI did not create av1ation-desktop.exe in ${installDir}; logged INSTALLDIR is ${String(loggedInstallDir(installLog))}\n${logTail(installLog, 60)}`,
            );
        }
        resolvedDir = payloadDir;
        if (variant === "bundled" && !existsSync(join(resolvedDir, "ffms2.dll"))) {
            throw new Error(`install ${variant} MSI did not place ffms2.dll beside the executable`);
        }
        const installedBytes = sizeOf(resolvedDir);
        const installedFiles = fileCount(resolvedDir);
        const runtime =
            variant === "bundled"
                ? await launchAndValidateBundledApp(resolvedDir, scratch)
                : { launch: "not run", encode: { state: "not run" } };

        runMsi(
            ["/x", msi, "/qn", "/norestart", "/l*v", uninstallLog],
            `uninstall ${variant} MSI`,
            uninstallLog,
        );
        const treeGone = await waitUntil(() => !existsSync(resolvedDir));
        if (!treeGone) {
            throw new Error(`uninstall ${variant} MSI left the install tree in ${resolvedDir}`);
        }
        if (processUnder(resolvedDir)) {
            throw new Error(`uninstall ${variant} MSI left a helper process in ${resolvedDir}`);
        }
        result = {
            install: "pass",
            requested_install_dir: installDir,
            resolved_install_dir: resolvedDir,
            installed_bytes: installedBytes,
            installed_files: installedFiles,
            uninstall: "pass",
            ...runtime,
        };
    } catch (error) {
        failure = error;
    } finally {
        if (failure !== undefined || !existsSync(resolvedDir)) {
            preserveMsiEvidence(evidenceDir, {
                "install.log": existsSync(installLog) ? logText(installLog) : undefined,
                "uninstall.log": existsSync(uninstallLog) ? logText(uninstallLog) : undefined,
                "request.json": {
                    variant,
                    msi,
                    requested_install_dir: installDir,
                    resolved_install_dir: resolvedDir,
                    logged_install_dir: loggedInstallDir(installLog),
                    hint_key: hintKey,
                },
                "installed-tree.txt": existsSync(resolvedDir)
                    ? `${walkFiles(resolvedDir).join("\n")}\n`
                    : undefined,
            });
        }
        if (existsSync(resolvedDir)) {
            try {
                runMsi(
                    ["/x", msi, "/qn", "/norestart", "/l*v", uninstallLog],
                    `cleanup ${variant} MSI`,
                    uninstallLog,
                );
            } catch (error) {
                console.warn(error instanceof Error ? error.message : String(error));
            }
        }
        if (hint !== undefined) {
            restorePreviousInstallHint(hint);
        }
        rmSync(parent, { recursive: true, force: true });
    }
    if (failure !== undefined) {
        preserveMsiEvidence(evidenceDir, {
            "uninstall.log": existsSync(uninstallLog) ? logText(uninstallLog) : undefined,
            "installed-tree.txt": existsSync(resolvedDir)
                ? `${walkFiles(resolvedDir).join("\n")}\n`
                : undefined,
        });
        throw new Error(
            `${failure instanceof Error ? failure.message : String(failure)}\nMSI evidence: ${evidenceDir}`,
        );
    }
    return result;
}

async function validateWindowsVariant(variant) {
    const directory = variantPaths(variant);
    assertPortableMarker(directory);
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
        if (variant === "bundled" && !existsSync(join(installDir, "ffms2.dll"))) {
            throw new Error(`install ${variant} did not place ffms2.dll beside the executable`);
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
            msi: await validateWindowsMsi(variant, directory),
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
                if (compressed.app_zip_bytes !== null) {
                    assertPortableMarker(variantPaths(variant), /\.app\.zip$/iu, "macOS app ZIP");
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
