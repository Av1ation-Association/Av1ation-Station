import { describe, expect, it } from "vitest";

import { DESCRIPTOR_DOCUMENT_SCHEMA } from "./encoder-json-schema";

/**
 * The editor's hover and completion text is the contract's own, so a field description that
 * changes in the Rust model changes in the editor without anybody editing a second list.
 */
describe("descriptor document schema", () => {
    it("describes every entry of the map with the contract's field help", () => {
        const descriptor = DESCRIPTOR_DOCUMENT_SCHEMA.additionalProperties as {
            properties: Record<string, { description?: string }>;
            required?: string[];
        };

        expect(DESCRIPTOR_DOCUMENT_SCHEMA.type).toBe("object");
        expect(descriptor.properties["label"]?.description).toBe("Human-readable field label.");
        expect(descriptor.required).toContain("label");
        expect(descriptor.required).toContain("kind");
    });

    it("keeps the descriptor's definitions at the root so its references resolve", () => {
        const descriptor = DESCRIPTOR_DOCUMENT_SCHEMA.additionalProperties as {
            properties: Record<string, unknown>;
        };
        const definitions = DESCRIPTOR_DOCUMENT_SCHEMA.$defs as Record<string, unknown>;

        // A `$ref` resolves against the document it appears in; the descriptor became a
        // subschema, so its `$defs` has to sit beside it, not inside it.
        expect(descriptor.properties["kind"]).toEqual({
            description: "The value type and all of its constraints.",
            $ref: "#/$defs/ParameterKind",
        });
        expect(definitions["ParameterKind"]).toBeDefined();
    });

    it("states the dialect the emitted schema uses", () => {
        expect(DESCRIPTOR_DOCUMENT_SCHEMA.$schema).toBe(
            "https://json-schema.org/draft/2020-12/schema",
        );
    });

    it("accepts any CLI spelling as a key, which is what completion offers", () => {
        // The map's keys are parameter names, so the descriptor schema is the value schema;
        // completion inside a descriptor comes from that object's own properties.
        expect(DESCRIPTOR_DOCUMENT_SCHEMA.additionalProperties).toBeDefined();
        expect(DESCRIPTOR_DOCUMENT_SCHEMA.properties).toBeUndefined();
    });
});
