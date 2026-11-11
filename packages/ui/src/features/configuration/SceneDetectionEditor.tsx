import { useId } from "react";

import type { DocumentScope } from "../../shared/model/project-sections";
import { InputOverrideEditor } from "./InputOverrideEditor";

const METHOD_OPTIONS = [
    { id: "None", label: "None" },
    { id: "AVSceneChange", label: "AVSceneChange" },
    { id: "TransNetV2", label: "TransNetV2" },
] as const;

type MethodKey = (typeof METHOD_OPTIONS)[number]["id"];

const PRESET_OPTIONS = [
    { id: "Fast", label: "Fast" },
    { id: "Standard", label: "Standard" },
] as const;

/** A joined set of radio buttons for a choice with only a few values. */
function Segmented({
    label,
    value,
    options,
    onChange,
    disabled = false,
}: {
    label: string;
    value: string;
    options: ReadonlyArray<{ id: string; label: string }>;
    onChange: (next: string) => void;
    disabled?: boolean;
}) {
    return (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
            {options.map((option) => {
                const selected = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => onChange(option.id)}
                        className={`h-8 rounded-md border px-3 text-[11px] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${
                            selected
                                ? "border-line-strong bg-raised font-medium text-ink"
                                : "border-line bg-sunken text-ink-secondary hover:border-line-strong hover:text-ink"
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

function methodEntry(value: Record<string, unknown>): {
    key: MethodKey;
    body: Record<string, unknown>;
} {
    const method = value.method;
    if (typeof method === "object" && method !== null) {
        const [key, body] = Object.entries(method)[0] ?? [];
        if (key === "None" || key === "AVSceneChange" || key === "TransNetV2") {
            return {
                key,
                body:
                    typeof body === "object" && body !== null
                        ? (body as Record<string, unknown>)
                        : {},
            };
        }
    }
    return { key: "None", body: {} };
}

function bound(body: Record<string, unknown>, key: string, fallback: number): number {
    return typeof body[key] === "number" ? (body[key] as number) : fallback;
}

/**
 * Scene detection in the shape the boards use: the detector comes first, the method is a
 * small radio group, the preset is a second one, and the bounds sit beside each other.
 *
 * The per-frame score switch belongs to the method, not to a separate Options section:
 * only `AVSceneChange` and `TransNetV2` produce scores. A custom detection input uses the
 * shared `InputOverrideEditor`, which is General's own editor, so the detection override is
 * one more sequence input rather than a second way to describe an input.
 *
 * The card stays inside the generated draft: it reads and writes the same
 * `scene_detector` object the schema describes, so a switch here serialises exactly like
 * the engine's own `SceneDetectionMethod` enum.
 */
export function SceneDetectionEditor({
    value,
    onChange,
    locked,
    scope = "project",
    onEditScript,
}: {
    value: Record<string, unknown>;
    onChange: (next: Record<string, unknown>) => void;
    locked: boolean;
    scope?: DocumentScope;
    /** Opens the script page for the detection input override. */
    onEditScript?: (() => void) | undefined;
}) {
    const idPrefix = useId();
    const { key, body } = methodEntry(value);

    const updateBody = (patch: Record<string, unknown>) => {
        onChange({ ...value, method: { [key]: { ...body, ...patch } } });
    };

    const chooseMethod = (next: MethodKey) => {
        if (next === key) {
            return;
        }
        // Bounds are shared by all three variants; keep them when the method changes.
        const bounds = {
            minimum_length: bound(body, "minimum_length", 24),
            maximum_length: bound(body, "maximum_length", 240),
        };
        const nextBody =
            next === "None"
                ? bounds
                : next === "AVSceneChange"
                  ? {
                        ...bounds,
                        method: body.method === "Fast" ? "Fast" : "Standard",
                        save_scores: body.save_scores === true,
                    }
                  : {
                        ...bounds,
                        save_scores: body.save_scores === true,
                        model_path: typeof body.model_path === "string" ? body.model_path : null,
                    };
        onChange({ ...value, method: { [next]: nextBody } });
    };

    const minimum = bound(body, "minimum_length", 0);
    const maximum = bound(body, "maximum_length", 0);
    const scores = body.save_scores === true;
    const preset = body.method === "Fast" ? "Fast" : "Standard";

    return (
        <div className="space-y-4">
            <section
                aria-labelledby={`${idPrefix}-method`}
                className="rounded-lg border border-line bg-surface"
            >
                <div className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 id={`${idPrefix}-method`} className="m-0 text-base font-semibold text-ink">
                        Method
                    </h2>
                    <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                        The detector and its bounds.
                    </p>
                </div>
                <div className="space-y-5 px-4 py-4 sm:px-5">
                    <Segmented
                        label="Detection method"
                        value={key}
                        options={METHOD_OPTIONS}
                        onChange={(next) => chooseMethod(next as MethodKey)}
                        disabled={locked}
                    />

                    {key === "AVSceneChange" ? (
                        <div>
                            <p className="m-0 text-[11px] font-medium text-ink-secondary">
                                Detection preset
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <Segmented
                                    label="Detection preset"
                                    value={preset}
                                    options={PRESET_OPTIONS}
                                    onChange={(next) => updateBody({ method: next })}
                                    disabled={locked}
                                />
                                <p className="m-0 min-w-0 flex-1 basis-56 text-[10px] leading-relaxed text-ink-muted">
                                    Fast scores a downscaled clip; Standard scores the
                                    full-resolution source.
                                </p>
                            </div>
                        </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block min-w-0">
                            <span className="text-[11px] font-medium text-ink-secondary">
                                Minimum scene length
                            </span>
                            <span className="mt-1 flex h-8 min-w-0 items-center rounded-md border border-line-strong bg-raised focus-within:border-brand">
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    aria-label="Minimum scene length in frames"
                                    value={minimum}
                                    disabled={locked}
                                    onChange={(event) =>
                                        updateBody({
                                            minimum_length: Math.max(
                                                0,
                                                Math.trunc(Number(event.target.value) || 0),
                                            ),
                                        })
                                    }
                                    className="h-full min-w-0 flex-1 rounded-md bg-transparent px-2 font-mono text-[11px] text-ink outline-none disabled:opacity-50"
                                />
                                <span className="pr-2 font-mono text-[9.5px] text-ink-muted">
                                    frames
                                </span>
                            </span>
                        </label>
                        <label className="block min-w-0">
                            <span className="text-[11px] font-medium text-ink-secondary">
                                Maximum scene length
                            </span>
                            <span className="mt-1 flex h-8 min-w-0 items-center rounded-md border border-line-strong bg-raised focus-within:border-brand">
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    aria-label="Maximum scene length in frames"
                                    value={maximum}
                                    disabled={locked}
                                    onChange={(event) =>
                                        updateBody({
                                            maximum_length: Math.max(
                                                0,
                                                Math.trunc(Number(event.target.value) || 0),
                                            ),
                                        })
                                    }
                                    className="h-full min-w-0 flex-1 rounded-md bg-transparent px-2 font-mono text-[11px] text-ink outline-none disabled:opacity-50"
                                />
                                <span className="pr-2 font-mono text-[9.5px] text-ink-muted">
                                    frames
                                </span>
                            </span>
                        </label>
                    </div>
                    <p className="m-0 text-[10px] leading-relaxed text-ink-muted">
                        Shorter cuts merge; longer scenes split. Both bounds are inclusive, and the
                        boundaries are written as they are found, so cancelling keeps the scenes
                        already detected.
                    </p>

                    {key === "TransNetV2" ? (
                        <div>
                            <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                                The ONNX model is located once in Settings → Dependencies and
                                applies to every project; with no model located, the engine searches
                                its own locations. The Fast/Standard preset does not apply to
                                TransNetV2.
                            </p>
                        </div>
                    ) : null}

                    {key === "None" ? (
                        <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                            None produces one arbitrary scene for the whole video. That is valid,
                            but every later stage then sees a single scene.
                        </p>
                    ) : (
                        <label className="flex cursor-pointer items-start gap-2.5 border-t border-line-subtle pt-4">
                            <input
                                type="checkbox"
                                checked={scores}
                                disabled={locked}
                                onChange={(event) =>
                                    updateBody({ save_scores: event.target.checked })
                                }
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand-default)]"
                            />
                            <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-2 text-[11.5px] font-medium text-ink">
                                    Write per-frame scores
                                    <span className="rounded-full border border-line-strong px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-ink-muted uppercase">
                                        Advanced
                                    </span>
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-muted">
                                    Stores one value per frame beside the scene list. Off by
                                    default; the scene boundaries are always kept.
                                </span>
                            </span>
                        </label>
                    )}
                </div>
            </section>

            <section
                aria-labelledby={`${idPrefix}-input`}
                className="rounded-lg border border-line bg-surface"
            >
                <div className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 id={`${idPrefix}-input`} className="m-0 text-base font-semibold text-ink">
                        Input
                    </h2>
                    <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                        {scope === "video"
                            ? "The video input by default. An override applies to detection only."
                            : scope === "template"
                              ? "The template input by default. An override applies to detection only."
                              : "The project input by default. An override applies to detection only."}
                    </p>
                </div>
                <div className="px-4 py-4 sm:px-5">
                    <InputOverrideEditor
                        scope={scope}
                        value={value.input ?? null}
                        onChange={(input) => onChange({ ...value, input })}
                        disabled={locked}
                        idPrefix={`${idPrefix}-input`}
                        showHeading={false}
                        onEditScript={onEditScript}
                    />
                </div>
            </section>
        </div>
    );
}
