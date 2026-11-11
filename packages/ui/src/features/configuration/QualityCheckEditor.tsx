import type { Dispatch, SetStateAction } from "react";

import { useSettings } from "@av1ation/api";
import { AlertTriangle } from "lucide-react";

import { InputOverrideEditor } from "./InputOverrideEditor";
import { MetricField, ProbeFields } from "./QualityFields";
import type { JsonSchema } from "../../shared/schema/config-schema";
import type { DocumentScope } from "../../shared/model/project-sections";

/**
 * What enabling Quality check writes.
 *
 * The schema has no Rust `Default`, so enabling it would otherwise score with an empty metric
 * and no statistic. These are the engine's `QualityCheckConfig::default()` values.
 */
const CHECK_START = {
    metric: {
        SSIMULACRA2: {
            target_range: [74, 76],
            resolution: null,
            threads: null,
            gpu_id: null,
        },
    },
    strategy: "Whole",
    statistic: "Mean",
    input: null,
};

type Draft = Record<string, unknown>;

function asRecord(value: unknown): Draft {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Draft)
        : {};
}

/**
 * Quality check scores the retained chunks against the source.
 *
 * It runs after encoding and changes nothing about the encode, so the screen shows the metric
 * controls, the comparison source, and the one thing that makes the check impossible: the
 * chunks having been deleted. The setup card is not the target-quality card with a different
 * title — there is no target range, no quantizer range, and no interpolation, because nothing
 * is being chosen; the frames are simply scored.
 */
export function QualityCheckEditor({
    parts,
    draft,
    setDraft,
    locked,
    scope,
    encodingFilter,
    onEditScript,
}: {
    parts: { check: { root: JsonSchema; node: JsonSchema } };
    draft: Draft;
    setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    locked: boolean;
    scope: DocumentScope;
    /** Whether Encoding applies an FFmpeg filter, which makes the scored frames differ. */
    encodingFilter: boolean;
    /** Opens the script page for the comparison input. */
    onEditScript?: (() => void) | undefined;
}) {
    const settings = useSettings();
    const retentionOff = settings.data?.delete_chunks_on_success === true;
    const check = asRecord(draft.quality_check);
    // `{}` is a sequence an older build enabled without writing any settings; it cannot score.
    const enabled = Object.keys(check).length > 0;
    const incomplete =
        !enabled && draft.quality_check !== null && draft.quality_check !== undefined;
    const probing = asRecord(check);

    const setCheck = (next: unknown) =>
        setDraft((previous) =>
            previous === null ? previous : { ...previous, quality_check: next },
        );

    const patchCheck = (patch: Draft) => setCheck({ ...CHECK_START, ...check, ...patch });

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                        <h2 className="m-0 text-base font-semibold text-ink">Setup</h2>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label="Quality check"
                        disabled={locked}
                        onClick={() => setCheck(enabled ? null : CHECK_START)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:opacity-50 ${
                            enabled ? "border-brand bg-brand" : "border-line-strong bg-sunken"
                        }`}
                    >
                        <span
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 rounded-full transition-transform duration-150 ${
                                enabled
                                    ? "translate-x-[18px] bg-on-brand"
                                    : "translate-x-[3px] bg-ink"
                            }`}
                        />
                    </button>
                </div>

                {!enabled ? (
                    <p className="m-0 px-4 py-5 text-[11.5px] text-ink-muted sm:px-5">
                        {incomplete
                            ? "This sequence was saved without any settings. Turn it on to write a complete document; Save is still required."
                            : "Quality check is off. The encoded chunks are still retained, so it can be enabled after a run without encoding again."}
                    </p>
                ) : (
                    <div className="space-y-5 px-4 py-4 sm:px-5">
                        <div>
                            <MetricField
                                value={check.metric}
                                onChange={(metric) => patchCheck({ metric })}
                                root={parts.check.root}
                                node={parts.check.node}
                                disabled={locked}
                                showRange={false}
                            />
                            <p className="mt-2 mb-0 max-w-[80ch] text-[10px] leading-relaxed text-ink-muted">
                                A metric is available when at least one of its backends is usable.
                                Unavailable metrics are absent from the picker, not disabled; see
                                Settings → Dependencies for remediation.
                            </p>
                        </div>

                        <ProbeFields
                            strategy={probing.strategy}
                            statistic={probing.statistic}
                            onStrategy={(strategy) =>
                                patchCheck({
                                    strategy,
                                })
                            }
                            onStatistic={(statistic) =>
                                patchCheck({
                                    statistic,
                                })
                            }
                            disabled={locked}
                        />

                        <div className="border-t border-line-subtle pt-4">
                            <InputOverrideEditor
                                scope={scope}
                                value={check.input ?? null}
                                onChange={(input) => patchCheck({ input })}
                                disabled={locked}
                                idPrefix="quality-check-input"
                                onEditScript={onEditScript}
                            />
                            <p className="mt-1 mb-0 max-w-[80ch] text-[10px] leading-relaxed text-ink-muted">
                                The metric compares retained chunks against the frames this input
                                produces. An override changes only the comparison source, never the
                                encode.
                            </p>
                        </div>

                        {retentionOff ? (
                            <div
                                role="status"
                                className="rounded-lg border border-warning/40 bg-warning-soft px-3.5 py-3"
                            >
                                <p className="m-0 flex items-center gap-2 text-[11.5px] font-medium text-warning">
                                    <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                                    Chunks are deleted after a successful encode
                                </p>
                                <p className="mt-1 mb-0 text-[10.5px] leading-relaxed text-ink-secondary">
                                    Settings → Storage has chunk retention off, so there is nothing
                                    left to score. Turn retention on before running this
                                    {scope === "video"
                                        ? " video"
                                        : scope === "template"
                                          ? " template"
                                          : " project"}
                                    , or the quality check cannot read the encode.
                                </p>
                            </div>
                        ) : null}

                        {encodingFilter ? (
                            <div
                                role="status"
                                className="rounded-lg border border-warning/40 bg-warning-soft px-3.5 py-3"
                            >
                                <p className="m-0 flex items-center gap-2 text-[11.5px] font-medium text-warning">
                                    <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                                    Encoding applies an FFmpeg filter
                                </p>
                                <p className="mt-1 mb-0 text-[10.5px] leading-relaxed text-ink-secondary">
                                    Scored frames are not the source frames, so the score may not be
                                    comparable with other runs. The check still runs; the result is
                                    labelled.
                                </p>
                            </div>
                        ) : null}
                    </div>
                )}
            </section>
        </div>
    );
}
