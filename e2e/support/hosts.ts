import { spawn, type ChildProcess } from "node:child_process";
import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { AppInfoSchema, LanStatusSchema } from "@av1ation/contracts";

import { cargoTarget, desktopBuild, testDataRoot } from "../../scripts/build-paths.mjs";

const e2eDataDir = join(testDataRoot, "e2e");
const journalPath = join(e2eDataDir, "origin.json");
const logsDir = join(e2eDataDir, "logs");
const serviceBinary = join(
    cargoTarget,
    "debug",
    process.platform === "win32" ? "av1ation-service.exe" : "av1ation-service",
);

/** The profiles the E2E suite starts. Adding a runner or LAN host is one entry here. */
export type HostName = "complete" | "holding" | "lan";

export interface HostProfile {
    readonly name: HostName;
    readonly flag: string;
    /** Bind the authenticated network listener after the loopback host is healthy. */
    readonly lan?: boolean;
}

const hostProfiles: readonly HostProfile[] = [
    { name: "complete", flag: "--fake-engine-complete" },
    { name: "holding", flag: "--fake-engine" },
    { name: "lan", flag: "--fake-engine", lan: true },
];

/** The advertised LAN origin and the code a second browser exchanges for its token. */
export interface LanAccess {
    readonly origin: string;
    readonly shortcode: string;
}

/** One live host as the setup journal records it for the test process. */
export interface HostRecord {
    readonly origin: string;
    readonly pid: number;
    readonly logPath: string;
    readonly lan?: LanAccess | undefined;
}

export type Hosts = Record<HostName, HostRecord>;

interface HostJournal {
    hosts: Hosts;
}

interface StartedHost extends HostRecord {
    readonly name: HostName;
    readonly child: ChildProcess;
}

/**
 * Start every E2E host, wait for its ephemeral port and healthy contract, then publish the
 * journal the fixtures read. Logs are per host so a crash after setup still leaves evidence.
 */
export async function startHosts(): Promise<void> {
    if (!existsSync(serviceBinary)) {
        throw new Error(`No service binary at ${serviceBinary}. Run npm run test:e2e:build first.`);
    }
    if (!existsSync(join(desktopBuild, "index.html"))) {
        throw new Error(`No built SPA at ${desktopBuild}. Run npm run test:e2e:build first.`);
    }

    rmSync(e2eDataDir, { recursive: true, force: true });
    mkdirSync(logsDir, { recursive: true });

    const started: StartedHost[] = [];
    try {
        for (const profile of hostProfiles) {
            started.push(await startHost(profile));
        }

        const hosts = {} as Hosts;
        for (const host of started) {
            hosts[host.name] = {
                origin: host.origin,
                pid: host.pid,
                logPath: host.logPath,
                ...(host.lan === undefined ? {} : { lan: host.lan }),
            };
        }
        writeFileSync(journalPath, JSON.stringify({ hosts }, null, 2), "utf8");
        for (const host of started) {
            console.log(`E2E ${host.name} host: ${host.origin} (log: ${host.logPath})`);
        }
    } catch (error) {
        for (const host of started) {
            stopChild(host.child);
        }
        throw error;
    }

    // Playwright normally runs global teardown. This is the crash path.
    process.once("exit", () => {
        for (const host of started) {
            stopChild(host.child);
        }
    });
}

/** Read the journal written by setup; fixtures use this instead of knowing its shape. */
export function readHosts(): Hosts {
    const raw = readFileSync(journalPath, "utf8");
    return parseJournal(raw);
}

/** Stop every host in the journal, waiting for each pid and escalating once. */
export async function stopHosts(): Promise<void> {
    let raw: string;
    try {
        raw = readFileSync(journalPath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return;
        }
        throw error;
    }

    const hosts = parseJournal(raw);
    let failure: unknown;
    for (const host of Object.values(hosts)) {
        try {
            await stopPid(host.pid, host.logPath);
        } catch (error) {
            failure ??= error;
        }
    }
    if (failure !== undefined) {
        throw failure;
    }
}

async function startHost(profile: HostProfile): Promise<StartedHost> {
    const dataDir = join(e2eDataDir, profile.name);
    mkdirSync(dataDir, { recursive: true });
    const logPath = join(logsDir, `${profile.name}.log`);
    writeFileSync(logPath, "", "utf8");

    const child = spawn(
        serviceBinary,
        [
            "--port",
            "0",
            "--data-dir",
            dataDir,
            "--web-dir",
            desktopBuild,
            "--fake-preflight",
            profile.flag,
        ],
        {
            cwd: process.cwd(),
            env: { ...process.env, AV1ATION_LOG: process.env.AV1ATION_LOG ?? "warn" },
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        },
    );

    let output = "";
    const capture = (chunk: Buffer | string) => {
        const text = String(chunk);
        output = `${output}${text}`.slice(-8_000);
        appendFileSync(logPath, text, "utf8");
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    const readOutput = () => output;

    try {
        const pid = child.pid;
        if (pid === undefined) {
            throw new Error(`The ${profile.name} host did not report a pid.`);
        }
        const origin = await waitForPort(child, profile.name, readOutput, logPath);
        await waitForHealth(origin, profile.name, readOutput, logPath);
        const lan =
            profile.lan === true
                ? await enableLan(origin, profile.name, readOutput, logPath)
                : undefined;
        return {
            name: profile.name,
            origin,
            pid,
            logPath,
            ...(lan === undefined ? {} : { lan }),
            child,
        };
    } catch (error) {
        stopChild(child);
        throw error;
    }
}

function waitForPort(
    child: ChildProcess,
    name: HostName,
    readOutput: () => string,
    logPath: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        let stdout = "";
        const timer = setTimeout(() => {
            cleanup();
            reject(
                new Error(
                    `The ${name} host did not print AV1ATION_PORT within 30 s.${hostDetail(logPath, readOutput())}`,
                ),
            );
        }, 30_000);

        const cleanup = () => {
            clearTimeout(timer);
            child.stdout?.off("data", onData);
            child.off("error", onError);
            child.off("exit", onExit);
        };
        const onData = (chunk: Buffer | string) => {
            stdout += String(chunk);
            const match = /AV1ATION_PORT=(\d+)/u.exec(stdout);
            if (match === null) {
                return;
            }
            cleanup();
            resolve(`http://127.0.0.1:${match[1]}`);
        };
        const onError = (error: Error) => {
            cleanup();
            reject(
                new Error(
                    `The ${name} host could not start: ${error.message}.${hostDetail(logPath, readOutput())}`,
                ),
            );
        };
        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            cleanup();
            reject(
                new Error(
                    `The ${name} host exited (${signal ?? `code ${String(code)}`}) before it reported a port.${hostDetail(logPath, readOutput())}`,
                ),
            );
        };

        child.stdout?.on("data", onData);
        child.once("error", onError);
        child.once("exit", onExit);
    });
}

async function enableLan(
    origin: string,
    name: HostName,
    readOutput: () => string,
    logPath: string,
): Promise<LanAccess> {
    let response: Response;
    try {
        response = await fetch(`${origin}/api/lan/enable`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
            signal: AbortSignal.timeout(5_000),
        });
    } catch (error) {
        throw new Error(
            `The ${name} host could not enable LAN access: ${String(error)}.${hostDetail(logPath, readOutput())}`,
        );
    }
    if (!response.ok) {
        throw new Error(
            `The ${name} host returned HTTP ${String(response.status)} enabling LAN access.${hostDetail(logPath, readOutput())}`,
        );
    }
    const parsed = LanStatusSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
        throw new Error(
            `The ${name} host returned an unexpected /api/lan/enable shape: ${parsed.error.message}.${hostDetail(logPath, readOutput())}`,
        );
    }
    const status = parsed.data;
    const session =
        status.sessions.find((entry) => entry.token === status.token) ?? status.sessions[0];
    if (
        status.enabled !== true ||
        status.url === null ||
        status.url === undefined ||
        session === undefined
    ) {
        throw new Error(
            `The ${name} host did not expose a paired LAN origin.${hostDetail(logPath, readOutput())}`,
        );
    }
    return { origin: status.url, shortcode: session.shortcode };
}

async function waitForHealth(
    origin: string,
    name: HostName,
    readOutput: () => string,
    logPath: string,
): Promise<void> {
    const deadline = Date.now() + 30_000;
    for (;;) {
        let response: Response | undefined;
        try {
            response = await fetch(`${origin}/api/health`, {
                signal: AbortSignal.timeout(1_000),
            });
        } catch {
            // The listener can accept before the health route is ready.
        }

        if (response?.ok === true) {
            const payload: unknown = await response.json().catch(() => null);
            const parsed = AppInfoSchema.safeParse(payload);
            if (!parsed.success) {
                throw new Error(
                    `The ${name} host returned an unexpected /api/health shape: ${parsed.error.message}.${hostDetail(logPath, readOutput())}`,
                );
            }
            return;
        }

        if (Date.now() >= deadline) {
            throw new Error(
                `The ${name} host answered ${origin} but never returned a healthy /api/health.${hostDetail(logPath, readOutput())}`,
            );
        }
        await delay(100);
    }
}

function parseJournal(raw: string): Hosts {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch (error) {
        throw new Error(`The E2E host journal is not valid JSON: ${String(error)}`);
    }
    if (!isHostJournal(parsed)) {
        throw new Error("The E2E host journal does not contain every host record.");
    }
    return parsed.hosts;
}

function isHostJournal(value: unknown): value is HostJournal {
    if (typeof value !== "object" || value === null || !("hosts" in value)) {
        return false;
    }
    const hosts = value.hosts;
    if (typeof hosts !== "object" || hosts === null) {
        return false;
    }
    return hostProfiles.every(({ name }) => isHostRecord((hosts as Record<string, unknown>)[name]));
}

function isHostRecord(value: unknown): value is HostRecord {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        typeof record.origin === "string" &&
        typeof record.pid === "number" &&
        typeof record.logPath === "string" &&
        (record.lan === undefined || isLanAccess(record.lan))
    );
}

function isLanAccess(value: unknown): value is LanAccess {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const access = value as Record<string, unknown>;
    return typeof access.origin === "string" && typeof access.shortcode === "string";
}

function hostDetail(logPath: string, output: string): string {
    const tail = output.trim();
    return `\nHost log: ${logPath}${tail === "" ? "" : `\n${tail}`}`;
}

function stopChild(child: ChildProcess): void {
    if (child.exitCode === null && child.signalCode === null) {
        child.kill();
    }
}

async function stopPid(pid: number, logPath: string): Promise<void> {
    try {
        process.kill(pid, "SIGTERM");
    } catch (error) {
        if (isMissingProcess(error)) {
            return;
        }
        throw error;
    }

    if (await waitForProcessExit(pid, 5_000)) {
        return;
    }

    try {
        process.kill(pid, "SIGKILL");
    } catch (error) {
        if (isMissingProcess(error)) {
            return;
        }
        throw error;
    }

    if (!(await waitForProcessExit(pid, 2_000))) {
        throw new Error(`The E2E host ${String(pid)} did not stop. Host log: ${logPath}`);
    }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            process.kill(pid, 0);
        } catch (error) {
            if (isMissingProcess(error)) {
                return true;
            }
            throw error;
        }
        if (Date.now() >= deadline) {
            return false;
        }
        await delay(50);
    }
}

function isMissingProcess(error: unknown): boolean {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
}
