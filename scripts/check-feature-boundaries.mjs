//! Enforce the UI feature graph declared in docs/frontend.md §1.1.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiRoot = path.join(root, "packages/ui/src");
const featureRoot = path.join(uiRoot, "features");
const frontendDoc = path.join(root, "docs/frontend.md");
const failures = [];

function fail(message) {
    failures.push(message);
}

function featureDirectories() {
    if (!fs.existsSync(featureRoot)) {
        fail("packages/ui/src/features is missing");
        return [];
    }
    return fs
        .readdirSync(featureRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

function readGraph() {
    const text = fs.readFileSync(frontendDoc, "utf8");
    const heading = /^### 1\.1 Feature graph\s*$/mu.exec(text);
    if (heading === null) {
        fail("docs/frontend.md is missing the '### 1.1 Feature graph' section");
        return new Map();
    }

    const rest = text.slice(heading.index + heading[0].length);
    const nextHeading = /^#{2,3} /mu.exec(rest);
    const section = nextHeading === null ? rest : rest.slice(0, nextHeading.index);
    const table = section
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("|"));

    if (table.length < 3) {
        fail("docs/frontend.md §1.1 has no feature table");
        return new Map();
    }

    const graph = new Map();
    for (const line of table.slice(2)) {
        const cells = line
            .replace(/^\||\|$/gu, "")
            .split("|")
            .map((cell) => cell.trim());
        if (cells.length < 2) {
            fail(`docs/frontend.md §1.1 has a malformed row: ${line}`);
            continue;
        }

        const from = /^`([a-z0-9-]+)`$/u.exec(cells[0])?.[1];
        if (from === undefined) {
            fail(`docs/frontend.md §1.1 has a malformed feature cell: ${cells[0]}`);
            continue;
        }

        const targetCell = cells[1];
        const targets = [...targetCell.matchAll(/`([a-z0-9-]+)`/gu)].map((match) => match[1]);
        const residue = targetCell.replace(/`[a-z0-9-]+`/gu, "").replace(/[\s,;—–-]/gu, "");
        if (residue.length > 0) {
            fail(`docs/frontend.md §1.1 has unexpected text in ${from}'s imports: ${targetCell}`);
            continue;
        }
        if (graph.has(from)) {
            fail(`docs/frontend.md §1.1 lists ${from} more than once`);
            continue;
        }
        graph.set(from, targets);
    }
    return graph;
}

function validateGraph(graph, directories) {
    const known = new Set(directories);
    for (const directory of directories) {
        if (!graph.has(directory)) {
            fail(`docs/frontend.md §1.1 does not list the ${directory} feature`);
        }
    }
    for (const [from, targets] of graph) {
        if (!known.has(from)) {
            fail(`docs/frontend.md §1.1 lists unknown feature ${from}`);
        }
        const unique = new Set(targets);
        if (unique.size !== targets.length) {
            fail(`docs/frontend.md §1.1 lists a duplicate import for ${from}`);
        }
        for (const target of targets) {
            if (!known.has(target)) {
                fail(`docs/frontend.md §1.1 lists unknown feature ${target} under ${from}`);
            } else if (target === from) {
                fail(`docs/frontend.md §1.1 makes ${from} import itself`);
            }
        }
    }

    const state = new Map();
    const stack = [];
    const visit = (node) => {
        state.set(node, 1);
        stack.push(node);
        for (const target of graph.get(node) ?? []) {
            if (!known.has(target) || target === node) {
                continue;
            }
            if (state.get(target) === 1) {
                const start = stack.indexOf(target);
                fail(
                    `docs/frontend.md §1.1 declares a cycle: ${[...stack.slice(start), target].join(" -> ")}`,
                );
            } else if (!state.has(target)) {
                visit(target);
            }
        }
        stack.pop();
        state.set(node, 2);
    };
    for (const node of graph.keys()) {
        if (!state.has(node)) {
            visit(node);
        }
    }
}

function walk(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walk(full));
        } else if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name)) {
            files.push(full);
        }
    }
    return files;
}

function relativeToUi(file) {
    return path.relative(uiRoot, file).split(path.sep).join("/");
}

function categoryOf(file) {
    const relative = relativeToUi(file);
    if (!relative.includes("/") || relative.startsWith("app/")) {
        return { kind: "app", name: "app" };
    }
    if (relative.startsWith("shared/")) {
        return { kind: "shared", name: "shared" };
    }
    if (relative.startsWith("features/")) {
        const name = relative.split("/")[1];
        if (name !== undefined) {
            return { kind: "feature", name };
        }
    }
    return null;
}

const assetExtension =
    /\.(?:css|json|jsonc|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|wasm|txt|md|py|pyi|vpy|mp4|webm|mkv|y4m|onnx)$/iu;

function resolveImport(from, specifier) {
    const clean = specifier.split("?")[0].split("#")[0];
    if (assetExtension.test(clean)) {
        return null;
    }
    const base = path.resolve(path.dirname(from), clean);
    const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.d.ts`,
        `${base}.js`,
        `${base}.jsx`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
    ];
    return candidates.find(
        (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
}

function importsIn(file) {
    const text = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const imports = [];
    const add = (node, specifier) => {
        if (!specifier.startsWith(".")) {
            return;
        }
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        imports.push({ specifier, line });
    };

    const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            add(node, node.moduleSpecifier.text);
        } else if (
            ts.isExportDeclaration(node) &&
            node.moduleSpecifier !== undefined &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            add(node, node.moduleSpecifier.text);
        } else if (
            ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference) &&
            node.moduleReference.expression !== undefined &&
            ts.isStringLiteral(node.moduleReference.expression)
        ) {
            add(node, node.moduleReference.expression.text);
        } else if (ts.isCallExpression(node)) {
            if (
                node.expression.kind === ts.SyntaxKind.ImportKeyword &&
                node.arguments.length > 0 &&
                ts.isStringLiteral(node.arguments[0])
            ) {
                add(node, node.arguments[0].text);
            } else if (
                ts.isPropertyAccessExpression(node.expression) &&
                ts.isIdentifier(node.expression.expression) &&
                node.expression.expression.text === "vi" &&
                node.expression.name.text === "mock" &&
                node.arguments.length > 0 &&
                ts.isStringLiteral(node.arguments[0])
            ) {
                add(node, node.arguments[0].text);
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(source);
    return imports;
}

const directories = featureDirectories();
const graph = readGraph();
if (failures.length === 0) {
    validateGraph(graph, directories);
}
if (failures.length > 0) {
    console.error("feature boundary check failed:");
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

const files = walk(uiRoot).sort();
let importCount = 0;
for (const file of files) {
    const source = categoryOf(file);
    if (source === null) {
        continue;
    }
    const relativeFile = relativeToUi(file);
    for (const { specifier, line } of importsIn(file)) {
        importCount += 1;
        const target = resolveImport(file, specifier);
        if (target === null) {
            continue;
        }
        if (target === undefined) {
            fail(`${relativeFile}:${line}: cannot resolve relative import ${specifier}`);
            continue;
        }
        const relativeTarget = path.relative(uiRoot, target);
        if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
            fail(`${relativeFile}:${line}: relative import ${specifier} leaves packages/ui/src`);
            continue;
        }

        const destination = categoryOf(target);
        if (destination === null) {
            fail(`${relativeFile}:${line}: cannot classify ${specifier}`);
            continue;
        }
        if (source.kind === "app") {
            continue;
        }
        if (source.kind === "shared") {
            if (destination.kind !== "shared") {
                fail(
                    `${relativeFile}:${line}: shared -> ${destination.kind} is not allowed (${specifier})`,
                );
            }
            continue;
        }
        if (destination.kind === "shared" || destination.name === source.name) {
            continue;
        }
        if (destination.kind === "app") {
            fail(`${relativeFile}:${line}: ${source.name} -> app is not allowed (${specifier})`);
            continue;
        }
        if (!(graph.get(source.name) ?? []).includes(destination.name)) {
            fail(
                `${relativeFile}:${line}: ${source.name} -> ${destination.name} is not declared in docs/frontend.md §1.1 (${specifier})`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("feature boundary check failed:");
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

const edgeCount = [...graph.values()].reduce((total, targets) => total + targets.length, 0);
console.log(
    `feature boundary check passed: ${directories.length} features, ${edgeCount} declared edges, ${files.length} source files (${importCount} relative imports)`,
);
