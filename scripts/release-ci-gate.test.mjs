import { describe, expect, it } from "vitest";
import { evaluateRequiredChecks } from "./release-ci-gate.mjs";

describe("release CI gate", () => {
    it("accepts reports where every required context succeeded", () => {
        const report = [
            "Web checks gate\tsuccess\t2026-01-01T00:00:00Z",
            "Rust checks gate\tsuccess\t2026-01-01T00:00:00Z",
            "Browser E2E gate\tsuccess\t2026-01-01T00:00:00Z",
            "Unrelated check\tsuccess\t2026-01-01T00:00:00Z",
        ].join("\n");

        expect(evaluateRequiredChecks(report)).toEqual({
            ok: true,
            failures: [],
        });
    });

    it("uses the newest run when a context appears more than once", () => {
        const report = [
            "Web checks gate\tfailure\t2026-01-01T00:00:00Z",
            "Web checks gate\tsuccess\t2026-01-02T00:00:00Z",
            "Rust checks gate\tsuccess\t2026-01-01T00:00:00Z",
            "Browser E2E gate\tsuccess\t2026-01-01T00:00:00Z",
        ].join("\n");

        expect(evaluateRequiredChecks(report)).toEqual({
            ok: true,
            failures: [],
        });
    });

    it("reports missing and unsuccessful contexts", () => {
        const report = [
            "Web checks gate\tsuccess\t2026-01-01T00:00:00Z",
            "Rust checks gate\tfailure\t2026-01-01T00:00:00Z",
        ].join("\n");

        expect(evaluateRequiredChecks(report)).toEqual({
            ok: false,
            failures: [
                { name: "Rust checks gate", conclusion: "failure" },
                { name: "Browser E2E gate", conclusion: "missing" },
            ],
        });
    });
});
