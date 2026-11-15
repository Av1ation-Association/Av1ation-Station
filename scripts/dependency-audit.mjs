// Turn the two ecosystem audits into one stable weekly report and issue body.
//
// Findings are advisory: opening or updating the issue is the signal, not a pull-request
// check. Audit-tool failures are different and fail the job so a broken scanner cannot look
// like a clean run. The report deliberately has no timestamp so an unchanged finding set
// does not rewrite the issue every week.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { outputRoot, projectRoot } from "./build-paths.mjs";

/** Stable title used to find the one issue the weekly audit owns. */
export const ISSUE_TITLE = "Weekly dependency audit findings";
export const ISSUE_MARKER = "<!-- weekly-dependency-audit -->";
export const DEFAULT_AUDIT_DIR = resolve(outputRoot, "audits");
const NPM_BLOCKING = new Set(["high", "critical"]);

function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function compareFindings(left, right) {
    return (
        compareText(left.ecosystem, right.ecosystem) ||
        compareText(left.package, right.package) ||
        compareText(left.id, right.id) ||
        compareText(left.severity, right.severity)
    );
}

function markdownCell(value) {
    return String(value).replaceAll("|", "\\|").replaceAll(/\r?\n/gu, " ");
}

function advisoryCell(finding) {
    const label = markdownCell(`${finding.id}: ${finding.title}`);
    return finding.url === "" ? label : `[${label}](${finding.url})`;
}

function npmFix(value) {
    if (value === true) {
        return "upgrade available";
    }
    if (value !== null && typeof value === "object") {
        const name = typeof value.name === "string" ? value.name : "dependency";
        const version = typeof value.version === "string" ? `@${value.version}` : "";
        return `upgrade ${name}${version}`;
    }
    return "no automatic fix";
}

/** Keep only the npm findings that the weekly issue is allowed to report. */
export function summarizeNpmAudit(report) {
    if (
        report === null ||
        typeof report !== "object" ||
        report.vulnerabilities === null ||
        typeof report.vulnerabilities !== "object"
    ) {
        throw new Error("npm audit did not return a vulnerability report.");
    }
    const counts = report.metadata?.vulnerabilities ?? {};
    const findings = Object.values(report.vulnerabilities)
        .filter(
            (entry) =>
                entry !== null && typeof entry === "object" && NPM_BLOCKING.has(entry.severity),
        )
        .map((entry) => {
            const advisory = Array.isArray(entry.via)
                ? entry.via.find((candidate) => candidate !== null && typeof candidate === "object")
                : null;
            return {
                ecosystem: "npm",
                id:
                    advisory !== null && advisory?.source !== undefined
                        ? String(advisory.source)
                        : String(entry.name),
                package: String(entry.name ?? "unknown"),
                severity: String(entry.severity),
                title: typeof advisory?.title === "string" ? advisory.title : "Dependency advisory",
                url: typeof advisory?.url === "string" ? advisory.url : "",
                fix: npmFix(entry.fixAvailable),
            };
        })
        .sort(compareFindings);
    return {
        findings,
        counts: {
            info: Number(counts.info ?? 0),
            low: Number(counts.low ?? 0),
            moderate: Number(counts.moderate ?? 0),
            high: Number(counts.high ?? 0),
            critical: Number(counts.critical ?? 0),
            total: Number(counts.total ?? 0),
        },
    };
}

/** Cargo vulnerabilities are already the actionable set, including unclassified ones. */
export function summarizeCargoAudit(report) {
    if (
        report === null ||
        typeof report !== "object" ||
        report.vulnerabilities === null ||
        typeof report.vulnerabilities !== "object" ||
        !Array.isArray(report.vulnerabilities.list)
    ) {
        throw new Error("cargo audit did not return a vulnerability report.");
    }
    const findings = report.vulnerabilities.list
        .filter((entry) => entry !== null && typeof entry === "object")
        .map((entry) => {
            const advisory = entry.advisory ?? {};
            const packageInfo = entry.package ?? {};
            const patched = Array.isArray(entry.versions?.patched) ? entry.versions.patched : [];
            const id = String(advisory.id ?? "RUSTSEC");
            return {
                ecosystem: "cargo",
                id,
                package: String(packageInfo.name ?? "unknown"),
                version: typeof packageInfo.version === "string" ? packageInfo.version : "",
                severity: typeof advisory.severity === "string" ? advisory.severity : "unknown",
                title: typeof advisory.title === "string" ? advisory.title : "RustSec advisory",
                url:
                    typeof advisory.url === "string"
                        ? advisory.url
                        : `https://rustsec.org/advisories/${id}`,
                fix:
                    patched.length === 0
                        ? "no patched version"
                        : `upgrade to ${patched.join(", ")}`,
            };
        })
        .sort(compareFindings);
    const warnings = Object.fromEntries(
        Object.entries(report.warnings ?? {})
            .map(([kind, entries]) => [kind, Array.isArray(entries) ? entries.length : 0])
            .filter(([, count]) => count > 0)
            .sort(([left], [right]) => compareText(left, right)),
    );
    return {
        findings,
        warnings,
        warningTotal: Object.values(warnings).reduce((total, count) => total + count, 0),
    };
}

export function renderIssueBody(summary) {
    const rows = summary.findings.map(
        (finding) =>
            `| ${finding.ecosystem} | \`${markdownCell(finding.package)}\`${
                finding.version === undefined || finding.version === ""
                    ? ""
                    : ` \`${markdownCell(finding.version)}\``
            } | ${markdownCell(finding.severity)} | ${advisoryCell(finding)} | ${markdownCell(finding.fix)} |`,
    );
    const warnings =
        Object.entries(summary.cargo.warnings)
            .map(([kind, count]) => `${String(count)} ${kind}`)
            .join(", ") || "none";
    return [
        ISSUE_MARKER,
        "",
        "## Weekly dependency audit findings",
        "",
        `The scheduled audit found **${String(summary.findings.length)}** actionable finding${
            summary.findings.length === 1 ? "" : "s"
        }:`,
        "",
        `- npm: ${String(summary.npm.high_critical)} high/critical (${String(
            summary.npm.counts.total,
        )} total, including lower severities)`,
        `- Cargo: ${String(summary.cargo.vulnerabilities)} vulnerabilities; ${String(
            summary.cargo.warning_total,
        )} warnings (${warnings})`,
        "",
        "| Ecosystem | Package | Severity | Advisory | Fix |",
        "| --- | --- | --- | --- | --- |",
        ...rows,
        "",
        "This issue is updated by `.github/workflows/weekly.yml`. It is advisory: it is",
        "not a merge gate, and this workflow never runs on pull requests.",
    ].join("\n");
}

export function renderCleanMessage(summary) {
    return (
        `The weekly dependency audit is clean: no npm high/critical findings and no Cargo vulnerabilities. ` +
        `npm still reports ${String(summary.npm.counts.total)} lower-severity findings; Cargo reports ` +
        `${String(summary.cargo.warning_total)} warnings.`
    );
}

export function renderReport(summary) {
    const rows = summary.findings.map(
        (finding) =>
            `| ${finding.ecosystem} | \`${markdownCell(finding.package)}\` | ${markdownCell(
                finding.severity,
            )} | ${advisoryCell(finding)} |`,
    );
    const warningRows = Object.entries(summary.cargo.warnings).map(
        ([kind, count]) => `- ${markdownCell(kind)}: ${String(count)}`,
    );
    return [
        "# Weekly dependency audit",
        "",
        `- npm high/critical: ${String(summary.npm.high_critical)} of ${String(
            summary.npm.counts.total,
        )} total findings`,
        `- Cargo vulnerabilities: ${String(summary.cargo.vulnerabilities)}`,
        `- Cargo warnings: ${String(summary.cargo.warning_total)}`,
        "",
        ...(summary.findings.length === 0
            ? ["No actionable dependency findings."]
            : [
                  "| Ecosystem | Package | Severity | Advisory |",
                  "| --- | --- | --- | --- |",
                  ...rows,
              ]),
        ...(warningRows.length === 0 ? [] : ["", "## Cargo warnings", "", ...warningRows]),
        "",
        "This report is advisory. It is not a merge gate.",
    ].join("\n");
}

export function summarizeDependencyAudit({ npm, cargo }) {
    const npmSummary = summarizeNpmAudit(npm);
    const cargoSummary = summarizeCargoAudit(cargo);
    const summary = {
        schema_version: 1,
        issue_title: ISSUE_TITLE,
        findings: [...npmSummary.findings, ...cargoSummary.findings].sort(compareFindings),
        npm: {
            high_critical: npmSummary.findings.length,
            counts: npmSummary.counts,
        },
        cargo: {
            vulnerabilities: cargoSummary.findings.length,
            warnings: cargoSummary.warnings,
            warning_total: cargoSummary.warningTotal,
        },
        errors: [],
    };
    summary.issue_body = renderIssueBody(summary);
    summary.clean_message = renderCleanMessage(summary);
    summary.report_markdown = renderReport(summary);
    return summary;
}

function parseAudit(name, result) {
    if (result.error) {
        throw new Error(`${name} audit could not start: ${result.error.message}`);
    }
    if (result.status !== 0 && result.status !== 1) {
        const detail = (result.stderr ?? "").trim().split(/\r?\n/u).slice(-3).join(" ");
        throw new Error(
            `${name} audit exited with ${String(result.status)}${detail === "" ? "" : `: ${detail}`}`,
        );
    }
    if ((result.stdout ?? "").trim() === "") {
        throw new Error(`${name} audit produced no JSON report.`);
    }
    let report;
    try {
        report = JSON.parse(result.stdout);
    } catch {
        throw new Error(`${name} audit produced invalid JSON.`);
    }
    if (report !== null && typeof report === "object" && report.error !== undefined) {
        throw new Error(`${name} audit reported an error: ${JSON.stringify(report.error)}`);
    }
    return report;
}

/** Run both audits, write their raw reports and the combined advisory summary. */
export function collectDependencyAudit({ auditDir = DEFAULT_AUDIT_DIR } = {}) {
    mkdirSync(auditDir, { recursive: true });
    // `npm run` provides the CLI path. Using it avoids a shell on Windows, where spawning
    // npm.cmd directly is unsupported and shell:true warns about unescaped arguments.
    const npmCli = process.env.npm_execpath;
    const npmArgs = ["audit", "--json", "--audit-level=high"];
    const npmResult =
        npmCli === undefined
            ? spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, {
                  cwd: projectRoot,
                  encoding: "utf8",
                  env: { ...process.env, NO_COLOR: "1" },
                  maxBuffer: 32 * 1024 * 1024,
                  shell: process.platform === "win32",
              })
            : spawnSync(process.execPath, [npmCli, ...npmArgs], {
                  cwd: projectRoot,
                  encoding: "utf8",
                  env: { ...process.env, NO_COLOR: "1" },
                  maxBuffer: 32 * 1024 * 1024,
              });
    const cargoResult = spawnSync(
        process.execPath,
        [
            resolve(projectRoot, "scripts", "run-cargo.mjs"),
            "audit",
            "--file",
            "Cargo.lock",
            "--json",
        ],
        {
            cwd: projectRoot,
            encoding: "utf8",
            env: { ...process.env, NO_COLOR: "1" },
            maxBuffer: 32 * 1024 * 1024,
        },
    );
    writeFileSync(join(auditDir, "npm.json"), npmResult.stdout ?? "", "utf8");
    writeFileSync(join(auditDir, "cargo.json"), cargoResult.stdout ?? "", "utf8");
    writeFileSync(join(auditDir, "npm.stderr.txt"), npmResult.stderr ?? "", "utf8");
    writeFileSync(join(auditDir, "cargo.stderr.txt"), cargoResult.stderr ?? "", "utf8");

    const errors = [];
    let summary;
    try {
        summary = summarizeDependencyAudit({
            npm: parseAudit("npm", npmResult),
            cargo: parseAudit("cargo", cargoResult),
        });
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        summary = {
            schema_version: 1,
            issue_title: ISSUE_TITLE,
            findings: [],
            npm: { high_critical: 0, counts: { total: 0 } },
            cargo: { vulnerabilities: 0, warnings: {}, warning_total: 0 },
            errors,
            issue_body: "",
            clean_message: "",
            report_markdown: [
                "# Weekly dependency audit",
                "",
                "The audit did not complete:",
                "",
                ...errors.map((message) => `- ${message}`),
                "",
                "The issue was left unchanged.",
            ].join("\n"),
        };
    }
    writeFileSync(join(auditDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(join(auditDir, "report.md"), `${summary.report_markdown}\n`);
    return summary;
}

function main() {
    const summary = collectDependencyAudit();
    console.log(summary.report_markdown);
    if (summary.errors.length > 0) {
        console.error("Dependency audit did not complete; the issue was left unchanged.");
        process.exitCode = 1;
        return;
    }
    if (summary.findings.length > 0) {
        console.warn(
            `::warning::${String(summary.findings.length)} dependency audit finding(s); the weekly issue will be created or updated.`,
        );
    }
}

const invoked =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
    main();
}
