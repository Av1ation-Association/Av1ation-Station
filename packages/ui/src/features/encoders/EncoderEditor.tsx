import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useEncoders } from "@av1ation/api";
import type { EncoderDescriptor, ParameterDescriptor } from "@av1ation/contracts";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, Copy, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import type { JsonSchema } from "../../shared/schema/config-schema";
import type { DocumentScope } from "../../shared/model/project-sections";
import { Button } from "../../shared/Button";
import { ParameterValueGrid, type ParameterValueEntry } from "./ParameterValueGrid";
import { FIELD } from "./parameter-control";
import { PhotonCoefficientsSheet } from "./PhotonCoefficientsSheet";
import {
    ENCODER_CHOICES,
    buildDocument,
    commandPreview,
    forkMarker,
    forkVariant,
    hasField,
    hasForkMarker,
    isForkMarker,
    nullableNumber,
    passCount,
    record,
    sameBuildPath,
    selectedBody,
    variantSchema,
} from "./encoder-document";
import { Sheet } from "../../shared/Sheet";
import { Switch } from "../../shared/Switch";
import {
    buildBoolOption,
    buildNumberOption,
    buildOption,
    canonicalOf,
    defaultValue,
    mergeDescriptor,
    optionName,
    startingValue,
    withOptionValue,
} from "./encoder-options";

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
 * One encoder selection: the encoder, the build it runs, and the options sent to it.
 *
 * The catalogue's descriptors decide the controls, because an encoder parameter set differs
 * per encoder and per fork. Options are the engine's own `CLIParameter` map, edited one row
 * per flag, so a value never appears as a raw JSON object. `passes` is only ever written as
 * `All(n)`: a specific pass of a set is internal to the encoder's own multipass run.
 */
export function EncoderEditor({
    root,
    node,
    value,
    onChange,
    locked,
    workers,
    scope = "project",
}: {
    root: JsonSchema;
    node: JsonSchema;
    value: unknown;
    onChange: (next: unknown) => void;
    locked: boolean;
    /** The Workers control, rendered in the Encoder row so both share one band. */
    workers?: ReactNode;
    /** Whose encoder this is: a project default, a template, a video's sequence, or one scene. */
    scope?: DocumentScope | "scene";
}) {
    const encoders = useEncoders();
    const { variant, body } = selectedBody(value);
    const choice = ENCODER_CHOICES.find((entry) => entry.variant === variant);
    // A saved build is another provider of a base encoder. A located build is matched by
    // the path the document runs; a pathless one by the marker that keeps its identity.
    const forks = useMemo(
        () => (encoders.data ?? []).filter((entry) => entry.fork && forkVariant(entry) !== null),
        [encoders.data],
    );
    const bodyExecutable = typeof body.executable === "string" ? body.executable : null;
    const options = record(body.options);
    const visibleOptions = Object.entries(options).filter(
        ([name, parameter]) => !isForkMarker(name, parameter),
    );
    const selectedFork =
        forks.find((entry) => forkVariant(entry) === variant && hasForkMarker(options, entry.id)) ??
        forks.find(
            (entry) =>
                forkVariant(entry) === variant && sameBuildPath(entry.executable, bodyExecutable),
        );
    // A marker can outlive the saved row it names. The document still selects a build, so
    // the screen has to say that the build is gone rather than silently showing its base.
    // That claim needs a loaded catalogue: absent data is not evidence of a deletion.
    const marker = forkMarker(options);
    const missingFork = marker !== null && encoders.isSuccess && selectedFork === undefined;
    const base = selectedFork?.base ?? choice?.base;
    const schema = variantSchema(root, node, variant);
    const builtIn = useMemo(
        () =>
            (encoders.data ?? []).find(
                (entry) => !entry.fork && (entry.id === base || entry.base === base),
            ),
        [encoders.data, base],
    );
    const descriptors = selectedFork ?? builtIn;
    // A build reports the flags its own binary accepts, which may include ones the base
    // catalogue does not know. The base's descriptions still label the flags both share.
    const catalogue = useMemo(() => {
        const merged = new Map<string, ParameterDescriptor>();
        for (const [canonical, descriptor] of Object.entries(builtIn?.parameters ?? {})) {
            merged.set(canonical, descriptor);
        }
        for (const [canonical, descriptor] of Object.entries(selectedFork?.parameters ?? {})) {
            merged.set(canonical, mergeDescriptor(merged.get(canonical), descriptor) ?? descriptor);
        }
        return merged;
    }, [builtIn, selectedFork]);
    const buildLabel = selectedFork?.label ?? choice?.label ?? base ?? "this encoder";
    const forkWarning = missingFork
        ? {
              title: "The build this project selected is no longer saved.",
              body: "Runs fall back to the base encoder's provider on PATH. Choose an encoder to clear the old selection.",
          }
        : selectedFork !== undefined && !selectedFork.executable
          ? {
                title: `${selectedFork.label} has no executable yet.`,
                body: "Runs fall back to the base encoder's provider on PATH, so this build's flags may not apply.",
            }
          : selectedFork !== undefined && !selectedFork.available
            ? {
                  title: `${selectedFork.label} is not at its saved path.`,
                  body: "Runs fall back to the base encoder's provider on PATH until the build is located again.",
              }
            : null;
    const [addOpen, setAddOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [parameterSearch, setParameterSearch] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [customFlag, setCustomFlag] = useState("");
    const [customValue, setCustomValue] = useState("");
    const [customKind, setCustomKind] = useState<"Flag" | "Number" | "Text">("Flag");
    const [previewOpen, setPreviewOpen] = useState(false);
    const [coefficientsOpen, setCoefficientsOpen] = useState(false);

    const byName = useMemo(() => {
        const map = new Map<string, { canonical: string; descriptor: ParameterDescriptor }>();
        for (const [canonical, descriptor] of catalogue) {
            map.set(optionName(canonical), { canonical, descriptor });
        }
        return map;
    }, [catalogue]);

    const setBody = (patch: Record<string, unknown>) => {
        if (variant === null) {
            return;
        }
        onChange({ [variant]: { ...body, ...patch } });
    };

    const setOption = (name: string, parameter: unknown) => {
        setBody({ options: { ...options, [name]: parameter } });
    };

    const removeOption = (name: string) => {
        const next = { ...options };
        delete next[name];
        setBody({ options: next });
    };

    const chooseEncoder = (entry: (typeof ENCODER_CHOICES)[number]) => {
        // A saved build shares the variant with its base, so the variant alone cannot say
        // the built-in is already in use: choosing it from one of its builds resets the
        // executable back to PATH. A marker naming a deleted build is the exception: the
        // document still selects a build, so choosing the base has to replace it and drop
        // the marker, which is what the warning tells the user to do.
        if (
            locked ||
            (entry.variant === variant && selectedFork === undefined && marker === null)
        ) {
            return;
        }
        const descriptor = (encoders.data ?? []).find(
            (candidate) =>
                !candidate.fork && (candidate.id === entry.base || candidate.base === entry.base),
        );
        const defaults = record(descriptor?.default)[entry.variant];
        const next = { ...record(defaults) };
        // The previous build belongs to the previous encoder, so it never carries over.
        next.executable = null;
        next.options = record(next.options);
        if (hasField(entry.variant, "pass") && next.pass === undefined) {
            next.pass = { All: 1 };
        }
        if (hasField(entry.variant, "append_color_data") && next.append_color_data === undefined) {
            next.append_color_data = true;
        }
        if (hasField(entry.variant, "ffmpeg_filter") && next.ffmpeg_filter === undefined) {
            next.ffmpeg_filter = null;
        }
        if (hasField(entry.variant, "photon_noise") && next.photon_noise === undefined) {
            next.photon_noise = null;
        }
        onChange({ [entry.variant]: next });
    };

    /** Start the project from a saved build, executable and custom flags included. */
    const chooseFork = (fork: EncoderDescriptor) => {
        if (locked || fork === selectedFork) {
            return;
        }
        const document = buildDocument(fork);
        if (document !== null) {
            onChange({ [document.variant]: document.body });
        }
    };

    const fields = Object.keys(schema.properties ?? {});
    const passable = fields.includes("pass");
    const copy =
        scope === "scene"
            ? {
                  head: "The encoder this scene is encoded with. Other scenes keep the section's encoder.",
                  foot: "Builds from Settings → Encoders appear in the same list.",
              }
            : scope === "video"
              ? {
                    head: "The encoder every scene of this video is encoded with. A scene can choose another.",
                    foot: "An individual scene can override this encoder. Builds from Settings → Encoders appear in the same list.",
                }
              : scope === "template"
                ? {
                      head: "The encoder a new project starts with. A project, a video, or an individual scene can choose another.",
                      foot: "Builds from Settings → Encoders appear in the same list.",
                  }
                : {
                      head: "The encoder every scene is encoded with. A video or a scene can choose another.",
                      foot: "A video or an individual scene can override this encoder. Builds from Settings → Encoders appear in the same list.",
                  };
    const executable = typeof body.executable === "string" ? body.executable : null;
    const photon =
        body.photon_noise === null || body.photon_noise === undefined
            ? null
            : record(body.photon_noise);
    const colour = body.append_color_data !== false;
    const filter = typeof body.ffmpeg_filter === "string" ? body.ffmpeg_filter : "";
    const available = descriptors?.available === true;
    const command = commandPreview(executable, buildLabel, variant, options);

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
    // Set parameters are grouped the same way as the catalogue, so neighbouring controls are
    // rate-control values or quality values rather than the order the user happened to add.
    // The search matches the key, label and description, which is the same three fields
    // Settings → Encoders searches, so one word finds the row from either screen.
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
        setOption(
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
        setOption(
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
                <div className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 className="m-0 text-base font-semibold text-ink">Encoder</h2>
                    <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                        {copy.head}
                    </p>
                </div>{" "}
                <div className="px-4 py-4 sm:px-5">
                    {/* Tops align, not bottoms: Workers is a two-row block, and bottom
                        alignment pushed the encoder select and Passes sixty pixels down. */}
                    <div className="flex flex-wrap items-start gap-3">
                        <label className="block min-w-0 flex-1 basis-72">
                            <span className="flex items-center justify-between gap-3">
                                <span className="text-[10.5px] font-medium text-ink-secondary">
                                    Encoder
                                </span>
                                <Link
                                    to="/settings"
                                    hash="encoders"
                                    className="text-[10.5px] text-brand-text hover:underline"
                                >
                                    Manage encoders
                                </Link>
                            </span>
                            <span className="relative mt-1 block">
                                <select
                                    aria-label="Encoder"
                                    value={
                                        missingFork
                                            ? `stale:${marker}`
                                            : selectedFork === undefined
                                              ? `base:${variant ?? ""}`
                                              : `fork:${selectedFork.id}`
                                    }
                                    disabled={locked}
                                    onChange={(event) => {
                                        const [kind, ...rest] = event.target.value.split(":");
                                        const id = rest.join(":");
                                        if (kind === "fork") {
                                            const fork = forks.find((entry) => entry.id === id);
                                            if (fork !== undefined) {
                                                chooseFork(fork);
                                            }
                                            return;
                                        }
                                        const entry = ENCODER_CHOICES.find(
                                            (candidate) => candidate.variant === id,
                                        );
                                        if (entry !== undefined) {
                                            chooseEncoder(entry);
                                        }
                                    }}
                                    className={`${FIELD} h-9 w-full appearance-none pr-8`}
                                >
                                    <option value="base:" disabled>
                                        Choose an encoder
                                    </option>
                                    {/* The marker names a build that is gone, so the
                                        document is not on its base encoder even though it
                                        shares the variant. Giving it its own option keeps
                                        the base selection a real change. */}
                                    {missingFork ? (
                                        <option value={`stale:${marker}`} disabled>
                                            The selected build — no longer saved
                                        </option>
                                    ) : null}
                                    {[...new Set(ENCODER_CHOICES.map((entry) => entry.group))].map(
                                        (group) => (
                                            <optgroup key={group} label={group}>
                                                {ENCODER_CHOICES.filter(
                                                    (entry) => entry.group === group,
                                                ).map((entry) => {
                                                    const usable = (encoders.data ?? []).find(
                                                        (candidate) =>
                                                            !candidate.fork &&
                                                            (candidate.id === entry.base ||
                                                                candidate.base === entry.base),
                                                    )?.available;
                                                    return (
                                                        <option
                                                            key={entry.variant}
                                                            value={`base:${entry.variant}`}
                                                        >
                                                            {entry.label}
                                                            {usable === false
                                                                ? " — not installed"
                                                                : ""}
                                                        </option>
                                                    );
                                                })}
                                            </optgroup>
                                        ),
                                    )}
                                    {forks.length === 0 ? null : (
                                        <optgroup label="Your builds">
                                            {forks.map((fork) => (
                                                <option key={fork.id} value={`fork:${fork.id}`}>
                                                    {fork.label} — {fork.base}
                                                    {fork.executable
                                                        ? fork.available
                                                            ? ""
                                                            : " — missing"
                                                        : " — not located"}
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                                <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                                />
                            </span>
                        </label>

                        {passable ? (
                            <label className="block w-[104px] shrink-0">
                                <span className="flex h-[16px] items-center text-[10.5px] font-medium text-ink-secondary">
                                    Passes
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    max={255}
                                    step={1}
                                    aria-label="Encoder passes"
                                    value={passCount(body.pass)}
                                    disabled={locked}
                                    onChange={(event) =>
                                        setBody({
                                            pass: {
                                                All: Math.min(
                                                    255,
                                                    Math.max(
                                                        1,
                                                        Math.trunc(Number(event.target.value) || 1),
                                                    ),
                                                ),
                                            },
                                        })
                                    }
                                    className={`${FIELD} mt-1 h-9 w-full`}
                                />
                            </label>
                        ) : null}

                        {workers === undefined ? null : (
                            <div className="min-w-0 flex-1 basis-72">{workers}</div>
                        )}
                    </div>

                    {forkWarning === null ? null : (
                        <div
                            role="alert"
                            className="mt-3 flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2"
                        >
                            <AlertTriangle
                                aria-hidden="true"
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                            />
                            <p className="m-0 min-w-0 flex-1 text-[10.5px] leading-relaxed text-ink-secondary">
                                <span className="font-medium text-ink">{forkWarning.title}</span>{" "}
                                {forkWarning.body}
                            </p>
                            <Link
                                to="/settings"
                                hash="encoders"
                                className="text-[10.5px] font-medium text-brand-text hover:underline"
                            >
                                Manage encoders
                            </Link>
                        </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]">
                        <span className="font-mono text-[10px] text-ink-muted">
                            {descriptors?.version ?? "version unavailable"}
                            {executable === null ? " · on PATH" : ` · ${executable}`}
                        </span>
                        <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[8.5px] tracking-[0.1em] uppercase ${
                                available
                                    ? "border-success/40 text-success"
                                    : "border-warning/40 text-warning"
                            }`}
                        >
                            {available ? "Available" : "Missing"}
                        </span>
                    </div>
                    <p className="mt-2 mb-0 max-w-[64ch] text-[10px] leading-relaxed text-ink-muted">
                        {copy.foot}
                    </p>
                </div>
            </section>

            <section className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 className="m-0 text-base font-semibold text-ink">Encoder settings</h2>
                    <p className="mt-0.5 mb-0 text-[11.5px] leading-relaxed text-ink-muted">
                        Options that are not CLI parameters. They belong to this encoder selection,
                        not to every scene.
                    </p>
                </div>
                <div className="space-y-4 px-4 py-4 sm:px-5">
                    {/* Two switches side by side, then the photon fields across the whole
                        card. Holding the fields inside the switch's column left the left
                        half of the section empty for the height of four inputs. */}
                    <div className="grid items-start gap-x-8 gap-y-4 md:grid-cols-2">
                        <div className="flex min-w-0 items-start gap-2.5">
                            <Switch
                                checked={colour}
                                disabled={locked}
                                label="Append colour data"
                                onChange={(next) => setBody({ append_color_data: next })}
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
                                                setBody({ photon_noise: null });
                                                return;
                                            }
                                            setBody({
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
                                            setBody({
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
                                        setBody({
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
                                        setBody({
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
                                        setBody({
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
                                        setBody({
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
                                        onClick={() => setBody({ ffmpeg_filter: null })}
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
                    onApply={(next) => setBody({ photon_noise: { ...photon, ...next } })}
                />
            )}

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
                            onClick={() => setPreviewOpen(true)}
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
                                setOption(entry.name, withOptionValue(entry.parameter, next))
                            }
                            onReset={(entry) => {
                                const fallback =
                                    entry.descriptor === undefined
                                        ? null
                                        : defaultValue(entry.descriptor);
                                if (fallback === null || entry.descriptor === undefined) {
                                    removeOption(entry.name);
                                } else {
                                    setOption(
                                        entry.name,
                                        buildOption(entry.canonical, entry.descriptor, fallback),
                                    );
                                }
                            }}
                            onRemove={(entry) => removeOption(entry.name)}
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

            <Sheet
                open={previewOpen}
                placement="bottom"
                title="Preview command"
                eyebrow="Encoder"
                description="What this document sends the encoder for one scene. The input and output paths are supplied per chunk."
                onClose={() => setPreviewOpen(false)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
                            Close
                        </Button>
                        <Button
                            onClick={() => {
                                void navigator.clipboard
                                    .writeText(command)
                                    .then(() => toast.success("Command copied"))
                                    .catch(() => toast.error("The command could not be copied."));
                            }}
                        >
                            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                            Copy
                        </Button>
                    </>
                }
            >
                <pre className="m-0 overflow-x-auto rounded-md border border-line bg-app px-3 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink">
                    {command}
                </pre>
                <p className="mt-3 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                    Parameters that are not set are absent, so the executable's own default applies.
                    A saved build's executable replaces the PATH lookup.
                </p>
            </Sheet>
        </>
    );
}
