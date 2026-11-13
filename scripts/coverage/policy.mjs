// Coverage policy sits on top of normalized evidence, never on a report format.
//
// Package floors, the reviewed ratchet, critical files, and changed-line floors are distinct
// rules for one reason: a package aggregate must not hide a screen that no test mounts.
import { resolve } from "node:path";

import { projectRoot } from "../build-paths.mjs";
import { FRONTEND_ROOTS, RUST_ROOTS } from "./evidence.mjs";

/** A reviewed change may lose this much line coverage before the policy fails. */
export const MAX_DROP = 0.25;

/** Published package floors. A package below its floor fails the policy. */
export const TARGETS = {
    api: 70,
    ui: 60,
    engine: 72,
    service: 74,
};

export const DEFAULT_BASELINE = resolve(projectRoot, "scripts/coverage-baseline.json");
export const DEFAULT_CRITICAL = resolve(projectRoot, "scripts/coverage-critical.json");

function normalized(file) {
    return file.replaceAll("\\", "/");
}

function hundredths(value) {
    return Math.round(value * 100);
}

function coverageRow(group, name, current, baseline, targets, maxDrop) {
    const value = current?.pct ?? 0;
    const baselineValue =
        typeof baseline?.[group]?.[name] === "number" ? baseline[group][name] : null;
    const change = baselineValue === null ? null : value - baselineValue;
    return {
        group,
        name,
        current: value,
        target: targets[name] ?? null,
        baseline: baselineValue,
        change,
        belowTarget: targets[name] !== undefined && value < targets[name],
        regression: change !== null && change < -maxDrop,
    };
}

/** Apply package floors, the ratchet, and the critical-file floors. */
export function evaluatePackagePolicy(
    evidence,
    { baseline = {}, targets = TARGETS, critical = [], maxDrop = MAX_DROP, areas } = {},
) {
    const selectedAreas = areas ?? ["frontend", "rust"];
    const rows = [];
    if (selectedAreas.includes("frontend")) {
        rows.push(
            coverageRow("frontend", "api", evidence.frontend.packages.api, baseline, targets, maxDrop),
            coverageRow("frontend", "ui", evidence.frontend.packages.ui, baseline, targets, maxDrop),
            coverageRow(
                "frontend",
                "total",
                evidence.frontend.packages.total,
                baseline,
                targets,
                maxDrop,
            ),
        );
    }
    if (selectedAreas.includes("rust")) {
        rows.push(
            coverageRow("rust", "engine", evidence.rust.packages.engine, baseline, targets, maxDrop),
            coverageRow("rust", "service", evidence.rust.packages.service, baseline, targets, maxDrop),
        );
    }
    return {
        rows,
        critical,
        failures: rows.filter((row) => row.belowTarget || row.regression),
        criticalFailures: critical.filter((row) => !row.met),
    };
}

/** Measure reviewed critical-file floors against normalized frontend files. */
export function criticalFileCoverage(evidence, policy) {
    return (policy.files ?? []).map((rule) => {
        const target = normalized(rule.path);
        let file = evidence.file(target);
        if (file === undefined) {
            file = [...evidence.frontend.files.values()].find(
                (candidate) =>
                    candidate.path.endsWith(`/${target}`) || candidate.path.endsWith(target),
            );
        }
        const current = file === undefined || file.lines.total === 0 ? null : file.lines.pct;
        const waived = typeof rule.waiver === "string" && rule.waiver.trim() !== "";
        return {
            path: rule.path,
            current,
            min: rule.min,
            waiver: waived ? rule.waiver : null,
            met: waived || (current !== null && current >= rule.min),
        };
    });
}

/** Keep only files the coverage reporters instrument. Test helpers are not source. */
export function isInScope(file, area) {
    const path = normalized(file);
    if (area === "frontend") {
        return (
            FRONTEND_ROOTS.some((root) => path.startsWith(root)) &&
            /\.(ts|tsx)$/u.test(path) &&
            !/(^|\/)(test|__snapshots__)\//u.test(path) &&
            !/\.(test|spec)\.(ts|tsx)$/u.test(path) &&
            !path.endsWith(".d.ts")
        );
    }
    if (area === "rust") {
        return RUST_ROOTS.some((root) => path.startsWith(root)) && path.endsWith(".rs");
    }
    return false;
}

/** Measure added lines against the normalized lcov hits in one area. */
export function evaluateChangedLines(evidence, { area, files, minimum }) {
    const rows = [];
    for (const file of files) {
        if (!isInScope(file.file, area)) continue;
        const lines = evidence[area].lineHits(file.file);
        const changed = new Set(file.lines);
        const instrumented =
            lines === undefined ? [] : [...changed].filter((line) => lines.has(line));
        const covered = instrumented.filter((line) => (lines?.get(line) ?? 0) > 0).length;
        const percent = instrumented.length === 0 ? null : (covered / instrumented.length) * 100;
        const missing = lines === undefined;
        const newFile = file.newFile;
        const met =
            !newFile || (missing ? false : instrumented.length === 0 || (percent ?? 0) >= minimum);
        rows.push({
            file: file.file,
            newFile,
            missing,
            covered,
            instrumented: instrumented.length,
            percent,
            met,
        });
    }
    rows.sort((left, right) => left.file.localeCompare(right.file));
    return {
        rows,
        failures: rows.filter((row) => row.newFile && !row.met),
    };
}

/** Compare measured package values with the reviewed baseline at the policy tolerance. */
export function compareBaseline(
    evidence,
    baseline,
    { tolerance = MAX_DROP, areas = ["frontend", "rust"] } = {},
) {
    const rows = [];
    const packageNames = {
        frontend: ["api", "ui", "total"],
        rust: ["engine", "service"],
    };
    for (const group of areas) {
        for (const name of packageNames[group] ?? []) {
            const expected = baseline?.[group]?.[name];
            if (typeof expected !== "number") continue;
            const actual = evidence[group].packages[name]?.pct ?? 0;
            const allowed = hundredths(actual) + Math.round(tolerance * 100) >= hundredths(expected);
            rows.push({
                label: `baseline ${group}/${name}`,
                expected,
                actual,
                allowed,
                detail:
                    `baseline ${group}/${name} is ${expected}%, measured ${actual.toFixed(2)}%; ` +
                    `more than ${tolerance.toFixed(2)} points below the baseline`,
            });
        }
    }
    return rows;
}