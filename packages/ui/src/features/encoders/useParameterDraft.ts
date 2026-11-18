import { useEffect, useRef, useState } from "react";

import type { ParameterDescriptor } from "@av1ation/contracts";

import { defaultText, kindOf, type ParameterKindName } from "./parameter-summary";
import {
    choiceDrafts,
    choiceIsNumeric,
    markDrafts,
    relationsOf,
    textFormatOf,
    widgetOf,
    type ChoiceDraft,
    type MarkDraft,
    type RelationDraft,
    type TextFormatName,
    type WidgetChoice,
} from "./parameter-drafts";
import { readDelimiter } from "./delimiter-label";
import {
    canonicalParameterKey,
    descriptorFromDraft,
    validateParameterDraft,
} from "./parameter-draft-rules";

type InitialParameter = {
    key: string;
    descriptor: ParameterDescriptor;
} | null;

/**
 * The sheet's one draft: every field and its reset boundary. Validation and descriptor
 * construction live in `parameter-draft-rules` so they can be tested without React.
 */
export function useParameterDraft({
    open,
    initial,
    taken,
}: {
    open: boolean;
    initial: InitialParameter;
    taken: ReadonlySet<string>;
}) {
    const [prefix, setPrefix] = useState("--");
    const [name, setName] = useState("");
    const [label, setLabel] = useState("");
    const [kind, setKind] = useState<ParameterKindName>("Text");
    const [widget, setWidget] = useState<WidgetChoice>("Auto");
    const [choices, setChoices] = useState<ChoiceDraft[]>([]);
    const [choiceNumeric, setChoiceNumeric] = useState(false);
    const [textFormat, setTextFormat] = useState<TextFormatName>("Plain");
    const [pathDirectory, setPathDirectory] = useState(false);
    const [pathAccept, setPathAccept] = useState("");
    const [rawDefault, setRawDefault] = useState("");
    const [flagOn, setFlagOn] = useState(true);
    const [description, setDescription] = useState("");
    const [docLink, setDocLink] = useState("");
    const [min, setMin] = useState("");
    const [max, setMax] = useState("");
    const [step, setStep] = useState("");
    const [unit, setUnit] = useState("");
    const [group, setGroup] = useState("");
    const [advanced, setAdvanced] = useState(false);
    const [relations, setRelations] = useState<RelationDraft[]>([]);
    const [marks, setMarks] = useState<MarkDraft[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [infoOpen, setInfoOpen] = useState(false);
    const infoButton = useRef<HTMLButtonElement>(null);
    // The descriptor object is rebuilt by the parent on every render; the key is the part
    // that decides whether this is a different parameter, so only that resets the fields.
    const initialKey = initial?.key ?? null;
    const initialRef = useRef(initial);
    initialRef.current = initial;

    useEffect(() => {
        if (!open) {
            return;
        }
        const current = initialRef.current;
        const key = current?.key ?? "";
        const match = /^(--|-)?(.*)$/u.exec(key);
        setPrefix(match?.[1] ?? "--");
        setName(match?.[2] ?? "");
        setLabel(current?.descriptor.label ?? "");
        setKind(current === null ? "Text" : kindOf(current.descriptor));
        setWidget(current === null ? "Auto" : widgetOf(current.descriptor));
        setMarks(current === null ? [] : markDrafts(current.descriptor));
        setChoices(current === null ? [] : choiceDrafts(current.descriptor));
        setChoiceNumeric(current !== null && choiceIsNumeric(current.descriptor));
        setTextFormat(textFormatOf(current?.descriptor ?? null));
        const pathSpec =
            current !== null &&
            typeof current.descriptor.kind === "object" &&
            "Path" in current.descriptor.kind
                ? current.descriptor.kind.Path
                : null;
        setPathDirectory(pathSpec?.directory ?? false);
        setPathAccept((pathSpec?.accept ?? []).join(", "));
        setRawDefault(current === null ? "" : defaultText(current.descriptor));
        setFlagOn(current === null ? true : defaultText(current.descriptor) !== "false");
        setDescription(current?.descriptor.description ?? "");
        setDocLink(current?.descriptor.doc_link ?? "");
        const spec = current?.descriptor.kind;
        const numberSpec =
            spec !== undefined && typeof spec === "object" && "Number" in spec ? spec.Number : null;
        setMin(
            numberSpec?.min === undefined || numberSpec.min === null ? "" : String(numberSpec.min),
        );
        setMax(
            numberSpec?.max === undefined || numberSpec.max === null ? "" : String(numberSpec.max),
        );
        setStep(
            numberSpec?.step === undefined || numberSpec.step === null
                ? ""
                : String(numberSpec.step),
        );
        setUnit(numberSpec?.unit ?? "");
        setGroup(current?.descriptor.group ?? "");
        setAdvanced(current?.descriptor.advanced ?? false);
        setRelations(relationsOf(current?.descriptor ?? null));
        setError(null);
        setInfoOpen(false);
    }, [open, initialKey]);

    const canonical = canonicalParameterKey(prefix, name);
    const delimiter =
        kind === "Flag"
            ? null
            : (readDelimiter(initialRef.current?.descriptor.delimiter) ?? "Space");

    const apply = (onApply: (key: string, descriptor: ParameterDescriptor) => void) => {
        const input = {
            prefix,
            name,
            delimiter,
            label,
            kind,
            widget,
            marks,
            choices,
            choiceNumeric,
            textFormat,
            pathDirectory,
            pathAccept,
            rawDefault,
            flagOn,
            description,
            docLink,
            min,
            max,
            step,
            unit,
            group,
            advanced,
            relations,
        };
        const validation = validateParameterDraft(input, {
            editing: initial !== null,
            taken,
        });
        if (validation !== null) {
            setError(validation);
            return;
        }
        onApply(canonical, descriptorFromDraft(input));
    };

    const preview =
        kind === "Flag"
            ? flagOn
                ? "sent by default"
                : "omitted by default"
            : kind === "Choice"
              ? choices.find((choice) => choice.value === rawDefault.trim())?.label ||
                rawDefault ||
                "—"
              : rawDefault.trim() === ""
                ? "—"
                : rawDefault;

    return {
        prefix,
        setPrefix,
        name,
        setName,
        label,
        setLabel,
        kind,
        setKind,
        widget,
        setWidget,
        marks,
        setMarks,
        choices,
        setChoices,
        choiceNumeric,
        setChoiceNumeric,
        textFormat,
        setTextFormat,
        pathDirectory,
        setPathDirectory,
        pathAccept,
        setPathAccept,
        rawDefault,
        setRawDefault,
        flagOn,
        setFlagOn,
        description,
        setDescription,
        docLink,
        setDocLink,
        min,
        setMin,
        max,
        setMax,
        step,
        setStep,
        unit,
        setUnit,
        group,
        setGroup,
        advanced,
        setAdvanced,
        relations,
        setRelations,
        error,
        setError,
        infoOpen,
        setInfoOpen,
        infoButton,
        canonical,
        preview,
        apply,
    };
}

export type ParameterDraft = ReturnType<typeof useParameterDraft>;
