import type { ParameterDescriptor } from "@av1ation/contracts";

import { Button } from "../../shared/Button";
import { Sheet } from "../../shared/Sheet";
import { ParameterChoiceFields } from "./ParameterChoiceFields";
import { ParameterDefaultFields } from "./ParameterDefaultFields";
import { ParameterIdentityFields } from "./ParameterIdentityFields";
import { ParameterKindFields } from "./ParameterKindFields";
import { ParameterNumberFields } from "./ParameterNumberFields";
import { ParameterPreview } from "./ParameterPreview";
import { ParameterRelations } from "./ParameterRelations";
import { useParameterDraft } from "./useParameterDraft";

/**
 * Add or change one descriptor in the sheet, never in a row that reflows the table.
 *
 * The sheet is the only place a descriptor is authored, and it mirrors
 * `01 Components / Parameter editor`: identity is prefix + name, the kind owns its
 * constraints, and a relation is declared next to the values it guards.
 */
export function ParameterSheet({
    open,
    initial,
    taken,
    encoderLabel,
    onClose,
    onApply,
}: {
    open: boolean;
    initial: { key: string; descriptor: ParameterDescriptor } | null;
    taken: ReadonlySet<string>;
    encoderLabel: string;
    onClose: () => void;
    onApply: (key: string, descriptor: ParameterDescriptor) => void;
}) {
    const draft = useParameterDraft({ open, initial, taken });

    return (
        <Sheet
            open={open}
            eyebrow="SETTINGS · ENCODERS"
            title={initial === null ? "Add parameter" : "Edit parameter"}
            description={`${encoderLabel} · ${
                initial === null ? "new descriptor" : "built-in descriptor"
            }`}
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => draft.apply(onApply)}>
                        {initial === null ? "Add parameter" : "Save parameter"}
                    </Button>
                </>
            }
        >
            <div
                className="grid gap-4"
                onKeyDown={(event) => {
                    if (event.key === "Escape" && draft.infoOpen) {
                        event.stopPropagation();
                        draft.setInfoOpen(false);
                        draft.infoButton.current?.focus();
                    }
                }}
            >
                <ParameterPreview draft={draft} />
                <ParameterIdentityFields draft={draft} locked={initial !== null} />
                <ParameterKindFields draft={draft} />
                <ParameterChoiceFields draft={draft} />
                <ParameterNumberFields draft={draft} />
                <ParameterDefaultFields draft={draft} />
                <ParameterRelations draft={draft} taken={taken} />

                {draft.error === null ? null : (
                    <p role="alert" className="m-0 text-[11.5px] leading-relaxed text-danger">
                        {draft.error}
                    </p>
                )}
            </div>
        </Sheet>
    );
}
