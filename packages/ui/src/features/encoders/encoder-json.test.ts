import { describe, expect, it } from "vitest";

import { descriptorCount, encoderDocumentText, parseEncoderDocument } from "./encoder-json";

/** One descriptor per line, so a reported line number is unambiguous. */
const LINES = [
    "{",
    '  "--crf": {',
    '    "label": "Constant Rate Factor",',
    '    "kind": "Flag",',
    '    "widget": "Auto"',
    "  }",
    "}",
];

describe("encoder JSON document", () => {
    it("accepts a descriptor keyed by its CLI spelling", () => {
        const result = parseEncoderDocument(
            '{"--crf": {"label": "Constant Rate Factor", "kind": "Flag", "widget": "Auto"}}',
        );
        expect(result.status).toBe("valid");
        if (result.status === "valid") {
            expect(result.parameters["--crf"]?.label).toBe("Constant Rate Factor");
        }
    });

    it("applies the contract's defaults to a minimal descriptor", () => {
        const result = parseEncoderDocument(
            '{"--crf": {"label": "CRF", "kind": "Flag", "widget": "Auto"}}',
        );
        expect(result.status).toBe("valid");
        if (result.status === "valid") {
            expect(result.parameters["--crf"]?.advanced).toBe(false);
            expect(result.parameters["--crf"]?.relations).toEqual([]);
        }
    });

    it("reports where the parser stopped in text that is not JSON", () => {
        const text = ["{", '  "--crf": 12,', "}"].join("\n");
        const result = parseEncoderDocument(text);
        expect(result.status).toBe("invalid");
        if (result.status === "invalid") {
            expect(result.summary).toContain("not valid JSON");
            expect(result.issues).toHaveLength(1);
            // The closing brace stands where a property name was expected.
            expect(result.issues[0]?.line).toBe(3);
            expect(result.issues[0]?.column).toBe(1);
            expect(result.issues[0]?.offset).toBe(text.lastIndexOf("}"));
            expect(result.issues[0]?.message).not.toContain("at position");
        }
    });

    it("points at the end when the document stops early", () => {
        const text = '{\n  "--crf": ';
        const result = parseEncoderDocument(text);
        expect(result.status).toBe("invalid");
        if (result.status === "invalid") {
            expect(result.issues[0]?.message).toContain("Unexpected end of JSON input");
            expect(result.issues[0]?.line).toBe(2);
            expect(result.issues[0]?.column).toBe(11);
        }
    });

    it("rejects a document that is not an object", () => {
        for (const text of ["[]", "null", '"crf"', "24"]) {
            const result = parseEncoderDocument(text);
            expect(result.status).toBe("invalid");
            if (result.status === "invalid") {
                expect(result.issues[0]?.line).toBe(1);
                expect(result.issues[0]?.column).toBe(1);
            }
        }
        const array = parseEncoderDocument("[]");
        expect(array.status === "invalid" && array.issues[0]?.message).toContain("array");
    });

    it("locates the field the contract rejected, not the descriptor around it", () => {
        const text = LINES.map((line) =>
            line.includes('"Constant Rate Factor"')
                ? line.replace('"Constant Rate Factor"', "12")
                : line,
        ).join("\n");
        const result = parseEncoderDocument(text);
        expect(result.status).toBe("invalid");
        if (result.status !== "invalid") {
            return;
        }
        // The generator wraps one field problem in a descriptor-level custom issue; the
        // message that reaches the user must name the field and its line.
        expect(result.issues).toHaveLength(1);
        const issue = result.issues[0];
        expect(issue?.path).toBe("--crf.label");
        expect(issue?.message).toContain("expected string, received number");
        expect(issue?.line).toBe(3);
        expect(issue?.column).toBe(14);
    });

    it("points a missing field at the descriptor that lacks it", () => {
        const text = LINES.filter((line) => !line.includes("Constant Rate Factor")).join("\n");
        const result = parseEncoderDocument(text);
        expect(result.status).toBe("invalid");
        if (result.status !== "invalid") {
            return;
        }
        expect(result.issues[0]?.path).toBe("--crf.label");
        expect(result.issues[0]?.message).toContain("received undefined");
        // The field does not exist, so the key is the closest thing to point at.
        expect(result.issues[0]?.line).toBe(2);
        expect(result.issues[0]?.column).toBe(3);
    });

    it("names the descriptor path of every schema problem", () => {
        const result = parseEncoderDocument('{"--crf": {"kind": "Flag", "widget": "Auto"}}');
        expect(result.status).toBe("invalid");
        if (result.status === "invalid") {
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues.every((issue) => issue.path.startsWith("--crf"))).toBe(true);
        }
    });

    it("rejects a key the encoder cannot spell as a flag", () => {
        const result = parseEncoderDocument(
            '{"not a key": {"label": "X", "kind": "Flag", "widget": "Auto"}}',
        );
        expect(result.status).toBe("invalid");
    });

    it("writes a document it just accepted without changing its meaning", () => {
        const result = parseEncoderDocument(
            '{"--crf": {"label": "CRF", "kind": "Flag", "widget": "Auto"}}',
        );
        expect(result.status).toBe("valid");
        if (result.status === "valid") {
            const again = parseEncoderDocument(encoderDocumentText(result.parameters));
            expect(again.status).toBe("valid");
            if (again.status === "valid") {
                expect(again.parameters).toEqual(result.parameters);
            }
        }
    });

    it("counts one descriptor without pluralising it", () => {
        const result = parseEncoderDocument(
            '{"--crf": {"label": "CRF", "kind": "Flag", "widget": "Auto"}}',
        );
        expect(result.status).toBe("valid");
        if (result.status === "valid") {
            expect(descriptorCount(result.parameters)).toBe("1 descriptor");
        }
        expect(descriptorCount({})).toBe("0 descriptors");
    });
});
