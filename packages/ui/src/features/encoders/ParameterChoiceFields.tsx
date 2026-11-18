import { Plus, X } from "lucide-react";

import { Button } from "../../shared/Button";
import { FIELD } from "./encoder-fields";
import { filledChoiceCount } from "./parameter-drafts";
import type { ParameterDraft } from "./useParameterDraft";

/** The choice list, its value type, and the add/remove controls. */
export function ParameterChoiceFields({ draft }: { draft: ParameterDraft }) {
    if (draft.kind !== "Choice") {
        return null;
    }
    return (
        <section className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="text-[11px] text-ink-secondary">Values</span>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-ink-muted">Value type</span>
                    <div
                        role="radiogroup"
                        aria-label="Choice value type"
                        className="inline-flex overflow-hidden rounded-md border border-line-strong"
                    >
                        {(["Text", "Number"] as const).map((type) => (
                            <button
                                key={type}
                                type="button"
                                role="radio"
                                aria-checked={draft.choiceNumeric === (type === "Number")}
                                onClick={() => draft.setChoiceNumeric(type === "Number")}
                                className={`px-2.5 py-1 text-[10.5px] transition-colors ${
                                    draft.choiceNumeric === (type === "Number")
                                        ? "bg-brand text-on-brand"
                                        : "bg-raised text-ink-secondary hover:text-ink"
                                }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <span className="text-[10px] leading-relaxed text-ink-muted">
                {draft.choiceNumeric
                    ? "The encoder receives the number; the label is what the user sees."
                    : "One text value per row. No separator is needed."}
            </span>
            <div className="hidden items-center gap-2 px-3 text-[10px] text-ink-muted sm:grid sm:grid-cols-[4.25rem_minmax(0,0.9fr)_minmax(0,1.35fr)_1.75rem]">
                <span>Value</span>
                <span>Label · optional</span>
                <span>Description · optional</span>
                <span className="sr-only">Remove</span>
            </div>
            <div className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-subtle bg-sunken">
                {draft.choices.map((choice, index) => (
                    <div
                        key={String(index)}
                        className="relative grid gap-1.5 px-2 py-1.5 pr-11 sm:grid-cols-[4.25rem_minmax(0,0.9fr)_minmax(0,1.35fr)_1.75rem] sm:items-center sm:gap-2 sm:px-3 sm:pr-2"
                    >
                        <div className="grid grid-cols-2 gap-1.5 sm:contents">
                            <input
                                aria-label={`Choice value ${String(index + 1)}`}
                                value={choice.value}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    draft.setChoices((previous) =>
                                        previous.map((entry, position) =>
                                            position === index ? { ...entry, value: next } : entry,
                                        ),
                                    );
                                    draft.setError(null);
                                }}
                                placeholder={draft.choiceNumeric ? "0" : "slow"}
                                spellCheck={false}
                                className={`${FIELD} h-8 font-mono text-[11px]`}
                            />
                            <input
                                aria-label={`Choice label ${String(index + 1)}`}
                                value={choice.label}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    draft.setChoices((previous) =>
                                        previous.map((entry, position) =>
                                            position === index ? { ...entry, label: next } : entry,
                                        ),
                                    );
                                }}
                                placeholder="Same as value"
                                spellCheck={false}
                                className={`${FIELD} h-8 text-[11px]`}
                            />
                        </div>
                        <input
                            aria-label={`Choice description ${String(index + 1)}`}
                            value={choice.description}
                            onChange={(event) => {
                                const next = event.target.value;
                                draft.setChoices((previous) =>
                                    previous.map((entry, position) =>
                                        position === index
                                            ? { ...entry, description: next }
                                            : entry,
                                    ),
                                );
                            }}
                            placeholder="Shown with this value"
                            spellCheck={false}
                            className={`${FIELD} h-8 text-[11px]`}
                        />
                        <button
                            type="button"
                            aria-label={`Remove choice ${
                                choice.value.trim() === "" ? String(index + 1) : choice.value
                            }`}
                            data-tip={`Remove choice ${
                                choice.value.trim() === "" ? String(index + 1) : choice.value
                            }`}
                            data-tip-align="end"
                            onClick={() =>
                                draft.setChoices((previous) =>
                                    previous.filter((_, position) => position !== index),
                                )
                            }
                            className="absolute top-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-ink-muted transition-colors duration-150 hover:border-line-strong hover:bg-hover hover:text-danger sm:static"
                        >
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="secondary"
                    className="h-8 px-2.5 text-[11px]"
                    onClick={() =>
                        draft.setChoices((previous) => [
                            ...previous,
                            { value: "", label: "", description: "" },
                        ])
                    }
                >
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    Add value
                </Button>
                <span className="text-[10px] text-ink-muted">
                    {filledChoiceCount(draft.choices)} values
                </span>
            </div>
        </section>
    );
}
