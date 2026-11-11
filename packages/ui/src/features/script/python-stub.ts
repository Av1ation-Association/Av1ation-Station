/**
 * The completion table the script editor derives from the generated `condor_data` stub.
 *
 * The stub is produced by the engine, not written here, so the editor completes against the
 * module the runner actually writes. This parser only reads the annotations it needs; it is
 * not a Python parser and must not become one, because a second grammar would drift from the
 * generated text it is meant to describe.
 */

/** One name the stub declares at module, class, or method level. */
export interface StubSymbol {
    name: string;
    kind: "constant" | "function" | "class" | "attribute" | "method";
    /** The annotation or signature, shown beside the name in the completion list. */
    detail: string;
    /**
     * The docstring below the declaration, joined into one line and kept apart from
     * `detail`: an annotation that carried prose could not be resolved to its class, so
     * `cd.sequence_config.` completed nothing at all.
     */
    doc: string;
}

/** One class the stub declares, with the attributes and methods it carries. */
export interface StubClass {
    name: string;
    /**
     * The dotted name the class is declared under, e.g.
     * `types.sequence.SequenceConfig.NoiseDetectorConfig`.
     */
    path: string;
    /** The class docstring, joined into one line. */
    doc: string;
    members: StubSymbol[];
}

/** The parsed stub. */
export interface StubModule {
    /**
     * Module-level names: the values a script reads, the read-only base class, the scene
     * record, and the `types` namespace the generated document classes live under.
     */
    members: StubSymbol[];
    /** Classes by full path, for a type nested inside its owner or namespace. */
    classes: Record<string, StubClass>;
    /** Classes by bare name, for the first declaration of each; documents are named uniquely. */
    byName: Record<string, StubClass>;
}

const CONSTANT = /^([A-Z][A-Z0-9_]*):\s*(.+)$/u;
const ATTRIBUTE = /^([a-z_][a-z0-9_]*):\s*(.+)$/u;
// A class field may be capitalised: an externally tagged Rust enum variant is a field named
// after the variant (`Encoder.All`), and the generated stub keeps that name.
const FIELD = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/u;
const DEF = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*->\s*(.+?))?:\s*(?:\.\.\.)?$/u;
const CLASS = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/u;

/**
 * Parse the subset of a `.pyi` the generated stub uses.
 *
 * Attributes are the indented `name: type` lines of a class; a method is an indented `def`.
 * Everything else, including docstring prose, is ignored rather than misread.
 */
export function parseStub(text: string): StubModule {
    const members: StubSymbol[] = [];
    const classes: Record<string, StubClass> = {};
    const byName: Record<string, StubClass> = {};
    // Documents are generated as a tree: a config nests the stages only it uses. The stack
    // is the class body a line belongs to, so a nested field cannot land on a sibling.
    const scopes: { depth: number; owner: StubClass }[] = [];
    let inDocstring = false;
    let docTarget:
        { kind: "class"; target: StubClass } | { kind: "symbol"; target: StubSymbol } | null = null;

    const addDoc = (line: string): void => {
        if (docTarget === null) {
            return;
        }
        const trimmed = line
            .trim()
            .replace(/^["']|["']$/gu, "")
            .trim();
        if (trimmed === "") {
            return;
        }
        if (docTarget.kind === "class") {
            const target = docTarget.target;
            target.doc = target.doc === "" ? trimmed : `${target.doc} ${trimmed}`;
        } else {
            const target = docTarget.target;
            target.doc = target.doc === "" ? trimmed : `${target.doc} ${trimmed}`;
        }
    };

    for (const raw of text.split("\n")) {
        const line = raw.replace(/\s+$/u, "");
        if (inDocstring) {
            if (line.trim().endsWith('"""') || line.trim().endsWith("'''")) {
                addDoc(line.replace(/["']{3}/u, ""));
                inDocstring = false;
                docTarget = null;
            } else {
                addDoc(line);
            }
            continue;
        }
        const docStart = /^\s*("""|''')/u.exec(line);
        if (docStart !== null) {
            const triple = docStart[1] ?? '"""';
            const body = line.slice(line.indexOf(triple) + 3);
            inDocstring = !body.includes(triple);
            if (!inDocstring) {
                addDoc(body.replace(new RegExp(`${triple}$`, "u"), ""));
            }
            continue;
        }
        if (line.trim() === "" || line.trim().startsWith("#")) {
            continue;
        }

        const trimmed = line.trim();
        const depth = (/^\s*/u.exec(line)?.[0] ?? "").replace(/\t/gu, "    ").length;
        while (scopes.length > 0 && (scopes[scopes.length - 1]?.depth ?? 0) >= depth) {
            scopes.pop();
        }
        const owner = scopes[scopes.length - 1]?.owner ?? null;

        const classMatch = CLASS.exec(trimmed);
        if (classMatch !== null) {
            const name = classMatch[1] ?? "";
            const declared: StubClass = {
                name,
                path: owner === null ? name : `${owner.path}.${name}`,
                doc: "",
                members: [],
            };
            classes[declared.path] = declared;
            byName[name] ??= declared;
            scopes.push({ depth, owner: declared });
            // A nested class is a type, not a value: a script never reads
            // `cd.sequence_config.noise_detector_config`. The module level lists the `types`
            // namespace once, and the namespace lists the groups under it, which keeps a
            // type out of the completion list of what a script can read.
            if (owner === null) {
                members.push({ name, kind: "class", detail: "condor_data type", doc: "" });
            } else {
                owner.members.push({ name, kind: "class", detail: "condor_data type", doc: "" });
            }
            docTarget = { kind: "class", target: declared };
            continue;
        }
        if (owner === null) {
            const defMatch = DEF.exec(trimmed);
            if (defMatch !== null) {
                const symbol: StubSymbol = {
                    name: defMatch[1] ?? "",
                    kind: "function",
                    detail: `(${defMatch[2] ?? ""}) → ${defMatch[3] ?? "None"}`,
                    doc: "",
                };
                members.push(symbol);
                docTarget = { kind: "symbol", target: symbol };
                continue;
            }
            const constantMatch = CONSTANT.exec(trimmed);
            if (constantMatch !== null) {
                const symbol: StubSymbol = {
                    name: constantMatch[1] ?? "",
                    kind: "constant",
                    detail: constantMatch[2] ?? "",
                    doc: "",
                };
                members.push(symbol);
                docTarget = { kind: "symbol", target: symbol };
                continue;
            }
            // The generated module's public names are lowercase (`cd.video_path`), so a
            // module-level annotation is a member even though it is not a SCREAMING name.
            const attributeMatch = ATTRIBUTE.exec(trimmed);
            if (attributeMatch !== null) {
                const symbol: StubSymbol = {
                    name: attributeMatch[1] ?? "",
                    kind: "attribute",
                    detail: attributeMatch[2] ?? "",
                    doc: "",
                };
                members.push(symbol);
                docTarget = { kind: "symbol", target: symbol };
            }
            continue;
        }

        const methodMatch = DEF.exec(trimmed);
        if (methodMatch !== null) {
            const symbol: StubSymbol = {
                name: methodMatch[1] ?? "",
                kind: "method",
                detail: `(${methodMatch[2] ?? ""}) → ${methodMatch[3] ?? "None"}`,
                doc: "",
            };
            owner.members.push(symbol);
            docTarget = { kind: "symbol", target: symbol };
            continue;
        }
        const attributeMatch = FIELD.exec(trimmed);
        if (attributeMatch !== null) {
            const symbol: StubSymbol = {
                name: attributeMatch[1] ?? "",
                kind: "attribute",
                detail: attributeMatch[2] ?? "",
                doc: "",
            };
            owner.members.push(symbol);
            docTarget = { kind: "symbol", target: symbol };
        }
    }

    return { members, classes, byName };
}

/**
 * The `condor_data` names a line so far has bound to a `Scene`.
 *
 * Two idioms are recognised, because both are in the template: the loop variable of
 * `for x in cd.SCENES` and the result of `x = cd.scene_at(...)`. A variable of another type
 * never offers Scene attributes, which is the point of tracking this at all.
 */
export function sceneVariables(textBefore: string): Set<string> {
    const names = new Set<string>();
    // The generated module names the table `scenes`; `SCENES` stays accepted so a script
    // written against the earlier stub keeps its Scene completion.
    for (const match of textBefore.matchAll(
        /for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(?:cd|condor_data)\.(?:scenes|SCENES)\b/gu,
    )) {
        if (match[1] !== undefined) {
            names.add(match[1]);
        }
    }
    for (const match of textBefore.matchAll(
        /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:cd|condor_data)\.scene_at\(/gu,
    )) {
        if (match[1] !== undefined) {
            names.add(match[1]);
        }
    }
    return names;
}

/** What an annotation names: its text, and the class the stub declares for it. */
interface StubType {
    annotation: string;
    class: StubClass | null;
}

/**
 * The class an annotation names, searched from the declaring class outward.
 *
 * The stub groups documents under `types`, nests a document under the one class that uses
 * it, and writes a shared document at its group's top level: `NoiseDetectorConfig` inside
 * `SequenceConfig` is `types.sequence.SequenceConfig.NoiseDetectorConfig`, while a shared
 * `Input` is `types.sequence.Input`. A full path is looked up directly; otherwise the
 * search walks outward from the declaring class, so a bare sibling annotation resolves.
 */
function resolveClass(module: StubModule, name: string, scope: StubClass | null): StubClass | null {
    // A cross-namespace annotation spells its path (`types.data.SequenceData`), so the name
    // is already the key the stub declared the class under.
    const declared = module.classes[name];
    if (declared !== undefined) {
        return declared;
    }
    let current = scope;
    while (current !== null) {
        const nested = module.classes[`${current.path}.${name}`];
        if (nested !== undefined) {
            return nested;
        }
        const cut = current.path.lastIndexOf(".");
        current = cut === -1 ? null : (module.classes[current.path.slice(0, cut)] ?? null);
    }
    return module.byName[name] ?? null;
}

function typeOf(module: StubModule, annotation: string, scope: StubClass | null = null): StubType {
    // `NoiseDetectorData | None` still resolves to the class when the value exists.
    const name = annotation.split("|")[0]?.trim() ?? "";
    return {
        annotation: annotation.trim(),
        class: name === "" ? null : resolveClass(module, name, scope),
    };
}

/** The element type of `tuple[T, ...]` or `tuple[T,]`, or null for a fixed tuple. */
function elementOf(annotation: string): string | null {
    const body = /^tuple\[(.*)\]$/u.exec(annotation.trim())?.[1]?.trim();
    if (body === undefined || body === "") {
        return null;
    }
    const parts = body
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
    if (parts.length === 1) {
        return parts[0] === "..." ? null : (parts[0] ?? null);
    }
    return parts[1] === "..." ? (parts[0] ?? null) : null;
}

/**
 * The class a chain of attributes names, starting from the generated module or a Scene local.
 *
 * The stub annotates every field, so `scene.sequence_data.noise_detection` resolves to
 * `NoiseDetectorData` without a hand-written map of engine documents. A chain that names a
 * primitive, a map, or a method call resolves to null: there is nothing to complete, and
 * offering the previous type's members would be wrong.
 */
export function resolveExpression(
    module: StubModule,
    expression: string,
    sceneNames: ReadonlySet<string>,
): StubClass | null {
    const tokens = expression.match(/[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]/gu);
    if (tokens === null || tokens.length === 0) {
        return null;
    }
    let index = 0;
    let type: StubType | null = null;
    const first = tokens[0] ?? "";

    if (first === "cd" || first === "condor_data") {
        const member = module.members.find((symbol) => symbol.name === tokens[1]);
        if (member === undefined) {
            return null;
        }
        type = typeOf(module, member.kind === "class" ? member.name : member.detail);
        index = 2;
    } else if (sceneNames.has(first)) {
        type = typeNamed(module, "Scene");
        index = 1;
    } else {
        const member = module.members.find((symbol) => symbol.name === first);
        if (member === undefined) {
            return null;
        }
        type = typeOf(module, member.detail);
        index = 1;
    }

    for (; index < tokens.length; index += 1) {
        if (type === null) {
            return null;
        }
        const token = tokens[index] ?? "";
        if (token.startsWith("[")) {
            const element = elementOf(type.annotation);
            if (element === null) {
                return null;
            }
            type = typeOf(module, element, type.class);
            continue;
        }
        if (type.class === null) {
            return null;
        }
        const member = type.class.members.find(
            (symbol) =>
                symbol.name === token && (symbol.kind === "attribute" || symbol.kind === "class"),
        );
        if (member === undefined) {
            return null;
        }
        type = typeOf(module, member.kind === "class" ? member.name : member.detail, type.class);
    }
    return type.class;
}

function typeNamed(module: StubModule, name: string): StubType {
    return { annotation: name, class: resolveClass(module, name, null) };
}
