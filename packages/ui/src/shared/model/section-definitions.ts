import type { ProjectSectionId } from "./project-sections";

interface SectionPart {
    key: string;
    title: string;
    description: string;
    optional: boolean;
    /**
     * Render only these properties of the sequence. The rest stay on the document, so a
     * section that owns one field never rewrites its neighbours with generated values.
     */
    only?: readonly string[];
}

interface SectionOutput {
    label: string;
    detail: string;
}

export interface SectionDefinition {
    id: Exclude<ProjectSectionId, "general">;
    title: string;
    description: string;
    note: string;
    encoder?: boolean;
    outputs: SectionOutput[];
    /** Stages the screen runs in order, when one screen owns more than one sequence. */
    runOrder?: SectionOutput[];
    parts: SectionPart[];
}

export const DEFINITIONS: Record<Exclude<ProjectSectionId, "general">, SectionDefinition> = {
    "scene-detection": {
        id: "scene-detection",
        title: "Scene detection",
        description: "Finds cuts. It produces the scene list every later stage runs per scene.",
        note: "The boundaries are written as they are found, so cancelling keeps the scenes already detected.",
        outputs: [
            {
                label: "Scene boundaries",
                detail: "A start and end frame for every cut.",
            },
            {
                label: "Live writes",
                detail: "Scenes appear as they are found; cancel keeps what exists.",
            },
            {
                label: "Downstream input",
                detail: "Noise, target quality and encoding all read this list.",
            },
        ],
        parts: [
            {
                key: "scene_detector",
                title: "Detector",
                description:
                    "The method and its bounds. A detection-only input does not change what is encoded.",
                optional: false,
            },
        ],
    },
    "noise-generation": {
        id: "noise-generation",
        title: "Noise generation",
        description: "Measures the source's grain and scales it for the encoder.",
        note: "Noise detection and scaling are separate sequences. Either can be enabled on its own.",
        outputs: [
            {
                label: "Noise profile",
                detail: "One estimate per scene, measured from the decoded source.",
            },
            {
                label: "Scaled grain",
                detail: "Values the encoder can apply without re-measuring.",
            },
            {
                label: "Script data",
                detail: "The estimate is available to a VapourSynth script as scene data.",
            },
        ],
        parts: [
            {
                key: "noise_detector",
                title: "Noise detector",
                description:
                    "Measures every scene with the reference and denoised filters it is given.",
                optional: true,
            },
            {
                key: "noise_scaler",
                title: "Noise scaler",
                description:
                    "Scales the measured grain between the minimum and maximum thresholds.",
                optional: true,
            },
        ],
    },
    "target-quality": {
        id: "target-quality",
        title: "Target quality",
        description: "Probes scenes for a quality target instead of a fixed quantizer.",
        note: "The metric, its target range, and the probing strategy all drive the quantizer the encoder receives.",
        outputs: [
            {
                label: "Quantizer per scene",
                detail: "Chosen by probing instead of a fixed CRF.",
            },
            {
                label: "Score per scene",
                detail: "The metric result that justified the choice.",
            },
            {
                label: "Probe report",
                detail: "Available during the run and after it in the video detail.",
            },
        ],
        runOrder: [
            {
                label: "Target quality",
                detail: "Chooses a quantizer per scene.",
            },
            {
                label: "Speed scaling",
                detail: "Maps each chosen quantizer to the encoder speed for that scene.",
            },
            {
                label: "Bitrate optimization",
                detail: "Flags scenes whose bitrate is far above the average and raises their quantizer.",
            },
        ],
        parts: [
            {
                key: "target_quality",
                title: "Target quality probe",
                description: "Metric and probing bounds used to choose a quantizer per scene.",
                optional: true,
            },
            {
                key: "speed_scaler",
                title: "Speed scaling",
                description:
                    "Maps each scene's chosen quantizer to an encoder speed. Two points are the minimum for interpolation.",
                optional: false,
            },
            {
                key: "bitrate_optimizer",
                title: "Bitrate optimization",
                description:
                    "Re-encodes scenes whose bitrate landed far above the average. An unset threshold skips it.",
                optional: false,
            },
        ],
    },
    encoding: {
        id: "encoding",
        title: "Encoding",
        description:
            "Chooses the encoder and the command-line parameters every scene is encoded with.",
        note: "A parameter that is not set keeps the executable's own default. Removing one restores it.",
        outputs: [
            {
                label: "One chunk per scene",
                detail: "Retained after concatenation unless Storage opts in to deleting them.",
            },
            {
                label: "Encoder log",
                detail: "The executable's own output, one stream per worker.",
            },
            {
                label: "Re-runnable work",
                detail: "Edited scenes can be encoded again without starting over.",
            },
        ],
        encoder: true,
        parts: [
            {
                key: "encoder",
                title: "Encoder",
                description:
                    "One encoder variant, its executable override, pass count, and options.",
                optional: false,
            },
            {
                key: "benchmarker",
                title: "Workers",
                description:
                    "How many encoder workers run, and the benchmarker's limits when the count is automatic.",
                optional: false,
            },
            {
                key: "parallel_encoder",
                title: "Input",
                description:
                    "The frames every encoder worker reads. It follows the General input unless this sequence overrides it.",
                optional: false,
                only: ["input"],
            },
        ],
    },
    concatenation: {
        id: "concatenation",
        title: "Concatenation",
        description: "Joins the encoded chunks into the final file.",
        note: "Chunks are retained after concatenation unless Storage opts in to deleting them.",
        outputs: [
            {
                label: "Final file",
                detail: "The encoded chunks joined in scene order.",
            },
            {
                label: "Track metadata",
                detail: "Chapters, tracks and attachments as configured.",
            },
            {
                label: "Muxer output",
                detail: "Written atomically; the chunks stay on disk.",
            },
        ],
        parts: [
            {
                key: "scene_concatenator",
                title: "Muxer",
                description: "The method and the track, chapter, and metadata settings it carries.",
                optional: false,
            },
        ],
    },
    "quality-check": {
        id: "quality-check",
        title: "Quality check",
        description: "Scores the concatenated video against the input.",
        note: "A quality check needs a metric and a statistic; it does not change the encode.",
        outputs: [
            {
                label: "Per-scene scores",
                detail: "One metric result for every scene.",
            },
            {
                label: "Overall statistic",
                detail: "The summary shown on the video and in the report.",
            },
            {
                label: "No encode changes",
                detail: "A check reads the output; it never re-encodes it.",
            },
        ],
        parts: [
            {
                key: "quality_check",
                title: "Quality check",
                description: "The metric, probe strategy, and statistic used to score the output.",
                optional: true,
            },
        ],
    },
};
