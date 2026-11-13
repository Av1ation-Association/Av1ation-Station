#!/usr/bin/env node
/**
 * A deliberately small mutation-testing pilot.
 *
 * It applies one explicitly curated source edit at a time, runs that target's
 * focused tests, and restores the source before the next edit. There is no
 * dependency to install and no parallel execution: the working tree is mutated
 * only between the checks and is always restored in a finally block.
 *
 * Usage:
 *   node scripts/mutation-pilot.mjs
 *   node scripts/mutation-pilot.mjs --target scene-selection
 *   node scripts/mutation-pilot.mjs --validate
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, "scripts/mutation-pilot.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate");
const targetFilter = valueAfter("--target");
const timeoutMs = Number(valueAfter("--timeout-ms") ?? 240_000);

const targets = targetFilter
    ? config.targets.filter((target) => target.id === targetFilter)
    : config.targets;

if (targets.length === 0) {
    console.error(`No target named ${targetFilter}`);
    process.exit(2);
}

let active = null;

function restore() {
    if (active === null) return;
    writeFileSync(active.path, active.source);
    active = null;
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
        restore();
        process.exit(130);
    });
}

function valueAfter(flag) {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
}

function occurrences(haystack, needle) {
    let count = 0;
    let from = 0;
    while (true) {
        const index = haystack.indexOf(needle, from);
        if (index === -1) return count;
        count += 1;
        from = index + needle.length;
    }
}

function verifyMutants() {
    let invalid = false;
    for (const target of targets) {
        const path = resolve(root, target.file);
        const source = readFileSync(path, "utf8");
        for (const mutant of target.mutants) {
            const count = occurrences(source, mutant.find);
            if (count !== 1) {
                invalid = true;
                console.error(
                    `${target.id}/${mutant.id}: source match occurs ${count} times (expected once)`,
                );
            } else if (mutant.find === mutant.replace) {
                invalid = true;
                console.error(`${target.id}/${mutant.id}: replacement is identical`);
            }
        }
    }
    return !invalid;
}

function runTests(target) {
    const result = spawnSync(process.execPath, target.test.args, {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        maxBuffer: 64 * 1024 * 1024,
        timeout: timeoutMs,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.error?.code === "ETIMEDOUT") {
        return { status: 124, output: `${output}\n[timed out after ${timeoutMs}ms]` };
    }
    if (result.error) {
        return { status: 125, output: `${output}\n[${result.error.message}]` };
    }
    return { status: result.status ?? 1, output };
}

function tail(text, lines = 12) {
    return text.trimEnd().split(/\r?\n/).slice(-lines).join("\n");
}

if (!verifyMutants()) {
    console.error("Mutation pilot configuration is invalid; no source was changed.");
    process.exit(2);
}

if (validateOnly) {
    const total = targets.reduce((sum, target) => sum + target.mutants.length, 0);
    console.log(`Validated ${total} mutants across ${targets.length} targets.`);
    process.exit(0);
}

const startedAt = Date.now();
const results = [];

for (const target of targets) {
    const path = resolve(root, target.file);
    const source = readFileSync(path, "utf8");
    console.log(`\n${target.label} (${target.mutants.length} mutants)`);

    // A failing baseline would make every mutant look killed.
    const baseline = runTests(target);
    if (baseline.status !== 0) {
        console.error(`${target.id}: baseline tests failed; no mutants were run.`);
        console.error(tail(baseline.output));
        process.exit(2);
    }
    console.log("  baseline passed");

    for (const mutant of target.mutants) {
        const mutated = source.replace(mutant.find, mutant.replace);
        const mutantPath = path;
        active = { path: mutantPath, source };
        const began = Date.now();
        let outcome;
        try {
            writeFileSync(mutantPath, mutated);
            outcome = runTests(target);
        } finally {
            restore();
        }
        const elapsed = Date.now() - began;
        const killed = outcome.status !== 0;
        results.push({
            target: target.id,
            id: mutant.id,
            description: mutant.description,
            file: target.file,
            killed,
            status: outcome.status,
            elapsedMs: elapsed,
        });
        const label = killed
            ? outcome.status === 124
                ? "KILLED (timeout)"
                : "killed"
            : "SURVIVED";
        console.log(`  ${label.padEnd(15)} ${mutant.id} (${elapsed}ms)`);
        if (!killed) {
            console.log(`    ${mutant.description}`);
        } else if (outcome.status === 125) {
            console.log(`    runner error: ${tail(outcome.output, 4)}`);
        }
    }
}

const killed = results.filter((result) => result.killed).length;
const survived = results.length - killed;
const score = ((killed / results.length) * 100).toFixed(2);
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

console.log(`\nMutation score: ${killed}/${results.length} killed (${score}%) in ${elapsed}s`);
if (survived === 0) {
    console.log("No surviving mutants.");
} else {
    console.log("\nSurviving mutants:");
    for (const result of results.filter((entry) => !entry.killed)) {
        console.log(`- ${result.file} :: ${result.target}/${result.id}`);
        console.log(`  ${result.description}`);
    }
}

process.exitCode = survived === 0 ? 0 : 1;
