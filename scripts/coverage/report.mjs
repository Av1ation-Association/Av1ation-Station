// Render the weekly coverage trend from normalized evidence, not from console output.
//
// The report is a durable artifact for the workflow summary and the uploaded coverage
// directory. It contains the same package, critical-file, and module measurements that the
// policy evaluates, so a failed weekly run still leaves a readable explanation behind.
function percent(value) {
    return `${value.toFixed(2)}%`;
}

function cell(value) {
    return String(value).replaceAll("|", "\\|");
}

function packageStatus(row) {
    if (row.belowTarget) return "FAIL: below target";
    if (row.regression) return "FAIL: below ratchet";
    return "pass";
}

function changeText(change) {
    if (change === null) return "—";
    const normalized = Math.abs(change) < 0.005 ? 0 : change;
    return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

function criticalStatus(row) {
    if (row.waiver !== null) return "waived";
    return row.met ? "pass" : "FAIL";
}

function packageTable(evaluation) {
    const lines = [
        "| Area | Package | Coverage | Target | Baseline | Change | Status |",
        "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ];
    for (const row of evaluation.rows) {
        const target = row.target === null ? "—" : `${String(row.target)}%`;
        const baseline = row.baseline === null ? "not recorded" : percent(row.baseline);
        lines.push(
            `| ${row.group} | ${row.name} | ${percent(row.current)} | ${target} | ${baseline} | ${changeText(row.change)} | ${packageStatus(row)} |`,
        );
    }
    return lines;
}

function criticalTable(critical) {
    if (critical.length === 0) return [];
    const lines = [
        "## Critical files",
        "",
        "| File | Coverage | Floor | Status |",
        "| --- | ---: | ---: | --- |",
    ];
    for (const row of critical) {
        const current = row.current === null ? "missing" : percent(row.current);
        const waiver = row.waiver === null ? "" : ` (waived: ${cell(row.waiver)})`;
        lines.push(
            `| \`${cell(row.path)}\` | ${current} | ${String(row.min)}% | ${criticalStatus(row)}${waiver} |`,
        );
    }
    return lines;
}

function moduleTable(title, rows, withBranches) {
    if (rows.length === 0) return [];
    const header = withBranches
        ? "| File | Lines | Branches | Functions |"
        : "| File | Lines | Functions |";
    const separator = withBranches ? "| --- | ---: | ---: | ---: |" : "| --- | ---: | ---: |";
    const lines = [`## ${title}`, "", header, separator];
    for (const row of rows) {
        const metrics = withBranches
            ? `${percent(row.lines)} | ${percent(row.branches)} | ${percent(row.functions)}`
            : `${percent(row.lines)} | ${percent(row.functions)}`;
        lines.push(`| \`${cell(row.path)}\` | ${metrics} |`);
    }
    return lines;
}

function failureSection(evaluation) {
    if (evaluation.failures.length === 0 && evaluation.criticalFailures.length === 0) {
        return [];
    }
    const lines = ["## Failures", ""];
    for (const row of evaluation.failures) {
        const reason = row.belowTarget
            ? `below target ${String(row.target)}%`
            : `${percent(-(row.change ?? 0))} below baseline ${percent(row.baseline ?? 0)}`;
        lines.push(`- \`${row.group}/${row.name}\`: ${percent(row.current)}, ${reason}`);
    }
    for (const row of evaluation.criticalFailures) {
        lines.push(
            `- \`${row.path}\`: ${row.current === null ? "no coverage entry" : percent(row.current)}, ` +
                `below ${String(row.min)}%`,
        );
    }
    return lines;
}

/** Build the complete weekly Markdown report from one evidence/evaluation pair. */
export function renderPackageReport(
    evidence,
    evaluation,
    { modules = true, generatedAt, commit, run } = {},
) {
    const lines = ["# Nightly coverage trend", ""];
    for (const [label, value] of [
        ["Generated", generatedAt],
        ["Commit", commit],
        ["Run", run],
    ]) {
        if (value !== undefined && value !== "") lines.push(`- ${label}: ${cell(value)}`);
    }
    if (lines.length > 2) lines.push("");
    lines.push("## Package coverage", "", ...packageTable(evaluation), "");
    lines.push(...criticalTable(evaluation.critical ?? []), "");
    if (modules) {
        lines.push(
            ...moduleTable("Lowest frontend modules", evidence.frontend.modules(), true),
            "",
            ...moduleTable("Lowest Rust modules", evidence.rust.modules(), false),
            "",
        );
    }
    const failed = evaluation.failures.length > 0 || evaluation.criticalFailures.length > 0;
    lines.push("## Policy", "", `Policy: **${failed ? "failed" : "passed"}**.`, "");
    lines.push(...failureSection(evaluation));
    return `${lines.join("\n").trimEnd()}\n`;
}