import type { Dispatch, SetStateAction } from "react";

import type { EncoderDescriptor } from "@av1ation/contracts";

import { Switch } from "../../shared/Switch";
import type { DocumentScope } from "../../shared/model/project-sections";
import type { SectionDefinition } from "../../shared/model/section-definitions";
import {
    SchemaField,
    SchemaObjectFields,
    defaultFor,
    resolveSchema,
    type JsonSchema,
} from "../../shared/schema/config-schema";
import { EncoderEditor } from "../encoders/EncoderEditor";
import { EncoderWorkersEditor } from "../encoders/EncoderWorkersEditor";
import { InputOverrideEditor } from "./InputOverrideEditor";
import { NoiseGenerationEditor } from "./NoiseGenerationEditor";
import { QualityCheckEditor } from "./QualityCheckEditor";
import { SceneDetectionEditor } from "./SceneDetectionEditor";
import { TargetQualityEditor } from "./TargetQualityEditor";
import { VideoConcatSources, VideoTrackMapSection } from "./ConcatWorkbench";

export function schemaFor(
    schemas: {
        encoder: Record<string, unknown>;
        sequences: Record<string, unknown>;
    },
    definition: SectionDefinition,
): {
    root: JsonSchema;
    parts: Array<{ node: JsonSchema; root: JsonSchema }>;
} {
    const encoder = schemas.encoder as JsonSchema;
    const sequences = schemas.sequences as JsonSchema;
    const properties = sequences.properties ?? {};
    // The encoder document and the sequence documents are two schemas; each part names the
    // one it resolves against, so a section can carry both without a second renderer.
    return {
        root: definition.encoder === true ? encoder : sequences,
        parts: definition.parts.map((part) =>
            part.key === "encoder"
                ? { node: encoder, root: encoder }
                : { node: properties[part.key] ?? {}, root: sequences },
        ),
    };
}

export function buildDraft(
    definition: SectionDefinition,
    document: Record<string, unknown>,
): Record<string, unknown> {
    const sequences =
        typeof document.sequences === "object" && document.sequences !== null
            ? (document.sequences as Record<string, unknown>)
            : {};
    // A document that never carried a sequence keeps it absent, so saving one section does
    // not write `null` over a neighbour the engine still resolves from its own defaults.
    const draft: Record<string, unknown> = Object.fromEntries(
        definition.parts
            .filter((part) => part.key !== "encoder")
            // A required part is always in the document; an optional one that was never written
            // must stay absent, so saving one section does not write `null` over a neighbour.
            .filter((part) => part.optional === false || sequences[part.key] !== undefined)
            .map((part) => [part.key, sequences[part.key] ?? {}]),
    );
    if (definition.encoder === true) {
        draft.encoder = document.encoder ?? null;
    }
    return draft;
}

export function mergeDraft(
    document: Record<string, unknown>,
    definition: SectionDefinition,
    draft: Record<string, unknown>,
): Record<string, unknown> {
    const sequences =
        typeof document.sequences === "object" && document.sequences !== null
            ? (document.sequences as Record<string, unknown>)
            : {};
    const merged: Record<string, unknown> = {
        ...document,
        sequences: { ...sequences },
    };
    for (const part of definition.parts) {
        if (part.key === "encoder") {
            merged.encoder = draft.encoder ?? null;
        } else if (Object.prototype.hasOwnProperty.call(draft, part.key)) {
            (merged.sequences as Record<string, unknown>)[part.key] = draft[part.key] ?? null;
        }
    }
    return merged;
}

const CONCAT_METHODS = [
    {
        id: "mkvmerge",
        label: "mkvmerge",
        detail: "Matroska-native. Video is the encoded track; source audio, subtitles and attachments follow.",
    },
    {
        id: "ffmpeg",
        label: "FFmpeg",
        detail: "Broad format support. Video is the encoded track; source streams can be copied or filtered.",
    },
    {
        id: "ivf",
        label: "IVF",
        detail: "Raw AV1 elementary stream. No container, no other streams, no chapters.",
    },
] as const;

function methodVariantDefaults(): Record<string, unknown> {
    return { tracks: null, chapters: null, metadata: null, extra_inputs: [] };
}

/**
 * The project context chooses only the method; the track map belongs to each video.
 *
 * The same component renders Settings → Project Defaults, so the template cannot show a
 * per-track or output field that a real project would never be allowed to set.
 */
export function ConcatenationEditor({
    draft,
    setDraft,
    locked,
    scope = "project",
    projectId,
    videoId,
    schema,
}: {
    draft: Record<string, unknown>;
    setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    locked: boolean;
    /** A project or template picks the default; a video picks the method for its own chunks. */
    scope?: DocumentScope;
    /** The video whose source audio supplies the track-map proposal. */
    projectId?: string;
    videoId?: string;
    /** The generated `scene_concatenator` schema, for the per-track option fields. */
    schema?: { node: JsonSchema; root: JsonSchema } | undefined;
}) {
    const section =
        typeof draft.scene_concatenator === "object" && draft.scene_concatenator !== null
            ? (draft.scene_concatenator as Record<string, unknown>)
            : {};
    const method = section.method;
    const selected =
        typeof method === "string"
            ? method
            : typeof method === "object" && method !== null
              ? (Object.keys(method)[0] ?? "mkvmerge")
              : "mkvmerge";

    const choose = (id: (typeof CONCAT_METHODS)[number]["id"]) => {
        if (locked) {
            return;
        }
        setDraft((previous) => {
            if (previous === null) {
                return previous;
            }
            const current =
                typeof previous.scene_concatenator === "object" &&
                previous.scene_concatenator !== null
                    ? (previous.scene_concatenator as Record<string, unknown>)
                    : {};
            const next = id === "ivf" ? "ivf" : { [id]: methodVariantDefaults() };
            return {
                ...previous,
                scene_concatenator: { ...current, method: next },
            };
        });
    };

    const methodRecord =
        typeof method === "object" && method !== null ? (method as Record<string, unknown>) : null;
    const selectedConfig = methodRecord?.[selected];

    const setMethodBody = (next: Record<string, unknown>) => {
        setDraft((previous) => {
            if (previous === null) {
                return previous;
            }
            const current =
                typeof previous.scene_concatenator === "object" &&
                previous.scene_concatenator !== null
                    ? (previous.scene_concatenator as Record<string, unknown>)
                    : {};
            const existingMethod = current.method;
            const methods =
                typeof existingMethod === "object" && existingMethod !== null
                    ? (existingMethod as Record<string, unknown>)
                    : {};
            return {
                ...previous,
                scene_concatenator: {
                    ...current,
                    method: {
                        ...methods,
                        [selected]: next,
                    },
                },
            };
        });
    };

    return (
        <>
            <section className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 className="m-0 text-base font-semibold text-ink">Method</h2>
                    <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                        {scope === "video"
                            ? "The method this video uses to join its encoded chunks. Without an override it follows the project."
                            : "Default for every video; a video may choose a different method."}
                    </p>
                </div>
                <div className="grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
                    {CONCAT_METHODS.map((option) => {
                        const current = option.id === selected;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={current}
                                disabled={locked}
                                onClick={() => choose(option.id)}
                                className={`flex min-h-[146px] flex-col rounded-lg border p-4 text-left transition-colors duration-150 disabled:opacity-50 ${
                                    current
                                        ? "border-brand bg-raised"
                                        : "border-line bg-sunken hover:border-line-strong"
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className={`h-3.5 w-3.5 rounded-full border ${
                                            current ? "border-brand bg-brand" : "border-line-strong"
                                        }`}
                                    />
                                    <span className="text-[13px] font-semibold text-ink">
                                        {option.label}
                                    </span>
                                </span>
                                <span className="mt-2 block text-[10.5px] leading-relaxed text-ink-secondary">
                                    {option.detail}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {scope === "video" &&
                selected !== "ivf" &&
                projectId !== undefined &&
                videoId !== undefined ? (
                    <VideoTrackMapSection
                        projectId={projectId}
                        videoId={videoId}
                        method={selected === "ffmpeg" ? "ffmpeg" : "mkvmerge"}
                        config={
                            typeof selectedConfig === "object" && selectedConfig !== null
                                ? (selectedConfig as Record<string, unknown>)
                                : methodVariantDefaults()
                        }
                        schema={schema}
                        locked={locked}
                        onChange={setMethodBody}
                    />
                ) : null}
            </section>

            {scope === "video" &&
            selected !== "ivf" &&
            projectId !== undefined &&
            videoId !== undefined ? (
                <VideoConcatSources
                    projectId={projectId}
                    videoId={videoId}
                    method={selected === "ffmpeg" ? "ffmpeg" : "mkvmerge"}
                    config={
                        typeof selectedConfig === "object" && selectedConfig !== null
                            ? (selectedConfig as Record<string, unknown>)
                            : methodVariantDefaults()
                    }
                    schema={schema}
                    locked={locked}
                    onChange={setMethodBody}
                />
            ) : null}

            <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                {scope === "video"
                    ? "Tracks, chapters, metadata, and the exact output file come from this video's encoded chunks and source."
                    : "Tracks, chapters, metadata, and the exact output file belong to each video; a video proposes them from its encoded chunks and its source."}
            </p>
        </>
    );
}

/**
 * Whether the saved encoder document sets an FFmpeg filter on the encoded frames.
 *
 * The encoder is one tagged variant (`{ SVTAV1: { …, ffmpeg_filter } }`), so the flag lives
 * inside the variant body rather than on the document. Quality check warns from the saved
 * document, not the draft: the warning describes the encode a score would be compared with.
 */
export function encoderAppliesFilter(document: Record<string, unknown> | null): boolean {
    if (document === null) {
        return false;
    }
    const encoder = document.encoder;
    if (typeof encoder !== "object" || encoder === null) {
        return false;
    }
    const body = Object.values(encoder as Record<string, unknown>)[0];
    if (typeof body !== "object" || body === null) {
        return false;
    }
    const filter = (body as Record<string, unknown>).ffmpeg_filter;
    return typeof filter === "string" && filter.trim() !== "";
}

/** The resolved schema of one part, narrowed to the properties the section owns. */
export function partSchema(
    root: JsonSchema,
    node: JsonSchema,
    only?: readonly string[],
): JsonSchema {
    // An optional sequence is `anyOf [<config>, null]`; the fields live in the non-null half.
    let resolved = resolveSchema(root, node);
    const variant = resolved.anyOf?.find(
        (entry) => !(Array.isArray(entry.type) ? entry.type : [entry.type]).includes("null"),
    );
    if (variant !== undefined) {
        resolved = resolveSchema(root, variant);
    }
    if (only === undefined) {
        return resolved;
    }
    return {
        ...resolved,
        properties: Object.fromEntries(
            Object.entries(resolved.properties ?? {}).filter(([key]) => only.includes(key)),
        ),
        required: (resolved.required ?? []).filter((key) => only.includes(key)),
    };
}

/**
 * The generated fields of one configuration section. It is shared by the project section
 * screen and the Settings defaults editor so both render one schema with one component.
 *
 * A part that carries an `input` renders the shared input editor for it and the generated
 * form for the remaining fields, so a sequence's decode is never a schema-shaped object.
 * `scope` decides what that override may state and which document it names: a project or
 * template cannot name a file; a video can say it stores the script in its own document.
 */
export function SectionParts({
    definition,
    resolved,
    draft,
    setDraft,
    locked,
    scope = "project",
    encodingFilter = false,
    encoderDocument = null,
    encoders,
    frameRate = null,
    onEditScript,
}: {
    definition: SectionDefinition;
    resolved: {
        root: JsonSchema;
        parts: Array<{ node: JsonSchema; root: JsonSchema }>;
    };
    draft: Record<string, unknown>;
    setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    locked: boolean;
    scope?: DocumentScope;
    /** A video's probed rate, for seconds edits; project and template scope have none. */
    frameRate?: number | null;
    /** The saved encoder, so a probe screen quotes that encoder's quantizer scale. */
    encoderDocument?: Record<string, unknown> | null;
    /** The encoder catalogue, for the probe's own quantizer scale. */
    encoders?: EncoderDescriptor[] | undefined;
    /** Opens the Monaco page for one input override, named by its part key. */
    onEditScript?: ((part: string) => void) | undefined;
    /** Whether Encoding sets an FFmpeg filter, which makes a scored frame differ from source. */
    encodingFilter?: boolean;
}) {
    if (definition.id === "target-quality") {
        return (
            <TargetQualityEditor
                parts={{
                    target: {
                        root: resolved.parts[0]?.root ?? resolved.root,
                        node: resolved.parts[0]?.node ?? {},
                    },
                    bitrate: {
                        root: resolved.parts[2]?.root ?? resolved.root,
                        node: resolved.parts[2]?.node ?? {},
                    },
                }}
                draft={draft}
                setDraft={setDraft}
                locked={locked}
                scope={scope}
                encoderDocument={encoderDocument}
                encoders={encoders}
                onEditScript={
                    onEditScript === undefined ? undefined : () => onEditScript("target_quality")
                }
                onEditMetricScript={
                    onEditScript === undefined
                        ? undefined
                        : () => onEditScript("target_quality.metric_input")
                }
            />
        );
    }
    if (definition.id === "quality-check") {
        return (
            <QualityCheckEditor
                parts={{
                    check: {
                        root: resolved.parts[0]?.root ?? resolved.root,
                        node: resolved.parts[0]?.node ?? {},
                    },
                }}
                draft={draft}
                setDraft={setDraft}
                locked={locked}
                scope={scope}
                encodingFilter={encodingFilter}
                onEditScript={
                    onEditScript === undefined ? undefined : () => onEditScript("quality_check")
                }
            />
        );
    }
    if (definition.id === "noise-generation") {
        return (
            <NoiseGenerationEditor
                parts={{
                    detector: {
                        root: resolved.parts[0]?.root ?? resolved.root,
                        node: resolved.parts[0]?.node ?? {},
                    },
                    scaler: {
                        root: resolved.parts[1]?.root ?? resolved.root,
                        node: resolved.parts[1]?.node ?? {},
                    },
                }}
                draft={draft}
                setDraft={setDraft}
                locked={locked}
                scope={scope}
                onEditScript={
                    onEditScript === undefined ? undefined : () => onEditScript("noise_detector")
                }
            />
        );
    }
    return (
        <>
            {definition.parts.map((part, index) => {
                const partRoot = resolved.parts[index]?.root ?? resolved.root;
                const node = resolved.parts[index]?.node ?? {};
                const value = draft[part.key];
                const optional = part.optional;
                const schema = partSchema(partRoot, node, part.only);
                const inputField = schema.properties?.input;
                const fields =
                    inputField === undefined
                        ? schema
                        : {
                              ...schema,
                              properties: Object.fromEntries(
                                  Object.entries(schema.properties ?? {}).filter(
                                      ([key]) => key !== "input",
                                  ),
                              ),
                              required: (schema.required ?? []).filter((key) => key !== "input"),
                          };
                const partObject = fields.properties !== undefined;
                const setPart = (next: unknown) =>
                    setDraft((previous) =>
                        previous === null ? previous : { ...previous, [part.key]: next },
                    );
                // A required part that the document does not carry has nothing to edit; an
                // empty card would claim the engine runs a sequence it never configured.
                if (!optional && (value === null || value === undefined)) {
                    return null;
                }
                if (
                    definition.id === "scene-detection" &&
                    typeof value === "object" &&
                    value !== null
                ) {
                    return (
                        <SceneDetectionEditor
                            key={part.key}
                            value={value as Record<string, unknown>}
                            onChange={(next) =>
                                setDraft((previous) =>
                                    previous === null
                                        ? previous
                                        : { ...previous, [part.key]: next },
                                )
                            }
                            locked={locked}
                            scope={scope}
                            frameRate={frameRate}
                            onEditScript={
                                onEditScript === undefined
                                    ? undefined
                                    : () => onEditScript(part.key)
                            }
                        />
                    );
                }
                if (
                    definition.encoder === true &&
                    part.key === "encoder" &&
                    typeof value === "object" &&
                    value !== null
                ) {
                    return (
                        <EncoderEditor
                            key={part.key}
                            root={partRoot}
                            node={node}
                            value={value}
                            onChange={setPart}
                            locked={locked}
                            scope={scope}
                            workers={
                                definition.id === "encoding" ? (
                                    <EncoderWorkersEditor
                                        inline
                                        draft={draft}
                                        setDraft={setDraft}
                                        locked={locked}
                                    />
                                ) : undefined
                            }
                        />
                    );
                }
                if (definition.id === "encoding" && part.key === "benchmarker") {
                    // Workers share the Encoder row; rendering the part again would
                    // duplicate the same control in two cards.
                    return null;
                }
                return (
                    <section
                        key={part.key}
                        aria-labelledby={`${part.key}-heading`}
                        className="rounded-lg border border-line bg-surface"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
                            <div className="min-w-0">
                                <h2
                                    id={`${part.key}-heading`}
                                    className="m-0 text-base font-semibold text-ink"
                                >
                                    {part.title}
                                </h2>
                                <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                                    {part.description}
                                </p>
                            </div>
                            {optional ? (
                                <Switch
                                    label={part.title}
                                    checked={value !== null && value !== undefined}
                                    disabled={locked}
                                    onChange={(next) =>
                                        setDraft((previous) =>
                                            previous === null
                                                ? previous
                                                : {
                                                      ...previous,
                                                      [part.key]: next
                                                          ? defaultFor(partRoot, node)
                                                          : null,
                                                  },
                                        )
                                    }
                                />
                            ) : null}
                        </div>

                        {value === null || value === undefined ? (
                            <div className="px-4 py-8 text-center sm:px-5">
                                <p className="m-0 text-[12.5px] text-ink-secondary">
                                    This sequence is off. The engine skips it and its settings do
                                    not apply.
                                </p>
                                <p className="mx-auto mt-1 mb-0 max-w-[52ch] text-[11px] leading-relaxed text-ink-muted">
                                    Enabling it writes a complete default document from the engine
                                    schema; Save is still required.
                                </p>
                            </div>
                        ) : (
                            <div className="px-4 py-2 sm:px-5">
                                {inputField === undefined ? null : (
                                    <InputOverrideEditor
                                        scope={scope}
                                        value={
                                            typeof value === "object" && value !== null
                                                ? (value as Record<string, unknown>).input
                                                : null
                                        }
                                        onChange={(input) =>
                                            setPart({
                                                ...(value as Record<string, unknown>),
                                                input,
                                            })
                                        }
                                        disabled={locked}
                                        idPrefix={`${part.key}-input`}
                                        showHeading={false}
                                        onEditScript={
                                            onEditScript === undefined
                                                ? undefined
                                                : () => onEditScript(part.key)
                                        }
                                    />
                                )}
                                {partObject ? (
                                    Object.keys(fields.properties ?? {}).length === 0 ? null : (
                                        <SchemaObjectFields
                                            root={partRoot}
                                            schema={fields}
                                            value={value}
                                            onChange={setPart}
                                            depth={0}
                                        />
                                    )
                                ) : (
                                    <SchemaField
                                        root={partRoot}
                                        schema={fields}
                                        value={value}
                                        name={part.title}
                                        onChange={setPart}
                                    />
                                )}
                            </div>
                        )}
                    </section>
                );
            })}
        </>
    );
}
