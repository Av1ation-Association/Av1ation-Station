// One normalized view over the coverage tools, independent of their report formats.
//
// V8 summarizes frontend files as JSON, while cargo-llvm-cov emits lcov. The policy,
// changed-line report, inventory check, and nightly report all need the same repository
// paths and package totals, so they share this parser instead of growing their own.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { rustCoverageDir, webCoverageDir } from "../build-paths.mjs";

// Each producer owns its directory, so a web run cannot clear the Rust report that a
// combined report still needs (and vice versa).
export const DEFAULT_SUMMARY = resolve(webCoverageDir, "coverage-summary.json");
export const DEFAULT_FRONTEND_LCOV = resolve(webCoverageDir, "lcov.info");
export const DEFAULT_LCOV = resolve(rustCoverageDir, "rust-lcov.info");

/** Paths that identify the two measured frontend packages. */
export const FRONTEND_ROOTS = ["packages/api/src/", "packages/ui/src/"];
/** Paths that identify the two measured Rust crates. */
export const RUST_ROOTS = ["rust/crates/engine/src/", "rust/crates/service/src/"];

const FRONTEND_PACKAGES = {
    api: "packages/api/src/",
    ui: "packages/ui/src/",
};

const RUST_PACKAGES = {
    engine: "rust/crates/engine/src/",
    service: "rust/crates/service/src/",
};

const BARE_RUST_ROOTS = ["crates/engine/src/", "crates/service/src/"];

function normalized(file) {
    return file.replaceAll("\\", "/");
}

function lineMetric(covered, total) {
    return {
        covered,
        total,
        pct: total === 0 ? 0 : (covered / total) * 100,
    };
}

function summaryMetric(entry) {
    return lineMetric(entry?.covered ?? 0, entry?.total ?? 0);
}

/** Find the repository-relative portion of a V8 or lcov source path. */
function repositoryPath(file, area) {
    const path = normalized(file);
    const roots = area === "frontend" ? FRONTEND_ROOTS : RUST_ROOTS;
    for (const root of roots) {
        const index = path.indexOf(root);
        if (index !== -1) return path.slice(index);
    }
    if (area === "rust") {
        for (const root of BARE_RUST_ROOTS) {
            const index = path.indexOf(root);
            if (index !== -1) return `rust/${path.slice(index)}`;
        }
    }
    return null;
}

function packageFor(path, area) {
    const packages = area === "frontend" ? FRONTEND_PACKAGES : RUST_PACKAGES;
    return (
        Object.entries(packages).find(([, segment]) => path.startsWith(segment))?.[0] ?? null
    );
}

/** Reduce a lookup path to the repository-relative portion before comparing it. */
function lookupPath(file) {
    const path = normalized(file);
    const lower = path.toLowerCase();
    for (const root of [...FRONTEND_ROOTS, ...RUST_ROOTS]) {
        const index = lower.indexOf(root);
        if (index !== -1) return path.slice(index);
    }
    for (const root of BARE_RUST_ROOTS) {
        const index = lower.indexOf(root);
        if (index !== -1) return `rust/${path.slice(index)}`;
    }
    return path;
}

function parseV8Files(summary) {
    const files = new Map();
    for (const [file, entry] of Object.entries(summary ?? {})) {
        if (file === "total") continue;
        const path = repositoryPath(file, "frontend");
        if (path === null) continue;
        const packageName = packageFor(path, "frontend");
        if (packageName === null) continue;
        files.set(path, {
            path,
            area: "frontend",
            package: packageName,
            lines: summaryMetric(entry?.lines),
            branches: entry?.branches === undefined ? null : summaryMetric(entry.branches),
            functions: entry?.functions === undefined ? null : summaryMetric(entry.functions),
            lineHits: null,
            functionHits: null,
            source: "v8",
        });
    }
    return files;
}

function parseLcovFiles(lcov, area) {
    const records = new Map();
    let current = null;
    for (const raw of lcov.split(/\r?\n/u)) {
        if (raw.startsWith("SF:")) {
            const path = repositoryPath(raw.slice(3), area);
            if (path === null) {
                current = null;
                continue;
            }
            const packageName = packageFor(path, area);
            if (packageName === null) {
                current = null;
                continue;
            }
            current = records.get(path) ?? {
                path,
                area,
                package: packageName,
                lines: new Map(),
                functions: new Map(),
            };
            records.set(path, current);
            continue;
        }
        if (current === null) continue;
        if (raw.startsWith("DA:")) {
            const [line, hits] = raw.slice(3).split(",", 2);
            const lineNumber = Number(line);
            const hitCount = Number(hits);
            if (Number.isInteger(lineNumber) && Number.isFinite(hitCount)) {
                current.lines.set(lineNumber, Math.max(current.lines.get(lineNumber) ?? 0, hitCount));
            }
            continue;
        }
        if (raw.startsWith("FNDA:")) {
            const [hits, name] = raw.slice(5).split(",", 2);
            if (name !== undefined && Number.isFinite(Number(hits))) {
                current.functions.set(name, Math.max(current.functions.get(name) ?? 0, Number(hits)));
            }
            continue;
        }
        if (raw === "end_of_record") current = null;
    }

    const files = new Map();
    for (const record of records.values()) {
        const coveredLines = [...record.lines.values()].filter((hits) => hits > 0).length;
        const coveredFunctions = [...record.functions.values()].filter((hits) => hits > 0).length;
        files.set(record.path, {
            ...record,
            lines: lineMetric(coveredLines, record.lines.size),
            branches: null,
            functions:
                record.functions.size === 0
                    ? null
                    : lineMetric(coveredFunctions, record.functions.size),
            lineHits: record.lines,
            functionHits: record.functions,
            source: "lcov",
        });
    }
    return files;
}

function mergeFrontendFiles(v8Files, lcovFiles) {
    const files = new Map(v8Files);
    for (const [path, lcovFile] of lcovFiles) {
        const existing = files.get(path);
        if (existing === undefined) {
            files.set(path, lcovFile);
            continue;
        }
        // V8 is authoritative for package metrics. The lcov record contributes the
        // changed-line hits without replacing the summary's branch or line totals.
        existing.lineHits = lcovFile.lineHits;
        existing.functionHits = lcovFile.functionHits;
        if (existing.functions === null && lcovFile.functions !== null) {
            existing.functions = lcovFile.functions;
        }
    }
    return files;
}

function packageMetrics(files, area, packageNames, sourceFilter) {
    const selected = [...files.values()].filter(
        (file) =>
            file.area === area && (sourceFilter === null || file.source === sourceFilter),
    );
    const packages = {};
    for (const name of packageNames) {
        const packageFiles = selected.filter((file) => file.package === name);
        packages[name] = lineMetric(
            packageFiles.reduce((sum, file) => sum + file.lines.covered, 0),
            packageFiles.reduce((sum, file) => sum + file.lines.total, 0),
        );
    }
    if (area === "frontend") {
        packages.total = lineMetric(
            selected.reduce((sum, file) => sum + file.lines.covered, 0),
            selected.reduce((sum, file) => sum + file.lines.total, 0),
        );
    }
    return packages;
}

function moduleRows(files, area, sourceFilter, limit) {
    const rows = [];
    for (const file of files.values()) {
        if (file.area !== area) continue;
        if (sourceFilter !== null && file.source !== sourceFilter) continue;
        // A zero-line entry is a type-only module or a barrel; it cannot tell a reviewer
        // which screen needs a test. Frontend modules keep the existing 10-line threshold.
        if (area === "frontend" && file.lines.total < 10) continue;
        if (area === "rust" && file.lines.total === 0) continue;
        rows.push({
            package: file.package,
            path: area === "rust" ? file.path.slice("rust/".length) : file.path,
            lines: file.lines.pct,
            branches: file.branches?.pct ?? 0,
            functions: file.functions?.pct ?? 0,
            total: file.lines.total,
        });
    }
    return rows
        .sort((left, right) => left.lines - right.lines || left.path.localeCompare(right.path))
        .slice(0, limit);
}

function areaEvidence(files, area, packageNames, sourceFilter) {
    const lookup = new Map([...files].map(([path, file]) => [path.toLowerCase(), file]));
    return {
        files,
        packages: packageMetrics(files, area, packageNames, sourceFilter),
        modules: (limit = 15) => moduleRows(files, area, sourceFilter, limit),
        lineHits: (path) => lookup.get(lookupPath(path).toLowerCase())?.lineHits ?? undefined,
    };
}

/** Convert parsed coverage reports into one repository-relative evidence model. */
export function parseCoverageEvidence({ v8Summary, frontendLcov, rustLcov } = {}) {
    const summary = typeof v8Summary === "string" ? JSON.parse(v8Summary) : v8Summary;
    const hasV8Summary = summary !== undefined && summary !== null;
    const v8Files = hasV8Summary ? parseV8Files(summary) : new Map();
    const frontendLcovFiles =
        typeof frontendLcov === "string"
            ? parseLcovFiles(frontendLcov, "frontend")
            : new Map();
    const rustFiles = typeof rustLcov === "string" ? parseLcovFiles(rustLcov, "rust") : new Map();
    const frontendFiles = mergeFrontendFiles(v8Files, frontendLcovFiles);
    const frontend = areaEvidence(
        frontendFiles,
        "frontend",
        Object.keys(FRONTEND_PACKAGES),
        hasV8Summary ? "v8" : null,
    );
    const rust = areaEvidence(rustFiles, "rust", Object.keys(RUST_PACKAGES), null);
    const allFiles = new Map([...frontendFiles, ...rustFiles]);
    const fileLookup = new Map([...allFiles].map(([path, file]) => [path.toLowerCase(), file]));

    return {
        frontend,
        rust,
        file: (path) => fileLookup.get(lookupPath(path).toLowerCase()),
    };
}

function readRequired(file, label) {
    if (!existsSync(file)) throw new Error(`Missing ${label}: ${file}.`);
    return readFileSync(file, "utf8");
}

/** Read the report files and delegate all format handling to parseCoverageEvidence. */
export function readCoverageEvidence({
    frontendSummary,
    frontendLcov,
    rustLcov,
} = {}) {
    return parseCoverageEvidence({
        v8Summary:
            frontendSummary === undefined
                ? undefined
                : JSON.parse(readRequired(frontendSummary, "frontend coverage summary")),
        frontendLcov:
            frontendLcov === undefined
                ? undefined
                : readRequired(frontendLcov, "frontend lcov report"),
        rustLcov:
            rustLcov === undefined ? undefined : readRequired(rustLcov, "Rust lcov report"),
    });
}