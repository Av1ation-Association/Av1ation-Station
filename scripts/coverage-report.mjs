// Write the nightly coverage trend as Markdown for the workflow summary and artifact.
//
// This adapter is deliberately small: evidence owns the measurements, policy owns the
// rules, and this command only supplies paths, metadata, and an exit status. It writes the
// report before failing so a red nightly still leaves the reason in dist/coverage/.
// Web and Rust evidence live in separate subdirectories so either producer can run first.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { coverageDir } from "./build-paths.mjs";
import { DEFAULT_LCOV, DEFAULT_SUMMARY, readCoverageEvidence } from "./coverage/evidence.mjs";
import {
    DEFAULT_BASELINE,
    DEFAULT_CRITICAL,
    criticalFileCoverage,
    evaluatePackagePolicy,
} from "./coverage/policy.mjs";
import { renderPackageReport } from "./coverage/report.mjs";

export const DEFAULT_OUTPUT = resolve(coverageDir, "coverage-trend.md");

function readJson(file) {
    return JSON.parse(readFileSync(file, "utf8"));
}

export function parseArgs(argv) {
    const options = {
        summary: DEFAULT_SUMMARY,
        lcov: DEFAULT_LCOV,
        baseline: DEFAULT_BASELINE,
        critical: DEFAULT_CRITICAL,
        output: DEFAULT_OUTPUT,
        help: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        switch (argument) {
            case "--summary":
                options.summary = resolve(argv[++index] ?? "");
                break;
            case "--rust-lcov":
                options.lcov = resolve(argv[++index] ?? "");
                break;
            case "--baseline":
                options.baseline = resolve(argv[++index] ?? "");
                break;
            case "--critical":
                options.critical = resolve(argv[++index] ?? "");
                break;
            case "--output":
                options.output = resolve(argv[++index] ?? "");
                break;
            case "--help":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return options;
}

/** Generate the report from the same evidence and policy used by the PR checks. */
export function generateCoverageReport(options) {
    const evidence = readCoverageEvidence({
        frontendSummary: options.summary,
        rustLcov: options.lcov,
    });
    const baseline = existsSync(options.baseline) ? readJson(options.baseline) : {};
    const policy = existsSync(options.critical) ? readJson(options.critical) : { files: [] };
    const critical = criticalFileCoverage(evidence, policy);
    const evaluation = evaluatePackagePolicy(evidence, { baseline, critical });
    const markdown = renderPackageReport(evidence, evaluation, {
        modules: true,
        generatedAt: new Date().toISOString(),
        commit: process.env.GITHUB_SHA,
        run: process.env.GITHUB_RUN_ID,
    });
    return { evidence, evaluation, markdown };
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
            "Usage: node scripts/coverage-report.mjs [--summary <path>] [--rust-lcov <path>] " +
                "[--baseline <path>] [--critical <path>] [--output <path>]",
        );
        return;
    }

    try {
        const { evaluation, markdown } = generateCoverageReport(options);
        mkdirSync(dirname(options.output), { recursive: true });
        writeFileSync(options.output, markdown, "utf8");
        console.log(`Coverage trend written to ${options.output}`);
        if (evaluation.failures.length > 0 || evaluation.criticalFailures.length > 0) {
            console.error("Coverage trend policy failed.");
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

const invoked =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
    main();
}
