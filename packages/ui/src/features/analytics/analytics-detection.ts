import { chartSeconds } from "../../shared/duration";
import { getIn } from "../../shared/schema/config-schema";

import type { AnalyticsMetric, AnalyticsSource, SequenceAnalytics } from "./analytics-types";
import { finite, fixed, integer, plural, variantBody } from "./analytics-format";
import { sceneMetric } from "./analytics-scene-metric";
import { numericCell, tableFor } from "./analytics-tables";
import { threshold } from "./analytics-target";

/** The noise detector's own measurement, shared by the two sections that chart it. */
export function noiseMetric(source: AnalyticsSource): AnalyticsMetric {
    const limit = threshold(source, ["sequences", "noise_scaler", "threshold"]);
    const format = (value: number) => fixed(value, 4);
    return sceneMetric(
        {
            id: "noise",
            label: "Measured noise",
            help: "The detector's noise estimate for each scene. Values keep four decimals because a scene's noise is routinely a few thousandths, where two decimals would read as zero.",
            format,
            value: (scene) => finite(scene.noise),
            references:
                limit === null
                    ? undefined
                    : () => [
                          {
                              value: limit,
                              label: `threshold ${format(limit)}`,
                              tone: "warning",
                          },
                      ],
            extra: (values) => {
                if (limit === null || values.length === 0) {
                    return [];
                }
                return [
                    {
                        label: "Above threshold",
                        value: plural(values.filter((value) => value > limit).length, "scene"),
                    },
                ];
            },
            empty: "Noise charts here as Noise Detector writes checkpoints.",
        },
        source,
    );
}

export function sceneDetection(source: AnalyticsSource): SequenceAnalytics {
    const frameRate = source.frameRate !== null && source.frameRate > 0 ? source.frameRate : null;
    const seconds = frameRate !== null;
    const format = seconds ? chartSeconds : (value: number) => `${integer(value)} f`;
    // The detector enforces its own minimum and maximum scene length, so the chart shows
    // them: a spike at either edge says the bounds shaped the split, not the picture.
    const method = variantBody(getIn(source.document, ["sequences", "scene_detector", "method"]));
    const bounds = (
        [
            ["minimum_length", "min"],
            ["maximum_length", "max"],
        ] as const
    ).flatMap(([key, label]) => {
        const frames = finite(typeof method[key] === "number" ? (method[key] as number) : null);
        if (frames === null || frames <= 0) {
            return [];
        }
        const value = seconds ? frames / frameRate : frames;
        return [{ value, label: `${label} ${format(value)}`, tone: "info" as const }];
    });
    const metric = sceneMetric(
        {
            id: "length",
            label: seconds ? "Scene length" : "Scene length in frames",
            help: seconds
                ? "How long each detected scene runs. The distribution shows how evenly the detector split the source; the reference lines are its configured minimum and maximum."
                : "How many frames each detected scene runs. Probe the video to read this in seconds; the reference lines are the detector's configured minimum and maximum.",
            format,
            references: bounds.length === 0 ? undefined : () => bounds,
            value: (scene) => {
                if (scene.frame_count <= 0) {
                    return null;
                }
                return seconds ? scene.frame_count / (frameRate ?? 1) : scene.frame_count;
            },
            extra: (values) => [
                { label: "Scenes", value: integer(values.length) },
                {
                    label: "Source span",
                    value: seconds
                        ? chartSeconds(values.reduce((sum, value) => sum + value, 0))
                        : `${integer(values.reduce((sum, value) => sum + value, 0))} f`,
                },
            ],
            empty: "Scene lengths chart here as detection writes boundaries.",
        },
        source,
    );
    return {
        metrics: [metric],
        table: tableFor(
            source,
            [
                {
                    id: "length",
                    label: "Length",
                    numeric: true,
                    cell: (scene) =>
                        numericCell(
                            scene.frame_count <= 0
                                ? null
                                : seconds
                                  ? scene.frame_count / (frameRate ?? 1)
                                  : scene.frame_count,
                            format,
                        ),
                },
            ],
            "A dash means the detector has not written that scene's boundaries.",
        ),
        note: "Scene Detector measures only where scenes begin and end. Every other sequence on this page reads those boundaries.",
        empty: "Scene Detector has not written any scenes yet.",
        scenes: source.scenes.length,
    };
}

export function noiseDetection(source: AnalyticsSource): SequenceAnalytics {
    const limit = threshold(source, ["sequences", "noise_scaler", "threshold"]);
    const scaler = sceneMetric(
        {
            id: "scaler",
            label: "Scale factor",
            help: "The multiplier Noise Scaler applied to each scene. A scene at 1.000× is left alone; the distribution shows how much of the source needed scaling.",
            format: (value) => `${fixed(value, 3)}×`,
            value: (scene) => finite(scene.noise_scaler),
            extra: (values) => [
                {
                    label: "Scaled",
                    value: `${integer(values.filter((value) => Math.abs(value - 1) > 1e-6).length)} scenes`,
                },
            ],
            empty: "Scale factors chart here as Noise Scaler writes checkpoints.",
        },
        source,
    );
    return {
        metrics: [noiseMetric(source), scaler],
        table: tableFor(
            source,
            [
                {
                    id: "noise",
                    label: "Noise",
                    numeric: true,
                    cell: (scene) => numericCell(finite(scene.noise), (value) => fixed(value, 4)),
                },
                {
                    id: "scaler",
                    label: "Scale",
                    numeric: true,
                    cell: (scene) =>
                        numericCell(finite(scene.noise_scaler), (value) => `${fixed(value, 3)}×`),
                },
                {
                    id: "state",
                    label: "Scaled",
                    numeric: false,
                    cell: (scene) => {
                        const noise = finite(scene.noise);
                        const factor = finite(scene.noise_scaler);
                        if (noise === null || factor === null || limit === null) {
                            return null;
                        }
                        return {
                            text: Math.abs(factor - 1) > 1e-6 ? "Yes" : "No",
                            sort: null,
                        };
                    },
                },
            ],
            "A dash means Noise Scaler has not reached that scene; the noise column is the input it used.",
        ),
        note: "Noise Detector writes one estimate per scene; Noise Scaler compares it with the threshold and above it raises the encoder's speed preset instead of spending bits on grain. The two are shown together because a scale factor means nothing without the measurement behind it.",
        empty: "Noise Detector has not measured any scenes yet.",
        scenes: source.scenes.length,
    };
}
