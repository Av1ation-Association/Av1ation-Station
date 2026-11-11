import { describe, expect, it } from "vitest";

import type { ScenePassView, SceneView } from "@av1ation/contracts";

import { VIDEO_OVERRIDE_SECTIONS } from "../../shared/model/video-sections";

import {
    sequenceAnalytics,
    type AnalyticsMetric,
    type AnalyticsSource,
    type AnalyticsView,
    type SequenceAnalytics,
} from "./sequence-analytics";

function scene(index: number, overrides: Partial<SceneView> = {}): SceneView {
    return {
        index,
        start_frame: index * 100,
        end_frame: index * 100 + 100,
        frame_count: 100,
        encoded: false,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
        custom_data: {},
        ...overrides,
    };
}

function pass(
    position: number,
    quantizer: number,
    score: number,
    bitrateMbps: number,
    overrides: Partial<ScenePassView> = {},
): ScenePassView {
    return {
        pass: position,
        quantizer,
        score,
        score_min: score - 1,
        score_max: score + 1,
        frames: 10,
        // The engine records a probe's bitrate in bits per second.
        bitrate: bitrateMbps * 1_000_000,
        duration_ms: 500,
        ...overrides,
    };
}

function source(
    scenes: readonly SceneView[],
    document: Record<string, unknown> = {},
    frameRate: number | null = 24,
): AnalyticsSource {
    return {
        scenes,
        frameRate,
        width: 1920,
        height: 1080,
        document,
        outputExists: false,
    };
}

function metric(analytics: SequenceAnalytics, id: string): AnalyticsMetric {
    const found = analytics.metrics.find((entry) => entry.id === id);
    if (found === undefined) {
        throw new Error(`no metric ${id}`);
    }
    return found;
}

function view(entry: AnalyticsMetric, id: string): AnalyticsView {
    const found = entry.views.find((candidate) => candidate.id === id);
    if (found === undefined) {
        throw new Error(`no view ${id}`);
    }
    return found;
}

const SSIMULACRA2 = {
    sequences: {
        target_quality: {
            metric: { SSIMULACRA2: { target_range: [74, 76] } },
            maximum_probes: 4,
        },
    },
};

describe("target quality analytics", () => {
    const scenes = [
        scene(0, {
            passes: [pass(1, 30, 70, 2), pass(2, 26, 75, 3)],
        }),
        scene(1, {
            passes: [pass(1, 34, 68, 1)],
        }),
    ];
    const analytics = sequenceAnalytics("target-quality", source(scenes, SSIMULACRA2));

    it("orders the charts from the chosen quality through the probe's cost", () => {
        expect(analytics.metrics.map((entry) => entry.id)).toEqual([
            "score",
            "quantizer",
            "preset",
            "bitrate",
            "efficiency",
            "speed",
        ]);
    });

    it("carries a scene's last probe into a pass it never reached", () => {
        const chart = view(metric(analytics, "quantizer"), "scenes").chart;
        expect(chart).not.toBeNull();
        expect(chart?.series.map((series) => series.label)).toEqual(["P1", "P2"]);
        expect(chart?.series[0]?.values).toEqual([30, 34]);
        // Target Quality stops probing a scene once it converges, so a sparsely populated
        // later pass is filled with the last value that scene actually measured.
        expect(chart?.series[1]?.values).toEqual([26, 34]);
        // Convergence is a statistic over probes, so it must not count a carried value as a
        // probe that ran.
        expect(view(metric(analytics, "score"), "convergence").chart?.series[0]?.values).toEqual([
            69, 75,
        ]);
    });

    it("summarises every probe and names the target range", () => {
        const score = metric(analytics, "score");
        expect(score.label).toBe("SSIMULACRA2 score");
        expect(view(score, "scenes").stats).toContainEqual({
            label: "In target",
            value: "1 probe",
        });
        const references = view(score, "scenes").chart?.references ?? [];
        expect(references.map((reference) => reference.value)).toEqual([74, 76]);
    });

    it("converges the mean and median from the first pass to the last", () => {
        const convergence = view(metric(analytics, "score"), "convergence");
        expect(convergence.chart?.x.kind).toBe("category");
        expect(convergence.chart?.series.map((series) => series.label)).toEqual(["Mean", "Median"]);
        expect(convergence.chart?.series[0]?.values).toEqual([69, 75]);
        expect(convergence.stats.map((stat) => stat.label)).toContain("First pass");
        expect(convergence.stats.find((stat) => stat.label === "Probes")?.value).toBe("3");
    });

    it("computes efficiency from the pass score and its bits per pixel", () => {
        const efficiency = metric(analytics, "efficiency");
        const chart = view(efficiency, "scenes").chart;
        // 2 Mbps at 1920×1080×24 is 0.0402 bpp, so 70 / 0.0402 ≈ 1,741.
        expect(chart?.y.title).toBe("Efficiency");
        expect(Math.round(chart?.series[0]?.values[0] ?? 0)).toBe(1742);
    });

    it("uses Butteraugli's reciprocal, because a lower score is the better picture", () => {
        // Butteraugli bottoms out at zero, so the reciprocal keeps "higher is better" for
        // efficiency while a zero score still needs finite arithmetic behind the epsilon.
        const butteraugli = {
            sequences: {
                target_quality: {
                    metric: { BUTTERAUGLI: { target_range: [0.8, 1.2] } },
                    maximum_probes: 4,
                },
            },
        };
        const scenes = [scene(0, { passes: [pass(1, 30, 1, 2)] })];
        const analytics = sequenceAnalytics("target-quality", source(scenes, butteraugli));
        const chart = view(metric(analytics, "efficiency"), "scenes").chart;
        const bpp = (2 * 1_000_000) / (1920 * 1080 * 24);
        expect(chart?.series[0]?.values[0]).toBeCloseTo(1 / bpp, 3);

        // A perfect score of zero must not divide by zero: the epsilon keeps it finite and
        // still the most efficient value a pass can reach.
        const perfect = sequenceAnalytics(
            "target-quality",
            source([scene(0, { passes: [pass(1, 30, 0, 2)] })], butteraugli),
        );
        const value = view(metric(perfect, "efficiency"), "scenes").chart?.series[0]?.values[0];
        expect(value).not.toBeNull();
        expect(Number.isFinite(value ?? Number.NaN)).toBe(true);
    });

    it("offers a frontier of score against size and counts probed scenes", () => {
        const frontier = view(metric(analytics, "score"), "frontier");
        expect(frontier.chart?.shape).toBe("scatter");
        expect(frontier.chart?.series[0]?.points).toHaveLength(2);
        expect(analytics.scenes).toBe(2);
        expect(metric(analytics, "score").measured).toBe(2);
    });
});

describe("noise analytics", () => {
    it("shows the measurement before the scale it produced", () => {
        const analytics = sequenceAnalytics(
            "noise-generation",
            source([scene(0, { noise: 0.002 }), scene(1, { noise_scaler: 1.25 })], {}, null),
        );

        expect(analytics.metrics.map((entry) => entry.id)).toEqual(["noise", "scaler"]);
    });

    it("keeps four decimals and draws the scaler threshold", () => {
        const document = { sequences: { noise_scaler: { threshold: 0.002 } } };
        const scenes = [scene(0, { noise: 0.0019 }), scene(1, { noise: 0.0025 })];
        const analytics = sequenceAnalytics("noise-generation", source(scenes, document, null));
        const noise = metric(analytics, "noise");
        const stats = view(noise, "scenes").stats;

        expect(stats.find((stat) => stat.label === "Mean")?.value).toBe("0.0022");
        expect(stats.find((stat) => stat.label === "Above threshold")?.value).toBe("1 scene");
        expect(view(noise, "scenes").chart?.references[0]).toMatchObject({
            value: 0.002,
            tone: "warning",
        });
    });

    it("does not turn a scene without a measurement into zero", () => {
        const analytics = sequenceAnalytics(
            "noise-generation",
            source([scene(0), scene(1, { noise: 0.003 })], {}, null),
        );
        const chart = view(metric(analytics, "noise"), "scenes").chart;
        expect(chart?.series[0]?.values).toEqual([null, 0.003]);
        // Coverage belongs to the measure, not the section: the detector measured one scene
        // and the scaler has measured none, even though both live on this page.
        expect(analytics.scenes).toBe(2);
        expect(metric(analytics, "noise").measured).toBe(1);
        expect(metric(analytics, "scaler").measured).toBe(0);
    });
});

describe("scene detection analytics", () => {
    it("charts length in seconds when the rate is known", () => {
        const scenes = [
            scene(0, { frame_count: 24 }),
            scene(1, { frame_count: 48 }),
            scene(2, { frame_count: 96 }),
        ];
        const analytics = sequenceAnalytics("scene-detection", source(scenes));
        const length = metric(analytics, "length");
        const chart = view(length, "distribution").chart;

        expect(view(length, "scenes").chart?.series[0]?.values).toEqual([1, 2, 4]);
        expect(chart?.series[0]?.values.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(
            3,
        );
        expect(view(length, "scenes").stats.find((stat) => stat.label === "Mean")?.value).toBe(
            "2.33 s",
        );
    });

    it("falls back to frames when the source has not been probed", () => {
        const analytics = sequenceAnalytics(
            "scene-detection",
            source([scene(0, { frame_count: 48 })], {}, null),
        );
        const length = metric(analytics, "length");
        expect(length.label).toBe("Scene length in frames");
        expect(view(length, "scenes").chart?.series[0]?.values).toEqual([48]);
    });

    it("draws the detector's configured minimum and maximum", () => {
        const analytics = sequenceAnalytics(
            "scene-detection",
            source([scene(0, { frame_count: 48 })], {
                sequences: {
                    scene_detector: {
                        method: {
                            AVSceneChange: {
                                minimum_length: 24,
                                maximum_length: 240,
                            },
                        },
                    },
                },
            }),
        );
        const references = view(metric(analytics, "length"), "scenes").chart?.references;
        expect(references?.map((reference) => reference.value)).toEqual([1, 10]);
        expect(references?.map((reference) => reference.label)).toEqual([
            "min 1.00 s",
            "max 10.0 s",
        ]);
    });
});

describe("encoding analytics", () => {
    const analytics = sequenceAnalytics(
        "encoding",
        source([
            scene(0, {
                frame_count: 24,
                encoded: true,
                chunk_bytes: 1_500_000,
                encode_ms: 2_000,
                quantizer: 30,
            }),
            scene(1, {
                frame_count: 48,
                encoded: true,
                chunk_bytes: 500_000,
                encode_ms: 1_000,
            }),
        ]),
    );

    it("orders the charts from the quantizer through the encode's clock", () => {
        expect(analytics.metrics.map((entry) => entry.id)).toEqual([
            "quantizer",
            "bitrate",
            "chunk",
            "speed",
            "duration",
        ]);
    });

    it("derives bitrate, duration and encode speed from the chunk", () => {
        const bitrate = view(metric(analytics, "bitrate"), "scenes").chart;
        // Chart values stay in the engine's unit: bits per second.
        expect(bitrate?.series[0]?.values[0]).toBeCloseTo(12_000_000, 5);

        const speed = view(metric(analytics, "speed"), "scenes").chart;
        expect(speed?.series[0]?.values[0]).toBeCloseTo(12, 5);

        const duration = view(metric(analytics, "duration"), "scenes").chart;
        expect(duration?.series[0]?.values).toEqual([2, 1]);
    });

    it("names the encode rate FPS and charts the scene's quantizer", () => {
        expect(metric(analytics, "speed").label).toBe("Encode FPS");
        const quantizer = view(metric(analytics, "quantizer"), "scenes").chart;
        // A scene Target Quality never probed has no quantizer, and is not drawn at zero.
        expect(quantizer?.series[0]?.values).toEqual([30, null]);
    });

    it("accumulates retained bytes in the cumulative view", () => {
        const cumulative = view(metric(analytics, "chunk"), "cumulative").chart;
        expect(cumulative?.series[0]?.values).toEqual([1_500_000, 2_000_000]);
        expect(analytics.scenes).toBe(2);
        expect(metric(analytics, "chunk").measured).toBe(2);
    });
});

describe("concatenation analytics", () => {
    it("offers the per-scene, cumulative and distribution views in that order", () => {
        const analytics = sequenceAnalytics(
            "concatenation",
            source([
                scene(0, { encoded: true, chunk_bytes: 1_000 }),
                scene(1, { encoded: true, chunk_bytes: 2_000 }),
            ]),
        );

        expect(metric(analytics, "chunk").views.map((entry) => entry.id)).toEqual([
            "scenes",
            "cumulative",
            "distribution",
        ]);
    });
});

describe("section catalogue", () => {
    it("covers every configuration section a video has", () => {
        for (const section of VIDEO_OVERRIDE_SECTIONS) {
            const analytics = sequenceAnalytics(section.id, source([scene(0)]));
            expect(analytics.metrics.length, section.id).toBeGreaterThan(0);
            expect(analytics.note, section.id).not.toContain("no measured data");
        }
    });
});

describe("sequences folded into the section that owns their data", () => {
    it("reports the benchmarked worker count with the chunks it encodes", () => {
        const document = {
            sequences: {
                parallel_encoder: { workers: 6 },
                benchmarker: { threshold: 5, max_memory: 4096 },
            },
        };
        const analytics = sequenceAnalytics("encoding", source([scene(0)], document));

        expect(analytics.note).toContain("6 workers");
    });

    it("shows the speed preset next to the probes it scaled", () => {
        const analytics = sequenceAnalytics(
            "target-quality",
            source(
                [scene(0, { speed: 4 }), scene(1, { speed: 4 }), scene(2, { speed: 6 })],
                SSIMULACRA2,
            ),
        );
        const preset = metric(analytics, "preset");

        expect(view(preset, "distribution").chart?.x.kind).toBe("category");
        expect(view(preset, "scenes").stats).toContainEqual({
            label: "Most common",
            value: "4 (2 scenes)",
        });
    });

    it("projects the optimizer's line onto the final probe bitrates", () => {
        const document = {
            sequences: {
                target_quality: {
                    maximum_probes: 4,
                    metric: { SSIMULACRA2: { target_range: [74, 76] } },
                },
                bitrate_optimizer: { bitrate_sigma_threshold: 0.5 },
            },
        };
        const scenes = [
            scene(0, { passes: [pass(1, 30, 75, 2), pass(2, 28, 76, 2)] }),
            scene(1, { passes: [pass(1, 30, 75, 8), pass(2, 28, 76, 8)] }),
        ];
        const bitrate = metric(
            sequenceAnalytics("target-quality", source(scenes, document)),
            "bitrate",
        );
        const stats = view(bitrate, "scenes").stats;

        // Mean 5 and a sigma of 3 put the line at 6.5 Mbps, so only the 8 Mbps scene is
        // over it. Chart values stay in the engine's unit.
        expect(stats).toContainEqual({ label: "Over line", value: "1 scene" });
        expect(view(bitrate, "scenes").chart?.references.map((line) => line.value)).toEqual([
            6_500_000,
        ]);
    });

    it("explains an unknown section rather than charting it", () => {
        const analytics = sequenceAnalytics("not-a-sequence", source([scene(0)]));
        expect(analytics.metrics).toEqual([]);
        expect(analytics.note).toContain("no measured data");
    });
});

describe("quality check analytics", () => {
    it("plots the score against the size the finished scene cost", () => {
        const document = {
            sequences: {
                target_quality: { metric: { VMAF: { target_range: [94, 96] } } },
                quality_check: { metric: { VMAF: { target_range: [0, 1] } } },
            },
        };
        const analytics = sequenceAnalytics(
            "quality-check",
            source(
                [
                    scene(0, {
                        frame_count: 24,
                        encoded: true,
                        chunk_bytes: 900_000,
                        quality_score: 95,
                    }),
                ],
                document,
            ),
        );
        const score = metric(analytics, "score");
        expect(score.label).toBe("VMAF score");
        expect(view(score, "scenes").chart?.references.map((reference) => reference.value)).toEqual(
            [94, 96],
        );
        const frontier = view(score, "frontier").chart;
        expect(frontier?.series[0]?.points).toHaveLength(1);
        expect(frontier?.series[0]?.points?.[0]?.y).toBe(95);
        expect(view(score, "scenes").stats).toContainEqual({
            label: "Below target",
            value: "0 scenes",
        });
    });

    it("does not borrow Target Quality's range for a different metric", () => {
        const document = {
            sequences: {
                target_quality: { metric: { SSIMULACRA2: { target_range: [74, 76] } } },
                quality_check: { metric: { VMAF: { target_range: [94, 96] } } },
            },
        };
        const analytics = sequenceAnalytics(
            "quality-check",
            source([scene(0, { encoded: true, quality_score: 95 })], document),
        );
        const score = metric(analytics, "score");
        const scenes = view(score, "scenes");

        expect(score.label).toBe("VMAF score");
        expect(scenes.chart?.references).toEqual([]);
        expect(scenes.stats.some((stat) => stat.label === "Below target")).toBe(false);
        expect(score.help).not.toContain("reference lines");
    });
});
