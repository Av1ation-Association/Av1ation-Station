import { describe, expect, it } from "vitest";

import {
    descriptorFromDraft,
    validateParameterDraft,
    type ParameterDraftInput,
} from "./parameter-draft-rules";

const BASE: ParameterDraftInput = {
    prefix: "--",
    name: "crf",
    label: "Constant Rate Factor",
    kind: "Decimal",
    widget: "Auto",
    choices: [],
    choiceNumeric: false,
    textFormat: "Plain",
    pathDirectory: false,
    pathAccept: "",
    rawDefault: "24",
    flagOn: true,
    description: "Quality target",
    docLink: "https://example.com/crf",
    min: "0",
    max: "63",
    step: "1",
    unit: "",
    group: "Quality",
    advanced: false,
    relations: [],
};

function draft(overrides: Partial<ParameterDraftInput> = {}): ParameterDraftInput {
    return { ...BASE, ...overrides };
}

describe("parameter draft rules", () => {
    it("rejects a key that already belongs to another descriptor", () => {
        expect(
            validateParameterDraft(draft(), {
                editing: false,
                taken: new Set(["--crf"]),
            }),
        ).toContain("already exists");
    });

    it("requires a switch to stay inside its 0 and 1 range", () => {
        expect(
            validateParameterDraft(
                draft({ kind: "Number", widget: "Switch", min: "0", max: "2" }),
                { editing: false, taken: new Set() },
            ),
        ).toContain("0 or 1");
    });

    it("builds a text descriptor with trimmed copy and explicit null links", () => {
        const descriptor = descriptorFromDraft(
            draft({
                kind: "Text",
                name: "  qp  ",
                label: " Quantizer ",
                description: " ",
                docLink: " ",
                textFormat: "URL",
                group: " ",
                rawDefault: "slow",
            }),
        );

        expect(descriptor).toMatchObject({
            label: "Quantizer",
            description: null,
            doc_link: null,
            group: null,
            delimiter: "Space",
            default: "slow",
            kind: { Text: { format: "Url" } },
        });
    });

    it("builds numeric choices and their default from the edited rows", () => {
        const descriptor = descriptorFromDraft(
            draft({
                kind: "Choice",
                choices: [
                    { value: "1", label: "Fast", description: "" },
                    { value: "2", label: "Quality", description: "More detail" },
                ],
                choiceNumeric: true,
                rawDefault: "2",
            }),
        );

        expect(descriptor).toMatchObject({
            kind: {
                Choice: {
                    value_kind: "Number",
                    options: [
                        { value: 1, label: "Fast", description: null },
                        {
                            value: 2,
                            label: "Quality",
                            description: "More detail",
                        },
                    ],
                },
            },
            default: 2,
        });
    });
});
