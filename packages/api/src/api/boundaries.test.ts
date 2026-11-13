import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { BOUNDARY_FIXTURES } from "@av1ation/contracts/boundaries";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { LOCAL_BOUNDARY_FIXTURES } from "./boundaries";

const apiRoot = fileURLToPath(new URL(".", import.meta.url));

/** Schema argument positions for the transport calls that parse a response. */
const TRANSPORT_SCHEMA_ARGUMENT = new Map([
    ["get", 1],
    ["post", 2],
    ["putJson", 2],
    ["patchJson", 2],
    ["subscribe", 1],
]);

/**
 * Inline responses are boundaries too, but they are not generated schemas. Each one is
 * listed here so a new inline response cannot appear without a deliberate decision about
 * whether it needs a fixture.
 */
const INLINE_BOUNDARIES = new Map([
    ["z.void()", "The route returns no body; there is nothing to parse."],
]);

type SchemaUse =
    | { readonly kind: "named"; readonly name: string }
    | { readonly kind: "inline"; readonly text: string };

interface HookSchemaUse {
    readonly file: string;
    readonly line: number;
    readonly use: SchemaUse;
}

function readSchemaUse(argument: ts.Expression, sourceFile: ts.SourceFile): SchemaUse | null {
    if (ts.isIdentifier(argument) && argument.text.endsWith("Schema")) {
        return { kind: "named", name: argument.text.replace(/Schema$/, "") };
    }

    if (
        ts.isCallExpression(argument) &&
        ts.isPropertyAccessExpression(argument.expression) &&
        argument.expression.name.text === "array" &&
        ts.isIdentifier(argument.expression.expression) &&
        argument.expression.expression.text.endsWith("Schema")
    ) {
        return {
            kind: "named",
            name: argument.expression.expression.text.replace(/Schema$/, ""),
        };
    }

    const text = argument.getText(sourceFile);
    return INLINE_BOUNDARIES.has(text) ? { kind: "inline", text } : null;
}

function collectHookSchemaUses(): {
    readonly uses: readonly HookSchemaUse[];
    readonly unknown: readonly string[];
} {
    const uses: HookSchemaUse[] = [];
    const unknown: string[] = [];
    const files = readdirSync(apiRoot)
        .filter(
            (file) =>
                (file.endsWith(".ts") || file.endsWith(".tsx")) &&
                !file.endsWith(".test.ts") &&
                !file.endsWith(".test.tsx"),
        )
        .sort();

    for (const file of files) {
        const source = readFileSync(join(apiRoot, file), "utf8");
        const sourceFile = ts.createSourceFile(
            file,
            source,
            ts.ScriptTarget.Latest,
            true,
            file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );

        const visit = (node: ts.Node): void => {
            if (ts.isCallExpression(node)) {
                const callee = node.expression;
                if (
                    ts.isPropertyAccessExpression(callee) &&
                    ts.isIdentifier(callee.expression) &&
                    callee.expression.text === "transport"
                ) {
                    const argumentIndex = TRANSPORT_SCHEMA_ARGUMENT.get(callee.name.text);
                    const argument =
                        argumentIndex === undefined ? undefined : node.arguments[argumentIndex];
                    if (argument !== undefined) {
                        const line =
                            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
                                .line + 1;
                        const use = readSchemaUse(argument, sourceFile);
                        if (use === null) {
                            unknown.push(`${file}:${line}: ${argument.getText(sourceFile)}`);
                        } else {
                            uses.push({ file, line, use });
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
    }

    return { uses, unknown };
}

const { uses, unknown } = collectHookSchemaUses();
const hookNames = new Set<string>();
const inlineNames = new Set<string>();
for (const { use } of uses) {
    if (use.kind === "named") {
        hookNames.add(use.name);
    } else {
        inlineNames.add(use.text);
    }
}

function registeredNames(): string[] {
    return [
        ...BOUNDARY_FIXTURES.map((entry) => entry.name),
        ...LOCAL_BOUNDARY_FIXTURES.map((entry) => entry.name),
    ];
}

describe("API hook boundary coverage", () => {
    it("classifies every schema expression passed to a transport call", () => {
        expect(unknown).toEqual([]);
    });

    it("classifies only the known inline responses", () => {
        expect([...inlineNames].sort()).toEqual([...INLINE_BOUNDARIES.keys()].sort());
    });

    it("registers every named schema a hook parses", () => {
        const registered = new Set(registeredNames());
        const missing = [...hookNames].filter((name) => !registered.has(name)).sort();
        expect(missing).toEqual([]);
    });

    it("has no boundary fixture that no hook parses", () => {
        const unused = registeredNames()
            .filter((name) => !hookNames.has(name))
            .sort();
        expect(unused).toEqual([]);
    });

    it("names every boundary once across both registries", () => {
        const names = registeredNames();
        expect(new Set(names).size).toBe(names.length);
    });

    it("parses every local boundary fixture against its schema", () => {
        for (const entry of LOCAL_BOUNDARY_FIXTURES) {
            expect(entry.schema.safeParse(entry.fixture).success, entry.name).toBe(true);
        }
    });

    it("keeps local boundary fixture files exactly registered", () => {
        const fixtures = readdirSync(join(apiRoot, "fixtures"))
            .filter((file) => file.endsWith(".json"))
            .sort();
        expect(fixtures).toEqual(LOCAL_BOUNDARY_FIXTURES.map((entry) => entry.fixturePath).sort());
    });
});
