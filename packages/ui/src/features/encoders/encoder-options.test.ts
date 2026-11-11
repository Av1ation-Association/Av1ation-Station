import { describe, expect, it } from "vitest";

import type { ParameterDescriptor } from "@av1ation/contracts";

import {
    buildBoolOption,
    buildOption,
    canonicalOf,
    mergeDescriptor,
    optionName,
    optionPrefix,
    readOption,
    startingValue,
    withOptionValue,
} from "./encoder-options";

function descriptor(patch: Partial<ParameterDescriptor>): ParameterDescriptor {
    return {
        delimiter: "Space",
        label: "Parameter",
        description: null,
        doc_link: null,
        kind: "Flag",
        default: null,
        widget: "Auto",
        advanced: false,
        group: null,
        relations: [],
        ...patch,
    } as ParameterDescriptor;
}

describe("encoder options", () => {
    it("keys options by the flag without its dashes, as the engine does", () => {
        expect(optionName("--crf")).toBe("crf");
        expect(optionName("-y")).toBe("y");
        expect(optionPrefix("--crf")).toBe("--");
        expect(optionPrefix("-y")).toBe("-");
    });

    it("writes a number with the descriptor's own delimiter", () => {
        const joined = buildOption(
            "--crf",
            descriptor({
                kind: { Number: { integer: false, min: null, max: null, step: null, unit: null } },
                delimiter: { Joined: "=" },
            }),
            22,
        );
        expect(joined).toEqual({
            Number: { prefix: "--", delimiter: "=", value: 22 },
        });

        const spaced = buildOption(
            "--preset",
            descriptor({
                kind: { Number: { integer: true, min: null, max: null, step: null, unit: null } },
                delimiter: "Space",
            }),
            4,
        );
        expect(spaced).toEqual({
            Number: { prefix: "--", delimiter: " ", value: 4 },
        });
    });

    it("writes a flag without a delimiter and a text value as one argument", () => {
        expect(buildOption("--tune", descriptor({ kind: "Flag" }), true)).toEqual({
            Bool: { prefix: "--", value: true },
        });
        expect(buildBoolOption("-y", false)).toEqual({
            Bool: { prefix: "-", value: false },
        });
        expect(
            buildOption(
                "--output",
                descriptor({
                    kind: {
                        Text: { multiline: false, pattern: null, max_len: null, format: null },
                    },
                }),
                "a.mkv",
            ),
        ).toEqual({
            String: { prefix: "--", delimiter: " ", value: "a.mkv" },
        });
    });

    it("changes a stored option's value without changing its flag", () => {
        const stored = { Number: { prefix: "--", delimiter: "=", value: 22 } };
        expect(readOption(stored)).toEqual({
            kind: "Number",
            prefix: "--",
            delimiter: "=",
            value: 22,
        });
        expect(withOptionValue(stored, 30)).toEqual({
            Number: { prefix: "--", delimiter: "=", value: 30 },
        });
        expect(withOptionValue({ Bool: { prefix: "-y", value: true } }, false)).toEqual({
            Bool: { prefix: "-y", value: false },
        });
        // A stored option always reads back with the spelling the catalogue knows.
        expect(canonicalOf("crf", stored)).toBe("--crf");
    });

    it("keeps the documented row while taking the build's own value evidence", () => {
        const base = descriptor({
            label: "Constant Rate Factor",
            description: "from 1 to 70 in 0.25 steps",
            doc_link: "https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md",
            group: "Rate control",
            kind: { Number: { integer: false, min: 1, max: 70, step: 0.25, unit: null } },
        });
        const probed = descriptor({
            label: "Crf",
            delimiter: { Joined: "=" },
            kind: { Number: { integer: true, min: null, max: null, step: null, unit: null } },
            default: 30,
        });
        const merged = mergeDescriptor(base, probed);
        expect(merged?.label).toBe("Constant Rate Factor");
        expect(merged?.group).toBe("Rate control");
        expect(merged?.delimiter).toEqual({ Joined: "=" });
        expect(merged?.default).toBe(30);
        // The researched range keeps its step rather than the probe's bare integer.
        expect(merged?.kind).toEqual(base.kind);

        // A build that prints `--crf  …` without a metavar proves the switch takes a value.
        const switchRow = descriptor({ kind: "Flag", label: "Cdef" });
        const proven = descriptor({
            kind: { Number: { integer: true, min: 0, max: 1, step: null, unit: null } },
        });
        expect(mergeDescriptor(switchRow, proven)?.kind).toEqual(proven.kind);
        // A probe that saw no value does not turn a documented number back into a switch.
        expect(mergeDescriptor(base, descriptor({ kind: "Flag" }))?.kind).toEqual(base.kind);
        expect(mergeDescriptor(undefined, proven)).toBe(proven);
        expect(mergeDescriptor(switchRow, undefined)).toBe(switchRow);
    });

    it("starts a new parameter from its documented default, or a usable empty value", () => {
        expect(
            startingValue(
                descriptor({
                    kind: {
                        Number: { integer: true, min: null, max: null, step: null, unit: null },
                    },
                    default: 26,
                }),
            ),
        ).toBe(26);
        // A flag is emitted when true, so setting one always means turning it on.
        expect(startingValue(descriptor({ kind: "Flag", default: false }))).toBe(true);
        expect(
            startingValue(
                descriptor({
                    kind: {
                        Text: { multiline: false, pattern: null, max_len: null, format: null },
                    },
                }),
            ),
        ).toBe("");
        expect(startingValue(descriptor({ kind: "Flag" }))).toBe(true);
    });
});
