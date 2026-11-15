import type { GeneralDefaults, SceneList, ScenePassView } from "@av1ation/contracts";

let idSequence = 0;

export function demoId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${(idSequence++).toString(36)}`;
}

export const DEMO_RUNS = [
    {
        run_id: "demo-run-2",
        started_at: "2026-10-30T14:22:31Z",
        ended_at: "2026-10-30T14:24:02Z",
        outcome: "failed",
        message: "SVT-AV1 rejected --asm avx512: unknown option",
    },
    {
        run_id: "demo-run-1",
        started_at: "2026-10-30T13:58:07Z",
        ended_at: "2026-10-30T14:19:44Z",
        outcome: "completed",
        message: "Encode finished",
    },
] as const;

/** Deterministic demo records for one run, with a failure at the end of the failed run. */
export function demoRecords(runId: string, projectId: string, videoId: string) {
    const run = DEMO_RUNS.find((entry) => entry.run_id === runId);
    if (run === undefined) {
        return null;
    }
    const started = Date.parse(run.started_at);
    const count = run.outcome === "failed" ? 48 : 120;
    return Array.from({ length: count }, (_, index) => {
        const sequence =
            index < 8
                ? "SceneDetector"
                : index < 18
                  ? "NoiseDetector"
                  : index < 30
                    ? "TargetQuality"
                    : index < 40
                      ? "ParallelEncoder"
                      : "SceneConcatenator";
        const failed = run.outcome === "failed" && index === count - 1;
        return {
            seq: index + 1,
            at: new Date(started + index * 1_000).toISOString(),
            level: failed ? "error" : index % 17 === 0 ? "warn" : "info",
            scope: "run",
            run_id: runId,
            video_id: videoId,
            project_id: projectId,
            sequence,
            message: failed
                ? run.message
                : sequence === "SceneDetector"
                  ? `Scene ${String(index)} detected at frame ${String(index * 1_440)}`
                  : sequence === "NoiseDetector"
                    ? `Noise sigma ${(0.4 + index / 100).toFixed(2)} over 48 frames`
                    : sequence === "TargetQuality"
                      ? `Probe ${String(index - 17)} of 12 · quantizer ${String(18 + (index % 24))} · score ${(92 - index / 10).toFixed(2)}`
                      : sequence === "ParallelEncoder"
                        ? `Chunk ${String(Math.floor((index - 29) / 2))} encoded at ${(12 + index / 4).toFixed(1)} fps`
                        : `Muxing chunk ${String(index - 39)} of ${String(count - 40)}`,
        };
    });
}

/** The same derivation the service uses for an omitted output path. */
export function deriveMockOutput(general: GeneralDefaults, inputPath: string): string {
    const segments = inputPath.split(/[\\/]/u);
    const file = segments.pop() ?? "output.mkv";
    const stem = file.replace(/\.[^.]+$/u, "");
    const folder =
        general.output_mode === "folder" ? (general.output_folder ?? "") : segments.join("\\");
    return `${folder.replace(/[\\/]$/u, "")}\\${stem}.av1.mkv`;
}

/**
 * The engine's variant tag for each base id the demo catalogue projects.
 *
 * The engine encoder document is externally tagged by variant (`X265`, `SVTAV1`), not by
 * the catalogue's base id (`x265`, `svt-av1`). A fork's document must use the same tag, or
 * selecting it in a project writes a variant the real service rejects.
 */
export const ENCODER_VARIANTS: Record<string, string> = {
    aom: "AOM",
    "svt-av1": "SVTAV1",
    rav1e: "RAV1E",
    vpx: "VPX",
    avm: "AVM",
    x264: "X264",
    x265: "X265",
    vvenc: "VVenC",
    ffmpeg: "FFmpeg",
};

/**
 * The demo's scene table. It is fixed rather than generated, so the website shows a
 * populated rail and timeline without claiming to have analysed anything.
 */
export const DEMO_SCENE_FRAMES = [144, 96, 120, 72, 168, 48, 96, 132, 60, 108, 84, 120];

/** The complete encoder document a scene carries in the demo. */
export const DEMO_SCENE_ENCODER = {
    SVTAV1: {
        executable: null,
        pass: { All: 1 },
        options: { preset: { Number: 4 } },
        photon_noise: null,
        ffmpeg_filter: null,
        append_color_data: true,
    },
};

/**
 * The demo's probe passes. Each scene took two, and every third needed a third, so the
 * Target Quality charts have a path to draw rather than a single point per scene.
 */
export function demoPasses(index: number): ScenePassView[] {
    const passes: ScenePassView[] = [
        {
            pass: 1,
            quantizer: 32,
            score: 70.4 + (index % 3) * 0.6,
            score_min: 68.8,
            score_max: 72.1,
            frames: 11,
            bitrate: 1.15 + index * 0.04,
            duration_ms: 620 + index * 25,
        },
        {
            pass: 2,
            quantizer: 26,
            score: 73.6 + (index % 4) * 0.35,
            score_min: 72.2,
            score_max: 75.4,
            frames: 11,
            bitrate: 1.95 + index * 0.06,
            duration_ms: 580 + index * 20,
        },
    ];
    if (index % 3 === 0) {
        passes.push({
            pass: 3,
            quantizer: 24,
            score: 75.2,
            score_min: 74.1,
            score_max: 76.3,
            frames: 11,
            bitrate: 2.6 + index * 0.07,
            duration_ms: 610 + index * 18,
        });
    }
    return passes;
}

export function demoScenes(videoId: string): SceneList {
    let start = 0;
    const scenes = DEMO_SCENE_FRAMES.map((frameCount, index) => {
        const end = start + frameCount;
        const encoded = index % 3 !== 2;
        const passes = demoPasses(index);
        const final = passes[passes.length - 1];
        const scene = {
            index,
            start_frame: start,
            end_frame: end,
            frame_count: frameCount,
            encoded,
            ...(encoded
                ? {
                      chunk_bytes: 18_000 + index * 7_500,
                      encode_ms: 900 + index * 120,
                  }
                : {}),
            quantizer: final?.quantizer,
            score: final?.score,
            noise: 0.0012 + index * 0.00017,
            noise_scaler: 1 + (index % 4) * 0.05,
            speed: 4 + (index % 5),
            quality_score: 92 + (index % 3) * 0.5,
            passes,
            encoder_label: index === 4 ? "x265" : "SVT-AV1",
            encoder_custom: index === 4,
        };
        start = end;
        return scene;
    });
    // The demo has no decode graph, so one constant table fingerprint is enough to keep
    // the scene-list shape identical to the service's.
    return {
        video_id: videoId,
        total_frames: start,
        scene_fingerprint: "demo",
        scenes,
    };
}

/** Serves the façade without a backend, for the website demo and unit tests. */
