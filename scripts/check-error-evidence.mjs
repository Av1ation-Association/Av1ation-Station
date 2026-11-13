// The error matrix is a release claim, so every row names executable evidence or a dated
// manual check. This keeps the table in docs/testing.md generated from the registry and
// fails when a referenced test or file disappears.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
const registryPath = join(root, "docs", "error-evidence.json");
const docsPath = join(root, "docs", "testing.md");
const write = process.argv.includes("--write");
const failures = [];

function fail(message) {
    failures.push(message);
}

function escapeCell(value) {
    return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function evidenceCell(evidence, row) {
    if (evidence?.kind === "test") {
        const refs = Array.isArray(evidence.refs) ? evidence.refs : [];
        if (refs.length === 0) {
            fail(`row ${row.id}: a test evidence row needs at least one ref`);
            return "";
        }
        return refs
            .map((ref) => {
                const file = typeof ref.file === "string" ? ref.file.trim() : "";
                const contains = typeof ref.contains === "string" ? ref.contains.trim() : "";
                if (file === "" || contains === "") {
                    fail(`row ${row.id}: every test ref needs file and contains`);
                    return "";
                }
                const path = join(root, file);
                if (!existsSync(path)) {
                    fail(`row ${row.id}: ${file} does not exist`);
                    return "";
                }
                const source = readFileSync(path, "utf8");
                if (!source.includes(contains)) {
                    fail(`row ${row.id}: ${file} does not contain ${JSON.stringify(contains)}`);
                }
                return `\`${file}::${contains}\``;
            })
            .filter(Boolean)
            .join("; ");
    }
    if (evidence?.kind === "manual") {
        for (const field of ["check", "date", "result"]) {
            if (typeof evidence[field] !== "string" || evidence[field].trim() === "") {
                fail(`row ${row.id}: a manual evidence row needs ${field}`);
            }
        }
        if (evidence.result !== "pass") {
            fail(`row ${row.id}: manual release check is ${String(evidence.result)}, not pass`);
        }
        return `Manual release check · ${escapeCell(evidence.date)}: ${escapeCell(evidence.check)}`;
    }
    fail(`row ${row.id}: evidence.kind must be "test" or "manual"`);
    return "";
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
if (!Array.isArray(registry.rows) || registry.rows.length === 0) {
    throw new Error("docs/error-evidence.json has no rows");
}
const ids = new Set();
const rows = registry.rows.map((row) => {
    const id = Number(row.id);
    if (!Number.isInteger(id) || id < 1) fail(`invalid row id ${JSON.stringify(row.id)}`);
    if (ids.has(id)) fail(`duplicate row id ${String(id)}`);
    ids.add(id);
    if (typeof row.failure !== "string" || row.failure.trim() === "") {
        fail(`row ${String(id)}: failure is empty`);
    }
    if (typeof row.behaviour !== "string" || row.behaviour.trim() === "") {
        fail(`row ${String(id)}: behaviour is empty`);
    }
    return {
        ...row,
        evidenceText: evidenceCell(row.evidence, { ...row, id }),
    };
});

const table = [
    "| # | Failure | Behaviour | Evidence |",
    "| --- | --- | --- | --- |",
    ...rows
        .sort((left, right) => left.id - right.id)
        .map(
            (row) =>
                `| ${String(row.id)} | ${escapeCell(row.failure)} | ${escapeCell(row.behaviour)} | ${row.evidenceText} |`,
        ),
].join("\n");

const docs = readFileSync(docsPath, "utf8");
const start = "<!-- error-evidence:start -->";
const end = "<!-- error-evidence:end -->";
const startAt = docs.indexOf(start);
const endAt = docs.indexOf(end);
if (startAt === -1 || endAt === -1 || endAt < startAt) {
    throw new Error("docs/testing.md needs error-evidence start and end markers");
}
const replaced = `${docs.slice(0, startAt + start.length)}\n${table}\n${docs.slice(endAt)}`;
const options = (await prettier.resolveConfig(docsPath)) ?? {};
const formatted = await prettier.format(replaced, { ...options, parser: "markdown" });

if (failures.length > 0) {
    console.error("error-evidence check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

if (write) {
    writeFileSync(docsPath, formatted, "utf8");
    console.log(`wrote ${rows.length} error-evidence rows to docs/testing.md`);
} else if (formatted !== docs) {
    console.error("docs/testing.md error table is out of date; run npm run evidence:generate");
    process.exit(1);
} else {
    console.log(`error-evidence check passed: ${rows.length} rows`);
}
