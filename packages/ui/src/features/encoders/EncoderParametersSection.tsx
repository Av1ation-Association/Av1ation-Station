import { useMemo, useState } from "react";

import type { ParameterDescriptor } from "@av1ation/contracts";
import { Plus, Search } from "lucide-react";

import { Button } from "../../shared/Button";
import { Sheet } from "../../shared/Sheet";
import { Switch } from "../../shared/Switch";
import {
    buildBoolOption,
    buildNumberOption,
    buildOption,
    canonicalOf,
    defaultValue,
    optionName,
    startingValue,
    withOptionValue,
} from "./encoder-options";
import { FIELD } from "./parameter-control";
import { ParameterValueGrid, type ParameterValueEntry } from "./ParameterValueGrid";

/**
 * The set parameters and the catalogue rows that can still be added.
 *
 * Set rows are grouped the way the catalogue groups them, so neighbouring controls are
 * rate-control values or quality values rather than the order the user happened to add.
 * The search matches the key, label, and description — the same three fields
 * Settings → Encoders searches — so one word finds the row from either screen.
 */
export function EncoderParametersSection({
    catalogue,
    options,
    visibleOptions,
    buildLabel,
    locked,
    onSetOption,
    onRemoveOption,
    onPreview,
}: {
    catalogue: Map<string, ParameterDescriptor>;
    options: Record<string, unknown>;
    visibleOptions: Array<[string, unknown]>;
    buildLabel: string;
    locked: boolean;
    onSetOption: (name: string, parameter: unknown) => void;
    onRemoveOption: (name: string) => void;
    onPreview: () => void;
}) {
    const [addOpen, setAddOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [parameterSearch, setParameterSearch] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [customFlag, setCustomFlag] = useState("");
    const [customValue, setCustomValue] = useState("");
    const [customKind, setCustomKind] = useState<"Flag" | "Number" | "Text">("Flag");

    const byName = useMemo(() => {
        const map = new Map<string, { canonical: string; descriptor: ParameterDescriptor }>();
        for (const [canonical, descriptor] of catalogue) {
            map.set(optionName(canonical), { canonical, descriptor });
        }
        return map;
    }, [catalogue]);

    const unset = [...catalogue.entries()]
        .filter(([canonical]) => options[optionName(canonical)] === undefined)
        .filter(([, descriptor]) => showAdvanced || !descriptor.advanced)
        .filter(([canonical, descriptor]) => {
            const needle = query.trim().toLowerCase();
            if (needle === "") {
                return true;
            }
            return `${canonical} ${descriptor.label} ${descriptor.description ?? ""}`
                .toLowerCase()
                .includes(needle);
        })
        .sort(([left], [right]) => left.localeCompare(right));
    const hiddenAdvanced = [...catalogue.entries()].filter(
        ([canonical, descriptor]) =>
            descriptor.advanced && options[optionName(canonical)] === undefined,
    ).length;
    const groups = new Map<string, Array<[string, ParameterDescriptor]>>();
    for (const entry of unset) {
        const group = entry[1].group ?? "Other";
        groups.set(group, [...(groups.get(group) ?? []), entry]);
    }

    const parameterNeedle = parameterSearch.trim().toLowerCase();
    const setGroups = new Map<string, ParameterValueEntry[]>();
    let shownParameters = 0;
    for (const [name, parameter] of visibleOptions) {
        const entry = byName.get(name);
        const descriptor = entry?.descriptor;
        const canonical = entry?.canonical ?? canonicalOf(name, parameter);
        if (
            parameterNeedle !== "" &&
            ![canonical, name, descriptor?.label ?? "", descriptor?.description ?? ""].some(
                (field) => field.toLowerCase().includes(parameterNeedle),
            )
        ) {
            continue;
        }
        shownParameters += 1;
        const group = descriptor?.group ?? "Other";
        setGroups.set(group, [
            ...(setGroups.get(group) ?? []),
            { name, parameter, descriptor, canonical },
        ]);
    }

    const addFromCatalogue = (canonical: string, descriptor: ParameterDescriptor) => {
        onSetOption(
            optionName(canonical),
            buildOption(canonical, descriptor, startingValue(descriptor)),
        );
        setAddOpen(false);
        setQuery("");
    };

    const addCustom = () => {
        const canonical = customFlag.trim().startsWith("-")
            ? customFlag.trim()
            : `--${customFlag.trim()}`;
        if (customFlag.trim() === "") {
            return;
        }
        onSetOption(
            optionName(canonical),
            customKind === "Flag"
                ? buildBoolOption(canonical, true)
                : customKind === "Number"
                  ? buildNumberOption(canonical, Number(customValue || 0))
                  : buildOption(canonical, undefined, customValue),
        );
        setCustomFlag("");
        setCustomValue("");
        setAddOpen(false);
    };

    return (
        <>
            <section className="rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                    {/* The summary shrinks so the search and actions stay on the header's own
                        line at a narrow width instead of dropping to a second row. */}
                    <div className="min-w-0 flex-1">
                        <h2 className="m-0 text-base font-semibold text-ink">Parameters</h2>
                        <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                            {buildLabel} · {String(visibleOptions.length)} of{" "}
                            {String(catalogue.size)} set
                            {parameterNeedle === ""
                                ? null
                                : ` · ${String(shownParameters)} shown`}{" "}
                            · changes from defaults are marked.
                        </p>
                    </div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                        <label className="relative">
                            <Search
                                aria-hidden="true"
                                className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                            />
                            <input
                                type="search"
                                aria-label="Search parameters"
                                value={parameterSearch}
                                onChange={(event) => setParameterSearch(event.target.value)}
                                placeholder="Search parameters"
                                spellCheck={false}
                                className="h-8 w-44 rounded-md border border-line-strong bg-app pr-2 pl-7 text-[11.5px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none 3xl:w-60"
                            />
                        </label>
                        {hiddenAdvanced === 0 ? null : (
                            <span className="flex items-center gap-2 text-[10.5px] text-ink-secondary">
                                Show advanced
                                <Switch
                                    checked={showAdvanced}
                                    disabled={locked}
                                    label="Show advanced parameters"
                                    onChange={setShowAdvanced}
                                />
                            </span>
                        )}
                        <Button
                            variant="secondary"
                            className="h-8 px-2.5 text-[11px]"
                            onClick={onPreview}
                        >
                            Preview command
                        </Button>
                        <Button
                            variant="secondary"
                            className="h-8 px-2.5 text-[11px]"
                            disabled={locked}
                            onClick={() => setAddOpen(true)}
                        >
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            Add parameter
                        </Button>
                    </div>
                </div>

                <div className="px-4 py-4 sm:px-5">
                    {visibleOptions.length === 0 ? (
                        <p className="m-0 rounded-md border border-dashed border-line px-3 py-3 text-[11px] leading-relaxed text-ink-muted">
                            No parameter set. The executable runs with its own defaults.
                        </p>
                    ) : shownParameters === 0 ? (
                        <p className="m-0 rounded-md border border-dashed border-line px-3 py-6 text-center text-[11.5px] text-ink-secondary">
                            No parameter matches “{parameterSearch.trim()}”.
                        </p>
                    ) : (
                        <ParameterValueGrid
                            groups={[...setGroups.entries()]}
                            locked={locked}
                            onChange={(entry, next) =>
                                onSetOption(entry.name, withOptionValue(entry.parameter, next))
                            }
                            onReset={(entry) => {
                                const fallback =
                                    entry.descriptor === undefined
                                        ? null
                                        : defaultValue(entry.descriptor);
                                if (fallback === null || entry.descriptor === undefined) {
                                    onRemoveOption(entry.name);
                                } else {
                                    onSetOption(
                                        entry.name,
                                        buildOption(entry.canonical, entry.descriptor, fallback),
                                    );
                                }
                            }}
                            onRemove={(entry) => onRemoveOption(entry.name)}
                        />
                    )}
                </div>
            </section>

            <Sheet
                open={addOpen}
                title="Add parameter"
                eyebrow="Encoder"
                description={`Every flag ${buildLabel} reports, plus one it does not.`}
                onClose={() => setAddOpen(false)}
                footer={
                    <Button variant="secondary" onClick={() => setAddOpen(false)}>
                        Close
                    </Button>
                }
            >
                <label className="block">
                    <span className="sr-only">Search parameters</span>
                    <span className="flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2">
                        <Search aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search flags"
                            spellCheck={false}
                            className="h-full min-w-0 flex-1 border-0 bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-muted"
                        />
                    </span>
                </label>
                {hiddenAdvanced === 0 ? null : (
                    <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[10.5px] text-ink-muted">
                        <input
                            type="checkbox"
                            checked={showAdvanced}
                            onChange={(event) => setShowAdvanced(event.target.checked)}
                            className="h-3 w-3 accent-[var(--brand-default)]"
                        />
                        Show advanced
                    </label>
                )}

                {[...groups.entries()].map(([group, entries]) => (
                    <section key={group} className="mt-4">
                        <h3 className="m-0 font-mono text-[9.5px] tracking-[0.14em] text-ink-muted uppercase">
                            {group}
                        </h3>
                        <ul className="mt-1.5 m-0 flex list-none flex-col gap-1 p-0">
                            {entries.map(([canonical, descriptor]) => (
                                <li key={canonical}>
                                    <button
                                        type="button"
                                        onClick={() => addFromCatalogue(canonical, descriptor)}
                                        className="flex w-full min-w-0 flex-col rounded-md border border-line px-2.5 py-2 text-left transition-colors duration-150 hover:border-line-strong hover:bg-hover"
                                    >
                                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                                            <span className="text-[11.5px] font-medium text-ink">
                                                {descriptor.label}
                                            </span>
                                            <span className="font-mono text-[9.5px] text-ink-muted">
                                                {canonical}
                                            </span>
                                            {descriptor.default === null ||
                                            descriptor.default === undefined ? null : (
                                                <span className="ml-auto font-mono text-[9.5px] text-ink-muted">
                                                    {String(defaultValue(descriptor) ?? "—")}
                                                </span>
                                            )}
                                        </span>
                                        {descriptor.description === null ||
                                        descriptor.description === undefined ? null : (
                                            <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-muted">
                                                {descriptor.description}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}

                {unset.length === 0 ? (
                    <p className="mt-4 mb-0 text-[11px] text-ink-muted">
                        Every parameter this encoder reports is already set.
                    </p>
                ) : null}

                <div className="mt-5 border-t border-line pt-4">
                    <h3 className="m-0 font-mono text-[9.5px] tracking-[0.14em] text-ink-muted uppercase">
                        Flag not listed here
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <input
                            aria-label="Parameter flag"
                            value={customFlag}
                            onChange={(event) => setCustomFlag(event.target.value)}
                            placeholder="--flag"
                            spellCheck={false}
                            className={`${FIELD} flex-1 basis-32`}
                        />
                        <select
                            aria-label="Parameter type"
                            value={customKind}
                            onChange={(event) =>
                                setCustomKind(event.target.value as typeof customKind)
                            }
                            className={`${FIELD} w-24`}
                        >
                            <option value="Flag">Flag</option>
                            <option value="Number">Number</option>
                            <option value="Text">Text</option>
                        </select>
                        {customKind === "Flag" ? null : (
                            <input
                                aria-label="Parameter value"
                                value={customValue}
                                onChange={(event) => setCustomValue(event.target.value)}
                                placeholder="Value"
                                spellCheck={false}
                                className={`${FIELD} flex-1 basis-24`}
                            />
                        )}
                        <Button
                            className="h-8 px-2.5 text-[10.5px]"
                            disabled={customFlag.trim() === ""}
                            onClick={addCustom}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            </Sheet>
        </>
    );
}
