import type { ParameterDescriptor } from "@av1ation/contracts";
import { ExternalLink, Info, RotateCcw } from "lucide-react";

import { DelimiterReadout } from "./DelimiterReadout";
import { delimiterLabel } from "./delimiter-label";
import { isDefaultOption } from "./encoder-options";
import { ParameterControl } from "./parameter-control";
import { isSwitchNumber } from "./parameter-summary";
import { RemoveButton } from "../../shared/RemoveButton";

/** One set parameter: the name the encoder reads it by, its value, and what it means. */
export type ParameterValueEntry = {
    /** The option name in the encoder body, which is what the document stores. */
    name: string;
    /** The stored CLI parameter, in the engine's own representation. */
    parameter: unknown;
    /** What the catalogue says about the flag, when it knows this one. */
    descriptor: ParameterDescriptor | undefined;
    /** The canonical flag spelling, shown above the description. */
    canonical: string;
};

/** The one-line reason under a label; the full text belongs in its popover. */
function shortDescription(value: string | null | undefined): string {
    if (value === null || value === undefined) {
        return "";
    }
    const first = value.split(/(?<=[.!?])\s/u)[0] ?? value;
    return first.length <= 96 ? first : `${first.slice(0, 93).trimEnd()}…`;
}

/**
 * The set parameters, grouped by the engine's own group and rendered with their controls.
 *
 * Configuration → Encoding and the descriptor JSON page both show an encoder's parameters.
 * They show the same rows because they render this component: a preview built from a
 * separate list described what the parameters were, not how they would look, and drifted
 * from the editor the first time either side changed.
 *
 * The actions are optional because the two callers own different things. Configuring an
 * encoder can reset a value or drop the parameter from the document; the JSON page's
 * document is the descriptor map, so its preview keeps only the value control and leaves
 * the descriptor list to the text above it.
 */
export function ParameterValueGrid({
    groups,
    locked,
    onChange,
    onReset,
    onRemove,
    showGroupLabel = true,
    layout = "split",
    isChanged = (entry) => !isDefaultOption(entry.descriptor, entry.parameter),
}: {
    groups: Array<[string, ParameterValueEntry[]]>;
    locked: boolean;
    onChange: (entry: ParameterValueEntry, next: string | number | boolean) => void;
    onReset?: (entry: ParameterValueEntry) => void;
    onRemove?: (entry: ParameterValueEntry) => void;
    /** A caller that already names the group can omit the repeated heading. */
    showGroupLabel?: boolean;
    /** `single` gives one group the full width instead of splitting it into two columns. */
    layout?: "split" | "single";
    /** Whether a row differs from what the encoder would use on its own. */
    isChanged?: (entry: ParameterValueEntry) => boolean;
}) {
    return (
        // The groups share the width, but not a grid row: columns pack each group under the
        // previous one in its own column, so a tall group never stretches its neighbour.
        <div className={layout === "single" ? "columns-1" : "columns-1 gap-x-6 lg:columns-2"}>
            {groups.map(([group, entries]) => (
                <div key={group} className="mb-5 min-w-0 break-inside-avoid">
                    {showGroupLabel ? (
                        <p className="m-0 font-mono text-[9px] tracking-[0.14em] text-ink-muted uppercase">
                            {group}
                        </p>
                    ) : null}
                    {/* A group with one parameter would otherwise leave its second column
                        empty; a solo control takes the width it is in. */}
                    <div
                        className={`${showGroupLabel ? "mt-1.5 " : ""}grid gap-2 ${entries.length === 1 ? "" : "sm:grid-cols-2"}`}
                    >
                        {entries.map((entry) => {
                            const { name, parameter, descriptor, canonical } = entry;
                            const changed = isChanged(entry);
                            const full = descriptor?.description ?? "";
                            const separator = delimiterLabel(descriptor?.delimiter);
                            return (
                                <div
                                    key={name}
                                    className="flex min-w-0 flex-col gap-1.5 border-b border-line-subtle pb-2"
                                >
                                    <div className="flex min-w-0 items-start gap-1">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-center gap-1">
                                                <span className="truncate text-[11.5px] font-medium text-ink">
                                                    {descriptor?.label ?? name}
                                                </span>
                                                <span className="group/info relative flex shrink-0">
                                                    <button
                                                        type="button"
                                                        aria-label={`About ${descriptor?.label ?? canonical}`}
                                                        className="flex h-4 w-4 items-center justify-center rounded text-ink-muted hover:text-ink focus-visible:text-ink"
                                                    >
                                                        <Info
                                                            aria-hidden="true"
                                                            className="h-3 w-3"
                                                        />
                                                    </button>
                                                    <div className="invisible absolute top-5 left-0 z-30 w-64 rounded-md border border-line-strong bg-overlay p-3 text-[10.5px] leading-relaxed text-ink-secondary opacity-0 shadow-elevation-3 group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:visible group-focus-within/info:opacity-100">
                                                        <p className="m-0 font-mono text-[9.5px] text-ink-muted">
                                                            {canonical}
                                                        </p>
                                                        {separator === null ? null : (
                                                            <p className="mt-1 mb-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[9.5px] text-ink-muted">
                                                                <span>Separator</span>
                                                                <DelimiterReadout
                                                                    delimiter={
                                                                        descriptor?.delimiter
                                                                    }
                                                                />
                                                                <span aria-hidden="true">
                                                                    · {separator.hint}
                                                                </span>
                                                            </p>
                                                        )}
                                                        <p className="mt-1 mb-0">
                                                            {full === ""
                                                                ? "No description in this build's help output."
                                                                : full}
                                                        </p>
                                                        {descriptor?.doc_link === null ||
                                                        descriptor?.doc_link ===
                                                            undefined ? null : (
                                                            <a
                                                                href={descriptor.doc_link}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="mt-2 inline-flex items-center gap-1 text-brand-text hover:underline"
                                                            >
                                                                Documentation
                                                                <ExternalLink
                                                                    aria-hidden="true"
                                                                    className="h-3 w-3"
                                                                />
                                                            </a>
                                                        )}
                                                    </div>
                                                </span>
                                                {changed ? (
                                                    <span
                                                        aria-hidden="true"
                                                        title="Changed from the encoder default"
                                                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                                                    />
                                                ) : null}
                                            </div>
                                            {full === "" ? null : (
                                                <p className="mt-0.5 mb-0 truncate text-[9.5px] leading-relaxed text-ink-muted">
                                                    {shortDescription(full)}
                                                </p>
                                            )}
                                        </div>
                                        {onReset === undefined ? null : (
                                            <button
                                                type="button"
                                                aria-label={`Reset ${descriptor?.label ?? canonical}`}
                                                title="Reset to the encoder default"
                                                disabled={locked || !changed}
                                                onClick={() => onReset(entry)}
                                                className="group/reset flex h-6 max-w-6 shrink-0 items-center overflow-hidden rounded text-ink-muted transition-[max-width,background-color,color] duration-150 ease-out hover:max-w-20 hover:bg-hover hover:text-ink focus-visible:max-w-20 focus-visible:bg-hover focus-visible:text-ink disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none"
                                            >
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                                                    <RotateCcw
                                                        aria-hidden="true"
                                                        className="h-3 w-3"
                                                    />
                                                </span>
                                                <span
                                                    aria-hidden="true"
                                                    className="pr-2 text-[10px] whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover/reset:opacity-100 group-focus-visible/reset:opacity-100 motion-reduce:transition-none"
                                                >
                                                    Reset
                                                </span>
                                            </button>
                                        )}
                                        {onRemove === undefined ? null : (
                                            <RemoveButton
                                                target={descriptor?.label ?? canonical}
                                                // A switch always writes 0 or 1, so removing it
                                                // is the only way back to the encoder's own
                                                // default. Naming that action Unset keeps it
                                                // from reading as a second Reset.
                                                label={
                                                    isSwitchNumber(descriptor) ? "Unset" : "Remove"
                                                }
                                                disabled={locked}
                                                onClick={() => onRemove(entry)}
                                            />
                                        )}
                                    </div>
                                    <ParameterControl
                                        descriptor={descriptor}
                                        parameter={parameter}
                                        disabled={locked}
                                        onChange={(next) => onChange(entry, next)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
