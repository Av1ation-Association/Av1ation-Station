import type { GeneralDefaults } from "@av1ation/contracts";

import type { ProjectSectionId } from "./project-sections";

type Document = Record<string, unknown>;

function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function text(value: unknown, fallback = "—"): string {
    return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function number(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function decimal(value: unknown): string {
    const parsed = number(value);
    return parsed === null ? "—" : String(Number(parsed.toFixed(3)));
}

/**
 * The sequence document.
 *
 * The engine configuration keeps every sequence under `sequences`; looking one level higher
 * makes every optional stage read as off even when it is configured.
 */
function sequences(document: Document): Record<string, unknown> {
    return record(document.sequences);
}

function sequence(document: Document, key: string): Record<string, unknown> {
    return record(sequences(document)[key]);
}

function taggedName(value: unknown): string {
    return typeof value === "string" ? value : (Object.keys(record(value))[0] ?? "—");
}

/** Whether an optional sequence carries a document, rather than being absent or `{}`. */
function present(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length > 0
    );
}

function inputLabel(kind: string | undefined): string {
    if (kind === "vapour_synth") {
        return "VapourSynth";
    }
    if (kind === "vapour_synth_script") {
        return "VapourSynth script";
    }
    return "FFMS2";
}

function filterParts(entry: unknown): { tag: string; payload: Record<string, unknown> } {
    const pair = Object.entries(record(entry))[0];
    return {
        tag: pair?.[0] ?? "Filter",
        payload: record(pair?.[1]),
    };
}

function filterNames(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(filterParts)
        .map((entry) => entry.tag)
        .filter((tag) => tag !== "Filter");
}

function formatLine(filters: unknown): string {
    const list = Array.isArray(filters) ? filters : [];
    const output = list.map(filterParts).find((entry) => entry.tag === "OutputFormat");
    if (output === undefined) {
        return "Output format from the engine default";
    }
    const bits = [
        typeof output.payload.bit_depth === "number"
            ? `${String(output.payload.bit_depth)}-bit`
            : null,
        typeof output.payload.chroma === "string" ? output.payload.chroma : null,
    ].filter((entry): entry is string => entry !== null);
    return bits.length === 0 ? "Output format configured" : bits.join(" · ");
}

/** The two lines a General card shows in either context. */
export function generalSummary(general: GeneralDefaults | undefined): string[] {
    if (general === undefined) {
        return ["Loading…"];
    }
    const input = inputLabel(general.input_kind);
    const output =
        general.output_mode === "folder"
            ? `Specific folder${general.output_folder === undefined || general.output_folder === null || general.output_folder === "" ? " · not set" : ` · ${general.output_folder}`}`
            : "Next to input";
    const format = formatLine(
        general.input_kind === "ffms2" ? general.ffms2_filters : general.vapour_synth_filters,
    );
    return [`${input} · native decode`, `${output} · ${format}`];
}

const ENCODER_LABELS: Record<string, string> = {
    SVTAV1: "SVT-AV1",
    AOM: "AOM",
    RAV1E: "rav1e",
    VPX: "VP9 (vpx)",
    AVM: "AVM",
    X264: "x264",
    X265: "x265",
    VVenC: "vvenc",
    FFmpeg: "FFmpeg",
};

/**
 * The engine's scene-detector default.
 *
 * The UI cannot read a Rust `Default` from JSON Schema, so these mirror the engine's own
 * constants: 24 frames minimum, 10 seconds maximum at 24 fps.
 */
const ENGINE_MIN_SCENE_FRAMES = 24;
const ENGINE_MAX_SCENE_FRAMES = 240;

function sceneSummary(document: Document): string[] {
    const config = sequence(document, "scene_detector");
    const method = record(config.method);
    const name = taggedName(config.method);
    const bounds = (body: Record<string, unknown>): string => {
        const minimum = number(body.minimum_length) ?? ENGINE_MIN_SCENE_FRAMES;
        const maximum = number(body.maximum_length) ?? ENGINE_MAX_SCENE_FRAMES;
        return `${String(minimum)}–${String(maximum)} frames per scene`;
    };
    if (name === "TransNetV2") {
        return [`TransNetV2 · ${bounds(record(method.TransNetV2))}`, "Neural detector · ONNX"];
    }
    if (name === "None") {
        return ["None · one scene per video", "Every later stage runs once"];
    }
    const body = record(method.AVSceneChange ?? {});
    const scorer = taggedName(body.method);
    return [
        `AVSceneChange · ${bounds(body)}`,
        `Standard scorer${scorer === "—" ? "" : ` · ${scorer}`}`,
    ];
}

function noiseSummary(document: Document): string[] {
    const detector = sequences(document).noise_detector;
    const scaler = sequences(document).noise_scaler;
    const detectorOn = present(detector);
    const scalerOn = present(scaler);

    const detectorLine = detectorOn
        ? (() => {
              const reference = filterNames(detector.reference_filters);
              const denoised = filterNames(detector.denoised_filters);
              const profile =
                  reference.length === 0 && denoised.length === 0
                      ? "engine filters"
                      : `${reference.join(", ") || "none"} → ${denoised.join(", ") || "none"}`;
              return `Noise detector · on · ${profile}`;
          })()
        : "Noise detector · off";
    const scalerLine = scalerOn
        ? `Noise scaler · on · ${decimal(scaler.minimum_scaler)}–${decimal(scaler.maximum_scaler)}, threshold ${decimal(scaler.threshold)}`
        : "Noise scaler · off";
    return [detectorLine, scalerLine];
}

function targetSummary(document: Document): string[] {
    const target = sequences(document).target_quality;
    const on = present(target);
    const metric = on ? taggedName(target.metric) : "—";
    const range = on ? record(record(target.metric)[metric]).target_range : null;
    const low = Array.isArray(range) ? number(range[0]) : null;
    const high = Array.isArray(range) ? number(range[1]) : null;

    const speed = Array.isArray(record(sequences(document).speed_scaler).speed_quantizers)
        ? (record(sequences(document).speed_scaler).speed_quantizers as unknown[])
        : [];
    const sigma = number(record(sequences(document).bitrate_optimizer).bitrate_sigma_threshold);

    const targetLine = on
        ? `Target quality · ${metric}${low === null || high === null ? "" : ` ${String(low)}–${String(high)}`}`
        : "Target quality · off";

    return [
        targetLine,
        speed.length < 2 ? "Speed scaling · off" : `Speed scaling · ${String(speed.length)} points`,
        sigma === null
            ? "Bitrate optimization · off"
            : `Bitrate optimization · σ ${decimal(sigma)}`,
    ];
}

function encodingSummary(document: Document): string[] {
    const encoder = record(document.encoder);
    const variant = Object.keys(encoder)[0] ?? "—";
    const body = record(encoder[variant]);
    const options = record(body.options);
    const photon = body.photon_noise;
    const parallel = sequence(document, "parallel_encoder");
    const workerText =
        parallel.workers === null || parallel.workers === undefined
            ? "Auto workers"
            : `${String(parallel.workers)} workers`;
    const photonText =
        photon === null || photon === undefined ? "Photon Noise off" : "Photon Noise enabled";
    return [
        `${ENCODER_LABELS[variant] ?? variant} · ${workerText}`,
        `${String(Object.keys(options).length)} parameters · ${photonText}`,
    ];
}

const CONCAT_DETAIL: Record<string, string> = {
    Mkvmerge: "Matroska-native muxer",
    FFmpeg: "Broad format support",
    Ivf: "Raw AV1 elementary stream",
};

function concatenationSummary(document: Document): string[] {
    const config = sequence(document, "scene_concatenator");
    const method = taggedName(config.method);
    const label =
        method === "Mkvmerge"
            ? "mkvmerge"
            : method === "FFmpeg"
              ? "FFmpeg"
              : method === "Ivf"
                ? "IVF"
                : method;
    return [
        label === "—" ? "mkvmerge · engine default" : label,
        CONCAT_DETAIL[method] ?? "Joins the encoded chunks",
    ];
}

function qualitySummary(document: Document): string[] {
    const check = sequences(document).quality_check;
    if (!present(check)) {
        return ["Off", "Scores the concatenated video against the input"];
    }
    const metric = taggedName(check.metric);
    const rawStrategy = taggedName(check.strategy);
    const strategy = rawStrategy === "Whole" || rawStrategy === "—" ? "Whole video" : rawStrategy;
    const statistic = taggedName(check.statistic);
    return [
        `${metric} · ${strategy}`,
        `${statistic === "—" ? "Mean" : statistic} of per-scene scores`,
    ];
}

/** The two-line summary a section card shows for the current configuration document. */
export function sectionSummary(
    id: Exclude<ProjectSectionId, "general">,
    document: Document,
): string[] {
    switch (id) {
        case "scene-detection":
            return sceneSummary(document);
        case "noise-generation":
            return noiseSummary(document);
        case "target-quality":
            return targetSummary(document);
        case "encoding":
            return encodingSummary(document);
        case "concatenation":
            return concatenationSummary(document);
        case "quality-check":
            return qualitySummary(document);
    }
}

/** Whether an optional stage currently has a document, for the card badge. */
export function sectionConfigured(
    id: Exclude<ProjectSectionId, "general">,
    document: Document,
): boolean {
    const config = sequences(document);
    if (id === "noise-generation") {
        return present(config.noise_detector) || present(config.noise_scaler);
    }
    if (id === "target-quality") {
        return (
            present(config.target_quality) ||
            present(config.bitrate_optimizer) ||
            (Array.isArray(record(config.speed_scaler).speed_quantizers) &&
                (record(config.speed_scaler).speed_quantizers as unknown[]).length >= 2)
        );
    }
    if (id === "quality-check") {
        return present(config.quality_check);
    }
    return true;
}

export function generalIsConfigured(general: GeneralDefaults | undefined): boolean {
    return general !== undefined;
}

export { text };
