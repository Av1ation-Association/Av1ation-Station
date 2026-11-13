import { describe, expect, it } from "vitest";

import { parseCoverageEvidence } from "./evidence.mjs";
import { criticalFileCoverage, evaluatePackagePolicy } from "./policy.mjs";
import { renderPackageReport } from "./report.mjs";

const SUMMARY = {
    "P:/repo/packages/api/src/a.ts": {
        lines: { total: 10, covered: 8 },
        branches: { total: 5, covered: 4 },
        functions: { total: 2, covered: 2 },
    },
    "P:/repo/packages/ui/src/b.tsx": {
        lines: { total: 20, covered: 14 },
        branches: { total: 4, covered: 3 },
        functions: { total: 5, covered: 4 },
    },
};

const LCOV = [
    "SF:C:/repo/rust/crates/engine/src/engine.rs",
    "DA:1,1",
    "DA:2,1",
    "end_of_record",
    "SF:C:/repo/rust/crates/service/src/service.rs",
    "DA:1,1",
    "FNDA:1,run",
    "end_of_record",
].join("\n");

function report({ baseline = {}, minimum = 50 } = {}) {
    const evidence = parseCoverageEvidence({ v8Summary: SUMMARY, rustLcov: LCOV });
    const critical = criticalFileCoverage(evidence, {
        files: [{ path: "packages/api/src/a.ts", min: minimum }],
    });
    const evaluation = evaluatePackagePolicy(evidence, { baseline, critical });
    return renderPackageReport(evidence, evaluation, {
        generatedAt: "2026-11-12T00:00:00.000Z",
        commit: "abc123",
        run: "42",
    });
}

describe("coverage report", () => {
    it("renders package, critical-file, and module tables with run metadata", () => {
        const markdown = report({
            baseline: {
                frontend: { api: 80, ui: 70, total: 73.33 },
                rust: { engine: 100, service: 100 },
            },
        });

        expect(markdown).toContain("# Nightly coverage trend");
        expect(markdown).toContain("Generated: 2026-11-12T00:00:00.000Z");
        expect(markdown).toContain("Commit: abc123");
        expect(markdown).toContain("Run: 42");
        expect(markdown).toContain(
            "| frontend | api | 80.00% | 70% | 80.00% | +0.00 | pass |",
        );
        expect(markdown).toContain("| rust | engine | 100.00% | 72% | 100.00% | +0.00 | pass |");
        expect(markdown).toContain("## Critical files");
        expect(markdown).toContain("| `packages/api/src/a.ts` | 80.00% | 50% | pass |");
        expect(markdown).toContain("## Lowest frontend modules");
        expect(markdown).toContain("## Lowest Rust modules");
        expect(markdown).toContain("Policy: **passed**.");
    });

    it("records failures in the report while keeping the package and module detail", () => {
        const markdown = report({
            baseline: { frontend: { api: 90 } },
            minimum: 90,
        });

        expect(markdown).toContain("FAIL: below ratchet");
        expect(markdown).toContain("| `packages/api/src/a.ts` | 80.00% | 90% | FAIL |");
        expect(markdown).toContain("## Failures");
        expect(markdown).toContain("Policy: **failed**.");
        expect(markdown).toContain("Lowest frontend modules");
    });

    it("omits module tables when requested and still reports the policy", () => {
        const evidence = parseCoverageEvidence({ v8Summary: SUMMARY, rustLcov: LCOV });
        const evaluation = evaluatePackagePolicy(evidence);
        const markdown = renderPackageReport(evidence, evaluation, { modules: false });

        expect(markdown).not.toContain("Lowest frontend modules");
        expect(markdown).not.toContain("Lowest Rust modules");
        expect(markdown).toContain("Policy: **passed**.");
    });
});