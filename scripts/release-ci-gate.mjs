#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Required branch-protection contexts for a release tag. */
export const REQUIRED_RELEASE_CHECKS = Object.freeze([
    "Web checks gate",
    "Rust checks gate",
    "Browser E2E gate",
]);

/**
 * Parse the TSV emitted by `gh api .../check-runs --jq '.check_runs[] |
 * [.name, (.conclusion // ""), (.started_at // "")] | @tsv'` and require the
 * newest run of each required context to have succeeded.
 */
export function evaluateRequiredChecks(report) {
    const latest = new Map();
    for (const line of report.split(/\r?\n/u)) {
        if (line.trim() === "") continue;
        const [name, conclusion = "", started = ""] = line.split("\t");
        if (!name) continue;
        const previous = latest.get(name);
        if (previous === undefined || started > previous.started) {
            latest.set(name, { conclusion, started });
        }
    }

    const failures = REQUIRED_RELEASE_CHECKS.filter(
        (name) => latest.get(name)?.conclusion !== "success",
    ).map((name) => ({
        name,
        conclusion: latest.get(name)?.conclusion || "missing",
    }));

    return { ok: failures.length === 0, failures };
}

function main(argv) {
    const reportPath = argv[2];
    if (!reportPath) {
        console.error("usage: node scripts/release-ci-gate.mjs <check-runs.tsv>");
        process.exit(2);
    }

    let result;
    try {
        result = evaluateRequiredChecks(readFileSync(reportPath, "utf8"));
    } catch (error) {
        console.error(`Could not read check-run report: ${error.message}`);
        process.exit(1);
    }

    if (!result.ok) {
        const detail = result.failures
            .map(({ name, conclusion }) => `${name} (${conclusion})`)
            .join(", ");
        console.error(`Missing or unsuccessful required checks: ${detail}`);
        process.exit(1);
    }

    console.log(`Required checks are green: ${REQUIRED_RELEASE_CHECKS.join(", ")}`);
}

const invokedDirectly =
    process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main(process.argv);
