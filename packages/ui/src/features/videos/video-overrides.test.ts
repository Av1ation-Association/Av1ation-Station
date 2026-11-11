import { describe, expect, it } from "vitest";

import type { SectionDefinition } from "../../shared/model/section-definitions";
import {
    mergeSectionOverrides,
    sameValue,
    sectionDraft,
    sectionOverrideCount,
} from "./video-overrides";

function definition(
    id: SectionDefinition["id"],
    parts: Array<{ key: string; optional: boolean }>,
): SectionDefinition {
    return {
        id,
        title: id,
        description: "",
        note: "",
        outputs: [],
        parts: parts.map((part) => ({
            ...part,
            title: part.key,
            description: "",
        })),
    };
}

describe("sectionDraft", () => {
    it("keeps a disabled optional sequence disabled instead of filling it with an empty object", () => {
        const draft = sectionDraft(
            definition("noise-generation", [
                { key: "noise_detector", optional: true },
                { key: "noise_scaler", optional: true },
            ]),
            {
                sequences: {
                    noise_detector: null,
                    noise_scaler: { threshold: 0.05 },
                },
            },
        );

        expect(draft).toEqual({
            noise_detector: null,
            noise_scaler: { threshold: 0.05 },
        });
    });

    it("omits an optional part the document never carried", () => {
        const draft = sectionDraft(
            definition("quality-check", [{ key: "quality_check", optional: true }]),
            { sequences: {} },
        );

        expect(draft).toEqual({});
    });

    it("always drafts the encoder part", () => {
        const draft = sectionDraft(definition("encoding", [{ key: "encoder", optional: false }]), {
            sequences: {},
            encoder: { SVTAV1: {} },
        });

        expect(draft).toEqual({ encoder: { SVTAV1: {} } });
    });
});

describe("mergeSectionOverrides", () => {
    const noise = definition("noise-generation", [
        { key: "noise_detector", optional: true },
        { key: "noise_scaler", optional: true },
    ]);

    it("writes a changed part, drops one that matches the project, and keeps the rest", () => {
        const base = {
            sequences: {
                noise_detector: null,
                noise_scaler: { threshold: 0.05 },
                parallel_encoder: { input: null },
            },
        };
        const next = {
            sequences: {
                noise_detector: { input: null },
                noise_scaler: { threshold: 0.05 },
                parallel_encoder: { input: null },
            },
        };
        const fields = {
            "sequences.noise_scaler": { threshold: 0.1 },
            "sequences.parallel_encoder": { input: null },
        };

        expect(mergeSectionOverrides(fields, noise, base, next)).toEqual({
            "sequences.noise_detector": { input: null },
            "sequences.parallel_encoder": { input: null },
        });
    });

    it("writes a whole encoder replacement when the variant changes", () => {
        const encoding = definition("encoding", [{ key: "encoder", optional: false }]);
        const base = { encoder: { SVTAV1: { pass: { All: 1 } } } };
        const next = { encoder: { SVTX265: { pass: { All: 1 } } } };

        expect(mergeSectionOverrides({}, encoding, base, next)).toEqual({
            encoder: { SVTX265: { pass: { All: 1 } } },
        });
    });

    it("treats 1 and 1.0 as the same value", () => {
        const encoding = definition("encoding", [{ key: "encoder", optional: false }]);
        const base = { encoder: { SVTAV1: { pass: { All: 1 } } } };
        const next = { encoder: { SVTAV1: { pass: { All: 1.0 } } } };

        expect(mergeSectionOverrides({}, encoding, base, next)).toEqual({});
        expect(sameValue(1, 1.0)).toBe(true);
    });

    it("counts only the parts this section owns", () => {
        const fields = {
            "sequences.noise_detector": {},
            "sequences.parallel_encoder": {},
            encoder: {},
        };

        expect(sectionOverrideCount(fields, noise)).toBe(1);
    });
});
