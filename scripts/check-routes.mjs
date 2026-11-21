//! Enforce the route manifest boundary: owners, the axum registration seam, client
//! literals, and docs prose.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serviceRoot = path.join(root, "rust", "crates", "service", "src");
const apiRoot = path.join(root, "packages", "api", "src");
const docsPaths = [path.join(root, "docs", "backend.md"), path.join(root, "docs", "api.md")];
const failures = [];

function fail(message) {
    failures.push(message);
}

function walk(directory, extension) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walk(full, extension));
        else if (entry.isFile() && entry.name.endsWith(extension)) files.push(full);
    }
    return files;
}

function lineAt(text, offset) {
    return text.slice(0, offset).split("\n").length;
}

const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "schema", "routes", "manifest.json"), "utf8"),
);
if (!Array.isArray(manifest.routes)) fail("schema/routes/manifest.json has no routes array");

// An owner names the module that defines the handler. The checker resolves the Rust
// module to its source file and requires the named function there.
for (const route of manifest.routes) {
    for (const method of route.methods) {
        const relative = method.owner
            .replace(/^api::routes::/u, "api/routes/")
            .replaceAll("::", "/");
        const candidates = [
            path.join(serviceRoot, `${relative}.rs`),
            path.join(serviceRoot, relative, "mod.rs"),
        ];
        const file = candidates.find((candidate) => fs.existsSync(candidate));
        if (file === undefined) {
            fail(`${route.path} ${method.method}: owner module ${method.owner} has no source file`);
            continue;
        }
        const handler = method.handler.split("::").pop();
        const text = fs.readFileSync(file, "utf8");
        const pattern = new RegExp(`\\bfn\\s+${handler}\\s*\\(`, "u");
        if (!pattern.test(text)) {
            fail(`${route.path} ${method.method}: ${method.owner} does not define ${handler}`);
        }
    }
}

// The manifest macro owns the only `.route(` call in the service.
const manifestRoute = path.join(serviceRoot, "api", "routes", "manifest.rs");
for (const file of walk(serviceRoot, ".rs")) {
    if (file === manifestRoute) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/\.route\(/gu)) {
        fail(
            `${path.relative(root, file)}:${lineAt(text, match.index)}: .route() belongs in api/routes/manifest.rs`,
        );
    }
}

// Production client code may not spell a route. The generated module, the barrel, tests,
// and the hand-written mock are the only exceptions.
const clientFiles = [
    ...walk(apiRoot, ".ts"),
    path.join(apiRoot, "thumbnails.ts"),
    path.join(apiRoot, "transport", "http.ts"),
];
for (const file of clientFiles) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    if (
        relative.endsWith("api/generated/paths.ts") ||
        relative.endsWith("api/paths.ts") ||
        relative.includes("/transport/mock") ||
        relative.endsWith(".test.ts") ||
        relative.endsWith(".test.tsx")
    ) {
        continue;
    }
    const text = fs.readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        // Only a string or template literal beginning with `/api/` is a route literal;
        // `./api/paths` and `../api/paths` are module specifiers.
        if (/(?:["'`])\/api\//u.test(line)) {
            fail(`${relative}:${index + 1}: hard-coded /api path; use a generated builder`);
        }
    });
}

// Docs prose must agree with the route table. The generated table itself is skipped.
const byPath = new Map();
for (const route of manifest.routes) {
    const normalized = route.path.replace(/\{[^}]+\}/gu, "{}");
    byPath.set(normalized, new Set(route.methods.map((method) => method.method)));
}
const tokenPattern = /\/api\/[A-Za-z0-9_./{}:-]+/gu;
for (const docsPath of docsPaths) {
    const label = path.relative(root, docsPath).split(path.sep).join("/");
    const docs = fs.readFileSync(docsPath, "utf8");
    const withoutTable = docs.replace(/<!-- routes:start -->[\s\S]*?<!-- routes:end -->/u, "");
    withoutTable.split("\n").forEach((line, index) => {
        for (const match of line.matchAll(tokenPattern)) {
            let token = match[0].replace(/[.,;:)\]}]+$/u, "");
            if (token.includes("?")) token = token.slice(0, token.indexOf("?"));
            // A source-file path such as `/api/json.rs` is not a route.
            if (token.split("/").pop()?.includes(".") === true) continue;
            const normalized = token
                .replace(/:([A-Za-z_][A-Za-z0-9_]*)/gu, "{}")
                .replace(/\{[^}]+\}/gu, "{}");
            const methods = byPath.get(normalized);
            if (methods === undefined) {
                fail(`${label}:${index + 1}: ${token} is not in the route manifest`);
                continue;
            }
            const before = line.slice(0, match.index);
            const method = [...before.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\b/gu)].at(
                -1,
            )?.[1];
            if (method !== undefined && !methods.has(method)) {
                fail(`${label}:${index + 1}: ${method} ${token} is not in the route manifest`);
            }
        }
    });
}

if (failures.length > 0) {
    console.error("route check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`route check passed: ${manifest.routes.length} paths and owners agree`);
