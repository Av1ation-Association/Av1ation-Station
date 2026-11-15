import { describe, expect, it } from "vitest";

import {
    ISSUE_MARKER,
    ISSUE_TITLE,
    renderReport,
    summarizeCargoAudit,
    summarizeDependencyAudit,
    summarizeNpmAudit,
} from "./dependency-audit.mjs";

const NPM_REPORT = {
    metadata: {
        vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 1,
            high: 1,
            critical: 1,
            total: 3,
        },
    },
    vulnerabilities: {
        "low-package": {
            name: "low-package",
            severity: "moderate",
            via: ["transitive"],
            fixAvailable: true,
        },
        "high-package": {
            name: "high-package",
            severity: "high",
            via: [
                {
                    source: 123,
                    title: "High advisory",
                    url: "https://example.com/high",
                },
            ],
            fixAvailable: { name: "high-package", version: "2.0.0" },
        },
        "critical-package": {
            name: "critical-package",
            severity: "critical",
            via: [
                {
                    source: 456,
                    title: "Critical advisory",
                    url: "https://example.com/critical",
                },
            ],
            fixAvailable: false,
        },
    },
};

const CARGO_REPORT = {
    vulnerabilities: {
        found: true,
        count: 1,
        list: [
            {
                advisory: {
                    id: "RUSTSEC-2026-0001",
                    title: "Cargo advisory",
                    severity: "high",
                    url: "https://rustsec.org/advisories/RUSTSEC-2026-0001",
                },
                package: { name: "cargo-package", version: "1.2.3" },
                versions: { patched: ["1.2.4"] },
            },
        ],
    },
    warnings: {
        unmaintained: [{}, {}],
        unsound: [{}],
        yanked: [],
    },
};

describe("dependency audit report", () => {
    it("keeps only npm high and critical findings", () => {
        const summary = summarizeNpmAudit(NPM_REPORT);

        expect(summary.findings.map((finding) => finding.package)).toEqual([
            "critical-package",
            "high-package",
        ]);
        expect(summary.counts.total).toBe(3);
        expect(summary.findings[1].fix).toBe("upgrade high-package@2.0.0");
    });

    it("reports Cargo vulnerabilities, unknown severities, and warnings", () => {
        const report = {
            ...CARGO_REPORT,
            vulnerabilities: {
                ...CARGO_REPORT.vulnerabilities,
                list: [
                    ...CARGO_REPORT.vulnerabilities.list,
                    {
                        advisory: { id: "RUSTSEC-2026-0002", title: "Unclassified" },
                        package: { name: "other-package", version: "0.1.0" },
                        versions: { patched: [] },
                    },
                ],
            },
        };

        const summary = summarizeCargoAudit(report);

        expect(summary.findings).toHaveLength(2);
        expect(summary.findings.map((finding) => finding.severity)).toEqual(["high", "unknown"]);
        expect(summary.warnings).toEqual({ unsound: 1, unmaintained: 2 });
        expect(summary.warningTotal).toBe(3);
    });

    it("builds one stable issue body from both ecosystems", () => {
        const summary = summarizeDependencyAudit({ npm: NPM_REPORT, cargo: CARGO_REPORT });

        expect(summary.issue_title).toBe(ISSUE_TITLE);
        expect(summary.findings).toHaveLength(3);
        expect(summary.issue_body).toContain(ISSUE_MARKER);
        expect(summary.issue_body).toContain("critical-package");
        expect(summary.issue_body).toContain("RUSTSEC-2026-0001");
        expect(summary.issue_body).not.toContain("low-package");
        expect(summary.issue_body).toContain("not a merge gate");
        expect(summary.issue_body).toBe(
            summarizeDependencyAudit({ npm: NPM_REPORT, cargo: CARGO_REPORT }).issue_body,
        );
    });

    it("renders a clean report without a findings table", () => {
        const summary = summarizeDependencyAudit({
            npm: { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } },
            cargo: { vulnerabilities: { list: [] }, warnings: {} },
        });

        expect(summary.findings).toEqual([]);
        expect(renderReport(summary)).toContain("No actionable dependency findings.");
        expect(summary.clean_message).toContain("clean");
    });

    it("rejects malformed audit reports instead of reporting a false clean run", () => {
        expect(() => summarizeNpmAudit({})).toThrow(/vulnerability report/u);
        expect(() => summarizeCargoAudit({ vulnerabilities: {} })).toThrow(/vulnerability report/u);
    });
});
