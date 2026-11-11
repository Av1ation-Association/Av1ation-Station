// Process sampling shared by the benchmarks.
//
// Windows, macOS and Linux expose process memory through different tools: `tasklist` has no
// parent or working-set columns, macOS has no `tasklist`, and Windows has no `ps`. Callers
// get one shape and never branch on the platform themselves.

import { execFileSync } from "node:child_process";

const MIB = 1024 * 1024;

function run(command, args) {
    try {
        return execFileSync(command, args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            maxBuffer: 16 * MIB,
        });
    } catch {
        return "";
    }
}

/** Every live process, with its parent and resident bytes. */
export function listProcesses() {
    if (process.platform === "win32") {
        const script =
            "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name," +
            "WorkingSetSize,CommandLine | ConvertTo-Json -Compress";
        const text = run("powershell", ["-NoProfile", "-Command", script]).trim();
        if (text === "") {
            return [];
        }
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        return rows.map((row) => ({
            pid: Number(row.ProcessId),
            parentPid: Number(row.ParentProcessId),
            name: String(row.Name ?? ""),
            command: String(row.CommandLine ?? ""),
            bytes: Number(row.WorkingSetSize ?? 0),
        }));
    }

    // Both macOS and Linux report RSS in KiB from `ps`.
    const text = run("ps", ["-axo", "pid=,ppid=,rss=,command="]);
    return text.split(/\r?\n/u).flatMap((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
        if (match === null) {
            return [];
        }
        const command = match[4] ?? "";
        return [
            {
                pid: Number(match[1]),
                parentPid: Number(match[2]),
                name: command.split(/\s+/u)[0] ?? "",
                command,
                bytes: Number(match[3]) * 1024,
            },
        ];
    });
}

/** Resident bytes for one process and every descendant it has. */
export function treeBytes(rootPid, processes = listProcesses()) {
    const sizes = new Map(processes.map((process) => [process.pid, process.bytes]));
    const children = new Map();
    for (const process of processes) {
        const siblings = children.get(process.parentPid) ?? [];
        siblings.push(process.pid);
        children.set(process.parentPid, siblings);
    }
    let total = 0;
    const seen = new Set();
    const stack = [rootPid];
    while (stack.length > 0) {
        const pid = stack.pop();
        if (pid === undefined || seen.has(pid)) {
            continue;
        }
        seen.add(pid);
        total += sizes.get(pid) ?? 0;
        for (const child of children.get(pid) ?? []) {
            stack.push(child);
        }
    }
    return total;
}

/** The first process whose command line or image name contains `fragment`. */
export function findPid(fragment) {
    const needle = fragment.toLowerCase();
    const found = listProcesses().find(
        (process) =>
            process.command.toLowerCase().includes(needle) ||
            process.name.toLowerCase().includes(needle),
    );
    return found?.pid ?? 0;
}

/** Count processes whose image name matches `pattern`. */
export function countProcesses(pattern) {
    return listProcesses().filter((process) => pattern.test(process.name)).length;
}

/**
 * Summed resident bytes of every running FFmpeg.
 *
 * The full listing is too slow to sample a short encode on Windows, so this asks
 * `Get-Process` for the one image name and pays a fraction of the cost.
 */
export function ffmpegBytes() {
    if (process.platform === "win32") {
        const script =
            "$p = @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue); " +
            'if ($p.Count -eq 0) { "0 0" } else { ' +
            '"$($p.Count) $(($p | Measure-Object WorkingSet64 -Sum).Sum)" }';
        const [count, bytes] = run("powershell", ["-NoProfile", "-Command", script])
            .trim()
            .split(/\s+/u);
        return { count: Number(count ?? 0), bytes: Number(bytes ?? 0) };
    }
    const matches = listProcesses().filter((process) => /ffmpeg/iu.test(process.name));
    return {
        count: matches.length,
        bytes: matches.reduce((total, process) => total + process.bytes, 0),
    };
}

/** Resolve a command to an absolute path, or `null` when it is not installed. */
export function which(command) {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    const first = run(locator, [command])
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line !== "");
    return first ?? null;
}

/** Loopback ports that the given processes hold in a listening state. */
export function listeningPortsFor(pids) {
    if (pids.size === 0) {
        return [];
    }
    const ports = new Set();
    if (process.platform === "win32") {
        for (const line of run("netstat", ["-ano"]).split(/\r?\n/u)) {
            const match = /127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)/u.exec(line);
            if (match !== null && pids.has(Number(match[2]))) {
                ports.add(Number(match[1]));
            }
        }
        return [...ports];
    }
    // macOS has `lsof`; Linux may have it too. `ss` is the fallback when it does not.
    const lsof = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]);
    if (lsof !== "") {
        let pid = 0;
        for (const line of lsof.split(/\r?\n/u)) {
            if (line.startsWith("p")) {
                pid = Number(line.slice(1));
            } else if (line.startsWith("n") && pids.has(pid)) {
                const match = /:(\d+)$/u.exec(line);
                if (match !== null) {
                    ports.add(Number(match[1]));
                }
            }
        }
        return [...ports];
    }
    for (const line of run("ss", ["-ltnp"]).split(/\r?\n/u)) {
        const pidMatch = /pid=(\d+)/u.exec(line);
        const portMatch = /:(\d+)\s/u.exec(line);
        if (pidMatch !== null && portMatch !== null && pids.has(Number(pidMatch[1]))) {
            ports.add(Number(portMatch[1]));
        }
    }
    return [...ports];
}
