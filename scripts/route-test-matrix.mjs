// Generate the route-method × test matrix from the Rust route manifest.
//
// A new route is registered in Rust and reviewed for its status surface. This script reads
// the integration tests, follows the small test helpers they call, and records which test
// bodies name each method's path and which status categories they assert. The reviewed
// requirements in `route-test-requirements.mjs` are the applicability policy: a method must
// exercise every required family, not merely have one matching test. A missing test, a
// missing required category, or an unreviewed route method fails the policy.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { ROUTE_TEST_REQUIREMENTS } from "./route-test-requirements.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const testsRoot = join(root, "rust", "crates", "service", "tests");
const manifestPath = join(root, "schema", "routes", "manifest.json");
const waiversPath = join(root, "scripts", "route-test-waivers.json");
const docsPath = join(root, "docs", "route-test-matrix.md");
const write = process.argv.includes("--write");

const STATUS_CATEGORIES = [
    {
        key: "success",
        label: "success",
        pattern: /StatusCode::(OK|CREATED|ACCEPTED|NO_CONTENT)/gu,
    },
    {
        key: "validation",
        label: "validation",
        pattern: /StatusCode::(BAD_REQUEST|UNPROCESSABLE_ENTITY|INSUFFICIENT_STORAGE)/gu,
    },
    { key: "not-found", label: "not found", pattern: /StatusCode::(NOT_FOUND|GONE)/gu },
    { key: "locked", label: "locked", pattern: /StatusCode::(LOCKED|CONFLICT)/gu },
];
const CATEGORY_KEYS = STATUS_CATEGORIES.map(({ key }) => key);
const LABELS = new Map(STATUS_CATEGORIES.map(({ key, label }) => [key, label]));

function walk(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) files.push(...walk(path));
        else if (path.endsWith(".rs")) files.push(path);
    }
    return files;
}

/** Extract named functions with a balanced body, including the test helpers. */
function functionsIn(source) {
    const functions = new Map();
    // A test can carry doc comments and other attributes between `#[tokio::test]` and its
    // signature. The bounded wildcard keeps the attribute attached to that signature.
    const pattern =
        /(?:#\[(?:tokio::)?test\][\s\S]{0,1000}?)?(?:pub\(crate\)\s+)?(?:async\s+)?fn\s+([a-z_][a-z0-9_]*)\s*[^{]*\{/gu;
    for (const match of source.matchAll(pattern)) {
        const name = match[1];
        const open = (match.index ?? 0) + match[0].length - 1;
        const close = findMatching(source, open, "{", "}");
        if (close < 0) continue;
        if (!functions.has(name)) {
            functions.set(name, {
                body: source.slice(open + 1, close),
                test: /#\[(?:tokio::)?test\]/u.test(match[0]),
                file: "",
            });
        }
    }
    return functions;
}

function literalPaths(body) {
    const paths = [];
    for (const match of body.matchAll(/["'`]([/]api[/][^"'`]*)["'`]/gu)) {
        const path = match[1].split("?")[0].replace(/\{[^}]+\}/gu, "*");
        paths.push(path);
    }
    return paths;
}

function pathMatches(route, literal) {
    const routeParts = route.split("?")[0].split("/");
    const literalParts = literal.split("/");
    if (routeParts.length !== literalParts.length) return false;
    return routeParts.every(
        (part, index) =>
            part === literalParts[index] ||
            part.startsWith("{") ||
            part === "*" ||
            literalParts[index] === "*",
    );
}

function rawStringEnd(source, index) {
    if (source[index] !== "r") return null;
    let cursor = index + 1;
    while (source[cursor] === "#") cursor += 1;
    if (source[cursor] !== '"') return null;
    const close = `"${source.slice(index + 1, cursor)}`;
    const end = source.indexOf(close, cursor + 1);
    return end === -1 ? source.length : end + close.length;
}

function quotedStringEnd(source, index) {
    if (source[index] !== '"') return null;
    for (let cursor = index + 1; cursor < source.length; cursor += 1) {
        if (source[cursor] === "\\") {
            cursor += 1;
            continue;
        }
        if (source[cursor] === '"') return cursor + 1;
    }
    return source.length;
}

function charLiteralEnd(source, index) {
    if (source[index] !== "'") return null;
    if (source[index + 1] === "\\") {
        const end = source.indexOf("'", index + 2);
        return end === -1 ? source.length : end + 1;
    }
    if (source[index + 2] === "'") return index + 3;
    return null;
}

function maskCharacters(characters, start, end) {
    for (let index = start; index < end; index += 1) {
        if (characters[index] !== "\n" && characters[index] !== "\r") {
            characters[index] = " ";
        }
    }
}

function maskStringsAndComments(source) {
    const characters = [...source];
    let index = 0;
    while (index < source.length) {
        const raw = rawStringEnd(source, index);
        if (raw !== null) {
            maskCharacters(characters, index, raw);
            index = raw;
            continue;
        }
        const quoted = quotedStringEnd(source, index);
        if (quoted !== null) {
            maskCharacters(characters, index, quoted);
            index = quoted;
            continue;
        }
        const character = charLiteralEnd(source, index);
        if (character !== null) {
            maskCharacters(characters, index, character);
            index = character;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "/") {
            const newline = source.indexOf("\n", index + 2);
            const end = newline === -1 ? source.length : newline;
            maskCharacters(characters, index, end);
            index = end;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "*") {
            const close = source.indexOf("*/", index + 2);
            const end = close === -1 ? source.length : close + 2;
            maskCharacters(characters, index, end);
            index = end;
            continue;
        }
        index += 1;
    }
    return characters.join("");
}

function maskRanges(source, ranges) {
    const characters = [...source];
    for (const [start, end] of ranges) maskCharacters(characters, start, end);
    return characters.join("");
}

function findMatching(source, openIndex, open, close) {
    let depth = 0;
    for (let index = openIndex; index < source.length;) {
        const raw = rawStringEnd(source, index);
        if (raw !== null) {
            index = raw;
            continue;
        }
        const quoted = quotedStringEnd(source, index);
        if (quoted !== null) {
            index = quoted;
            continue;
        }
        const character = charLiteralEnd(source, index);
        if (character !== null) {
            index = character;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "/") {
            const newline = source.indexOf("\n", index + 2);
            index = newline === -1 ? source.length : newline + 1;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "*") {
            const closing = source.indexOf("*/", index + 2);
            index = closing === -1 ? source.length : closing + 2;
            continue;
        }
        if (source[index] === open) depth += 1;
        if (source[index] === close) {
            depth -= 1;
            if (depth === 0) return index;
        }
        index += 1;
    }
    return -1;
}

function splitTopLevel(source, delimiter = ",") {
    const parts = [];
    let start = 0;
    let round = 0;
    let square = 0;
    let curly = 0;
    for (let index = 0; index < source.length;) {
        const raw = rawStringEnd(source, index);
        if (raw !== null) {
            index = raw;
            continue;
        }
        const quoted = quotedStringEnd(source, index);
        if (quoted !== null) {
            index = quoted;
            continue;
        }
        const character = charLiteralEnd(source, index);
        if (character !== null) {
            index = character;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "/") {
            const newline = source.indexOf("\n", index + 2);
            index = newline === -1 ? source.length : newline + 1;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "*") {
            const closing = source.indexOf("*/", index + 2);
            index = closing === -1 ? source.length : closing + 2;
            continue;
        }
        if (source[index] === "(") round += 1;
        if (source[index] === ")") round -= 1;
        if (source[index] === "[") square += 1;
        if (source[index] === "]") square -= 1;
        if (source[index] === "{") curly += 1;
        if (source[index] === "}") curly -= 1;
        if (source[index] === delimiter && round === 0 && square === 0 && curly === 0) {
            parts.push(source.slice(start, index).trim());
            start = index + 1;
        }
        index += 1;
    }
    const last = source.slice(start).trim();
    if (last.length > 0) parts.push(last);
    return parts;
}

function findStatementEnd(source, start) {
    let round = 0;
    let square = 0;
    let curly = 0;
    for (let index = start; index < source.length;) {
        const raw = rawStringEnd(source, index);
        if (raw !== null) {
            index = raw;
            continue;
        }
        const quoted = quotedStringEnd(source, index);
        if (quoted !== null) {
            index = quoted;
            continue;
        }
        const character = charLiteralEnd(source, index);
        if (character !== null) {
            index = character;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "/") {
            const newline = source.indexOf("\n", index + 2);
            index = newline === -1 ? source.length : newline + 1;
            continue;
        }
        if (source[index] === "/" && source[index + 1] === "*") {
            const closing = source.indexOf("*/", index + 2);
            index = closing === -1 ? source.length : closing + 2;
            continue;
        }
        if (source[index] === "(") round += 1;
        if (source[index] === ")") round -= 1;
        if (source[index] === "[") square += 1;
        if (source[index] === "]") square -= 1;
        if (source[index] === "{") curly += 1;
        if (source[index] === "}") {
            curly -= 1;
            if (curly < 0) return index;
        }
        if (source[index] === ";" && round === 0 && square === 0 && curly === 0) {
            return index;
        }
        index += 1;
    }
    return source.length;
}

function literalHttpMethods(source) {
    return [...source.matchAll(/"(GET|POST|PUT|PATCH|DELETE)"/gu)].map((match) => match[1]);
}

function unique(values) {
    return [...new Set(values)];
}

function loopTable(loop) {
    const elements = splitTopLevel(loop.arrayText, ",");
    const rows = [];
    for (const element of elements) {
        if (!element.startsWith("(")) continue;
        const close = findMatching(element, 0, "(", ")");
        if (close < 0) continue;
        const args = splitTopLevel(element.slice(1, close), ",");
        const methods = unique(literalHttpMethods(args[0] ?? ""));
        const paths = unique(args.flatMap((arg) => literalPaths(arg)));
        if (paths.length > 0) rows.push({ methods, paths, values: args });
    }
    if (rows.length > 0 && rows.length === elements.length) {
        // Names whose every row is an HTTP method identify the method column, so a
        // `match method` binding can be narrowed to the row being sent.
        const methodNames = loop.names.filter((_, index) =>
            rows.every((row) => literalHttpMethods(row.values[index] ?? "").length > 0),
        );
        return {
            rows,
            methodNames,
            methods: unique(rows.flatMap((row) => row.methods)),
            paths: unique(rows.flatMap((row) => row.paths)),
        };
    }
    return {
        rows: [],
        methodNames: [],
        methods: unique(literalHttpMethods(loop.arrayText)),
        paths: unique(literalPaths(loop.arrayText)),
    };
}

function findLoops(body, masked) {
    const loops = [];
    for (const match of masked.matchAll(/\bfor\b/gu)) {
        const afterFor = (match.index ?? 0) + match[0].length;
        const inMatch = /\bin\b/u.exec(masked.slice(afterFor));
        if (inMatch === null) continue;
        const inIndex = afterFor + (inMatch.index ?? 0);
        const pattern = body.slice(afterFor, inIndex).trim();
        const names = pattern.startsWith("(")
            ? splitTopLevel(pattern.slice(1, pattern.lastIndexOf(")")), ",").map(
                  (part) => /(?:mut\s+)?([a-z_][a-z0-9_]*)/u.exec(part)?.[1] ?? "",
              )
            : [/(?:mut\s+)?([a-z_][a-z0-9_]*)/u.exec(pattern)?.[1] ?? ""];
        let expressionStart = inIndex + inMatch[0].length;
        while (/\s/u.test(body[expressionStart] ?? "")) expressionStart += 1;
        let arrayText = "";
        let afterExpression = expressionStart;
        if (body[expressionStart] === "[") {
            const close = findMatching(body, expressionStart, "[", "]");
            if (close < 0) continue;
            arrayText = body.slice(expressionStart + 1, close);
            afterExpression = close + 1;
        }
        const brace = masked.indexOf("{", afterExpression);
        if (brace < 0) continue;
        const closeBrace = findMatching(body, brace, "{", "}");
        if (closeBrace < 0) continue;
        const loop = {
            start: match.index ?? 0,
            end: closeBrace,
            names: names.filter((name) => name.length > 0),
            arrayText,
        };
        loop.table = loopTable(loop);
        loops.push(loop);
    }
    return loops;
}

function findClosures(body, masked) {
    const closures = [];
    for (const match of masked.matchAll(/\blet\s+([a-z_][a-z0-9_]*)\s*=\s*(?:move\s+)?\|/gu)) {
        const open = (match.index ?? 0) + match[0].length - 1;
        const close = masked.indexOf("|", open + 1);
        if (close < 0) continue;
        let bodyStart = close + 1;
        while (/\s/u.test(body[bodyStart] ?? "")) bodyStart += 1;
        let bodyText;
        let end;
        if (body[bodyStart] === "{") {
            const closeBrace = findMatching(body, bodyStart, "{", "}");
            if (closeBrace < 0) continue;
            bodyText = body.slice(bodyStart + 1, closeBrace);
            end = closeBrace + 1;
        } else {
            const statementEnd = findStatementEnd(body, bodyStart);
            bodyText = body.slice(bodyStart, statementEnd);
            end = statementEnd + 1;
        }
        closures.push({
            name: match[1],
            body: bodyText,
            range: [match.index ?? 0, end],
        });
    }
    return closures;
}

function findBindings(body, masked) {
    const bindings = [];
    for (const match of masked.matchAll(/\blet\s+(?:mut\s+)?([a-z_][a-z0-9_]*)\s*=/gu)) {
        let expressionStart = (match.index ?? 0) + match[0].length;
        while (/\s/u.test(body[expressionStart] ?? "")) expressionStart += 1;
        if (/^(?:move\s+)?\|/u.test(body.slice(expressionStart))) continue;
        const end = findStatementEnd(body, expressionStart);
        bindings.push({
            name: match[1],
            start: match.index ?? 0,
            expression: body.slice(expressionStart, end).trim(),
        });
    }
    return bindings;
}

function findSendEvents(body, masked) {
    const events = [];
    const pattern = /(?:^|[^.\w])send\s*\(|\.oneshot\s*\(/gu;
    for (const match of masked.matchAll(pattern)) {
        const text = match[0];
        const start = (match.index ?? 0) + (text.includes("send") ? text.indexOf("send") : 0);
        const open = body.indexOf("(", start);
        if (open < 0) continue;
        const close = findMatching(body, open, "(", ")");
        if (close < 0) continue;
        const args = splitTopLevel(body.slice(open + 1, close), ",");
        const send = text.includes("send");
        events.push({
            start,
            end: close + 1,
            argument: args[send ? 1 : 0] ?? "",
        });
    }
    return events;
}

function loopAt(loops, position) {
    return loops
        .filter((loop) => loop.start <= position && position <= loop.end)
        .sort((left, right) => left.end - left.start - (right.end - right.start))[0];
}

function mentionsName(expression, name) {
    return new RegExp("\\b" + name + "\\b", "u").test(expression);
}

function mentionsLoop(expression, loop) {
    return (
        loop !== undefined &&
        loop.names.some((name) => new RegExp("\\b" + name + "\\b", "u").test(expression))
    );
}

function bareIdentifier(expression) {
    return /^&?\s*([a-z_][a-z0-9_]*)$/u.exec(expression.trim())?.[1];
}

function leadingIdentifier(expression) {
    return /^&?\s*([a-z_][a-z0-9_]*)\s*(?:\.|$)/u.exec(expression.trim())?.[1];
}

function categoriesIn(source) {
    return new Set(
        STATUS_CATEGORIES.filter(({ pattern }) =>
            new RegExp(pattern.source, pattern.flags).test(source),
        ).map(({ key }) => key),
    );
}

function numericCategoriesIn(source) {
    const categories = new Set();
    for (const match of source.matchAll(/assert_eq!\(\s*[^,\n]+,\s*(\d{3})/gu)) {
        const status = Number(match[1]);
        if (status >= 200 && status < 300) categories.add("success");
        else if (status === 400 || status === 422 || status === 507) {
            categories.add("validation");
        } else if (status === 404 || status === 410) categories.add("not-found");
        else if (status === 409 || status === 423) categories.add("locked");
    }
    return categories;
}

function findRawRequestEvents(body, masked) {
    const events = [];
    for (const match of masked.matchAll(/\braw_request\s*\(/gu)) {
        const start = match.index ?? 0;
        if (/\bfn\s*$/u.test(masked.slice(Math.max(0, start - 12), start))) continue;
        const open = body.indexOf("(", start);
        if (open < 0) continue;
        const close = findMatching(body, open, "(", ")");
        if (close < 0) continue;
        const args = splitTopLevel(body.slice(open + 1, close), ",");
        events.push({
            start,
            end: close + 1,
            raw: {
                methodExpression: args[1] ?? "",
                pathExpression: args[2] ?? "",
            },
        });
    }
    return events;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const waivers = JSON.parse(readFileSync(waiversPath, "utf8"));
const files = walk(testsRoot);
const allFunctions = new Map();
for (const file of files) {
    for (const [name, entry] of functionsIn(readFileSync(file, "utf8"))) {
        allFunctions.set(name, { ...entry, file: relative(root, file).replaceAll("\\", "/") });
    }
}

function callArguments(source, open) {
    const close = findMatching(source, open, "(", ")");
    if (close < 0) return [];
    return splitTopLevel(source.slice(open + 1, close), ",");
}

function bindingFor(name, position, bindings) {
    return bindings
        .filter((binding) => binding.name === name && binding.start < position)
        .sort((left, right) => right.start - left.start)[0];
}

function loopPaths(loop) {
    return loop.table.rows.length > 0
        ? unique(loop.table.rows.flatMap((row) => row.paths))
        : loop.table.paths;
}

function loopMethods(loop) {
    return loop.table.rows.length > 0
        ? unique(loop.table.rows.flatMap((row) => row.methods))
        : loop.table.methods;
}

function resolvePaths(expression, context, seen = new Set()) {
    const text = expression.trim();
    if (text.length === 0) return [];
    const direct = [...literalPaths(text)];
    if (direct.length > 0) return direct;
    const name = bareIdentifier(text);
    const interpolated = unique(
        [...text.matchAll(/\{([a-z_][a-z0-9_]*)\}/gu)].map((match) => match[1]),
    );
    for (const identifier of name === undefined ? interpolated : [name, ...interpolated]) {
        const binding = bindingFor(identifier, context.position, context.bindings);
        if (binding !== undefined && !seen.has(`var:${identifier}`)) {
            const nested = resolvePaths(
                binding.expression,
                { ...context, position: binding.start },
                new Set([...seen, `var:${identifier}`]),
            );
            if (nested.length > 0) return nested;
        }
        if (context.loop?.names.includes(identifier)) {
            return context.row?.paths ?? loopPaths(context.loop);
        }
    }
    if (context.loop !== undefined && mentionsLoop(text, context.loop)) {
        return context.row?.paths ?? loopPaths(context.loop);
    }
    return [];
}

function resolveMethods(expression, context, seen = new Set()) {
    const direct = unique(literalHttpMethods(expression));
    if (direct.length > 0) return direct;
    const name = bareIdentifier(expression);
    if (name !== undefined) {
        const binding = bindingFor(name, context.position, context.bindings);
        if (binding !== undefined && !seen.has(`var:${name}`)) {
            const nested = resolveMethods(
                binding.expression,
                { ...context, position: binding.start },
                new Set([...seen, `var:${name}`]),
            );
            if (nested.length > 0) return nested;
        }
        if (context.loop?.names.includes(name)) {
            return context.row?.methods ?? loopMethods(context.loop);
        }
    }
    if (context.loop !== undefined && mentionsLoop(expression, context.loop)) {
        return context.row?.methods ?? loopMethods(context.loop);
    }
    return [];
}

function dedupeDescriptors(descriptors) {
    const seen = new Set();
    return descriptors.filter((descriptor) => {
        const key = `${descriptor.method} ${descriptor.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Resolve one request expression to the method/path pairs it can send. A loop table is
 * expanded per row, so a status asserted once inside the loop is attached to each row it
 * actually exercises rather than to every path in the test body.
 */
function descriptorsFromExpression(expression, context, seen = new Set()) {
    const text = expression.trim();
    if (text.length === 0) return [];
    const descriptors = [];
    const add = (method, path) => {
        if (method !== undefined && path !== undefined) descriptors.push({ method, path });
    };

    for (const match of text.matchAll(/\bRequest::(get|post|put|patch|delete)\s*\(/gu)) {
        const open = (match.index ?? 0) + match[0].lastIndexOf("(");
        const args = callArguments(text, open);
        const method = match[1].toUpperCase();
        if (
            context.row !== undefined &&
            context.loop?.table.methodNames.some((name) => mentionsName(text, name)) &&
            !context.row.methods.includes(method)
        ) {
            continue;
        }
        for (const path of resolvePaths(args[0] ?? "", context, seen)) {
            add(method, path);
        }
    }

    for (const match of text.matchAll(/\broute_request\s*\(/gu)) {
        const open = (match.index ?? 0) + match[0].lastIndexOf("(");
        const args = callArguments(text, open);
        const methods = resolveMethods(args[0] ?? "", context, seen);
        const paths = resolvePaths(args[1] ?? "", context, seen);
        for (const method of methods) {
            for (const path of paths) add(method, path);
        }
    }

    for (const match of text.matchAll(/\b(start_request|config_request)\s*\(/gu)) {
        for (const descriptor of helperRequestDescriptors(match[1])) {
            add(descriptor.method, descriptor.path);
        }
    }

    for (const closure of context.closures) {
        if (seen.has(`closure:${closure.name}`)) continue;
        if (!new RegExp("\\b" + closure.name + "\\s*\\(", "u").test(text)) continue;
        const nestedSeen = new Set([...seen, `closure:${closure.name}`]);
        const nested = descriptorsFromExpression(
            closure.body,
            { ...context, position: closure.range[0] },
            nestedSeen,
        );
        for (const descriptor of nested) add(descriptor.method, descriptor.path);
    }

    if (descriptors.length === 0) {
        const name = leadingIdentifier(text);
        if (name !== undefined && !seen.has(`var:${name}`)) {
            const binding = bindingFor(name, context.position, context.bindings);
            if (binding !== undefined) {
                const nested = descriptorsFromExpression(
                    binding.expression,
                    { ...context, position: binding.start },
                    new Set([...seen, `var:${name}`]),
                );
                descriptors.push(...nested);
            }
        }
    }

    if (
        descriptors.length === 0 &&
        context.loop !== undefined &&
        mentionsLoop(text, context.loop)
    ) {
        const methods = loopMethods(context.loop);
        const paths = loopPaths(context.loop);
        for (const method of methods) {
            for (const path of paths) add(method, path);
        }
    }

    return dedupeDescriptors(descriptors);
}

const helperRequestCache = new Map();

/** Resolve a helper that returns a request, such as `start_request` or `config_request`. */
function helperRequestDescriptors(name) {
    if (helperRequestCache.has(name)) return helperRequestCache.get(name);
    const entry = allFunctions.get(name);
    if (entry === undefined || name === "route_request") {
        helperRequestCache.set(name, []);
        return [];
    }
    const masked = maskStringsAndComments(entry.body);
    const closures = findClosures(entry.body, masked);
    const ranges = closures.map((closure) => closure.range);
    const bindings = findBindings(entry.body, maskRanges(masked, ranges));
    const descriptors = descriptorsFromExpression(
        entry.body,
        { position: 0, loop: undefined, bindings, closures },
        new Set([`helper:${name}`]),
    );
    helperRequestCache.set(name, descriptors);
    return descriptors;
}

const statusOnlyHelpers = new Map();
for (const [name, entry] of allFunctions) {
    if (entry.test) continue;
    const masked = maskStringsAndComments(entry.body);
    if (/\bRequest::|route_request\s*\(|start_request\s*\(|config_request\s*\(/u.test(masked)) {
        continue;
    }
    const categories = categoriesIn(masked);
    if (categories.size > 0) statusOnlyHelpers.set(name, categories);
}

function statusOnlyCategories(source) {
    const categories = new Set();
    for (const [name, helperCategories] of statusOnlyHelpers) {
        if (!new RegExp("\\b" + name + "\\s*\\(", "u").test(source)) continue;
        for (const category of helperCategories) categories.add(category);
    }
    return categories;
}

const functionAnalysisCache = new Map();

/**
 * Analyze one test or helper into request observations. A status belongs only to the
 * request whose response is checked in that request's own scope; helper observations are
 * merged separately because their own assertions belong to their own request.
 */
function analyzeFunction(name, stack = new Set()) {
    const cached = functionAnalysisCache.get(name);
    if (cached !== undefined) return cached;
    if (stack.has(name)) return { observations: [] };
    const entry = allFunctions.get(name);
    if (entry === undefined) return { observations: [] };

    const body = entry.body;
    const rawMasked = maskStringsAndComments(body);
    const closures = findClosures(body, rawMasked);
    const closureRanges = closures.map((closure) => closure.range);
    const masked = maskRanges(rawMasked, closureRanges);
    const loops = findLoops(body, masked);
    const bindings = findBindings(body, masked);
    const events = [...findSendEvents(body, masked), ...findRawRequestEvents(body, masked)];

    for (const closure of closures) {
        const closureMasked = maskStringsAndComments(closure.body);
        if (!/\bsend\s*\(|\.oneshot\s*\(/u.test(closureMasked)) continue;
        for (const match of masked.matchAll(new RegExp("\\b" + closure.name + "\\s*\\(", "gu"))) {
            const start = match.index ?? 0;
            if (events.some((event) => start >= event.start && start <= event.end)) continue;
            const open = body.indexOf("(", start);
            if (open < 0) continue;
            const close = findMatching(body, open, "(", ")");
            if (close < 0) continue;
            events.push({
                start,
                end: close + 1,
                argument: closure.body,
                closure,
            });
        }
    }
    events.sort((left, right) => left.start - right.start);

    const observations = [];
    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const nextStart = events[index + 1]?.start ?? body.length;
        const scope = masked.slice(event.end, nextStart);
        const categories = categoriesIn(scope);
        if (event.raw !== undefined) {
            for (const category of numericCategoriesIn(scope)) categories.add(category);
        }
        for (const category of statusOnlyCategories(scope)) categories.add(category);
        if (event.closure !== undefined) {
            for (const category of categoriesIn(maskStringsAndComments(event.closure.body))) {
                categories.add(category);
            }
        }
        const descriptorContext = {
            position: event.start,
            loop: loopAt(loops, event.start),
            bindings,
            closures,
        };
        const rows = descriptorContext.loop?.table.rows ?? [];
        const contexts =
            rows.length > 0
                ? rows.map((row) => ({ ...descriptorContext, row }))
                : [descriptorContext];
        for (const context of contexts) {
            const descriptors =
                event.raw === undefined
                    ? descriptorsFromExpression(
                          event.argument,
                          context,
                          new Set([`function:${name}`]),
                      )
                    : resolveMethods(
                          event.raw.methodExpression,
                          context,
                          new Set([`function:${name}`]),
                      ).flatMap((method) =>
                          resolvePaths(
                              event.raw.pathExpression,
                              context,
                              new Set([`function:${name}`]),
                          ).map((path) => ({ method, path })),
                      );
            for (const descriptor of descriptors) {
                observations.push({ ...descriptor, categories });
            }
        }
    }

    const nextStack = new Set(stack);
    nextStack.add(name);
    for (const match of masked.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gu)) {
        const helperName = match[1];
        if (helperName === name) continue;
        const helper = allFunctions.get(helperName);
        if (helper === undefined || helper.test) continue;
        const result = analyzeFunction(helperName, nextStack);
        for (const observation of result.observations) {
            if (observation.categories.size === 0) continue;
            observations.push(observation);
        }
    }

    const result = { observations };
    functionAnalysisCache.set(name, result);
    return result;
}

const tests = [...allFunctions.entries()]
    .filter(([, entry]) => entry.test)
    .map(([name, entry]) => ({
        name,
        file: entry.file,
        observations: analyzeFunction(name).observations,
    }));

const rows = [];
for (const route of manifest.routes) {
    for (const method of route.methods) {
        const matches = tests
            .map((test) => ({
                test,
                observations: test.observations.filter(
                    (observation) =>
                        observation.method === method.method &&
                        pathMatches(route.path, observation.path),
                ),
            }))
            .filter((match) => match.observations.length > 0);
        const categories = Object.fromEntries(
            STATUS_CATEGORIES.map(({ key }) => [
                key,
                matches.some((match) =>
                    match.observations.some((observation) => observation.categories.has(key)),
                ),
            ]),
        );
        const key = `${method.method} ${route.path}`;
        const required = ROUTE_TEST_REQUIREMENTS[key];
        rows.push({
            key,
            route: route.path,
            id: route.id,
            method: method.method,
            required,
            tests: matches.map((match) => `${match.test.file}::${match.test.name}`),
            categories,
        });
    }
}

const rowKeys = new Set(rows.map((row) => row.key));
const waiverIssues = [];
const waiversByRow = new Map();
for (const waiver of waivers) {
    const key = `${waiver.method} ${waiver.route}`;
    if (!rowKeys.has(key)) {
        waiverIssues.push(`waiver names an unknown route method: ${key}`);
        continue;
    }
    if (waiversByRow.has(key)) {
        waiverIssues.push(`duplicate waiver for ${key}`);
        continue;
    }
    const wholeMethod = waiver.categories === undefined;
    const categories = wholeMethod ? CATEGORY_KEYS : waiver.categories;
    if (!Array.isArray(categories) || categories.length === 0) {
        waiverIssues.push(`waiver for ${key} must name categories or waive the whole method`);
        continue;
    }
    const unknown = categories.filter((category) => !CATEGORY_KEYS.includes(category));
    if (unknown.length > 0) {
        waiverIssues.push(`waiver for ${key} names unknown categories: ${unknown.join(", ")}`);
        continue;
    }
    waiversByRow.set(key, { ...waiver, categories, wholeMethod });
}

const requirementIssues = [];
for (const [key, categories] of Object.entries(ROUTE_TEST_REQUIREMENTS)) {
    if (!rowKeys.has(key)) {
        requirementIssues.push(`requirement names an unknown route method: ${key}`);
        continue;
    }
    if (!Array.isArray(categories) || categories.length === 0) {
        requirementIssues.push(`${key} must require at least success`);
        continue;
    }
    const unknown = categories.filter((category) => !CATEGORY_KEYS.includes(category));
    if (unknown.length > 0) {
        requirementIssues.push(`${key} names unknown categories: ${unknown.join(", ")}`);
        continue;
    }
    if (!categories.includes("success")) {
        requirementIssues.push(`${key} must require success`);
    }
}
const unreviewed = rows.filter((row) => row.required === undefined).map((row) => row.key);

for (const row of rows) {
    const waiver = waiversByRow.get(row.key);
    const categories = waiver?.categories ?? [];
    if (waiver !== undefined) {
        if (waiver.wholeMethod) {
            if (row.tests.length > 0) {
                waiverIssues.push(`${row.key} waives the whole method but already has tests`);
            }
        } else {
            const extraneous = categories.filter((category) => !row.required?.includes(category));
            if (extraneous.length > 0) {
                waiverIssues.push(
                    `${row.key} waives categories it does not require: ${extraneous.join(", ")}`,
                );
            }
            const alreadyCovered = categories.filter((category) => row.categories[category]);
            if (alreadyCovered.length > 0) {
                waiverIssues.push(
                    `${row.key} waives categories that already have coverage: ${alreadyCovered.join(", ")}`,
                );
            }
        }
    }
    row.waiver = waiver;
    row.missingCategories = (row.required ?? []).filter(
        (category) => !row.categories[category] && !categories.includes(category),
    );
}

const missing = rows.filter((row) => row.tests.length === 0 && row.waiver === undefined);
const coverageFailures = rows.filter((row) => row.missingCategories.length > 0);

const formatCategories = (categories) =>
    CATEGORY_KEYS.filter((category) => categories.includes(category))
        .map((category) => LABELS.get(category))
        .join(", ");

const lines = [
    "# Route-method × test matrix",
    "",
    "> Generated by `npm run routes:matrix`; do not edit by hand.",
    "",
    `Generated from \`schema/routes/manifest.json\`, \`scripts/route-test-requirements.mjs\`, and the Rust integration tests. ${String(rows.length)} methods; ${String(missing.length)} without a matching test; ${String(coverageFailures.length)} missing required status coverage; ${String(waivers.length)} reviewed waiver${waivers.length === 1 ? "" : "s"}.`,
    "",
    "The category columns say whether the matched tests assert at least one status in that",
    "family. The **Required** column is the reviewed applicability policy for the method;",
    "every required family must be present unless a per-category, reviewed waiver names it.",
    "The categories are success (`2xx`), validation (`400`, `422`, `507`), not found (`404`,",
    "`410`), and locked (`423`, `409`).",
    "",
    "| Method | Route | Tests | Required | Success | Validation | Not found | Locked | Missing | Waived |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => {
        const waived =
            row.waiver === undefined
                ? "—"
                : row.waiver.wholeMethod
                  ? "all"
                  : formatCategories(row.waiver.categories);
        return `| ${row.method} | \`${row.route}\` | ${String(row.tests.length)} | ${formatCategories(row.required ?? [])} | ${row.categories.success ? "yes" : "no"} | ${row.categories.validation ? "yes" : "no"} | ${row.categories["not-found"] ? "yes" : "no"} | ${row.categories.locked ? "yes" : "no"} | ${row.missingCategories.length === 0 ? "—" : formatCategories(row.missingCategories)} | ${waived} |`;
    }),
    "",
];
if (coverageFailures.length > 0) {
    lines.push("## Missing coverage", "");
    for (const row of coverageFailures) {
        lines.push(`- **${row.key}**: missing ${formatCategories(row.missingCategories)}`);
    }
    lines.push("");
}
lines.push("## Test references", "");
lines.push(
    ...rows.flatMap((row) => {
        if (row.waiver !== undefined) {
            const scope = row.waiver.wholeMethod
                ? "all required categories"
                : formatCategories(row.waiver.categories);
            return [`- **${row.key}**: reviewed waiver (${scope}) — ${row.waiver.reason}`];
        }
        if (row.tests.length === 0) {
            return [`- **${row.key}**: no matching test`];
        }
        return row.tests.map((test) => `- ${row.key}: \`${test}\``);
    }),
);
lines.push("");

const options = (await prettier.resolveConfig(docsPath)) ?? {};
const content = await prettier.format(lines.join("\n"), { ...options, parser: "markdown" });
if (write) {
    writeFileSync(docsPath, content, "utf8");
    console.log(`wrote ${rows.length} route methods to docs/route-test-matrix.md`);
} else {
    const current = readFileSync(docsPath, "utf8");
    if (current !== content) {
        console.error("docs/route-test-matrix.md is stale; run npm run routes:matrix");
        process.exitCode = 1;
    }
}

if (unreviewed.length > 0) {
    console.error("route-test requirements must name every route method; add:");
    for (const key of unreviewed) console.error(`  - ${key}`);
    process.exitCode = 1;
}

if (requirementIssues.length > 0) {
    console.error("route-test requirements are invalid:");
    for (const issue of requirementIssues) console.error(`  - ${issue}`);
    process.exitCode = 1;
}

if (waiverIssues.length > 0) {
    console.error("route-test waivers are invalid:");
    for (const issue of waiverIssues) console.error(`  - ${issue}`);
    process.exitCode = 1;
}

if (missing.length > 0) {
    console.error(`route-test matrix failed: ${String(missing.length)} methods have no test:`);
    for (const row of missing) console.error(`  - ${row.key}`);
    process.exitCode = 1;
}

if (coverageFailures.length > 0) {
    console.error(
        `route-test matrix failed: ${String(coverageFailures.length)} methods miss required status coverage:`,
    );
    for (const row of coverageFailures) {
        console.error(`  - ${row.key}: missing ${formatCategories(row.missingCategories)}`);
    }
    process.exitCode = 1;
}

if (
    process.exitCode !== 1 &&
    unreviewed.length === 0 &&
    requirementIssues.length === 0 &&
    waiverIssues.length === 0 &&
    missing.length === 0 &&
    coverageFailures.length === 0
) {
    console.log(
        `route-test matrix passed: ${rows.length} methods covered across their required categories`,
    );
}
