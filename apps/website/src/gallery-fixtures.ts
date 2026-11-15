import { MockTransport } from "@av1ation/api";
import {
    EncodeEventSchema,
    type EncodeEvent,
    type GeneralDefaults,
    type LogRecord,
    type ParameterDescriptor,
    type ProjectSummary,
    type RunSummary,
    type SceneView,
    type ConcatInventory,
    type SequenceRunStatus,
    type TimelineRecord,
    type VideoState,
    type VideoValidation,
    type VideoSummary,
} from "@av1ation/contracts";

import configSchema from "./gallery/config-schema.json";
import encoderParameters from "./gallery/encoder-parameters.json";
import filterSchemas from "./gallery/filter-schemas.json";
import realRun from "./gallery/real-run.json";

// Captured from the service against the fixtures in `dist/test-data/screenshots`, then
// normalised to the demo's stable project and video ids. The run is a real SVT-AV1 encode:
// 2,160 frames at 1280×720 and 24 fps, split into fourteen scenes, with CVVDP scores.
const PARAMETERS = encoderParameters as unknown as Record<
    string,
    Record<string, ParameterDescriptor>
>;
const SVT_PARAMETERS = PARAMETERS["svt-av1"] ?? {};
const X265_PARAMETERS = PARAMETERS.x265 ?? {};
const RUN_LOGS = realRun.logs as unknown as LogRecord[];
const RUN_ID = realRun.runs[0]?.run_id ?? "";

/** The project every gallery screenshot addresses. */
export const GALLERY_PROJECT: ProjectSummary = realRun.project;

/** The first queue row; its ids are what the History and Logs routes address. */
export const GALLERY_VIDEO: VideoSummary = realRun.video;

/** The captured scene table the homepage's Measured data card reads. */
export const GALLERY_SCENES: readonly SceneView[] = realRun.scenes.scenes as readonly SceneView[];

const SIBLING_VIDEOS: VideoSummary[] = realRun.siblings;

const SCRIPT = [
    "import sys",
    "",
    "import vapoursynth as vs",
    "",
    "sys.path.insert(0, condor_temp_dir.decode())",
    "",
    "import condor_data as cd",
    "",
    "core = vs.core",
    "src = core.ffms2.Source(source=cd.video_path)",
    "",
    "# The source is a 720p documentary cut; keep the grain and hand the",
    "# encoder a stable 10-bit graph for every scene.",
    "out = core.resize.Bicubic(",
    "    src,",
    "    width=1280,",
    "    height=720,",
    "    format=vs.YUV420P10,",
    "    filter_param_a=0.0,",
    "    filter_param_b=0.75,",
    ")",
    "",
    "out = core.std.Crop(out, left=0, right=0, top=0, bottom=0)",
    "out.set_output()",
    "",
].join("\n");

const HISTORY: TimelineRecord[] = realRun.history;
const RUNS = realRun.runs;

interface JsonSchemaNode {
    $ref?: string;
    $defs?: Record<string, JsonSchemaNode>;
    type?: string | string[];
    enum?: unknown[];
    const?: unknown;
    anyOf?: JsonSchemaNode[];
    oneOf?: JsonSchemaNode[];
    properties?: Record<string, JsonSchemaNode>;
    required?: string[];
    items?: JsonSchemaNode;
    prefixItems?: JsonSchemaNode[];
    minimum?: number;
}

const SCHEMA = configSchema as unknown as {
    encoder: JsonSchemaNode;
    sequences: JsonSchemaNode;
};
const FILTER_SCHEMAS = filterSchemas as unknown as Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveNode(root: JsonSchemaNode, raw: JsonSchemaNode): JsonSchemaNode {
    let node = raw;
    const seen = new Set<string>();
    while (node.$ref !== undefined) {
        const name = node.$ref.split("/").pop() ?? "";
        if (seen.has(name)) {
            break;
        }
        seen.add(name);
        const target = root.$defs?.[name];
        if (target === undefined) {
            break;
        }
        node = target;
    }
    return node;
}

function typesOf(node: JsonSchemaNode): string[] {
    if (node.type === undefined) {
        return [];
    }
    return Array.isArray(node.type) ? node.type : [node.type];
}

/**
 * A structurally valid starting value.
 *
 * The gallery must not carry a second, hand-maintained copy of the engine schema. The
 * checked-in snapshot supplies every required field; the fixture then replaces the few
 * values a marketing screenshot should show with deliberate ones.
 */
function defaultFromSchema(root: JsonSchemaNode, raw: JsonSchemaNode, depth = 0): unknown {
    const node = resolveNode(root, raw);
    if (depth > 12) {
        return null;
    }
    if (node.const !== undefined) {
        return node.const;
    }
    if (node.enum !== undefined && node.enum.length > 0) {
        return node.enum[0];
    }
    if (Array.isArray(node.anyOf)) {
        const variant = node.anyOf.find(
            (entry) => !typesOf(resolveNode(root, entry)).includes("null"),
        );
        return variant === undefined ? null : defaultFromSchema(root, variant, depth + 1);
    }
    if (Array.isArray(node.oneOf)) {
        const variant = node.oneOf.find(
            (entry) => !typesOf(resolveNode(root, entry)).includes("null"),
        );
        return variant === undefined ? null : defaultFromSchema(root, variant, depth + 1);
    }
    const types = typesOf(node);
    if (types.includes("null") && types.length === 1) {
        return null;
    }
    if (types.includes("boolean")) {
        return false;
    }
    if (types.includes("integer") || types.includes("number")) {
        return node.minimum ?? 0;
    }
    if (types.includes("string")) {
        return "";
    }
    if (types.includes("array")) {
        if (node.prefixItems !== undefined) {
            return node.prefixItems.map((entry) => defaultFromSchema(root, entry, depth + 1));
        }
        return [];
    }
    if (types.includes("object") || node.properties !== undefined) {
        const result: Record<string, unknown> = {};
        for (const key of node.required ?? []) {
            const child = node.properties?.[key];
            if (child !== undefined) {
                result[key] = defaultFromSchema(root, child, depth + 1);
            }
        }
        return result;
    }
    return null;
}

function merge(base: unknown, patch: unknown): unknown {
    if (!isRecord(base) || !isRecord(patch)) {
        return patch;
    }
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        result[key] = key in result ? merge(result[key], value) : value;
    }
    return result;
}

function valueAt(root: JsonSchemaNode, path: string[]): unknown {
    let node = root;
    for (const key of path) {
        const child = node.properties?.[key];
        if (child === undefined) {
            return undefined;
        }
        node = resolveNode(root, child);
    }
    return defaultFromSchema(root, node);
}

function encoderDocument(): Record<string, unknown> {
    const variant = SCHEMA.encoder.oneOf?.find((entry) => {
        const resolved = resolveNode(SCHEMA.encoder, entry);
        return resolved.properties?.SVTAV1 !== undefined;
    });
    const base = variant === undefined ? {} : defaultFromSchema(SCHEMA.encoder, variant);
    return merge(base, {
        SVTAV1: {
            executable: null,
            pass: { All: 1 },
            // The six options the captured encode actually ran with, including the
            // rate-control and scene-change modes that render as a radio group and a
            // switch instead of a row of identical number fields.
            options: {
                preset: { Number: { prefix: "--preset", delimiter: "Space", value: 12 } },
                crf: { Number: { prefix: "--crf", delimiter: "Space", value: 40 } },
                keyint: { Number: { prefix: "--keyint", delimiter: "Space", value: 0 } },
                progress: { Number: { prefix: "--progress", delimiter: "Space", value: 2 } },
                rc: { Number: { prefix: "--rc", delimiter: "Space", value: 0 } },
                scd: { Number: { prefix: "--scd", delimiter: "Space", value: 0 } },
            },
            photon_noise: null,
            ffmpeg_filter: null,
            append_color_data: true,
        },
    }) as Record<string, unknown>;
}

function sequencesDocument(): Record<string, unknown> {
    const root = SCHEMA.sequences;
    const part = (key: string, patch: unknown): unknown => merge(valueAt(root, [key]) ?? {}, patch);
    // CVVDP is the metric the captured run scored. Its shape differs from VMAF's, so the
    // metric is replaced rather than merged with the schema's VMAF default.
    const cvvdp = {
        CVVDP: {
            disable_temporal: null,
            display_model: null,
            gpu_id: null,
            resize_to_display: null,
            resolution: null,
            target_range: [9.4, 9.6],
        },
    };
    const qualityCheck = part("quality_check", {
        input: null,
        strategy: "Whole",
        statistic: "Mean",
    }) as Record<string, unknown>;
    const targetQuality = part("target_quality", {
        maximum_probes: 8,
        quantizer_range: [20, 46],
        interpolators: ["Natural", "Pchip"],
        probing: { strategy: "Whole", statistic: "Mean", encoder_options: null },
    }) as Record<string, unknown>;

    return {
        benchmarker: part("benchmarker", { max_memory: null, threshold: 5 }),
        bitrate_optimizer: part("bitrate_optimizer", { bitrate_sigma_threshold: 2.5 }),
        noise_detector: part("noise_detector", {
            reference_filters: [
                {
                    Resize: {
                        width: 1280,
                        height: 720,
                        format: "YUV420P10LE",
                        scaler: "lanczos",
                    },
                },
            ],
            denoised_filters: [{ Crop: { left: 0, right: 0, top: 0, bottom: 0 } }],
            input: null,
        }),
        noise_scaler: part("noise_scaler", {
            threshold: 0.002,
            minimum_scaler: 0.85,
            maximum_scaler: 1.25,
            scale_chroma: true,
        }),
        parallel_encoder: part("parallel_encoder", {
            workers: 8,
            scenes_directory: "scenes",
            input: null,
        }),
        quality_check: { ...qualityCheck, metric: cvvdp },
        scene_concatenator: part("scene_concatenator", {
            method: {
                mkvmerge: {
                    chapters: null,
                    metadata: null,
                    tracks: null,
                    extra_inputs: [],
                },
            },
            output: null,
            scenes_directory: "scenes",
        }),
        scene_detector: part("scene_detector", {
            method: {
                AVSceneChange: {
                    minimum_length: 24,
                    maximum_length: 240,
                    method: "Standard",
                    save_scores: false,
                },
            },
            input: null,
        }),
        speed_scaler: part("speed_scaler", {
            speed_quantizers: [
                [20, 4],
                [40, 8],
            ],
        }),
        target_quality: { ...targetQuality, metric: cvvdp },
    };
}

const CONFIG_DOCUMENT: Record<string, unknown> = {
    encoder: encoderDocument(),
    sequences: sequencesDocument(),
};

type ValueSource = "default" | "inherited" | "overridden";

function flatten(
    value: unknown,
    prefix: string,
    out: Record<string, { value: unknown; source: ValueSource }>,
    sourceFor: (path: string) => ValueSource,
): void {
    if (!isRecord(value)) {
        out[prefix] = { value, source: sourceFor(prefix) };
        return;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) {
        out[prefix] = { value: {}, source: sourceFor(prefix) };
        return;
    }
    for (const [key, child] of entries) {
        flatten(child, prefix === "" ? key : `${prefix}.${key}`, out, sourceFor);
    }
}

function effective(
    document: Record<string, unknown>,
    sourceFor: (path: string) => ValueSource,
): { updated_at: string; values: Record<string, { value: unknown; source: ValueSource }> } {
    const values: Record<string, { value: unknown; source: ValueSource }> = {};
    flatten(document, "", values, sourceFor);
    return { updated_at: "2026-11-12T09:19:53Z", values };
}

// The captured video's own override document. The editor stores whole sequence parts, not
// leaves, so the two changed encoder values (CRF 40 and preset 12), the worker count, and
// the Quality Check metric replace their project parts. Target quality stays inherited.
const OVERRIDES: Record<string, unknown> = {
    encoder: CONFIG_DOCUMENT.encoder,
    "sequences.parallel_encoder": (CONFIG_DOCUMENT.sequences as Record<string, unknown>)
        .parallel_encoder,
    "sequences.quality_check": (CONFIG_DOCUMENT.sequences as Record<string, unknown>).quality_check,
};
// Section-level provenance for the editor badges; the stored override document keeps the
// exact leaves, so the screen says "overridden" without inventing per-field changes.
const OVERRIDE_ROOTS = ["encoder", "sequences.parallel_encoder", "sequences.quality_check"];

// The dotted override roots are what the service stores; the effective document needs the
// same values at their nested paths.
function applyOverridePath(
    document: Record<string, unknown>,
    path: string,
    value: unknown,
): Record<string, unknown> {
    const segments = path.split(".");
    const result = { ...document };
    let cursor = result;
    for (const [index, segment] of segments.entries()) {
        if (index === segments.length - 1) {
            cursor[segment] = value;
            break;
        }
        const next = cursor[segment];
        const copy = isRecord(next) ? { ...next } : {};
        cursor[segment] = copy;
        cursor = copy;
    }
    return result;
}

export const GALLERY_VIDEO_EFFECTIVE = Object.entries(OVERRIDES).reduce(
    (document, [path, value]) => applyOverridePath(document, path, value),
    CONFIG_DOCUMENT,
);

function videoSource(path: string): "default" | "inherited" | "overridden" {
    return OVERRIDE_ROOTS.some((root) => path === root || path.startsWith(`${root}.`))
        ? "overridden"
        : "inherited";
}

const PROJECT_GENERAL: GeneralDefaults = {
    input_kind: "vapour_synth_script",
    output_mode: "next_to_input",
    script_mode: "text",
    script_text: SCRIPT,
    ffms2_filters: [],
    vapour_synth_filters: [],
};

const TEMPLATE_GENERAL: GeneralDefaults = {
    ...PROJECT_GENERAL,
    script_text: SCRIPT.replace("Aurora", "Project"),
};

const VIDEO_GENERAL = {
    input: {
        VapourSynthScript: {
            source: { Text: SCRIPT },
            filters: [],
            variables: { clip_name: "release-demo" },
            index: 0,
            stream_concurrently: true,
        },
    },
    output: {
        path: GALLERY_VIDEO.output_path,
        tags: { title: "Aurora — Opening" },
        video_tags: { encoder: "SVT-AV1" },
    },
    source_path: GALLERY_VIDEO.input_path,
};

const PROBE = realRun.probe;
const THUMBNAILS = realRun.thumbnails;

const SEQUENCES = realRun.state.sequences;

const VIDEO_STATE = { ...realRun.state, video_id: GALLERY_VIDEO.id };

const EMPTY_VIDEO_STATE = {
    ...VIDEO_STATE,
    scene_count: 0,
    sequences: SEQUENCES.map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
        status: sequence.id === "SceneDetector" ? "never_run" : "skipped",
        detail: null,
        progress: null,
        runnable: sequence.id === "SceneDetector",
    })),
    next: ["SceneDetector"],
    output_exists: false,
    retained_bytes: 0,
};

// A run stopped between sequences: detection is finished, the encoder is still working,
// and nothing after it has ever run. The state is static so both themes capture the same
// frame of the run.
const RUNNING_RUN_ID = "gallery-running-run";
const RUNNING_STATE: VideoState = {
    ...VIDEO_STATE,
    scene_count: GALLERY_SCENES.length,
    sequences: SEQUENCES.map((sequence): VideoState["sequences"][number] => {
        if (sequence.id === "SceneDetector") {
            return {
                ...sequence,
                status: "complete",
                progress: 100,
                detail: "14 scenes detected",
                runnable: false,
            };
        }
        if (sequence.id === "ParallelEncoder") {
            return {
                ...sequence,
                status: "active",
                progress: 46,
                detail: "Encoding 7 of 14 scenes",
                runnable: false,
            };
        }
        return {
            ...sequence,
            status: "never_run",
            progress: null,
            detail: null,
            runnable: false,
        };
    }),
    next: ["ParallelEncoder"],
    active: true,
    run_id: RUNNING_RUN_ID,
    failure: null,
    output_exists: false,
    retained_bytes: 214_000_000,
};

// A failed run records its reason in the timeline and in the pipeline state; the failure
// is history, never a phase the pipeline can be in.
const FAILED_RUN_ID = "gallery-failed-run";
const FAILED_MESSAGE = "The encoder exited with code 1 while encoding scene 7.";
const FAILED_STATE: VideoState = {
    ...VIDEO_STATE,
    scene_count: GALLERY_SCENES.length,
    sequences: SEQUENCES.map((sequence): VideoState["sequences"][number] => {
        if (sequence.id === "SceneDetector") {
            return {
                ...sequence,
                status: "complete",
                progress: 100,
                detail: "14 scenes detected",
                runnable: false,
            };
        }
        if (sequence.id === "ParallelEncoder") {
            return {
                ...sequence,
                status: "failed",
                progress: 41,
                detail: "Encoder exited with code 1",
                runnable: true,
            };
        }
        return {
            ...sequence,
            status: "never_run",
            progress: null,
            detail: null,
            runnable: false,
        };
    }),
    next: ["ParallelEncoder"],
    active: false,
    run_id: null,
    failure: {
        run_id: FAILED_RUN_ID,
        at: "2026-11-12T05:16:42Z",
        sequence: "ParallelEncoder",
        message: FAILED_MESSAGE,
    },
    output_exists: false,
    retained_bytes: 96_000_000,
};

const FAILED_HISTORY: TimelineRecord = {
    run_id: FAILED_RUN_ID,
    sequence: "ParallelEncoder",
    started_at: "2026-11-12T05:14:00Z",
    ended_at: "2026-11-12T05:16:42Z",
    outcome: "failed",
    frames_processed: 960,
    frames_total: 2160,
    fps: 42.5,
    message: FAILED_MESSAGE,
};

const FAILED_SUMMARY: RunSummary = {
    run_id: FAILED_RUN_ID,
    started_at: "2026-11-12T05:14:00Z",
    ended_at: "2026-11-12T05:16:42Z",
    outcome: "failed",
    message: FAILED_MESSAGE,
};

// The service reports the reason instead of pretending the run can start.
const BLOCKED_VALIDATION: Partial<VideoValidation> = {
    can_encode: false,
    output_writable: false,
    blockers: ["The output directory is not writable."],
};

// Two scenes overlap, which is exactly what the validation badge and the boundary list
// exist to name before a run starts.
const INVALID_SCENES = {
    ...realRun.scenes,
    scene_fingerprint: "gallery-invalid",
    scenes: GALLERY_SCENES.map((scene, index) =>
        index === 1
            ? {
                  ...scene,
                  start_frame: scene.start_frame - 12,
                  frame_count: scene.frame_count + 12,
              }
            : scene,
    ),
};

const CONCAT_INVENTORY: ConcatInventory = {
    method: "mkvmerge",
    tracks: [
        {
            key: 5,
            kind: "audio",
            label: "English 5.1",
            codec: "AAC",
            language: "eng",
            name: null,
            channels: 6,
            default: true,
            forced: false,
        },
        {
            key: 9,
            kind: "subtitle",
            label: "English subtitles",
            codec: "SRT",
            language: "eng",
            name: null,
            channels: null,
            default: false,
            forced: false,
        },
    ],
    attachments: [
        {
            key: 2,
            label: "cover.jpg",
            mime_type: "image/jpeg",
            description: null,
            size_bytes: 4_096,
            selectable: false,
        },
    ],
    data_stream_count: 0,
    chapter_count: 12,
    detail: "",
};

const LAN_OFF = {
    enabled: false,
    bind: "0.0.0.0",
    port: null,
    url: null,
    token: null,
    sessions: [],
};

const SETTINGS = {
    theme: "system",
    row_density: "comfortable",
    reduce_motion: false,
    delete_chunks_on_success: false,
    custom_tools: [],
    tool_sources: {},
    encoder_forks: [],
    python_interpreter:
        "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\python\\python.exe",
    temp_dir: "D:\\AV1ation\\scratch",
    project_templates: [
        {
            id: "default",
            name: "Documentary — 1080p",
            config: CONFIG_DOCUMENT,
            general: TEMPLATE_GENERAL,
            updated_at: "2026-10-28T11:20:00Z",
        },
        {
            id: "animation",
            name: "Animation — grain aware",
            config: {},
            general: PROJECT_GENERAL,
            updated_at: "2026-10-22T09:10:00Z",
        },
        {
            id: "archive",
            name: "Archive — near lossless",
            config: {},
            general: PROJECT_GENERAL,
            updated_at: "2026-10-18T16:45:00Z",
        },
    ],
    default_project_template_id: "default",
};

const STORAGE = {
    temporary_directory: "D:\\AV1ation\\scratch",
    default_directory: "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station\\temp",
    free_bytes: 1_284_000_000_000,
    total_bytes: 2_000_000_000_000,
    retained_bytes: 12_843_000_000,
    video_count: 3,
    app_data_bytes: 184_300_000,
    app_data_directory: "C:\\Users\\demo\\AppData\\Roaming\\com.av1ation.station",
    log_bytes: 14_200_000,
    manifest_bytes: 2_400_000,
    catalogue_bytes: 1_100_000,
    projects: [
        {
            id: GALLERY_PROJECT.id,
            name: GALLERY_PROJECT.name,
            retained_bytes: 12_843_000_000,
            video_count: 3,
        },
        {
            id: "demo-project-2",
            name: "Coastal Study",
            retained_bytes: 2_180_000_000,
            video_count: 1,
        },
    ],
};

const LAN = {
    enabled: true,
    bind: "0.0.0.0",
    port: 41234,
    url: "http://192.168.1.20:41234",
    token: "gallery-pairing-token",
    sessions: [
        {
            id: "session-phone",
            token: "gallery-pairing-token",
            shortcode: "AURV-4K2M",
            label: "Pixel 9 · Chrome",
            address: "192.168.1.44",
            created_at: "2026-10-30T12:05:00Z",
            last_seen: "2026-10-30T14:28:00Z",
        },
        {
            id: "session-laptop",
            token: "gallery-laptop-token",
            shortcode: "COND-7X9Q",
            label: "Studio laptop · Edge",
            address: "192.168.1.31",
            created_at: "2026-10-29T18:20:00Z",
            last_seen: "2026-10-30T09:11:00Z",
        },
    ],
};

export type GalleryMode =
    | "populated"
    | "empty"
    | "empty-queue"
    | "empty-scenes"
    | "failing"
    | "loading"
    | "running"
    | "failed"
    | "blocked"
    | "missing-dependency"
    | "lan-off"
    | "invalid-scenes"
    | "concat-inventory";

const DEMO_STATE_PATH = "/api/projects/demo-project/videos/demo-video/state";
const DEMO_SCENES_PATH = "/api/projects/demo-project/videos/demo-video/scenes";
const DEMO_RUN_ID = "gallery-live-run";

const LIVE_SEQUENCES: ReadonlyArray<{ id: string; name: string }> = [
    { id: "SceneDetector", name: "Scene Detector" },
    { id: "NoiseDetector", name: "Noise Detector" },
    { id: "TargetQuality", name: "Target Quality" },
    { id: "ParallelEncoder", name: "Parallel Encoder" },
    { id: "SceneConcatenator", name: "Scene Concatenator" },
    { id: "QualityCheck", name: "Quality Check" },
];

const LIVE_STAGES: ReadonlyArray<{
    id: string;
    phase: string;
    detail: string;
    done: string;
    ticks: number;
    frames?: number;
    scenes?: number;
    pass?: number;
}> = [
    {
        id: "SceneDetector",
        phase: "Analyze",
        detail: "Scanning for scene boundaries",
        done: "14 scenes detected",
        ticks: 5,
        frames: 2_160,
    },
    {
        id: "NoiseDetector",
        phase: "Measure",
        detail: "Measuring source grain",
        done: "14 scenes measured",
        ticks: 4,
        scenes: 14,
    },
    {
        id: "TargetQuality",
        phase: "Encode",
        detail: "Choosing a quantizer per scene",
        done: "14 targets set",
        ticks: 4,
        scenes: 14,
        pass: 1,
    },
    {
        id: "ParallelEncoder",
        phase: "Encode",
        detail: "Encoding sequences concurrently",
        done: "14/14 scenes encoded",
        ticks: 5,
        frames: 2_160,
        scenes: 14,
        pass: 1,
    },
    {
        id: "SceneConcatenator",
        phase: "Mux",
        detail: "Joining encoded scenes",
        done: "Output written",
        ticks: 4,
        frames: 2_160,
    },
    {
        id: "QualityCheck",
        phase: "Quality",
        detail: "Scoring the output against the source",
        done: "14 scenes scored",
        ticks: 4,
        scenes: 14,
    },
];

interface SimStep {
    readonly delay: number;
    readonly event: Omit<EncodeEvent, "at" | "run_id" | "seq">;
    readonly detail: string | null;
    readonly sceneCount?: number;
    readonly outputExists?: boolean;
    readonly retainedBytes?: number;
}

function initialLiveState(): VideoState {
    return {
        video_id: GALLERY_VIDEO.id,
        scene_count: 0,
        sequences: LIVE_SEQUENCES.map((sequence, index) => ({
            ...sequence,
            status: "never_run",
            detail: null,
            progress: null,
            runnable: index === 0,
        })),
        next: ["SceneDetector"],
        active: false,
        run_id: null,
        failure: null,
        output_exists: false,
        retained_bytes: 0,
        script_data: [],
    };
}

function liveScript(): SimStep[] {
    const steps: SimStep[] = [];
    const projectId = GALLERY_PROJECT.id;
    const videoId = GALLERY_VIDEO.id;
    for (const stage of LIVE_STAGES) {
        steps.push({
            delay: 420,
            event: {
                project_id: projectId,
                video_id: videoId,
                sequence: stage.id,
                kind: "started",
                progress: 0,
                message: `${LIVE_SEQUENCES.find((entry) => entry.id === stage.id)?.name ?? stage.id} started`,
            },
            detail: stage.detail,
        });
        for (let tick = 1; tick <= stage.ticks; tick += 1) {
            const fraction = tick / (stage.ticks + 1);
            const progress = Math.round(fraction * 100);
            steps.push({
                delay: 620,
                event: {
                    project_id: projectId,
                    video_id: videoId,
                    sequence: stage.id,
                    kind: "progress",
                    progress,
                    phase: stage.phase,
                    pass: stage.pass ?? null,
                    frames_processed:
                        stage.frames === undefined ? null : Math.round(stage.frames * fraction),
                    frames_total: stage.frames ?? null,
                    scenes_processed:
                        stage.scenes === undefined ? null : Math.round(stage.scenes * fraction),
                    scenes_total: stage.scenes ?? null,
                    message: `${stage.id} is ${String(progress)}% complete`,
                },
                detail: stage.detail,
            });
        }
        steps.push({
            delay: 480,
            event: {
                project_id: projectId,
                video_id: videoId,
                sequence: stage.id,
                kind: "completed",
                progress: 100,
                phase: stage.phase,
                pass: stage.pass ?? null,
                frames_processed: stage.frames ?? null,
                frames_total: stage.frames ?? null,
                scenes_processed: stage.scenes ?? null,
                scenes_total: stage.scenes ?? null,
                scene_count: stage.id === "SceneDetector" ? GALLERY_SCENES.length : null,
                message: `${stage.id} finished: ${stage.done}`,
            },
            detail: stage.done,
            ...(stage.id === "SceneDetector" ? { sceneCount: GALLERY_SCENES.length } : {}),
            ...(stage.id === "ParallelEncoder"
                ? { retainedBytes: realRun.state.retained_bytes }
                : {}),
        });
    }
    steps.push({
        delay: 700,
        event: {
            project_id: projectId,
            video_id: videoId,
            sequence: null,
            kind: "finished",
            message: "Encode finished; every sequence completed.",
        },
        detail: "Every sequence has completed and the output is written.",
        outputExists: true,
    });
    return steps;
}

/**
 * The website's demo transport runs one encode on a timer.
 *
 * The real screens read the same state and event contracts the desktop service uses, so the
 * cards move through each sequence, the live strip fills with rates, and Scenes, History and
 * Logs follow the same run without a backend. The captured run remains the older History
 * fixture; the simulated run appends its own attempts and log as each sequence finishes.
 */
export class GalleryDemoTransport extends MockTransport {
    private liveState: VideoState = initialLiveState();
    private liveScenes: readonly SceneView[] = [];
    private liveHistory: TimelineRecord[] = [];
    private liveLogs: LogRecord[] = [];
    private stageStartedAt: string | null = null;
    private runStartedAt = "";
    private readonly eventListeners = new Set<(event: EncodeEvent) => void>();
    private steps: SimStep[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private timerDueAt: number | null = null;
    private timerDelay = 0;
    private paused = false;
    private seq = 0;

    /** Point the demo routes at the live run instead of the frozen captured state. */
    prepareSimulation(): void {
        this.liveState = initialLiveState();
        this.liveScenes = [];
        this.routes.set(DEMO_STATE_PATH, () => this.liveState);
        this.routes.set(DEMO_SCENES_PATH, () => ({
            ...realRun.scenes,
            video_id: GALLERY_VIDEO.id,
            scene_fingerprint: "gallery-live",
            scenes: this.liveScenes,
        }));
        this.routes.set("/api/projects/demo-project/videos/demo-video/history", () => ({
            entries: [...HISTORY, ...this.liveHistory],
        }));
    }

    /**
     * Freeze the script between steps without resetting the run. The current progress, scenes,
     * history and logs stay exactly where the last emitted event left them.
     */
    pauseSimulation(): void {
        if (this.paused) {
            return;
        }
        this.paused = true;
        if (this.timer !== null) {
            this.timerDelay = Math.max(0, (this.timerDueAt ?? Date.now()) - Date.now());
            this.clearTimer();
            this.timerDueAt = null;
        }
    }

    /** Continue from the step the paused timer was about to emit. */
    resumeSimulation(): void {
        if (!this.paused) {
            return;
        }
        this.paused = false;
        if (this.eventListeners.size > 0) {
            this.armTimer();
        }
    }

    override subscribe<T>(
        path: string,
        schema: { parse: (value: unknown) => T },
        onEvent: (event: T) => void,
    ): () => void {
        if (path !== "/api/events") {
            return () => {};
        }
        const listener = (event: EncodeEvent) => onEvent(schema.parse(event));
        this.eventListeners.add(listener);
        if (this.eventListeners.size === 1) {
            this.beginRun();
        }
        return () => {
            this.eventListeners.delete(listener);
            if (this.eventListeners.size === 0) {
                this.stopRun();
            }
        };
    }

    private beginRun(): void {
        this.stopRun();
        this.liveState = initialLiveState();
        this.liveScenes = [];
        this.liveHistory = [];
        this.stageStartedAt = null;
        this.runStartedAt = new Date().toISOString();
        this.liveLogs = [
            {
                at: this.runStartedAt,
                level: "info",
                message: "Run started: release-demo.mkv · 1280×720 · 24.000 fps",
                project_id: GALLERY_PROJECT.id,
                run_id: DEMO_RUN_ID,
                scope: "run",
                seq: 0,
                sequence: null,
                video_id: GALLERY_VIDEO.id,
            },
        ];
        this.logs.set(DEMO_RUN_ID, this.liveLogs);
        this.runs.set(GALLERY_VIDEO.id, [
            {
                run_id: DEMO_RUN_ID,
                started_at: this.runStartedAt,
                ended_at: null,
                outcome: "running",
                message: null,
            } satisfies RunSummary,
            ...RUNS,
        ]);
        this.steps = liveScript();
        this.seq = 0;
        if (this.paused) {
            this.timerDelay = 0;
            return;
        }
        this.advance();
    }

    private stopRun(): void {
        this.clearTimer();
        this.timerDueAt = null;
        this.timerDelay = 0;
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /** Schedule the next step, or hold its delay until the transport is resumed. */
    private schedule(delay: number): void {
        this.clearTimer();
        this.timerDelay = Math.max(0, delay);
        this.timerDueAt = null;
        this.armTimer();
    }

    private armTimer(): void {
        if (this.paused || this.timer !== null || this.eventListeners.size === 0) {
            return;
        }
        const delay = this.timerDelay;
        this.timerDelay = 0;
        this.timerDueAt = Date.now() + delay;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.timerDueAt = null;
            this.advance();
        }, delay);
    }

    private advance(): void {
        if (this.paused) {
            return;
        }
        const step = this.steps.shift();
        if (step === undefined) {
            this.schedule(4_000);
            return;
        }
        this.seq += 1;
        const event = EncodeEventSchema.parse({
            ...step.event,
            at: new Date().toISOString(),
            run_id: DEMO_RUN_ID,
            seq: this.seq,
        });
        this.applyStep(event, step);
        for (const listener of this.eventListeners) {
            listener(event);
        }
        this.schedule(step.delay);
    }

    private applyStep(event: EncodeEvent, step: SimStep): void {
        const sequenceId = event.sequence ?? null;
        this.liveLogs.push({
            at: event.at,
            level: "info",
            message: event.message,
            project_id: event.project_id,
            run_id: event.run_id,
            scope: "run",
            seq: this.liveLogs.length,
            sequence: sequenceId,
            video_id: event.video_id,
        });
        if (event.kind === "started") {
            this.stageStartedAt = event.at;
        }
        if (event.kind === "completed" && sequenceId !== null) {
            const startedAt = this.stageStartedAt ?? event.at;
            const seconds = Math.max(0.001, (Date.parse(event.at) - Date.parse(startedAt)) / 1_000);
            const frames = event.frames_processed ?? null;
            this.liveHistory.push({
                run_id: event.run_id,
                sequence: sequenceId,
                started_at: startedAt,
                ended_at: event.at,
                outcome: "completed",
                frames_processed: frames,
                frames_total: event.frames_total ?? null,
                fps: frames === null ? null : Math.round((frames / seconds) * 100) / 100,
                message: null,
            });
        }
        if (event.kind === "finished") {
            this.liveHistory.push({
                run_id: event.run_id,
                sequence: null,
                started_at: this.runStartedAt,
                ended_at: event.at,
                outcome: "completed",
                frames_processed: null,
                frames_total: null,
                fps: null,
                message: "Encode finished",
            });
            this.runs.set(GALLERY_VIDEO.id, [
                {
                    run_id: DEMO_RUN_ID,
                    started_at: this.runStartedAt,
                    ended_at: event.at,
                    outcome: "completed",
                    message: "Encode finished",
                } satisfies RunSummary,
                ...RUNS,
            ]);
        }
        const statusFor = (id: string): SequenceRunStatus => {
            if (id === sequenceId) {
                return event.kind === "completed" ? "complete" : "active";
            }
            const previous = this.liveState.sequences.find((sequence) => sequence.id === id);
            return previous?.status ?? "never_run";
        };
        let sequences = this.liveState.sequences.map((sequence) => ({
            ...sequence,
            status: statusFor(sequence.id),
            progress:
                sequence.id === sequenceId
                    ? event.kind === "completed"
                        ? 100
                        : (event.progress ?? sequence.progress ?? 0)
                    : sequence.status === "active"
                      ? 100
                      : sequence.progress,
            detail: sequence.id === sequenceId ? step.detail : sequence.detail,
            runnable: true,
        }));

        if (event.kind === "finished") {
            sequences = sequences.map((sequence) => ({
                ...sequence,
                status: "complete",
                progress: 100,
                detail: sequence.id === "SceneConcatenator" ? "Output written" : sequence.detail,
            }));
        }

        const next = sequences
            .filter((sequence) => sequence.status !== "complete")
            .slice(0, 1)
            .map((sequence) => sequence.id);
        this.liveState = {
            ...this.liveState,
            scene_count: step.sceneCount ?? this.liveState.scene_count,
            sequences,
            next,
            active: event.kind !== "finished",
            run_id: event.kind === "finished" ? null : DEMO_RUN_ID,
            failure: null,
            output_exists: step.outputExists ?? this.liveState.output_exists,
            retained_bytes: step.retainedBytes ?? this.liveState.retained_bytes,
        };
        if (step.sceneCount !== undefined) {
            this.liveScenes = GALLERY_SCENES;
        }
    }
}

function baseSettings(): Record<string, unknown> {
    return { ...(SETTINGS as Record<string, unknown>) };
}

/**
 * Seed the deterministic demo transport used by the screenshot gallery.
 *
 * The public demo opens on this captured run, so the fixture owns the one project, its three
 * queue rows, and the complete configuration shown by the catalog. The `gallery` query
 * parameter still selects the empty, loading and failing states used by the screenshots and
 * the browser tests.
 */
export function seedGallery(transport: MockTransport, mode: GalleryMode): void {
    if (mode === "empty") {
        transport.routes.set("/api/projects", []);
        return;
    }

    transport.routes.set("/api/projects", [GALLERY_PROJECT]);
    transport.general.set(GALLERY_PROJECT.id, PROJECT_GENERAL);
    transport.videos.set(
        GALLERY_PROJECT.id,
        mode === "empty-queue" ? [] : [GALLERY_VIDEO, ...SIBLING_VIDEOS],
    );
    transport.history.set(GALLERY_VIDEO.id, HISTORY);
    transport.runs.set(GALLERY_VIDEO.id, RUNS);
    transport.scenes.set(`${GALLERY_PROJECT.id}/${GALLERY_VIDEO.id}`, realRun.scenes);
    transport.logs.set(RUN_ID, RUN_LOGS);
    transport.parameterOverrides.set("x265", X265_PARAMETERS);
    transport.parameterOverrides.set("svt-av1", SVT_PARAMETERS);

    if (mode === "empty-queue") {
        return;
    }

    transport.routes.set("/api/settings", baseSettings());
    transport.routes.set("/api/storage", STORAGE);
    transport.routes.set("/api/lan", LAN);
    transport.routes.set("/api/config/schema", SCHEMA);
    transport.routes.set("/api/config/filters", FILTER_SCHEMAS);
    transport.routes.set(
        "/api/projects/demo-project/config",
        effective(CONFIG_DOCUMENT, () => "inherited"),
    );
    transport.routes.set(
        "/api/projects/demo-project/videos/demo-video/config",
        effective(GALLERY_VIDEO_EFFECTIVE, videoSource),
    );
    transport.routes.set("/api/projects/demo-project/videos/demo-video/overrides", {
        fields: OVERRIDES,
    });
    transport.routes.set("/api/projects/demo-project/videos/demo-video/general", VIDEO_GENERAL);
    transport.routes.set("/api/projects/demo-project/videos/demo-video/state", VIDEO_STATE);
    transport.routes.set("/api/projects/demo-project/videos/demo-video/thumbnails", THUMBNAILS);
    transport.routes.set("/api/projects/demo-project/videos/demo-video/history", {
        entries: HISTORY,
    });
    transport.routes.set("/api/projects/demo-project/videos/demo-video/probe", PROBE);
    transport.routes.set("/api/projects/demo-project/scripts", { problems: [] });
    transport.routes.set(
        "/api/settings/defaults",
        effective(CONFIG_DOCUMENT, () => "inherited"),
    );
    transport.routes.set("/api/settings/defaults/general", PROJECT_GENERAL);
    transport.routes.set("/api/settings/defaults/scripts", { problems: [] });
    transport.routes.set(
        "/api/settings/templates/default/defaults",
        effective(CONFIG_DOCUMENT, () => "inherited"),
    );
    transport.routes.set("/api/settings/templates/default/general", TEMPLATE_GENERAL);
    transport.routes.set("/api/settings/templates/default/scripts", { problems: [] });

    if (mode === "empty-scenes") {
        transport.routes.set("/api/projects/demo-project/videos/demo-video/scenes", {
            video_id: GALLERY_VIDEO.id,
            total_frames: 2160,
            scene_fingerprint: "gallery-empty",
            scenes: [],
        });
        transport.routes.set(
            "/api/projects/demo-project/videos/demo-video/state",
            EMPTY_VIDEO_STATE,
        );
        transport.routes.set("/api/projects/demo-project/videos/demo-video/thumbnails", {
            state: "empty",
            revision: "gallery-v1",
            interval_ms: 5_000,
            width: 320,
            available: 0,
            detail: "Scene detection has not produced any keyframes yet.",
        });
    }

    if (mode === "running") {
        // History and run summaries only record terminal attempts, so an active run has
        // nothing to add there; its state is what the pipeline reads.
        transport.routes.set(DEMO_STATE_PATH, RUNNING_STATE);
    }

    if (mode === "failed") {
        transport.routes.set(DEMO_STATE_PATH, FAILED_STATE);
        transport.routes.set("/api/projects/demo-project/videos/demo-video/history", {
            entries: [FAILED_HISTORY, ...HISTORY],
        });
        transport.runs.set(GALLERY_VIDEO.id, [FAILED_SUMMARY, ...RUNS]);
    }

    if (mode === "blocked") {
        transport.validation = BLOCKED_VALIDATION;
    }

    if (mode === "invalid-scenes") {
        transport.routes.set(DEMO_SCENES_PATH, INVALID_SCENES);
    }

    if (mode === "lan-off") {
        transport.routes.set("/api/lan", LAN_OFF);
    }

    if (mode === "missing-dependency") {
        const checks = transport.health.preflight.checks.map((check) =>
            check.id === "ffmpeg"
                ? {
                      ...check,
                      available: false,
                      detail: "Not found on PATH.",
                      remediation: "Install FFmpeg and put it on PATH.",
                  }
                : check,
        );
        transport.health.preflight = {
            checks,
            available_count: checks.filter((check) => check.available).length,
            total_count: checks.length,
        };
    }

    if (mode === "concat-inventory") {
        // The demo has no media file to probe, so this fixture answers the workbench's own
        // inventory request with the stream list a real mkvmerge identify would return.
        const post = transport.post.bind(transport);
        type Post = MockTransport["post"];
        transport.post = (async (
            path: string,
            body: unknown,
            schema: Parameters<Post>[2],
        ): Promise<unknown> => {
            if (path.endsWith("/concat-inventory")) {
                return schema.parse(CONCAT_INVENTORY);
            }
            return post(path, body, schema);
        }) as Post;
    }

    if (mode === "failing") {
        const failure = () => Promise.reject(new Error("The service is unavailable."));
        // Keep health and settings readable so the shell can resolve the emulated light
        // theme; only the project list fails, which is the state this shot documents.
        const read = transport.get.bind(transport);
        transport.get = (path, schema) =>
            path === "/api/projects" ? failure() : read(path, schema);
        transport.post = failure;
        transport.put = failure;
        transport.patchJson = failure;
        transport.delete = failure;
    }
    if (mode === "loading") {
        const pending = () => new Promise<never>(() => undefined);
        transport.get = pending;
        transport.post = pending;
    }
}
