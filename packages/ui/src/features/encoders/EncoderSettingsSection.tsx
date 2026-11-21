import { useEffect, useState } from "react";

import { Button } from "../../shared/Button";
import { Switch } from "../../shared/Switch";
import { nullableNumber, record } from "./encoder-document";
import type { EncoderSelection } from "./encoder-selection";
import { FIELD } from "./parameter-control";
import { PhotonCoefficientsSheet } from "./PhotonCoefficientsSheet";

/** A labelled optional integer, storing `null` when the field is cleared. */
function OptionalNumber({
    label,
    value,
    onChange,
    disabled,
    placeholder,
}: {
    label: string;
    value: unknown;
    onChange: (next: number | null) => void;
    disabled: boolean;
    placeholder: string;
}) {
    const stored = nullableNumber(value);
    const [text, setText] = useState(stored);
    useEffect(() => {
        setText(stored);
    }, [stored]);
    return (
        <label className="block min-w-0">
            <span className="text-[10.5px] font-medium text-ink-secondary">{label}</span>
            <input
                type="text"
                inputMode="numeric"
                aria-label={label}
                value={text}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(event) => {
                    const raw = event.target.value;
                    setText(raw);
                    if (raw.trim() === "") {
                        return;
                    }
                    const parsed = Math.max(0, Math.trunc(Number(raw)));
                    if (Number.isFinite(parsed)) {
                        onChange(parsed);
                    }
                }}
                onBlur={() => {
                    if (text.trim() === "" || !Number.isFinite(Number(text))) {
                        setText(stored);
                    }
                }}
                className={`${FIELD} mt-1 w-full`}
            />
        </label>
    );
}

/**
 * The encoder document's own fields: colour metadata, photon noise, and the FFmpeg filter.
 *
 * These belong to one encoder selection rather than to every scene, so they sit beside the
 * parameter rows instead of in the sequence's shared options.
 */
export function EncoderSettingsSection({
    body,
    fields,
    choice,
    locked,
    onPatch,
}: {
    body: Record<string, unknown>;
    /** The properties the selected variant actually carries. */
    fields: string[];
    choice: EncoderSelection["choice"];
    locked: boolean;
    onPatch: (patch: Record<string, unknown>) => void;
}) {
    const [coefficientsOpen, setCoefficientsOpen] = useState(false);
    const photon =
        body.photon_noise === null || body.photon_noise === undefined
            ? null
            : record(body.photon_noise);
    const colour = body.append_color_data !== false;
    const filter = typeof body.ffmpeg_filter === "string" ? body.ffmpeg_filter : "";

    return (
        <>
            <section className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 className="m-0 text-base font-semibold text-ink">Encoder settings</h2>
                    <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                        Options that are not CLI parameters. They belong to this encoder selection,
                        not to every scene.
                    </p>
                </div>
                <div className="space-y-4 px-4 py-4 sm:px-5">
                    {/* Colour and photon noise share a two-column row; the photon fields
                        span the card so four inputs fit without a half-empty column. */}
                    <div className="grid items-start gap-x-8 gap-y-4 md:grid-cols-2">
                        <div className="flex min-w-0 items-start gap-2.5">
                            <Switch
                                checked={colour}
                                disabled={locked}
                                label="Append colour data"
                                onChange={(next) => onPatch({ append_color_data: next })}
                            />
                            <span className="min-w-0">
                                <span className="block text-[11.5px] font-medium text-ink">
                                    Append colour data
                                </span>
                                <span className="mt-0.5 block max-w-[62ch] text-[10px] leading-relaxed text-ink-muted">
                                    Passes the source&apos;s colour metadata to the encoder. Turning
                                    it off changes how a player interprets the output.
                                </span>
                            </span>
                        </div>

                        {fields.includes("photon_noise") ? (
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-start gap-2.5">
                                    <Switch
                                        checked={photon !== null}
                                        disabled={locked}
                                        label="Photon noise"
                                        onChange={(next) => {
                                            if (!next) {
                                                onPatch({ photon_noise: null });
                                                return;
                                            }
                                            onPatch({
                                                photon_noise: {
                                                    iso: 1600,
                                                    chroma_iso: null,
                                                    width: null,
                                                    height: null,
                                                    c_y: null,
                                                    ccb: null,
                                                    ccr: null,
                                                },
                                            });
                                        }}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2 text-[11.5px] font-medium text-ink">
                                            Photon noise
                                            <span className="rounded-full border border-line-strong px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.1em] text-ink-muted uppercase">
                                                {choice?.label ?? "Encoder"}
                                            </span>
                                        </span>
                                        <span className="mt-0.5 block max-w-[70ch] text-[10px] leading-relaxed text-ink-muted">
                                            Synthesises film grain at encode time, so grain survives
                                            at a lower bitrate. Noise scaling writes a per-scene
                                            ISO; this value covers the scenes it leaves unchanged.
                                        </span>
                                    </span>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {fields.includes("photon_noise") && photon !== null ? (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                <OptionalNumber
                                    label="ISO"
                                    value={photon.iso}
                                    placeholder="1600"
                                    disabled={locked}
                                    onChange={(next) => {
                                        // ISO is required. A cleared field keeps the
                                        // stored value until a new number is typed;
                                        // it is never rewritten while backspacing.
                                        if (next !== null && next > 0) {
                                            onPatch({
                                                photon_noise: { ...photon, iso: next },
                                            });
                                        }
                                    }}
                                />
                                <OptionalNumber
                                    label="Chroma ISO"
                                    value={photon.chroma_iso}
                                    placeholder="From ISO"
                                    disabled={locked}
                                    onChange={(next) =>
                                        onPatch({
                                            photon_noise: {
                                                ...photon,
                                                chroma_iso: next,
                                            },
                                        })
                                    }
                                />
                                <OptionalNumber
                                    label="Width"
                                    value={photon.width}
                                    placeholder="Source"
                                    disabled={locked}
                                    onChange={(next) =>
                                        onPatch({
                                            photon_noise: { ...photon, width: next },
                                        })
                                    }
                                />
                                <OptionalNumber
                                    label="Height"
                                    value={photon.height}
                                    placeholder="Source"
                                    disabled={locked}
                                    onChange={(next) =>
                                        onPatch({
                                            photon_noise: { ...photon, height: next },
                                        })
                                    }
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    variant="secondary"
                                    className="h-7 px-2.5 text-[10.5px]"
                                    disabled={locked}
                                    onClick={() => setCoefficientsOpen(true)}
                                >
                                    Custom coefficients
                                </Button>
                                <span className="text-[10px] text-ink-muted">
                                    {["c_y", "ccb", "ccr"].filter((key) =>
                                        Array.isArray(photon[key]),
                                    ).length === 0
                                        ? "Every plane follows the ISO"
                                        : `${String(["c_y", "ccb", "ccr"].filter((key) => Array.isArray(photon[key])).length)} of 3 planes customised`}
                                </span>
                            </div>
                        </div>
                    ) : null}

                    {!fields.includes("ffmpeg_filter") ? null : (
                        <div className="border-t border-line-subtle pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11.5px] font-medium text-ink">
                                    FFmpeg filter
                                </span>
                                <span className="text-[10px] text-ink-muted">
                                    Optional · runs before every scene
                                </span>
                            </div>
                            <div className="mt-1.5 flex min-w-0 gap-1.5">
                                <input
                                    aria-label="FFmpeg filter"
                                    value={filter}
                                    spellCheck={false}
                                    disabled={locked}
                                    placeholder="scale=1920:-2:flags=lanczos"
                                    onChange={(event) =>
                                        onPatch({
                                            ffmpeg_filter:
                                                event.target.value === ""
                                                    ? null
                                                    : event.target.value,
                                        })
                                    }
                                    className={`${FIELD} flex-1`}
                                />
                                {filter === "" ? null : (
                                    <Button
                                        variant="ghost"
                                        className="h-8 px-2 text-[10.5px]"
                                        disabled={locked}
                                        onClick={() => onPatch({ ffmpeg_filter: null })}
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                            {filter === "" ? null : (
                                <p className="mt-1.5 mb-0 text-[10px] leading-relaxed text-warning">
                                    Quality Check scores the unfiltered source, so an active filter
                                    makes its scores differ from the encoded picture.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {photon === null ? null : (
                <PhotonCoefficientsSheet
                    open={coefficientsOpen}
                    value={photon}
                    onClose={() => setCoefficientsOpen(false)}
                    onApply={(next) => onPatch({ photon_noise: { ...photon, ...next } })}
                />
            )}
        </>
    );
}
