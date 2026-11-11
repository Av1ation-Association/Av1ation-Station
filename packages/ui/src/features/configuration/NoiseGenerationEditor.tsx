import type { Dispatch, SetStateAction } from "react";

import { useFilterSchemas } from "@av1ation/api";

import { defaultFor, type JsonSchema } from "../../shared/schema/config-schema";
import type { DocumentScope } from "../../shared/model/project-sections";
import { Button } from "../../shared/Button";
import { FilterList } from "./FilterList";
import { filterVariants } from "./FilterComposer";
import { InputOverrideEditor } from "./InputOverrideEditor";
import { NumberField } from "../../shared/NumberField";
import { Switch } from "../../shared/Switch";

/**
 * What enabling each sequence writes, when the engine schema carries no default of its own.
 *
 * The detector pair is the engine's own `NoiseDetectorConfig::default()` (a strong reference
 * pass measured against a stronger denoised pass). The scaler has no engine default, so these
 * are the application's starting numbers; a document written here is a complete one, not a
 * set of zeroes that would scale every scene to nothing.
 */
const DETECTOR_START = {
    reference_filters: [{ WNNM: { sigma: [3.0, 0.0, 0.0] } }],
    denoised_filters: [{ WNNM: { sigma: [6.0, 0.0, 0.0] } }],
};

const SCALER_START = {
    threshold: 0.3,
    minimum_scaler: 0.25,
    maximum_scaler: 1.5,
    scale_chroma: false,
};

/** One resolved sequence part, as the section screen hands it to a bespoke editor. */
export interface ResolvedPart {
    node: JsonSchema;
    root: JsonSchema;
}

type NoiseDraft = Record<string, unknown>;

function numberValue(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The Noise generation section, in the order the pipeline runs it.
 *
 * Detection measures a value per scene from a reference pass and a denoised pass; scaling maps
 * that value onto an encoder range. Both are visible at once because the scaler is meaningless
 * without the detector that feeds it, and the thresholds sit on one row so the three numbers
 * are compared, not scrolled past.
 */
export function NoiseGenerationEditor({
    parts,
    draft,
    setDraft,
    locked,
    scope = "project",
    onEditScript,
}: {
    parts: { detector: ResolvedPart; scaler: ResolvedPart };
    draft: NoiseDraft;
    setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    locked: boolean;
    /**
     * Whether this document names a file. A project or template describes every video, so
     * its override states neither a source nor an index; a video override names that one
     * source. The same scope names the document that stores the script.
     */
    scope?: DocumentScope;
    /** Opens the script page for the detector's input override. */
    onEditScript?: (() => void) | undefined;
}) {
    const schemas = useFilterSchemas();
    const detector =
        typeof draft.noise_detector === "object" && draft.noise_detector !== null
            ? (draft.noise_detector as NoiseDraft)
            : null;
    const scaler =
        typeof draft.noise_scaler === "object" && draft.noise_scaler !== null
            ? (draft.noise_scaler as NoiseDraft)
            : null;
    const variants = filterVariants(schemas.data?.vapour_synth as JsonSchema | undefined);

    const setPart = (key: "noise_detector" | "noise_scaler", value: unknown) =>
        setDraft((previous) => (previous === null ? previous : { ...previous, [key]: value }));

    const setDetector = (patch: NoiseDraft) => {
        if (detector === null) {
            return;
        }
        setPart("noise_detector", { ...detector, ...patch });
    };

    const setScaler = (patch: NoiseDraft) => {
        if (scaler === null) {
            return;
        }
        setPart("noise_scaler", { ...scaler, ...patch });
    };

    const list = (key: "reference_filters" | "denoised_filters"): unknown[] => {
        const value = detector?.[key];
        return Array.isArray(value) ? value : [];
    };

    const writeList = (key: "reference_filters" | "denoised_filters", next: unknown[]) =>
        setDetector({ [key]: next });

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                        <h2 className="m-0 text-base font-semibold text-ink">Noise detector</h2>
                        <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                            Produces one noise value per scene from a reference and a denoised pass.
                        </p>
                    </div>
                    {detector === null ? (
                        <Button
                            className="h-8 shrink-0 px-3 text-[12px]"
                            disabled={locked}
                            onClick={() =>
                                setPart("noise_detector", {
                                    ...(defaultFor(
                                        parts.detector.root,
                                        parts.detector.node,
                                    ) as object),
                                    input: null,
                                    ...DETECTOR_START,
                                })
                            }
                        >
                            Enable
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            className="h-8 shrink-0 px-2.5 text-[12px]"
                            disabled={locked}
                            onClick={() => setPart("noise_detector", null)}
                        >
                            Disable
                        </Button>
                    )}
                </div>

                {detector === null ? (
                    <p className="m-0 px-4 py-6 text-[11.5px] text-ink-muted sm:px-5">
                        This sequence is off. Enabling it writes the engine&rsquo;s default
                        document; Save is still required.
                    </p>
                ) : (
                    <div className="space-y-4 px-4 py-4 sm:px-5">
                        <InputOverrideEditor
                            scope={scope}
                            value={detector.input ?? null}
                            onChange={(input) => setDetector({ input })}
                            disabled={locked}
                            idPrefix="noise-detector-input"
                            onEditScript={onEditScript}
                        />

                        {[
                            {
                                key: "reference_filters" as const,
                                label: "Reference filters",
                                help: "The noisy source is measured against this filtered version.",
                            },
                            {
                                key: "denoised_filters" as const,
                                label: "Denoised filters",
                                help: "The reference and this pass must produce the same geometry.",
                            },
                        ].map((block) => (
                            <FilterList
                                key={block.key}
                                label={block.label}
                                help={block.help}
                                filters={list(block.key)}
                                schema={schemas.data?.vapour_synth as JsonSchema | undefined}
                                target="vapour_synth"
                                disabled={locked}
                                canAdd={variants.length > 0}
                                emptyText="No filter in this pass. The engine compares the decoded source unchanged."
                                onChange={(next) => writeList(block.key, next)}
                            />
                        ))}

                        <p className="m-0 text-[10px] leading-relaxed text-ink-muted">
                            The defaults are the engine&rsquo;s own WNNM pair. Overriding them is
                            advanced and rarely needed; both lists must produce the same geometry.
                        </p>
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                        <h2 className="m-0 text-base font-semibold text-ink">Noise scaler</h2>
                        <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                            Consumes the detector&rsquo;s per-scene value and maps it onto a scaler
                            range.
                        </p>
                    </div>
                    {scaler === null ? (
                        <Button
                            className="h-8 shrink-0 px-3 text-[12px]"
                            disabled={locked}
                            onClick={() =>
                                setPart("noise_scaler", {
                                    ...(defaultFor(parts.scaler.root, parts.scaler.node) as object),
                                    ...SCALER_START,
                                })
                            }
                        >
                            Enable
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            className="h-8 shrink-0 px-2.5 text-[12px]"
                            disabled={locked}
                            onClick={() => setPart("noise_scaler", null)}
                        >
                            Disable
                        </Button>
                    )}
                </div>

                {scaler === null ? (
                    <p className="m-0 px-4 py-6 text-[11.5px] text-ink-muted sm:px-5">
                        Scaling is off. Detection can still run; its values are kept per scene.
                    </p>
                ) : (
                    <div className="space-y-4 px-4 py-4 sm:px-5">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <label className="min-w-0">
                                <span className="block text-[10.5px] font-medium text-ink-secondary">
                                    Threshold
                                </span>
                                <NumberField
                                    label="Noise threshold"
                                    value={numberValue(scaler.threshold)}
                                    step={0.001}
                                    disabled={locked}
                                    onChange={(next) => setScaler({ threshold: next })}
                                    className="mt-1"
                                />
                            </label>
                            <label className="min-w-0">
                                <span className="block text-[10.5px] font-medium text-ink-secondary">
                                    Minimum scaler
                                </span>
                                <NumberField
                                    label="Minimum scaler"
                                    value={numberValue(scaler.minimum_scaler)}
                                    step={0.1}
                                    disabled={locked}
                                    onChange={(next) => setScaler({ minimum_scaler: next })}
                                    className="mt-1"
                                />
                            </label>
                            <label className="min-w-0">
                                <span className="block text-[10.5px] font-medium text-ink-secondary">
                                    Maximum scaler
                                </span>
                                <NumberField
                                    label="Maximum scaler"
                                    value={numberValue(scaler.maximum_scaler)}
                                    step={0.1}
                                    disabled={locked}
                                    onChange={(next) => setScaler({ maximum_scaler: next })}
                                    className="mt-1"
                                />
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-4 border-t border-line-subtle pt-3">
                            <div className="min-w-0">
                                <p className="m-0 text-[11.5px] font-medium text-ink">
                                    Scale chroma
                                </p>
                                <p className="mt-0.5 mb-0 text-[10px] leading-relaxed text-ink-muted">
                                    Applies the same scaler to both chroma planes as the luma plane
                                    receives.
                                </p>
                            </div>
                            <Switch
                                checked={scaler.scale_chroma === true}
                                disabled={locked}
                                label="Scale chroma"
                                onChange={(next) => setScaler({ scale_chroma: next })}
                            />
                        </div>

                        <p className="m-0 text-[10px] leading-relaxed text-ink-muted">
                            Noise scaling is idempotent. A scene already carrying scaled noise data
                            is not scaled again on a later run, so re-running the sequence costs
                            nothing and never doubles the grain.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
