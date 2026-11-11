import { PROJECT_SECTIONS } from "./project-sections";

export type VideoOverrideSectionId = Exclude<(typeof PROJECT_SECTIONS)[number]["id"], "general">;

/**
 * The six configuration sections a video can override.
 *
 * General is not one of them: a video's General owns its source and exact output file, which
 * are documents of their own rather than configuration leaves. Temporary directory and
 * Video details are read-only facts, so neither is a draft screen.
 */
export const VIDEO_OVERRIDE_SECTIONS: ReadonlyArray<{
    id: VideoOverrideSectionId;
    label: string;
}> = PROJECT_SECTIONS.filter((entry) => entry.id !== "general");

/** The card that owns a failed run; `null` means no current card can claim it. */
export type VideoFailureOwner = VideoOverrideSectionId | "general";

export function isVideoOverrideSection(section: string): section is VideoOverrideSectionId {
    return VIDEO_OVERRIDE_SECTIONS.some((entry) => entry.id === section);
}

/**
 * The sequences each configuration section owns, in run order.
 *
 * A section is not one sequence: noise generation is measurement plus scaling, and a
 * video's encoder can run in parallel or serially. The overview shows every step the server
 * reports, so a section card can say "2 of 2 done" without inventing a phase.
 */
export const SECTION_SEQUENCES: Record<VideoOverrideSectionId, readonly string[]> = {
    "scene-detection": ["SceneDetector"],
    "noise-generation": ["NoiseDetector", "NoiseScaler"],
    // Target Quality owns two action sequences as well as the probe. They have no stored
    // completion, but they are what turn its quantizers into encoder speed and repair
    // high-bitrate outlier scenes, so they need their own run controls here.
    "target-quality": ["TargetQuality", "SpeedScaler", "BitrateOptimizer"],
    encoding: ["ParallelEncoder", "SerialEncoder"],
    concatenation: ["SceneConcatenator"],
    "quality-check": ["QualityCheck"],
};

/**
 * The configuration card that owns a failed run.
 *
 * A `null` sequence is a run that failed before sequence 1 while opening the General
 * input or output, so General owns it. Benchmarker has no row of its own but resolves the
 * encoder's Auto worker count, so Encoding owns its failure. A named sequence with no
 * card keeps the page banner; no sequence this build runs reaches that branch.
 */
export function failureOwnerForSequence(sequence: string | null): VideoFailureOwner | null {
    if (sequence === null) {
        return "general";
    }
    if (sequence === "Benchmarker") {
        return "encoding";
    }
    return (
        VIDEO_OVERRIDE_SECTIONS.find((entry) => SECTION_SEQUENCES[entry.id].includes(sequence))
            ?.id ?? null
    );
}

/** The input contexts General owns in a script scan. */
export const GENERAL_PLUGIN_CONTEXTS = ["General input"] as const;

/**
 * The input contexts each configuration page owns.
 *
 * A scan names every script by the section that would open it, so a page filters the
 * document's rows to this list. Concatenation and the scaling sequences open no input, and
 * therefore own no rows.
 */
export const SECTION_PLUGIN_CONTEXTS: Record<VideoOverrideSectionId, readonly string[]> = {
    "scene-detection": ["Scene detection"],
    "noise-generation": ["Noise detection"],
    "target-quality": ["Target quality", "Target quality metric input"],
    encoding: ["Encoding"],
    concatenation: [],
    "quality-check": ["Quality check"],
};

/** The three screens that describe one video rather than one of its sequences. */
export const VIDEO_SCOPE_SECTIONS = [{ id: "general", label: "General" }] as const;

export type VideoScopeSectionId = (typeof VIDEO_SCOPE_SECTIONS)[number]["id"];

export function isVideoScopeSection(section: string): section is VideoScopeSectionId {
    return VIDEO_SCOPE_SECTIONS.some((entry) => entry.id === section);
}
