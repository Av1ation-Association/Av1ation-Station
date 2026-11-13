// Generate test counts from the runners, not from prose.
//
// `testing.md` used to carry hand-maintained counts and wall times. This script asks Vitest
// and Playwright for their own JSON inventory, writes the raw reports under dist/, and emits
// a small reviewable Markdown summary. It never runs the browser suite; `playwright test
// --list` only parses and lists the specs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { webCoverageDir } from "./build-paths.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputDir = join(root, "dist", "test-inventory");
const docsPath = join(root, "docs", "test-inventory.md");
const coverageReportPath = join(webCoverageDir, "vitest.json");
const inventoryReportPath = join(outputDir, "vitest.json");
const args = new Set(process.argv.slice(2));
const webOnly = args.has("--web-only");
const e2eOnly = args.has("--e2e-only");
const rerun = args.has("--rerun");

function runNode(script, scriptArgs, label, options = {}) {
    const result = spawnSync(process.execPath, [join(root, script), ...scriptArgs], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
        ...options,
    });
    if (result.status !== 0) {
        const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
        throw new Error(`${label} failed with exit ${String(result.status)}:\n${detail}`);
    }
    return result.stdout;
}

function normalized(path) {
    return (isAbsolute(path) ? relative(root, path) : path).replaceAll("\\", "/");
}

function areaOf(path) {
    if (path.startsWith("packages/api/")) return "API";
    if (path.startsWith("packages/ui/")) return "UI";
    if (path.startsWith("scripts/")) return "Scripts";
    return "Other";
}

function webInventory() {
    const reportPath = rerun ? inventoryReportPath : coverageReportPath;
    if (rerun) {
        runNode(
            "node_modules/vitest/vitest.mjs",
            ["run", "--reporter=json", `--outputFile=${reportPath}`],
            "Vitest inventory run",
        );
    } else if (!existsSync(reportPath)) {
        throw new Error(
            `Missing coverage test results: ${normalized(reportPath)}. ` +
                "Run npm run test:web:coverage first, or pass --rerun to run the suite.",
        );
    }
    const raw = readFileSync(reportPath, "utf8");
    const report = JSON.parse(raw);
    if (!rerun) {
        // Keep the raw report with the generated inventory. The coverage artifact is the
        // source of truth, but this copy makes the inventory directory self-contained.
        writeFileSync(inventoryReportPath, raw, "utf8");
    }
    const files = (report.testResults ?? []).map((file) => ({
        file: normalized(file.name),
        tests: file.assertionResults?.length ?? 0,
        status: file.status ?? "unknown",
    }));
    const byArea = new Map();
    for (const file of files) {
        const area = areaOf(file.file);
        const entry = byArea.get(area) ?? { tests: 0, files: 0 };
        entry.tests += file.tests;
        entry.files += 1;
        byArea.set(area, entry);
    }
    const tests = files.reduce((sum, file) => sum + file.tests, 0);
    const failed = (report.testResults ?? []).reduce(
        (sum, file) =>
            sum + (file.assertionResults ?? []).filter((test) => test.status === "failed").length,
        0,
    );
    return {
        command: rerun ? "npm run test:web -- --reporter=json" : "npm run test:web:coverage",
        tests,
        files: files.length,
        failed,
        byArea: [...byArea.entries()].sort(([left], [right]) => left.localeCompare(right)),
        detail: files,
    };
}

/** Flatten Playwright's list JSON, whose suite nodes nest files and describe blocks. */
function flattenPlaywright(node, file, into) {
    const currentFile = node.file ?? file;
    for (const spec of node.specs ?? []) {
        into.push({
            file: currentFile ?? "unknown",
            title: [node.title, spec.title].filter(Boolean).join(" › "),
        });
    }
    for (const suite of node.suites ?? []) {
        flattenPlaywright(suite, currentFile, into);
    }
}

function e2eInventory() {
    const stdout = runNode(
        "node_modules/@playwright/test/cli.js",
        ["test", "--list", "--reporter=json"],
        "Playwright inventory list",
    );
    const report = JSON.parse(stdout);
    const specs = [];
    for (const suite of report.suites ?? []) {
        flattenPlaywright(suite, undefined, specs);
    }
    for (const spec of specs) {
        spec.file = normalized(join(root, "e2e", spec.file));
    }
    const files = [...new Set(specs.map((spec) => spec.file))].sort();
    return {
        command: "npm run test:e2e:run -- --list",
        tests: specs.length,
        files: files.length,
        specs,
    };
}

function table(rows, headers) {
    return [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
}

function render(web, e2e) {
    const lines = [
        "# Test inventory",
        "",
        "> Generated by `npm run test:inventory`; do not edit by hand.",
        "",
        `Generated ${new Date().toISOString()}. The raw runner reports are in \`dist/test-inventory/\`.`,
        "",
    ];
    if (web !== null) {
        lines.push(
            "## Frontend (Vitest)",
            "",
            `\`${web.command}\` listed **${String(web.tests)} tests** in **${String(web.files)} files**; ${String(web.failed)} failed during generation.`,
            "",
            table(
                web.byArea.map(([area, entry]) => [area, String(entry.tests), String(entry.files)]),
                ["Area", "Tests", "Files"],
            ),
            "",
            "### Files",
            "",
            table(
                web.detail.map((file) => [file.file, String(file.tests), file.status]),
                ["File", "Tests", "Status"],
            ),
            "",
        );
    }
    if (e2e !== null) {
        lines.push(
            "## Browser journeys (Playwright)",
            "",
            `\`${e2e.command}\` listed **${String(e2e.tests)} tests** in **${String(e2e.files)} files** (listing only; none were run).`,
            "",
            table(
                e2e.specs.map((spec) => [spec.file, spec.title.replaceAll("|", "\\|")]),
                ["File", "Test"],
            ),
            "",
        );
    }
    lines.push(
        "## Interpretation",
        "",
        "These are collected tests, not a pass result. Use `npm run verify` for the local",
        "aggregate and the coverage policy, and the CI run for the recorded result.",
        "",
    );
    return lines.join("\n");
}

mkdirSync(outputDir, { recursive: true });
const web = webOnly || e2eOnly ? (webOnly ? webInventory() : null) : webInventory();
const e2e = e2eOnly || webOnly ? (e2eOnly ? e2eInventory() : null) : e2eInventory();
writeFileSync(
    join(outputDir, "summary.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), web, e2e }, null, 2)}\n`,
    "utf8",
);
writeFileSync(docsPath, render(web, e2e), "utf8");
const webText = web === null ? "" : `${String(web.tests)} web tests in ${String(web.files)} files`;
const e2eText =
    e2e === null ? "" : `${String(e2e.tests)} browser tests in ${String(e2e.files)} files`;
console.log(
    `test inventory written to ${normalized(docsPath)}: ${[webText, e2eText].filter(Boolean).join("; ")}`,
);
