import { FIELD } from "./encoder-fields";
import type { ParameterDraft } from "./useParameterDraft";

/** The descriptor's identity and documentation fields. */
export function ParameterIdentityFields({
    draft,
    locked,
}: {
    draft: ParameterDraft;
    locked: boolean;
}) {
    return (
        <>
            <div className="grid gap-1 text-[11px] text-ink-secondary">
                <span>Key</span>
                <div className="flex gap-2">
                    <select
                        aria-label="Key prefix"
                        value={draft.prefix}
                        disabled={locked}
                        onChange={(event) => {
                            draft.setPrefix(event.target.value);
                            draft.setError(null);
                        }}
                        className="h-9 w-20 shrink-0 rounded-md border border-line-strong bg-raised px-2 font-mono text-[11.5px] text-ink disabled:opacity-50"
                    >
                        <option value="--">--</option>
                        <option value="-">-</option>
                        <option value="">(none)</option>
                    </select>
                    <input
                        aria-label="Key name"
                        value={draft.name}
                        disabled={locked}
                        onChange={(event) => {
                            draft.setName(event.target.value);
                            draft.setError(null);
                        }}
                        placeholder="crf"
                        spellCheck={false}
                        className={`${FIELD} min-w-0 flex-1 font-mono text-[11.5px]`}
                    />
                </div>
                <span className="text-[10px] leading-relaxed text-ink-muted">
                    Identity is prefix + name: <span className="font-mono">--crf</span> and{" "}
                    <span className="font-mono">-crf</span> are different descriptors.
                </span>
            </div>

            <label className="grid gap-1 text-[11px] text-ink-secondary">
                Label
                <input
                    value={draft.label}
                    onChange={(event) => {
                        draft.setLabel(event.target.value);
                        draft.setError(null);
                    }}
                    placeholder="Constant Rate Factor"
                    className={FIELD}
                />
            </label>

            <label className="grid gap-1 text-[11px] text-ink-secondary">
                Description
                <textarea
                    value={draft.description}
                    onChange={(event) => draft.setDescription(event.target.value)}
                    rows={3}
                    placeholder="What the encoder changes and what a larger value does."
                    className="w-full rounded-md border border-line-strong bg-app px-2.5 py-2 text-[12px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                />
            </label>

            <label className="grid gap-1 text-[11px] text-ink-secondary">
                Documentation link · optional
                <input
                    value={draft.docLink}
                    onChange={(event) => draft.setDocLink(event.target.value)}
                    placeholder="https://example.com/encoder/parameter"
                    spellCheck={false}
                    className={`${FIELD} font-mono text-[11px]`}
                />
            </label>
        </>
    );
}
