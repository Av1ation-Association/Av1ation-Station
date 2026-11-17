import type { ParameterDescriptor } from "@av1ation/contracts";

import type { DelimiterValue } from "./delimiter-label";
import type { ParameterKindName } from "./parameter-summary";
import {
    contractFormat,
    makeWidget,
    typedValue,
    type ChoiceDraft,
    type RelationDraft,
    type TextFormatName,
    type WidgetChoice,
} from "./parameter-drafts";

/** The scalar fields a parameter sheet edits, without React state or callbacks. */
export interface ParameterDraftInput {
    prefix: string;
    name: string;
    /** The existing separator is preserved when another field is edited. */
    delimiter: DelimiterValue | null;
    label: string;
    kind: ParameterKindName;
    widget: WidgetChoice;
    choices: readonly ChoiceDraft[];
    choiceNumeric: boolean;
    textFormat: TextFormatName;
    pathDirectory: boolean;
    pathAccept: string;
    rawDefault: string;
    flagOn: boolean;
    description: string;
    docLink: string;
    min: string;
    max: string;
    step: string;
    unit: string;
    group: string;
    advanced: boolean;
    relations: readonly RelationDraft[];
}

/** The one spelling of a descriptor key, shared by validation and construction. */
export function canonicalParameterKey(prefix: string, name: string): string {
    return `${prefix}${name.trim()}`;
}

function isNumeric(value: string): boolean {
    return value.trim() !== "" && Number.isFinite(Number(value));
}

function filledChoices(choices: readonly ChoiceDraft[]) {
    return choices
        .map((choice) => ({
            value: choice.value.trim(),
            label: choice.label.trim(),
            description: choice.description.trim(),
        }))
        .filter((choice) => choice.value !== "");
}

/**
 * The service's local validation, before a descriptor is handed to the draft.
 *
 * Returning the first message keeps the sheet's feedback stable; the caller decides where
 * to present it. `editing` exempts an existing key from the duplicate check.
 */
export function validateParameterDraft(
    draft: ParameterDraftInput,
    { editing, taken }: { editing: boolean; taken: ReadonlySet<string> },
): string | null {
    const canonical = canonicalParameterKey(draft.prefix, draft.name);
    if (!/^-{0,2}[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(canonical)) {
        return "Use a CLI spelling such as --enable-custom-thing.";
    }
    if (!editing && taken.has(canonical)) {
        return "That parameter already exists. Edit the existing row instead.";
    }
    if (draft.label.trim() === "") {
        return "Give the parameter a label.";
    }
    const choices = filledChoices(draft.choices);
    if (draft.kind === "Choice") {
        if (choices.length < 2) {
            return "A choice needs at least two values.";
        }
        if (new Set(choices.map((choice) => choice.value)).size !== choices.length) {
            return "Choice values must be unique.";
        }
        if (draft.choiceNumeric && choices.some((choice) => !isNumeric(choice.value))) {
            return "Every numbered choice needs a numeric value.";
        }
        if (
            draft.rawDefault.trim() !== "" &&
            !choices.some((choice) => choice.value === draft.rawDefault.trim())
        ) {
            return "The default must be one of the choice values.";
        }
    }
    if (draft.kind === "Number" || draft.kind === "Decimal") {
        if (
            (draft.min.trim() !== "" && !isNumeric(draft.min)) ||
            (draft.max.trim() !== "" && !isNumeric(draft.max))
        ) {
            return "Minimum and maximum must be numbers.";
        }
        if (isNumeric(draft.min) && isNumeric(draft.max) && Number(draft.min) > Number(draft.max)) {
            return "The minimum cannot be greater than the maximum.";
        }
        if (draft.step.trim() !== "" && (!isNumeric(draft.step) || Number(draft.step) <= 0)) {
            return "The step must be a positive number.";
        }
        if (draft.widget === "Switch" && (Number(draft.min) !== 0 || Number(draft.max) !== 1)) {
            return "A switch writes 0 or 1; set the range to 0–1.";
        }
        if (draft.rawDefault.trim() !== "" && !isNumeric(draft.rawDefault)) {
            return "A number parameter needs a numeric default.";
        }
    }
    for (const relation of draft.relations) {
        if (relation.other.trim() === "") {
            return "Choose the parameter a relation requires.";
        }
        if (relation.other.trim() === canonical) {
            return "A parameter cannot require itself.";
        }
    }
    return null;
}

/**
 * Converts a validated draft into the descriptor the service receives.
 *
 * Kept separate from validation so the rules can be tested against messages and the shape
 * can be tested against the contract without mounting the sheet.
 */
export function descriptorFromDraft(draft: ParameterDraftInput): ParameterDescriptor {
    const canonical = canonicalParameterKey(draft.prefix, draft.name);
    const choices = filledChoices(draft.choices);
    const common = {
        label: draft.label.trim(),
        description: draft.description.trim() === "" ? null : draft.description.trim(),
        doc_link: draft.docLink.trim() === "" ? null : draft.docLink.trim(),
        widget: makeWidget(draft.widget, draft.step),
        advanced: draft.advanced,
        group: draft.group.trim() === "" ? null : draft.group.trim(),
        relations: draft.relations
            .filter((relation) => relation.other.trim() !== "")
            .map((relation) => ({
                Requires: {
                    other: relation.other.trim(),
                    equals: typedValue(relation.equals),
                    message:
                        relation.message.trim() === ""
                            ? `${canonical} requires ${relation.other.trim()}`
                            : relation.message.trim(),
                },
            })),
    };
    if (draft.kind === "Flag") {
        return {
            ...common,
            delimiter: null,
            kind: "Flag",
            default: draft.flagOn,
        } as ParameterDescriptor;
    }
    if (draft.kind === "Number" || draft.kind === "Decimal") {
        return {
            ...common,
            delimiter: draft.delimiter ?? "Space",
            kind: {
                Number: {
                    integer: draft.kind === "Number",
                    min: isNumeric(draft.min) ? Number(draft.min) : null,
                    max: isNumeric(draft.max) ? Number(draft.max) : null,
                    step: isNumeric(draft.step) ? Number(draft.step) : null,
                    unit: draft.unit.trim() === "" ? null : draft.unit.trim(),
                },
            },
            default: isNumeric(draft.rawDefault) ? Number(draft.rawDefault) : null,
        } as ParameterDescriptor;
    }
    if (draft.kind === "Choice") {
        return {
            ...common,
            delimiter: draft.delimiter ?? "Space",
            kind: {
                Choice: {
                    options: choices.map((choice) => ({
                        value: draft.choiceNumeric ? Number(choice.value) : choice.value,
                        label: choice.label === "" ? choice.value : choice.label,
                        description: choice.description === "" ? null : choice.description,
                        doc_link: null,
                    })),
                    value_kind: draft.choiceNumeric ? "Number" : "Text",
                    multiple: false,
                    min_selected: 1,
                    max_selected: 1,
                },
            },
            default: choices.some((choice) => choice.value === draft.rawDefault.trim())
                ? draft.choiceNumeric
                    ? Number(draft.rawDefault.trim())
                    : draft.rawDefault.trim()
                : null,
        } as ParameterDescriptor;
    }
    if (draft.kind === "Path") {
        const accept = [
            ...new Set(
                draft.pathAccept
                    .split(/[,\n]/u)
                    .map((extension) => extension.trim().replace(/^\./u, ""))
                    .filter(Boolean),
            ),
        ];
        return {
            ...common,
            delimiter: draft.delimiter ?? "Space",
            kind: { Path: { directory: draft.pathDirectory, accept } },
            default: draft.rawDefault.trim() === "" ? null : draft.rawDefault.trim(),
        } as ParameterDescriptor;
    }
    return {
        ...common,
        delimiter: draft.delimiter ?? "Space",
        kind: {
            Text: {
                max_len: null,
                pattern: null,
                multiline: false,
                format: contractFormat(draft.textFormat),
            },
        },
        default: draft.rawDefault,
    } as ParameterDescriptor;
}
