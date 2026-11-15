import { useMemo, useState } from "react";

import { SequenceAnalyticsCard } from "@av1ation/ui/sequence-analytics-card";
import { sequenceAnalytics } from "@av1ation/ui/sequence-analytics";
import {
    ParameterValueGrid,
    type ParameterValueEntry,
} from "@av1ation/ui/parameter-value-grid";

import parametersJson from "../../gallery/encoder-parameters.json";
import realRun from "../../gallery/real-run.json";

type Family = "svt-av1" | "x265";

interface WidgetParameters {
    readonly families: readonly Family[];
    readonly entries: Record<Family, readonly string[]>;
}

const WIDGET_PARAMETERS: WidgetParameters = {
    families: ["svt-av1", "x265"],
    entries: {
        "svt-av1": ["--crf", "--preset", "--keyint", "--film-grain", "--aq-mode", "--tune"],
        x265: ["--crf", "--preset", "--keyint", "--psy-rd", "--aq-mode", "--deblock"],
    },
};

const DESCRIPTORS = parametersJson as unknown as Record<
    Family,
    Record<string, ParameterValueEntry["descriptor"]>
>;

function descriptorEntries(family: Family): readonly ParameterValueEntry[] {
    const familyDescriptors = DESCRIPTORS[family] ?? {};
    const names = WIDGET_PARAMETERS.entries[family].filter((name) => familyDescriptors[name] !== undefined);
    return names.map((name) => {
        const descriptor = familyDescriptors[name];
        return {
            name,
            parameter: descriptor?.default ?? null,
            descriptor,
            canonical: name,
        };
    });
}

function ParameterWidget({ family }: { family: Family }) {
    const initial = useMemo(() => descriptorEntries(family), [family]);
    const [values, setValues] = useState<Record<string, unknown>>(() =>
        Object.fromEntries(initial.map((entry) => [entry.name, entry.parameter])),
    );
    const groups = useMemo(() => {
        const grouped = new Map<string, ParameterValueEntry[]>();
        for (const entry of initial) {
            const group = entry.descriptor?.group ?? "Parameters";
            const list = grouped.get(group) ?? [];
            list.push({ ...entry, parameter: values[entry.name] });
            grouped.set(group, list);
        }
        return [...grouped.entries()];
    }, [initial, values]);

    const restore = (): void => {
        setValues(Object.fromEntries(initial.map((entry) => [entry.name, entry.parameter])));
    };

    return (
        <div className="docs-widget docs-widget--parameters">
            <div className="docs-widget__bar">
                <span>{family === "svt-av1" ? "SVT-AV1" : "x265"} · sample values</span>
                <button type="button" onClick={restore}>
                    Reset values
                </button>
            </div>
            <div className="docs-widget__body">
                <ParameterValueGrid
                    groups={groups}
                    locked={false}
                    layout="single"
                    showGroupLabel
                    onChange={(entry, next) => {
                        setValues((current) => ({ ...current, [entry.name]: next }));
                    }}
                    onReset={(entry) => {
                        setValues((current) => ({
                            ...current,
                            [entry.name]: entry.descriptor?.default ?? null,
                        }));
                    }}
                />
            </div>
            <p className="docs-widget__note">
                Sample data only. Changes stay in this page and are never saved to a project.
            </p>
        </div>
    );
}

const QUALITY_SOURCE = {
    scenes: realRun.scenes.scenes,
    frameRate: 24,
    width: 1280,
    height: 720,
    document: {},
    outputExists: true,
};

function AnalyticsWidget() {
    const analytics = useMemo(() => sequenceAnalytics("quality-check", QUALITY_SOURCE), []);
    return (
        <div className="docs-widget docs-widget--analytics">
            <SequenceAnalyticsCard analytics={analytics} title="Sample quality check" />
            <p className="docs-widget__note">
                Sample data from the captured 2,160-frame encode. The chart is real analysis, not
                an illustration.
            </p>
        </div>
    );
}

/** One allowlisted widget from the docs inventory. No page can mount an arbitrary component. */
export function LiveWidget({ id }: { id: "W01" | "W03" | "W05" }) {
    if (id === "W01") {
        return <ParameterWidget key={id} family="svt-av1" />;
    }
    if (id === "W05") {
        return <ParameterWidget key={id} family="x265" />;
    }
    return <AnalyticsWidget key={id} />;
}
