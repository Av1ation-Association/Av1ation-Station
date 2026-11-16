// Fail-closed checks for the manual release gates that CI cannot execute itself.
//
// The checked-in record is a reviewed attestation, not a claim inferred from build output.
// Every gate that applies to the requested channel must be `pass`, name non-empty evidence,
// and carry the date the evidence was verified. A missing, pending, malformed, or unknown
// gate blocks the release. The release workflow and release:preflight both call this module.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot } from "./build-paths.mjs";
import { parseReleaseTag } from "./release-manifest.mjs";

export const READINESS_SCHEMA_VERSION = 1;
export const DEFAULT_READINESS_FILE = join("release", "readiness.json");
export const READINESS_CHANNELS = ["weekly", "rc", "stable"];
export const READINESS_GATES = [
    {
        id: "transitive-notices",
        title: "Transitive Python/plugin notices and fork provenance",
        channels: READINESS_CHANNELS,
    },
];

function addCheck(checks, id, ok, detail) {
    checks.push({
        id,
        status: ok ? "pass" : "fail",
        detail,
    });
}

function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
        return false;
    }
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

export function normalizeReadinessChannel(channel) {
    if (!READINESS_CHANNELS.includes(channel)) {
        throw new Error(
            `unknown release channel ${JSON.stringify(channel)}; expected one of ${READINESS_CHANNELS.join(", ")}`,
        );
    }
    return channel;
}

function gateDetail(entry, gate) {
    if (entry === undefined) {
        return `missing ${gate.id} gate`;
    }
    if (!isObject(entry)) {
        return `${gate.id} must be an object`;
    }
    if (entry.status !== "pass") {
        const note =
            typeof entry.note === "string" && entry.note.trim() !== ""
                ? `: ${entry.note.trim()}`
                : "";
        return `${gate.id} is ${typeof entry.status === "string" ? entry.status : "missing a status"}${note}`;
    }
    if (typeof entry.evidence !== "string" || entry.evidence.trim() === "") {
        return `${gate.id} passes without evidence`;
    }
    if (!isCalendarDate(entry.verified_at)) {
        return `${gate.id} passes without a valid verified_at date`;
    }
    return `verified ${entry.verified_at}: ${entry.evidence.trim()}`;
}

/**
 * Check the reviewed readiness record for one channel.
 *
 * `root` is the repository root; `file` may be absolute or relative to it. A malformed file
 * fails every applicable gate rather than falling back to a permissive default.
 */
export function checkReleaseReadiness({
    root = projectRoot,
    file = DEFAULT_READINESS_FILE,
    channel,
} = {}) {
    const resolvedRoot = resolve(root);
    const resolvedFile = resolve(resolvedRoot, file);
    const selectedChannel = normalizeReadinessChannel(channel);
    const requiredGates = READINESS_GATES.filter((gate) => gate.channels.includes(selectedChannel));
    const checks = [];

    if (!existsSync(resolvedFile)) {
        for (const gate of requiredGates) {
            addCheck(checks, `readiness.${gate.id}`, false, `missing ${resolvedFile}`);
        }
        return {
            schema_version: READINESS_SCHEMA_VERSION,
            channel: selectedChannel,
            file: resolvedFile,
            ready: false,
            checks,
            summary: { passed: 0, failed: checks.length },
        };
    }

    let record;
    try {
        record = JSON.parse(readFileSync(resolvedFile, "utf8"));
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        for (const gate of requiredGates) {
            addCheck(
                checks,
                `readiness.${gate.id}`,
                false,
                `could not read ${resolvedFile}: ${detail}`,
            );
        }
        return {
            schema_version: READINESS_SCHEMA_VERSION,
            channel: selectedChannel,
            file: resolvedFile,
            ready: false,
            checks,
            summary: { passed: 0, failed: checks.length },
        };
    }

    const fileOk =
        isObject(record) &&
        record.schema_version === READINESS_SCHEMA_VERSION &&
        isCalendarDate(record.updated_at) &&
        isObject(record.gates);
    addCheck(
        checks,
        "readiness.file",
        fileOk,
        fileOk
            ? resolvedFile
            : `${resolvedFile} must use schema_version ${READINESS_SCHEMA_VERSION}, a valid updated_at date, and a gates object`,
    );

    const gates = fileOk ? record.gates : {};
    const knownIds = new Set(READINESS_GATES.map((gate) => gate.id));
    for (const id of Object.keys(gates)) {
        addCheck(
            checks,
            `readiness.unknown.${id}`,
            knownIds.has(id),
            knownIds.has(id) ? `known gate ${id}` : `unknown release-readiness gate ${id}`,
        );
    }

    for (const gate of requiredGates) {
        const detail = gateDetail(gates[gate.id], gate);
        addCheck(checks, `readiness.${gate.id}`, detail.startsWith("verified "), detail);
    }

    const failed = checks.filter((check) => check.status === "fail");
    return {
        schema_version: READINESS_SCHEMA_VERSION,
        channel: selectedChannel,
        file: resolvedFile,
        ready: failed.length === 0,
        checks,
        summary: {
            passed: checks.length - failed.length,
            failed: failed.length,
        },
    };
}

function requiredValue(argv, index, option) {
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
        throw new Error(`${option} must be followed by a value`);
    }
    return value.trim();
}

function parseCli(argv) {
    const options = {
        file: DEFAULT_READINESS_FILE,
        channel: undefined,
        tag: undefined,
        json: undefined,
        help: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        switch (argument) {
            case "--file":
                options.file = requiredValue(argv, index, "--file");
                index += 1;
                break;
            case "--channel":
                options.channel = requiredValue(argv, index, "--channel");
                index += 1;
                break;
            case "--tag":
                options.tag = requiredValue(argv, index, "--tag");
                index += 1;
                break;
            case "--json":
                options.json = requiredValue(argv, index, "--json");
                index += 1;
                break;
            case "--help":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (!options.help) {
        if (options.tag !== undefined) {
            const tagChannel = parseReleaseTag(options.tag).channel;
            if (options.channel !== undefined && options.channel !== tagChannel) {
                throw new Error(
                    `--channel ${options.channel} does not match the ${tagChannel} tag`,
                );
            }
            options.channel = tagChannel;
        }
        if (options.channel === undefined) {
            throw new Error("--channel or --tag is required");
        }
    }
    return options;
}

function outputDetail(result) {
    const failed = result.checks.filter((check) => check.status === "fail");
    if (result.ready) {
        console.log(
            `release:readiness passed for the ${result.channel} channel (${String(result.checks.length)} checks).`,
        );
        return;
    }
    console.error(
        `release:readiness blocked the ${result.channel} channel with ${String(failed.length)} failure(s):`,
    );
    for (const check of failed) {
        console.error(`  - ${check.id}: ${check.detail}`);
    }
}

function main() {
    const options = parseCli(process.argv.slice(2));
    if (options.help) {
        console.log(`Usage: npm run release:readiness -- (--tag <tag> | --channel <channel>) [options]

Fail-closed checks for the reviewed manual release gates.

Options:
  --tag <tag>              Derive the channel from a release tag
  --channel <channel>     weekly, rc, or stable
  --file <path>           Readiness record (default: ${DEFAULT_READINESS_FILE})
  --json <path>           Write the report as JSON
  --help                   Show this help`);
        return;
    }
    const result = checkReleaseReadiness({
        channel: options.channel,
        file: options.file,
    });
    if (options.json !== undefined) {
        const jsonPath = resolve(projectRoot, options.json);
        mkdirSync(dirname(jsonPath), { recursive: true });
        writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    outputDetail(result);
    if (!result.ready) {
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
