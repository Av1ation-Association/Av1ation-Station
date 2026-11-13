import { describe, expect, it } from "vitest";

import {
    DEFAULT_FRONTEND_LCOV,
    DEFAULT_LCOV,
    DEFAULT_SUMMARY,
    parseCoverageEvidence,
    readCoverageEvidence,
} from "./evidence.mjs";

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
    "P:/repo/packages/ui/src/empty.tsx": {
        lines: { total: 0, covered: 0 },
        branches: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 },
    },
    "P:/repo/packages/contracts/src/ignored.ts": { lines: { total: 20, covered: 0 } },
};

describe("coverage evidence", () => {
    it("normalizes V8 paths and aggregates frontend packages", () => {
        const evidence = parseCoverageEvidence({ v8Summary: SUMMARY });

        expect(evidence.frontend.packages).toEqual({
            api: { covered: 8, total: 10, pct: 80 },
            ui: { covered: 10, total: 20, pct: 50 },
            total: { covered: 18, total: 30, pct: 60 },
        });
        expect(evidence.frontend.files.has("packages/contracts/src/ignored.ts")).toBe(false);
    });

    it("normalizes Windows and relative lcov paths and merges duplicate records", () => {
        const evidence = parseCoverageEvidence({
            rustLcov: [
                "SF:C:\\work\\repo\\rust\\crates\\engine\\src\\engine.rs",
                "DA:10,1",
                "DA:10,0",
                "DA:11,0",
                "FNDA:1,used",
                "FNDA:0,unused",
                "end_of_record",
                "SF:crates\\service\\src\\bare.rs",
                "DA:4,1",
                "end_of_record",
            ].join("\n"),
        });

        expect(evidence.rust.packages).toEqual({
            engine: { covered: 1, total: 2, pct: 50 },
            service: { covered: 1, total: 1, pct: 100 },
        });
        expect(evidence.rust.lineHits("rust/crates/engine/src/engine.rs")?.get(10)).toBe(1);
        expect(evidence.rust.lineHits("rust/crates/engine/src/engine.rs")?.get(11)).toBe(0);
        expect(evidence.rust.lineHits("rust/crates/service/src/bare.rs")?.get(4)).toBe(1);
        expect(evidence.rust.files.get("rust/crates/engine/src/engine.rs")?.functions?.pct).toBe(50);
    });

    it("keeps V8 metrics authoritative while attaching lcov line hits", () => {
        const evidence = parseCoverageEvidence({
            v8Summary: SUMMARY,
            frontendLcov: [
                "SF:P:/repo/packages/api/src/a.ts",
                "DA:1,1",
                "DA:2,0",
                "end_of_record",
                "SF:P:/repo/packages/ui/src/lcov-only.tsx",
                "DA:1,1",
                "end_of_record",
            ].join("\n"),
        });

        // The summary is still the package authority; lcov-only files are available to
        // changed-line queries but cannot silently move the reviewed package total.
        expect(evidence.frontend.packages.total).toEqual({ covered: 18, total: 30, pct: 60 });
        expect(evidence.frontend.lineHits("packages/api/src/a.ts")?.get(1)).toBe(1);
        expect(evidence.frontend.lineHits("packages/ui/src/lcov-only.tsx")?.get(1)).toBe(1);
        expect(evidence.frontend.modules().map((row) => row.path)).toEqual([
            "packages/ui/src/b.tsx",
            "packages/api/src/a.ts",
        ]);
    });

    it("aggregates a frontend area from lcov when no V8 summary exists", () => {
        const evidence = parseCoverageEvidence({
            frontendLcov: [
                "SF:packages/api/src/a.ts",
                "DA:1,1",
                "DA:2,0",
                "end_of_record",
            ].join("\n"),
        });

        expect(evidence.frontend.packages.api).toEqual({ covered: 1, total: 2, pct: 50 });
        expect(evidence.frontend.packages.total).toEqual({ covered: 1, total: 2, pct: 50 });
    });

    it("lists the lowest frontend modules with branch and function metrics", () => {
        const evidence = parseCoverageEvidence({ v8Summary: SUMMARY });

        expect(
            evidence.frontend.modules(2).map((row) => [row.path, row.lines, row.branches, row.functions]),
        ).toEqual([
            ["packages/ui/src/b.tsx", 50, 0, 20],
            ["packages/api/src/a.ts", 80, 80, 100],
        ]);
    });

    it("lists Rust modules and derives function coverage from FNDA records", () => {
        const evidence = parseCoverageEvidence({
            rustLcov: [
                "SF:C:/repo/rust/crates/service/src/low.rs",
                "DA:1,1",
                "DA:2,0",
                "FNDA:1,used",
                "FNDA:0,unused",
                "end_of_record",
                "SF:C:/repo/rust/crates/engine/src/high.rs",
                "DA:1,1",
                "FNDA:2,run",
                "end_of_record",
            ].join("\n"),
        });

        expect(evidence.rust.modules(2).map((row) => [row.path, row.lines, row.functions])).toEqual([
            ["crates/service/src/low.rs", 50, 50],
            ["crates/engine/src/high.rs", 100, 100],
        ]);
    });

    it("looks up a file without depending on path case", () => {
        const evidence = parseCoverageEvidence({ v8Summary: SUMMARY });

        expect(evidence.file("P:\\REPO\\PACKAGES\\API\\SRC\\A.TS")?.path).toBe(
            "packages/api/src/a.ts",
        );
    });

    it("keeps web and Rust report defaults in separate directories", () => {
        const normalized = (path) => path.replaceAll("\\", "/");

        expect(normalized(DEFAULT_SUMMARY)).toMatch(
            /\/dist\/coverage\/web\/coverage-summary\.json$/u,
        );
        expect(normalized(DEFAULT_FRONTEND_LCOV)).toMatch(/\/dist\/coverage\/web\/lcov\.info$/u);
        expect(normalized(DEFAULT_LCOV)).toMatch(/\/dist\/coverage\/rust\/rust-lcov\.info$/u);
        expect(normalized(DEFAULT_FRONTEND_LCOV)).not.toBe(normalized(DEFAULT_LCOV));
    });

    it("fails loudly when a requested report is missing", () => {
        expect(() =>
            readCoverageEvidence({ rustLcov: "dist/coverage/rust/missing.info" }),
        ).toThrow(/Missing Rust lcov report/u);
    });
});