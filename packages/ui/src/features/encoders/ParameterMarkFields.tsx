import { Plus, X } from "lucide-react";

import { Button } from "../../shared/Button";
import { FIELD } from "./encoder-fields";
import type { ParameterDraft } from "./useParameterDraft";

/** Curated positions on a Slider descriptor. The service still adds the default marker. */
export function ParameterMarkFields({ draft }: { draft: ParameterDraft }) {
    if ((draft.kind !== "Number" && draft.kind !== "Decimal") || draft.widget !== "Slider") {
        return null;
    }

    const update = (index: number, next: Partial<{ value: string; label: string }>) => {
        draft.setMarks((current) =>
            current.map((mark, position) => (position === index ? { ...mark, ...next } : mark)),
        );
    };

    return (
        <section className="grid gap-2" aria-label="Slider marks">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="m-0 text-[11px] text-ink-secondary">Marks</p>
                    <p className="mt-0.5 mb-0 text-[10px] leading-relaxed text-ink-muted">
                        Optional labels at documented positions. The default marker is added
                        automatically.
                    </p>
                </div>
                <Button
                    variant="secondary"
                    className="h-8 shrink-0 px-2.5 text-[11px]"
                    disabled={draft.marks.length >= 8}
                    onClick={() =>
                        draft.setMarks((current) => [...current, { value: "", label: "" }])
                    }
                >
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    Add mark
                </Button>
            </div>
            {draft.marks.length === 0 ? (
                <p className="m-0 rounded-md border border-dashed border-line-strong px-2.5 py-2 text-[10.5px] text-ink-muted">
                    No custom marks. The slider still shows its default marker.
                </p>
            ) : (
                <div className="grid gap-1.5">
                    {draft.marks.map((mark, index) => (
                        <div key={index} className="flex min-w-0 items-center gap-1.5">
                            <input
                                aria-label={`Mark ${String(index + 1)} value`}
                                value={mark.value}
                                inputMode="decimal"
                                placeholder="Value"
                                onChange={(event) => update(index, { value: event.target.value })}
                                className={`${FIELD} w-24 shrink-0`}
                            />
                            <input
                                aria-label={`Mark ${String(index + 1)} label`}
                                value={mark.label}
                                placeholder="Optional label"
                                onChange={(event) => update(index, { label: event.target.value })}
                                className={`${FIELD} min-w-0 flex-1`}
                            />
                            <button
                                type="button"
                                aria-label={`Remove mark ${String(index + 1)}`}
                                onClick={() =>
                                    draft.setMarks((current) =>
                                        current.filter((_, position) => position !== index),
                                    )
                                }
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            >
                                <X aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
