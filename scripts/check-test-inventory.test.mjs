import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BASELINE_TOLERANCE, checkInventory } from "./check-test-inventory.mjs";

const directories = [];

function fixture(overrides = {}) {
    const directory = mkdtempSync(join(tmpdir(), "av1ation-inventory-"));
    directories.push(directory);
    const summaryPath = join(directory, "summary.json");
    const inventoryPath = join(directory, "test-inventory.md");
    const baselinePath = join(directory, "coverage-baseline.json");
    const testingPath = join(directory, "testing.md");
    const coverageSummaryPath = join(directory, "coverage-summary.json");
    const lcovPath = join(directory, "rust-lcov.info");
    const summary = {
        web: {
            tests: 2,
            files: 1,
            failed: 0,
            byArea: [["UI", { tests: 2, files: 1 }]],
            detail: [{ file: "packages/ui/a.test.ts", tests: 2, status: "passed" }],
        },
        e2e: { tests: 3, files: 2, specs: [] },
        ...overrides.web,
    };
    writeFileSync(summaryPath, JSON.stringify(summary));
    writeFileSync(
        inventoryPath,
        [
            "## Frontend (Vitest)",
            "listed **2 tests** in **1 files**",
            "| UI | 2 | 1 |",
            "| packages/ui/a.test.ts | 2 | passed |",
            "## Browser journeys (Playwright)",
            "listed **3 tests** in **2 files**",
        ].join("\n"),
    );
    writeFileSync(
        baselinePath,
        JSON.stringify({
            frontend: { api: 80, ui: 60, total: 70 },
            rust: { engine: 100, service: 100 },
        }),
    );
    writeFileSync(testingPath, "API 80%, UI 60%, total 70%; Rust engine 100%, service 100%");
    writeFileSync(
        coverageSummaryPath,
        JSON.stringify({
            "P:/repo/packages/api/src/a.ts": { lines: { total: 100, covered: 80 } },
            "P:/repo/packages/ui/src/b.tsx": { lines: { total: 100, covered: 60 } },
        }),
    );
    writeFileSync(
        lcovPath,
        [
            "SF:C:/repo/rust/crates/engine/src/engine.rs",
            "DA:1,1",
            "end_of_record",
            "SF:C:/repo/rust/crates/service/src/service.rs",
            "DA:1,1",
            "end_of_record",
        ].join("\n"),
    );
    return {
        summaryPath,
        inventoryPath,
        baselinePath,
        testingPath,
        coverageSummaryPath,
        lcovPath,
    };
}

afterEach(() => {
    for (const directory of directories.splice(0)) {
        rmSync(directory, { force: true, recursive: true });
    }
});

describe("test inventory drift", () => {
    it("accepts a generated inventory and baseline that match the runner summary", () => {
        const result = checkInventory(fixture());

        expect(result.failures).toEqual([]);
        expect(result.checks.length).toBeGreaterThan(6);
    });

    it("accepts upward drift and only the policy's downward ratchet", () => {
        const upward = fixture();
        writeFileSync(
            upward.coverageSummaryPath,
            JSON.stringify({
                "P:/repo/packages/api/src/a.ts": { lines: { total: 100, covered: 81 } },
                "P:/repo/packages/ui/src/b.tsx": { lines: { total: 100, covered: 61 } },
            }),
        );

        expect(checkInventory(upward).failures).toEqual([]);

        const atLimit = fixture();
        writeFileSync(
            atLimit.coverageSummaryPath,
            JSON.stringify({
                "P:/repo/packages/api/src/a.ts": { lines: { total: 100, covered: 79.75 } },
                "P:/repo/packages/ui/src/b.tsx": { lines: { total: 100, covered: 60 } },
            }),
        );

        expect(BASELINE_TOLERANCE).toBe(0.25);
        expect(checkInventory(atLimit).failures).toEqual([]);
    });

    it("rejects a downward drop beyond the coverage policy's ratchet", () => {
        const paths = fixture();
        writeFileSync(
            paths.coverageSummaryPath,
            JSON.stringify({
                "P:/repo/packages/api/src/a.ts": { lines: { total: 100, covered: 79.74 } },
                "P:/repo/packages/ui/src/b.tsx": { lines: { total: 100, covered: 60 } },
            }),
        );

        const labels = checkInventory(paths).failures.map((failure) => failure.label);

        expect(labels).toContain("baseline frontend/api");
        expect(labels).not.toContain("baseline frontend/ui");
    });

    it("reports every stale count instead of stopping at the first one", () => {
        const paths = fixture();
        writeFileSync(
            paths.inventoryPath,
            "listed **99 tests** in **1 files**\n## Browser journeys (Playwright)",
        );
        writeFileSync(paths.testingPath, "API 80%, UI 60%, total 70%; Rust engine 100%");

        const result = checkInventory(paths);
        const labels = result.failures.map((failure) => failure.label);

        expect(labels).toContain("web counts");
        expect(labels).toContain("browser journeys counts");
        expect(labels).toContain("area UI");
        expect(labels).toContain("file packages/ui/a.test.ts");
        expect(labels).toEqual(expect.arrayContaining(["baseline service 100%"]));
    });

    it("fails when the coverage summary or Rust lcov disagrees with the baseline", () => {
        const paths = fixture();
        writeFileSync(
            paths.coverageSummaryPath,
            JSON.stringify({
                "P:/repo/packages/api/src/a.ts": { lines: { total: 100, covered: 70 } },
                "P:/repo/packages/ui/src/b.tsx": { lines: { total: 100, covered: 60 } },
            }),
        );
        writeFileSync(
            paths.lcovPath,
            [
                "SF:C:/repo/rust/crates/engine/src/engine.rs",
                "DA:1,0",
                "end_of_record",
                "SF:C:/repo/rust/crates/service/src/service.rs",
                "DA:1,1",
                "end_of_record",
            ].join("\n"),
        );

        const result = checkInventory(paths);
        const labels = result.failures.map((failure) => failure.label);

        expect(labels).toContain("baseline frontend/api");
        expect(labels).toContain("baseline frontend/total");
        expect(labels).toContain("baseline rust/engine");
        expect(labels).not.toContain("baseline frontend/ui");
        expect(labels).not.toContain("baseline rust/service");
    });

    it("does not require a Rust lcov report", () => {
        const paths = fixture();
        rmSync(paths.lcovPath);

        expect(checkInventory(paths).failures).toEqual([]);
    });

    it("fails loudly when the inventory has never been generated", () => {
        expect(() =>
            checkInventory({
                summaryPath: join(tmpdir(), "av1ation-missing-inventory.json"),
            }),
        ).toThrow(/Run npm run test:inventory/u);
    });
});
