import { describe, expect, it } from "vitest";

import { parseArgs } from "./check-coverage.mjs";
import { parseCoverageEvidence } from "./coverage/evidence.mjs";
import { MAX_DROP, criticalFileCoverage, evaluatePackagePolicy } from "./coverage/policy.mjs";

const SUMMARY = {
    total: { lines: { total: 30, covered: 18 } },
    "P:/repo/packages/api/src/a.ts": {
        lines: { total: 10, covered: 8 },
        branches: { total: 5, covered: 4 },
        functions: { total: 2, covered: 2 },
    },
    "P:/repo/packages/ui/src/b.tsx": {
        lines: { total: 20, covered: 10 },
        branches: { total: 4, covered: 0 },
        functions: { total: 5, covered: 1 },
    },
};

const LCOV = [
    "SF:C:/repo/rust/crates/engine/src/engine.rs",
    "DA:1,1",
    "DA:2,0",
    "end_of_record",
    "SF:C:/repo/rust/crates/service/src/service.rs",
    "DA:1,3",
    "DA:2,1",
    "end_of_record",
    "SF:C:/repo/rust/crates/contracts/src/contracts.rs",
    "DA:1,1",
    "end_of_record",
].join("\n");

function metric(pct) {
    return { covered: pct, total: 100, pct };
}

function fakeEvidence({ api = 70, ui = 60, total = 65, engine = 72, service = 74 } = {}) {
    return {
        frontend: {
            packages: { api: metric(api), ui: metric(ui), total: metric(total) },
            files: new Map(),
            modules: () => [],
        },
        rust: {
            packages: { engine: metric(engine), service: metric(service) },
            files: new Map(),
            modules: () => [],
        },
        file: () => undefined,
    };
}

describe("coverage policy", () => {
    it("fails when a package is below its published floor or drops too far", () => {
        const result = evaluatePackagePolicy(fakeEvidence({ api: 68.9, ui: 55, total: 60 }), {
            baseline: {
                frontend: { api: 71, ui: 54.9, total: 58 },
            },
            areas: ["frontend"],
        });

        expect(result.rows.map((row) => row.name)).toEqual(["api", "ui", "total"]);
        expect(result.failures.map((row) => row.name)).toEqual(["api", "ui"]);
        expect(result.rows.find((row) => row.name === "ui")?.belowTarget).toBe(true);
        expect(result.rows.find((row) => row.name === "ui")?.regression).toBe(false);
    });

    it("allows a drop exactly at the limit", () => {
        const result = evaluatePackagePolicy(fakeEvidence({ api: 70.75 }), {
            baseline: {
                frontend: { api: 71, ui: 56, total: 58 },
            },
            areas: ["frontend"],
        });

        expect(MAX_DROP).toBe(0.25);
        expect(result.failures).toEqual([]);
    });

    it("enforces the published package floors even without a baseline", () => {
        const result = evaluatePackagePolicy(
            fakeEvidence({ api: 69.99, ui: 60, total: 64, engine: 71.9, service: 74 }),
            {
                baseline: {},
            },
        );

        expect(result.failures.map((row) => `${row.group}/${row.name}`)).toEqual([
            "frontend/api",
            "rust/engine",
        ]);
    });

    it("measures a critical file by repository-relative suffix and honours a waiver", () => {
        const evidence = parseCoverageEvidence({ v8Summary: SUMMARY });
        const rows = criticalFileCoverage(evidence, {
            files: [
                { path: "packages/ui/src/b.tsx", min: 50 },
                { path: "P:/repo/packages/api/src/a.ts", min: 90 },
                {
                    path: "packages/api/src/http.ts",
                    min: 50,
                    waiver: "Covered by the live-service journey.",
                },
                { path: "packages/ui/src/missing.tsx", min: 50 },
            ],
        });

        expect(rows.map((row) => [row.path, row.current, row.met])).toEqual([
            ["packages/ui/src/b.tsx", 50, true],
            ["P:/repo/packages/api/src/a.ts", 80, false],
            ["packages/api/src/http.ts", null, true],
            ["packages/ui/src/missing.tsx", null, false],
        ]);
        expect(rows[2]?.waiver).toContain("live-service");
    });

    it("reports critical failures separately from package failures", () => {
        const result = evaluatePackagePolicy(fakeEvidence(), {
            critical: [
                {
                    path: "packages/ui/src/features/encoders/EncoderEditor.tsx",
                    current: 12,
                    min: 50,
                    waiver: null,
                    met: false,
                },
            ],
        });

        expect(result.failures).toEqual([]);
        expect(result.criticalFailures).toHaveLength(1);
    });

    it("still applies package floors when no baseline exists", () => {
        const result = evaluatePackagePolicy(
            fakeEvidence({ api: 10, ui: 20, engine: 10, service: 20 }),
            {
                baseline: {},
            },
        );

        expect(result.rows.every((row) => row.baseline === null)).toBe(true);
        expect(result.failures.map((row) => row.name)).toEqual(["api", "ui", "engine", "service"]);
    });

    it("selects both reports by default and accepts explicit selectors", () => {
        expect(parseArgs([])).toMatchObject({ frontend: true, rust: true });
        expect(parseArgs(["--frontend"])).toMatchObject({ frontend: true, rust: false });
        expect(parseArgs(["--frontend", "--modules"])).toMatchObject({ modules: true });
        expect(parseArgs(["--rust", "--report-only"])).toMatchObject({
            frontend: false,
            rust: true,
            reportOnly: true,
        });
    });

    it("uses the normalized evidence totals without reparsing lcov in the CLI", () => {
        const evidence = parseCoverageEvidence({ v8Summary: SUMMARY, rustLcov: LCOV });

        expect(evidence.frontend.packages.api.pct).toBe(80);
        expect(evidence.rust.packages.service.pct).toBe(100);
    });
});
