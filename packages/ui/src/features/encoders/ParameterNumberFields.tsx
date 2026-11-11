import { FIELD } from "./encoder-fields";
import type { ParameterDraft } from "./useParameterDraft";

/** The range and unit fields a Number or Decimal descriptor owns. */
export function ParameterNumberFields({ draft }: { draft: ParameterDraft }) {
    if (draft.kind !== "Number" && draft.kind !== "Decimal") {
        return null;
    }
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-[11px] text-ink-secondary">
                Minimum
                <input
                    value={draft.min}
                    onChange={(event) => {
                        draft.setMin(event.target.value);
                        draft.setError(null);
                    }}
                    placeholder="0"
                    inputMode="decimal"
                    className={`${FIELD} font-mono text-[11.5px]`}
                />
            </label>
            <label className="grid gap-1 text-[11px] text-ink-secondary">
                Maximum
                <input
                    value={draft.max}
                    onChange={(event) => {
                        draft.setMax(event.target.value);
                        draft.setError(null);
                    }}
                    placeholder="63"
                    inputMode="decimal"
                    className={`${FIELD} font-mono text-[11.5px]`}
                />
            </label>
            <label className="grid gap-1 text-[11px] text-ink-secondary">
                Step
                <input
                    value={draft.step}
                    onChange={(event) => {
                        draft.setStep(event.target.value);
                        draft.setError(null);
                    }}
                    placeholder="1"
                    inputMode="decimal"
                    className={`${FIELD} font-mono text-[11.5px]`}
                />
            </label>
            <label className="grid gap-1 text-[11px] text-ink-secondary">
                Unit
                <input
                    value={draft.unit}
                    onChange={(event) => draft.setUnit(event.target.value)}
                    placeholder="—"
                    className={`${FIELD} font-mono text-[11.5px]`}
                />
            </label>
        </div>
    );
}
