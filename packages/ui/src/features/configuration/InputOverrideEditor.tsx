import { useContext, useState } from "react";

import { useProbeInput } from "@av1ation/api";

import type { DocumentScope } from "../../shared/model/project-sections";
import { VideoProbeContext } from "../../shared/video/video-probe";
import { ClipDetailsSheet, ClipStrip } from "../../shared/video/ClipDetails";
import { InputEditor } from "./InputEditor";
import {
    emptyInputValue,
    inputFromValue,
    inputSummary,
    inputValueOf,
    type InputValue,
} from "../../shared/model/input-model";

/**
 * The input one sequence decodes, as the same editor General uses.
 *
 * A sequence carries its own input only when it differs from the run's: scene detection on a
 * downscaled VapourSynth graph, a script for the encoder workers, FFMS2 for one stage. The
 * control family is therefore identical to General — three kinds, the decoder group, the
 * script source, and the filter list — and only the reach of the stored value differs.
 *
 * `scope` decides whether the document names a file. A project or template document
 * describes a decode for every video, so its path and FFMS2 index would point every video at
 * one source; they are absent there and the run supplies the video's own source. A video
 * document names its file, so both are shown. The same scope names the document that stores
 * a custom script, so a template never says it is stored in the project.
 */
export function InputOverrideEditor({
    scope,
    value,
    onChange,
    disabled,
    idPrefix,
    showHeading = true,
    onEditScript,
}: {
    scope: DocumentScope;
    value: unknown;
    onChange: (next: unknown) => void;
    disabled: boolean;
    idPrefix: string;
    /** A card that already titles the part hides this heading and keeps the summary. */
    showHeading?: boolean;
    /** Opens the Monaco page for this override's script instead of a textarea. */
    onEditScript?: (() => void) | undefined;
}) {
    const custom = value !== null && value !== undefined;
    const video = scope === "video";
    const inheritLabel =
        scope === "video"
            ? "Video input"
            : scope === "template"
              ? "Template input"
              : "Project input";
    const probeScope = useContext(VideoProbeContext);
    const [clipOpen, setClipOpen] = useState(false);
    const probe = useProbeInput(
        probeScope?.projectId ?? "",
        probeScope?.videoId ?? "",
        value,
        custom && probeScope !== null,
    );
    const customValue = custom ? inputValueOf(value) : null;

    const card = (selected: boolean, title: string, note: string, onClick: () => void) => (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={onClick}
            className={`flex min-h-[60px] min-w-0 flex-1 basis-40 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${
                selected
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-sunken hover:border-line-strong"
            }`}
        >
            <span
                aria-hidden="true"
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-brand bg-brand" : "border-line-strong"
                }`}
            >
                {selected ? <span className="h-1 w-1 rounded-full bg-on-brand" /> : null}
            </span>
            <span className="min-w-0">
                <span className="block text-[11.5px] font-medium text-ink">{title}</span>
                <span className="mt-0.5 block text-[9.5px] leading-relaxed text-ink-muted">
                    {note}
                </span>
            </span>
        </button>
    );

    return (
        <div className="py-3 first:py-0">
            <div
                className={
                    showHeading
                        ? "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                        : "flex justify-end"
                }
            >
                {showHeading ? <p className="m-0 text-[12px] font-medium text-ink">Input</p> : null}
                <span className="min-w-0 truncate font-mono text-[9.5px] text-ink-muted">
                    {custom ? inputSummary(value) : "Same as General"}
                </span>
            </div>

            <div
                role="radiogroup"
                aria-label="Sequence input"
                className="mt-1.5 flex flex-wrap gap-1.5"
            >
                {card(!custom, inheritLabel, `Decoded with the input General configures.`, () => {
                    if (!custom) {
                        return;
                    }
                    onChange(null);
                })}
                {card(custom, "Custom input", "A different decode for this sequence only.", () => {
                    if (custom) {
                        return;
                    }
                    // A video override starts on the same file General decodes, so the
                    // user never has to retype a path the page already knows. A script
                    // has no file of its own, so the field stays empty and asks for one.
                    const start: InputValue = {
                        ...emptyInputValue("ffms2"),
                        path: probeScope?.sourcePath ?? "",
                    };
                    onChange(inputFromValue(start, null));
                })}
            </div>

            {custom ? (
                <div className="mt-3">
                    <InputEditor
                        value={inputValueOf(value)}
                        onChange={(next) => onChange(inputFromValue(next, value))}
                        disabled={disabled}
                        idPrefix={idPrefix}
                        mode={video ? "input" : "defaults"}
                        showHeading={false}
                        scriptStorageLabel={
                            scope === "video"
                                ? "Stored in the video document"
                                : scope === "template"
                                  ? "Stored in the project template"
                                  : "Stored in the project document"
                        }
                        onEditScript={onEditScript}
                    />
                    {probeScope === null ? null : (
                        <ClipStrip probe={probe} onOpen={() => setClipOpen(true)} />
                    )}
                </div>
            ) : null}

            <p className="mt-2 mb-0 max-w-[76ch] text-[10px] leading-relaxed text-ink-muted">
                {video
                    ? "Only this video's sequences read these frames. Without an override they read the input General configures."
                    : scope === "template"
                      ? "Only this sequence reads these frames. Without an override it reads the input General configures, and every project supplies its own source file."
                      : "Only this sequence reads these frames. Without an override it reads the input General configures, and every video supplies its own source file."}
            </p>

            {probeScope === null ? null : (
                <ClipDetailsSheet
                    open={clipOpen}
                    onClose={() => setClipOpen(false)}
                    probe={probe}
                    sourcePath={customValue?.path ?? ""}
                />
            )}
        </div>
    );
}
