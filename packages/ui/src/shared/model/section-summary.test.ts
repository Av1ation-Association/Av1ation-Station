import { expect, it } from "vitest";

import { sectionConfigured, sectionSummary } from "./section-summary";

it("reads optional sequences from the nested sequences document", () => {
    const document = {
        sequences: {
            scene_detector: { method: { AVSceneChange: {} } },
            noise_detector: {
                reference_filters: [{ WNNM: {} }],
                denoised_filters: [{ WNNM: {} }],
            },
            noise_scaler: {
                threshold: 0.25,
                minimum_scaler: 0.1,
                maximum_scaler: 1.25,
                scale_chroma: false,
            },
            target_quality: {
                metric: { SSIMULACRA2: { target_range: [74, 76] } },
            },
            speed_scaler: {
                speed_quantizers: [
                    [8, 20],
                    [6, 35],
                    [4, 50],
                ],
            },
            bitrate_optimizer: { bitrate_sigma_threshold: 2 },
            quality_check: { metric: { SSIMULACRA2: {} }, strategy: "Whole", statistic: "Mean" },
            scene_concatenator: { method: { Mkvmerge: { tracks: null } } },
        },
    };

    // The engine's own detector default is 24–240 frames; a card that cannot see the
    // sequence used to print "— · scene detector".
    expect(sectionSummary("scene-detection", document)[0]).toBe(
        "AVSceneChange · 24–240 frames per scene",
    );
    expect(sectionSummary("noise-generation", document)).toEqual([
        "Noise detector · on · WNNM → WNNM",
        "Noise scaler · on · 0.1–1.25, threshold 0.25",
    ]);
    expect(sectionSummary("target-quality", document)).toEqual([
        "Target quality · SSIMULACRA2 74–76",
        "Speed scaling · 3 points",
        "Bitrate optimization · σ 2",
    ]);
    expect(sectionSummary("concatenation", document)[0]).toBe("mkvmerge");
    expect(sectionSummary("quality-check", document)[0]).toBe("SSIMULACRA2 · Whole video");
    expect(sectionConfigured("noise-generation", document)).toBe(true);
    expect(sectionConfigured("quality-check", document)).toBe(true);
});

it("reports optional stages as off when their document is absent", () => {
    const document = { sequences: { scene_detector: { method: "None" } } };

    expect(sectionSummary("noise-generation", document)).toEqual([
        "Noise detector · off",
        "Noise scaler · off",
    ]);
    expect(sectionSummary("target-quality", document)).toEqual([
        "Target quality · off",
        "Speed scaling · off",
        "Bitrate optimization · off",
    ]);
    expect(sectionSummary("quality-check", document)[0]).toBe("Off");
    expect(sectionConfigured("noise-generation", document)).toBe(false);
});
