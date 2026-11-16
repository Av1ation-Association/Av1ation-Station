import type {
    AppInfo,
    AppSettings,
    ParameterDescriptor,
    PreflightCheck,
    ProjectSummary,
    ToolchainInfo,
    VideoValidation,
} from "@av1ation/contracts";
import {
    API_VERSION,
    APP_VERSION,
    ENGINE_REVISION,
    ENGINE_VERSION,
} from "@av1ation/contracts/versions";

export interface MockFixtures {
    health: AppInfo;
    projects: ProjectSummary[];
    settings: AppSettings;
    /** Optional per-video preflight, for route and error-state tests. */
    validation?: Partial<VideoValidation>;
    /** Optional media mapping, so a deterministic gallery can show real images. */
    mediaUrl?: (path: string) => string;
    /** Optional lock summary, for screen tests that need a different target. */
    toolchain?: ToolchainInfo;
}

interface MockFamily {
    label: string;
    capability: string;
    target: string;
}

export const FAMILIES: Record<string, MockFamily> = {
    aom: { label: "aomenc", capability: "encode", target: "encoder:aom" },
    "svt-av1": {
        label: "SVT-AV1",
        capability: "encode",
        target: "encoder:svt-av1",
    },
    rav1e: { label: "rav1e", capability: "encode", target: "encoder:rav1e" },
    vpx: { label: "vpxenc", capability: "encode", target: "encoder:vpx" },
    avm: { label: "avmenc", capability: "encode", target: "encoder:avm" },
    x264: { label: "x264", capability: "encode", target: "encoder:x264" },
    x265: { label: "x265", capability: "encode", target: "encoder:x265" },
    vvenc: { label: "vvencapp", capability: "encode", target: "encoder:vvenc" },
    ffmpeg: { label: "FFmpeg", capability: "muxing", target: "ffmpeg" },
    mkvmerge: { label: "MKVToolNix", capability: "muxing", target: "mkvmerge" },
};

/** One built-in encoder row the demo offers, with the document a fork starts from. */
export interface MockEncoderFixture {
    id: string;
    label: string;
    version: string;
    default: Record<string, unknown>;
    parameters: Record<string, ParameterDescriptor>;
}

function numberParameter(
    label: string,
    description: string,
    minimum: number,
    maximum: number,
    fallback: number,
    group: string | null,
): ParameterDescriptor {
    return {
        delimiter: "Space",
        label,
        description,
        doc_link: null,
        kind: {
            Number: {
                integer: true,
                min: minimum,
                max: maximum,
                step: 1,
                unit: null,
            },
        },
        default: fallback,
        widget: "Auto",
        advanced: false,
        group,
        relations: [],
    };
}

function textParameter(
    label: string,
    description: string,
    fallback: string,
    group: string | null,
): ParameterDescriptor {
    return {
        delimiter: "Space",
        label,
        description,
        doc_link: null,
        kind: { Text: { max_len: null, pattern: null, multiline: false, format: null } },
        default: fallback,
        widget: "Auto",
        advanced: false,
        group,
        relations: [],
    };
}

/**
 * The demo's encoder catalogue.
 *
 * This mirrors the engine's nine `EncoderBase` variants instead of a hand-picked pair, so
 * the Encoders tab and the dependency inventory both show every encode path the real
 * service can offer. The defaults use the engine's pass-one document so a fork can be
 * selected without a render-time schema rejection.
 */
export const MOCK_ENCODERS: MockEncoderFixture[] = [
    {
        id: "x265",
        label: "x265",
        version: "x265 4.1",
        default: {
            X265: {
                executable: null,
                pass: { All: 1 },
                options: {},
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--crf": numberParameter(
                "Constant Rate Factor",
                "Quality target; lower keeps more detail.",
                0,
                63,
                24,
                null,
            ),
        },
    },
    {
        id: "svt-av1",
        label: "SVT-AV1",
        version: "SVT-AV1-Essential v4.0.1",
        default: {
            SVTAV1: {
                executable: null,
                pass: { All: 1 },
                options: {},
                photon_noise: null,
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--preset": numberParameter(
                "Encoder preset",
                "Speed and compression trade-off.",
                0,
                13,
                6,
                "Speed",
            ),
            "--crf": numberParameter(
                "CRF",
                "Quality target; lower keeps more detail.",
                0,
                63,
                32,
                "Rate control",
            ),
        },
    },
    {
        id: "aom",
        label: "AOM",
        version: "aomenc v3.13.1",
        default: {
            AOM: {
                executable: null,
                pass: { All: 1 },
                options: {},
                photon_noise: null,
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--crf": numberParameter(
                "Constant Rate Factor",
                "Quality target; lower keeps more detail.",
                0,
                63,
                30,
                "Rate control",
            ),
            "--cpu-used": numberParameter(
                "CPU used",
                "Higher values trade compression for speed.",
                0,
                8,
                6,
                "Speed",
            ),
        },
    },
    {
        id: "rav1e",
        label: "rav1e",
        version: "rav1e 0.8.1",
        default: {
            RAV1E: {
                executable: null,
                pass: { All: 1 },
                options: {},
                photon_noise: null,
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--quantizer": numberParameter(
                "Quantizer",
                "Constant quantizer; lower keeps more detail.",
                0,
                255,
                100,
                "Rate control",
            ),
            "--speed": numberParameter(
                "Speed",
                "Higher values trade compression for speed.",
                0,
                10,
                6,
                "Speed",
            ),
        },
    },
    {
        id: "vpx",
        label: "VPX",
        version: "vpxenc v1.15.2",
        default: {
            VPX: {
                executable: null,
                pass: { All: 1 },
                options: {},
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--crf": numberParameter(
                "Constant Rate Factor",
                "Quality target; lower keeps more detail.",
                0,
                63,
                32,
                "Rate control",
            ),
            "--cpu-used": numberParameter(
                "CPU used",
                "Higher values trade compression for speed.",
                0,
                8,
                0,
                "Speed",
            ),
        },
    },
    {
        id: "avm",
        label: "AVM",
        version: "avmenc 0.1.0",
        default: {
            AVM: {
                executable: null,
                pass: { All: 1 },
                options: {},
                photon_noise: null,
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--crf": numberParameter(
                "Constant Rate Factor",
                "Quality target; lower keeps more detail.",
                0,
                63,
                30,
                "Rate control",
            ),
            "--cpu-used": numberParameter(
                "CPU used",
                "Higher values trade compression for speed.",
                0,
                8,
                6,
                "Speed",
            ),
        },
    },
    {
        id: "x264",
        label: "x264",
        version: "x264 0.164",
        default: {
            X264: {
                executable: null,
                pass: { All: 1 },
                options: {},
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--crf": numberParameter(
                "Constant Rate Factor",
                "Quality target; lower keeps more detail.",
                0,
                51,
                23,
                "Rate control",
            ),
            "--preset": textParameter(
                "Encoder preset",
                "Speed and compression trade-off.",
                "medium",
                "Speed",
            ),
        },
    },
    {
        id: "vvenc",
        label: "VVenC",
        version: "vvencapp 1.13.1",
        default: {
            VVenC: {
                executable: null,
                pass: { All: 1 },
                options: {},
                ffmpeg_filter: null,
                append_color_data: true,
            },
        },
        parameters: {
            "--qp": numberParameter(
                "Quantizer",
                "Constant quantizer; lower keeps more detail.",
                0,
                63,
                32,
                "Rate control",
            ),
            "--preset": textParameter(
                "Encoder preset",
                "Speed and compression trade-off.",
                "medium",
                "Speed",
            ),
        },
    },
    {
        id: "ffmpeg",
        label: "FFmpeg",
        version: "ffmpeg version 8.1",
        default: {
            FFmpeg: {
                executable: null,
                options: {},
                append_color_data: true,
            },
        },
        parameters: {
            "-crf": numberParameter(
                "Constant Rate Factor",
                "Quality target; lower keeps more detail.",
                0,
                51,
                23,
                "Rate control",
            ),
            "-c:v": textParameter(
                "Video codec",
                "The encoder FFmpeg should drive.",
                "libx264",
                null,
            ),
        },
    },
];

const MOCK_PREFLIGHT_CHECKS: PreflightCheck[] = [
    {
        id: "vapoursynth",
        label: "VapourSynth",
        capability: "decode",
        available: true,
        detail: "Core R80 · API 4.3",
        selected_source: "bundled",
        providers: [
            {
                source: "bundled",
                available: true,
                detail: "Bundled runtime · C:\\Program Files\\Av1ation Station\\tools\\python\\Lib\\site-packages\\vapoursynth\\vsscript.dll",
                active: true,
                checked: true,
            },
            {
                source: "system",
                available: false,
                detail: "Restart with System selected to probe this machine's VapourSynth.",
                active: false,
                checked: false,
            },
        ],
    },
    {
        id: "ffmpeg",
        label: "FFmpeg",
        capability: "muxing",
        available: true,
        detail: "ffmpeg version 8.1",
    },
    ...MOCK_ENCODERS.map((encoder): PreflightCheck => ({
        id: `encoder:${encoder.id}`,
        label: FAMILIES[encoder.id]?.label ?? encoder.label,
        capability: "encode",
        available: true,
        detail: `Bundled · ${encoder.version}`,
    })),
];

/**
 * The demo's filter forms. The real service serves schemars output from the pinned engine;
 * this subset keeps the demo's core filters editable without pretending to be the whole
 * engine catalogue.
 */
export const MOCK_SCRIPT_GUIDE = {
    module_file: "condor_data.py",
    stub: [
        "video_path: str",
        '"""Absolute path of the source file this run decodes."""',
        "",
        "temp_dir: str",
        '"""The per-video scratch directory the run writes chunks and sidecars into."""',
        "",
        "run_id: str",
        '"""Correlation id of the run that opened the script."""',
        "",
        "sequence: str",
        '"""The sequence this open belongs to, empty before the first one."""',
        "",
        "class Scene:",
        '    """One scene range. start is inclusive and end is exclusive."""',
        "    index: int",
        "    start: int",
        "    end: int",
        "    def frame_count(self) -> int: ...",
        "",
        "scenes: tuple[Scene, ...]",
        '"""Every scene in pipeline order; empty before Scene Detector has run."""',
        "scene_count: int",
        "",
        "def scene_at(frame: int) -> Scene | None:",
        '    """The scene containing frame, or None when it is outside every range."""',
    ].join("\n"),
    // The active part of the engine's template. The demo omits the commented per-scene
    // examples; a service returns the whole guide.
    template: [
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
        "out = src",
        "out.set_output()",
        "",
    ].join("\n"),
    variables: [
        {
            key: "condor_video_path",
            description: "Absolute path of the source file this run decodes.",
            source: "the video in the queue",
            format: "text",
            value: "C:\\\\media\\\\clip.mkv",
            truncated: false,
            bytes: 21,
        },
        {
            key: "condor_scenes",
            description: "JSON array of {index, start, end, data} for every scene.",
            source: "condor.scenes",
            format: "json",
            value: "[]",
            truncated: false,
            bytes: 2,
        },
        {
            key: "condor_temp_dir",
            description: "The per-video scratch directory for chunks and sidecars.",
            source: "configuration",
            format: "text",
            value: "C:\\\\temp",
            truncated: false,
            bytes: 6,
        },
    ],
};

/** The demo's target lock summary, mirroring the shape embedded in the service. */
export const MOCK_TOOLCHAIN: ToolchainInfo = {
    target: "x86_64-pc-windows-msvc",
    revision: "2026.11.1",
    components: [
        {
            id: "ffmpeg",
            version: "9.0.2",
            license: "LGPL-2.1-or-later",
            source_url: "https://github.com/FFmpeg/FFmpeg",
            sha256: "a".repeat(64),
        },
        {
            id: "mkvmerge",
            version: "v103.0",
            license: "GPL-2.0-only",
            source_url: "https://gitlab.com/mbunkus/mkvtoolnix",
            sha256: "b".repeat(64),
        },
        {
            id: "encoder:svt-av1",
            version: "4.3.0",
            license: "BSD-3-Clause-Clear",
            source_url: "https://gitlab.com/AOMediaCodec/SVT-AV1",
            sha256: "c".repeat(64),
        },
        {
            id: "encoder:x265",
            version: "4.1",
            license: "GPL-2.0-only",
            source_url: "https://bitbucket.org/multicoreware/x265_git",
            sha256: "d".repeat(64),
        },
    ],
};

export const MOCK_FILTER_SCHEMAS = {
    ffms2: {
        title: "Ffms2Filter",
        oneOf: [
            {
                type: "object",
                properties: {
                    OutputFormat: {
                        type: "object",
                        properties: {
                            bit_depth: {
                                type: ["integer", "null"],
                                minimum: 8,
                                maximum: 12,
                            },
                            chroma: {
                                type: ["string", "null"],
                                enum: ["Yuv420", "Yuv422", "Yuv444", "Monochrome", null],
                            },
                            width: { type: ["integer", "null"] },
                            height: { type: ["integer", "null"] },
                        },
                    },
                },
                required: ["OutputFormat"],
                additionalProperties: false,
            },
        ],
    },
    vapour_synth: {
        title: "VapourSynthFilter",
        oneOf: [
            {
                type: "object",
                properties: {
                    Crop: {
                        type: "object",
                        properties: {
                            top: { type: ["integer", "null"] },
                            bottom: { type: ["integer", "null"] },
                            left: { type: ["integer", "null"] },
                            right: { type: ["integer", "null"] },
                        },
                    },
                },
                required: ["Crop"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    Resize: {
                        type: "object",
                        properties: {
                            scaler: {
                                type: ["string", "null"],
                                enum: [
                                    "bicubic",
                                    "bilinear",
                                    "bob",
                                    "lanczos",
                                    "point",
                                    "spline16",
                                    "spline36",
                                    "spline64",
                                    null,
                                ],
                            },
                            width: { type: ["integer", "null"] },
                            height: { type: ["integer", "null"] },
                            format: { type: ["string", "null"] },
                        },
                    },
                },
                required: ["Resize"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    Trim: {
                        type: "object",
                        properties: {
                            start: { type: ["integer", "null"] },
                            end: { type: ["integer", "null"] },
                        },
                    },
                },
                required: ["Trim"],
                additionalProperties: false,
            },
        ],
    },
};

export const fixtures: MockFixtures = {
    health: {
        name: "Av1ation Station",
        version: APP_VERSION,
        engine_version: ENGINE_VERSION,
        engine_revision: ENGINE_REVISION,
        api_version: API_VERSION,
        preflight: {
            checks: MOCK_PREFLIGHT_CHECKS,
            available_count: MOCK_PREFLIGHT_CHECKS.filter((check) => check.available).length,
            total_count: MOCK_PREFLIGHT_CHECKS.length,
        },
    },
    projects: [],
    settings: {
        theme: "system",
        row_density: "comfortable",
        reduce_motion: false,
        delete_chunks_on_success: false,
        custom_tools: [],
        tool_sources: {},
        encoder_forks: [],
        project_templates: [
            {
                id: "default",
                name: "Default",
                config: {},
                general: {
                    input_kind: "ffms2",
                    output_mode: "next_to_input",
                    ffms2_filters: [{ OutputFormat: { bit_depth: 10 } }],
                    vapour_synth_filters: [{ Resize: { format: "YUV420P10LE" } }],
                },
            },
        ],
        default_project_template_id: "default",
    },
};

/** Open the browser's picker and return a demo path, never a real host path. */
