import type { ParameterDescriptor } from "@av1ation/contracts";

import parametersJson from "../gallery/encoder-parameters.json";
import realRun from "../gallery/real-run.json";

/** One detected scene from the captured real run the screenshots were generated from. */
export interface SceneRow {
    index: number;
    start_frame: number;
    end_frame: number;
    frame_count: number;
    encoded: boolean;
    chunk_bytes: number;
    speed: number | null;
    quality_score: number | null;
    encode_ms: number | null;
}

interface RunFixture {
    scenes: { total_frames: number; scenes: SceneRow[] };
    video: { id: string; name: string };
    project: { name: string };
}

const run = realRun as unknown as RunFixture;

export const FPS = 24;
export const SCENES = run.scenes.scenes;
export const TOTAL_FRAMES = run.scenes.total_frames;
export const VIDEO_NAME = "documentary-cut.mkv";
export const PROJECT_NAME = "Documentaries";

const catalog = parametersJson as unknown as Record<string, Record<string, ParameterDescriptor>>;
export const SVT_PARAMETERS = catalog["svt-av1"] ?? {};

export function descriptor(key: string): ParameterDescriptor | undefined {
    return SVT_PARAMETERS[key];
}

export function sceneSeconds(frames: number): number {
    return frames / FPS;
}

const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000) {
        return `${decimal.format(bytes / 1_000_000)} MB`;
    }
    return `${integer.format(bytes / 1_000)} KB`;
}

export function formatFrames(frames: number): string {
    return `${integer.format(frames)} frames`;
}

export function formatTimecode(frames: number): string {
    const total = Math.round(sceneSeconds(frames));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

/** The stored `CLIParameter` shape `ParameterControl` expects, for a numeric value. */
export function numberOption(value: number): unknown {
    return { Number: { prefix: "--", delimiter: " ", value } };
}

/** The stored shape for a textual or choice value. */
export function stringOption(value: string): unknown {
    return { String: { prefix: "--", delimiter: " ", value } };
}

/** Wraps whatever a control hands back into the matching stored option. */
export function optionFor(next: string | number | boolean): unknown {
    if (typeof next === "boolean") {
        return { Bool: { prefix: "--", value: next } };
    }
    return typeof next === "number" ? numberOption(next) : stringOption(next);
}

/** The option a descriptor starts with, so a live example opens on a real value. */
export function defaultOption(spec: ParameterDescriptor | undefined): unknown {
    if (spec === undefined) {
        return stringOption("");
    }
    if (spec.kind === "Flag") {
        return { Bool: { prefix: "--", value: spec.default === true } };
    }
    if (typeof spec.kind === "object" && "Number" in spec.kind) {
        const value = typeof spec.default === "number" ? spec.default : (spec.kind.Number.min ?? 0);
        return numberOption(value);
    }
    if (typeof spec.kind === "object" && "Choice" in spec.kind) {
        const fallback = spec.kind.Choice.options[0]?.value ?? "";
        return stringOption(String(spec.default ?? fallback));
    }
    return stringOption(typeof spec.default === "string" ? spec.default : "");
}
