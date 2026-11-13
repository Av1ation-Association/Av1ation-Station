import { describe, expect, it } from "vitest";

import { parseArgs, parseDiff } from "./check-changed-coverage.mjs";
import { parseCoverageEvidence } from "./coverage/evidence.mjs";
import { evaluateChangedLines, isInScope } from "./coverage/policy.mjs";

const DIFF = [
    "diff --git a/packages/ui/src/new.tsx b/packages/ui/src/new.tsx",
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    "+++ b/packages/ui/src/new.tsx",
    "@@ -0,0 +1,3 @@",
    "+one",
    "+two",
    "+three",
    "diff --git a/packages/ui/src/existing.ts b/packages/ui/src/existing.ts",
    "index 1111111..2222222 100644",
    "--- a/packages/ui/src/existing.ts",
    "+++ b/packages/ui/src/existing.ts",
    "@@ -4,2 +4,3 @@",
    " context",
    "-gone",
    "+added",
    "+more",
    "@@ -20,1 +21,2 @@",
    " old",
    "+last",
].join("\n");

describe("changed-line coverage", () => {
    it("parses new files and every hunk's added lines", () => {
        expect(parseDiff(DIFF)).toEqual([
            { file: "packages/ui/src/new.tsx", newFile: true, lines: [1, 2, 3] },
            { file: "packages/ui/src/existing.ts", newFile: false, lines: [5, 6, 22] },
        ]);
    });

    it("fails a new file below the floor and leaves modified files report-only", () => {
        const evidence = parseCoverageEvidence({
            frontendLcov: [
                "SF:packages/ui/src/new.tsx",
                "DA:1,1",
                "DA:2,0",
                "end_of_record",
                "SF:packages/ui/src/old.ts",
                "DA:1,0",
                "end_of_record",
                "SF:packages/ui/src/type.ts",
                "end_of_record",
            ].join("\n"),
        });
        const result = evaluateChangedLines(evidence, {
            files: [
                { file: "packages/ui/src/new.tsx", newFile: true, lines: [1, 2] },
                { file: "packages/ui/src/old.ts", newFile: false, lines: [1] },
                { file: "packages/ui/src/type.ts", newFile: true, lines: [1] },
                { file: "packages/ui/src/untested.tsx", newFile: true, lines: [1] },
            ],
            minimum: 80,
            area: "frontend",
        });

        expect(result.rows.map((row) => [row.file, row.covered, row.instrumented])).toEqual([
            ["packages/ui/src/new.tsx", 1, 2],
            ["packages/ui/src/old.ts", 0, 1],
            ["packages/ui/src/type.ts", 0, 0],
            ["packages/ui/src/untested.tsx", 0, 0],
        ]);
        expect(result.failures.map((row) => row.file)).toEqual([
            "packages/ui/src/new.tsx",
            "packages/ui/src/untested.tsx",
        ]);
        expect(result.rows[1]?.met).toBe(true);
        expect(result.rows[2]?.met).toBe(true);
    });

    it("accepts exactly the reviewed floor and excludes tests and non-source files", () => {
        const evidence = parseCoverageEvidence({
            rustLcov: ["SF:rust/crates/service/src/a.rs", "DA:1,1", "DA:2,0", "end_of_record"].join(
                "\n",
            ),
        });
        const result = evaluateChangedLines(evidence, {
            files: [
                { file: "rust/crates/service/src/a.rs", newFile: true, lines: [1, 2] },
                { file: "packages/ui/src/feature.tsx", newFile: true, lines: [1] },
                { file: "packages/ui/src/feature.test.tsx", newFile: true, lines: [1] },
            ],
            minimum: 50,
            area: "rust",
        });

        expect(result.rows.map((row) => [row.file, row.percent, row.met])).toEqual([
            ["rust/crates/service/src/a.rs", 50, true],
        ]);
        expect(isInScope("packages/ui/src/feature.test.tsx", "frontend")).toBe(false);
        expect(isInScope("packages/ui/src/test/helper.tsx", "frontend")).toBe(false);
        expect(isInScope("packages/ui/src/styles.css", "frontend")).toBe(false);
        expect(isInScope("scripts/check-changed-coverage.mjs", "frontend")).toBe(false);
        expect(isInScope("rust/crates/service/src/a.rs", "rust")).toBe(true);
    });

    it("selects one area explicitly and keeps both as the default", () => {
        expect(parseArgs([])).toMatchObject({ frontend: true, rust: true });
        expect(parseArgs(["--frontend", "--base", "abc123", "--report-only"])).toMatchObject({
            frontend: true,
            rust: false,
            base: "abc123",
            reportOnly: true,
        });
        expect(parseArgs(["--rust", "--worktree"])).toMatchObject({
            frontend: false,
            rust: true,
            worktree: true,
        });
    });
});
