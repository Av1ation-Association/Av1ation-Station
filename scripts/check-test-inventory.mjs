// Keep the generated inventory and the reviewed coverage baseline honest.
//
// The inventory runner already writes raw JSON and Markdown from the runners. This check is
// the other half: it fails when a count in a hand-edited document disagrees with that JSON,
// or when the reviewed coverage baseline no longer matches the coverage artifacts, so a
// stale "890 tests" line or baseline is caught in CI instead of surviving a release.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { projectRoot } from "./build-paths.mjs";
import {
    DEFAULT_LCOV as COVERAGE_LCOV,
    DEFAULT_SUMMARY as COVERAGE_SUMMARY,
    readCoverageEvidence,
} from "./coverage/evidence.mjs";
import { MAX_DROP, compareBaseline } from "./coverage/policy.mjs";

export const DEFAULT_SUMMARY = resolve(projectRoot, "dist/test-inventory/summary.json");
export const DEFAULT_INVENTORY = resolve(projectRoot, "docs/test-inventory.md");
export const DEFAULT_BASELINE = resolve(projectRoot, "scripts/coverage-baseline.json");
export const DEFAULT_TESTING = resolve(projectRoot, "docs/testing.md");
export const DEFAULT_COVERAGE_SUMMARY = COVERAGE_SUMMARY;
export const DEFAULT_RUST_LCOV = COVERAGE_LCOV;

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

function normalizedText(path) {
    return readFileSync(path, "utf8").replaceAll(/\s+/gu, " ");
}

function coveragePhrases(baseline) {
    const labels = [
        ["frontend", "api", "API"],
        ["frontend", "ui", "UI"],
        ["frontend", "total", "total"],
        ["rust", "engine", "engine"],
        ["rust", "service", "service"],
    ];
    return labels.map(([group, name, label]) => {
        const value = baseline?.[group]?.[name];
        // The baseline may round a value while the prose renders two decimals; both name
        // the same reviewed number, so either spelling satisfies the check.
        return typeof value === "number"
            ? [`${label} ${value}%`, `${label} ${value.toFixed(2)}%`]
            : [];
    });
}

/**
 * A fresh run may sit below the reviewed baseline by the same amount the coverage policy
 * allows. Upward drift is always harmless: a baseline is a floor, not a snapshot, and the
 * runner can move a few hundredths between otherwise identical runs. Using one limit here
 * and in `check-coverage.mjs` prevents the two checks from disagreeing about a reviewed
 * drop.
 */
export const BASELINE_TOLERANCE = MAX_DROP;

function hasGroup(baseline, group) {
    return Object.values(baseline?.[group] ?? {}).some((value) => typeof value === "number");
}

/**
 * A reviewed baseline is a ratchet, so it must describe the coverage summary that just
 * ran. The inventory counts can be current while this file is months old; that was the gap
 * the docs-only check could not see. Rust lcov is optional because a frontend-only CI job
 * does not produce it.
 */
function compareCoverageBaseline(baseline, coverageSummaryPath, lcovPath, check) {
    const frontendPresent = existsSync(coverageSummaryPath);
    const rustPresent = existsSync(lcovPath);
    const compareFrontend = hasGroup(baseline, "frontend");
    const compareRust = hasGroup(baseline, "rust");
    if (compareFrontend && !frontendPresent) {
        check(
            "baseline frontend coverage",
            false,
            `missing ${coverageSummaryPath}; run npm run test:web:coverage before this check`,
        );
    }
    const evidence = readCoverageEvidence({
        frontendSummary: frontendPresent && compareFrontend ? coverageSummaryPath : undefined,
        rustLcov: rustPresent && compareRust ? lcovPath : undefined,
    });
    const areas = [
        ...(frontendPresent && compareFrontend ? ["frontend"] : []),
        ...(rustPresent && compareRust ? ["rust"] : []),
    ];
    for (const row of compareBaseline(evidence, baseline, {
        tolerance: BASELINE_TOLERANCE,
        areas,
    })) {
        check(row.label, row.allowed, row.detail);
    }
}

/**
 * Compare the runner summary with the generated Markdown and the baseline with its prose.
 * Every check is returned, not thrown, so the caller can print all drift in one run.
 */
export function checkInventory({
    summaryPath = DEFAULT_SUMMARY,
    inventoryPath = DEFAULT_INVENTORY,
    baselinePath = DEFAULT_BASELINE,
    testingPath = DEFAULT_TESTING,
    coverageSummaryPath = DEFAULT_COVERAGE_SUMMARY,
    lcovPath = DEFAULT_RUST_LCOV,
} = {}) {
    if (!existsSync(summaryPath)) {
        throw new Error(
            `Missing test inventory: ${summaryPath}. Run npm run test:inventory first.`,
        );
    }
    if (!existsSync(inventoryPath)) {
        throw new Error(`Missing generated inventory: ${inventoryPath}.`);
    }
    const summary = readJson(summaryPath);
    const inventory = readFileSync(inventoryPath, "utf8");
    const checks = [];
    const check = (label, ok, detail) => checks.push({ label, ok, detail });

    for (const [area, value] of Object.entries({
        web: summary.web,
        "browser journeys": summary.e2e,
    })) {
        if (value === null || value === undefined) continue;
        const prefix = area === "web" ? "Frontend" : "Browser journeys";
        const line = `${prefix} (Vitest)`;
        check(
            `${area} counts`,
            inventory.includes(`listed **${value.tests} tests** in **${value.files} files**`),
            `${area} summary is ${value.tests} tests in ${value.files} files`,
        );
        check(
            `${area} section`,
            inventory.includes(area === "web" ? line : "Browser journeys (Playwright)"),
            `missing ${area} section`,
        );
        if (area === "web") {
            check(
                "web failures",
                value.failed === 0,
                `${value.failed} frontend tests failed during inventory generation`,
            );
            for (const [areaName, entry] of value.byArea ?? []) {
                check(
                    `area ${areaName}`,
                    inventory.includes(`| ${areaName} | ${entry.tests} | ${entry.files} |`),
                    `expected | ${areaName} | ${entry.tests} | ${entry.files} |`,
                );
            }
            for (const file of value.detail ?? []) {
                check(
                    `file ${file.file}`,
                    inventory.includes(`| ${file.file} | ${file.tests} | ${file.status} |`),
                    `expected | ${file.file} | ${file.tests} | ${file.status} |`,
                );
            }
        }
    }

    if (existsSync(baselinePath)) {
        const baseline = readJson(baselinePath);
        const testing = normalizedText(testingPath);
        for (const phrases of coveragePhrases(baseline)) {
            const phrase = phrases[0];
            check(
                `baseline ${phrase}`,
                phrases.some((candidate) => testing.includes(candidate)),
                `docs/testing.md does not mention ${phrase}`,
            );
        }
        compareCoverageBaseline(baseline, coverageSummaryPath, lcovPath, check);
    }

    return {
        checks,
        failures: checks.filter((entry) => !entry.ok),
    };
}

export function parseArgs(argv) {
    const options = {
        summaryPath: DEFAULT_SUMMARY,
        inventoryPath: DEFAULT_INVENTORY,
        baselinePath: DEFAULT_BASELINE,
        testingPath: DEFAULT_TESTING,
        coverageSummaryPath: DEFAULT_COVERAGE_SUMMARY,
        lcovPath: DEFAULT_RUST_LCOV,
        help: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        switch (argument) {
            case "--summary":
                options.summaryPath = resolve(argv[++index] ?? "");
                break;
            case "--inventory":
                options.inventoryPath = resolve(argv[++index] ?? "");
                break;
            case "--baseline":
                options.baselinePath = resolve(argv[++index] ?? "");
                break;
            case "--testing":
                options.testingPath = resolve(argv[++index] ?? "");
                break;
            case "--coverage-summary":
                options.coverageSummaryPath = resolve(argv[++index] ?? "");
                break;
            case "--lcov":
                options.lcovPath = resolve(argv[++index] ?? "");
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
            "Usage: node scripts/check-test-inventory.mjs [--summary <path>] " +
                "[--inventory <path>] [--baseline <path>] [--testing <path>] " +
                "[--coverage-summary <path>] [--lcov <path>]",
        );
        return;
    }

    let result;
    try {
        result = checkInventory(options);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
    }

    if (result.failures.length > 0) {
        console.error("Test inventory or baseline documentation drifted:");
        for (const failure of result.failures) {
            console.error(`  ${failure.label}: ${failure.detail}`);
        }
        process.exitCode = 1;
        return;
    }
    console.log(
        `Test inventory, baseline docs, and coverage match (${result.checks.length} checks).`,
    );
}

const invoked =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
    main();
}
