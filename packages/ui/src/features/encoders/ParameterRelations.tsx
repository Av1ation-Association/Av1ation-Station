import { Button } from "../../shared/Button";
import type { ParameterDraft } from "./useParameterDraft";

/** The rules that make a descriptor participate only when another key matches. */
export function ParameterRelations({
    draft,
    taken,
}: {
    draft: ParameterDraft;
    taken: ReadonlySet<string>;
}) {
    return (
        <section className="grid gap-2">
            <div>
                <h3 className="m-0 text-[12px] font-semibold text-ink">Relations</h3>
                <p className="m-0 mt-0.5 text-[10.5px] leading-relaxed text-ink-muted">
                    Only set parameters participate. Inline feedback mirrors the service check.
                </p>
            </div>
            {draft.relations.map((relation, index) => (
                <div
                    key={`${relation.other}-${String(index)}`}
                    className="grid gap-2 rounded-lg border border-line-subtle bg-sunken px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_auto]"
                >
                    <label className="grid gap-1 text-[10.5px] text-ink-secondary">
                        Requires
                        <select
                            value={relation.other}
                            onChange={(event) =>
                                draft.setRelations((previous) =>
                                    previous.map((entry, position) =>
                                        position === index
                                            ? { ...entry, other: event.target.value }
                                            : entry,
                                    ),
                                )
                            }
                            className="h-8 rounded-md border border-line-strong bg-raised px-2 font-mono text-[11px] text-ink"
                        >
                            <option value="">Choose a key</option>
                            {[...taken]
                                .filter((key) => key !== draft.canonical)
                                .map((key) => (
                                    <option key={key} value={key}>
                                        {key}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <label className="grid gap-1 text-[10.5px] text-ink-secondary">
                        Equals
                        <input
                            value={relation.equals}
                            onChange={(event) =>
                                draft.setRelations((previous) =>
                                    previous.map((entry, position) =>
                                        position === index
                                            ? { ...entry, equals: event.target.value }
                                            : entry,
                                    ),
                                )
                            }
                            placeholder="value"
                            spellCheck={false}
                            className="h-8 min-w-0 rounded-md border border-line-strong bg-raised px-2 font-mono text-[11px] text-ink"
                        />
                    </label>
                    <Button
                        variant="ghost"
                        className="h-8 px-2 text-[11px] sm:self-end"
                        onClick={() =>
                            draft.setRelations((previous) =>
                                previous.filter((_, position) => position !== index),
                            )
                        }
                    >
                        Remove
                    </Button>
                </div>
            ))}
            <Button
                variant="secondary"
                className="h-8 w-fit px-2.5 text-[11.5px]"
                onClick={() =>
                    draft.setRelations((previous) => [
                        ...previous,
                        { other: "", equals: "", message: "" },
                    ])
                }
            >
                Add relation
            </Button>
        </section>
    );
}
