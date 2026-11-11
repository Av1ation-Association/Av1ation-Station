import { EncoderParametersUpdateSchema, type ParameterDescriptor } from "@av1ation/contracts";

/** How many schema problems the page lists before summarising the rest. */
export const MAX_LISTED_ISSUES = 8;

/** One problem with the document, located in the text the user is editing. */
export type EncoderIssue = {
    /** The descriptor path as the user reads it: `--crf.label`, or `document`. */
    path: string;
    /** The contract's own wording for the problem, shown after `path` and `line`. */
    message: string;
    /** 1-based line of the first character of the problem. */
    line: number;
    /** 1-based column of that character, counted in characters, not bytes. */
    column: number;
    /** Character offset into the document, for the editor's marker. */
    offset: number;
    /** Characters the marker covers; always at least one. */
    length: number;
};

export type ParsedEncoderDocument =
    | { status: "valid"; parameters: Record<string, ParameterDescriptor> }
    | { status: "invalid"; summary: string; issues: EncoderIssue[] };

/** The issue shape the generated schema produces, taken from the schema itself. */
type ContractIssue = Extract<
    ReturnType<typeof EncoderParametersUpdateSchema.safeParse>,
    { success: false }
>["error"]["issues"][number];

type Span = { offset: number; length: number };
type Node = { key: Span; value: Span };

/** Paths are joined with a separator no JSON key can contain, so `--a.b` cannot alias. */
const PATH_SEPARATOR = "\u0001";

type FlatIssue = { path: PropertyKey[]; message: string };

/**
 * Every issue, with the wrapper the generated schema adds removed.
 *
 * A record key that fails its descriptor is reported by the generator as one custom issue
 * naming only the key, with the field-level problems inside `params.issues`. A union adds a
 * second branch that always says `expected never` because the generator pairs the real
 * schema with `z.never()`. Both layers are machinery, not feedback: only the field-level
 * issues are kept, and only the branch that names what is actually wrong.
 */
function flattenIssues(
    issues: readonly ContractIssue[],
    base: readonly PropertyKey[] = [],
): FlatIssue[] {
    const flat: FlatIssue[] = [];
    for (const issue of issues) {
        const path = [...base, ...stripWrapper(issue.path)];
        if (issue.code === "invalid_union") {
            for (const branch of issue.errors) {
                flat.push(...flattenIssues(branch, path));
            }
            continue;
        }
        const nested = nestedIssues(issue);
        if (nested !== null) {
            flat.push(...flattenIssues(nested, path));
            continue;
        }
        if (isNeverBranch(issue)) {
            continue;
        }
        flat.push({ path, message: issue.message });
    }
    return flat;
}

/** The `parameters` wrapper is how the document is sent, not how it is read. */
function stripWrapper(path: readonly PropertyKey[]): PropertyKey[] {
    return path[0] === "parameters" ? path.slice(1) : [...path];
}

/** The field-level issues a generator-produced custom issue carries. */
function nestedIssues(issue: ContractIssue): ContractIssue[] | null {
    if (issue.code !== "custom") {
        return null;
    }
    const params = issue.params as { issues?: unknown } | undefined;
    const nested = params?.issues;
    if (!Array.isArray(nested)) {
        return null;
    }
    return nested.filter(
        (entry): entry is ContractIssue =>
            typeof entry === "object" && entry !== null && "message" in entry && "path" in entry,
    );
}

/** The generator's `z.never()` fallback: true of the document, but says nothing useful. */
function isNeverBranch(issue: ContractIssue): boolean {
    return issue.code === "invalid_type" && issue.expected === "never";
}

/**
 * Where every key and value of a parsed document sits.
 *
 * `JSON.parse` keeps no offsets and the schema reports a path, so the page needs the reverse
 * lookup: given `--crf.label`, which characters of the text are those? The scan runs only on
 * text `JSON.parse` already accepted, so it can assume the document is well formed.
 */
function scanLocations(text: string): Map<string, Node> {
    const nodes = new Map<string, Node>();
    let at = 0;

    function skipSpace(): void {
        while (
            at < text.length &&
            (text[at] === " " || text[at] === "\n" || text[at] === "\r" || text[at] === "\t")
        ) {
            at += 1;
        }
    }

    function readString(): string {
        const start = at;
        at += 1;
        while (at < text.length) {
            if (text[at] === "\\") {
                at += 2;
                continue;
            }
            at += 1;
            if (text[at - 1] === '"') {
                break;
            }
        }
        return JSON.parse(text.slice(start, at)) as string;
    }

    function readValue(path: string): Span {
        skipSpace();
        const start = at;
        const first = text[at];
        if (first === "{") {
            readObject(path);
        } else if (first === "[") {
            readArray(path);
        } else if (first === '"') {
            readString();
        } else {
            while (at < text.length && !",}] \t\r\n".includes(text[at] as string)) {
                at += 1;
            }
        }
        return { offset: start, length: Math.max(1, at - start) };
    }

    function readArray(path: string): void {
        at += 1;
        skipSpace();
        if (text[at] === "]") {
            at += 1;
            return;
        }
        let index = 0;
        for (;;) {
            const child = `${path}${PATH_SEPARATOR}${String(index)}`;
            const value = readValue(child);
            nodes.set(child, { key: value, value });
            index += 1;
            skipSpace();
            if (text[at] === ",") {
                at += 1;
                continue;
            }
            at += 1;
            return;
        }
    }

    function readObject(path: string): void {
        at += 1;
        skipSpace();
        if (text[at] === "}") {
            at += 1;
            return;
        }
        for (;;) {
            skipSpace();
            const keyStart = at;
            const key = readString();
            const keyEnd = at;
            const child = path === "" ? key : `${path}${PATH_SEPARATOR}${key}`;
            skipSpace();
            at += 1; // the colon
            const value = readValue(child);
            nodes.set(child, {
                key: { offset: keyStart, length: keyEnd - keyStart },
                value,
            });
            skipSpace();
            if (text[at] === ",") {
                at += 1;
                continue;
            }
            at += 1;
            return;
        }
    }

    const root = readValue("");
    nodes.set("", { key: root, value: root });
    return nodes;
}

/**
 * The range to mark for one issue.
 *
 * A value that exists is what the message is about. A path whose leaf is absent (a required
 * field, a rejected key) points at the nearest object that does exist, and there the key is
 * the useful target: marking the whole descriptor would shade ten lines to report one.
 */
function rangeForIssue(text: string, nodes: Map<string, Node>, path: readonly PropertyKey[]): Span {
    if (path.length === 0) {
        return { offset: firstToken(text), length: 1 };
    }
    for (let length = path.length; length >= 0; length -= 1) {
        const node = nodes.get(path.slice(0, length).map(String).join(PATH_SEPARATOR));
        if (node === undefined) {
            continue;
        }
        if (length < path.length) {
            return node.key;
        }
        const first = text[node.value.offset];
        return first === "{" || first === "[" ? node.key : node.value;
    }
    return { offset: firstToken(text), length: 1 };
}

/** The first character that is not whitespace; where a document-level problem starts. */
function firstToken(text: string): number {
    const match = /\S/u.exec(text);
    return match === null ? 0 : match.index;
}

/** 1-based line and column of a character offset, counted the way an editor counts. */
function positionAt(text: string, offset: number): { line: number; column: number } {
    const clamped = Math.max(0, Math.min(offset, text.length));
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < clamped; index += 1) {
        if (text[index] === "\n") {
            line += 1;
            lineStart = index + 1;
        }
    }
    return { line, column: clamped - lineStart + 1 };
}

/** Where the parser stopped, from whichever coordinate its message names. */
function syntaxOffset(text: string, message: string): number {
    const position = /at position (\d+)/u.exec(message);
    if (position !== null) {
        return Math.min(Number(position[1]), text.length);
    }
    const lineColumn = /line (\d+) column (\d+)/u.exec(message);
    if (lineColumn !== null) {
        let line = 1;
        let index = 0;
        while (line < Number(lineColumn[1]) && index < text.length) {
            if (text[index] === "\n") {
                line += 1;
            }
            index += 1;
        }
        return Math.min(index + Number(lineColumn[2]) - 1, text.length);
    }
    // A message with no offset still says which failure it is. An unfinished document is
    // reported at the end the reader has to continue from; a token the parser refused is
    // reported at that last character, not one past it.
    const last = text.trimEnd().length;
    return /unexpected end of json input/iu.test(message) ? last : Math.max(0, last - 1);
}

/** The parser's coordinates are reported separately, so drop them from its sentence. */
function cleanSyntaxMessage(message: string): string {
    return message.replace(/ in JSON at position \d+(?: \(line \d+ column \d+\))?/u, "");
}

/** One located issue, from a path, a message and a range. */
function issueAt(text: string, path: string, message: string, span: Span): EncoderIssue {
    const position = positionAt(text, span.offset);
    return {
        path,
        message,
        line: position.line,
        column: position.column,
        offset: span.offset,
        length: Math.max(1, span.length),
    };
}

/** The document against the generated contract, not against the editor. */
export function parseEncoderDocument(text: string): ParsedEncoderDocument {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        const message = error instanceof Error ? error.message : "The document could not be read.";
        return {
            status: "invalid",
            summary: "The document is not valid JSON.",
            issues: [
                issueAt(text, "document", cleanSyntaxMessage(message), {
                    offset: syntaxOffset(text, message),
                    length: 1,
                }),
            ],
        };
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {
            status: "invalid",
            summary:
                'The document must be one object keyed by the parameter\'s CLI spelling, for example {"--crf": { … }}.',
            issues: [
                issueAt(
                    text,
                    "document",
                    `The document is ${describeValue(value)}; the descriptor set is one object.`,
                    { offset: firstToken(text), length: 1 },
                ),
            ],
        };
    }
    const result = EncoderParametersUpdateSchema.safeParse({ parameters: value });
    if (!result.success) {
        const nodes = scanLocations(text);
        const seen = new Set<string>();
        const issues: EncoderIssue[] = [];
        for (const flat of flattenIssues(result.error.issues)) {
            const path = flat.path.length === 0 ? "document" : flat.path.map(String).join(".");
            const key = `${path}${PATH_SEPARATOR}${flat.message}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            issues.push(issueAt(text, path, flat.message, rangeForIssue(text, nodes, flat.path)));
        }
        return {
            status: "invalid",
            summary:
                issues.length === 1
                    ? "The document does not match the descriptor schema."
                    : `The document does not match the descriptor schema (${String(
                          issues.length,
                      )} problems).`,
            issues,
        };
    }
    return { status: "valid", parameters: result.data.parameters };
}

/** What a non-object document actually is, so the message does not guess. */
function describeValue(value: unknown): string {
    if (Array.isArray(value)) {
        return "an array";
    }
    if (value === null) {
        return "null";
    }
    return `a ${typeof value}`;
}

/** The pretty form every save writes, so a whitespace-only edit is not a draft. */
export function encoderDocumentText(parameters: Record<string, ParameterDescriptor>): string {
    return `${JSON.stringify(parameters, null, 2)}\n`;
}

/** The count a summary line states, singular or plural. */
export function descriptorCount(parameters: Record<string, ParameterDescriptor>): string {
    const count = Object.keys(parameters).length;
    return `${String(count)} ${count === 1 ? "descriptor" : "descriptors"}`;
}
