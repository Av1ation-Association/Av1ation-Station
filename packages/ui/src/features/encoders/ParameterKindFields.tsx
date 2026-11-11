import { FIELD } from "./encoder-fields";
import { KIND_OPTIONS, type ParameterKindName } from "./parameter-summary";
import { TEXT_FORMATS, type TextFormatName, type WidgetChoice } from "./parameter-drafts";
import type { ParameterDraft } from "./useParameterDraft";

/** The kind and widget selectors, plus the fields those kinds own. */
export function ParameterKindFields({ draft }: { draft: ParameterDraft }) {
    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[11px] text-ink-secondary">
                    Kind
                    <select
                        value={draft.kind}
                        onChange={(event) => {
                            const next = event.target.value as ParameterKindName;
                            draft.setKind(next);
                            draft.setWidget("Auto");
                            draft.setError(null);
                            if (next === "Choice" && draft.choices.length === 0) {
                                draft.setChoices([
                                    { value: "", label: "", description: "" },
                                    { value: "", label: "", description: "" },
                                ]);
                            }
                        }}
                        className="h-9 rounded-md border border-line-strong bg-raised px-2 text-[12px] text-ink"
                    >
                        {KIND_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="grid gap-1 text-[11px] text-ink-secondary">
                    Widget
                    <select
                        value={draft.widget}
                        onChange={(event) => {
                            const next = event.target.value as WidgetChoice;
                            draft.setWidget(next);
                            draft.setError(null);
                            // A switch can only write 0 or 1, so its range is a fact of the
                            // control rather than a second thing to get right.
                            if (next === "Switch") {
                                if (draft.min.trim() === "") {
                                    draft.setMin("0");
                                }
                                if (draft.max.trim() === "") {
                                    draft.setMax("1");
                                }
                            }
                        }}
                        className="h-9 rounded-md border border-line-strong bg-raised px-2 text-[12px] text-ink"
                    >
                        <option value="Auto">Auto</option>
                        {draft.kind === "Number" || draft.kind === "Decimal" ? (
                            <>
                                <option value="Slider">Slider</option>
                                <option value="NumberInput">NumberInput</option>
                                {draft.kind === "Number" ? (
                                    <option value="Switch">Switch (0/1)</option>
                                ) : null}
                            </>
                        ) : null}
                        {draft.kind === "Text" ? (
                            <option value="TextInput">TextInput</option>
                        ) : null}
                        {draft.kind === "Flag" ? <option value="Toggle">Toggle</option> : null}
                        {draft.kind === "Choice" ? (
                            <>
                                <option value="Radio">Radio</option>
                                <option value="Segmented">Segmented</option>
                                <option value="Dropdown">Dropdown</option>
                            </>
                        ) : null}
                    </select>
                </label>
            </div>

            {draft.kind === "Text" ? (
                <label className="grid gap-1 text-[11px] text-ink-secondary sm:max-w-52">
                    Format
                    <select
                        value={draft.textFormat}
                        onChange={(event) =>
                            draft.setTextFormat(event.target.value as TextFormatName)
                        }
                        className="h-9 rounded-md border border-line-strong bg-raised px-2 text-[12px] text-ink"
                    >
                        {TEXT_FORMATS.map((format) => (
                            <option key={format} value={format}>
                                {format}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}

            {draft.kind === "Path" ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="flex items-center gap-2 text-[11px] text-ink-secondary">
                        <input
                            type="checkbox"
                            checked={draft.pathDirectory}
                            onChange={(event) => draft.setPathDirectory(event.target.checked)}
                            className="h-3.5 w-3.5 accent-[var(--brand-default)]"
                        />
                        Directory instead of a file
                    </label>
                    <label className="grid gap-1 text-[11px] text-ink-secondary">
                        File types · optional
                        <input
                            value={draft.pathAccept}
                            onChange={(event) => draft.setPathAccept(event.target.value)}
                            placeholder="json, toml, yaml"
                            spellCheck={false}
                            className={`${FIELD} font-mono text-[11px]`}
                        />
                    </label>
                </div>
            ) : null}
        </>
    );
}
