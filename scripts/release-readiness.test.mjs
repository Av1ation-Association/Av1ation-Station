import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { READINESS_GATES, checkReleaseReadiness } from "./release-readiness.mjs";

const roots = [];

function passingGates() {
    return Object.fromEntries(
        READINESS_GATES.map((gate) => [
            gate.id,
            {
                status: "pass",
                evidence: `${gate.id} was verified for the release`,
                verified_at: "2026-11-16",
            },
        ]),
    );
}

function fixture({ gates = passingGates(), updatedAt = "2026-11-16" } = {}) {
    const root = mkdtempSync(join(tmpdir(), "av1ation-release-readiness-"));
    roots.push(root);
    mkdirSync(join(root, "release"), { recursive: true });
    writeFileSync(
        join(root, "release", "readiness.json"),
        `${JSON.stringify(
            {
                schema_version: 1,
                updated_at: updatedAt,
                gates,
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
    return root;
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("release readiness", () => {
    it("passes a weekly or stable release when every applicable gate has evidence", () => {
        const root = fixture();

        expect(checkReleaseReadiness({ root, channel: "weekly" }).ready).toBe(true);
        expect(checkReleaseReadiness({ root, channel: "rc" }).ready).toBe(true);
        expect(checkReleaseReadiness({ root, channel: "stable" }).ready).toBe(true);
    });

    it("fails a channel when a common gate is pending", () => {
        const gates = passingGates();
        gates["clean-vm"] = {
            status: "pending",
            evidence: "",
            verified_at: null,
            note: "no clean host yet",
        };
        const report = checkReleaseReadiness({ root: fixture({ gates }), channel: "weekly" });

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: "readiness.clean-vm",
                status: "fail",
                detail: expect.stringContaining("no clean host yet"),
            }),
        );
    });

    it("requires the updater gate for stable but not for a weekly release", () => {
        const gates = passingGates();
        gates.updater = {
            status: "pending",
            evidence: "",
            verified_at: null,
        };
        const root = fixture({ gates });

        expect(checkReleaseReadiness({ root, channel: "weekly" }).ready).toBe(true);
        const stable = checkReleaseReadiness({ root, channel: "stable" });
        expect(stable.ready).toBe(false);
        expect(stable.checks.some((check) => check.id === "readiness.updater")).toBe(true);
    });

    it("fails closed when the readiness file is missing", () => {
        const root = mkdtempSync(join(tmpdir(), "av1ation-release-readiness-"));
        roots.push(root);
        const report = checkReleaseReadiness({ root, channel: "weekly" });

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: "readiness.macos-relocation",
                status: "fail",
            }),
        );
    });

    it("rejects a pass entry without evidence", () => {
        const gates = passingGates();
        gates["manual-release-plan"].evidence = "";
        const report = checkReleaseReadiness({ root: fixture({ gates }), channel: "weekly" });

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: "readiness.manual-release-plan",
                status: "fail",
                detail: expect.stringContaining("passes without evidence"),
            }),
        );
    });

    it("rejects an unknown gate id instead of ignoring a typo", () => {
        const gates = passingGates();
        gates["macos-relocated"] = {
            status: "pass",
            evidence: "wrong key",
            verified_at: "2026-11-16",
        };
        const report = checkReleaseReadiness({ root: fixture({ gates }), channel: "weekly" });

        expect(report.ready).toBe(false);
        expect(report.checks).toContainEqual(
            expect.objectContaining({
                id: "readiness.unknown.macos-relocated",
                status: "fail",
            }),
        );
    });

    it("rejects an invalid channel", () => {
        expect(() => checkReleaseReadiness({ root: fixture(), channel: "nightly" })).toThrow(
            /unknown release channel/u,
        );
    });
});
