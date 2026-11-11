//! Reject retired flat service module paths and keep `docs/service.md` equal to the tree.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serviceRoot = path.join(root, "rust/crates/service");
const sourceRoot = path.join(serviceRoot, "src");
const docsRoot = path.join(root, "docs");
const serviceDoc = path.join(docsRoot, "service.md");

/** Modules that lived directly under `src/` before the feature-domain grouping. */
const RETIRED_MODULES = [
    "anonymise",
    "atomic",
    "config",
    "derive",
    "descriptors",
    "diagnostics",
    "disk",
    "error",
    "forks",
    "hash",
    "logs",
    "lan",
    "logging",
    "lsp",
    "lsp_bundle",
    "preflight",
    "projects",
    "retention",
    "routes",
    "runs",
    "scenes",
    "script_data",
    "scripts",
    "settings",
    "static_files",
    "storage",
    "stream",
    "thumbnails",
    "timeline",
    "toolchain",
    "vapoursynth",
    "videos",
];

/** Files that became directories when their contents were split along domain seams. */
const RETIRED_PATHS = [
    ...RETIRED_MODULES.map((name) => `${name}.rs`),
    "routes/video.rs",
    "api/routes/video.rs",
    "media/media.rs",
    "media/stream.rs",
    "project/derive.rs",
    "project/projects.rs",
    "project/videos.rs",
    "run/runs.rs",
    "capability/descriptors.rs",
    "capability/forks.rs",
    "capability/preflight.rs",
];

const failures = [];

function fail(message) {
    failures.push(message);
}

function walk(directory, prefix = "") {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...walk(path.join(directory, entry.name), relative));
        } else {
            files.push(relative);
        }
    }
    return files;
}

const actual = walk(sourceRoot)
    .filter((file) => file.endsWith(".rs") && !file.startsWith("bin/"))
    .sort();

for (const file of actual) {
    if (!file.includes("/") && file !== "lib.rs" && file !== "state.rs") {
        fail(`service source root contains ${file}; only lib.rs and state.rs may live there`);
    }
}

const doc = fs.readFileSync(serviceDoc, "utf8");
const block = [...doc.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .find((text) => text.includes("rust/crates/service/src/"));

if (!block) {
    fail("docs/service.md has no fenced tree rooted at rust/crates/service/src/");
} else {
    const documented = new Set();
    const directories = [""];
    for (const line of block.split("\n")) {
        const match = /^((?:│   |    )*)(?:├── |└── )(.+)$/.exec(line);
        if (!match) continue;
        const depth = match[1].length / 4;
        const name = match[2].trim().split(/\s+/)[0];
        const isDirectory = name.endsWith("/");
        const entry = isDirectory ? name.slice(0, -1) : name;
        const parent = depth === 0 ? "" : directories[depth - 1];
        if (parent === undefined) {
            fail(`docs/service.md tree has an invalid indentation at: ${line}`);
            continue;
        }
        const full = parent ? `${parent}/${entry}` : entry;
        if (isDirectory) {
            directories[depth] = full;
            directories.length = depth + 1;
        } else if (full.endsWith(".rs")) {
            documented.add(full);
        }
    }

    for (const file of actual) {
        if (!documented.has(file)) fail(`docs/service.md does not list ${file}`);
    }
    for (const file of documented) {
        if (!actual.includes(file)) fail(`docs/service.md lists missing file ${file}`);
    }
}

function collect(directory, suffix) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collect(full, suffix));
        } else if (entry.name.endsWith(suffix)) {
            files.push(full);
        }
    }
    return files;
}

// Only the service crate's source paths are retired; a contracts module is not one.
const retiredPath = new RegExp(
    `(?:^|[/\\s\`"'(])(?:rust/crates/)?service/src/(?:${RETIRED_PATHS.map((entry) =>
        entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("|")})\\b`,
);
const retiredUse = new RegExp(`\\bcrate::(?:${RETIRED_MODULES.join("|")})\\b`);

const scanned = [
    ...collect(serviceRoot, ".rs"),
    ...collect(docsRoot, ".md").filter((file) => !file.endsWith(`${path.sep}progress.md`)),
    path.join(root, "rust/README.md"),
];

for (const file of scanned) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const text = fs.readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
        if (retiredPath.test(line)) {
            fail(`${relative}:${index + 1}: retired service path; use the feature-domain path`);
        }
        if (file.endsWith(".rs") && retiredUse.test(line)) {
            fail(
                `${relative}:${index + 1}: retired crate module path; use the feature-domain path`,
            );
        }
    });
}

if (failures.length > 0) {
    console.error("service module check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`service module check passed: ${actual.length} source files, docs tree in sync`);
