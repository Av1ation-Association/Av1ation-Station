import type { ScriptCheck } from "@av1ation/contracts";
import { Check, CircleAlert, CircleDashed } from "lucide-react";

function validationChip(check: ScriptCheck | null) {
    if (check === null) {
        return {
            icon: CircleDashed,
            label: "Not checked yet",
            tone: "text-ink-muted border-line",
        };
    }
    switch (check.status) {
        case "valid":
            return {
                icon: Check,
                label: "Validated",
                tone: "text-success border-success/40 bg-success-soft",
            };
        case "invalid":
            return {
                icon: CircleAlert,
                label: "The script failed",
                tone: "text-danger border-danger/40 bg-danger-soft",
            };
        case "unavailable":
        default:
            return {
                icon: CircleAlert,
                label: "Cannot check here",
                tone: "text-warning border-warning/40 bg-warning-soft",
            };
    }
}

/** The interpreter's verdict, with the same words and tone the script page shows. */
export function ScriptValidationResult({
    check,
    emptyDetail,
}: {
    check: ScriptCheck | null;
    emptyDetail: string;
}) {
    const chip = validationChip(check);
    const ChipIcon = chip.icon;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] ${chip.tone}`}
            >
                <ChipIcon aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                {chip.label}
            </span>
            <p className="m-0 min-w-0 flex-1 text-[11px] leading-relaxed break-words text-ink-muted">
                {check === null ? emptyDetail : check.detail}
            </p>
        </div>
    );
}
