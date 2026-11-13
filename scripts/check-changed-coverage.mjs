// Changed-line coverage, without a second coverage run.
//
// The frontend and Rust jobs already emit lcov. This adapter intersects those line hits
// with the added lines in the pull request, so a review sees whether the new code is
// exercised even when the package total barely moves. Existing files are report-only while
// the policy is introduced; a new source file must meet the reviewed floor.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { projectRoot } from "./build-paths.mjs";
import {
    DEFAULT_FRONTEND_LCOV,
    DEFAULT_LCOV,
    FRONTEND_ROOTS,
    RUST_ROOTS,
    readCoverageEvidence,
} from "./coverage/evidence.mjs";
import { DEFAULT_BASELINE, evaluateChangedLines } from "./coverage/policy.mjs";

export { DEFAULT_FRONTEND_LCOV };
export const DEFAULT_RUST_LCOV = DEFAULT_LCOV;
export const DEFAULT_POLICY = resolve(projectRoot, "scripts/coverage-changed.json");

/**
 * Parse a zero-context diff into added line numbers and whether the path is new.
 *
 * The input is limited to source roots by the caller, so a deleted file and a rename with
 * no added lines both produce nothing to report.
 */
export function parseDiff(diff) {
    const files = [];
    let current = null;
    let pendingNewFile = false;
    let inHunk = false;
    let newLine = 0;

    for (const raw of diff.split(/\r?\n/u)) {
        if (raw.startsWith("diff --git ")) {
            current = null;
            pendingNewFile = false;
            inHunk = false;
            continue;
        }
        if (!inHunk && raw.startsWith("new file mode ")) {
            pendingNewFile = true;
            continue;
        }
        if (!inHunk && raw.startsWith("--- /dev/null")) {
            pendingNewFile = true;
            continue;
        }
        if (!inHunk && raw.startsWith("+++ ")) {
            const path = raw.slice(4).trim();
            if (path === "/dev/null") {
                current = null;
                continue;
            }
            const file = path.startsWith("b/") ? path.slice(2) : path;
            current = { file, newFile: pendingNewFile, lines: [] };
            files.push(current);
            pendingNewFile = false;
            continue;
        }
        if (raw.startsWith("@@ ")) {
            const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(raw);
            if (match !== null && current !== null) {
                newLine = Number(match[1]);
                inHunk = true;
            }
            continue;
        }
        if (!inHunk || current === null) continue;

        if (raw.startsWith("+")) {
            current.lines.push(newLine);
            newLine += 1;
        } else if (raw.startsWith(" ")) {
            newLine += 1;
        }
        // A deletion does not move the new-file line counter. A "\ No newline" marker is
        // not source either.
    }

    return files.filter((file) => file.lines.length > 0);
}

function percent(value) {
    return `${value.toFixed(2)}%`;
}

function baselineText(baseline, area) {
    if (baseline === null) return null;
    const values =
        area === "frontend"
            ? [
                  ["API", baseline.frontend?.api],
                  ["UI", baseline.frontend?.ui],
                  ["total", baseline.frontend?.total],
              ]
            : [
                  ["engine", baseline.rust?.engine],
                  ["service", baseline.rust?.service],
              ];
    const recorded = values
        .filter(([, value]) => typeof value === "number")
        .map(([label, value]) => `${label} ${percent(value)}`);
    return recorded.length === 0 ? null : `Current reviewed baseline: ${recorded.join(", ")}.`;
}

function coverageLabel(row) {
    if (row.missing) return "no coverage entry";
    if (row.percent === null) return "n/a";
    return `${percent(row.percent)} (${row.covered}/${row.instrumented})`;
}

function printReport(area, base, worktree, rows, failures, minimum, baseline) {
    console.log(`Changed-line coverage (${area}; base ${base}${worktree ? " + worktree" : ""})`);
    if (rows.length === 0) {
        console.log("  No changed source lines in scope.");
    } else {
        for (const row of rows) {
            const status = row.newFile ? (row.met ? "pass" : "FAIL") : "report-only";
            console.log(`  ${status.padEnd(12)} ${coverageLabel(row).padEnd(24)} ${row.file}`);
        }
    }
    console.log(`New-file floor: ${percent(minimum)}.`);
    const current = baselineText(baseline, area);
    if (current !== null) console.log(current);
    if (failures.length === 0) {
        console.log("Changed-line coverage passed.");
        return;
    }
    console.error(
        `${failures.length} new ${failures.length === 1 ? "file is" : "files are"} below the ${percent(minimum)} floor:`,
    );
    for (const row of failures) console.error(`  ${row.file}`);
}

function markdownReport(area, rows, failures, minimum, baseline) {
    const lines = [
        `## Changed-line coverage — ${area}`,
        "",
        "| File | Change | Coverage | Status |",
        "| --- | --- | ---: | --- |",
    ];
    for (const row of rows) {
        const status = row.newFile ? (row.met ? "pass" : "FAIL") : "report-only";
        lines.push(
            `| \`${row.file}\` | ${row.newFile ? "new" : "modified"} | ${coverageLabel(row)} | ${status} |`,
        );
    }
    if (rows.length === 0) lines.push("| — | — | — | no changed source lines |");
    lines.push("", `New-file floor: **${percent(minimum)}**.`);
    const current = baselineText(baseline, area);
    if (current !== null) lines.push("", current);
    if (failures.length > 0) {
        lines.push("", `**FAIL:** ${failures.length} new file(s) below the floor.`);
    }
    return `${lines.join("\n")}\n`;
}

function appendSummary(area, rows, failures, minimum, baseline) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) return;
    try {
        appendFileSync(
            summaryPath,
            markdownReport(area, rows, failures, minimum, baseline),
            "utf8",
        );
    } catch (error) {
        console.warn(`Could not write the GitHub step summary: ${String(error)}`);
    }
}

function readJson(file) {
    return JSON.parse(readFileSync(file, "utf8"));
}

function readPolicy(file) {
    const policy = readJson(file);
    if (
        typeof policy.newFileMinimum !== "number" ||
        !Number.isFinite(policy.newFileMinimum) ||
        policy.newFileMinimum < 0 ||
        policy.newFileMinimum > 100
    ) {
        throw new Error(`New-file minimum must be a number from 0 to 100 in ${file}.`);
    }
    return policy;
}

function resolveBase(value) {
    const base = value.trim() === "" ? process.env.BASE_SHA?.trim() || "HEAD^" : value.trim();
    return /^0+$/u.test(base) ? "HEAD^" : base;
}

function readDiff(base, worktree, areas) {
    const paths = areas.flatMap((area) => (area === "frontend" ? FRONTEND_ROOTS : RUST_ROOTS));
    const range = worktree ? [base] : [`${base}...HEAD`];
    return execFileSync(
        "git",
        [
            "diff",
            "--unified=0",
            "--no-color",
            "--no-ext-diff",
            "--no-renames",
            "--diff-filter=ACMR",
            ...range,
            "--",
            ...paths,
        ],
        { cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
}

export function parseArgs(argv) {
    const options = {
        frontend: false,
        rust: false,
        base: "",
        worktree: false,
        reportOnly: false,
        policy: DEFAULT_POLICY,
        baseline: DEFAULT_BASELINE,
        frontendLcov: DEFAULT_FRONTEND_LCOV,
        rustLcov: DEFAULT_RUST_LCOV,
        help: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        switch (argument) {
            case "--frontend":
                options.frontend = true;
                break;
            case "--rust":
                options.rust = true;
                break;
            case "--base":
                options.base = argv[++index] ?? "";
                break;
            case "--worktree":
                options.worktree = true;
                break;
            case "--report-only":
                options.reportOnly = true;
                break;
            case "--policy":
                options.policy = resolve(argv[++index] ?? "");
                break;
            case "--baseline":
                options.baseline = resolve(argv[++index] ?? "");
                break;
            case "--frontend-lcov":
                options.frontendLcov = resolve(argv[++index] ?? "");
                break;
            case "--rust-lcov":
                options.rustLcov = resolve(argv[++index] ?? "");
                break;
            case "--help":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (!options.frontend && !options.rust) {
        options.frontend = true;
        options.rust = true;
    }
    return options;
}

function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
    }
    if (options.help) {
        console.log(
            "Usage: node scripts/check-changed-coverage.mjs [--frontend] [--rust] " +
                "[--base <rev>] [--worktree] [--report-only] [--policy <path>] " +
                "[--baseline <path>] [--frontend-lcov <path>] [--rust-lcov <path>]",
        );
        return;
    }

    const areas = [options.frontend ? "frontend" : null, options.rust ? "rust" : null].filter(
        Boolean,
    );
    let policy;
    let evidence;
    let files;
    let baseline = null;
    const base = resolveBase(options.base);
    try {
        if (options.frontend && !existsSync(options.frontendLcov)) {
            throw new Error(
                `Missing frontend lcov report: ${options.frontendLcov}. Run npm run test:web:coverage.`,
            );
        }
        if (options.rust && !existsSync(options.rustLcov)) {
            throw new Error(
                `Missing Rust lcov report: ${options.rustLcov}. Run npm run test:rust:coverage.`,
            );
        }
        policy = readPolicy(options.policy);
        evidence = readCoverageEvidence({
            frontendLcov: options.frontend ? options.frontendLcov : undefined,
            rustLcov: options.rust ? options.rustLcov : undefined,
        });
        files = parseDiff(readDiff(base, options.worktree, areas));
        if (existsSync(options.baseline)) baseline = readJson(options.baseline);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
    }

    let failed = false;
    for (const area of areas) {
        const result = evaluateChangedLines(evidence, {
            area,
            files,
            minimum: policy.newFileMinimum,
        });
        printReport(
            area,
            base,
            options.worktree,
            result.rows,
            result.failures,
            policy.newFileMinimum,
            baseline,
        );
        appendSummary(area, result.rows, result.failures, policy.newFileMinimum, baseline);
        if (result.failures.length > 0 && !options.reportOnly) failed = true;
    }

    if (failed) process.exitCode = 1;
}

const invoked =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
    main();
}
