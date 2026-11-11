//! Reject raw JSON body extractors outside `api/json.rs`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "rust/crates/service/src");
const boundary = "api/json.rs";
const failures = [];

function walk(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walk(full));
        } else if (entry.isFile() && entry.name.endsWith(".rs")) {
            files.push(full);
        }
    }
    return files;
}

/** The 1-based line number of an offset. */
function lineAt(text, offset) {
    return text.slice(0, offset).split("\n").length;
}

/** The index just past the `)` matching the `(` at `open`. */
function matchingParen(text, open) {
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
        if (text[index] === "(") {
            depth += 1;
        } else if (text[index] === ")") {
            depth -= 1;
            if (depth === 0) {
                return index + 1;
            }
        }
    }
    return text.length;
}

// Rustfmt starts every function signature on its own line. Matching only there keeps a
// mention inside a comment or a string out of the check.
const functionStart = /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?(?:async[ \t]+)?fn[ \t]+/gmu;

const files = walk(sourceRoot);

for (const file of files) {
    const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
    if (relative === boundary) {
        continue;
    }
    const text = fs.readFileSync(file, "utf8");

    for (const match of text.matchAll(/\bJsonRejection\b/gu)) {
        failures.push(
            `${relative}:${lineAt(text, match.index)}: JsonRejection belongs in ${boundary}; take ApiJson<T>`,
        );
    }

    for (const match of text.matchAll(functionStart)) {
        const open = text.indexOf("(", match.index + match[0].length);
        if (open === -1) {
            continue;
        }
        const close = matchingParen(text, open);
        const parameters = text.slice(open, close);
        const raw = /\bJson\s*</u.exec(parameters);
        if (raw !== null) {
            failures.push(
                `${relative}:${lineAt(text, open + raw.index)}: raw Json<T> extractor; take ApiJson<T>`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("API JSON check failed:");
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

console.log(`API JSON check passed: ${files.length} source files, no raw body extractors`);
