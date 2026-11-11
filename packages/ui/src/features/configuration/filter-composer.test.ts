import { expect, it } from "vitest";

import { filterLabel, filterVariants } from "./FilterComposer";
import type { JsonSchema } from "../../shared/schema/config-schema";

const SCHEMA: JsonSchema = {
    title: "VapourSynthFilter",
    $defs: {
        Scaler: { type: "string", enum: ["bicubic", "lanczos"] },
        FFPixelFormat: { type: "string", enum: ["YUV420P10LE"] },
    },
    oneOf: [
        {
            type: "object",
            properties: {
                Resize: {
                    type: "object",
                    properties: {
                        scaler: { anyOf: [{ $ref: "#/$defs/Scaler" }, { type: "null" }] },
                        width: { type: ["integer", "null"] },
                        height: { type: ["integer", "null"] },
                        format: { anyOf: [{ $ref: "#/$defs/FFPixelFormat" }, { type: "null" }] },
                    },
                },
            },
        },
        {
            type: "object",
            properties: {
                Crop: {
                    type: "object",
                    properties: {
                        top: { type: ["integer", "null"] },
                        bottom: { type: ["integer", "null"] },
                    },
                },
            },
        },
    ],
};

it("reads each variant of the engine's enum schema, resolving its definitions", () => {
    const variants = filterVariants(SCHEMA);
    expect(variants.map((variant) => variant.tag)).toEqual(["Resize", "Crop"]);

    const resize = variants[0]?.schema;
    const scaler = resize?.properties?.scaler;
    // The null half of the union is resolved away, so a control is chosen for the real type.
    expect(scaler?.anyOf?.[0]?.$ref).toBe("#/$defs/Scaler");
    expect(resize?.properties?.width?.type).toEqual(["integer", "null"]);
});

it("labels a variant the way the composer shows it", () => {
    expect(filterLabel("OutputFormat")).toBe("Output format");
    expect(filterLabel("ZoomDegrain")).toBe("Zoom Degrain");
    expect(filterLabel("Resize")).toBe("Resize");
});
