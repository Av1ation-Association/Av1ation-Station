import { FIELD } from "./encoder-fields";
import type { ParameterDraft } from "./useParameterDraft";

/** The descriptor's default value, group, and advanced flag. */
export function ParameterDefaultFields({ draft }: { draft: ParameterDraft }) {
    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[11px] text-ink-secondary">
                    Default · optional
                    {draft.kind === "Flag" ? (
                        <span className="flex h-9 items-center gap-2">
                            <input
                                type="checkbox"
                                checked={draft.flagOn}
                                onChange={(event) => draft.setFlagOn(event.target.checked)}
                                className="h-4 w-4 accent-[var(--brand-default)]"
                            />
                            <span className="text-[12px] text-ink">
                                {draft.flagOn ? "Sent by default" : "Omitted by default"}
                            </span>
                        </span>
                    ) : draft.kind === "Choice" ? (
                        <select
                            aria-label="Default choice"
                            value={draft.rawDefault}
                            onChange={(event) => {
                                draft.setRawDefault(event.target.value);
                                draft.setError(null);
                            }}
                            className="h-9 rounded-md border border-line-strong bg-raised px-2 font-mono text-[11.5px] text-ink"
                        >
                            <option value="">No default</option>
                            {draft.choices
                                .filter((choice) => choice.value.trim() !== "")
                                .map((choice, index) => (
                                    <option
                                        key={`${choice.value}-${String(index)}`}
                                        value={choice.value}
                                    >
                                        {draft.choiceNumeric && choice.label.trim() !== ""
                                            ? `${choice.label} (${choice.value})`
                                            : choice.value}
                                    </option>
                                ))}
                        </select>
                    ) : (
                        <input
                            value={draft.rawDefault}
                            onChange={(event) => {
                                draft.setRawDefault(event.target.value);
                                draft.setError(null);
                            }}
                            placeholder={
                                draft.kind === "Number" || draft.kind === "Decimal"
                                    ? "24"
                                    : draft.kind === "Path"
                                      ? "C:\\config.toml"
                                      : "slow"
                            }
                            spellCheck={false}
                            className={`${FIELD} font-mono text-[11.5px]`}
                        />
                    )}
                </label>
                <label className="grid gap-1 text-[11px] text-ink-secondary">
                    Group
                    <input
                        value={draft.group}
                        onChange={(event) => draft.setGroup(event.target.value)}
                        placeholder="Quality"
                        className={FIELD}
                    />
                </label>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-line bg-sunken px-3.5 py-3">
                <input
                    type="checkbox"
                    checked={draft.advanced}
                    onChange={(event) => draft.setAdvanced(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-default)]"
                />
                <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-ink">Advanced</span>
                    <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink-muted">
                        Hidden behind Show advanced in the form. The value still participates in
                        validation.
                    </span>
                </span>
            </label>
        </>
    );
}
