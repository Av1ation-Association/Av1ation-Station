import { useMemo, useState } from "react";

import { ParameterValueGrid, type ParameterValueEntry } from "@av1ation/ui/parameter-value-grid";

import { defaultOption, optionFor, SVT_PARAMETERS } from "../data";

const GROUP_COUNTS = new Map<string, number>();
for (const spec of Object.values(SVT_PARAMETERS)) {
    const group = spec.group ?? "Ungrouped";
    GROUP_COUNTS.set(group, (GROUP_COUNTS.get(group) ?? 0) + 1);
}
const GROUP_NAMES = [...GROUP_COUNTS.keys()];
const TOTAL_PARAMETERS = Object.keys(SVT_PARAMETERS).length;

/** The eight controls that used to be the whole showcase; they stay first in their groups. */
const FEATURED = [
    "--film-grain",
    "--tune",
    "--variance-boost-strength",
    "--sharpness",
    "--crf",
    "--aq-mode",
    "--preset",
    "--fast-decode",
] as const;
const FEATURED_ORDER = new Map<string, number>(FEATURED.map((key, index) => [key, index]));

export function EncoderSection() {
    return (
        <section
            id="controls"
            className="site-section site-section--controls"
            aria-labelledby="controls-title"
        >
            <div className="site-section__inner">
                <header className="section-head">
                    <div>
                        <h2 id="controls-title">Encoder options are controls, not commands.</h2>
                        <p>
                            The parameter catalogue comes from the engine. Browse all{" "}
                            {TOTAL_PARAMETERS} SVT-AV1 options by group; every option is rendered as
                            the control its type calls for, with its own range, choices, and
                            documentation.
                        </p>
                    </div>
                    <p className="section-head__aside">
                        {TOTAL_PARAMETERS} live controls across {GROUP_NAMES.length} groups. Change
                        a value; nothing is sent anywhere.
                    </p>
                </header>

                <LiveParameters />
            </div>
        </section>
    );
}

function LiveParameters() {
    const [parameters, setParameters] = useState<Record<string, unknown>>({});
    const [group, setGroup] = useState(() => GROUP_NAMES[0] ?? "Ungrouped");

    const groups = useMemo<Array<[string, ParameterValueEntry[]]>>(() => {
        const entries: ParameterValueEntry[] = [];
        for (const [parameterKey, spec] of Object.entries(SVT_PARAMETERS)) {
            if ((spec.group ?? "Ungrouped") !== group) {
                continue;
            }
            entries.push({
                name: parameterKey,
                parameter: parameters[parameterKey] ?? defaultOption(spec),
                descriptor: spec,
                canonical: parameterKey,
            });
        }
        entries.sort((left, right) => {
            const leftOrder = FEATURED_ORDER.get(left.name) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = FEATURED_ORDER.get(right.name) ?? Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            return (left.descriptor?.label ?? left.name).localeCompare(
                right.descriptor?.label ?? right.name,
            );
        });
        return [[group, entries]];
    }, [group, parameters]);

    const entries = groups[0]?.[1] ?? [];

    return (
        <div className="parameter-showcase">
            <div className="parameter-groups" role="group" aria-label="Parameter groups">
                {GROUP_NAMES.map((name) => (
                    <button
                        key={name}
                        type="button"
                        className="parameter-group"
                        aria-pressed={group === name}
                        onClick={() => {
                            setGroup(name);
                        }}
                    >
                        {name}
                        <span className="parameter-group__count" aria-hidden="true">
                            {GROUP_COUNTS.get(name) ?? 0}
                        </span>
                    </button>
                ))}
            </div>

            <div className="parameter-panel">
                <div className="parameter-panel__head">
                    <h3>{group}</h3>
                    <p>
                        {entries.length} of {TOTAL_PARAMETERS} parameters
                    </p>
                </div>
                <ParameterValueGrid
                    groups={groups}
                    locked={false}
                    showGroupLabel={false}
                    layout="single"
                    onChange={(entry, next) => {
                        setParameters((previous) => ({
                            ...previous,
                            [entry.name]: optionFor(next),
                        }));
                    }}
                />
            </div>
        </div>
    );
}
