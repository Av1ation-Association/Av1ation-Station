import type { Mark, ParameterDescriptor } from "@av1ation/contracts";

export const TEXT_FORMATS = ["Plain", "Email", "URL", "ISO-8601 date/time"] as const;
export type TextFormatName = (typeof TEXT_FORMATS)[number];

export function contractFormat(format: TextFormatName): "Email" | "Url" | "DateTime" | null {
    return format === "Plain"
        ? null
        : format === "URL"
          ? "Url"
          : format === "Email"
            ? "Email"
            : "DateTime";
}

export function textFormatOf(descriptor: ParameterDescriptor | null): TextFormatName {
    if (
        descriptor === null ||
        typeof descriptor.kind !== "object" ||
        !("Text" in descriptor.kind)
    ) {
        return "Plain";
    }
    const format = (descriptor.kind.Text as { format?: string | null }).format;
    return format === "Email"
        ? "Email"
        : format === "Url"
          ? "URL"
          : format === "DateTime"
            ? "ISO-8601 date/time"
            : "Plain";
}

/** The widgets the sheet can force, or `Auto` to derive one from the kind. */
export type WidgetChoice =
    | "Auto"
    | "Slider"
    | "NumberInput"
    | "TextInput"
    | "Toggle"
    | "Switch"
    | "Radio"
    | "Segmented"
    | "Dropdown";

/** One editable mark row in the descriptor sheet. */
export interface MarkDraft {
    value: string;
    label: string;
}

export function widgetOf(descriptor: ParameterDescriptor): WidgetChoice {
    const widget = descriptor.widget;
    if (typeof widget === "string") {
        return widget === "Toggle" || widget === "Switch" ? widget : "Auto";
    }
    if ("Slider" in widget) {
        return "Slider";
    }
    if ("NumberInput" in widget) {
        return "NumberInput";
    }
    if ("TextInput" in widget) {
        return "TextInput";
    }
    if ("ChoiceInput" in widget) {
        const presentation = widget.ChoiceInput.presentation;
        return presentation === "Auto" ? "Auto" : presentation;
    }
    return "Auto";
}

export function makeWidget(
    choice: WidgetChoice,
    step: string,
    marks: readonly MarkDraft[] = [],
): ParameterDescriptor["widget"] {
    if (choice === "Toggle") {
        return "Toggle";
    }
    if (choice === "Switch") {
        return "Switch";
    }
    if (choice === "Slider") {
        return {
            Slider: {
                step: step.trim() === "" ? null : Number(step),
                marks: marks
                    .filter((mark) => mark.value.trim() !== "")
                    .map((mark) => {
                        const label = mark.label.trim();
                        return {
                            value: Number(mark.value),
                            label: label === "" ? null : label,
                        };
                    })
                    .sort((left, right) => left.value - right.value),
            },
        };
    }
    if (choice === "NumberInput") {
        return { NumberInput: { step: step.trim() === "" ? null : Number(step) } };
    }
    if (choice === "TextInput") {
        return { TextInput: { placeholder: null, multiline: false } };
    }
    if (choice === "Radio" || choice === "Segmented" || choice === "Dropdown") {
        return { ChoiceInput: { presentation: choice } };
    }
    return "Auto";
}

/** The stored marks a descriptor carries, as editable text rows. */
export function markDrafts(descriptor: ParameterDescriptor): MarkDraft[] {
    if (typeof descriptor.widget !== "object" || !("Slider" in descriptor.widget)) {
        return [];
    }
    return (descriptor.widget.Slider.marks as Mark[]).map((mark) => ({
        value: String(mark.value),
        label: mark.label ?? "",
    }));
}

/** One editable choice row: the value the encoder receives and the label the user reads. */
export interface ChoiceDraft {
    value: string;
    label: string;
    description: string;
}

/** The choices a descriptor accepts, in the order it draws them. */
export function choiceDrafts(descriptor: ParameterDescriptor): ChoiceDraft[] {
    const kind = descriptor.kind;
    if (typeof kind !== "object" || !("Choice" in kind)) {
        return [];
    }
    const options = kind.Choice.options as Array<{
        value: unknown;
        label?: unknown;
        description?: unknown;
    }>;
    return options.flatMap((option) => {
        const value = option.value;
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
            return [];
        }
        const text = String(value);
        return [
            {
                value: text,
                label: typeof option.label === "string" ? option.label : text,
                description: typeof option.description === "string" ? option.description : "",
            },
        ];
    });
}

/** Whether the encoder receives numbers; the labels are then editable beside them. */
export function choiceIsNumeric(descriptor: ParameterDescriptor): boolean {
    const kind = descriptor.kind;
    if (typeof kind !== "object" || !("Choice" in kind)) {
        return false;
    }
    const spec = kind.Choice as {
        value_kind?: "Text" | "Number" | null;
        options: Array<{ value: unknown }>;
    };
    if (spec.value_kind === "Number") {
        return true;
    }
    if (spec.value_kind === "Text") {
        return false;
    }
    return (
        spec.options.length > 0 && spec.options.every((option) => typeof option.value === "number")
    );
}

export function filledChoiceCount(choices: ChoiceDraft[]): number {
    return choices.filter((choice) => choice.value.trim() !== "").length;
}

/** A relation is edited as text and becomes a typed `Requires` rule on save. */
export interface RelationDraft {
    other: string;
    equals: string;
    message: string;
}

export function relationsOf(descriptor: ParameterDescriptor | null): RelationDraft[] {
    if (descriptor === null) {
        return [];
    }
    return descriptor.relations.flatMap((relation) => {
        if (!("Requires" in relation)) {
            return [];
        }
        const value = relation.Requires.equals;
        return [
            {
                other: relation.Requires.other,
                equals:
                    typeof value === "string" || typeof value === "number"
                        ? String(value)
                        : typeof value === "boolean"
                          ? String(value)
                          : "",
                message: relation.Requires.message,
            },
        ];
    });
}

export function typedValue(raw: string): unknown {
    const trimmed = raw.trim();
    if (trimmed === "true") {
        return true;
    }
    if (trimmed === "false") {
        return false;
    }
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
        return Number(trimmed);
    }
    return trimmed;
}
