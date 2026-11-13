// Coverage is a policy, not just an uploaded artifact.
//
// The frontend run emits a JSON summary and the Rust run emits lcov; both are measured here
// so CI and a local run answer the same question with the same baseline and failure rule.
// The published package targets are floors, a reviewed baseline is a ratchet, and primary
// files carry their own floors. The three rules are separate so a package aggregate cannot
// hide a screen that no test mounts.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    DEFAULT_BASELINE,
    DEFAULT_CRITICAL,
    MAX_DROP,
    criticalFileCoverage,
    evaluatePackagePolicy,
} from "./coverage/policy.mjs";
import { DEFAULT_LCOV, DEFAULT_SUMMARY, readCoverageEvidence } from "./coverage/evidence.mjs";

export function parseArgs(argv) {
    const options = {
        frontend: false,
        rust: false,
        reportOnly: false,
        modules: false,
        summary: DEFAULT_SUMMARY,
        lcov: DEFAULT_LCOV,
        baseline: DEFAULT_BASELINE,
        critical: DEFAULT_CRITICAL,
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
            case "--report-only":
                options.reportOnly = true;
                break;
            case "--modules":
                options.modules = true;
                break;
            case "--summary":
                options.summary = resolve(argv[++index] ?? "");
                break;
            case "--lcov":
                options.lcov = resolve(argv[++index] ?? "");
                break;
            case "--baseline":
                options.baseline = resolve(argv[++index] ?? "");
                break;
            case "--critical":
                options.critical = resolve(argv[++index] ?? "");
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

function readJson(file) {
    return JSON.parse(readFileSync(file, "utf8"));
}

export function checkCoverage(options) {
    if (!existsSync(options.summary) && options.frontend) {
        throw new Error(
            `Missing frontend coverage summary: ${options.summary}. Run npm run test:web:coverage.`,
        );
    }
    if (!existsSync(options.lcov) && options.rust) {
        throw new Error(
            `Missing Rust lcov report: ${options.lcov}. Run npm run test:rust:coverage.`,
        );
    }
    const baseline = existsSync(options.baseline) ? readJson(options.baseline) : {};
    const evidence = readCoverageEvidence({
        frontendSummary: options.frontend ? options.summary : undefined,
        rustLcov: options.rust ? options.lcov : undefined,
    });
    const policy = existsSync(options.critical) ? readJson(options.critical) : { files: [] };
    const critical = options.frontend ? criticalFileCoverage(evidence, policy) : [];
    const areas = [options.frontend ? "frontend" : null, options.rust ? "rust" : null].filter(
        Boolean,
    );
    return {
        ...evaluatePackagePolicy(evidence, { baseline, critical, areas }),
        modules: options.modules
            ? {
                  frontend: options.frontend ? evidence.frontend.modules() : [],
                  rust: options.rust ? evidence.rust.modules() : [],
              }
            : null,
    };
}

function formatPercent(value) {
    return `${value.toFixed(2)}%`;
}

function formatRow(row) {
    const target = row.target === null ? "—" : `${String(row.target)}%`;
    const baseline = row.baseline === null ? "not recorded" : formatPercent(row.baseline);
    const normalizedChange =
        row.change === null ? null : Math.abs(row.change) < 0.005 ? 0 : row.change;
    const change =
        normalizedChange === null
            ? "—"
            : `${normalizedChange >= 0 ? "+" : ""}${normalizedChange.toFixed(2)}`;
    return (
        `${row.group}/${row.name}`.padEnd(18) +
        formatPercent(row.current).padStart(8) +
        `  target ${target.padEnd(4)}  baseline ${baseline.padEnd(13)}  ${change}`
    );
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
            "Usage: node scripts/check-coverage.mjs [--frontend] [--rust] [--report-only] " +
                "[--modules] [--summary <path>] [--lcov <path>] [--baseline <path>] [--critical <path>]",
        );
        return;
    }

    let result;
    try {
        result = checkCoverage(options);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
    }

    console.log(
        `Coverage policy (targets are floors; a drop greater than ${MAX_DROP.toFixed(2)}% fails)`,
    );
    for (const row of result.rows) {
        console.log(`  ${formatRow(row)}`);
    }
    const missingBaseline = result.rows.filter((row) => row.baseline === null);
    if (missingBaseline.length > 0) {
        const names = missingBaseline.map((row) => `${row.group}/${row.name}`).join(", ");
        console.log(`No baseline recorded for ${names}; those rows are report-only.`);
    }
    if (result.critical.length > 0) {
        console.log("Critical files:");
        for (const row of result.critical) {
            const current = row.current === null ? "missing" : formatPercent(row.current);
            const status = row.waiver !== null ? "waived" : row.met ? "pass" : "FAIL";
            const waiver = row.waiver === null ? "" : `  waiver: ${row.waiver}`;
            console.log(
                `  ${status}  ${current.padStart(8)} / ${String(row.min)}%  ${row.path}${waiver}`,
            );
        }
    }
    if (result.modules !== null) {
        if (result.modules.frontend.length > 0) {
            console.log("Lowest frontend modules (line / branch / function):");
            for (const row of result.modules.frontend) {
                console.log(
                    `  ${formatPercent(row.lines).padStart(7)} / ${formatPercent(row.branches).padStart(7)} / ${formatPercent(row.functions).padStart(7)}  ${row.path}`,
                );
            }
        }
        if (result.modules.rust.length > 0) {
            console.log("Lowest Rust modules (line / function):");
            for (const row of result.modules.rust) {
                console.log(
                    `  ${formatPercent(row.lines).padStart(7)} / ${formatPercent(row.functions).padStart(7)}  ${row.path}`,
                );
            }
        }
    }
    if (result.criticalFailures.length > 0) {
        console.error("Critical-file coverage failed:");
        for (const row of result.criticalFailures) {
            console.error(
                `  ${row.path}: ${row.current === null ? "no coverage entry" : formatPercent(row.current)}, ` +
                    `below ${String(row.min)}%`,
            );
        }
    }
    if (result.failures.length > 0) {
        console.error("Coverage floor or ratchet failed:");
        for (const row of result.failures) {
            const reason = row.belowTarget
                ? `below target ${String(row.target)}%`
                : `${formatPercent(-(row.change ?? 0))} below baseline ${formatPercent(row.baseline ?? 0)}`;
            console.error(`  ${row.group}/${row.name}: ${formatPercent(row.current)}, ${reason}`);
        }
    }
    if ((result.failures.length > 0 || result.criticalFailures.length > 0) && !options.reportOnly) {
        process.exitCode = 1;
        return;
    }
    console.log("Coverage policy passed.");
}

const invoked =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
    main();
}
